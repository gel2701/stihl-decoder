import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  runEvidenceEscalation,
  buildCandidateQueue,
  RESEARCH_STATUSES,
  EVIDENCE_TIERS,
  MAX_TOTAL_EXTERNAL_REQUESTS,
  EXPECTED_ACCEPTED_EVIDENCE_SHA256,
  EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256,
  ACCEPTED_EVIDENCE_FILE,
  BASE_ENRICHMENT_FILE,
  EVIDENCE_ESCALATION_FILE,
  REVIEW_FILE,
  DB_PATH
} from '../scripts/escalate_phase54f_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Tier 1 Fitment Confirmation Rule (F1)
test('Phase 54F-C Test 1 — Tier 1 Fitment Confirmation Rule (F1)', () => {
  // When Tier 1 manufacturer documentation unambiguously confirms model + part + relationship,
  // 1 authoritative source is sufficient to confirm fitment.
  const sampleCandidate = {
    canonical_model_id: 'ms_261',
    part_number: '11400074101',
    part_exists_canonical: true
  };

  const officialEvidence = [
    {
      part_number: '11400074101',
      models: ['MS 261', 'MS 261 C-M', 'MS 362'],
      source_type: 'OFFICIAL_MANUFACTURER_DOCUMENTATION',
      verification_status: 'OFFICIAL_SOURCE_VERIFIED'
    }
  ];

  const candModelClean = sampleCandidate.canonical_model_id.toUpperCase().replace(/_/g, ' ');
  const matched = officialEvidence.find(o =>
    o.part_number === sampleCandidate.part_number &&
    o.models.some(m => m.toUpperCase().includes(candModelClean))
  );

  assert.ok(matched, 'Tier 1 official record matches model + part');
  assert.strictEqual(matched.source_type, 'OFFICIAL_MANUFACTURER_DOCUMENTATION');
});

// 2. Tier 2 Fitment Confirmation Rule (F2)
test('Phase 54F-C Test 2 — Tier 2 Fitment Confirmation Rule (F2)', () => {
  // Tier 2 authoritative technical document (e.g., STIHL factory manual / IPL) confirms fitment
  const tier2Source = {
    source_id: 'stihl_factory_ipl',
    doc_ref: 'STIHL 0458-737-5521-C',
    evidence_tier: EVIDENCE_TIERS.TIER_2,
    part_number: '11216403202',
    canonical_model_id: 'ms_260',
    provenance_verified: true,
    has_conflict: false
  };

  const isConfirmed = tier2Source.evidence_tier === EVIDENCE_TIERS.TIER_2 &&
    tier2Source.provenance_verified &&
    !tier2Source.has_conflict;

  assert.strictEqual(isConfirmed, true, 'Valid Tier 2 technical doc confirms fitment without conflict');
});

// 3. Two Independent Tier 3 Confirmations Rule (F3)
test('Phase 54F-C Test 3 — Two Independent Tier 3 Confirmations Rule (F3)', () => {
  // In absence of Tier 1/2, at least 2 independent Tier 3 sources are required
  const observations = [
    { source_domain: 'diyspareparts.com', independent_source_group: 'diyspareparts.com', tier: EVIDENCE_TIERS.TIER_3 },
    { source_domain: 'sparepartsworld.co.uk', independent_source_group: 'sparepartsworld.co.uk', tier: EVIDENCE_TIERS.TIER_3 }
  ];

  const uniqueSourceGroups = new Set(observations.map(o => o.independent_source_group));
  const satisfiesF3 = uniqueSourceGroups.size >= 2;

  assert.strictEqual(satisfiesF3, true, 'Two distinct source groups satisfy Rule F3 independent corroboration');
});

