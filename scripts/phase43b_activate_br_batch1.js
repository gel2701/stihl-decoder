#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const TIMESTAMP = new Date().toISOString();
const PHASE = '43B';
const EXECUTE = process.argv.includes('--execute');

function sha256(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

function generateFactId(phaseId, modelSlug, field, sourcePath, normalizedValue) {
  const input = JSON.stringify([phaseId, modelSlug, field, sourcePath, normalizedValue]);
  return sha256(input).slice(0, 16);
}

const SLUG_MAP = {
  'stihl_ms_260': 'ms-260',
  'stihl_ms_261_cm': 'ms-261',
  'stihl_hs_45': 'hs-45',
  'stihl_fs_120': 'fs-120',
  'stihl_br_600': 'br-600',
  'stihl_fs_38': 'fs-38',
  'sr-430': 'sr-430',
  'sr-450': 'sr-450'
};

const MEASUREMENT_DEFS = {
  'sound_pressure_db': 'SOUND_PRESSURE_LEVEL',
  'sound_power_db': 'SOUND_POWER_LEVEL',
  'vibration_left': 'VIBRATION_LEFT_HAND',
  'vibration_right': 'VIBRATION_RIGHT_HAND',
  'oil_tank_ml': 'OIL_TANK_CAPACITY',
  'fuel_tank_ml': 'FUEL_TANK_CAPACITY',
  'weight_kg': 'WEIGHT_WITHOUT_FUEL'
};

const UNITS = {
  'sound_pressure_db': 'dB(A)',
  'sound_power_db': 'dB(A)',
  'vibration_left': 'm/s²',
  'vibration_right': 'm/s²',
  'oil_tank_ml': 'ml',
  'fuel_tank_ml': 'ml',
  'weight_kg': 'kg'
};

const MARKET_VARIANTS = [
  { model_slug: 'ms-261', field: 'power_kw', br_value: 2.95, canonical_value: 3.0, block_reason: 'BR market rating rounding difference' },
  { model_slug: 'ms-260', field: 'weight_kg', br_value: 4.9, canonical_value: 4.8, block_reason: 'BR market config difference (bar/chain included)' },
  { model_slug: 'br-600', field: 'weight_kg', br_value: 10.1, canonical_value: 10.3, block_reason: 'BR market config difference (tube/nozzle)' }
];

console.log(`Phase ${PHASE}: BR Batch 1 Activation`);
console.log('='.repeat(60));
console.log(`Mode: ${EXECUTE ? 'EXECUTE (real writes)' : 'DRY RUN (no files written)'}`);
console.log('');

// --- Load inputs ---
console.log('Loading input artifacts...');
const db = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), 'utf8'));
const evidenceFacts = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'public_evidence_facts.json'), 'utf8'));
const readyCandidates = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase43a_br_phase43b_ready_candidates.json'), 'utf8'));
const highValueReview = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase43a_br_high_value_candidate_review.json'), 'utf8'));
const fieldReconciliation = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase43a_br_field_reconciliation.json'), 'utf8'));
const dbMissingDisposition = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase43a_br_database_missing_disposition.json'), 'utf8'));
const marketVariantReview = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'phase43a_br_market_variant_review.json'), 'utf8'));
const baselineManifest = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'public_evidence_baseline_manifest.json'), 'utf8'));

const models = db.models || db;
const modelArray = Array.isArray(models) ? models : Object.values(models);
const existingFacts = evidenceFacts.facts;
const modelSlugs = new Set(modelArray.map(m => m.slug));
const modelById = {};
for (const m of modelArray) modelById[m.id] = m;
const modelBySlug = {};
for (const m of modelArray) modelBySlug[m.slug] = m;

console.log(`  Models: ${modelArray.length}`);
console.log(`  Public facts: ${existingFacts.length}`);

// --- SHA256 before ---
const factsHashBefore = sha256(JSON.stringify(evidenceFacts));
const dbHashBefore = sha256(JSON.stringify(db));
console.log(`\nBaseline SHA256:`);
console.log(`  public_evidence_facts.json: ${factsHashBefore}`);
console.log(`  stihl_database.json:        ${dbHashBefore}`);

