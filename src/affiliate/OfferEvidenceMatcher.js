/**
 * src/affiliate/OfferEvidenceMatcher.js
 *
 * Phase 80 — One canonical product-identity decision for marketplace offers
 * (eBay Browse today; usable by any provider that passes structured evidence).
 *
 * Match taxonomy:
 *  - EXACT_MPN                              listing MPN equals the target part number.
 *  - EXACT_PART_NUMBER_WITH_CORROBORATION   part number appears in the title AND a
 *                                           structured, independent corroboration exists
 *                                           (an item aspect MPN, or an item model-compatibility
 *                                           aspect that intersects the STIHL catalog model
 *                                           relations for that part).
 *  - VERIFIED_REPLACEMENT                   the listing sells a replacement that is already
 *                                           registered as verified for the target part.
 *  - TITLE_ONLY_NEEDS_EVIDENCE              part number appears in the title but no
 *                                           corroboration exists yet.
 *  - CONTRADICTORY_MATCH                    no reference to the target part, or a conflicting
 *                                           part number is present.
 *
 * Fuzzy scoring is available for CANDIDATE DISCOVERY and EVIDENCE-GAP RANKING only.
 * It is never used to approve a product identity: `status` never becomes ACTIVE on
 * a fuzzy signal.
 */

export const MATCH_TYPES = Object.freeze({
  EXACT_MPN: 'EXACT_MPN',
  EXACT_PART_NUMBER_WITH_CORROBORATION: 'EXACT_PART_NUMBER_WITH_CORROBORATION',
  VERIFIED_REPLACEMENT: 'VERIFIED_REPLACEMENT',
  TITLE_ONLY_NEEDS_EVIDENCE: 'TITLE_ONLY_NEEDS_EVIDENCE',
  CONTRADICTORY_MATCH: 'CONTRADICTORY_MATCH'
});

export const OFFER_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  NEEDS_EVIDENCE: 'NEEDS_EVIDENCE',
  REJECTED: 'REJECTED'
});

export const MATCH_BASIS = Object.freeze({
  EXACT_MPN: 'MPN_EXACT',
  EXACT_PART_NUMBER_WITH_CORROBORATION: 'PART_NUMBER_CORROBORATED',
  VERIFIED_REPLACEMENT: 'VERIFIED_REPLACEMENT',
  TITLE_ONLY_NEEDS_EVIDENCE: 'TITLE_ONLY'
});

const ACTIVE_MATCH_TYPES = new Set([
  MATCH_TYPES.EXACT_MPN,
  MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION,
  MATCH_TYPES.VERIFIED_REPLACEMENT
]);

const BUNDLE_TITLE_PATTERN = /\bkit\b|\bset\b|\bbundle\b|\bpack\b|\bcombi\b|\btune-up\b/i;
const MPN_ASPECT_PATTERN = /^(?:mpn|manufacturer\s*part\s*number|hersteller-?nummer|herstellernummer|artikelnummer|referenznummer|part\s*number|teilenummer|onderdeelnummer)$/i;
const MODEL_ASPECT_PATTERN = /(modell|model|kompatib|compatib|passt\s*f(?:ü|ue)r|geschikt\s*voor|fahrzeugmodell|applicable)/i;

/**
 * Extracts every STIHL-style 11-digit part number (spaced, hyphenated or compact).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractPartNumbers(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = new Set();
  const formatted = /(?<!\d)(\d{4})[\s-]*(\d{3})[\s-]*(\d{4})(?!\d)/g;
  let m;
  while ((m = formatted.exec(text))) found.add(`${m[1]}${m[2]}${m[3]}`);
  const compact = /(?<!\d)(\d{11})(?!\d)/g;
  while ((m = compact.exec(text))) found.add(m[1]);
  return [...found];
}

/**
 * @param {string} text
 * @param {string} partNumber canonical 11-digit part number
 * @returns {boolean}
 */
export function containsPartNumber(text, partNumber) {
  const target = String(partNumber || '').replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(target)) return false;
  return extractPartNumbers(String(text || '')).includes(target);
}

/**
 * Bundle/kit detection shared by the Browse client and the validation engine so
 * both layers apply exactly the same rule.
 *
 * @param {string} title
 * @returns {boolean}
 */
export function isBundleTitle(title) {
  return BUNDLE_TITLE_PATTERN.test(String(title || '').toLowerCase());
}

/**
 * Normalizes a Browse aspect list ({ name, value } or localizedAspects) to pairs.
 *
 * @param {Array} aspects
 * @returns {Array<{ name: string, value: string }>}
 */
