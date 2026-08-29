import crypto from 'crypto';

const DOCUMENT_NUMBER_REGEX = /\b0\d{3}[\s-]?\d{3}[\s-]?\d{4}(?:[\s-]?[A-Z])?\b/g;
const STIHL_CODE_REGEX = /\b\d{4}[\s-]\d{3}[\s-]\d{4}(?:[\s-]?[A-Z])?\b/g;
const SERIES_CODE_REGEX = /\b\d{4}\b/g;
const SERIAL_NUMBER_REGEX = /\b\d{6,12}\b/;

const OFFICIAL_KEYWORDS = [
  'andreas stihl',
  'stihl',
  'service manual',
  'workshop manual',
  'instruction manual',
  'operating instructions',
  'technical information',
  'technical manual',
  'parts list',
  'illustrated parts list',
  'spare parts list',
  'bedienungsanleitung',
  'betriebsanleitung',
  'ersatzteilliste',
  'copyright'
];

const STRONG_IDENTITY_KEYWORDS = [
  'andreas stihl ag & co. kg',
  'copyright andreas stihl',
  'printed in',
  'service manual',
  'instruction manual',
  'operating instructions',
  'technical information',
  'illustrated parts list',
  '0458-'
];

const NON_OFFICIAL_KEYWORDS = [
  'yamaha',
  'quotation',
  'quote',
  'invoice',
  'retailer',
  'forum',
  'blog',
  'discussion',
  'marketing brochure',
  'landscaping',
  'course motosserra',
  'manajemen aplikasi',
  'motorcycle',
  'generator specs'
];

const ALTERED_MIRROR_KEYWORDS = [
  'recommended download to read ad-free',
  'mymowerparts.com',
  'scribdtranslations',
  'from scribd',
  '100% (1)'
];

const HISTORICAL_NUMERIC_MODELS = [
  '009', '010', '011', '012', '015', '020', '020 T', '024', '026', '028',
  '034', '036', '038', '041', '044', '046', '048', '050', '051', '056',
  '064', '066', '070', '075', '076', '084', '088'
];

const PART_CONTEXT_KEYWORDS = [
  'part no',
  'part number',
  'replacement part',
  'spare part',
  'ersatzteil',
  'repuesto',
  'quantity',
  'qty',
  'illustrated parts list',
  'spare parts list',
  'parts list',
  'position'
];

const FIELD_LABELS = {
  displacement_cc: ['displacement', 'engine displacement', 'hubraum', 'cilinderinhoud', 'cilindrada', 'cylindree'],
  bore_mm: ['bore', 'bohrung'],
  stroke_mm: ['stroke', 'hub', 'course', 'carrera'],
  power_kw: ['power output', 'engine power', 'leistung', 'vermogen', 'potencia', 'puissance', 'power to iso'],
  power_hp: ['hp', 'bhp', 'ps'],
  weight_kg: ['weight', 'dry weight', 'gewicht', 'peso', 'poids'],
  idle_speed_rpm: ['idle speed', 'ralenti', 'leerlauf', 'stationair'],
  max_engine_speed_rpm: ['max. permissible engine speed', 'maximum engine speed', 'hoechstdrehzahl', 'regime maximal'],
  spark_plug: ['spark plug', 'bougie', 'zuendkerze', 'bujia', 'vela'],
  electrode_gap_mm: ['electrode gap', 'spark plug gap', 'elektrodenabstand', 'distancia entre electrodos'],
  fuel_tank_l: ['fuel tank', 'tank capacity', 'brandstoftank', 'reservoir'],
  oil_tank_l: ['oil tank', 'chain oil tank'],
  air_flow_m3_h: ['air flow', 'air volume', 'air throughput'],
  air_velocity_m_s: ['air velocity', 'air speed'],
  blowing_force_n: ['blowing force'],
  torque_nm: ['torque', 'drehmoment', 'couple'],
  pressure_bar: ['pressure', 'druck', 'presion', 'pression'],
  vacuum_bar: ['vacuum', 'unterdruck']
};

const SANITY_RANGES = {
  displacement_cc: [5, 500],
  bore_mm: [10, 100],
  stroke_mm: [10, 100],
  power_kw: [0.1, 20],
  power_hp: [0.1, 30],
  weight_kg: [0.5, 100],
  idle_speed_rpm: [500, 10000],
  max_engine_speed_rpm: [1000, 20000],
  electrode_gap_mm: [0.1, 2.0],
  fuel_tank_l: [0.05, 10],
  oil_tank_l: [0.05, 10],
  air_flow_m3_h: [10, 5000],
  air_velocity_m_s: [1, 200],
  blowing_force_n: [0.1, 100],
  torque_nm: [0.1, 500],
  pressure_bar: [0.1, 500],
  vacuum_bar: [0.01, 10]
};

export const SOURCE_TYPE_SUITABILITY = {
  WORKSHOP_MANUAL: {
    displacement_cc: 'HIGH',
    bore_mm: 'HIGH',
    stroke_mm: 'HIGH',
    power_kw: 'HIGH',
    power_hp: 'HIGH',
    weight_kg: 'MEDIUM',
    idle_speed_rpm: 'HIGH',
    max_engine_speed_rpm: 'HIGH',
    spark_plug: 'HIGH',
    electrode_gap_mm: 'HIGH',
    carburetor_model: 'HIGH',
    carb_h_setting: 'HIGH',
    carb_l_setting: 'HIGH',
    carb_la_instruction: 'HIGH',
    fuel_tank_l: 'MEDIUM',
    oil_tank_l: 'MEDIUM',
    chain_pitch: 'MEDIUM',
    chain_gauge_mm: 'MEDIUM',
    torque_nm: 'HIGH',
    part_number: 'LOW',
    technical_change_cutoff: 'HIGH'
  },
  SERVICE_MANUAL: {
    displacement_cc: 'HIGH',
    bore_mm: 'HIGH',
    stroke_mm: 'HIGH',
    power_kw: 'HIGH',
    power_hp: 'HIGH',
    weight_kg: 'MEDIUM',
    idle_speed_rpm: 'HIGH',
    max_engine_speed_rpm: 'HIGH',
    spark_plug: 'HIGH',
    electrode_gap_mm: 'HIGH',
    carburetor_model: 'HIGH',
    carb_h_setting: 'HIGH',
    carb_l_setting: 'HIGH',
    carb_la_instruction: 'HIGH',
    fuel_tank_l: 'MEDIUM',
    oil_tank_l: 'MEDIUM',
    chain_pitch: 'MEDIUM',
    chain_gauge_mm: 'MEDIUM',
    torque_nm: 'HIGH',
    part_number: 'LOW',
    technical_change_cutoff: 'HIGH'
  },
  INSTRUCTION_MANUAL: {
    displacement_cc: 'HIGH',
    power_kw: 'HIGH',
    power_hp: 'HIGH',
    weight_kg: 'HIGH',
    idle_speed_rpm: 'MEDIUM',
    max_engine_speed_rpm: 'MEDIUM',
    spark_plug: 'MEDIUM',
    electrode_gap_mm: 'MEDIUM',
    fuel_tank_l: 'HIGH',
    oil_tank_l: 'HIGH',
    air_flow_m3_h: 'HIGH',
    air_velocity_m_s: 'HIGH',
    blowing_force_n: 'HIGH',
    part_number: 'LOW'
  },
  TECHNICAL_INFORMATION: {
    displacement_cc: 'HIGH',
    bore_mm: 'HIGH',
    stroke_mm: 'HIGH',
    power_kw: 'HIGH',
    power_hp: 'HIGH',
    weight_kg: 'MEDIUM',
    spark_plug: 'MEDIUM',
    electrode_gap_mm: 'MEDIUM',
    air_flow_m3_h: 'HIGH',
    air_velocity_m_s: 'HIGH',
    blowing_force_n: 'HIGH',
    torque_nm: 'MEDIUM',
    pressure_bar: 'MEDIUM',
    vacuum_bar: 'MEDIUM',
    technical_change_cutoff: 'HIGH'
  },
  PARTS_LIST: {
    part_number: 'HIGH',
    superseded_by: 'MEDIUM'
  },
  DEALER_TRAINING_MATERIAL: {
    spark_plug: 'LOW',
    electrode_gap_mm: 'LOW',
    technical_change_cutoff: 'LOW'
  },
  CATALOGUE: {
    displacement_cc: 'LOW',
    power_kw: 'LOW',
    weight_kg: 'LOW',
    air_flow_m3_h: 'LOW',
    air_velocity_m_s: 'LOW',
    blowing_force_n: 'LOW'
  },
  UNKNOWN: {}
};

