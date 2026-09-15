import crypto from 'crypto';

// Stable JSON: keys are sorted, array order and JSON number semantics are preserved.
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashCanonicalValue(value) {
  return crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function error(code, message, details = {}) {
  return { code, message, details };
}

function normaliseValue(value) {
  return canonicalize(value);
}

function sourceAssertionKey(fact) {
  return [
    fact.source_document_id || fact.publication_id || '',
    fact.pdf_page ?? fact.source_locator ?? '',
    fact.model_slug || '',
    fact.field || '',
    normaliseValue(fact.normalized_value)
  ].join('|');
}

function promotionKey(fact) {
  return `${fact.model_slug || ''}|${fact.field || ''}`;
}

function validConflict(fact) {
  return fact.public_evidence_status === 'OFFICIAL_CONFLICTED'
    && fact.conflict_status === 'UNRESOLVED_OFFICIAL_CONFLICT'
    && Boolean(fact.conflict_group_id)
    && Array.isArray(fact.conflicting_values)
    && fact.conflicting_values.length > 0;
}

function isActivePromotion(fact) {
  return fact.display_eligible === true
    && ['CANONICAL_VERIFIED', 'OFFICIAL_DOCUMENTED'].includes(fact.public_evidence_status);
}

export function validateManifestStructure(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: [error('ERR_MANIFEST_MISSING', 'Evidence-baselinemanifest ontbreekt.')] };
  }
  const required = [
    'schema_version', 'baseline_id', 'approved_phase', 'created_from_commit',
    'baseline_commit_timestamp', 'fact_count', 'distinct_model_count',
    'fact_array_canonical_sha256', 'public_store_canonical_sha256',
    'canonical_database_sha256', 'immutable_prefix_count',
    'immutable_prefix_canonical_sha256', 'model_fact_counts',
    'historical_prefixes', 'hash_algorithm', 'canonicalization_algorithm',
    'manifest_status'
  ];
  for (const key of required) {
    if (manifest[key] === undefined || manifest[key] === null || manifest[key] === '') {
      errors.push(error('ERR_MANIFEST_STRUCTURE', `Manifestveld ontbreekt: ${key}`, { key }));
    }
  }
  for (const key of ['fact_array_canonical_sha256', 'public_store_canonical_sha256', 'canonical_database_sha256', 'immutable_prefix_canonical_sha256']) {
    if (manifest[key] && !/^[a-f0-9]{64}$/i.test(manifest[key])) {
      errors.push(error('ERR_MANIFEST_STRUCTURE', `Manifesthash is ongeldig: ${key}`, { key }));
    }
  }
  if (manifest.schema_version !== 'public-evidence-baseline-v1') {
    errors.push(error('ERR_MANIFEST_SCHEMA_VERSION', 'Onbekende manifestversie.', { actual: manifest.schema_version }));
  }
  return { valid: errors.length === 0, errors };
}

function compareAgainstBaseline(facts, baselineFacts, approvedAdditionFactIds, errors) {
  if (!Array.isArray(baselineFacts)) return;
  const current = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const approved = new Set(approvedAdditionFactIds || []);
  for (const fact of baselineFacts) {
    const candidate = current.get(fact.fact_id);
    if (!candidate) {
      errors.push(error('ERR_EXISTING_FACT_REMOVED', 'Bestaand baselinefeit ontbreekt.', { fact_id: fact.fact_id }));
    } else if (canonicalize(candidate) !== canonicalize(fact)) {
      errors.push(error('ERR_EXISTING_FACT_MUTATED', 'Bestaand baselinefeit is gemuteerd.', { fact_id: fact.fact_id }));
    }
  }
  const baselineIds = new Set(baselineFacts.map((fact) => fact.fact_id));
  for (const fact of facts) {
    if (!baselineIds.has(fact.fact_id) && !approved.has(fact.fact_id)) {
      errors.push(error('ERR_UNAUTHORIZED_FACT_ADDITION', 'Nieuw feit is niet expliciet goedgekeurd.', { fact_id: fact.fact_id }));
    }
  }
}

