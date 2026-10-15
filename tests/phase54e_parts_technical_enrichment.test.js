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

  // Verify SQLite database populated for active in-catalog relations under strict scoping
  const dbSupersededCount = db.prepare('SELECT count(*) as count FROM model_part_fitments WHERE superseded_by IS NOT NULL').get().count;
  assert.strictEqual(dbSupersededCount, 6, 'Must have 6 fitment records with populated superseded_by (ms_440 and ms_460 only)');
});

test('Phase 54E: Safe Part Name Normalization & Quality Targets', () => {
  // Explicit overrides
  assert.strictEqual(PartNameNormalizer.normalizePartName('Rewind starter', '11230802104'), 'Handstarter');
  assert.strictEqual(PartNameNormalizer.normalizePartName('PolyCut blades pack', '40080071000'), 'Maaimesjes PolyCut 2-2 / 3-2');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Stihl 00006051020 Capacitor 30\uFFFDF', '00006051020'), 'Condensator 30 µF');

  // Dutch technical dictionary
  assert.strictEqual(PartNameNormalizer.normalizePartName('Clutch', '11231602050'), 'Koppeling');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Oil pump', '11236403200'), 'Oliepomp');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Spark plug', '00004007000'), 'Bougie');

  // Prefix and retailer stripping
  assert.strictEqual(PartNameNormalizer.normalizePartName('Stihl 1123 160 2050 Clutch', '11231602050'), 'Koppeling');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Genuine STIHL Air Filter for MS 170', '11301240800'), 'Luchtfilter');

  // Character encoding fixes & fail-closed neutral fallback
  assert.strictEqual(PartNameNormalizer.normalizePartName('Gasket &#8209; Special', '11230290500'), 'Gasket - Special');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Capacitor 0.22 \uFFFD F', '11234000100'), 'Onderdeel 1123 400 0100');
  assert.strictEqual(PartNameNormalizer.normalizePartName('Stihl Support \uFFFD 25.4Mm', '00001822100'), 'Onderdeel 0000 182 2100');

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

  // Superseded part notice banner in UI with serial qualification
  const supersededPart = PartCatalogResolver.resolvePartNumber('42034001301');
  const supersededHtml = renderPartDetailPageHtml(supersededPart);
  assert.ok(supersededHtml.includes('249904357'), 'Superseded part UI must display serial qualification 249904357');
  assert.ok(supersededHtml.includes('4203 400 1302'), 'Superseded part UI must link to replacement part number');
  assert.ok(!supersededHtml.includes('is dit onderdeelnummer vervangen door'), 'Superseded part UI must not claim unconditional replacement');
});

test('Phase 54E-R1: Supersession Scope Safety & Scoped Applicability', () => {
  // 1. Serial-scoped supersession does not populate all fitments
  const serialFitmentsCount = db.prepare('SELECT count(*) as count FROM model_part_fitments WHERE part_number IN (?, ?, ?) AND superseded_by IS NOT NULL').get('42034001301', '11320300401', '00003503500').count;
  assert.strictEqual(serialFitmentsCount, 0, 'Serial-scoped relations must have 0 unconditional fitments');

  // 2. 42034001301 scope = serial >= 249904357
  const part4203 = PartCatalogResolver.resolvePartNumber('42034001301');
  assert.ok(part4203.technical_profile.supersession !== null);
  assert.strictEqual(part4203.technical_profile.supersession.scope?.serial_condition?.serial, '249904357');
  assert.strictEqual(part4203.technical_profile.supersession.scope?.serial_condition?.operator, 'GTE');
  assert.strictEqual(part4203.technical_profile.supersession.applicability, 'SCOPED_EXPLICIT');

  // 3. 11320300401 scope = serial >= 246534711
  const part1132 = PartCatalogResolver.resolvePartNumber('11320300401');
  assert.ok(part1132.technical_profile.supersession !== null);
  assert.strictEqual(part1132.technical_profile.supersession.scope?.serial_condition?.serial, '246534711');
  assert.strictEqual(part1132.technical_profile.supersession.scope?.serial_condition?.operator, 'GTE');

  // 4. Public serial-scoped wording is conditional
  const html4203 = renderPartDetailPageHtml(part4203);
  assert.ok(html4203.includes('249904357'), 'Public serial-scoped copy must mention serial threshold');
  assert.ok(!html4203.includes('is dit onderdeelnummer vervangen door'), 'Public copy must not state unconditional replacement');

  // 5. Scope-unresolved / unconfirmed relation is not definitive public replacement
  const part1122 = PartCatalogResolver.resolvePartNumber('11220300407');
  assert.strictEqual(part1122.technical_profile.supersession?.public_active, false);
  assert.strictEqual(part1122.technical_profile.supersession?.applicability, 'EVIDENCE_ONLY_SCOPE_UNRESOLVED');
  const html1122 = renderPartDetailPageHtml(part1122);
  assert.ok(!html1122.includes('Vervangen onderdeelnummer'), 'Unresolved relation must not render banner');
  assert.ok(!html1122.includes('Opvolgend Onderdeelnummer'), 'Unresolved relation must not render notice');

  // 6. Target-not-in-catalog generates no broken internal link
  const syntheticPart = {
    part_number: '99990001111',
    part_name: 'Test Part',
    fitment_count: 1,
    fitments: [],
    compatible_models: [],
    technical_profile: {
      display_name: 'Test Part',
      supersession: {
        replaced_by: '88880002222',
        public_active: true,
        applicability: 'SCOPED_EXPLICIT',
        target_in_catalog: false,
        scope: { serial_condition: null, model_ids: ['ms_170'] }
      }
    }
  };
  const syntheticHtml = renderPartDetailPageHtml(syntheticPart);
  assert.ok(!syntheticHtml.includes('href="/onderdeelnummer/88880002222/"'), 'Target not in catalog must NOT generate <a> link');
  assert.ok(syntheticHtml.includes('8888 000 2222') || syntheticHtml.includes('88880002222'), 'Target number rendered as text');
});

