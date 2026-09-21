/**
 * Phase 45A: BR Tier 2 Identity Review & Batch Prioritization
 * Master analysis script — reads all source data, performs full reconciliation,
 * and generates all required Phase45A artifacts.
 */
import { readFileSync, writeFileSync } from 'fs';

const db = JSON.parse(readFileSync('data/stihl_database.json', 'utf8'));
const prioritized = JSON.parse(readFileSync('data/phase44a_br_new_candidates_prioritized.json', 'utf8'));

// ─── STEP 1: Extract exact Tier2 set ───
const tier2 = prioritized.filter(r => r.priority_tier === 'TIER_2_MEDIUM');
console.log(`TIER2 product records: ${tier2.length}`);
if (tier2.length !== 72) {
  console.error('HARD STOP: Tier2 count mismatch');
  process.exit(1);
}

// ─── STEP 2: Current 83 canonical models ───
const canonical83 = db.models.map(m => ({
  model_name: m.model_name,
  id: m.id,
  slug: m.slug,
  category_slug: m.category_slug,
  aliases: m.aliases || [],
  category: m.basic_classification?.product_category || m.category || 'unknown'
}));
console.log(`Canonical models: ${canonical83.length}`);

// Normalize function for comparison
function normalize(name) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function makeSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── STEP 3: Parse model identity from each Tier2 record ───
function extractModelIdentity(record) {
  const name = record.name || '';
  const ref = record.reference || '';
  const linkText = record.linkText || '';
  const modelInfo = record.modelInfo;

  // Determine if this is a kit/bundle
  const isKit = /com\s+(carregador|bateria|Carregador)/i.test(name) ||
                /\+\s*\d+\s*bateria/i.test(name) ||
                /com\s+carregador\s*\+/i.test(name) ||
                /com\s+bateria\s+e\s+carregador/i.test(name);

  // Clean kit descriptor from name to isolate machine model
  let cleanName = name.replace(/\s+com\s+Carregador.*$/i, '')
                      .replace(/\s+com\s+carregador.*$/i, '')
                      .replace(/\s+com\s+bateria.*$/i, '')
                      .replace(/\s+com\s+Bateria.*$/i, '')
                      .trim();

  // Pattern matches STIHL model code: prefix + number + optional decimal + optional suffix
  const m = cleanName.match(/\b([A-Z]{2,4}\s+\d+(?:\.[0-9]+)?(?:\s+(?:[A-Z0-9-]+|Plus|PLUS))?)\b/);

  let parsedModel = m ? m[1].trim() : 'UNKNOWN';

  // Standardize PLUS -> Plus
  if (parsedModel.endsWith(' PLUS')) {
    parsedModel = parsedModel.replace(/ PLUS$/, ' Plus');
  }

  // Derive suffix
  const prefixMatch = parsedModel.match(/^[A-Z]{2,4}\s+\d+(?:\.[0-9]+)?/);
  const prefix = prefixMatch ? prefixMatch[0] : parsedModel;
  let suffix = parsedModel.substring(prefix.length).trim();

  let confidence = modelInfo ? 'HIGH' : 'MEDIUM';
  if (parsedModel === 'UNKNOWN') {
    confidence = 'BLOCKED';
  }

  return { parsedModel, suffix, isKit, confidence };
}

// ─── STEP 4: Build enriched records ───
const enriched = tier2.map(r => {
  const parsed = extractModelIdentity(r);
  return {
    record_id: r.id,
    raw_name: r.name,
    reference: r.reference,
    linkText: r.linkText,
    phase44a_type: r.type,
    modelInfo: r.modelInfo,
    parsed_model: parsed.parsedModel,
    suffix: parsed.suffix,
    is_kit: parsed.isKit,
    identity_confidence: parsed.confidence
  };
});