function validateFactSemantics(facts, errors) {
  const factIds = new Map();
  const canonicalFacts = new Map();
  const assertions = new Map();
  const promotions = new Map();
  const fieldValues = new Map();

  for (const fact of facts) {
    if (!fact || typeof fact !== 'object') {
      errors.push(error('ERR_FACT_INVALID', 'Een factrecord is geen object.'));
      continue;
    }
    if (!fact.fact_id) errors.push(error('ERR_FACT_ID_MISSING', 'Factrecord mist fact_id.'));
    if (factIds.has(fact.fact_id)) {
      errors.push(error('ERR_DUPLICATE_FACT_ID', 'Dubbele fact_id.', { fact_id: fact.fact_id }));
    }
    factIds.set(fact.fact_id, fact);

    // fact_id is the record identifier, not evidence content; it cannot make a repeated assertion independent.
    const { fact_id: _factId, ...factContent } = fact;
    const canonicalFact = canonicalize(factContent);
    if (canonicalFacts.has(canonicalFact)) {
      errors.push(error('ERR_BYTE_IDENTICAL_DUPLICATE_FACT', 'Byte-/semantisch identiek factrecord.', { fact_id: fact.fact_id }));
    }
    canonicalFacts.set(canonicalFact, fact);

    const assertion = sourceAssertionKey(fact);
    if (assertions.has(assertion)) {
      errors.push(error('ERR_DUPLICATE_SOURCE_ASSERTION', 'Dezelfde bronassertie is meermaals opgeslagen.', { fact_id: fact.fact_id, source_assertion_key: assertion }));
    }
    assertions.set(assertion, fact);

    if (isActivePromotion(fact)) {
      const key = promotionKey(fact);
      const rows = promotions.get(key) || [];
      rows.push(fact);
      promotions.set(key, rows);
      if (!fact.source_document_id && !fact.publication_id) {
        errors.push(error('ERR_PROMOTION_INVALID_EVIDENCE', 'Actieve promotie mist documentidentiteit.', { fact_id: fact.fact_id }));
      }
      if (!fact.source_locator && fact.pdf_page == null) {
        errors.push(error('ERR_PROMOTION_INVALID_EVIDENCE', 'Actieve promotie mist paginalocator.', { fact_id: fact.fact_id }));
      }
      if (!fact.model_scope || !fact.field_semantic_status) {
        errors.push(error('ERR_PROMOTION_INVALID_EVIDENCE', 'Actieve promotie mist scope- of semantiekstatus.', { fact_id: fact.fact_id }));
      }
    }

    const fieldKey = promotionKey(fact);
    const values = fieldValues.get(fieldKey) || [];
    values.push(fact);
    fieldValues.set(fieldKey, values);
  }

  for (const [key, rows] of promotions) {
    const canonical = rows.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED');
    if (canonical.length > 1) {
      errors.push(error('ERR_MULTIPLE_ACTIVE_CANONICAL_PROMOTIONS', 'Meer dan één actieve canonical promotion.', { promotion_key: key, fact_ids: canonical.map((fact) => fact.fact_id) }));
    }
  }

  for (const [key, rows] of fieldValues) {
    const values = new Set(rows.map((fact) => normaliseValue(fact.normalized_value)));
    if (values.size > 1 && rows.some(isActivePromotion) && !rows.every(validConflict)) {
      errors.push(error('ERR_UNRESOLVED_CONFLICT_PROMOTION', 'Conflicterende actieve waarden missen een geldige conflictstatus.', { promotion_key: key, fact_ids: rows.map((fact) => fact.fact_id) }));
    }
  }
}

export function validatePublicEvidenceBaseline(options = {}) {
  const {
    manifest,
    publicEvidenceStore,
    database,
    baselineFacts,
    approvedAdditionFactIds = [],
    manifestWriteAttempted = false,
    expectedHistoricalBaselineId = null,
    historicalStoresByBaselineId = {}
  } = options;
  const structure = validateManifestStructure(manifest);
  const errors = [...structure.errors];
  const facts = Array.isArray(publicEvidenceStore?.facts) ? publicEvidenceStore.facts : [];
  const modelCounts = facts.reduce((counts, fact) => {
    counts[fact.model_slug] = (counts[fact.model_slug] || 0) + 1;
    return counts;
  }, {});

  if (manifestWriteAttempted) {
    errors.push(error('ERR_MANIFEST_WRITE_FORBIDDEN', 'De read-only validator accepteert geen manifest-writepad.'));
  }
  if (expectedHistoricalBaselineId && expectedHistoricalBaselineId !== manifest?.baseline_id) {
    errors.push(error('ERR_HISTORICAL_REPLAY_BASELINE_MISMATCH', 'Een historische replay mag niet tegen de actuele baseline worden uitgevoerd.', {
      expected_historical_baseline_id: expectedHistoricalBaselineId,
      actual_baseline_id: manifest?.baseline_id || null
    }));
  }

  if (structure.valid) {
    if (facts.length !== manifest.fact_count) errors.push(error('ERR_FACT_COUNT_MISMATCH', 'Aantal facts wijkt af.', { expected: manifest.fact_count, actual: facts.length }));
    if (hashCanonicalValue(facts) !== manifest.fact_array_canonical_sha256) errors.push(error('ERR_FACT_ARRAY_HASH_MISMATCH', 'Facts-arrayhash wijkt af.'));
    if (hashCanonicalValue(publicEvidenceStore) !== manifest.public_store_canonical_sha256) errors.push(error('ERR_PUBLIC_STORE_HASH_MISMATCH', 'Public-storehash wijkt af.'));
    if (hashCanonicalValue(database) !== manifest.canonical_database_sha256) errors.push(error('ERR_CANONICAL_DATABASE_HASH_MISMATCH', 'Canonical-databasehash wijkt af.'));
    const prefix = facts.slice(0, manifest.immutable_prefix_count);
    if (prefix.length !== manifest.immutable_prefix_count || hashCanonicalValue(prefix) !== manifest.immutable_prefix_canonical_sha256) {
      errors.push(error('ERR_IMMUTABLE_PREFIX_MISMATCH', 'Immutable evidenceprefix wijkt af.'));
    }
    if (Object.keys(modelCounts).length !== manifest.distinct_model_count || canonicalize(modelCounts) !== canonicalize(manifest.model_fact_counts)) {
      errors.push(error('ERR_MODEL_FACT_COUNT_MISMATCH', 'Model-facttelling wijkt af.', { expected: manifest.model_fact_counts, actual: modelCounts }));
    }
    for (const prefix of manifest.historical_prefixes) {
      const historicalStore = historicalStoresByBaselineId[prefix.baseline_id];
      if (historicalStore && hashCanonicalValue(historicalStore) !== prefix.historical_public_store_canonical_sha256) {
        errors.push(error('ERR_HISTORICAL_PREFIX_MISMATCH', 'Historische replaystore wijkt af.', { baseline_id: prefix.baseline_id }));
      }
    }
  }

  compareAgainstBaseline(facts, baselineFacts, approvedAdditionFactIds, errors);
  validateFactSemantics(facts, errors);
  return { valid: errors.length === 0, errors, fact_count: facts.length, distinct_model_count: Object.keys(modelCounts).length };
}
