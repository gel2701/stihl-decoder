/**
 * Affiliate Intelligence Aggregator for STIHLDecoder.nl
 * Phase 56G — Privacy-friendly, evidence-only commercial funnel measurement
 *
 * INVARIANTS:
 * 1. Operates exclusively on first-party, whitelisted, non-PII analytics events (AnalyticsTracker).
 * 2. Test events (is_test) are always excluded.
 * 3. A ratio is only computed when BOTH numerator and denominator are real, measured counts and
 *    the denominator is > 0. Otherwise the ratio is null with an explicit reason.
 * 4. No session stitching, no user IDs, no IPs: cross-page attribution is limited to the
 *    page_path recorded on the event itself. Anything that would need session tracking is
 *    reported as NOT_MEASURABLE_WITHOUT_SESSION_TRACKING.
 * 5. Never reports Amazon sales, orders or commissions — those require Amazon Associates reports.
 */

export const AFFILIATE_INTELLIGENCE_VERSION = 'PHASE_56G_V1';

const MODEL_PAGE_REGEX = /^\/(?:kettingzagen|accu-kettingzagen|bosmaaiers|accu-bosmaaiers|bladblazers|accu-bladblazers|heggenscharen|accu-heggenscharen|doorslijpers|hoogsnoeiers|combisystemen|[a-z-]+)\/[a-z0-9-]+\/$/;
const PART_PAGE_REGEX = /^\/onderdeelnummer\/\d{11}\/$/;
const SEARCH_PAGE_REGEX = /^\/onderdelen\/?$/;

function parseMeta(e) {
  if (e && typeof e.metadata === 'object' && e.metadata) return e.metadata;
  try { return JSON.parse(e?.metadata_json || '{}') || {}; } catch { return {}; }
}

function safeRatio(numerator, denominator, label) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return { value: null, numerator, denominator, status: 'NOT_COMPUTABLE', reason: `${label}: denominator is zero or unavailable` };
  }
  return { value: Math.round((numerator / denominator) * 10000) / 10000, numerator, denominator, status: 'MEASURED' };
}

function topN(map, n = 10) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([key, count]) => ({ key, count }));
}

/**
 * Aggregates affiliate intelligence from an array of analytics events.
 * @param {Array<Object>} events — rows shaped like analytics_events ({ event_type, page_path, metadata_json, is_test })
 */
export function computeAffiliateIntelligence(events = []) {
  const prod = (Array.isArray(events) ? events : []).filter(e => e && !e.is_test && typeof e.event_type === 'string');
  const count = (type) => prod.filter(e => e.event_type === type).length;

  const modelPageViews = prod.filter(e => e.event_type === 'model_page_view' || e.event_type === 'model_identified' || (e.event_type === 'page_view' && MODEL_PAGE_REGEX.test(e.page_path || ''))).length;
  const modelToPartClicks = count('model_to_part_click') + count('machine_to_part_click');
  const partPageViews = count('part_page_view');
  const affiliateClicks = prod.filter(e => e.event_type === 'affiliate_click');
  const fallbackClicks = count('amazon_search_fallback_click');
  const verifiedClicks = count('amazon_verified_product_click');
  const searchResults = count('parts_search_results');
  const searchNoResults = count('parts_search_no_results');

  const clicksByPart = new Map();
  const clicksByVariant = new Map();
  const clicksByOfferType = new Map();
  const clicksFromSearchPage = new Map();
  const variantPartSets = new Map();

  for (const e of affiliateClicks) {
    const m = parseMeta(e);
    const part = m.part_number || null;
    if (part) clicksByPart.set(part, (clicksByPart.get(part) || 0) + 1);
    const variant = m.query_variant || 'UNKNOWN';
    clicksByVariant.set(variant, (clicksByVariant.get(variant) || 0) + 1);
    if (!variantPartSets.has(variant)) variantPartSets.set(variant, new Set());
    if (part) variantPartSets.get(variant).add(part);
    const offer = m.offer_type || 'UNKNOWN';
    clicksByOfferType.set(offer, (clicksByOfferType.get(offer) || 0) + 1);
    const pagePath = m.page_path || e.page_path || '';
    if (SEARCH_PAGE_REGEX.test(pagePath.split('?')[0]) && m.search_query_normalized) {
      clicksFromSearchPage.set(m.search_query_normalized, (clicksFromSearchPage.get(m.search_query_normalized) || 0) + 1);
    }
  }

  const hasData = prod.length > 0;

  return {
    version: AFFILIATE_INTELLIGENCE_VERSION,
    data_status: hasData ? 'REAL_FIRST_PARTY_EVENTS' : 'NO_PRODUCTION_EVENTS_AVAILABLE',
    production_events_considered: prod.length,
    counts: {
      model_page_views: modelPageViews,
      model_to_part_clicks: modelToPartClicks,
      part_page_views: partPageViews,
      affiliate_outbound_clicks: affiliateClicks.length,
      amazon_search_fallback_clicks: fallbackClicks,
      amazon_verified_product_clicks: verifiedClicks,
      parts_search_with_results: searchResults,
      parts_search_no_results: searchNoResults
    },
    ratios: {
      model_to_part_click_rate: safeRatio(modelToPartClicks, modelPageViews, 'model_to_part_click_rate'),
      part_view_to_affiliate_click_rate: safeRatio(affiliateClicks.length, partPageViews, 'part_view_to_affiliate_click_rate'),
      search_zero_result_rate: safeRatio(searchNoResults, searchResults + searchNoResults, 'search_zero_result_rate')
    },
    top_clicked_parts: topN(clicksByPart, 20),
    affiliate_clicks_by_offer_type: topN(clicksByOfferType, 10),
    query_variant_comparison: {
      method: 'Deterministic per-part A/B (VARIANT_A formatted vs VARIANT_B compact). Clicks only; Amazon conversion per variant is NOT observable first-party.',
      variants: topN(clicksByVariant, 10).map(v => ({
        variant: v.key,
        clicks: v.count,
        distinct_parts_clicked: variantPartSets.get(v.key)?.size || 0
      })),
      statistical_significance: 'NOT_EVALUATED (requires sufficient click volume and per-variant impression counts)'
    },
    searches_leading_to_affiliate_click: {
      measurable_scope: 'Only affiliate clicks emitted directly on /onderdelen/ search pages with a normalized query',
      results: topN(clicksFromSearchPage, 20),
      cross_page_attribution: 'NOT_MEASURABLE_WITHOUT_SESSION_TRACKING (deliberately not implemented for privacy)'
    },
    revenue: {
      amazon_orders: null,
      amazon_commission_eur: null,
      status: 'NOT_AVAILABLE (requires Amazon Associates reporting; never estimated)'
    }
  };
}
