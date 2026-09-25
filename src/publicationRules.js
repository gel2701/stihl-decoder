import { getModelVerificationSummary } from './canonicalData.js';

export const KNOWN_PUBLIC_CATEGORIES = new Set([
  'kettingzagen',
  'bosmaaiers',
  'bladblazers',
  'heggenscharen',
  'accu-kettingzagen',
  'doorslijpers',
  'nevelspuiten'
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
    return 'Het unieke 9-cijferige serienummer staat meestal ingeslagen in het metaal van het carter (nabij de geluiddemper of velkam) en kan ook op een typeplaatjessticker op de handgreep of kettingrem staan. Reinig zaagsel en kettingolie om het nummer goed zichtbaar te maken. Let op: een 11-cijferig nummer is een gegoten onderdeelnummer en géén uniek serienummer. De exacte locatie verschilt per generatie.';
  }
  if (categorySlug === 'bosmaaiers') {
    return 'Het 9-cijferige serienummer bevindt zich op het motorhuis of ingeslagen op het carter (vaak nabij de brandstoftank of stuurboom) en op de identificatiesticker. Verwijder vuil en vet om het nummer goed af te lezen. Een 11-cijferig nummer is een onderdeelnummer en géén serienummer van de complete machine.';
  }
  if (categorySlug === 'bladblazers') {
    return 'Het 9-cijferige serienummer staat op het motorblok of op de typeplaatsticker op de behuizing of het frame van de blazer. Zorg dat het oppervlak schoon is om het nummer te onderscheiden van 11-cijferige onderdeelnummers.';
  }
  if (categorySlug === 'heggenscharen') {
    return 'Het 9-cijferige serienummer bevindt zich op het aandrijfhuis of motorcarter en op het typeplaatje nabij de bedieningsgreep. Controleer op een 9-cijferige code; 11-cijferige codes zijn onderdeelnummers.';
  }
  if (categorySlug === 'doorslijpers') {
    return 'Het serienummer is ingeslagen in het metalen motorhuis of carter van de doorslijper en staat tevens op de fabriekstypeplaat. Bij intensief gebruikte machines kan reiniging van steenstof nodig zijn om de cijfers zichtbaar te maken.';
  }
  if (categorySlug === 'nevelspuiten') {
    return 'Het serienummer bevindt zich op het motorblok of het typeplaatje van de nevelspuit. Reinig de behuizing voorzichtig om de stempel af te lezen.';
  }
  return 'Het unieke 9-cijferige serienummer bevindt zich ingeslagen op het carter of motorhuis, of op de typeplaatjessticker van de machine. Reinig eventueel vuil voorzichtig om het nummer af te lezen. Let op dat een 11-cijferig nummer een onderdeelnummer is en géén uniek serienummer van de machine.';
}

