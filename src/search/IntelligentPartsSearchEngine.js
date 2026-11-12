/**
 * Intelligent Parts Search Engine for STIHLDecoder.nl
 * Phase 5 — Intelligent Parts Search & Multi-Dimensional Catalog Filtering
 *
 * Provides authoritative, verified parts discovery across all 18,373 canonical parts:
 * 1. Part Number Formats (compact, spaced, dashed, dotted, series-prefix)
 * 2. Multilingual Synonyms & Technical Components (Dutch, German, English)
 * 3. Verified Supersessions & Replacement Parts (data/parts_supersessions.json)
 * 4. Model Scoping & Variant Filtering (e.g. MS 260, MS 261 C-M, FS 450)
 * 5. Structured Part Categorization (Filters, Ontsteking, Zaaguitrusting, etc.)
 * 6. Non-negotiable Trust & Compatibility Guards (Bevestigde compatibiliteit)
 * 7. Verified Amazon Affiliate Integration
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../parts/PartCatalogResolver.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';
import { defaultVerifiedOfferRegistry } from '../affiliate/VerifiedOfferRegistry.js';
import { AmazonAffiliateProvider, COMMERCIAL_TIERS, extractTargetedSearchKeywords } from '../affiliate/AmazonAffiliateProvider.js';
import { isPartIndexable, getIndexablePartEntry } from '../seo/PartIndexationRegistry.js';
import { SectionResolutionRegistry } from '../parts/SectionResolutionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');

let cachedSupersessions = null;
function getSupersessions() {
  if (cachedSupersessions === null) {
    try {
      if (fs.existsSync(supersessionsPath)) {
        const raw = fs.readFileSync(supersessionsPath, 'utf8');
        const doc = JSON.parse(raw);
        cachedSupersessions = Array.isArray(doc.relations) ? doc.relations : (Array.isArray(doc) ? doc : []);
      } else {
        cachedSupersessions = [];
      }
    } catch (e) {
      cachedSupersessions = [];
    }
  }
  return cachedSupersessions;
}

export const PART_CATEGORIES = {
  FILTERS: { id: 'filters', label: 'Filters (Lucht & Brandstof)', icon: '💨' },
  IGNITION: { id: 'ontsteking', label: 'Ontsteking & Bougies', icon: '⚡' },
  CARBURETOR: { id: 'carburateur', label: 'Carburateur & Brandstof', icon: '🎛️' },
  CUTTING_EQUIPMENT: { id: 'zaaguitrusting', label: 'Zaagkettingen & Bladen', icon: '🪚' },
  TRIMMER_EQUIPMENT: { id: 'maaigarnituur', label: 'Maaikoppen & Draad', icon: '🌱' },
  STARTER: { id: 'starter', label: 'Starters & Aandrijving', icon: '🔄' },
  CLUTCH: { id: 'koppeling', label: 'Koppeling & Tandwielen', icon: '⚙️' },
  ENGINE: { id: 'motor', label: 'Cilinder, Zuiger & Motor', icon: '🔥' },
  OIL_SYSTEM: { id: 'oliesmering', label: 'Oliepomp & Smering', icon: '🛢️' },
  BODY: { id: 'behuizing', label: 'Handgrepen & Behuizing', icon: '🛡️' },
  HARDWARE: { id: 'bevestiging', label: 'Schroeven & Bevestiging', icon: '🔩' },
  OTHER: { id: 'overig', label: 'Overige Onderdelen', icon: '📦' }
};

export const MACHINE_TYPES = {
  CHAINSAW: { id: 'kettingzagen', label: 'Kettingzagen' },
  BRUSHCUTTER: { id: 'bosmaaiers', label: 'Bosmaaiers & Trimmers' },
  BLOWER: { id: 'bladblazers', label: 'Bladblazers & Zuighakselaars' },
  HEDGE_TRIMMER: { id: 'heggenscharen', label: 'Heggenscharen' },
  CUT_OFF_SAW: { id: 'doorslijpers', label: 'Doorslijpers' },
  LAWN_MOWER: { id: 'grasmaaiers', label: 'Grasmaaiers' },
  OTHER: { id: 'overig', label: 'Overige Machines' }
};

/**
 * Classifies part into standard category based on name and function.
 */
