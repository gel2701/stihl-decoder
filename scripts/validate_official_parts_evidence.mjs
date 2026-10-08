#!/usr/bin/env node
/**
 * Strict Content-Level Validator for Official STIHL Parts Evidence (Phase 52A-R6)
 * Verifies that all official claims satisfy the strict manufacturer authority contract:
 * 1. source_url starts with https://www.stihl.
 * 2. response_sha256 is 64-char hex string and matches actual response body SHA-256
 * 3. part_number normalizes to exact 11 digits and is present in response body
 * 4. models is non-empty array and models are present in response body
 * 5. doc_ref, claim_evidence_type, source_locator, and compatibility_text are present
 * 6. Negative test assertions confirm rejection of invalid claims (fake parts, wrong models, invalid SHAs).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { HttpClient } from '../src/parts/HttpClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function validateOfficialRecord(item, responseBody = null) {
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
    if (!item.source_url || typeof item.source_url !== 'string' || !item.source_url.startsWith('https://www.stihl.')) {
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

    // 8. Content-Level Validation (when response body is provided)
    if (responseBody !== null) {
      // 8a. Verify SHA-256 matches body
      const actualSha = crypto.createHash('sha256').update(responseBody).digest('hex');
      if (item.response_sha256 && item.response_sha256.toLowerCase() !== actualSha.toLowerCase()) {
        errors.push(`Response SHA-256 mismatch: expected ${item.response_sha256}, got actual body hash ${actualSha}`);
      }

      // 8b. Verify exact 11-digit part number presence in response body
      if (norm) {
        const formatted = PartNormalizer.formatPartNumber(norm);
        const hasPartNo = responseBody.includes(norm) || (formatted && responseBody.includes(formatted));
        if (!hasPartNo) {
          errors.push(`Part number "${norm}" (${formatted}) not found in official response body content`);
        }
      }

      // 8c. Verify claimed models presence in response body
      if (Array.isArray(item.models)) {
        for (const m of item.models) {
          const cleanM = m.replace(/^STIHL\s+/i, '').trim();
          if (!responseBody.includes(cleanM)) {
            errors.push(`Claimed model "${cleanM}" not found in official response body content`);
          }
        }
      }
    }
  }

  return errors;
}

export function runNegativeValidationTests() {
  console.log('🧪 Running Official Evidence Validator Negative Tests...');

  const mockValidHtml = `
    <html>
      <head><title>STIHL Service Kit 45</title></head>
      <body>
        <h1>Service Kit 45 voor MS 170 en MS 180</h1>
        <p>Bestelnummer: 1130 007 4103</p>
        <p>Compatibel met MS 170 en MS 180.</p>
      </body>
    </html>
  `;
  const mockSha = crypto.createHash('sha256').update(mockValidHtml).digest('hex');

  const baseRecord = {
    part_number: '11300074103',
    part_number_display: '1130 007 4103',
    part_name: 'Service Kit 45',
    models: ['MS 170', 'MS 180'],
    source_url: 'https://www.stihl.nl/nl/ap/service-kit-45-140895',
    response_sha256: mockSha,
    doc_ref: 'STIHL Service Kit Manual',
    claim_evidence_type: 'OFFICIAL_CATALOGUE_ENTRY',
    source_locator: 'Service Kit 45',
    compatibility_text: 'MS 170, MS 180',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED'
  };

  // Positive baseline check
  const posErrors = validateOfficialRecord(baseRecord, mockValidHtml);
  if (posErrors.length > 0) {
    throw new Error(`Positive mock test failed: ${posErrors.join(', ')}`);
  }

  // Negative Test 1: Fake 11-digit part number not present in body
  const fakePartRecord = { ...baseRecord, part_number: '99999999999', part_number_display: '9999 999 9999' };
  const fakePartErrors = validateOfficialRecord(fakePartRecord, mockValidHtml);
  if (fakePartErrors.length === 0) {
    throw new Error('Negative test failed: Fake part number 99999999999 did not trigger content validation error');
  }

  // Negative Test 2: Mismatched model not present in body
  const badModelRecord = { ...baseRecord, models: ['FS 999'], compatibility_text: 'FS 999' };
  const badModelErrors = validateOfficialRecord(badModelRecord, mockValidHtml);
  if (badModelErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched model FS 999 did not trigger content validation error');
  }

  // Negative Test 3: Invalid SHA256 mismatch with body
  const badShaRecord = { ...baseRecord, response_sha256: 'a'.repeat(64) };
  const badShaErrors = validateOfficialRecord(badShaRecord, mockValidHtml);
  if (badShaErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched response SHA-256 did not trigger validation error');
  }

  // Negative Test 4: Malformed part number
  const malformedPartRecord = { ...baseRecord, part_number: 'INVALID_NO' };
  const malformedErrors = validateOfficialRecord(malformedPartRecord, mockValidHtml);
  if (malformedErrors.length === 0) {
    throw new Error('Negative test failed: Malformed part number did not trigger validation error');
  }

  // Negative Test 5: Invalid non-STIHL URL
  const nonStihlRecord = { ...baseRecord, source_url: 'https://www.thirdparty.com/test' };
  const nonStihlErrors = validateOfficialRecord(nonStihlRecord, mockValidHtml);
  if (nonStihlErrors.length === 0) {
    throw new Error('Negative test failed: Non-STIHL URL did not trigger validation error');
  }

  console.log('  ✓ Negative tests passed: Fake 11-digit part 99999999999, wrong model, SHA mismatch, and non-STIHL URL rejected.\n');
}

export async function validateOfficialEvidenceFile(evidencePath, options = {}) {
  console.log('===============================================================');
  console.log('🛡️ OFFICIAL STIHL PARTS EVIDENCE VALIDATION AUDIT (Phase 52A-R6)');
  console.log('===============================================================\n');

  runNegativeValidationTests();

  if (!fs.existsSync(evidencePath)) {
    console.error(`❌ ERROR: Evidence file not found at ${evidencePath}`);
    process.exit(1);
  }

  const client = options.httpClient || new HttpClient({ mode: options.mode || 'LIVE', useCache: true });
  const records = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  console.log(`Total Evidence Records: ${records.length}`);

  let verifiedCount = 0;
  let demotedCount = 0;
  let allErrors = [];

  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    const idx = `#${i + 1} (${item.part_number_display || item.part_number})`;

    let responseBody = null;
    if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
      const res = await client.get(item.source_url, { purpose: `validate_official_evidence_${item.part_number}` });
      if (res.status === 200 && res.body) {
        responseBody = res.body;
      } else {
        allErrors.push(`${idx}: Failed to fetch or read cached official source body for ${item.source_url} (HTTP ${res.status})`);
      }
    }

    const recordErrors = validateOfficialRecord(item, responseBody);
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
    throw new Error(`Official evidence validation failed with ${allErrors.length} errors`);
  } else {
    console.log('\n🎉 ALL OFFICIAL STIHL EVIDENCE RECORDS STRICTLY COMPLIANT!');
    return { verifiedCount, demotedCount, total: records.length };
  }
}

if (process.argv[1] && process.argv[1].endsWith('validate_official_parts_evidence.mjs')) {
  const targetPath = path.join(rootDir, 'data', 'verified_official_parts_evidence.json');
  validateOfficialEvidenceFile(targetPath).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
