export const PUBLIC_EVIDENCE_SCHEMA = 'public-evidence-v1';

const DISPLAY_ELIGIBLE_STATUSES = new Set([
  'CANONICAL_VERIFIED',
  'OFFICIAL_DOCUMENTED',
  'OFFICIAL_CONFLICTED'
]);

const SINGLE_VALUE_ELIGIBLE_STATUSES = new Set([
  'CANONICAL_VERIFIED',
  'OFFICIAL_DOCUMENTED'
]);

export const TECHNICAL_PUBLIC_FIELDS = new Set([
  'displacement_cc',
  'power_kw',
  'bore_mm',
  'stroke_mm',
  'weight_kg',
  'idle_speed_rpm',
  'spark_plug',
  'electrode_gap_mm',
  'fuel_tank_l',
  'oil_tank_l'
]);

export const MEASUREMENT_DEFINITIONS = {
  displacement_cc: ['ENGINE_DISPLACEMENT'],
  power_kw: ['ENGINE_OUTPUT_POWER'],
  bore_mm: ['CYLINDER_BORE'],
  stroke_mm: ['PISTON_STROKE'],
  weight_kg: ['MACHINE_DRY_WEIGHT', 'POWERHEAD_WEIGHT'],
  idle_speed_rpm: ['ENGINE_IDLE_SPEED'],
  spark_plug: ['NOT_APPLICABLE'],
  electrode_gap_mm: ['SPARK_PLUG_ELECTRODE_GAP'],
  fuel_tank_l: ['FUEL_TANK_CAPACITY'],
  oil_tank_l: ['CHAIN_OIL_TANK_CAPACITY']
};

const SPARK_STOP_TOKENS = [
  'RAPID',
  'RAPID-MICRO',
  'RAPID-SUPER',
  'RM',
  'RS',
  'RSL',
  'RSF',
  'CHAIN',
  'SAW CHAIN',
  'REPLACEMENT SAW CHAIN',
  'ANSI',
  'PITCH',
  'GUIDE BAR',
  'CUTTING ATTACHMENT'
];

const STATUS_LABELS = {
  CANONICAL_VERIFIED: 'Meerdere bronnen bevestigd',
  OFFICIAL_DOCUMENTED: 'Officiële STIHL-bron',
  OFFICIAL_CONFLICTED: 'Bronverschil gevonden',
  SUPPORTED_ESTIMATE: 'Onderbouwde indicatie',
  UNKNOWN: 'Nog niet betrouwbaar gedocumenteerd'
};

export function normalizePublicEvidenceModelKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^stihl\s+/i, '')
    .replace(/\s+/g, '-')
    .replace(/[/.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableEntries(value) {
  if (Array.isArray(value)) {
    return value.map(stableEntries);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableEntries(value[key]);
      return acc;
    }, {});
}

function compactSparkText(value) {
  return normalizeText(String(value || '').replace(/[()]/g, ' '));
}

function sparkTokenize(segment) {
  return compactSparkText(segment)
    .replace(/[,;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeSparkPlugCode(match) {
  const [, prefix, numeric, suffixA, suffixB] = match;
  const parts = [
    String(prefix || '').toUpperCase(),
    String(numeric || ''),
    String(suffixA || '').toUpperCase(),
    String(suffixB || '').toUpperCase()
  ].filter(Boolean);
  if (parts.length < 2) return null;
  const code = parts.join(' ').trim();
  if (/^\d/.test(code)) return null;
  if (/^(?:\d+RA\d+|RA\d+)$/i.test(code.replace(/\s+/g, ''))) return null;
  return code;
}

function detectSparkContamination(segment) {
  const upper = compactSparkText(segment).toUpperCase();
  return SPARK_STOP_TOKENS.some((token) => upper.includes(token))
    || /\b(?:0\.\d+|[1-9]\d?(?:\.\d+)?)\s*MM\b/i.test(upper)
    || /\b(?:0\.\d+|[1-9]\d?(?:\.\d+)?)\s*(?:IN|")\b/i.test(upper);
}

function parseSparkPlugSegment(manufacturer, segment, hasNextManufacturer = false) {
  const compact = compactSparkText(segment);
  const tokens = sparkTokenize(segment);
  const illustrationReferenceDetected = /\b\d+RA\d+\b/i.test(compact);
  const contaminationDetected = detectSparkContamination(compact);

  if (tokens.length < 2) {
    return {
      alternative: null,
      contamination_detected: contaminationDetected,
      illustration_reference_detected: illustrationReferenceDetected
    };
  }

  const [prefix, numeric, ...rest] = tokens;
  if (!/^[A-Z]{2,6}$/i.test(prefix) || !/^\d{1,3}$/.test(numeric)) {
    return {
      alternative: null,
      contamination_detected: contaminationDetected,
      illustration_reference_detected: illustrationReferenceDetected
    };
  }

  const suffixes = [];
  let consumed = 2;
  while (
    consumed < tokens.length
    && suffixes.length < 2
    && /^[A-Z]{1,3}$/i.test(tokens[consumed])
    && !/^(?:OR|AND)$/i.test(tokens[consumed])
  ) {
    suffixes.push(tokens[consumed].toUpperCase());
    consumed += 1;
  }

  const code = normalizeSparkPlugCode([
    null,
    prefix.toUpperCase(),
    numeric,
    suffixes[0] || '',
    suffixes[1] || ''
  ]);
  const trailingTokens = tokens.slice(consumed);
  const trailingText = trailingTokens.join(' ');
  const trailingContamination = detectSparkContamination(trailingText)
    || /\b\d+RA\d+\b/i.test(trailingText)
    || /"/.test(trailingText);
  const allowRecoveredCode = Boolean(code) && (!trailingContamination || hasNextManufacturer);

  return {
    alternative: allowRecoveredCode ? {
      manufacturer: manufacturer.toUpperCase(),
      model: code
    } : null,
    contamination_detected: contaminationDetected || trailingContamination,
    illustration_reference_detected: illustrationReferenceDetected
  };
}

export function sanitizeSparkPlugValue(rawValue) {
  const raw = Array.isArray(rawValue)
    ? rawValue
        .map((entry) => [entry?.manufacturer, entry?.model].filter(Boolean).join(' ').trim())
        .filter(Boolean)
        .join(' or ')
    : normalizeText(rawValue);

  if (!raw) {
    return {
      normalized_value: [],
      semantic_status: 'UNRESOLVED',
      contamination_detected: false,
      illustration_reference_detected: false
    };
  }

  const matches = [...raw.matchAll(/\b(Bosch|NGK)\b/ig)];
  const alternatives = [];
  let contaminationDetected = false;
  let illustrationReferenceDetected = false;

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const manufacturer = current[1];
    const start = current.index + current[0].length;
    const end = next ? next.index : raw.length;
    const segment = raw.slice(start, end);
    const parsed = parseSparkPlugSegment(manufacturer, segment, Boolean(next));
    if (parsed.contamination_detected) contaminationDetected = true;
    if (parsed.illustration_reference_detected) illustrationReferenceDetected = true;
    if (parsed.alternative) {
      alternatives.push(parsed.alternative);
    }
  }

  const deduped = alternatives.filter((entry, index) => {
    const signature = `${entry.manufacturer}:${entry.model}`;
    return alternatives.findIndex((candidate) => `${candidate.manufacturer}:${candidate.model}` === signature) === index;
  });

  const semanticStatus = deduped.length > 0
    ? 'VALID'
    : contaminationDetected
      ? 'CONTAMINATED'
      : illustrationReferenceDetected
        ? 'INVALID'
        : 'UNRESOLVED';

  return {
    normalized_value: deduped,
    semantic_status: semanticStatus,
    contamination_detected: contaminationDetected,
    illustration_reference_detected: illustrationReferenceDetected
  };
}

export function isStrictSemanticStatus(status) {
  return status === 'VALID';
}

export function getMeasurementDefinitionForField(field, context = {}) {
  const allowed = MEASUREMENT_DEFINITIONS[field] || null;
  if (!allowed) return null;
  if (field === 'spark_plug') return 'NOT_APPLICABLE';
  if (field !== 'weight_kg') return allowed[0];

  const sourceText = normalizeText([
    context.measurement_definition,
    context.field_heading,
    context.raw_line,
    context.row,
    context.heading,
    context.section
  ].filter(Boolean).join(' ')).toLowerCase();

  if (sourceText.includes('powerhead')) return 'POWERHEAD_WEIGHT';
  if (sourceText.includes('dry') || sourceText.includes('without fuel') || sourceText.includes('zonder brandstof')) {
    return 'MACHINE_DRY_WEIGHT';
  }

  return null;
}

export function isMeasurementDefinitionKnown(field, context = {}) {
  return Boolean(getMeasurementDefinitionForField(field, context));
}

function emptyOverlay() {
  return {
    schema_version: PUBLIC_EVIDENCE_SCHEMA,
    generated_from_phase: null,
    facts: [],
    model_index: {},
    field_index: {}
  };
}

export function getPublicEvidenceOverlay(database = {}) {
  const overlay = database.public_evidence || database.publicEvidence || null;
  if (!overlay || typeof overlay !== 'object') return emptyOverlay();
  return {
    schema_version: overlay.schema_version || PUBLIC_EVIDENCE_SCHEMA,
    generated_from_phase: overlay.generated_from_phase || null,
    facts: Array.isArray(overlay.facts) ? overlay.facts : [],
    model_index: overlay.model_index && typeof overlay.model_index === 'object' ? overlay.model_index : {},
    field_index: overlay.field_index && typeof overlay.field_index === 'object' ? overlay.field_index : {}
  };
}

function factsForIds(overlay, factIds = []) {
  const idSet = new Set(factIds);
  return overlay.facts.filter((fact) => idSet.has(fact.fact_id));
}

export function findPublicEvidenceModel(query, database = {}) {
  const overlay = getPublicEvidenceOverlay(database);
  const key = normalizePublicEvidenceModelKey(query);
  if (!key) return null;

  if (overlay.model_index[key]) {
    return {
      key,
      model: overlay.model_index[key],
      facts: factsForIds(overlay, overlay.model_index[key].fact_ids || [])
    };
  }

  for (const [modelKey, entry] of Object.entries(overlay.model_index)) {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    if (aliases.some((alias) => normalizePublicEvidenceModelKey(alias) === key)) {
      return {
        key: modelKey,
        model: entry,
        facts: factsForIds(overlay, entry.fact_ids || [])
      };
    }
  }

  return null;
}

export function getPublicEvidenceFactsForModel(modelOrSlug, database = {}) {
  const direct = findPublicEvidenceModel(modelOrSlug, database);
  return direct ? direct.facts : [];
}

export function buildPublicEvidenceFieldMap(modelOrSlug, database = {}) {
  const facts = getPublicEvidenceFactsForModel(modelOrSlug, database);
  const fieldMap = {};
  for (const fact of facts) {
    if (!fieldMap[fact.field]) fieldMap[fact.field] = [];
    fieldMap[fact.field].push(fact);
  }
  return fieldMap;
}

export function getPublicStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN;
}

export function isPublicDisplayEligibleFact(fact) {
  return Boolean(fact && fact.display_eligible && DISPLAY_ELIGIBLE_STATUSES.has(fact.public_evidence_status));
}

export function isSingleValuePublicFact(fact) {
  return Boolean(fact && fact.display_eligible && SINGLE_VALUE_ELIGIBLE_STATUSES.has(fact.public_evidence_status));
}

export function getPreferredPublicFact(fieldFacts = []) {
  if (!Array.isArray(fieldFacts) || fieldFacts.length === 0) return null;
  const conflict = fieldFacts.find((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED');
  if (conflict) return conflict;
  const canonical = fieldFacts.find((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED');
  if (canonical) return canonical;
  return fieldFacts.find((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED') || fieldFacts[0];
}

export function getSingleValuePublicFact(fieldFacts = []) {
  if (!Array.isArray(fieldFacts) || fieldFacts.length === 0) return null;
  const canonical = fieldFacts.find((fact) => isSingleValuePublicFact(fact) && fact.public_evidence_status === 'CANONICAL_VERIFIED');
  if (canonical) return canonical;
  return fieldFacts.find((fact) => isSingleValuePublicFact(fact) && fact.public_evidence_status === 'OFFICIAL_DOCUMENTED') || null;
}

function buildPublicTraceabilityEntry(entry = {}, fallback = {}) {
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const fromEntry = (key, fallbackKey = key) => hasOwn(entry, key) ? entry[key] : fallback?.[fallbackKey];
  const sourceTitleValue = hasOwn(entry, 'source_document_title')
    ? entry.source_document_title
    : hasOwn(entry, 'source_label')
      ? entry.source_label
      : (fallback?.source_document_title ?? fallback?.source_label);
  const sourceDocumentTitle = sanitizePublicSourceLabel(sourceTitleValue ?? '');
  return {
    value: flattenPublicFactValue(
      (hasOwn(entry, 'value') ? entry.value : hasOwn(entry, 'comparison_value') ? entry.comparison_value : hasOwn(entry, 'normalized_value') ? entry.normalized_value : fallback?.normalized_value) ?? null
    ),
    unit: fromEntry('unit'),
    sourceLabel: sourceDocumentTitle || null,
    sourceClass: fromEntry('source_class'),
    sourceDocumentId: fromEntry('source_document_id'),
    sourceDocumentTitle: sourceDocumentTitle || null,
    publicationId: fromEntry('publication_id'),
    pdfPage: fromEntry('pdf_page'),
    printedPage: fromEntry('printed_page'),
    sourceLocatorType: fromEntry('source_locator_type'),
    sourceLocator: fromEntry('source_locator'),
    sourceHeading: fromEntry('source_heading'),
    sourceUrl: fromEntry('source_url'),
    market: fromEntry('market'),
    revision: fromEntry('revision'),
    configuration: fromEntry('configuration'),
    evidenceStatus: hasOwn(entry, 'evidence_status')
      ? entry.evidence_status
      : (fallback?.public_evidence_status ?? fallback?.evidence_status ?? null),
    modelScope: fromEntry('model_scope'),
    scopeEvidence: hasOwn(entry, 'scope_evidence')
      ? (Array.isArray(entry.scope_evidence) ? entry.scope_evidence : [])
      : (Array.isArray(fallback.scope_evidence) ? fallback.scope_evidence : [])
  };
}

function buildConflictValueList(fact) {
  if (!fact) return [];
  const values = [];
  const primary = buildPublicTraceabilityEntry(fact, fact);
  const currentSignature = JSON.stringify(stableEntries(primary));

  values.push(primary);

  for (const entry of fact.conflicting_values || []) {
    const candidate = buildPublicTraceabilityEntry(entry, fact);
    const signature = JSON.stringify(stableEntries(candidate));
    if (signature !== currentSignature && !values.some((row) => JSON.stringify(stableEntries(row)) === signature)) {
      values.push(candidate);
    }
  }

  return values;
}

export function buildPublicEvidenceFields(modelOrSlug, database = {}) {
  const fieldMap = buildPublicEvidenceFieldMap(modelOrSlug, database);
  const publicFields = {};

  for (const [field, facts] of Object.entries(fieldMap)) {
    const preferred = getPreferredPublicFact(facts);
    const singleValue = getSingleValuePublicFact(facts);
    publicFields[field] = {
      field,
      evidence_status: preferred?.public_evidence_status || 'UNKNOWN',
      display_eligible: Boolean(preferred && isPublicDisplayEligibleFact(preferred)),
      single_value_eligible: Boolean(singleValue),
      value: singleValue ? flattenPublicFactValue(singleValue.normalized_value) : null,
      values: preferred?.public_evidence_status === 'OFFICIAL_CONFLICTED'
        ? buildConflictValueList(preferred)
        : singleValue
          ? [buildPublicTraceabilityEntry(singleValue, singleValue)]
          : [],
      unit: preferred?.unit || null,
      measurement_definition: preferred?.measurement_definition || null,
      meta: buildPublicEvidenceMeta(preferred)
    };
  }

  return publicFields;
}

export function buildPublicTechnicalSpecs(modelOrSlug, database = {}) {
  const fieldMap = buildPublicEvidenceFieldMap(modelOrSlug, database);
  const technicalSpecs = {};
  for (const [field, facts] of Object.entries(fieldMap)) {
    const fact = getSingleValuePublicFact(facts);
    if (!fact) continue;
    technicalSpecs[field] = flattenPublicFactValue(fact.normalized_value);
  }
  return technicalSpecs;
}

export function buildPublicSourceSummary(modelOrSlug, database = {}) {
  const facts = getPublicEvidenceFactsForModel(modelOrSlug, database);
  const displayFacts = facts.filter(isPublicDisplayEligibleFact);
  const canonicalVerified = displayFacts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length;
  const officialDocumented = displayFacts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED').length;
  const conflicted = displayFacts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length;
  const sourceCount = new Set(displayFacts.map((fact) => `${fact.source_document_id || fact.publication_id || 'unknown'}:${fact.pdf_page || ''}`)).size;

  let primaryStatus = 'UNKNOWN';
  if (conflicted > 0) {
    primaryStatus = 'OFFICIAL_CONFLICTED';
  } else if (canonicalVerified > 0) {
    primaryStatus = 'CANONICAL_VERIFIED';
  } else if (officialDocumented > 0) {
    primaryStatus = 'OFFICIAL_DOCUMENTED';
  }

  let summaryLabel = getPublicStatusLabel(primaryStatus);
  if (primaryStatus === 'CANONICAL_VERIFIED') {
    summaryLabel = canonicalVerified === 1 ? '1 specificatie door meerdere bronnen bevestigd' : `${canonicalVerified} specificaties door meerdere bronnen bevestigd`;
  } else if (primaryStatus === 'OFFICIAL_DOCUMENTED') {
    summaryLabel = officialDocumented === 1 ? '1 specificatie uit officiële STIHL-documentatie' : `${officialDocumented} specificaties uit officiële STIHL-documentatie`;
  } else if (primaryStatus === 'OFFICIAL_CONFLICTED') {
    summaryLabel = conflicted === 1 ? '1 bronverschil gevonden' : `${conflicted} bronverschillen gevonden`;
  }

  return {
    primaryStatus,
    summaryLabel,
    badgeLabel: getPublicStatusLabel(primaryStatus),
    canonical_verified_count: canonicalVerified,
    official_documented_count: officialDocumented,
    conflicted_count: conflicted,
    display_fact_count: displayFacts.length,
    source_count: sourceCount
  };
}

export function buildPublicSourceBadge(factOrStatus) {
  const status = typeof factOrStatus === 'string'
    ? factOrStatus
    : (factOrStatus?.public_evidence_status || 'UNKNOWN');
  const label = getPublicStatusLabel(status);
  const tone = status === 'CANONICAL_VERIFIED'
    ? 'emerald'
    : status === 'OFFICIAL_DOCUMENTED'
      ? 'blue'
      : status === 'OFFICIAL_CONFLICTED'
        ? 'amber'
        : status === 'SUPPORTED_ESTIMATE'
          ? 'slate'
          : 'gray';

  return {
    status,
    label,
    toneClass: tone
  };
}

export function sanitizePublicSourceLabel(value) {
  return String(value || '')
    .replace(/[A-Z]:\\[^ ]+/g, '')
    .replace(/file:\/\/\/[^ ]+/gi, '')
    .trim();
}

export function buildPublicEvidenceMeta(fact) {
  if (!fact) return null;
  return {
    status: fact.public_evidence_status,
    statusLabel: getPublicStatusLabel(fact.public_evidence_status),
    sourceClass: fact.source_class || null,
    sourceDocumentId: fact.source_document_id || null,
    sourceDocumentTitle: sanitizePublicSourceLabel(fact.source_document_title || ''),
    publicationId: fact.publication_id || null,
    pdfPage: fact.pdf_page || null,
    printedPage: fact.printed_page || null,
    sourceLocatorType: fact.source_locator_type || null,
    sourceLocator: fact.source_locator || null,
    sourceHeading: fact.source_heading || null,
    market: fact.market || null,
    revision: fact.revision || null,
    configuration: fact.configuration || null,
    sourceUrl: fact.source_url || null,
    measurementDefinition: fact.measurement_definition || null,
    singleValueEligible: isSingleValuePublicFact(fact),
    modelScope: fact.model_scope || null,
    scopeEvidence: Array.isArray(fact.scope_evidence) ? fact.scope_evidence : [],
    fieldSemanticStatus: fact.field_semantic_status || null
  };
}

export function flattenPublicFactValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return String(entry || '').trim();
        return [entry.manufacturer, entry.model].filter(Boolean).join(' ').trim();
      })
      .filter(Boolean)
      .join(' / ');
  }
  return value;
}

export function getPublicTechnicalDisplayState(modelOrSlug, field, database = {}) {
  const publicFields = buildPublicEvidenceFields(modelOrSlug, database);
  const entry = publicFields[field] || null;
  return {
    field,
    evidence_status: entry?.evidence_status || 'UNKNOWN',
    display_eligible: Boolean(entry?.display_eligible),
    single_value_eligible: Boolean(entry?.single_value_eligible && entry?.value != null && entry?.value !== ''),
    value: entry?.value ?? null,
    values: Array.isArray(entry?.values) ? entry.values : [],
    unit: entry?.unit || null,
    meta: entry?.meta || null
  };
}

export function getSafePublicTechnicalValue(modelOrSlug, field, database = {}) {
  const state = getPublicTechnicalDisplayState(modelOrSlug, field, database);
  return state.single_value_eligible ? state.value : null;
}

export function formatPublicTechnicalValue(state, formatter = null) {
  if (!state?.single_value_eligible) return null;
  if (typeof formatter === 'function') {
    return formatter(state.value, state.unit, state);
  }
  return state.unit ? `${state.value} ${state.unit}` : `${state.value}`;
}
