import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function readHtml() {
  const htmlPath = path.join(rootDir, 'index.html');
  return fs.readFileSync(htmlPath, 'utf8');
}

const html = readHtml();

// ─── Test 1: H1 count = 1 ──────────────────────────────────────────────
console.log('Test 1: H1 count...');
const h1Matches = html.match(/<h1[\s>]/gi) || [];
assert.strictEqual(h1Matches.length, 1, `Expected 1 H1, found ${h1Matches.length}`);
console.log('  PASS: Exactly 1 H1');

// ─── Test 2: H1 text contains STIHL Serienummer Decoder ─────────────────
console.log('Test 2: H1 text...');
const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
assert.ok(h1Match, 'H1 tag not found');
const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();
assert.ok(h1Text.includes('STIHL'), 'H1 must contain STIHL');
assert.ok(h1Text.includes('Serienummer Decoder'), 'H1 must contain Serienummer Decoder');
assert.ok(h1Text.includes('Bouwjaar'), 'H1 must reference bouwjaar');
console.log('  PASS: H1 text correct');

// ─── Test 3: Version badge NOT inside H1 ────────────────────────────────
console.log('Test 3: Version badge outside H1...');
assert.ok(!h1Text.includes('v3.0'), 'v3.0 must not be inside H1 text');
assert.ok(!h1Text.includes('Serial Breakpoints'), 'Serial Breakpoints must not be inside H1 text');
const h1OpeningTag = html.match(/<h1[^>]*>/i)?.[0] || '';
const h1ClosingTag = '</h1>';
const h1Content = html.substring(html.indexOf(h1OpeningTag), html.indexOf(h1ClosingTag) + h1ClosingTag.length);
assert.ok(!h1Content.includes('v3.0'), 'v3.0 must not be within H1 tags');
console.log('  PASS: Version badge outside H1');

// ─── Test 4: Unique internal targets >= 12 ──────────────────────────────
console.log('Test 4: Internal link count...');
const anchorRegex = /<a\s+href="([^"]+)"/gi;
const targets = new Set();
let match;
while ((match = anchorRegex.exec(html)) !== null) {
  const href = match[1];
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('.js') && !href.includes('.css') && !href.includes('.png') && !href.includes('.ico') && !href.includes('.webmanifest')) {
    targets.add(href);
  }
}
assert.ok(targets.size >= 12, `Expected >= 12 unique internal targets, found ${targets.size}`);
console.log(`  PASS: ${targets.size} unique internal targets`);

// ─── Test 5: Category links present ─────────────────────────────────────
console.log('Test 5: Category links...');
const requiredCategories = ['/kettingzagen/', '/bosmaaiers/', '/bladblazers/', '/heggenscharen/'];
for (const cat of requiredCategories) {
  assert.ok(targets.has(cat), `Category link ${cat} must be present`);
}
console.log('  PASS: All 4 category links present');

// ─── Test 6: Tool links present ─────────────────────────────────────────
console.log('Test 6: Tool links...');
const requiredTools = ['/gidsen/serienummer-locaties/', '/onderdeelnummer/', '/stihl-paspoort/'];
for (const tool of requiredTools) {
  assert.ok(targets.has(tool), `Tool link ${tool} must be present`);
}
console.log('  PASS: All 3 tool links present');

// ─── Test 7: Popular model links valid ──────────────────────────────────
console.log('Test 7: Popular model links...');
const modelLinks = [...targets].filter(t => t.match(/^\/(kettingzagen|bosmaaiers|bladblazers|heggenscharen|doorslijpers)\/[^/]+\/$/));
assert.ok(modelLinks.length >= 4, `Expected >= 4 popular model links, found ${modelLinks.length}`);
assert.ok(modelLinks.length <= 8, `Expected <= 8 popular model links, found ${modelLinks.length}`);
console.log(`  PASS: ${modelLinks.length} popular model links`);

