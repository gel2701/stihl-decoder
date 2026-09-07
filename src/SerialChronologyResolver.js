import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAnchorsPath = path.resolve(__dirname, '..', 'data', 'serial_chronology_anchors.json');

let cachedAnchors = null;

function loadDefaultAnchors() {
  if (cachedAnchors !== null) return cachedAnchors;
  try {
    if (fs.existsSync(defaultAnchorsPath)) {
      const data = JSON.parse(fs.readFileSync(defaultAnchorsPath, 'utf8'));
      cachedAnchors = Array.isArray(data.anchors) ? data.anchors : [];
      return cachedAnchors;
    }
  } catch (err) {
    console.error('Warning: could not load serial_chronology_anchors.json:', err.message);
  }
  cachedAnchors = [];
  return cachedAnchors;
}

export class SerialChronologyResolver {
  static resolve(serialInput, options = {}) {
    if (!serialInput) {
      return {
        status: 'UNKNOWN',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: null,
        upperAnchor: null,
        method: null,
        reason: 'Geen serienummer opgegeven.'
      };
    }

    const serialStr = String(serialInput).trim();
    if (!/^\d{8,10}$/.test(serialStr)) {
      return {
        status: 'UNKNOWN',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: null,
        upperAnchor: null,
        method: null,
        reason: 'Ongeldig serienummerformaat voor chronologie.'
      };
    }

    const numericSerial = parseInt(serialStr, 10);
    const plantDigit = serialStr.charAt(0);
    const targetPlant = options.plantCode || plantDigit;

    const allAnchors = Array.isArray(options.anchors)
      ? options.anchors
      : loadDefaultAnchors();

    if (!allAnchors || allAnchors.length === 0) {
      return {
        status: 'UNKNOWN',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: null,
        upperAnchor: null,
        method: null,
        reason: 'Geen chronologische serienummer-ankers beschikbaar.'
      };
    }

    // Check if test/caller provided cross-plant bounding anchors explicitly
    const explicitLower = options.lowerAnchor || null;
    const explicitUpper = options.upperAnchor || null;
    if (explicitLower && explicitUpper) {
      const lowerPlant = explicitLower.plant_code || String(explicitLower.serial).charAt(0);
      const upperPlant = explicitUpper.plant_code || String(explicitUpper.serial).charAt(0);
      if (lowerPlant !== upperPlant || (targetPlant && lowerPlant !== targetPlant)) {
        return {
          status: 'CROSS_PLANT_BLOCKED',
          estimatedStart: null,
          estimatedEnd: null,
          estimatedYear: null,
          yearRange: null,
          confidence: 'UNKNOWN',
          lowerAnchor: explicitLower,
          upperAnchor: explicitUpper,
          method: null,
          reason: 'Cross-plant interpolatie is strikt geblokkeerd.'
        };
      }
    }

    // Filter anchors by plant
    const plantAnchors = allAnchors.filter(a => {
      const aPlant = a.plant_code || (a.serial ? String(a.serial).charAt(0) : null);
      return aPlant === targetPlant;
    });

    // If allAnchors had items but none matched plant
    if (plantAnchors.length === 0) {
      if (allAnchors.length > 0) {
        return {
          status: 'CROSS_PLANT_BLOCKED',
          estimatedStart: null,
          estimatedEnd: null,
          confidence: 'UNKNOWN',
          lowerAnchor: null,
          upperAnchor: null,
          method: null,
          reason: 'Geen ankers voor fabriekscode ' + targetPlant + '; interpolatie vanuit andere fabrieken is geblokkeerd.'
        };
      }
      return {
        status: 'UNKNOWN',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: null,
        upperAnchor: null,
        method: null,
        reason: 'Geen ankers voor fabriekscode ' + targetPlant + '.'
      };
    }

    // Check exact match
    const exact = plantAnchors.find(a => {
      const aNum = a.serial_numeric || parseInt(a.serial, 10);
      return aNum === numericSerial;
    });
    if (exact) {
      const yr = exact.production_year || exact.production_period_start || null;
      return {
        status: 'EXACT_DOCUMENTED_YEAR',
        estimatedStart: yr,
        estimatedEnd: exact.production_period_end || yr,
        confidence: exact.confidence || 'HIGH',
        lowerAnchor: exact,
        upperAnchor: exact,
        method: 'EXACT_ANCHOR_MATCH',
        estimatedYear: yr,
        yearRange: yr ? String(yr) : null,
        explanation: 'Exact gedocumenteerd productieanker gevonden.',
        reason: 'Exact gedocumenteerd productieanker gevonden.'
      };
    }

    // Monotonicity check on plant anchors
    const sorted = [...plantAnchors].sort((a, b) => {
      const an = a.serial_numeric || parseInt(a.serial, 10);
      const bn = b.serial_numeric || parseInt(b.serial, 10);
      return an - bn;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const a1 = sorted[i];
      const a2 = sorted[i + 1];
      const y1 = a1.production_year || a1.production_period_start;
      const y2 = a2.production_year || a2.production_period_start;
      if (y1 && y2 && y1 > y2) {
        return {
          status: 'CHRONOLOGY_CONFLICT',
          estimatedStart: null,
          estimatedEnd: null,
          estimatedYear: null,
          yearRange: null,
          confidence: 'UNKNOWN',
          lowerAnchor: a1,
          upperAnchor: a2,
          method: null,
          reason: 'Chronologieconflict: niet-monotone volgorde tussen serienummers en bouwjaren.'
        };
      }
    }

    // If only 1 anchor for this plant
    if (plantAnchors.length < 2) {
      return {
        status: 'INSUFFICIENT_ANCHORS',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: plantAnchors[0] || null,
        upperAnchor: null,
        method: null,
        reason: 'Onvoldoende ankers: minimaal twee geverifieerde begrenzingsankers vereist voor interpolatie.'
      };
    }

    // Find bounding anchors
    let lower = null;
    let upper = null;

    for (const a of sorted) {
      const aNum = a.serial_numeric || parseInt(a.serial, 10);
      if (aNum < numericSerial) {
        lower = a;
      } else if (aNum > numericSerial) {
        if (!upper) {
          upper = a;
        }
      }
    }

    // Extrapolation check
    if (!lower || !upper) {
      return {
        status: 'EXTRAPOLATION_BLOCKED',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: lower,
        upperAnchor: upper,
        method: null,
        reason: 'Serienummer valt buiten de geverifieerde ankergrenzen; extrapolatie is geblokkeerd.'
      };
    }

    // Check plant consistency
    const lowerPlant = lower.plant_code || String(lower.serial).charAt(0);
    const upperPlant = upper.plant_code || String(upper.serial).charAt(0);
    if (lowerPlant !== upperPlant || lowerPlant !== targetPlant) {
      return {
        status: 'CROSS_PLANT_BLOCKED',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: lower,
        upperAnchor: upper,
        method: null,
        reason: 'Cross-plant interpolatie geblokkeerd.'
      };
    }

    const yStart = lower.production_year || lower.production_period_start;
    const yEnd = upper.production_year || upper.production_period_end || upper.production_year;

    if (yStart > yEnd) {
      return {
        status: 'CHRONOLOGY_CONFLICT',
        estimatedStart: null,
        estimatedEnd: null,
        estimatedYear: null,
        yearRange: null,
        confidence: 'UNKNOWN',
        lowerAnchor: lower,
        upperAnchor: upper,
        method: null,
        reason: 'Chronologieconflict: ondergrens-jaar ligt na bovengrens-jaar.'
      };
    }

    const conf = (lower.confidence === 'HIGH' && upper.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM';

    return {
      status: 'CHRONOLOGY_ESTIMATE',
      estimatedStart: yStart,
      estimatedEnd: yEnd,
      confidence: conf,
      lowerAnchor: lower,
      upperAnchor: upper,
      method: 'BOUNDED_INTERPOLATION',
      estimatedYear: Math.round((yStart + yEnd) / 2),
      yearRange: yStart === yEnd ? String(yStart) : `${yStart} – ${yEnd}`,
      explanation: `Geschat uit serienummerreeks tussen ${lower.serial || lower.serialNumber} (${yStart}) en ${upper.serial || upper.serialNumber} (${yEnd}).`,
      reason: `Geschat uit serienummerreeks tussen ${lower.serial || lower.serialNumber} (${yStart}) en ${upper.serial || upper.serialNumber} (${yEnd}).`
    };
  }
}
