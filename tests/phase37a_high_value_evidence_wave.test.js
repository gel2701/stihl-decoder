import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { decodeStihlCode } from '../src/decoder.js';
import { buildSafeTechnicalPreview } from '../src/SafeTechnicalPreviewResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evPath, 'utf8'));

console.log('▶ Running Phase 37A High-Value Evidence Wave 2 Tests...');

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

// ============================================================================
// 1. PUBLIC EVIDENCE STORE INTEGRITY & BASELINE INVARIANCE
// ============================================================================
const store = database.public_evidence;
assert.strictEqual(store.facts.length, 452, 'Public fact count must be exactly 452');

const storeHash = crypto.createHash('sha256').update(stable(store)).digest('hex');
assert.strictEqual(storeHash, '4487d22e659530ee336ba3975f68687bd1ce2438ad29486584e866e616e2a943', 'Store hash must match canonical 37A hash');

// Verify baseline 0..258 invariance against origin/main commit d675f0968625c87411b0790532792800d274af97
let baselineRaw;
try {
  baselineRaw = execSync('git show d675f0968625c87411b0790532792800d274af97:data/public_evidence_facts.json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
} catch (e) {
  baselineRaw = execSync('git show origin/main:data/public_evidence_facts.json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
}

const baselineStore = JSON.parse(baselineRaw);
assert.strictEqual(baselineStore.facts.length, 259, 'Baseline store must contain exactly 259 facts');

for (let i = 0; i < 259; i++) {
  assert.deepStrictEqual(store.facts[i], baselineStore.facts[i], `Baseline fact ${i} must remain byte-identical`);
}

// Verify baseline model_index aliases are strictly preserved
for (const [k, v] of Object.entries(baselineStore.model_index)) {
  const currentEntry = store.model_index[k];
  assert.ok(currentEntry, `Baseline model_index key ${k} must exist`);
  assert.deepStrictEqual(currentEntry.aliases, v.aliases, `Aliases for ${k} must be preserved`);
}

// ============================================================================
// 2. TOP 20 PRIORITY QUEUE & WAVE VERIFICATION
// ============================================================================
const queuePath = path.join(rootDir, 'data', 'phase37a_priority_queue.json');
assert.ok(fs.existsSync(queuePath), 'Priority queue artifact must exist');
const queueData = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

assert.strictEqual(queueData.queue.length, 20, 'Priority queue must have exactly 20 models');
assert.strictEqual(queueData.scoring_model.analytics_signal, 'UNAVAILABLE', 'Analytics signal must be UNAVAILABLE without real telemetry');

const wave2A = queueData.queue.filter((q) => q.wave === 'Wave 2A');
const wave2B = queueData.queue.filter((q) => q.wave === 'Wave 2B');
const wave2C = queueData.queue.filter((q) => q.wave === 'Wave 2C');

assert.strictEqual(wave2A.length, 5, 'Wave 2A must have 5 models');
assert.strictEqual(wave2B.length, 5, 'Wave 2B must have 5 models');
assert.strictEqual(wave2C.length, 10, 'Wave 2C must have 10 models');

// ============================================================================
// 3. OFFICIAL SOURCE INVENTORY & PROVENANCE INTEGRITY
// ============================================================================
const invPath = path.join(rootDir, 'data', 'phase37a_official_source_inventory.json');
assert.ok(fs.existsSync(invPath), 'Source inventory artifact must exist');
const invData = JSON.parse(fs.readFileSync(invPath, 'utf8'));

assert.ok(invData.total_sources >= 11, 'Must register official source manuals');

// Verify every new fact (259..451) has valid official provenance and exact page locator match
const newFacts = store.facts.slice(259);
assert.strictEqual(newFacts.length, 193, 'Must have exactly 193 new promoted facts');

let locatorMismatches = 0;
let syntheticMtronicCount = 0;
let unsourcedFuelCount = 0;

for (const f of newFacts) {
  assert.strictEqual(f.public_evidence_status, 'OFFICIAL_DOCUMENTED', 'Fact must be OFFICIAL_DOCUMENTED');
  assert.ok(['OFFICIAL_DIRECT', 'OFFICIAL_SERVICE_MANUAL', 'OFFICIAL_SERVICE_DOCUMENT'].includes(f.source_authority), 'Fact source_authority must be official');
  assert.strictEqual(f.generated_from_phase, '37A', 'Fact must be tagged generated_from_phase 37A');

  // Verify locator consistency: #page=N must match pdf_page
  const match = f.source_locator?.match(/#page=(\d+)/);
  if (match) {
    const pageInLoc = parseInt(match[1], 10);
    if (f.pdf_page !== pageInLoc) {
      locatorMismatches++;
    }
  }

  // Verify no synthetic M-Tronic claims
  if (f.field === 'has_mtronic') {
    syntheticMtronicCount++;
  }

  // Verify no unverified 1:50 fuel claims
  if (f.field === 'likely_fuel_family' && String(f.raw_value).includes('1:50')) {
    unsourcedFuelCount++;
  }
}

assert.strictEqual(locatorMismatches, 0, 'Zero locator mismatches allowed');
assert.strictEqual(syntheticMtronicCount, 0, 'Zero synthetic M-Tronic facts allowed');
assert.strictEqual(unsourcedFuelCount, 0, 'Zero unsourced 1:50 fuel claims allowed');

// ============================================================================
// 4. PREVIEW CONSENSUS UNLOCKING ACROSS HIGH-VALUE SERIES
// ============================================================================

// A) Series 1127 (MS 290, MS 310, MS 390 Farm Boss range)
const res1127 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1127',
  driveClassification: { machine_type: 'CHAINSAW' }
}, database);

assert.strictEqual(res1127.available, true, 'Preview for Series 1127 must be available');
const keys1127 = res1127.fields.map((f) => f.key);
assert.ok(keys1127.includes('spark_plug'), '1127 must have spark_plug consensus');
assert.ok(keys1127.includes('fuel_tank_l'), '1127 must have fuel_tank_l consensus');
assert.ok(keys1127.includes('weight_kg'), '1127 must have weight_kg consensus');

// B) Series 4282 (BR 500, BR 550, BR 600, BR 700 Backpack Blowers)
const res4282 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '4282',
  driveClassification: { machine_type: 'BLOWER' }
}, database);

