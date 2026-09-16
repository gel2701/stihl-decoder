import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  extractManualLinksFromHtml,
  extractModelIdentity,
  normalizeSpecifications,
  parseLocaleNumber,
  transformVtexProduct,
  writeCandidateStore
} from '../scripts/stihl_official_harvester.js';
import {
  buildCandidateReviewReport,
  candidateProductToEvidenceSuggestions,
  validateCandidateStore
} from '../src/utils/officialCandidateReview.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicStorePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const databasePath = path.join(rootDir, 'data', 'stihl_database.json');
const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const beforePublicHash = hashFile(publicStorePath);
const beforeDatabaseHash = hashFile(databasePath);

assert.strictEqual(parseLocaleNumber('30,1'), 30.1);
assert.strictEqual(parseLocaleNumber('2.800'), 2800);
assert.deepStrictEqual(extractModelIdentity('Motosserra a combustão MS 162'), {
  model_name: 'MS 162',
  model_slug: 'ms-162',
  family: 'MS'
});
assert.deepStrictEqual(extractModelIdentity('Motosserra a bateria MSA 60 C-B'), {
  model_name: 'MSA 60 C-B',
  model_slug: 'msa-60-c-b',
  family: 'MSA'
});

const normalizedSpecs = normalizeSpecifications({
  'Potência (kW/cv)': '1,3',
  'Cilindrada (cm³)': '30,1',
  'Peso (kg)': '4,5 - sem conjunto de corte',
  'Capacidade do tanque de óleo (ml)': '280',
  'Capacidade do tanque de combustível (ml)': '396',
  'Nível de vibração esquerda/direita (m/s²)': '3,7 / 3,7',
  'Passo da corrente': '3/8” P'
});
assert.strictEqual(normalizedSpecs.power_kw.value, 1.3);
assert.strictEqual(normalizedSpecs.displacement_cc.value, 30.1);
assert.strictEqual(normalizedSpecs.weight_kg.value, 4.5);
assert.strictEqual(normalizedSpecs.oil_tank_l.value, 0.28);
assert.strictEqual(normalizedSpecs.fuel_tank_l.value, 0.396);
assert.strictEqual(normalizedSpecs.vibration_left_m_s2.value, 3.7);
assert.strictEqual(normalizedSpecs.vibration_right_m_s2.value, 3.7);
assert.strictEqual(normalizedSpecs.chain_pitch.value, '3/8” P');

const fixtureProduct = {
  productId: '162',
  productName: 'Motosserra a combustão MS 162',
  productReference: '1148-011-3013',
  description: 'Official STIHL Brazil fixture',
  link: 'https://loja.stihl.com.br/motosserra-ms-162/p',
  categories: ['/Serrar e Cortar/Motosserras/'],
  allSpecifications: [
    'Potência (kW/cv)',
    'Cilindrada (cm³)',
    'Peso (kg)',
    'Capacidade do tanque de óleo (ml)',
    'Capacidade do tanque de combustível (ml)'
  ],
  'Potência (kW/cv)': ['1,3'],
  'Cilindrada (cm³)': ['30,1'],
  'Peso (kg)': ['4,5 - sem conjunto de corte'],
  'Capacidade do tanque de óleo (ml)': ['280'],
  'Capacidade do tanque de combustível (ml)': ['396'],
  items: [{
    images: [{ imageUrl: 'https://stihlferramentas.vtexassets.com/arquivos/ms162.jpg' }],
    sellers: [{ commertialOffer: { Price: 1299 } }]
  }]
};

const retrievedAt = '2026-09-17T00:00:00.000Z';
const candidate = transformVtexProduct(fixtureProduct, retrievedAt);
assert.strictEqual(candidate.product_reference, '1148-011-3013');
assert.strictEqual(candidate.model_slug, 'ms-162');
assert.strictEqual(candidate.category, 'Motosserras');
assert.strictEqual(candidate.price_brl, 1299);
assert.strictEqual(candidate.promotion_status, 'CANDIDATE_REVIEW_REQUIRED');
assert.strictEqual(candidate.display_eligible, false);
assert.strictEqual(candidate.single_value_eligible, false);
assert.strictEqual(candidate.market, 'BR');
assert.strictEqual(candidate.canonical_specs.displacement_cc.value, 30.1);

