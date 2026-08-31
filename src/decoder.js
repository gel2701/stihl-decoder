/**
 * Core STIHL Code & Serial Number Decoder Engine for STIHLDecoder.nl
 * Phase 33 Category Specification Whitelist & Leak Prevention
 */

import { sanitizeModelSpecifications, normalizeCategorySlug } from './categoryWhitelist.js';
import { normalizeModelQuery, findModelInDatabase } from './modelNormalizer.js';
import { resolveModelRelationship } from './modelRelationships.js';
import { StihlRangeResolver } from './StihlRangeResolver.js';
import { getModelVerificationSummary } from './canonicalData.js';
import { getFuelDriveLabel, getFuelTypeCode } from './publicationRules.js';
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

function stripUnsafeTechnicalFallbacks(specs = {}) {
  const clean = { ...specs };
  const blockedFields = new Set([
    ...TECHNICAL_PUBLIC_FIELDS,
    'power_hp',
    'carb_h_setting',
    'carb_l_setting',
    'carb_la_setting',
    'chain_pitch',
    'chain_gauge_mm',
    'oil_mix_ratio'
  ]);
  for (const field of blockedFields) {
    delete clean[field];
  }
  return clean;
}

function isExactModelMatch(inputQuery, model) {
  if (!model) return false;
  const normalized = normalizeModelQuery(inputQuery);
  const cleanCanonical = String(normalized.canonicalQuery || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanBase = String(normalized.baseModel || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const modelName = String(model.model_name || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const modelSlug = String(model.slug || model.id || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
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

export function decodeStihlCode(inputStr, database = {}) {
  if (!inputStr || typeof inputStr !== 'string') {
    return { success: false, error: 'Ongeldige invoer.' };
  }

  const cleaned = inputStr.replace(/[^A-Za-z0-9]/g, '').trim();

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
    if (cleaned.length === 9) {
      return analyzeSerialNumber(cleaned, database, counterfeitEvaluation);
    }
    if (cleaned.length === 11) {
      return analyzePartNumber(cleaned, database);
    }
    const rel = resolveModelRelationship(inputStr);
    if (rel) {
      return analyzeModelQuery(inputStr.trim(), database);
    }
    return {
      success: false,
      error: `Invoer bevat ${cleaned.length} cijfers. Veel STIHL machines gebruiken een 9-cijferige reeks, maar controleer altijd het typeplaatje en de context van de machine.`
    };
  }

  return analyzeModelQuery(inputStr.trim(), database);
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
  const rawSpecs = matchedModelSpec ? stripUnsafeTechnicalFallbacks({ ...matchedModelSpec }) : {};

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
  const sanitizedSpecs = sanitizeModelSpecifications(rawSpecs, category, resolvedModelName);

  const verification = matchedModelSpec ? getModelVerificationSummary(matchedModelSpec) : null;
  const publicSourceSummary = overlayModelKey ? buildPublicSourceSummary(overlayModelKey, database) : null;
  const sourceStatus = publicSourceSummary?.primaryStatus || (verification ? verification.dataStatus : 'PRIMARY_SOURCE_PENDING');
  const sourceStatusLabel = publicSourceSummary?.display_fact_count
    ? `Bronstatus: ${publicSourceSummary.summaryLabel}`
    : verification
      ? `Bronstatus: ${verification.badgeLabel}`
      : 'Bronstatus: Nog niet betrouwbaar gedocumenteerd';
  const modelResolution = matchedModelSpec
    ? 'EXACT_CANONICAL'
    : overlayModelKey
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
    fuel_type: matchedModelSpec ? getFuelTypeCode(matchedModelSpec) : 'UNKNOWN',
    fuel_type_label: matchedModelSpec ? getFuelDriveLabel(matchedModelSpec) : 'Niet vastgesteld',
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
    technicalSpecs: overlaySpecs.publicFacts.length > 0
      ? overlaySpecs.technicalSpecs
      : sanitizedSpecs
  };
}

export function analyzeSerialNumber(serialStr, database, counterfeitEvaluation) {
  const factoryDigit = serialStr.charAt(0);
  const plantRecord = resolvePlantRecord(database, factoryDigit);
  const factoryData = plantRecord ? {
    code: factoryDigit,
    country: plantRecord.country || plantRecord.country_name,
    location: plantRecord.location || plantRecord.facility || plantRecord.plant_location,
    details: plantRecord.details || plantRecord.type || plantRecord.notes
  } : {
    code: factoryDigit,
    country: factoryDigit === '1' ? 'Duitsland' : (factoryDigit === '2' || factoryDigit === '5' ? 'Verenigde Staten' : (factoryDigit === '3' ? 'Brazilië' : (factoryDigit === '4' ? 'Zwitserland' : (factoryDigit === '8' ? 'China' : 'Speciaal')))),
    location: factoryDigit === '1' ? 'Waiblingen' : (factoryDigit === '2' || factoryDigit === '5' ? 'Virginia Beach' : (factoryDigit === '3' ? 'São Leopoldo' : (factoryDigit === '4' ? 'Wil' : (factoryDigit === '8' ? 'Qingdao' : 'Internationale Assemblage')))),
    details: 'STIHL Fabriekslocatie'
  };

  const numericSerial = parseInt(serialStr, 10);
  const rangeMatch = StihlRangeResolver.resolve(numericSerial, factoryDigit, database);

  let modelData = null;
  if (rangeMatch && rangeMatch.model_id && database.models) {
    modelData = database.models.find(m => m.id === rangeMatch.model_id);
  }
  if (!modelData && database.models) {
    const prefix = serialStr.substring(0, 4);
    modelData = database.models.find(m => m.series_code === prefix);
  }
  const probableModelSeries = rangeMatch ? (rangeMatch.model_name || rangeMatch.generation || null) : null;
  const identityStatus = modelData
    ? 'EXACT_MODEL_IDENTIFIED'
    : probableModelSeries
      ? 'PROBABLE_MODEL_SERIES'
      : 'MODEL_NOT_IDENTIFIED';
  const modelName = modelData
    ? modelData.model_name
    : (probableModelSeries || 'Nog niet definitief bevestigd');
  const category = modelData ? (modelData.category || modelData.category_slug) : (rangeMatch ? 'STIHL Machine' : 'Onbekend');
  const overlayModelKey = modelData ? (modelData.slug || modelData.model_name) : null;
  const overlaySpecs = overlayModelKey
    ? buildDisplayTechnicalSpecs(overlayModelKey, database, category, modelName)
    : { technicalSpecs: {}, publicFacts: [], publicEvidenceFields: {} };
  const rawSpecs = modelData ? stripUnsafeTechnicalFallbacks({ ...modelData }) : {};
  const sanitizedSpecs = sanitizeModelSpecifications(rawSpecs, category, modelName);

  const estimatedYears = rangeMatch ? rangeMatch.yearRangeFormatted : (factoryDigit === '1' ? 'vanaf circa 2016' : 'vanaf circa 2010');
  const generation = rangeMatch ? rangeMatch.generation : (modelData ? `${modelData.model_name} (seriereferentie)` : 'Niet vastgesteld');

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  const verification = modelData ? getModelVerificationSummary(modelData) : null;
  const publicSourceSummary = overlayModelKey ? buildPublicSourceSummary(overlayModelKey, database) : null;
  const sourceStatus = identityStatus === 'EXACT_MODEL_IDENTIFIED' && publicSourceSummary?.display_fact_count
    ? publicSourceSummary.primaryStatus
    : verification
      ? verification.dataStatus
      : 'PRIMARY_SOURCE_PENDING';
  const sourceStatusLabel = identityStatus === 'EXACT_MODEL_IDENTIFIED' && publicSourceSummary?.display_fact_count
    ? `Bronstatus: ${publicSourceSummary.summaryLabel}`
    : verification
      ? `Bronstatus: ${verification.badgeLabel}`
      : 'Bronstatus: Nog niet betrouwbaar gedocumenteerd';

  return {
    success: true,
    status: 'FORMAT_VALIDATED',
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: modelName,
    exactModel: modelData ? modelData.model_name : null,
    probableModelSeries,
    modelIdentityStatus: identityStatus,
    identityLabel: identityStatus === 'EXACT_MODEL_IDENTIFIED'
      ? 'Geïdentificeerd model'
      : identityStatus === 'PROBABLE_MODEL_SERIES'
        ? 'Waarschijnlijke modelreeks'
        : 'Modelidentificatie',
    category,
    productionPeriod: rangeMatch || {
      yearRangeFormatted: estimatedYears,
      generation,
      confidence: 'MEDIUM',
      technicalHighlights: modelData ? `Bekende STIHL ${modelName} fabrieksserie op basis van serienummerbereik.` : 'Serie-identificatie op basis van bekende fabrieksbreakpoints.'
    },
    estimatedYears,
    generation,
    confidence: rangeMatch ? (rangeMatch.confidence || 'MEDIUM') : 'LOW',
    confidenceLabel: identityStatus === 'EXACT_MODEL_IDENTIFIED'
      ? 'Exact model geïdentificeerd'
      : (rangeMatch ? 'Breakpoint-gebaseerde indicatie' : 'Fabriekscode-indicatie'),
    sourceStatus,
    sourceStatusLabel,
    fuel_type: modelData ? getFuelTypeCode(modelData) : 'UNKNOWN',
    fuel_type_label: modelData ? getFuelDriveLabel(modelData) : 'Niet vastgesteld',
    hasPrimaryDoc: Boolean(verification && verification.hasPrimaryDocument),
    publicEvidenceSummary: identityStatus === 'EXACT_MODEL_IDENTIFIED' ? publicSourceSummary : null,
    publicEvidenceFields: identityStatus === 'EXACT_MODEL_IDENTIFIED' ? overlaySpecs.publicEvidenceFields : {},
    publicEvidenceFacts: identityStatus === 'EXACT_MODEL_IDENTIFIED' ? overlaySpecs.publicFacts : [],
    technicalSpecs: identityStatus === 'EXACT_MODEL_IDENTIFIED'
      ? overlaySpecs.technicalSpecs
      : {},
    counterfeitCheck: counterfeitEvaluation || { isCounterfeit: false, riskLevel: 'LOW', reason: 'Geen risico gedetecteerd.' },
    notes: identityStatus === 'PROBABLE_MODEL_SERIES'
      ? `Serienummer valt binnen een bekende reeks en geeft een breakpoint-gebaseerde indicatie (${estimatedYears}). Exact model en uitvoering zijn nog niet definitief bevestigd.`
      : (rangeMatch ? `Serienummer valt binnen een bekende reeks en geeft een breakpoint-gebaseerde indicatie (${estimatedYears}).` : `Serienummerformaat gevalideerd op fabriekscode ${factoryDigit} (${factoryData.country}).`),
    stopHelingUrl,
    stopHelingTip: "Als u deze machine tweedehands koopt, bent u wettelijk verplicht te controleren of het serienummer als gestolen staat geregistreerd."
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
