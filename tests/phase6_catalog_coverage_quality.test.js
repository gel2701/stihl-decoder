import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  measureCatalogCoverage,
  PRIORITY_MODEL_NAMES,
  ESSENTIAL_CATEGORIES
} from '../scripts/measure_catalog_coverage.mjs';

import {
  classifyPartCategory,
  searchIntelligentParts,
  PART_CATEGORIES
} from '../src/search/IntelligentPartsSearchEngine.js';

import { PartCatalogResolver, RENDERABLE_CATALOG_MODELS } from '../src/parts/PartCatalogResolver.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { renderInternalQualityDashboardHtml } from '../src/components/InternalQualityDashboardTemplate.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 6 - Test 1: Priority Models Catalog Coverage Audit & Measurement Integrity', () => {
  const report = measureCatalogCoverage({ databasePath: path.join(rootDir, 'data', 'stihl_database.json') });

  assert.ok(report, 'Report must be generated');
  assert.strictEqual(report.total_models_evaluated, 112, 'Must evaluate full universe of 112 models');
  assert.strictEqual(report.models_with_parts, 85, 'Must have exactly 85 models with verified catalog parts');

  // Verify priority models count
  assert.strictEqual(report.priority_models_summary.length, 17, 'Must audit exactly 17 priority models');

  const pmMap = new Map(report.priority_models_summary.map(p => [p.model_name, p]));

  // Check specific ground truths
  const ms260 = pmMap.get('MS 260');
  assert.ok(ms260, 'MS 260 must be in priority summary');
  assert.strictEqual(ms260.unique_parts_count, 261, 'MS 260 must have exactly 261 unique parts');
  assert.strictEqual(ms260.confirmed_fitments, 261, 'MS 260 must have 261 confirmed fitments');
  assert.strictEqual(ms260.indicative_fitments, 0, 'MS 260 must have 0 indicative fitments');
  assert.strictEqual(ms260.in_stihl_database, true, 'MS 260 is in base stihl_database');

  const fs460 = pmMap.get('FS 460 C-EM') || pmMap.get('FS 460');
  assert.ok(fs460, 'FS 460 must be in priority summary');
  assert.strictEqual(fs460.unique_parts_count, 246, 'FS 460 must have exactly 246 unique parts');
  assert.strictEqual(fs460.confirmed_fitments, 246, 'FS 460 must have 246 confirmed fitments');
  assert.strictEqual(fs460.diagram_linked_count, 246, 'FS 460 must have 246 parts with diagram positions');

  const br600 = pmMap.get('BR 600');
  assert.ok(br600, 'BR 600 must be in priority summary');
  assert.strictEqual(br600.unique_parts_count, 239, 'BR 600 must have exactly 239 parts');
  assert.strictEqual(br600.confirmed_fitments, 239, 'BR 600 must have 239 confirmed fitments');

  // Verify models missing in base stihl_database.json are explicitly recorded as such without fictitious specifications
  const fs450 = pmMap.get('FS 450');
  assert.ok(fs450, 'FS 450 must be in priority summary');
  assert.strictEqual(fs450.in_stihl_database, false, 'FS 450 must be recorded as missing in base db');
  assert.strictEqual(fs450.unique_parts_count, 302, 'FS 450 has 302 verified catalog parts');

  const fs480 = pmMap.get('FS 480');
  assert.ok(fs480, 'FS 480 must be in priority summary');
  assert.strictEqual(fs480.in_stihl_database, false, 'FS 480 must be recorded as missing in base db');
  assert.strictEqual(fs480.unique_parts_count, 300, 'FS 480 has 300 verified catalog parts');

  const fs550 = pmMap.get('FS 550');
  assert.ok(fs550, 'FS 550 must be in priority summary');
  assert.strictEqual(fs550.in_stihl_database, false, 'FS 550 must be recorded as missing in base db');
  assert.strictEqual(fs550.unique_parts_count, 278, 'FS 550 has 278 verified catalog parts');
});

