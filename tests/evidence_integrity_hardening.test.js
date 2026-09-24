import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  COMPATIBILITY_STATUSES,
  RECOMMENDATION_TYPES,
  buildModelRecommendations,
  findEligibleEvidence,
  valueMatches
} from '../src/modelRecommendations.js';
import {
  getFactSourceTag,
  buildSafePassportSpecRows,
  buildPassportViewModel
} from '../src/components/StihlPassportGenerator.js';
import {
  createDossierObject,
  saveDossier,
  enrichDossierWithSerial,
  resolveDossierConflict,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES
} from '../src/components/MachineDossierManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evPath, 'utf8'));

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 47B EVIDENCE INTEGRITY HARDENING TEST SUITE');
console.log('===============================================================\n');

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };
}

const ms440Model = {
  model_slug: 'ms-440',
  model_name: 'MS 440',
  category: 'Kettingzaag',
  series_code: '1128'
};

// ============================================================================
// Test A: Correct model, WRONG FIELD -> NIET VERIFIED
// ============================================================================
console.log('▶ Test A: Correct model, wrong field...');
const wrongFieldEv = [{
  model_slug: 'ms-440',
  field_name: 'power_kw',
  value: 'Bosch WSR6F',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsA = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: wrongFieldEv }
);
const sparkA = recsA.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkA.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test A: wrong field evidence must NOT result in VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(wrongFieldEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test A: findEligibleEvidence must return null for wrong field'
);
console.log('  ✅ Test A Passed: Wrong field evidence correctly rejected.');

// ============================================================================
// Test B: Correct model, correct field, WRONG VALUE -> NIET VERIFIED
// ============================================================================
console.log('▶ Test B: Correct model, correct field, wrong value...');
const wrongValueEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'NGK BPMR7A',
  display_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsB = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: wrongValueEv }
);
const sparkB = recsB.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkB.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test B: wrong value evidence must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(wrongValueEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test B: findEligibleEvidence must reject mismatched value'
);
console.log('  ✅ Test B Passed: Wrong value evidence correctly rejected.');

// ============================================================================
// Test C: Correct model, correct field & value, DISPLAY_ELIGIBLE = FALSE -> NIET VERIFIED
// ============================================================================
console.log('▶ Test C: Correct model, correct field & value, display_eligible = false...');
const notDisplayEligibleEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: false,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsC = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: notDisplayEligibleEv }
);
const sparkC = recsC.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkC.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test C: display_eligible=false must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(notDisplayEligibleEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test C: findEligibleEvidence must reject display_eligible=false'
);
console.log('  ✅ Test C Passed: display_eligible=false evidence correctly rejected.');

// ============================================================================
// Test D: Correct field & value, WRONG MODEL_SLUG -> NIET VERIFIED
// ============================================================================
console.log('▶ Test D: Correct field & value, wrong model_slug...');
const wrongModelEv = [{
  model_slug: 'ms-260',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsD = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: wrongModelEv }
);
const sparkD = recsD.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkD.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test D: wrong model evidence must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(wrongModelEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test D: findEligibleEvidence must reject wrong model_slug'
);
console.log('  ✅ Test D Passed: Wrong model_slug evidence correctly rejected.');

// ============================================================================
// Test E: Correct field/value/model, INSUFFICIENT EVIDENCE STATUS -> NIET VERIFIED
// ============================================================================
console.log('▶ Test E: Insufficient public evidence status (UNKNOWN / CONFLICTED)...');
const unknownStatusEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  public_evidence_status: 'UNKNOWN',
  source_class: 'COMMUNITY_FORUM'
}];
const conflictedStatusEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  public_evidence_status: 'OFFICIAL_CONFLICTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsE1 = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: unknownStatusEv }
);
const recsE2 = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: conflictedStatusEv }
);
assert.strictEqual(
  recsE1.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG).technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test E1: UNKNOWN status must NOT yield VERIFIED'
);
assert.strictEqual(
  recsE2.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG).technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test E2: OFFICIAL_CONFLICTED status must NOT yield VERIFIED'
);
console.log('  ✅ Test E Passed: Insufficient and conflicted evidence status correctly rejected.');

// ============================================================================
// Test F: Chain pitch proven, GAUGE + DRIVE LINKS UNPROVEN -> NIET VERIFIED
// ============================================================================
console.log('▶ Test F: Chain pitch proven only (gauge & drive links unproven)...');
const pitchOnlyEv = [{
  model_slug: 'ms-440',
  field: 'chain_pitch',
  normalized_value: '3/8"',
  display_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsF = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: pitchOnlyEv }
);
const chainF = recsF.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainF.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test F: pitch-only evidence must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Test F Passed: Partial chain pitch-only evidence yields SPECIFICATION_MATCH_ONLY.');

