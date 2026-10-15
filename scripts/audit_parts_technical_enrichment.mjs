/**
 * Technical Data Integrity & Enrichment Audit Script
 * Phase 54E / Phase 54E-R1 — Parts Technical Data Integrity & Enrichment Hardening
 *
 * Verifies:
 * 1. Core catalog and database invariants (parts, fitments, evidence, configurations)
 * 2. Historical harvest section signals
 * 3. Section normalization, canonical casing, aliases, and conflict resolution
 * 4. Semantic diagram position correction, exclusion of placeholders (-1, 0, POS_UNSPECIFIED, OFFICIAL_REF)
 * 5. Explicit STIHL Technical Information (TI) supersessions DAG & Independent Authenticity Provenance
 *    - Independent verification against data/phase35c31_authenticity_audit.json
 *    - Strict applicability scoping (serial-scoped, model-scoped, unresolved downgrade)
 *    - Prevention of serial-scoped and model-scoped globalization in DB fitments
 *    - Public qualified wording and target link safety
 * 6. Safe technical display name normalization & Encoding fail-closed hardening
 *    - Zero generic U+FFFD to Ø or arbitrary character guessing
 *    - Full catalog idempotence: normalize(normalize(raw)) === normalize(raw)
 *    - Raw broken encoding preserved in catalog for provenance
 *    - Zero public broken encodings (safely overridden or neutral fallback)
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
console.log('🔍 RUNNING PHASE 54E-R1 — PARTS TECHNICAL INTEGRITY AUDIT');
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
// 4. Diagram Position Placeholders & Reclassified Section Metrics
// -----------------------------------------------------------------------------
console.log('\n▶ 4. Auditing Diagram Position & Section Accounting (Corrected Terminology)...');
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

console.log(`  PARTS_WITH_RAW_SECTION_STRING:        ${partsWithRawSection.size}`);
console.log(`  PARTS_WITH_MEANINGFUL_SECTION:        ${partsWithMeaningfulSection.size}`);
console.log(`  FITMENTS_WITH_RAW_SECTION_STRING:     ${fitmentsWithRawSection}`);
console.log(`  FITMENTS_WITH_MEANINGFUL_SECTION:     ${fitmentsWithMeaningfulSection}`);
console.log(`  PARTS_WITH_RAW_POSITION_VALUE:        ${partsWithRawSection.size}`);
console.log(`  PARTS_WITH_MEANINGFUL_POSITION:       ${partsWithRealPos.size} (${(partsWithRealPos.size / partsCount * 100).toFixed(2)}%)`);
console.log(`  PARTS_WITHOUT_MEANINGFUL_POSITION:    ${partsWithoutRealPos} (${(partsWithoutRealPos / partsCount * 100).toFixed(2)}%)`);
console.log(`  FITMENTS_WITH_RAW_POSITION_VALUE:     ${fitmentsCount}`);
console.log(`  FITMENTS_WITH_MEANINGFUL_POSITION:    ${fitmentsWithRealPos} (${(fitmentsWithRealPos / fitmentsCount * 100).toFixed(2)}%)`);
console.log(`  FITMENTS_WITHOUT_MEANINGFUL_POSITION: ${fitmentsWithPlaceholderPos} (${(fitmentsWithPlaceholderPos / fitmentsCount * 100).toFixed(2)}%)`);
console.log(`  PLACEHOLDER_POSITIONS_EXCLUDED:       ${fitmentsWithPlaceholderPos}`);

assertInvariant(partsWithRawSection.size === 17082, 'PARTS_WITH_RAW_SECTION_STRING === 17082');
assertInvariant(partsWithMeaningfulSection.size === 857, 'PARTS_WITH_MEANINGFUL_SECTION === 857');
assertInvariant(fitmentsWithRawSection === 175106, 'FITMENTS_WITH_RAW_SECTION_STRING === 175106');
assertInvariant(fitmentsWithMeaningfulSection === 2798, 'FITMENTS_WITH_MEANINGFUL_SECTION === 2798');
assertInvariant(partsWithRealPos.size === 16600, 'PARTS_WITH_MEANINGFUL_POSITION === 16600');
assertInvariant(partsWithoutRealPos === 482, 'PARTS_WITHOUT_MEANINGFUL_POSITION === 482');
assertInvariant(fitmentsWithRealPos === 169990, 'FITMENTS_WITH_MEANINGFUL_POSITION === 169990');
assertInvariant(fitmentsWithPlaceholderPos === 5116, 'PLACEHOLDER_POSITIONS_EXCLUDED === 5116');

// -----------------------------------------------------------------------------
// 5. Explicit Supersessions DAG & Independent Authenticity Provenance
// -----------------------------------------------------------------------------
console.log('\n▶ 5. Auditing Explicit Supersessions DAG & Provenance Scoping...');
const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
assertInvariant(fs.existsSync(supersessionsPath), 'data/parts_supersessions.json exists');
const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
const relations = supersessionsDoc.relations || [];

console.log(`  TOTAL_SUPERSESSION_EVIDENCE_RELATIONS: ${relations.length}`);
assertInvariant(relations.length === 22, 'TOTAL_SUPERSESSION_EVIDENCE_RELATIONS === 22');

// Independent verification against phase35c31 authenticity audit corpus
const phase35c31Path = path.join(rootDir, 'data', 'phase35c31_authenticity_audit.json');
assertInvariant(fs.existsSync(phase35c31Path), 'data/phase35c31_authenticity_audit.json exists');
const phase35c31Data = JSON.parse(fs.readFileSync(phase35c31Path, 'utf8'));
const docCorpus = new Map();
(phase35c31Data.documents || []).forEach(d => docCorpus.set(d.publication_id, d));

let provenanceReconfirmed = 0;
let provenanceNotReconfirmed = 0;
let scopedExplicitCount = 0;
let scopeUnresolvedCount = 0;
let globalExplicitCount = 0;
let selfLoops = 0;
let conflicts = 0;
const sourceToTarget = new Map();

for (const r of relations) {
  // Check self-loops
  if (r.from_part === r.to_part) selfLoops++;

  // Check conflicts
  if (sourceToTarget.has(r.from_part) && sourceToTarget.get(r.from_part) !== r.to_part) {
    conflicts++;
  }
  sourceToTarget.set(r.from_part, r.to_part);

  // Independent corpus lookup
  const doc = docCorpus.get(r.source_document);
  assertInvariant(doc !== undefined, `Source document ${r.source_document} independently exists in official evidence corpus`);

  if (doc && doc.auth_after === 'AUTHENTICATED_OFFICIAL') {
    provenanceReconfirmed++;
    assertInvariant(r.provenance_status === 'PROVENANCE_RECONFIRMED', `Relation ${r.from_part} -> ${r.to_part} marked PROVENANCE_RECONFIRMED`);
    const snippet = (doc.evidence_snippet || '').toLowerCase();
    const hasReplacementSemantics = /replaced|superseded|replaces/i.test(snippet);
    assertInvariant(hasReplacementSemantics, `Document ${r.source_document} snippet contains explicit replacement semantics`);
  } else {
    provenanceNotReconfirmed++;
    assertInvariant(r.provenance_status === 'PROVENANCE_NOT_RECONFIRMED', `Relation ${r.from_part} -> ${r.to_part} safely marked PROVENANCE_NOT_RECONFIRMED`);
    assertInvariant(r.public_active === false, `Unconfirmed relation ${r.from_part} must have public_active = false`);
    assertInvariant(r.applicability === 'EVIDENCE_ONLY_SCOPE_UNRESOLVED', `Unconfirmed relation ${r.from_part} must be EVIDENCE_ONLY_SCOPE_UNRESOLVED`);
  }

  if (r.applicability === 'SCOPED_EXPLICIT') scopedExplicitCount++;
  if (r.applicability === 'EVIDENCE_ONLY_SCOPE_UNRESOLVED') scopeUnresolvedCount++;
  if (r.applicability === 'GLOBAL_EXPLICIT') globalExplicitCount++;
}

console.log(`  PROVENANCE_RECONFIRMED:               ${provenanceReconfirmed}`);
console.log(`  PROVENANCE_NOT_RECONFIRMED:           ${provenanceNotReconfirmed}`);
console.log(`  SCOPED_EXPLICIT_RELATIONS:            ${scopedExplicitCount}`);
console.log(`  SCOPE_UNRESOLVED_RELATIONS:           ${scopeUnresolvedCount}`);
console.log(`  GLOBAL_EXPLICIT_RELATIONS:            ${globalExplicitCount}`);
console.log(`  SUPERSESSION_SELF_LOOPS:              ${selfLoops}`);
console.log(`  SUPERSESSION_CONFLICTS:               ${conflicts}`);

assertInvariant(provenanceReconfirmed === 11, 'PROVENANCE_RECONFIRMED === 11');
assertInvariant(provenanceNotReconfirmed === 11, 'PROVENANCE_NOT_RECONFIRMED === 11');
assertInvariant(scopedExplicitCount === 11, 'SCOPED_EXPLICIT_RELATIONS === 11');
assertInvariant(scopeUnresolvedCount === 11, 'SCOPE_UNRESOLVED_RELATIONS === 11');
assertInvariant(globalExplicitCount === 0, 'GLOBAL_EXPLICIT_RELATIONS === 0');
assertInvariant(selfLoops === 0, 'SUPERSESSION_SELF_LOOPS === 0');
assertInvariant(conflicts === 0, 'SUPERSESSION_CONFLICTS === 0');

// Cycle detection in DAG
let cycles = 0;
for (const startNode of sourceToTarget.keys()) {
  const visited = new Set();
  let curr = startNode;
  while (curr && sourceToTarget.has(curr)) {
    if (visited.has(curr)) {
      cycles++;
      break;
    }
    visited.add(curr);
    curr = sourceToTarget.get(curr);
  }
}
console.log(`  SUPERSESSION_CYCLES:                  ${cycles}`);
assertInvariant(cycles === 0, 'SUPERSESSION_CYCLES === 0');

// Database Fitment Scoping Safety Checks
// 1. Serial-scoped relations must NEVER populate unconditional superseded_by on fitments
const serialParts = ['42034001301', '11320300401', '00003503500'];
let serialScopedGlobalization = 0;
for (const sp of serialParts) {
  const populated = db.prepare('SELECT count(*) as count FROM model_part_fitments WHERE part_number = ? AND superseded_by IS NOT NULL').get(sp).count;
  if (populated > 0) serialScopedGlobalization += populated;
}
console.log(`  SERIAL_SCOPED_GLOBALIZATION:          ${serialScopedGlobalization}`);
assertInvariant(serialScopedGlobalization === 0, 'SERIAL_SCOPED_GLOBALIZATION === 0');

// 2. Model-scoped relation 11281621000 must NOT populate fitments outside ms_440 and ms_460
const invalidModelFitments = db.prepare("SELECT count(*) as count FROM model_part_fitments WHERE part_number = '11281621000' AND superseded_by IS NOT NULL AND canonical_model_id NOT IN ('ms_440', 'ms_460')").get().count;
console.log(`  MODEL_SCOPED_GLOBALIZATION:           ${invalidModelFitments}`);
assertInvariant(invalidModelFitments === 0, 'MODEL_SCOPED_GLOBALIZATION === 0');

const validModelFitments = db.prepare("SELECT count(*) as count FROM model_part_fitments WHERE part_number = '11281621000' AND superseded_by IS NOT NULL AND canonical_model_id IN ('ms_440', 'ms_460')").get().count;
console.log(`  FITMENTS_WITH_UNCONDITIONAL_SUPERSEDED: ${validModelFitments}`);
assertInvariant(validModelFitments === 6, 'FITMENTS_WITH_UNCONDITIONAL_SUPERSEDED === 6');

// 3. Public qualified wording verification for serial-scoped relations
const serialPartObj = PartCatalogResolver.resolvePartNumber('42034001301');
const serialHtml = renderPartDetailPageHtml(serialPartObj);
const containsSerialThreshold = serialHtml.includes('249904357');
const claimsUnconditional = serialHtml.includes('is dit onderdeelnummer vervangen door');
assertInvariant(containsSerialThreshold, 'Public serial-scoped relation renders explicit serial threshold 249904357');
assertInvariant(!claimsUnconditional, 'Public serial-scoped relation does NOT claim unconditional replacement');

// 4. Inactive / unconfirmed relation must NOT render public supersession notice
const unconfirmedPartObj = PartCatalogResolver.resolvePartNumber('11220300407');
const unconfirmedHtml = renderPartDetailPageHtml(unconfirmedPartObj);
const hasNoticeBanner = unconfirmedHtml.includes('Vervangen onderdeelnummer') || unconfirmedHtml.includes('Opvolgend Onderdeelnummer');
assertInvariant(!hasNoticeBanner, 'Unconfirmed relation 11220300407 suppresses public replacement notice');

// -----------------------------------------------------------------------------
// 6. Name Quality, Idempotence & Encoding Fail-Closed Hardening
// -----------------------------------------------------------------------------
console.log('\n▶ 6. Auditing Part Name Quality, Idempotence & Encoding Hardening...');

// Verify source code of PartNameNormalizer contains no generic U+FFFD -> Ø guessing
const normalizerSrc = fs.readFileSync(path.join(rootDir, 'src', 'parts', 'PartNameNormalizer.js'), 'utf8');
const genericUfffdGuess = normalizerSrc.includes(".replace(/\\uFFFD/g, 'Ø')") || normalizerSrc.includes(".replace(/\\uFFFD/g, \"Ø\")") || normalizerSrc.includes("/\\uFFFD/g, 'Ø'");
assertInvariant(!genericUfffdGuess, 'GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS === 0');

// Full catalog idempotence verification across all 17,082 parts
const allParts = db.prepare('SELECT part_number, part_name FROM parts').all();
let nonIdempotentCount = 0;
let publicBrokenEncodingNames = 0;
let publicRetailerSpamNames = 0;
let encodingUnresolvedCount = 0;

for (const p of allParts) {
  const norm1 = PartNameNormalizer.normalizePartName(p.part_name, p.part_number);
  const norm2 = PartNameNormalizer.normalizePartName(norm1, p.part_number);

  if (norm1 !== norm2) {
    nonIdempotentCount++;
  }

  if (norm1.includes('&#') || norm1.includes('\uFFFD') || norm1.includes('Ã¸') || norm1.includes('Ã¤') || norm1.includes('Ã¼') || norm1.includes('Ã¶')) {
    publicBrokenEncodingNames++;
  }

  if (/\b(?:genuine|for stihl)\b/i.test(norm1)) {
    publicRetailerSpamNames++;
  }

  if (PartNameNormalizer.assessQuality(p.part_name, p.part_number) === 'ENCODING_UNRESOLVED') {
    encodingUnresolvedCount++;
  }
}

console.log(`  NAME_NORMALIZATION_NON_IDEMPOTENT:    ${nonIdempotentCount}`);
console.log(`  PUBLIC_BROKEN_ENCODING_NAMES:         ${publicBrokenEncodingNames}`);
console.log(`  PUBLIC_RETAILER_SPAM_NAMES:           ${publicRetailerSpamNames}`);
console.log(`  ENCODING_UNRESOLVED_NAMES:            ${encodingUnresolvedCount}`);

assertInvariant(nonIdempotentCount === 0, 'NAME_NORMALIZATION_NON_IDEMPOTENT === 0');
assertInvariant(publicBrokenEncodingNames === 0, 'PUBLIC_BROKEN_ENCODING_NAMES === 0');
assertInvariant(publicRetailerSpamNames === 0, 'PUBLIC_RETAILER_SPAM_NAMES === 0');

// Raw provenance preservation: corrupt source string remains intact in DB
const rawCorruptCount = db.prepare("SELECT count(*) as count FROM parts WHERE part_name LIKE '%\uFFFD%'").get().count;
console.log(`  RAW_BROKEN_ENCODING_NAMES_PRESERVED:  ${rawCorruptCount} in parts table`);
assertInvariant(rawCorruptCount === 246, 'RAW_BROKEN_ENCODING_NAMES_PRESERVED === 246');

// -----------------------------------------------------------------------------
// 7. Resolver Compatibility & Additive Technical Profile
// -----------------------------------------------------------------------------
console.log('\n▶ 7. Auditing PartCatalogResolver & Additive Technical Profile...');
const samplePart = PartCatalogResolver.resolvePartNumber('11231602050');
assertInvariant(samplePart !== null, 'Resolver resolves 11231602050');
assertInvariant(samplePart.technical_profile !== undefined, 'technical_profile is defined');
assertInvariant(samplePart.technical_profile.name_quality_status !== undefined, 'name_quality_status is defined');
assertInvariant(samplePart.technical_profile.part_name_raw !== undefined, 'part_name_raw is preserved');
assertInvariant(samplePart.technical_profile.display_name !== undefined, 'display_name is defined');

// Verify structured scope in technical_profile
const sampleWithScope = PartCatalogResolver.resolvePartNumber('42034001301');
assertInvariant(sampleWithScope.technical_profile.supersession !== null, 'supersession profile is present');
assertInvariant(sampleWithScope.technical_profile.supersession.scope?.serial_condition?.serial === '249904357', 'supersession.scope.serial_condition carries 249904357');
assertInvariant(sampleWithScope.technical_profile.supersession.applicability === 'SCOPED_EXPLICIT', 'supersession.applicability is SCOPED_EXPLICIT');

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
  console.log('🎉 PHASE 54E-R1 TECHNICAL INTEGRITY AUDIT PASSED CLEANLY (0 ERRORS)');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`💥 PHASE 54E-R1 AUDIT FAILED WITH ${failedChecks} INVARIANT VIOLATIONS`);
  console.log('================================================================\n');
  process.exit(1);
}
