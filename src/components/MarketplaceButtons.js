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
function renderSingleButton(offer, ctx, tier = 'primary') {
  const provider = String(offer.provider || 'amazon').toLowerCase();
  const marketplace = String(offer.marketplace || (provider === 'ebay' ? 'ebay.nl' : 'amazon.nl')).toLowerCase();
  const isDirect = Boolean(offer.is_direct);
  const offerType = offer.offer_type || offer.type || (isDirect ? (provider === 'ebay' ? 'DIRECT_EBAY_ITEM' : 'DIRECT_ASIN') : 'SEARCH_LINK');
  const partNumber = ctx.partNumber || offer.part_number || '';
  const sectionContext = ctx.sectionContext || '';
  const modelContext = ctx.modelContext || '';
  const compact = Boolean(ctx.compact);

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
    onclickAttr = `window.trackModelAffiliateClick?.(this,event,'${escapeJsStr(partNumber)}','${escapeJsStr(sectionContext)}','${escapeJsStr(marketplace)}','${escapeJsStr(offerType)}','${escapeJsStr(offer.asin || '')}',${isDirect},'${escapeJsStr(provider)}')`;
  } else {
    const modelProp = modelContext ? `, model: '${escapeJsStr(modelContext)}'` : '';
    onclickAttr = `if(window.handleAffiliateClick){window.handleAffiliateClick(this, event, {provider: '${escapeJsStr(provider)}', marketplace: '${escapeJsStr(marketplace)}', part_number: '${escapeJsStr(partNumber)}', offer_type: '${escapeJsStr(offerType)}', asin_if_known: '${escapeJsStr(offer.asin || '')}', product_verified: ${isDirect}, page_path: window.location.pathname, section_context: '${escapeJsStr(sectionContext)}'${modelProp}});}`;
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

  return `<a href="${escapeAttr(offer.url)}" target="_blank" rel="sponsored nofollow noopener" data-part-number="${escapeAttr(partNumber)}" data-provider="${escapeAttr(provider)}" data-marketplace="${escapeAttr(marketplace)}" data-offer-type="${escapeAttr(offerType)}" class="${sizeClass} ${colorClass} rounded-lg font-semibold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-orange-500/70" onclick="${escapeAttr(onclickAttr)}" title="${escapeAttr(title)}"><span>${icon} ${escapeAttr(label)}</span><span class="opacity-65 text-3xs" aria-hidden="true">↗</span></a>`;
}

/**
 * Renders 1 primary buy/search button + collapsible secondary direct/search options.
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
  const primaryDirect = hasDirect ? directOffers[0] : null;
  const secondaryDirect = hasDirect ? directOffers.slice(1) : [];

  const primarySearch = !hasDirect && searchOffers.length > 0 ? searchOffers[0] : null;
  const extraSearch = hasDirect ? searchOffers : searchOffers.slice(1);

  const primaryHtml = primaryDirect
    ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5" data-offer-group="direct">${renderSingleButton(primaryDirect, ctx, 'primary')}</div>`
    : `<div class="flex flex-wrap items-center ${alignClass} gap-1.5" data-offer-group="search">${renderSingleButton(primarySearch, ctx, 'search-primary')}</div>`;

  const secondaryCount = secondaryDirect.length + extraSearch.length;
  let secondaryHtml = '';
  if (secondaryCount > 0) {
    const summaryLabel = secondaryDirect.length > 0
      ? `Meer koopopties (+${secondaryCount})`
      : (hasDirect ? `Meer opties (+${secondaryCount})` : `Meer zoekopties (+${secondaryCount})`);

    const secondaryDirectHtml = secondaryDirect.length > 0
      ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5 pt-1.5">${secondaryDirect.map(o => renderSingleButton(o, ctx, 'secondary')).join('')}</div>`
      : '';

    const extraSearchHtml = extraSearch.length > 0
      ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5 ${hasDirect ? 'pt-1.5 border-t border-gray-800/60' : 'pt-1.5'}" data-offer-group="search">${extraSearch.map(o => renderSingleButton(o, ctx, 'search-secondary')).join('')}</div>`
      : '';

    secondaryHtml = `<details class="${alignEnd ? 'w-auto' : 'w-full'}">
      <summary class="cursor-pointer select-none inline-flex items-center justify-between gap-2 text-2xs font-medium text-gray-400 hover:text-gray-200 px-2.5 py-1.5 rounded-lg border border-gray-800 bg-gray-950/70 hover:bg-gray-900 transition min-h-[36px] ${alignEnd ? '' : 'w-full'} focus:outline-none focus:ring-2 focus:ring-orange-500/70">
        <span>${escapeAttr(summaryLabel)}</span>
        <span class="text-3xs opacity-70" aria-hidden="true">▾</span>
      </summary>
      <div class="space-y-1.5">${secondaryDirectHtml}${extraSearchHtml}</div>
    </details>`;
  }

  return `<div class="flex flex-col ${itemsAlignClass} gap-1.5" data-multi-marketplace-buttons="true">${primaryHtml}${secondaryHtml}</div>`;
}
