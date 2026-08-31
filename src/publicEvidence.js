const DISPLAY_ELIGIBLE_STATUSES = new Set([
  'CANONICAL_VERIFIED',
  'OFFICIAL_DOCUMENTED',
  'OFFICIAL_CONFLICTED'
]);

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

function emptyOverlay() {
  return {
    schema_version: 'public-evidence-v1',
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
    schema_version: overlay.schema_version || 'public-evidence-v1',
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

export function getPreferredPublicFact(fieldFacts = []) {
  if (!Array.isArray(fieldFacts) || fieldFacts.length === 0) return null;
  const conflict = fieldFacts.find((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED');
  if (conflict) return conflict;
  const canonical = fieldFacts.find((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED');
  if (canonical) return canonical;
  return fieldFacts.find((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED') || fieldFacts[0];
}

export function buildPublicTechnicalSpecs(modelOrSlug, database = {}) {
  const fieldMap = buildPublicEvidenceFieldMap(modelOrSlug, database);
  const technicalSpecs = {};
  for (const [field, facts] of Object.entries(fieldMap)) {
    const fact = getPreferredPublicFact(facts);
    if (!fact || !isPublicDisplayEligibleFact(fact)) continue;
    technicalSpecs[field] = fact.normalized_value;
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
    sourceDocumentTitle: sanitizePublicSourceLabel(fact.source_document_title || ''),
    publicationId: fact.publication_id || null,
    pdfPage: fact.pdf_page || null,
    printedPage: fact.printed_page || null,
    market: fact.market || null,
    revision: fact.revision || null,
    configuration: fact.configuration || null,
    sourceUrl: fact.source_url || null
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
