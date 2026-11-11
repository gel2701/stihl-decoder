/**
 * Phase 61D — Diagram honesty & inventory contracts.
 *
 * Verifies that the UI never promises a real exploded-view image it cannot show,
 * that a real availability notice is rendered, and that catalog/SEO invariants hold.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import {
  DIAGRAM_AVAILABILITY_TEXT,
  renderDiagramAvailabilityNoticeHtml
} from '../src/components/DiagramAvailabilityNotice.js';
import { isPartIndexable } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));

const ms261 = database.models.find(m => m.slug === 'ms-261');

test('Phase 61D - Test 1: Availability notice states no real diagram image', () => {
  const html = renderDiagramAvailabilityNoticeHtml();
  assert.ok(html.includes('Onderdelenlijst met tekeningposities'));
  assert.ok(html.includes(DIAGRAM_AVAILABILITY_TEXT));
  assert.match(html, /niet beschikbaar/i);
});

test('Phase 61D - Test 2: Model parts page labels positions, not images', () => {
  const html = renderModelPartsPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.ok(html.includes('Onderdelenlijst met tekeningposities'), 'Must render the availability notice');
  assert.ok(html.includes('SNEL NAAR SECTIE (tekeningposities):'));
  assert.ok(!/SNEL NAAR EXPLODED VIEW SECTIE/.test(html));
  assert.ok(!/exploded views/i.test(html), 'Must not promise exploded views');
});

test('Phase 61D - Test 3: Model page and part page avoid image promises', () => {
  const modelHtml = renderModelPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.ok(modelHtml.includes('Onderdelen &amp; Tekeningposities STIHL MS 261'));
  assert.ok(modelHtml.includes('Onderdelenlijst met tekeningposities'));
  assert.ok(!/Explosietekeningen/.test(modelHtml));

  const partHtml = renderPartDetailPageHtml('11270201216', database, PRIMARY_ORIGIN);
  assert.ok(partHtml.includes('Onderdelenlijst met tekeningposities'));
  assert.ok(partHtml.includes('Montagelocatie &amp; tekeningposities'));
});

test('Phase 61D - Test 4: Discovery hub and static UI use honest labels', () => {
  const hub = renderPartsDiscoveryPageHtml('', database, PRIMARY_ORIGIN);
  assert.ok(hub.includes('STIHL Onderdelen Zoeken & Tekeningposities Catalogus'));
  assert.ok(!/Explosietekeningen Catalogus/.test(hub));

  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('Onderdelenlijst met tekeningposities'));
  assert.ok(!indexHtml.includes('Bekijk in explosietekening'));
});

test('Phase 61D - Test 5: Catalog and SEO invariants unchanged', () => {
  assert.equal(catalog.parts.length, 18374);
  assert.equal(catalog.parts.filter(p => isPartIndexable(p.part_number)).length, 843);
  const sitemapUrls = (generateSitemapXml(PRIMARY_ORIGIN, database).match(/<loc>/g) || []).length;
  assert.equal(sitemapUrls, 1024);
});

test('Phase 61D - Test 6: No public diagram images are claimed or embedded', () => {
  const html = renderModelPartsPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.ok(!/<img[^>]+(amazonaws|cloudfront|gardenhirespares|stihl\.com)/i.test(html));
  assert.ok(!/offici[eë]le (STIHL )?explosietekening/i.test(html));
});
