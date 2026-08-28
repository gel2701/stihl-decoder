import { getModelVerificationSummary } from './canonicalData.js';

export const KNOWN_PUBLIC_CATEGORIES = new Set([
  'kettingzagen',
  'bosmaaiers',
  'bladblazers',
  'heggenscharen',
  'accu-kettingzagen',
  'doorslijpers'
]);

export const INDEXABLE_COMPARISONS = [
  'ms-170-vs-ms-180',
  'ms-260-vs-ms-261',
  'ms-361-vs-ms-362'
];

const COMPARISON_REGISTRY = [
  {
    slug: 'ms-170-vs-ms-180',
    categorySlug: 'kettingzagen',
    leftSlug: 'ms-170',
    rightSlug: 'ms-180',
    label: 'Compacte Instapklasse',
    title: 'STIHL MS 170 vs MS 180'
  },
  {
    slug: 'ms-260-vs-ms-261',
    categorySlug: 'kettingzagen',
    leftSlug: 'ms-260',
    rightSlug: 'ms-261',
    label: 'Klassiek vs M-Tronic',
    title: 'STIHL MS 260 vs MS 261'
  },
  {
    slug: 'ms-361-vs-ms-362',
    categorySlug: 'kettingzagen',
    leftSlug: 'ms-361',
    rightSlug: 'ms-362',
    label: 'Professionele Middenklasse',
    title: 'STIHL MS 361 vs MS 362'
  }
];

export function getSafeCategorySlug(model) {
  const categorySlug = model?.category_slug || null;
  return categorySlug && KNOWN_PUBLIC_CATEGORIES.has(categorySlug) ? categorySlug : null;
}

export function getSafeModelSlug(model) {
  if (!model) return null;
  return model.slug || model.id?.replace(/_/g, '-') || null;
}

export function getSafeModelPath(model) {
  const categorySlug = getSafeCategorySlug(model);
  const modelSlug = getSafeModelSlug(model);
  if (!categorySlug || !modelSlug) return null;
  return `/${categorySlug}/${modelSlug}/`;
}

export function getSafeModelPartsPath(model) {
  const modelPath = getSafeModelPath(model);
  return modelPath ? `${modelPath}onderdelen/` : null;
}

export function getPublicCategoryLabel(model) {
  const categorySlug = getSafeCategorySlug(model);
  return categorySlug ? (model?.category || categorySlug) : 'UNKNOWN';
}

export function getSerialLocationAnswer(categorySlug) {
  if (categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen') {
    return 'Het serienummer staat ingeslagen in het metaal van het carter en kan daarnaast op het typeplaatje of de sticker staan.';
  }
  if (categorySlug === 'bosmaaiers') {
    return 'Het serienummer staat op het motortypeplaatje of ingeslagen op het carter van de bosmaaier.';
  }
  if (categorySlug === 'bladblazers') {
    return 'Het serienummer bevindt zich op het motorblok of het typeplaatje van de bladblazer.';
  }
  if (categorySlug === 'heggenscharen') {
    return 'Het serienummer staat op het carter of typeplaatje van de heggenschaar.';
  }
  if (categorySlug === 'doorslijpers') {
    return 'Het serienummer staat ingeslagen op het motorhuis of typeplaatje van de doorslijper.';
  }
  return 'De exacte locatie van het serienummer verschilt per model. Controleer het typeplaatje en de passende STIHL documentatie voor uw uitvoering.';
}

export function getFuelTypeCode(model) {
  const rawFuelType = typeof model?.fuel_type === 'string' ? model.fuel_type.toUpperCase() : null;
  if (!rawFuelType) return 'UNKNOWN';
  if (rawFuelType.startsWith('BATTERY')) return 'BATTERY';
  if (rawFuelType.startsWith('ELECTRIC')) return 'ELECTRIC';
  if (rawFuelType === 'PETROL_2STROKE') return 'PETROL_2STROKE';
  if (rawFuelType === 'PETROL_4MIX') return 'PETROL_4MIX';
  return 'UNKNOWN';
}