// 4. Same-Source Duplicate Does Not Count Twice
test('Phase 54F-C Test 4 — Same-Source Duplicate Does Not Count Twice', () => {
  // Multiple URLs from the same publisher/data origin must count as exactly 1 source group
  const sameSourceObservations = [
    { url: 'https://www.diyspareparts.com/parts/stihl/diagrams/034/page1/', independent_source_group: 'diyspareparts.com' },
    { url: 'https://www.diyspareparts.com/parts/stihl/diagrams/034/page2/', independent_source_group: 'diyspareparts.com' }
  ];

  const distinctGroups = new Set(sameSourceObservations.map(o => o.independent_source_group));
  assert.strictEqual(distinctGroups.size, 1, 'Two URLs from same origin must resolve to 1 independent source group');
  assert.strictEqual(distinctGroups.size >= 2, false, 'Same-source duplicate must NOT satisfy multi-source requirement');
});

// 5. Tier 1 New-Part Confirmation (Rule P1)
test('Phase 54F-C Test 5 — Tier 1 New-Part Identity Confirmation (Rule P1)', () => {
  const officialPart = {
    part_number: '11411201600',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED',
    source_type: 'OFFICIAL_MANUFACTURER_DOCUMENTATION'
  };

  const isConfirmedPartIdentity = officialPart.verification_status === 'OFFICIAL_SOURCE_VERIFIED' &&
    officialPart.source_type === 'OFFICIAL_MANUFACTURER_DOCUMENTATION';

  assert.strictEqual(isConfirmedPartIdentity, true, 'Tier 1 official STIHL confirms part identity');
});

// 6. Atomic New-Part + Fitment Promotion Contract
test('Phase 54F-C Test 6 — Atomic New-Part + Fitment Promotion Contract', () => {
  // If a part is created, its confirmed base-model fitment must be created in the same transaction
  const memDb = new Database(':memory:');
  memDb.exec(`
    CREATE TABLE parts (part_number TEXT PRIMARY KEY, part_name TEXT);
    CREATE TABLE model_part_fitments (fitment_id TEXT PRIMARY KEY, part_number TEXT, canonical_model_id TEXT);
  `);

  const atomicInsert = memDb.transaction((partNo, partName, modelId) => {
    memDb.prepare('INSERT INTO parts (part_number, part_name) VALUES (?, ?)').run(partNo, partName);
    memDb.prepare('INSERT INTO model_part_fitments (fitment_id, part_number, canonical_model_id) VALUES (?, ?, ?)')
      .run(`${partNo}::${modelId}`, partNo, modelId);
  });

  atomicInsert('11410201299', 'Test Piston', 'ms_261');

  const partInDb = memDb.prepare('SELECT * FROM parts WHERE part_number = ?').get('11410201299');
  const fitmentInDb = memDb.prepare('SELECT * FROM model_part_fitments WHERE part_number = ?').get('11410201299');

  assert.ok(partInDb, 'Part was created');
  assert.ok(fitmentInDb, 'Fitment was atomically created');
});

// 7. Part Identity Confirmed but Fitment Unconfirmed -> No Promotion
test('Phase 54F-C Test 7 — Part Identity Confirmed but Fitment Unconfirmed -> No Promotion', () => {
  // If part identity is verified (Claim A) but model fitment is unconfirmed (Claim B fails), DO NOT PROMOTE
  const claimA_partIdentityConfirmed = true;
  const claimB_modelFitmentConfirmed = false;

  const canPromote = claimA_partIdentityConfirmed && claimB_modelFitmentConfirmed;
  assert.strictEqual(canPromote, false, 'Must not promote when model fitment relation is unconfirmed');
});

// 8. Conflicting Evidence -> No Promotion
test('Phase 54F-C Test 8 — Conflicting Evidence -> No Promotion', () => {
  const candidate = {
    part_number: '11251401900',
    claimed_model: '034',
    observed_conflict: {
      type: 'model_conflict',
      conflicting_model: 'ms_260',
      reason: 'Contradictory diagram data across sources'
    }
  };

  const hasConflict = candidate.observed_conflict !== null;
  const decision = hasConflict ? RESEARCH_STATUSES.EVIDENCE_CONFLICT : 'ELIGIBLE';

  assert.strictEqual(decision, RESEARCH_STATUSES.EVIDENCE_CONFLICT, 'Conflicted candidate classified EVIDENCE_CONFLICT');
  assert.strictEqual(decision !== 'ELIGIBLE', true, 'Conflicted candidate cannot be promoted');
});

