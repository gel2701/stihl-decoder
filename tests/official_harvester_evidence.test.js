import assert from 'assert';
import { buildCandidate, computeEvidenceHash, EVIDENCE_SCHEMA_VERSION } from '../lib/officialHarvester/evidence.js';
import { matchModel, compareFields, findHighValueCandidates, normalizePitch } from '../lib/officialHarvester/matching.js';

const base = {
  page_url: 'https://loja.stihl.com.br/motosserra-ms-162/p',
  title: 'Motosserra a combustão MS 162',
  model_name: 'MS 162',
  product_reference: '1148-200-0249',
  description: 'd',
  raw_specs: { 'Cilindrada (cm³)': '30,1' },
  manuals: [{ url: 'https://loja.stihl.com.br/arquivos/x.pdf', title: 'Manual', source: 'STIHL_OFFICIAL', market: 'BR' }],
  images: ['https://stihlferramentas.vtexassets.com/arquivos/ids/157058?v=1'],
};
const normalized = { specs: { displacement_cc: 30.1 }, extra_specs: {} };

// hash determinism: retrieved_at must not affect hash
const c1 = buildCandidate({ parsed: base, normalized, match: { status: 'NEW_MODEL', via: 'no_match' }, fieldComparison: [], retrievedAt: '2026-01-01T00:00:00.000Z' });
const c2 = buildCandidate({ parsed: base, normalized, match: { status: 'NEW_MODEL', via: 'no_match' }, fieldComparison: [], retrievedAt: '2026-06-01T00:00:00.000Z' });
assert.strictEqual(c1.evidence_hash, c2.evidence_hash);
assert.strictEqual(c1.evidence_hash, computeEvidenceHash(c1));
assert.match(c1.evidence_hash, /^[0-9a-f]{64}$/);
assert.strictEqual(c1.schema_version, EVIDENCE_SCHEMA_VERSION);
assert.strictEqual(c1.source_class, 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE');
assert.strictEqual(c1.automatic_promotion_allowed, false);
assert.strictEqual(c1.promotion_status, 'CANDIDATE');
// content change must change hash
const c3 = buildCandidate({
  parsed: { ...base, raw_specs: { 'Cilindrada (cm³)': '35,2' } },
  normalized: { specs: { displacement_cc: 35.2 }, extra_specs: {} },
  match: { status: 'NEW_MODEL', via: 'no_match' },
  fieldComparison: [],
  retrievedAt: '2026-01-01T00:00:00.000Z',
});
assert.notStrictEqual(c1.evidence_hash, c3.evidence_hash);

// matching: exact model, new, ambiguous (no fuzzy)
const dbModels = [
  { model_name: 'MS 170', displacement_cc: 30.1, weight_kg: 4.1 },
  { model_name: 'MS 170', displacement_cc: 30.1, weight_kg: 4.2 },
  { model_name: 'MS 162', displacement_cc: null, weight_kg: null, fuel_tank_ml: null },
];
assert.strictEqual(matchModel({ model_name: 'MS 170', product_reference: null }, [{ model_name: 'MS 170', displacement_cc: 1 }]).status, 'MODEL_MATCH');
assert.strictEqual(matchModel({ model_name: 'MS 999', product_reference: null }, dbModels).status, 'NEW_MODEL');
const amb = matchModel({ model_name: 'MS 170', product_reference: null }, dbModels);
assert.strictEqual(amb.status, 'AMBIGUOUS_MODEL');
assert.strictEqual(matchModel({ model_name: 'MS170X', product_reference: null }, dbModels).status, 'NEW_MODEL', 'no fuzzy coupling');
assert.strictEqual(matchModel({ model_name: null, product_reference: null }, dbModels).status, 'AMBIGUOUS_MODEL');

// field comparison incl. market variant + strict numerics
const rows = compareFields({ displacement_cc: 30.1, weight_kg: 4.5, fuel_tank_ml: 250 }, { model_name: 'MS 162', displacement_cc: 30.1, weight_kg: 4.1, fuel_tank_ml: null });
const byField = Object.fromEntries(rows.map((r) => [r.field, r.verdict]));
assert.strictEqual(byField.displacement_cc, 'MATCH');
assert.strictEqual(byField.weight_kg, 'POSSIBLE_MARKET_VARIANT', 'BR/EU weight conflict is market variant, not DB error');
assert.strictEqual(byField.fuel_tank_ml, 'DATABASE_MISSING');
const conflictRows = compareFields({ displacement_cc: 35.2 }, { model_name: 'X', displacement_cc: 30.1 });
assert.strictEqual(conflictRows[0].verdict, 'CONFLICT_REVIEW_REQUIRED', 'real numeric difference never hidden');

// high-value: official + missing in DB + exact match + unambiguous scalar
const hv = findHighValueCandidates(
  { specs: { displacement_cc: 30.1, weight_kg: 4.5 }, source_url: base.page_url },
  { status: 'MODEL_MATCH', model: { model_name: 'MS 162', displacement_cc: null, weight_kg: 5.0 } }
);
assert.ok(hv.some((h) => h.field === 'displacement_cc'), 'missing scalar is high-value');
assert.ok(!hv.some((h) => h.field === 'weight_kg'), 'market-variant field excluded');
assert.strictEqual(findHighValueCandidates({ specs: { displacement_cc: 1 } }, { status: 'NEW_MODEL', model: null }).length, 0);

// chain pitch: formatting-only normalization, no tolerance
assert.strictEqual(normalizePitch('.325"'), normalizePitch('.325'));
assert.strictEqual(normalizePitch('0,325”'), normalizePitch('.325"'));
assert.notStrictEqual(normalizePitch('3/8'), normalizePitch('.325'));
const pitchRows = compareFields({ chain_pitch: '0,325”' }, { model_name: 'X', chain_pitch: '.325"' });
assert.strictEqual(pitchRows[0].verdict, 'MATCH');

console.log('✔ official harvester evidence+matching checks passed.');
