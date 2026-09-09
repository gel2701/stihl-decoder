/**
 * Core STIHL Code & Serial Number Decoder Engine for STIHLDecoder.nl
 * Phase 35C.4.3.2.1 fail-closed technicalSpecs contract
 */

import { sanitizeModelSpecifications, normalizeCategorySlug } from './categoryWhitelist.js';
import { normalizeModelQuery, findModelInDatabase } from './modelNormalizer.js';
import { resolveModelRelationship } from './modelRelationships.js';
import { StihlRangeResolver } from './StihlRangeResolver.js';
import { SerialChronologyResolver } from './SerialChronologyResolver.js';
import { getModelVerificationSummary } from './canonicalData.js';
import { resolveMachineClassification } from './driveClassification.js';
import {
  buildPublicEvidenceFields,
  buildPublicEvidenceFieldMap,
  buildPublicEvidenceMeta,
  buildPublicSourceSummary,
  findPublicEvidenceModel,
  flattenPublicFactValue,
  getPreferredPublicFact,
  getSingleValuePublicFact,
  TECHNICAL_PUBLIC_FIELDS
} from './publicEvidence.js';
import { buildSafeTechnicalPreview } from './SafeTechnicalPreviewResolver.js';

function buildTechnicalSpecsFromPublicEvidence(modelKey, database) {
  const fieldMap = buildPublicEvidenceFieldMap(modelKey, database);
  const technicalSpecs = {};
  const publicEvidenceFields = buildPublicEvidenceFields(modelKey, database);
  const publicFacts = [];

  for (const [field, records] of Object.entries(fieldMap)) {
    const fact = getPreferredPublicFact(records);
    if (!fact || !fact.display_eligible) continue;
    const singleValueFact = getSingleValuePublicFact(records);
    if (singleValueFact) {
      technicalSpecs[field] = flattenPublicFactValue(singleValueFact.normalized_value);
    }
    publicFacts.push({
      field,
      value: publicEvidenceFields[field]?.value ?? null,
      meta: buildPublicEvidenceMeta(fact)
    });
  }

  return { technicalSpecs, publicFacts, publicEvidenceFields };
}

function buildDisplayTechnicalSpecs(modelKey, database, category, modelName) {
  const overlaySpecs = buildTechnicalSpecsFromPublicEvidence(modelKey, database);
  return {
    ...overlaySpecs,
    technicalSpecs: sanitizeModelSpecifications(overlaySpecs.technicalSpecs, category, modelName)
  };
}

function buildModelAssist(identityStatus, rangeMatch, probableModelSeries, database) {
  if (identityStatus !== 'PROBABLE_MODEL_SERIES') {
    return {
      available: false,
      series: probableModelSeries || null,
      candidates: []
    };
  }

  const models = Array.isArray(database.models) ? database.models : [];
  const rangeModelId = rangeMatch?.model_id;
  const directModel = rangeModelId ? models.find((m) => m.id === rangeModelId) : null;
  const seriesCode = directModel?.series_code || rangeMatch?.range_id || null;

  let candidatesFound = [];
  if (seriesCode) {
    candidatesFound = models.filter((m) => String(m.series_code) === String(seriesCode));
  }

  if (candidatesFound.length === 0 && probableModelSeries) {
    const parts = String(probableModelSeries).split(/\s*[\/,]\s*|\s+of\s+|\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const m = findModelInDatabase(part, models);
      if (m && !candidatesFound.some((c) => c.slug === m.slug)) {
        candidatesFound.push(m);
      }
    }
  }

  const validCandidates = [];
  for (const m of candidatesFound) {
    const cat = m.category_slug || m.category || 'kettingzagen';
    const specs = buildDisplayTechnicalSpecs(m.slug, database, cat, m.model_name);
    const hasSpecs = Object.keys(specs.technicalSpecs || {}).length > 0;
    if (hasSpecs) {
      validCandidates.push({
        slug: m.slug,
        name: m.model_name,
        category: cat,
        hasSpecs: true
      });
    }
  }

  const seriesName = validCandidates.length > 0
    ? validCandidates.map((c) => c.name).join(' / ')
    : (probableModelSeries || null);

  return {
    available: validCandidates.length > 0,
    series: seriesName,
    candidates: validCandidates
  };
}