test('Phase 6 - Test 2: Category Classification Accuracy & Zero Inapplicable Contamination on FS 460', () => {
  // 1. Hardware fast-path classification prevents "Chainsaw Parts" pollution
  const nutPart = classifyPartCategory('Hexagon Nut M5 Chainsaw Parts');
  assert.strictEqual(nutPart.id, 'bevestiging', 'Nut with "Chainsaw Parts" must be classified as hardware/bevestiging');

  const screwPart = classifyPartCategory('Collar screw for guide bar');
  assert.strictEqual(screwPart.id, 'bevestiging', 'Screw for guide bar must be classified as hardware/bevestiging');

  const washerPart = classifyPartCategory('Thrust Washer MS 260 Chainsaw');
  assert.strictEqual(washerPart.id, 'bevestiging', 'Washer must be classified as hardware/bevestiging');

  // Real chainsaw cutting equipment still properly matches
  const sawChain = classifyPartCategory('Rapid Super Zaagketting .325" 1.6mm 67TG');
  assert.strictEqual(sawChain.id, 'zaaguitrusting', 'Saw chain must be classified as zaaguitrusting');

  const guideBar = classifyPartCategory('Rollomatic E Zaagblad 40cm');
  assert.strictEqual(guideBar.id, 'zaaguitrusting', 'Guide bar must be classified as zaaguitrusting');

  // 2. FS 460 forensic validation: exactly 0 zaaguitrusting
  const report = measureCatalogCoverage({ databasePath: path.join(rootDir, 'data', 'stihl_database.json') });
  assert.ok(report.fs460_deep_dive, 'Report must contain FS 460 deep dive');
  const fs460Cats = report.fs460_deep_dive.category_counts;
  assert.strictEqual(fs460Cats['zaaguitrusting'] || 0, 0, 'FS 460 brushcutter must have ZERO zaaguitrusting parts');
  assert.ok(fs460Cats['bevestiging'] >= 50, 'FS 460 must have hardware fasteners properly categorized in bevestiging');
});

test('Phase 6 - Test 3: Unlocked Parts Search for FS 450, FS 480, and FS 550', () => {
  // Pure model search on FS 450
  const fs450Search = searchIntelligentParts('FS 450', {}, { database });
  assert.ok(fs450Search.total_matches >= 300, `FS 450 must return all verified parts (got ${fs450Search.total_matches})`);
  assert.strictEqual(fs450Search.results[0].compatibility_badge, '✓ Bevestigde compatibiliteit');

  // Pure model search on FS 480
  const fs480Search = searchIntelligentParts('FS 480', {}, { database });
  assert.ok(fs480Search.total_matches >= 300, `FS 480 must return all verified parts (got ${fs480Search.total_matches})`);

  // Pure model search on FS 550
  const fs550Search = searchIntelligentParts('FS 550', {}, { database });
  assert.ok(fs550Search.total_matches >= 270, `FS 550 must return all verified parts (got ${fs550Search.total_matches})`);
});

test('Phase 6 - Test 4: Internal Quality Dashboard Rendering & Security Rules', () => {
  const report = measureCatalogCoverage({ databasePath: path.join(rootDir, 'data', 'stihl_database.json') });
  const html = renderInternalQualityDashboardHtml(report, PRIMARY_ORIGIN);

  // 1. Non-indexable meta tags
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'), 'Must include noindex, nofollow meta tag');

  // 2. Internal badge & content
  assert.ok(html.includes('INTERN DASHBOARD'), 'Must identify as internal dashboard');
  assert.ok(html.includes('Fase 6 Kwaliteitsaudit'), 'Must identify as Phase 6 audit');
  assert.ok(html.includes('Transparante Scoremethodologie'), 'Must contain transparent scoring section');
  assert.ok(html.includes('geen officiële STIHL-compleetheid'), 'Must state disclaimer that score is relative and not official completeness');

  // 3. Robots.txt disallow check
  const robotsTxt = generateRobotsTxt(PRIMARY_ORIGIN);
  assert.ok(robotsTxt.includes('Disallow: /intern/'), 'robots.txt must disallow /intern/');
  assert.ok(robotsTxt.includes('Disallow: /admin/'), 'robots.txt must disallow /admin/');

  // 4. Top 20 opportunities section rendered
  assert.ok(html.includes('Top Verbeterkansen'), 'Must render top opportunities');
  assert.ok(report.top_20_improvement_opportunities.length >= 10, 'Must have at least 10 opportunities in report');
});