// ─── STEP 5: Determine correct machine type ───
function classifyMachineType(record) {
  const name = record.raw_name.toLowerCase();
  const model = record.parsed_model.toUpperCase();

  if (/motosserra|chainsaw/i.test(name)) return 'chainsaw';
  if (/roçadeira|brushcutter|trimmer/i.test(name)) return 'brushcutter';
  if (/soprador|blower/i.test(name) && !/aspirador/i.test(name)) return 'blower';
  if (/aspirador.*triturador|triturador.*aspirador/i.test(name)) return 'vacuum_shredder';
  if (/aspirador|vacuum/i.test(name)) return 'vacuum';
  if (/podador\s+de\s+a(ltura|rbustos)|hedge/i.test(name) && /HLA|HSA|HSE/i.test(model)) return 'hedge_trimmer';
  if (/motopoda|pruning\s*saw|pole\s*pruner/i.test(name) || /^(HTA|HT|GTA)\s/i.test(model)) return 'pruning_saw';
  if (/cortador\s+de\s+grama|lawnmower|mower/i.test(name) || /^RM\b|^RMA\b/i.test(model)) return 'lawnmower';
  if (/cortador\s+de\s+galhos/i.test(name) || /^GTA\s/i.test(model)) return 'pruning_saw';
  if (/cortador\s+a\s+disco/i.test(name) || /^TSA\s/i.test(model)) return 'cut_off_machine';
  if (/lavadora|pressure\s*washer/i.test(name) || /^RE\b|^REA\b|^RCA\b/i.test(model)) return 'pressure_washer';
  if (/pulverizador|sprayer/i.test(name) || /^SG\b|^SR\b|^SGA\b/i.test(model)) return 'sprayer';
  if (/tesoura\s+de\s+poda|pruning\s*shear/i.test(name) || /^ASA\s/i.test(model)) return 'pruning_shears';
  if (/podador/i.test(name)) return 'hedge_trimmer';

  return record.phase44a_type.toLowerCase();
}

enriched.forEach(r => {
  r.semantic_type = classifyMachineType(r);
});

// ─── STEP 6: Detect category corrections vs Phase44A ───
const categoryCorrections = [];
enriched.forEach(r => {
  const p44a = r.phase44a_type.toLowerCase();
  const semantic = r.semantic_type;

  const normalized44a = {
    'hedge_trimmer': 'hedge_trimmer',
    'pruning_saw': 'pruning_saw',
    'brushcutter': 'brushcutter',
    'blower': 'blower',
    'chainsaw': 'chainsaw',
    'lawnmower': 'lawnmower',
    'vacuum': 'vacuum',
    'pressure_washer': 'pressure_washer',
    'sprayer': 'sprayer',
    'pruning_shears': 'pruning_shears'
  }[p44a] || p44a;

  if (normalized44a !== semantic) {
    categoryCorrections.push({
      record_id: r.record_id,
      model: r.parsed_model,
      phase44a_type: r.phase44a_type,
      corrected_type: semantic,
      reason: `Product name "${r.raw_name}" indicates ${semantic}, not ${r.phase44a_type}`
    });
  }
});

// ─── STEP 7: Group by identity for deduplication ───
const identityGroups = {};
enriched.forEach(r => {
  const key = normalize(r.parsed_model);
  if (!identityGroups[key]) identityGroups[key] = [];
  identityGroups[key].push(r);
});

// ─── STEP 8: Classify each group ───
const finalIdentities = [];
const finalBundleDupes = [];

