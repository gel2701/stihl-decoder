import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { decodeStihlCode } from '../src/decoder.js';
import { OfficialSerialAnchorResolver } from '../src/OfficialSerialAnchorResolver.js';
import { OfficialSerialAliasResolver, isValidOfficialAlias } from '../src/OfficialSerialAliasResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const jsonDbPath = path.join(rootDir, 'data', 'stihl_database.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const canonicalAliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
const sourceAliasesPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'official_serial_input_aliases_2026-09-26.json');
const batch2ManifestPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'batch_manifest.json');
const batch2RecheckPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'serial_recheck_queue_2026-10-06.csv');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
}

const database = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const canonicalAliasesDoc = JSON.parse(fs.readFileSync(canonicalAliasesPath, 'utf8'));
const sourceAliasesDoc = JSON.parse(fs.readFileSync(sourceAliasesPath, 'utf8'));

test('Phase 51B - Test 1: Source and Canonical Alias Counts Equivalence (171 Records)', () => {
  assert.strictEqual(sourceAliasesDoc.aliases.length, 171, 'Source aliases must have exactly 171 entries');
  assert.strictEqual(canonicalAliasesDoc.aliases.length, 171, 'Canonical aliases must have exactly 171 entries');
  assert.strictEqual(database.official_serial_input_aliases.length, 171, 'stihl_database.json must contain 171 aliases');
});

test('Phase 51B - Test 2: Input & Target Serial Invariants', () => {
  const inputSet = new Set();
  for (const alias of canonicalAliasesDoc.aliases) {
    assert.match(alias.input_serial, /^\d{8}$/, `Input serial ${alias.input_serial} must be exact 8 digits`);
    assert.match(alias.official_serial_number, /^\d{9}$/, `Target serial ${alias.official_serial_number} must be exact 9 digits`);
    assert.strictEqual(alias.source, 'MY_STIHL', 'Source must be MY_STIHL');
    assert.strictEqual(alias.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Verification status must be OFFICIAL_STIHL_LOOKUP');
    assert.strictEqual(alias.alias_type, 'MY_STIHL_LEADING_ZERO_NORMALIZATION', 'Alias type must be MY_STIHL_LEADING_ZERO_NORMALIZATION');
    assert.strictEqual(alias.generic_zero_prefix_rule_allowed, false, 'generic_zero_prefix_rule_allowed must be false');
    assert.ok(!inputSet.has(alias.input_serial), `Duplicate input alias key: ${alias.input_serial}`);
    inputSet.add(alias.input_serial);
  }
  assert.strictEqual(inputSet.size, 171, 'Must have 171 unique input serial keys');
});

test('Phase 51B - Test 3: All 171 Targets Exist in Official Anchor Registry (2845 Records)', () => {
  const anchorMap = new Map(anchorsDoc.anchors.map(a => [a.serial_number, a]));
  assert.strictEqual(anchorMap.size, 2845, 'Official anchors registry must have 2845 unique anchors');

  for (const alias of canonicalAliasesDoc.aliases) {
    const anchor = anchorMap.get(alias.official_serial_number);
    assert.ok(anchor, `Target anchor ${alias.official_serial_number} must exist in official anchors`);
    assert.strictEqual(anchor.source, 'MY_STIHL');
    assert.strictEqual(anchor.verification_status, 'OFFICIAL_STIHL_LOOKUP');
  }
});

test('Phase 51B - Test 4: OfficialSerialAliasResolver Pure Behavior', () => {
  // Registered alias
  const found = OfficialSerialAliasResolver.resolve('10000000', database);
  assert.ok(found, '10000000 must resolve');
  assert.strictEqual(found.official_serial_number, '010000000');
  assert.strictEqual(found.generic_zero_prefix_rule_allowed, false);

  // Unregistered 8-digit
  const unreg = OfficialSerialAliasResolver.resolve('99999999', database);
  assert.strictEqual(unreg, null, 'Unregistered 8-digit serial must return null');

  // Non-8 digit
  assert.strictEqual(OfficialSerialAliasResolver.resolve('1000000', database), null);
  assert.strictEqual(OfficialSerialAliasResolver.resolve('010000000', database), null);
  assert.strictEqual(OfficialSerialAliasResolver.resolve('', database), null);
  assert.strictEqual(OfficialSerialAliasResolver.resolve(null, database), null);
});

test('Phase 51B - Test 5: Exhaustive 171/171 Alias Resolution & Identity Parity with Direct Targets', () => {
  for (const alias of canonicalAliasesDoc.aliases) {
    const aliasRes = decodeStihlCode(alias.input_serial, database);
    assert.strictEqual(aliasRes.success, true, `Alias ${alias.input_serial} decode failed`);
    assert.strictEqual(aliasRes.inputSerial, alias.input_serial, `inputSerial mismatch on ${alias.input_serial}`);
    assert.strictEqual(aliasRes.officialSerialNumber, alias.official_serial_number, `officialSerialNumber mismatch on ${alias.input_serial}`);
    assert.strictEqual(aliasRes.inputAliasMatched, true, `inputAliasMatched must be true for ${alias.input_serial}`);
    assert.strictEqual(aliasRes.inputAliasType, 'MY_STIHL_LEADING_ZERO_NORMALIZATION');
    assert.strictEqual(aliasRes.aliasSource, 'MY_STIHL');
    assert.strictEqual(aliasRes.identityStatus, 'EXACT_MODEL_IDENTIFIED');
    assert.strictEqual(aliasRes.identitySource, 'OFFICIAL_STIHL_LOOKUP');

    // Compare with direct 9-digit target decode
    const targetRes = decodeStihlCode(alias.official_serial_number, database);
    assert.strictEqual(targetRes.success, true, `Target ${alias.official_serial_number} decode failed`);
    assert.strictEqual(aliasRes.model, targetRes.model, `Model mismatch between alias ${alias.input_serial} and target ${alias.official_serial_number}`);
    assert.strictEqual(aliasRes.exactModel, targetRes.exactModel);
    assert.strictEqual(aliasRes.category, targetRes.category);
    assert.strictEqual(targetRes.inputAliasMatched, false, `Direct target ${alias.official_serial_number} must have inputAliasMatched=false`);
    assert.strictEqual(targetRes.inputSerial, alias.official_serial_number);
  }
});

test('Phase 51B - Test 6: Critical Negative Controls (Unregistered 8-digit inputs fail closed)', () => {
  const unregisteredList = ['99999999', '12345678', '88888888', '00000000', '77777777'];
  const aliasSet = new Set(canonicalAliasesDoc.aliases.map(a => a.input_serial));

  for (const unreg of unregisteredList) {
    if (aliasSet.has(unreg)) continue;
    const res = decodeStihlCode(unreg, database);
    assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', `Unregistered serial ${unreg} must not resolve exact identity`);
    assert.notStrictEqual(res.inputAliasMatched, true, `Unregistered serial ${unreg} must not match alias`);
  }
});

test('Phase 51B - Test 7: Direct 9-digit Inputs Win and Do Not Report Alias Match', () => {
  const res = decodeStihlCode('010000000', database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.inputSerial, '010000000');
  assert.strictEqual(res.officialSerialNumber, '010000000');
  assert.strictEqual(res.inputAliasMatched, false);
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.model, 'FS 55 RC-E Z Motorsense');
});

