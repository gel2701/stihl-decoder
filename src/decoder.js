/**
 * Stihl Machine & Serienummer Decoder Logic
 */

export function cleanInput(rawInput) {
  if (!rawInput) return '';
  return rawInput.toString().replace(/[\s\-\._]/g, '').trim();
}

export function decodeStihlCode(rawInput, database) {
  const cleaned = cleanInput(rawInput);

  if (!cleaned) {
    return {
      success: false,
      error: 'Voer een serienummer (9 cijfers), onderdeelnummer (11 cijfers) of Stihl modelnaam in.'
    };
  }

  // Check 1: Model Name decoding (e.g. "MS 261 C-M", "FS 130 R", "HS 82 R")
  if (/^[A-Za-z]+\s*\d+/i.test(rawInput.trim())) {
    return analyzeModelName(rawInput.trim(), database);
  }

  // Check 2: 11-digit Part Number (Teilenummer) or 4-digit prefix match
  if (cleaned.length === 11 || (cleaned.length >= 4 && isKnownPartFamily(cleaned, database))) {
    return analyzePartNumber(cleaned, database);
  }

  // Check 3: 9-digit Serial Number (Seriennummer)
  if (/^\d{9}$/.test(cleaned)) {
    return analyzeSerialNumber(cleaned, database);
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
  return database.part_family_prefixes && Boolean(database.part_family_prefixes[prefix]);
}

export function analyzeModelName(modelStr, database) {
  const parts = modelStr.toUpperCase().split(/\s+/);
  const prefixCode = parts[0];
  
  const prefixMeaning = database.prefix_meanings ? database.prefix_meanings[prefixCode] : null;
  const decodedSuffixes = [];

  // Extract letters after numbers
  const match = modelStr.match(/^[A-Za-z]+\s*\d+[\s\-]*(.*)$/);
  if (match && match[1]) {
    const suffixPart = match[1].replace(/[\s\-]/g, '');
    for (let char of suffixPart) {
      if (database.model_suffixes && database.model_suffixes[char]) {
        decodedSuffixes.push({
          letter: char,
          meaning: database.model_suffixes[char]
        });
      }
    }
  }

  return {
    success: true,
    type: 'MODEL_DECODE',
    input: modelStr,
    prefixCode,
    prefixMeaning: prefixMeaning || "Stihl machinetype aanduiding",
    suffixes: decodedSuffixes,
    notes: `Modelaanduiding ${modelStr} geanalyseerd.`
  };
}

export function analyzeSerialNumber(serialStr, database) {
  const serialNum = parseInt(serialStr, 10);
  const factoryDigit = serialStr.charAt(0);
  const factoryInfo = database.factories[factoryDigit] || {
    country: "Onbekend / Speciaal",
    location: "Onbekende assemblagelocatie",
    details: "De eerste digit komt niet overeen met standaard Stihl fabriekscodes."
  };

  let rangeMatch = null;
  if (database.serial_ranges && Array.isArray(database.serial_ranges)) {
    rangeMatch = database.serial_ranges.find(r => serialNum >= r.serial_start && serialNum <= r.serial_end);
  }

  let familyInfo = null;
  let confidence = "Schatting (Generiek)";
  
  if (rangeMatch) {
    confidence = rangeMatch.confidence || "Exact";
    if (rangeMatch.family_code && database.part_family_prefixes[rangeMatch.family_code]) {
      familyInfo = database.part_family_prefixes[rangeMatch.family_code];
    }
  }

  let estimatedYears = null;
  if (rangeMatch) {
    estimatedYears = `${rangeMatch.year_start} - ${rangeMatch.year_end}`;
  } else {
    estimatedYears = estimateYearBySerial(serialNum, factoryDigit);
  }

  const stopHelingUrl = `https://www.stopheling.nl/nl/zoeken?q=${encodeURIComponent(serialStr)}`;

  return {
    success: true,
    type: 'SERIAL_NUMBER',
    input: serialStr,
    cleaned: serialStr,
    factory: {
      digit: factoryDigit,
      country: factoryInfo.country,
      location: factoryInfo.location,
      details: factoryInfo.details
    },
    model: rangeMatch ? rangeMatch.model : (familyInfo ? familyInfo.model : "Model niet in specifieke reeksindex"),
    familyCode: rangeMatch ? rangeMatch.family_code : null,
    familyDetails: familyInfo || null,
    estimatedYears,
    confidence,
    rangeMatch,
    notes: rangeMatch ? rangeMatch.notes : `Gevalideerd 9-cijferig serienummer. Productieland: ${factoryInfo.country}.`,
    castingClockTip: "Verifieer het exacte productiejaar op de kunststof gietklok (Gussuhr) op de binnenzijde van het carter of de cilinderkap.",
    stopHelingUrl,
    stopHelingTip: "Als u deze machine tweedehands koopt, bent u wettelijk verplicht te controleren of het serienummer als gestolen staat geregistreerd."
  };
}

export function analyzePartNumber(partStr, database) {
  const familyCode = partStr.substring(0, 4);
  const familyInfo = database.part_family_prefixes[familyCode];

  let formattedPartNo = partStr;
  if (partStr.length === 11) {
    formattedPartNo = `${partStr.substring(0, 4)} ${partStr.substring(4, 7)} ${partStr.substring(7, 11)}`;
  }

  if (familyInfo) {
    return {
      success: true,
      type: 'PART_NUMBER',
      isWarning: true,
      input: partStr,
      cleaned: partStr,
      formattedPartNo,
      familyCode,
      modelGroup: familyInfo.model,
      machineType: familyInfo.type,
      displacement: familyInfo.displacement,
      power: familyInfo.power,
      era: familyInfo.era,
      familyNotes: familyInfo.notes,
      warningMessage: `Dit is een onderdeelnummer (gietnummer/behuizing) voor modelgroep [${familyInfo.model}] en géén uniek serienummer van de complete machine.`,
      advice: "Een uniek serienummer staat ingeslagen op het carter (bij de uitlaat of bij de geleideplaatmontage) of op de typesticker, en bestaat uit exact 9 cijfers."
    };
  }

  return {
    success: true,
    type: 'PART_NUMBER',
    isWarning: true,
    input: partStr,
    cleaned: partStr,
    formattedPartNo,
    familyCode,
    modelGroup: "Onbekende Stihl Modelgroep",
    warningMessage: `Dit is een Stihl onderdeelnummer (code prefix ${familyCode}) en géén uniek serienummer van de complete machine.`,
    advice: "Het unieke serienummer van de machine bestaat uit 9 cijfers."
  };
}

function estimateYearBySerial(serialNum, factoryDigit) {
  if (factoryDigit === '1') {
    if (serialNum < 120000000) return "Vóór 1988 (Klassieke 0-serie)";
    if (serialNum < 140000000) return "Ca. 1988 - 1996";
    if (serialNum < 160000000) return "Ca. 1997 - 2004";
    if (serialNum < 180000000) return "Ca. 2005 - 2015";
    if (serialNum < 195000000) return "Ca. 2016 - 2022";
    return "Ca. 2023 - Heden";
  } else if (factoryDigit === '2') {
    if (serialNum < 230000000) return "Ca. 1990 - 2000";
    if (serialNum < 270000000) return "Ca. 2001 - 2012";
    return "Ca. 2013 - Heden";
  } else if (factoryDigit === '8') {
    return "Ca. 2012 - Heden";
  }
  return "Bouwperiode inschatting gebaseerd op reeksverloop";
}
