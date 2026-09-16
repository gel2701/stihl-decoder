import crypto from 'crypto';

function normalizeModelToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function canonicalSlug(value) {
  return normalizeModelToken(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stableFactId(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function comparableValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function valuesEqual(left, right) {
  const a = comparableValue(left);
  const b = comparableValue(right);
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= Math.max(0.000001, Math.abs(a) * 0.000001);
  }
  return a === b;
}

function findCanonicalModel(candidate, database) {
  const models = Array.isArray(database?.models) ? database.models : [];
  const candidateKeys = new Set([
    normalizeModelToken(candidate?.model_name),
    normalizeModelToken(candidate?.product_name),
    normalizeModelToken(candidate?.model_slug?.replace(/-/g, ' '))
  ].filter(Boolean));

  for (const model of models) {
    const modelKeys = [
      normalizeModelToken(model?.model_name),
      normalizeModelToken(model?.name),
      normalizeModelToken(model?.slug?.replace(/-/g, ' '))
    ].filter(Boolean);
    if (modelKeys.some((key) => candidateKeys.has(key))) return model;
  }
  return null;
}

function existingEvidenceFor(publicEvidenceStore, modelSlug, field) {
  const facts = Array.isArray(publicEvidenceStore?.facts) ? publicEvidenceStore.facts : [];
  return facts.filter((fact) => fact?.model_slug === modelSlug && fact?.field === field);
}

export function validateCandidateStore(store) {
  const errors = [];
  if (!store || typeof store !== 'object') errors.push('ERR_STORE_REQUIRED');
  if (store?.schema_version !== 'stihl-official-candidate-v1') errors.push('ERR_SCHEMA_VERSION');
  if (store?.write_policy !== 'CANDIDATE_ONLY_NO_CANONICAL_MUTATION') errors.push('ERR_WRITE_POLICY');
  if (store?.source?.source_class !== 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE') errors.push('ERR_SOURCE_CLASS');
  if (store?.source?.market !== 'BR') errors.push('ERR_MARKET');
  if (!Array.isArray(store?.products)) errors.push('ERR_PRODUCTS_ARRAY');

  for (const product of store?.products || []) {
    if (product?.promotion_status !== 'CANDIDATE_REVIEW_REQUIRED') errors.push(`ERR_PROMOTION_STATUS:${product?.candidate_id || 'unknown'}`);
    if (product?.display_eligible !== false) errors.push(`ERR_DISPLAY_ELIGIBILITY:${product?.candidate_id || 'unknown'}`);
    if (product?.single_value_eligible !== false) errors.push(`ERR_SINGLE_VALUE_ELIGIBILITY:${product?.candidate_id || 'unknown'}`);
    if (product?.market !== 'BR') errors.push(`ERR_PRODUCT_MARKET:${product?.candidate_id || 'unknown'}`);
  }

  return { valid: errors.length === 0, errors };
}

export function candidateProductToEvidenceSuggestions(candidate) {
  const modelSlug = candidate?.model_slug || canonicalSlug(candidate?.model_name);
  if (!modelSlug) return [];
  return Object.entries(candidate?.canonical_specs || {}).map(([field, spec]) => {
    const identity = {
      source_url: candidate.source_url,
      model_slug: modelSlug,
      field,
      normalized_value: spec?.value,
      market: candidate.market || 'BR'
    };
    return {
      fact_id: stableFactId(identity),
      model_slug: modelSlug,
      variant_slug: modelSlug,
      model_name: candidate.model_name,
      category: candidate.category,
      field,
      raw_value: spec?.raw ?? String(spec?.value ?? ''),
      normalized_value: spec?.value ?? null,
      unit: spec?.unit ?? null,
      measurement_definition: 'OFFICIAL_PRODUCT_PAGE_SPECIFICATION',
      public_evidence_status: 'CANDIDATE_REVIEW_REQUIRED',
      evidence_status: 'CANDIDATE_REVIEW_REQUIRED',
      promotion_status: 'CANDIDATE_REVIEW_REQUIRED',
      display_eligible: false,
      single_value_eligible: false,
      source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
      source_document_id: candidate.product_reference || candidate.product_id || candidate.candidate_id,
      source_document_title: candidate.product_name,
      publication_id: null,
      pdf_page: null,
      printed_page: null,
      market: candidate.market || 'BR',
      revision: null,
      configuration: null,
      model_scope: 'EXACT_MODEL_MARKET_SPECIFIC',
      scope_evidence: [`OFFICIAL_PRODUCT_PAGE:${candidate.source_url}`],
      field_semantic_status: 'CANDIDATE_REVIEW_REQUIRED',
      conflict_group_id: null,
      conflict_status: 'UNASSESSED',
      conflicting_values: [],
      source_url: candidate.source_url,
      evidence_hash: candidate.source_payload_sha256 || null,
      source_locator_type: 'HTML_PRODUCT_PAGE',
      source_locator: candidate.source_url,
      source_heading: spec?.source_label || field,
      retrieved_at: candidate.source_retrieved_at
    };
  });
}

function classifySpec({ candidate, canonicalModel, field, spec, publicEvidenceStore }) {
  const modelSlug = canonicalModel?.slug || candidate?.model_slug || canonicalSlug(candidate?.model_name);
  const canonicalHasField = Boolean(canonicalModel) && Object.prototype.hasOwnProperty.call(canonicalModel, field) && canonicalModel[field] != null;
  const canonicalValue = canonicalHasField ? canonicalModel[field] : null;
  const evidence = existingEvidenceFor(publicEvidenceStore, modelSlug, field);
  const evidenceMatches = evidence.filter((fact) => valuesEqual(fact?.normalized_value, spec?.value));
  const evidenceConflicts = evidence.filter((fact) => !valuesEqual(fact?.normalized_value, spec?.value));

  let status;
  if (!canonicalModel) status = 'MODEL_NOT_FOUND';
  else if (!canonicalHasField && evidence.length === 0) status = 'NEW_FIELD_CANDIDATE';
  else if (canonicalHasField && valuesEqual(canonicalValue, spec?.value)) status = evidenceConflicts.length ? 'CANONICAL_MATCH_EVIDENCE_CONFLICT' : 'MATCH_CANONICAL';
  else if (canonicalHasField) status = 'CONFLICT_CANONICAL';
  else if (evidenceMatches.length) status = 'CORROBORATES_PUBLIC_EVIDENCE';
  else status = 'CONFLICT_PUBLIC_EVIDENCE';

  return {
    model_slug: modelSlug,
    field,
    status,
    candidate_value: spec?.value ?? null,
    candidate_unit: spec?.unit ?? null,
    candidate_raw: spec?.raw ?? null,
    canonical_value: canonicalValue,
    evidence_values: evidence.map((fact) => ({
      fact_id: fact.fact_id,
      normalized_value: fact.normalized_value,
      unit: fact.unit,
      source_class: fact.source_class,
      market: fact.market ?? null
    }))
  };
}

export function buildCandidateReviewReport(candidateStore, database, publicEvidenceStore) {
  const validation = validateCandidateStore(candidateStore);
  if (!validation.valid) {
    return {
      valid: false,
      validation_errors: validation.errors,
      write_policy: 'READ_ONLY_REVIEW',
      summary: {},
      models: []
    };
  }

  const models = [];
  const summary = {
    product_count: candidateStore.products.length,
    matched_model_count: 0,
    unmatched_model_count: 0,
    spec_comparison_count: 0,
    matches: 0,
    conflicts: 0,
    new_fields: 0,
    evidence_corroborations: 0
  };

  for (const candidate of candidateStore.products) {
    const canonicalModel = findCanonicalModel(candidate, database);
    if (canonicalModel) summary.matched_model_count += 1;
    else summary.unmatched_model_count += 1;

    const comparisons = Object.entries(candidate.canonical_specs || {}).map(([field, spec]) =>
      classifySpec({ candidate, canonicalModel, field, spec, publicEvidenceStore })
    );
    summary.spec_comparison_count += comparisons.length;
    for (const comparison of comparisons) {
      if (comparison.status === 'MATCH_CANONICAL' || comparison.status === 'CANONICAL_MATCH_EVIDENCE_CONFLICT') summary.matches += 1;
      if (comparison.status.startsWith('CONFLICT_')) summary.conflicts += 1;
      if (comparison.status === 'NEW_FIELD_CANDIDATE') summary.new_fields += 1;
      if (comparison.status === 'CORROBORATES_PUBLIC_EVIDENCE') summary.evidence_corroborations += 1;
    }

    models.push({
      candidate_id: candidate.candidate_id,
      product_reference: candidate.product_reference,
      product_name: candidate.product_name,
      model_name: candidate.model_name,
      candidate_model_slug: candidate.model_slug,
      canonical_model_slug: canonicalModel?.slug || null,
      canonical_model_name: canonicalModel?.model_name || canonicalModel?.name || null,
      source_url: candidate.source_url,
      market: candidate.market,
      review_status: canonicalModel ? 'CANONICAL_MODEL_MATCHED' : 'MANUAL_MODEL_MATCH_REQUIRED',
      comparisons,
      evidence_suggestions: candidateProductToEvidenceSuggestions(candidate)
    });
  }

  return {
    valid: true,
    schema_version: 'stihl-official-candidate-review-v1',
    generated_at: candidateStore.generated_at,
    source_id: candidateStore.source.source_id,
    market: candidateStore.source.market,
    write_policy: 'READ_ONLY_REVIEW_NO_PROMOTION',
    summary,
    models
  };
}
