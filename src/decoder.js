/**
 * STIHL Machine & Serienummer Decoding Engine
 * Parsing, validation, plant lookup, breakpoint matching, technical specs & counterfeit detection
 */

import { StihlRangeResolver } from './StihlRangeResolver.js';

export function cleanInput(rawInput) {
  if (!rawInput) return '';
  return rawInput.toString().replace(/[\s\-\._]/g, '').trim();
}

export function evaluateCounterfeitRules(rawInput, database) {
  const cleaned = cleanInput(rawInput);
  const rules = database.counterfeit_rules || [];

  for (const rule of rules) {
    try {
      const reg = new RegExp(rule.pattern_regex, 'i');
      if (reg.test(cleaned) || reg.test(rawInput)) {
        return {
          isCounterfeit: true,
          riskLevel: rule.risk_level,
          reason: rule.reason,
          affectedModels: rule.affected_models || null
        };
      }
    } catch (e) {
      // Regex safety fallback
    }
  }

  return {
    isCounterfeit: false,
    riskLevel: 'LOW',
    reason: 'Geen namaak- of kloon-indicatoren gedetecteerd.',
    affectedModels: null
  };
}

export function decodeStihlCode(rawInput, database) {
  const cleaned = cleanInput(rawInput);

  if (!cleaned) {
    return {
      success: false,
      error: 'Voer een 9-cijferig serienummer, 11-cijferig onderdeelnummer of Stihl modelnaam in.'
    };
  }

  const counterfeitEvaluation = evaluateCounterfeitRules(rawInput, database);
  if (counterfeitEvaluation.isCounterfeit && (counterfeitEvaluation.riskLevel === 'DEFINITIVE_FAKE' || counterfeitEvaluation.riskLevel === 'HIGH' || counterfeitEvaluation.riskLevel === 'SUSPECT_SERIAL')) {
    return {
      success: false,
      input: rawInput,
      cleaned,
      isCounterfeit: true,
      riskLevel: counterfeitEvaluation.riskLevel,
      error: counterfeitEvaluation.reason,
      advice: 'KOOP-WAARSCHUWING: Dit serienummer is als verdacht (ongeldig of kloon) aangemerkt.'
    };
  }

  // Check 1: Model Name decoding
  if (/^[A-Za-z]+\s*\d+/i.test(rawInput.trim())) {
    return analyzeModelName(rawInput.trim(), database);
  }

  // Check 2: 11-digit Part Number (Teilenummer) or 4-digit prefix match
  if (cleaned.length === 11 || (cleaned.length >= 4 && isKnownPartFamily(cleaned, database))) {
    return analyzePartNumber(cleaned, database);
  }

  // Check 3: 9-digit Serial Number (Serienummer)
  if (/^\d{9}$/.test(cleaned)) {
    return analyzeSerialNumber(cleaned, database, counterfeitEvaluation);
  }

  // Fallback / Guidance for unusual formats
  if (/^\d+$/.test(cleaned)) {
    if (cleaned.length < 9) {
      return {
        success: false,
        input: rawInput,
        cleaned,
        error: `Invoer bevat ${cleaned.length} cijfers. Een Stihl serienummer heeft exact 9 cijfers (bijv. 178456789) en een onderdeelnummer 11 cijfers (bijv. 11210210800).`
      };
    } else if (cleaned.length === 10) {
      return {
        success: false,
        input: rawInput,
        cleaned,
        error: 'Invoer bevat 10 cijfers. Controleer of u een 9-cijferig serienummer of 11-cijferig onderdeelnummer heeft ingevoerd.'
      };
    }
  }

  return {
    success: false,
    input: rawInput,
    cleaned,
    error: 'Onbekend formaat. Voer een 9-cijferig serienummer in, een 11-cijferig Stihl onderdeelnummer of een modelnaam (bijv. MS 261 C-M).'
  };
}

function isKnownPartFamily(cleaned, database) {
  const prefix = cleaned.substring(0, 4);
  return (database.part_family_prefixes && Boolean(database.part_family_prefixes[prefix])) ||
         (database.models && database.models.some(m => m.series_code === prefix));
}

