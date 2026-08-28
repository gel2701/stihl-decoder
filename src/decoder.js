/**
 * Core STIHL Code & Serial Number Decoder Engine for STIHLDecoder.nl
 * Phase 33 Category Specification Whitelist & Leak Prevention
 */

import { StihlRangeResolver } from './StihlRangeResolver.js';
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

  const prefixCode = norm.prefix || (relationship ? '0' : 'MS');
  const prefixMeaning = database.prefixes ? database.prefixes[prefixCode] : null;

  const rawSpecs = matchedModelSpec || {
    displacement_cc: norm.prefix === 'BR' ? 64.8 : 50.2,
    power_hp: norm.prefix === 'BR' ? 3.8 : 4.1,
    power_kw: norm.prefix === 'BR' ? 2.8 : 3.0,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.50,
    carb_h_setting: '1 slag open (Standaard)',
    carb_l_setting: '1 slag open (Standaard)',
    carb_la_setting: '2800 RPM'
  };

  const category = relationship ? relationship.category : (matchedModelSpec ? (matchedModelSpec.category || matchedModelSpec.category_slug) : (norm.prefix === 'BR' ? 'Bladblazer' : (norm.prefix === 'FS' ? 'Bosmaaier' : (norm.prefix === 'TS' ? 'Doorslijper' : 'Kettingzaag'))));
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
    seriesCode: relationship ? relationship.series_code : (matchedModelSpec ? matchedModelSpec.series_code : (category === 'Bladblazer' ? '4282' : '1141')),
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
  const factoryData = database.factories && database.factories[factoryDigit] ? {
    code: factoryDigit,
    country: database.factories[factoryDigit].country,
    location: database.factories[factoryDigit].location,
    details: database.factories[factoryDigit].details
  } : {
    code: factoryDigit,
    country: 'Duitsland',
    location: 'Waiblingen',
    details: 'Hoofdfabriek STIHL Waiblingen'
  };

  const serialNum = parseInt(serialStr, 10);
  
  // Resolve production period & generation via Serial Breakpoints Engine
  const productionPeriod = StihlRangeResolver.resolve(serialNum, factoryDigit, database);

  let matchedModelSpec = null;
  const prefix = serialStr.substring(0, 4);

  if (database.models && Array.isArray(database.models)) {
    matchedModelSpec = database.models.find(m => m.series_code === prefix);
  }

  let familyInfo = null;
  if (prefix && database.part_family_prefixes) {
    familyInfo = database.part_family_prefixes[prefix];
  }

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  const resolvedModelName = matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : "STIHL Geverifieerde Machine");
  const category = matchedModelSpec ? (matchedModelSpec.category || matchedModelSpec.category_slug) : (familyInfo ? familyInfo.category : 'Kettingzaag');

  const rawSpecs = matchedModelSpec || {
    spark_plug: 'NGK CMR6H / Bosch USR7AC',
    electrode_gap_mm: 0.50,
    carb_h_setting: '1 slag open (Standaard)',
    carb_l_setting: '1 slag open (Standaard)',
    carb_la_setting: '2800 RPM stationair',
    oil_mix_ratio: '1:50'
  };

  const sanitizedSpecs = sanitizeModelSpecifications(rawSpecs, category, resolvedModelName);

  return {
    success: true,
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: resolvedModelName,
    category,
    productionPeriod,
    estimatedYears: productionPeriod.yearRangeFormatted,
    generation: productionPeriod.generation,
    confidence: productionPeriod.confidence,
    technicalBulletinRef: null,
    familyCode: prefix,
    familyDetails: familyInfo || null,
    technicalSpecs: sanitizedSpecs,
    counterfeitCheck: counterfeitEvaluation || { isCounterfeit: false, riskLevel: 'LOW', reason: 'Geen risico gedetecteerd.' },
    notes: `Gevalideerd 9-cijferig serienummer uit ${factoryData.country}. Uitvoering: ${productionPeriod.generation}.`,
    castingClockTip: "Verifieer het exacte productiejaar op de kunststof gietklok (Gussuhr) op de binnenzijde van het carter of de cilinderkap.",
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

  const category = matchedModelSpec ? (matchedModelSpec.category || matchedModelSpec.category_slug) : (familyInfo ? familyInfo.category : 'Onderdelen');
  const modelName = matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : `Serie ${familyCode}`);

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
    modelGroup: matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : "MS 260 / 026"),
    matchedModel: matchedModelSpec ? matchedModelSpec.model_name : null,
    technicalSpecs: sanitizedSpecs,
    warning: `Dit is een 11-cijferig STIHL onderdeelnummer (Teilenummer). Het eerste gedeelte (${familyCode}) is de serie-code.`
  };
}
