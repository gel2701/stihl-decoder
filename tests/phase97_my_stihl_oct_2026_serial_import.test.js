import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImportedMyStihlSerial } from '../src/ImportedMyStihlSerialResolver.js';
import { OfficialSerialAnchorResolver } from '../src/OfficialSerialAnchorResolver.js';

const models = [
  { id: 'stihl_ms_230', model_name: 'MS 230', category: 'Kettingzaag' },
  { id: 'stihl_ms_260', model_name: 'MS 260', category: 'Kettingzaag' },
  { id: 'stihl_bg_86', model_name: 'BG 86', category: 'Bladblazer' }
];
const database = { models };

test('MY STIHL captured exact serial and matching base model resolves to canonical identity', () => {
  const result = resolveImportedMyStihlSerial('161134050', database);
  assert.equal(result?.model_name, 'MS 230');
  assert.equal(result?.canonical_model_id, 'stihl_ms_230');
  assert.equal(result?.source, 'MY_STIHL');
  assert.equal(result?.verification_status, 'OFFICIAL_STIHL_LOOKUP');
  assert.equal(result?.evidence_capture, 'USER_SUPPLIED_MY_STIHL_SCREEN_TEXT');
  assert.ok(!('owner_name' in result) && !('purchase_date' in result));
});

test('another captured category is supported without losing technical identity', () => {
  const result = resolveImportedMyStihlSerial('188100000', database);
  assert.equal(result?.model_name, 'BG 86');
  assert.equal(result?.category, 'Bladblazer');
});

test('unconfirmed variant must not inherit a base model official identity', () => {
  assert.equal(resolveImportedMyStihlSerial('161146050', database), null);
});

test('timeouts, malformed serials and unknown serials never become verified anchors', () => {
  assert.equal(resolveImportedMyStihlSerial('299963595', database), null);
  assert.equal(resolveImportedMyStihlSerial('1234', database), null);
  assert.equal(resolveImportedMyStihlSerial('999999999', database), null);
});

test('all existing authoritative database anchors take precedence over imported captures', () => {
  const existing = { serial_number: '161134050', model_name: 'PRIOR_EXISTING_ANCHOR' };
  const result = OfficialSerialAnchorResolver.resolve('161134050', {
    models,
    official_serial_anchors: [existing]
  });
  assert.equal(result, existing);
});