export function classifyPartCategory(partName = '') {
  const name = String(partName || '').toLowerCase();

  // Fasteners & hardware checked early so titles with "Chainsaw Parts - M5 Nut" or "Screw for guide bar" are classified as hardware
  if (/schroef|screw|schraube|moer|nut|mutter|sluitring|washer|scheibe|borgring|circlip|sprengring|klem|clip|bout|bolt|tapeind|stud|cylindrical pin|snap ring|grooved ball bearing|needle cage|helicoil/i.test(name)) {
    return PART_CATEGORIES.HARDWARE;
  }
  if (/luchtfilter|air filter|luftfilter|brandstoffilter|fuel filter|kraftstofffilter|filterelement|filter element|filter|saugkopf|pickup body|service kit|onderhoudset/i.test(name)) {
    return PART_CATEGORIES.FILTERS;
  }
  if (/bougie|spark plug|zündkerze|zundkerze|ontsteking|ignition|stecker|bougiedop|flywheel|vliegwiel|control unit|wiring harness|contactveer|cable harness|lead retainer/i.test(name)) {
    return PART_CATEGORIES.IGNITION;
  }
  if (/carburateur|carburetor|carburettor|vergaser|membraan|diaphragm|pakking|gasket|dichtung|revisieset|carb set|fixed jet|inlet control|strainer|spindle|fuel tank|brandstoftank|tank vent|filler cap|fuel hose|tankdop/i.test(name)) {
    return PART_CATEGORIES.CARBURETOR;
  }
  if (/zaagketting|saw chain|sägekette|sagekette|ketting(?!enzaag)|\bchain(?!saw)\b|zaagblad|guide bar|schwert|spreader|kettingspanner|chain tensioner/i.test(name)) {
    return PART_CATEGORIES.CUTTING_EQUIPMENT;
  }
  if (/maaikop|mowing head|autocut|trimmer|maaidraad|trimmer line|polycut|duocut|slagmes|mowing blade|cutter blade|rider plate|limit stop|deflector|thrust plate|skirt|protection|guard ring/i.test(name)) {
    return PART_CATEGORIES.TRIMMER_EQUIPMENT;
  }
  if (/starter|recoil|anwerfer|startkoord|starter rope|startveer|rewind spring|seilrolle|starter grip|pawl/i.test(name)) {
    return PART_CATEGORIES.STARTER;
  }
  if (/koppeling|clutch|kupplung|kettingwiel|sprocket|kettenrad|rim sprocket|rondsel|aandrijfwiel|clutch drum|drive shaft|pinion|flexible liner/i.test(name)) {
    return PART_CATEGORIES.CLUTCH;
  }
  if (/cilinder|cylinder|zylinder|zuiger|piston|kolben|zuigerveer|piston ring|crankshaft|krukas|krukaslager|drijfstang|crankcase|carter|uitlaat|muffler|auspuff|cooling plate/i.test(name)) {
    return PART_CATEGORIES.ENGINE;
  }
  if (/oliepomp|oil pump|ölpumpe|olpumpe|olieslang|wormwiel|worm gear|schneckentrieb|grease|vet|lubricant|smeermiddel/i.test(name)) {
    return PART_CATEGORIES.OIL_SYSTEM;
  }
  if (/handgreep|handle|griff|av-veer|veerelement|annular buffer|bumper spike|tandkam|behuizing|housing|kap|cover|haube|harness|draagharnas|hip pad|chest strap|chest plate|shoulder plate|shroud|shutter|handbeschermer|throttle|gashendel|rubber buffer|av spring/i.test(name)) {
    return PART_CATEGORIES.BODY;
  }

  return PART_CATEGORIES.OTHER;
}

/**
 * Normalizes user part number input across all writing styles.
 */
