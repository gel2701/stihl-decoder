import { getModelVerificationSummary } from './canonicalData.js';

export const KNOWN_PUBLIC_CATEGORIES = new Set([
  'kettingzagen',
  'bosmaaiers',
  'bladblazers',
  'heggenscharen',
  'accu-kettingzagen',
  'doorslijpers'
]);

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

export function getFuelDriveLabel(model) {
  if (!model?.fuel_type) return 'Niet vastgesteld';
  if (String(model.fuel_type).startsWith('BATTERY')) {
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
  return model.fuel_type_label || 'Benzine-aandrijving';
}

export function isBatteryModel(model) {
  return Boolean(model?.fuel_type && String(model.fuel_type).startsWith('BATTERY'));
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
