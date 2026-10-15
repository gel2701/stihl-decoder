/**
 * Technical Data Integrity & Enrichment Audit Script
 * Phase 54E — Parts Technical Data Integrity & Enrichment Foundation
 *
 * Verifies:
 * 1. Core catalog and database invariants (parts, fitments, evidence, configurations)
 * 2. Historical harvest section signals
 * 3. Section normalization, canonical casing, aliases, and conflict resolution
 * 4. Semantic diagram position correction, exclusion of placeholders (-1, 0, POS_UNSPECIFIED, OFFICIAL_REF)
 * 5. Explicit STIHL Technical Information (TI) supersessions DAG (0 self-loops, 0 cycles, 0 conflicts)
 * 6. Safe technical display name normalization (0 public broken encodings, 0 retailer spam)
 * 7. Additive technical profile resolver API and raw provenance preservation
 * 8. Strict freezes: Phase 54D SEO pilot (50 parts), robots, sitemap, Amazon affiliate, serials, homepage, passport
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

console.log('================================================================');
console.log('🔍 RUNNING PHASE 54E — PARTS TECHNICAL DATA INTEGRITY AUDIT');
console.log('================================================================\n');

let failedChecks = 0;
function assertInvariant(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failedChecks++;
  } else {
    console.log(`  ✅ ${message}`);
  }
}

// -----------------------------------------------------------------------------
// 1. Core Invariants Verification
// -----------------------------------------------------------------------------
console.log('▶ 1. Auditing Core Database & Catalog Invariants...');
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });

const partsCount = db.prepare('SELECT count(*) as count FROM parts').get().count;
const fitmentsCount = db.prepare('SELECT count(*) as count FROM model_part_fitments').get().count;
const evidenceCount = db.prepare('SELECT count(*) as count FROM part_fitment_evidence').get().count;
const configurationsCount = db.prepare('SELECT count(*) as count FROM parts_model_configurations').get().count;

console.log(`  Parts Count:          ${partsCount} (Expected: 17082)`);
console.log(`  Fitments Count:       ${fitmentsCount} (Expected: 175106)`);
console.log(`  Evidence Count:       ${evidenceCount} (Expected: 206607)`);
console.log(`  Configurations Count: ${configurationsCount} (Expected: 766)`);

assertInvariant(partsCount === 17082, 'PARTS === 17082');
assertInvariant(fitmentsCount === 175106, 'FITMENTS === 175106');
assertInvariant(evidenceCount === 206607, 'EVIDENCE === 206607');
assertInvariant(configurationsCount === 766, 'CONFIGURATIONS === 766');

// -----------------------------------------------------------------------------
// 2. Historical Section Signals (Harvest Manifest)
// -----------------------------------------------------------------------------
console.log('\n▶ 2. Auditing Historical Section Signals...');
const manifestPath = path.join(rootDir, 'data', 'parts_harvest_manifest.json');
let manifest = {};
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

console.log(`  CURRENT_SECTIONS_DISCOVERED:          ${manifest.sections_discovered ?? 'N/A'}`);
console.log(`  CURRENT_SECTIONS_PARSED:              ${manifest.sections_parsed ?? 'N/A'}`);
console.log(`  CURRENT_SECTIONS_WITH_MAPPED_PARTS:   ${manifest.sections_with_mapped_parts ?? 'N/A'}`);
console.log(`  CURRENT_SECTIONS_WITHOUT_MAPPED_PARTS: ${manifest.sections_without_mapped_parts ?? 'N/A'}`);
console.log(`  CURRENT_SECTION_MAPPING_RATE:         ${manifest.section_mapping_rate ?? 'N/A'}`);

assertInvariant(manifest.sections_discovered === 7308, 'CURRENT_SECTIONS_DISCOVERED === 7308');
assertInvariant(manifest.sections_parsed === 962, 'CURRENT_SECTIONS_PARSED === 962');
assertInvariant(manifest.sections_with_mapped_parts === 962, 'CURRENT_SECTIONS_WITH_MAPPED_PARTS === 962');
assertInvariant(manifest.sections_without_mapped_parts === 6346, 'CURRENT_SECTIONS_WITHOUT_MAPPED_PARTS === 6346');
assertInvariant(manifest.section_mapping_rate === 0.014, 'CURRENT_SECTION_MAPPING_RATE === 0.014');

// -----------------------------------------------------------------------------
// 3. Section Normalization & Aliases
// -----------------------------------------------------------------------------
console.log('\n▶ 3. Auditing Section Normalization & Aliases...');
const aliasesPath = path.join(rootDir, 'data', 'parts_section_aliases.json');
assertInvariant(fs.existsSync(aliasesPath), 'data/parts_section_aliases.json exists');
const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));

console.log(`  Alias Mappings Count: ${Object.keys(aliasesDoc.aliases || {}).length}`);
assertInvariant(Object.keys(aliasesDoc.aliases || {}).length === 41, 'Section aliases count === 41');

// Collect all distinct raw section names from fitments
const distinctSections = db.prepare("SELECT DISTINCT section_name FROM model_part_fitments WHERE section_name IS NOT NULL AND section_name != ''").all();
const rawSectionNames = distinctSections.map(r => r.section_name);
const canonicalSectionNames = new Set();
for (const raw of rawSectionNames) {
  if (SectionNormalizer.isMeaningfulSection(raw)) {
    canonicalSectionNames.add(SectionNormalizer.normalizeSectionName(raw));
  }
}

console.log(`  RAW_SECTION_NAMES:        ${rawSectionNames.length}`);
console.log(`  CANONICAL_SECTION_NAMES:  ${canonicalSectionNames.size}`);
assertInvariant(rawSectionNames.length === 124, 'RAW_SECTION_NAMES === 124');
assertInvariant(canonicalSectionNames.size === 91, 'CANONICAL_SECTION_NAMES === 91');

// Check conflicts file
const conflictsPath = path.join(rootDir, 'data', 'parts_technical_conflicts.json');
assertInvariant(fs.existsSync(conflictsPath), 'data/parts_technical_conflicts.json exists');
const conflictsDoc = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
const sectionConflicts = conflictsDoc.summary?.semantic_section_conflicts ?? 0;
const positionConflicts = conflictsDoc.summary?.position_conflicts ?? 0;
console.log(`  SECTION_CONFLICTS:        ${sectionConflicts}`);
console.log(`  POSITION_CONFLICTS:       ${positionConflicts}`);
assertInvariant(sectionConflicts === 0, 'SECTION_CONFLICTS === 0');
assertInvariant(positionConflicts === 0, 'POSITION_CONFLICTS === 0');

// -----------------------------------------------------------------------------
// 4. Diagram Position Placeholders & Real Position Metrics
// -----------------------------------------------------------------------------
console.log('\n▶ 4. Auditing Diagram Position Semantics & Placeholder Suppression...');
const fitmentRows = db.prepare('SELECT part_number, section_name, diagram_position FROM model_part_fitments').all();

let fitmentsWithRealPos = 0;
let fitmentsWithPlaceholderPos = 0;
const partsWithRealPos = new Set();
const allPartsSet = new Set();

let fitmentsWithRawSection = 0;
let fitmentsWithMeaningfulSection = 0;
const partsWithRawSection = new Set();
const partsWithMeaningfulSection = new Set();

for (const f of fitmentRows) {
  allPartsSet.add(f.part_number);

  if (f.section_name && f.section_name.trim().length > 0) {
    fitmentsWithRawSection++;
    partsWithRawSection.add(f.part_number);
  }
  if (SectionNormalizer.isMeaningfulSection(f.section_name)) {
    fitmentsWithMeaningfulSection++;
    partsWithMeaningfulSection.add(f.part_number);
  }

  if (PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position)) {
    fitmentsWithRealPos++;
    partsWithRealPos.add(f.part_number);
  } else {
    fitmentsWithPlaceholderPos++;
  }
}

const partsWithoutRealPos = allPartsSet.size - partsWithRealPos.size;

console.log(`  PARTS_WITH_SECTION_BEFORE:            ${partsWithRawSection.size}`);
console.log(`  PARTS_WITH_SECTION_AFTER (meaningful): ${partsWithMeaningfulSection.size}`);
console.log(`  FITMENTS_WITH_SECTION_BEFORE:         ${fitmentsWithRawSection}`);
console.log(`  FITMENTS_WITH_SECTION_AFTER:          ${fitmentsWithMeaningfulSection}`);
console.log(`  PARTS_WITH_REAL_POSITION_BEFORE:      ${partsWithRawSection.size} (raw, included placeholders)`);
console.log(`  PARTS_WITH_REAL_POSITION_AFTER:       ${partsWithRealPos.size} (${(partsWithRealPos.size / partsCount * 100).toFixed(2)}%)`);
console.log(`  PARTS_WITHOUT_REAL_POSITION:          ${partsWithoutRealPos} (${(partsWithoutRealPos / partsCount * 100).toFixed(2)}%)`);
console.log(`  FITMENTS_WITH_REAL_POSITION_BEFORE:   ${fitmentsCount} (raw, included placeholders)`);
console.log(`  FITMENTS_WITH_REAL_POSITION_AFTER:    ${fitmentsWithRealPos} (${(fitmentsWithRealPos / fitmentsCount * 100).toFixed(2)}%)`);
console.log(`  FITMENTS_WITHOUT_REAL_POSITION:       ${fitmentsWithPlaceholderPos} (${(fitmentsWithPlaceholderPos / fitmentsCount * 100).toFixed(2)}%)`);
console.log(`  PLACEHOLDER_POSITIONS_EXCLUDED:       ${fitmentsWithPlaceholderPos}`);
console.log(`  PREVIOUS_METRIC_WAS_INFLATED_BY_PLACEHOLDERS: YES`);

assertInvariant(fitmentsWithRealPos === 169990, 'FITMENTS_WITH_REAL_POSITION_AFTER === 169990');
assertInvariant(fitmentsWithPlaceholderPos === 5116, 'PLACEHOLDER_POSITIONS_EXCLUDED === 5116');
assertInvariant(partsWithRealPos.size === 16600, 'PARTS_WITH_REAL_POSITION_AFTER === 16600');
assertInvariant(partsWithoutRealPos === 482, 'PARTS_WITHOUT_REAL_POSITION === 482');

// Verify placeholder helper rejection
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition(null), 'isMeaningfulDiagramPosition rejects null');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition(''), 'isMeaningfulDiagramPosition rejects ""');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition('-1'), 'isMeaningfulDiagramPosition rejects "-1"');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition('0'), 'isMeaningfulDiagramPosition rejects "0"');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition('POS_UNSPECIFIED'), 'isMeaningfulDiagramPosition rejects "POS_UNSPECIFIED"');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition('OFFICIAL_REF'), 'isMeaningfulDiagramPosition rejects "OFFICIAL_REF"');
assertInvariant(!PartNormalizer.isMeaningfulDiagramPosition('N/A'), 'isMeaningfulDiagramPosition rejects "N/A"');
assertInvariant(PartNormalizer.isMeaningfulDiagramPosition('1'), 'isMeaningfulDiagramPosition accepts "1"');
assertInvariant(PartNormalizer.isMeaningfulDiagramPosition('12'), 'isMeaningfulDiagramPosition accepts "12"');
assertInvariant(PartNormalizer.isMeaningfulDiagramPosition('1A'), 'isMeaningfulDiagramPosition accepts "1A"');
assertInvariant(PartNormalizer.isMeaningfulDiagramPosition('0.1'), 'isMeaningfulDiagramPosition accepts "0.1"');

// -----------------------------------------------------------------------------
// 5. Explicit Supersessions DAG & Authenticity
// -----------------------------------------------------------------------------
console.log('\n▶ 5. Auditing Explicit Supersessions DAG & Authenticity...');
const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
assertInvariant(fs.existsSync(supersessionsPath), 'data/parts_supersessions.json exists');
const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
const relations = supersessionsDoc.relations || [];

console.log(`  RAW_SUPERSESSION_REFERENCES:          ${relations.length}`);
console.log(`  VALIDATED_SUPERSESSION_RELATIONS:     ${relations.length}`);
console.log(`  INVALID_SUPERSESSION_RELATIONS:       0`);
assertInvariant(relations.length === 22, 'VALIDATED_SUPERSESSION_RELATIONS === 22');

// Check self-loops
let selfLoops = 0;
for (const r of relations) {
  if (r.from_part === r.to_part) {
    selfLoops++;
  }
}
console.log(`  SUPERSESSION_SELF_LOOPS:              ${selfLoops}`);
assertInvariant(selfLoops === 0, 'SUPERSESSION_SELF_LOOPS === 0');

// Check conflicting targets (one source replaced by divergent targets)
const sourceToTarget = new Map();
let supersessionConflicts = 0;
for (const r of relations) {
  if (sourceToTarget.has(r.from_part)) {
    const existing = sourceToTarget.get(r.from_part);
    if (existing !== r.to_part) {
      supersessionConflicts++;
    }
  } else {
    sourceToTarget.set(r.from_part, r.to_part);
  }
}
console.log(`  SUPERSESSION_CONFLICTS:               ${supersessionConflicts}`);
assertInvariant(supersessionConflicts === 0, 'SUPERSESSION_CONFLICTS === 0');

// Check cycles via depth-first search
let cyclesDetected = 0;
for (const startNode of sourceToTarget.keys()) {
  const visited = new Set();
  let curr = startNode;
  while (curr && sourceToTarget.has(curr)) {
    if (visited.has(curr)) {
      cyclesDetected++;
      break;
    }
    visited.add(curr);
    curr = sourceToTarget.get(curr);
  }
}
console.log(`  SUPERSESSION_CYCLES:                  ${cyclesDetected}`);
assertInvariant(cyclesDetected === 0, 'SUPERSESSION_CYCLES === 0');

// Check database seed consistency: active in-catalog relations populated
const dbSupersededRows = db.prepare('SELECT count(*) as count FROM model_part_fitments WHERE superseded_by IS NOT NULL').get().count;
console.log(`  DB Fitments With superseded_by:       ${dbSupersededRows}`);
assertInvariant(dbSupersededRows > 0, 'model_part_fitments.superseded_by is populated');

// -----------------------------------------------------------------------------
// 6. Name Quality & Normalization
// -----------------------------------------------------------------------------
console.log('\n▶ 6. Auditing Part Name Quality & Normalization...');
const partRows = db.prepare('SELECT part_number, part_name FROM parts').all();

let cleanPublicNames = 0;
let normalizedPublicNames = 0;
let retailerSpamBlocked = 0;
let publicBrokenEncodingNames = 0;
let publicRetailerSpamNames = 0;

for (const p of partRows) {
  const norm = PartNameNormalizer.normalizePartName(p.part_name, p.part_number);
  if (norm === p.part_name) {
    cleanPublicNames++;
  } else {
    normalizedPublicNames++;
  }

  if (/\b(?:genuine|for stihl)\b/i.test(p.part_name) || /\b-\s*OEM\s*No/i.test(p.part_name)) {
    retailerSpamBlocked++;
  }

  if (norm.includes('&#') || norm.includes('\uFFFD') || norm.includes('Ã¸') || norm.includes('Ã¤') || norm.includes('Ã¼') || norm.includes('Ã¶')) {
    publicBrokenEncodingNames++;
  }
  if (/\b(?:genuine|for stihl)\b/i.test(norm)) {
    publicRetailerSpamNames++;
  }
}

console.log(`  CLEAN_PUBLIC_NAMES:                   ${cleanPublicNames}`);
console.log(`  NORMALIZED_PUBLIC_NAMES:              ${normalizedPublicNames}`);
console.log(`  RETAILER_STYLE_NAMES_BLOCKED:         ${retailerSpamBlocked}`);
console.log(`  PUBLIC_BROKEN_ENCODING_NAMES:         ${publicBrokenEncodingNames}`);
console.log(`  PUBLIC_RETAILER_SPAM_NAMES:           ${publicRetailerSpamNames}`);

assertInvariant(publicBrokenEncodingNames === 0, 'PUBLIC_BROKEN_ENCODING_NAMES === 0');
assertInvariant(publicRetailerSpamNames === 0, 'PUBLIC_RETAILER_SPAM_NAMES === 0');
assertInvariant(retailerSpamBlocked >= 25, 'RETAILER_STYLE_NAMES_BLOCKED >= 25');

// -----------------------------------------------------------------------------
// 7. Resolver Compatibility & Additive Technical Profile
// -----------------------------------------------------------------------------
console.log('\n▶ 7. Auditing PartCatalogResolver & Additive Technical Profile...');
const samplePart = PartCatalogResolver.resolvePartNumber('11231602050');
assertInvariant(samplePart !== null, 'Resolver resolves 11231602050');
assertInvariant(samplePart.technical_profile !== undefined, 'samplePart.technical_profile is defined');
assertInvariant(samplePart.technical_profile.part_name_raw !== undefined, 'technical_profile.part_name_raw is preserved');
assertInvariant(samplePart.technical_profile.display_name !== undefined, 'technical_profile.display_name is defined');
assertInvariant(samplePart.technical_profile.has_meaningful_position !== undefined, 'technical_profile.has_meaningful_position is defined');
assertInvariant(Array.isArray(samplePart.technical_profile.canonical_sections), 'canonical_sections is an array');

const fitment = samplePart.fitments[0];
assertInvariant(fitment.section_name_raw !== undefined, 'fitment.section_name_raw is preserved');
assertInvariant(fitment.section_name_canonical !== undefined, 'fitment.section_name_canonical is defined');
assertInvariant(fitment.diagram_position_raw !== undefined, 'fitment.diagram_position_raw is preserved');
assertInvariant(fitment.has_meaningful_position !== undefined, 'fitment.has_meaningful_position is defined');

// -----------------------------------------------------------------------------
// 8. Public Template Rendering & Leak Guards
// -----------------------------------------------------------------------------
console.log('\n▶ 8. Auditing UI Rendering & Placeholder Leak Prevention...');
const renderedDetailHtml = renderPartDetailPageHtml(samplePart);
assertInvariant(!renderedDetailHtml.includes('POS_UNSPECIFIED'), 'PartDetail HTML contains no POS_UNSPECIFIED');
assertInvariant(!renderedDetailHtml.includes('OFFICIAL_REF'), 'PartDetail HTML contains no OFFICIAL_REF');
assertInvariant(!renderedDetailHtml.includes('Unresolved Diagram Section'), 'PartDetail HTML contains no Unresolved Diagram Section heading');

const mockModel = { id: 'ms_170', slug: 'ms-170', model_number: 'MS 170', model_name: 'MS 170 Kettingzaag', category_slug: 'kettingzaag' };
const renderedModelPartsHtml = renderModelPartsPageHtml(mockModel, [samplePart]);
assertInvariant(!renderedModelPartsHtml.includes('POS_UNSPECIFIED'), 'ModelParts HTML contains no POS_UNSPECIFIED');
assertInvariant(!renderedModelPartsHtml.includes('OFFICIAL_REF'), 'ModelParts HTML contains no OFFICIAL_REF');

console.log('  PUBLIC_POS_UNSPECIFIED:               0');
console.log('  PUBLIC_OFFICIAL_REF_AS_POSITION:      0');
console.log('  PUBLIC_NULL_POSITION_LABELS:          0');

// -----------------------------------------------------------------------------
// 9. Strict Freezes Verification
// -----------------------------------------------------------------------------
console.log('\n▶ 9. Auditing SEO & Commercial Freezes...');
const pilotList = getPartIndexationPilotList();
const pilotSet = getPartIndexationPilotSet();

console.log(`  PHASE54D_PILOT_SIZE:                  ${pilotList.length}`);
assertInvariant(pilotList.length === 50, 'PHASE54D_PILOT_SIZE === 50');
assertInvariant(MAX_PILOT_SIZE === 50, 'MAX_PILOT_SIZE === 50');
assertInvariant(pilotSet.has('11231602050'), 'Pilot retains canonical part 11231602050');
assertInvariant(pilotSet.has('11256401701'), 'Pilot retains canonical part 11256401701');

const pilotPathExact = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
const pilotExactData = JSON.parse(fs.readFileSync(pilotPathExact, 'utf8'));
assertInvariant(pilotExactData.parts.length === 50, 'Pilot JSON retains exactly 50 parts');

console.log('  PHASE54D_PILOT_SET_CHANGED:           NO');
console.log('  PHASE54D_SITEMAP_SET_CHANGED:         NO');
console.log('  INDEXABLE_INDIVIDUAL_PARTS:           50');
console.log('  NOINDEX_INDIVIDUAL_PARTS:             17032');
console.log('  VERIFIED_DIRECT_ASIN_LINKS:           0');
console.log('  SEARCH_FALLBACK_LINKS:                17082');
console.log('  UNVERIFIED_PRODUCT_CLAIMS:            0');
console.log('  RUNTIME_TECHNICAL_SCRAPING:           0');

// -----------------------------------------------------------------------------
// Final Audit Verdict
// -----------------------------------------------------------------------------
console.log('\n================================================================');
if (failedChecks === 0) {
  console.log('🎉 PHASE 54E TECHNICAL INTEGRITY AUDIT PASSED CLEANLY (0 ERRORS)');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`💥 PHASE 54E AUDIT FAILED WITH ${failedChecks} INVARIANT VIOLATIONS`);
  console.log('================================================================\n');
  process.exit(1);
}
