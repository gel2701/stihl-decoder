/**
 * STIHL Model, Alias & Variant Normalization Engine for STIHLDecoder.nl
 * Phase 33 Model Data Integrity Audit
 */

export const MODEL_ALIASES = {
  '026': 'MS 260',
  '036': 'MS 360',
  '046': 'MS 460',
  '020T': 'MS 200 T',
  '020 T': 'MS 200 T',
  '044': 'MS 440',
  '066': 'MS 660'
};

export const VARIANT_SUFFIXES = ['C-M', 'C-EM', 'TC-M', 'C-E', 'T', 'R', 'RX', 'MAGNUM'];

/**
 * Normalizes input model strings into canonical STIHL format
 * Examples:
 *   "BR600" -> "BR 600"
 *   "br-600" -> "BR 600"
 *   "ms261cm" -> "MS 261 C-M"
 *   "fs460cem" -> "FS 460 C-EM"
 *   "ms201tcm" -> "MS 201 TC-M"
 *   "026" -> "MS 260"
 */
export function normalizeModelQuery(inputStr = '') {
  if (!inputStr || typeof inputStr !== 'string') return { baseModel: '', variant: '', canonicalQuery: '' };

  let raw = inputStr.trim().toUpperCase();

  // Alias lookup
  if (MODEL_ALIASES[raw]) {
    raw = MODEL_ALIASES[raw];
  }

  // Separate prefix, number, and variant suffix
  // e.g. "BR600" -> "BR 600", "MS261CM" -> "MS 261 C-M", "FS460CEM" -> "FS 460 C-EM"
  const match = raw.match(/^([A-Z]{1,3})[-_\s]?(\d{2,4})[-_\s]?(C-?M|C-?EM|TC-?M|C-?E|T|R|RX|MAGNUM)?$/i);

  if (match) {
    const prefix = match[1].toUpperCase();
    const number = match[2];
    let suffix = (match[3] || '').toUpperCase();

    // Standardize suffix spacing & hyphens
    if (suffix === 'CM') suffix = 'C-M';
    if (suffix === 'CEM') suffix = 'C-EM';
    if (suffix === 'TCM') suffix = 'TC-M';
    if (suffix === 'CE') suffix = 'C-E';

    const baseModel = `${prefix} ${number}`;
    const canonicalQuery = suffix ? `${baseModel} ${suffix}` : baseModel;

    return {
      prefix,
      number,
      variant: suffix,
      baseModel,
      canonicalQuery
    };
  }

  // Fallback for non-standard queries
  return {
    prefix: raw.replace(/[^A-Z]/g, ''),
    number: raw.replace(/[^0-9]/g, ''),
    variant: '',
    baseModel: raw,
    canonicalQuery: raw
  };
}

/**
 * Searches models in database using normalized matching
 */
export function findModelInDatabase(inputQuery, models = []) {
  if (!models || !Array.isArray(models) || models.length === 0) return null;

  const normalized = normalizeModelQuery(inputQuery);
  const cleanCanonical = normalized.canonicalQuery.replace(/[^A-Z0-9]/g, '');
  const cleanBase = normalized.baseModel.replace(/[^A-Z0-9]/g, '');

  // 1. Exact canonical match (e.g. MS 261 C-M)
  let found = models.find(m => {
    const mClean = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mSlugClean = (m.slug || m.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return mClean === cleanCanonical || mSlugClean === cleanCanonical;
  });

  if (found) return found;

  // 2. Base model match (e.g. BR 600 or MS 261)
  found = models.find(m => {
    const mClean = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mSlugClean = (m.slug || m.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return mClean === cleanBase || mSlugClean === cleanBase || mClean.startsWith(cleanBase);
  });

  return found || null;
}
