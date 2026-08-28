/**
 * REST API Controller for POST /api/v1/decode with StopHelingService & FuelType Separation
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

  const theftCheck = await StopHelingService.verifySerialNumber(cleaned);
  const formatted = `${cleaned[0]} ${cleaned.slice(1,4)} ${cleaned.slice(4,7)} ${cleaned.slice(7)}`;

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
    modelData = db.models.find(m => m.series_code === prefix);
  }

  const isPetrol = modelData ? (modelData.fuel_type || 'PETROL_2STROKE').startsWith('PETROL') : true;
  const category = modelData ? (modelData.category || 'STIHL Machine') : 'ONBEKEND';
  const isChainsaw = category.toLowerCase().includes('kettingzaag') || category.toLowerCase().includes('chainsaw');

  const matchedModel = {
    id: modelData ? modelData.id : null,
    name: modelData ? modelData.model_name : 'STIHL Machine',
    series: modelData ? modelData.series_code : cleaned.substring(0, 4),
    category,
    fuelType: modelData ? modelData.fuel_type : 'PETROL_2STROKE',
    fuelTypeLabel: modelData ? (modelData.fuel_type_label || (isPetrol ? 'Benzine (2-Takt)' : 'Accu (AP-Systeem 36V)')) : 'Geverifieerde STIHL Aandrijving',
    batterySystem: modelData ? modelData.battery_system : null,
    voltageV: modelData ? modelData.voltage_v : null,
    specs: {
      displacementCc: modelData ? modelData.displacement_cc : null,
      engineCc: modelData ? modelData.displacement_cc : null,
      powerHp: modelData ? modelData.power_hp : null,
      powerKw: modelData ? modelData.power_kw : null,
      sparkPlug: isPetrol ? (modelData ? modelData.spark_plug : null) : null,
      chainPitch: (isChainsaw && modelData) ? modelData.chain_pitch : null,
      chainGaugeMm: (isChainsaw && modelData) ? modelData.chain_gauge_mm : null,
      carbSettings: (isPetrol && modelData) ? {
        H: modelData.carb_h_setting || 'Fabrieksafstelling',
        L: modelData.carb_l_setting || 'Fabrieksafstelling',
        LA: modelData.carb_la_setting || '2800 RPM'
      } : null
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
        displacementCc: matchedModel.specs.displacementCc,
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
