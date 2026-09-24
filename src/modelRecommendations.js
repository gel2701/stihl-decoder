/**
 * modelRecommendations.js
 * Phase 47 Model-First Passport & Affiliate Foundation.
 *
 * Implements strict three-layer architectural separation:
 * 1. MACHINE IDENTITY (canonical model, series, category)
 * 2. TECHNICAL COMPATIBILITY (evidence-based compatibility gates)
 * 3. COMMERCIAL OFFERS (merchants, links, pricing - currently zero fictional offers)
 */

export const COMPATIBILITY_STATUSES = Object.freeze({
  VERIFIED_MODEL_COMPATIBILITY: 'VERIFIED_MODEL_COMPATIBILITY',
  SPECIFICATION_MATCH_ONLY: 'SPECIFICATION_MATCH_ONLY',
  GENERIC_CATEGORY_RECOMMENDATION: 'GENERIC_CATEGORY_RECOMMENDATION',
  UNVERIFIED: 'UNVERIFIED',
  CONFLICTED: 'CONFLICTED'
});

export const RECOMMENDATION_TYPES = Object.freeze({
  SPARK_PLUG: 'spark_plug',
  AIR_FILTER: 'air_filter',
  FUEL_FILTER: 'fuel_filter',
  CHAIN: 'chain',
  BAR: 'bar',
  CHAIN_OIL: 'chain_oil',
  TWO_STROKE_OIL: 'two_stroke_oil',
  FILING_TOOL: 'filing_tool',
  MAINTENANCE_TOOL: 'maintenance_tool',
  PROTECTIVE_GEAR: 'protective_gear'
});

export const AFFILIATE_DISCLOSURE_NOTICE =
  'Bij sommige links kunnen wij een vergoeding ontvangen. Dit heeft geen invloed op de technische informatie.';

function findEligibleEvidence(evidenceList, modelSlug, field) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) return null;
  const normalizedSlug = String(modelSlug || '').trim().toLowerCase();
  return evidenceList.find((ev) => {
    if (!ev) return false;
    const evSlug = String(ev.model_slug || ev.slug || '').trim().toLowerCase();
    const evModelId = String(ev.model_id || ev.canonical_model_id || '').trim().toLowerCase();
    const matchesScope = evSlug === normalizedSlug || evModelId === normalizedSlug || evModelId === `stihl_${normalizedSlug.replace(/-/g, '_')}`;
    if (!matchesScope) return false;
    if (ev.display_eligible !== true) return false;
    if (ev.field && ev.field !== field && ev.field_name !== field) return false;

    const status = String(ev.public_evidence_status || ev.source_status || ev.status || '').toUpperCase();
    const isReliableStatus = ['OFFICIAL_DOCUMENTED', 'VERIFIED', 'ESTABLISHED', 'CONFIRMED'].includes(status);
    const sourceClass = String(ev.source_class || '').toUpperCase();
    const isReliableClass = ['OFFICIAL_MANUAL', 'OFFICIAL_PARTS_LIST', 'PRIMARY_SOURCE', 'STIHL_OFFICIAL', 'MANUFACTURER_DOCUMENT'].includes(sourceClass);

    return isReliableStatus || isReliableClass;
  }) || null;
}

/**
 * Builds safe recommendation slots for a STIHL machine.
 *
 * Strictly enforces that:
 * - VERIFIED_MODEL_COMPATIBILITY requires explicit, display-eligible evidence with reliable source provenance.
 * - Technical specs without documented evidence yield SPECIFICATION_MATCH_ONLY (never VERIFIED).
 * - Partial chain specs (pitch+gauge without drive link count or official part record) yield SPECIFICATION_MATCH_ONLY.
 * - Fictional merchants and affiliate links are NEVER generated.
 * - Commercial offers remain empty until legitimate partnerships are established.
 */
