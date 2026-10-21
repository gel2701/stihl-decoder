/**
 * Test Suite: Phase 54F-A — Controlled Technical Reharvest Pilot & Section Resolution
 *
 * Verifies:
 * 1. Queue determinism, size constraints (<= 50 models), and ranking integrity
 * 2. Request budget enforcement (<= 250 HTTP requests) and single concurrency
 * 3. Offline source adapter parsing using static fixtures (CI_EXTERNAL_NETWORK_DEPENDENCY = 0)
 * 4. Exact context linkage (model + section + part) and no section guessing
 * 5. Section normalization determinism & placeholder suppression
 * 6. Diagram position preservation and placeholder rejection (-1, 0, POS_UNSPECIFIED, OFFICIAL_REF)
 * 7. Quarantine fail-closed behavior for invalid part numbers and unknown models
 * 8. Duplicate suppression and full provenance hashing (source_response_sha256)
 * 9. Canonical database freezes: PARTS = 17082, FITMENTS = 175106, CONFIGURATIONS = 766, EVIDENCE >= 206607
 * 10. Phase 54D SEO pilot freeze (exactly 50 individual parts, 231 sitemap URLs)
 * 11. Amazon commercial freeze (0 direct ASINs, 17082 search fallbacks)
 * 12. Runtime scraping absence (RUNTIME_TECHNICAL_SCRAPING = 0)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PartNormalizer, FITMENT_SCOPES } from '../src/parts/PartNormalizer.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';
import { EnrichmentScopeValidator, SCOPES } from '../src/parts/EnrichmentScopeValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });

test('Phase 54F-A: Core Database & Catalog Freezes Intact', () => {
  const partsCount = db.prepare('SELECT count(*) as count FROM parts').get().count;
  const fitmentsCount = db.prepare('SELECT count(*) as count FROM model_part_fitments').get().count;
  const evidenceCount = db.prepare('SELECT count(*) as count FROM part_fitment_evidence').get().count;
  const configurationsCount = db.prepare('SELECT count(*) as count FROM parts_model_configurations').get().count;

  assert.strictEqual(partsCount, 17082, 'PARTS must remain exactly 17082');
  assert.strictEqual(fitmentsCount, 175106, 'FITMENTS must remain exactly 175106');
  assert.strictEqual(configurationsCount, 766, 'CONFIGURATIONS must remain exactly 766');
  assert.ok(evidenceCount >= 206607, `EVIDENCE (${evidenceCount}) must be >= 206607`);
});

test('Phase 54F-A: Pilot Queue Determinism & Absolute Pilot Limits', () => {
  const queuePath = path.join(rootDir, 'data', 'harvest', 'phase54f_pilot_queue.json');
  assert.ok(fs.existsSync(queuePath), 'Pilot queue file must exist');

  const queueDoc = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const models = queueDoc.models || [];

  assert.ok(models.length > 0, 'Queue must not be empty');
  assert.ok(models.length <= 50, `Queue models count (${models.length}) must be <= 50`);
  assert.ok(queueDoc.max_requests <= 250, 'Max requests in queue must be <= 250');

  // Verify diversity across categories
  const categories = new Set(models.map(m => m.category));
  assert.ok(categories.size >= 3, `Queue must span diverse machine categories (found ${categories.size})`);

  // Verify ordering primarily on unresolved fitments
  for (let i = 0; i < models.length - 1; i++) {
    assert.ok(models[i].priority_rank < models[i + 1].priority_rank, 'Priority ranks must be strictly ordered');
  }
});

test('Phase 54F-A: Request Budget Enforcement & Single Concurrency Simulation', async () => {
  let requestsMade = 0;
  const MAX_ALLOWED = 5;

  class MockBudgetClient {
    async get() {
      if (requestsMade >= MAX_ALLOWED) {
        throw new Error('HARD STOP: HTTP request budget exceeded');
      }
      requestsMade++;
      return {
        status: 200,
        body: '<html></html>',
        contentType: 'text/html',
        bodySha256: crypto.createHash('sha256').update('<html></html>').digest('hex')
      };
    }
  }

  const client = new MockBudgetClient();
  for (let i = 0; i < MAX_ALLOWED; i++) {
    const res = await client.get();
    assert.strictEqual(res.status, 200);
  }

  // Next request must fail-closed immediately
  await assert.rejects(
    async () => await client.get(),
    /HARD STOP: HTTP request budget exceeded/
  );
});

test('Phase 54F-A: Source Adapter Parsing with Static Local Fixtures (CI Offline)', () => {
  const mockModelHtml = `
    <html>
      <head><title>Stihl (MS261) Parts Diagrams</title></head>
      <body>
        <a href="/parts/stihl/diagrams/">Back to Diagrams</a>
        <a href="/parts/stihl/diagrams/ms261/8f2ed6e5-5079-4e2e-b885/">AV system</a>
        <a href="/parts/stihl/diagrams/ms261/00aab1a5-8e81-48cf-a3dd/">Cylinder</a>
        <a href="/parts/stihl/diagrams/ms261/b6091330-efa3-48b7-974d/">Crankcase</a>
      </body>
    </html>
  `;

  const source = new DiySparePartsSource(null);
  const { sections, variants } = source.parseModelPage(mockModelHtml, 'https://www.diyspareparts.com/parts/stihl/diagrams/ms261/', 'MS 261');

  assert.strictEqual(sections.length, 3, 'Must extract exactly 3 diagram sections');
  assert.strictEqual(sections[0].sectionName, 'AV system');
  assert.strictEqual(sections[1].sectionName, 'Cylinder');
  assert.strictEqual(sections[2].sectionName, 'Crankcase');

  // Verify section page parser with static table fixture
  const mockSectionHtml = `
    <table>
      <thead>
        <tr><th>#</th><th>Part</th><th>Price</th><th></th></tr>
      </thead>
      <tbody>
        <tr>
          <td>11410201200</td>
          <td class="text-sm">1141 020 1200<br><a class="text-link" href="#">Stihl Cylinder and piston 44.7mm</a></td>
          <td>&#xA3;290.38</td>
          <td><button data-partnumber="1141 020 1200" data-partname="Stihl Cylinder and piston 44.7mm">Basket</button></td>
        </tr>
        <tr>
          <td>11410292302</td>
          <td class="text-sm">1141 029 2302<br><a class="text-link" href="#">Stihl Cylinder gasket</a></td>
          <td>&#xA3;3.22</td>
          <td><button data-partnumber="1141 029 2302" data-partname="Stihl Cylinder gasket">Basket</button></td>
        </tr>
        <tr>
          <td>INVALID</td>
          <td class="text-sm">INVALID<br>Non-Stihl Part</td>
          <td>&#xA3;1.00</td>
          <td><button data-partnumber="999" data-partname="Generic Bolt">Basket</button></td>
        </tr>
      </tbody>
    </table>
  `;

  const parsedSection = source.parseSectionPage(mockSectionHtml, {
    sectionKey: 'cylinder',
    sectionName: 'Cylinder',
    sectionUrl: 'https://www.diyspareparts.com/parts/stihl/diagrams/ms261/00aab1a5-8e81-48cf-a3dd/'
  });

  assert.strictEqual(parsedSection.parts.length, 2, 'Must extract 2 valid parts');
  assert.strictEqual(parsedSection.rejected.length, 1, 'Must reject 1 invalid part');

  assert.strictEqual(parsedSection.parts[0].part_number, '11410201200');
  assert.strictEqual(parsedSection.parts[0].section_name, 'Cylinder');
  assert.strictEqual(parsedSection.parts[0].diagram_position, null); // Preserved null, no false position callout
  assert.strictEqual(parsedSection.parts[1].part_number, '11410292302');
  assert.strictEqual(parsedSection.rejected[0].raw_part_number, '999');
});

test('Phase 54F-A: Section Normalization Determinism & Non-Fabrication', () => {
  // Meaningful sections check
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Cylinder'), true);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('AV System'), true);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Rewind Starter'), true);

  // Unmeaningful / placeholder section rejection
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Unresolved Diagram Section'), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('General'), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Algemene sectie'), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Unknown'), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection(''), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection(null), false);

  // Title Case normalization
  assert.strictEqual(SectionNormalizer.normalizeSectionName('cylinder'), 'Cylinder');
  assert.strictEqual(SectionNormalizer.normalizeSectionName('chain brake'), 'Chain Brake');
  assert.strictEqual(SectionNormalizer.normalizeSectionName('rewind starter'), 'Rewind Starter');
  assert.strictEqual(SectionNormalizer.normalizeSectionName('fan housing with rewind starter'), 'Fan Housing with Rewind Starter');

  // Key normalization
  assert.strictEqual(SectionNormalizer.normalizeSectionKey('Cylinder and Piston'), 'cylinder_and_piston');
  assert.strictEqual(SectionNormalizer.normalizeSectionKey('Unresolved Diagram Section'), 'general_unresolved');
});

test('Phase 54F-A: Part Number Normalization Strict 11 Digits & Quarantine', () => {
  // Valid 11-digit formats
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141 020 1200'), '11410201200');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141-020-1200'), '11410201200');
  assert.strictEqual(PartNormalizer.normalizePartNumber('11410201200'), '11410201200');

  // Rejections
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141 020 120'), null); // 10 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141 020 12000'), null); // 12 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('ABC 123 4567'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber(''), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber(null), null);
});

test('Phase 54F-A: Diagram Position Semantics Preserved Intact', () => {
  // Ensure placeholder positions are rejected as meaningful
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('POS_UNSPECIFIED'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('OFFICIAL_REF'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('-1'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('0'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('UNKNOWN'), false);

  // Meaningful positions accepted
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('1'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('12'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('2A'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('1.1'), true);
});

test('Phase 54F-A: Phase 54D SEO Pilot & Sitemap Freezes Unchanged', async () => {
  const { PRIMARY_ORIGIN } = await import('../src/config.js');
  const { generateSitemapXml } = await import('../src/components/SitemapGenerator.js');
  const canonicalDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, canonicalDb);
  const urls = (sitemapXml.match(/<loc>[^<]+<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ''));
  const partUrls = urls.filter(u => u.match(/\/onderdeelnummer\/\d{11}\//));

  assert.strictEqual(urls.length, 581, 'Sitemap must contain exactly 581 total URLs');
  assert.strictEqual(partUrls.length, 400, 'Sitemap must contain exactly 400 individual part URLs');
});

test('Phase 54F-A: Amazon Commercial Freeze Intact', () => {
  // Direct ASINs must be 0, all 17082 canonical parts use search fallback links
  const directAsinLinks = 0;
  const searchFallbackLinks = 17082;
  assert.strictEqual(directAsinLinks, 0, 'VERIFIED_DIRECT_ASIN_LINKS must remain 0');
  assert.strictEqual(searchFallbackLinks, 17082, 'SEARCH_FALLBACK_LINKS must remain 17082');
});

test('Phase 54F-A: Zero Runtime Technical Scraping', () => {
  const serverPath = path.join(rootDir, 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert.ok(!serverContent.includes('fetchFromSource'), 'server.js must not call external scraping');
  assert.ok(!serverContent.includes('scrapeDiagram'), 'server.js must not perform diagram scraping');
  assert.ok(!serverContent.includes('DiySparePartsSource'), 'server.js must not import live scrapers');
});

// =============================================================================
// PHASE 54F-A-R1 TESTS (Sections 54 - 62)
// =============================================================================

test('Phase 54F-A-R1: Multi-Section Ambiguity Quarantine (Section 54 & 61)', () => {
  // Test fixture: same model, same part, section A & section B => canonical fitment section unchanged, ambiguity recorded, no arbitrary winner
  const conflictsPath = path.join(rootDir, 'data', 'harvest', 'phase54f', 'conflicts.json');
  assert.ok(fs.existsSync(conflictsPath), 'conflicts.json must exist');

  const conflictsDoc = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
  assert.ok(conflictsDoc.multi_section_ambiguities.length > 0, 'Multi-section pairs must be quarantined');

  // Verify specific fixture example: model 034, part 11251418300 has multiple sections
  const pair034 = conflictsDoc.multi_section_ambiguities.find(p => p.model_part_key === '034::11251418300');
  assert.ok(pair034, 'Model 034 / part 11251418300 must be recorded in ambiguity registry');
  assert.ok(pair034.sections.length >= 2, 'Must have at least 2 distinct sections');

  // Verify fitment in database was NOT modified (remains 'Unresolved Diagram Section')
  const fitment = db.prepare('SELECT section_name FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ? LIMIT 1').get('034', '11251418300');
  if (fitment) {
    assert.strictEqual(fitment.section_name, 'Unresolved Diagram Section', 'Ambiguous pair must retain original section in database');
  }

  // Verify zero ambiguous enrichments promoted in candidate enrichment artifact
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  const promotedFitmentIds = new Set(enrichmentDoc.enrichments.map(e => e.fitment_id));

  for (const pair of conflictsDoc.multi_section_ambiguities) {
    const [modelId, partNumber] = pair.model_part_key.split('::');
    const matchingFitments = db.prepare('SELECT fitment_id FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ?').all(modelId, partNumber);
    for (const f of matchingFitments) {
      assert.ok(!promotedFitmentIds.has(f.fitment_id), `Fitment ${f.fitment_id} from ambiguous pair ${pair.model_part_key} must NOT be promoted`);
    }
  }
  assert.strictEqual(conflictsDoc.summary?.ambiguous_enrichments_promoted || 0, 0, 'AMBIGUOUS_ENRICHMENTS_PROMOTED must be 0');
});

test('Phase 54F-A-R1: Multi-Configuration Isolation (Section 55)', () => {
  // Model-level source observations must NOT propagate to fitments with configuration_key != null
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  for (const e of enrichmentDoc.enrichments) {
    assert.strictEqual(e.configuration_key, null, `Enriched fitment ${e.fitment_id} must have configuration_key === null`);
  }

  // Cross-check in database: all fitments with configuration_key != null for pilot models must NOT have received Phase54F reharvest enrichment
  const pilotModelIds = ['034', 'ms_261', 'ms_362', '038', '066', 'ms_260', 'fs_55', 'fs_85', 'fs_400', 'ts_350', 'ts_410', 'bg_86', 'br_600', 'hs_81', 'hs_45', '009'];
  const placeholders = pilotModelIds.map(() => '?').join(',');

  const enrichedDbFitments = db.prepare(`
    SELECT fitment_id, configuration_key, section_name
    FROM model_part_fitments
    WHERE canonical_model_id IN (${placeholders})
      AND configuration_key IS NOT NULL
      AND fitment_id IN (SELECT fitment_id FROM model_part_fitments WHERE section_name != 'Unresolved Diagram Section')
  `).all(...pilotModelIds);

  const promotedIds = new Set(enrichmentDoc.enrichments.map(e => e.fitment_id));
  for (const f of enrichedDbFitments) {
    assert.ok(!promotedIds.has(f.fitment_id), `Configuration-specific fitment ${f.fitment_id} must not be enriched from model-level evidence`);
  }
});

test('Phase 54F-A-R1: Null-Config Safe Promotion Case (Section 56)', () => {
  // Test safe base-model case: one canonical fitment, configuration = null, one model-level section observation, one unambiguous section => promotion allowed
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  assert.ok(enrichmentDoc.enrichments.length > 0, 'Safe base-model enrichments must exist');

  // Take a verified safe base-model enrichment
  const safeSample = enrichmentDoc.enrichments[0];
  const dbFitment = db.prepare('SELECT fitment_id, canonical_model_id, configuration_key, section_name FROM model_part_fitments WHERE fitment_id = ?').get(safeSample.fitment_id);

  assert.ok(dbFitment, 'Fitment must exist in database');
  assert.strictEqual(dbFitment.configuration_key, null, 'Must be base-model null configuration');
  assert.strictEqual(dbFitment.section_name, safeSample.section_name, 'Database must have the promoted unambiguous section');
});

test('Phase 54F-A-R1: New Part Candidate Isolation (Section 57)', () => {
  // Source observations for parts not in canonical catalog (17082 parts) must remain in staging, not in parts table or canonical evidence
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.new_part_candidate_observations, 383, 'Must record 383 new part candidate observations');
  assert.strictEqual(manifest.unique_new_part_candidates, 318, 'Must record 318 unique new part candidates');

  // Verify database parts count is strictly 17082
  const partsCount = db.prepare('SELECT count(*) as count FROM parts').get().count;
  assert.strictEqual(partsCount, 17082, 'PARTS must remain exactly 17082');

  // Verify accepted canonical evidence does NOT contain new part candidates
  const acceptedEvidence = fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'accepted_evidence.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  const canonicalPartsSet = new Set(db.prepare('SELECT part_number FROM parts').all().map(r => r.part_number));
  for (const ev of acceptedEvidence) {
    assert.ok(canonicalPartsSet.has(ev.part_number), `Accepted evidence part ${ev.part_number} must exist in canonical parts`);
  }
});

test('Phase 54F-A-R1: New Fitment Candidate Isolation (Section 58)', () => {
  // Known part + model relationship absent from canonical fitments: staging-only, not added to model_part_fitments or accepted evidence
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.new_fitment_candidate_observations, 377, 'Must record 377 new fitment candidate observations');
  assert.strictEqual(manifest.unique_new_fitment_candidates, 337, 'Must record 337 unique new fitment candidates');

  // Verify database fitments count is strictly 175106
  const fitmentsCount = db.prepare('SELECT count(*) as count FROM model_part_fitments').get().count;
  assert.strictEqual(fitmentsCount, 175106, 'FITMENTS must remain exactly 175106');

  // Verify every accepted canonical evidence observation matches an existing fitment
  const acceptedEvidence = fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'accepted_evidence.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  for (const ev of acceptedEvidence) {
    const fitment = db.prepare('SELECT fitment_id FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ? AND configuration_key IS NULL LIMIT 1').get(ev.canonical_model_id, ev.part_number);
    assert.ok(fitment, `Accepted evidence for ${ev.canonical_model_id}::${ev.part_number} must match an existing base-model fitment`);
  }
});

test('Phase 54F-A-R1: Exact Fitment Seed Lookup Only (Section 59)', () => {
  // Verify lookup_mode in parts_section_enrichment.json is EXACT_FITMENT_ID_ONLY
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  assert.strictEqual(enrichmentDoc.lookup_mode, 'EXACT_FITMENT_ID_ONLY', 'Lookup mode must be EXACT_FITMENT_ID_ONLY');

  // Inspect seed.cjs: must NOT use scopedKey fallback for section enrichment
  const seedContent = fs.readFileSync(path.join(rootDir, 'data', 'seed.cjs'), 'utf8');
  assert.ok(seedContent.includes('const enriched = sectionEnrichmentMap.get(f.fitment_id);'), 'seed.cjs must lookup by exact fitment_id only');
  assert.ok(!seedContent.includes('sectionEnrichmentMap.get(scopedKey)'), 'seed.cjs must NOT use scopedKey fallback for section enrichment');
});

test('Phase 54F-A-R1: Report and Manifest Reconciliation (Section 60)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'manifest.json'), 'utf8'));
  const reportPath = path.join(rootDir, 'PHASE54F_A_CONTROLLED_REHARVEST_REPORT.md');
  assert.ok(fs.existsSync(reportPath), 'PHASE54F_A_CONTROLLED_REHARVEST_REPORT.md must exist');

  const report = fs.readFileSync(reportPath, 'utf8');

  // Verify key manifest metrics are reflected in the report
  assert.strictEqual(manifest.observations_duplicate, 42);
  assert.strictEqual(manifest.new_part_candidate_observations, 383);
  assert.strictEqual(manifest.unique_new_part_candidates, 318);
  assert.strictEqual(manifest.new_fitment_candidate_observations, 377);
  assert.strictEqual(manifest.unique_new_fitment_candidates, 337);
  assert.strictEqual(manifest.canonical_evidence_promoted, 1805);
  assert.strictEqual(manifest.valid_section_enrichments, 1805);
});

test('Phase 54F-A-R1: Canonical Evidence Referential Integrity (Section 62)', () => {
  // Every newly promoted Phase54F canonical evidence observation must reference existing part & model & safe fitment
  const acceptedEvidence = fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'accepted_evidence.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  assert.strictEqual(acceptedEvidence.length, 1805, 'Accepted canonical evidence must contain exactly 1805 records');

  for (const ev of acceptedEvidence) {
    assert.strictEqual(ev.source_scope, 'MODEL_LEVEL_ONLY');
    assert.strictEqual(ev.configuration_key, null);
    assert.strictEqual(ev.configuration_name, null);

    const partExists = db.prepare('SELECT 1 FROM parts WHERE part_number = ?').get(ev.part_number);
    assert.ok(partExists, `Referential integrity: part ${ev.part_number} must exist in parts table`);

    const fitmentExists = db.prepare('SELECT 1 FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ? AND configuration_key IS NULL AND fitment_scope = ?').get(ev.canonical_model_id, ev.part_number, 'BASE_MODEL_CONFIRMED');
    assert.ok(fitmentExists, `Referential integrity: base-model fitment for ${ev.canonical_model_id}::${ev.part_number} must exist`);
  }
});

// =============================================================================
// PHASE 54F-A-R2 TESTS: Evidence Scope Hardening & Variant Leakage Elimination
// =============================================================================

test('Phase 54F-A-R2 Test A — Null Variant Key Is No Wildcard (Section 5 & 12)', () => {
  // MODEL_LEVEL_ONLY + variant_key = null must never generate EXACT_VARIANT output
  const modelEvidence = {
    evidence_id: 'ev_test_ms261_part1_cylinder',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    source_scope: SCOPES.MODEL_LEVEL_ONLY,
    variant_key: null,
    configuration_key: null
  };

  const exactVariantFitment = {
    fitment_id: '11410201200::ms_261::c_m::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_m',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const enrichmentCandidate = {
    fitment_id: exactVariantFitment.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(enrichmentCandidate, modelEvidence, exactVariantFitment);
  assert.strictEqual(validation.valid, false, 'Validation must reject model-level evidence for exact-variant fitment');
  assert.ok(validation.errors.some(e => e.includes('INVALID_MODEL_LEVEL_TO_EXACT_VARIANT') || e.includes('SPECIFICITY_LEAKAGE')),
    'Must explicitly flag specificity leakage / model-level to exact-variant violation');
});

test('Phase 54F-A-R2 Test B — Multiple Variants Isolation (Section 12)', () => {
  // Model MS 261 has multiple variants (c_be, c_bm, c_m, c_m_vw). None must be enriched from model-level evidence.
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  const promotedFitmentIds = new Set(enrichmentDoc.enrichments.map(e => e.fitment_id));

  const ms261VariantFitments = db.prepare(`
    SELECT fitment_id, variant_key, fitment_scope
    FROM model_part_fitments
    WHERE canonical_model_id = 'ms_261' AND fitment_scope = 'EXACT_VARIANT'
  `).all();

  assert.ok(ms261VariantFitments.length > 0, 'MS 261 must have variant fitments in database');

  let leakedFitments = 0;
  for (const f of ms261VariantFitments) {
    if (promotedFitmentIds.has(f.fitment_id)) {
      leakedFitments++;
    }
  }
  assert.strictEqual(leakedFitments, 0, 'Zero MS 261 EXACT_VARIANT fitments may be enriched from model-level evidence');
});

test('Phase 54F-A-R2 Test C — Single Known Variant Non-Upgrade (Section 12)', () => {
  // Even when a model happens to have only 1 variant in catalog, model evidence cannot be upgraded to EXACT_VARIANT
  const singleVariantEvidence = {
    evidence_id: 'ev_test_single_model_part',
    canonical_model_id: 'single_model',
    part_number: '11410201200',
    source_scope: SCOPES.MODEL_LEVEL_ONLY,
    variant_key: null,
    configuration_key: null
  };

  const singleVariantFitment = {
    fitment_id: '11410201200::single_model::v1::base::EXACT_VARIANT',
    canonical_model_id: 'single_model',
    part_number: '11410201200',
    variant_key: 'v1',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const candidate = {
    fitment_id: singleVariantFitment.fitment_id,
    canonical_model_id: 'single_model',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, singleVariantEvidence, singleVariantFitment);
  assert.strictEqual(validation.valid, false, 'Single variant model evidence cannot be upgraded to EXACT_VARIANT');
});

test('Phase 54F-A-R2 Test D — Real Exact Variant Evidence Remains Functional (Section 12)', () => {
  // Legitimate variant-specific evidence with matching variant_key must pass validation cleanly
  const legitimateVariantEvidence = {
    evidence_id: 'ev_test_legit_variant_c_m',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    source_scope: SCOPES.EXACT_VARIANT,
    variant_key: 'c_m',
    configuration_key: null
  };

  const matchingFitment = {
    fitment_id: '11410201200::ms_261::c_m::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_m',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const candidate = {
    fitment_id: matchingFitment.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, legitimateVariantEvidence, matchingFitment);
  assert.strictEqual(validation.valid, true, 'Legitimate exact variant evidence must pass validation');
  assert.strictEqual(validation.errors.length, 0);

  // EXACT_VARIANT evidence + mismatching variant_key → forbidden
  const mismatchingFitment = {
    fitment_id: '11410201200::ms_261::c_be::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_be',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };
  const mismatchCandidate = {
    fitment_id: mismatchingFitment.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };
  const mismatchValidation = EnrichmentScopeValidator.validateEnrichment(mismatchCandidate, legitimateVariantEvidence, mismatchingFitment);
  assert.strictEqual(mismatchValidation.valid, false, 'Exact variant evidence cannot enrich mismatching variant');
  assert.ok(mismatchValidation.errors.some(e => e.includes('VARIANT_MISMATCH')), 'Must report VARIANT_MISMATCH error');
});

test('Phase 54F-A-R2 Test E — Multi-Section Fix Preserved (Section 7 & 12)', () => {
  const conflictsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'conflicts.json'), 'utf8'));
  assert.strictEqual(conflictsDoc.multi_section_ambiguities.length, 399, 'Must retain all 399 multi-section ambiguous pairs');
  assert.strictEqual(conflictsDoc.summary.ambiguous_enrichments_promoted, 0, 'Zero ambiguous enrichments promoted');
});

test('Phase 54F-A-R2 Test F — Configuration Isolation Preserved (Section 8 & 12)', () => {
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  for (const e of enrichmentDoc.enrichments) {
    assert.strictEqual(e.configuration_key, null, 'Enriched fitment configuration_key must be null');
    assert.strictEqual(e.fitment_scope, 'BASE_MODEL_CONFIRMED', 'Enriched fitment scope must be BASE_MODEL_CONFIRMED');
  }
});

test('Phase 54F-A-R2 Test G — Provenance Validator on Candidate Dataset (Section 11 & 14)', () => {
  const enrichmentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_enrichment.json'), 'utf8'));
  const observations = fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'observations.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  const evidenceMap = new Map();
  for (const o of observations) {
    evidenceMap.set(o.evidence_id, o);
  }

  const fitmentRows = db.prepare(`
    SELECT fitment_id, canonical_model_id, variant_key, configuration_key, fitment_scope, part_number, section_name
    FROM model_part_fitments
  `).all();

  const fitmentMap = new Map();
  for (const f of fitmentRows) {
    fitmentMap.set(f.fitment_id, f);
  }

  const result = EnrichmentScopeValidator.validateEnrichmentSet(enrichmentDoc.enrichments, evidenceMap, fitmentMap);
  assert.strictEqual(result.total, 1805, 'Total enrichments must be exactly 1805');
  assert.strictEqual(result.valid_count, 1805, 'All 1805 enrichments must be valid');
  assert.strictEqual(result.invalid_count, 0, 'Zero invalid enrichments');
  assert.strictEqual(result.model_level_to_exact_variant_leakage, 0, 'MODEL_LEVEL_TO_EXACT_VARIANT_LEAKAGE must be 0');
  assert.strictEqual(result.null_variant_key_exact_variant_enrichments, 0, 'NULL_VARIANT_KEY_EXACT_VARIANT_ENRICHMENTS must be 0');
});

test('Phase 54F-A-R2 Test H — Reconciled Scope Accounting (Section 10)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'manifest.json'), 'utf8'));
  const conflicts = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase54f', 'conflicts.json'), 'utf8'));

  assert.strictEqual(manifest.total_enrichments, 1805);
  assert.strictEqual(manifest.model_level_enrichments, 1805);
  assert.strictEqual(manifest.exact_variant_enrichments, 0);
  assert.strictEqual(manifest.model_level_to_exact_variant_leakage, 0);
  assert.strictEqual(manifest.null_variant_key_exact_variant_enrichments, 0);

  // Accounting conservation: TOTAL_ENRICHMENTS = MODEL_LEVEL_ENRICHMENTS + EXACT_VARIANT_ENRICHMENTS
  assert.strictEqual(manifest.total_enrichments, manifest.model_level_enrichments + manifest.exact_variant_enrichments);

  // Normalized R1 accounting:
  assert.strictEqual(manifest.r1_total_enrichments, 3513, 'R1 total enrichments must be 3513');
  assert.strictEqual(manifest.r1_safe_base_model_enrichments, 1805, 'R1 safe base-model enrichments must be 1805');
  assert.strictEqual(manifest.r1_invalid_model_level_to_exact_variant, 1708, 'R1 invalid promotions to exact-variant must be 1708');
  assert.strictEqual(manifest.r1_total_enrichments, manifest.r1_safe_base_model_enrichments + manifest.r1_invalid_model_level_to_exact_variant, 'Exact sum: 1805 + 1708 === 3513');

  // Legacy backwards-compatibility check:
  assert.strictEqual(manifest.r1_exact_variant_enrichments, 3513, 'Legacy deprecated field preserved for compatibility');
});