test('Phase 6 - Test 5: Invariant Verification (18,373 Parts, 843 SEO Pages, 1,024 Sitemap URLs, Affiliate Tag)', () => {
  // 1. Canonical parts count
  const rawParts = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
  const totalParts = Array.isArray(rawParts) ? rawParts.length : (rawParts.parts ? rawParts.parts.length : rawParts.parts_count);
  assert.strictEqual(totalParts, 18376, 'Exact canonical parts count must remain 18,373');

  // 2. SEO indexable parts count
  const indexable = getAllIndexablePartsList();
  assert.strictEqual(indexable.length, 843, 'Exact SEO indexable parts count must remain 843');

  // 3. Sitemap URL count
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const locCount = (sitemapXml.match(/<loc>/g) || []).length;
  assert.strictEqual(locCount, 1024, `Sitemap must contain exactly 1,024 URLs (found ${locCount})`);

  // 4. Phrasing invariant: Bevestigde compatibiliteit vs forbidden Gegarandeerd passend
  const report = measureCatalogCoverage({ databasePath: path.join(rootDir, 'data', 'stihl_database.json') });
  const html = renderInternalQualityDashboardHtml(report, PRIMARY_ORIGIN);
  assert.ok(!html.includes('Gegarandeerd passend'), 'Forbidden phrase "Gegarandeerd passend" must NOT appear anywhere');
  assert.ok(!html.includes('meest verkocht'), 'Forbidden phrase "meest verkocht" must NOT appear');

  // 5. Affiliate tag
  const affiliateTag = process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21';
  assert.strictEqual(affiliateTag, 'srihldecoder2-21', 'Amazon affiliate tag must remain srihldecoder2-21');
});

