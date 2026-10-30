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
  console.log('🔍 PHASE 54F-B STAGING ADJUDICATION AUDIT');
  console.log('===============================================================\n');

  // 1. Audit Staging Adjudication File Existence & Schema
  console.log('▶ 1. Auditing Adjudication Artifact Existence & Metadata...');
  assertInvariant(fs.existsSync(ADJUDICATION_FILE), 'staging_adjudication.json exists');

  const adjDoc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  assertInvariant(adjDoc.phase === 'Phase 54F-B', 'Phase is Phase 54F-B');
  assertInvariant(adjDoc.baseline_sha === '1d6e7f4dd332e3ca4acb7a7dcc5f3dad1e146a07', 'Baseline SHA matches Phase 54F-A baseline');
  assertInvariant(Array.isArray(adjDoc.adjudications), 'Adjudications array exists');
  assertInvariant(adjDoc.adjudications.length === 1872, 'Adjudications array length === 1872');

  // 2. Audit Phase 54F-A Protected Set Integrity (Zero Mutations)
  console.log('\n▶ 2. Auditing Phase 54F-A Protected Set Invariants (Zero Mutations)...');
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assertInvariant(currentEvidenceHash === EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'Phase 54F-A accepted evidence hash identical to baseline');
  assertInvariant(currentEnrichmentHash === EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'Phase 54F-A parts section enrichment hash identical to baseline');
  assertInvariant(adjDoc.summary.phase54f_a_accepted_set_mutations === 0, 'PHASE54F_A_ACCEPTED_SET_MUTATIONS === 0');

  // 3. Audit Staging Conservation & Exact Accounting
  console.log('\n▶ 3. Auditing Staging Conservation & Category Accounting...');
  const summary = adjDoc.summary;
  assertInvariant(summary.staging_total === 1872, 'staging_total === 1872');
  assertInvariant(summary.promoted_from_staging === 0, 'promoted_from_staging === 0');
  assertInvariant(summary.remaining_staging === 1872, 'remaining_staging === 1872');
  assertInvariant(summary.unclassified === 0, 'unclassified === 0');
  assertInvariant(summary.false_promotion_count === 0, 'false_promotion_count === 0');

  const cats = summary.categories;
  assertInvariant(cats.MULTI_SECTION_AMBIGUOUS === 958, 'MULTI_SECTION_AMBIGUOUS === 958');
  assertInvariant(cats.NEW_PART_CANDIDATE === 333, 'NEW_PART_CANDIDATE === 333');
  assertInvariant(cats.NEW_FITMENT_CANDIDATE === 311, 'NEW_FITMENT_CANDIDATE === 311');
  assertInvariant(cats.VARIANT_SCOPE_UNRESOLVED === 135, 'VARIANT_SCOPE_UNRESOLVED === 135');
  assertInvariant(cats.CONFIGURATION_SCOPE_UNRESOLVED === 126, 'CONFIGURATION_SCOPE_UNRESOLVED === 126');
  assertInvariant(cats.DUPLICATE_OR_REDUNDANT === 5, 'DUPLICATE_OR_REDUNDANT === 5');
  assertInvariant(cats.CONFLICTING_CANONICAL_SECTION === 4, 'CONFLICTING_CANONICAL_SECTION === 4');

  const categorySum = Object.values(cats).reduce((a, b) => a + b, 0);
  assertInvariant(categorySum === 1872, 'Sum of all categories === 1872');
  assertInvariant(summary.promoted_from_staging + summary.remaining_staging === 1872, 'Conservation: 0 + 1872 === 1872');

  // 4. Audit Provenance Completeness & Cross-Verification against Raw Observations
  console.log('\n▶ 4. Auditing Provenance Completeness...');
  const allObs = fs.readFileSync(OBSERVATIONS_FILE, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const rawObsMap = new Map(allObs.map(o => [o.evidence_id, o]));

  const acceptedLines = fs.readFileSync(ACCEPTED_EVIDENCE_FILE, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const acceptedIds = new Set(acceptedLines.map(a => a.evidence_id));

  let provenanceErrors = 0;
  for (const item of adjDoc.adjudications) {
    if (acceptedIds.has(item.evidence_id)) {
      console.error(`Adjudicated item ${item.evidence_id} was already accepted in Phase 54F-A!`);
      provenanceErrors++;
    }
    const raw = rawObsMap.get(item.evidence_id);
    if (!raw) {
      console.error(`Adjudicated item ${item.evidence_id} not found in raw observations!`);
      provenanceErrors++;
      continue;
    }
    if (raw.canonical_model_id !== item.canonical_model_id ||
        raw.part_number !== item.part_number ||
        raw.section_name !== item.section_name ||
        !item.status ||
        !item.reason) {
      console.error(`Field mismatch in adjudicated item: ${item.evidence_id}`);
      provenanceErrors++;
    }
  }
  assertInvariant(provenanceErrors === 0, 'Zero provenance errors across all 1872 adjudicated items');

  // 5. Audit Scope Integrity & Zero-Leakage Freezes
  console.log('\n▶ 5. Auditing Scope Integrity & Zero-Leakage...');
  const dryRun = adjDoc.dry_run_report;
  assertInvariant(dryRun.would_modify_existing_accepted_54f_a === 0, 'would_modify_existing_accepted_54f_a === 0');
  assertInvariant(dryRun.invalid_model_to_exact_variant === 0, 'invalid_model_to_exact_variant === 0');
  assertInvariant(dryRun.null_variant_key_exact_variant === 0, 'null_variant_key_exact_variant === 0');
  assertInvariant(dryRun.invalid_configuration_promotion === 0, 'invalid_configuration_promotion === 0');
  assertInvariant(dryRun.ambiguous_multisection_forced === 0, 'ambiguous_multisection_forced === 0');
  assertInvariant(dryRun.would_promote_existing_fitments === 0, 'would_promote_existing_fitments === 0');
  assertInvariant(dryRun.would_create_new_fitments === 0, 'would_create_new_fitments === 0');
  assertInvariant(dryRun.would_create_new_parts === 0, 'would_create_new_parts === 0');
  assertInvariant(dryRun.would_add_evidence === 0, 'would_add_evidence === 0');
  assertInvariant(dryRun.would_remain_staging === 1872, 'would_remain_staging === 1872');

  // 6. Audit Database Invariants & Catalog Parity
  console.log('\n▶ 6. Auditing Database State & Catalog Parity...');
  const db = new Database(DB_PATH, { readonly: true });
  const partsCount = db.prepare("SELECT count(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT count(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const evidenceCount = db.prepare("SELECT count(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT count(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;

  assertInvariant(partsCount === 17082, 'PARTS === 17082 (17082 + 0 new parts)');
  assertInvariant(fitmentsCount === 175106, 'FITMENTS === 175106 (175106 + 0 new fitments)');
  assertInvariant(configsCount === 766, 'CONFIGURATIONS === 766');
  assertInvariant(evidenceCount === 208412, 'EVIDENCE === 208412 (208412 + 0 new evidence)');

  const partsWithMeaningfulSection = db.prepare(`
    SELECT count(DISTINCT part_number) as c
    FROM model_part_fitments
    WHERE source_id != 'ghs' AND section_name NOT IN ('Unresolved Diagram Section', 'General', 'Algemene sectie', 'Unknown', 'N/A')
  `).get().c;
  const fitmentsWithMeaningfulSection = db.prepare(`
    SELECT count(*) as c
    FROM model_part_fitments
    WHERE source_id != 'ghs' AND section_name NOT IN ('Unresolved Diagram Section', 'General', 'Algemene sectie', 'Unknown', 'N/A')
  `).get().c;

  assertInvariant(partsWithMeaningfulSection === 2210, 'PARTS_WITH_MEANINGFUL_SECTION === 2210');
  assertInvariant(fitmentsWithMeaningfulSection === 4603, 'FITMENTS_WITH_MEANINGFUL_SECTION === 4603');

  // 7. Audit Frozen Commercial & SEO Subsystems
  console.log('\n▶ 7. Auditing SEO & Commercial Freezes...');
  const sitemapPath = path.join(rootDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
    const urlMatches = sitemapContent.match(/<loc>/g) || [];
    assertInvariant(urlMatches.length === 231, 'Sitemap URLs preserved at 231');
  }

  console.log('\n===============================================================');
  console.log('✅ PHASE 54F-B STAGING ADJUDICATION AUDIT PASSED (ALL INVARIANTS OK)');
  console.log('===============================================================\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAudit();
}