// ============================================================================
// Test G: Pitch + gauge proven, DRIVE LINKS UNPROVEN -> NIET VERIFIED
// ============================================================================
console.log('▶ Test G: Pitch + gauge proven, drive links unproven...');
const pitchAndGaugeEv = [
  {
    model_slug: 'ms-440',
    field: 'chain_pitch',
    normalized_value: '3/8"',
    display_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'chain_gauge_mm',
    normalized_value: '1.6 mm',
    display_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  }
];
const recsG = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: pitchAndGaugeEv }
);
const chainG = recsG.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainG.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test G: pitch+gauge without drive_links evidence must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Test G Passed: Pitch + gauge without drive links evidence yields SPECIFICATION_MATCH_ONLY.');

// ============================================================================
// Test H: Pitch + gauge + drive links ALL THREE PROVEN -> VERIFIED
// ============================================================================
console.log('▶ Test H: Pitch + gauge + drive links all three proven...');
const allThreeChainEv = [
  {
    model_slug: 'ms-440',
    field: 'chain_pitch',
    normalized_value: '3/8"',
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'chain_gauge_mm',
    normalized_value: '1.6 mm',
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'drive_links',
    normalized_value: 72,
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  }
];
const recsH = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: allThreeChainEv }
);
const chainH = recsH.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainH.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
  'Test H: all three chain specs evidenced MUST yield VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Test H Passed: Complete evidence for pitch, gauge, and drive links yields VERIFIED_MODEL_COMPATIBILITY.');