export function getFuelDriveLabel(model) {
  const fuelTypeCode = getFuelTypeCode(model);

  if (fuelTypeCode === 'BATTERY') {
    if (model.battery_system && model.voltage_v) {
      return `${model.battery_system} ${model.voltage_v}V`;
    }
    if (model.battery_system) {
      return model.battery_system;
    }
    if (model.voltage_v) {
      return `${model.voltage_v}V`;
    }
    return 'Accu-aandrijving';
  }

  if (fuelTypeCode === 'ELECTRIC') {
    return model?.fuel_type_label || 'Elektrische aandrijving';
  }

  if (fuelTypeCode === 'PETROL_2STROKE') {
    return model?.fuel_type_label || 'Benzine-aandrijving (2-takt)';
  }

  if (fuelTypeCode === 'PETROL_4MIX') {
    return model?.fuel_type_label || 'Benzine-aandrijving (4-MIX)';
  }

  return 'Niet vastgesteld';
}

export function isBatteryModel(model) {
  return getFuelTypeCode(model) === 'BATTERY';
}

export function isPetrolModel(model) {
  const fuelTypeCode = getFuelTypeCode(model);
  return fuelTypeCode === 'PETROL_2STROKE' || fuelTypeCode === 'PETROL_4MIX';
}

export function getRegisteredComparisons(categorySlug = null) {
  if (!categorySlug) {
    return COMPARISON_REGISTRY.map((entry) => ({ ...entry }));
  }
  return COMPARISON_REGISTRY.filter((entry) => entry.categorySlug === categorySlug).map((entry) => ({ ...entry }));
}

export function resolveComparisonRoute(pairSlug, database) {
  if (!pairSlug || !pairSlug.includes('-vs-')) {
    return { status: 'INVALID', canonicalSlug: null, entry: null, modelA: null, modelB: null };
  }

  const cleanSlug = pairSlug.trim().toLowerCase().replace(/\/$/, '');
  const directEntry = COMPARISON_REGISTRY.find((entry) => entry.slug === cleanSlug);
  const reverseEntry = COMPARISON_REGISTRY.find((entry) => `${entry.rightSlug}-vs-${entry.leftSlug}` === cleanSlug);
  const entry = directEntry || reverseEntry || null;

  if (!entry) {
    return { status: 'UNREGISTERED', canonicalSlug: null, entry: null, modelA: null, modelB: null };
  }

  const models = database?.models || [];
  const leftModel = models.find((model) => getSafeModelSlug(model) === entry.leftSlug) || null;
  const rightModel = models.find((model) => getSafeModelSlug(model) === entry.rightSlug) || null;

  if (!leftModel || !rightModel) {
    return { status: 'INVALID', canonicalSlug: entry.slug, entry, modelA: null, modelB: null };
  }

  return {
    status: directEntry ? 'CANONICAL' : 'REDIRECT',
    canonicalSlug: entry.slug,
    entry,
    modelA: leftModel,
    modelB: rightModel
  };
}

export function getRegisteredComparisonForModel(model, database) {
  const modelSlug = getSafeModelSlug(model);
  if (!modelSlug) return null;

  for (const entry of COMPARISON_REGISTRY) {
    if (entry.leftSlug !== modelSlug && entry.rightSlug !== modelSlug) {
      continue;
    }
    const route = resolveComparisonRoute(entry.slug, database);
    if (route.status !== 'CANONICAL') {
      continue;
    }
    const partner = entry.leftSlug === modelSlug ? route.modelB : route.modelA;
    return {
      comparisonSlug: entry.slug,
      partner,
      entry
    };
  }

  return null;
}

export function shouldPublishProductSchema(model) {
  const verification = getModelVerificationSummary(model);
  const hasSafeIdentity = Boolean(model?.model_name && getSafeCategorySlug(model));
  const hasConcreteSpecs = Boolean(
    model?.displacement_cc ||
    model?.power_hp ||
    model?.power_kw ||
    model?.battery_system ||
    model?.voltage_v
  );

  return {
    verification,
    allowed: hasSafeIdentity && verification.hasPrimaryDocument && hasConcreteSpecs,
    hasSafeIdentity,
    hasConcreteSpecs
  };
}

export function getValuationPublicationState(model) {
  return {
    canIndex: false,
    robotsContent: 'noindex, follow',
    reason: 'INSUFFICIENT_MODEL_SPECIFIC_MARKET_DATA',
    titleLabel: `STIHL ${model?.model_name || 'Machine'} Waardestatus`,
    metaDescription: `Indicatieve waardepagina voor STIHL ${model?.model_name || 'machine'} met nog onvoldoende modelspecifieke marktdata voor een indexeerbare marktwaardeclaim.`,
    showPrice: false
  };
}
