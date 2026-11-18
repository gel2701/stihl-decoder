/**
 * STIHL Spelling & Format Normalization Engine for STIHLDecoder.nl
 * Phase 33B / Phase 91 Model Data Integrity & Variant Normalization
 *
 * ABSOLUTE RULE: Spelling normalization only (BR600 -> BR 600).
 * Does NOT rewrite historical model designations (026 is NOT rewritten to MS 260,
 * and 025 C is NOT rewritten to MS 250 C).
 */

export const VARIANT_SUFFIXES = [
  'C-BEQ', 'C-BE', 'C-BQ', 'C-BM', 'C-EM', 'C-EQ', 'TC-M', 'C-M', 'C-B', 'C-E', 'C-Q', 'C',
  'AVEQ', 'AVE', 'AVQ', 'AV', 'VW', 'IEM', 'I', 'QS', 'RZ', 'RX', 'T', 'R', 'L', 'S', 'W', 'Z', 'D', 'K', 'E', 'Q',
  'MAGNUM', 'SUPER', 'PRO', 'FARM BOSS', 'WOOD BOSS', 'ARCTIC'
];

function normalizeSuffixTokens(rawSuffix = '') {
  if (!rawSuffix) return '';
  let suf = String(rawSuffix).trim().toUpperCase().replace(/_/g, '-').replace(/\s+/g, ' ');
  suf = suf
    .replace(/\bC[\s-]*B[\s-]*E[\s-]*Q\b/g, 'C-BEQ')
    .replace(/\bC[\s-]*B[\s-]*E\b/g, 'C-BE')
    .replace(/\bC[\s-]*B[\s-]*Q\b/g, 'C-BQ')
    .replace(/\bC[\s-]*B[\s-]*M\b/g, 'C-BM')
    .replace(/\bC[\s-]*E[\s-]*M\b/g, 'C-EM')
    .replace(/\bC[\s-]*E[\s-]*Q\b/g, 'C-EQ')
    .replace(/\bT[\s-]*C[\s-]*M\b/g, 'TC-M')
    .replace(/\bC[\s-]*M\b/g, 'C-M')
    .replace(/\bC[\s-]*B\b/g, 'C-B')
    .replace(/\bC[\s-]*E\b/g, 'C-E')
    .replace(/\bC[\s-]*Q\b/g, 'C-Q')
    .replace(/\bV[\s-]*W\b/g, 'VW')
    .replace(/^CBEQ$/, 'C-BEQ')
    .replace(/^CBE$/, 'C-BE')
    .replace(/^CBQ$/, 'C-BQ')
    .replace(/^CBM$/, 'C-BM')
    .replace(/^CEM$/, 'C-EM')
    .replace(/^CEQ$/, 'C-EQ')
    .replace(/^TCM$/, 'TC-M')
    .replace(/^CM$/, 'C-M')
    .replace(/^CB$/, 'C-B')
    .replace(/^CE$/, 'C-E')
    .replace(/^CQ$/, 'C-Q');
  return suf.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes input model spelling and formatting into canonical STIHL format
 */
export function normalizeModelQuery(inputStr = '') {
  if (!inputStr || typeof inputStr !== 'string') return { baseModel: '', variant: '', canonicalQuery: '' };

  let raw = inputStr.trim().replace(/^STIHL[\s_\-]+/i, '').replace(/\s+/g, ' ').trim().toUpperCase();

  // Typo recovery: letter 'O' instead of digit '0' in model numbers (e.g. MS 26O -> MS 260, FS45O -> FS 450)
  raw = raw.replace(/^([A-Z]{1,4}[\s_\-]?\d+)[O](?=[\s_\-]|$)/i, '$10');

  // Legacy numeric designations (e.g., 023, 025, 025C, 025 C, 026, 036, 012 AVEQ, 020 T)
  const legacyMatch = raw.match(/^(0\d{2})(?:[\s_\-]*([A-Z][A-Z0-9\s\-]{0,18}))?$/i);
  if (legacyMatch) {
    const num = legacyMatch[1];
    const variant = normalizeSuffixTokens(legacyMatch[2] || '');
    const canonicalQuery = variant ? `${num} ${variant}` : num;
    return {
      prefix: '0',
      number: num,
      variant,
      baseModel: num,
      canonicalQuery,
      isLegacyNumeric: true
    };
  }

  // Modern prefix + number + optional injection 'i' + optional variant
  const match = raw.match(/^([A-Z]{1,4})[\s_\-]?(\d{2,4})(I)?(?:[\s_\-]+|(?=[A-Z]|$))([A-Z][A-Z0-9\s\-]{0,20})?$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const digits = match[2];
    const isInjectionModel = Boolean(match[3]) && (
      (prefix === 'TS' && ['500', '710', '910'].includes(digits)) ||
      (prefix === 'MS' && ['400', '500'].includes(digits))
    );
    const number = isInjectionModel ? `${digits}i` : digits;
    let rest = match[4] || '';
    if (match[3] && !isInjectionModel) {
      rest = `I${rest}`;
    }
    const variant = normalizeSuffixTokens(rest);
    const baseModel = `${prefix} ${number}`;
    const canonicalQuery = variant ? `${baseModel} ${variant}` : baseModel;

    return {
      prefix,
      number: digits,
      variant,
      baseModel,
      canonicalQuery,
      isLegacyNumeric: false
    };
  }

  // Fallback for non-standard queries
  return {
    prefix: raw.replace(/[^A-Z]/g, ''),
    number: raw.replace(/[^0-9]/g, ''),
    variant: '',
    baseModel: raw,
    canonicalQuery: raw,
    isLegacyNumeric: false
  };
}

/**
 * Searches models in database using normalized spelling matching, aliases & documented variants
 */
export function findModelInDatabase(inputQuery, models = [], aliases = null) {
  if (!models || !Array.isArray(models) || models.length === 0) return null;

  const normalized = normalizeModelQuery(inputQuery);
  const cleanCanonical = normalized.canonicalQuery.replace(/[^A-Z0-9]/g, '');
  const cleanBase = normalized.baseModel.replace(/[^A-Z0-9]/g, '');

  // 1. Exact canonical match (e.g. MS 261 C-M or 026 or 023)
  let found = models.find(m => {
    const mClean = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mSlugClean = (m.slug || m.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return mClean === cleanCanonical || mSlugClean === cleanCanonical;
  });
  if (found) return found;

  // 2. Database alias lookup or per-model aliases / documented variants
  if (aliases && typeof aliases === 'object') {
    const aliasTarget = aliases[normalized.canonicalQuery] || aliases[cleanCanonical] || aliases[normalized.baseModel];
    if (aliasTarget) {
      const targetClean = String(aliasTarget).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      found = models.find(m => m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase() === targetClean);
      if (found) return found;
    }
  }

  found = models.find(m => {
    const vList = Array.isArray(m.variants) ? m.variants : [];
    const aList = Array.isArray(m.aliases) ? m.aliases : [];
    return [...vList, ...aList].some(v => String(v).replace(/[^A-Z0-9]/gi, '').toUpperCase() === cleanCanonical);
  });
  if (found) return found;

  // 3. Exact base model match (e.g. BR 600, MS 250, 025)
  found = models.find(m => {
    const mClean = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mSlugClean = (m.slug || m.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return mClean === cleanBase || mSlugClean === cleanBase;
  });

  return found || null;
}