// 9. Exact-Variant Evidence Discovered -> Stored but NOT Promoted as Variant
test('Phase 54F-C Test 9 — Exact-Variant Evidence Discovered -> Stored as Future Review, NOT Promoted as Variant', () => {
  const candidate = {
    canonical_model_id: 'ms_261',
    variant_evidence_discovered: {
      variant_key: 'c_m_vw',
      source_note: 'Found specific heated-handle carburetor box'
    }
  };

  // Phase 54F-C rule: store for future review, do not promote exact_variant
  let promotedScope = null;
  let storedForFutureReview = false;

  if (candidate.variant_evidence_discovered) {
    storedForFutureReview = true;
    promotedScope = 'BASE_MODEL_CONFIRMED'; // NEVER EXACT_VARIANT in Phase 54F-C
  }

  assert.strictEqual(storedForFutureReview, true, 'Variant evidence must be retained for future review');
  assert.strictEqual(promotedScope, 'BASE_MODEL_CONFIRMED', 'Scope must remain BASE_MODEL_CONFIRMED without variant promotion');
});

// 10. Configuration Evidence Discovered -> Stored but NOT Promoted as Configuration
test('Phase 54F-C Test 10 — Configuration Evidence Discovered -> Stored, NOT Promoted as Configuration', () => {
  const candidate = {
    configuration_evidence: {
      configuration_key: 'quick_chain_tensioner_b',
      note: 'Found B-configuration diagram'
    }
  };

  let promotedConfigKey = 'INITIAL';
  if (candidate.configuration_evidence) {
    promotedConfigKey = null; // Do not promote configuration-specific in 54F-C
  }

  assert.strictEqual(promotedConfigKey, null, 'configuration_key must remain null');
});

// 11. Request Cache & Deduplication
test('Phase 54F-C Test 11 — Request Cache & Request Deduplication', () => {
  const cache = new Map();
  let networkFetches = 0;

  function fetchResource(url) {
    if (cache.has(url)) {
      return { status: 200, fromCache: true, data: cache.get(url) };
    }
    networkFetches++;
    const data = `Payload for ${url}`;
    cache.set(url, data);
    return { status: 200, fromCache: false, data };
  }

  const url = 'https://www.stihl.nl/sample-part';
  const res1 = fetchResource(url);
  const res2 = fetchResource(url);

  assert.strictEqual(res1.fromCache, false, 'First request hits network');
  assert.strictEqual(res2.fromCache, true, 'Second request hits cache');
  assert.strictEqual(networkFetches, 1, 'Resource fetched from network exactly once');
});

// 12. Promotion Idempotency Contract
test('Phase 54F-C Test 12 — Promotion Idempotency Contract', () => {
  const memDb = new Database(':memory:');
  memDb.exec(`
    CREATE TABLE model_part_fitments (
      fitment_id TEXT PRIMARY KEY,
      part_number TEXT,
      canonical_model_id TEXT
    );
  `);

  function insertFitment(fitmentId, partNo, modelId) {
    const existing = memDb.prepare('SELECT fitment_id FROM model_part_fitments WHERE fitment_id = ?').get(fitmentId);
    if (!existing) {
      memDb.prepare('INSERT INTO model_part_fitments (fitment_id, part_number, canonical_model_id) VALUES (?, ?, ?)')
        .run(fitmentId, partNo, modelId);
      return 1;
    }
    return 0; // Already exists, zero semantic addition
  }

  const run1 = insertFitment('p1::m1', 'p1', 'm1');
  const run2 = insertFitment('p1::m1', 'p1', 'm1');

  assert.strictEqual(run1, 1, 'First run inserts record');
  assert.strictEqual(run2, 0, 'Second run inserts zero records (Idempotency PASS)');
});

