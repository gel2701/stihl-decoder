import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { buildSafeTechnicalPreview, hasForbiddenPreviewToken, normalizeCategoryLabel } from '../src/SafeTechnicalPreviewResolver.js';
import { renderStihlPassportHtml, buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { buildStructuredData } from '../src/components/StructuredData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evPath, 'utf8'));

console.log('▶ Running Phase 36A.1 Hardened Safe Technical Preview Tests...');

// ============================================================================
// 1. TARGET SERIAL 184592301 — SAFE HIGH-LEVEL PREVIEW & STRICT TECHNICAL BLOCK
// ============================================================================

const res184 = decodeStihlCode('184592301', database);
assert.strictEqual(res184.success, true);
assert.strictEqual(res184.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.deepStrictEqual(res184.technicalSpecs, {}, 'technicalSpecs MUST remain strictly empty for probable model series');
assert.strictEqual(res184.safeTechnicalPreview.available, true, 'safeTechnicalPreview MUST be available');
assert.strictEqual(res184.safeTechnicalPreview.mode, 'PROBABLE_SERIES_PREVIEW');

const previewKeys184 = res184.safeTechnicalPreview.fields.map((f) => f.key);
// Expected high-level safe fields
assert.ok(previewKeys184.includes('machine_category'), 'Must include machine_category');
assert.ok(previewKeys184.includes('drive_type'), 'Must include drive_type');
assert.ok(previewKeys184.includes('engine_cycle_display'), 'Must include engine_cycle_display');
assert.ok(previewKeys184.includes('likely_fuel_family'), 'Must include likely_fuel_family');

// Rule 5: M-Tronic must be blocked for 184592301 because no public evidence exists for MS 261
assert.ok(!previewKeys184.includes('has_mtronic'), 'M-Tronic MUST be blocked without series-level public evidence');

// Rule 1, 2, 3: Technical specs must be blocked for 184592301 (single candidate & no public evidence)
for (const techKey of ['displacement_cc', 'power_kw', 'spark_plug', 'fuel_tank_l', 'weight_kg', 'chain_pitch', 'chain_gauge_mm']) {
  assert.ok(!previewKeys184.includes(techKey), `Technical spec ${techKey} MUST be blocked for 184592301`);
  const auditStatus = res184.safeTechnicalPreview.technicalFieldAudit[techKey]?.status;
  assert.strictEqual(auditStatus, 'BLOCKED_SINGLE_CANDIDATE', `Audit status for ${techKey} must be BLOCKED_SINGLE_CANDIDATE`);
}

// Rule 6: Fuel family must NOT contain "1:50"
const fuelField = res184.safeTechnicalPreview.fields.find((f) => f.key === 'likely_fuel_family');
assert.ok(!fuelField.value.includes('1:50'), 'Fuel family must not claim 1:50 without explicit evidence');
assert.strictEqual(fuelField.value, 'Benzine / mengsmering');

// Check no forbidden tokens in any preview field
const jsonPreview = JSON.stringify(res184.safeTechnicalPreview);
assert.ok(!/V2\.1/i.test(jsonPreview), 'No exact M-Tronic V2.1 version leak');
assert.ok(!/V3\.0/i.test(jsonPreview), 'No exact M-Tronic V3.0 version leak');
assert.ok(!/300g/i.test(jsonPreview), 'No raw technical changes token leak');
assert.ok(!/afgeschuinde/i.test(jsonPreview), 'No raw cylinder cover leak');
assert.ok(!/vliegwiel/i.test(jsonPreview), 'No raw flywheel leak');
assert.ok(!/vanaf\s+machinenr/i.test(jsonPreview), 'No raw breakpoint string leak');

// Check passport rendering for 184592301 (must NOT leak unconfirmed preview specs into official passport)
const passport184 = renderStihlPassportHtml(res184);
assert.ok(!passport184.includes('50.2'), 'Passport must never leak unconfirmed specs');
assert.ok(!passport184.includes('3.0 kW') && !passport184.includes('3 kW'), 'Passport must never leak unconfirmed specs');

// ============================================================================
// 2. NEGATIVE TESTS A THROUGH H (SECTION 10)
// ============================================================================

// --- Test A: One candidate only -> must NOT trivially leak exact specs ---
const testAResult = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1999',
  category: 'Kettingzaag',
  driveClassification: { machine_type: 'CHAINSAW', power_source: 'PETROL', drive_type: 'PETROL_2STROKE', display_label: 'Benzine (2-takt)' }
};
const testADb = {
  models: [
    { id: 'm_single', model_name: 'MS Single', series_code: '1999', category: 'Kettingzaag', displacement_cc: 45.0, power_kw: 2.2 }
  ]
};
const testAPreview = buildSafeTechnicalPreview(testAResult, testADb, { facts: [] });
const testAKeys = testAPreview.fields.map((f) => f.key);
assert.ok(!testAKeys.includes('displacement_cc'), 'Test A: single candidate displacement must be blocked');
assert.ok(!testAKeys.includes('power_kw'), 'Test A: single candidate power must be blocked');
assert.strictEqual(testAPreview.technicalFieldAudit.displacement_cc.status, 'BLOCKED_SINGLE_CANDIDATE');

// --- Test B: Candidate A and B have same legacy value but NO public evidence -> blocked ---
const testBResult = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1998',
  category: 'Kettingzaag',
  driveClassification: { machine_type: 'CHAINSAW', power_source: 'PETROL', drive_type: 'PETROL_2STROKE', display_label: 'Benzine (2-takt)' }
};
const testBDb = {
  models: [
    { id: 'm_b1', slug: 'm_b1', model_name: 'MS B1', series_code: '1998', category: 'Kettingzaag', displacement_cc: 50.0 },
    { id: 'm_b2', slug: 'm_b2', model_name: 'MS B2', series_code: '1998', category: 'Kettingzaag', displacement_cc: 50.0 }
  ]
};
const testBPreview = buildSafeTechnicalPreview(testBResult, testBDb, { facts: [] });
const testBKeys = testBPreview.fields.map((f) => f.key);
assert.ok(!testBKeys.includes('displacement_cc'), 'Test B: legacy values without public evidence must be blocked');
assert.strictEqual(testBPreview.technicalFieldAudit.displacement_cc.status, 'BLOCKED_NO_PUBLIC_EVIDENCE');

