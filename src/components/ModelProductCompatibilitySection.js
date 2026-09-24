/**
 * ModelProductCompatibilitySection.js
 * Renders the "Onderdelen & onderhoud voor jouw STIHL [MODEL]" section for model pages.
 *
 * Implements strict three-layer separation:
 * - Technical compatibility & OEM part numbers are rendered from canonical evidence.
 * - Commercial offers are cleanly separated.
 * - In unmonetized baseline, shows "Bekijk technische informatie" with NO affiliate disclosure.
 * - When active affiliate offers exist, renders compliant links with mandatory disclosure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { COMPATIBILITY_STATUSES, AFFILIATE_DISCLOSURE_NOTICE } from '../modelRecommendations.js';
import { COMMERCIAL_OFFER_STATUSES } from '../commercialOffers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compatDataPath = path.resolve(__dirname, '..', '..', 'data', 'model_product_compatibility.json');

let cachedCompatData = null;

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

export function renderModelProductCompatibilitySection(modelSlug, modelName = '', options = {}) {
  const data = options.compatData || getCompatibilityData();
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

      const activeOffers = (rec.commercial_offers?.offers || []).filter(
        (o) => o.status === COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE && o.affiliate_url
      );

      let ctaHtml = '';
      if (activeOffers.length > 0) {
        hasAnyActiveAffiliate = true;
        const offer = activeOffers[0];
        const priceStr = offer.price ? ` · €${Number(offer.price).toFixed(2)}` : '';
        ctaHtml = `
          <a
            href="${offer.affiliate_url}"
            target="_blank"
            rel="sponsored noopener noreferrer"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition"
            data-recommendation-id="${rec.recommendation_id}"
            data-merchant-id="${offer.merchant_id}"
            data-offer-id="${offer.offer_id}"
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
        ? `<div class="text-2xs font-mono text-orange-300">STIHL OEM: ${rec.oem_part_number}</div>`
        : '';

      cardsHtml.push(`
        <div class="bg-gray-950/70 border border-gray-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-2xs font-semibold text-gray-400 uppercase tracking-wider">${categoryTitles[catKey] || catKey}</span>
              ${badgeHtml}
            </div>
            <h4 class="text-sm font-bold text-white">${rec.display_claim || ''}</h4>
            ${oemHtml}
            <p class="text-xs text-gray-300">${rec.display_guidance || ''}</p>
          </div>
          <div class="pt-2 border-t border-gray-800/60 flex items-center justify-between">
            ${ctaHtml}
          </div>
        </div>
      `);
    }
  }

  const disclosureHtml = hasAnyActiveAffiliate
    ? `<div class="pt-3 border-t border-gray-800/80 text-2xs text-gray-400 text-center">${AFFILIATE_DISCLOSURE_NOTICE}</div>`
    : '';

  return `
    <!-- Onderdelen & onderhoud voor STIHL ${modelName} (Phase 48) -->
    <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4" id="onderdelen-en-onderhoud">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <div>
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>🔧 Onderdelen & onderhoud voor jouw STIHL ${modelName}</span>
          </h2>
          <p class="text-xs text-gray-400">Onafhankelijk geverifieerde fabrieksspecificaties en compatibele onderdelen</p>
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
