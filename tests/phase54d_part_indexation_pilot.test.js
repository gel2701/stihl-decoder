/**
 * Test Suite: Phase 54D — Controlled Individual Part Indexation Pilot
 *
 * Verifies the controlled SEO pilot for individual STIHL part detail pages:
 * 1. Explicit allowlist policy (<= 50 parts, no automatic classifier runtime indexation)
 * 2. Pilot parts receive 'index, follow', self-canonical URL, unique Dutch title/H1, and sitemap inclusion
 * 3. All non-pilot part pages (strong, candidate, not-ready, generic hardware) remain strictly 'noindex, follow'
 * 4. Exact set membership in /sitemap.xml (zero leaks, zero omissions)
 * 5. Balanced representation across equipment categories (chainsaws, brushcutters, hedge trimmers, cut-off saws, blowers)
 * 6. Hard mass-indexation and drift tripwires
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import {
  MAX_PILOT_SIZE,
  isPartIndexationPilotEnabled,
  getPartIndexationPilotEntry,
  getPartIndexationPilotList,
  getPartIndexationPilotSet
} from '../src/seo/PartIndexationPilot.js';
import { PartIndexReadinessClassifier } from '../src/seo/PartIndexReadinessClassifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

test('Phase 54D: Explicit Pilot Allowlist Constraints (<= 50 enabled parts, schema valid)', () => {
  const pilotPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
  assert.ok(fs.existsSync(pilotPath), 'part_indexation_pilot.json must exist');

  const raw = fs.readFileSync(pilotPath, 'utf8');
  const data = JSON.parse(raw);

  assert.strictEqual(data.schema_version, '1.0.0');
  assert.strictEqual(data.phase, '54D');
  assert.strictEqual(data.policy, 'EXPLICIT_ALLOWLIST_ONLY');
  assert.ok(Array.isArray(data.parts), 'parts must be an array');

  const enabled = data.parts.filter((p) => p.enabled === true);
  assert.ok(enabled.length > 0, 'Pilot must have at least 1 enabled part');
  assert.ok(enabled.length <= MAX_PILOT_SIZE, `Enabled parts (${enabled.length}) must not exceed MAX_PILOT_SIZE (${MAX_PILOT_SIZE})`);
  assert.strictEqual(enabled.length, 50, 'Pilot size must be exactly 50 parts');

  const list = getPartIndexationPilotList();
  assert.strictEqual(list.length, 50, 'getPartIndexationPilotList() must return exactly 50 entries');

  const set = getPartIndexationPilotSet();
  assert.strictEqual(set.size, 50, 'getPartIndexationPilotSet() must return 50 unique part numbers');
});

test('Phase 54D: Balanced Category Distribution (min 5 chainsaws, 5 brushcutters, 3 hedge trimmers, 3 cut-off saws, 3 blowers)', () => {
  const list = getPartIndexationPilotList();
  const counts = {};
  for (const item of list) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  assert.ok(counts.kettingzagen >= 5, `Expected >= 5 chainsaws, got ${counts.kettingzagen}`);
  assert.ok(counts.bosmaaiers >= 5, `Expected >= 5 brushcutters, got ${counts.bosmaaiers}`);
  assert.ok(counts.heggenscharen >= 3, `Expected >= 3 hedge trimmers, got ${counts.heggenscharen}`);
  assert.ok(counts.doorslijpers >= 3, `Expected >= 3 cut-off saws, got ${counts.doorslijpers}`);
  assert.ok(counts.bladblazers >= 3, `Expected >= 3 blowers, got ${counts.bladblazers}`);

  assert.strictEqual(counts.kettingzagen, 20);
  assert.strictEqual(counts.bosmaaiers, 12);
  assert.strictEqual(counts.heggenscharen, 6);
  assert.strictEqual(counts.doorslijpers, 6);
  assert.strictEqual(counts.bladblazers, 6);
});

test('Phase 54D: Pilot Part Pages Render index, follow, Self-Canonical, Unique Title, Unique H1', () => {
  const list = getPartIndexationPilotList();
  const titles = new Set();
  const h1s = new Set();
  const descriptions = new Set();

  for (const item of list) {
    const html = renderPartDetailPageHtml(item.part_number, database, PRIMARY_ORIGIN);

    // Robots
    assert.match(html, /<meta\s+name="robots"\s+content="index, follow"/, `Part ${item.part_number} must be 'index, follow'`);

    // Self-canonical
    const expectedCanonical = `https://www.stihldecoder.nl/onderdeelnummer/${item.part_number}/`;
    assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="${expectedCanonical}"`), `Canonical must be ${expectedCanonical}`);

    // Title
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
    assert.ok(title, `Title must be present for part ${item.part_number}`);
    assert.ok(title.length <= 80, `Title length (${title.length}) should be concise: "${title}"`);
    assert.ok(!titles.has(title), `Duplicate title detected: "${title}"`);
    titles.add(title);

    // H1
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    assert.ok(h1, `H1 must be present for part ${item.part_number}`);
    assert.ok(!h1s.has(h1), `Duplicate H1 detected: "${h1}"`);
    h1s.add(h1);

    // Meta description
    const desc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1]?.trim();
    assert.ok(desc, `Meta description must be present for part ${item.part_number}`);
    assert.ok(!descriptions.has(desc), `Duplicate meta description detected: "${desc}"`);
    descriptions.add(desc);

    // Breadcrumbs
    assert.match(html, /"BreadcrumbList"/, `Breadcrumbs JSON-LD must be present on part ${item.part_number}`);

    // Technical content depth
    const resolved = PartCatalogResolver.resolvePartNumber(item.part_number, database);
    assert.ok(resolved && resolved.compatible_models.length >= 1, `Pilot part ${item.part_number} must have >= 1 compatible model`);
    assert.ok(resolved.fitments.length >= 1, `Pilot part ${item.part_number} must have >= 1 fitment position`);
  }

  assert.strictEqual(titles.size, 50, 'All 50 pilot parts must have unique titles');
  assert.strictEqual(h1s.size, 50, 'All 50 pilot parts must have unique H1s');
  assert.strictEqual(descriptions.size, 50, 'All 50 pilot parts must have unique descriptions');
});

test('Phase 54D: Non-Pilot Parts Strictly "noindex, follow" Across All Readiness Tiers', () => {
  // 1. Strong candidate that was NOT selected for pilot
  const strongNonPilot = '11270201216';
  assert.strictEqual(isPartIndexationPilotEnabled(strongNonPilot), false);
  const strongHtml = renderPartDetailPageHtml(strongNonPilot, database, PRIMARY_ORIGIN);
  assert.match(strongHtml, /<meta\s+name="robots"\s+content="noindex, follow"/, 'Strong non-pilot part must be noindex');

  // 2. Candidate tier
  const candidatePart = '00000071043';
  assert.strictEqual(isPartIndexationPilotEnabled(candidatePart), false);
  const candidateHtml = renderPartDetailPageHtml(candidatePart, database, PRIMARY_ORIGIN);
  assert.match(candidateHtml, /<meta\s+name="robots"\s+content="noindex, follow"/, 'Candidate tier part must be noindex');

  // 3. Not ready / generic hardware
  const notReadyParts = ['90223410980', '92143200700', '99999999999'];
  for (const p of notReadyParts) {
    assert.strictEqual(isPartIndexationPilotEnabled(p), false);
    const html = renderPartDetailPageHtml(p, database, PRIMARY_ORIGIN);
    assert.match(html, /<meta\s+name="robots"\s+content="noindex, follow"/, `Not ready part ${p} must be noindex`);
  }
});

test('Phase 54D: Sitemap Exact Set Equivalence (pilot allowlist == sitemap individual parts)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const sitemapPartUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.strictEqual(sitemapPartUrls.length, 50, 'Sitemap must contain exactly 50 individual part URLs');

  const sitemapPartNumbers = new Set(sitemapPartUrls.map((u) => {
    const m = u.match(/\/onderdeelnummer\/(\d{11})\//);
    return m ? m[1] : null;
  }).filter(Boolean));

  const pilotSet = getPartIndexationPilotSet();

  for (const pilotNo of pilotSet) {
    assert.ok(sitemapPartNumbers.has(pilotNo), `Pilot part ${pilotNo} must be present in sitemap.xml`);
  }
  for (const sitemapNo of sitemapPartNumbers) {
    assert.ok(pilotSet.has(sitemapNo), `Sitemap part ${sitemapNo} must be an authorized member of pilotSet`);
  }
});

test('Phase 54D: Decoupled Gating Tripwire (Classifier Score Cannot Auto-Enable Indexation)', () => {
  // Verify that isPartIndexationPilotEnabled checks ONLY explicit allowlist, NOT classifier score
  const dummyEvaluatedStrong = {
    part_number: '11280201250',
    tier: 'STRONG_CANDIDATE',
    score: 95
  };
  // Ensure that even if a part is STRONG_CANDIDATE in classifier, if not in allowlist, it remains disabled
  assert.strictEqual(isPartIndexationPilotEnabled(dummyEvaluatedStrong.part_number), false);
  const html = renderPartDetailPageHtml(dummyEvaluatedStrong.part_number, database, PRIMARY_ORIGIN);
  assert.match(html, /<meta\s+name="robots"\s+content="noindex, follow"/);
});
