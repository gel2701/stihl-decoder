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
function renderSingleButton(offer, ctx) {
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
    ? 'px-2.5 py-1.5 text-2xs min-h-[36px]'
    : 'px-3 py-2 text-xs min-h-[44px]';

  const colorClass = isDirect
    ? 'bg-orange-600/30 hover:bg-orange-600/40 text-orange-200 border border-orange-500/50'
    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700';

  const icon = isDirect ? '🛒' : '🔍';

  return `<a href="${escapeAttr(offer.url)}" target="_blank" rel="sponsored nofollow noopener" data-part-number="${escapeAttr(partNumber)}" data-provider="${escapeAttr(provider)}" data-marketplace="${escapeAttr(marketplace)}" data-offer-type="${escapeAttr(offerType)}" class="${sizeClass} ${colorClass} rounded-lg font-bold transition inline-flex items-center justify-center gap-1 whitespace-nowrap" onclick="${escapeAttr(onclickAttr)}" title="${escapeAttr(title)}"><span>${icon} ${escapeAttr(label)}</span><span class="opacity-70 text-3xs" aria-hidden="true">↗</span></a>`;
}

/**
 * Renders direct purchase buttons + visually separated search fallback buttons.
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

  const alignClass = ctx.align === 'end' ? 'justify-end' : 'justify-start';
  const directHtml = directOffers.length > 0
    ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5" data-offer-group="direct">${directOffers.map(o => renderSingleButton(o, ctx)).join('')}</div>`
    : '';

  const searchHtml = searchOffers.length > 0
    ? `<div class="flex flex-wrap items-center ${alignClass} gap-1.5 ${directOffers.length > 0 ? 'pt-1.5 border-t border-gray-800/60' : ''}" data-offer-group="search">${searchOffers.map(o => renderSingleButton(o, ctx)).join('')}</div>`
    : '';

  return `<div class="flex flex-col ${ctx.align === 'end' ? 'items-end' : 'items-stretch'} gap-1.5" data-multi-marketplace-buttons="true">${directHtml}${searchHtml}</div>`;
}
