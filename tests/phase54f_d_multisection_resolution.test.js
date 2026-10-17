import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { runMultiSectionResolution } from '../scripts/resolve_phase54f_multisection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');
const RESOLUTION_FILE = path.join(STAGING_DIR, 'multisection_resolution.json');
const CONTEXTS_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const EVIDENCE_ESCALATION_FILE = path.join(STAGING_DIR, 'evidence_escalation.json');

const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

describe('Phase 54F-D — Multi-Section Context Resolution Test Suite', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const resolutionDoc = JSON.parse(fs.readFileSync(RESOLUTION_FILE, 'utf8'));
  const contextsDoc = JSON.parse(fs.readFileSync(CONTEXTS_FILE, 'utf8'));

  it('Test A — Exact Accounting: 399 pairs, 958 observations conserved', () => {
    assert.equal(resolutionDoc.summary.multisection_pairs_total, 399);
    assert.equal(resolutionDoc.summary.multisection_observations_total, 958);
    assert.equal(resolutionDoc.pairs.length, 399);

    const pairClass = resolutionDoc.summary.pair_classification;
    const pairSum = Object.values(pairClass).reduce((a, b) => a + b, 0);
    assert.equal(pairSum, 399);

    const obsDisp = resolutionDoc.summary.observation_disposition;
    const obsSum = Object.values(obsDisp).reduce((a, b) => a + b, 0);
    assert.equal(obsSum, 958);
  });

  it('Test B — Raw Aliases Collapse Contract: alias-matching names map deterministically', () => {
    // Test SectionNormalizer on verified aliases
    const norm1 = SectionNormalizer.normalizeSectionName('Rewind starter');
    const norm2 = SectionNormalizer.normalizeSectionName('rewind Starter');
    assert.equal(norm1, 'Rewind Starter');
    assert.equal(norm2, 'Rewind Starter');

    const key1 = SectionNormalizer.normalizeSectionKey('Rewind starter');
    const key2 = SectionNormalizer.normalizeSectionKey('rewind Starter');
    assert.equal(key1, 'rewind_starter');
    assert.equal(key2, 'rewind_starter');

    assert.equal(resolutionDoc.summary.pair_classification.ALIAS_COLLAPSED_SINGLE_SECTION, 0);
  });

  it('Test C — Legitimate Multi-Section: confirmed base fitment with distinct sections yields contexts without fitment duplication', () => {
    const legPairs = resolutionDoc.pairs.filter(p => p.final_pair_status === 'LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT');
    assert.equal(legPairs.length, 334);

    // Pick sample pair: 034::11251418300
    const sample = legPairs.find(p => p.canonical_model_id === '034' && p.part_number === '11251418300');
    assert.ok(sample);
    assert.equal(sample.has_base_model_fitment, true);
    assert.equal(sample.distinct_normalized_sections, 2);
    assert.equal(sample.observation_count, 2);

    // Verify 2 contexts created for this fitment
    const sampleContexts = resolutionDoc.section_contexts.filter(c => c.canonical_model_id === '034' && c.part_number === '11251418300');
    assert.equal(sampleContexts.length, 2);
    assert.notEqual(sampleContexts[0].section_key, sampleContexts[1].section_key);

    // Verify total fitments in DB remained 175,106 (zero duplication)
    const fitmentsCount = db.prepare('SELECT count(1) as c FROM model_part_fitments').get().c;
    assert.equal(fitmentsCount, 175106);
  });

  it('Test D — Missing Part Isolation: unmasked new-part pairs quarantined with 0 context promotions', () => {
    const unmaskedPartPairs = resolutionDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_NEW_PART_REQUIRED');
    assert.equal(unmaskedPartPairs.length, 24);
    assert.equal(resolutionDoc.summary.unmasked_candidates.newly_unmasked_new_part_pairs, 24);
    assert.equal(resolutionDoc.summary.unmasked_candidates.newly_unmasked_new_part_observations, 50);

    for (const p of unmaskedPartPairs) {
      assert.equal(p.part_exists_canonical, false);
      const contexts = resolutionDoc.section_contexts.filter(c => c.canonical_model_id === p.canonical_model_id && c.part_number === p.part_number);
      assert.equal(contexts.length, 0);
    }
  });

  it('Test E — Missing Fitment Isolation: unmasked new-fitment pairs quarantined with 0 context promotions', () => {
    const unmaskedFitmentPairs = resolutionDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_NEW_FITMENT_REQUIRED');
    assert.equal(unmaskedFitmentPairs.length, 26);
    assert.equal(resolutionDoc.summary.unmasked_candidates.newly_unmasked_new_fitment_pairs, 26);
    assert.equal(resolutionDoc.summary.unmasked_candidates.newly_unmasked_new_fitment_observations, 66);

    for (const p of unmaskedFitmentPairs) {
      assert.equal(p.part_exists_canonical, true);
      assert.equal(p.canonical_fitment_count, 0);
      const contexts = resolutionDoc.section_contexts.filter(c => c.canonical_model_id === p.canonical_model_id && c.part_number === p.part_number);
      assert.equal(contexts.length, 0);
    }
  });

  it('Test F — Exact Variant Leakage Protection: model-level observations do not infer exact-variant contexts', () => {
    const varPairs = resolutionDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED');
    assert.equal(varPairs.length, 7);
    assert.equal(resolutionDoc.summary.observation_disposition.UNRESOLVED_VARIANT_SCOPE, 16);

    for (const p of varPairs) {
      assert.equal(p.has_base_model_fitment, false);
      assert.equal(p.has_exact_variant_fitment, true);
      const contexts = resolutionDoc.section_contexts.filter(c => c.canonical_model_id === p.canonical_model_id && c.part_number === p.part_number);
      assert.equal(contexts.length, 0);
    }
    assert.equal(resolutionDoc.summary.invariants.variant_leakage, 0);
  });

  it('Test G — Configuration Leakage Protection: model-level observations do not infer configuration contexts', () => {
    const cfgPairs = resolutionDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED');
    assert.equal(cfgPairs.length, 8);
    assert.equal(resolutionDoc.summary.observation_disposition.UNRESOLVED_CONFIGURATION_SCOPE, 16);

    for (const p of cfgPairs) {
      assert.equal(p.has_base_model_fitment, false);
      assert.equal(p.has_configuration_specific_fitment, true);
      const contexts = resolutionDoc.section_contexts.filter(c => c.canonical_model_id === p.canonical_model_id && c.part_number === p.part_number);
      assert.equal(contexts.length, 0);
    }
    assert.equal(resolutionDoc.summary.invariants.configuration_leakage, 0);
  });

  it('Test H — Canonical Section Immutability: existing scalar section fields in model_part_fitments are NOT overwritten', () => {
    const unresolvedScalarCount = db.prepare('SELECT count(1) as c FROM model_part_fitments WHERE section_name = \'Unresolved Diagram Section\'').get().c;
    assert.equal(unresolvedScalarCount, 170503);
    assert.equal(resolutionDoc.summary.invariants.scalar_section_mutations, 0);
  });

  it('Test I — True Legitimate Multiplicity: multiplicity preserved non-lossy across distinct sections', () => {
    assert.equal(resolutionDoc.section_contexts.length, 810);
    assert.equal(contextsDoc.record_count, 810);
    assert.equal(contextsDoc.contexts.length, 810);

    const fitmentContextMap = new Map();
    for (const c of resolutionDoc.section_contexts) {
      if (!fitmentContextMap.has(c.fitment_id)) fitmentContextMap.set(c.fitment_id, []);
      fitmentContextMap.get(c.fitment_id).push(c);
    }

    assert.equal(fitmentContextMap.size, 334);
    for (const [fId, ctxList] of fitmentContextMap.entries()) {
      assert.ok(ctxList.length >= 2, `Fitment ${fId} expected at least 2 contexts, got ${ctxList.length}`);
    }
  });

  it('Test J — Idempotency Contract: second resolution run produces 0 diffs and 0 duplicate contexts', () => {
    const rerun = runMultiSectionResolution({ dryRun: true });
    assert.equal(rerun.createdContextsCount, 810);
    assert.equal(rerun.pairClassificationCounts.LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT, 334);
    assert.equal(rerun.observationDispositionCounts.RESOLVED_SECTION_CONTEXT, 810);
  });

  it('Test K — Complete Context Provenance: every context references real source evidence', () => {
    const obsLines = fs.readFileSync(OBSERVATIONS_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const obsMap = new Map(obsLines.map(o => [o.evidence_id, o]));

    for (const c of resolutionDoc.section_contexts) {
      assert.ok(c.source_evidence_id, 'Missing source_evidence_id');
      assert.ok(obsMap.has(c.source_evidence_id), `Unknown evidence_id: ${c.source_evidence_id}`);
      const rawObs = obsMap.get(c.source_evidence_id);
      assert.equal(rawObs.source_url, c.source_url);
      assert.equal(rawObs.part_number, c.part_number);
      assert.equal(rawObs.canonical_model_id, c.canonical_model_id);
    }
  });

  it('Test L — Zero External Network: resolution executes with 0 external network requests', () => {
    assert.equal(resolutionDoc.summary.invariants.external_network_requests, 0);
  });

  it('Test M — Other Staging Untouched: 914 non-multisection staging observations remain immutable', () => {
    const allObsRaw = fs.readFileSync(OBSERVATIONS_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const acceptedObsRaw = fs.readFileSync(ACCEPTED_EVIDENCE_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const acceptedIdsSet = new Set(acceptedObsRaw.map(a => a.evidence_id));
    const currentStaging = allObsRaw.filter(o => !acceptedIdsSet.has(o.evidence_id));

    const pairSectionMap = new Map();
    for (const o of allObsRaw) {
      const key = `${o.canonical_model_id}::${o.part_number}`;
      if (!pairSectionMap.has(key)) pairSectionMap.set(key, new Set());
      pairSectionMap.get(key).add(o.section_key || o.section_name);
    }
    const msKeys = new Set(Array.from(pairSectionMap.entries()).filter(([k, s]) => s.size > 1).map(([k]) => k));
    const outOfScopeObs = currentStaging.filter(o => !msKeys.has(`${o.canonical_model_id}::${o.part_number}`));

    assert.equal(outOfScopeObs.length, 914);
  });

  it('Test N — Phase 54F-A Protection: 1,805 accepted enrichments remain 100% immutable', () => {
    const evHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
    const enrichHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');
    assert.equal(evHash, EXPECTED_ACCEPTED_EVIDENCE_SHA256);
    assert.equal(enrichHash, EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256);
  });

  it('Test O — Phase 54F-C Protection: evidence escalation candidate decisions remain closed and unchanged', () => {
    const p54c = JSON.parse(fs.readFileSync(EVIDENCE_ESCALATION_FILE, 'utf8'));
    assert.equal(p54c.fitment_evidence_summary.total, 311);
    assert.equal(p54c.part_evidence_summary.total, 301);
    assert.equal(p54c.promotion_summary.false_promotions, 0);
  });

  it('Test P — GA4 Regression Gate: direct sitewide GA4 contract remains intact', () => {
    const siteAnalyticsPath = path.join(rootDir, 'src', 'components', 'SiteAnalytics.js');
    const injectorPath = path.join(rootDir, 'src', 'components', 'SiteAnalyticsInjector.js');
    assert.ok(fs.existsSync(siteAnalyticsPath));
    assert.ok(fs.existsSync(injectorPath));

    const injectorContent = fs.readFileSync(injectorPath, 'utf8');
    assert.ok(injectorContent.includes('G-P2V0J69LDX'));
    assert.ok(injectorContent.includes('analytics_storage'));
  });
});
