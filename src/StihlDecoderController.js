/**
 * REST API Controller for POST /api/v1/decode with StopHelingService & FuelType Separation
 */

import { renderStihlPassportHtml } from './components/StihlPassportGenerator.js';
import { StopHelingService } from './StopHelingService.js';

export async function handleDecodeApiV1(reqBody, database) {
  const serialInput = reqBody?.serialNumber || reqBody?.serial_number || reqBody?.code;
  if (!serialInput || !serialInput.toString().trim()) {
    return {
      statusCode: 400,
      body: {
        status: "error",
        message: "Serienummer is verplicht."
      }
    };
  }

  const raw = serialInput.toString().trim();
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

  const plantRecord = resolvePlantRecord(database, cleaned[0]);
  const factory = plantRecord ? {
    code: cleaned[0],
    country: plantRecord.country || plantRecord.country_name,
    facility: plantRecord.location || plantRecord.facility || plantRecord.plant_location
  } : {
    code: cleaned[0],
    country: 'Onbekend',
    facility: 'Onbekend'
  };

  const matchedModel = {
    id: null,
    name: 'UNKNOWN',
    series: cleaned.substring(0, 4),
    category: 'UNKNOWN',
    fuelType: null,
    fuelTypeLabel: 'Niet afleidbaar uit alleen serienummer',
    batterySystem: null,
    voltageV: null,
    specs: {}
  };

  const estimatedProduction = {
    year: 'UNKNOWN',
    generation: 'UNKNOWN',
    confidenceScore: 0
  };

  const passportHtml = renderStihlPassportHtml({
    cleanedSerial: cleaned,
    formatted,
    modelMatch: {
      modelName: matchedModel.name,
      category: matchedModel.category,
      specs: {}
    },
    plantInfo: {
      country: factory.country,
      location: factory.facility
    },
    estimatedYears: 'Niet afleidbaar uit alleen serienummer',
    theftCheck
  });

  return {
    statusCode: 200,
    body: {
      status: "success",
      data: {
        verificationStatus: 'FORMAT_VALIDATED',
        serialNumber: raw,
        formatted,
        factory,
        matchedModel,
        estimatedProduction,
        authenticityStatus: {
          isSuspicious: alerts.length > 0,
          flags: [],
          notes: [
            'Model, bouwjaar en technische specificaties worden niet als vastgesteld gerapporteerd zonder aanvullend typeplaatje of primaire bron.'
          ]
        },
        theftCheck,
        passportCardHtml: passportHtml
      }
    }
  };
}

function resolvePlantRecord(database, factoryDigit) {
  if (database?.factories && database.factories[factoryDigit]) {
    return database.factories[factoryDigit];
  }

  if (Array.isArray(database?.plants)) {
    return database.plants.find((plant) => plant.plant_code === factoryDigit) || null;
  }

  if (database?.plants && database.plants[factoryDigit]) {
    return database.plants[factoryDigit];
  }

  return null;
}