export function normalizeSearchPartNumber(rawInput = '') {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const s = rawInput.trim();
  const digitsOnly = s.replace(/\D/g, '');

  // 11 digits: exact part number
  if (digitsOnly.length === 11) {
    return {
      canonical: digitsOnly,
      formatted: `${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 7)} ${digitsOnly.slice(7)}`,
      type: 'EXACT_PART_NUMBER'
    };
  }

  // 4 digits starting with 0, 1, 4: STIHL series prefix
  if (digitsOnly.length === 4 && /^[014]/.test(digitsOnly)) {
    return {
      canonical: digitsOnly,
      formatted: `Serie ${digitsOnly}`,
      type: 'SERIES_PREFIX'
    };
  }

  return null;
}

/**
 * Checks for supersession or replacement relationships.
 */
export function checkPartSupersession(canonicalPartNo) {
  if (!canonicalPartNo) return null;
  const relations = getSupersessions();

  // 1. Is this part superseded by a newer part?
  const forward = relations.find(r => r.from_part === canonicalPartNo && r.active_in_catalog);
  if (forward) {
    return {
      type: 'SUPERSEDED_BY',
      target_part: forward.to_part,
      target_part_formatted: `${forward.to_part.slice(0, 4)} ${forward.to_part.slice(4, 7)} ${forward.to_part.slice(7)}`,
      component: forward.component,
      source_document: forward.source_document,
      source_text: forward.source_text,
      label: `Vervangen door onderdeel ${forward.to_part.slice(0, 4)} ${forward.to_part.slice(4, 7)} ${forward.to_part.slice(7)}`
    };
  }

  // 2. Does this part replace an older part?
  const backward = relations.find(r => r.to_part === canonicalPartNo && r.active_in_catalog);
  if (backward) {
    return {
      type: 'REPLACES',
      target_part: backward.from_part,
      target_part_formatted: `${backward.from_part.slice(0, 4)} ${backward.from_part.slice(4, 7)} ${backward.from_part.slice(7)}`,
      component: backward.component,
      source_document: backward.source_document,
      source_text: backward.source_text,
      label: `Vervangt vorig onderdeel ${backward.from_part.slice(0, 4)} ${backward.from_part.slice(4, 7)} ${backward.from_part.slice(7)}`
    };
  }

  return null;
}

export const AMAZON_MARKETPLACE_TAGS = {
  'amazon.nl': 'srihldecoder2-21',
  'amazon.de': 'srihldecode00-21'
};

/**
 * Returns the affiliate tag that belongs to the given marketplace.
 * Tags are never mixed between marketplaces.
 * @param {string} [marketplace]
 * @returns {string}
 */
export function getAmazonTagForMarketplace(marketplace = 'amazon.nl') {
  const mkt = String(marketplace || 'amazon.nl').trim().toLowerCase();
  if (mkt === 'amazon.de') {
    return process.env.AMAZON_ASSOCIATE_TAG_DE || AMAZON_MARKETPLACE_TAGS['amazon.de'];
  }
  return process.env.AMAZON_ASSOCIATE_TAG_NL || process.env.AMAZON_ASSOCIATE_TAG || AMAZON_MARKETPLACE_TAGS['amazon.nl'];
}

function orderOffersByMarketplace(offers) {
  const rank = (offer) => {
    const mkt = String(offer.marketplace || 'amazon.nl').toLowerCase();
    if (mkt === 'amazon.nl') return 0;
    if (mkt === 'amazon.de') return 1;
    return 2;
  };
  return [...offers].sort((a, b) => rank(a) - rank(b));
}

/**
 * Resolves purchase offer(s) for a part across all marketplaces.
 * All ACTIVE, Two-Gate verified offers are returned (Amazon.nl first, then Amazon.de).
 * Falls back to a compliant targeted search when no direct offer is eligible.
 */