test('Phase 51B - Test 8: Zero Overlap with Batch 2 Recheck Queue (867 Records)', () => {
  const aliasSet = new Set(canonicalAliasesDoc.aliases.map(a => a.input_serial));
  const csvContent = fs.readFileSync(batch2RecheckPath, 'utf8');
  const lines = csvContent.trim().split('\n').slice(1);
  assert.strictEqual(lines.length, 867, 'Batch 2 recheck queue must contain 867 rows');

  for (const line of lines) {
    const parts = line.includes(';') ? line.split(';') : line.split(',');
    const serial = parts[0].replace(/"/g, '').trim();
    assert.ok(!aliasSet.has(serial), `Recheck queue input ${serial} must NOT be in alias registry`);
  }
});

test('Phase 51B - Test 9: Batch 2 Contributes 0 New Aliases', () => {
  const batch2Manifest = JSON.parse(fs.readFileSync(batch2ManifestPath, 'utf8'));
  assert.strictEqual(batch2Manifest.new_evidenced_input_aliases, 0, 'Batch 2 must contribute 0 aliases');
});

test('Phase 51B - Test 10: Official Anchor Count Remains Exactly 2845', () => {
  assert.strictEqual(anchorsDoc.anchors.length, 2845, 'Official anchors in official_serial_anchors.json must remain 2845');
  assert.strictEqual(database.official_serial_anchors.length, 2845, 'Official anchors in stihl_database.json must remain 2845');
});

test('Phase 51B - Test 11: JSON vs SQLite Alias Parity for all 171 Records', async () => {
  let rows;
  if (Database) {
    const db = new Database(sqliteDbPath, { readonly: true });
    rows = db.prepare('SELECT * FROM official_serial_input_aliases ORDER BY input_serial ASC').all();
    db.close();
  } else {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
    rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM official_serial_input_aliases ORDER BY input_serial ASC', (err, r) => {
        if (err) reject(err); else resolve(r);
      });
    });
    db.close();
  }

  assert.strictEqual(rows.length, 171, 'SQLite official_serial_input_aliases table must have 171 rows');
  assert.strictEqual(canonicalAliasesDoc.aliases.length, 171, 'JSON aliases must have 171 rows');

  for (let i = 0; i < canonicalAliasesDoc.aliases.length; i++) {
    const j = canonicalAliasesDoc.aliases[i];
    const s = rows[i];
    assert.strictEqual(j.input_serial, s.input_serial);
    assert.strictEqual(j.official_serial_number, s.official_serial_number);
    assert.strictEqual(j.alias_type, s.alias_type);
    assert.strictEqual(j.source, s.source);
    assert.strictEqual(j.source_url || null, s.source_url || null);
    assert.strictEqual(j.verification_date || null, s.verification_date || null);
    assert.strictEqual(j.verification_status, s.verification_status);
    assert.strictEqual(j.generic_zero_prefix_rule_allowed ? 1 : 0, s.generic_zero_prefix_rule_allowed);
  }
});

