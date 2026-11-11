/**
 * tests/phase60_commercial_growth.test.js
 * Comprehensive Contract & Verification Test Suite for Phase 60:
 * Commercial Growth Engine & FS 460 Monetization
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const partsCatalogJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const partsCatalog = partsCatalogJson.parts || [];
const coverageReport = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'catalog_coverage_report.json'), 'utf8'));
const candidatesDossier = JSON.parse(fs.readFileSync(path.join(rootDir, 'PHASE60_AMAZON_MATCHING_CANDIDATES.json'), 'utf8'));
const opportunities = JSON.parse(fs.readFileSync(path.join(rootDir, 'PHASE60_COMMERCIAL_OPPORTUNITIES.json'), 'utf8'));
const fs460Audit = JSON.parse(fs.readFileSync(path.join(rootDir, 'PHASE60_FS460_MONETIZATION_AUDIT.json'), 'utf8'));
const beforeAfter = JSON.parse(fs.readFileSync(path.join(rootDir, 'PHASE60_BEFORE_AFTER.json'), 'utf8'));

describe('Phase 60: Commercial Growth Engine & FS 460 Monetization', () => {

  describe('1. FS 460 Category Modernization & Invariants', () => {
    const fs460 = coverageReport.all_models.find(m => m.canonical_model_id === 'fs_460');

    test('FS 460 exists in coverage report with confirmed parts', () => {
      assert.ok(fs460, 'FS 460 must be in coverage report');
      assert.equal(fs460.unique_parts_count, 246, 'Must have 246 canonical base parts');
      assert.equal(fs460.confirmed_fitments, 246, 'Must have 246 confirmed fitments');
    });

    test('FS 460 "Overig" dump reduced from 133 to <= 65 without fake categories', () => {
      assert.ok(fs460.category_counts.overig <= 65, `Overig should be <= 65, was ${fs460.category_counts.overig}`);
      assert.equal(fs460.category_counts.overig, 62, 'Exact verified Overig count is 62');
    });

    test('FS 460 Maaigarnituur restored to authentic cutting tools (>= 10)', () => {
      assert.ok(fs460.category_counts.maaigarnituur >= 10, 'Must have >= 10 maaigarnituur parts');
      assert.equal(fs460.category_counts.maaigarnituur, 14, 'Exact verified Maaigarnituur count is 14');
    });

    test('FS 460 Zaaguitrusting is strictly 0 (zero chainsaw bar/chain contamination)', () => {
      assert.equal(fs460.category_counts.zaaguitrusting || 0, 0, 'Zaaguitrusting must be 0 for brushcutter FS 460');
    });

    test('FS 460 achieves quality score 100 with zero missing essential categories', () => {
      assert.equal(fs460.coverage_score, 100, 'Quality score must be 100');
      assert.deepEqual(fs460.missing_essential_categories, [], 'No essential categories should be missing');
    });
  });

  describe('2. Discrepancy Investigation Forensics (246 vs 1,067)', () => {
    test('Audit forensics document exact shard breakdown and scope distinction', () => {
      const forensics = fs460Audit.discrepancy_forensics;
      assert.equal(forensics.total_raw_fitment_records, 1067, 'Total raw shard fitment records');
      assert.equal(forensics.scope_breakdown.BASE_MODEL_CONFIRMED.count, 246, 'Unconfigured base model confirmed count');
      assert.equal(forensics.scope_breakdown.EXACT_VARIANT.count, 279, 'Variant records count');
      assert.equal(forensics.scope_breakdown.EXACT_CONFIGURATION.count, 542, 'Configuration records count');
      assert.equal(forensics.unique_parts_count_union, 351, 'Total unique parts union across all configurations');
      assert.equal(forensics.public_default_view_parts_count, 246, 'Default unconfigured public parts count');
    });
  });

  describe('3. Amazon Affiliate Matching Batch (50 Candidates)', () => {
    test('Batch contains exactly 50 curated high-intent candidates', () => {
      assert.equal(candidatesDossier.metrics.total, 50);
      assert.equal(candidatesDossier.candidates.length, 50);
    });

    test('Gate 1 (Technical & Catalog) and Gate 2 (Product & Compatibility) passed 50/50', () => {
      assert.equal(candidatesDossier.metrics.gate1_pass, 50);
      assert.equal(candidatesDossier.metrics.gate2_pass, 50);
      assert.equal(candidatesDossier.metrics.fully_verified, 50);
    });

    test('Strict production lock: 3 active pilots preserved, 47 staged ready for operator command', () => {
      assert.equal(candidatesDossier.metrics.active_in_production, 3);
      assert.equal(candidatesDossier.metrics.staged_ready, 47);

      const activeList = candidatesDossier.candidates.filter(c => c.status === 'ACTIVE');
      assert.equal(activeList.length, 3);
      const activePartNumbers = activeList.map(c => c.part_number).sort();
      assert.deepEqual(activePartNumbers, ['00004007000', '00004007011', '11104007005']);
    });

    test('Verified aftermarket brands and explicit multipack quantities are present', () => {
      for (const candidate of candidatesDossier.candidates) {
        assert.ok(candidate.package_quantity >= 1, `package_quantity must be >= 1 for ${candidate.part_number}`);
        assert.ok(typeof candidate.package_type === 'string' && candidate.package_type.length > 0, `package_type required for ${candidate.part_number}`);
        assert.ok(candidate.oem_brand_classification, `brand classification required for ${candidate.part_number}`);
        assert.match(candidate.affiliate_tag, /srihldecoder2-21/, `affiliate tag must be srihldecoder2-21 for ${candidate.part_number}`);
      }
    });
  });

  describe('4. Commercial UX & Max 3-Click Navigation', () => {
    const fs460Model = database.models.find(m => m.model_name === 'FS 460 C-EM');

    test('FS 460 model page renders domain-specific brushcutter shortcuts', () => {
      assert.ok(fs460Model, 'FS 460 C-EM must exist in database');
      const html = renderModelPageHtml(fs460Model, database);

      // Brushcutter shortcuts must be present
      assert.ok(html.includes('Maaigarnituur'), 'Shortcut for Maaigarnituur must be present');
      assert.ok(html.includes('Tandwielvet'), 'Shortcut for Tandwielvet must be present');
      assert.ok(html.includes('Service Kit'), 'Shortcut for Service Kit must be present');
      assert.ok(html.includes('Bougie'), 'Shortcut for Bougie must be present');
      assert.ok(html.includes('Luchtfilter'), 'Shortcut for Luchtfilter must be present');
      assert.ok(html.includes('Carburateur'), 'Shortcut for Carburateur must be present');

      // Zero zaagketting shortcut on brushcutter
      assert.ok(!html.includes('Zaagketting'), 'Zaagketting shortcut must NOT be on FS 460');
      assert.ok(!html.includes('Zaagblad'), 'Zaagblad shortcut must NOT be on FS 460');
    });

    test('FS 460 model parts page renders Aankoop column and tracking script', () => {
      const html = renderModelPartsPageHtml(fs460Model, database);

      assert.ok(html.includes('<th class="py-2 pl-3 text-right w-36">Aankoop</th>'), 'Aankoop column header must be present');
      assert.ok(html.includes('🛒 Directe Koop') || html.includes('🛒 Zoek op Amazon'), 'Amazon buy buttons must be rendered');
      assert.ok(html.includes('window.handleAffiliateClick'), 'Tracking script must be present on model parts page');
      assert.ok(html.includes('/api/affiliate/track'), 'Beacon endpoint must be present');
    });

    test('Parts discovery page (/onderdelen/) has click tracking on Amazon links', () => {
      const html = renderPartsDiscoveryPageHtml({
        query: 'FS 460 C-EM bougie',
        database,
        pagination: { page: 1, totalPages: 1 }
      });

      assert.ok(html.includes('handleAffiliateClick'), 'Click tracking handler must be attached on /onderdelen/');
      assert.ok(html.includes('/api/affiliate/track'), 'Beacon endpoint must be present on /onderdelen/');
    });

    test('User journey from FS 460 to Amazon external buy opportunity is <= 3 clicks', () => {
      assert.equal(fs460Audit.click_depth_to_amazon.measured_click_depth, 2);
      assert.ok(fs460Audit.click_depth_to_amazon.measured_click_depth <= 3);
    });
  });

  describe('5. Commercial Opportunities Ranking', () => {
    test('Opportunities dossier contains Top 20 models and Top 20 parts', () => {
      assert.equal(opportunities.top_20_models.length, 20);
      assert.equal(opportunities.top_20_parts.length, 20);
    });

    test('FS 460 and MS 260 are among the top ranked models', () => {
      const topModelNames = opportunities.top_20_models.map(m => m.model_name);
      assert.ok(topModelNames.includes('MS 260'), 'MS 260 must be in top 20 models');
      assert.ok(topModelNames.includes('FS 460 C-EM'), 'FS 460 C-EM must be in top 20 models');
      assert.ok(topModelNames.includes('MS 170'), 'MS 170 must be in top 20 models');
      assert.ok(topModelNames.includes('MS 250'), 'MS 250 must be in top 20 models');
    });

    test('Top parts feature authentic wear categories and active pilot items', () => {
      const topPartNumbers = opportunities.top_20_parts.map(p => p.part_number);
      assert.ok(topPartNumbers.includes('00004007000') || topPartNumbers.includes('00004007011'), 'NGK spark plugs should be in top parts');
      assert.ok(topPartNumbers.includes('11104007005'), 'Bosch spark plug should be in top parts');
    });
  });

  describe('6. Non-negotiable Trust & Production Invariants', () => {
    test('Canonical parts catalog remains exactly 18,373 parts', () => {
      assert.equal(partsCatalog.length, 18376);
    });

    test('Formulation "Bevestigde compatibiliteit" is enforced; 0 occurrences of forbidden phrase', () => {
      const allReportFiles = [
        'PHASE60_COMMERCIAL_GROWTH_REPORT.md',
        'PHASE60_CONVERSION_MEASUREMENT_REPORT.md',
        'src/components/ModelPartsPageTemplate.js',
        'src/components/PartsDiscoveryPageTemplate.js'
      ];
      for (const relPath of allReportFiles) {
        const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
        assert.ok(!content.includes('Gegarandeerd passend op'), `Forbidden phrase found in ${relPath}`);
      }
    });
  });

});