export function resolvePurchaseOffer(partNumber, partName = '') {
  const norm = PartNormalizer.normalizePartNumber(partNumber);
  if (!norm) return null;

  const provider = new AmazonAffiliateProvider({ partnerTag: process.env.AMAZON_ASSOCIATE_TAG || '' });

  if (defaultVerifiedOfferRegistry.offers.size === 0) {
    try {
      defaultVerifiedOfferRegistry.loadFromFile();
    } catch (e) {
      // ignore
    }
  }

  // 1. All ACTIVE offers across marketplaces (Amazon.nl first, then Amazon.de)
  const activeOffers = typeof defaultVerifiedOfferRegistry.getActiveOffers === 'function'
    ? defaultVerifiedOfferRegistry.getActiveOffers(norm)
    : [];
  if (activeOffers.length > 0) {
    const offers = orderOffersByMarketplace(activeOffers).map((offer) => {
      const marketplace = String(offer.marketplace || 'amazon.nl').toLowerCase();
      const tag = offer.affiliate_tag || getAmazonTagForMarketplace(marketplace);
      return {
        provider: 'amazon',
        marketplace,
        asin: offer.asin,
        tag,
        url: `https://${marketplace}/dp/${offer.asin}?tag=${encodeURIComponent(tag)}`,
        brand: offer.brand || offer.manufacturer || null,
        label: marketplace === 'amazon.de'
          ? `Koop op Amazon.de (${offer.brand || 'Vervanger'})`
          : `Koop op Amazon (${offer.brand || 'Vervanger'})`,
        is_direct: true
      };
    });
    const primary = offers[0];
    return {
      type: 'DIRECT_ASIN',
      tier: COMMERCIAL_TIERS.DIRECT_VERIFIED,
      url: primary.url,
      asin: primary.asin,
      marketplace: primary.marketplace,
      label: primary.label,
      brand: primary.brand,
      is_direct: true,
      offers
    };
  }

  // 2. Safe compliant targeted search (Amazon.nl), plus Amazon.de when configured
  const nlTag = getAmazonTagForMarketplace('amazon.nl');
  const fallbackUrl = provider.buildSearchUrl(norm, nlTag, { partName });
  const offers = [{
    provider: 'amazon',
    marketplace: 'amazon.nl',
    asin: null,
    tag: nlTag,
    url: fallbackUrl,
    brand: null,
    label: 'Zoek op Amazon',
    is_direct: false
  }];
  const deTag = process.env.AMAZON_ASSOCIATE_TAG_DE;
  if (deTag && typeof provider.buildSearchUrl === 'function') {
    offers.push({
      provider: 'amazon',
      marketplace: 'amazon.de',
      asin: null,
      tag: deTag,
      url: provider.buildSearchUrl(norm, deTag, { partName }, {}, 'amazon.de'),
      brand: null,
      label: 'Zoek op Amazon.de',
      is_direct: false
    });
  }

  return {
    type: 'SEARCH_FALLBACK',
    tier: COMMERCIAL_TIERS.TARGETED_SEARCH,
    url: fallbackUrl,
    asin: null,
    marketplace: 'amazon.nl',
    label: 'Zoek op Amazon',
    brand: null,
    is_direct: false,
    offers
  };
}

export const getPartAffiliateOffer = resolvePurchaseOffer;

/**
 * Enriches a resolved part for search presentation.
 */