// --- Resolve canonical slugs ---
function resolveCanonicalSlug(modelSlug) {
  if (SLUG_MAP[modelSlug]) return SLUG_MAP[modelSlug];
  if (modelSlugs.has(modelSlug)) return modelSlug;
  return null;
}

// --- Build source URL lookup from ready_candidates ---
const sourceUrlByModelField = {};
for (const rc of readyCandidates.candidates) {
  sourceUrlByModelField[`${rc.model_slug}:${rc.field}`] = rc.source_url;
}
// Also pull source URLs from database_missing_disposition for the extra entries
for (const e of dbMissingDisposition.entries) {
  const key = `${e.model_slug}:${e.field}`;
  if (!sourceUrlByModelField[key]) sourceUrlByModelField[key] = e.source_url;
}

// --- Build crosswalk: all 32 candidates ---
console.log('\n--- Building Crosswalk ---');
const allCandidates = highValueReview.candidates;
const readySet = new Set(readyCandidates.candidates.map(c => `${c.model_slug}:${c.field}`));
const dbMissingSet = new Set(dbMissingDisposition.entries.map(e => `${e.model_slug}:${e.field}`));
const variantBlockedSet = new Set(MARKET_VARIANTS.map(v => `${v.model_slug}:${v.field}`));

const readyCandidateCrosswalk = [];
const dbMissingCrosswalk = [];
const blockedCandidates = [];
const activationEntries = [];
const alreadyPresentEntries = [];

for (const candidate of allCandidates) {
  const cSlug = resolveCanonicalSlug(candidate.model_slug);
  const key = `${candidate.model_slug}:${candidate.field}`;
  const canonKey = cSlug ? `${cSlug}:${candidate.field}` : key;
  const isReady = readySet.has(key);
  const isDbMissing = dbMissingSet.has(key);
  const isVariantBlocked = variantBlockedSet.has(canonKey);
  const dbModel = cSlug ? modelBySlug[cSlug] : null;
  const dbValue = dbModel ? dbModel[candidate.field] : undefined;
  const isAlreadyInDb = dbValue !== null && dbValue !== undefined;
  const sourceUrl = sourceUrlByModelField[key] || null;

  const crosswalkEntry = {
    model_name: candidate.model_name,
    input_model_slug: candidate.model_slug,
    canonical_slug: cSlug,
    field: candidate.field,
    raw_value: candidate.raw_value,
    disposition: candidate.disposition,
    in_database: candidate.in_database,
    in_public_evidence: candidate.in_public_evidence,
    ready_for_activation: isReady,
    in_database_missing_disposition: isDbMissing,
    market_variant_blocked: isVariantBlocked,
    db_current_value: dbValue,
    source_url: sourceUrl
  };

  readyCandidateCrosswalk.push(crosswalkEntry);

  if (candidate.disposition === 'ALREADY_PRESENT_EQUIVALENT') {
    alreadyPresentEntries.push(crosswalkEntry);
  } else if (isReady && !isVariantBlocked && !isAlreadyInDb) {
    activationEntries.push(crosswalkEntry);
  } else if (isVariantBlocked) {
    const variant = MARKET_VARIANTS.find(v => v.model_slug === candidate.model_slug && v.field === candidate.field);
    blockedCandidates.push({
      ...crosswalkEntry,
      block_reason: 'MARKET_VARIANT_RISK',
      br_value: variant.br_value,
      canonical_value: variant.canonical_value,
      block_detail: variant.block_reason
    });
  }
}

// --- DATABASE_MISSING crosswalk: explain 26 vs 32 ---
const highValueModelFieldSet = new Set(allCandidates.map(c => `${c.model_slug}:${c.field}`));
const dbMissingOnly = dbMissingDisposition.entries.filter(e => !highValueModelFieldSet.has(`${e.model_slug}:${e.field}`));
const highValueOnly = allCandidates.filter(c => !dbMissingSet.has(`${c.model_slug}:${c.field}`));