function isExactModelMatch(inputQuery, model) {
  if (!model) return false;
  const normalized = normalizeModelQuery(inputQuery);
  const cleanCanonical = String(normalized.canonicalQuery || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanBase = String(normalized.baseModel || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const rawModelName = String(model.model_name || '').toUpperCase();
  const modelName = rawModelName.replace(/[^A-Z0-9]/gi, '');
  const modelSlug = String(model.slug || model.id || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Exact match by model name
  if (modelName === cleanCanonical) return true;

  // Sub-part match for legacy slashed names e.g. "MS 200 / 020 T"
  if (rawModelName.includes('/')) {
    const parts = rawModelName.split('/').map((p) => p.replace(/[^A-Z0-9]/gi, '').trim());
    if (parts.includes(cleanCanonical) || parts.includes(cleanBase)) return true;
  }

  // If canonical model specifies advanced variant (e.g. C-M, C-EM, TC-M), do NOT match base or different variant query
  const hasAdvancedVariant = rawModelName.includes('C-M') || rawModelName.includes('C-EM') || rawModelName.includes('TC-M');
  const queryHasAdvancedVariant = (normalized.variant || '').includes('C-M') || (normalized.variant || '').includes('C-EM') || (normalized.variant || '').includes('TC-M');

  if (hasAdvancedVariant && !queryHasAdvancedVariant) {
    return false;
  }

  if (normalized.variant) {
    return modelName === cleanCanonical || (modelSlug === cleanCanonical && !hasAdvancedVariant);
  }

  return modelName === cleanCanonical || modelSlug === cleanCanonical || modelName === cleanBase || modelSlug === cleanBase;
}

function formatPartNumber(partStr) {
  const digits = String(partStr || '').replace(/\D/g, '');
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

function buildPartFamilyIdentity(familyCode, database = {}) {
  const models = Array.isArray(database.models)
    ? database.models.filter((model) => String(model.series_code || '') === String(familyCode))
    : [];
  const relatedModels = [...new Set(models.map((model) => String(model.model_name || '').trim()).filter(Boolean))];
  const categories = [...new Set(models.map((model) => model.category || model.category_slug).filter(Boolean))];
  const category = categories.length === 1 ? categories[0] : (categories[0] || 'Onbekend');
  const familyInfo = database.part_family_prefixes ? database.part_family_prefixes[familyCode] : null;
  const groupLabel = relatedModels.length > 0
    ? `${relatedModels.slice(0, 4).join(' / ')} familie`
    : `STIHL familiecode ${familyCode}`;

  return {
    familyCode,
    familyLabel: 'STIHL onderdeelreeks / familiecode',
    category,
    relatedModels,
    modelGroup: groupLabel,
    explanation: familyInfo?.note
      || `Code ${familyCode} duidt een STIHL onderdeelreeks of machinefamilie aan en bewijst geen exact model of exacte technische specificaties.`
  };
}

export function decodeStihlCode(inputStr, database = {}, options = {}) {
  if (!inputStr || typeof inputStr !== 'string') {
    return { success: false, error: 'Ongeldige invoer.' };
  }

  const trimmed = inputStr.trim();
  const stripped = trimmed.replace(/^STIHL[\s_\-]+/i, '').trim();

  // Model intent detection on stripped input
  const isModelIntent = Boolean(
    resolveModelRelationship(stripped) ||
    findPublicEvidenceModel(stripped, database) ||
    findModelInDatabase(stripped, database.models || [])
  );
  if (isModelIntent) {
    return analyzeModelQuery(stripped, database);
  }

  const cleaned = stripped.replace(/[^A-Za-z0-9]/g, '');

  // 1. Counterfeit Rule Evaluation (Only applicable to 9-digit serial numbers)
  let counterfeitEvaluation = null;
  if (cleaned.length === 9 && database.counterfeit_rules && Array.isArray(database.counterfeit_rules)) {
    for (const rule of database.counterfeit_rules) {
      const regex = new RegExp(rule.pattern_regex, 'i');
      if (regex.test(cleaned)) {
        counterfeitEvaluation = {
          isCounterfeit: true,
          riskLevel: rule.risk_level || 'SUSPECT_SERIAL',
          reason: rule.reason
        };
        break;
      }
    }
  }

  // 2. Determine Input Type: 9-digit Serial Number vs 11-digit Part Number vs Model Query
  if (cleaned.length === 9 && counterfeitEvaluation && counterfeitEvaluation.isCounterfeit) {
    return {
      success: false,
      isCounterfeit: true,
      riskLevel: counterfeitEvaluation.riskLevel,
      reason: counterfeitEvaluation.reason,
      error: counterfeitEvaluation.reason
    };
  }

  if (/^\d+$/.test(cleaned)) {
    if (cleaned.length === 9 || ((cleaned.length === 8 || cleaned.length === 10) && (options.confirmedModel || options.userConfirmedModel || options.allowVariableLength))) {
      return analyzeSerialNumber(cleaned, database, counterfeitEvaluation, options);
    }
    if (cleaned.length === 11) {
      return analyzePartNumber(cleaned, database);
    }
    return {
      success: false,
      error: `Invoer bevat ${cleaned.length} cijfers. Veel STIHL machines gebruiken een 9-cijferige reeks, maar controleer altijd het typeplaatje en de context van de machine.`
    };
  }

  const isAlphaNumCandidate = /^[A-Z0-9]{8,10}$/i.test(cleaned) && /[A-Z]/i.test(cleaned) && /\d/.test(cleaned);
  if (isAlphaNumCandidate) {
    return analyzeSerialNumber(cleaned.toUpperCase(), database, counterfeitEvaluation, { ...options, isAlphanumeric: true });
  }

  return analyzeModelQuery(stripped, database);
}

export function analyzeModelQuery(modelStr, database) {
  const norm = normalizeModelQuery(modelStr);
  const relationship = resolveModelRelationship(modelStr);
  const publicEvidenceMatch = findPublicEvidenceModel(norm.canonicalQuery || modelStr, database);

  // STRICT RULE: If relationship exists, do NOT inherit matchedModelSpec from the successor/related model!
  let matchedModelSpec = null;
  if (!relationship) {
    matchedModelSpec = findModelInDatabase(modelStr, database.models || []);
    if (matchedModelSpec && !isExactModelMatch(modelStr, matchedModelSpec)) {
      matchedModelSpec = null;
    }
  }

  const hasResolvedModel = Boolean(relationship || matchedModelSpec || publicEvidenceMatch);
  const prefixCode = norm.prefix || (relationship ? '0' : null);
  const prefixMeaning = database.prefixes ? database.prefixes[prefixCode] : null;

  if (!hasResolvedModel) {
    return {
      success: false,
      status: 'NOT_FOUND',
      type: 'MODEL_DECODE',
      input: modelStr,
      error: 'Onbekend STIHL model of zoekterm. Voeg het exacte model van het typeplaatje toe voor technische specificaties.'
    };
  }

  const overlayModel = publicEvidenceMatch?.model || null;
  const overlayModelKey = publicEvidenceMatch?.key || null;
  // Prefix-based category resolution (Defaults to UNKNOWN, NEVER to Kettingzaag)
  let category = 'UNKNOWN';
  if (relationship) {
    category = relationship.category;
  } else if (matchedModelSpec) {
    category = matchedModelSpec.category || matchedModelSpec.category_slug;
  } else if (overlayModel?.category) {
    category = overlayModel.category;
  } else if (norm.prefix === 'BR' || norm.prefix === 'BG' || norm.prefix === 'SH') {
    category = 'Bladblazer';
  } else if (norm.prefix === 'FS' || norm.prefix === 'FR') {
    category = 'Bosmaaier';
  } else if (norm.prefix === 'HS' || norm.prefix === 'HLA') {
    category = 'Heggenschaar';
  } else if (norm.prefix === 'TS') {
    category = 'Doorslijper';
  } else if (norm.prefix === 'MS') {
    category = 'Kettingzaag';
  }

  const resolvedModelName = relationship
    ? relationship.model_name
    : (matchedModelSpec
      ? matchedModelSpec.model_name
      : (overlayModel?.model_name || norm.canonicalQuery));
  const overlaySpecs = overlayModelKey
    ? buildDisplayTechnicalSpecs(overlayModelKey, database, category, resolvedModelName)
    : { technicalSpecs: {}, publicFacts: [], publicEvidenceFields: {} };

  const verification = matchedModelSpec ? getModelVerificationSummary(matchedModelSpec) : null;
  const driveClassification = resolveMachineClassification({
    identityStatus: matchedModelSpec ? 'EXACT_MODEL_IDENTIFIED' : 'MODEL_NOT_IDENTIFIED',
    exactModel: matchedModelSpec,
    modelKey: resolvedModelName,
    category,
    modelPrefix: norm.prefix
  });
  const publicSourceSummary = overlayModelKey ? buildPublicSourceSummary(overlayModelKey, database) : null;
  const sourceStatus = publicSourceSummary?.primaryStatus || (verification ? verification.dataStatus : 'PRIMARY_SOURCE_PENDING');
  const sourceStatusLabel = publicSourceSummary?.display_fact_count
    ? `Bronstatus: ${publicSourceSummary.summaryLabel}`
    : verification
      ? `Bronstatus: ${verification.badgeLabel}`
      : 'Bronstatus: Nog niet betrouwbaar gedocumenteerd';
  const isLinkedModel = matchedModelSpec && (matchedModelSpec.data_status === 'EVIDENCE_STORE_LINKED');
  const modelResolution = (matchedModelSpec && !isLinkedModel)
    ? 'EXACT_CANONICAL'
    : (overlayModelKey || isLinkedModel)
      ? 'VERIFIED_ALIAS'
      : relationship
        ? 'RELATED_MODEL_NO_SPEC_ATTACH'
        : 'UNKNOWN';

  return {
    success: true,
    type: 'MODEL_DECODE',
    input: modelStr,
    prefixCode,
    prefixMeaning: prefixMeaning || 'STIHL Machinetype Aanduiding',
    category,
    model: resolvedModelName,
    seriesCode: relationship ? relationship.series_code : (matchedModelSpec ? matchedModelSpec.series_code : null),
    sourceStatus,
    sourceStatusLabel,
    driveClassification,
    fuel_type: driveClassification.drive_type,
    fuel_type_label: driveClassification.display_label,
    hasPrimaryDoc: Boolean(verification && verification.hasPrimaryDocument),
    confidenceLabel: matchedModelSpec || overlayModelKey ? 'Exact model gevonden' : 'Gerelateerde modelverwijzing',
    modelResolution,
    publicEvidenceSummary: publicSourceSummary,
    publicEvidenceFields: overlaySpecs.publicEvidenceFields,
    publicEvidenceFacts: overlaySpecs.publicFacts,
    relationship: relationship ? {
      type: relationship.relationship_type,
      relatedModel: relationship.related_model_name,
      confidence: relationship.confidence || 'HIGH',
      specInheritance: relationship.spec_inheritance || false,
      notes: relationship.notes
    } : null,
    technicalSpecs: overlaySpecs.technicalSpecs,
    safeTechnicalPreview: { available: false, mode: 'PROBABLE_SERIES_PREVIEW', fields: [] }
  };
}

export function analyzeSerialNumber(serialStr, database, counterfeitEvaluation, options = {}) {
  const factoryDigit = serialStr.charAt(0);
  let factoryData;
  if (factoryDigit === '8') {
    // Factory code 8 fail-closed: without verified primary document, country, location, and details remain null
    factoryData = {
      code: '8',
      country: null,
      location: null,
      details: null,
      confidence: 'UNVERIFIED',
      sourceStatus: 'UNVERIFIED',
      sourceRef: null
    };
  } else {
    const plantRecord = resolvePlantRecord(database, factoryDigit);
    const isLocationVerified = plantRecord && (plantRecord.location || plantRecord.plant_location || plantRecord.facility);
    const factoryLocation = isLocationVerified ? (plantRecord.location || plantRecord.plant_location || plantRecord.facility) : null;
    factoryData = plantRecord ? {
      code: factoryDigit,
      country: plantRecord.country || plantRecord.country_name || null,
      location: factoryLocation,
      details: plantRecord.details || plantRecord.notes || 'STIHL Fabriekslocatie',
      confidence: isLocationVerified ? (plantRecord.confidence || 'MEDIUM') : 'UNVERIFIED',
      sourceStatus: isLocationVerified ? (plantRecord.source_status || 'ESTABLISHED') : 'UNVERIFIED',
      sourceRef: isLocationVerified ? (plantRecord.source_ref || null) : null
    } : {
      code: factoryDigit,
      country: null,
      location: null,
      details: null,
      confidence: 'UNKNOWN',
      sourceStatus: 'UNVERIFIED',
      sourceRef: null
    };
  }

  const isAlphanumeric = Boolean(options.isAlphanumeric || !/^\d+$/.test(serialStr));
  const numericSerial = parseInt(serialStr, 10);
  const rangeMatch = (!isAlphanumeric && /^\d{8,10}$/.test(serialStr)) ? StihlRangeResolver.resolve(numericSerial, factoryDigit, database) : null;

  let modelData = null;
  const confirmedModelInput = options.confirmedModel || options.userConfirmedModel || null;
  const confirmedModel = confirmedModelInput ? findModelInDatabase(confirmedModelInput, database.models || []) : null;
  if (confirmedModelInput && !confirmedModel) {
    return { success: false, status: 'MODEL_CONFIRMATION_REQUIRED', error: 'Het opgegeven model is niet exact herkend. Kies een model uit de lijst.' };
  }
  if (confirmedModel) {
    modelData = confirmedModel;
  }
  const rawProbableSeries = rangeMatch ? (rangeMatch.model_name || rangeMatch.generation || null) : null;
  const rawIdentityStatus = modelData
    ? (confirmedModel ? 'USER_CONFIRMED_MODEL' : 'EXACT_MODEL_IDENTIFIED')
    : rawProbableSeries
      ? 'PROBABLE_MODEL_SERIES'
      : 'MODEL_NOT_IDENTIFIED';
  const modelAssist = buildModelAssist(rawIdentityStatus, rangeMatch, rawProbableSeries, database);
  const probableModelSeries = modelAssist.available ? modelAssist.series : rawProbableSeries;
  const identityStatus = rawIdentityStatus;
  const isModelConfirmedOrIdentified = identityStatus === 'EXACT_MODEL_IDENTIFIED' || identityStatus === 'USER_CONFIRMED_MODEL';
  const modelName = modelData
    ? modelData.model_name
    : (probableModelSeries || 'Nog niet definitief bevestigd');
  const category = modelData ? (modelData.category || modelData.category_slug) : (rangeMatch ? 'STIHL Machine' : 'Onbekend');
  const overlayModelKey = modelData ? (modelData.slug || modelData.model_name) : null;
  const overlaySpecs = overlayModelKey
    ? buildDisplayTechnicalSpecs(overlayModelKey, database, category, modelName)
    : { technicalSpecs: {}, publicFacts: [], publicEvidenceFields: {} };
  const estimatedYears = rangeMatch?.yearRangeFormatted || null;
  const generation = rangeMatch ? rangeMatch.generation : (modelData ? `${modelData.model_name} (seriereferentie)` : 'Niet vastgesteld');

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  const verification = modelData ? getModelVerificationSummary(modelData) : null;
  const driveClassification = resolveMachineClassification({
    identityStatus,
    exactModel: identityStatus === 'EXACT_MODEL_IDENTIFIED' ? modelData : null,
    confirmedModel: confirmedModel,
    resolvedModel: modelData ? modelData.model_name : null,
    probableModelSeries,
    modelKey: modelName,
    category
  });
  const publicSourceSummary = overlayModelKey ? buildPublicSourceSummary(overlayModelKey, database) : null;
  const sourceStatus = isModelConfirmedOrIdentified && publicSourceSummary?.display_fact_count
    ? publicSourceSummary.primaryStatus
    : verification
      ? verification.dataStatus
      : 'PRIMARY_SOURCE_PENDING';
  const sourceStatusLabel = isModelConfirmedOrIdentified && publicSourceSummary?.display_fact_count
    ? `Bronstatus: ${publicSourceSummary.summaryLabel}`
    : verification
      ? `Bronstatus: ${verification.badgeLabel}`
      : 'Bronstatus: Nog niet betrouwbaar gedocumenteerd';

  // Serial ranges support a production-period indication only. Technical claims
  // must come through the field-level public evidence gate, never range metadata.
  const productionPeriod = {
    yearStart: rangeMatch?.yearStart ?? null,
    yearEnd: rangeMatch?.yearEnd ?? null,
    yearRangeFormatted: estimatedYears,
    generation: rangeMatch?.generation || generation,
    confidence: rangeMatch?.confidence || 'UNKNOWN',
    ...(identityStatus === 'PROBABLE_MODEL_SERIES'
      ? { seriesSummary: 'Breakpoint-gebaseerde indicatie van de modelreeks; exacte technische uitvoering is niet bevestigd.' }
      : {})
  };

  const chronologyAnchors = options.anchors || database.serial_chronology_anchors || database.chronology_anchors || null;
  const chronologyResult = SerialChronologyResolver.resolve(serialStr, {
    anchors: chronologyAnchors,
    plantCode: factoryDigit
  });

  const production = (chronologyResult.status === 'ESTIMATED' || chronologyResult.status === 'EXACT')
    ? {
        status: chronologyResult.status,
        year: chronologyResult.estimatedYear,
        yearRange: chronologyResult.yearRange,
        confidence: chronologyResult.confidence,
        method: chronologyResult.method,
        explanation: chronologyResult.explanation,
        provenance: chronologyResult.provenance
      }
    : {
        status: 'UNKNOWN',
        year: null,
        yearRange: null,
        confidence: 'NONE',
        method: 'NONE',
        explanation: 'Geen productiejaar beschikbaar zonder betrouwbare bronverankering.',
        provenance: null
      };

  const resolvedModelName = modelData ? modelData.model_name : (probableModelSeries || null);
  const safeTechnicalPreview = buildSafeTechnicalPreview(
    {
      modelIdentityStatus: identityStatus,
      resolvedModel: resolvedModelName,
      probableModelSeries,
      model: modelName,
      serialResolution: {
        rangeModelId: rangeMatch?.model_id || null,
        level: confirmedModel ? 'USER_CONFIRMED_MODEL' : rangeMatch?.model_id ? 'VERIFIED_SERIAL_RANGE_MODEL' : 'FORMAT_ONLY'
      },
      seriesCode: rangeMatch?.range_id || (rangeMatch?.model_id ? database.models?.find((m) => m.id === rangeMatch.model_id)?.series_code : null),
      category,
      driveClassification,
      fuel_type_label: driveClassification.display_label
    },
    database
  );

  return {
    success: true,
    status: 'FORMAT_VALIDATED',
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: modelName,
    resolvedModel: resolvedModelName,
    confirmedModel: confirmedModel ? confirmedModel.model_name : null,
    exactModel: identityStatus === 'EXACT_MODEL_IDENTIFIED' ? (modelData ? modelData.model_name : null) : null,
    modelIdentityStatus: identityStatus,
    modelIdentitySource: confirmedModel ? 'USER_INPUT' : (rangeMatch ? 'SERIAL_RANGE' : 'SERIAL_FORMAT'),
    serialResolution: {
      level: confirmedModel ? 'USER_CONFIRMED_MODEL' : rangeMatch?.model_id ? 'VERIFIED_SERIAL_RANGE_MODEL' : 'FORMAT_ONLY',
      confidence: confirmedModel ? 'USER_CONFIRMED' : (rangeMatch?.confidence || 'LOW'),
      rangeModelId: rangeMatch?.model_id || null,
      rangeId: rangeMatch?.range_id || null,
      serialFormat: {
        status: isAlphanumeric ? 'FORMAT_ONLY' : 'SERIAL_FORMAT_RECOGNIZED',
        chronologyCompatible: isAlphanumeric ? 'NO' : (rangeMatch ? 'YES' : 'NO')
      },
      nextActions: (modelData && !confirmedModel)
        ? ['Controleer het typeplaatje en STIHL voor bevestiging.']
        : confirmedModel
          ? ['Model bevestigd door gebruiker. Technische specificaties gekoppeld uit officiële bronnen.']
          : ['Weet je welk model dit is? Vul het model van het typeplaatje in voor volledige specificaties.']
    },
    modelAssistAvailable: !confirmedModel && (!modelData || identityStatus !== 'EXACT_MODEL_IDENTIFIED'),
    modelAssist,
    probableModelSeries,
    production,
    chronology: chronologyResult,
    productionChronology: chronologyResult,
    userProvidedYear: options.userProvidedYear ?? null,
    userProvidedYearStatus: options.userProvidedYear ? 'USER_PROVIDED_YEAR' : null,
    userProvidedContext: options.userProvidedYear ? {
      year: options.userProvidedYear,
      status: 'USER_PROVIDED_YEAR'
    } : null,
    identityLabel: identityStatus === 'EXACT_MODEL_IDENTIFIED'
      ? 'Geïdentificeerd model'
      : identityStatus === 'USER_CONFIRMED_MODEL'
        ? 'Model bevestigd door gebruiker'
        : identityStatus === 'PROBABLE_MODEL_SERIES'
          ? 'Waarschijnlijke modelreeks'
          : 'Modelidentificatie',
    category,
    productionPeriod,
    estimatedYears,
    generation,
    confidence: confirmedModel ? 'HIGH' : (rangeMatch ? (rangeMatch.confidence || 'MEDIUM') : 'LOW'),
    confidenceLabel: identityStatus === 'EXACT_MODEL_IDENTIFIED'
      ? 'Exact model geïdentificeerd'
      : identityStatus === 'USER_CONFIRMED_MODEL'
        ? 'Model door gebruiker bevestigd'
        : (rangeMatch ? 'Breakpoint-gebaseerde indicatie' : 'Fabriekscode-indicatie'),
    sourceStatus,
    sourceStatusLabel,
    driveClassification,
    fuel_type: driveClassification.drive_type,
    fuel_type_label: driveClassification.display_label,
    hasPrimaryDoc: Boolean(verification && verification.hasPrimaryDocument),
    publicEvidenceSummary: isModelConfirmedOrIdentified ? publicSourceSummary : null,
    publicEvidenceFields: isModelConfirmedOrIdentified ? overlaySpecs.publicEvidenceFields : {},
    publicEvidenceFacts: isModelConfirmedOrIdentified ? overlaySpecs.publicFacts : [],
    technicalSpecs: isModelConfirmedOrIdentified
      ? overlaySpecs.technicalSpecs
      : {},
    safeTechnicalPreview,
    counterfeitCheck: counterfeitEvaluation || { isCounterfeit: false, riskLevel: 'LOW', reason: 'Geen risico gedetecteerd.' },
    notes: !rangeMatch
      ? 'Productieperiode nog niet uit dit serienummer afgeleid. Vul het model van het typeplaatje in voor een completer resultaat.'
      : identityStatus === 'PROBABLE_MODEL_SERIES'
      ? `Serienummer valt binnen een bekende reeks en geeft een breakpoint-gebaseerde indicatie (${estimatedYears}). Exact model en uitvoering zijn nog niet definitief bevestigd.`
      : (rangeMatch ? `Serienummer valt binnen een bekende reeks en geeft een breakpoint-gebaseerde indicatie (${estimatedYears}).` : (factoryData.country ? `Serienummerformaat gevalideerd op fabriekscode ${factoryDigit} (${factoryData.country}).` : `Serienummerformaat gevalideerd op fabriekscode ${factoryDigit}.`)),
    stopHelingUrl,
    stopHelingTip: "Controleer bij aankoop van een gebruikte machine of het serienummer als gestolen staat geregistreerd."
  };
}

export function analyzePartNumber(partStr, database) {
  const familyCode = partStr.substring(0, 4);
  const familyIdentity = buildPartFamilyIdentity(familyCode, database);

  if (!familyIdentity.relatedModels.length && !database.part_family_prefixes?.[familyCode]) {
    return {
      success: false,
      status: 'NOT_FOUND',
      type: 'PART_NUMBER',
      input: partStr,
      error: `Onbekende STIHL onderdeelreeks (${familyCode}). Voeg een bekend model of onderdeelnummer toe.`
    };
  }

  return {
    success: true,
    type: 'PART_NUMBER',
    input: partStr,
    cleaned: partStr,
    formattedPartNo: formatPartNumber(partStr),
    familyCode,
    familyDetails: familyIdentity,
    isWarning: true,
    modelGroup: familyIdentity.modelGroup,
    matchedModel: null,
    category: familyIdentity.category,
    technicalSpecs: {},
    safeTechnicalPreview: { available: false, mode: 'PROBABLE_SERIES_PREVIEW', fields: [] },
    machineType: null,
    displacement: null,
    power: null,
    era: null,
    warning: `Dit is een 11-cijferig STIHL onderdeelnummer (Teilenummer). Het eerste gedeelte (${familyCode}) is een familiecode en geen exact modelbewijs.`,
    warningMessage: `Dit 11-cijferige nummer hoort bij een STIHL onderdeelreeks. Familiecode ${familyCode} kan meerdere verwante modellen omvatten en identificeert niet automatisch de exacte machine.`,
    advice: 'Zoek het unieke serienummer op het typeplaatje of carter om de complete machine apart te controleren.'
  };
}

function resolvePlantRecord(database, factoryDigit) {
  if (database.factories && database.factories[factoryDigit]) {
    return database.factories[factoryDigit];
  }

  if (Array.isArray(database.plants)) {
    return database.plants.find((plant) => plant.plant_code === factoryDigit) || null;
  }

  if (database.plants && database.plants[factoryDigit]) {
    return database.plants[factoryDigit];
  }

  return null;
}
