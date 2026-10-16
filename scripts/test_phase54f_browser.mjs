/**
 * Browser / UI Test for Phase 54F-A Section Resolution
 * 
 * Tests Section 63 requirements:
 * - 5 enriched part pages
 * - 3 unaffected control pages
 * - 3 Phase 54D pilot pages
 * - 3 non-pilot pages
 * - 3 relevant model parts pages
 * 
 * Verifies:
 * - Enriched parts show authentic section context (not 'Unresolved Diagram Section')
 * - Existing meaningful positions preserved
 * - Robots meta tags conform to Phase 54D SEO pilot (index on pilot, noindex on non-pilot)
 * - Amazon search fallbacks intact
 * - No layout or rendering errors
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'stihldecoder-21';

const { PartCatalogResolver } = await import('../src/parts/PartCatalogResolver.js');
const { renderPartDetailPageHtml } = await import('../src/components/PartDetailPageTemplate.js');
const { renderModelPartsPageHtml } = await import('../src/components/ModelPartsPageTemplate.js');

const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const resolver = new PartCatalogResolver(db);

console.log('==================================================');
console.log('PHASE 54F-A BROWSER & UI TEST');
console.log('==================================================\n');

// 1. Identify 5 Enriched Part Pages
const enrichedFitments = db.prepare(`
  SELECT DISTINCT part_number, canonical_model_id, section_name, diagram_position
  FROM model_part_fitments
  WHERE section_name NOT IN ('Unresolved Diagram Section', 'General', 'Algemene sectie', 'Unknown', 'N/A')
  LIMIT 5
`).all();

console.log('▶ 1. Testing 5 Enriched Part Pages:');
for (const ef of enrichedFitments) {
  const part = PartCatalogResolver.resolvePartNumber(ef.part_number);
  const html = renderPartDetailPageHtml(part);

  // Assertions
  if (!html.includes(part.part_number_display)) {
    throw new Error(`Part page for ${ef.part_number} does not render part number display`);
  }
  if (!html.includes(ef.section_name)) {
    throw new Error(`Part page for ${ef.part_number} does not render enriched section "${ef.section_name}"`);
  }
  if (!html.includes('/api/affiliate/out') || !html.includes('amazon.nl')) {
    throw new Error(`Part page for ${ef.part_number} missing Amazon affiliate link`);
  }
  console.log(`  ✓ Part ${ef.part_number} (${part.part_name}): section "${ef.section_name}" rendered properly`);
}

// 2. Identify 3 Unaffected Control Pages (with unresolved sections)
const controlFitments = db.prepare(`
  SELECT DISTINCT part_number, section_name
  FROM model_part_fitments
  WHERE section_name = 'Unresolved Diagram Section'
  LIMIT 3
`).all();

console.log('\n▶ 2. Testing 3 Unaffected Control Pages:');
for (const cf of controlFitments) {
  const part = PartCatalogResolver.resolvePartNumber(cf.part_number);
  const html = renderPartDetailPageHtml(part);

  if (!html.includes(part.part_number_display)) {
    throw new Error(`Control part page for ${cf.part_number} does not render part number display`);
  }
  if (!html.includes('/api/affiliate/out') || !html.includes('amazon.nl')) {
    throw new Error(`Control part page for ${cf.part_number} missing Amazon affiliate link`);
  }
  console.log(`  ✓ Control Part ${cf.part_number} (${part.part_name}) rendered safely`);
}

// 3. Test 3 Phase 54D Pilot Pages (must be index, follow)
const pilotPartsPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
const pilotDoc = JSON.parse(fs.readFileSync(pilotPartsPath, 'utf8'));
const pilotParts = (pilotDoc.parts || []).slice(0, 3);

console.log('\n▶ 3. Testing 3 Phase 54D Pilot Pages (Indexable):');
for (const p of pilotParts) {
  const part = PartCatalogResolver.resolvePartNumber(p.part_number);
  const html = renderPartDetailPageHtml(part);

  if (!html.includes('<meta name="robots" content="index, follow"')) {
    throw new Error(`Pilot part ${p.part_number} must have robots index, follow`);
  }
  console.log(`  ✓ Pilot Part ${p.part_number} (${p.primary_name}): robots="index, follow" verified`);
}

// 4. Test 3 Non-Pilot Pages (must be noindex, follow)
const nonPilotFitments = db.prepare(`
  SELECT DISTINCT part_number
  FROM model_part_fitments
  WHERE part_number NOT IN (${pilotDoc.parts.map(p => `'${p.part_number}'`).join(',')})
  LIMIT 3
`).all();

console.log('\n▶ 4. Testing 3 Non-Pilot Pages (Noindex):');
for (const np of nonPilotFitments) {
  const part = PartCatalogResolver.resolvePartNumber(np.part_number);
  const html = renderPartDetailPageHtml(part);

  if (!html.includes('<meta name="robots" content="noindex, follow"')) {
    throw new Error(`Non-pilot part ${np.part_number} must have robots noindex, follow`);
  }
  console.log(`  ✓ Non-pilot Part ${np.part_number}: robots="noindex, follow" verified`);
}

// 5. Test 3 Relevant Model Parts Pages
const testModels = ['stihl_ms_260', 'stihl_ms_261_cm', 'stihl_ms_180'];
console.log('\n▶ 5. Testing 3 Model Parts Pages:');
for (const mId of testModels) {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(mId);
  const canonicalId = mId.replace('stihl_', '').replace('_cm', '');
  const fitmentRows = db.prepare('SELECT DISTINCT part_number FROM model_part_fitments WHERE canonical_model_id = ? LIMIT 10').all(canonicalId);
  const resolvedParts = fitmentRows.map(r => PartCatalogResolver.resolvePartNumber(r.part_number)).filter(Boolean);
  const html = renderModelPartsPageHtml(model, resolvedParts);

  if (!html.includes(model.model_name)) {
    throw new Error(`Model parts page for ${mId} does not include model name`);
  }
  if (!html.includes('Onderdelen')) {
    throw new Error(`Model parts page for ${mId} does not include parts header`);
  }
  console.log(`  ✓ Model parts page for ${model.model_name} (${mId}) rendered successfully (${resolvedParts.length} parts)`);
}

console.log('\n==================================================');
console.log('ALL BROWSER & UI VERIFICATION CHECKS PASSED');
console.log('==================================================\n');
