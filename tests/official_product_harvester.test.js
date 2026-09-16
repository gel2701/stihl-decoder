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

const catalog = `<a href="/motosserra-ms-162/p">MS162</a><a href="https://loja.stihl.com.br/rocadeira-fs-55/p">FS55</a><a href="/sobre">Sobre</a>`;
assert.deepEqual(discoverProductUrls(catalog, 'https://loja.stihl.com.br/todos-os-produtos'), [
  'https://loja.stihl.com.br/motosserra-ms-162/p',
  'https://loja.stihl.com.br/rocadeira-fs-55/p'
]);

console.log('official_product_harvester.test.js PASS');
