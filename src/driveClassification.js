/**
 * Safe categorical classification only. This module never returns technical specifications.
 */

const PREFIX_CLASSIFICATIONS = {
  MSA: { machine_type: 'CHAINSAW', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  MSE: { machine_type: 'CHAINSAW', power_source: 'ELECTRIC_CORDED', drive_type: 'CORDED_ELECTRIC' },
  MS: { machine_type: 'CHAINSAW', power_source: 'PETROL', drive_type: 'PETROL_2STROKE' },
  BGA: { machine_type: 'BLOWER', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  BR: { machine_type: 'BLOWER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  BG: { machine_type: 'BLOWER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  FSA: { machine_type: 'BRUSHCUTTER', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  FS: { machine_type: 'BRUSHCUTTER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  HSA: { machine_type: 'HEDGE_TRIMMER', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  HLA: { machine_type: 'HEDGE_TRIMMER', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  HS: { machine_type: 'HEDGE_TRIMMER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  HTA: { machine_type: 'POLE_PRUNER', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  HT: { machine_type: 'POLE_PRUNER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  TSA: { machine_type: 'CUT_OFF_MACHINE', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  TS: { machine_type: 'CUT_OFF_MACHINE', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  KMA: { machine_type: 'KOMBI', power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' },
  KM: { machine_type: 'KOMBI', power_source: 'PETROL', drive_type: 'PETROL_OTHER' },
  HL: { machine_type: 'HEDGE_TRIMMER', power_source: 'PETROL', drive_type: 'PETROL_OTHER' }
};

const DISPLAY_LABELS = {
  PETROL_2STROKE: 'Benzine (2-takt)',
  PETROL_4MIX: 'Benzine (4-MIX)',
  PETROL_OTHER: 'Benzine',
  BATTERY_ELECTRIC: 'Accu-aandrijving',
  CORDED_ELECTRIC: 'Elektrische aandrijving',
  MANUAL: 'Handmatige aandrijving',
  UNKNOWN: 'Niet vastgesteld'
};

function getPrefix(...values) {
  const text = values.filter(Boolean).map((value) => String(value).toUpperCase()).join(' ');
  return Object.keys(PREFIX_CLASSIFICATIONS).sort((left, right) => right.length - left.length)
    .find((prefix) => new RegExp(`^${prefix}(?:\\s|\\d|-)`).test(text)) || null;
}

function fromFuelType(model = {}) {
  const fuelType = String(model.fuel_type || '').toUpperCase();
  if (fuelType === 'PETROL_2STROKE') return { power_source: 'PETROL', drive_type: 'PETROL_2STROKE' };
  if (fuelType === 'PETROL_4MIX') return { power_source: 'PETROL', drive_type: 'PETROL_4MIX' };
  if (fuelType.startsWith('BATTERY')) return { power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' };
  if (fuelType.startsWith('ELECTRIC')) return { power_source: 'ELECTRIC_CORDED', drive_type: 'CORDED_ELECTRIC' };
  return null;
}

function unknownClassification(conflictStatus = 'NONE') {
  return {
    machine_type: 'UNKNOWN',
    power_source: 'UNKNOWN',
    drive_type: 'UNKNOWN',
    display_label: DISPLAY_LABELS.UNKNOWN,
    evidence: 'UNKNOWN',
    confidence: 'UNKNOWN',
    conflict_status: conflictStatus,
    source_basis: null,
    engine_technology: null,
    engine_technology_label: null,
    engine_technology_evidence: 'UNKNOWN'
  };
}

function buildClassification(base, evidence, confidence, sourceBasis, seriesName = '') {
  const hasMTronicSeriesSignal = evidence === 'SERIES_DERIVED' && /(?:^|\s)C-M(?:\s|$)/i.test(seriesName);
  return {
    machine_type: base.machine_type || 'UNKNOWN',
    power_source: base.power_source || 'UNKNOWN',
    drive_type: base.drive_type || 'UNKNOWN',
    display_label: DISPLAY_LABELS[base.drive_type] || DISPLAY_LABELS.UNKNOWN,
    evidence,
    confidence,
    conflict_status: 'NONE',
    source_basis: sourceBasis,
    engine_technology: hasMTronicSeriesSignal ? 'M_TRONIC' : null,
    engine_technology_label: hasMTronicSeriesSignal ? 'M-Tronic' : null,
    engine_technology_evidence: hasMTronicSeriesSignal ? 'SERIES_DERIVED' : 'UNKNOWN'
  };
}

/**
 * Resolve only categorical machine attributes. Exact technical evidence is intentionally out of scope.
 */
export function resolveMachineClassification({
  identityStatus = 'MODEL_NOT_IDENTIFIED',
  exactModel = null,
  probableModelSeries = null,
  modelKey = null,
  category = null,
  modelPrefix = null,
  seriesClassification = null
} = {}) {
  const exactBase = exactModel ? fromFuelType(exactModel) : null;
  const exactPrefix = getPrefix(exactModel?.model_name, modelKey, modelPrefix);
  if (exactBase) {
    return buildClassification({ ...PREFIX_CLASSIFICATIONS[exactPrefix], ...exactBase }, 'EXACT_MODEL_PROPERTY', 'SUPPORTED', exactModel.model_name || modelKey);
  }

  const seriesPrefix = getPrefix(probableModelSeries, modelKey, modelPrefix);
  const prefixBase = seriesPrefix ? PREFIX_CLASSIFICATIONS[seriesPrefix] : null;
  if (identityStatus === 'PROBABLE_MODEL_SERIES' && probableModelSeries) {
    if (seriesClassification) {
      const explicit = {
        machine_type: seriesClassification.machine_type || prefixBase?.machine_type || 'UNKNOWN',
        power_source: seriesClassification.power_source || 'UNKNOWN',
        drive_type: seriesClassification.drive_type || 'UNKNOWN'
      };
      if (prefixBase && (explicit.power_source !== prefixBase.power_source || explicit.drive_type !== prefixBase.drive_type)) {
        return unknownClassification('CONFLICTED');
      }
      return buildClassification(explicit, 'SERIES_DERIVED', 'SUPPORTED_ESTIMATE', probableModelSeries, probableModelSeries);
    }
    if (prefixBase) {
      return buildClassification(prefixBase, 'SERIES_DERIVED', 'SUPPORTED_ESTIMATE', probableModelSeries, probableModelSeries);
    }
  }

  if (identityStatus === 'EXACT_MODEL_IDENTIFIED' && prefixBase) {
    return buildClassification(prefixBase, 'PREFIX_DERIVED', 'SUPPORTED', seriesPrefix);
  }

  return unknownClassification();
}

export function getClassificationContextLabel(classification = {}) {
  if (classification?.evidence === 'SERIES_DERIVED') return '≈ Afgeleid van waarschijnlijke modelreeks';
  if (classification?.evidence === 'PREFIX_DERIVED') return '≈ Afgeleid van modelaanduiding';
  return null;
}