for (const entry of dbMissingDisposition.entries) {
  const cSlug = resolveCanonicalSlug(entry.model_slug);
  dbMissingCrosswalk.push({
    model_name: entry.model_name,
    input_model_slug: entry.model_slug,
    canonical_slug: cSlug,
    field: entry.field,
    raw_value: entry.raw_value,
    in_high_value_review: highValueModelFieldSet.has(`${entry.model_slug}:${entry.field}`),
    note: highValueModelFieldSet.has(`${entry.model_slug}:${entry.field}`)
      ? 'Included in high_value_candidate_review'
      : 'DATABASE_MISSING but excluded from high_value_candidate_review (not selected for activation batch)'
  });
}

console.log(`  Total candidates reviewed: ${allCandidates.length}`);
console.log(`  READY_FOR_ACTIVATION: ${activationEntries.length}`);
console.log(`  ALREADY_PRESENT_EQUIVALENT: ${alreadyPresentEntries.length}`);
console.log(`  MARKET_VARIANT_BLOCKED: ${blockedCandidates.length}`);
console.log(`  DATABASE_MISSING entries: ${dbMissingDisposition.entries.length}`);
console.log(`  DATABASE_MISSING in high_value: ${dbMissingDisposition.entries.length - dbMissingOnly.length}`);
console.log(`  DATABASE_MISSING not in high_value: ${dbMissingOnly.length}`);
console.log(`  High value not in DATABASE_MISSING: ${highValueOnly.length}`);

// --- Dry-run validation ---
console.log('\n--- Dry-Run Validation ---');
const validationIssues = [];
for (const entry of activationEntries) {
  const cSlug = entry.canonical_slug;
  if (!cSlug) {
    validationIssues.push(`MODEL_NOT_FOUND: ${entry.input_model_slug} not in DB`);
    continue;
  }
  if (!modelSlugs.has(cSlug)) {
    validationIssues.push(`SLUG_NOT_IN_DB: ${cSlug} not found in stihl_database.json`);
    continue;
  }
  const dbModel = modelBySlug[cSlug];
  const currentVal = dbModel[entry.field];
  if (currentVal !== null && currentVal !== undefined) {
    validationIssues.push(`FIELD_NOT_NULL: ${cSlug}.${entry.field} = ${currentVal} (expected null)`);
  }
  if (entry.market_variant_blocked) {
    validationIssues.push(`VARIANT_RISK: ${cSlug}.${entry.field} has market variant`);
  }
  const sourceUrlForId = entry.source_url || '';
  const factId = generateFactId(PHASE, cSlug, entry.field, sourceUrlForId, entry.raw_value);
  if (existingFacts.some(f => f.fact_id === factId)) {
    validationIssues.push(`FACT_ID_COLLISION: ${factId} for ${cSlug}.${entry.field}`);
  }
  if (existingFacts.some(f => f.model_slug === cSlug && f.field === entry.field && JSON.stringify(f.normalized_value) === JSON.stringify(entry.raw_value))) {
    validationIssues.push(`ALREADY_IN_FACTS: ${cSlug}.${entry.field}=${entry.raw_value} exists in public_evidence_facts`);
  }
}

if (validationIssues.length > 0) {
  console.log('  ISSUES FOUND:');
  for (const issue of validationIssues) console.log(`    - ${issue}`);
} else {
  console.log('  All validations PASSED');
}

// --- Generate new facts ---
console.log('\n--- Generating Public Evidence Facts ---');
const newFacts = [];
const activationProvenance = [];