export function enrichSearchResultPart(partObj, database = null) {
  if (!partObj) return null;
  const partNo = partObj.part_number;
  const formattedNo = partObj.part_number_display || (partNo ? `${partNo.slice(0, 4)} ${partNo.slice(4, 7)} ${partNo.slice(7)}` : '');
  const cleanName = partObj.part_name_normalized || partObj.part_name || 'STIHL Vervangingsonderdeel';

  const category = classifyPartCategory(cleanName);
  const supersession = checkPartSupersession(partNo);
  const purchaseOffer = resolvePurchaseOffer(partNo, cleanName);

  // Determine compatible models
  let compatibleModels = [];
  let diagramSection = partObj.section_name || null;
  let diagramPosition = partObj.diagram_position || null;

  if (Array.isArray(partObj.compatible_models) && partObj.compatible_models.length > 0) {
    compatibleModels = partObj.compatible_models;
  } else {
    const resolved = PartCatalogResolver.resolvePartNumber(partNo, database);
    if (resolved && Array.isArray(resolved.compatible_models)) {
      compatibleModels = resolved.compatible_models;
    }
    if (!diagramSection && resolved?.technical_profile?.sections?.[0]) {
      diagramSection = resolved.technical_profile.sections[0];
    }
  }

  // Compatibility status: Bevestigde compatibiliteit vs Indicatieve modelreeks
  const hasConfirmedModels = compatibleModels.length > 0;
  const compatibilityStatus = hasConfirmedModels ? 'CONFIRMED' : 'INDICATIVE';
  const compatibilityBadge = hasConfirmedModels ? '✓ Bevestigde compatibiliteit' : '≈ Indicatieve modelreeks';
  const compatibilityClass = hasConfirmedModels
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : 'bg-amber-500/10 text-amber-300 border-amber-500/20';

  // Determine primary machine type
  let machineType = MACHINE_TYPES.OTHER;
  for (const m of compatibleModels) {
    const cat = String(m.category || m.category_slug || '').toLowerCase();
    const name = String(m.model_name || '').toUpperCase();
    if (cat.includes('kettingzaag') || name.startsWith('MS ') || name.startsWith('02')) {
      machineType = MACHINE_TYPES.CHAINSAW;
      break;
    }
    if (cat.includes('bosmaaier') || name.startsWith('FS ')) {
      machineType = MACHINE_TYPES.BRUSHCUTTER;
      break;
    }
    if (cat.includes('bladblazer') || name.startsWith('BG ') || name.startsWith('BR ') || name.startsWith('SH ')) {
      machineType = MACHINE_TYPES.BLOWER;
      break;
    }
    if (cat.includes('heggenschaar') || name.startsWith('HS ')) {
      machineType = MACHINE_TYPES.HEDGE_TRIMMER;
      break;
    }
    if (cat.includes('doorslijper') || name.startsWith('TS ')) {
      machineType = MACHINE_TYPES.CUT_OFF_SAW;
      break;
    }
  }

  return {
    part_number: partNo,
    part_number_display: formattedNo,
    part_name: cleanName,
    category_id: category.id,
    category_label: category.label,
    category_icon: category.icon,
    origin_type: 'OEM-referentie',
    compatibility_status: compatibilityStatus,
    compatibility_badge: compatibilityBadge,
    compatibility_class: compatibilityClass,
    machine_type_id: machineType.id,
    machine_type_label: machineType.label,
    compatible_models: compatibleModels,
    compatible_models_count: compatibleModels.length,
    diagram_section: diagramSection,
    diagram_position: diagramPosition,
    part_detail_url: `/onderdeelnummer/${partNo}/`,
    purchase_offer: purchaseOffer,
    supersession: supersession
  };
}

/**
 * Main Search Function for Intelligent Parts Search
 *
 * @param {string} query
 * @param {Object} [filters={}]
 * @param {Object} [options={}]
 * @returns {Object}
 */