for (const [key, records] of Object.entries(identityGroups)) {
  const model = records[0].parsed_model;
  const hasStandalone = records.some(r => !r.is_kit);
  const hasKit = records.some(r => r.is_kit);

  if (records.length === 1) {
    finalIdentities.push({
      canonical_model: model,
      proposed_slug: makeSlug(model),
      records: records.map(r => ({ id: r.record_id, name: r.raw_name, ref: r.reference, kit: r.is_kit })),
      semantic_type: records[0].semantic_type,
      bundle_status: records[0].is_kit ? 'KIT_ONLY' : 'STANDALONE',
      identity_confidence: records[0].identity_confidence,
      suffix: records[0].suffix
    });
  } else {
    const standalone = records.find(r => !r.is_kit);
    const kits = records.filter(r => r.is_kit);
    const standalones = records.filter(r => !r.is_kit);

    let bundleStatus = 'STANDALONE';
    if (hasStandalone && hasKit) bundleStatus = 'STANDALONE_AND_KIT';
    else if (!hasStandalone && hasKit) bundleStatus = 'KIT_ONLY_MULTIPLE';

    finalIdentities.push({
      canonical_model: model,
      proposed_slug: makeSlug(model),
      records: records.map(r => ({ id: r.record_id, name: r.raw_name, ref: r.reference, kit: r.is_kit })),
      standalone_ref: standalone ? standalone.reference : null,
      kit_refs: kits.map(k => k.reference),
      semantic_type: records[0].semantic_type,
      bundle_status: bundleStatus,
      identity_confidence: records.reduce((min, r) => {
        const order = { HIGH: 3, MEDIUM: 2, LOW: 1, BLOCKED: 0 };
        return order[r.identity_confidence] < order[min] ? r.identity_confidence : min;
      }, 'HIGH'),
      suffix: records[0].suffix
    });

    // Track bundle duplicates
    if (hasStandalone && hasKit) {
      kits.forEach(k => finalBundleDupes.push({
        record_id: k.record_id,
        model: model,
        duplicate_of: standalone.record_id,
        reason: 'KIT_BUNDLE_DUPLICATE'
      }));
    } else if (standalones.length > 1) {
      standalones.slice(1).forEach(s => finalBundleDupes.push({
        record_id: s.record_id,
        model: model,
        duplicate_of: standalones[0].record_id,
        reason: 'DUPLICATE_STANDALONE_RECORD'
      }));
    } else if (kits.length > 1 && !hasStandalone) {
      kits.slice(1).forEach(k => finalBundleDupes.push({
        record_id: k.record_id,
        model: model,
        duplicate_of: kits[0].record_id,
        reason: 'DUPLICATE_KIT_RECORD'
      }));
    }
  }
}

// ─── STEP 9: Collision check against 83 canonical models ───
const collisions = [];
const canonicalNames = canonical83.map(m => normalize(m.model_name));
const canonicalSlugs = canonical83.map(m => m.slug);

finalIdentities.forEach(identity => {
  const normName = normalize(identity.canonical_model);
  const slug = identity.proposed_slug;

  // Exact name collision
  const nameMatch = canonical83.find(m => normalize(m.model_name) === normName);
  if (nameMatch) {
    identity.collision = 'EXISTING_CANONICAL_EXACT';
    identity.collision_with = nameMatch.model_name;
    collisions.push({ model: identity.canonical_model, type: 'EXACT_NAME', existing: nameMatch.model_name });
  }

  // Slug collision
  const slugMatch = canonical83.find(m => m.slug === slug);
  if (slugMatch && !nameMatch) {
    identity.collision = 'SLUG_COLLISION';
    identity.collision_with = slugMatch.model_name;
    collisions.push({ model: identity.canonical_model, type: 'SLUG', existing: slugMatch.model_name, slug });
  }

  // Variant family check
  const prefix = identity.canonical_model.split(' ').slice(0, 2).join(' ');
  const familyMatches = canonical83.filter(m => m.model_name.startsWith(prefix));
  if (familyMatches.length > 0 && !nameMatch) {
    identity.variant_family = familyMatches.map(m => m.model_name);
  }

  // Slug collision within Tier2
  const tier2SlugMatch = finalIdentities.filter(i => i.proposed_slug === slug && i !== identity);
  if (tier2SlugMatch.length > 0) {
    identity.internal_slug_collision = true;
  }

  if (!identity.collision) identity.collision = 'NONE';
});

