/**
 * src/affiliate/EbayShippingEvidence.js
 *
 * Phase 80 — Canonical NL shipping evidence for eBay offers.
 *
 * Single source of truth for the question "can this eBay listing be delivered
 * to the Netherlands?".
 *
 * Evidence sources, strongest first:
 *  1. ITEM_SHIPPING_OPTIONS  — shipToLocations returned by Browse search/getItem.
 *  2. BROWSE_DELIVERY_COUNTRY_FILTER — the Browse request carried
 *     `filter=deliveryCountry:NL` and eBay returned the item for that request.
 *     Per the official eBay Buy API field filters, deliveryCountry restricts
 *     results to items that can be delivered to that country. The filter
 *     therefore is positive shipping evidence for every returned item, and it
 *     only counts when the API answered successfully (HTTP 200).
 *
 * Rules:
 *  - Explicit non-NL destinations contradict the filter and fail closed.
 *  - Without any evidence the status is SHIPPING_UNKNOWN (never confirmed).
 *  - Confirmed evidence is reused (never silently re-demanded) as long as it is
 *    fresh; `maxAgeMs` bounds reuse.
 */

export const SHIPPING_STATUS = Object.freeze({
  CONFIRMED: 'SHIPS_TO_NL_CONFIRMED',
  DOES_NOT_SHIP: 'DOES_NOT_SHIP_TO_NL',
  UNKNOWN: 'SHIPPING_UNKNOWN'
});

export const SHIPPING_EVIDENCE_SOURCES = Object.freeze({
  ITEM_SHIPPING_OPTIONS: 'ITEM_SHIPPING_OPTIONS',
  BROWSE_DELIVERY_COUNTRY_FILTER: 'BROWSE_DELIVERY_COUNTRY_FILTER'
});

export const DELIVERY_COUNTRY = 'NL';
export const BROWSE_DELIVERY_FILTER = `deliveryCountry:${DELIVERY_COUNTRY}`;
export const DEFAULT_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Builds the evidence record for a successful Browse request that carried the
 * deliveryCountry:NL filter.
 *
 * @param {Object} params
 * @param {string} params.marketplaceId eBay marketplace header (EBAY_NL / EBAY_DE)
 * @param {string} [params.filter] exact filter string sent to eBay
 * @param {number} [params.httpStatus] HTTP status of the Browse response
 * @param {boolean} [params.applied] true when the filter was actually sent and answered
 * @param {number} [params.itemCount] number of item summaries returned
 * @param {string[]} [params.queries] queries answered under this filter
 * @param {string} [params.endUserContext] X-EBAY-C-ENDUSERCTX header value
 * @returns {{ source: string, delivery_country: string, filter: string, marketplace: string, api_status: number|null, confirmed: boolean, confirmed_at: string, item_count: number, queries: string[], end_user_context: string|null }}
 */
export function buildBrowseDeliveryEvidence(params = {}) {
  const httpStatus = Number.isFinite(Number(params.httpStatus)) ? Number(params.httpStatus) : null;
  const applied = params.applied === true;
  return {
    source: SHIPPING_EVIDENCE_SOURCES.BROWSE_DELIVERY_COUNTRY_FILTER,
    delivery_country: DELIVERY_COUNTRY,
    filter: params.filter || BROWSE_DELIVERY_FILTER,
    marketplace: params.marketplaceId || null,
    api_status: httpStatus,
    confirmed: applied && (httpStatus === null || httpStatus === 200),
    confirmed_at: new Date().toISOString(),
    item_count: Math.max(0, Number(params.itemCount) || 0),
    queries: Array.isArray(params.queries) ? params.queries.slice(0, 10) : [],
    end_user_context: typeof params.endUserContext === 'string' ? params.endUserContext : null
  };
}

/**
 * Normalizes shipToLocations from one or more Browse shipping option arrays.
 * eBay returns either plain ISO-2 strings or { country } objects.
 *
 * @param {Array} shippingOptions
 * @returns {{ destinations: string[], costs: Object<string, number|null> }}
 */
export function collectShippingDestinations(shippingOptions = []) {
  const destinations = [];
  const costs = {};
  for (const option of (Array.isArray(shippingOptions) ? shippingOptions : [])) {
    if (!option || typeof option !== 'object') continue;
    const locations = option.shipToLocations;
    const list = Array.isArray(locations)
      ? locations
      : (locations && typeof locations === 'object' ? [locations] : []);
    const cost = option.shippingCost && /^\d+(?:\.\d+)?$/.test(String(option.shippingCost.value))
      ? Number(option.shippingCost.value)
      : null;
    for (const loc of list) {
      const country = typeof loc === 'string' ? loc : loc?.country;
      if (typeof country !== 'string' || !country) continue;
      const code = country.trim().toUpperCase();
      if (!destinations.includes(code)) destinations.push(code);
      if (!Object.prototype.hasOwnProperty.call(costs, code) || (cost !== null && (costs[code] === null || cost < costs[code]))) {
        costs[code] = cost;
      }
    }
  }
  return { destinations, costs };
}

