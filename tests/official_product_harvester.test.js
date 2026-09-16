import assert from 'assert';
import { parseOfficialProductHtml, compareCandidateToDatabase, discoverProductUrls } from '../src/officialProductHarvester.js';

const fixture = `
<!doctype html>
<html>
<head><title>Motosserra MS 162 | STIHL Brasil</title><meta name="description" content="Motosserra oficial STIHL MS 162"></head>
<body>
<h1>Motosserra a combustão MS 162</h1>
<div>Ref: 1148-011-3013</div>
<div class="TechnicalSpecificationItem">
  <div class="TechnicalSpecificationName">Potência (kW/cv)</div>
  <div class="TechnicalSpecificationValue">1,3</div>
</div>
<div class="TechnicalSpecificationItem">
  <div class="TechnicalSpecificationName">Cilindrada (cm³)</div>
  <div class="TechnicalSpecificationValue">30,1</div>
</div>
<div class="TechnicalSpecificationItem">
  <div class="TechnicalSpecificationName">Peso (kg)</div>
  <div class="TechnicalSpecificationValue">4,5 - sem conjunto de corte</div>
</div>
<div class="TechnicalSpecificationItem">
  <div class="TechnicalSpecificationName">Passo da corrente</div>
  <div class="TechnicalSpecificationValue">3/8\" P</div>
</div>
<div class="TechnicalSpecificationItem">
  <div class="TechnicalSpecificationName">Capacidade do tanque de óleo (ml)</div>
  <div class="TechnicalSpecificationValue">280</div>
</div>
<a href="/arquivos/manual-ms162.pdf">Manual de instruções - Baixar</a>
<img src="https://stihlferramentas.vtexassets.com/ms162.jpg">
</body>
</html>`;

const url = 'https://loja.stihl.com.br/motosserra-ms-162/p';
const candidate = parseOfficialProductHtml(fixture, { url, retrievedAt: '2026-09-17T00:00:00.000Z' });

assert.equal(candidate.model_name, 'MS 162');
assert.equal(candidate.record_type, 'MACHINE_MODEL');
assert.equal(candidate.market, 'BR');
assert.equal(candidate.source_class, 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE');
assert.equal(candidate.promotion_status, 'CANDIDATE');
assert.equal(candidate.product_reference, '1148-011-3013');
assert.equal(candidate.specs.power_kw, 1.3);
assert.equal(candidate.specs.displacement_cc, 30.1);
assert.equal(candidate.specs.weight_kg, 4.5);
assert.equal(candidate.specs.chain_pitch, '3/8" P');
assert.equal(candidate.specs.oil_tank_ml, 280);
assert.equal(candidate.manual_url, 'https://loja.stihl.com.br/arquivos/manual-ms162.pdf');
assert(candidate.images.includes('https://stihlferramentas.vtexassets.com/ms162.jpg'));
assert.equal(candidate.evidence_hash.length, 64);

const comparison = compareCandidateToDatabase(candidate, {
  models: [{ id: 'stihl_ms_162', model_name: 'MS 162', displacement_cc: 30.1, power_kw: 1.2, weight_kg: null, chain_pitch: '3/8" P' }]
});
assert.equal(comparison.model_match, true);
assert.equal(comparison.automatic_promotion_allowed, false);
assert.equal(comparison.comparison.displacement_cc.status, 'MATCH');
assert.equal(comparison.comparison.power_kw.status, 'CONFLICT_REVIEW_REQUIRED');
assert.equal(comparison.comparison.weight_kg.status, 'DATABASE_MISSING');
assert.equal(comparison.comparison.chain_pitch.status, 'MATCH');

const decimalPitchFixture = `<html><head><title>Motosserra MS 260 | STIHL</title></head><body><h1>Motosserra MS 260</h1><div class="TechnicalSpecificationItem"><div class="TechnicalSpecificationName">Passo da corrente</div><div class="TechnicalSpecificationValue">0,325\"</div></div></body></html>`;
const decimalPitchCandidate = parseOfficialProductHtml(decimalPitchFixture, { url: 'https://loja.stihl.com.br/motosserra-ms-260/p' });
const decimalPitchComparison = compareCandidateToDatabase(decimalPitchCandidate, {
  models: [{ id: 'stihl_ms_260', model_name: 'MS 260', chain_pitch: '.325"' }]
});
assert.equal(decimalPitchCandidate.specs.chain_pitch, '.325"');
assert.equal(decimalPitchComparison.comparison.chain_pitch.status, 'MATCH');

const leakedPitchFixture = `<html><head><title>Motosserra MS 170 | STIHL</title></head><body><h1>Motosserra MS 170</h1>Passo da corrente 3/8' Modelo da corrente 36 RM Rapid Micro Conteúdo da embalagem</body></html>`;
const leakedPitchCandidate = parseOfficialProductHtml(leakedPitchFixture, { url: 'https://loja.stihl.com.br/motosserra-ms-170/p' });
assert.equal(leakedPitchCandidate.specs.chain_pitch, '3/8"');

const chainFixture = `<html><head><title>Corrente STIHL 36 RM 112 CM-P</title></head><body><h1>Corrente 36 RM 112 CM-P</h1></body></html>`;
const chainCandidate = parseOfficialProductHtml(chainFixture, { url: 'https://loja.stihl.com.br/36-rm-112-cm/p' });
assert.equal(chainCandidate.record_type, 'ACCESSORY_OR_CONSUMABLE');
assert.equal(chainCandidate.model_name, null);

const fseFixture = `<html><head><title>Roçadeira elétrica FSE 60 | STIHL</title></head><body><h1>Roçadeira elétrica FSE 60</h1></body></html>`;
const fseCandidate = parseOfficialProductHtml(fseFixture, { url: 'https://loja.stihl.com.br/rocadeira-fse-60/p' });
assert.equal(fseCandidate.record_type, 'MACHINE_MODEL');
assert.equal(fseCandidate.model_name, 'FSE 60');

const mowerFixture = `<html><head><title>Cortador de grama RM 2 R | STIHL</title></head><body><h1>Cortador de grama RM 2 R</h1></body></html>`;
const mowerCandidate = parseOfficialProductHtml(mowerFixture, { url: 'https://loja.stihl.com.br/cortador-de-grama-rm-2-r/p' });
assert.equal(mowerCandidate.record_type, 'MACHINE_MODEL');
assert.equal(mowerCandidate.model_name, 'RM 2 R');

const invalidManualFixture = `<html><head><title>Soprador BR 600 | STIHL</title></head><body><h1>Soprador BR 600</h1><a href="/arquivos/..pdf">Manual</a></body></html>`;
const invalidManualCandidate = parseOfficialProductHtml(invalidManualFixture, { url: 'https://loja.stihl.com.br/soprador-br-600/p' });
assert.equal(invalidManualCandidate.manual_url, null);

const catalog = `<a href="/motosserra-ms-162/p">MS162</a><a href="https://loja.stihl.com.br/rocadeira-fs-55/p">FS55</a><a href="/sobre">Sobre</a>`;
assert.deepEqual(discoverProductUrls(catalog, 'https://loja.stihl.com.br/todos-os-produtos'), [
  'https://loja.stihl.com.br/motosserra-ms-162/p',
  'https://loja.stihl.com.br/rocadeira-fs-55/p'
]);

console.log('official_product_harvester.test.js PASS');