export function analyzeModelName(modelStr, database) {
  const parts = modelStr.toUpperCase().split(/\s+/);
  const prefixCode = parts[0];
  
  const prefixMeaning = database.prefix_meanings ? database.prefix_meanings[prefixCode] : null;

  let matchedModelSpec = null;
  if (database.models && Array.isArray(database.models)) {
    const cleanModelInput = modelStr.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    matchedModelSpec = database.models.find(m => {
      const cleanDbName = m.model_name.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      return cleanDbName.includes(cleanModelInput) || cleanModelInput.includes(cleanDbName);
    });
  }

  return {
    success: true,
    type: 'MODEL_DECODE',
    input: modelStr,
    prefixCode,
    prefixMeaning: prefixMeaning || 'STIHL Machinetype Aanduiding',
    technicalSpecs: matchedModelSpec || {
      displacement_cc: 50.2,
      power_hp: 4.1,
      power_kw: 3.0,
      spark_plug: 'NGK CMR6H',
      electrode_gap_mm: 0.50,
      carb_h_setting: 'Elektronisch geregeld (M-Tronic)',
      carb_l_setting: 'Elektronisch geregeld (M-Tronic)',
      carb_la_setting: '2800 RPM',
      chain_pitch: '.325"',
      chain_gauge_mm: 1.3
    }
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
  if (database.models && Array.isArray(database.models)) {
    const prefix = serialStr.substring(0, 4);
    matchedModelSpec = database.models.find(m => m.series_code === prefix) || database.models.find(m => m.id === 'stihl_ms_261_cm') || database.models[0];
  }

  let familyInfo = null;
  const seriesCode = serialStr.substring(0, 4);
  if (seriesCode && database.part_family_prefixes) {
    familyInfo = database.part_family_prefixes[seriesCode];
  }

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  return {
    success: true,
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: factoryData,
    model: matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : "MS 261 C-M (M-Tronic)"),
    productionPeriod,
    estimatedYears: productionPeriod.yearRangeFormatted,
    generation: productionPeriod.generation,
    confidence: productionPeriod.confidence,
    technicalBulletinRef: null,
    familyCode: seriesCode,
    familyDetails: familyInfo || null,
    technicalSpecs: matchedModelSpec || {
      spark_plug: 'NGK CMR6H / Bosch USR7AC',
      electrode_gap_mm: 0.50,
      carb_h_setting: '1 slag open (Standaard)',
      carb_l_setting: '1 slag open (Standaard)',
      carb_la_setting: '2800 RPM stationair',
      chain_pitch: '.325" / 3/8"',
      chain_gauge_mm: 1.3,
      oil_mix_ratio: '1:50'
    },
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

  let formattedPartNo = partStr;
  if (partStr.length === 11) {
    formattedPartNo = `${partStr.substring(0, 4)} ${partStr.substring(4, 7)} ${partStr.substring(7, 11)}`;
  }

  return {
    success: true,
    type: 'PART_NUMBER',
    isWarning: true,
    input: partStr,
    cleaned: partStr,
    formattedPartNo,
    familyCode,
    modelGroup: matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : "STIHL Modelgroep " + familyCode),
    machineType: matchedModelSpec ? matchedModelSpec.category : (familyInfo ? familyInfo.type : "Gietstuk / Onderdeel"),
    displacement: matchedModelSpec ? `${matchedModelSpec.displacement_cc} cc` : (familyInfo ? familyInfo.displacement : null),
    power: matchedModelSpec ? `${matchedModelSpec.power_kw} kW (${matchedModelSpec.power_hp} pk)` : (familyInfo ? familyInfo.power : null),
    era: familyInfo ? familyInfo.era : "Productieserie",
    familyNotes: familyInfo ? familyInfo.notes : null,
    technicalSpecs: matchedModelSpec || null,
    warningMessage: `Dit is een onderdeelnummer (gietnummer/behuizing) voor modelgroep [${matchedModelSpec ? matchedModelSpec.model_name : (familyInfo ? familyInfo.model : familyCode)}] en géén uniek serienummer van de complete machine.`,
    advice: "Een uniek serienummer staat ingeslagen op het carter (bij de uitlaat of bij de geleideplaatmontage) of op de typesticker, en bestaat uit exact 9 cijfers."
  };
}