// --- Test C: Candidate A has public evidence, Candidate B missing -> blocked ---
const testCStore = {
  facts: [
    {
      id: 'fact_c1',
      model_slug: 'm_c1',
      model_name: 'MS C1',
      field: 'displacement_cc',
      value: 50.0,
      normalized_value: 50.0,
      unit: 'cc',
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      single_value_eligible: true
    }
  ]
};
const testCDb = {
  models: [
    { id: 'm_c1', slug: 'm_c1', model_name: 'MS C1', series_code: '1997', category: 'Kettingzaag' },
    { id: 'm_c2', slug: 'm_c2', model_name: 'MS C2', series_code: '1997', category: 'Kettingzaag' }
  ]
};
const testCPreview = buildSafeTechnicalPreview({ ...testBResult, probableSeries: '1997' }, testCDb, testCStore);
const testCKeys = testCPreview.fields.map((f) => f.key);
assert.ok(!testCKeys.includes('displacement_cc'), 'Test C: incomplete candidate coverage must block field');
assert.strictEqual(testCPreview.technicalFieldAudit.displacement_cc.status, 'BLOCKED_INCOMPLETE_CANDIDATE_COVERAGE');

// --- Test D: Candidate A and B have same official value with public evidence -> allowed ---
const testDStore = {
  facts: [
    {
      id: 'fact_d1',
      model_slug: 'm_d1',
      model_name: 'MS D1',
      field: 'displacement_cc',
      value: 50.2,
      normalized_value: 50.2,
      unit: 'cc',
      source_ref: 'DOC_D1',
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      single_value_eligible: true
    },
    {
      id: 'fact_d2',
      model_slug: 'm_d2',
      model_name: 'MS D2',
      field: 'displacement_cc',
      value: 50.2,
      normalized_value: 50.2,
      unit: 'cc',
      source_ref: 'DOC_D2',
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      single_value_eligible: true
    }
  ]
};
const testDDb = {
  models: [
    { id: 'm_d1', slug: 'm_d1', model_name: 'MS D1', series_code: '1996', category: 'Kettingzaag' },
    { id: 'm_d2', slug: 'm_d2', model_name: 'MS D2', series_code: '1996', category: 'Kettingzaag' }
  ]
};
const testDPreview = buildSafeTechnicalPreview({ ...testBResult, probableSeries: '1996' }, testDDb, testDStore);
const testDField = testDPreview.fields.find((f) => f.key === 'displacement_cc');
assert.ok(testDField, 'Test D: unanimous public evidence field must be allowed');
assert.strictEqual(testDField.value, '50.2 cc');
assert.strictEqual(testDField.source_type, 'PUBLIC_EVIDENCE_CONSENSUS');
assert.strictEqual(testDField.candidate_count, 2);
assert.deepStrictEqual(testDField.evidence_fact_ids, ['fact_d1', 'fact_d2']);
assert.deepStrictEqual(testDField.source_document_ids, ['DOC_D1', 'DOC_D2']);
assert.strictEqual(testDField.scope_status, 'EXACT_COMPATIBLE');
assert.strictEqual(testDPreview.technicalFieldAudit.displacement_cc.status, 'VISIBLE');

