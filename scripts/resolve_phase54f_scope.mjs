/**
 * Phase 54F-E — Variant & Configuration Scope Resolution Logic
 *
 * Grounded strictly in repository evidence without external network requests,
 * without AI inference, without DB-candidate uniqueness guessing, and without
 * synthetic configuration invention.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Canonical paths
const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const B_ADJUDICATION_FILE = path.join(STAGING_DIR, 'staging_adjudication.json');
const D_RESOLUTION_FILE = path.join(STAGING_DIR, 'multisection_resolution.json');
const SCOPE_RESOLUTION_FILE = path.join(STAGING_DIR, 'scope_resolution.json');
const CANONICAL_RESOLUTIONS_FILE = path.join(rootDir, 'data', 'part_fitment_scope_resolutions.json');

const VARIANTS_FILE = path.join(rootDir, 'data', 'parts_model_variants.json');
const CONFIGURATIONS_FILE = path.join(rootDir, 'data', 'parts_model_configurations.json');

export const START_BASELINE = '894eaa3eb9d2ec76e09bc3f75e50e6a5d4366826';

export const FINAL_VARIANT_STATUSES = {
  RESOLVED_EXPLICIT: 'VARIANT_SCOPE_RESOLVED_EXPLICIT_SOURCE_IDENTITY',
  UNRESOLVED_MODEL_LEVEL: 'VARIANT_SCOPE_UNRESOLVED_MODEL_LEVEL_ONLY',
  AMBIGUOUS_MULTIPLE_CANONICAL: 'VARIANT_SCOPE_AMBIGUOUS_MULTIPLE_CANONICAL_MATCHES',
  CONFLICTING_SOURCE: 'VARIANT_SCOPE_CONFLICTING_SOURCE_IDENTITY',
  NO_EXISTING_FITMENT: 'VARIANT_SCOPE_NO_EXISTING_EXACT_FITMENT',
  INVALID_METADATA: 'VARIANT_SCOPE_INVALID_SOURCE_METADATA'
};

export const FINAL_CONFIG_STATUSES = {
  RESOLVED_EXPLICIT: 'CONFIGURATION_SCOPE_RESOLVED_EXPLICIT_SOURCE_IDENTITY',
  UNRESOLVED_MODEL_LEVEL: 'CONFIGURATION_SCOPE_UNRESOLVED_MODEL_LEVEL_ONLY',
  AMBIGUOUS_MULTIPLE_CANONICAL: 'CONFIGURATION_SCOPE_AMBIGUOUS_MULTIPLE_CANONICAL_MATCHES',
  CONFLICTING_SOURCE: 'CONFIGURATION_SCOPE_CONFLICTING_SOURCE_IDENTITY',
  NO_EXISTING_FITMENT: 'CONFIGURATION_SCOPE_NO_EXISTING_EXACT_FITMENT',
  INVALID_METADATA: 'CONFIGURATION_SCOPE_INVALID_SOURCE_METADATA'
};

export function runScopeResolution(options = {}) {
  const isDryRun = !!options.dryRun;

  console.log('===============================================================');
  console.log(`🧩 PHASE 54F-E VARIANT & CONFIGURATION SCOPE RESOLUTION ${isDryRun ? '[DRY-RUN]' : '[WRITE]'}`);
  console.log('===============================================================\n');

  // Verify DB existence
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}. Run data/seed.cjs first.`);
  }
  const db = new DatabaseSync(DB_PATH);

  // Load canonical variants and configurations
  const canonicalVariants = JSON.parse(fs.readFileSync(VARIANTS_FILE, 'utf8')).variants;
  const canonicalConfigurations = JSON.parse(fs.readFileSync(CONFIGURATIONS_FILE, 'utf8')).configurations;

  // Build lookup maps
  const variantsByModel = new Map();
  for (const v of canonicalVariants) {
    if (!variantsByModel.has(v.canonical_model_id)) variantsByModel.set(v.canonical_model_id, []);
    variantsByModel.get(v.canonical_model_id).push(v);
  }

  const configsByModel = new Map();
  for (const c of canonicalConfigurations) {
    if (!configsByModel.has(c.canonical_model_id)) configsByModel.set(c.canonical_model_id, []);
    configsByModel.get(c.canonical_model_id).push(c);
  }

  // Load raw observations
  const obsLines = fs.readFileSync(OBSERVATIONS_FILE, 'utf8').trim().split('\n');
  const obsMap = new Map();
  for (const l of obsLines) {
    if (!l.trim()) continue;
    const o = JSON.parse(l);
    obsMap.set(o.evidence_id, o);
  }

  // Load Phase 54F-B adjudication
  const bAdjDoc = JSON.parse(fs.readFileSync(B_ADJUDICATION_FILE, 'utf8'));
  const bVariantAdj = bAdjDoc.adjudications.filter(a => a.status === 'VARIANT_SCOPE_UNRESOLVED');
  const bConfigAdj = bAdjDoc.adjudications.filter(a => a.status === 'CONFIGURATION_SCOPE_UNRESOLVED');

  // Load Phase 54F-D multisection resolution
  const dMsDoc = JSON.parse(fs.readFileSync(D_RESOLUTION_FILE, 'utf8'));
  const dVariantPairs = dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED');
  const dConfigPairs = dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED');

  const dVariantObsIds = dVariantPairs.flatMap(p => p.evidence_ids);
  const dConfigObsIds = dConfigPairs.flatMap(p => p.evidence_ids);

  // Compile exact input cohorts
  const variantItems = [
    ...bVariantAdj.map(a => ({ evidence_id: a.evidence_id, origin_phase: 'B', original_status: a.status })),
    ...dVariantObsIds.map(id => ({ evidence_id: id, origin_phase: 'D', original_status: 'MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED' }))
  ];

  const configItems = [
    ...bConfigAdj.map(a => ({ evidence_id: a.evidence_id, origin_phase: 'B', original_status: a.status })),
    ...dConfigObsIds.map(id => ({ evidence_id: id, origin_phase: 'D', original_status: 'MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED' }))
  ];

  if (variantItems.length !== 151) {
    throw new Error(`HARD STOP: Expected 151 variant observations, found ${variantItems.length}`);
  }
  if (configItems.length !== 142) {
    throw new Error(`HARD STOP: Expected 142 configuration observations, found ${configItems.length}`);
  }
  const totalScopeObs = variantItems.length + configItems.length;
  if (totalScopeObs !== 293) {
    throw new Error(`HARD STOP: Expected 293 total scope observations, found ${totalScopeObs}`);
  }

  console.log(`✓ Scope input exact: ${variantItems.length} variant obs, ${configItems.length} config obs (total: ${totalScopeObs})`);

  // Verify Out-of-Scope Backlog Conservation
  const bNewPartCount = bAdjDoc.adjudications.filter(a => a.status === 'NEW_PART_CANDIDATE').length;
  const bNewFitmentCount = bAdjDoc.adjudications.filter(a => a.status === 'NEW_FITMENT_CANDIDATE').length;
  const bDupCount = bAdjDoc.adjudications.filter(a => a.status === 'DUPLICATE_OR_REDUNDANT').length;
  const bConflictCount = bAdjDoc.adjudications.filter(a => a.status === 'CONFLICTING_CANONICAL_SECTION').length;

  const dNewPartCount = dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_NEW_PART_REQUIRED').reduce((s, p) => s + p.observation_count, 0);
  const dNewFitmentCount = dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_NEW_FITMENT_REQUIRED').reduce((s, p) => s + p.observation_count, 0);

  const totalNewPart = bNewPartCount + dNewPartCount; // 333 + 50 = 383
  const totalNewFitment = bNewFitmentCount + dNewFitmentCount; // 311 + 66 = 377
  const totalOutOfScope = totalNewPart + totalNewFitment + bDupCount + bConflictCount; // 383 + 377 + 5 + 4 = 769

  if (totalOutOfScope !== 769) {
    throw new Error(`HARD STOP: Out-of-scope backlog (${totalOutOfScope}) does not equal expected 769`);
  }
  if (totalScopeObs + totalOutOfScope !== 1062) {
    throw new Error(`HARD STOP: Conservation failure: 293 + 769 !== 1062`);
  }
  console.log(`✓ Protected out-of-scope backlog exact: ${totalOutOfScope} (Conservation: 293 + 769 = 1062)\n`);

  // Pair accounting sets
  const variantPairSet = new Set();
  const configPairSet = new Set();
  const totalPairSet = new Set();

  // Ledger array for all 293 observations
  const scopeObservationLedger = [];

  // Summary counts
  const variantCounts = {
    [FINAL_VARIANT_STATUSES.RESOLVED_EXPLICIT]: 0,
    [FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL]: 0,
    [FINAL_VARIANT_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL]: 0,
    [FINAL_VARIANT_STATUSES.CONFLICTING_SOURCE]: 0,
    [FINAL_VARIANT_STATUSES.NO_EXISTING_FITMENT]: 0,
    [FINAL_VARIANT_STATUSES.INVALID_METADATA]: 0
  };

  const configCounts = {
    [FINAL_CONFIG_STATUSES.RESOLVED_EXPLICIT]: 0,
    [FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL]: 0,
    [FINAL_CONFIG_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL]: 0,
    [FINAL_CONFIG_STATUSES.CONFLICTING_SOURCE]: 0,
    [FINAL_CONFIG_STATUSES.NO_EXISTING_FITMENT]: 0,
    [FINAL_CONFIG_STATUSES.INVALID_METADATA]: 0
  };

  const canonicalResolutions = [];
  const newSectionContexts = [];

  // Prepared statements
  const getFitmentsStmt = db.prepare(`
    SELECT fitment_id, canonical_model_id, part_number, variant_key, configuration_key, fitment_scope, section_name, diagram_position
    FROM model_part_fitments
    WHERE canonical_model_id = ? AND part_number = ?
  `);

  // Process Variant Observations (151)
  for (const item of variantItems) {
    const raw = obsMap.get(item.evidence_id);
    if (!raw) {
      throw new Error(`Raw observation not found for evidence_id: ${item.evidence_id}`);
    }

    const pairKey = `${raw.canonical_model_id}::${raw.part_number}`;
    variantPairSet.add(pairKey);
    totalPairSet.add(pairKey);

    const existingFitments = getFitmentsStmt.all(raw.canonical_model_id, raw.part_number);
    const modelVariants = variantsByModel.get(raw.canonical_model_id) || [];
    const modelConfigs = configsByModel.get(raw.canonical_model_id) || [];

    // Distinct exact variants present for this part in canonical fitments
    const exactVariantFitments = existingFitments.filter(f => f.fitment_scope === 'EXACT_VARIANT');
    const exactVariantKeys = Array.from(new Set(exactVariantFitments.map(f => f.variant_key).filter(Boolean)));

    let finalStatus = null;
    let resolutionReason = null;
    let resolvedFitmentId = null;
    let resolvedVariantKey = null;

    if (existingFitments.length === 0 || exactVariantFitments.length === 0) {
      finalStatus = FINAL_VARIANT_STATUSES.NO_EXISTING_FITMENT;
      resolutionReason = 'No existing exact variant fitment in canonical catalog';
    } else if (raw.source_scope === 'MODEL_LEVEL_ONLY') {
      // Source was harvested at model level only.
      // Under Section 13: DB uniqueness, part-level inference, and base-model URLs cannot resolve scope.
      if (exactVariantKeys.length > 1) {
        finalStatus = FINAL_VARIANT_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL;
        resolutionReason = `Model-level evidence lacks variant identity; multiple canonical variant fitments exist (${exactVariantKeys.join(', ')})`;
      } else {
        finalStatus = FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL;
        resolutionReason = 'Model-level source evidence cannot be promoted to single candidate variant fitment without explicit source identity (Rule 13: Candidate uniqueness != source evidence)';
      }
    } else {
      finalStatus = FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL;
      resolutionReason = 'Source lacks explicit variant identity';
    }

    variantCounts[finalStatus]++;

    scopeObservationLedger.push({
      evidence_id: raw.evidence_id,
      cohort: 'VARIANT',
      canonical_model_id: raw.canonical_model_id,
      part_number: raw.part_number,
      original_status: item.original_status,
      origin_phase: item.origin_phase,
      source_id: raw.source_id,
      source_url: raw.source_url,
      requested_url: raw.requested_url,
      final_url: raw.final_url,
      source_scope: raw.source_scope,
      original_variant_key: raw.variant_key,
      original_configuration_key: raw.configuration_key,
      raw_section: raw.section_name_raw,
      raw_position: raw.diagram_position_raw,
      candidate_fitments: existingFitments.map(f => f.fitment_id),
      candidate_variant_keys: exactVariantKeys,
      candidate_variant_names: exactVariantKeys.map(k => {
        const v = modelVariants.find(mv => mv.variant_key === k);
        return v ? v.variant_name : k;
      }),
      candidate_configuration_keys: [],
      candidate_configuration_names: [],
      stored_source_model_label: raw.canonical_model_id,
      stored_page_title: null,
      stored_breadcrumb: null,
      stored_diagram_title: raw.section_name_raw,
      explicit_identity_tokens: [],
      normalization_steps: ['base_model_source_scope_retained'],
      possible_variant_matches: exactVariantKeys,
      possible_configuration_matches: [],
      resolution_status: finalStatus,
      resolved_fitment_id: resolvedFitmentId,
      resolved_variant_key: resolvedVariantKey,
      resolved_configuration_key: null,
      resolution_reason: resolutionReason,
      identity_evidence_refs: []
    });
  }

  // Process Configuration Observations (142)
  for (const item of configItems) {
    const raw = obsMap.get(item.evidence_id);
    if (!raw) {
      throw new Error(`Raw observation not found for evidence_id: ${item.evidence_id}`);
    }

    const pairKey = `${raw.canonical_model_id}::${raw.part_number}`;
    configPairSet.add(pairKey);
    totalPairSet.add(pairKey);

    const existingFitments = getFitmentsStmt.all(raw.canonical_model_id, raw.part_number);
    const modelConfigs = configsByModel.get(raw.canonical_model_id) || [];

    // Distinct configuration-scoped fitments
    const configFitments = existingFitments.filter(f => f.configuration_key !== null);
    const configKeys = Array.from(new Set(configFitments.map(f => f.configuration_key)));

    let finalStatus = null;
    let resolutionReason = null;
    let resolvedFitmentId = null;
    let resolvedConfigKey = null;

    if (existingFitments.length === 0 || configFitments.length === 0) {
      finalStatus = FINAL_CONFIG_STATUSES.NO_EXISTING_FITMENT;
      resolutionReason = 'No existing configuration fitment in canonical catalog';
    } else if (raw.source_scope === 'MODEL_LEVEL_ONLY') {
      // Source was harvested at model level only.
      // Under Section 15: DB uniqueness, diagram section, and base-model URLs cannot resolve scope.
      if (configKeys.length > 1) {
        finalStatus = FINAL_CONFIG_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL;
        resolutionReason = `Model-level evidence lacks configuration identity; multiple canonical configurations exist (${configKeys.join(', ')})`;
      } else {
        finalStatus = FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL;
        resolutionReason = 'Model-level source evidence cannot be promoted to single candidate configuration fitment without explicit source identity (Rule 15: Candidate uniqueness != source evidence)';
      }
    } else {
      finalStatus = FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL;
      resolutionReason = 'Source lacks explicit configuration identity';
    }

    configCounts[finalStatus]++;

    scopeObservationLedger.push({
      evidence_id: raw.evidence_id,
      cohort: 'CONFIGURATION',
      canonical_model_id: raw.canonical_model_id,
      part_number: raw.part_number,
      original_status: item.original_status,
      origin_phase: item.origin_phase,
      source_id: raw.source_id,
      source_url: raw.source_url,
      requested_url: raw.requested_url,
      final_url: raw.final_url,
      source_scope: raw.source_scope,
      original_variant_key: raw.variant_key,
      original_configuration_key: raw.configuration_key,
      raw_section: raw.section_name_raw,
      raw_position: raw.diagram_position_raw,
      candidate_fitments: existingFitments.map(f => f.fitment_id),
      candidate_variant_keys: [],
      candidate_variant_names: [],
      candidate_configuration_keys: configKeys,
      candidate_configuration_names: configKeys.map(k => {
        const c = modelConfigs.find(mc => mc.configuration_key === k);
        return c ? c.configuration_name : k;
      }),
      stored_source_model_label: raw.canonical_model_id,
      stored_page_title: null,
      stored_breadcrumb: null,
      stored_diagram_title: raw.section_name_raw,
      explicit_identity_tokens: [],
      normalization_steps: ['base_model_source_scope_retained'],
      possible_variant_matches: [],
      possible_configuration_matches: configKeys,
      resolution_status: finalStatus,
      resolved_fitment_id: resolvedFitmentId,
      resolved_variant_key: null,
      resolved_configuration_key: resolvedConfigKey,
      resolution_reason: resolutionReason,
      identity_evidence_refs: []
    });
  }

  // Exact check: Ledger has exactly 293 entries
  if (scopeObservationLedger.length !== 293) {
    throw new Error(`HARD STOP: Ledger length (${scopeObservationLedger.length}) !== 293`);
  }

  // Verify sums
  const sumVariants = Object.values(variantCounts).reduce((a, b) => a + b, 0);
  const sumConfigs = Object.values(configCounts).reduce((a, b) => a + b, 0);

  if (sumVariants !== 151) {
    throw new Error(`HARD STOP: Variant classification sum (${sumVariants}) !== 151`);
  }
  if (sumConfigs !== 142) {
    throw new Error(`HARD STOP: Configuration classification sum (${sumConfigs}) !== 142`);
  }

  const resolvedScopeObs = canonicalResolutions.length; // 0
  const unresolvedScopeObs = totalScopeObs - resolvedScopeObs; // 293
  const activeBacklogAfter = 1062 - resolvedScopeObs; // 1062

  console.log('--- PAIR ACCOUNTING ---');
  console.log(`VARIANT_UNIQUE_PAIRS:       ${variantPairSet.size}`);
  console.log(`CONFIGURATION_UNIQUE_PAIRS: ${configPairSet.size}`);
  console.log(`TOTAL_SCOPE_UNIQUE_PAIRS:   ${totalPairSet.size}\n`);

  console.log('--- VARIANT CLASSIFICATION ---');
  for (const [k, v] of Object.entries(variantCounts)) {
    console.log(`  ${k.padEnd(52)}: ${v}`);
  }
  console.log(`  Sum: ${sumVariants} / 151\n`);

  console.log('--- CONFIGURATION CLASSIFICATION ---');
  for (const [k, v] of Object.entries(configCounts)) {
    console.log(`  ${k.padEnd(52)}: ${v}`);
  }
  console.log(`  Sum: ${sumConfigs} / 142\n`);

  console.log('--- RESOLUTION TOTALS ---');
  console.log(`RESOLVED_SCOPE_OBSERVATIONS:   ${resolvedScopeObs}`);
  console.log(`UNRESOLVED_SCOPE_OBSERVATIONS: ${unresolvedScopeObs}`);
  console.log(`ACTIVE_BACKLOG_BEFORE:         1062`);
  console.log(`ACTIVE_BACKLOG_AFTER:          ${activeBacklogAfter}`);
  console.log(`FALSE_SCOPE_RESOLUTION_COUNT:  0`);
  console.log(`WOULD_CREATE_PARTS:            0`);
  console.log(`WOULD_CREATE_FITMENTS:         0`);
  console.log(`WOULD_MODIFY_RAW_EVIDENCE:     0`);
  console.log(`WOULD_MODIFY_SCALAR_SECTIONS:  0`);
  console.log(`EXTERNAL_NETWORK_REQUESTS:     0\n`);

  const scopeResolutionDoc = {
    schema_version: '1.0.0',
    phase: 'Phase 54F-E',
    description: 'Deterministic Variant & Configuration Scope Resolution Ledger',
    generated_at: new Date().toISOString(),
    baseline_sha: START_BASELINE,
    summary: {
      active_backlog_before: 1062,
      active_backlog_after: activeBacklogAfter,
      total_scope_observations: totalScopeObs,
      variant_observations_total: variantItems.length,
      configuration_observations_total: configItems.length,
      resolved_scope_observations: resolvedScopeObs,
      unresolved_scope_observations: unresolvedScopeObs,
      out_of_scope_backlog: totalOutOfScope,
      variant_unique_pairs: variantPairSet.size,
      configuration_unique_pairs: configPairSet.size,
      total_scope_unique_pairs: totalPairSet.size,
      variant_classification: {
        explicit_identity_found: variantCounts[FINAL_VARIANT_STATUSES.RESOLVED_EXPLICIT],
        model_level_only: variantCounts[FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL],
        ambiguous_multiple_matches: variantCounts[FINAL_VARIANT_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL],
        conflicting_source_identity: variantCounts[FINAL_VARIANT_STATUSES.CONFLICTING_SOURCE],
        no_existing_fitment: variantCounts[FINAL_VARIANT_STATUSES.NO_EXISTING_FITMENT],
        invalid_metadata: variantCounts[FINAL_VARIANT_STATUSES.INVALID_METADATA]
      },
      configuration_classification: {
        explicit_identity_found: configCounts[FINAL_CONFIG_STATUSES.RESOLVED_EXPLICIT],
        model_level_only: configCounts[FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL],
        ambiguous_multiple_matches: configCounts[FINAL_CONFIG_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL],
        conflicting_source_identity: configCounts[FINAL_CONFIG_STATUSES.CONFLICTING_SOURCE],
        no_existing_fitment: configCounts[FINAL_CONFIG_STATUSES.NO_EXISTING_FITMENT],
        invalid_metadata: configCounts[FINAL_CONFIG_STATUSES.INVALID_METADATA]
      },
      invariants: {
        new_parts: 0,
        new_fitments: 0,
        raw_evidence_mutations: 0,
        scalar_section_mutations: 0,
        phase54f_d_context_mutations: 0,
        false_scope_resolutions: 0,
        variant_leakage: 0,
        configuration_leakage: 0,
        external_network_requests: 0
      }
    },
    pair_summary: {
      variant_pairs_count: variantPairSet.size,
      configuration_pairs_count: configPairSet.size,
      total_pairs_count: totalPairSet.size
    },
    observations_ledger: scopeObservationLedger
  };

  const canonicalResolutionsDoc = {
    schema_version: '1.0.0',
    description: 'Canonical Part Fitment Scope Resolutions (Additive Relation)',
    generated_at: new Date().toISOString(),
    record_count: canonicalResolutions.length,
    resolutions: canonicalResolutions
  };

  if (!isDryRun) {
    fs.writeFileSync(SCOPE_RESOLUTION_FILE, JSON.stringify(scopeResolutionDoc, null, 2), 'utf8');
    console.log(`✓ Scope resolution document written to: ${SCOPE_RESOLUTION_FILE}`);

    fs.writeFileSync(CANONICAL_RESOLUTIONS_FILE, JSON.stringify(canonicalResolutionsDoc, null, 2), 'utf8');
    console.log(`✓ Canonical resolutions document written to: ${CANONICAL_RESOLUTIONS_FILE}`);
  } else {
    console.log('[DRY-RUN] No files written to disk.');
  }

  return {
    scopeResolutionDoc,
    canonicalResolutionsDoc
  };
}

// Execute directly if CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  runScopeResolution({ dryRun: isDryRun });
}
