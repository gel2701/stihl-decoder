/**
 * Model matching + field comparison against the canonical database.
 * Never writes to canonical files — pure functions.
 */
import { normalizeModelName } from './normalize.js';

export const MATCH_STATUSES = ['EXACT_MATCH', 'MODEL_MATCH', 'NEW_MODEL', 'AMBIGUOUS_MODEL'];
export const FIELD_VERDICTS = [
  'MATCH',
  'DATABASE_MISSING',
  'SOURCE_MISSING',
  'CONFLICT_REVIEW_REQUIRED',
  'POSSIBLE_MARKET_VARIANT',
];

/** Fields where a BR-vs-existing conflict is plausibly a market variant, not a DB error. */
const MARKET_VARIANT_FIELDS = new Set([
  'power_kw',
  'power_hp',
  'weight_kg',
  'guide_bar',
  'guide_bar_length_cm',
  'chain_model',
  'chain_pitch',
  'voltage_v',
  'fuel_tank_ml',
  'oil_tank_ml',
  'sound_pressure_db',
  'sound_power_db',
]);

const COMPARABLE_FIELDS = [
  'displacement_cc',
  'power_kw',
  'power_hp',
  'weight_kg',
  'guide_bar',
  'guide_bar_length_cm',
  'chain_model',
  'chain_pitch',
  'chain_gauge_mm',
  'sound_pressure_db',
  'sound_power_db',
  'vibration_left_m_s2',
  'vibration_right_m_s2',
  'fuel_tank_ml',
  'oil_tank_ml',
  'battery_system',
  'voltage_v',
];

function normRef(ref) {
  return String(ref || '').trim().replace(/\s+/g, '').toUpperCase();
}

function collectDbReferences(model) {
  const refs = [];
  for (const key of ['product_reference', 'article_number', 'mpn', 'part_number', 'stihl_reference']) {
    if (model && model[key]) refs.push(normRef(model[key]));
  }
  return refs.filter(Boolean);
}

/** Controlled alias map for known STIHL naming variants (explicit, no fuzzy). */
const ALIASES = new Map([
  ['MS 201 TC-M', ['MS 201 TC-M', 'MS 201TC-M', 'MS201TC-M']],
]);

function aliasHit(candidateNorm, dbNorm) {
  for (const variants of ALIASES.values()) {
    const norms = variants.map(normalizeModelName);
    if (norms.includes(candidateNorm) && norms.includes(dbNorm)) return true;
  }
  return false;
}

export function matchModel(candidate, dbModels) {
  const candidateNorm = normalizeModelName(candidate.model_name || '');
  const candidateRef = normRef(candidate.product_reference);
  const models = dbModels || [];

  if (candidateRef) {
    const refHits = models.filter((m) => collectDbReferences(m).includes(candidateRef));
    if (refHits.length === 1) return { status: 'EXACT_MATCH', model: refHits[0], via: 'product_reference' };
    if (refHits.length > 1) {
      return { status: 'AMBIGUOUS_MODEL', model: null, via: 'product_reference', candidates: refHits.map((m) => m.model_name) };
    }
  }

  if (!candidateNorm) return { status: 'AMBIGUOUS_MODEL', model: null, via: 'missing_model_name' };

  const exact = models.filter((m) => normalizeModelName(m.model_name) === candidateNorm);
  if (exact.length === 1) return { status: 'MODEL_MATCH', model: exact[0], via: 'model_name' };
  if (exact.length > 1) {
    return { status: 'AMBIGUOUS_MODEL', model: null, via: 'model_name', candidates: exact.map((m) => m.model_name) };
  }

  const alias = models.filter((m) => aliasHit(candidateNorm, normalizeModelName(m.model_name)));
  if (alias.length === 1) return { status: 'MODEL_MATCH', model: alias[0], via: 'alias' };
  if (alias.length > 1) {
    return { status: 'AMBIGUOUS_MODEL', model: null, via: 'alias', candidates: alias.map((m) => m.model_name) };
  }

  return { status: 'NEW_MODEL', model: null, via: 'no_match' };
}

function numbersEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    // Intentionally strict: only exact numeric equality is a MATCH.
    return a === b;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Canonical chain-pitch form: formatting only (quotes, whitespace, decimal
 * comma), no tolerance. ".325\"", ".325", "0,325”" and "3/8\" P" variants
 * collapse to the same token when they denote the same pitch.
 */
export function normalizePitch(value) {
  let s = String(value || '')
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/p\b/g, '')
    .replace(',', '.')
    .replace(/\s+/g, '');
  const m = s.match(/\d*\.?\d+/);
  if (!m) return s;
  // Unify ".325" and "0.325".
  const num = m[0].startsWith('.') ? `0${m[0]}` : m[0];
  const rest = s.replace(m[0], '');
  return `${num}${rest}`;
}

export function compareFields(candidateSpecs, dbModel) {
  const rows = [];
  for (const field of COMPARABLE_FIELDS) {
    const hasSource = candidateSpecs && candidateSpecs[field] !== undefined && candidateSpecs[field] !== null && candidateSpecs[field] !== '';
    const hasDb = dbModel && dbModel[field] !== undefined && dbModel[field] !== null && dbModel[field] !== '';
    if (hasSource && !hasDb) {
      rows.push({ field, database_value: null, source_value: candidateSpecs[field], verdict: 'DATABASE_MISSING' });
    } else if (!hasSource && hasDb) {
      rows.push({ field, database_value: dbModel[field], source_value: null, verdict: 'SOURCE_MISSING' });
    } else if (hasSource && hasDb) {
      const equal =
        field === 'chain_pitch'
          ? normalizePitch(candidateSpecs[field]) === normalizePitch(dbModel[field])
          : numbersEqual(candidateSpecs[field], dbModel[field]);
      if (equal) {
        rows.push({ field, database_value: dbModel[field], source_value: candidateSpecs[field], verdict: 'MATCH' });
      } else if (MARKET_VARIANT_FIELDS.has(field)) {
        rows.push({
          field,
          database_value: dbModel[field],
          source_value: candidateSpecs[field],
          verdict: 'POSSIBLE_MARKET_VARIANT',
          classification: 'POSSIBLE_MARKET_VARIANT',
        });
      } else {
        rows.push({
          field,
          database_value: dbModel[field],
          source_value: candidateSpecs[field],
          verdict: 'CONFLICT_REVIEW_REQUIRED',
        });
      }
    }
  }
  return rows;
}

/**
 * High-value database candidates: official source, field missing in DB,
 * exact model match, technically unambiguous scalar, no market conflict.
 */
export function findHighValueCandidates(candidate, match) {
  if (!match || match.status !== 'MODEL_MATCH' || !match.model) return [];
  const out = [];
  for (const [field, value] of Object.entries(candidate.specs || {})) {
    const dbVal = match.model[field];
    const dbMissing = dbVal === undefined || dbVal === null || dbVal === '';
    if (!dbMissing) continue;
    if (MARKET_VARIANT_FIELDS.has(field)) continue; // needs market review
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue; // must be scalar
    out.push({ model: match.model.model_name, field, source_value: value, source_url: candidate.source_url });
  }
  return out;
}
