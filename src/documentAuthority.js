import crypto from 'crypto';

const DOCUMENT_NUMBER_REGEX = /\b0[1-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}(?:[\s-]?[A-Z])?\b/g;
const PART_NUMBER_REGEX = /\b\d{4}[\s-]\d{3}[\s-]\d{4}\b/g;
const SERIES_CODE_REGEX = /\b\d{4}\b/g;

const OFFICIAL_KEYWORDS = [
  'andreas stihl',
  'stihl',
  'service manual',
  'workshop manual',
  'instruction manual',
  'operating instructions',
  'technical information',
  'parts list',
  'illustrated parts list',
  'not for reprint',
  'copyright'
];

const NON_OFFICIAL_KEYWORDS = [
  'yamaha',
  'sewing machine',
  'quotation',
  'landscaping',
  'course motosserra',
  'manajemen aplikasi',
  'motorbike',
  'motorcycle'
];

const ALTERED_MIRROR_KEYWORDS = [
  'recommended download to read ad-free',
  'mymowerparts.com',
  'scribdtranslations'
];

export const SOURCE_TYPE_SUITABILITY = {
  WORKSHOP_MANUAL: {
    displacement_cc: 'HIGH',
    power_kw: 'MEDIUM',
    weight_kg: 'MEDIUM',
    spark_plug: 'HIGH',
    electrode_gap_mm: 'HIGH',
    carb_h_setting: 'HIGH',
    carb_l_setting: 'HIGH',
    carb_la_setting: 'HIGH',
    idle_speed_rpm: 'HIGH',
    technical_change_cutoff: 'HIGH',
    part_number: 'LOW'
  },
  SERVICE_MANUAL: {
    displacement_cc: 'HIGH',
    power_kw: 'MEDIUM',
    weight_kg: 'MEDIUM',
    spark_plug: 'HIGH',
    electrode_gap_mm: 'HIGH',
    carb_h_setting: 'HIGH',
    carb_l_setting: 'HIGH',
    carb_la_setting: 'HIGH',
    idle_speed_rpm: 'HIGH',
    technical_change_cutoff: 'HIGH',
    part_number: 'LOW'
  },
  INSTRUCTION_MANUAL: {
    displacement_cc: 'HIGH',
    power_kw: 'HIGH',
    weight_kg: 'HIGH',
    spark_plug: 'MEDIUM',
    electrode_gap_mm: 'MEDIUM',
    part_number: 'LOW'
  },
  TECHNICAL_INFORMATION: {
    displacement_cc: 'MEDIUM',
    power_kw: 'MEDIUM',
    weight_kg: 'MEDIUM',
    spark_plug: 'MEDIUM',
    electrode_gap_mm: 'MEDIUM',
    technical_change_cutoff: 'HIGH',
    recall_scope_cutoff: 'HIGH'
  },
  PARTS_LIST: {
    part_number: 'HIGH',
    superseded_by: 'MEDIUM'
  },
  DEALER_TRAINING_MATERIAL: {
    spark_plug: 'MEDIUM',
    electrode_gap_mm: 'MEDIUM',
    technical_change_cutoff: 'MEDIUM'
  },
  CATALOGUE: {
    displacement_cc: 'MEDIUM',
    power_kw: 'MEDIUM',
    weight_kg: 'MEDIUM'
  },
  UNKNOWN: {}
};