// --- Test E: One candidate OFFICIAL_CONFLICTED -> blocked ---
const testEStore = {
  facts: [
    {
      id: 'fact_e1',
      model_slug: 'm_e1',
      model_name: 'MS E1',
      field: 'displacement_cc',
      value: 50.2,
      normalized_value: 50.2,
      unit: 'cc',
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      single_value_eligible: true
    },
    {
      id: 'fact_e2',
      model_slug: 'm_e2',
      model_name: 'MS E2',
      field: 'displacement_cc',
      value: 50.2,
      normalized_value: 50.2,
      unit: 'cc',
      public_evidence_status: 'OFFICIAL_CONFLICTED',
      single_value_eligible: true
    }
  ]
};
const testEDb = {
  models: [
    { id: 'm_e1', slug: 'm_e1', model_name: 'MS E1', series_code: '1995', category: 'Kettingzaag' },
    { id: 'm_e2', slug: 'm_e2', model_name: 'MS E2', series_code: '1995', category: 'Kettingzaag' }
  ]
};
const testEPreview = buildSafeTechnicalPreview({ ...testBResult, probableSeries: '1995' }, testEDb, testEStore);
assert.ok(!testEPreview.fields.some((f) => f.key === 'displacement_cc'), 'Test E: OFFICIAL_CONFLICTED must block field');
assert.strictEqual(testEPreview.technicalFieldAudit.displacement_cc.status, 'BLOCKED_CONFLICT');

// --- Test F: Unknown category -> NO fallback to Kettingzaag ---
const testFResult = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1994',
  category: 'UNKNOWN',
  driveClassification: { machine_type: 'UNKNOWN', power_source: 'PETROL', drive_type: 'PETROL_2STROKE' }
};
const testFDb = {
  models: [
    { id: 'm_f1', model_name: 'M F1', series_code: '1994', category: 'UNKNOWN' },
    { id: 'm_f2', model_name: 'M F2', series_code: '1994', category: 'UNKNOWN' }
  ]
};
const testFPreview = buildSafeTechnicalPreview(testFResult, testFDb, { facts: [] });
const testFKeys = testFPreview.fields.map((f) => f.key);
assert.ok(!testFKeys.includes('machine_category'), 'Test F: unknown category must not produce machine_category');
assert.ok(!testFPreview.fields.some((f) => f.value === 'Kettingzaag'), 'Test F: must NEVER default to Kettingzaag');

// --- Test G: One candidate M-Tronic, one not -> M-Tronic blocked ---
const testGDb = {
  models: [
    { id: 'm_g1', model_name: 'MS 261 C-M', series_code: '1993', category: 'Kettingzaag' },
    { id: 'm_g2', model_name: 'MS 261', series_code: '1993', category: 'Kettingzaag' }
  ]
};
const testGResult = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1993',
  category: 'Kettingzaag',
  driveClassification: { machine_type: 'CHAINSAW', power_source: 'PETROL', drive_type: 'PETROL_2STROKE', engine_technology: 'M_TRONIC' }
};
const testGPreview = buildSafeTechnicalPreview(testGResult, testGDb, { facts: [] });
assert.ok(!testGPreview.fields.some((f) => f.key === 'has_mtronic'), 'Test G: mixed M-Tronic candidates must block M-Tronic preview');

// --- Test H: PETROL_2STROKE without mix-ratio evidence -> no "1:50" ---
const testHResult = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1992',
  category: 'Kettingzaag',
  driveClassification: { machine_type: 'CHAINSAW', power_source: 'PETROL', drive_type: 'PETROL_2STROKE', display_label: 'Benzine (2-takt)' }
};
const testHPreview = buildSafeTechnicalPreview(testHResult, testBDb, { facts: [] });
const testHFuel = testHPreview.fields.find((f) => f.key === 'likely_fuel_family');
assert.ok(testHFuel, 'Test H: likely_fuel_family should exist for petrol engine');
assert.ok(!testHFuel.value.includes('1:50'), 'Test H: likely_fuel_family must not include 1:50');
assert.strictEqual(testHFuel.value, 'Benzine / mengsmering');

