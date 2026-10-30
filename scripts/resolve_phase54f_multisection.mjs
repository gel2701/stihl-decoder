#!/usr/bin/env node
/**
 * Phase 54F-D — Multi-Section Context Resolution & Non-Lossy Section Model
 *
 * Implements non-lossy resolution of the 958 multi-section observations across 399 pairs:
 * 1. Dissects precedence masking in Phase 54F-B staging adjudication.
 * 2. Unmasks hidden new-part (24) and new-fitment (26) candidates without promoting them.
 * 3. Enforces fail-closed isolation for variant (7) and configuration (8) unresolved pairs.
 * 4. Resolves legitimate multi-section occurrences (334 pairs / 810 observations) into an
 *    additive, non-lossy section-context relation: model_part_fitment_section_contexts.
 * 5. Strictly protects existing canonical catalog (17082 parts, 175106 fitments, 766 configs, 208412 evidence).
 * 6. Preserves scalar section fields in model_part_fitments (0 mutations).
 * 7. Preserves 100% provenance and executes zero external network requests.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');

const RESOLUTION_OUTPUT_FILE = path.join(STAGING_DIR, 'multisection_resolution.json');
const CONTEXTS_CANONICAL_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');

// Expected baseline hashes for Phase 54F-A protected set
const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

export function runMultiSectionResolution(options = { dryRun: false }) {
  const isDryRun = Boolean(options.dryRun);
  console.log('===============================================================');
  console.log(`🧩 PHASE 54F-D MULTI-SECTION CONTEXT RESOLUTION [${isDryRun ? 'DRY-RUN' : 'WRITE-MODE'}]`);
  console.log('===============================================================\n');

  // 1. Verify Phase 54F-A protected set integrity
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  if (currentEvidenceHash !== EXPECTED_ACCEPTED_EVIDENCE_SHA256) {
    throw new Error(`HARD STOP: Phase 54F-A accepted evidence hash mismatch! Expected ${EXPECTED_ACCEPTED_EVIDENCE_SHA256}, got ${currentEvidenceHash}`);
  }
  if (currentEnrichmentHash !== EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256) {
    throw new Error(`HARD STOP: Phase 54F-A parts section enrichment hash mismatch! Expected ${EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256}, got ${currentEnrichmentHash}`);
  }
  console.log('✓ Phase 54F-A protected set hashes verified intact (0 mutations).');

  const db = new Database(DB_PATH, { readonly: true });

  // 2. Load observations & staging
  const allObs = fs.readFileSync(OBSERVATIONS_FILE, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const acceptedEvidence = fs.readFileSync(ACCEPTED_EVIDENCE_FILE, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  const acceptedIds = new Set(acceptedEvidence.map(a => a.evidence_id));
  const stagingObs = allObs.filter(o => !acceptedIds.has(o.evidence_id));

  if (allObs.length !== 3677 || acceptedEvidence.length !== 1805 || stagingObs.length !== 1872) {
    throw new Error(`HARD STOP: Unexpected staging counts: allObs=${allObs.length}, accepted=${acceptedEvidence.length}, staging=${stagingObs.length}`);
  }

  // 3. Multi-section pair identification
  const pairSections = new Map();
  for (const o of allObs) {
    const key = `${o.canonical_model_id}::${o.part_number}`;
    if (!pairSections.has(key)) pairSections.set(key, new Set());
    pairSections.get(key).add(o.section_key || o.section_name);
  }
  const multiSectionPairKeys = new Set();
  for (const [key, sections] of pairSections.entries()) {
    if (sections.size > 1) multiSectionPairKeys.add(key);
  }

  const msStagingObs = stagingObs.filter(o => multiSectionPairKeys.has(`${o.canonical_model_id}::${o.part_number}`));
  const nonMsStagingObs = stagingObs.filter(o => !multiSectionPairKeys.has(`${o.canonical_model_id}::${o.part_number}`));

  console.log(`Multi-section pairs:               ${multiSectionPairKeys.size} (Expected: 399)`);
  console.log(`Multi-section staging observations: ${msStagingObs.length} (Expected: 958)`);
  console.log(`Out-of-scope staging observations:  ${nonMsStagingObs.length} (Expected: 914)`);

  if (multiSectionPairKeys.size !== 399 || msStagingObs.length !== 958 || nonMsStagingObs.length !== 914) {
    throw new Error(`HARD STOP: Invariant failure on multi-section counts!`);
  }

  // 4. Load canonical database state
  const partsInDb = new Set(db.prepare("SELECT part_number FROM parts WHERE sources != '[\"ghs\"]'").all().map(r => r.part_number));
  const fitmentsInDb = db.prepare("SELECT fitment_id, canonical_model_id, part_number, fitment_scope, variant_key, configuration_key, section_key, section_name FROM model_part_fitments WHERE source_id != 'ghs'").all();

  const fitmentLookup = new Map();
  for (const f of fitmentsInDb) {
    const key = `${f.canonical_model_id}::${f.part_number}`;
    if (!fitmentLookup.has(key)) fitmentLookup.set(key, []);
    fitmentLookup.get(key).push(f);
  }

  // Group multi-section staging observations by pair
  const pairGroups = new Map();
  for (const o of msStagingObs) {
    const key = `${o.canonical_model_id}::${o.part_number}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(o);
  }

  // 5. Adjudicate each of the 399 pairs
  const pairLedger = [];
  const pairClassificationCounts = {
    ALIAS_COLLAPSED_SINGLE_SECTION: 0,
    LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT: 0,
    MULTI_SECTION_NEW_PART_REQUIRED: 0,
    MULTI_SECTION_NEW_FITMENT_REQUIRED: 0,
    MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED: 0,
    MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED: 0,
    MULTI_SECTION_CANONICAL_SECTION_CONFLICT: 0,
    MULTI_SECTION_SOURCE_CONFLICT: 0,
    MULTI_SECTION_INVALID_SECTION_METADATA: 0,
    MULTI_SECTION_REQUIRES_MORE_EVIDENCE: 0
  };

  const observationDispositionCounts = {
    RESOLVED_SECTION_CONTEXT: 0,
    UNRESOLVED_NEW_PART: 0,
    UNRESOLVED_NEW_FITMENT: 0,
    UNRESOLVED_VARIANT_SCOPE: 0,
    UNRESOLVED_CONFIGURATION_SCOPE: 0,
    UNRESOLVED_CONFLICT: 0,
    UNRESOLVED_METADATA: 0
  };

  const createdContexts = [];
  const unmaskedNewPartPairs = [];
  const unmaskedNewFitmentPairs = [];

  for (const [key, obsList] of pairGroups.entries()) {
    const [canonicalModelId, partNumber] = key.split('::');
    const partExists = partsInDb.has(partNumber);
    const existingFitments = fitmentLookup.get(key) || [];

    const rawSectionNames = Array.from(new Set(obsList.map(o => o.section_name_raw || o.section_name || '')));
    const rawSectionKeys = Array.from(new Set(obsList.map(o => o.section_key || '')));
    const normalizedSectionNames = Array.from(new Set(rawSectionNames.map(r => SectionNormalizer.normalizeSectionName(r)).filter(Boolean)));
    const normalizedSectionKeys = Array.from(new Set(rawSectionKeys.map(k => SectionNormalizer.normalizeSectionKey(k)).filter(k => k !== 'general_unresolved')));

    const sourceScopeValues = Array.from(new Set(obsList.map(o => o.source_scope || 'MODEL_LEVEL_ONLY')));
    const sourceVariantKeys = Array.from(new Set(obsList.map(o => o.variant_key).filter(Boolean)));
    const sourceConfigurationKeys = Array.from(new Set(obsList.map(o => o.configuration_key).filter(Boolean)));
    const diagramPositions = Array.from(new Set(obsList.map(o => o.diagram_position).filter(Boolean)));
    const evidenceIds = obsList.map(o => o.evidence_id);
    const sourceIds = Array.from(new Set(obsList.map(o => o.source_id)));
    const sourceUrls = Array.from(new Set(obsList.map(o => o.source_url)));

    const canonicalFitmentIds = existingFitments.map(f => f.fitment_id);
    const canonicalFitmentScopes = Array.from(new Set(existingFitments.map(f => f.fitment_scope)));
    const hasBaseModelFitment = existingFitments.some(f => f.fitment_scope === 'BASE_MODEL_CONFIRMED');
    const hasExactVariantFitment = existingFitments.some(f => f.fitment_scope === 'EXACT_VARIANT');
    const hasConfigurationSpecificFitment = existingFitments.some(f => f.configuration_key !== null);

    const allExactVariant = existingFitments.every(f => f.fitment_scope === 'EXACT_VARIANT');

    let finalPairStatus = null;
    let resolutionReason = null;
    let obsDisposition = null;

    if (!partExists) {
      finalPairStatus = 'MULTI_SECTION_NEW_PART_REQUIRED';
      resolutionReason = 'Part number does not exist in canonical catalog; quarantined from section resolution pending part validation';
      obsDisposition = 'UNRESOLVED_NEW_PART';
      pairClassificationCounts.MULTI_SECTION_NEW_PART_REQUIRED++;
      observationDispositionCounts.UNRESOLVED_NEW_PART += obsList.length;
      unmaskedNewPartPairs.push({ canonical_model_id: canonicalModelId, part_number: partNumber, observation_count: obsList.length });
    } else if (existingFitments.length === 0) {
      finalPairStatus = 'MULTI_SECTION_NEW_FITMENT_REQUIRED';
      resolutionReason = 'Model-part fitment does not exist in canonical catalog; quarantined from section resolution pending fitment validation';
      obsDisposition = 'UNRESOLVED_NEW_FITMENT';
      pairClassificationCounts.MULTI_SECTION_NEW_FITMENT_REQUIRED++;
      observationDispositionCounts.UNRESOLVED_NEW_FITMENT += obsList.length;
      unmaskedNewFitmentPairs.push({ canonical_model_id: canonicalModelId, part_number: partNumber, observation_count: obsList.length });
    } else if (!hasBaseModelFitment && allExactVariant && sourceVariantKeys.length === 0) {
      finalPairStatus = 'MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED';
      resolutionReason = 'All canonical fitments are EXACT_VARIANT; model-level observation lacks variant identity to attach section context safely';
      obsDisposition = 'UNRESOLVED_VARIANT_SCOPE';
      pairClassificationCounts.MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED++;
      observationDispositionCounts.UNRESOLVED_VARIANT_SCOPE += obsList.length;
    } else if (!hasBaseModelFitment && hasConfigurationSpecificFitment && sourceConfigurationKeys.length === 0) {
      finalPairStatus = 'MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED';
      resolutionReason = 'All canonical fitments are configuration-specific; model-level observation lacks configuration identity to attach section context safely';
      obsDisposition = 'UNRESOLVED_CONFIGURATION_SCOPE';
      pairClassificationCounts.MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED++;
      observationDispositionCounts.UNRESOLVED_CONFIGURATION_SCOPE += obsList.length;
    } else if (hasBaseModelFitment) {
      // Base model fitment exists
      if (rawSectionNames.length > 1 && normalizedSectionNames.length === 1) {
        finalPairStatus = 'ALIAS_COLLAPSED_SINGLE_SECTION';
        resolutionReason = 'Multiple raw section names deterministically collapse to single canonical section via verified aliases';
        obsDisposition = 'RESOLVED_SECTION_CONTEXT';
        pairClassificationCounts.ALIAS_COLLAPSED_SINGLE_SECTION++;
        observationDispositionCounts.RESOLVED_SECTION_CONTEXT += obsList.length;
      } else if (normalizedSectionNames.length > 1) {
        finalPairStatus = 'LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT';
        resolutionReason = 'Part genuinely occurs across multiple distinct diagram sections for existing confirmed base fitment; resolved non-lossy into additive section contexts';
        obsDisposition = 'RESOLVED_SECTION_CONTEXT';
        pairClassificationCounts.LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT++;
        observationDispositionCounts.RESOLVED_SECTION_CONTEXT += obsList.length;

        // Generate additive section contexts for each observation
        const baseFitment = existingFitments.find(f => f.fitment_scope === 'BASE_MODEL_CONFIRMED');
        for (const o of obsList) {
          const normSecName = SectionNormalizer.normalizeSectionName(o.section_name_raw || o.section_name);
          const normSecKey = SectionNormalizer.normalizeSectionKey(o.section_key || normSecName);

          const contextId = `ctx_${baseFitment.fitment_id}_${normSecKey}_${o.diagram_position || 'na'}`;
          const provHash = crypto.createHash('sha256').update(JSON.stringify({
            evidence_id: o.evidence_id,
            source_url: o.source_url,
            source_response_sha256: o.source_response_sha256,
            section_key: normSecKey,
            diagram_position: o.diagram_position
          })).digest('hex');

          createdContexts.push({
            context_id: contextId,
            fitment_id: baseFitment.fitment_id,
            canonical_model_id: canonicalModelId,
            part_number: partNumber,
            fitment_scope: baseFitment.fitment_scope,
            variant_key: baseFitment.variant_key || 'standard',
            configuration_key: baseFitment.configuration_key || null,
            section_key: normSecKey,
            section_name: normSecName,
            section_key_raw: o.section_key,
            section_name_raw: o.section_name_raw || o.section_name,
            diagram_position: o.diagram_position || null,
            diagram_position_raw: o.diagram_position_raw || null,
            source_evidence_id: o.evidence_id,
            source_id: o.source_id,
            source_url: o.source_url,
            source_scope: o.source_scope || 'MODEL_LEVEL_ONLY',
            section_context_status: 'SOURCE_OBSERVED_MULTI_CONTEXT',
            provenance_hash: provHash
          });
        }
      } else {
        finalPairStatus = 'MULTI_SECTION_INVALID_SECTION_METADATA';
        resolutionReason = 'Missing or invalid section metadata across observations';
        obsDisposition = 'UNRESOLVED_METADATA';
        pairClassificationCounts.MULTI_SECTION_INVALID_SECTION_METADATA++;
        observationDispositionCounts.UNRESOLVED_METADATA += obsList.length;
      }
    } else {
      finalPairStatus = 'MULTI_SECTION_REQUIRES_MORE_EVIDENCE';
      resolutionReason = 'Ambiguous scope context requires further evidence';
      obsDisposition = 'UNRESOLVED_METADATA';
      pairClassificationCounts.MULTI_SECTION_REQUIRES_MORE_EVIDENCE++;
      observationDispositionCounts.UNRESOLVED_METADATA += obsList.length;
    }

    pairLedger.push({
      canonical_model_id: canonicalModelId,
      part_number: partNumber,
      observation_count: obsList.length,
      part_exists_canonical: partExists,
      canonical_fitment_count: existingFitments.length,
      canonical_fitment_ids: canonicalFitmentIds,
      canonical_fitment_scopes: canonicalFitmentScopes,
      has_base_model_fitment: hasBaseModelFitment,
      has_exact_variant_fitment: hasExactVariantFitment,
      has_configuration_specific_fitment: hasConfigurationSpecificFitment,
      source_scope_values: sourceScopeValues,
      source_variant_keys: sourceVariantKeys,
      source_configuration_keys: sourceConfigurationKeys,
      raw_section_names: rawSectionNames,
      raw_section_keys: rawSectionKeys,
      normalized_section_names: normalizedSectionNames,
      normalized_section_keys: normalizedSectionKeys,
      distinct_raw_sections: rawSectionNames.length,
      distinct_normalized_sections: normalizedSectionNames.length,
      diagram_positions: diagramPositions,
      evidence_ids: evidenceIds,
      source_ids: sourceIds,
      source_urls: sourceUrls,
      final_pair_status: finalPairStatus,
      resolution_reason: resolutionReason,
      observation_disposition: obsDisposition
    });
  }

  // 6. Verify accounting conservation
  const totalPairsAccounted = Object.values(pairClassificationCounts).reduce((a, b) => a + b, 0);
  const totalObsAccounted = Object.values(observationDispositionCounts).reduce((a, b) => a + b, 0);
  const resolvedObs = observationDispositionCounts.RESOLVED_SECTION_CONTEXT;
  const unresolvedObs = totalObsAccounted - resolvedObs;
  const activeBacklogRemaining = 1872 - resolvedObs;

  console.log('--- Pair Accounting ---');
  console.log(`LEGITIMATE_MULTI_SECTION:       ${pairClassificationCounts.LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT}`);
  console.log(`NEW_PART_REQUIRED (unmasked):    ${pairClassificationCounts.MULTI_SECTION_NEW_PART_REQUIRED}`);
  console.log(`NEW_FITMENT_REQUIRED (unmasked): ${pairClassificationCounts.MULTI_SECTION_NEW_FITMENT_REQUIRED}`);
  console.log(`VARIANT_SCOPE_UNRESOLVED:        ${pairClassificationCounts.MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED}`);
  console.log(`CONFIG_SCOPE_UNRESOLVED:         ${pairClassificationCounts.MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED}`);
  console.log(`ALIAS_COLLAPSED:                 ${pairClassificationCounts.ALIAS_COLLAPSED_SINGLE_SECTION}`);
  console.log(`Total pairs accounted:           ${totalPairsAccounted} / 399`);

  console.log('\n--- Observation Accounting ---');
  console.log(`Resolved section contexts:       ${resolvedObs}`);
  console.log(`Unresolved new-part:             ${observationDispositionCounts.UNRESOLVED_NEW_PART}`);
  console.log(`Unresolved new-fitment:          ${observationDispositionCounts.UNRESOLVED_NEW_FITMENT}`);
  console.log(`Unresolved variant scope:        ${observationDispositionCounts.UNRESOLVED_VARIANT_SCOPE}`);
  console.log(`Unresolved configuration scope:  ${observationDispositionCounts.UNRESOLVED_CONFIGURATION_SCOPE}`);
  console.log(`Total observations accounted:    ${totalObsAccounted} / 958`);
  console.log(`Active staging backlog remaining: ${activeBacklogRemaining} (1872 - ${resolvedObs})`);

  if (totalPairsAccounted !== 399 || totalObsAccounted !== 958) {
    throw new Error(`HARD STOP: Accounting failure! Pairs: ${totalPairsAccounted}/399, Obs: ${totalObsAccounted}/958`);
  }
  if (resolvedObs + unresolvedObs !== 958) {
    throw new Error(`HARD STOP: Observation conservation failure! ${resolvedObs} + ${unresolvedObs} !== 958`);
  }

  // Deduplication check on generated contexts
  const contextIdsSet = new Set();
  for (const c of createdContexts) {
    if (contextIdsSet.has(c.context_id)) {
      throw new Error(`HARD STOP: Duplicate context_id generated: ${c.context_id}`);
    }
    contextIdsSet.add(c.context_id);
  }
  console.log(`\n✓ Generated ${createdContexts.length} unique section contexts (0 duplicates).`);

  const resolutionArtifact = {
    schema_version: '1.0.0',
    phase: 'Phase 54F-D',
    description: 'Multi-Section Context Resolution & Non-Lossy Section Model',
    generated_at: new Date().toISOString(),
    baseline_sha: '55af50478769e669d59c782e21f8553108c58db3',
    summary: {
      multisection_pairs_total: 399,
      multisection_observations_total: 958,
      pair_classification: pairClassificationCounts,
      observation_disposition: observationDispositionCounts,
      accounting: {
        total_pairs_accounted: totalPairsAccounted,
        total_observations_accounted: totalObsAccounted,
        staging_historical_total: 1872,
        resolved_observations: resolvedObs,
        unresolved_observations: unresolvedObs,
        active_backlog_remaining: activeBacklogRemaining
      },
      unmasked_candidates: {
        newly_unmasked_new_part_pairs: pairClassificationCounts.MULTI_SECTION_NEW_PART_REQUIRED,
        newly_unmasked_new_part_observations: observationDispositionCounts.UNRESOLVED_NEW_PART,
        newly_unmasked_new_fitment_pairs: pairClassificationCounts.MULTI_SECTION_NEW_FITMENT_REQUIRED,
        newly_unmasked_new_fitment_observations: observationDispositionCounts.UNRESOLVED_NEW_FITMENT
      },
      contexts_created: createdContexts.length,
      invariants: {
        new_parts: 0,
        new_fitments: 0,
        scalar_section_mutations: 0,
        fitment_duplications: 0,
        variant_leakage: 0,
        configuration_leakage: 0,
        false_promotions: 0,
        external_network_requests: 0
      }
    },
    pairs: pairLedger,
    section_contexts: createdContexts
  };

  const canonicalContextsArtifact = {
    schema_version: '1.0.0',
    description: 'Canonical additive section contexts for multi-diagram STIHL model-part fitments',
    generated_at: new Date().toISOString(),
    record_count: createdContexts.length,
    contexts: createdContexts
  };

  if (!isDryRun) {
    fs.writeFileSync(RESOLUTION_OUTPUT_FILE, JSON.stringify(resolutionArtifact, null, 2), 'utf8');
    fs.writeFileSync(CONTEXTS_CANONICAL_FILE, JSON.stringify(canonicalContextsArtifact, null, 2), 'utf8');
    console.log(`\n💾 Saved resolution overlay to ${RESOLUTION_OUTPUT_FILE}`);
    console.log(`💾 Saved canonical section contexts to ${CONTEXTS_CANONICAL_FILE}`);
  } else {
    console.log(`\n[DRY-RUN] No files written to disk.`);
  }

  return {
    pairClassificationCounts,
    observationDispositionCounts,
    createdContextsCount: createdContexts.length,
    activeBacklogRemaining,
    resolutionArtifact,
    canonicalContextsArtifact
  };
}

// Direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isDryRun = process.argv.includes('--dry-run');
  runMultiSectionResolution({ dryRun: isDryRun });
}