// ─── STEP 10: Determine route/category readiness ───
const existingCategorySlugs = new Set(canonical83.map(m => m.category_slug));
const categoryMap = {
  'chainsaw': 'kettingzagen',
  'brushcutter': 'bosmaaiers',
  'blower': 'bladblazers',
  'hedge_trimmer': 'heggenscharen',
  'cut_off_machine': 'doorslijpers',
  'vacuum_shredder': 'bladblazers',
};

finalIdentities.forEach(identity => {
  const mapped = categoryMap[identity.semantic_type];
  if (mapped && existingCategorySlugs.has(mapped)) {
    identity.route_category = mapped;
    identity.route_readiness = 'ROUTE_READY_EXISTING_CATEGORY';
  } else {
    identity.route_category = null;
    identity.route_readiness = 'NEW_CATEGORY_ARCHITECTURE_REQUIRED';
    identity.new_category_needed = identity.semantic_type;
  }
});

// ─── STEP 11: CORE5 staging ───
function determinePowerSource(record) {
  const name = (record.records[0]?.name || '').toLowerCase();
  const model = record.canonical_model.toUpperCase();

  if (/bateria|battery/i.test(name) || /^(FSA|BGA|MSA|HSA|HLA|GTA|SEA|SHA|RMA|RCA|REA|ASA|SGA|TSA)\s/i.test(model)) return 'battery';
  if (/elétric[ao]|electric/i.test(name) || /^(BGE|FSE|HSE|MSE|RE)\s/i.test(model)) return 'electric_mains';
  if (/combustão|combustion|gasoline/i.test(name) || /^(RM|SR|HS|HT)\s/.test(model)) return 'combustion';
  if (/manual/i.test(name) || /^SG\s/.test(model)) return 'manual';

  return 'REVIEW_REQUIRED';
}

function determinePrimaryFunction(type) {
  const map = {
    'chainsaw': 'wood_cutting',
    'brushcutter': 'vegetation_clearing',
    'blower': 'debris_blowing',
    'hedge_trimmer': 'hedge_trimming',
    'pruning_saw': 'pruning',
    'lawnmower': 'lawn_mowing',
    'vacuum': 'debris_collection',
    'vacuum_shredder': 'debris_collection',
    'pressure_washer': 'pressure_washing',
    'sprayer': 'spraying',
    'pruning_shears': 'pruning',
    'cut_off_machine': 'cutting'
  };
  return map[type] || 'REVIEW_REQUIRED';
}

function determineMachineForm(type) {
  const map = {
    'chainsaw': 'handheld_chainsaw',
    'brushcutter': 'handheld_brushcutter',
    'blower': 'handheld_blower',
    'hedge_trimmer': 'handheld_hedge_trimmer',
    'pruning_saw': 'pole_pruner',
    'lawnmower': 'walk_behind_mower',
    'vacuum': 'handheld_vacuum',
    'vacuum_shredder': 'handheld_vacuum_shredder',
    'pressure_washer': 'pressure_washer_unit',
    'sprayer': 'backpack_sprayer',
    'pruning_shears': 'handheld_pruning_shears',
    'cut_off_machine': 'handheld_cut_off_machine'
  };
  return map[type] || 'REVIEW_REQUIRED';
}