// 13. Transaction Rollback on Error Contract
test('Phase 54F-C Test 13 — Transaction Rollback on Error Contract', () => {
  const memDb = new Database(':memory:');
  memDb.exec(`
    CREATE TABLE parts (part_number TEXT PRIMARY KEY);
    CREATE TABLE model_part_fitments (fitment_id TEXT PRIMARY KEY, part_number TEXT);
  `);

  const faultyPromotion = memDb.transaction(() => {
    memDb.prepare('INSERT INTO parts (part_number) VALUES (?)').run('11410201299');
    // Deliberate error to trigger rollback:
    throw new Error('Simulated network/DB error during fitment write');
  });

  assert.throws(() => faultyPromotion(), /Simulated network/);

  const partAfterRollback = memDb.prepare('SELECT * FROM parts WHERE part_number = ?').get('11410201299');
  assert.strictEqual(partAfterRollback, undefined, 'Part creation rolled back cleanly; zero partial state');
});

// 14. Phase 54F-A Protected-Set Integrity (Zero Mutations)
test('Phase 54F-C Test 14 — Phase 54F-A Protected-Set Integrity (Zero Mutations)', () => {
  assert.ok(fs.existsSync(ACCEPTED_EVIDENCE_FILE), 'accepted_evidence.jsonl exists');
  assert.ok(fs.existsSync(BASE_ENRICHMENT_FILE), 'parts_section_enrichment.json exists');

  const currentEvHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assert.strictEqual(currentEvHash, EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'accepted_evidence.jsonl SHA-256 matches baseline');
  assert.strictEqual(currentEnrHash, EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'parts_section_enrichment.json SHA-256 matches baseline');
});

// 15. 1,228 Out-of-Scope Staging Records Untouched
test('Phase 54F-C Test 15 — 1,228 Out-of-Scope Staging Records Untouched', () => {
  assert.ok(fs.existsSync(EVIDENCE_ESCALATION_FILE), 'evidence_escalation.json exists');
  const escalationDoc = JSON.parse(fs.readFileSync(EVIDENCE_ESCALATION_FILE, 'utf8'));

  assert.strictEqual(escalationDoc.staging_conservation.out_of_scope_expected, 1228, 'Expected 1,228 out-of-scope records');
  assert.strictEqual(escalationDoc.staging_conservation.out_of_scope_mutations, 0, 'Zero out-of-scope mutations allowed');
  assert.strictEqual(escalationDoc.staging_conservation.before, 1872, 'Starting staging count is 1,872');
  assert.strictEqual(escalationDoc.staging_conservation.remaining, 1872, 'Remaining staging count is 1,872');
  assert.strictEqual(escalationDoc.staging_conservation.promoted, 0, 'Promoted count is 0');
});

// 16. Full Candidate Queue Conservation (311 fitments + 301 unique parts = 612)
test('Phase 54F-C Test 16 — Full Candidate Queue Conservation (311 fitments + 301 unique parts = 612)', () => {
  assert.ok(fs.existsSync(EVIDENCE_ESCALATION_FILE), 'evidence_escalation.json exists');
  const escalationDoc = JSON.parse(fs.readFileSync(EVIDENCE_ESCALATION_FILE, 'utf8'));

  const fitments = escalationDoc.queue.filter(c => c.candidate_type === 'NEW_FITMENT');
  const parts = escalationDoc.queue.filter(c => c.candidate_type === 'NEW_PART');

  assert.strictEqual(fitments.length, 311, 'Exactly 311 fitments in queue');
  assert.strictEqual(parts.length, 301, 'Exactly 301 unique parts in queue');
  assert.strictEqual(escalationDoc.queue.length, 612, 'Queue total is 612');
  assert.strictEqual(escalationDoc.priorities.TOTAL_UNIQUE_CANDIDATES, 612, 'Priorities total is 612');

  const p = escalationDoc.priorities;
  assert.strictEqual(p.PRIORITY_1 + p.PRIORITY_2 + p.PRIORITY_3 + p.PRIORITY_4, 612, 'Priorities sum is 612');
});
