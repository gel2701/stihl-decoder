/**
 * Stihl Machine & Serienummer Decoder Logic
 */

export function cleanInput(rawInput) {
  if (!rawInput) return '';
  // Strip spaces, dashes, dots, underscores
  return rawInput.toString().replace(/[\s\-\._]/g, '').trim();
}

export function decodeStihlCode(rawInput, database) {
  const cleaned = cleanInput(rawInput);

  if (!cleaned) {
    return {
      success: false,
      error: 'Voer een serienummer (9 cijfers) of onderdeelnummer (11 cijfers) in.'
    };
  }

  // Check 1: 11-digit Part Number (Teilenummer) or 4-digit prefix match
  if (cleaned.length === 11 || (cleaned.length >= 4 && isKnownPartFamily(cleaned, database))) {
    return analyzePartNumber(cleaned, database);
  }

  // Check 2: 9-digit Serial Number (Seriennummer)
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
    error: 'Onbekend formaat. Voer een 9-cijferig serienummer in of een 11-cijferig Stihl onderdeelnummer.'
  };
}

function isKnownPartFamily(cleaned, database) {
  const prefix = cleaned.substring(0, 4);
  return database.part_family_prefixes && Boolean(database.part_family_prefixes[prefix]);
}

export function analyzeSerialNumber(serialStr, database) {
  const serialNum = parseInt(serialStr, 10);
  const factoryDigit = serialStr.charAt(0);
  const factoryInfo = database.factories[factoryDigit] || {
    country: "Onbekend / Speciaal",
    location: "Onbekende assemblagelocatie",
    details: "De eerste digit komt niet overeen met standaard Stihl fabriekscodes."
  };

  // Search range match in serial_ranges
  let rangeMatch = null;
  if (database.serial_ranges && Array.isArray(database.serial_ranges)) {
    rangeMatch = database.serial_ranges.find(r => serialNum >= r.serial_start && serialNum <= r.serial_end);
  }

  // Fallback: family prefix estimation if range match not explicit
  let familyInfo = null;
  let confidence = "Schatting (Generiek)";
  
  if (rangeMatch) {
    confidence = rangeMatch.confidence || "Exact";
    if (rangeMatch.family_code && database.part_family_prefixes[rangeMatch.family_code]) {
      familyInfo = database.part_family_prefixes[rangeMatch.family_code];
    }
  }

  // Year estimation logic based on 9-digit series progression if no exact range match
  let estimatedYears = null;
  if (rangeMatch) {
    estimatedYears = `${rangeMatch.year_start} - ${rangeMatch.year_end}`;
  } else {
    estimatedYears = estimateYearBySerial(serialNum, factoryDigit);
  }

  // Official Dutch Police Stop Heling register query link
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
    stopHelingTip: "Als u deze machine tweedehands koopt (bijv. Marktplaats), bent u wettelijk verplicht te controleren of het serienummer als gestolen staat geregistreerd."
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
  if (factoryDigit === '1') { // Germany
    if (serialNum < 120000000) return "Vóór 1988 (Klassieke 0-serie)";
    if (serialNum < 140000000) return "Ca. 1988 - 1996";
    if (serialNum < 160000000) return "Ca. 1997 - 2004";
    if (serialNum < 180000000) return "Ca. 2005 - 2015";
    if (serialNum < 195000000) return "Ca. 2016 - 2022";
    return "Ca. 2023 - Heden";
  } else if (factoryDigit === '2') { // USA
    if (serialNum < 230000000) return "Ca. 1990 - 2000";
    if (serialNum < 270000000) return "Ca. 2001 - 2012";
    return "Ca. 2013 - Heden";
  } else if (factoryDigit === '8') { // China Qingdao
    return "Ca. 2012 - Heden";
  }
  return "Bouwperiode inschatting gebaseerd op reeksverloop";
}