const manualLinks = extractManualLinksFromHtml(`
  <section><h2>Manual de instruções</h2>
  <a href="https://example.test/manual-ms162.pdf">Baixar</a></section>
  <a href="/not-a-manual">Produto</a>
`, candidate.source_url);
assert.deepStrictEqual(manualLinks, ['https://example.test/manual-ms162.pdf']);

const candidateStore = {
  schema_version: 'stihl-official-candidate-v1',
  generated_at: retrievedAt,
  write_policy: 'CANDIDATE_ONLY_NO_CANONICAL_MUTATION',
  source: {
    source_id: 'stihl-br-official-shop',
    source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    market: 'BR',
    language: 'pt-BR'
  },
  stats: { product_count: 1 },
  products: [candidate]
};
assert.strictEqual(validateCandidateStore(candidateStore).valid, true);

const suggestions = candidateProductToEvidenceSuggestions(candidate);
assert(suggestions.length >= 5);
assert(suggestions.every((fact) => fact.display_eligible === false));
assert(suggestions.every((fact) => fact.single_value_eligible === false));
assert(suggestions.every((fact) => fact.public_evidence_status === 'CANDIDATE_REVIEW_REQUIRED'));
assert(suggestions.every((fact) => fact.market === 'BR'));

const fixtureDatabase = {
  models: [{
    slug: 'ms-162',
    model_name: 'MS 162',
    displacement_cc: 30.1,
    power_kw: 1.3,
    weight_kg: 4.4
  }]
};
const fixtureEvidence = {
  facts: [{
    fact_id: 'existing-ms162-displacement',
    model_slug: 'ms-162',
    field: 'displacement_cc',
    normalized_value: 30.1,
    unit: 'cc',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    market: null
  }]
};
const report = buildCandidateReviewReport(candidateStore, fixtureDatabase, fixtureEvidence);
assert.strictEqual(report.valid, true);
assert.strictEqual(report.write_policy, 'READ_ONLY_REVIEW_NO_PROMOTION');
assert.strictEqual(report.summary.matched_model_count, 1);
assert(report.models[0].comparisons.some((entry) => entry.field === 'displacement_cc' && entry.status === 'MATCH_CANONICAL'));
assert(report.models[0].comparisons.some((entry) => entry.field === 'weight_kg' && entry.status === 'CONFLICT_CANONICAL'));
assert(report.models[0].comparisons.some((entry) => entry.field === 'fuel_tank_l' && entry.status === 'NEW_FIELD_CANDIDATE'));

const invalidStore = structuredClone(candidateStore);
invalidStore.products[0].display_eligible = true;
assert.strictEqual(validateCandidateStore(invalidStore).valid, false);

assert.throws(
  () => writeCandidateStore(candidateStore, path.join(rootDir, 'data', 'public_evidence_facts.json')),
  /Refusing to write outside candidate staging directory/
);

const afterPublicHash = hashFile(publicStorePath);
const afterDatabaseHash = hashFile(databasePath);
assert.strictEqual(afterPublicHash, beforePublicHash, 'harvester tests may not mutate public evidence store');
assert.strictEqual(afterDatabaseHash, beforeDatabaseHash, 'harvester tests may not mutate canonical database');

const harvesterSource = fs.readFileSync(path.join(rootDir, 'scripts', 'stihl_official_harvester.js'), 'utf8');
assert.strictEqual(harvesterSource.includes("data', 'public_evidence_facts.json"), false, 'harvester must have no direct public-store path');
assert.strictEqual(harvesterSource.includes("data', 'stihl_database.json"), false, 'harvester must have no direct canonical-database path');

console.log('STIHL official harvester tests passed.');