test('Phase 51B - Test 12: Range Rules Unchanged (0 Inferred Range Rules)', () => {
  const ranges = database.model_serial_ranges || [];
  const aliasRanges = ranges.filter(r => r.serial_start === 10000000 || r.serial_end === 11440000);
  assert.strictEqual(aliasRanges.length, 0, 'No range rules may be created from aliases');
});

test('Phase 51B - Test 13: Representative Alias Samples Resolution', () => {
  const samples = [
    { input: '10000000', target: '010000000', expectedModel: 'FS 55 RC-E Z Motorsense', category: 'Bosmaaier' },
    { input: '10122000', target: '010122000', expectedModel: '070 .404" P Motorsäge', category: 'Kettingzaag' },
    { input: '10237000', target: '010237000', expectedModel: '08 S .404"7Z-P- STIHL Motorsäge', category: 'Kettingzaag' },
    { input: '10552000', target: '010552000', expectedModel: '08 SQ STIHL Motorsäge', category: 'Kettingzaag' },
    { input: '11366000', target: '011366000', expectedModel: '08 S .404"7Z-P- STIHL Motorsäge', category: 'Kettingzaag' },
    { input: '11440000', target: '011440000', expectedModel: '08 S .404"7Z-P- STIHL Motorsäge', category: 'Kettingzaag' }
  ];

  for (const s of samples) {
    const res = decodeStihlCode(s.input, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.inputSerial, s.input);
    assert.strictEqual(res.officialSerialNumber, s.target);
    assert.strictEqual(res.inputAliasMatched, true);
    assert.strictEqual(res.model, s.expectedModel);
    assert.strictEqual(res.category, s.category);
    assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
    assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  }
});

test('Phase 51B - Test 14: Direct isValidOfficialAlias Contract Validation', () => {
  const validRecord = {
    input_serial: '10000000',
    official_serial_number: '010000000',
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: false
  };

  assert.strictEqual(isValidOfficialAlias(validRecord), true, 'Valid record must pass');
  assert.strictEqual(isValidOfficialAlias(null), false, 'null must fail');
  assert.strictEqual(isValidOfficialAlias({}), false, 'Empty object must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, input_serial: '1000000' }), false, '7-digit input must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, input_serial: '100000000' }), false, '9-digit input must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, official_serial_number: '10000000' }), false, '8-digit target must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, source: 'DEALER_INFERRED' }), false, 'Non-MY_STIHL source must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, verification_status: 'UNVERIFIED' }), false, 'Non-OFFICIAL_STIHL_LOOKUP status must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, alias_type: 'GENERIC_PAD_ZERO' }), false, 'Non-standard alias_type must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, generic_zero_prefix_rule_allowed: true }), false, 'generic_zero_prefix_rule_allowed=true must fail');
  assert.strictEqual(isValidOfficialAlias({ ...validRecord, generic_zero_prefix_rule_allowed: undefined }), false, 'generic_zero_prefix_rule_allowed=undefined must fail');
});

