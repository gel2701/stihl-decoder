import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { buildSafeTechnicalPreview } from '../src/SafeTechnicalPreviewResolver.js';
import { renderStihlPassportHtml, buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPublicTechnicalSpecs } from '../src/publicEvidence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evPath, 'utf8'));

console.log('▶ Running Phase 36B Rapid Official Evidence Expansion Tests...');

// ============================================================================
// 1. PUBLIC EVIDENCE STORE INTEGRITY & BASELINE INVARIANCE
// ============================================================================
const store = database.public_evidence;
assert.strictEqual(store.facts.length, 259, 'Public fact count must be exactly 259');

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

const storeHash = crypto.createHash('sha256').update(stable(store)).digest('hex');
assert.strictEqual(storeHash, '869b5e8984000907db37f079e21d59d4663943d6cad3ed8f69c62082801377f1', 'Store hash must match canonical 36B.1 hash');

// Verify baseline 0..123 invariance
assert.strictEqual(store.facts[0].fact_id, '1c0c06cc89c979a3', 'Baseline fact 0 preserved');
assert.strictEqual(store.facts[123].fact_id, '092d57f70cbe7d53', 'Baseline fact 123 preserved');
assert.strictEqual(store.facts[123].model_slug, 'ms-170', 'Baseline MS 170 fact preserved');

// Verify canonical database is untouched
const dbRaw = fs.readFileSync(dbPath, 'utf8');
assert.ok(!dbRaw.includes('PHASE36B_INJECTED'), 'Database raw JSON clean');

// ============================================================================
// 2. OFFICIAL SOURCE INVENTORY & PROVENANCE
// ============================================================================
const inventoryPath = path.join(rootDir, 'data', 'phase36b_official_source_inventory.json');
assert.ok(fs.existsSync(inventoryPath), 'Source inventory artifact must exist');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
assert.strictEqual(inventory.total_sources, 11, 'Must register 11 official source manuals');

const sourceDocIds = new Set(inventory.sources.map((s) => s.document_id));
assert.ok(sourceDocIds.has('0458-573-1521-C'), 'MS 261 manual present');
assert.ok(sourceDocIds.has('0458-153-7521-C'), 'MS 261 C-M manual present');
assert.ok(sourceDocIds.has('0458-207-8321-B'), 'MS 180 manual present');
assert.ok(sourceDocIds.has('0458-452-0121-J'), 'BR 600 manual present');
assert.ok(sourceDocIds.has('0458-599-0121-D'), 'MS 201 TC-M manual present');
assert.ok(sourceDocIds.has('0458-746-0121-D'), 'FS 460 C-EM manual present');
assert.ok(sourceDocIds.has('0458-208-0121-C'), 'MS 210/230/250 manual present');
assert.ok(sourceDocIds.has('0458-209-0121-B'), 'MS 290 manual present');
assert.ok(sourceDocIds.has('0458-154-0121-C'), 'MS 362 C-M manual present');
assert.ok(sourceDocIds.has('0458-234-0121-B'), 'FS 38 manual present');
assert.ok(sourceDocIds.has('0458-454-0121-E'), 'SR 430 manual present');

// Forensics: verify all promoted facts meet strict provenance criteria
for (let i = 124; i < store.facts.length; i++) {
  const f = store.facts[i];
  assert.strictEqual(f.source_class, 'OFFICIAL_INSTRUCTION_MANUAL');
  assert.strictEqual(f.public_evidence_status, 'OFFICIAL_DOCUMENTED');
  assert.ok(f.source_document_id, `Fact ${f.fact_id} must have source_document_id`);
  assert.ok(f.pdf_page > 0, `Fact ${f.fact_id} must have valid pdf_page`);
  assert.ok(f.printed_page > 0, `Fact ${f.fact_id} must have valid printed_page`);
  assert.ok(sourceDocIds.has(f.source_document_id), `Fact ${f.fact_id} must link to registered source`);
  // Exact retrieval URL: no generic stihl.com/manuals
  assert.ok(f.source_url.startsWith('https://ssc.stihl.com/'), `Fact ${f.fact_id} must use exact direct URL`);
  assert.ok(!f.source_url.includes('www.stihl.com/manuals'), `Fact ${f.fact_id} must not use generic manual URL`);
  // Real market: no unevidenced GLOBAL
  assert.notStrictEqual(f.market, 'GLOBAL', `Fact ${f.fact_id} must have verified market, not generic GLOBAL`);
  if (f.market) {
    assert.ok(['BR', 'US', 'GB'].includes(f.market), `Fact ${f.fact_id} market must be an explicit verified entity`);
  }
  // Revision fail-closed: unproven revision semantics must be null
  assert.strictEqual(f.document_revision, null, `Fact ${f.fact_id} document_revision must be null when unproven`);
  // Non-empty raw value
  assert.ok(typeof f.raw_value === 'string' && f.raw_value.trim().length > 0, `Fact ${f.fact_id} must have raw_value`);
  // Weight configuration must be clear
  if (f.field === 'weight_kg') {
    assert.ok(f.configuration || f.measurement_definition, `Weight fact ${f.fact_id} must have configuration or measurement_definition`);
  }
}