export function buildModelRecommendations(identity = {}, technicalSpecs = {}, options = {}) {
  const modelSlug = String(identity.model_slug || identity.slug || '').trim().toLowerCase();
  const modelName = String(identity.model_name || identity.name || 'STIHL Machine').trim();
  const category = String(identity.category || 'Kettingzaag').trim();
  const seriesCode = identity.series_code || null;

  const evidenceList = options.compatibilityEvidence || options.publicEvidenceFacts || options.evidence || options.publicEvidenceFields || technicalSpecs._evidence || [];

  const isChainsaw = category.toLowerCase().includes('kettingzaag') || category.toLowerCase().includes('chainsaw');
  const isCombustion = technicalSpecs.fuel_tank_l != null || technicalSpecs.displacement_cc != null || technicalSpecs.spark_plug != null;

  const recommendations = [];

  // 1. Bougie (Spark Plug) - Combustion machines only
  if (isCombustion) {
    const sparkPlugSpec = technicalSpecs.spark_plug ? String(technicalSpecs.spark_plug).trim() : null;
    const gapSpec = technicalSpecs.electrode_gap_mm ? `${technicalSpecs.electrode_gap_mm} mm` : null;
    const sparkEvidence = findEligibleEvidence(evidenceList, modelSlug, 'spark_plug');

    if (sparkPlugSpec && sparkEvidence) {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_spark_plug`,
        recommendation_type: RECOMMENDATION_TYPES.SPARK_PLUG,
        category_slug: 'bougies',
        label: 'Bougie',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
          display_claim: `Geschikt voor jouw STIHL ${modelName}`,
          display_guidance: `Fabrieksspecificatie: ${sparkPlugSpec}${gapSpec ? ` (elektrodenafstand ${gapSpec})` : ''}`,
          evidence_basis: ['OFFICIAL_DOCUMENTED_EVIDENCE', `spark_plug: ${sparkPlugSpec}`, sparkEvidence.source_class || sparkEvidence.public_evidence_status],
          technical_spec_ref: {
            field: 'spark_plug',
            value: sparkPlugSpec,
            unit: null
          }
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    } else if (sparkPlugSpec) {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_spark_plug`,
        recommendation_type: RECOMMENDATION_TYPES.SPARK_PLUG,
        category_slug: 'bougies',
        label: 'Bougie',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
          display_claim: 'Specificatiematch op basis van technische gegevens',
          display_guidance: `Opgegeven type: ${sparkPlugSpec}${gapSpec ? ` (${gapSpec})` : ''}. Controleer typeplaatje of handleiding vóór installatie.`,
          evidence_basis: ['SPECIFICATION_MATCH_WITHOUT_VERIFIED_DOCUMENT_EVIDENCE', `spark_plug: ${sparkPlugSpec}`],
          technical_spec_ref: {
            field: 'spark_plug',
            value: sparkPlugSpec,
            unit: null
          }
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    } else {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_spark_plug`,
        recommendation_type: RECOMMENDATION_TYPES.SPARK_PLUG,
        category_slug: 'bougies',
        label: 'Bougie controleren',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.UNVERIFIED,
          display_claim: 'Controleer bougietype vóór bestelling',
          display_guidance: 'Raadpleeg de handleiding of het typeplaatje voor de voorgeschreven warmtewaarde.',
          evidence_basis: ['CATEGORY_INFERENCE'],
          technical_spec_ref: null
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    }
  }

  // 2. Luchtfilter (Air Filter)
  if (isCombustion) {
    recommendations.push({
      recommendation_id: `rec_${modelSlug}_air_filter`,
      recommendation_type: RECOMMENDATION_TYPES.AIR_FILTER,
      category_slug: 'luchtfilters',
      label: 'Luchtfilter',
      technical_compatibility: {
        compatibility_status: COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
        display_claim: `Filtertype voor ${modelName} verifiëren`,
        display_guidance: 'Controleer of jouw machine een vilt-, HD2- of gaasfilter gebruikt.',
        evidence_basis: ['MODEL_SERIES_MATCH'],
        technical_spec_ref: null
      },
      commercial_offers: {
        offers_active: false,
        disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
        offers: []
      }
    });
  }

  // 3. Zaagketting (Chain) - Chainsaws only
  if (isChainsaw) {
    const pitch = technicalSpecs.chain_pitch ? String(technicalSpecs.chain_pitch).trim() : null;
    const gauge = technicalSpecs.chain_gauge_mm ? `${technicalSpecs.chain_gauge_mm} mm` : null;
    const driveLinks = technicalSpecs.drive_links || technicalSpecs.drive_link_count || technicalSpecs.chain_drive_links || null;

    const chainEvidence = findEligibleEvidence(evidenceList, modelSlug, 'chain') ||
                          findEligibleEvidence(evidenceList, modelSlug, 'chain_pitch');

    const hasFullConfig = Boolean(pitch && gauge && driveLinks && chainEvidence);
    const hasExplicitPartRecord = Boolean(chainEvidence && (chainEvidence.part_type === 'chain' || chainEvidence.drive_links || chainEvidence.full_config));

    if (hasFullConfig || hasExplicitPartRecord) {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_chain`,
        recommendation_type: RECOMMENDATION_TYPES.CHAIN,
        category_slug: 'zaagkettingen',
        label: 'Zaagketting',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
          display_claim: `Geschikt voor jouw STIHL ${modelName}`,
          display_guidance: `Kettingsteek: ${pitch}, aandrijfschakeldikte: ${gauge}${driveLinks ? `, aandrijfschakels: ${driveLinks}` : ''}`,
          evidence_basis: ['OFFICIAL_DOCUMENTED_EVIDENCE', `pitch: ${pitch}`, `gauge: ${gauge}`, `drive_links: ${driveLinks}`],
          technical_spec_ref: {
            field: 'chain',
            value: `${pitch} @ ${gauge}${driveLinks ? ` (${driveLinks}L)` : ''}`,
            unit: null
          }
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    } else if (pitch && gauge) {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_chain`,
        recommendation_type: RECOMMENDATION_TYPES.CHAIN,
        category_slug: 'zaagkettingen',
        label: 'Zaagketting',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
          display_claim: 'Steek en dikte komen overeen; controleer aantal aandrijfschakels en zwaardconfiguratie.',
          display_guidance: `Kettingsteek: ${pitch}, aandrijfschakeldikte: ${gauge}. Het benodigde aantal schakels hangt af van het gemonteerde zaagblad.`,
          evidence_basis: ['PARTIAL_SPECIFICATION_MATCH', `pitch: ${pitch}`, `gauge: ${gauge}`],
          technical_spec_ref: {
            field: 'chain_pitch',
            value: `${pitch} @ ${gauge}`,
            unit: null
          }
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    } else {
      recommendations.push({
        recommendation_id: `rec_${modelSlug}_chain`,
        recommendation_type: RECOMMENDATION_TYPES.CHAIN,
        category_slug: 'zaagkettingen',
        label: 'Zaagketting kiezen',
        technical_compatibility: {
          compatibility_status: COMPATIBILITY_STATUSES.UNVERIFIED,
          display_claim: 'Controleer steek, dikte en aantal schakels vóór aankoop',
          display_guidance: 'De exacte kettingmaat hangt af van het gemonteerde zaagblad.',
          evidence_basis: ['CATEGORY_INFERENCE'],
          technical_spec_ref: null
        },
        commercial_offers: {
          offers_active: false,
          disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
          offers: []
        }
      });
    }

    // 4. Kettingolie (Chain Oil)
    recommendations.push({
      recommendation_id: `rec_${modelSlug}_chain_oil`,
      recommendation_type: RECOMMENDATION_TYPES.CHAIN_OIL,
      category_slug: 'kettingolie',
      label: 'Kettingzaagolie',
      technical_compatibility: {
        compatibility_status: COMPATIBILITY_STATUSES.GENERIC_CATEGORY_RECOMMENDATION,
        display_claim: 'Kettingolie voor kettingzaagtoepassingen',
        display_guidance: 'Gebruik hechtolie voor zaagkettingen met goede viscositeit en smeringseigenschappen.',
        evidence_basis: ['CATEGORY_STANDARD'],
        technical_spec_ref: null
      },
      commercial_offers: {
        offers_active: false,
        disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
        offers: []
      }
    });

    // 5. Vijlen & Onderhoudsgereedschap
    recommendations.push({
      recommendation_id: `rec_${modelSlug}_filing_tool`,
      recommendation_type: RECOMMENDATION_TYPES.FILING_TOOL,
      category_slug: 'ketting-vijlen',
      label: 'Kettingvijl & Vijlmal',
      technical_compatibility: {
        compatibility_status: COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
        display_claim: 'Kies vijldiameter passend bij de kettingsteek',
        display_guidance: 'Veelgebruikt: 4.0 mm (3/8" P), 4.8 mm (.325"), of 5.2 mm (3/8").',
        evidence_basis: ['MAINTENANCE_PRACTICE'],
        technical_spec_ref: null
      },
      commercial_offers: {
        offers_active: false,
        disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
        offers: []
      }
    });
  }

  // 6. 2-Takt mengolie (Two-Stroke Oil) - Combustion only
  if (isCombustion) {
    recommendations.push({
      recommendation_id: `rec_${modelSlug}_two_stroke_oil`,
      recommendation_type: RECOMMENDATION_TYPES.TWO_STROKE_OIL,
      category_slug: 'tweetakt-olie',
      label: '2-Takt Mengsmering',
      technical_compatibility: {
        compatibility_status: COMPATIBILITY_STATUSES.GENERIC_CATEGORY_RECOMMENDATION,
        display_claim: 'Controleer de voorgeschreven brandstof/mengverhouding voor jouw model.',
        display_guidance: 'Raadpleeg de handleiding van jouw model voor de exacte mengverhouding (vaak 1:50 bij STIHL 2-takt olie of gebruik kant-en-klare alkylaatbenzine).',
        evidence_basis: ['STIHL_STANDARD_OPERATING_PROCEDURE'],
        technical_spec_ref: null
      },
      commercial_offers: {
        offers_active: false,
        disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
        offers: []
      }
    });
  }

  // 7. Persoonlijke beschermingsmiddelen (PBM)
  recommendations.push({
    recommendation_id: `rec_${modelSlug}_protective_gear`,
    recommendation_type: RECOMMENDATION_TYPES.PROTECTIVE_GEAR,
    category_slug: 'beschermingsmiddelen',
    label: 'Veiligheid & Bescherming',
    technical_compatibility: {
      compatibility_status: COMPATIBILITY_STATUSES.GENERIC_CATEGORY_RECOMMENDATION,
      display_claim: isChainsaw ? 'Zaagbroek, gehoorbescherming en werkhandschoenen' : 'Gehoorbescherming, veiligheidsbril en handschoenen',
      display_guidance: 'Draag altijd geschikte PBM bij het werken met motorgereedschap.',
      evidence_basis: ['SAFETY_REGULATIONS'],
      technical_spec_ref: null
    },
    commercial_offers: {
      offers_active: false,
      disclosure_template: AFFILIATE_DISCLOSURE_NOTICE,
      offers: []
    }
  });

  return {
    schema_version: '1.0.0',
    machine_identity: {
      model_slug: modelSlug,
      model_name: modelName,
      category,
      series_code: seriesCode
    },
    recommendations
  };
}

/**
 * Renders HTML for recommendation slots to display inside a passport or machine dossier.
 * Shows verified guidance without commercial affiliate spam.
 */
export function renderPassportRecommendationSlotsHtml(recommendationsModel = {}) {
  const recommendations = Array.isArray(recommendationsModel.recommendations) ? recommendationsModel.recommendations : [];
  if (recommendations.length === 0) return '';

  const modelName = recommendationsModel.machine_identity?.model_name || 'jouw machine';

  return `
    <div class="space-y-3 pt-3 border-t border-neutral-800">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
          Benodigdheden & Onderhoud voor STIHL ${modelName}
        </h3>
        <span class="text-3xs text-neutral-400 font-mono">Compatibiliteitsindicatie</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs">
        ${recommendations.slice(0, 4).map((rec) => {
          const compat = rec.technical_compatibility || {};
          const isVerified = compat.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY;
          const badgeClass = isVerified
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-neutral-800 text-neutral-400 border-neutral-700';
          const badgeText = isVerified ? '✓ Geverifieerd compatibel' : 'Controleer maat';

          return `
            <div class="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800 space-y-1">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-white">${rec.label}</span>
                <span class="px-1.5 py-0.2 rounded text-3xs font-semibold border ${badgeClass}">${badgeText}</span>
              </div>
              <p class="text-orange-300 font-medium">${compat.display_claim}</p>
              <p class="text-3xs text-neutral-400">${compat.display_guidance}</p>
            </div>
          `;
        }).join('')}
      </div>
      ${recommendationsModel.recommendations.some((r) => r.commercial_offers?.offers_active) ? `
        <p class="text-3xs text-neutral-500 italic mt-2">${AFFILIATE_DISCLOSURE_NOTICE}</p>
      ` : ''}
    </div>
  `;
}
