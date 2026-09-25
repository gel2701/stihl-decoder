/**
 * ModelProductCompatibilitySection.js
 * Renders the "Onderdelen & onderhoud voor jouw STIHL [MODEL]" section for model pages.
 *
 * Implements strict three-layer separation:
 * - Technical compatibility & OEM part numbers are rendered from canonical evidence.
 * - Commercial offers are cleanly separated and filtered through central offer-policy.
 * - In unmonetized baseline, shows "Bekijk technische informatie" with NO affiliate disclosure.
 * - When active affiliate offers exist and pass all security/activity checks, renders compliant links with mandatory disclosure.
 * - All text and attribute outputs are escaped to prevent XSS / HTML injection.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COMPATIBILITY_STATUSES, AFFILIATE_DISCLOSURE_NOTICE } from '../modelRecommendations.js';
import {
  COMMERCIAL_OFFER_STATUSES,
  escapeHtml,
  validateCommercialOffer,
  isDomainAllowlisted,
  getActiveOffersForRecommendation
} from '../commercialOffers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compatDataPath = path.resolve(__dirname, '..', '..', 'data', 'model_product_compatibility.json');
const merchDataPath = path.resolve(__dirname, '..', '..', 'data', 'affiliate_merchants.json');

let cachedCompatData = null;
let cachedMerchData = null;

function getCompatibilityData() {
  if (!cachedCompatData) {
    try {
      if (fs.existsSync(compatDataPath)) {
        cachedCompatData = JSON.parse(fs.readFileSync(compatDataPath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load model_product_compatibility.json:', e);
      return null;
    }
  }
  return cachedCompatData;
}

function getRegisteredMerchants() {
  if (!cachedMerchData) {
    try {
      if (fs.existsSync(merchDataPath)) {
        cachedMerchData = JSON.parse(fs.readFileSync(merchDataPath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load affiliate_merchants.json:', e);
      return [];
    }
  }
  return cachedMerchData?.merchants || [];
}

export function renderModelProductCompatibilitySection(modelSlug, modelName = '', options = {}) {
  const data = options.compatData || getCompatibilityData();
  const merchants = options.registeredMerchants || getRegisteredMerchants();
  const merchantList = Array.isArray(merchants) ? merchants : (merchants?.merchants || []);
  const merchantMap = new Map(merchantList.map((m) => [m.merchant_id, m]));

  if (!data || !data.models || !data.models[modelSlug]) {
    return '';
  }

  const modelEntry = data.models[modelSlug];
  const categories = modelEntry.categories || {};
  const categoryKeys = Object.keys(categories);
  if (categoryKeys.length === 0) {
    return '';
  }

  let hasAnyActiveAffiliate = false;
  const cardsHtml = [];

  const categoryTitles = {
    spark_plug: 'Bougie & Ontsteking',
    air_filter: 'Luchtfilter',
    fuel_filter: 'Brandstoffilter',
    chain: 'Zaagketting',
    bar: 'Zaagblad / Geleiderblad',
    chain_oil: 'Kettingolie',
    two_stroke_oil: 'Tweetakt Mengsmering',
    filing_tool: 'Kettingvijl & Onderhoud',
    maintenance_tool: 'Onderhoudsgereedschap',
    protective_gear: 'Veiligheid & Bescherming'
  };

  const escapedModelName = escapeHtml(modelName);

  for (const catKey of categoryKeys) {
    const recs = categories[catKey];
    if (!Array.isArray(recs) || recs.length === 0) continue;

    for (const rec of recs) {
      let badgeHtml = '';
      if (rec.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY) {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">✓ Bewezen compatibel</span>`;
      } else if (rec.compatibility_status === COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY) {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">Specificatiematch</span>`;
      } else if (rec.compatibility_status === COMPATIBILITY_STATUSES.GENERIC_CATEGORY_RECOMMENDATION) {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-gray-500/10 text-gray-300 border border-gray-500/20">Categorie advies</span>`;
      } else {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">Niet geverifieerd</span>`;
      }

      // Filter offers using central policy
      const displayableOffers = getActiveOffersForRecommendation(rec, {
        registeredMerchants: merchantList,
        maxPriceAgeMs: options.maxPriceAgeMs
      });

      // Filter only strictly validated active affiliate offers
      const activeAffiliateOffers = displayableOffers.filter((o) => {
        if (o.status !== COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE) return false;
        if (!o.merchant_id || !merchantMap.has(o.merchant_id)) return false;
        const merch = merchantMap.get(o.merchant_id);
        if (merch.affiliate_active !== true) return false;
        if (!o.affiliate_url) return false;
        if (!isDomainAllowlisted(o.affiliate_url, merch, merchantList)) return false;

        const val = validateCommercialOffer(o, merchantList);
        return val.valid === true;
      });

      let ctaHtml = '';
      if (activeAffiliateOffers.length > 0) {
        hasAnyActiveAffiliate = true;
        const offer = activeAffiliateOffers[0];
        const priceStr = offer.display_price != null ? ` · €${Number(offer.display_price).toFixed(2)}` : '';
        const safeUrl = escapeHtml(offer.affiliate_url);
        const safeRecId = escapeHtml(rec.recommendation_id);
        const safeMerchId = escapeHtml(offer.merchant_id);
        const safeOfferId = escapeHtml(offer.offer_id);

        ctaHtml = `
          <a
            href="${safeUrl}"
            target="_blank"
            rel="sponsored noopener noreferrer"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition"
            data-recommendation-id="${safeRecId}"
            data-merchant-id="${safeMerchId}"
            data-offer-id="${safeOfferId}"
            data-placement="model_page_parts_grid"
          >
            <span>Bekijk aanbod${priceStr}</span>
            <span aria-hidden="true">→</span>
          </a>
        `;
      } else {
        ctaHtml = `
          <span class="inline-flex items-center gap-1 text-2xs text-gray-400 font-medium">
            <span>ℹ️ Bekijk technische informatie</span>
          </span>
        `;
      }

      const oemHtml = rec.oem_part_number
        ? `<div class="text-2xs font-mono text-orange-300">STIHL OEM: ${escapeHtml(rec.oem_part_number)}</div>`
        : '';

      const escapedClaim = escapeHtml(rec.display_claim || '');
      const escapedGuidance = escapeHtml(rec.display_guidance || '');

      cardsHtml.push(`
        <div class="bg-gray-950/70 border border-gray-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-2xs font-semibold text-gray-400 uppercase tracking-wider">${categoryTitles[catKey] || escapeHtml(catKey)}</span>
              ${badgeHtml}
            </div>
            <h4 class="text-sm font-bold text-white">${escapedClaim}</h4>
            ${oemHtml}
            <p class="text-xs text-gray-300">${escapedGuidance}</p>
          </div>
          <div class="pt-2 border-t border-gray-800/60 flex items-center justify-between">
            ${ctaHtml}
          </div>
        </div>
      `);
    }
  }

  const disclosureHtml = hasAnyActiveAffiliate
    ? `<div class="pt-3 border-t border-gray-800/80 text-2xs text-gray-400 text-center">${escapeHtml(AFFILIATE_DISCLOSURE_NOTICE)}</div>`
    : '';

  return `
    <!-- Onderdelen & onderhoud voor STIHL ${escapedModelName} (Phase 48) -->
    <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4" id="onderdelen-en-onderhoud">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>🔧 Onderdelen & onderhoud voor jouw STIHL ${escapedModelName}</span>
          </h2>
          <p class="text-xs text-gray-400">Technische compatibiliteitsinformatie en onderhoudsadvies</p>
        </div>
        <span class="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-green-500/10 text-green-400 border border-green-500/20">
          Evidence-First
        </span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${cardsHtml.join('')}
      </div>
      ${disclosureHtml}
    </section>
  `;
}
