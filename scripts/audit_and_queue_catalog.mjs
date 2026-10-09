import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { StihlModelIdentityParser } from '../src/parts/StihlModelIdentityParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function classifyCatalogEntry(item) {
  const title = (item.model_title_clean || item.model_name || '').trim();
  const url = item.source_url || '';

  // 1. Rejection: Explicit Part numbers in title or URL
  const isPartUrl = /\/Stihl-\d{11}-/i.test(url) || /\/Stihl-\d{7,10}-/i.test(url);
  if (isPartUrl) {
    return { isAccepted: false, rejectionReason: 'PART_NUMBER_IN_SOURCE_URL' };
  }

  const startsWithNumberPattern = /^\d{4}[\s-]?\d{3}[\s-]?\d{4}/.test(title) || /^\d{11}\b/.test(title) || /^\d{7,10}\b/.test(title);
  if (startsWithNumberPattern) {
    return { isAccepted: false, rejectionReason: 'STARTS_WITH_PART_NUMBER' };
  }

  // 2. Rejection: Non-machine Accessories & Individual Components
  const nonMachinePatterns = [
    { pattern: /\bAccessory\b/i, reason: 'ACCESSORY_KEYWORD' },
    { pattern: /\bAccessories\b/i, reason: 'ACCESSORIES_KEYWORD' },
    { pattern: /\bDocking Station\b/i, reason: 'DOCKING_STATION' },
    { pattern: /\bDiagnostic Unit\b/i, reason: 'DIAGNOSTIC_UNIT' },
    { pattern: /\bChest Strap\b/i, reason: 'CHEST_STRAP' },
    { pattern: /\bChain Scabbard\b/i, reason: 'CHAIN_SCABBARD' },
    { pattern: /\bGuide Bar\b/i, reason: 'GUIDE_BAR' },
    { pattern: /\bRollomatic\b/i, reason: 'GUIDE_BAR_ROLLOMATIC' },
    { pattern: /\bDuromatic\b/i, reason: 'GUIDE_BAR_DUROMATIC' },
    { pattern: /\bSaw Chain\b/i, reason: 'SAW_CHAIN' },
    { pattern: /\bService Kit\b/i, reason: 'SERVICE_KIT' },
    { pattern: /\bTiller Accessory\b/i, reason: 'TILLER_ACCESSORY' },
    { pattern: /\bMower Accessory\b/i, reason: 'MOWER_ACCESSORY' },
    { pattern: /\bRide-On Mower Accessory\b/i, reason: 'RIDE_ON_MOWER_ACCESSORY' },
    { pattern: /\bLaser 2-in-1\b/i, reason: 'LASER_ACCESSORY' },
    { pattern: /\bSmart Connector\b/i, reason: 'SMART_CONNECTOR_ACCESSORY' }
  ];

  for (const { pattern, reason } of nonMachinePatterns) {
    if (pattern.test(title)) {
      return { isAccepted: false, rejectionReason: reason };
    }
  }

  // 3. Normalization via StihlModelIdentityParser
  const parsed = StihlModelIdentityParser.parseModelIdentity(title);

  return {
    isAccepted: true,
    entityType: parsed.entity_type,
    normalized: parsed
  };
}

