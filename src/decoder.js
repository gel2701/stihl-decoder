/**
 * Core STIHL Code & Serial Number Decoder Engine for STIHLDecoder.nl
 * Phase 33 Category Specification Whitelist & Leak Prevention
 */

import { sanitizeModelSpecifications, normalizeCategorySlug } from './categoryWhitelist.js';
import { normalizeModelQuery, findModelInDatabase } from './modelNormalizer.js';
import { resolveModelRelationship } from './modelRelationships.js';

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
      error: `Invoer bevat ${cleaned.length} cijfers. Een STIHL serienummer bestaat uit 9 cijfers.`
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

  return {
    success: true,
    type: 'MODEL_DECODE',
    input: modelStr,
    prefixCode,
    prefixMeaning: prefixMeaning || 'STIHL Machinetype Aanduiding',
    category,
    model: resolvedModelName,
    seriesCode: relationship ? relationship.series_code : (matchedModelSpec ? matchedModelSpec.series_code : null),
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
    country: 'Onbekend',
    location: 'Onbekend',
    details: 'Geen onderbouwde fabrieksmapping beschikbaar'
  };

  const prefix = serialStr.substring(0, 4);
  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  return {
    success: true,
    status: 'FORMAT_VALIDATED',
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: 'UNKNOWN',
    category: 'UNKNOWN',
    productionPeriod: null,
    estimatedYears: 'UNKNOWN',
    generation: 'UNKNOWN',
    confidence: 'UNKNOWN',
    technicalBulletinRef: null,
    familyCode: prefix,
    familyDetails: null,
    technicalSpecs: {},
    counterfeitCheck: counterfeitEvaluation || { isCounterfeit: false, riskLevel: 'LOW', reason: 'Geen risico gedetecteerd.' },
    notes: `9-cijferig serienummerformaat gevalideerd. Model, bouwjaar en uitvoering zijn niet betrouwbaar afleidbaar uit alleen dit serienummer.`,
    castingClockTip: "Lees model en bouwinformatie af van het typeplaatje of de gietklok; deze site leidt geen exact bouwjaar af uit alleen het serienummer.",
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
      error: `Onbekende STIHL onderdeelreeks (${familyCode}). Voeg een bevestigd model of officieel onderdeelnummer toe.`
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