export function searchIntelligentParts(query = '', filters = {}, options = {}) {
  const rawQ = (typeof query === 'string' ? query : '').trim();
  const limit = Math.max(1, Math.min(options.limit || 30, 100));
  const page = Math.max(1, options.page || 1);
  const offset = (page - 1) * limit;
  const database = options.database || null;

  const parsedPartNo = normalizeSearchPartNumber(rawQ);

  let rawCandidates = [];
  let isExactPartLookup = false;
  let activeSupersessionNotice = null;

  // Track 1: Part Number Search (11 digits or series prefix)
  if (parsedPartNo && parsedPartNo.type === 'EXACT_PART_NUMBER') {
    isExactPartLookup = true;
    const resolved = PartCatalogResolver.resolvePartNumber(parsedPartNo.canonical, database);
    if (resolved && resolved.part_number) {
      rawCandidates.push(resolved);
    }
    // Check if part has a supersession replacement
    activeSupersessionNotice = checkPartSupersession(parsedPartNo.canonical);
    if (activeSupersessionNotice && activeSupersessionNotice.target_part) {
      const targetResolved = PartCatalogResolver.resolvePartNumber(activeSupersessionNotice.target_part, database);
      if (targetResolved && targetResolved.part_number) {
        rawCandidates.push(targetResolved);
      }
    }
  } else if (parsedPartNo && parsedPartNo.type === 'SERIES_PREFIX') {
    // 4-digit series prefix e.g. "1121"
    rawCandidates = PartCatalogResolver.searchParts(parsedPartNo.canonical, 150, { database });
  } else {
    // Track 2: Model Scoping or General Search
    const modelExtraction = PartCatalogResolver.extractModelAndComponent(rawQ);
    const hasPureModelQuery = modelExtraction && modelExtraction.canonical_model_id && !modelExtraction.component_query;
    const targetModelId = filters.model || (hasPureModelQuery ? modelExtraction.canonical_model_id : null);

    const hasModelParts = Boolean(targetModelId && (
      PartCatalogResolver.hasPartsForModel(targetModelId, database) ||
      (PartCatalogResolver.getPartsForModel(targetModelId, null, null, database)?.length > 0)
    ));

    if (hasModelParts && (!modelExtraction || !modelExtraction.component_query)) {
      // Return parts for this model
      rawCandidates = PartCatalogResolver.getPartsForModel(targetModelId, null, null, database);
    } else {
      // General / composite / text search
      rawCandidates = PartCatalogResolver.searchParts(rawQ, 150, {
        database,
        modelId: filters.model || options.modelId
      });
    }
  }

  // Enrich raw parts
  let enriched = rawCandidates.map(p => enrichSearchResultPart(p, database)).filter(Boolean);

  // Deduplicate by part number
  const seen = new Set();
  enriched = enriched.filter(p => {
    if (seen.has(p.part_number)) return false;
    seen.add(p.part_number);
    return true;
  });

  // Apply Multi-Dimensional Filters
  if (filters.machine_type && filters.machine_type !== 'all') {
    enriched = enriched.filter(p => p.machine_type_id === filters.machine_type);
  }

  if (filters.category && filters.category !== 'all') {
    enriched = enriched.filter(p => p.category_id === filters.category);
  }

  if (filters.compatibility && filters.compatibility !== 'all') {
    enriched = enriched.filter(p => p.compatibility_status === filters.compatibility);
  }

  if (filters.model && filters.model !== 'all') {
    const filterModelClean = filters.model.toLowerCase().replace(/[^a-z0-9]/g, '');
    enriched = enriched.filter(p => {
      return p.compatible_models.some(m => {
        const mClean = (m.model_name || m.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return mClean.includes(filterModelClean);
      });
    });
  }

  if (filters.has_direct_link === true || filters.has_direct_link === 'true') {
    enriched = enriched.filter(p => p.purchase_offer && p.purchase_offer.is_direct);
  }

  const totalMatches = enriched.length;
  const paginatedResults = enriched.slice(offset, offset + limit);
  const totalPages = Math.ceil(totalMatches / limit) || 1;

  // Available filter counts based on current candidate set
  const availableCategories = Object.values(PART_CATEGORIES).map(cat => ({
    ...cat,
    count: enriched.filter(p => p.category_id === cat.id).length
  })).filter(c => c.count > 0);

  const availableMachineTypes = Object.values(MACHINE_TYPES).map(mt => ({
    ...mt,
    count: enriched.filter(p => p.machine_type_id === mt.id).length
  })).filter(m => m.count > 0);

  return {
    query: rawQ,
    is_exact_part_lookup: isExactPartLookup,
    total_matches: totalMatches,
    page,
    limit,
    total_pages: totalPages,
    results: paginatedResults,
    supersession_notice: activeSupersessionNotice,
    available_filters: {
      categories: availableCategories,
      machine_types: availableMachineTypes
    },
    applied_filters: filters
  };
}
