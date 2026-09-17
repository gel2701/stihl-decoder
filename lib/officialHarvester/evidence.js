/**
 * Candidate evidence builder with deterministic SHA-256 evidence hash.
 * The hash covers content evidence only — retrieved_at is EXCLUDED so
 * re-harvests of identical content produce identical hashes.
 */
import crypto from 'crypto';

export const EVIDENCE_SCHEMA_VERSION = 1;
export const SOURCE_CLASS = 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE';
export const SOURCE_NAME = 'STIHL_BR_OFFICIAL_STORE';
export const MARKET = 'BR';
export const LANGUAGE = 'pt-BR';

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((e) => stableSerialize(e)).join(',')}]`;
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k])}`)
    .join(',')}}`;
}

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Canonical hash payload: everything that defines the evidence content. */
export function canonicalEvidencePayload(candidate) {
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_class: SOURCE_CLASS,
    source_name: SOURCE_NAME,
    market: MARKET,
    language: LANGUAGE,
    source_url: candidate.source_url,
    model_name: candidate.model_name,
    product_reference: candidate.product_reference || null,
    title: candidate.title || null,
    specs: candidate.specs || {},
    raw_specs: candidate.raw_specs || {},
    manuals: (candidate.manuals || []).map((m) => m.url).sort(),
    images: [...(candidate.images || [])].sort(),
  };
}

export function computeEvidenceHash(candidate) {
  return sha256Hex(stableSerialize(canonicalEvidencePayload(candidate)));
}

export function buildCandidate({ parsed, normalized, match, fieldComparison, retrievedAt }) {
  const candidate = {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_class: SOURCE_CLASS,
    source_name: SOURCE_NAME,
    market: MARKET,
    language: LANGUAGE,
    promotion_status: 'CANDIDATE',
    automatic_promotion_allowed: false,
    review_required: match && (match.status === 'AMBIGUOUS_MODEL' || (fieldComparison || []).some((f) => f.verdict === 'CONFLICT_REVIEW_REQUIRED')),
    source_url: parsed.page_url,
    retrieved_at: retrievedAt || new Date().toISOString(),
    model_name: parsed.model_name,
    product_reference: parsed.product_reference,
    title: parsed.title,
    description: parsed.description || null,
    specs: normalized ? normalized.specs : {},
    extra_specs: normalized ? normalized.extra_specs : {},
    raw_specs: parsed.raw_specs || {},
    manuals: parsed.manuals || [],
    images: parsed.images || [],
    match: match || null,
    field_comparison: fieldComparison || [],
    evidence_hash: null,
  };
  candidate.evidence_hash = computeEvidenceHash(candidate);
  return candidate;
}
