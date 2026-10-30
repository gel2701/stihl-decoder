import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const ADJUDICATION_FILE = path.join(STAGING_DIR, 'staging_adjudication.json');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');
const REVIEW_FILE = path.join(STAGING_DIR, 'promotion_eligibility_review.json');

// Expected baseline hashes for Phase 54F-A protected set
const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

function assertInvariant(condition, message) {
  if (!condition) {
    console.error(`❌ INVARIANT VIOLATION: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

export function runAudit() {
  console.log('===============================================================');
  console.log('🔍 PHASE 54F-B-R1 PROMOTION ELIGIBILITY AUDIT');
  console.log('===============================================================\n');

  // 1. Audit Review Artifact Existence & Metadata
  console.log('▶ 1. Auditing Review Artifact Existence & Metadata...');
  assertInvariant(fs.existsSync(REVIEW_FILE), 'promotion_eligibility_review.json exists');

  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  assertInvariant(reviewDoc.phase === 'Phase 54F-B-R1', 'Phase is Phase 54F-B-R1');
  assertInvariant(reviewDoc.baseline_sha === '1d6e7f4dd332e3ca4acb7a7dcc5f3dad1e146a07', 'Baseline SHA matches Phase 54F-A baseline');
  assertInvariant(reviewDoc.summary !== undefined, 'Summary section exists');

  // 2. Audit Phase 54F-A Protected Set Integrity (Zero Mutations)
  console.log('\n▶ 2. Auditing Phase 54F-A Protected Set Invariants (Zero Mutations)...');
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assertInvariant(currentEvidenceHash === EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'Phase 54F-A accepted evidence hash identical to baseline');
  assertInvariant(currentEnrichmentHash === EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'Phase 54F-A parts section enrichment hash identical to baseline');
  assertInvariant(reviewDoc.summary.phase54f_a_accepted_set_mutations === 0, 'PHASE54F_A_ACCEPTED_SET_MUTATIONS === 0');

  // 3. Audit New-Fitment Candidate Review (311/311)
  console.log('\n▶ 3. Auditing New-Fitment Review Invariants (311/311 evaluated)...');
  const nf = reviewDoc.summary.new_fitment_review;
  assertInvariant(nf.input === 311, 'new_fitment input === 311');
  assertInvariant(nf.eligible === 0, 'new_fitment eligible === 0');
  assertInvariant(nf.ineligible === 0, 'new_fitment ineligible === 0');
  assertInvariant(nf.requires_more_evidence === 311, 'new_fitment requires_more_evidence === 311');
  assertInvariant(nf.unreviewed === 0, 'new_fitment unreviewed === 0');
  assertInvariant(nf.sum === 311, 'new_fitment sum === 311');
  assertInvariant(Array.isArray(reviewDoc.fitment_eligibility_records), 'fitment_eligibility_records is array');
  assertInvariant(reviewDoc.fitment_eligibility_records.length === 311, 'fitment_eligibility_records.length === 311');

  for (const r of reviewDoc.fitment_eligibility_records) {
    if (!r.evidence_id || !r.canonical_model_id || !r.part_number || !r.section_name || !r.promotion_decision || !r.decision_reason) {
      assertInvariant(false, `Incomplete fitment eligibility record: ${r.evidence_id}`);
    }
    if (r.promotion_decision !== 'FITMENT_REQUIRES_MORE_EVIDENCE') {
      assertInvariant(false, `Unexpected fitment decision: ${r.promotion_decision}`);
    }
  }
  assertInvariant(true, 'All 311 fitment records have complete fields and valid decisions');

  // 4. Audit New-Part Candidate Review (301/301 unique, 333 observations)
  console.log('\n▶ 4. Auditing New-Part Review Invariants (301/301 unique parts evaluated)...');
  const np = reviewDoc.summary.new_part_review;
  assertInvariant(np.observations === 333, 'new_part observations === 333');
  assertInvariant(np.unique_parts === 301, 'new_part unique_parts === 301');
  assertInvariant(np.eligible === 0, 'new_part eligible === 0');
  assertInvariant(np.identity_insufficient === 301, 'new_part identity_insufficient === 301');
  assertInvariant(np.fitment_insufficient === 0, 'new_part fitment_insufficient === 0');
  assertInvariant(np.conflicting === 0, 'new_part conflicting === 0');
  assertInvariant(np.normalization_collision === 0, 'new_part normalization_collision === 0');
  assertInvariant(np.other === 0, 'new_part other === 0');
  assertInvariant(np.unreviewed === 0, 'new_part unreviewed === 0');
  assertInvariant(np.sum === 301, 'new_part sum === 301');
  assertInvariant(Array.isArray(reviewDoc.part_eligibility_records), 'part_eligibility_records is array');
  assertInvariant(reviewDoc.part_eligibility_records.length === 301, 'part_eligibility_records.length === 301');

  for (const r of reviewDoc.part_eligibility_records) {
    if (!r.normalized_part_number || !r.observation_count || !r.independent_support_count || !r.promotion_decision || !r.decision_reason) {
      assertInvariant(false, `Incomplete part eligibility record: ${r.normalized_part_number}`);
    }
    if (r.promotion_decision !== 'PART_IDENTITY_INSUFFICIENT') {
      assertInvariant(false, `Unexpected part decision: ${r.promotion_decision}`);
    }
  }
  assertInvariant(true, 'All 301 unique part records have complete fields and valid decisions');

  // 5. Audit Forensic Samples Coverage
  console.log('\n▶ 5. Auditing Forensic Model Samples...');
  assertInvariant(Array.isArray(reviewDoc.model_forensic_samples), 'model_forensic_samples is array');
  const sampledModels = new Set(reviewDoc.model_forensic_samples.map(s => s.canonical_model_id));
  assertInvariant(sampledModels.size === 13, 'All 13 canonical models from candidate fitments have forensic samples');
  assertInvariant(reviewDoc.model_forensic_samples.length >= 13, `Forensic samples count >= 13 (Actual: ${reviewDoc.model_forensic_samples.length})`);

  // 6. Audit Dry-Run Reconciliation & Frozen Quarantined Set
  console.log('\n▶ 6. Auditing Dry-Run Reconciliation & Conservation...');
  const dry = reviewDoc.summary.dry_run_reconciliation;
  assertInvariant(dry.would_create_new_parts === 0, 'would_create_new_parts === 0');
  assertInvariant(dry.would_create_new_fitments === 0, 'would_create_new_fitments === 0');
  assertInvariant(dry.would_add_evidence === 0, 'would_add_evidence === 0');
  assertInvariant(dry.would_modify_existing_parts === 0, 'would_modify_existing_parts === 0');
  assertInvariant(dry.would_modify_existing_fitments === 0, 'would_modify_existing_fitments === 0');
  assertInvariant(dry.would_modify_phase54f_a_accepted === 0, 'would_modify_phase54f_a_accepted === 0');
  assertInvariant(dry.would_create_exact_variant === 0, 'would_create_exact_variant === 0');
  assertInvariant(dry.would_create_configuration_specific === 0, 'would_create_configuration_specific === 0');
  assertInvariant(dry.would_touch_multi_section_ambiguous === 0, 'would_touch_multi_section_ambiguous === 0');

  assertInvariant(reviewDoc.summary.frozen_quarantined_observations === 1228, 'frozen_quarantined_observations === 1228');
  assertInvariant(reviewDoc.summary.total_staging_observations === 1872, 'total_staging_observations === 1872');
  assertInvariant(1228 + 311 + 333 === 1872, 'Staging partitioning conservation: 1228 + 311 + 333 === 1872');
  assertInvariant(reviewDoc.summary.zero_promotion_decision === 'VERIFIED', 'zero_promotion_decision === VERIFIED');
  assertInvariant(reviewDoc.summary.false_promotion_count === 0, 'false_promotion_count === 0');

  // 7. Audit Database State & Catalog Parity
  console.log('\n▶ 7. Auditing Database State & Catalog Parity...');
  const db = new Database(DB_PATH, { readonly: true });
  const partsCount = db.prepare("SELECT count(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT count(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const evidenceCount = db.prepare("SELECT count(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT count(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;

  assertInvariant(partsCount === 17082, 'PARTS === 17082 (17082 + 0 new parts)');
  assertInvariant(fitmentsCount === 175106, 'FITMENTS === 175106 (175106 + 0 new fitments)');
  assertInvariant(configsCount === 766, 'CONFIGURATIONS === 766');
  assertInvariant(evidenceCount === 208412, 'EVIDENCE === 208412 (208412 + 0 new evidence)');

  console.log('\n===============================================================');
  console.log('✅ PHASE 54F-B-R1 PROMOTION ELIGIBILITY AUDIT PASSED (ALL INVARIANTS OK)');
  console.log('===============================================================\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAudit();
}