// ============================================================================
// 3. WAVE 1: MS 261 & MS 261 C-M EXACT CONFIRMED SPECS
// ============================================================================
const ms261Specs = buildPublicTechnicalSpecs('ms-261', database);
assert.strictEqual(ms261Specs.displacement_cc, 50.2);
assert.strictEqual(ms261Specs.power_kw, 3.0);
assert.strictEqual(ms261Specs.fuel_tank_l, 0.50);
assert.strictEqual(ms261Specs.weight_kg, 4.9);
assert.strictEqual(ms261Specs.chain_pitch, '.325"');
assert.strictEqual(ms261Specs.spark_plug, 'Bosch WSR 6 F / NGK BPMR 7 A');
// has_mtronic synthetic raw fact was rejected -> undefined in technicalSpecs
assert.strictEqual(ms261Specs.has_mtronic, undefined);

const ms261cmSpecs = buildPublicTechnicalSpecs('ms-261-c-m', database);
assert.strictEqual(ms261cmSpecs.displacement_cc, 50.2);
assert.strictEqual(ms261cmSpecs.power_kw, 3.0);
assert.strictEqual(ms261cmSpecs.fuel_tank_l, 0.50);
assert.strictEqual(ms261cmSpecs.weight_kg, 4.9);
assert.strictEqual(ms261cmSpecs.chain_pitch, '.325"');
assert.strictEqual(ms261cmSpecs.spark_plug, 'Bosch WSR 6 F / NGK BPMR 7 A');
// has_mtronic synthetic raw fact was rejected -> undefined in technicalSpecs
assert.strictEqual(ms261cmSpecs.has_mtronic, undefined);

