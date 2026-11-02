/**
 * Direct Parts Engine for STIHLDecoder.nl
 * Phase 3 — Direct Parts Integration on Model Search Results
 *
 * Extracts authentic, evidence-backed maintenance and wear parts
 * specifically tailored to the machine category, drive type, and configuration.
 */

import { PartCatalogResolver } from './PartCatalogResolver.js';
import { PartNormalizer } from './PartNormalizer.js';
import { AffiliateOfferResolver } from '../affiliate/AffiliateOfferResolver.js';
import {
  getSafeModelPartsPath,
  getSafeCategorySlug,
  isPetrolModel,
  isBatteryModel
} from '../publicationRules.js';

export const COMPATIBILITY_TIERS = {
  CONFIRMED: 'CONFIRMED',       // Bevestigde compatibiliteit
  INDICATIVE: 'INDICATIVE',     // Indicatieve compatibiliteit
  UNESTABLISHED: 'UNESTABLISHED'// Niet vastgesteld (excluded from primary selection)
};

export const MACHINE_CATEGORIES = {
  CHAINSAW: 'CHAINSAW',
  BRUSHCUTTER: 'BRUSHCUTTER',
  BLOWER: 'BLOWER',
  HEDGE_TRIMMER: 'HEDGE_TRIMMER',
  CUT_OFF_SAW: 'CUT_OFF_SAW',
  LAWN_MOWER: 'LAWN_MOWER',
  PRESSURE_WASHER: 'PRESSURE_WASHER',
  OTHER: 'OTHER'
};

/**
 * Detects the machine category from category slug, model name, or equipment type.
 * @param {Object|string} modelObj
 * @param {string} [categorySlug]
 * @returns {string}
 */
export function detectMachineCategory(modelObj, categorySlug = '') {
  const cat = String(categorySlug || (typeof modelObj === 'object' ? modelObj?.category_slug || modelObj?.category : '') || '').toLowerCase();
  const name = String(typeof modelObj === 'object' ? modelObj?.model_name || modelObj?.id : modelObj || '').toUpperCase();

  if (cat.includes('kettingzaag') || cat.includes('chainsaw') || name.startsWith('MS ') || name.startsWith('MSA ') || name.startsWith('MSE ')) {
    return MACHINE_CATEGORIES.CHAINSAW;
  }
  if (cat.includes('bosmaaier') || cat.includes('strimmer') || cat.includes('trimmer') || cat.includes('kantensnijder') || name.startsWith('FS ') || name.startsWith('FSA ') || name.startsWith('FSE ')) {
    return MACHINE_CATEGORIES.BRUSHCUTTER;
  }
  if (cat.includes('bladblazer') || cat.includes('blower') || cat.includes('nevelspuit') || cat.includes('zuighakselaar') || name.startsWith('BG ') || name.startsWith('BR ') || name.startsWith('SH ') || name.startsWith('BGE ') || name.startsWith('SHA ')) {
    return MACHINE_CATEGORIES.BLOWER;
  }
  if (cat.includes('heggenschaar') || cat.includes('hedge') || name.startsWith('HS ') || name.startsWith('HLA ') || name.startsWith('HSE ')) {
    return MACHINE_CATEGORIES.HEDGE_TRIMMER;
  }
  if (cat.includes('doorslijper') || cat.includes('cut-off') || name.startsWith('TS ') || name.startsWith('TSA ')) {
    return MACHINE_CATEGORIES.CUT_OFF_SAW;
  }
  if (cat.includes('grasmaaier') || cat.includes('mower') || name.startsWith('RM ') || name.startsWith('RMA ') || name.startsWith('RME ')) {
    return MACHINE_CATEGORIES.LAWN_MOWER;
  }
  if (cat.includes('hogedruk') || name.startsWith('RE ')) {
    return MACHINE_CATEGORIES.PRESSURE_WASHER;
  }
  return MACHINE_CATEGORIES.OTHER;
}

/**
 * Category-specific wear and maintenance part rules.
 * Each entry defines an ordered priority slot with inclusion regex and strict negative guards.
 */
