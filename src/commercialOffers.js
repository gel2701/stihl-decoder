/**
 * commercialOffers.js
 * Phase 48 / 48A — Affiliate Compatibility Dataset & Commercial Pilot
 *
 * Implements the Provider-Independent Commercial Offer Ingestion Layer for STIHLDecoder.nl.
 *
 * FUNDAMENTAL ARCHITECTURAL INVARIANT:
 * Commercial offers NEVER determine, mutate, or elevate technical compatibility.
 * Technical compatibility is established strictly and independently prior to offer matching.
 */

export const COMMERCIAL_OFFER_STATUSES = Object.freeze({
  DISCOVERY_ONLY: 'DISCOVERY_ONLY',
  UNMONETIZED: 'UNMONETIZED',
  ACTIVE_AFFILIATE: 'ACTIVE_AFFILIATE',
  DISABLED: 'DISABLED',
  STALE: 'STALE',
  INVALID: 'INVALID'
});

export const DEFAULT_MAX_PRICE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Escapes unsafe HTML characters to prevent XSS in text and attributes.
 */
export function escapeHtml(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalizes a raw commercial offer into the canonical contract.
 */
export function normalizeCommercialOffer(rawOffer = {}) {
  if (!rawOffer || typeof rawOffer !== 'object') {
    return null;
  }

  const cleanString = (val) => (val != null ? String(val).trim() : null);
  const cleanNumber = (val) => {
    if (val == null || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  const offerId = cleanString(rawOffer.offer_id) || `off_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const recommendationId = cleanString(rawOffer.recommendation_id);
  const merchantId = cleanString(rawOffer.merchant_id);
  const merchantProductId = cleanString(rawOffer.merchant_product_id);
  const title = cleanString(rawOffer.title) || '';
  const productUrl = cleanString(rawOffer.product_url);
  const affiliateUrl = cleanString(rawOffer.affiliate_url);
  const price = cleanNumber(rawOffer.price);
  const currency = cleanString(rawOffer.currency) || 'EUR';
  const observedAt = cleanString(rawOffer.observed_at);
  const inStock = rawOffer.in_stock != null ? Boolean(rawOffer.in_stock) : null;

  let status = cleanString(rawOffer.status) || COMMERCIAL_OFFER_STATUSES.UNMONETIZED;
  if (!Object.values(COMMERCIAL_OFFER_STATUSES).includes(status)) {
    status = COMMERCIAL_OFFER_STATUSES.INVALID;
  }

  return {
    offer_id: offerId,
    recommendation_id: recommendationId,
    merchant_id: merchantId,
    merchant_product_id: merchantProductId,
    title,
    product_url: productUrl,
    affiliate_url: affiliateUrl,
    price,
    currency,
    observed_at: observedAt,
    in_stock: inStock,
    status
  };
}

/**
 * Verifies whether a given URL belongs to an allowlisted domain for a registered merchant.
 */
export function isDomainAllowlisted(urlStr, merchantOrId, registeredMerchants = []) {
  if (!urlStr || typeof urlStr !== 'string') return false;

  // Security guard against dangerous URI schemes
  const lower = urlStr.trim().toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('about:')
  ) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Reject credentials inside URL (e.g., http://user:pass@host)
  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Find merchant entry
  let merchantList = [];
  if (Array.isArray(registeredMerchants)) {
    merchantList = registeredMerchants;
  } else if (registeredMerchants?.merchants && Array.isArray(registeredMerchants.merchants)) {
    merchantList = registeredMerchants.merchants;
  }

  let merchant = null;
  if (typeof merchantOrId === 'object' && merchantOrId !== null) {
    merchant = merchantOrId;
  } else if (typeof merchantOrId === 'string') {
    merchant = merchantList.find((m) => m.merchant_id === merchantOrId) || null;
  }

  if (!merchant || !Array.isArray(merchant.allowed_domains) || merchant.allowed_domains.length === 0) {
    return false;
  }

  return merchant.allowed_domains.some((domain) => {
    const d = domain.toLowerCase().trim();
    return hostname === d || hostname.endsWith(`.${d}`);
  });
}

/**
 * Checks whether an offer's price data is considered stale.
 */
export function isOfferStale(offer, maxAgeMs = DEFAULT_MAX_PRICE_AGE_MS) {
  if (!offer || !offer.observed_at) return true;
  const observedTime = new Date(offer.observed_at).getTime();
  if (isNaN(observedTime)) return true;
  return Date.now() - observedTime > maxAgeMs;
}

/**
 * Validates a commercial offer against all integrity, domain, and status policies.
 */
export function validateCommercialOffer(offer, registeredMerchants = []) {
  const errors = [];
  const normalized = normalizeCommercialOffer(offer);

  if (!normalized) {
    return { valid: false, errors: ['Offer is null or invalid object'], normalized: null };
  }

  if (!normalized.merchant_id) {
    errors.push('merchant_id is required');
  }

  let merchantList = [];
  if (Array.isArray(registeredMerchants)) {
    merchantList = registeredMerchants;
  } else if (registeredMerchants?.merchants && Array.isArray(registeredMerchants.merchants)) {
    merchantList = registeredMerchants.merchants;
  }

  const merchant = merchantList.find((m) => m.merchant_id === normalized.merchant_id);
  if (!merchant) {
    errors.push(`Unknown merchant_id: "${normalized.merchant_id}" not found in registered merchants`);
  }

  if (!normalized.title || normalized.title.trim().length === 0) {
    errors.push('title is required');
  }

  if (!normalized.product_url) {
    errors.push('product_url is required');
  } else if (merchant && !isDomainAllowlisted(normalized.product_url, merchant, merchantList)) {
    errors.push(`product_url domain "${normalized.product_url}" is not allowlisted for merchant "${normalized.merchant_id}"`);
  }

  // ACTIVE_AFFILIATE status hard requirements
  if (normalized.status === COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE) {
    if (merchant && merchant.affiliate_active !== true) {
      errors.push(`merchant "${normalized.merchant_id}" is not active for affiliate offers (affiliate_active is false)`);
    }

    if (!normalized.affiliate_url) {
      errors.push('ACTIVE_AFFILIATE status strictly requires a valid affiliate_url');
    } else if (merchant && !isDomainAllowlisted(normalized.affiliate_url, merchant, merchantList)) {
      errors.push(`affiliate_url domain "${normalized.affiliate_url}" is not allowlisted for merchant "${normalized.merchant_id}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

/**
 * Attaches a validated commercial offer to a recommendation slot.
 * TECHNICAL COMPATIBILITY REMAINS ENTIRELY READ-ONLY AND IMMUTABLE.
 */
export function attachOfferToRecommendation(recommendation = {}, offer = {}, registeredMerchants = []) {
  if (!recommendation || typeof recommendation !== 'object') {
    throw new Error('Invalid recommendation object provided');
  }

  const validation = validateCommercialOffer(offer, registeredMerchants);
  if (!validation.valid) {
    throw new Error(`Cannot attach invalid commercial offer: ${validation.errors.join('; ')}`);
  }

  const normalized = validation.normalized;

  // Verify recommendation binding
  if (recommendation.recommendation_id && normalized.recommendation_id) {
    if (recommendation.recommendation_id !== normalized.recommendation_id) {
      throw new Error(
        `Recommendation ID mismatch: offer specifies "${normalized.recommendation_id}" but target is "${recommendation.recommendation_id}"`
      );
    }
  }

  const existingOffers = Array.isArray(recommendation.commercial_offers?.offers)
    ? [...recommendation.commercial_offers.offers]
    : [];

  const existingIndex = existingOffers.findIndex((o) => o.offer_id === normalized.offer_id);
  if (existingIndex >= 0) {
    existingOffers[existingIndex] = normalized;
  } else {
    existingOffers.push(normalized);
  }

  const hasActiveAffiliate = existingOffers.some((o) => o.status === COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE);

  // Return a cloned recommendation with updated offers, keeping technical compatibility untouched
  return {
    ...recommendation,
    commercial_offers: {
      offers_active: hasActiveAffiliate,
      disclosure_template: recommendation.commercial_offers?.disclosure_template || '',
      offers: existingOffers
    }
  };
}

/**
 * Filters and prepares displayable offers according to merchant activity, validation, and staleness policies.
 */
export function getActiveOffersForRecommendation(recommendation = {}, options = {}) {
  const maxPriceAgeMs = options.maxPriceAgeMs || DEFAULT_MAX_PRICE_AGE_MS;
  const registeredMerchants = options.registeredMerchants || [];
  const rawOffers = Array.isArray(recommendation.commercial_offers?.offers)
    ? recommendation.commercial_offers.offers
    : [];

  let merchantList = [];
  if (Array.isArray(registeredMerchants)) {
    merchantList = registeredMerchants;
  } else if (registeredMerchants?.merchants && Array.isArray(registeredMerchants.merchants)) {
    merchantList = registeredMerchants.merchants;
  }

  return rawOffers
    .filter((offer) => {
      if (!offer || typeof offer !== 'object') return false;
      if (offer.status === COMMERCIAL_OFFER_STATUSES.DISABLED || offer.status === COMMERCIAL_OFFER_STATUSES.INVALID) {
        return false;
      }

      // If merchant registry is provided, validate offer and merchant activity
      if (merchantList.length > 0) {
        const merchant = merchantList.find((m) => m.merchant_id === offer.merchant_id);
        if (!merchant) return false;

        // If offer claims ACTIVE_AFFILIATE, merchant must have affiliate_active === true
        if (offer.status === COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE) {
          if (merchant.affiliate_active !== true) return false;
          if (!offer.affiliate_url) return false;
          if (!isDomainAllowlisted(offer.affiliate_url, merchant, merchantList)) return false;
        }

        if (offer.product_url && !isDomainAllowlisted(offer.product_url, merchant, merchantList)) {
          return false;
        }
      }

      return true;
    })
    .map((offer) => {
      const isStale = isOfferStale(offer, maxPriceAgeMs);
      return {
        ...offer,
        // Suppress price if stale or missing timestamp
        display_price: isStale ? null : offer.price,
        is_price_stale: isStale
      };
    });
}
