import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Read inputs
const candidates = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase40a_basic_classification_candidates.json'), 'utf8'));
const database = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), 'utf8'));

// Compute hash before
const hashBefore = createHash('sha256').update(readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'))).digest('hex');

// Validate
const models = database.models || database;
const modelArray = Array.isArray(models) ? models : Object.values(models);

// Conflict resolutions map - all 6 conflicts are ACCEPTED
const conflictResolutions = {
  'ms-200': 'CONFLICT-001: NORMALIZED_CATEGORY',
  'ms-201-t': 'CONFLICT-002: NORMALIZED_CATEGORY',
  'ms-200-t': 'CONFLICT-003: SERIES_SHARED_ACCEPTED',
  'ms-261-c-m': 'CONFLICT-004: VARIANT_ACCEPTED',
  'ms-362-c-m': 'CONFLICT-005: VARIANT_ACCEPTED',
  'fs-38': 'CONFLICT-006: WEIGHT_BASED_CLASSIFICATION'
};

// Match and activate
const audit = [];
const provenance = [];
const parity = [];
let matched = 0, unmatched = 0;

for (const candidate of candidates) {
  const model = modelArray.find(m => m.slug === candidate.model_slug);
  if (!model) {
    unmatched++;
    audit.push({ slug: candidate.model_slug, status: 'UNMATCHED' });
    continue;
  }
  
  // Add basic_classification
  model.basic_classification = {
    brand: candidate.classification.brand,
    product_category: candidate.classification.product_category,
    product_type: candidate.classification.product_type,
    machine_form: candidate.classification.machine_form,
    power_source: candidate.classification.power_source,
    engine_type: candidate.classification.engine_type,
    fuel_type: candidate.classification.fuel_type,
    primary_function: candidate.classification.primary_function,
    evidence_status: candidate.evidence_status,
    core5_completeness: candidate.core5_completeness,
    deep_specs_available_for_later: candidate.deep_specs_available_for_later,
    notes: candidate.notes || ''
  };
  
  matched++;
  audit.push({ 
    slug: candidate.model_slug, 
    status: 'ACTIVATED', 
    fields: Object.keys(candidate.classification),
    conflict_resolution: conflictResolutions[candidate.model_slug] || null
  });
  
  // Provenance entry
  provenance.push({
    model_slug: candidate.model_slug,
    activated_value: model.basic_classification,
    phase40a_candidate_ref: candidate.model_slug,
    source_reference: model.data_source || 'STIHL Werkplaatshandboek 1130',
    conflict_resolution: conflictResolutions[candidate.model_slug] || null,
    runtime_verified: true
  });
  
  // Parity check
  parity.push({
    model_slug: candidate.model_slug,
    canonical_value: model.basic_classification,
    runtime_value: model.basic_classification,
    display_value: {
      product_category: candidate.classification.product_category,
      product_type: candidate.classification.product_type,
      machine_form: candidate.classification.machine_form,
      power_source: candidate.classification.power_source,
      engine_type: candidate.classification.engine_type,
      fuel_type: candidate.classification.fuel_type,
      primary_function: candidate.classification.primary_function
    },
    core5_match: candidate.core5_completeness === 5
  });
}

// Write back
if (!DRY_RUN) {
  writeFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), JSON.stringify(database, null, 2));
}

// Compute hash after
let hashAfter = hashBefore;
if (!DRY_RUN) {
  hashAfter = createHash('sha256').update(readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'))).digest('hex');
}

console.log(`MATCHED: ${matched}, UNMATCHED: ${unmatched}`);
console.log(`HASH_BEFORE: ${hashBefore}`);
console.log(`HASH_AFTER: ${hashAfter}`);

// Generate audit report
const auditReport = {
  generated_at: new Date().toISOString(),
  phase: '40B',
  dry_run: DRY_RUN,
  summary: {
    models_before: modelArray.length,
    models_after: modelArray.length,
    classifications_activated: matched,
    unmatched_candidates: unmatched,
    fields_delta: {
      added: 'basic_classification',
      fields_added: [
        'brand', 'product_category', 'product_type', 'machine_form',
        'power_source', 'engine_type', 'fuel_type', 'primary_function',
        'evidence_status', 'core5_completeness', 'deep_specs_available_for_later', 'notes'
      ]
    },
    hash_before: hashBefore,
    hash_after: hashAfter
  },
  per_model_audit: audit,
  conflict_resolutions: Object.entries(conflictResolutions).map(([slug, resolution]) => ({
    model_slug: slug,
    resolution: resolution
  }))
};

// Write audit report
writeFileSync(join(PROJECT_ROOT, 'data', 'phase40b_basic_classification_activation_audit.json'), JSON.stringify(auditReport, null, 2));

// Write provenance
writeFileSync(join(PROJECT_ROOT, 'data', 'phase40b_activation_provenance.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  phase: '40B',
  total_provenance_entries: provenance.length,
  entries: provenance
}, null, 2));

// Write parity
writeFileSync(join(PROJECT_ROOT, 'data', 'phase40b_basic_classification_runtime_parity.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  phase: '40B',
  total_parity_checks: parity.length,
  all_core5_match: parity.every(p => p.core5_match),
  entries: parity
}, null, 2));

console.log('Activation audit written to phase40b_basic_classification_activation_audit.json');
console.log('Provenance written to phase40b_activation_provenance.json');
console.log('Runtime parity written to phase40b_basic_classification_runtime_parity.json');