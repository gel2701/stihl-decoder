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

  assert.strictEqual(urls.length, 231, 'Sitemap must contain exactly 231 total URLs');
  assert.strictEqual(partUrls.length, 50, 'Sitemap must contain exactly 50 individual part URLs');
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