export function getFuelTypeCode(model) {
  const rawFuelType = typeof model?.fuel_type === 'string'
    ? model.fuel_type.toUpperCase()
    : (typeof model?.basic_classification?.fuel_type === 'string' ? model.basic_classification.fuel_type.toUpperCase() : null);
  const powerSource = typeof model?.power_source === 'string'
    ? model.power_source.toUpperCase()
    : (typeof model?.basic_classification?.power_source === 'string' ? model.basic_classification.power_source.toUpperCase() : null);

  if (powerSource === 'BATTERY' || (rawFuelType && rawFuelType.startsWith('BATTERY'))) {
    return 'BATTERY';
  }
  if (powerSource === 'ELECTRIC' || (rawFuelType && rawFuelType.startsWith('ELECTRIC'))) {
    return 'ELECTRIC';
  }
  if (powerSource === 'GASOLINE' || powerSource === 'PETROL' || rawFuelType === 'PETROL_2STROKE' || rawFuelType === 'PETROL_OIL_MIX') {
    return 'PETROL_2STROKE';
  }
  if (rawFuelType === 'PETROL_4MIX') {
    return 'PETROL_4MIX';
  }
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

export const GUIDE_PUBLICATION_STATUS = {
  'serienummer-locaties': 'PUBLISHED',
  'stihl-gietklok-aflezen': 'HOLD',
  'namaak-stihl-herkennen': 'HOLD',
  'stihl-kettingzaag-start-niet': 'HOLD',
  'stihl-carburateur-afstellen': 'HOLD',
  'stihl-m-tronic-resetten': 'HOLD'
};

export const INTENT_PUBLICATION_STATUS = {
  'stihl-paspoort': 'PUBLISHED',
  'stihl-serienummer-decoder': 'HOLD',
  'stihl-serienummer': 'HOLD',
  'stihl-bouwjaar': 'HOLD',
  'stihl-diefstalcheck': 'HOLD',
  'stihl-waarde': 'HOLD',
  'stihl-modellen': 'HOLD',
  'waar-staat-serienummer-stihl': 'HOLD',
  'stihl-serienummer-bouwjaar': 'HOLD',
  'stihl-productiedatum': 'HOLD',
  'stihl-model-herkennen': 'HOLD',
  'stihl-typeplaatje': 'HOLD',
  'stihl-serienummer-ongeldig': 'HOLD',
  'stihl-tweedehands-checklist': 'HOLD'
};

export function getGuidePublicationStatus(slug) {
  return GUIDE_PUBLICATION_STATUS[slug] || 'HOLD';
}

export function isGuidePublished(slug) {
  return getGuidePublicationStatus(slug) === 'PUBLISHED';
}

export function getIntentPublicationStatus(slug) {
  return INTENT_PUBLICATION_STATUS[slug] || 'HOLD';
}

export function isIntentPublished(slug) {
  return getIntentPublicationStatus(slug) === 'PUBLISHED';
}

export function getRelevantPublicLinks(model, database) {
  const links = [];
  const categorySlug = getSafeCategorySlug(model);
  const safePartsPath = getSafeModelPartsPath(model);
  const isChainsaw = categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen';
  const isBattery = isBatteryModel(model);
  const isPetrol = isPetrolModel(model);

  // 1. Category Hub
  if (categorySlug) {
    const categoryTitle = model?.category || 'Modellen';
    links.push({ href: `/${categorySlug}/`, label: `${categoryTitle} Overzicht` });
  }

  // 2. Safe parts path
  if (safePartsPath) {
    links.push({ href: safePartsPath, label: `STIHL ${model?.model_name || 'Machine'} Onderdelen` });
  }

  // 3. Comparisons if registered
  const comp = getRegisteredComparisonForModel(model, database);
  if (comp) {
    links.push({ href: `/vergelijk/${comp.comparisonSlug}/`, label: comp.entry.title });
  }

  // 4. Published Guides (strictly drive-context and category safe)
  if (isGuidePublished('serienummer-locaties')) {
    links.push({ href: '/gidsen/serienummer-locaties/', label: 'Serienummer Locaties Gids' });
  }

  if (isPetrol && isChainsaw && isGuidePublished('stihl-kettingzaag-start-niet')) {
    links.push({ href: '/gidsen/stihl-kettingzaag-start-niet/', label: 'Kettingzaag Start Niet Guide' });
  }
  if (isPetrol && isGuidePublished('stihl-carburateur-afstellen')) {
    links.push({ href: '/gidsen/stihl-carburateur-afstellen/', label: 'Carburateur Afstellen' });
  }
  if (isPetrol && isGuidePublished('stihl-m-tronic-resetten')) {
    links.push({ href: '/gidsen/stihl-m-tronic-resetten/', label: 'M-Tronic Resetten' });
  }

  // 5. Published Tools / Hubs
  if (isIntentPublished('stihl-paspoort')) {
    links.push({ href: '/stihl-paspoort/', label: 'STIHL Machinepaspoort (Mijn STIHL)' });
  }

  // 6. Parts Hub
  links.push({ href: '/onderdeelnummer/', label: 'STIHL Onderdeelnummers & Series' });

  return links;
}
