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

  // STRICT RULE: If relationship exists, do NOT inherit matchedModelSpec from the successor/related model!
  let matchedModelSpec = null;
  if (!relationship) {
    matchedModelSpec = findModelInDatabase(modelStr, database.models || []);
  }

  const hasResolvedModel = Boolean(relationship || matchedModelSpec);
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

  const rawSpecs = matchedModelSpec ? { ...matchedModelSpec } : {};

  // Prefix-based category resolution (Defaults to UNKNOWN, NEVER to Kettingzaag)
  let category = 'UNKNOWN';
  if (relationship) {
    category = relationship.category;
  } else if (matchedModelSpec) {
    category = matchedModelSpec.category || matchedModelSpec.category_slug;
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

  const resolvedModelName = relationship ? relationship.model_name : (matchedModelSpec ? matchedModelSpec.model_name : norm.canonicalQuery);
  const sanitizedSpecs = sanitizeModelSpecifications(rawSpecs, category, resolvedModelName);

  const verification = matchedModelSpec ? getModelVerificationSummary(matchedModelSpec) : null;
  const sourceStatus = verification ? verification.dataStatus : 'PRIMARY_SOURCE_PENDING';
  const sourceStatusLabel = verification
    ? `Bronstatus: ${verification.badgeLabel}`
    : 'Bronstatus: Primaire bron ontbreekt';

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
    confidenceLabel: matchedModelSpec ? 'Direct Model Match' : 'Familie Overeenkomst',
    relationship: relationship ? {
      type: relationship.relationship_type,
      relatedModel: relationship.related_model_name,
      confidence: relationship.confidence || 'HIGH',
      specInheritance: relationship.spec_inheritance || false,
      notes: relationship.notes
    } : null,
    technicalSpecs: sanitizedSpecs
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
  const modelName = modelData ? modelData.model_name : (rangeMatch ? (rangeMatch.model_name || 'Onbekend Model') : 'Onbekend Model');
  const category = modelData ? (modelData.category || modelData.category_slug) : (rangeMatch ? 'STIHL Machine' : 'Onbekend');
  const rawSpecs = modelData ? { ...modelData } : {};
  const sanitizedSpecs = sanitizeModelSpecifications(rawSpecs, category, modelName);

  const estimatedYears = rangeMatch ? rangeMatch.yearRangeFormatted : (factoryDigit === '1' ? '2016 – Heden' : '2010 – Heden');
  const generation = rangeMatch ? rangeMatch.generation : (modelData ? `${modelData.model_name} (seriereferentie)` : 'Niet vastgesteld');

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  const verification = modelData ? getModelVerificationSummary(modelData) : null;
  const sourceStatus = verification ? verification.dataStatus : 'PRIMARY_SOURCE_PENDING';
  const sourceStatusLabel = verification
    ? `Bronstatus: ${verification.badgeLabel}`
    : 'Bronstatus: Primaire bron ontbreekt';

  return {
    success: true,
    status: 'FORMAT_VALIDATED',
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: modelName,
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
    confidenceLabel: rangeMatch ? 'Breakpoint-gebaseerde indicatie' : 'Fabriekscode-indicatie',
    sourceStatus,
    sourceStatusLabel,
    fuel_type: modelData ? getFuelTypeCode(modelData) : 'UNKNOWN',
    fuel_type_label: modelData ? getFuelDriveLabel(modelData) : 'Niet vastgesteld',
    hasPrimaryDoc: Boolean(verification && verification.hasPrimaryDocument),
    technicalSpecs: sanitizedSpecs,
    counterfeitCheck: counterfeitEvaluation || { isCounterfeit: false, riskLevel: 'LOW', reason: 'Geen risico gedetecteerd.' },
    notes: rangeMatch ? `Serienummer valt binnen een bekende reeks en geeft een breakpoint-gebaseerde indicatie (${estimatedYears}).` : `Serienummerformaat gevalideerd op fabriekscode ${factoryDigit} (${factoryData.country}).`,
    stopHelingUrl,
    stopHelingTip: "Als u deze machine tweedehands koopt, bent u wettelijk verplicht te controleren of het serienummer als gestolen staat geregistreerd."
  };
}

export function analyzePartNumber(partStr, database) {
  const familyCode = partStr.substring(0, 4);
  const familyInfo = database.part_family_prefixes ? database.part_family_prefixes[familyCode] : null;

  let matchedModelSpec = null;
  if (database.models && Array.isArray(database.models)) {
    matchedModelSpec = database.models.find(m => m.series_code === familyCode);
  }

  if (!matchedModelSpec && !familyInfo) {
    return {
      success: false,
      status: 'NOT_FOUND',
      type: 'PART_NUMBER',
      input: partStr,
      error: `Onbekende STIHL onderdeelreeks (${familyCode}). Voeg een bekend model of onderdeelnummer toe.`
    };
  }

  const category = matchedModelSpec ? (matchedModelSpec.category || matchedModelSpec.category_slug) : familyInfo.category;
  const modelName = matchedModelSpec ? matchedModelSpec.model_name : familyInfo.model;

  const sanitizedSpecs = matchedModelSpec ? sanitizeModelSpecifications(matchedModelSpec, category, modelName) : null;

  return {
    success: true,
    type: 'PART_NUMBER',
    input: partStr,
    familyCode,
    familyDetails: familyInfo || {
      model: modelName,
      category,
      note: `Gietnummer / Onderdeelnummer Serie ${familyCode}`
    },
    isWarning: true,
    modelGroup: matchedModelSpec ? matchedModelSpec.model_name : familyInfo.model,
    matchedModel: matchedModelSpec ? matchedModelSpec.model_name : null,
    technicalSpecs: sanitizedSpecs,
    warning: `Dit is een 11-cijferig STIHL onderdeelnummer (Teilenummer). Het eerste gedeelte (${familyCode}) is de serie-code.`
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