// ============================================================================
// Test I: Synthetic official anchor without verification_date -> verified_at === null
// ============================================================================
console.log('▶ Test I: Synthetic official anchor without verification_date...');
const mockStorageI = createMockStorage();
const initialDossierI = createDossierObject({
  modelSlug: 'ms-260',
  modelName: 'MS 260',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(initialDossierI, mockStorageI);

// Mock database with a synthetic official anchor that has NO verification_date / verified_at
const mockDatabaseWithSyntheticAnchor = {
  ...database,
  official_serial_anchors: [
    {
      serial_number: '199999999',
      model_name: 'MS 260',
      canonical_model_id: 'stihl_ms_260',
      source: 'MY_STIHL'
      // NOTICE: NO verification_date and NO verified_at!
    }
  ]
};

const enrichResI = enrichDossierWithSerial(
  initialDossierI.dossier_id,
  '199999999',
  mockDatabaseWithSyntheticAnchor,
  {},
  mockStorageI
);
assert.strictEqual(enrichResI.success, true);
assert.strictEqual(enrichResI.status, 'ENRICHED_OFFICIAL');
assert.strictEqual(
  enrichResI.dossier.identity.verified_at,
  null,
  'Test I: synthetic anchor without verification_date MUST produce verified_at === null, NEVER fabricated date'
);
console.log('  ✅ Test I Passed: Synthetic anchor without verification date produces verified_at === null.');

// ============================================================================
// Test J: Canonical anchor 163118080 retains verified_at === "2026-09-22"
// ============================================================================
console.log('▶ Test J: Canonical anchor 163118080 provenance verification...');
const mockStorageJ = createMockStorage();
const ms440DossierJ = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(ms440DossierJ, mockStorageJ);

const enrichResJ = enrichDossierWithSerial(
  ms440DossierJ.dossier_id,
  '163118080',
  database,
  {},
  mockStorageJ
);
assert.strictEqual(enrichResJ.success, true);
assert.strictEqual(enrichResJ.status, 'ENRICHED_OFFICIAL');
assert.strictEqual(enrichResJ.dossier.identity.verified_at, '2026-09-22', 'Canonical anchor 163118080 must retain 2026-09-22');
assert.strictEqual(enrichResJ.dossier.identity.official_product_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
assert.strictEqual(enrichResJ.dossier.identity.model_name, 'MS 440');
console.log('  ✅ Test J Passed: Canonical anchor 163118080 verified_at remains exactly 2026-09-22.');

// ============================================================================
// Test K: Passport source-tag behavior WITHOUT eligible evidence
// ============================================================================
console.log('▶ Test K: Passport source-tag behavior without evidence...');
const noEvidencePassportData = {
  technicalSpecs: {
    displacement_cc: 70.7,
    spark_plug: 'Bosch WSR6F',
    weight_kg: 6.3
  },
  publicEvidenceFacts: [],
  publicEvidenceFields: {}
};

const tagDisp = getFactSourceTag('displacement_cc', noEvidencePassportData);
const tagSpark = getFactSourceTag('spark_plug', noEvidencePassportData);
assert.strictEqual(tagDisp, '', 'Source tag without evidence MUST be empty string');
assert.strictEqual(tagSpark, '', 'Source tag without evidence MUST be empty string');

const specRowsNoEv = buildSafePassportSpecRows(noEvidencePassportData);
for (const row of specRowsNoEv) {
  assert(!row.includes('Officieel bevestigd'), `Row "${row}" must NOT contain "Officieel bevestigd" without evidence`);
}
assert.deepStrictEqual(specRowsNoEv, [
  'Motorinhoud: 70.7 cc',
  'Bougie: Bosch WSR6F',
  'Gewicht: 6.3 kg'
]);
console.log('  ✅ Test K Passed: Passport spec rows without evidence have zero "Officieel bevestigd" tags.');

// ============================================================================
// Test L: Passport source-tag behavior WITH eligible evidence
// ============================================================================
console.log('▶ Test L: Passport source-tag behavior with eligible evidence...');
const withEvidencePassportData = {
  technicalSpecs: {
    displacement_cc: 70.7,
    spark_plug: 'Bosch WSR6F'
  },
  publicEvidenceFacts: [
    {
      field: 'displacement_cc',
      display_eligible: true,
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      meta: {
        sourceDocumentId: '0458-260-0121',
        sourceEdition: '2003',
        printedPage: 42
      }
    },
    {
      field: 'spark_plug',
      display_eligible: true,
      public_evidence_status: 'CANONICAL_VERIFIED'
      // No document meta, has canonical status
    }
  ]
};

const tagDispWithEv = getFactSourceTag('displacement_cc', withEvidencePassportData);
const tagSparkWithEv = getFactSourceTag('spark_plug', withEvidencePassportData);
assert.strictEqual(tagDispWithEv, '(✓ STIHL 0458-260-0121 Ed. 2003, p. 42)');
assert.strictEqual(tagSparkWithEv, '(✓ Officieel bevestigd)');

const specRowsWithEv = buildSafePassportSpecRows(withEvidencePassportData);
assert.strictEqual(specRowsWithEv[0], 'Motorinhoud: 70.7 cc (✓ STIHL 0458-260-0121 Ed. 2003, p. 42)');
assert.strictEqual(specRowsWithEv[1], 'Bougie: Bosch WSR6F (✓ Officieel bevestigd)');
console.log('  ✅ Test L Passed: Passport source tags render valid provenance when evidence exists.');

// ============================================================================
// Test M: UNKNOWN status met source_class 'OFFICIAL_MANUAL' levert SPECIFICATION_MATCH_ONLY (geen VERIFIED)
// ============================================================================
console.log('▶ Test M: UNKNOWN status with source_class OFFICIAL_MANUAL...');
const unknownManualEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  single_value_eligible: true,
  public_evidence_status: 'UNKNOWN',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsM = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: unknownManualEv }
);
const sparkM = recsM.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkM.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test M: UNKNOWN status with source_class OFFICIAL_MANUAL must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(unknownManualEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test M: findEligibleEvidence must return null for UNKNOWN status regardless of source_class'
);
console.log('  ✅ Test M Passed: source_class OFFICIAL_MANUAL cannot promote UNKNOWN status to VERIFIED.');

// ============================================================================
// Test N: Non-canonical status 'VERIFIED' levert SPECIFICATION_MATCH_ONLY (geen VERIFIED)
// ============================================================================
console.log('▶ Test N: Non-canonical status VERIFIED...');
const nonCanonicalStatusEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  single_value_eligible: true,
  public_evidence_status: 'VERIFIED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsN = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: nonCanonicalStatusEv }
);
const sparkN = recsN.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkN.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test N: non-canonical status VERIFIED must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(nonCanonicalStatusEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test N: findEligibleEvidence must reject non-canonical status VERIFIED'
);
console.log('  ✅ Test N Passed: Non-canonical status VERIFIED correctly rejected.');