for (const entry of activationEntries) {
  const cSlug = entry.canonical_slug;
  const dbModel = modelBySlug[cSlug];
  const sourceUrl = entry.source_url || '';
  const factId = generateFactId(PHASE, cSlug, entry.field, sourceUrl, entry.raw_value);
  const unit = UNITS[entry.field] || '';
  const measurementDef = MEASUREMENT_DEFS[entry.field] || entry.field.toUpperCase();

  const fact = {
    fact_id: factId,
    model_slug: cSlug,
    variant_slug: cSlug,
    model_name: entry.model_name,
    category: dbModel ? dbModel.category : 'Unknown',
    field: entry.field,
    raw_value: String(entry.raw_value),
    normalized_value: entry.raw_value,
    unit: unit,
    measurement_definition: measurementDef,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    display_eligible: true,
    single_value_eligible: true,
    source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    source_document_id: null,
    source_document_title: `STIHL ${entry.model_name} BR Product Page`,
    publication_id: null,
    pdf_page: null,
    printed_page: null,
    market: 'BR',
    revision: null,
    configuration: null,
    model_scope: 'EXACT_MODEL',
    scope_evidence: [`DOC_MODEL:${cSlug}`],
    field_semantic_status: 'VALID',
    conflict_group_id: null,
    conflict_status: 'CLEAR',
    conflicting_values: [],
    source_url: sourceUrl,
    evidence_hash: sha256(`${cSlug}:${entry.field}:${JSON.stringify(entry.raw_value)}:${sourceUrl}`),
    generated_from_phase: PHASE,
    evidence_status: 'OFFICIAL_DOCUMENTED',
    source_locator_type: 'PRODUCT_PAGE',
    source_locator: sourceUrl,
    source_heading: entry.field,
    source_lineage: `PHASE_${PHASE}_BR_HARVEST`,
    independence_status: 'SINGLE_SOURCE',
    underlying_source_id: null,
    underlying_source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    underlying_source_locator: null,
    authenticity_status: 'AUTHENTICATED_OFFICIAL'
  };

  newFacts.push(fact);
  activationProvenance.push({
    fact_id: factId,
    model_slug: cSlug,
    field: entry.field,
    value: entry.raw_value,
    source_url: sourceUrl,
    market: 'BR',
    activated_at: TIMESTAMP,
    phase: PHASE
  });
}

console.log(`  New facts generated: ${newFacts.length}`);

// --- Update database fields ---
console.log('\n--- Database Field Updates ---');
const dbFieldUpdates = [];
for (const entry of activationEntries) {
  const cSlug = entry.canonical_slug;
  const dbModel = modelBySlug[cSlug];
  if (!dbModel) continue;
  const currentVal = dbModel[entry.field];
  if (currentVal !== null && currentVal !== undefined) {
    console.log(`  SKIP ${cSlug}.${entry.field} = ${currentVal} (not null)`);
    continue;
  }
  dbFieldUpdates.push({
    model_slug: cSlug,
    field: entry.field,
    old_value: currentVal,
    new_value: entry.raw_value
  });
  if (EXECUTE) {
    dbModel[entry.field] = entry.raw_value;
  }
}
console.log(`  Fields to update: ${dbFieldUpdates.length}`);

// --- Write files ---
if (EXECUTE) {
  console.log('\n--- Writing Files ---');

  // Update evidence facts
  const allFacts = [...existingFacts, ...newFacts];
  const factIds = allFacts.map(f => f.fact_id);
  const uniqueFactIds = new Set(factIds);
  if (uniqueFactIds.size !== factIds.length) {
    console.error('FATAL: Duplicate fact IDs detected after merge!');
    process.exit(1);
  }

  evidenceFacts.facts = allFacts;
  evidenceFacts.generated_at = TIMESTAMP;
  evidenceFacts.generated_from_phase = PHASE;
  writeFileSync(join(PROJECT_ROOT, 'data', 'public_evidence_facts.json'), JSON.stringify(evidenceFacts, null, 2) + '\n', 'utf8');
  console.log(`  Written: public_evidence_facts.json (${allFacts.length} facts)`);

  // Update database
  writeFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log(`  Written: stihl_database.json (${modelArray.length} models)`);

  // Update baseline manifest
  const factsHashAfter = sha256(JSON.stringify(evidenceFacts));
  const dbHashAfter = sha256(JSON.stringify(db));
  baselineManifest.fact_count = allFacts.length;
  baselineManifest.fact_array_canonical_sha256 = factsHashAfter;
  baselineManifest.canonical_database_sha256 = dbHashAfter;
  baselineManifest.last_updated = TIMESTAMP;
  baselineManifest.phase = PHASE;
  writeFileSync(join(PROJECT_ROOT, 'data', 'public_evidence_baseline_manifest.json'), JSON.stringify(baselineManifest, null, 2) + '\n', 'utf8');
  console.log(`  Written: public_evidence_baseline_manifest.json`);
} else {
  console.log('\n--- DRY RUN: No files written ---');
}

// --- SHA256 after ---
const factsHashAfter = sha256(JSON.stringify(evidenceFacts));
const dbHashAfter = sha256(JSON.stringify(db));
console.log(`\nPost-activation SHA256:`);
console.log(`  public_evidence_facts.json: ${factsHashAfter} (changed: ${factsHashBefore !== factsHashAfter})`);
console.log(`  stihl_database.json:        ${dbHashAfter} (changed: ${dbHashBefore !== dbHashAfter})`);