export function auditAndQueueCatalog(options = {}) {
  const indexFile = options.indexFile || path.join(rootDir, 'data', 'sparepartsworld_stihl_model_index.json');
  const auditFile = options.auditFile || path.join(rootDir, 'data', 'parts_catalog_index_audit.json');
  const queueFile = options.queueFile || path.join(rootDir, 'data', 'parts_harvest_queue.json');
  const identityAuditFile = options.identityAuditFile || path.join(rootDir, 'data', 'phase52b_model_identity_audit.json');

  console.log('🔍 Auditing Spare Parts World STIHL Model Index & Building Harvest Queue (Phase 52B-R1)...');

  if (!fs.existsSync(indexFile)) {
    throw new Error(`Index file not found: ${indexFile}`);
  }

  const raw = fs.readFileSync(indexFile, 'utf8');
  const indexDoc = JSON.parse(raw);
  const catalogList = Array.isArray(indexDoc.catalog) ? indexDoc.catalog : [];

  const auditStats = {
    total_index_entries: catalogList.length,
    accepted_entities_count: 0,
    accepted_machines_count: 0,
    accepted_attachments_count: 0,
    rejected_non_machines_count: 0,
    entity_types: {
      BASE_MODEL: 0,
      MODEL_VARIANT: 0,
      MACHINE_CONFIGURATION: 0,
      ATTACHMENT: 0
    },
    rejections_by_reason: {},
    categories_breakdown: {}
  };

  const rejectedItems = [];
  const acceptedQueue = [];
  const seenPids = new Set();
  const seenUrls = new Set();
  const normalizedTitleTransformations = [];
  const identityDuplicatesMap = new Map();
  const uniqueBaseModelsSet = new Set();
  const uniqueVariantsSet = new Set();

  for (const item of catalogList) {
    const classification = classifyCatalogEntry(item);

    if (!classification.isAccepted) {
      auditStats.rejected_non_machines_count++;
      const rReason = classification.rejectionReason;
      auditStats.rejections_by_reason[rReason] = (auditStats.rejections_by_reason[rReason] || 0) + 1;
      rejectedItems.push({
        source_product_id: item.source_product_id,
        model_name: item.model_name,
        model_title_clean: item.model_title_clean,
        source_url: item.source_url,
        rejection_reason: rReason
      });
      continue;
    }

    const pid = item.source_product_id;
    const url = item.source_url;

    if (seenPids.has(pid) || seenUrls.has(url)) {
      continue;
    }
    seenPids.add(pid);
    seenUrls.add(url);

    auditStats.accepted_entities_count++;
    const eType = classification.entityType;
    auditStats.entity_types[eType] = (auditStats.entity_types[eType] || 0) + 1;

    if (eType === 'ATTACHMENT') {
      auditStats.accepted_attachments_count++;
    } else {
      auditStats.accepted_machines_count++;
    }

    const cat = item.category || 'Chainsaw';
    auditStats.categories_breakdown[cat] = (auditStats.categories_breakdown[cat] || 0) + 1;

    const norm = classification.normalized;
    uniqueBaseModelsSet.add(norm.canonical_model_id);
    uniqueVariantsSet.add(`${norm.canonical_model_id}::${norm.variant_key}`);

    const queueId = `queue_${norm.canonical_model_id}_${norm.variant_key}_${pid}`;

    const queueEntry = {
      queue_id: queueId,
      source_product_id: pid,
      model_name: item.model_name,
      model_title_clean: item.model_title_clean,
      canonical_model: norm.canonical_model,
      canonical_model_id: norm.canonical_model_id,
      base_model_name: norm.base_model_name,
      variant_key: norm.variant_key,
      variant_name: norm.variant_name,
      configuration_key: norm.configuration_key,
      configuration_name: norm.configuration_name,
      entity_type: eType,
      category: cat,
      source_url: url,
      discovery_method: item.discovery_method,
      discovery_source_url: item.discovery_source_url,
      status: 'PENDING'
    };

    acceptedQueue.push(queueEntry);

    // Track identity duplicates
    const identityKey = `${norm.canonical_model_id}::${norm.variant_key}`;
    if (!identityDuplicatesMap.has(identityKey)) {
      identityDuplicatesMap.set(identityKey, []);
    }
    identityDuplicatesMap.get(identityKey).push({
      pid,
      raw_title: item.model_title_clean || item.model_name,
      configuration_name: norm.configuration_name,
      source_url: url
    });

    // Track transformations
    const rawClean = item.model_title_clean || item.model_name;
    if (rawClean !== norm.variant_name && rawClean !== norm.base_model_name) {
      normalizedTitleTransformations.push({
        raw_title: rawClean,
        canonical_model: norm.canonical_model,
        canonical_model_id: norm.canonical_model_id,
        variant_key: norm.variant_key,
        variant_name: norm.variant_name,
        configuration_name: norm.configuration_name,
        entity_type: eType
      });
    }
  }

  // Sort queue deterministically
  acceptedQueue.sort((a, b) => a.queue_id.localeCompare(b.queue_id));

  // Build duplicate reconciliation list
  const duplicateReconciliation = [];
  for (const [idKey, entries] of identityDuplicatesMap.entries()) {
    if (entries.length > 1) {
      const hasDifferentConfigs = new Set(entries.map(e => e.configuration_name)).size > 1;
      duplicateReconciliation.push({
        identity_key: idKey,
        count: entries.length,
        classification: hasDifferentConfigs ? 'SAME_VARIANT_DIFFERENT_CONFIGURATION' : 'DUPLICATE_SOURCE_PAGE',
        entries
      });
    }
  }

  const auditDoc = {
    schema_version: 'parts-catalog-index-audit-v1',
    audited_at: new Date().toISOString(),
    stats: auditStats,
    rejected_items_count: rejectedItems.length,
    rejected_items: rejectedItems
  };

  const queueDoc = {
    schema_version: 'parts-harvest-queue-v1',
    created_at: new Date().toISOString(),
    total_queue_items: acceptedQueue.length,
    queue: acceptedQueue
  };

  const identityAuditDoc = {
    schema_version: 'phase52b-model-identity-audit-v1',
    audited_at: new Date().toISOString(),
    summary: {
      total_accepted_entities: acceptedQueue.length,
      accepted_machines_count: auditStats.accepted_machines_count,
      accepted_attachments_count: auditStats.accepted_attachments_count,
      true_base_models_count: uniqueBaseModelsSet.size,
      unique_variants_count: uniqueVariantsSet.size,
      duplicate_identity_groups: duplicateReconciliation.length,
      entity_types: auditStats.entity_types
    },
    duplicate_identity_reconciliations: duplicateReconciliation,
    top_100_normalized_transformations: normalizedTitleTransformations.slice(0, 100)
  };

  fs.writeFileSync(auditFile, JSON.stringify(auditDoc, null, 2), 'utf8');
  fs.writeFileSync(queueFile, JSON.stringify(queueDoc, null, 2), 'utf8');
  fs.writeFileSync(identityAuditFile, JSON.stringify(identityAuditDoc, null, 2), 'utf8');

  console.log(`✅ Model Identity & Catalog Audit Complete:`);
  console.log(`   Total Index Entries:   ${auditStats.total_index_entries}`);
  console.log(`   Accepted Entities:     ${auditStats.accepted_entities_count}`);
  console.log(`     - Pure Machines:     ${auditStats.accepted_machines_count}`);
  console.log(`     - Attachments:       ${auditStats.accepted_attachments_count}`);
  console.log(`     - BASE_MODEL:        ${auditStats.entity_types.BASE_MODEL}`);
  console.log(`     - MODEL_VARIANT:     ${auditStats.entity_types.MODEL_VARIANT}`);
  console.log(`     - MACHINE_CONFIG:    ${auditStats.entity_types.MACHINE_CONFIGURATION}`);
  console.log(`     - ATTACHMENT:        ${auditStats.entity_types.ATTACHMENT}`);
  console.log(`   Unique Base Models:    ${uniqueBaseModelsSet.size}`);
  console.log(`   Unique Model Variants: ${uniqueVariantsSet.size}`);
  console.log(`   Rejected Non-Machines: ${auditStats.rejected_non_machines_count}`);
  console.log(`   Queue Written:         ${acceptedQueue.length} items to ${queueFile}`);

  return { auditDoc, queueDoc, identityAuditDoc };
}

if (process.argv[1] && process.argv[1].endsWith('audit_and_queue_catalog.mjs')) {
  auditAndQueueCatalog();
}