test('Phase 54E-R1: Encoding Fail-Closed Hardening & Normalization Idempotence', () => {
  // 1. U+FFFD is never globally mapped to Ø
  const testRaw = 'Stihl Support \uFFFD 25.4Mm';
  const norm = PartNameNormalizer.normalizePartName(testRaw, '00001822100');
  assert.ok(!norm.includes('Ø'), 'U+FFFD must NEVER be mapped to Ø');
  assert.strictEqual(norm, 'Onderdeel 0000 182 2100', 'Unknown encoding must fail-closed to neutral fallback');

  // 2. Unknown encoding without part number returns 'STIHL onderdeel'
  assert.strictEqual(PartNameNormalizer.normalizePartName(testRaw), 'STIHL onderdeel');

  // 3. Raw corrupt source string remains intact in DB
  const rawDbPart = db.prepare('SELECT part_name FROM parts WHERE part_number = ?').get('00001822100');
  assert.strictEqual(rawDbPart.part_name, 'Stihl Support \uFFFD 25.4Mm', 'Raw corrupt name preserved in database');

  // 4. Name normalization idempotent across full catalog (all 17,082 parts)
  const allParts = db.prepare('SELECT part_number, part_name FROM parts').all();
  let nonIdempotent = 0;
  for (const p of allParts) {
    const n1 = PartNameNormalizer.normalizePartName(p.part_name, p.part_number);
    const n2 = PartNameNormalizer.normalizePartName(n1, p.part_number);
    if (n1 !== n2) nonIdempotent++;
  }
  assert.strictEqual(nonIdempotent, 0, 'normalize(normalize(raw)) === normalize(raw) for all 17,082 parts');
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

test('Phase 54E-R2: Diagram Position Accounting & Field Population Integrity', () => {
  // Helper test for isRawDiagramPosition
  assert.strictEqual(PartNormalizer.isRawDiagramPosition(null), false);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition(undefined), false);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition(''), false);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('   '), false);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('1'), true);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('2A'), true);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('-1'), true);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('0'), true);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('POS_UNSPECIFIED'), true);
  assert.strictEqual(PartNormalizer.isRawDiagramPosition('OFFICIAL_REF'), true);

  const fitmentRows = db.prepare('SELECT part_number, diagram_position FROM model_part_fitments').all();
  const totalParts = db.prepare('SELECT COUNT(*) as count FROM parts').get().count;
  const totalFitments = fitmentRows.length;

  let fitmentsWithRawPosition = 0;
  let fitmentsWithoutRawPosition = 0;
  let fitmentsWithMeaningfulPosition = 0;
  let fitmentsWithoutMeaningfulPosition = 0;
  let rawPlaceholderPositions = 0;
  let missingPositionValues = 0;

  const partsWithRawPosition = new Set();
  const partsWithMeaningfulPosition = new Set();

  for (const f of fitmentRows) {
    const hasRaw = PartNormalizer.isRawDiagramPosition(f.diagram_position);
    const hasMeaningful = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);

    if (hasRaw) {
      fitmentsWithRawPosition++;
      partsWithRawPosition.add(f.part_number);
    } else {
      fitmentsWithoutRawPosition++;
      missingPositionValues++;
    }

    if (hasMeaningful) {
      fitmentsWithMeaningfulPosition++;
      partsWithMeaningfulPosition.add(f.part_number);
    } else {
      fitmentsWithoutMeaningfulPosition++;
    }

    if (hasRaw && !hasMeaningful) {
      rawPlaceholderPositions++;
    }
  }

  const partsWithoutRawPosition = totalParts - partsWithRawPosition.size;
  const partsWithoutMeaningfulPosition = totalParts - partsWithMeaningfulPosition.size;
  const placeholderPositionsExcluded = rawPlaceholderPositions;

  // Assertions
  assert.strictEqual(fitmentsWithRawPosition, 175106, 'FITMENTS_WITH_RAW_POSITION_VALUE must be 175106');
  assert.strictEqual(fitmentsWithMeaningfulPosition, 169990, 'FITMENTS_WITH_MEANINGFUL_POSITION must be 169990');
  assert.strictEqual(fitmentsWithoutRawPosition, 0, 'FITMENTS_WITHOUT_RAW_POSITION_VALUE must be 0');
  assert.strictEqual(fitmentsWithoutMeaningfulPosition, 5116, 'FITMENTS_WITHOUT_MEANINGFUL_POSITION must be 5116');

  assert.strictEqual(partsWithRawPosition.size, 17082, 'PARTS_WITH_RAW_POSITION_VALUE must be 17082');
  assert.strictEqual(partsWithMeaningfulPosition.size, 16600, 'PARTS_WITH_MEANINGFUL_POSITION must be 16600');
  assert.strictEqual(partsWithoutRawPosition, 0, 'PARTS_WITHOUT_RAW_POSITION_VALUE must be 0');
  assert.strictEqual(partsWithoutMeaningfulPosition, 482, 'PARTS_WITHOUT_MEANINGFUL_POSITION must be 482');

  assert.strictEqual(rawPlaceholderPositions, 5116, 'RAW_PLACEHOLDER_POSITIONS must be 5116');
  assert.strictEqual(missingPositionValues, 0, 'MISSING_POSITION_VALUES must be 0');
  assert.strictEqual(placeholderPositionsExcluded, 5116, 'PLACEHOLDER_POSITIONS_EXCLUDED must be 5116');

  // Accounting consistency
  assert.ok(fitmentsWithRawPosition >= fitmentsWithMeaningfulPosition, 'FITMENTS_WITH_RAW_POSITION_VALUE >= FITMENTS_WITH_MEANINGFUL_POSITION');
  assert.ok(partsWithRawPosition.size >= partsWithMeaningfulPosition.size, 'PARTS_WITH_RAW_POSITION_VALUE >= PARTS_WITH_MEANINGFUL_POSITION');
  assert.strictEqual(fitmentsWithRawPosition + fitmentsWithoutRawPosition, totalFitments, 'Raw + without raw must equal total fitments');
});