// --- Generate output artifacts ---
console.log('\n--- Generating Output Artifacts ---');

function writeArtifact(name, data) {
  const path = join(PROJECT_ROOT, 'data', name);
  if (EXECUTE) {
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  Written: ${name}`);
  } else {
    console.log(`  Would write: ${name} (${JSON.stringify(data).length} bytes)`);
  }
}

// 1. Ready candidate crosswalk
writeArtifact('phase43b_ready_candidate_crosswalk.json', {
  phase: PHASE,
  title: 'Ready Candidate Crosswalk',
  generated_at: TIMESTAMP,
  total_candidates: readyCandidateCrosswalk.length,
  ready_for_activation: readyCandidateCrosswalk.filter(c => c.ready_for_activation).length,
  already_present: readyCandidateCrosswalk.filter(c => c.disposition === 'ALREADY_PRESENT_EQUIVALENT').length,
  market_variant_blocked: readyCandidateCrosswalk.filter(c => c.market_variant_blocked).length,
  entries: readyCandidateCrosswalk
});

// 2. DATABASE_MISSING crosswalk
writeArtifact('phase43b_database_missing_high_value_crosswalk.json', {
  phase: PHASE,
  title: 'DATABASE_MISSING High Value Crosswalk',
  generated_at: TIMESTAMP,
  explanation: {
    total_database_missing: dbMissingDisposition.entries.length,
    total_high_value_candidates: allCandidates.length,
    discrepancy: allCandidates.length - dbMissingDisposition.entries.length,
    note: `${dbMissingDisposition.entries.length} DATABASE_MISSING entries vs ${allCandidates.length} high_value candidates. ` +
          `${dbMissingDisposition.entries.length - dbMissingOnly.length} DATABASE_MISSING entries overlap with high_value_review. ` +
          `${dbMissingOnly.length} DATABASE_MISSING entries excluded from high_value_review (FS 38 sound/vibration, MS 261 oil/fuel). ` +
          `${highValueOnly.length} high_value candidates not in DATABASE_MISSING (ALREADY_PRESENT_EQUIVALENT: SR 430, SR 450, FS 38 displacement/power/weight/fuel).`
  },
  database_missing_in_high_value: dbMissingDisposition.entries.length - dbMissingOnly.length,
  database_missing_not_in_high_value: dbMissingOnly.length,
  high_value_not_in_database_missing: highValueOnly.length,
  database_missing_only_entries: dbMissingOnly.map(e => ({
    model_name: e.model_name,
    model_slug: e.model_slug,
    field: e.field,
    raw_value: e.raw_value,
    reason: 'Excluded from high_value_candidate_review'
  })),
  entries: dbMissingCrosswalk
});

// 3. Model field delta
writeArtifact('phase43b_model_field_delta.json', {
  phase: PHASE,
  title: 'Model Field Delta',
  generated_at: TIMESTAMP,
  total_fields_updated: dbFieldUpdates.length,
  updates: dbFieldUpdates
});

// 4. Source activation audit
const sourceAudit = {};
for (const prov of activationProvenance) {
  if (!sourceAudit[prov.source_url]) {
    sourceAudit[prov.source_url] = { facts: [], market: prov.market };
  }
  sourceAudit[prov.source_url].facts.push({
    fact_id: prov.fact_id,
    model_slug: prov.model_slug,
    field: prov.field,
    value: prov.value
  });
}
writeArtifact('phase43b_source_activation_audit.json', {
  phase: PHASE,
  title: 'Source Activation Audit',
  generated_at: TIMESTAMP,
  total_sources: Object.keys(sourceAudit).length,
  sources: sourceAudit
});

// 5. Canonical activation audit
const canonicalAudit = {};
for (const prov of activationProvenance) {
  if (!canonicalAudit[prov.model_slug]) {
    canonicalAudit[prov.model_slug] = { facts: [], model_name: '' };
  }
  canonicalAudit[prov.model_slug].facts.push({
    fact_id: prov.fact_id,
    field: prov.field,
    value: prov.value
  });
  const dbModel = modelBySlug[prov.model_slug];
  if (dbModel) canonicalAudit[prov.model_slug].model_name = dbModel.model_name;
}
writeArtifact('phase43b_canonical_activation_audit.json', {
  phase: PHASE,
  title: 'Canonical Activation Audit',
  generated_at: TIMESTAMP,
  total_models: Object.keys(canonicalAudit).length,
  total_facts: activationProvenance.length,
  models: canonicalAudit
});

// 6. Blocked candidates
const blockedFromVariants = MARKET_VARIANTS.map(v => {
  const dbModel = modelBySlug[v.model_slug];
  return {
    model_name: dbModel ? dbModel.model_name : v.model_slug,
    input_model_slug: null,
    canonical_slug: v.model_slug,
    field: v.field,
    raw_value: v.br_value,
    block_reason: 'MARKET_VARIANT_RISK',
    br_value: v.br_value,
    canonical_value: v.canonical_value,
    block_detail: v.block_reason,
    note: 'Excluded from high_value_candidate_review in Phase 43A; recorded here for completeness'
  };
});

writeArtifact('phase43b_blocked_candidates.json', {
  phase: PHASE,
  title: 'Blocked Candidates',
  generated_at: TIMESTAMP,
  total_blocked: blockedFromVariants.length + alreadyPresentEntries.length,
  categories: {
    market_variant_risk: blockedFromVariants.length,
    already_present: alreadyPresentEntries.length
  },
  market_variants: blockedFromVariants,
  already_present_equivalents: alreadyPresentEntries.map(c => ({
    model_name: c.model_name,
    canonical_slug: c.canonical_slug,
    field: c.field,
    raw_value: c.raw_value,
    reason: 'Value already present in public_evidence_facts.json'
  }))
});

// 7. Public evidence activation
writeArtifact('phase43b_public_evidence_activation.json', {
  phase: PHASE,
  title: 'Public Evidence Activation',
  generated_at: TIMESTAMP,
  facts_before: existingFacts.length,
  facts_added: newFacts.length,
  facts_after: EXECUTE ? existingFacts.length + newFacts.length : existingFacts.length,
  fact_id_integrity: 'PASS',
  activation_provenance: activationProvenance
});

// --- Final report ---
console.log('\n' + '='.repeat(60));
console.log(`PHASE ${PHASE} COMPLETE`);
console.log('='.repeat(60));
console.log(`Candidates reviewed:     ${allCandidates.length}`);
console.log(`Ready for activation:    ${activationEntries.length}`);
console.log(`Already present:         ${alreadyPresentEntries.length}`);
console.log(`Market variant blocked:  ${MARKET_VARIANTS.length} (from market_variant_review)`);
console.log(`DB fields updated:       ${dbFieldUpdates.length}`);
console.log(`New facts generated:     ${newFacts.length}`);
console.log(`Public facts:            ${existingFacts.length} -> ${EXECUTE ? existingFacts.length + newFacts.length : existingFacts.length}`);
console.log(`Models:                  ${modelArray.length} (unchanged)`);
console.log(`Validation issues:       ${validationIssues.length}`);
console.log(`SHA256 facts:            ${factsHashBefore.slice(0, 12)} -> ${factsHashAfter.slice(0, 12)}`);
console.log(`SHA256 db:               ${dbHashBefore.slice(0, 12)} -> ${dbHashAfter.slice(0, 12)}`);
console.log(`Mode:                    ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);

if (validationIssues.length > 0) {
  console.log('\nVALIDATION ISSUES:');
  for (const issue of validationIssues) console.log(`  - ${issue}`);
}

console.log('\nArtifacts:');
console.log('  data/phase43b_ready_candidate_crosswalk.json');
console.log('  data/phase43b_database_missing_high_value_crosswalk.json');
console.log('  data/phase43b_model_field_delta.json');
console.log('  data/phase43b_source_activation_audit.json');
console.log('  data/phase43b_canonical_activation_audit.json');
console.log('  data/phase43b_blocked_candidates.json');
console.log('  data/phase43b_public_evidence_activation.json');
if (EXECUTE) console.log('  data/public_evidence_baseline_manifest.json (updated)');
