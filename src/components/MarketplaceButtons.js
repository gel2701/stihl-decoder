/**
 * Shared Multi-Marketplace Affiliate Button Renderer for STIHLDecoder.nl
 * Renders separate direct buy buttons (Amazon.nl, Amazon.de, eBay.nl)
 * and visually separated search fallback buttons for marketplaces without direct offers.
 */

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsStr(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Renders a single affiliate button anchor.
 * @param {Object} offer
 * @param {Object} ctx
 * @returns {string}
 */
function renderSingleButton(offer, ctx, tier = 'primary', offerPosition = 1) {
  const provider = String(offer.provider || 'amazon').toLowerCase();
  const marketplace = String(offer.marketplace || (provider === 'ebay' ? 'ebay.nl' : 'amazon.nl')).toLowerCase();
  const isDirect = Boolean(offer.is_direct);
  const offerType = offer.offer_type || offer.type || (isDirect ? (provider === 'ebay' ? 'DIRECT_EBAY_ITEM' : 'DIRECT_ASIN') : 'SEARCH_LINK');
  const partNumber = ctx.partNumber || offer.part_number || '';
  const sectionContext = ctx.sectionContext || '';
  const modelContext = ctx.modelContext || '';
  const compact = Boolean(ctx.compact);
  const posNum = Number.isInteger(Number(offerPosition)) && Number(offerPosition) > 0 ? Number(offerPosition) : 1;

  const fallbackMarket = marketplace === 'amazon.de'
    ? 'Amazon.de'
    : (marketplace === 'ebay.de' ? 'eBay.de' : (provider === 'ebay' ? 'eBay.nl' : 'Amazon.nl'));
  const label = offer.label || (isDirect
    ? `Koop bij ${offer.display_marketplace || fallbackMarket}`
    : `Zoek op ${offer.display_marketplace || fallbackMarket}`);

  const title = isDirect
    ? `Directe aankoop op ${offer.display_marketplace || marketplace}`
    : `Alleen zoekopdracht op ${offer.display_marketplace || marketplace} (geen vooraf bevestigd aanbod)`;

  let onclickAttr = '';
  if (ctx.trackingMode === 'model_table') {
    onclickAttr = `window.trackModelAffiliateClick?.(this,event,'${escapeJsStr(partNumber)}','${escapeJsStr(sectionContext)}','${escapeJsStr(marketplace)}','${escapeJsStr(offerType)}','${escapeJsStr(offer.asin || '')}',${isDirect},'${escapeJsStr(provider)}',${posNum})`;
  } else {
    const modelProp = modelContext ? `, model: '${escapeJsStr(modelContext)}'` : '';
    onclickAttr = `if(window.handleAffiliateClick){window.handleAffiliateClick(this, event, {provider: '${escapeJsStr(provider)}', marketplace: '${escapeJsStr(marketplace)}', part_number: '${escapeJsStr(partNumber)}', offer_type: '${escapeJsStr(offerType)}', offer_position: ${posNum}, asin_if_known: '${escapeJsStr(offer.asin || '')}', product_verified: ${isDirect}, page_path: window.location.pathname, section_context: '${escapeJsStr(sectionContext)}'${modelProp}});}`;
  }

  const sizeClass = compact
    ? (tier === 'primary' ? 'px-3 py-2 text-xs min-h-[38px]' : 'px-2.5 py-1.5 text-2xs min-h-[36px]')
    : (tier === 'primary' ? 'px-3.5 py-2 text-xs min-h-[44px]' : 'px-2.5 py-1.5 text-2xs min-h-[40px]');

  let colorClass;
  if (isDirect && tier === 'primary') {
    colorClass = 'bg-orange-600 hover:bg-orange-500 text-white border border-orange-500/80';
  } else if (isDirect) {
    colorClass = 'bg-gray-900 hover:bg-gray-800 text-gray-100 border border-gray-700';
  } else if (tier === 'search-primary') {
    colorClass = 'bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-700';
  } else {
    colorClass = 'bg-gray-950 hover:bg-gray-800/80 text-gray-400 hover:text-gray-200 border border-gray-800';
  }

  const icon = isDirect ? '🛒' : '🔍';

  return `<a href="${escapeAttr(offer.url)}" target="_blank" rel="sponsored nofollow noopener" data-part-number="${escapeAttr(partNumber)}" data-provider="${escapeAttr(provider)}" data-marketplace="${escapeAttr(marketplace)}" data-offer-type="${escapeAttr(offerType)}" data-offer-position="${posNum}" class="${sizeClass} ${colorClass} rounded-lg font-semibold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-orange-500/70" onclick="${escapeAttr(onclickAttr)}" title="${escapeAttr(title)}"><span>${icon} ${escapeAttr(label)}</span><span class="opacity-65 text-3xs" aria-hidden="true">↗</span></a>`;
}

/**
 * Renders every verified direct buy button side by side ("Direct bestellen"),
 * with only the search fallbacks behind a collapsible "Meer zoekopties" block.
 *
 * A direct offer from any marketplace must never be hidden behind a collapsed
 * element while another marketplace keeps the visible slot: a visitor who wants
 * to buy that part has to see both verified destinations immediately.
 *
 * @param {Object|null} multiOffer Result of getPartAffiliateOffers()
 * @param {Object} [ctx]
 * @returns {string}
 */
export function renderMultiMarketplaceButtonsHtml(multiOffer, ctx = {}) {
  if (!multiOffer) return '';
  const directOffers = Array.isArray(multiOffer.direct_offers) ? multiOffer.direct_offers : [];
  const searchOffers = Array.isArray(multiOffer.search_offers) ? multiOffer.search_offers : [];
  if (directOffers.length === 0 && searchOffers.length === 0) return '';

  const alignEnd = ctx.align === 'end';
  const alignClass = alignEnd ? 'justify-end' : 'justify-start';
  const itemsAlignClass = alignEnd ? 'items-end' : 'items-stretch';

  const hasDirect = directOffers.length > 0;

  // All verified direct offers are visible and equally usable. Marketplace
  // order is deterministic (NL before DE, Amazon before eBay), never weighted
  // by expected commission.
  const primaryHtml = hasDirect
    ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5" data-offer-group="direct" aria-label="Direct bestellen">${directOffers.map((o, idx) => renderSingleButton(o, ctx, 'primary', idx + 1)).join('')}</div>`
    : `<div class="flex flex-wrap items-center ${alignClass} gap-1.5" data-offer-group="search">${renderSingleButton(searchOffers[0], ctx, 'search-primary', 1)}</div>`;

  // Search fallbacks are never presented as verified direct offers: they stay
  // visually separated and, when a direct offer exists, collapsed.
  const extraSearch = hasDirect ? searchOffers : searchOffers.slice(1);
  const extraSearchBase = hasDirect ? directOffers.length : 1;

  let secondaryHtml = '';
  if (extraSearch.length > 0) {
    const summaryLabel = `Meer zoekopties (+${extraSearch.length})`;

    const extraSearchHtml = `<div class="flex flex-wrap items-center ${alignClass} gap-1.5 ${hasDirect ? 'pt-1.5 border-t border-gray-800/60' : 'pt-1.5'}" data-offer-group="search">${extraSearch.map((o, idx) => renderSingleButton(o, ctx, 'search-secondary', extraSearchBase + idx + 1)).join('')}</div>`;

    secondaryHtml = `<details class="${alignEnd ? 'w-auto' : 'w-full'}">
      <summary class="cursor-pointer select-none inline-flex items-center justify-between gap-2 text-2xs font-medium text-gray-400 hover:text-gray-200 px-2.5 py-1.5 rounded-lg border border-gray-800 bg-gray-950/70 hover:bg-gray-900 transition min-h-[36px] ${alignEnd ? '' : 'w-full'} focus:outline-none focus:ring-2 focus:ring-orange-500/70">
        <span>${escapeAttr(summaryLabel)}</span>
        <span class="text-3xs opacity-70" aria-hidden="true">▾</span>
      </summary>
      <div class="space-y-1.5">${extraSearchHtml}</div>
    </details>`;
  }

  return `<div class="flex flex-col ${itemsAlignClass} gap-1.5" data-multi-marketplace-buttons="true">${primaryHtml}${secondaryHtml}</div>`;
}