// ============================================================================
// Test O: single_value_eligible: undefined levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test O: single_value_eligible is undefined...');
const undefinedSingleValueEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  // single_value_eligible intentionally omitted / undefined
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsO = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: undefinedSingleValueEv }
);
const sparkO = recsO.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkO.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test O: undefined single_value_eligible must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(undefinedSingleValueEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test O: findEligibleEvidence must reject undefined single_value_eligible'
);
console.log('  ✅ Test O Passed: undefined single_value_eligible correctly rejected.');

// ============================================================================
// Test P: single_value_eligible: false levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test P: single_value_eligible is false...');
const falseSingleValueEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  single_value_eligible: false,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsP = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: falseSingleValueEv }
);
const sparkP = recsP.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkP.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test P: single_value_eligible: false must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(falseSingleValueEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test P: findEligibleEvidence must reject single_value_eligible: false'
);
console.log('  ✅ Test P Passed: single_value_eligible: false correctly rejected.');

// ============================================================================
// Test Q: Unit mismatch (1.6 inch vs 1.6 mm chain_gauge_mm) levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test Q: Unit mismatch (1.6 inch vs 1.6 mm for chain_gauge_mm)...');
const unitMismatchChainEv = [
  {
    model_slug: 'ms-440',
    field: 'chain_pitch',
    normalized_value: '3/8"',
    unit: 'inch',
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'chain_gauge_mm',
    normalized_value: 1.6,
    unit: 'inch', // Deliberate mismatch with canonical field unit 'mm'
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'drive_links',
    normalized_value: 72,
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  }
];
const recsQ = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: unitMismatchChainEv }
);
const chainQ = recsQ.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainQ.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test Q: unit mismatch (1.6 inch for chain_gauge_mm) must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  valueMatches({ normalized_value: 1.6, unit: 'inch' }, '1.6', 'chain_gauge_mm'),
  false,
  'Test Q: valueMatches must return false when evidence unit is inch but field is chain_gauge_mm'
);
console.log('  ✅ Test Q Passed: Unit mismatch (1.6 inch vs mm) strictly rejected.');

// ============================================================================
// Test R: Conflicterende chain configuraties (pitch van config A, links van config B) levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test R: Conflicting chain configurations (config A vs config B)...');
const conflictingConfigsChainEv = [
  {
    model_slug: 'ms-440',
    field: 'chain_pitch',
    normalized_value: '3/8"',
    configuration: '50cm_rollomatic_es',
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'chain_gauge_mm',
    normalized_value: '1.6 mm',
    configuration: '50cm_rollomatic_es',
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  },
  {
    model_slug: 'ms-440',
    field: 'drive_links',
    normalized_value: 72,
    configuration: '40cm_rollomatic_e', // Deliberate conflicting configuration
    display_eligible: true,
    single_value_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    source_class: 'OFFICIAL_MANUAL'
  }
];
const recsR = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: conflictingConfigsChainEv }
);
const chainR = recsR.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainR.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test R: mixing conflicting configurations must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Test R Passed: Mixed conflicting configurations downgraded to SPECIFICATION_MATCH_ONLY.');

// ============================================================================
// Test S: display_eligible: false levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test S: display_eligible is false...');
const falseDisplayEligibleEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: false,
  single_value_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsS = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: falseDisplayEligibleEv }
);
const sparkS = recsS.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkS.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test S: display_eligible: false must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(falseDisplayEligibleEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test S: findEligibleEvidence must reject display_eligible: false'
);
console.log('  ✅ Test S Passed: display_eligible: false strictly rejected.');

// ============================================================================
// Test T: public_evidence_status: 'OFFICIAL_CONFLICTED' levert SPECIFICATION_MATCH_ONLY
// ============================================================================
console.log('▶ Test T: public_evidence_status is OFFICIAL_CONFLICTED...');
const conflictedEvidenceStatusEv = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  single_value_eligible: false,
  public_evidence_status: 'OFFICIAL_CONFLICTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsT = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: conflictedEvidenceStatusEv }
);
const sparkT = recsT.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkT.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Test T: OFFICIAL_CONFLICTED status must NOT yield VERIFIED_MODEL_COMPATIBILITY'
);
assert.strictEqual(
  findEligibleEvidence(conflictedEvidenceStatusEv, 'ms-440', 'spark_plug', 'Bosch WSR6F'),
  null,
  'Test T: findEligibleEvidence must reject OFFICIAL_CONFLICTED status'
);
console.log('  ✅ Test T Passed: OFFICIAL_CONFLICTED status strictly rejected.');

console.log('\n🎉 ALL PHASE 47B & 47C EVIDENCE INTEGRITY HARDENING TESTS PASSED 100% CLEANLY!');
