/**
 * tests/phase56m_drive_coverage_triage.test.js
 *
 * Phase 56M — Remaining Drive-Type Coverage Triage & Safe Expansion Plan Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  DISABLED_FAMILY_RULES,
  isAttachmentDesignation,
  resolveDriveType
} from '../src/ModelFamilyDriveRegistry.js';

import {
  isProductSchemaType,
  normalizeSchemaType,
  extractPrimaryProductEvidence
} from '../scripts/fetch_official_family_evidence.mjs';

import { buildPhase56mDriveCoverageTriage } from '../scripts/build_phase56m_drive_coverage_triage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56m');

test('Phase 56M: Exact 530 unknown powered candidates baseline & zero attachment leakage', () => {
  const result = buildPhase56mDriveCoverageTriage({ write: false });

  assert.strictEqual(
    result.summary.hard_gates.UNKNOWN_POWERED_CANDIDATES_BASELINE,
    530,
    'Hard Gate: Exactly 530 unknown powered candidates must exist'
  );
  assert.strictEqual(
    result.unknownModels.length,
    530,
    'Unknown models list must contain exactly 530 models'
  );

  // Verify attachment safety: 0 attachments in unknown powered candidates
  assert.strictEqual(
    result.summary.hard_gates.UNKNOWN_SET_CONTAINS_ATTACHMENTS,
    0,
    'Hard Gate: Unknown set must contain zero unpowered attachments'
  );

  for (const m of result.unknownModels) {
    assert.strictEqual(
      isAttachmentDesignation(m.model_name),
      false,
      `Model ${m.model_name} in unknown set must not be an unpowered attachment`
    );
  }
});

test('Phase 56M: Mutually exclusive cause classification covers all 530 models', () => {
  const result = buildPhase56mDriveCoverageTriage({ write: false });
  const causeCounts = result.summary.cause_breakdown;

  const validCategories = [
    'HISTORIC_NUMERIC_MODEL',
    'KNOWN_PREFIX_NO_VERIFIED_RULE',
    'DISABLED_FAMILY_RULE',
    'UNKNOWN_OR_AMBIGUOUS_PREFIX',
    'NON_MACHINE_OR_CATALOG_NOISE',
    'EXPLICIT_DATA_PRESENT_BUT_UNMAPPED',
    'MANUAL_RESEARCH_REQUIRED'
  ];

  let sum = 0;
  for (const cat of validCategories) {
    assert.ok(typeof causeCounts[cat] === 'number', `Count for ${cat} must be a number`);
    sum += causeCounts[cat];
  }

  assert.strictEqual(sum, 530, 'Sum of all category counts must equal exactly 530');
  assert.strictEqual(result.causeClassification.length, 530, 'Each model must have a classification record');

  // Verify every model has exactly one valid category
  const seenModels = new Set();
  for (const c of result.causeClassification) {
    assert.ok(!seenModels.has(c.model_name), `Model ${c.model_name} classified multiple times`);
    seenModels.add(c.model_name);
    assert.ok(validCategories.includes(c.primary_category), `Invalid category ${c.primary_category} for ${c.model_name}`);
    assert.ok(c.cause_reason && c.cause_reason.length > 5, `Missing reason for ${c.model_name}`);
  }
});

test('Phase 56M: Deterministic Top-10 cohort priority ranking formula', () => {
  const result = buildPhase56mDriveCoverageTriage({ write: false });
  const cohorts = result.cohortRanking;

  assert.strictEqual(cohorts.length, 10, 'Must rank exactly 10 cohorts');

  for (let i = 0; i < cohorts.length; i++) {
    const c = cohorts[i];
    assert.strictEqual(c.rank, i + 1, `Cohort ${c.cohort_id} rank must be ${i + 1}`);

    // Verify deterministic formula: priority_score = (impact * 0.40) + (avail * 0.30) + (conf * 0.20) + (cost * 0.10)
    const expectedScore = Number(((c.impact_score * 0.40) + (c.evidence_availability_score * 0.30) + (c.confidence_score * 0.20) + (c.research_cost_score * 0.10)).toFixed(2));
    assert.strictEqual(c.priority_score, expectedScore, `Score mismatch for cohort ${c.cohort_id}`);

    // Verify descending order
    if (i > 0) {
      assert.ok(cohorts[i - 1].priority_score >= c.priority_score, `Cohorts must be sorted descending by priority_score`);
    }
  }
});

test('Phase 56M: Zero unsafe drive promotions and provenance requirement policy', () => {
  const result = buildPhase56mDriveCoverageTriage({ write: false });

  assert.strictEqual(result.quickWins.promotions_count, 0, 'Promotions count in Phase 56M must be 0');
  assert.strictEqual(result.summary.hard_gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.strictEqual(result.summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.strictEqual(result.summary.hard_gates.PROMOTED_WITHOUT_OFFICIAL_EVIDENCE, 0);
  assert.strictEqual(result.summary.hard_gates.FABRICATED_PROVENANCE, 0);

  // Verify that all 145 explicit candidates were held safe_to_activate = false
  assert.ok(result.explicitRecovery.length > 100, 'Must identify explicit recovery candidates');
  assert.strictEqual(result.explicitRecovery.every(c => c.safe_to_activate === false), true, 'All unverified candidates must have safe_to_activate = false');
});

test('Phase 56M: Schema.org Product / ProductModel IRI normalization (Item 19 backlog)', () => {
  // 1. Direct unit tests on normalizeSchemaType
  assert.strictEqual(normalizeSchemaType('https://schema.org/Product'), 'Product');
  assert.strictEqual(normalizeSchemaType('http://schema.org/Product'), 'Product');
  assert.strictEqual(normalizeSchemaType('https://schema.org/ProductModel'), 'ProductModel');
  assert.strictEqual(normalizeSchemaType('http://schema.org/ProductModel'), 'ProductModel');
  assert.strictEqual(normalizeSchemaType('Product'), 'Product');
  assert.strictEqual(normalizeSchemaType('ProductModel'), 'ProductModel');
  assert.strictEqual(normalizeSchemaType('https://schema.org/WebSite'), 'WebSite');

  // 2. isProductSchemaType with simple strings
  assert.strictEqual(isProductSchemaType('Product'), true);
  assert.strictEqual(isProductSchemaType('ProductModel'), true);
  assert.strictEqual(isProductSchemaType('product'), true);

  // 3. isProductSchemaType with fully qualified Schema.org IRIs
  assert.strictEqual(isProductSchemaType('https://schema.org/Product'), true);
  assert.strictEqual(isProductSchemaType('http://schema.org/Product'), true);
  assert.strictEqual(isProductSchemaType('https://schema.org/ProductModel'), true);
  assert.strictEqual(isProductSchemaType('http://schema.org/ProductModel'), true);

  // 4. isProductSchemaType with array @type
  assert.strictEqual(isProductSchemaType(['Thing', 'https://schema.org/Product']), true);
  assert.strictEqual(isProductSchemaType(['https://schema.org/Thing', 'http://schema.org/ProductModel']), true);
  assert.strictEqual(isProductSchemaType(['Thing', 'Product']), true);

  // 5. isProductSchemaType negative cases (non-product entities)
  assert.strictEqual(isProductSchemaType('WebSite'), false);
  assert.strictEqual(isProductSchemaType('https://schema.org/WebSite'), false);
  assert.strictEqual(isProductSchemaType('Organization'), false);
  assert.strictEqual(isProductSchemaType('https://schema.org/Organization'), false);
  assert.strictEqual(isProductSchemaType('Brand'), false);
  assert.strictEqual(isProductSchemaType('BreadcrumbList'), false);
  assert.strictEqual(isProductSchemaType(['WebSite', 'Organization']), false);
  assert.strictEqual(isProductSchemaType(null), false);
  assert.strictEqual(isProductSchemaType(undefined), false);

  // 6. Test HTML extractor with fully qualified Schema.org JSON-LD
  const htmlWithFqSchema = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "https://schema.org/Product",
          "name": "STIHL RE 130 PLUS Hogedrukreiniger",
          "description": "Krachtige elektrische hogedrukreiniger 230 V"
        }
        </script>
      </head>
      <body>
        <h1>RE 130 PLUS</h1>
      </body>
    </html>
  `;
  const extracted = extractPrimaryProductEvidence(htmlWithFqSchema);
  assert.strictEqual(extracted.jsonld_product_name, 'STIHL RE 130 PLUS Hogedrukreiniger');
});

test('Phase 56M: Phase 56L regression freeze & acceptance models integrity', () => {
  const regressionCases = [
    { name: 'MS 211', expectedDrive: DRIVE_TYPES.PETROL, expectedResolution: 'FAMILY_RULE' },
    { name: 'MSA 300', expectedDrive: DRIVE_TYPES.BATTERY, expectedResolution: 'FAMILY_RULE' },
    { name: 'MSE 210', expectedDrive: DRIVE_TYPES.MAINS_ELECTRIC, expectedResolution: 'FAMILY_RULE' },
    { name: 'FS 55', expectedDrive: DRIVE_TYPES.PETROL, expectedResolution: 'FAMILY_RULE' },
    { name: 'FSA 120', expectedDrive: DRIVE_TYPES.BATTERY, expectedResolution: 'FAMILY_RULE' },
    { name: 'TS 420', expectedDrive: DRIVE_TYPES.PETROL, expectedResolution: 'FAMILY_RULE' },
    { name: 'TSA 230', expectedDrive: DRIVE_TYPES.BATTERY, expectedResolution: 'FAMILY_RULE' },
    { name: 'BG 86', expectedDrive: DRIVE_TYPES.PETROL, expectedResolution: 'FAMILY_RULE' },
    { name: 'BG-KM', expectedDrive: DRIVE_TYPES.UNKNOWN, expectedResolution: 'ATTACHMENT_NOT_POWERED' },
    { name: 'FS-KM', expectedDrive: DRIVE_TYPES.UNKNOWN, expectedResolution: 'ATTACHMENT_NOT_POWERED' },
    { name: 'HL-KM', expectedDrive: DRIVE_TYPES.UNKNOWN, expectedResolution: 'ATTACHMENT_NOT_POWERED' },
    { name: 'HT-KM', expectedDrive: DRIVE_TYPES.UNKNOWN, expectedResolution: 'ATTACHMENT_NOT_POWERED' }
  ];

  for (const c of regressionCases) {
    const res = resolveDriveType(c.name);
    assert.strictEqual(res.drive_type, c.expectedDrive, `${c.name} drive type must match`);
    assert.strictEqual(res.resolution, c.expectedResolution, `${c.name} resolution must match`);
  }

  // Explicit model 026
  const numeric026 = resolveDriveType({ model_name: '026', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric026.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric026.resolution, 'EXPLICIT_MODEL');

  // Verify HLE, BGE, SHE PDF evidence rules remain ACTIVE
  for (const fam of ['HLE', 'BGE', 'SHE']) {
    const rule = OFFICIAL_STIHL_FAMILY_RULES[fam];
    assert.ok(rule, `${fam} rule must be present`);
    assert.strictEqual(rule.status, 'ACTIVE');
    assert.strictEqual(rule.pdf_text_extracted, true);
    assert.ok(rule.page_number > 0);
  }
});

test('Phase 56M: Catalog, SEO and Commercial Freezes Intact', () => {
  const db = new Database(path.join(DATA_DIR, 'stihl_database.db'), { readonly: true });
  const partsCount = db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;
  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  assert.strictEqual(partsCount, 17082, 'Canonical parts count must be exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Canonical fitments count must be exactly 175,106');
  assert.strictEqual(configsCount, 766, 'Diagram configurations count must be exactly 766');
  assert.strictEqual(evidenceCount, 208412, 'Evidence ledger count must be exactly 208,412');
  assert.strictEqual(sectionContextsCount, 814, 'Section contexts count must be exactly 814');
});

test('Phase 56M: All 12 required artifacts exist and validate cleanly', () => {
  const expectedArtifacts = [
    'UNKNOWN_POWERED_MODELS.json',
    'UNKNOWN_CAUSE_CLASSIFICATION.json',
    'PREFIX_FREQUENCY_ANALYSIS.json',
    'EXPLICIT_DRIVE_RECOVERY_CANDIDATES.json',
    'FAMILY_RULE_CANDIDATES.json',
    'COHORT_PRIORITY_RANKING.json',
    'SAFE_QUICK_WINS.json',
    'DEFERRED_RESEARCH_BACKLOG.json',
    'COVERAGE_BEFORE_AFTER.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56M_SUMMARY.json',
    'PHASE56M_REPORT.md'
  ];

  for (const artifact of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, artifact);
    assert.ok(fs.existsSync(p), `Artifact ${artifact} must exist in ${OUTPUT_DIR}`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56M_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.outcome_status, 'PASS');
  assert.strictEqual(summary.hard_gates.UNKNOWN_POWERED_CANDIDATES_BASELINE, 530);
  assert.strictEqual(summary.hard_gates.UNKNOWN_SET_CONTAINS_ATTACHMENTS, 0);
  assert.strictEqual(summary.hard_gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.strictEqual(summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.strictEqual(summary.hard_gates.FABRICATED_PROVENANCE, 0);
  assert.strictEqual(summary.hard_gates.EXISTING_PHASE56L_REGRESSIONS, 0);
  assert.strictEqual(summary.hard_gates.CATALOG_FREEZE_INTACT, true);
  assert.strictEqual(summary.hard_gates.PROMOTED_WITHOUT_OFFICIAL_EVIDENCE, 0);

  const coverage = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'COVERAGE_BEFORE_AFTER.json'), 'utf8'));
  assert.strictEqual(coverage.resolved_before, 401);
  assert.strictEqual(coverage.resolved_after, 401);
  assert.strictEqual(coverage.unknown_before, 530);
  assert.strictEqual(coverage.unknown_after, 530);
  assert.strictEqual(coverage.coverage_before_percentage, 43.07);
  assert.strictEqual(coverage.coverage_after_percentage, 43.07);
  assert.strictEqual(coverage.coverage_delta, 0);
});