function normalizeText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDocumentNumber(raw) {
  if (!raw) return null;
  const candidate = String(raw).toUpperCase().match(/\b0\d{3}[\s-]?\d{3}[\s-]?\d{4}(?:[\s-]?[A-Z])?\b/);
  if (!candidate) return null;
  const clean = candidate[0].replace(/\s+/g, '-').replace(/-+/g, '-');
  const parts = clean.split('-').filter(Boolean);
  if (parts.length < 3) return null;
  if (parts.length === 3) {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
}

export function extractDocumentNumberCandidates(...inputs) {
  const values = new Set();
  for (const input of inputs) {
    const matches = String(input || '').toUpperCase().match(DOCUMENT_NUMBER_REGEX) || [];
    for (const match of matches) {
      const normalized = normalizeDocumentNumber(match);
      if (normalized) {
        values.add(normalized);
      }
    }
  }
  return [...values];
}

export function inferDocumentType(title = '', text = '') {
  const titleHaystack = String(title || '').toLowerCase();
  const textHaystack = String(text || '').toLowerCase();
  const haystack = `${titleHaystack} ${textHaystack}`;
  if (
    titleHaystack.includes('illustrated parts list')
    || titleHaystack.includes('parts list')
    || titleHaystack.includes('spare parts')
    || titleHaystack.includes('parts and diagrams')
    || titleHaystack.includes('parts manual')
    || titleHaystack.includes('despiece')
    || titleHaystack.includes('ersatzteilliste')
    || titleHaystack.includes('vue éclatée')
    || titleHaystack.includes('lista de pe')
    || titleHaystack.includes('catálogo de peças')
    || titleHaystack.includes('catalogo')
    || textHaystack.includes('illustrated parts list')
  ) {
    return 'PARTS_LIST';
  }
  if (titleHaystack.includes('manual de taller') || textHaystack.includes('manual de taller')) {
    return 'WORKSHOP_MANUAL';
  }
  if (titleHaystack.includes('bedienungsanleitung') || titleHaystack.includes('guide d\'utilisation')) {
    return 'INSTRUCTION_MANUAL';
  }
  if (titleHaystack.includes('workshop manual') || textHaystack.includes('workshop manual')) {
    return 'WORKSHOP_MANUAL';
  }
  if (titleHaystack.includes('service manual') || textHaystack.includes('service manual')) {
    return 'SERVICE_MANUAL';
  }
  if (titleHaystack.includes('repair manual') || textHaystack.includes('repair manual')) {
    return 'REPAIR_MANUAL';
  }
  if (titleHaystack.includes('technical information') || titleHaystack.includes('technical manual') || titleHaystack.includes('technical reference') || titleHaystack.includes('technical data') || textHaystack.includes('technical information')) {
    return 'TECHNICAL_INFORMATION';
  }
  if (haystack.includes('inf tecnic') || haystack.includes('informacion tecnica')) {
    return 'TECHNICAL_INFORMATION';
  }
  if (titleHaystack.includes('instruction manual') || titleHaystack.includes('operating instructions') || titleHaystack.includes('owners instruction manual') || textHaystack.includes('operating instructions')) {
    return 'INSTRUCTION_MANUAL';
  }
  if (titleHaystack.includes('manual de instrucciones') || titleHaystack.includes('owner') || textHaystack.includes('manual de instrucciones')) {
    return 'INSTRUCTION_MANUAL';
  }
  if (haystack.includes('dealer') || haystack.includes('training')) {
    return 'DEALER_TRAINING_MATERIAL';
  }
  if (haystack.includes('catalogue') || haystack.includes('catalogo') || haystack.includes('catalog')) {
    return 'CATALOGUE';
  }
  return 'UNKNOWN';
}

export function inferMarket(title = '', url = '', text = '') {
  const haystack = `${title} ${url} ${text}`.toLowerCase();
  if (haystack.includes('usa') || haystack.includes('us-en')) return 'US';
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
  if (haystack.includes('manual de instrucciones') || haystack.includes('lista de repuestos')) return 'es';
  if (haystack.includes('liste des pièces') || haystack.includes('pièces détachées')) return 'fr';
  if (haystack.includes('peças') || haystack.includes('manual do') || haystack.includes('soprador')) return 'pt';
  if (haystack.includes('betriebsanleitung') || haystack.includes('kettensäge')) return 'de';
  return 'en';
}

export function classifySourceClass(sourceHost, documentType, authenticityStatus) {
  if (authenticityStatus !== 'AUTHENTICATED_OFFICIAL' && authenticityStatus !== 'PROBABLE_OFFICIAL') {
    return 'UNVERIFIED_DOCUMENT_HOST';
  }

  if (documentType === 'WORKSHOP_MANUAL') return 'OFFICIAL_WORKSHOP_MANUAL_MIRROR';
  if (documentType === 'SERVICE_MANUAL' || documentType === 'REPAIR_MANUAL') return 'OFFICIAL_SERVICE_DOCUMENT_MIRROR';
  if (documentType === 'PARTS_LIST') return 'OFFICIAL_PARTS_DOCUMENT_MIRROR';
  if (documentType === 'INSTRUCTION_MANUAL') return 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR';
  if (documentType === 'TECHNICAL_INFORMATION') return 'OFFICIAL_TECHNICAL_INFORMATION_MIRROR';
  return 'OFFICIAL_DOCUMENT_MIRROR';
}

function normalizeModelToken(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function buildKnownModelDictionary(database) {
  const models = Array.isArray(database?.models) ? database.models : [];
  return models.map((model) => {
    const aliases = new Set([
      model.model_name,
      model.slug,
      model.id,
      ...(Array.isArray(model.aliases) ? model.aliases : [])
    ].filter(Boolean));

    const tokens = [...aliases].flatMap((alias) => {
      const value = String(alias);
      const collapsed = value.replace(/\s+/g, '');
      return [value, collapsed];
    });

    const patterns = [...new Set(tokens
      .map((token) => String(token).trim())
      .filter((token) => token.length >= 4)
      .map((token) => token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '[-\\s]*')))];

    return {
      model_id: model.id,
      slug: model.slug,
      model_name: model.model_name,
      series_code: model.series_code || null,
      tokens: [...new Set(tokens.map(normalizeModelToken).filter(Boolean))],
      patterns
    };
  });
}

export function extractModelsMentioned(text, knownModels) {
  const rawText = String(text || '').toUpperCase();
  const matches = [];
  for (const model of knownModels) {
    const found = model.patterns.some((pattern) => new RegExp(`(^|[^A-Z0-9])${pattern}(?=[^A-Z0-9]|$)`, 'i').test(rawText));
    if (found) {
      matches.push({
        model_id: model.model_id,
        slug: model.slug,
        model_name: model.model_name,
        series_code: model.series_code || null
      });
    }
  }
  return matches;
}

export function extractSeriesCodes(text, knownSeriesCodes = []) {
  const allowed = new Set((knownSeriesCodes || []).map((value) => String(value)));
  const codes = new Set();
  const matches = String(text || '').match(SERIES_CODE_REGEX) || [];
  for (const match of matches) {
    if (allowed.size === 0 || allowed.has(match)) {
      codes.add(match);
    }
  }
  return [...codes];
}

export function computeContentHash(pageTexts = []) {
  return crypto
    .createHash('sha256')
    .update(pageTexts.map((text) => normalizeText(text)).join('\n'))
    .digest('hex');
}

export function evaluateAuthenticity({ title, url, author, pageCount, combinedText, documentNumbers, modelsMentioned }) {
  const normalizedText = normalizeText(combinedText).toLowerCase();
  const normalizedTitle = normalizeText(title).toLowerCase();
  const normalizedUrl = String(url || '').toLowerCase();
  const notes = [];
  let score = 0;

  const mentionsStihl = normalizedTitle.includes('stihl') || normalizedText.includes('stihl');
  const hasCorporateIdentity = normalizedText.includes('andreas stihl');
  const hasOfficialKeywords = OFFICIAL_KEYWORDS.filter((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const hasDocumentNumber = documentNumbers.length > 0;
  const hasModelCoverage = modelsMentioned.length > 0;
  const hasMirrorArtifacts = ALTERED_MIRROR_KEYWORDS.some((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));
  const hasNonOfficialSignals = NON_OFFICIAL_KEYWORDS.some((keyword) => normalizedText.includes(keyword) || normalizedTitle.includes(keyword));

  if (!mentionsStihl && hasNonOfficialSignals) {
    return {
      authenticity_status: 'NON_OFFICIAL',
      authenticity_confidence: 'HIGH',
      notes: ['Title/text indicate a non-STIHL or unrelated document.'],
      score: 0
    };
  }

  if (mentionsStihl) {
    score += 1;
    notes.push('STIHL branding detected in title or page text.');
  }
  if (hasCorporateIdentity) {
    score += 3;
    notes.push('Corporate publisher string "ANDREAS STIHL" detected.');
  }
  if (hasDocumentNumber) {
    score += 2;
    notes.push(`Document number candidate(s) detected: ${documentNumbers.join(', ')}.`);
  }
  if (hasOfficialKeywords.length > 0) {
    score += Math.min(2, hasOfficialKeywords.length);
    notes.push(`Official-document keywords detected: ${hasOfficialKeywords.slice(0, 4).join(', ')}.`);
  }
  if (hasModelCoverage) {
    score += 1;
    notes.push(`Known STIHL model mention(s) detected: ${modelsMentioned.slice(0, 5).map((model) => model.model_name).join(', ')}.`);
  }
  if (pageCount && pageCount >= 8) {
    score += 1;
    notes.push('Document length is consistent with a manual or parts document.');
  }
  if (hasMirrorArtifacts) {
    score -= 1;
    notes.push('Mirror or ad overlay artifacts detected; content may be altered or incomplete.');
  }
  if (hasNonOfficialSignals && mentionsStihl) {
    score -= 1;
    notes.push('Mixed non-official context detected; requires stricter review.');
  }
  if (author && String(author).toLowerCase().includes('scribdtranslations')) {
    score -= 1;
    notes.push('Uploader appears to be a translation mirror rather than an original publisher account.');
  }
  if (normalizedUrl.includes('ssc-stihl')) {
    score += 1;
    notes.push('Title/URL suggests STIHL service communication or SSC reference.');
  }

  if (!mentionsStihl) {
    return {
      authenticity_status: 'NON_OFFICIAL',
      authenticity_confidence: 'HIGH',
      notes: ['No STIHL identity detected in title or extracted page text.'],
      score
    };
  }

  if (score >= 6 && (hasCorporateIdentity || hasDocumentNumber)) {
    return {
      authenticity_status: hasMirrorArtifacts ? 'ALTERED_OR_INCOMPLETE' : 'AUTHENTICATED_OFFICIAL',
      authenticity_confidence: hasMirrorArtifacts ? 'MEDIUM' : 'HIGH',
      notes,
      score
    };
  }

  if (score >= 4) {
    return {
      authenticity_status: hasMirrorArtifacts ? 'ALTERED_OR_INCOMPLETE' : 'PROBABLE_OFFICIAL',
      authenticity_confidence: 'MEDIUM',
      notes,
      score
    };
  }

  if (score >= 2) {
    return {
      authenticity_status: 'NEEDS_REVIEW',
      authenticity_confidence: 'LOW',
      notes,
      score
    };
  }

  return {
    authenticity_status: 'NON_OFFICIAL',
    authenticity_confidence: 'MEDIUM',
    notes,
    score
  };
}

export function classifyDuplicateRelation(left, right) {
  if (left.content_hash === right.content_hash && left.page_count === right.page_count) {
    return 'EXACT_DUPLICATE';
  }
  if (
    left.normalized_document_number &&
    left.normalized_document_number === right.normalized_document_number &&
    left.revision === right.revision
  ) {
    return 'SAME_DOCUMENT_DIFFERENT_SCAN';
  }

  const leftBase = left.normalized_document_number ? left.normalized_document_number.replace(/-[A-Z]$/, '') : null;
  const rightBase = right.normalized_document_number ? right.normalized_document_number.replace(/-[A-Z]$/, '') : null;
  if (leftBase && rightBase && leftBase === rightBase && left.revision !== right.revision) {
    return 'SAME_DOCUMENT_DIFFERENT_REVISION';
  }

  if (left.models_key === right.models_key && left.normalized_title === right.normalized_title && left.market !== right.market) {
    return 'SAME_BASE_DOCUMENT_DIFFERENT_MARKET';
  }

  return 'RELATED_DOCUMENT';
}

export function extractPartNumbers(text) {
  const matches = String(text || '').match(PART_NUMBER_REGEX) || [];
  return [...new Set(matches.map((value) => value.replace(/\s+/g, '-')))];
}

export function classifySerialEvidence(text) {
  const haystack = String(text || '').toLowerCase();
  if (haystack.includes('recall') && (haystack.includes('serial') || haystack.includes('number'))) {
    return 'RECALL_SCOPE_CUTOFF';
  }
  if ((haystack.includes('before serial') || haystack.includes('after serial') || haystack.includes('up to serial')) && (haystack.includes('component') || haystack.includes('ignition') || haystack.includes('carb') || haystack.includes('clutch'))) {
    return 'TECHNICAL_CHANGE_CUTOFF';
  }
  if ((haystack.includes('serial no.') || haystack.includes('serial number')) && (haystack.includes('year') || haystack.includes('production'))) {
    return 'OFFICIAL_PRODUCTION_RANGE';
  }
  return 'UNKNOWN';
}

export function extractTechnicalCutoffs(text) {
  const lines = String(text || '')
    .split(/[\r\n]+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  return lines
    .map((line) => ({
      evidence_type: classifySerialEvidence(line),
      text: line
    }))
    .filter((entry) => entry.evidence_type === 'TECHNICAL_CHANGE_CUTOFF' || entry.evidence_type === 'RECALL_SCOPE_CUTOFF');
}

export function extractTechnicalFields({ document, pages }) {
  const extracted = [];
  const docType = document.document_type;
  const status = document.authenticity_status === 'AUTHENTICATED_OFFICIAL'
    ? 'VERIFIED'
    : document.authenticity_status === 'PROBABLE_OFFICIAL'
      ? 'OFFICIAL_INDIRECT'
      : 'UNVERIFIED';

  if (!['AUTHENTICATED_OFFICIAL', 'PROBABLE_OFFICIAL', 'ALTERED_OR_INCOMPLETE', 'NEEDS_REVIEW'].includes(document.authenticity_status)) {
    return extracted;
  }

  const eligibleModels = document.models_mentioned || [];
  const eligibleModelNames = eligibleModels.map((model) => model.model_name);
  const singleModel = eligibleModels.length === 1 ? eligibleModels[0] : null;
  const titleModels = document.title_models_mentioned || [];
  const exactTitleModel = titleModels.length === 1 ? titleModels[0] : (document.models_mentioned.length === 1 ? document.models_mentioned[0] : null);

  for (const page of pages) {
    const pageText = normalizeText(page.page_text);
    if (!pageText) continue;

    const pageModelMentions = extractModelsMentioned(pageText, eligibleModels.length > 0 ? eligibleModels.map((model) => ({
      model_id: model.model_id,
      slug: model.slug,
      model_name: model.model_name,
      series_code: model.series_code,
      tokens: [normalizeModelToken(model.model_name), normalizeModelToken(model.slug)],
      patterns: [
        String(model.model_name || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '[-\\s]*'),
        String(model.slug || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/-/g, '[-\\s]*')
      ]
    })) : []);

    const applicableModels = pageModelMentions.length > 0
      ? pageModelMentions
      : (singleModel ? [singleModel] : (exactTitleModel ? [exactTitleModel] : titleModels));
    if (applicableModels.length === 0) {
      continue;
    }

    const sparkMatch = pageText.match(/spark plug[^:]*:\s*([A-Za-z0-9 ,./-]+?)(?=(electrode|air gap|idle speed|$))/i);
    if (sparkMatch) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: 'spark_plug',
          value: sparkMatch[1].trim(),
          unit: null,
          raw_value: sparkMatch[1].trim(),
          raw_unit: null,
          verification_status: sparkMatch[1].includes(' or ') ? 'APPROVED_ALTERNATIVES' : status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const gapMatch = pageText.match(/electrode gap[^:]*:\s*(\d+(?:\.\d+)?)\s*mm/i);
    if (gapMatch) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: 'electrode_gap_mm',
          value: Number(gapMatch[1]),
          unit: 'mm',
          raw_value: gapMatch[1],
          raw_unit: 'mm',
          verification_status: status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const weightMatch = pageText.match(/weight(?: \(dry\))?[^:]*:\s*(\d+(?:\.\d+)?)\s*kg/i);
    if (weightMatch) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: 'weight_kg',
          value: Number(weightMatch[1]),
          unit: 'kg',
          raw_value: weightMatch[1],
          raw_unit: 'kg',
          verification_status: status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const displacementMatch = pageText.match(/displacement[^:]*:\s*(\d+(?:\.\d+)?)\s*cm ?3/i);
    if (displacementMatch) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: 'displacement_cc',
          value: Number(displacementMatch[1]),
          unit: 'cm3',
          raw_value: displacementMatch[1],
          raw_unit: 'cm3',
          verification_status: status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const powerMatch = pageText.match(/power output[^:]*:\s*(\d+(?:\.\d+)?)\s*kW/i);
    if (powerMatch) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: 'power_kw',
          value: Number(powerMatch[1]),
          unit: 'kW',
          raw_value: powerMatch[1],
          raw_unit: 'kW',
          verification_status: status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const airFlowMatches = [...pageText.matchAll(/(?:air flow|air volume|maximum air flow)[^:]*:\s*(\d+(?:\.\d+)?)\s*(m(?:3|³)\/h|m\/s)/gi)];
    for (const match of airFlowMatches) {
      const fieldName = match[0].toLowerCase().includes('maximum') ? 'maximum_air_flow' : 'air_flow';
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: fieldName,
          value: Number(match[1]),
          unit: match[2],
          raw_value: match[1],
          raw_unit: match[2],
          verification_status: status,
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence
        });
      }
    }

    const partNumbers = extractPartNumbers(pageText);
    if (partNumbers.length > 0 && SOURCE_TYPE_SUITABILITY[docType]?.part_number) {
      for (const model of applicableModels) {
        for (const partNumber of partNumbers) {
          extracted.push({
            model_id: model.model_id,
            variant_id: model.slug,
            field_name: 'part_number',
            value: partNumber,
            unit: null,
            raw_value: partNumber,
            raw_unit: null,
            verification_status: status,
            document_id: document.document_id,
            document_number: document.normalized_document_number,
            revision: document.revision,
            page: page.page_number,
            section: null,
            market: document.market,
            source_class: document.source_class,
            confidence: document.authenticity_confidence
          });
        }
      }
    }

    const cutoffs = extractTechnicalCutoffs(pageText);
    for (const cutoff of cutoffs) {
      for (const model of applicableModels) {
        extracted.push({
          model_id: model.model_id,
          variant_id: model.slug,
          field_name: cutoff.evidence_type === 'TECHNICAL_CHANGE_CUTOFF' ? 'technical_change_cutoff' : 'recall_scope_cutoff',
          value: cutoff.text,
          unit: null,
          raw_value: cutoff.text,
          raw_unit: null,
          verification_status: cutoff.evidence_type === 'TECHNICAL_CHANGE_CUTOFF' ? 'REVISION_DEPENDENT' : 'CONFIGURATION_DEPENDENT',
          document_id: document.document_id,
          document_number: document.normalized_document_number,
          revision: document.revision,
          page: page.page_number,
          section: null,
          market: document.market,
          source_class: document.source_class,
          confidence: document.authenticity_confidence,
          evidence_type: cutoff.evidence_type
        });
      }
    }
  }

  return extracted;
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
      entry.verification_status
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
