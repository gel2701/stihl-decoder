import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeStihlCode } from '../src/decoder.js';
import { searchIntelligentModels } from '../src/search/IntelligentSearchEngine.js';
import { findModelIdentity } from '../src/modelIdentityIndex.js';

const db = JSON.parse(readFileSync(new URL('../data/stihl_database.json', import.meta.url)));
const facts = JSON.parse(readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url)));
const index = JSON.parse(readFileSync(new URL('../data/model_identity_index.json', import.meta.url)));

assert.equal(db.models.length, 110);
assert.equal(facts.facts.length, 761);
assert.equal(index.length, 9);

for (const name of ['011', '015', '028', '034', '041', 'HS 75', 'BR 320']) {
  assert.equal(findModelIdentity(name)?.model_name, name);
  const decoded = decodeStihlCode(name, db);
  const searched = searchIntelligentModels(name, db);
  assert.equal(decoded.success, true, name);
  assert.equal(decoded.type, 'MODEL_DECODE', name);
  assert.equal(decoded.model, name, name);
  assert.equal(decoded.modelResolution, 'EXACT_IDENTITY_ONLY', name);
  assert.deepEqual(decoded.technicalSpecs, {}, name);
  assert.equal(decoded.canonicalModelPath, null, name);
  assert.equal(searched.exactMatch?.model_name, name, name);
  assert.equal(searched.exactMatch?.source, 'MODEL_IDENTITY_INDEX', name);
  assert.equal(searched.exactMatch?.slug, null, name);
  assert.equal(searched.exactMatch?.source_document_ref, findModelIdentity(name).source_document_ref, name);
}

for (const name of ['025', '026', '044', 'MS 260', 'MSA 60', 'MSE 141', 'HS 81', 'HS 81 R', 'HS 81 T']) {
  const decoded = decodeStihlCode(name, db);
  assert.equal(decoded.success, true, name);
  if (name !== 'MSA 60' && name !== 'MSE 141') {
    assert.equal(decoded.model.replace(/^STIHL\s+/, ''), name, name);
  }
  assert.notEqual(decoded.modelResolution, 'EXACT_IDENTITY_ONLY', name);
  assert.notEqual(searchIntelligentModels(name, db).exactMatch?.source, 'MODEL_IDENTITY_INDEX', name);
}
for (const name of ['184592301', '00004007025', '099', 'ZZZ 999', 'HS 75 R', '028X']) {
  assert.equal(findModelIdentity(name), null, name);
  assert.notEqual(searchIntelligentModels(name, db).exactMatch?.source, 'MODEL_IDENTITY_INDEX', name);
  assert.notEqual(decodeStihlCode(name, db).modelResolution, 'EXACT_IDENTITY_ONLY', name);
}
assert.equal(decodeStihlCode('MSA 60', db).driveClassification.drive_type, 'BATTERY_ELECTRIC');
assert.equal(decodeStihlCode('MSE 141', db).driveClassification.drive_type, 'CORDED_ELECTRIC');
console.log('Phase 65A: PASS');
