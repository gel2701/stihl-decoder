import { getModelVerificationSummary } from './canonicalData.js';

export const CATEGORY_REGISTRY = {
  'kettingzagen': { label: 'STIHL Kettingzagen', status: 'PUBLISHED' },
  'bosmaaiers': { label: 'STIHL Bosmaaiers', status: 'PUBLISHED' },
  'bladblazers': { label: 'STIHL Bladblazers', status: 'PUBLISHED' },
  'heggenscharen': { label: 'STIHL Heggenscharen', status: 'PUBLISHED' },
  'doorslijpers': { label: 'STIHL Doorslijpers', status: 'PUBLISHED' },
  'nevelspuiten': { label: 'STIHL Nevelspuiten', status: 'PUBLISHED' },
  'accu-kettingzagen': { label: 'STIHL Accu Kettingzagen', status: 'REDIRECT', destination: '/kettingzagen/' }
};

export function getPublishedCategories() {
  return Object.entries(CATEGORY_REGISTRY)
    .filter(([_, conf]) => conf.status === 'PUBLISHED')
    .map(([slug]) => slug);
}

export function isCategoryPublished(slug) {
  return CATEGORY_REGISTRY[slug]?.status === 'PUBLISHED';
}

export const KNOWN_PUBLIC_CATEGORIES = new Set(getPublishedCategories());

export const INDEXABLE_COMPARISONS = [
  'ms-170-vs-ms-180',
  'ms-260-vs-ms-261',
  'ms-361-vs-ms-362'
];

export const COMPARISON_REGISTRY = [
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
    return 'Het serienummer staat doorgaans ingeslagen in het metaal van het carter of op een typeplaatjessticker van de machine. Veelvoorkomende inspectiepunten zijn het carter nabij de uitlaatzijde, de kettingremhendel of de handgreep. Reinig eventueel zaagsel en kettingolie voorzichtig om de tekens goed af te lezen. Veel STIHL-machines gebruiken een 9-cijferig serienummer. Een 11-cijferig STIHL onderdeelnummer identificeert een onderdeel, component of samenstelling en is niet het unieke serienummer van de complete machine. De exacte locatie verschilt per model en generatie; controleer bij twijfel de handleiding van uw specifieke uitvoering.';
  }
  if (categorySlug === 'bosmaaiers') {
    return 'Het serienummer kan zich bevinden op het motorhuis, ingeslagen op het carter of op de identificatiesticker van de machine of stuurboom. Verwijder vuil en vet voorzichtig om het nummer goed af te lezen. Veel STIHL-machines hebben een 9-cijferig serienummer. Een 11-cijferig STIHL onderdeelnummer identificeert een onderdeel, component of samenstelling en is niet het unieke serienummer van de complete machine. De exacte positie verschilt per model en bouwjaarrevisie.';
  }
  if (categorySlug === 'bladblazers') {
    return 'Het serienummer bevindt zich veelal op het motorblok of op de typeplaatsticker op de behuizing of het frame van de blazer. Zorg dat het oppervlak schoon is om het serienummer te onderscheiden van een 11-cijferig onderdeelnummer (dat een los onderdeel of samenstelling aanduidt). De exacte locatie verschilt per model en generatie.';
  }
  if (categorySlug === 'heggenscharen') {
    return 'Het serienummer kan ingeslagen zijn op het aandrijfhuis of motorcarter, of vermeld staan op het typeplaatje nabij de bedieningsgreep. Controleer het complete nummer op de machine; een 11-cijferig nummer is een onderdeelnummer en géén uniek machinenummer. De exacte locatie verschilt per uitvoering.';
  }
  if (categorySlug === 'doorslijpers') {
    return 'Het serienummer staat doorgaans ingeslagen in het metalen motorhuis of carter van de doorslijper en op de fabriekstypeplaat. Bij intensief gebruikte machines kan reiniging van steenstof nodig zijn om de tekens zichtbaar te maken. De exacte inspectiepositie verschilt per model.';
  }
  if (categorySlug === 'nevelspuiten') {
    return 'Het serienummer bevindt zich doorgaans op het motorblok of het typeplaatje van de nevelspuit. Reinig de behuizing voorzichtig om de tekens af te lezen. De exacte inspectiepositie verschilt per model.';
  }
  return 'Het serienummer bevindt zich doorgaans ingeslagen op het carter of motorhuis, of op de typeplaatjessticker van de machine. Reinig eventueel vuil voorzichtig om het nummer af te lezen. Veel STIHL-machines gebruiken een 9-cijferig serienummer. Een 11-cijferig STIHL onderdeelnummer identificeert een onderdeel, component of samenstelling en is niet het unieke serienummer van de complete machine. De exacte locatie verschilt per model en generatie.';
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

export const GUIDE_ROUTE_CONFIG = {
  'serienummer-locaties': { status: 'PUBLISHED' },
  'stihl-gietklok-aflezen': { status: 'HOLD' },
  'namaak-stihl-herkennen': { status: 'HOLD' },
  'stihl-kettingzaag-start-niet': { status: 'HOLD' },
  'stihl-carburateur-afstellen': { status: 'HOLD' },
  'stihl-m-tronic-resetten': { status: 'HOLD' }
};

export const INTENT_ROUTE_CONFIG = {
  'stihl-paspoort': { status: 'PUBLISHED' },
  'waar-staat-serienummer-stihl': { status: 'REDIRECT', destination: '/gidsen/serienummer-locaties/' },
  'stihl-serienummer-decoder': { status: 'REDIRECT', destination: '/#decoder' },
  'stihl-serienummer': { status: 'HOLD' },
  'stihl-bouwjaar': { status: 'HOLD' },
  'stihl-diefstalcheck': { status: 'HOLD' },
  'stihl-waarde': { status: 'HOLD' },
  'stihl-modellen': { status: 'HOLD' },
  'stihl-serienummer-bouwjaar': { status: 'HOLD' },
  'stihl-productiedatum': { status: 'HOLD' },
  'stihl-model-herkennen': { status: 'HOLD' },
  'stihl-typeplaatje': { status: 'HOLD' },
  'stihl-serienummer-ongeldig': { status: 'HOLD' },
  'stihl-tweedehands-checklist': { status: 'HOLD' }
};

export const GUIDE_PUBLICATION_STATUS = Object.fromEntries(
  Object.entries(GUIDE_ROUTE_CONFIG).map(([slug, conf]) => [slug, conf.status])
);

export const INTENT_PUBLICATION_STATUS = Object.fromEntries(
  Object.entries(INTENT_ROUTE_CONFIG).map(([slug, conf]) => [slug, conf.status])
);

export function getGuideRouteConfig(slug) {
  return GUIDE_ROUTE_CONFIG[slug] || { status: 'HOLD' };
}

export function getIntentRouteConfig(slug) {
  return INTENT_ROUTE_CONFIG[slug] || { status: 'HOLD' };
}

export function getGuidePublicationStatus(slug) {
  return getGuideRouteConfig(slug).status;
}

export function isGuidePublished(slug) {
  return getGuideRouteConfig(slug).status === 'PUBLISHED';
}

export function getIntentPublicationStatus(slug) {
  return getIntentRouteConfig(slug).status;
}

export function isIntentPublished(slug) {
  return getIntentRouteConfig(slug).status === 'PUBLISHED';
}

export function getCanonicalPartSeriesCodes(database) {
  const models = database?.models || [];
  const seriesSet = new Set();
  for (const m of models) {
    if (m.series_code && typeof m.series_code === 'string') {
      seriesSet.add(m.series_code.trim());
    }
  }
  return Array.from(seriesSet).sort();
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