function getCategoryWearRules(machineCategory, isPetrol) {
  const commonPetrolRules = isPetrol ? [
    {
      slot: 'spark_plug',
      label: 'Bougie',
      regex: /\b(spark plug|bougie|zündkerze)\b/i,
      negativeRegex: /\b(cover|boot|terminal|wrench|plug cap|bougiedop|stecker)\b/i,
      categoryLabel: 'Ontsteking'
    },
    {
      slot: 'air_filter',
      label: 'Luchtfilter',
      regex: /\b(air filter|luchtfilter|filterelement|filter element|hd2)\b/i,
      negativeRegex: /\b(cover|base|housing|deksel|behuizing)\b/i,
      categoryLabel: 'Filters'
    },
    {
      slot: 'fuel_filter',
      label: 'Brandstoffilter',
      regex: /\b(fuel filter|brandstoffilter|pickup body|saugkopf|benzinefilter)\b/i,
      negativeRegex: /\b(hose|line|slang)\b/i,
      categoryLabel: 'Brandstof'
    },
    {
      slot: 'carburetor',
      label: 'Carburateur / Membranen',
      regex: /\b(carburetor|carburettor|carburateur|vergaser|diaphragm|membraanset|set of carb)\b/i,
      negativeRegex: /\b(screw|bolt|gasket only|schroef)\b/i,
      categoryLabel: 'Brandstofsysteem'
    },
    {
      slot: 'starter',
      label: 'Trekstarter / Startkoord',
      regex: /\b(recoil starter|handstarter|starter rope|startkoord|anwerfseil|starter assembly|trekstarter)\b/i,
      negativeRegex: /\b(spring only|pawl only|veer)\b/i,
      categoryLabel: 'Startsysteem'
    }
  ] : [
    {
      slot: 'air_filter',
      label: 'Luchtfilter / Aanzuigfilter',
      regex: /\b(air filter|luchtfilter|filterelement|filter element)\b/i,
      negativeRegex: /\b(cover|base|housing|deksel|behuizing)\b/i,
      categoryLabel: 'Filters'
    }
  ];

  switch (machineCategory) {
    case MACHINE_CATEGORIES.CHAINSAW:
      return [
        ...commonPetrolRules,
        {
          slot: 'guide_bar',
          label: 'Zaagblad / Zwaard',
          regex: /\b(guide bar|zaagblad|führungsschiene|rollomatic|duromatic|carving)\b/i,
          negativeRegex: /\b(cover|guard|beschermer|hoes)\b/i,
          categoryLabel: 'Zaaguitrusting'
        },
        {
          slot: 'saw_chain',
          label: 'Zaagketting',
          regex: /\b(saw chain|zaagketting|sägekette|picco|rapid micro|rapid super)\b/i,
          negativeRegex: /\b(brake|rem|tensioner|spanner|catcher)\b/i,
          categoryLabel: 'Zaaguitrusting'
        },
        {
          slot: 'sprocket',
          label: 'Kettingwiel / Rondsel',
          regex: /\b(chain sprocket|kettingwiel|rim sprocket|spur sprocket|kettenrad)\b/i,
          negativeRegex: /\b(cover|washer|ring only)\b/i,
          categoryLabel: 'Aandrijving'
        },
        {
          slot: 'oil_pump',
          label: 'Oliepomp / Wormwiel',
          regex: /\b(oil pump|oliepomp|worm gear|schnecke)\b/i,
          negativeRegex: /\b(hose only|slang)\b/i,
          categoryLabel: 'Smering'
        }
      ];

    case MACHINE_CATEGORIES.BRUSHCUTTER:
      return [
        ...commonPetrolRules,
        {
          slot: 'mowing_head',
          label: 'Maaikop / Maaidraad',
          regex: /\b(mowing head|maaikop|autocut|trimcut|durocut|polycut|mähkopf|strimmer line|maaidraad)\b/i,
          negativeRegex: /\b(chain|zaagketting|guide bar|zaagblad)\b/i,
          categoryLabel: 'Snijgarnituur'
        },
        {
          slot: 'cutting_blade',
          label: 'Maaimes / Slagmes',
          regex: /\b(cutting blade|grass cutting blade|brush knife|dickichtmesser|grasschneideblatt|maaimes|slagmes)\b/i,
          negativeRegex: /\b(chain|zaagblad)\b/i,
          categoryLabel: 'Snijgarnituur'
        },
        {
          slot: 'gear_head',
          label: 'Aandrijfkop / Haakse overbrenging',
          regex: /\b(gear head|getriebekopf|haakse overbrenging|bevel gear)\b/i,
          negativeRegex: /\b(screw|bolt)\b/i,
          categoryLabel: 'Aandrijving'
        },
        {
          slot: 'deflector',
          label: 'Beschermkap / Deflector',
          regex: /\b(deflector|strimmer guard|beschermkap|schutz)\b/i,
          negativeRegex: /\b(chain|zaagblad)\b/i,
          categoryLabel: 'Veiligheid'
        }
      ];

    case MACHINE_CATEGORIES.BLOWER:
      return [
        ...commonPetrolRules,
        {
          slot: 'blower_tube',
          label: 'Blaasbuis / Mondstuk',
          regex: /\b(blower tube|nozzle|blaasbuis|mondstuk|blasrohr|düse)\b/i,
          negativeRegex: /\b(chain|blade|mowing|zaagblad)\b/i,
          categoryLabel: 'Blaasgarnituur'
        }
      ];

    case MACHINE_CATEGORIES.HEDGE_TRIMMER:
      return [
        ...commonPetrolRules,
        {
          slot: 'cutter_blade',
          label: 'Mesbalk / Messenset',
          regex: /\b(cutter blade|cutting blade|mesbalk|schneidmesser|blade set)\b/i,
          negativeRegex: /\b(chain|zaagketting|guide bar)\b/i,
          categoryLabel: 'Snijgarnituur'
        },
        {
          slot: 'gear',
          label: 'Aandrijving / Tandwiel',
          regex: /\b(gear|getriebe|tandwiel|connecting rod)\b/i,
          negativeRegex: /\b(chain|bar)\b/i,
          categoryLabel: 'Aandrijving'
        }
      ];

    case MACHINE_CATEGORIES.CUT_OFF_SAW:
      return [
        ...commonPetrolRules,
        {
          slot: 'cutting_wheel',
          label: 'Doorslijpschijf',
          regex: /\b(abrasive wheel|diamond wheel|cutting wheel|doorslijpschijf|trennschleifscheibe)\b/i,
          negativeRegex: /\b(chain|guide bar)\b/i,
          categoryLabel: 'Slijpuitrusting'
        },
        {
          slot: 'v_belt',
          label: 'V-snaar / Aandrijfriem',
          regex: /\b(v-belt|drive belt|v-snaar|riem|keilriemen)\b/i,
          negativeRegex: /\b(pulley only)\b/i,
          categoryLabel: 'Aandrijving'
        }
      ];

    default:
      return commonPetrolRules;
  }
}