/**
 * @param {{ confirmed_at?: string }|null} evidence
 * @param {number} [now]
 * @param {number} [maxAgeMs]
 * @returns {boolean}
 */
export function isShippingEvidenceFresh(evidence, now = Date.now(), maxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS) {
  if (!evidence || typeof evidence !== 'object') return false;
  const at = Date.parse(evidence.confirmed_at || evidence.checked_at || '');
  if (!Number.isFinite(at)) return false;
  return (now - at) <= maxAgeMs;
}

/**
 * Evaluates all available NL shipping evidence for a single listing.
 *
 * @param {Object} [params]
 * @param {Array} [params.shippingOptions] summary-level shipping options
 * @param {Array} [params.itemDetailShippingOptions] getItem-level shipping options
 * @param {Object|null} [params.browseDeliveryEvidence] deliveryCountry:NL filter evidence
 * @param {number} [params.now]
 * @param {number} [params.maxAgeMs]
 * @returns {{ status: string, confirmed_to_nl: boolean, shipping_cost_nl: number|null, sources: Array<Object>, contradictions: string[], evidence: Object }}
 */
export function evaluateShippingEvidence(params = {}) {
  const now = params.now ?? Date.now();
  const maxAgeMs = params.maxAgeMs ?? DEFAULT_EVIDENCE_MAX_AGE_MS;
  const summary = collectShippingDestinations(params.shippingOptions);
  const detail = collectShippingDestinations(params.itemDetailShippingOptions);
  const destinations = [...new Set([...summary.destinations, ...detail.destinations])];
  const costs = { ...summary.costs, ...detail.costs };
  const sources = [];
  const contradictions = [];

  const browse = params.browseDeliveryEvidence && typeof params.browseDeliveryEvidence === 'object'
    ? params.browseDeliveryEvidence
    : null;
  const browseConfirmed = Boolean(browse && browse.confirmed === true && isShippingEvidenceFresh(browse, now, maxAgeMs));

  if (destinations.includes(DELIVERY_COUNTRY)) {
    sources.push({
      source: SHIPPING_EVIDENCE_SOURCES.ITEM_SHIPPING_OPTIONS,
      delivery_country: DELIVERY_COUNTRY,
      destinations,
      confirmed: true,
      checked_at: new Date(now).toISOString()
    });
  }

  const explicitNonNl = destinations.length > 0 && !destinations.includes(DELIVERY_COUNTRY);
  if (explicitNonNl) {
    if (browseConfirmed) contradictions.push('BROWSE_FILTER_CONTRADICTED_BY_ITEM_DESTINATIONS');
    sources.push({
      source: SHIPPING_EVIDENCE_SOURCES.ITEM_SHIPPING_OPTIONS,
      delivery_country: DELIVERY_COUNTRY,
      destinations,
      confirmed: false,
      checked_at: new Date(now).toISOString()
    });
    return {
      status: SHIPPING_STATUS.DOES_NOT_SHIP,
      confirmed_to_nl: false,
      shipping_cost_nl: null,
      sources,
      contradictions,
      evidence: {
        checked_at: new Date(now).toISOString(),
        destinations,
        browse_delivery: browse,
        sources
      }
    };
  }

  if (sources.length === 0 && browseConfirmed) {
    sources.push({
      source: SHIPPING_EVIDENCE_SOURCES.BROWSE_DELIVERY_COUNTRY_FILTER,
      delivery_country: DELIVERY_COUNTRY,
      filter: browse.filter || BROWSE_DELIVERY_FILTER,
      marketplace: browse.marketplace || null,
      api_status: browse.api_status ?? null,
      confirmed: true,
      confirmed_at: browse.confirmed_at,
      reused: true
    });
  }

  const confirmed = sources.some(source => source.confirmed === true);
  const shippingCost = Object.prototype.hasOwnProperty.call(costs, DELIVERY_COUNTRY) ? costs[DELIVERY_COUNTRY] : null;

  return {
    status: confirmed ? SHIPPING_STATUS.CONFIRMED : SHIPPING_STATUS.UNKNOWN,
    confirmed_to_nl: confirmed,
    shipping_cost_nl: confirmed ? shippingCost : null,
    sources,
    contradictions,
    evidence: {
      checked_at: new Date(now).toISOString(),
      destinations,
      browse_delivery: browse,
      sources
    }
  };
}