test('Phase 6 - Test 6: Server-Side Authentication & Access Control on Internal Dashboard', async () => {
  const TEST_PORT = 3129;
  const BASE_URL = `http://localhost:${TEST_PORT}`;
  const TEST_SECRET = 'stihl-intern-audit-secret-2026';

  const serverProc = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'production',
      INTERNAL_DASHBOARD_KEY: TEST_SECRET,
      DATABASE_PATH: './data/test_stihl_database.db'
    },
    stdio: 'ignore'
  });

  const requestHelper = (urlPath, headers = {}) => {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlPath, BASE_URL);
      const req = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Host': 'www.stihldecoder.nl',
          ...headers
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  };

  try {
    // Wait for server ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const v = await requestHelper('/api/version');
        if (v.status === 200) {
          ready = true;
          break;
        }
      } catch (e) {
        // wait
      }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, 'Server must start within 3 seconds');

    // 1. Unauthenticated request without key must return 401
    const unauthRes = await requestHelper('/intern/kwaliteit');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    assert.strictEqual(unauthRes.headers['x-robots-tag'], 'noindex, nofollow');
    assert.ok(!unauthRes.body.includes('Canonieke Onderdelen'), 'Must not leak dashboard contents');

    // 2. Unauthenticated request with wrong key must return 401
    const wrongKeyRes = await requestHelper('/intern/kwaliteit?key=wrong-key');
    assert.strictEqual(wrongKeyRes.status, 401, 'Wrong key in query must return 401');

    const wrongHeaderRes = await requestHelper('/intern/catalogus-dekking/', { 'x-admin-key': 'incorrect-secret' });
    assert.strictEqual(wrongHeaderRes.status, 401, 'Wrong key in header must return 401');

    // 3. Unauthenticated API JSON request without key must return 401 JSON error
    const jsonUnauth = await requestHelper('/intern/kwaliteit', { 'Accept': 'application/json' });
    assert.strictEqual(jsonUnauth.status, 401);
    const jsonErr = JSON.parse(jsonUnauth.body);
    assert.ok(jsonErr.error, 'Must return JSON error object');
    assert.strictEqual(jsonErr.total_models_evaluated, undefined, 'Must not leak report numbers');

    // 4. Authorized request via x-admin-key header must return 200 HTML
    const authHeaderRes = await requestHelper('/intern/kwaliteit', { 'x-admin-key': TEST_SECRET });
    assert.strictEqual(authHeaderRes.status, 200, 'Authorized via x-admin-key must return 200');
    assert.ok(authHeaderRes.body.includes('INTERN DASHBOARD'));
    assert.ok(authHeaderRes.body.includes('Onderdelendekking Prioriteitsmodellen'));

    // 5. Authorized request via Authorization: Bearer must return 200 HTML
    const authBearerRes = await requestHelper('/intern/catalogus-dekking/', { 'Authorization': `Bearer ${TEST_SECRET}` });
    assert.strictEqual(authBearerRes.status, 200, 'Authorized via Bearer token must return 200');
    assert.ok(authBearerRes.body.includes('INTERN DASHBOARD'));

    // 6. Authorized request via query param ?key= must return 200 HTML
    const authQueryRes = await requestHelper(`/intern/kwaliteit?key=${TEST_SECRET}`);
    assert.strictEqual(authQueryRes.status, 200, 'Authorized via query key must return 200');
    assert.ok(authQueryRes.body.includes('INTERN DASHBOARD'));

    // 7. Alternative URL casing and trailing slashes
    const authCasedRes = await requestHelper(`/intern/Kwaliteit/?key=${TEST_SECRET}`);
    assert.strictEqual(authCasedRes.status, 200, 'Case-insensitive path must return 200');

    // 8. Authorized API JSON request must return 200 JSON with metrics
    const authJsonRes = await requestHelper('/intern/kwaliteit', {
      'x-admin-key': TEST_SECRET,
      'Accept': 'application/json'
    });
    assert.strictEqual(authJsonRes.status, 200);
    const reportJson = JSON.parse(authJsonRes.body);
    assert.strictEqual(reportJson.total_models_evaluated, 112);
    assert.strictEqual(reportJson.models_with_parts, 85);
  } finally {
    serverProc.kill();
  }

  // 9. Fail-closed when no key is configured on server (503 Service Unavailable)
  const unconfiguredProc = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: '3130',
      NODE_ENV: 'production',
      INTERNAL_DASHBOARD_KEY: '',
      ADMIN_AUDIT_KEY: '',
      ADMIN_KEY: '',
      DATABASE_PATH: './data/test_stihl_database.db'
    },
    stdio: 'ignore'
  });

  try {
    let unconfReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const v = await new Promise((resolve, reject) => {
          const req = http.get('http://localhost:3130/api/version', (res) => resolve(res.statusCode));
          req.on('error', reject);
        });
        if (v === 200) {
          unconfReady = true;
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(unconfReady, 'Unconfigured server must start');

    const res503 = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3130/intern/kwaliteit', (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });

    assert.strictEqual(res503.status, 503, 'Must return 503 when no key is configured on server');
    assert.ok(res503.body.includes('503 Niet Beschikbaar'), 'Must show 503 error message');
    assert.ok(!res503.body.includes('Canonieke Onderdelen'), 'Must never leak dashboard data');
  } finally {
    unconfiguredProc.kill();
  }
});