/**
 * Checks if a part is strictly forbidden for a machine category.
 * Prevents showing chainsaw parts on brushcutters/blowers or mowing heads on chainsaws.
 */
function isPartForbiddenForCategory(partName, machineCategory) {
  const pLower = partName.toLowerCase();

  if (machineCategory === MACHINE_CATEGORIES.BRUSHCUTTER ||
      machineCategory === MACHINE_CATEGORIES.BLOWER ||
      machineCategory === MACHINE_CATEGORIES.HEDGE_TRIMMER) {
    if (/\b(guide bar|zaagblad|saw chain|zaagketting|chain brake|kettingrem|oil pump|oliepomp)\b/i.test(pLower)) {
      return true;
    }
  }

  if (machineCategory === MACHINE_CATEGORIES.CHAINSAW ||
      machineCategory === MACHINE_CATEGORIES.BLOWER ||
      machineCategory === MACHINE_CATEGORIES.CUT_OFF_SAW) {
    if (/\b(mowing head|maaikop|strimmer line|maaidraad|grass blade|maaimes|deflector kit 370)\b/i.test(pLower)) {
      return true;
    }
  }

  return false;
}

const affiliateResolver = new AffiliateOfferResolver();

/**
 * Resolves direct maintenance parts for a STIHL model result card.
 *
 * @param {Object|string} modelInput Model object or model string
 * @param {Object} [options]
 * @param {string} [options.variantKey]
 * @param {string} [options.configurationKey]
 * @param {number} [options.limit=6]
 * @param {Object} [database]
 * @returns {Object}
 */
