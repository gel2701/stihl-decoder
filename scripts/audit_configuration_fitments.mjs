#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { readGzipJsonlFile } from '../src/parts/PartsHarvesterEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function auditConfigurationFitments() {
  console.log('🔬 Auditing Configuration Fitments & Generating Differential Analysis...');

  const identityAuditPath = path.join(rootDir, 'data', 'phase52b_model_identity_audit.json');
  const fitmentsPath = path.join(rootDir, 'data', 'model_part_fitments.json');
  const outputPath = path.join(rootDir, 'data', 'phase52b_configuration_fitment_audit.json');

  if (!fs.existsSync(identityAuditPath) || !fs.existsSync(fitmentsPath)) {
    throw new Error('Required audit or fitment files missing.');
  }

  const identityAudit = JSON.parse(fs.readFileSync(identityAuditPath, 'utf8'));
  const fitmentsDoc = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));

  const allFitments = [];
  if (Array.isArray(fitmentsDoc.shard_files)) {
    for (const sFile of fitmentsDoc.shard_files) {
      allFitments.push(...readGzipJsonlFile(path.join(rootDir, 'data', sFile)));
    }
  } else if (Array.isArray(fitmentsDoc.fitments)) {
    allFitments.push(...fitmentsDoc.fitments);
  }

  // Index fitments by canonical_model_id
  const fitmentsByModel = new Map();
  for (const f of allFitments) {
    if (!fitmentsByModel.has(f.canonical_model_id)) {
      fitmentsByModel.set(f.canonical_model_id, []);
    }
    fitmentsByModel.get(f.canonical_model_id).push(f);
  }

  const diffReconciliations = identityAudit.duplicate_identity_reconciliations.filter(
    r => r.classification === 'SAME_VARIANT_DIFFERENT_CONFIGURATION'
  );

  const auditGroups = [];
  let totalExclusiveParts = 0;
  let totalSharedParts = 0;

  for (const rec of diffReconciliations) {
    const [modelId, variantKey] = rec.identity_key.split('::');
    const modelFitments = fitmentsByModel.get(modelId) || [];

    // Group fitments by configuration_name or 'base'
    const configPartsMap = new Map();
    for (const entry of rec.entries) {
      const cfgName = entry.configuration_name || 'Base Machine';
      if (!configPartsMap.has(cfgName)) {
        configPartsMap.set(cfgName, new Set());
      }
    }

    for (const f of modelFitments) {
      const cfgName = f.configuration_name || 'Base Machine';
      if (configPartsMap.has(cfgName)) {
        configPartsMap.get(cfgName).add(f.part_number);
      }
    }

    const configNames = Array.from(configPartsMap.keys());
    const configSets = configNames.map(name => ({
      name,
      parts: configPartsMap.get(name)
    }));

    if (configSets.length >= 2) {
      // Find intersection
      const allPartsInGroup = new Set(configSets.flatMap(cs => Array.from(cs.parts)));
      const sharedParts = Array.from(allPartsInGroup).filter(p =>
        configSets.every(cs => cs.parts.has(p))
      );

      const perConfigStats = {};
      const exclusivePartsByConfig = {};

      for (const cs of configSets) {
        const exclusive = Array.from(cs.parts).filter(p =>
          configSets.every(other => other.name === cs.name || !other.parts.has(p))
        );
        perConfigStats[cs.name] = {
          parts_count: cs.parts.size,
          exclusive_count: exclusive.length
        };
        exclusivePartsByConfig[cs.name] = exclusive;
        totalExclusiveParts += exclusive.length;
      }
      totalSharedParts += sharedParts.length;

      auditGroups.push({
        identity_key: rec.identity_key,
        canonical_model_id: modelId,
        variant_key: variantKey,
        configurations_count: configSets.length,
        configurations: configNames,
        total_unique_parts: allPartsInGroup.size,
        shared_parts_count: sharedParts.length,
        shared_parts_sample: sharedParts.slice(0, 10),
        per_configuration_stats: perConfigStats,
        exclusive_parts_sample: Object.fromEntries(
          Object.entries(exclusivePartsByConfig).map(([k, v]) => [k, v.slice(0, 10)])
        )
      });
    }
  }

  const auditDoc = {
    schema_version: 'phase52b-configuration-fitment-audit-v1',
    audited_at: new Date().toISOString(),
    summary: {
      total_configuration_groups_audited: auditGroups.length,
      total_exclusive_parts_found: totalExclusiveParts,
      total_shared_parts_found: totalSharedParts
    },
    differential_groups: auditGroups
  };

  fs.writeFileSync(outputPath, JSON.stringify(auditDoc, null, 2), 'utf8');

  console.log(`✅ Configuration Fitment Audit Complete:`);
  console.log(`   Audited Groups:   ${auditGroups.length}`);
  console.log(`   Exclusive Parts:  ${totalExclusiveParts}`);
  console.log(`   Shared Parts:     ${totalSharedParts}`);
  console.log(`   Written to:       ${outputPath}`);

  return auditDoc;
}

if (process.argv[1] && process.argv[1].endsWith('audit_configuration_fitments.mjs')) {
  auditConfigurationFitments();
}