const core5Staging = finalIdentities.map(identity => {
  const powerSource = determinePowerSource(identity);
  const primaryFunction = determinePrimaryFunction(identity.semantic_type);
  const machineForm = determineMachineForm(identity.semantic_type);

  let adjustedForm = machineForm;
  if (/^SR\s/.test(identity.canonical_model)) adjustedForm = 'backpack_sprayer';
  if (/^SG\s/.test(identity.canonical_model)) adjustedForm = 'manual_sprayer';
  if (/^HT\s/.test(identity.canonical_model)) adjustedForm = 'pole_pruner';
  if (/^HTA\s/.test(identity.canonical_model)) adjustedForm = 'pole_pruner';
  if (/^HLA\s/.test(identity.canonical_model)) adjustedForm = 'pole_hedge_trimmer';

  const core5 = {
    product_category: identity.semantic_type,
    product_type: identity.semantic_type,
    machine_form: adjustedForm,
    power_source: powerSource,
    primary_function: primaryFunction
  };

  const complete = !Object.values(core5).includes('REVIEW_REQUIRED');

  return {
    model: identity.canonical_model,
    core5,
    completeness: complete ? '5/5' : Object.values(core5).filter(v => v !== 'REVIEW_REQUIRED').length + '/5',
    confidence: complete ? 'HIGH' : 'MEDIUM'
  };
});

// ─── STEP 12: Priority classification ───
finalIdentities.forEach(identity => {
  const core5 = core5Staging.find(c => c.model === identity.canonical_model);
  const isRouteReady = identity.route_readiness === 'ROUTE_READY_EXISTING_CATEGORY';
  const isCollisionFree = identity.collision === 'NONE';
  const isHighConfidence = identity.identity_confidence === 'HIGH';
  const isCore5Complete = core5?.completeness === '5/5';
  const hasExactCollision = identity.collision === 'EXISTING_CANONICAL_EXACT';

  if (hasExactCollision) {
    identity.priority = 'BLOCKED';
    identity.priority_reason = 'Exact collision with existing canonical model';
  } else if (isHighConfidence && isRouteReady && isCollisionFree && isCore5Complete) {
    identity.priority = '45B_WAVE1_READY';
    identity.priority_reason = 'All gates pass: HIGH confidence, route-ready, collision-free, CORE5 complete';
  } else if (isRouteReady && isCollisionFree && isCore5Complete) {
    identity.priority = '45B_WAVE2_READY';
    identity.priority_reason = 'Route-ready and collision-free, lower confidence';
  } else if (!isRouteReady) {
    identity.priority = 'CATEGORY_ARCHITECTURE_REQUIRED';
    identity.priority_reason = `New category "${identity.new_category_needed}" needs architecture`;
  } else if (!isCollisionFree) {
    identity.priority = 'VARIANT_REVIEW_REQUIRED';
    identity.priority_reason = `Collision with ${identity.collision_with}`;
  } else {
    identity.priority = 'IDENTITY_REVIEW_REQUIRED';
    identity.priority_reason = 'Incomplete CORE5 or other review needed';
  }
});

// ─── STEP 13: Select Wave1 ───
const wave1Candidates = finalIdentities.filter(i => i.priority === '45B_WAVE1_READY');
const wave1 = wave1Candidates.slice(0, 15);

// ─── STEP 14: Accounting ───
const productAccounting = enriched.map(r => ({
  record_id: r.record_id,
  raw_name: r.raw_name,
  reference: r.reference,
  phase44a_type: r.phase44a_type,
  parsed_model: r.parsed_model,
  semantic_type: r.semantic_type,
  is_kit: r.is_kit,
  identity_confidence: r.identity_confidence,
  is_bundle_duplicate: finalBundleDupes.some(b => b.record_id === r.record_id),
  canonical_identity: r.parsed_model
}));

const totalRecords = 72;
const bundleDupeCount = finalBundleDupes.length;
const uniqueCount = finalIdentities.length;
const existingExactCount = finalIdentities.filter(i => i.collision === 'EXISTING_CANONICAL_EXACT').length;

console.log(`\n=== ACCOUNTING ===`);
console.log(`Product records: ${totalRecords}`);
console.log(`Unique identities: ${uniqueCount}`);
console.log(`Bundle duplicates: ${bundleDupeCount}`);
console.log(`Records represented: ${uniqueCount + bundleDupeCount}`);
console.log(`Existing canonical exact: ${existingExactCount}`);
console.log(`Equation check: ${uniqueCount} unique + ${bundleDupeCount} dupes = ${uniqueCount + bundleDupeCount} (should be ${totalRecords})`);