// ─── Test 8: Guide links present ────────────────────────────────────────
console.log('Test 8: Guide links...');
const guideLinks = [...targets].filter(t => t.startsWith('/gidsen/'));
assert.ok(guideLinks.length >= 1, `Expected >= 1 guide link, found ${guideLinks.length}`);
console.log(`  PASS: ${guideLinks.length} guide links`);

// ─── Test 9: No nofollow on internal links ──────────────────────────────
console.log('Test 9: No internal nofollow...');
const nofollowAnchors = html.match(/<a\s+[^>]*rel="[^"]*nofollow[^"]*"[^>]*href="\/[^"]+"/gi) || [];
assert.strictEqual(nofollowAnchors.length, 0, `Found ${nofollowAnchors.length} internal nofollow links`);
console.log('  PASS: No internal nofollow');

// ─── Test 10: Canonical preserved ───────────────────────────────────────
console.log('Test 10: Canonical...');
assert.ok(html.includes('<link rel="canonical" href="https://www.stihldecoder.nl/"'), 'Canonical must be preserved');
console.log('  PASS: Canonical correct');

// ─── Test 11: Meta robots preserved ─────────────────────────────────────
console.log('Test 11: Meta robots...');
assert.ok(html.includes('index, follow'), 'Meta robots must be index, follow');
console.log('  PASS: Meta robots correct');

// ─── Test 12: Title preserved ───────────────────────────────────────────
console.log('Test 12: Title...');
assert.ok(html.includes('<title>STIHL Serienummer Decoder — Bouwjaar & Model Checker</title>'), 'Title must be preserved');
console.log('  PASS: Title correct');

// ─── Test 13: No empty anchors ──────────────────────────────────────────
console.log('Test 13: No empty anchors...');
const emptyAnchors = html.match(/<a\s+href="[^"]*">\s*<\/a>/gi) || [];
assert.strictEqual(emptyAnchors.length, 0, `Found ${emptyAnchors.length} empty anchors`);
console.log('  PASS: No empty anchors');

// ─── Test 14: Structured data preserved ─────────────────────────────────
console.log('Test 14: Structured data...');
assert.ok(html.includes('WebSite'), 'WebSite JSON-LD must be preserved');
assert.ok(html.includes('WebApplication'), 'WebApplication JSON-LD must be preserved');
assert.ok(html.includes('FAQPage'), 'FAQPage JSON-LD must be preserved');
console.log('  PASS: Structured data preserved');

// ─── Test 15: Database unchanged ────────────────────────────────────────
console.log('Test 15: Protected data...');
const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const models = db.models || db;
const modelArray = Array.isArray(models) ? models : Object.values(models);
// Phase 42C added 5 new models: 57 → 62
assert.ok(modelArray.length >= 57, 'Database must have at least 57 models');
const withBC = modelArray.filter(m => m.basic_classification);
assert.ok(withBC.length >= 57, 'At least 57 models must have basic_classification');
console.log('  PASS: Protected data intact');

// ─── Test 16: Public evidence unchanged ─────────────────────────────────
console.log('Test 16: Public evidence...');
const facts = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8'));
// Phase 42D activated 18 new facts: 474 + 18 = 492
assert.ok(facts.facts.length >= 474, 'Public evidence must have at least 474 facts');
console.log('  PASS: Public evidence intact');

// ─── Test 17: H1 content alignment ─────────────────────────────────────
console.log('Test 17: H1 content alignment...');
const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
assert.ok(bodyText.toLowerCase().includes('serienummer'), 'Body must reference serienummer');
assert.ok(bodyText.toLowerCase().includes('bouwjaar'), 'Body must reference bouwjaar');
assert.ok(bodyText.toLowerCase().includes('model'), 'Body must reference model');
console.log('  PASS: H1 content alignment');

console.log('');
console.log('Phase 41 homepage SEO & internal linking tests PASSED (17/17).');
