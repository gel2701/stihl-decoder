#!/usr/bin/env node
/**
 * Strict Validator for Official STIHL Parts Evidence (Phase 52A-R4)
 * Verifies that all official claims satisfy the strict manufacturer authority contract:
 * 1. source_url starts with https://www.stihl.
 * 2. response_sha256 is 64-char hex string
 * 3. part_number normalizes to exact 11 digits
 * 4. models is non-empty array
 * 5. doc_ref is present
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const evidencePath = path.join(rootDir, 'data', 'verified_official_parts_evidence.json');

console.log('===============================================================');
console.log('🛡️ OFFICIAL STIHL PARTS EVIDENCE VALIDATION AUDIT');
console.log('===============================================================\n');

if (!fs.existsSync(evidencePath)) {
  console.error(`❌ ERROR: Evidence file not found at ${evidencePath}`);
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
console.log(`Total Evidence Records: ${records.length}`);

let verifiedCount = 0;
let demotedCount = 0;
let errors = [];

for (let i = 0; i < records.length; i++) {
  const item = records[i];
  const idx = `#${i + 1} (${item.part_number_display || item.part_number})`;

  if (!item.verification_status) {
    errors.push(`${idx}: Missing verification_status`);
    continue;
  }

  if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
    // 1. Part number check
    const norm = PartNormalizer.normalizePartNumber(item.part_number);
    if (!norm) {
      errors.push(`${idx}: Invalid 11-digit part number "${item.part_number}"`);
    }

    // 2. Source URL check
    if (!item.source_url || !item.source_url.startsWith('https://www.stihl.')) {
      errors.push(`${idx}: Invalid official source URL "${item.source_url}" (Must start with https://www.stihl.)`);
    }

    // 3. SHA-256 check
    if (!item.response_sha256 || !/^[0-9a-f]{64}$/i.test(item.response_sha256)) {
      errors.push(`${idx}: Invalid 64-char response_sha256 "${item.response_sha256}"`);
    }

    // 4. Models check
    if (!Array.isArray(item.models) || item.models.length === 0) {
      errors.push(`${idx}: Missing or empty models array`);
    }

    // 5. Doc ref check
    if (!item.doc_ref) {
      errors.push(`${idx}: Missing official doc_ref`);
    }

    verifiedCount++;
    console.log(`  ✓ ${item.part_number_display.padEnd(16)} | ${item.part_name.slice(0, 45).padEnd(45)} | [${item.models.join(', ')}]`);
  } else {
    demotedCount++;
    console.log(`  ⚠ [${item.verification_status}] ${item.part_number_display || item.part_number} | ${item.part_name}`);
  }
}

console.log('\n---------------------------------------------------------------');
console.log(`Verified Official Claims: ${verifiedCount}`);
console.log(`Demoted / Curated Claims: ${demotedCount}`);
console.log(`Validation Errors:        ${errors.length}`);
console.log('---------------------------------------------------------------');

if (errors.length > 0) {
  console.error('\n❌ VALIDATION FAILED:');
  errors.forEach(e => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log('\n🎉 ALL OFFICIAL STIHL EVIDENCE RECORDS STRICTLY COMPLIANT!');
  process.exit(0);
}
