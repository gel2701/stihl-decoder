export class StihlDecoderService {
  /**
   * Valideert en zuivert invoer (verwijdert spaties, streepjes en punten).
   */
  static sanitizeSerial(input) {
    if (!input) return '';
    return input.toString().replace(/[^0-9]/g, '');
  }

  /**
   * Bepaalt fabriek op basis van het 1e cijfer.
   */
  static resolvePlant(firstDigit) {
    const plantMap = {
      '1': { country: 'Duitsland', location: 'Waiblingen' },
      '2': { country: 'Verenigde Staten', location: 'Virginia Beach (Plant 1)' },
      '3': { country: 'Brazilië', location: 'São Leopoldo' },
      '4': { country: 'Zwitserland', location: 'Stihl Kettenwerk (Zaagkettingen/Delen)' },
      '5': { country: 'Verenigde Staten', location: 'Virginia Beach (Plant 2)' },
      '8': { country: 'China', location: 'Qingdao' },
      '9': { country: 'Speciaal / Internationale Assemblage', location: 'Diverse locaties' }
    };
    return plantMap[firstDigit] || null;
  }

  /**
   * Detecteert verdachte patronen of bekende kloonreeksen.
   */
  static evaluateCounterfeits(serial) {
    const alerts = [];
    
    // Check lengte (STIHL hanteert 9 cijfers; incidenteel 10 op recente barcode labels)
    if (serial.length !== 9 && serial.length !== 10) {
      alerts.push(`Afwijkende lengte (${serial.length} cijfers). Officiële STIHL motornummers bevatten 9 cijfers.`);
    }

    // Bekende sequenties van Chinese replica's (MS 070, MS 381, MS 660 imitaties)
    const knownFakePrefixes = ['123456789', '987654321', '111111111', '888888888', '999999999'];
    if (knownFakePrefixes.includes(serial)) {
      alerts.push('Dit serienummer komt voor in de database van bekende namaakmachines / imitatielabels.');
    }

    // Ongeldige fabriekscode (0, 6, 7 zijn niet standaard in gebruik)
    if (['0', '6', '7'].includes(serial[0])) {
      alerts.push(`Ongeldige fabriekscode '${serial[0]}'. STIHL gebruikt 1 (DE), 2/5 (US), 3 (BR), 8 (CN) of 9.`);
    }

    return alerts;
  }

  /**
   * Hoofd-decodeermethode
   */
  static decode(input, database) {
    const rawInput = input ? input.trim() : '';
    const cleanedSerial = this.sanitizeSerial(rawInput);
    const warnings = [];
    const counterfeitAlerts = this.evaluateCounterfeits(cleanedSerial);
    
    const firstDigit = cleanedSerial.charAt(0);
    const plant = this.resolvePlant(firstDigit);
    
    const plantInfo = plant ? {
      code: firstDigit,
      country: plant.country,
      location: plant.location
    } : undefined;

    const isValidFormat = (cleanedSerial.length === 9 || cleanedSerial.length === 10) && counterfeitAlerts.length === 0;

    let modelMatch = undefined;
    let manufacturingYearEstimate = undefined;

    const db = database || {};
    const serialNum = parseInt(cleanedSerial, 10);

    let bp = null;
    if (db.serial_breakpoints && Array.isArray(db.serial_breakpoints)) {
      bp = db.serial_breakpoints.find(b => serialNum >= b.serial_start && serialNum <= b.serial_end);
    }

    let modelData = null;
    if (bp && db.models) {
      modelData = db.models.find(m => m.id === bp.model_id);
    } else if (db.models) {
      const prefix = cleanedSerial.substring(0, 4);
      modelData = db.models.find(m => m.series_code === prefix);
    }

    if (modelData) {
      modelMatch = {
        modelId: modelData.id,
        modelName: modelData.model_name,
        category: modelData.category,
        specs: {
          displacementCc: modelData.displacement_cc || null,
          powerHp: modelData.power_hp || null,
          powerKw: modelData.power_kw || null,
          sparkPlug: modelData.spark_plug || null,
          carbSettings: {
            H: modelData.carb_h_setting || '1 slag open',
            L: modelData.carb_l_setting || '1 slag open',
            LA: modelData.carb_la_setting || '2800 RPM'
          },
          chainDetails: modelData.chain_pitch ? {
            pitch: modelData.chain_pitch,
            gauge: modelData.chain_gauge_mm || 1.3
          } : null
        }
      };
    }

    if (bp) {
      manufacturingYearEstimate = {
        yearStart: bp.production_year_start,
        yearEnd: bp.production_year_end || null,
        generation: bp.generation || null,
        confidence: 'HIGH'
      };
    } else if (firstDigit === '1') {
      manufacturingYearEstimate = {
        yearStart: 2010,
        yearEnd: 2022,
        generation: 'Duitse Reeks',
        confidence: 'MEDIUM'
      };
    } else {
      manufacturingYearEstimate = {
        yearStart: 2005,
        yearEnd: null,
        generation: 'Internationale Reeks',
        confidence: 'ESTIMATED'
      };
    }

    if (cleanedSerial.length === 11) {
      warnings.push('Onderdeelnummer (11 cijfers) gedetecteerd. Dit is een gietnummer en geen uniek serienummer.');
    }

    return {
      rawInput,
      cleanedSerial,
      isValidFormat,
      plantInfo,
      modelMatch,
      manufacturingYearEstimate,
      warnings,
      counterfeitAlerts
    };
  }
}
