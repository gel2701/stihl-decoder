/**
 * Test Suite: Phase 54E — Parts Technical Data Integrity & Enrichment Foundation
 *
 * Verifies:
 * 1. Semantic diagram position correction and placeholder suppression (-1, 0, POS_UNSPECIFIED, OFFICIAL_REF)
 * 2. Deterministic section normalization (Title Case, aliases, unresolved handling, 0 semantic conflicts)
 * 3. Authenticated explicit STIHL Technical Information (TI) supersessions DAG (0 self-loops, 0 cycles, 0 conflicts)
 * 4. Safe technical display name normalization (0 public broken encodings, 0 retailer spam, raw preserved)
 * 5. Additive technical profile resolver API contracts and backwards compatibility
 * 6. UI template rendering safety (suppression of placeholder positions and unmapped sections, supersession notice)
 * 7. Hard invariant preservation and strict freezes (core data, 50-part SEO pilot, Amazon links, runtime scraping)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import {
  MAX_PILOT_SIZE,
  isPartIndexationPilotEnabled,
  getPartIndexationPilotList,
  getPartIndexationPilotSet
} from '../src/seo/PartIndexationPilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });

test('Phase 54E: Core Database & Catalog Invariants Unchanged', () => {
  const partsCount = db.prepare('SELECT count(*) as count FROM parts').get().count;
  const fitmentsCount = db.prepare('SELECT count(*) as count FROM model_part_fitments').get().count;
  const evidenceCount = db.prepare('SELECT count(*) as count FROM part_fitment_evidence').get().count;
  const configurationsCount = db.prepare('SELECT count(*) as count FROM parts_model_configurations').get().count;

  assert.strictEqual(partsCount, 17082, 'PARTS must remain exactly 17082');
  assert.strictEqual(fitmentsCount, 175106, 'FITMENTS must remain exactly 175106');
  assert.strictEqual(evidenceCount, 206607, 'EVIDENCE must remain exactly 206607');
  assert.strictEqual(configurationsCount, 766, 'CONFIGURATIONS must remain exactly 766');
});

test('Phase 54E: Diagram Position Helper Semantics & Placeholder Suppression', () => {
  // Rejections: null, empty, placeholders, misplaced sections
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition(null), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition(undefined), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition(''), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('   '), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('-1'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('0'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('POS_UNSPECIFIED'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('pos_unspecified'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('OFFICIAL_REF'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('official_ref'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('N/A'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('UNKNOWN'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('UNSPECIFIED'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('-'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('—'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('C - Chassis'), false);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('A - Handle'), false);

  // Acceptances: genuine numeric and alphanumeric positions
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('1'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('12'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('100'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('1A'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('1b'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('0.1'), true);
  assert.strictEqual(PartNormalizer.isMeaningfulDiagramPosition('0.2'), true);

  // normalizeDiagramPosition
  assert.strictEqual(PartNormalizer.normalizeDiagramPosition('POS_UNSPECIFIED'), null);
  assert.strictEqual(PartNormalizer.normalizeDiagramPosition('-1'), null);
  assert.strictEqual(PartNormalizer.normalizeDiagramPosition('  12  '), '12');
});

test('Phase 54E: Database Real Diagram Position Metrics & Placeholder Accounting', () => {
  const rows = db.prepare('SELECT part_number, diagram_position FROM model_part_fitments').all();
  let realPosFitments = 0;
  let placeholderPosFitments = 0;
  const partsWithRealPos = new Set();
  const allParts = new Set();

  for (const r of rows) {
    allParts.add(r.part_number);
    if (PartNormalizer.isMeaningfulDiagramPosition(r.diagram_position)) {
      realPosFitments++;
      partsWithRealPos.add(r.part_number);
    } else {
      placeholderPosFitments++;
    }
  }

  assert.strictEqual(realPosFitments, 169990, 'FITMENTS_WITH_REAL_POSITION must be 169990');
  assert.strictEqual(placeholderPosFitments, 5116, 'PLACEHOLDER_POSITIONS_EXCLUDED must be 5116');
  assert.strictEqual(partsWithRealPos.size, 16600, 'PARTS_WITH_REAL_POSITION must be 16600');
  assert.strictEqual(allParts.size - partsWithRealPos.size, 482, 'PARTS_WITHOUT_REAL_POSITION must be 482');
});

test('Phase 54E: Section Normalization, Aliases & Conflict Resolution', () => {
  // Test SectionNormalizer functions
  assert.strictEqual(SectionNormalizer.isMeaningfulSection(null), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection(''), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Unresolved Diagram Section'), false);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Clutch'), true);
  assert.strictEqual(SectionNormalizer.isMeaningfulSection('Oil pump'), true);

  // Normalization to Title Case
  assert.strictEqual(SectionNormalizer.normalizeSectionName('oil pump'), 'Oil Pump');
  assert.strictEqual(SectionNormalizer.normalizeSectionName('rewind starter'), 'Rewind Starter');
  assert.strictEqual(SectionNormalizer.normalizeSectionName('crankcase, cylinder'), 'Crankcase, Cylinder');

  // Aliases file
  const aliasesPath = path.join(rootDir, 'data', 'parts_section_aliases.json');
  assert.ok(fs.existsSync(aliasesPath), 'parts_section_aliases.json must exist');
  const aliasesData = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  assert.strictEqual(Object.keys(aliasesData.aliases || {}).length, 41, 'Must have 41 explicit section alias mappings');

  // Technical conflicts file
  const conflictsPath = path.join(rootDir, 'data', 'parts_technical_conflicts.json');
  assert.ok(fs.existsSync(conflictsPath), 'parts_technical_conflicts.json must exist');
  const conflictsData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
  assert.strictEqual(conflictsData.summary.semantic_section_conflicts, 0, 'Must have 0 semantic section conflicts');
  assert.strictEqual(conflictsData.summary.position_conflicts, 0, 'Must have 0 diagram position conflicts');
});

test('Phase 54E: Explicit Supersessions DAG Invariants (0 Self-loops, 0 Cycles, 0 Conflicts)', () => {
  const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
  assert.ok(fs.existsSync(supersessionsPath), 'parts_supersessions.json must exist');
  const doc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
  const relations = doc.relations || [];

  assert.strictEqual(relations.length, 22, 'Must contain exactly 22 authenticated TI replacement relations');
  assert.strictEqual(doc.invariants.self_loops, 0, 'Must record 0 self-loops');
  assert.strictEqual(doc.invariants.cycles, 0, 'Must record 0 cycles');
  assert.strictEqual(doc.invariants.conflicts, 0, 'Must record 0 conflicts');

  // Verify zero self-loops
  for (const r of relations) {
    assert.notStrictEqual(r.from_part, r.to_part, `Self-loop detected on ${r.from_part}`);
    assert.match(r.from_part, /^\d{11}$/, 'from_part must be 11 digits');
    assert.match(r.to_part, /^\d{11}$/, 'to_part must be 11 digits');
    assert.strictEqual(r.relation, 'SUPERSEDED_BY');
  }

  // Verify deterministic mapping (0 divergent conflicts)
  const graph = new Map();
  for (const r of relations) {
    if (graph.has(r.from_part)) {
      assert.strictEqual(graph.get(r.from_part), r.to_part, `Conflicting target for ${r.from_part}`);
    } else {
      graph.set(r.from_part, r.to_part);
    }
  }

  // Verify acyclic DAG (0 cycles)
  for (const startNode of graph.keys()) {
    const visited = new Set();
    let curr = startNode;
    while (curr && graph.has(curr)) {
      assert.ok(!visited.has(curr), `Cycle detected involving node ${curr}`);
      visited.add(curr);
      curr = graph.get(curr);
    }
  }

  // Verify SQLite database populated for active in-catalog relations
  const dbSupersededCount = db.prepare('SELECT count(*) as count FROM model_part_fitments WHERE superseded_by IS NOT NULL').get().count;
  assert.strictEqual(dbSupersededCount, 103, 'Must have 103 fitment records with populated superseded_by');
});

test('Phase 54E: Safe Part Name Normalization & Quality Targets', () => {
  // Explicit overrides
  assert.strictEqual(PartNameNormalizer.normalizePartName('Rewind starter', '11230802104'), 'Handstarter');
  assert.strictEqual(PartNameNormalizer.normalizePartName('PolyCut blades pack', '40080071000'), 'Maaimesjes PolyCut 2-2 / 3-2');

  // Dutch technical dictionary
  assert.strictEqual(PartNameNormalizer.normalizePartName('Clutch', '11231602050'), 'Koppeling');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Oil pump', '11236403200'), 'Oliepomp');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Spark plug', '00004007000'), 'Bougie');

  // Prefix and retailer stripping
  assert.strictEqual(PartNameNormalizer.normalizePartName('Stihl 1123 160 2050 Clutch', '11231602050'), 'Koppeling');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Genuine STIHL Air Filter for MS 170', '11301240800'), 'Luchtfilter');

  // Character encoding fixes
  assert.strictEqual(PartNameNormalizer.normalizePartName('Gasket &#8209; Special', '11230290500'), 'Gasket - Special');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Capacitor 0.22 \uFFFD F', '11234000100'), 'Capacitor 0.22 µF');

  // Full catalog quality scan (0 broken encodings, 0 retailer spam)
  const allParts = db.prepare('SELECT part_number, part_name FROM parts').all();
  let brokenEncoding = 0;
  let retailerSpam = 0;

  for (const p of allParts) {
    const norm = PartNameNormalizer.normalizePartName(p.part_name, p.part_number);
    if (norm.includes('&#') || norm.includes('\uFFFD') || norm.includes('Ã¸') || norm.includes('Ã¤') || norm.includes('Ã¼') || norm.includes('Ã¶')) {
      brokenEncoding++;
    }
    if (/\b(?:genuine|for stihl)\b/i.test(norm)) {
      retailerSpam++;
    }
  }

  assert.strictEqual(brokenEncoding, 0, 'PUBLIC_BROKEN_ENCODING_NAMES must be 0');
  assert.strictEqual(retailerSpam, 0, 'PUBLIC_RETAILER_SPAM_NAMES must be 0');
});

test('Phase 54E: PartCatalogResolver Technical Profile & Provenance Contract', () => {
  const part = PartCatalogResolver.resolvePartNumber('11231602050');
  assert.ok(part !== null, 'Resolver must resolve canonical part 11231602050');

  // Additive technical profile object
  assert.ok(part.technical_profile !== undefined, 'technical_profile must exist');
  assert.strictEqual(part.technical_profile.canonical_part_number, '11231602050');
  assert.strictEqual(part.technical_profile.display_name, 'Koppeling');
  assert.strictEqual(part.technical_profile.part_name_raw, 'Stihl Clutch');
  assert.strictEqual(part.technical_profile.has_meaningful_position, true);
  assert.ok(Array.isArray(part.technical_profile.sections));
  assert.ok(Array.isArray(part.technical_profile.canonical_sections));
  assert.ok(Array.isArray(part.technical_profile.diagram_contexts));

  // Fitment level provenance
  assert.ok(part.fitments.length > 0, 'Part must have fitments');
  const fitment = part.fitments[0];
  assert.ok(fitment.section_name_raw !== undefined, 'fitment.section_name_raw must exist');
  assert.ok(fitment.section_name_canonical !== undefined, 'fitment.section_name_canonical must exist');
  assert.ok(fitment.diagram_position_raw !== undefined, 'fitment.diagram_position_raw must exist');
  assert.ok(typeof fitment.has_meaningful_position === 'boolean', 'fitment.has_meaningful_position must be boolean');

  // Part with active supersession
  const supersededPart = PartCatalogResolver.resolvePartNumber('42034001301');
  assert.ok(supersededPart !== null, 'Resolver must resolve superseded part 42034001301');
  assert.ok(supersededPart.technical_profile.supersession !== null, 'supersession profile must be present');
  assert.strictEqual(supersededPart.technical_profile.supersession.replaced_by, '42034001302');
  assert.strictEqual(supersededPart.technical_profile.supersession.relation, 'SUPERSEDED_BY');
  assert.strictEqual(supersededPart.technical_profile.supersession.active_in_catalog, true);
});

test('Phase 54E: Public Template Rendering & Leak Prevention', () => {
  // Part detail template
  const part = PartCatalogResolver.resolvePartNumber('11231602050');
  const detailHtml = renderPartDetailPageHtml(part);

  assert.ok(!detailHtml.includes('POS_UNSPECIFIED'), 'PartDetail HTML must never contain POS_UNSPECIFIED');
  assert.ok(!detailHtml.includes('OFFICIAL_REF'), 'PartDetail HTML must never contain OFFICIAL_REF');
  assert.ok(!detailHtml.includes('Unresolved Diagram Section'), 'PartDetail HTML must never render Unresolved Diagram Section heading');

  // Model parts template
  const mockModel = { id: 'ms_170', slug: 'ms-170', model_number: 'MS 170', model_name: 'MS 170 Kettingzaag', category_slug: 'kettingzaag' };
  const modelPartsHtml = renderModelPartsPageHtml(mockModel, [part]);

  assert.ok(!modelPartsHtml.includes('POS_UNSPECIFIED'), 'ModelParts HTML must never contain POS_UNSPECIFIED');
  assert.ok(!modelPartsHtml.includes('OFFICIAL_REF'), 'ModelParts HTML must never contain OFFICIAL_REF');

  // Superseded part notice banner in UI
  const supersededPart = PartCatalogResolver.resolvePartNumber('42034001301');
  const supersededHtml = renderPartDetailPageHtml(supersededPart);
  assert.ok(supersededHtml.includes('vervangen door'), 'Superseded part UI must display replacement notice');
  assert.ok(supersededHtml.includes('4203 400 1302'), 'Superseded part UI must link to replacement part number');
});

test('Phase 54E: Strict Freezes (Phase 54D SEO Pilot, Amazon Links, Invariants)', () => {
  // SEO Pilot freeze
  const pilotList = getPartIndexationPilotList();
  const pilotSet = getPartIndexationPilotSet();

  assert.strictEqual(pilotList.length, 50, 'PHASE54D_PILOT_SIZE must remain exactly 50');
  assert.strictEqual(MAX_PILOT_SIZE, 50, 'MAX_PILOT_SIZE must remain 50');
  assert.ok(pilotSet.has('11231602050'), 'Pilot retains canonical clutch part');
  assert.ok(pilotSet.has('11256401701'), 'Pilot retains canonical bumper spike part');

  // Commercial freeze: 0 direct ASIN links, 17,082 search fallbacks
  const offersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
  assert.ok(fs.existsSync(offersPath), 'amazon_part_offers.json must exist');
  const offersData = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  const directAsins = (offersData.offers || []).filter(o => o.asin);
  assert.strictEqual(directAsins.length, 0, 'VERIFIED_DIRECT_ASIN_LINKS must remain 0');
});