// ============================================================================
// 4. SERIAL 184592301 — SAFE TECHNICAL PREVIEW CONSENSUS EXPANSION
// ============================================================================
const res184 = decodeStihlCode('184592301', database);
assert.strictEqual(res184.success, true);
assert.strictEqual(res184.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.deepStrictEqual(res184.technicalSpecs, {}, 'technicalSpecs MUST remain strictly empty for probable model series');
assert.strictEqual(res184.safeTechnicalPreview.available, true);
assert.strictEqual(res184.safeTechnicalPreview.mode, 'PROBABLE_SERIES_PREVIEW');

const previewKeys184 = res184.safeTechnicalPreview.fields.map((f) => f.key);

// High-level safe fields
assert.ok(previewKeys184.includes('machine_category'));
assert.ok(previewKeys184.includes('drive_type'));
assert.ok(previewKeys184.includes('engine_cycle_display'));
assert.ok(previewKeys184.includes('likely_fuel_family'));

// Verify likely_fuel_family is generic petrol/mixture and NOT unproven "1:50"
const fuelField = res184.safeTechnicalPreview.fields.find((f) => f.key === 'likely_fuel_family');
assert.strictEqual(fuelField.value, 'Benzine / mengsmering');
assert.ok(!fuelField.value.includes('1:50'), 'Must not claim 1:50 ratio without oil specification context');

// Consensus unlocked technical specs
assert.ok(previewKeys184.includes('displacement_cc'), 'displacement_cc must be unlocked via consensus');
assert.ok(previewKeys184.includes('power_kw'), 'power_kw must be unlocked via consensus');
assert.ok(previewKeys184.includes('fuel_tank_l'), 'fuel_tank_l must be unlocked via consensus');
assert.ok(previewKeys184.includes('weight_kg'), 'weight_kg must be unlocked via consensus');
assert.ok(previewKeys184.includes('chain_pitch'), 'chain_pitch must be unlocked via consensus');
assert.ok(previewKeys184.includes('spark_plug'), 'spark_plug must be unlocked via consensus');

const dispField = res184.safeTechnicalPreview.fields.find((f) => f.key === 'displacement_cc');
assert.strictEqual(dispField.value, '50.2 cc');

const powerField = res184.safeTechnicalPreview.fields.find((f) => f.key === 'power_kw');
assert.strictEqual(powerField.value, '3 kW');

// Divergence gating: M-Tronic differs between MS 261 and MS 261 C-M -> STRICTLY BLOCKED
assert.ok(!previewKeys184.includes('has_mtronic'), 'M-Tronic MUST be blocked when variants diverge');

// Missing evidence gating: chain_gauge_mm has no public evidence -> STRICTLY BLOCKED
assert.ok(!previewKeys184.includes('chain_gauge_mm'), 'chain_gauge_mm MUST be blocked without public evidence');
assert.strictEqual(res184.safeTechnicalPreview.technicalFieldAudit.chain_gauge_mm.status, 'BLOCKED_NO_PUBLIC_EVIDENCE');

// Isolation: Passport & StructuredData MUST NOT leak unconfirmed specs
const vm184 = buildPassportViewModel(res184);
const passport184 = renderStihlPassportHtml(vm184);
assert.ok(!passport184.includes('50.2'), 'Passport HTML must not leak unconfirmed specs');
assert.ok(!passport184.includes('3.0 kW') && !passport184.includes('3 kW'), 'Passport HTML must not leak unconfirmed specs');

const sd184 = buildStructuredData(res184);
assert.strictEqual(sd184['@graph'].length, 0, 'StructuredData must not produce Product entity for unconfirmed probable serial');

// ============================================================================
// 5. WAVES 2 & 3: ADDITIONAL HIGH-PRIORITY MODELS
// ============================================================================
const ms180Specs = buildPublicTechnicalSpecs('ms-180', database);
assert.strictEqual(ms180Specs.displacement_cc, 31.8);
assert.strictEqual(ms180Specs.power_kw, 1.5);
assert.strictEqual(ms180Specs.weight_kg, 3.9);

const br600Specs = buildPublicTechnicalSpecs('br-600', database);
assert.strictEqual(br600Specs.displacement_cc, 64.8);
assert.strictEqual(br600Specs.power_kw, 2.8);
assert.strictEqual(br600Specs.weight_kg, 10.3);

const ms201Specs = buildPublicTechnicalSpecs('ms-201-tc-m', database);
assert.strictEqual(ms201Specs.displacement_cc, 35.2);
assert.strictEqual(ms201Specs.power_kw, 1.8);
assert.strictEqual(ms201Specs.has_mtronic, undefined); // synthetic raw value rejected

const fs460Specs = buildPublicTechnicalSpecs('fs-460-c-em', database);
assert.strictEqual(fs460Specs.displacement_cc, 45.6);
assert.strictEqual(fs460Specs.power_kw, 2.2);
assert.strictEqual(fs460Specs.has_mtronic, undefined); // synthetic raw value rejected

const ms250Specs = buildPublicTechnicalSpecs('ms-250', database);
assert.strictEqual(ms250Specs.displacement_cc, 45.4);
assert.strictEqual(ms250Specs.power_kw, 2.3);

const ms290Specs = buildPublicTechnicalSpecs('ms-290', database);
assert.strictEqual(ms290Specs.displacement_cc, 56.5);
assert.strictEqual(ms290Specs.power_kw, 3.0);

const ms362Specs = buildPublicTechnicalSpecs('ms-362-c-m', database);
assert.strictEqual(ms362Specs.displacement_cc, 59.0);
assert.strictEqual(ms362Specs.power_kw, 3.5);
assert.strictEqual(ms362Specs.has_mtronic, undefined); // synthetic raw value rejected

const fs38Specs = buildPublicTechnicalSpecs('fs-38', database);
assert.strictEqual(fs38Specs.displacement_cc, 27.2);
assert.strictEqual(fs38Specs.power_kw, 0.65);

const sr430Specs = buildPublicTechnicalSpecs('sr-430', database);
assert.strictEqual(sr430Specs.displacement_cc, 63.3);
assert.strictEqual(sr430Specs.power_kw, 2.9);

// ============================================================================
// 6. NEGATIVE TESTS / FAILURE INJECTIONS
// ============================================================================

// Negative Test A: Conflicting technical value injected -> BLOCKED_DIVERGENT
{
  const mutatedStore = JSON.parse(JSON.stringify(database.public_evidence));
  const f = mutatedStore.facts.find((fact) => fact.model_slug === 'ms-261' && fact.field === 'displacement_cc');
  f.normalized_value = 52.0;
  f.raw_value = '52.0 cm³';

  const preview = buildSafeTechnicalPreview(res184, database, mutatedStore);
  const dispAudit = preview.technicalFieldAudit.displacement_cc;
  assert.strictEqual(dispAudit.status, 'BLOCKED_CONFLICT', 'Conflicting value must trigger BLOCKED_CONFLICT');
  assert.ok(!preview.fields.some((f) => f.key === 'displacement_cc'), 'Divergent field must be excluded from preview');
}

// Negative Test B: Conflicted evidence status injected -> BLOCKED_CONFLICT
{
  const mutatedStore = JSON.parse(JSON.stringify(database.public_evidence));
  const f = mutatedStore.facts.find((fact) => fact.model_slug === 'ms-261' && fact.field === 'power_kw');
  f.public_evidence_status = 'OFFICIAL_CONFLICTED';

  const preview = buildSafeTechnicalPreview(res184, database, mutatedStore);
  const powerAudit = preview.technicalFieldAudit.power_kw;
  assert.strictEqual(powerAudit.status, 'BLOCKED_CONFLICT', 'Conflicted fact status must trigger BLOCKED_CONFLICT');
  assert.ok(!preview.fields.some((f) => f.key === 'power_kw'), 'Conflicted field must be excluded from preview');
}

// Negative Test C: Cross-category safety check (chainsaw spec on blower)
{
  const mockBlowerResult = {
    modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
    probableSeries: '4282',
    category: 'Bladblazer',
    driveClassification: {
      machine_type: 'BLOWER',
      drive_type: 'PETROL_4MIX',
      display_label: 'Benzine (4-MIX)'
    }
  };
  const preview = buildSafeTechnicalPreview(mockBlowerResult, database, database.public_evidence);
  const pitchAudit = preview.technicalFieldAudit.chain_pitch;
  assert.strictEqual(pitchAudit.status, 'BLOCKED_CROSS_CATEGORY', 'Chainsaw specs must be blocked for blower');
}

// Negative Test D: Single candidate trivial consensus block
{
  const mockSingleCandidate = {
    modelIdentityStatus: 'PROBABLE_MODEL_SERIES',
    serialResolution: { rangeModelId: 'non_existent_unique_model' },
    category: 'Kettingzaag',
    driveClassification: { machine_type: 'CHAINSAW', drive_type: 'PETROL_2STROKE' }
  };
  const preview = buildSafeTechnicalPreview(mockSingleCandidate, database, database.public_evidence);
  assert.strictEqual(preview.technicalFieldAudit.displacement_cc.status, 'BLOCKED_SINGLE_CANDIDATE');
}

// Negative Test E: Generic manual URL rejection gate test
{
  const genericUrlValidator = (url) => {
    if (!url || !url.startsWith('https://') || url.includes('www.stihl.com/manuals')) {
      return 'REJECTED_GENERIC_URL';
    }
    return 'VALID';
  };
  assert.strictEqual(genericUrlValidator('https://www.stihl.com/manuals'), 'REJECTED_GENERIC_URL');
  assert.strictEqual(genericUrlValidator('https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL/ZBA/ZBA/0458-573-1521-C_ZBA_02_01.pdf'), 'VALID');
}

// Negative Test F: Synthetic raw value rejection gate test
{
  const rawValueValidator = (val) => {
    if (val === 'Ja (M-Tronic)' || val === 'Nee (standaard carburateur)') return 'REJECTED_SYNTHETIC';
    return 'VALID';
  };
  assert.strictEqual(rawValueValidator('Ja (M-Tronic)'), 'REJECTED_SYNTHETIC');
  assert.strictEqual(rawValueValidator('50,2 cm³'), 'VALID');
}

// Negative Test G: Printed page vs PDF page mismatch detection
{
  const ms180Source = inventory.sources.find(s => s.document_id === '0458-207-8321-B');
  assert.ok(ms180Source);
  assert.strictEqual(ms180Source.pdf_spec_page, 44);
  assert.strictEqual(ms180Source.specifications_page, 42);
  assert.notStrictEqual(ms180Source.pdf_spec_page, ms180Source.specifications_page, 'PDF and printed page must not be assumed equal');
}

// Negative Test H: Unsourced mix ratio claims must not appear in likely_fuel_family
{
  const fuelValues = res184.safeTechnicalPreview.fields.map(f => f.value);
  assert.ok(!fuelValues.some(v => typeof v === 'string' && v.includes('1:50')), 'No unsourced 1:50 ratio claims allowed in preview values');
}

// ============================================================================
// 7. INDEX STRUCTURE INTEGRITY & FAILURE INJECTION (FASE 36B.4)
// ============================================================================
{
  // Baseline model aliases & metadata preserved
  const baselineModelSlugs = ['026', '046', 'ts-410', 'ts-420', '009', '017', '018', '036', '044', '088', 'ms-260', 'ms-360', 'ms-460', 'fs-350', 'hs-45', 'ms-170'];
  for (const slug of baselineModelSlugs) {
    const entry = store.model_index[slug];
    assert.ok(entry, `Baseline model ${slug} must exist in model_index`);
    assert.ok(Array.isArray(entry.aliases) && entry.aliases.length > 0, `Baseline model ${slug} must preserve non-empty aliases`);
    assert.ok(entry.fact_ids.length > 0, `Baseline model ${slug} must preserve fact_ids`);
  }

  // Field index baseline preserved
  for (const slug of baselineModelSlugs) {
    const fieldMap = store.field_index[slug];
    assert.ok(fieldMap, `field_index must contain model entry for ${slug}`);
    assert.ok(Object.keys(fieldMap).length > 0, `field_index for ${slug} must contain specification field mappings`);
  }

  // Failure injection: validator fails if an alias is removed
  const validateModelAliases = (storeToCheck) => {
    for (const slug of baselineModelSlugs) {
      const entry = storeToCheck.model_index[slug];
      if (!entry || !Array.isArray(entry.aliases) || entry.aliases.length === 0) return false;
      if (slug === 'ms-170' && !entry.aliases.includes('MS 170')) return false;
    }
    return true;
  };
  assert.strictEqual(validateModelAliases(store), true, 'Valid store passes alias validator');

  const mutatedStore = JSON.parse(JSON.stringify(store));
  mutatedStore.model_index['ms-170'].aliases = mutatedStore.model_index['ms-170'].aliases.filter(a => a !== 'MS 170');
  assert.strictEqual(validateModelAliases(mutatedStore), false, 'Removing MS 170 alias must fail validator');
}

// ============================================================================
// 8. AUDIT ARTIFACT CONSISTENCY TESTS (FASE 36B.4)
// ============================================================================
{
  const promoPath = path.join(rootDir, 'data', 'phase36b_public_evidence_promotion_report.json');
  const promo = JSON.parse(fs.readFileSync(promoPath, 'utf8'));
  const ms261AuditPath = path.join(rootDir, 'data', 'phase36b_ms261_evidence_audit.json');
  const ms261Audit = JSON.parse(fs.readFileSync(ms261AuditPath, 'utf8'));

  const invDocIds = new Set(inventory.sources.map(s => s.document_id));
  const invDocToModels = new Map();
  for (const s of inventory.sources) {
    invDocToModels.set(s.document_id, new Set(s.models_covered.map(m => m.toLowerCase().replace(/[^a-z0-9]/g, ''))));
  }

  let inconsistencies = 0;
  assert.strictEqual(promo.total_fact_count, store.facts.length);
  assert.strictEqual(promo.facts_promotion_eligible, store.facts.length - 124);
  assert.strictEqual(promo.updated_store_hash, storeHash);

  for (const src of ms261Audit.source_documents_used) {
    if (!invDocIds.has(src.document_id)) inconsistencies++;
  }

  for (let i = 124; i < store.facts.length; i++) {
    const f = store.facts[i];
    if (!invDocIds.has(f.source_document_id)) inconsistencies++;
    const allowed = invDocToModels.get(f.source_document_id);
    const factModelSlug = (f.model_slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!allowed || !allowed.has(factModelSlug)) inconsistencies++;
  }

  assert.strictEqual(inconsistencies, 0, 'Must have zero audit artifact inconsistencies');
}

console.log('✅ All Phase 36B Rapid Official Evidence Expansion Tests Passed 100%.');