assert.strictEqual(res4282.available, true, 'Preview for Series 4282 must be available');
const keys4282 = res4282.fields.map((f) => f.key);
assert.ok(keys4282.includes('displacement_cc'), '4282 must have displacement_cc consensus (64.8 cc)');
assert.ok(keys4282.includes('spark_plug'), '4282 must have spark_plug consensus');
assert.ok(keys4282.includes('fuel_tank_l'), '4282 must have fuel_tank_l consensus (1.4 l)');

// C) Series 1145 (MS 201 T, MS 201 TC-M Arborist Saws)
const res1145 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1145',
  driveClassification: { machine_type: 'CHAINSAW' }
}, database);

assert.strictEqual(res1145.available, true, 'Preview for Series 1145 must be available');
const keys1145 = res1145.fields.map((f) => f.key);
assert.ok(keys1145.includes('displacement_cc'), '1145 must have displacement_cc consensus (35.2 cc)');
assert.ok(keys1145.includes('power_kw'), '1145 must have power_kw consensus (1.8 kW)');
assert.ok(keys1145.includes('spark_plug'), '1145 must have spark_plug consensus');
assert.ok(keys1145.includes('fuel_tank_l'), '1145 must have fuel_tank_l consensus (0.31 l)');
assert.ok(keys1145.includes('weight_kg'), '1145 must have weight_kg consensus (3.7 kg)');
assert.ok(keys1145.includes('chain_pitch'), '1145 must have chain_pitch consensus (3/8" P)');

// D) Series 4244 (SR 430, SR 450 Mistblowers)
const res4244 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '4244',
  driveClassification: { machine_type: 'MISTBLOWER' }
}, database);

assert.strictEqual(res4244.available, true, 'Preview for Series 4244 must be available');
const keys4244 = res4244.fields.map((f) => f.key);
assert.ok(keys4244.includes('displacement_cc'), '4244 must have displacement_cc consensus (63.3 cc)');
assert.ok(keys4244.includes('power_kw'), '4244 must have power_kw consensus (2.9 kW)');
assert.ok(keys4244.includes('spark_plug'), '4244 must have spark_plug consensus');
assert.ok(keys4244.includes('fuel_tank_l'), '4244 must have fuel_tank_l consensus (1.7 l)');