// ─── WRITE ARTIFACTS ───

// 1. Product accounting
writeFileSync('data/phase45a_tier2_product_accounting.json', JSON.stringify({
  phase: '45A',
  total_records: totalRecords,
  records: productAccounting
}, null, 2));

// 2. Unique identity inventory
writeFileSync('data/phase45a_tier2_unique_identity_inventory.json', JSON.stringify({
  phase: '45A',
  unique_identity_count: uniqueCount,
  identities: finalIdentities.map(i => ({
    canonical_model: i.canonical_model,
    proposed_slug: i.proposed_slug,
    references: i.records.map(r => r.ref),
    product_records: i.records,
    bundle_status: i.bundle_status,
    standalone_ref: i.standalone_ref || null,
    kit_refs: i.kit_refs || [],
    semantic_type: i.semantic_type,
    suffix: i.suffix,
    identity_confidence: i.identity_confidence,
    collision: i.collision,
    collision_with: i.collision_with || null,
    variant_family: i.variant_family || [],
    route_readiness: i.route_readiness,
    route_category: i.route_category,
    priority: i.priority,
    priority_reason: i.priority_reason
  }))
}, null, 2));

// 3. Bundle reconciliation
const bundleGroups = {};
finalIdentities.filter(i => i.records.length > 1).forEach(i => {
  bundleGroups[i.canonical_model] = {
    model: i.canonical_model,
    records: i.records,
    standalone_ref: i.standalone_ref || null,
    kit_refs: i.kit_refs || [],
    bundle_status: i.bundle_status,
    canonical_identity_count: 1,
    disposition: i.records.length > 1 && i.records.some(r => r.kit) ? 'BUNDLE_DUPLICATE' : 'REAL_VARIANT',
    reason: i.bundle_status === 'STANDALONE_AND_KIT' ? 'Base tool + kit bundle = 1 identity' :
            i.bundle_status === 'KIT_ONLY_MULTIPLE' ? 'Multiple kit SKUs for same machine = 1 identity' :
            'Multiple standalone records reconciled'
  };
});

writeFileSync('data/phase45a_tier2_bundle_reconciliation.json', JSON.stringify({
  phase: '45A',
  bundle_groups_count: Object.keys(bundleGroups).length,
  total_bundle_duplicates: bundleDupeCount,
  groups: bundleGroups
}, null, 2));

// 4. ModelInfo null review
const nullModelInfo = enriched.filter(r => !r.modelInfo);
writeFileSync('data/phase45a_tier2_modelinfo_null_review.json', JSON.stringify({
  phase: '45A',
  total_null: nullModelInfo.length,
  records: nullModelInfo.map(r => ({
    record_id: r.record_id,
    raw_name: r.raw_name,
    reference: r.reference,
    proposed_identity: r.parsed_model,
    confidence: r.identity_confidence,
    parse_failure_reason: 'Phase44A modelInfo parser did not extract prefix from product name; likely limitation in regex pattern matching for this model prefix/type combination',
    final_disposition: r.identity_confidence === 'BLOCKED' ? 'IDENTITY_PARSE_REVIEW_REQUIRED' : 'UNIQUE_MACHINE_IDENTITY_READY'
  }))
}, null, 2));

// 5. Category architecture audit
writeFileSync('data/phase45a_tier2_category_architecture_audit.json', JSON.stringify({
  phase: '45A',
  identities: finalIdentities.map(i => ({
    model: i.canonical_model,
    phase44a_type: i.records[0]?.phase44a_type || enriched.find(e => e.parsed_model === i.canonical_model)?.phase44a_type || 'UNKNOWN',
    semantic_class: i.semantic_type,
    existing_route_available: i.route_readiness === 'ROUTE_READY_EXISTING_CATEGORY',
    new_route_required: i.route_readiness === 'NEW_CATEGORY_ARCHITECTURE_REQUIRED',
    existing_category_safe: i.route_readiness === 'ROUTE_READY_EXISTING_CATEGORY',
    recommended_category: i.route_category || i.semantic_type,
    phase45b_readiness: i.priority
  })),
  category_corrections: categoryCorrections
}, null, 2));

