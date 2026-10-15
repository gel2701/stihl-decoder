/**
 * Controlled Part Indexation Pilot Audit Script
 * Phase 54D — Controlled Individual Part Indexation Pilot
 *
 * Verifies explicit pilot allowlist integrity, robots tags, canonical URLs,
 * sitemap membership, metadata uniqueness, content quality, and negative controls.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIMARY_ORIGIN } from '../src/config.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartIndexReadinessClassifier } from '../src/seo/PartIndexReadinessClassifier.js';
import {
  MAX_PILOT_SIZE,
  isPartIndexationPilotEnabled,
  getPartIndexationPilotEntry,
  getPartIndexationPilotList,
  getPartIndexationPilotSet
} from '../src/seo/PartIndexationPilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🔍 RUNNING PHASE 54D — CONTROLLED PART INDEXATION PILOT AUDIT');
console.log('================================================================\n');

// 1. Audit Allowlist Format & Constraints
console.log('▶ Auditing Pilot Allowlist Configuration (data/seo/part_indexation_pilot.json)...');
const pilotPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
if (!fs.existsSync(pilotPath)) {
  throw new Error(`Pilot allowlist file not found at ${pilotPath}`);
}

const rawPilot = fs.readFileSync(pilotPath, 'utf8');
const pilotData = JSON.parse(rawPilot);

if (pilotData.schema_version !== '1.0.0') throw new Error(`Invalid schema_version: ${pilotData.schema_version}`);
if (pilotData.phase !== '54D') throw new Error(`Invalid phase: ${pilotData.phase}`);
if (pilotData.policy !== 'EXPLICIT_ALLOWLIST_ONLY') throw new Error(`Invalid policy: ${pilotData.policy}`);
if (!Array.isArray(pilotData.parts)) throw new Error('parts must be an array');

const enabledParts = pilotData.parts.filter(p => p.enabled === true);
console.log(`  Pilot Size (total entries):   ${pilotData.parts.length}`);
console.log(`  Enabled Pilot Parts:          ${enabledParts.length}`);
console.log(`  MAX_PILOT_SIZE Guardrail:     ${MAX_PILOT_SIZE}`);

if (enabledParts.length > MAX_PILOT_SIZE) {
  throw new Error(`🚨 CRITICAL GUARDRAIL VIOLATION: Pilot size (${enabledParts.length}) exceeds MAX_PILOT_SIZE (${MAX_PILOT_SIZE})!`);
}
if (enabledParts.length === 0) {
  throw new Error('🚨 CRITICAL ERROR: Pilot allowlist has 0 enabled parts!');
}

// Check duplicates in allowlist
const partNumbersSeen = new Set();
for (const p of enabledParts) {
  if (partNumbersSeen.has(p.part_number)) {
    throw new Error(`🚨 Duplicate part number in pilot allowlist: ${p.part_number}`);
  }
  partNumbersSeen.add(p.part_number);
}
console.log('  ✅ Pilot Allowlist Schema & Guardrail Validated.\n');

// 2. Audit Database Existence & Classifier Strength
console.log('▶ Verifying Pilot Parts in Database & Classifier...');
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });

const query = `
  SELECT
    p.part_number,
    p.part_name,
    p.part_number_display,
    COUNT(f.fitment_id) as fitment_count,
    COUNT(DISTINCT f.canonical_model_id) as model_count,
    COUNT(DISTINCT f.section_name) as section_count,
    MAX(CASE WHEN f.diagram_position IS NOT NULL AND f.diagram_position != '' THEN 1 ELSE 0 END) as has_pos,
    MAX(CASE WHEN f.configuration_key IS NOT NULL AND f.configuration_key != '' THEN 1 ELSE 0 END) as has_config
  FROM parts p
  JOIN model_part_fitments f ON p.part_number = f.part_number
  GROUP BY p.part_number
`;
const rawParts = db.prepare(query).all();
db.close();

const partMap = new Map();
for (const r of rawParts) {
  partMap.set(r.part_number, r);
}

const readinessEvaluations = new Map();
for (const r of rawParts) {
  readinessEvaluations.set(r.part_number, PartIndexReadinessClassifier.evaluatePart(r));
}

for (const p of enabledParts) {
  const dbRecord = partMap.get(p.part_number);
  if (!dbRecord) {
    throw new Error(`🚨 Pilot part ${p.part_number} does not exist in SQLite database!`);
  }
  const evalResult = readinessEvaluations.get(p.part_number);
  if (!evalResult) {
    throw new Error(`🚨 Pilot part ${p.part_number} has no readiness evaluation!`);
  }
  if (evalResult.tier === 'NOT_READY') {
    throw new Error(`🚨 NOT_READY part enabled in pilot: ${p.part_number} (score: ${evalResult.score})`);
  }
}
console.log(`  All ${enabledParts.length} pilot parts verified in DB and qualified as candidate/strong candidate.`);
console.log('  ✅ Database & Classifier Validation Clean.\n');

// 3. Render HTML & Audit Metadata, Quality, Encodings
console.log('▶ Auditing SSR HTML, Metadata & Quality across all 50 Pilot Pages...');
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'test-associate-tag-21';

const titles = new Map();
const descriptions = new Map();
const h1s = new Map();

let thinPilotPages = 0;
let brokenEncodingPilot = 0;
let retailerSpamHits = 0;

const RETAILER_SPAM_REGEX = /\b(pack of|oem no|buy now|for sale|free shipping|ebay|aliexpress)\b/i;
const BROKEN_ENCODING_REGEX = /[\uFFFD]|Ã[a-zA-Z]|Â[a-zA-Z]|&amp;amp;/;

const categoryDistribution = {};

for (const p of enabledParts) {
  categoryDistribution[p.category] = (categoryDistribution[p.category] || 0) + 1;

  const html = renderPartDetailPageHtml(p.part_number, null, PRIMARY_ORIGIN);

  // Robots
  const robotsMatch = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
  const robots = robotsMatch ? robotsMatch[1] : null;
  if (robots !== 'index, follow') {
    throw new Error(`🚨 Pilot part ${p.part_number} must have robots 'index, follow' but got '${robots}'!`);
  }

  // Canonical
  const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;
  const expectedCanonical = `${PRIMARY_ORIGIN}/onderdeelnummer/${p.part_number}/`;
  if (canonical !== expectedCanonical) {
    throw new Error(`🚨 Canonical mismatch for pilot part ${p.part_number}: expected ${expectedCanonical}, got ${canonical}`);
  }

  // Title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  if (!title) throw new Error(`Missing title for pilot part ${p.part_number}`);
  if (titles.has(title)) {
    throw new Error(`🚨 Duplicate title found in pilot: "${title}" on ${p.part_number} and ${titles.get(title)}`);
  }
  titles.set(title, p.part_number);

  if (RETAILER_SPAM_REGEX.test(title)) {
    console.error(`🚨 Retailer spam detected in title for ${p.part_number}: ${title}`);
    retailerSpamHits++;
  }

  // H1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const rawH1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : null;
  if (!rawH1) throw new Error(`Missing H1 for pilot part ${p.part_number}`);
  if (h1s.has(rawH1)) {
    throw new Error(`🚨 Duplicate H1 found in pilot: "${rawH1}" on ${p.part_number} and ${h1s.get(rawH1)}`);
  }
  h1s.set(rawH1, p.part_number);

  if (RETAILER_SPAM_REGEX.test(rawH1)) {
    console.error(`🚨 Retailer spam detected in H1 for ${p.part_number}: ${rawH1}`);
    retailerSpamHits++;
  }

  // Meta Description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const desc = descMatch ? descMatch[1].trim() : null;
  if (!desc) throw new Error(`Missing description for pilot part ${p.part_number}`);
  if (descriptions.has(desc)) {
    throw new Error(`🚨 Duplicate description found in pilot: "${desc}" on ${p.part_number} and ${descriptions.get(desc)}`);
  }
  descriptions.set(desc, p.part_number);

  // Breadcrumbs
  if (!html.includes('BreadcrumbList')) {
    throw new Error(`Missing BreadcrumbList for pilot part ${p.part_number}`);
  }

  // Thin page checks
  const resolved = PartCatalogResolver.resolvePartNumber(p.part_number);
  if (!resolved || resolved.compatible_models.length === 0 || resolved.fitments.length === 0) {
    thinPilotPages++;
  }

  // Encoding checks
  if (BROKEN_ENCODING_REGEX.test(html)) {
    console.error(`🚨 Broken encoding detected on pilot part ${p.part_number}`);
    brokenEncodingPilot++;
  }

  // Amazon honest search UI checks (Phase 54A-H integrity)
  if (!html.includes('Zoek op Amazon.nl') && !html.includes('Zoek dit onderdeel online')) {
    throw new Error(`Affiliate honest UI missing on pilot part ${p.part_number}`);
  }
  if (html.includes('Waar te koop')) {
    throw new Error(`🚨 False 'Waar te koop' claim found on unverified offer for part ${p.part_number}!`);
  }
}

console.log('  Category distribution:');
for (const [cat, cnt] of Object.entries(categoryDistribution)) {
  console.log(`    ${cat}: ${cnt}`);
}
console.log(`  DUPLICATE_TITLES:        ${titles.size === enabledParts.length ? 0 : enabledParts.length - titles.size}`);
console.log(`  DUPLICATE_DESCRIPTIONS:  ${descriptions.size === enabledParts.length ? 0 : enabledParts.length - descriptions.size}`);
console.log(`  DUPLICATE_H1:            ${h1s.size === enabledParts.length ? 0 : enabledParts.length - h1s.size}`);
console.log(`  THIN_PILOT_PAGES:        ${thinPilotPages}`);
console.log(`  BROKEN_ENCODING_PILOT:   ${brokenEncodingPilot}`);
console.log(`  RETAILER_SPAM_HITS:      ${retailerSpamHits}`);

if (thinPilotPages > 0) throw new Error(`🚨 THIN_PILOT_PAGES must be 0, got ${thinPilotPages}`);
if (brokenEncodingPilot > 0) throw new Error(`🚨 BROKEN_ENCODING_PILOT must be 0, got ${brokenEncodingPilot}`);
if (retailerSpamHits > 0) throw new Error(`🚨 RETAILER_SPAM_HITS must be 0, got ${retailerSpamHits}`);
console.log('  ✅ Pilot HTML & Metadata Quality Audit Passed 100% Clean.\n');

// 4. Audit Sitemap XML
console.log('▶ Auditing Sitemap.xml Pilot Inclusions & Fail-Closed Exclusion...');
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN);
const sitemapUrls = (sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || []).map(l => l.replace(/<\/?loc>/g, ''));
const sitemapPartUrls = sitemapUrls.filter(u => u.match(/\/onderdeelnummer\/\d{11}\//));

console.log(`  Sitemap Part URLs count: ${sitemapPartUrls.length}`);
console.log(`  Pilot Allowlist count:   ${enabledParts.length}`);

if (sitemapPartUrls.length !== enabledParts.length) {
  throw new Error(`🚨 SITEMAP COUNT MISMATCH: Expected ${enabledParts.length}, got ${sitemapPartUrls.length}`);
}

const sitemapPartNumbers = new Set(sitemapPartUrls.map(u => {
  const m = u.match(/\/onderdeelnummer\/(\d{11})\//);
  return m ? m[1] : null;
}).filter(Boolean));

const pilotSet = getPartIndexationPilotSet();

for (const p of enabledParts) {
  if (!sitemapPartNumbers.has(p.part_number)) {
    throw new Error(`🚨 Pilot part ${p.part_number} missing from sitemap.xml!`);
  }
}
for (const num of sitemapPartNumbers) {
  if (!pilotSet.has(num)) {
    throw new Error(`🚨 CRITICAL LEAK: Non-pilot part ${num} leaked into sitemap.xml!`);
  }
}
console.log('  Sitemap exact set equivalence: YES (50 / 50)');
console.log('  ✅ Sitemap Validation Passed.\n');

// 5. Explicit Negative Controls
console.log('▶ Testing Explicit Negative Controls (Non-Pilot Parts)...');
const negativeControls = [
  { part: '00000071043', label: 'generic hardware / holdout' },
  { part: '90223410980', label: 'generic screw' },
  { part: '92143200700', label: 'generic lock nut' },
  { part: '11181953500', label: 'non-selected part' },
  { part: '11210201200', label: 'non-pilot crankcase' },
  { part: '11280201250', label: 'non-pilot crankcase' },
  { part: '99999999999', label: 'unregistered part number' }
];

for (const ctrl of negativeControls) {
  const html = renderPartDetailPageHtml(ctrl.part, null, PRIMARY_ORIGIN);
  const robotsMatch = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
  const robots = robotsMatch ? robotsMatch[1] : null;

  if (robots !== 'noindex, follow') {
    throw new Error(`🚨 Negative control ${ctrl.part} (${ctrl.label}) expected 'noindex, follow', got '${robots}'!`);
  }
  if (sitemapPartNumbers.has(ctrl.part)) {
    throw new Error(`🚨 Negative control ${ctrl.part} (${ctrl.label}) leaked into sitemap.xml!`);
  }
}
console.log(`  All ${negativeControls.length} negative controls strictly confirmed 'noindex, follow' and excluded from sitemap.`);
console.log('  ✅ Negative Controls Passed.\n');

// 6. Mass Indexation & Allowlist Drift Tripwires
console.log('▶ Testing Mass Indexation & Classifier Drift Tripwires...');
if (sitemapPartUrls.length > 50) {
  throw new Error(`🚨 CRITICAL TRIPWIRE FAILURE: Sitemap contains ${sitemapPartUrls.length} parts (> 50)!`);
}
if (enabledParts.length > 50) {
  throw new Error(`🚨 CRITICAL TRIPWIRE FAILURE: Pilot allowlist contains ${enabledParts.length} parts (> 50)!`);
}

// Test that classifier tier alone does NOT enable indexation for an unlisted part
const strongCandidateNotSelected = '11270201216'; // Known strong candidate part not in pilot
if (isPartIndexationPilotEnabled(strongCandidateNotSelected)) {
  throw new Error(`Drift error: non-pilot part ${strongCandidateNotSelected} returned isPartIndexationPilotEnabled === true`);
}
const testHtml = renderPartDetailPageHtml(strongCandidateNotSelected, null, PRIMARY_ORIGIN);
const testRobots = testHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/i)?.[1];
if (testRobots !== 'noindex, follow') {
  throw new Error(`🚨 CRITICAL TRIPWIRE: Unlisted strong candidate received '${testRobots}' instead of 'noindex, follow'!`);
}
console.log('  Classifier drift tripwire passed: Classifier score does NOT automatically trigger indexation.');
console.log('  ✅ Tripwires Passed.\n');

console.log('================================================================');
console.log('🎉 ALL PHASE 54D PART INDEXATION PILOT CRITERIA PASSED 100%!');
console.log('================================================================\n');
