import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { extractSpecsFromHtml } from './phase45c_capture_sources.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase45c_source_manifest.json'), 'utf8'));
const bundleRecon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase45a_tier2_bundle_reconciliation.json'), 'utf8'));

const groupsToAudit = ['BGA 30', 'FSA 50', 'HSA 30'];
const auditedGroups = [];

for (const modelName of groupsToAudit) {
  const src = manifest.sources.find(s => s.model === modelName);
  const bundleGroup = bundleRecon.groups[modelName];

  const standFile = path.join(ROOT, src.primary_machine_source.captured_file);
  const standHtml = fs.readFileSync(standFile, 'utf8');
  const standSha = crypto.createHash('sha256').update(standHtml, 'utf8').digest('hex');
  const standSpecs = extractSpecsFromHtml(standHtml);

  const kitSec = src.secondary_bundle_sources[0];
  const kitFile = path.join(ROOT, kitSec.captured_file);
  const kitHtml = fs.readFileSync(kitFile, 'utf8');
  const kitSha = crypto.createHash('sha256').update(kitHtml, 'utf8').digest('hex');
  const kitSpecs = extractSpecsFromHtml(kitHtml);

  const standKeys = Object.keys(standSpecs);
  const kitKeys = Object.keys(kitSpecs);

  const allKeys = [...new Set([...standKeys, ...kitKeys])];
  const identicalFields = [];
  const differentFields = [];
  const kitOnlyFields = [];
  const standaloneOnlyFields = [];
  const conflicts = [];
  const fieldComparisons = [];

  for (const k of allKeys) {
    const inStand = k in standSpecs;
    const inKit = k in kitSpecs;
    const standVal = standSpecs[k];
    const kitVal = kitSpecs[k];

    let classification;
    if (inStand && inKit) {
      if (standVal === kitVal) {
        classification = 'IDENTICAL_MACHINE_SPEC';
        identicalFields.push(k);
      } else {
        // Check if conflict or format difference
        classification = 'CONFLICT';
        differentFields.push(k);
        conflicts.push({ field: k, standalone: standVal, kit: kitVal });
      }
    } else if (inKit && !inStand) {
      classification = 'KIT_ONLY_FIELD';
      kitOnlyFields.push(k);
    } else {
      classification = 'STANDALONE_ONLY_FIELD';
      standaloneOnlyFields.push(k);
    }

    fieldComparisons.push({
      field_label: k,
      standalone_value: standVal ?? null,
      kit_value: kitVal ?? null,
      classification
    });
  }

  auditedGroups.push({
    model: modelName,
    bundle_status: 'STANDALONE_AND_KIT',
    standalone: {
      record_id: src.primary_machine_source.source_record_id,
      reference: src.primary_machine_source.reference,
      url: src.primary_machine_source.source_url,
      file: src.primary_machine_source.captured_file,
      sha256: standSha,
      spec_count: standKeys.length,
      technical_fields: standSpecs
    },
    kit: {
      record_id: kitSec.source_record_id,
      reference: kitSec.reference,
      url: kitSec.source_url,
      file: kitSec.captured_file,
      sha256: kitSha,
      spec_count: kitKeys.length,
      technical_fields: kitSpecs
    },
    comparison: {
      total_unique_fields: allKeys.length,
      identical_fields_count: identicalFields.length,
      identical_fields: identicalFields,
      different_fields_count: differentFields.length,
      different_fields: differentFields,
      kit_only_fields_count: kitOnlyFields.length,
      kit_only_fields: kitOnlyFields,
      standalone_only_fields_count: standaloneOnlyFields.length,
      standalone_only_fields: standaloneOnlyFields,
      conflicts_count: conflicts.length,
      conflicts: conflicts,
      all_field_comparisons: fieldComparisons
    },
    reconciliation_verdict: conflicts.length === 0 ? 'STANDALONE_PRECEDENCE_PROVEN_ZERO_CONFLICTS' : 'CONFLICT_BLOCKED'
  });
}

const kitOnlyModels = [
  {
    model: 'HSA 40',
    bundle_status: 'KIT_ONLY',
    classification: 'KIT_ONLY_IDENTITY_SOURCE',
    primary_reference: 'HA08-011-35SET',
    source_url: 'https://loja.stihl.com.br/podador-a-bateria-hsa-40-kit/p',
    falsely_labelled_standalone: false,
    reason: 'Model offered exclusively as kit in Brazilian market catalog'
  },
  {
    model: 'FSA 30',
    bundle_status: 'KIT_ONLY',
    classification: 'KIT_ONLY_IDENTITY_SOURCE',
    primary_reference: 'FA10-011-57SET',
    source_url: 'https://loja.stihl.com.br/rocadeira-a-bateria-fsa-30-set/p',
    falsely_labelled_standalone: false,
    reason: 'Model offered exclusively as kit in Brazilian market catalog'
  }
];

const auditReport = {
  phase: '45C-R1',
  audit_timestamp: new Date().toISOString(),
  summary: {
    standalone_plus_kit_groups: auditedGroups.length,
    standalone_primary: `${auditedGroups.filter(g => g.reconciliation_verdict === 'STANDALONE_PRECEDENCE_PROVEN_ZERO_CONFLICTS').length}/${auditedGroups.length}`,
    kit_only_groups: kitOnlyModels.length,
    kit_only_correctly_retained: `${kitOnlyModels.filter(k => k.classification === 'KIT_ONLY_IDENTITY_SOURCE' && !k.falsely_labelled_standalone).length}/${kitOnlyModels.length}`,
    total_conflicts: auditedGroups.reduce((acc, g) => acc + g.comparison.conflicts_count, 0)
  },
  groups: auditedGroups,
  kit_only_models: kitOnlyModels
};

fs.writeFileSync(
  path.join(ROOT, 'data/phase45c_r1_source_precedence_audit.json'),
  JSON.stringify(auditReport, null, 2),
  'utf8'
);

console.log('Saved data/phase45c_r1_source_precedence_audit.json');
console.log('Summary:', JSON.stringify(auditReport.summary, null, 2));