test('Phase 51B - Test 15: Failure Injection A - Invalid Verification Status', () => {
  const injectedAlias = {
    input_serial: '12345678',
    official_serial_number: '010000000',
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'UNVERIFIED',
    generic_zero_prefix_rule_allowed: false
  };

  // Resolver level
  const resolved = OfficialSerialAliasResolver.resolve('12345678', null, { officialAliases: [injectedAlias] });
  assert.strictEqual(resolved, null, 'Unverified alias must be rejected by resolver');

  // Decoder level
  const res = decodeStihlCode('12345678', database, { officialAliases: [injectedAlias] });
  assert.notStrictEqual(res.inputAliasMatched, true, 'inputAliasMatched must not be true for unverified alias');
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'identityStatus must not be EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 16: Failure Injection B - Generic Rule Allowed True', () => {
  const injectedAlias = {
    input_serial: '12345678',
    official_serial_number: '010000000',
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: true
  };

  const resolved = OfficialSerialAliasResolver.resolve('12345678', null, { officialAliases: [injectedAlias] });
  assert.strictEqual(resolved, null, 'generic_zero_prefix_rule_allowed: true must be rejected by resolver');

  const res = decodeStihlCode('12345678', database, { officialAliases: [injectedAlias] });
  assert.notStrictEqual(res.inputAliasMatched, true);
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 17: Failure Injection C - Invalid Source', () => {
  const injectedAlias = {
    input_serial: '12345678',
    official_serial_number: '010000000',
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'DEALER_INFERRED',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: false
  };

  const resolved = OfficialSerialAliasResolver.resolve('12345678', null, { officialAliases: [injectedAlias] });
  assert.strictEqual(resolved, null, 'Non-MY_STIHL source must be rejected by resolver');

  const res = decodeStihlCode('12345678', database, { officialAliases: [injectedAlias] });
  assert.notStrictEqual(res.inputAliasMatched, true);
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 18: Failure Injection D - Invalid Alias Type', () => {
  const injectedAlias = {
    input_serial: '12345678',
    official_serial_number: '010000000',
    alias_type: 'GENERIC_PAD_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: false
  };

  const resolved = OfficialSerialAliasResolver.resolve('12345678', null, { officialAliases: [injectedAlias] });
  assert.strictEqual(resolved, null, 'Non-standard alias_type must be rejected by resolver');

  const res = decodeStihlCode('12345678', database, { officialAliases: [injectedAlias] });
  assert.notStrictEqual(res.inputAliasMatched, true);
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 19: Failure Injection E - Invalid Target Format', () => {
  const injectedAlias = {
    input_serial: '12345678',
    official_serial_number: '01000000', // 8 digits instead of 9
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: false
  };

  const resolved = OfficialSerialAliasResolver.resolve('12345678', null, { officialAliases: [injectedAlias] });
  assert.strictEqual(resolved, null, 'Malformed target serial must be rejected by resolver');

  const res = decodeStihlCode('12345678', database, { officialAliases: [injectedAlias] });
  assert.notStrictEqual(res.inputAliasMatched, true);
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 20: Failure Injection F - Conflicting / Malformed Options Alias Bypass Prevention', () => {
  const malformedOptions = {
    officialAliases: [
      {
        input_serial: '10000000',
        official_serial_number: '010000000',
        alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
        source: 'MY_STIHL',
        verification_status: 'FORGED_STATUS',
        generic_zero_prefix_rule_allowed: false
      }
    ]
  };

  const resolved = OfficialSerialAliasResolver.resolve('10000000', database, malformedOptions);
  assert.strictEqual(resolved, null, 'Malformed options alias must fail closed without fallback bypass');

  const res = decodeStihlCode('10000000', database, malformedOptions);
  assert.notStrictEqual(res.inputAliasMatched, true);
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
});

test('Phase 51B - Test 21: Target Safety - Missing Target Anchor does not promote alias data to exact model identity', () => {
  // Candidate alias with valid format, but pointing to non-existent target anchor
  const aliasWithMissingTarget = {
    input_serial: '19999999',
    official_serial_number: '019999999', // Not in anchors registry
    alias_type: 'MY_STIHL_LEADING_ZERO_NORMALIZATION',
    source: 'MY_STIHL',
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    generic_zero_prefix_rule_allowed: false
  };

  const res = decodeStihlCode('19999999', database, { officialAliases: [aliasWithMissingTarget] });
  assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Missing target anchor must NOT result in EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.success, false, 'Missing target anchor must fail closed');
});