// ============================================================================
// 3. BR 600 / FS SERIES CROSS-CATEGORY SAFETY (SECTION 11)
// ============================================================================

// BR 600 Blower
const br600Result = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  resolvedModel: 'BR 600',
  model: 'BR 600',
  category: 'Bladblazer',
  driveClassification: { machine_type: 'BLOWER', power_source: 'PETROL', drive_type: 'PETROL_4MIX', display_label: 'Benzine 4-MIX® (mengsmering)' }
};
const br600Preview = buildSafeTechnicalPreview(br600Result, database);
const br600Keys = br600Preview.fields.map((f) => f.key);
assert.ok(!br600Keys.includes('chain_pitch'), 'Chainsaw chain pitch must NOT leak to blower');
assert.ok(!br600Keys.includes('chain_gauge_mm'), 'Chainsaw chain gauge must NOT leak to blower');
const br600Cat = br600Preview.fields.find((f) => f.key === 'machine_category');
assert.strictEqual(br600Cat.value, 'Bladblazer', 'BR 600 category must be Bladblazer');

// FS Series Brushcutter
const fs350Result = {
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  resolvedModel: 'FS 350',
  model: 'FS 350',
  category: 'Bosmaaier',
  driveClassification: { machine_type: 'TRIMMER', power_source: 'PETROL', drive_type: 'PETROL_2STROKE', display_label: 'Benzine (2-takt)' }
};
const fs350Preview = buildSafeTechnicalPreview(fs350Result, database);
const fs350Keys = fs350Preview.fields.map((f) => f.key);
assert.ok(!fs350Keys.includes('chain_pitch'), 'No chainsaw fields on trimmer');
assert.ok(!fs350Keys.includes('chain_gauge_mm'), 'No chainsaw fields on trimmer');
const fs350Cat = fs350Preview.fields.find((f) => f.key === 'machine_category');
assert.strictEqual(fs350Cat.value, 'Bosmaaier', 'FS 350 category must be Bosmaaier');

// ============================================================================
// 4. GENERAL INTEGRITY & IMMUTABILITY (SECTIONS 12 & 15)
// ============================================================================

// Assisted decode (confirmed MS 170) -> safeTechnicalPreview is false, technicalSpecs has official specs
const resAssisted = decodeStihlCode('824061159', database, { confirmedModel: 'MS 170' });
assert.strictEqual(resAssisted.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(resAssisted.safeTechnicalPreview.available, false, 'safeTechnicalPreview not needed when confirmed model');
assert.strictEqual(Object.keys(resAssisted.technicalSpecs).length, 10, 'All 10 official MS 170 specs must be present');

// Format-only / Part Number / Nonsense inputs
const resFormatOnly = decodeStihlCode('12345678A', database);
assert.strictEqual(resFormatOnly.safeTechnicalPreview.available, false, 'FORMAT_ONLY must not have preview');

const resPartNo = decodeStihlCode('11210210800', database);
assert.strictEqual(resPartNo.safeTechnicalPreview.available, false, 'PART_NUMBER must not have preview');

const res824Only = decodeStihlCode('824061159', database);
assert.strictEqual(res824Only.safeTechnicalPreview.available, false, 'Serial without probable series must not have preview');

// Structured Data isolation (Section 12)
const structuredData = buildStructuredData({
  pageType: 'model',
  model: { model_name: 'MS 261', slug: 'ms-261' },
  publicEvidence: database.public_evidence
});
const graph = Array.isArray(structuredData) ? structuredData : (structuredData?.['@graph'] || []);
const productNode = graph.find((n) => n['@type'] === 'Product');
if (productNode && productNode.additionalProperty) {
  const propNames = productNode.additionalProperty.map((p) => p.name);
  assert.ok(!propNames.includes('M-Tronic aanwezig (reeksindicatie)'), 'Preview strings must not leak to Product schema');
}

// Store immutability
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
const storeText = fs.readFileSync(evPath, 'utf8');
const storeObj = JSON.parse(storeText);
assert.strictEqual(storeObj.facts.length, 124, 'Public fact count must remain exactly 124');
const storeHash = crypto.createHash('sha256').update(stable(storeObj)).digest('hex');
assert.strictEqual(storeHash, 'e25edfa6aaf2807fdd78dd9fd68bb4774b77b6d52855deef116bd47853cc6fa6', 'Public store hash must not mutate');

console.log('✅ Phase 36A.1 Hardened Safe Technical Preview Tests Passed 100%.');
