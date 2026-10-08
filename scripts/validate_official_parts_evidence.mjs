#!/usr/bin/env node
/**
 * Strict Content-Level Validator for Official STIHL Parts Evidence (Phase 52A-R5)
 * Verifies that all official claims satisfy the strict manufacturer authority contract:
 * 1. source_url starts with https://www.stihl.
 * 2. response_sha256 is 64-char hex string
 * 3. part_number normalizes to exact 11 digits
 * 4. models is non-empty array
 * 5. doc_ref is present
 * 6. claim_evidence_type, source_locator, and compatibility_text are present
 * 7. Negative test assertions confirm rejection of invalid claims.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function validateOfficialRecord(item) {
  const errors = [];
  if (!item || typeof item !== 'object') {
    return ['Null or non-object item'];
  }

  if (!item.verification_status) {
    errors.push('Missing verification_status');
    return errors;
  }

  if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
    // 1. Part number check
    const norm = PartNormalizer.normalizePartNumber(item.part_number);
    if (!norm) {
      errors.push(`Invalid 11-digit part number "${item.part_number}"`);
    }

    // 2. Source URL check
    if (!item.source_url || !item.source_url.startsWith('https://www.stihl.')) {
      errors.push(`Invalid official source URL "${item.source_url}" (Must start with https://www.stihl.)`);
    }

    // 3. SHA-256 check
    if (!item.response_sha256 || !/^[0-9a-f]{64}$/i.test(item.response_sha256)) {
      errors.push(`Invalid 64-char response_sha256 "${item.response_sha256}"`);
    }

    // 4. Models check
    if (!Array.isArray(item.models) || item.models.length === 0) {
      errors.push('Missing or empty models array');
    }

    // 5. Doc ref check
    if (!item.doc_ref) {
      errors.push('Missing official doc_ref');
    }

    // 6. Claim evidence & locator check
    if (!item.claim_evidence_type) {
      errors.push('Missing claim_evidence_type');
    }
    if (!item.source_locator) {
      errors.push('Missing source_locator');
    }
    if (!item.compatibility_text) {
      errors.push('Missing compatibility_text');
    }

    // 7. Consistency check between models and compatibility_text
    if (Array.isArray(item.models) && item.compatibility_text) {
      for (const m of item.models) {
        const baseM = m.replace(/^STIHL\s+/i, '').trim();
        if (!item.compatibility_text.includes(baseM)) {
          errors.push(`Model "${m}" not represented in compatibility_text "${item.compatibility_text}"`);
        }
      }
    }
  }

  return errors;
}

export function runNegativeValidationTests() {
  console.log('🧪 Running Official Evidence Validator Negative Tests...');

  // Test 1: Fake/invalid part number
  const fakePart = {
    part_number: '99999999999',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED',
    source_url: 'https://www.stihl.nl/test',
    response_sha256: 'a'.repeat(64),
    models: ['MS 261'],
    doc_ref: 'Test Doc',
    claim_evidence_type: 'OFFICIAL_CATALOGUE_ENTRY',
    source_locator: 'Test',
    compatibility_text: 'MS 261'
  };
  // Normalize should succeed for 11 digits, but let's test a non-11 digit invalid string
  const badPartNo = { ...fakePart, part_number: 'INVALID_PART' };
  const badPartErrors = validateOfficialRecord(badPartNo);
  if (badPartErrors.length === 0) {
    throw new Error('Negative test failed: Invalid part number did not trigger validation error');
  }

  // Test 2: Mismatched compatibility text / model
  const badModel = { ...fakePart, part_number: '11400074101', models: ['FS 999'], compatibility_text: 'MS 261' };
  const badModelErrors = validateOfficialRecord(badModel);
  if (badModelErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched model compatibility did not trigger validation error');
  }

  // Test 3: Invalid SHA256
  const badSha = { ...fakePart, part_number: '11400074101', response_sha256: 'not-a-valid-sha' };
  const badShaErrors = validateOfficialRecord(badSha);
  if (badShaErrors.length === 0) {
    throw new Error('Negative test failed: Invalid SHA-256 did not trigger validation error');
  }

  console.log('  ✓ Negative tests passed: Invalid part number, wrong model, and invalid SHA rejected.\n');
}

export function validateOfficialEvidenceFile(evidencePath) {
  console.log('===============================================================');
  console.log('🛡️ OFFICIAL STIHL PARTS EVIDENCE VALIDATION AUDIT (Phase 52A-R5)');
  console.log('===============================================================\n');

  runNegativeValidationTests();

  if (!fs.existsSync(evidencePath)) {
    console.error(`❌ ERROR: Evidence file not found at ${evidencePath}`);
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  console.log(`Total Evidence Records: ${records.length}`);

  let verifiedCount = 0;
  let demotedCount = 0;
  let allErrors = [];

  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    const idx = `#${i + 1} (${item.part_number_display || item.part_number})`;

    const recordErrors = validateOfficialRecord(item);
    if (recordErrors.length > 0) {
      recordErrors.forEach(e => allErrors.push(`${idx}: ${e}`));
    }

    if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
      verifiedCount++;
      console.log(`  ✓ [VERIFIED] ${item.part_number_display.padEnd(16)} | ${item.part_name.slice(0, 45).padEnd(45)} | [${item.models.join(', ')}]`);
    } else {
      demotedCount++;
      console.log(`  ⚠ [${item.verification_status}] ${(item.part_number_display || item.part_number).padEnd(16)} | ${item.part_name}`);
    }
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Verified Official Claims: ${verifiedCount}`);
  console.log(`Demoted / Curated Claims: ${demotedCount}`);
  console.log(`Validation Errors:        ${allErrors.length}`);
  console.log('---------------------------------------------------------------');

  if (allErrors.length > 0) {
    console.error('\n❌ VALIDATION FAILED:');
    allErrors.forEach(e => console.error(`  • ${e}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL OFFICIAL STIHL EVIDENCE RECORDS STRICTLY COMPLIANT!');
    return { verifiedCount, demotedCount, total: records.length };
  }
}

if (process.argv[1] && process.argv[1].endsWith('validate_official_parts_evidence.mjs')) {
  const targetPath = path.join(rootDir, 'data', 'verified_official_parts_evidence.json');
  validateOfficialEvidenceFile(targetPath);
}
