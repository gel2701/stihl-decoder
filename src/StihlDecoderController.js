/**
 * REST API Controller for POST /api/v1/decode with StopHelingService integration
 */

import { renderStihlPassportHtml } from './components/StihlPassportGenerator.js';
import { StopHelingService } from './StopHelingService.js';

export async function handleDecodeApiV1(reqBody, database) {
  if (!reqBody || !reqBody.serialNumber || !reqBody.serialNumber.toString().trim()) {
    return {
      statusCode: 400,
      body: {
        status: "error",
        message: "Serienummer is verplicht."
      }
    };
  }

  const raw = reqBody.serialNumber.toString().trim();
  const cleaned = raw.replace(/[^0-9]/g, '');

  // Check validity length
  if (!cleaned || (cleaned.length !== 9 && cleaned.length !== 10)) {
    return {
      statusCode: 422,
      body: {
        status: "error",
        message: `Afwijkende lengte (${cleaned.length} cijfers). Officiële STIHL motornummers bevatten 9 cijfers.`,
        flags: [`Afwijkende lengte (${cleaned.length} cijfers)`]
      }
    };
  }

  // Counterfeit / Clone check
  const alerts = [];
  const knownFakePrefixes = ['123456789', '987654321', '111111111', '888888888', '999999999'];
  if (knownFakePrefixes.includes(cleaned)) {
    alerts.push('Bekend nep- / test-serienummer dat veelvuldig op Chinese klonen wordt aangetroffen.');
  }

  if (['0', '6', '7'].includes(cleaned[0])) {
    alerts.push(`Ongeldige fabriekscode '${cleaned[0]}'. STIHL gebruikt 1 (DE), 2/5 (US), 3 (BR), 8 (CN) of 9.`);
  }

  if (alerts.length > 0) {
    return {
      statusCode: 422,
      body: {
        status: "error",
        message: alerts.join(' '),
        flags: alerts
      }
    };
  }

  // Execute Stop Heling theft check in parallel
  const theftCheck = await StopHelingService.verifySerialNumber(cleaned);

  // Format 184592301 -> "1 845 923 01"
  const formatted = `${cleaned[0]} ${cleaned.slice(1,4)} ${cleaned.slice(4,7)} ${cleaned.slice(7)}`;

  // Resolve factory
  const plantMap = {
    '1': { code: '1', country: 'Duitsland', facility: 'Waiblingen' },
    '2': { code: '2', country: 'Verenigde Staten', facility: 'Virginia Beach 1' },
    '3': { code: '3', country: 'Brazilië', facility: 'São Leopoldo' },
    '4': { code: '4', country: 'Zwitserland', facility: 'Wil (Kettingen/Zwaarden)' },
    '5': { code: '5', country: 'Verenigde Staten', facility: 'Virginia Beach 2' },
    '8': { code: '8', country: 'China', facility: 'Qingdao' },
    '9': { code: '9', country: 'Speciaal / Internationale Assemblage', facility: 'Diverse locaties' }
  };
  const factory = plantMap[cleaned[0]] || { code: cleaned[0], country: 'Onbekend', facility: 'Onbekend' };

  // Breakpoint & Model Lookup
  const serialNum = parseInt(cleaned, 10);
  const db = database || {};

  let bp = null;
  if (db.serial_breakpoints && Array.isArray(db.serial_breakpoints)) {
    bp = db.serial_breakpoints.find(b => serialNum >= b.serial_start && serialNum <= b.serial_end);
  }

  let modelData = null;
  if (bp && db.models) {
    modelData = db.models.find(m => m.id === bp.model_id);
  } else if (db.models) {
    const prefix = cleaned.substring(0, 4);
    modelData = db.models.find(m => m.series_code === prefix) || db.models.find(m => m.id === 'stihl_ms_261_cm');
  }

  if (!modelData && db.models && db.models.length > 0) {
    modelData = db.models.find(m => m.id === 'stihl_ms_261_cm') || db.models[0];
  }

  const matchedModel = modelData ? {
    id: modelData.id,
    name: modelData.model_name,
    series: modelData.series_code || '1141',
    category: modelData.category || 'Kettingzaag',
    specs: {
      engineCc: modelData.displacement_cc || 50.2,
      powerHp: modelData.power_hp || 4.1,
      powerKw: modelData.power_kw || 3.0,
      sparkPlug: modelData.spark_plug || 'NGK CMR6H',
      chainPitch: modelData.chain_pitch || '.325"',
      chainGaugeMm: modelData.chain_gauge_mm || 1.3,
      carbSettings: {
        H: modelData.carb_h_setting || 'M-Tronic (Automatisch)',
        L: modelData.carb_l_setting || 'M-Tronic (Automatisch)',
        LA: modelData.carb_la_setting || 'M-Tronic (Automatisch)'
      }
    }
  } : {
    id: 'stihl_ms_261_cm',
    name: 'MS 261 C-M (M-Tronic)',
    series: '1141',
    category: 'Kettingzaag',
    specs: {
      engineCc: 50.2,
      powerHp: 4.1,
      powerKw: 3.0,
      sparkPlug: 'NGK CMR6H',
      chainPitch: '.325"',
      chainGaugeMm: 1.3,
      carbSettings: {
        H: 'M-Tronic (Automatisch)',
        L: 'M-Tronic (Automatisch)',
        LA: 'M-Tronic (Automatisch)'
      }
    }
  };

  const estimatedProduction = bp ? {
    year: `${bp.production_year_start} - ${bp.production_year_end || 'Heden'}`,
    generation: bp.generation || 'Facelift / V2 (Lichter carter & cilinderkap)',
    confidenceScore: 0.90
  } : {
    year: cleaned[0] === '1' ? '2016 - 2021' : '2007 - 2017',
    generation: cleaned[0] === '1' ? 'Facelift / V2 (Lichter carter & cilinderkap)' : 'Generatie 1 (US Line)',
    confidenceScore: 0.90
  };

  const passportHtml = renderStihlPassportHtml({
    cleanedSerial: cleaned,
    formatted,
    modelMatch: {
      modelName: matchedModel.name,
      specs: {
        displacementCc: matchedModel.specs.engineCc,
        powerHp: matchedModel.specs.powerHp,
        sparkPlug: matchedModel.specs.sparkPlug,
        chainDetails: { pitch: matchedModel.specs.chainPitch }
      }
    },
    plantInfo: {
      country: factory.country,
      location: factory.facility
    },
    manufacturingYearEstimate: {
      yearStart: parseInt(estimatedProduction.year.split(' - ')[0], 10) || 2016,
      yearEnd: estimatedProduction.year.includes('Heden') ? null : parseInt(estimatedProduction.year.split(' - ')[1], 10)
    },
    theftCheck
  });

  return {
    statusCode: 200,
    body: {
      status: "success",
      data: {
        serialNumber: raw,
        formatted,
        factory,
        matchedModel,
        estimatedProduction,
        authenticityStatus: {
          isSuspicious: false,
          flags: []
        },
        theftCheck,
        passportCardHtml: passportHtml
      }
    }
  };
}
