/**
 * scripts/lib/verify_family_evidence_provenance.mjs
 *
 * Phase 56O.2: Node-Only Authoritative Cryptographic Provenance Verifier
 *
 * Provides strict, fail-closed verification of active STIHL family rules
 * against canonical ledger records and cryptographic hash commitments.
 *
 * This module is strictly Node-only to keep the browser-facing registry
 * (src/ModelFamilyDriveRegistry.js) pure, portable, and free of Node built-ins.
 */

import crypto from 'node:crypto';

/**
 * Synchronous SHA-256 helper.
 *
 * @param {string|Buffer} input
 * @param {object|null} customCrypto
 * @returns {string|null}
 */
export function computeSha256Sync(input, customCrypto = null) {
  if (input === null || input === undefined) return null;
  if (customCrypto?.createHash) {
    try {
      return customCrypto.createHash('sha256').update(input).digest('hex');
    } catch {
      return null;
    }
  }
  try {
    return crypto.createHash('sha256').update(input).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Phase 56O.2: Strict Fail-Closed Active Family Rule Provenance Verifier.
 *
 * Verifies that an ACTIVE family rule matches its corresponding canonical
 * ledger record exactly across all required provenance attributes and satisfies
 * strict cryptographic hash commitments.
 *
 * Hard fail-closed contract:
 * - source_excerpt present
 * - source_excerpt_hash present
 * - hash engine available
 * - computed hash present
 * - computed hash === source_excerpt_hash
 *
 * Error codes produced on failures:
 * - MISSING_SOURCE_EXCERPT
 * - MISSING_SOURCE_EXCERPT_HASH
 * - HASH_COMPUTATION_UNAVAILABLE
 * - SOURCE_EXCERPT_HASH_MISMATCH
 *
 * @param {object} rule - Active family rule definition
 * @param {Array<object>} ledger - Full official evidence ledger array
 * @param {object} options - Optional configuration / injectable crypto
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyActiveFamilyRuleProvenance(rule, ledger, options = {}) {
  const errors = [];
  if (!rule) {
    errors.push('Rule is null or undefined');
    return { valid: false, errors };
  }
  if (!Array.isArray(ledger)) {
    errors.push('Ledger must be an array of records');
    return { valid: false, errors };
  }

  // 1. Source excerpt & excerpt hash integrity (Fail-Closed contract)
  const excerpt = rule.extracted_evidence?.source_excerpt ?? rule.source_excerpt;
  const excerptHash = rule.extracted_evidence?.source_excerpt_hash ?? rule.source_excerpt_hash;

  if (!excerpt || typeof excerpt !== 'string' || excerpt.trim().length === 0) {
    errors.push('MISSING_SOURCE_EXCERPT');
  }

  if (!excerptHash || typeof excerptHash !== 'string' || excerptHash.trim().length === 0) {
    errors.push('MISSING_SOURCE_EXCERPT_HASH');
  }

  if (excerpt && typeof excerpt === 'string' && excerpt.trim().length > 0) {
    let computedHash = null;
    if (options.hasherUnavailable === true || options.crypto === false) {
      errors.push('HASH_COMPUTATION_UNAVAILABLE');
    } else if (typeof options.computeHash === 'function') {
      try {
        computedHash = options.computeHash(excerpt);
        if (!computedHash) {
          errors.push('HASH_COMPUTATION_UNAVAILABLE');
        }
      } catch {
        errors.push('HASH_COMPUTATION_UNAVAILABLE');
      }
    } else {
      computedHash = computeSha256Sync(excerpt, options.crypto);
      if (!computedHash) {
        errors.push('HASH_COMPUTATION_UNAVAILABLE');
      }
    }

    if (computedHash && excerptHash) {
      if (computedHash !== excerptHash) {
        errors.push('SOURCE_EXCERPT_HASH_MISMATCH');
      }

      // Invariant: body_sha256 may equal source_excerpt_hash ONLY when the complete source body is literally identical to the excerpt
      if (rule.body_sha256 === excerptHash) {
        const excerptBytes = Buffer.byteLength(excerpt, 'utf8');
        if (rule.body_bytes && rule.body_bytes !== excerptBytes) {
          errors.push(`body_sha256 cannot equal source_excerpt_hash when body_bytes (${rule.body_bytes}) != excerptBytes (${excerptBytes})`);
        }
      }
    }
  }

  // 2. Ledger record exists for family
  const ledgerRecord = ledger.find(l => l.family === rule.family && l.fetch_id === rule.fetch_id);
  if (!ledgerRecord) {
    errors.push(`Ledger record missing for family "${rule.family}" with fetch_id "${rule.fetch_id}"`);
    return { valid: false, errors };
  }

  // 3. Exact field matches between rule and canonical ledger record
  if (rule.fetch_id !== ledgerRecord.fetch_id) {
    errors.push(`fetch_id mismatch: rule has "${rule.fetch_id}", ledger has "${ledgerRecord.fetch_id}"`);
  }
  if (rule.family !== ledgerRecord.family) {
    errors.push(`family mismatch: rule has "${rule.family}", ledger has "${ledgerRecord.family}"`);
  }
  if (rule.drive_type !== ledgerRecord.drive_type) {
    errors.push(`drive_type mismatch: rule has "${rule.drive_type}", ledger has "${ledgerRecord.drive_type}"`);
  }
  if (rule.requested_url !== ledgerRecord.requested_url) {
    errors.push(`requested_url mismatch: rule has "${rule.requested_url}", ledger has "${ledgerRecord.requested_url}"`);
  }
  if (rule.body_sha256 !== ledgerRecord.body_sha256) {
    errors.push(`body_sha256 mismatch: rule has "${rule.body_sha256}", ledger has "${ledgerRecord.body_sha256}"`);
  }
  if (rule.retrieved_at !== ledgerRecord.retrieved_at) {
    errors.push(`retrieved_at mismatch: rule has "${rule.retrieved_at}", ledger has "${ledgerRecord.retrieved_at}"`);
  }

  // 4. Verification and context status checks
  if (ledgerRecord.verification_status !== 'VERIFIED') {
    errors.push(`verification_status mismatch: ledger is "${ledgerRecord.verification_status}", expected "VERIFIED"`);
  }
  if (ledgerRecord.context_bound !== true) {
    errors.push(`context_bound mismatch: ledger record context_bound is ${ledgerRecord.context_bound}, expected true`);
  }
  if (ledgerRecord.family_match !== true) {
    errors.push(`family_match mismatch: ledger record family_match is ${ledgerRecord.family_match}, expected true`);
  }
  if (ledgerRecord.drive_match !== true) {
    errors.push(`drive_match mismatch: ledger record drive_match is ${ledgerRecord.drive_match}, expected true`);
  }

  // 5. Ledger excerpt hash parity
  const ledgerExcerptHash = ledgerRecord.extracted_evidence?.source_excerpt_hash ?? ledgerRecord.source_excerpt_hash;
  if (excerptHash && ledgerExcerptHash && excerptHash !== ledgerExcerptHash) {
    errors.push(`excerpt_hash parity mismatch between rule ("${excerptHash}") and ledger ("${ledgerExcerptHash}")`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
