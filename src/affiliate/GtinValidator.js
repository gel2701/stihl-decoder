/**
 * src/affiliate/GtinValidator.js
 *
 * Phase 60Q: GS1 Standard Check-Digit & GTIN Validation Engine
 *
 * Implements strict GS1 modulo-10 check-digit validation across supported GTIN formats:
 * - GTIN-8 (EAN-8)
 * - GTIN-12 (UPC-A)
 * - GTIN-13 (EAN-13)
 * - GTIN-14 (ITF-14 / Wholesale Shipping Container)
 *
 * Distinguishes three tiers of validation:
 * 1. Mathematical validity: correct length, all digits, valid GS1 mod-10 check digit.
 * 2. Prefix ownership: valid GS1 country / organization prefix (not reserved/in-store coupon).
 * 3. Product match: external evidence associating GTIN with specific physical product / MPN.
 */

export const SUPPORTED_GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * Calculates the standard GS1 Modulo-10 check digit for a string of numeric digits.
 *
 * @param {string} digitsWithoutCheckDigit - String of numeric digits excluding check digit
 * @returns {number} Check digit (0-9)
 */
export function calculateGs1CheckDigit(digitsWithoutCheckDigit) {
  if (typeof digitsWithoutCheckDigit !== 'string' || !/^\d+$/.test(digitsWithoutCheckDigit)) {
    throw new TypeError('digitsWithoutCheckDigit must be a non-empty string of numeric digits');
  }

  let sum = 0;
  let multiplier = 3;

  // Process right-to-left
  for (let i = digitsWithoutCheckDigit.length - 1; i >= 0; i--) {
    const digit = parseInt(digitsWithoutCheckDigit.charAt(i), 10);
    sum += digit * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates a GTIN string against standard GS1 specifications.
 *
 * @param {string|number} rawGtin - Candidate GTIN / EAN / UPC
 * @returns {{
 *   valid: boolean,
 *   type: string|null,
 *   normalized: string|null,
 *   expectedCheckDigit?: number,
 *   actualCheckDigit?: number,
 *   error?: string
 * }}
 */
export function validateGtin(rawGtin) {
  if (rawGtin === null || rawGtin === undefined) {
    return { valid: false, type: null, normalized: null, error: 'GTIN is null or undefined' };
  }

  const str = String(rawGtin).trim();
  if (!str) {
    return { valid: false, type: null, normalized: null, error: 'GTIN is empty' };
  }

  // Strip common packaging formatting (dashes or spaces) if present
  const digitsOnly = str.replace(/[-\s]/g, '');

  if (!/^\d+$/.test(digitsOnly)) {
    return { valid: false, type: null, normalized: null, error: `GTIN contains non-numeric characters: "${str}"` };
  }

  const len = digitsOnly.length;
  if (!SUPPORTED_GTIN_LENGTHS.has(len)) {
    return {
      valid: false,
      type: null,
      normalized: digitsOnly,
      error: `Unsupported GTIN length: ${len} digits. Supported lengths: ${Array.from(SUPPORTED_GTIN_LENGTHS).join(', ')}`
    };
  }

  const payload = digitsOnly.slice(0, -1);
  const actualCheckDigit = parseInt(digitsOnly.slice(-1), 10);
  const expectedCheckDigit = calculateGs1CheckDigit(payload);

  if (actualCheckDigit !== expectedCheckDigit) {
    return {
      valid: false,
      type: `GTIN-${len}`,
      normalized: digitsOnly,
      expectedCheckDigit,
      actualCheckDigit,
      error: `Invalid GS1 check digit: expected ${expectedCheckDigit}, found ${actualCheckDigit}`
    };
  }

  // Identify GTIN Type
  let type = `GTIN-${len}`;
  if (len === 8) type = 'GTIN-8 (EAN-8)';
  else if (len === 12) type = 'GTIN-12 (UPC-A)';
  else if (len === 13) type = 'GTIN-13 (EAN-13)';
  else if (len === 14) type = 'GTIN-14';

  return {
    valid: true,
    type,
    normalized: digitsOnly,
    expectedCheckDigit,
    actualCheckDigit
  };
}

/**
 * Checks whether a GTIN belongs to restricted internal or variable-measure prefix ranges
 * (e.g. 020-029, 040-049, 200-299) which cannot be globally unique commercial identifiers.
 *
 * @param {string} gtin - Validated GTIN string
 * @returns {boolean} True if restricted internal distribution
 */
export function isRestrictedDistributionPrefix(gtin) {
  if (!gtin || typeof gtin !== 'string') return false;
  const clean = gtin.replace(/[-\s]/g, '');
  // Normalize to 13-digit for prefix analysis
  const padded = clean.padStart(13, '0').slice(-13);
  const prefix2 = padded.slice(0, 2);
  const prefix3 = padded.slice(0, 3);

  // GS1 restricted distribution prefix blocks:
  // 020-029: Restricted distribution (MO defined)
  // 040-049: Restricted distribution (internal company use)
  // 200-299: Restricted distribution (internal to retailer/country)
  if (prefix2 === '02' || prefix2 === '04' || (prefix3 >= '200' && prefix3 <= '299')) {
    return true;
  }
  return false;
}