test('Phase 54E-R2: Exact Supersession Pair Provenance & Directional Verification (Synthetic & Real Positive)', () => {
  // 1. Helper test: normalizeEvidencePartNumber
  assert.strictEqual(PartNormalizer.normalizeEvidencePartNumber('4203 400 1301'), '42034001301');
  assert.strictEqual(PartNormalizer.normalizeEvidencePartNumber('4203-400-1301'), '42034001301');
  assert.strictEqual(PartNormalizer.normalizeEvidencePartNumber('42034001301'), '42034001301');
  assert.strictEqual(PartNormalizer.normalizeEvidencePartNumber('4203 400'), null);
  assert.strictEqual(PartNormalizer.normalizeEvidencePartNumber(null), null);

  // 2. Synthetic negative fixtures
  const officialSnippet = 'The previous ignition module 4203 400 1301 will be replaced from serial number 2 49 904 357 by a new ignition module 4203 400 1302.';

  // Synthetic Negative A: wrong from_part
  const negA = PartNormalizer.verifyExactPairInEvidence(officialSnippet, '99999999999', '42034001302');
  assert.strictEqual(negA.hasFrom, false);
  assert.strictEqual(negA.hasTo, true);
  assert.strictEqual(negA.directionConfirmed, false);
  assert.strictEqual(negA.valid, false);

  // Synthetic Negative B: wrong to_part
  const negB = PartNormalizer.verifyExactPairInEvidence(officialSnippet, '42034001301', '99999999999');
  assert.strictEqual(negB.hasFrom, true);
  assert.strictEqual(negB.hasTo, false);
  assert.strictEqual(negB.directionConfirmed, false);
  assert.strictEqual(negB.valid, false);

  // Synthetic Negative C: both numbers present but no replacement semantics
  const snippetNoSemantics = 'Inventory report lists part 4203 400 1301 and accessory 4203 400 1302 on the shelf.';
  const negC = PartNormalizer.verifyExactPairInEvidence(snippetNoSemantics, '42034001301', '42034001302');
  assert.strictEqual(negC.hasFrom, true);
  assert.strictEqual(negC.hasTo, true);
  assert.strictEqual(negC.hasSemantics, false);
  assert.strictEqual(negC.directionConfirmed, false);
  assert.strictEqual(negC.valid, false);

  // Synthetic Negative D: reversed direction (target -> from)
  const negD = PartNormalizer.verifyExactPairInEvidence(officialSnippet, '42034001302', '42034001301');
  assert.strictEqual(negD.hasFrom, true);
  assert.strictEqual(negD.hasTo, true);
  assert.strictEqual(negD.directionConfirmed, false, 'Reversed direction must NOT be confirmed');
  assert.strictEqual(negD.valid, false);

  // 3. Real positive test cases from authoritative phase35c31 evidence corpus
  const phase35c31Path = path.join(rootDir, 'data', 'phase35c31_authenticity_audit.json');
  const phase35c31Data = JSON.parse(fs.readFileSync(phase35c31Path, 'utf8'));
  const docCorpus = new Map();
  phase35c31Data.documents.forEach(d => docCorpus.set(d.publication_id, d));

  // Case 1: 42034001301 -> 42034001302 in TI_19_2001_02_01_01
  const doc1 = docCorpus.get('TI_19_2001_02_01_01');
  assert.ok(doc1 && doc1.auth_after === 'AUTHENTICATED_OFFICIAL');
  const res1 = PartNormalizer.verifyExactPairInEvidence(doc1.evidence_snippet, '42034001301', '42034001302');
  assert.strictEqual(res1.hasFrom, true, 'Case 1 EXACT_FROM_PART_MATCH = YES');
  assert.strictEqual(res1.hasTo, true, 'Case 1 EXACT_TO_PART_MATCH = YES');
  assert.strictEqual(res1.hasSemantics, true, 'Case 1 EXPLICIT_REPLACEMENT_SEMANTICS = YES');
  assert.strictEqual(res1.directionConfirmed, true, 'Case 1 DIRECTION_CONFIRMED = YES');
  assert.strictEqual(res1.valid, true);

  // Case 2: 11320300401 -> 11320300402 in TI_06_2000_30
  const doc2 = docCorpus.get('TI_06_2000_30');
  assert.ok(doc2 && doc2.auth_after === 'AUTHENTICATED_OFFICIAL');
  const res2 = PartNormalizer.verifyExactPairInEvidence(doc2.evidence_snippet, '11320300401', '11320300402');
  assert.strictEqual(res2.hasFrom, true, 'Case 2 EXACT_FROM_PART_MATCH = YES');
  assert.strictEqual(res2.hasTo, true, 'Case 2 EXACT_TO_PART_MATCH = YES');
  assert.strictEqual(res2.hasSemantics, true, 'Case 2 EXPLICIT_REPLACEMENT_SEMANTICS = YES');
  assert.strictEqual(res2.directionConfirmed, true, 'Case 2 DIRECTION_CONFIRMED = YES');
  assert.strictEqual(res2.valid, true);

  // Case 3: 11281621000 -> 11281621001 in TI_37_2001_02_01_01
  const doc3 = docCorpus.get('TI_37_2001_02_01_01');
  assert.ok(doc3 && doc3.auth_after === 'AUTHENTICATED_OFFICIAL');
  const res3 = PartNormalizer.verifyExactPairInEvidence(doc3.evidence_snippet, '11281621000', '11281621001');
  assert.strictEqual(res3.hasFrom, true, 'Case 3 EXACT_FROM_PART_MATCH = YES');
  assert.strictEqual(res3.hasTo, true, 'Case 3 EXACT_TO_PART_MATCH = YES');
  assert.strictEqual(res3.hasSemantics, true, 'Case 3 EXPLICIT_REPLACEMENT_SEMANTICS = YES');
  assert.strictEqual(res3.directionConfirmed, true, 'Case 3 DIRECTION_CONFIRMED = YES');
  assert.strictEqual(res3.valid, true);
});