function normalizeText(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(input) {
  return normalizeText(input).toLowerCase();
}

function escapeRegex(input) {
  return String(input).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function normalizeModelToken(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function parseNumber(raw) {
  if (raw == null) return null;
  const value = String(raw).replace(/\s+/g, '').replace(/,/g, '.').replace(/\u00b1.*$/, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(rawUnit) {
  const unit = String(rawUnit || '').trim();
  if (!unit) return null;
  return unit.replace('cm³', 'cm3').replace('m³/h', 'm3/h');
}

function passesSanity(fieldName, value) {
  const range = SANITY_RANGES[fieldName];
  if (!range || typeof value !== 'number') return true;
  return value >= range[0] && value <= range[1];
}

function hasPartContext(text) {
  const normalized = normalizeLooseText(text);
  return PART_CONTEXT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function hasDocumentContext(text) {
  return /(copyright|instruction manual|operating instructions|service manual|workshop manual|technical information|printed in|edition|zba|dvs)/i.test(String(text || ''));
}

export function normalizeDocumentNumber(raw) {
  if (!raw) return null;
  const candidate = String(raw).toUpperCase().match(/\b0\d{3}[\s-]?\d{3}[\s-]?\d{4}(?:[\s-]?[A-Z])?\b/);
  if (!candidate) return null;
  const clean = candidate[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  const parts = clean.split('-').filter(Boolean);
  if (parts.length === 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  if (parts.length >= 4) return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
  return null;
}

export function splitDocumentNumber(documentNumber) {
  if (!documentNumber) return { base: null, revision: null };
  const match = String(documentNumber).match(/^(0\d{3}-\d{3}-\d{4})(?:-([A-Z]))?$/);
  if (!match) return { base: documentNumber, revision: null };
  return { base: match[1], revision: match[2] || null };
}

export function extractDocumentNumberCandidates(...inputs) {
  const values = new Set();
  for (const input of inputs) {
    const matches = String(input || '').toUpperCase().match(DOCUMENT_NUMBER_REGEX) || [];
    for (const match of matches) {
      const normalized = normalizeDocumentNumber(match);
      if (normalized) values.add(normalized);
    }
  }
  return [...values];
}

export function inferDocumentType(title = '', text = '') {
  const haystack = `${normalizeLooseText(title)} ${normalizeLooseText(text)}`;
  if (/(illustrated parts list|parts list|spare parts|parts and diagrams|parts manual|despiece|ersatzteilliste|catalogo)/.test(haystack)) return 'PARTS_LIST';
  if (/(manual de taller|workshop manual)/.test(haystack)) return 'WORKSHOP_MANUAL';
  if (/(service manual|repair manual)/.test(haystack)) return haystack.includes('repair manual') ? 'REPAIR_MANUAL' : 'SERVICE_MANUAL';
  if (/(technical information|technical manual|technical reference|technical data|inf tecnic|informacion tecnica)/.test(haystack)) return 'TECHNICAL_INFORMATION';
  if (/(instruction manual|operating instructions|owners instruction manual|bedienungsanleitung|guide d'utilisation|manual de instrucciones|owner)/.test(haystack)) return 'INSTRUCTION_MANUAL';
  if (/(dealer|training|troubleshooting and repair)/.test(haystack)) return 'DEALER_TRAINING_MATERIAL';
  if (/(catalogue|catalogo|catalog)/.test(haystack)) return 'CATALOGUE';
  return 'UNKNOWN';
}

export function inferMarket(title = '', url = '', text = '') {
  const haystack = `${title} ${url} ${text}`.toLowerCase();
  if (haystack.includes('united states') || haystack.includes('usa') || haystack.includes('us-en')) return 'US';
  if (haystack.includes('ca-fr') || haystack.includes('canada')) return 'CA';
  if (haystack.includes('de-de') || haystack.includes('deutsch')) return 'DE';
  if (haystack.includes('fr-fr')) return 'FR';
  if (haystack.includes('nl-nl') || haystack.includes('nederland')) return 'NL';
  if (haystack.includes('au-en') || haystack.includes('australia')) return 'AU';
  if (haystack.includes('pt-br') || haystack.includes('brasil') || haystack.includes('soprador') || haystack.includes('pecas')) return 'BR';
  return 'UNKNOWN';
}

export function inferLanguage(title = '', text = '') {
  const haystack = `${title} ${text}`.toLowerCase();
  if (haystack.includes('manual de instrucciones') || haystack.includes('lista de repuestos') || haystack.includes('cilindrada')) return 'es';
  if (haystack.includes('liste des pieces') || haystack.includes('cylindree')) return 'fr';
  if (haystack.includes('pecas') || haystack.includes('manual do') || haystack.includes('soprador')) return 'pt';
  if (haystack.includes('betriebsanleitung') || haystack.includes('hubraum')) return 'de';
  if (haystack.includes('cilinderinhoud') || haystack.includes('vermogen')) return 'nl';
  return 'en';
}

export function classifySourceClass(sourceHost, documentType, authenticityStatus) {
  if (!['AUTHENTICATED_OFFICIAL', 'PROBABLE_OFFICIAL', 'ALTERED_OR_INCOMPLETE', 'INSUFFICIENT_EXTRACTED_TEXT'].includes(authenticityStatus)) {
    return 'UNVERIFIED_DOCUMENT_HOST';
  }
  if (documentType === 'WORKSHOP_MANUAL') return 'OFFICIAL_WORKSHOP_MANUAL_MIRROR';
  if (documentType === 'SERVICE_MANUAL' || documentType === 'REPAIR_MANUAL') return 'OFFICIAL_SERVICE_DOCUMENT_MIRROR';
  if (documentType === 'PARTS_LIST') return 'OFFICIAL_PARTS_DOCUMENT_MIRROR';
  if (documentType === 'INSTRUCTION_MANUAL') return 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR';
  if (documentType === 'TECHNICAL_INFORMATION') return 'OFFICIAL_TECHNICAL_INFORMATION_MIRROR';
  return 'OFFICIAL_DOCUMENT_MIRROR';
}

function buildAliasList(model) {
  const aliases = new Set([
    model.model_name,
    model.slug,
    model.id,
    ...(Array.isArray(model.aliases) ? model.aliases : [])
  ].filter(Boolean));
  const explicit = String(model.model_name || '').trim();
  if (/^[A-Z]{2}\s+\d/.test(explicit)) {
    aliases.add(explicit.replace(/\s+/g, ''));
    aliases.add(explicit.replace(/\s+/g, '-'));
  }
  if (HISTORICAL_NUMERIC_MODELS.includes(explicit)) aliases.add(explicit);
  return [...aliases];
}

export function buildKnownModelDictionary(database) {
  const models = Array.isArray(database?.models) ? database.models : [];
  const dictionary = models.map((model) => {
    const aliases = buildAliasList(model);
    return {
      model_id: model.id,
      slug: model.slug,
      model_name: model.model_name,
      series_code: model.series_code || null,
      category_slug: model.category_slug || null,
      aliases,
      normalized_aliases: [...new Set(aliases.map(normalizeModelToken).filter((alias) => alias.length >= 3))],
      patterns: [...new Set(aliases.map((alias) => escapeRegex(String(alias)).replace(/\s+/g, '[-\\s]*').replace(/\\-/g, '[-\\s]*')))]
    };
  });

  for (const historical of HISTORICAL_NUMERIC_MODELS) {
    if (!dictionary.some((entry) => entry.model_name === historical)) {
      dictionary.push({
        model_id: `historical_${historical}`,
        slug: historical.toLowerCase().replace(/\s+/g, '-'),
        model_name: historical,
        series_code: null,
        category_slug: null,
        aliases: [historical],
        normalized_aliases: [normalizeModelToken(historical)],
        patterns: [escapeRegex(historical).replace(/\s+/g, '[-\\s]*')]
      });
    }
  }
  return dictionary;
}

export function extractModelsMentioned(text, knownModels) {
  const haystack = String(text || '');
  const compact = normalizeModelToken(haystack);
  const matches = [];
  for (const model of knownModels) {
    const found = model.patterns.some((pattern) => new RegExp(`(^|[^A-Z0-9])${pattern}(?=[^A-Z0-9]|$)`, 'i').test(haystack))
      || model.normalized_aliases.some((alias) => compact.includes(alias));
    if (found) {
      matches.push({
        model_id: model.model_id,
        slug: model.slug,
        model_name: model.model_name,
        series_code: model.series_code || null,
        category_slug: model.category_slug || null
      });
    }
  }
  return matches;
}

export function extractSeriesCodes(text, knownSeriesCodes = []) {
  const allowed = new Set((knownSeriesCodes || []).map(String));
  const values = new Set();
  for (const match of String(text || '').match(SERIES_CODE_REGEX) || []) {
    if (allowed.size === 0 || allowed.has(match)) values.add(match);
  }
  return [...values];
}

export function computeContentHash(pageTexts = []) {
  return crypto.createHash('sha256').update(pageTexts.map((text) => normalizeText(text)).join('\n')).digest('hex');
}

export function classifyExtractionQuality({ title, pageCount, pageTexts }) {
  const normalizedPages = pageTexts.map((text) => normalizeText(text)).filter(Boolean);
  const totalChars = normalizedPages.reduce((sum, text) => sum + text.length, 0);
  const charactersPerPage = normalizedPages.length > 0 ? totalChars / normalizedPages.length : 0;
  const emptyPageRatio = (pageCount || pageTexts.length || 1) > 0
    ? 1 - (normalizedPages.length / (pageCount || pageTexts.length || 1))
    : 1;
  const recognizedWords = (pageTexts.join(' ').match(/[A-Za-z]{3,}/g) || []).length;
  const numericDensity = pageTexts.join(' ').length > 0
    ? ((pageTexts.join(' ').match(/\d/g) || []).length / pageTexts.join(' ').length)
    : 0;
  const tableExtractionSuccess = /(displacement|hubraum|spark plug|weight|part no|qty|idle speed|air flow)/i.test(pageTexts.join(' '));

  let quality = 'FAILED';
  if (normalizedPages.length === 0) quality = 'FAILED';
  else if (charactersPerPage >= 500 && emptyPageRatio < 0.25) quality = 'EXCELLENT';
  else if (charactersPerPage >= 250 && emptyPageRatio < 0.4) quality = 'GOOD';
  else if (charactersPerPage >= 80 && emptyPageRatio < 0.7) quality = 'PARTIAL';
  else quality = 'POOR';

  return {
    quality,
    metrics: {
      title_present: Boolean(normalizeText(title)),
      characters_per_page: Number(charactersPerPage.toFixed(2)),
      empty_page_ratio: Number(emptyPageRatio.toFixed(3)),
      recognized_words: recognizedWords,
      numeric_density: Number(numericDensity.toFixed(4)),
      table_extraction_success: tableExtractionSuccess
    }
  };
}

export function evaluateAuthenticity({
  title,
  url,
  author,
  pageCount,
  combinedText,
  documentNumbers,
  modelsMentioned,
  extractionQuality,
  metadataSignals = {}
}) {
  const normalizedText = normalizeLooseText(combinedText);
  const normalizedTitle = normalizeLooseText(title);
  const notes = [];
  let score = 0;

  const mentionsStihl = normalizedTitle.includes('stihl') || normalizedText.includes('stihl');
  const hasCorporateIdentity = normalizedText.includes('andreas stihl');
  const officialKeywords = OFFICIAL_KEYWORDS.filter((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const strongIdentitySignals = STRONG_IDENTITY_KEYWORDS.filter((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const hasDocumentNumber = documentNumbers.length > 0;
  const hasModelCoverage = (modelsMentioned || []).length > 0;
  const hasMirrorArtifacts = ALTERED_MIRROR_KEYWORDS.some((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const hasNonOfficialSignals = NON_OFFICIAL_KEYWORDS.some((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const quality = extractionQuality?.quality || 'FAILED';

  if (hasNonOfficialSignals && !mentionsStihl) {
    return {
      authenticity_status: 'NON_OFFICIAL_CONFIRMED',
      authenticity_confidence: 'HIGH',
      notes: ['Document content indicates a non-STIHL or unrelated source.'],
      score: 0,
      strong_identity_signal: false
    };
  }

  if (mentionsStihl) {
    score += 1;
    notes.push('STIHL branding detected.');
  }
  if (hasCorporateIdentity) {
    score += 3;
    notes.push('Corporate publisher string detected.');
  }
  if (hasDocumentNumber) {
    score += 2;
    notes.push(`STIHL-style document number found: ${documentNumbers.join(', ')}.`);
  }
  if (officialKeywords.length > 0) {
    score += Math.min(2, officialKeywords.length);
    notes.push(`Official document keywords found: ${officialKeywords.slice(0, 4).join(', ')}.`);
  }
  if (hasModelCoverage) {
    score += 1;
    notes.push(`Known model mention(s): ${(modelsMentioned || []).slice(0, 5).map((model) => model.model_name).join(', ')}.`);
  }
  if (pageCount && pageCount >= 8) {
    score += 1;
    notes.push('Page count is plausible for a manual or parts list.');
  }
  if (metadataSignals.publisherMatch) {
    score += 1;
    notes.push('Publisher metadata aligns with STIHL manual structure.');
  }
  if (hasMirrorArtifacts) {
    score -= 1;
    notes.push('Mirror or overlay artifacts detected.');
  }
  if (hasNonOfficialSignals && mentionsStihl) {
    score -= 1;
    notes.push('Mixed non-official context detected.');
  }
  if (author && String(author).toLowerCase().includes('scribdtranslations')) {
    score -= 1;
    notes.push('Uploader identity suggests a translation mirror.');
  }

  const strongIdentitySignal = hasCorporateIdentity || hasDocumentNumber || strongIdentitySignals.length >= 2;

  if (!mentionsStihl && quality === 'FAILED') {
    return {
      authenticity_status: 'TEXT_EXTRACTION_FAILED',
      authenticity_confidence: 'LOW',
      notes: ['No usable STIHL identity found because extracted text quality failed.'],
      score,
      strong_identity_signal: false
    };
  }

  if (!mentionsStihl && ['POOR', 'PARTIAL'].includes(quality) && (pageCount || 0) >= 8 && normalizeText(title)) {
    return {
      authenticity_status: 'INSUFFICIENT_EXTRACTED_TEXT',
      authenticity_confidence: 'LOW',
      notes: ['Title is plausible but extracted body text is insufficient for a hard classification.'],
      score,
      strong_identity_signal: false
    };
  }

  if (!mentionsStihl) {
    return {
      authenticity_status: 'NON_OFFICIAL_CONFIRMED',
      authenticity_confidence: 'MEDIUM',
      notes: ['No STIHL identity found in the available title/body signals.'],
      score,
      strong_identity_signal: false
    };
  }

  if (strongIdentitySignal && score >= 6) {
    return {
      authenticity_status: hasMirrorArtifacts ? 'ALTERED_OR_INCOMPLETE' : 'AUTHENTICATED_OFFICIAL',
      authenticity_confidence: hasMirrorArtifacts ? 'MEDIUM' : 'HIGH',
      notes,
      score,
      strong_identity_signal: true
    };
  }

  if (score >= 4 || (strongIdentitySignal && score >= 3)) {
    return {
      authenticity_status: ['POOR', 'FAILED'].includes(quality) ? 'INSUFFICIENT_EXTRACTED_TEXT' : 'PROBABLE_OFFICIAL',
      authenticity_confidence: 'MEDIUM',
      notes,
      score,
      strong_identity_signal: strongIdentitySignal
    };
  }

  return {
    authenticity_status: ['POOR', 'FAILED'].includes(quality) ? 'INSUFFICIENT_EXTRACTED_TEXT' : 'NEEDS_REVIEW',
    authenticity_confidence: 'LOW',
    notes,
    score,
    strong_identity_signal: strongIdentitySignal
  };
}

function titleCompatibilityScore(left, right) {
  const leftTokens = new Set(normalizeLooseText(left || '').split(/\s+/).filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeLooseText(right || '').split(/\s+/).filter((token) => token.length >= 3));
  return [...leftTokens].filter((token) => rightTokens.has(token)).length;
}

function modelSetCompatibility(leftModels, rightModels) {
  const left = new Set(String(leftModels || '').split('|').filter(Boolean));
  const right = new Set(String(rightModels || '').split('|').filter(Boolean));
  if (left.size === 0 || right.size === 0) return false;
  return [...left].some((value) => right.has(value));
}

export function classifyDuplicateRelation(left, right) {
  if (left.content_hash === right.content_hash && left.page_count === right.page_count) {
    return 'EXACT_DUPLICATE';
  }

  const leftDoc = splitDocumentNumber(left.normalized_document_number);
  const rightDoc = splitDocumentNumber(right.normalized_document_number);
  const titlesCompatible = titleCompatibilityScore(left.normalized_title, right.normalized_title) >= 2;
  const modelsCompatible = modelSetCompatibility(left.models_key, right.models_key);
  const pageCountsCompatible = left.page_count && right.page_count ? Math.abs(left.page_count - right.page_count) <= 4 : false;

  if (
    left.normalized_document_number &&
    left.normalized_document_number === right.normalized_document_number &&
    titlesCompatible &&
    modelsCompatible &&
    pageCountsCompatible
  ) {
    return 'SAME_DOCUMENT_DIFFERENT_SCAN';
  }

  if (
    leftDoc.base &&
    rightDoc.base &&
    leftDoc.base === rightDoc.base &&
    leftDoc.revision &&
    rightDoc.revision &&
    leftDoc.revision !== rightDoc.revision &&
    titlesCompatible &&
    modelsCompatible
  ) {
    return 'SAME_DOCUMENT_DIFFERENT_REVISION';
  }

  if (
    leftDoc.base &&
    rightDoc.base &&
    leftDoc.base === rightDoc.base &&
    (!titlesCompatible || !modelsCompatible)
  ) {
    return 'MISMATCHED_METADATA';
  }

  if (
    !leftDoc.base &&
    !rightDoc.base &&
    left.normalized_title === right.normalized_title &&
    left.models_key === right.models_key &&
    left.content_hash !== right.content_hash
  ) {
    return 'POSSIBLE_DIFFERENT_REVISION';
  }

  if (left.models_key === right.models_key && left.normalized_title === right.normalized_title && left.market !== right.market) {
    return 'SAME_BASE_DOCUMENT_DIFFERENT_MARKET';
  }

  return 'RELATED_DOCUMENT';
}

export function extractPartNumbers(text) {
  return [...new Set((String(text || '').match(STIHL_CODE_REGEX) || []).map((value) => value.replace(/\s+/g, '-')))];
}

export function classifyCodeCandidate(text, candidate) {
  const normalizedCandidate = normalizeDocumentNumber(candidate);
  if (normalizedCandidate && hasDocumentContext(text) && !hasPartContext(text)) return 'DOCUMENT_NUMBER';
  if (hasPartContext(text)) return 'PART_NUMBER';
  return 'UNKNOWN_CODE';
}

export function classifySerialEvidence(text) {
  const haystack = normalizeLooseText(text);
  if (haystack.includes('recall') && /(serial|number)/.test(haystack)) return 'RECALL_SCOPE_CUTOFF';
  if (/(before serial|after serial|up to serial|from serial|serial no\.)/.test(haystack) && /(component|ignition|carb|clutch|crankcase|muffler|starter|module)/.test(haystack)) {
    return 'TECHNICAL_CHANGE_CUTOFF';
  }
  if (/(serial no\.|serial number)/.test(haystack) && /(year|production)/.test(haystack)) return 'OFFICIAL_PRODUCTION_RANGE';
  return 'UNKNOWN';
}

export function extractTechnicalCutoffs(text) {
  return String(text || '')
    .split(/[\r\n]+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .map((line) => ({ evidence_type: classifySerialEvidence(line), text: line }))
    .filter((entry) => ['TECHNICAL_CHANGE_CUTOFF', 'RECALL_SCOPE_CUTOFF'].includes(entry.evidence_type));
}

function buildScopedDictionary(models) {
  return models.map((model) => ({
    ...model,
    normalized_aliases: [normalizeModelToken(model.model_name), normalizeModelToken(model.slug)],
    patterns: [
      escapeRegex(String(model.model_name || '')).replace(/\s+/g, '[-\\s]*'),
      escapeRegex(String(model.slug || '')).replace(/\\-/g, '[-\\s]*')
    ]
  }));
}

export function assessDocumentModelRelations({ title = '', metadataText = '', pages = [], knownModels = [] }) {
  const titleMatches = extractModelsMentioned(title, knownModels);
  const metadataMatches = extractModelsMentioned(metadataText, knownModels);
  const pageEvidence = new Map();
  const bodyMatches = new Map();

  for (const page of pages) {
    const matches = extractModelsMentioned(page.page_text || '', knownModels);
    for (const match of matches) {
      bodyMatches.set(match.model_id, match);
      if (!pageEvidence.has(match.model_id)) pageEvidence.set(match.model_id, []);
      pageEvidence.get(match.model_id).push({
        page: page.page_number,
        signal: 'MODEL_IN_DOCUMENT_BODY',
        snippet: normalizeText(page.page_text).slice(0, 180)
      });
    }
  }

  const modelIds = new Set([...titleMatches, ...metadataMatches, ...bodyMatches.values()].map((entry) => entry.model_id));
  const relations = [];

  for (const modelId of modelIds) {
    const titleMatch = titleMatches.find((entry) => entry.model_id === modelId);
    const metadataMatch = metadataMatches.find((entry) => entry.model_id === modelId);
    const bodyMatch = bodyMatches.get(modelId);
    const match = titleMatch || metadataMatch || bodyMatch;

    let relation_status = 'MODEL_NOT_FOUND';
    if (titleMatch && bodyMatch) {
      relation_status = modelIds.size > 1 ? 'EXPLICIT_MULTI_MODEL_MATCH' : 'EXPLICIT_MODEL_MATCH';
    } else if (titleMatch && metadataMatch) {
      relation_status = 'PROBABLE_MATCH';
    } else if (titleMatch) {
      relation_status = 'TITLE_ONLY_MATCH';
    } else if (bodyMatch) {
      relation_status = 'BODY_ONLY_MATCH';
    }

    relations.push({
      model_id: match.model_id,
      slug: match.slug,
      model_name: match.model_name,
      series_code: match.series_code || null,
      relation_status,
      evidence_types: [
        titleMatch ? 'MODEL_IN_TITLE' : null,
        metadataMatch ? 'MODEL_IN_DOCUMENT_METADATA' : null,
        bodyMatch ? 'MODEL_IN_DOCUMENT_BODY' : null
      ].filter(Boolean),
      evidence: (pageEvidence.get(modelId) || []).slice(0, 5)
    });
  }

  for (const relation of relations) {
    if (relation.relation_status === 'TITLE_ONLY_MATCH') {
      const bodyOther = relations.find((entry) => entry.model_id !== relation.model_id && ['BODY_ONLY_MATCH', 'EXPLICIT_MODEL_MATCH', 'EXPLICIT_MULTI_MODEL_MATCH'].includes(entry.relation_status));
      if (bodyOther) relation.relation_status = 'MODEL_CONFLICT';
    }
  }

  return relations.length > 0 ? relations : [{
    model_id: null,
    slug: null,
    model_name: null,
    series_code: null,
    relation_status: 'MODEL_NOT_FOUND',
    evidence_types: ['MODEL_NOT_FOUND'],
    evidence: []
  }];
}

function inferScopeConfidence(relationStatus, multiModelPage) {
  if (relationStatus === 'EXPLICIT_MODEL_MATCH') return 'EXACT_MODEL';
  if (relationStatus === 'EXPLICIT_MULTI_MODEL_MATCH') return multiModelPage ? 'MULTI_MODEL_TABLE' : 'EXACT_MODEL';
  if (relationStatus === 'PROBABLE_MATCH') return 'SERIES_LEVEL';
  return 'UNRESOLVED';
}

function determineModelScopeStatus({ relationStatus, scopeConfidence, modelName, pageText, documentTitle, multiModelPage }) {
  const normalizedPage = normalizeLooseText(pageText);
  const normalizedTitle = normalizeLooseText(documentTitle);
  const normalizedModel = normalizeLooseText(modelName);
  const isVariant = /\b([a-z]{1,3}\s+\d+\s+[a-z]{1,3})\b/i.test(modelName) || /\bRX\b|\bR\b/i.test(modelName);
  const exactMention = normalizedPage.includes(normalizedModel) || normalizedTitle.includes(normalizedModel);

  if (relationStatus === 'MODEL_CONFLICT') return 'CONFLICT';
  if (scopeConfidence === 'MULTI_MODEL_TABLE') return 'MULTI_MODEL_EXPLICIT_COLUMN';
  if (isVariant && exactMention) return 'EXACT_VARIANT';
  if (scopeConfidence === 'EXACT_MODEL') return 'EXACT_MODEL';
  if (scopeConfidence === 'SERIES_LEVEL') return 'SERIES_LEVEL';
  if (relationStatus === 'TITLE_ONLY_MATCH' || relationStatus === 'BODY_ONLY_MATCH') return multiModelPage ? 'UNRESOLVED' : 'DOCUMENT_LEVEL_ONLY';
  return 'UNRESOLVED';
}

function determineMeasurementDefinition(fieldName, context) {
  const normalized = normalizeLooseText(context);
  if (fieldName === 'weight_kg') {
    if (normalized.includes('dry weight')) return 'dry_weight';
    if (normalized.includes('without cutting attachment')) return 'without_cutting_attachment';
    if (normalized.includes('without bar and chain')) return 'without_bar_and_chain';
    if (normalized.includes('with battery')) return 'with_battery';
    if (normalized.includes('without battery')) return 'without_battery';
    if (normalized.includes('empty tank')) return 'empty_tank';
    if (normalized.includes('complete machine')) return 'complete_machine';
    return 'UNSPECIFIED_WEIGHT_CONTEXT';
  }
  if (fieldName === 'air_flow_m3_h') return normalized.includes('maximum') ? 'maximum_air_flow' : 'air_flow';
  return null;
}

function determineBlockReason({
  document,
  suitability,
  modelScope,
  relationStatus,
  parsedOk,
  page,
  value,
  fieldName,
  context,
  anomaly
}) {
  if (document.authenticity_status !== 'AUTHENTICATED_OFFICIAL') return 'DOCUMENT_AUTHENTICITY_INSUFFICIENT';
  if (!suitability || suitability === 'NONE') return 'SOURCE_TYPE_UNSUITABLE';
  if (!Number.isInteger(page)) return 'FIELD_CONTEXT_AMBIGUOUS';
  if (!parsedOk) return 'VALUE_PARSE_AMBIGUOUS';
  if (anomaly) return 'VALUE_SANITY_FAILED';
  if (relationStatus === 'MODEL_CONFLICT') return 'MODEL_SCOPE_CONFLICT';
  if (modelScope === 'UNRESOLVED') return 'MODEL_SCOPE_UNRESOLVED';
  if (modelScope === 'DOCUMENT_LEVEL_ONLY') return 'FIELD_CONTEXT_AMBIGUOUS';
  if (modelScope === 'SERIES_LEVEL') return fieldName === 'part_number' ? 'PART_COMPATIBILITY_UNRESOLVED' : 'MODEL_SCOPE_UNRESOLVED';
  if (modelScope === 'MULTI_MODEL_EXPLICIT_COLUMN' && !/^\d/.test(String(value ?? ''))) return 'TABLE_COLUMN_AMBIGUOUS';
  if (fieldName === 'weight_kg' && determineMeasurementDefinition(fieldName, context) === 'UNSPECIFIED_WEIGHT_CONTEXT') return 'MEASUREMENT_DEFINITION_MISSING';
  if (document.extraction_quality === 'POOR' || document.extraction_quality === 'FAILED') return 'TEXT_QUALITY_TOO_LOW';
  return null;
}

function determineVerificationStatus({ document, fieldName, relationStatus, scopeConfidence, suitability, parsedOk, page }) {
  if (!parsedOk || !Number.isInteger(page)) return 'UNVERIFIED';
  if (!suitability || suitability === 'NONE') return 'UNVERIFIED';
  if (document.authenticity_status === 'PROBABLE_OFFICIAL') return 'OFFICIAL_INDIRECT';
  if (document.authenticity_status === 'ALTERED_OR_INCOMPLETE' && suitability === 'HIGH') return 'OFFICIAL_INDIRECT';
  if (document.authenticity_status === 'AUTHENTICATED_OFFICIAL' && ['EXACT_MODEL', 'MULTI_MODEL_TABLE'].includes(scopeConfidence)) return 'VERIFIED';
  if (document.authenticity_status === 'AUTHENTICATED_OFFICIAL' && relationStatus === 'TITLE_ONLY_MATCH') return 'UNRESOLVED_MODEL_SCOPE';
  if (fieldName === 'technical_change_cutoff' && ['AUTHENTICATED_OFFICIAL', 'PROBABLE_OFFICIAL', 'ALTERED_OR_INCOMPLETE'].includes(document.authenticity_status)) {
    return document.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 'VERIFIED' : 'OFFICIAL_INDIRECT';
  }
  return 'UNVERIFIED';
}

function buildFieldRecord({ document, model, fieldName, value, unit, rawValue, rawUnit, page, verificationStatus, scopeConfidence, sourceEligibility, evidenceSnippet, pageText = '', extra = {} }) {
  const anomaly = typeof value === 'number' && !passesSanity(fieldName, value);
  const modelScope = determineModelScopeStatus({
    relationStatus: model.relation_status,
    scopeConfidence,
    modelName: model.model_name,
    pageText,
    documentTitle: document.document_title || '',
    multiModelPage: scopeConfidence === 'MULTI_MODEL_TABLE'
  });
  const blockReason = verificationStatus === 'VERIFIED' || verificationStatus === 'APPROVED_ALTERNATIVES'
    ? null
    : determineBlockReason({
      document,
      suitability: sourceEligibility,
      modelScope,
      relationStatus: model.relation_status,
      parsedOk: value != null,
      page,
      value,
      fieldName,
      context: evidenceSnippet,
      anomaly
    });
  return {
    candidate_id: stableId([document.document_id, model.model_id, fieldName, String(value), page, document.revision]),
    model_id: model.model_id,
    variant_id: model.slug,
    field_name: fieldName,
    value,
    unit: normalizeUnit(unit),
    raw_value: rawValue,
    raw_unit: normalizeUnit(rawUnit),
    verification_status: anomaly ? 'EXTRACTION_ANOMALY' : verificationStatus,
    document_id: document.document_id,
    document_number: document.normalized_document_number,
    document_number_base: document.document_number_base,
    revision: document.revision,
    page,
    section: null,
    market: document.market,
    source_class: document.source_class,
    document_type: document.document_type,
    authenticity_status: document.authenticity_status,
    confidence: document.authenticity_confidence,
    scope_confidence: scopeConfidence,
    model_scope: modelScope,
    variant_scope: modelScope === 'EXACT_VARIANT' ? model.model_name : null,
    table_scope_confidence: scopeConfidence === 'MULTI_MODEL_TABLE' ? 'HIGH' : modelScope === 'EXACT_MODEL' || modelScope === 'EXACT_VARIANT' ? 'HIGH' : 'LOW',
    source_eligibility: sourceEligibility || 'NONE',
    model_relation_status: model.relation_status,
    page_locator_exists: Number.isInteger(page),
    evidence_snippet: evidenceSnippet,
    extraction_quality: document.extraction_quality,
    measurement_definition: determineMeasurementDefinition(fieldName, evidenceSnippet),
    block_reason: anomaly ? 'VALUE_SANITY_FAILED' : blockReason,
    promotion_status: 'NOT_PROMOTED',
    ocr_risk: /\b[OISB][0-9]{2,}|[0-9]{2,}[OISB]\b/.test(String(rawValue || '')),
    ...extra
  };
}

function extractLineWindows(pageText) {
  const lines = String(pageText || '').split(/[\r\n]+/).map((line) => normalizeText(line)).filter(Boolean);
  return lines.map((line, index) => ({
    line,
    context: [lines[index - 2], lines[index - 1], lines[index], lines[index + 1], lines[index + 2], lines[index + 3]].filter(Boolean).join(' ')
  }));
}

function parseMeasurement(context, labels, unitPattern) {
  const pattern = new RegExp(`(?:${labels.map(escapeRegex).join('|')})[^:\\n]*[: ]+([0-9., ]+)\\s*${unitPattern}`, 'i');
  const match = context.match(pattern);
  if (!match) return null;
  return { raw: match[1].trim(), value: parseNumber(match[1]) };
}

function parseSparkPlug(context) {
  const match = context.match(/(?:spark plug|bougie|zuendkerze|bujia|vela)[^:\n]*[: ]+([^\n]+?)(?=(electrode gap|air gap|idle speed|$))/i);
  return match ? normalizeText(match[1]) : null;
}

function parseCarbTurns(context, label) {
  const match = context.match(new RegExp(`${label}[^:=]*[:=]?\\s*(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?)\\s*(?:turn|turns|slag|tour|vuelta|open)?`, 'i'));
  return match ? normalizeText(match[1]) : null;
}

function parseMultiModelTableRow(line, applicableModels) {
  const compact = normalizeText(line);
  if (applicableModels.length < 2) return [];
  if (!/\b(displ|hubraum|displacement|gewicht|weight|power)\b/i.test(compact)) return [];
  const values = compact.match(/\d+(?:[.,]\d+)?/g) || [];
  if (values.length < applicableModels.length) return [];

  let fieldName = null;
  let unit = null;
  if (/displ|hubraum|displacement/i.test(compact)) {
    fieldName = 'displacement_cc';
    unit = 'cm3';
  } else if (/gewicht|weight/i.test(compact)) {
    fieldName = 'weight_kg';
    unit = 'kg';
  } else if (/power/i.test(compact)) {
    fieldName = 'power_kw';
    unit = 'kW';
  }
  if (!fieldName) return [];

  return applicableModels.map((model, index) => ({
    model,
    fieldName,
    value: parseNumber(values[index]),
    rawValue: values[index],
    unit
  })).filter((entry) => entry.value != null);
}

export function extractTechnicalFields({ document, pages, knownModels = [] }) {
  const extracted = [];
  if (!['AUTHENTICATED_OFFICIAL', 'PROBABLE_OFFICIAL', 'ALTERED_OR_INCOMPLETE', 'NEEDS_REVIEW', 'INSUFFICIENT_EXTRACTED_TEXT'].includes(document.authenticity_status)) {
    return extracted;
  }

  const relations = Array.isArray(document.model_relations) && document.model_relations.length > 0
    ? document.model_relations.filter((entry) => entry.model_id)
    : assessDocumentModelRelations({
      title: document.document_title,
      metadataText: `${document.document_title || ''} ${document.description || ''}`,
      pages,
      knownModels
    }).filter((entry) => entry.model_id);

  const relationIndex = new Map(relations.map((entry) => [entry.model_id, entry]));

  for (const page of pages) {
    const pageText = String(page.page_text || '');
    const normalizedPageText = normalizeText(pageText);
    if (!normalizedPageText) continue;

    const windows = extractLineWindows(pageText);
    const pageModels = extractModelsMentioned(pageText, relations.length > 0 ? buildScopedDictionary(relations) : knownModels);
    const applicableModels = pageModels.length > 0
      ? pageModels.map((entry) => ({ ...entry, relation_status: relationIndex.get(entry.model_id)?.relation_status || 'BODY_ONLY_MATCH' }))
      : relations.filter((entry) => ['EXPLICIT_MODEL_MATCH', 'EXPLICIT_MULTI_MODEL_MATCH', 'PROBABLE_MATCH'].includes(entry.relation_status));
    if (applicableModels.length === 0) continue;

    const multiModelPage = applicableModels.length > 1;

    for (const window of windows) {
      const context = window.context;

      for (const tableEntry of parseMultiModelTableRow(window.line, applicableModels)) {
        const relation = relationIndex.get(tableEntry.model.model_id) || tableEntry.model;
        const scopeConfidence = inferScopeConfidence(relation.relation_status, true);
        const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.[tableEntry.fieldName] || 'NONE';
        extracted.push(buildFieldRecord({
          document,
          model: relation,
          fieldName: tableEntry.fieldName,
          value: tableEntry.value,
          unit: tableEntry.unit,
          rawValue: tableEntry.rawValue,
          rawUnit: tableEntry.unit,
          page: page.page_number,
          verificationStatus: determineVerificationStatus({
            document,
            fieldName: tableEntry.fieldName,
            relationStatus: relation.relation_status,
            scopeConfidence,
            suitability: sourceEligibility,
            parsedOk: tableEntry.value != null,
            page: page.page_number
          }),
          scopeConfidence,
          sourceEligibility,
          evidenceSnippet: context.slice(0, 240),
          pageText
        }));
      }

      const numericFields = [
        ['displacement_cc', FIELD_LABELS.displacement_cc, '(?:cm ?3|cm3|cc)', 'cm3'],
        ['bore_mm', FIELD_LABELS.bore_mm, 'mm', 'mm'],
        ['stroke_mm', FIELD_LABELS.stroke_mm, 'mm', 'mm'],
        ['power_kw', FIELD_LABELS.power_kw, 'kW', 'kW'],
        ['power_hp', FIELD_LABELS.power_hp, '(?:hp|bhp|PS)', 'hp'],
        ['weight_kg', FIELD_LABELS.weight_kg, 'kg', 'kg'],
        ['idle_speed_rpm', FIELD_LABELS.idle_speed_rpm, 'rpm', 'rpm'],
        ['max_engine_speed_rpm', FIELD_LABELS.max_engine_speed_rpm, 'rpm', 'rpm'],
        ['fuel_tank_l', FIELD_LABELS.fuel_tank_l, 'l', 'l'],
        ['oil_tank_l', FIELD_LABELS.oil_tank_l, 'l', 'l'],
        ['air_flow_m3_h', FIELD_LABELS.air_flow_m3_h, 'm(?:3|³)/h', 'm3/h'],
        ['air_velocity_m_s', FIELD_LABELS.air_velocity_m_s, 'm/s', 'm/s'],
        ['blowing_force_n', FIELD_LABELS.blowing_force_n, 'N', 'N'],
        ['torque_nm', FIELD_LABELS.torque_nm, 'Nm', 'Nm'],
        ['pressure_bar', FIELD_LABELS.pressure_bar, 'bar', 'bar'],
        ['vacuum_bar', FIELD_LABELS.vacuum_bar, 'bar', 'bar']
      ];

      for (const [fieldName, labels, unitPattern, unit] of numericFields) {
        const parsed = parseMeasurement(context, labels, unitPattern);
        if (!parsed || parsed.value == null) continue;
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.[fieldName] || 'NONE';
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName,
            value: parsed.value,
            unit,
            rawValue: parsed.raw,
            rawUnit: unit,
            page: page.page_number,
            verificationStatus: determineVerificationStatus({
              document,
              fieldName,
              relationStatus: relation.relation_status,
              scopeConfidence,
              suitability: sourceEligibility,
              parsedOk: parsed.value != null,
              page: page.page_number
            }),
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText
          }));
        }
      }

      const oilMixRatio = context.match(/(?:mix ratio|fuel mix|mischungsverh[aä]ltnis|mezcla)[^:\n]*[: ]+(\d+\s*:\s*\d+)/i);
      if (oilMixRatio) {
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.oil_mix_ratio || 'NONE';
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName: 'oil_mix_ratio',
            value: normalizeText(oilMixRatio[1]),
            unit: null,
            rawValue: oilMixRatio[1],
            rawUnit: null,
            page: page.page_number,
            verificationStatus: determineVerificationStatus({
              document,
              fieldName: 'oil_mix_ratio',
              relationStatus: relation.relation_status,
              scopeConfidence,
              suitability: sourceEligibility,
              parsedOk: true,
              page: page.page_number
            }),
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240)
          }));
        }
      }

      const sparkPlug = parseSparkPlug(context);
      if (sparkPlug) {
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.spark_plug || 'NONE';
          const baseVerificationStatus = determineVerificationStatus({
              document,
              fieldName: 'spark_plug',
              relationStatus: relation.relation_status,
              scopeConfidence,
              suitability: sourceEligibility,
              parsedOk: true,
              page: page.page_number
            });
          const verificationStatus = (sparkPlug.includes(' or ') || sparkPlug.includes('/')) && baseVerificationStatus === 'VERIFIED'
            ? 'APPROVED_ALTERNATIVES'
            : baseVerificationStatus;
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName: 'spark_plug',
            value: sparkPlug,
            unit: null,
            rawValue: sparkPlug,
            rawUnit: null,
            page: page.page_number,
            verificationStatus,
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText
          }));
        }
      }

      const electrodeGap = context.match(/(?:electrode gap|spark plug gap|elektrodenabstand|distancia entre electrodos)[^:\n]*[: ]+([0-9., ]+)\s*mm/i);
      if (electrodeGap) {
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.electrode_gap_mm || 'NONE';
          const value = parseNumber(electrodeGap[1]);
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName: 'electrode_gap_mm',
            value,
            unit: 'mm',
            rawValue: electrodeGap[1],
            rawUnit: 'mm',
            page: page.page_number,
            verificationStatus: determineVerificationStatus({
              document,
              fieldName: 'electrode_gap_mm',
              relationStatus: relation.relation_status,
              scopeConfidence,
              suitability: sourceEligibility,
              parsedOk: value != null,
              page: page.page_number
            }),
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText
          }));
        }
      }

      const carbH = parseCarbTurns(context, 'H');
      const carbL = parseCarbTurns(context, 'L');
      const carbLA = context.match(/(?:LA|idle speed screw|stationary speed screw)[^:\n]*[: ]+([^\n]+)/i);
      for (const [fieldName, value, unit] of [
        ['carb_h_setting', carbH, 'turns'],
        ['carb_l_setting', carbL, 'turns'],
        ['carb_la_instruction', carbLA ? normalizeText(carbLA[1]) : null, null]
      ]) {
        if (!value) continue;
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.[fieldName] || 'NONE';
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName,
            value,
            unit,
            rawValue: value,
            rawUnit: unit,
            page: page.page_number,
            verificationStatus: determineVerificationStatus({
              document,
              fieldName,
              relationStatus: relation.relation_status,
              scopeConfidence,
              suitability: sourceEligibility,
              parsedOk: true,
              page: page.page_number
            }),
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText,
            extra: fieldName === 'carb_la_instruction' ? {} : { normalized_turns: value }
          }));
        }
      }

      const partCodes = extractPartNumbers(context).map((code) => ({ code, kind: classifyCodeCandidate(context, code) }));
      for (const candidate of partCodes) {
        if (candidate.kind !== 'PART_NUMBER') continue;
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.part_number || 'NONE';
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName: 'part_number',
            value: candidate.code,
            unit: null,
            rawValue: candidate.code,
            rawUnit: null,
            page: page.page_number,
            verificationStatus: hasPartContext(context)
              ? determineVerificationStatus({
                document,
                fieldName: 'part_number',
                relationStatus: relation.relation_status,
                scopeConfidence,
                suitability: sourceEligibility,
                parsedOk: true,
                page: page.page_number
            })
              : 'UNVERIFIED',
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText,
            extra: {
              description: normalizeText(context).slice(0, 100),
              assembly: hasPartContext(context) ? 'parts_list_context' : null,
              position_number: (context.match(/\bpos\.?\s*(\d{1,3})/i) || [])[1] || null,
              quantity: (context.match(/\bqty\.?\s*(\d{1,3})/i) || [])[1] || null,
              model_scope: relation.model_name
            }
          }));
        }
      }

      for (const cutoff of extractTechnicalCutoffs(context)) {
        const serialBoundary = (cutoff.text.match(SERIAL_NUMBER_REGEX) || [])[0] || null;
        const component = (cutoff.text.match(/(ignition module|carb(?:uretor)?|clutch|crankcase|starter|muffler)/i) || [])[1] || null;
        for (const model of applicableModels) {
          const relation = relationIndex.get(model.model_id) || model;
          const scopeConfidence = inferScopeConfidence(relation.relation_status, multiModelPage);
          const sourceEligibility = SOURCE_TYPE_SUITABILITY[document.document_type]?.technical_change_cutoff || 'NONE';
          extracted.push(buildFieldRecord({
            document,
            model: relation,
            fieldName: cutoff.evidence_type === 'TECHNICAL_CHANGE_CUTOFF' ? 'technical_change_cutoff' : 'recall_scope_cutoff',
            value: cutoff.text,
            unit: null,
            rawValue: cutoff.text,
            rawUnit: null,
            page: page.page_number,
            verificationStatus: component
              ? determineVerificationStatus({
                document,
                fieldName: 'technical_change_cutoff',
                relationStatus: relation.relation_status,
                scopeConfidence,
                suitability: sourceEligibility,
                parsedOk: Boolean(serialBoundary),
                page: page.page_number
            })
              : 'UNVERIFIED',
            scopeConfidence,
            sourceEligibility,
            evidenceSnippet: context.slice(0, 240),
            pageText,
            extra: {
              evidence_type: cutoff.evidence_type,
              component,
              serial_boundary: serialBoundary,
              serial_semantics: /before serial/i.test(cutoff.text) ? 'BEFORE' : /after serial|from serial/i.test(cutoff.text) ? 'AFTER' : null,
              raw_sentence: cutoff.text
            }
          }));
        }
      }
    }
  }

  return extracted;
}

export function summarizeFieldMetrics(values) {
  const summary = new Map();
  for (const entry of values) {
    if (!summary.has(entry.field_name)) {
      summary.set(entry.field_name, { extracted: 0, verified: 0, indirect: 0, unverified: 0, conflict: 0 });
    }
    const bucket = summary.get(entry.field_name);
    bucket.extracted += 1;
    if (entry.verification_status === 'VERIFIED' || entry.verification_status === 'APPROVED_ALTERNATIVES') bucket.verified += 1;
    else if (entry.verification_status === 'OFFICIAL_INDIRECT') bucket.indirect += 1;
    else bucket.unverified += 1;
  }
  return Object.fromEntries(summary.entries());
}

export function dedupeFieldValues(values) {
  const seen = new Set();
  return values.filter((entry) => {
    const key = JSON.stringify([
      entry.model_id,
      entry.field_name,
      entry.value,
      entry.document_id,
      entry.page,
      entry.verification_status,
      entry.scope_confidence
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