// 6. CORE5 staging
writeFileSync('data/phase45a_tier2_core5_staging.json', JSON.stringify({
  phase: '45A',
  total: core5Staging.length,
  complete_5_of_5: core5Staging.filter(c => c.completeness === '5/5').length,
  staging: core5Staging
}, null, 2));

// 7. Collision audit
writeFileSync('data/phase45a_tier2_collision_audit.json', JSON.stringify({
  phase: '45A',
  canonical_models_checked: 83,
  tier2_identities_checked: uniqueCount,
  exact_collisions: collisions.filter(c => c.type === 'EXACT_NAME'),
  slug_collisions: collisions.filter(c => c.type === 'SLUG'),
  variant_relationships: finalIdentities.filter(i => i.variant_family && i.variant_family.length > 0).map(i => ({
    model: i.canonical_model,
    family: i.variant_family
  })),
  internal_slug_collisions: finalIdentities.filter(i => i.internal_slug_collision).map(i => i.canonical_model),
  all_safe: collisions.length === 0
}, null, 2));

// 8. Prioritization
const prioDist = {};
finalIdentities.forEach(i => { prioDist[i.priority] = (prioDist[i.priority] || 0) + 1; });

writeFileSync('data/phase45a_tier2_prioritization.json', JSON.stringify({
  phase: '45A',
  total_identities: uniqueCount,
  distribution: prioDist,
  identities: finalIdentities.map(i => ({
    model: i.canonical_model,
    priority: i.priority,
    identity_confidence: i.identity_confidence,
    route_readiness: i.route_readiness,
    core5_readiness: core5Staging.find(c => c.model === i.canonical_model)?.completeness || 'UNKNOWN',
    collision_safety: i.collision,
    source_quality: 'PHASE44A_CATALOG',
    reason: i.priority_reason
  }))
}, null, 2));

// 9. Wave1 definition
writeFileSync('data/phase45a_phase45b_wave1_definition.json', JSON.stringify({
  phase: '45A',
  wave1_count: wave1.length,
  target_range: '8-15',
  identities: wave1.map(w => ({
    canonical_model: w.canonical_model,
    source_record_ids: w.records.map(r => r.id),
    references: w.records.map(r => r.ref),
    proposed_slug: w.proposed_slug,
    core5: core5Staging.find(c => c.model === w.canonical_model)?.core5 || null,
    route_category: w.route_category,
    identity_confidence: w.identity_confidence,
    collision: w.collision,
    bundle_status: w.bundle_status,
    selection_reason: w.priority_reason
  }))
}, null, 2));

// 10. Route impact forecast
const routeReady = finalIdentities.filter(i => i.route_readiness === 'ROUTE_READY_EXISTING_CATEGORY').length;
const newCategoryNeeded = finalIdentities.filter(i => i.route_readiness === 'NEW_CATEGORY_ARCHITECTURE_REQUIRED').length;
const newCategories = [...new Set(finalIdentities.filter(i => i.new_category_needed).map(i => i.new_category_needed))];

writeFileSync('data/phase45a_route_impact_forecast.json', JSON.stringify({
  phase: '45A',
  route_ready_existing: routeReady,
  new_category_required: newCategoryNeeded,
  new_categories_needed: newCategories,
  architecture_recommendation: newCategoryNeeded > 10 ?
    'PHASE45A-ARCH recommended: significant new category architecture needed before batch activation' :
    'New categories can be added incrementally during Wave2+'
}, null, 2));

console.log('\n=== ALL ARTIFACTS WRITTEN ===');