// E) Series 1135 (MS 341, MS 361)
const res1135 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1135',
  driveClassification: { machine_type: 'CHAINSAW' }
}, database);

assert.strictEqual(res1135.available, true, 'Preview for Series 1135 must be available');
const keys1135 = res1135.fields.map((f) => f.key);
assert.ok(keys1135.includes('displacement_cc'), '1135 must have displacement_cc consensus (59.0 cc)');
assert.ok(keys1135.includes('spark_plug'), '1135 must have spark_plug consensus');

// F) Series 1133 (MS 270, MS 280)
const res1133 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1133',
  driveClassification: { machine_type: 'CHAINSAW' }
}, database);

assert.strictEqual(res1133.available, true, 'Preview for Series 1133 must be available');
const keys1133 = res1133.fields.map((f) => f.key);
assert.ok(keys1133.includes('spark_plug'), '1133 must have spark_plug consensus');

// G) Series 1129 (MS 200, MS 200 T)
const res1129 = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1129',
  driveClassification: { machine_type: 'CHAINSAW' }
}, database);

assert.strictEqual(res1129.available, true, 'Preview for Series 1129 must be available');
const keys1129 = res1129.fields.map((f) => f.key);
assert.ok(keys1129.includes('displacement_cc'), '1129 must have displacement_cc consensus (35.2 cc)');
assert.ok(keys1129.includes('power_kw'), '1129 must have power_kw consensus (1.7 kW)');
assert.ok(keys1129.includes('spark_plug'), '1129 must have spark_plug consensus');

// ============================================================================
// 5. SERIES 1141 / SERIAL 184592301 PRESERVATION & SAFETY
// ============================================================================
const res184 = decodeStihlCode('184592301', database);
assert.strictEqual(res184.success, true);
assert.strictEqual(res184.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(res184.safeTechnicalPreview.available, true);

const previewKeys184 = res184.safeTechnicalPreview.fields.map((f) => f.key);
for (const techKey of ['displacement_cc', 'power_kw', 'spark_plug', 'fuel_tank_l', 'weight_kg', 'chain_pitch']) {
  assert.ok(previewKeys184.includes(techKey), `Technical spec ${techKey} must remain present under MS 261 consensus`);
  assert.strictEqual(res184.safeTechnicalPreview.technicalFieldAudit[techKey]?.status, 'VISIBLE');
}

// M-Tronic and chain gauge remain blocked
assert.ok(!previewKeys184.includes('has_mtronic'), 'M-Tronic must remain blocked');
assert.ok(!previewKeys184.includes('chain_gauge_mm'), 'chain_gauge_mm must remain blocked');

// ============================================================================
// 6. FAILURE INJECTIONS & SAFETY HARDENING
// ============================================================================

// Injection 1: Synthetic M-Tronic candidate must be blocked
const syntheticFacts = [
  ...store.facts,
  {
    fact_id: 'synthetic_mtronic_test',
    model_slug: 'ms-310',
    model_name: 'MS 310',
    series_code: '1127',
    category: 'Kettingzaag',
    field: 'has_mtronic',
    raw_value: true,
    normalized_value: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    single_value_eligible: true
  }
];

const injectedDb = { ...database, public_evidence: { ...store, facts: syntheticFacts } };
const resInjected = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1127',
  driveClassification: { machine_type: 'CHAINSAW' }
}, injectedDb);

assert.ok(!resInjected.fields.some((f) => f.key === 'has_mtronic'), 'Synthetic M-Tronic must not leak into preview');

// Injection 2: Conflicting value across models must block the field
const conflictFacts = store.facts.map((f) => {
  if (f.model_slug === 'ms-390' && f.field === 'weight_kg') {
    return { ...f, normalized_value: 7.5, raw_value: '7.5 kg' };
  }
  return f;
});

const conflictDb = { ...database, public_evidence: { ...store, facts: conflictFacts } };
const resConflict = buildSafeTechnicalPreview({
  modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
  probableSeries: '1127',
  driveClassification: { machine_type: 'CHAINSAW' }
}, conflictDb);

assert.ok(!resConflict.fields.some((f) => f.key === 'weight_kg'), 'Conflicting weight field must be blocked');
assert.strictEqual(resConflict.technicalFieldAudit?.weight_kg?.status, 'BLOCKED_CONFLICT');

console.log('✅ Phase 37A High-Value Evidence Wave 2 Tests Passed 100%.');