export function getDirectPartsForModel(modelInput, options = {}, database = null) {
  const limit = Math.max(1, Math.min(options.limit || 6, 12));
  const variantKey = options.variantKey || null;
  const configurationKey = options.configurationKey || null;

  if (!modelInput) {
    return {
      available: false,
      model_name: '',
      canonical_parts_path: null,
      parts: [],
      total_catalog_parts: 0,
      machine_category: MACHINE_CATEGORIES.OTHER
    };
  }

  const modelObj = (typeof modelInput === 'object') ? modelInput : null;
  const modelName = (modelObj?.model_name || String(modelInput)).trim();
  const canonicalModelId = PartCatalogResolver.resolveCanonicalModelId(modelObj || modelName, database);

  const categorySlug = modelObj ? getSafeCategorySlug(modelObj) : '';
  const canonicalPartsPath = modelObj ? getSafeModelPartsPath(modelObj) : (categorySlug ? `/${categorySlug}/${canonicalModelId.replace(/_/g, '-')}/onderdelen/` : null);

  const isPetrol = modelObj ? isPetrolModel(modelObj) : !modelName.startsWith('MSA') && !modelName.startsWith('FSA') && !modelName.startsWith('BGA') && !modelName.startsWith('HLA');
  const machineCategory = detectMachineCategory(modelObj || modelName, categorySlug);

  const sections = PartCatalogResolver.getSectionsForModel(canonicalModelId, variantKey, configurationKey, database);
  if (!sections || sections.length === 0) {
    return {
      available: false,
      model_name: modelName,
      canonical_parts_path: canonicalPartsPath,
      parts: [],
      total_catalog_parts: 0,
      machine_category: machineCategory
    };
  }

  const totalCatalogParts = sections.reduce((acc, s) => acc + s.parts.length, 0);
  const wearRules = getCategoryWearRules(machineCategory, isPetrol);

  // Flatten all parts with section context and index
  const allParts = [];
  sections.forEach((sec, secIdx) => {
    sec.parts.forEach(p => {
      allParts.push({
        ...p,
        section_index: secIdx,
        section_name: sec.section_name
      });
    });
  });

  const selectedParts = [];
  const seenPartNumbers = new Set();

  for (const rule of wearRules) {
    if (selectedParts.length >= limit) break;

    const candidate = allParts.find(p => {
      if (seenPartNumbers.has(p.part_number)) return false;
      if (isPartForbiddenForCategory(p.part_name, machineCategory)) return false;
      if (rule.negativeRegex && rule.negativeRegex.test(p.part_name)) return false;
      return rule.regex.test(p.part_name);
    });

    if (candidate) {
      seenPartNumbers.add(candidate.part_number);

      // Determine compatibility tier:
      // In canonical sections matching base or current config, fitment is strictly CONFIRMED.
      const isConfirmed = candidate.fitment_scope === 'BASE_MODEL_CONFIRMED' ||
                          candidate.fitment_scope === 'EXACT_CONFIGURATION' ||
                          candidate.fitment_scope === 'EXACT_VARIANT' ||
                          candidate.fitment_scope === 'MULTI_VARIANT_EXPLICIT';

      const compatibilityTier = isConfirmed ? COMPATIBILITY_TIERS.CONFIRMED : COMPATIBILITY_TIERS.INDICATIVE;

      // Exploded diagram integration
      const isMeaningfulSection = candidate.section_name &&
                                 candidate.section_name !== 'Unresolved Diagram Section' &&
                                 candidate.section_name !== 'Algemene sectie' &&
                                 candidate.section_name !== 'Model Parts Breakdown';

      const diagramUrl = (canonicalPartsPath && isMeaningfulSection)
        ? `${canonicalPartsPath}#section-${candidate.section_index}`
        : null;

      // Commercial purchase offer (Amazon affiliate)
      const offers = affiliateResolver.resolveOffers({
        partNumber: candidate.part_number,
        partName: candidate.part_name,
        model: canonicalModelId
      });

      const primaryOffer = (offers && offers.length > 0) ? offers[0] : null;

      selectedParts.push({
        slot: rule.slot,
        category_label: rule.categoryLabel || rule.label,
        wear_label: rule.label,
        part_number: candidate.part_number,
        part_number_display: candidate.part_number_display || PartNormalizer.formatPartNumber(candidate.part_number),
        part_name: candidate.part_name,
        origin_type: 'OEM-referentie',
        compatibility_tier: compatibilityTier,
        compatibility_badge_text: isConfirmed ? '✓ Bevestigde compatibiliteit' : '≈ Indicatieve compatibiliteit',
        compatibility_badge_class: isConfirmed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        diagram_position: candidate.has_meaningful_position ? candidate.diagram_position : null,
        diagram_section_name: isMeaningfulSection ? candidate.section_name : null,
        diagram_url: diagramUrl,
        part_detail_url: `/onderdeelnummer/${candidate.part_number}/`,
        purchase_url: primaryOffer ? primaryOffer.url : null,
        purchase_label: primaryOffer ? (primaryOffer.link_type === 'DIRECT_ASIN' ? 'Bekijk product op Amazon' : 'Zoek op Amazon') : null,
        is_direct_asin: primaryOffer ? primaryOffer.link_type === 'DIRECT_ASIN' : false
      });
    }
  }

  return {
    available: selectedParts.length > 0,
    model_name: modelName,
    canonical_parts_path: canonicalPartsPath,
    parts: selectedParts,
    total_catalog_parts: totalCatalogParts,
    machine_category: machineCategory
  };
}
