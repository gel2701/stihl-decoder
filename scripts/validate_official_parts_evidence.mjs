#!/usr/bin/env node
/**
 * Strict Content-Level Validator for Official STIHL Parts Evidence (Phase 52B-R3A)
 *
 * Supports two distinct validation policies:
 * 1. 'STRICT_SNAPSHOT': Validates stored snapshot/fixture integrity (exact response_sha256 match required).
 * 2. 'CLAIM_REVALIDATION' (default): Validates manufacturer claim authority on live/current webpage.
 *    - Full-body SHA drift is reported as a non-fatal warning (SOURCE_BODY_CHANGED_CLAIM_STILL_VALID / VERIFIED_SOURCE_CHANGED).
 *    - All claim-level checks (part number, models, locator, condition, official STIHL domain) remain FAIL-CLOSED.
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

export const HASH_POLICIES = {
  STRICT_SNAPSHOT: 'STRICT_SNAPSHOT',
  CLAIM_REVALIDATION: 'CLAIM_REVALIDATION'
};

export const HASH_STATUS = {
  VERIFIED_UNCHANGED: 'VERIFIED_UNCHANGED',
  SOURCE_BODY_CHANGED_CLAIM_STILL_VALID: 'SOURCE_BODY_CHANGED_CLAIM_STILL_VALID',
  CLAIM_FAILED_BODY_CHANGED: 'CLAIM_FAILED_BODY_CHANGED',
  CLAIM_FAILED_BODY_MATCHED: 'CLAIM_FAILED_BODY_MATCHED'
};

export function validateOfficialRecord(item, responseBody = null, options = {}) {
  const hashPolicy = options.hashPolicy || HASH_POLICIES.CLAIM_REVALIDATION;
  const errors = [];
  let hashStatus = null;
  let hashMatch = false;
  let claimContentValid = true;
  let actualSha = null;

  if (!item || typeof item !== 'object') {
    const errList = ['Null or non-object item'];
    errList.hashStatus = null;
    errList.hashMatch = false;
    errList.claimContentValid = false;
    errList.storedSha = null;
    errList.actualSha = null;
    return errList;
  }

  if (!item.verification_status) {
    errors.push('Missing verification_status');
    errors.hashStatus = null;
    errors.hashMatch = false;
    errors.claimContentValid = false;
    errors.storedSha = null;
    errors.actualSha = null;
    return errors;
  }

  if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
    // 1. Part number check
    const norm = PartNormalizer.normalizePartNumber(item.part_number);
    if (!norm) {
      errors.push(`Invalid 11-digit part number "${item.part_number}"`);
      claimContentValid = false;
    }

    // 2. Source URL check
    if (!item.source_url || typeof item.source_url !== 'string' || !item.source_url.startsWith('https://www.stihl.')) {
      errors.push(`Invalid official source URL "${item.source_url}" (Must start with https://www.stihl.)`);
      claimContentValid = false;
    }

    // 3. SHA-256 check
    if (!item.response_sha256 || !/^[0-9a-f]{64}$/i.test(item.response_sha256)) {
      errors.push(`Invalid 64-char response_sha256 "${item.response_sha256}"`);
    }

    // 4. Models check
    if (!Array.isArray(item.models) || item.models.length === 0) {
      errors.push('Missing or empty models array');
      claimContentValid = false;
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
      claimContentValid = false;
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
      actualSha = crypto.createHash('sha256').update(responseBody).digest('hex');
      hashMatch = Boolean(item.response_sha256 && item.response_sha256.toLowerCase() === actualSha.toLowerCase());

      // 8a. Hash policy evaluation
      if (hashPolicy === HASH_POLICIES.STRICT_SNAPSHOT) {
        if (!hashMatch) {
          errors.push(`Response SHA-256 mismatch: expected ${item.response_sha256}, got actual body hash ${actualSha}`);
        }
      }

      // 8b. Verify exact 11-digit part number presence in response body
      if (norm) {
        const formatted = PartNormalizer.formatPartNumber(norm);
        const hasPartNo = responseBody.includes(norm) || (formatted && responseBody.includes(formatted));
        if (!hasPartNo) {
          errors.push(`Part number "${norm}" (${formatted}) not found in official response body content`);
          claimContentValid = false;
        }
      }

      // 8c. Verify claimed models presence in response body
      if (Array.isArray(item.models)) {
        for (const m of item.models) {
          const cleanM = m.replace(/^STIHL\s+/i, '').trim();
          if (!responseBody.includes(cleanM)) {
            errors.push(`Claimed model "${cleanM}" not found in official response body content`);
            claimContentValid = false;
          }
        }
      }

      // 8d. Verify claimed source_locator presence in response body
      if (item.source_locator) {
        if (!responseBody.toLowerCase().includes(item.source_locator.toLowerCase())) {
          errors.push(`Claimed source_locator "${item.source_locator}" not found in official response body content`);
          claimContentValid = false;
        }
      }

      // 8e. Verify claimed variant_condition presence in response body
      if (item.variant_condition) {
        const conditionTokens = item.variant_condition.match(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g) || [];
        const criticalTokens = conditionTokens.filter(w => {
          const lower = w.toLowerCase();
          return w.length > 2 && !['models', 'engine', 'generation', 'standard', 'carburetors', 'early', 'serial', 'numbers', 'comfort', 'variants', 'later', 'and', 'the', 'for'].includes(lower);
        });
        for (const token of criticalTokens) {
          if (!responseBody.toLowerCase().includes(token.toLowerCase())) {
            errors.push(`Claimed variant_condition term "${token}" (from "${item.variant_condition}") not found in official response body content`);
            claimContentValid = false;
          }
        }
      }

      if (claimContentValid) {
        hashStatus = hashMatch ? HASH_STATUS.VERIFIED_UNCHANGED : HASH_STATUS.SOURCE_BODY_CHANGED_CLAIM_STILL_VALID;
      } else {
        hashStatus = hashMatch ? HASH_STATUS.CLAIM_FAILED_BODY_MATCHED : HASH_STATUS.CLAIM_FAILED_BODY_CHANGED;
      }
    }
  }

  errors.hashStatus = hashStatus;
  errors.hashMatch = hashMatch;
  errors.claimContentValid = claimContentValid;
  errors.storedSha = item?.response_sha256 || null;
  errors.actualSha = actualSha;
  return errors;
}

export function runNegativeValidationTests() {
  console.log('🧪 Running Official Evidence Validator Negative Tests...');

  const mockValidHtmlA = `
    <html>
      <head><title>STIHL Service Kit 45</title></head>
      <body>
        <h1>Service Kit 45 voor MS 170 en MS 180</h1>
        <p>Bestelnummer: 1130 007 4103</p>
        <p>Compatibel met MS 170 en MS 180 (geschikt voor 2-MIX motoren).</p>
      </body>
    </html>
  `;
  const mockShaA = crypto.createHash('sha256').update(mockValidHtmlA).digest('hex');

  const baseRecord = {
    part_number: '11300074103',
    part_number_display: '1130 007 4103',
    part_name: 'Service Kit 45',
    models: ['MS 170', 'MS 180'],
    source_url: 'https://www.stihl.nl/nl/ap/service-kit-45-140895',
    response_sha256: mockShaA,
    doc_ref: 'STIHL Service Kit Manual',
    claim_evidence_type: 'OFFICIAL_CATALOGUE_ENTRY',
    source_locator: 'Service Kit 45',
    compatibility_text: 'MS 170, MS 180',
    variant_condition: '2-MIX engine models',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED'
  };

  // Positive baseline check (Exact Hash Match)
  const posErrors = validateOfficialRecord(baseRecord, mockValidHtmlA, { hashPolicy: HASH_POLICIES.CLAIM_REVALIDATION });
  if (posErrors.length > 0) {
    throw new Error(`Positive mock test failed: ${posErrors.join(', ')}`);
  }
  if (posErrors.hashStatus !== HASH_STATUS.VERIFIED_UNCHANGED) {
    throw new Error(`Expected VERIFIED_UNCHANGED, got ${posErrors.hashStatus}`);
  }

  // Regression Test 1: Harmless HTML change (Hash drift with identical valid claims) -> PASS under CLAIM_REVALIDATION
  const mockValidHtmlB = mockValidHtmlA + '\n<!-- updated timestamp 2026-10-09 with analytics and css classes -->';
  const driftErrors = validateOfficialRecord(baseRecord, mockValidHtmlB, { hashPolicy: HASH_POLICIES.CLAIM_REVALIDATION });
  if (driftErrors.length > 0) {
    throw new Error(`Harmless HTML change should pass CLAIM_REVALIDATION, but failed: ${driftErrors.join(', ')}`);
  }
  if (driftErrors.hashStatus !== HASH_STATUS.SOURCE_BODY_CHANGED_CLAIM_STILL_VALID) {
    throw new Error(`Expected SOURCE_BODY_CHANGED_CLAIM_STILL_VALID, got ${driftErrors.hashStatus}`);
  }

  // Regression Test 2: Strict snapshot mode rejects hash mismatch -> FAIL under STRICT_SNAPSHOT
  const strictMismatchErrors = validateOfficialRecord(baseRecord, mockValidHtmlB, { hashPolicy: HASH_POLICIES.STRICT_SNAPSHOT });
  if (strictMismatchErrors.length === 0 || !strictMismatchErrors.some(e => e.includes('Response SHA-256 mismatch'))) {
    throw new Error('Negative test failed: STRICT_SNAPSHOT did not reject mismatched SHA-256');
  }

  // Negative Test 3: Material change (part number removed from body) -> FAIL under CLAIM_REVALIDATION
  const fakePartRecord = { ...baseRecord, part_number: '99999999999', part_number_display: '9999 999 9999' };
  const fakePartErrors = validateOfficialRecord(fakePartRecord, mockValidHtmlA);
  if (fakePartErrors.length === 0) {
    throw new Error('Negative test failed: Fake part number 99999999999 did not trigger content validation error');
  }

  // Negative Test 4: Mismatched model not present in body -> FAIL
  const badModelRecord = { ...baseRecord, models: ['FS 999'], compatibility_text: 'FS 999' };
  const badModelErrors = validateOfficialRecord(badModelRecord, mockValidHtmlA);
  if (badModelErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched model FS 999 did not trigger content validation error');
  }

  // Negative Test 5: Malformed part number -> FAIL
  const malformedPartRecord = { ...baseRecord, part_number: 'INVALID_NO' };
  const malformedErrors = validateOfficialRecord(malformedPartRecord, mockValidHtmlA);
  if (malformedErrors.length === 0) {
    throw new Error('Negative test failed: Malformed part number did not trigger validation error');
  }

  // Negative Test 6: Invalid non-STIHL URL -> FAIL
  const nonStihlRecord = { ...baseRecord, source_url: 'https://www.thirdparty.com/test' };
  const nonStihlErrors = validateOfficialRecord(nonStihlRecord, mockValidHtmlA);
  if (nonStihlErrors.length === 0) {
    throw new Error('Negative test failed: Non-STIHL URL did not trigger validation error');
  }

  // Negative Test 7: Mismatched / fake source locator not present in body -> FAIL
  const badLocatorRecord = { ...baseRecord, source_locator: 'Service Kit 999' };
  const badLocatorErrors = validateOfficialRecord(badLocatorRecord, mockValidHtmlA);
  if (badLocatorErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched source locator did not trigger validation error');
  }

  // Negative Test 8: Mismatched / fake variant condition not present in body -> FAIL
  const badConditionRecord = { ...baseRecord, variant_condition: '4-MIX 4-stroke engine generation' };
  const badConditionErrors = validateOfficialRecord(badConditionRecord, mockValidHtmlA);
  if (badConditionErrors.length === 0) {
    throw new Error('Negative test failed: Mismatched variant condition did not trigger validation error');
  }

  console.log('  ✓ Negative tests passed: Harmless drift accepted, STRICT_SNAPSHOT enforced, fake parts/models/locators/conditions/URLs rejected.\n');
}

export async function validateOfficialEvidenceFile(evidencePath, options = {}) {
  const hashPolicy = options.hashPolicy || HASH_POLICIES.CLAIM_REVALIDATION;
  console.log('===============================================================');
  console.log(`🛡️ OFFICIAL STIHL PARTS EVIDENCE VALIDATION AUDIT (Policy: ${hashPolicy})`);
  console.log('===============================================================\n');

  runNegativeValidationTests();

  if (!fs.existsSync(evidencePath)) {
    console.error(`❌ ERROR: Evidence file not found at ${evidencePath}`);
    process.exit(1);
  }

  const client = options.httpClient || new HttpClient({ mode: options.mode || 'LIVE', useCache: options.useCache !== undefined ? options.useCache : true });
  const records = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  console.log(`Total Evidence Records: ${records.length}`);

  let verifiedCount = 0;
  let demotedCount = 0;
  let sourceChangedCount = 0;
  let allErrors = [];
  const detailedResults = [];

  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    const idx = `#${i + 1} (${item.part_number_display || item.part_number})`;

    let responseBody = null;
    let httpStatus = null;
    if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
      const res = await client.get(item.source_url, { purpose: `validate_official_evidence_${item.part_number}` });
      httpStatus = res.status;
      if (res.status === 200 && res.body) {
        responseBody = res.body;
      } else {
        allErrors.push(`${idx}: Failed to fetch official source body for ${item.source_url} (HTTP ${res.status})`);
      }
    }

    const recordErrors = validateOfficialRecord(item, responseBody, { hashPolicy });
    if (recordErrors.length > 0) {
      recordErrors.forEach(e => allErrors.push(`${idx}: ${e}`));
    }

    const recDetail = {
      part_number: item.part_number,
      part_number_display: item.part_number_display || item.part_number,
      part_name: item.part_name,
      http_status: httpStatus,
      stored_sha: recordErrors.storedSha,
      current_sha: recordErrors.actualSha,
      hash_match: recordErrors.hashMatch,
      hash_status: recordErrors.hashStatus,
      claim_valid: recordErrors.claimContentValid,
      errors: [...recordErrors]
    };
    detailedResults.push(recDetail);

    if (item.verification_status === 'OFFICIAL_SOURCE_VERIFIED') {
      verifiedCount++;
      if (recordErrors.hashStatus === HASH_STATUS.SOURCE_BODY_CHANGED_CLAIM_STILL_VALID) {
        sourceChangedCount++;
        console.log(`  ⚠ [VERIFIED_SOURCE_CHANGED] ${item.part_number_display.padEnd(16)} | ${item.part_name.slice(0, 38).padEnd(38)} | [${item.models.join(', ')}] (SHA Drift: Stored ${item.response_sha256.slice(0, 8)}... vs Live ${recordErrors.actualSha?.slice(0, 8)}...)`);
      } else {
        console.log(`  ✓ [VERIFIED] ${item.part_number_display.padEnd(16)} | ${item.part_name.slice(0, 45).padEnd(45)} | [${item.models.join(', ')}]`);
      }
    } else {
      demotedCount++;
      console.log(`  ⚠ [${item.verification_status}] ${(item.part_number_display || item.part_number).padEnd(16)} | ${item.part_name}`);
    }
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Verified Official Claims: ${verifiedCount}`);
  console.log(`  - Unchanged Source:     ${verifiedCount - sourceChangedCount}`);
  console.log(`  - Changed Source Body:  ${sourceChangedCount} (Claims 100% Valid)`);
  console.log(`Demoted / Curated Claims: ${demotedCount}`);
  console.log(`Validation Errors:        ${allErrors.length}`);
  console.log('---------------------------------------------------------------');

  if (allErrors.length > 0) {
    console.error('\n❌ VALIDATION FAILED:');
    allErrors.forEach(e => console.error(`  • ${e}`));
    throw new Error(`Official evidence validation failed with ${allErrors.length} errors`);
  } else {
    console.log('\n🎉 ALL OFFICIAL STIHL EVIDENCE RECORDS STRICTLY COMPLIANT!');
    return { verifiedCount, demotedCount, sourceChangedCount, total: records.length, results: detailedResults };
  }
}

if (process.argv[1] && process.argv[1].endsWith('validate_official_parts_evidence.mjs')) {
  const targetPath = path.join(rootDir, 'data', 'verified_official_parts_evidence.json');
  validateOfficialEvidenceFile(targetPath).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