export function normalizeAspects(aspects) {
  if (!Array.isArray(aspects)) return [];
  const out = [];
  for (const aspect of aspects) {
    if (!aspect || typeof aspect !== 'object') continue;
    const name = typeof aspect.name === 'string' ? aspect.name : (typeof aspect.localizedName === 'string' ? aspect.localizedName : '');
    const value = typeof aspect.value === 'string' ? aspect.value : '';
    if (name && value) out.push({ name: name.trim(), value: value.trim() });
    const values = Array.isArray(aspect.values) ? aspect.values : null;
    if (name && values) {
      for (const v of values) {
        if (typeof v === 'string' && v.trim()) out.push({ name: name.trim(), value: v.trim() });
      }
    }
  }
  return out;
}

/**
 * Normalizes a STIHL model identifier for comparison ("MS 260 C-BE" -> "ms260cbe").
 *
 * @param {string} model
 * @returns {string}
 */
export function normalizeModelToken(model) {
  return String(model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts model tokens from free text using STIHL-style model families.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractModelTokens(text) {
  if (typeof text !== 'string') return [];
  const tokens = new Set();
  const pattern = /\b(?:MS|FS|BR|BG|SH|TS|HT|BT|HL|KM|FC|HS|RE|RM|RMA|MB|SP|SE|SR|IMOW|RMI|FSA|BGA|HLA|KMA|RMA)\s*-?\s*\d{2,4}(?:\s*[A-Z]{1,3}(?:-[A-Z]{1,3})?)?/gi;
  let m;
  while ((m = pattern.exec(text))) tokens.add(normalizeModelToken(m[0]));
  for (const bare of (text.match(/\b\d{3}\b/g) || [])) tokens.add(normalizeModelToken(bare));
  return [...tokens];
}

/**
 * Corroborates a title-only part number with structured listing evidence.
 * Every returned item links the exact part number to a second, inspectable source.
 *
 * @param {Object} params
 * @param {string} params.targetPart
 * @param {Array} [params.aspects]
 * @param {string[]} [params.catalogModels] STIHL catalog models known to use the part
 * @returns {Array<{ source: string, detail: string, matched: string[] }>}
 */
export function corroborateProductIdentity(params = {}) {
  const targetPart = String(params.targetPart || '').replace(/[\s-]/g, '');
  const aspects = normalizeAspects(params.aspects);
  const catalogModels = new Set((Array.isArray(params.catalogModels) ? params.catalogModels : [])
    .map(normalizeModelToken)
    .filter(Boolean));
  const corroboration = [];

  for (const aspect of aspects) {
    if (!MPN_ASPECT_PATTERN.test(aspect.name)) continue;
    if (extractPartNumbers(aspect.value).includes(targetPart)) {
      corroboration.push({
        source: 'EBAY_ITEM_ASPECT_MPN',
        detail: `${aspect.name}=${aspect.value}`,
        matched: [targetPart]
      });
    }
  }

  if (catalogModels.size > 0) {
    for (const aspect of aspects) {
      if (!MODEL_ASPECT_PATTERN.test(aspect.name)) continue;
      const candidates = extractModelTokens(aspect.value);
      const matched = candidates.filter(token => catalogModels.has(token));
      if (matched.length > 0) {
        corroboration.push({
          source: 'EBAY_ITEM_ASPECT_MODEL',
          detail: `${aspect.name}=${aspect.value}`,
          matched: matched.slice(0, 10)
        });
      }
    }
  }

  return corroboration;
}

/**
 * Canonical product-identity decision.
 *
 * @param {Object} params
 * @param {string} params.targetPart canonical 11-digit STIHL part number
 * @param {string} [params.title]
 * @param {string} [params.mpn] listing MPN
 * @param {string} [params.gtin]
 * @param {Array} [params.aspects]
 * @param {string} [params.brand]
 * @param {string} [params.manufacturer]
 * @param {string[]} [params.catalogModels]
 * @param {Array<{part_number:string,replacement_part_number:string,verified:boolean}>} [params.verifiedReplacements]
 * @returns {{ match_type: string, status: string, decision: 'ACCEPT'|'REVIEW'|'REJECT', match_basis: string, reason_codes: string[], corroboration: Array<Object>, evidence_gaps: string[], contradictory_part_numbers: string[] }}
 */
export function classifyOffer(params = {}) {
  const targetPart = String(params.targetPart || '').replace(/[\s-]/g, '');
  const title = String(params.title || '');
  const mpn = String(params.mpn || '');
  const reason_codes = [];
  const evidence_gaps = [];
  const add = code => { if (!reason_codes.includes(code)) reason_codes.push(code); };

  const result = (match_type, corroboration = [], contradictory = []) => {
    const status = ACTIVE_MATCH_TYPES.has(match_type)
      ? OFFER_STATUSES.ACTIVE
      : (match_type === MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE ? OFFER_STATUSES.NEEDS_EVIDENCE : OFFER_STATUSES.REJECTED);
    return {
      match_type,
      status,
      decision: status === OFFER_STATUSES.ACTIVE ? 'ACCEPT' : (status === OFFER_STATUSES.NEEDS_EVIDENCE ? 'REVIEW' : 'REJECT'),
      match_basis: MATCH_BASIS[match_type] || 'UNKNOWN',
      reason_codes,
      corroboration,
      evidence_gaps,
      contradictory_part_numbers: contradictory
    };
  };

  if (!/^\d{11}$/.test(targetPart)) {
    add('MISSING_REQUIRED_DATA');
    evidence_gaps.push('CANONICAL_PART_NUMBER');
    return result(MATCH_TYPES.CONTRADICTORY_MATCH);
  }

  // Verified replacements registered for this target part are not conflicts.
  const replacements = Array.isArray(params.verifiedReplacements) ? params.verifiedReplacements : [];
  const allowedReplacementNumbers = new Set();
  for (const replacement of replacements) {
    if (!replacement || replacement.verified !== true) continue;
    if (String(replacement.part_number || '').replace(/[\s-]/g, '') !== targetPart) continue;
    const replacementPart = String(replacement.replacement_part_number || '').replace(/[\s-]/g, '');
    if (/^\d{11}$/.test(replacementPart)) allowedReplacementNumbers.add(replacementPart);
  }
  const isAllowedReference = number => number === targetPart || allowedReplacementNumbers.has(number);

  // Conflicting part numbers always fail closed, even with an exact MPN.
  const mpnNumbers = extractPartNumbers(mpn);
  const titleNumbers = extractPartNumbers(title);
  const contradictory = [...new Set([...mpnNumbers, ...titleNumbers])].filter(n => !isAllowedReference(n));
  if (mpnNumbers.some(n => !isAllowedReference(n))) add('CONFLICTING_MPN');
  if (titleNumbers.some(n => !isAllowedReference(n))) add('CONFLICTING_TITLE_PART_NUMBER');
  if (contradictory.length > 0) {
    add('CONTRADICTORY_MATCH');
    return result(MATCH_TYPES.CONTRADICTORY_MATCH, [], contradictory);
  }

  // 1. Exact MPN — the strongest identity proof a marketplace can return.
  if (mpnNumbers.includes(targetPart)) {
    return result(MATCH_TYPES.EXACT_MPN, [{ source: 'LISTING_MPN', detail: mpn, matched: [targetPart] }]);
  }

  // 2. Verified replacement registered for this target part.
  for (const replacementPart of allowedReplacementNumbers) {
    if (mpnNumbers.includes(replacementPart) || containsPartNumber(title, replacementPart)) {
      return result(MATCH_TYPES.VERIFIED_REPLACEMENT, [{
        source: 'VERIFIED_REPLACEMENT_REGISTRY',
        detail: `verified replacement ${replacementPart} for ${targetPart}`,
        matched: [replacementPart]
      }]);
    }
  }

  if (!containsPartNumber(title, targetPart)) {
    add('PART_NUMBER_MISMATCH');
    return result(MATCH_TYPES.CONTRADICTORY_MATCH);
  }

  // 3. Title carries the exact part number: look for structured corroboration.
  const corroboration = corroborateProductIdentity({
    targetPart,
    aspects: params.aspects,
    catalogModels: params.catalogModels
  });
  if (corroboration.length > 0) {
    return result(MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION, corroboration);
  }

  evidence_gaps.push('LISTING_MPN', 'MODEL_COMPATIBILITY_CORROBORATION');
  return result(MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE);
}

/**
 * Token-overlap similarity (Fuse.js-style fuzzy pattern) used ONLY to rank
 * candidates and missing evidence. Never used as an approval signal.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1
 */
export function fuzzySimilarity(a, b) {
  const tokenize = value => new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/)
      .filter(token => token.length > 2)
  );
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(left.size, right.size);
}

/**
 * Returns what evidence is missing for a candidate, given its current decision.
 *
 * @param {{ match_type?: string, shipping_status?: string }} state
 * @returns {string[]}
 */
export function missingEvidenceFor(state = {}) {
  const gaps = [];
  if (state.match_type === MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE) {
    gaps.push('LISTING_MPN', 'MODEL_COMPATIBILITY_CORROBORATION');
  } else if (!state.match_type) {
    gaps.push('PRODUCT_MATCH_DECISION');
  }
  if (state.shipping_status !== 'SHIPS_TO_NL_CONFIRMED') {
    gaps.push('SHIPPING_TO_NL');
  }
  return gaps;
}
