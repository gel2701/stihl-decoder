/**
 * src/affiliate/EbayOfferStore.js
 *
 * Phase 80 — Canonical eBay offer store (the missing publication link).
 *
 * The validation engine produces canonical offers; the public provider can only
 * publish what was actually adjudicated. This store is that boundary:
 *
 *  - Only offers with decision ACCEPT and status ACTIVE are written.
 *  - A REVIEW / NEEDS_EVIDENCE offer is never persisted as ACTIVE.
 *  - Existing valid ACTIVE offers are preserved when a later batch does not
 *    mention them; a batch never deletes what it did not examine.
 *  - The store is the single record the provider reads, so the public chain can
 *    resolve a direct affiliate link from stored evidence without re-running a
 *    weaker product match.
 */

import fs from 'fs';
import path from 'path';

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { MATCH_TYPES, OFFER_STATUSES } from './OfferEvidenceMatcher.js';
import { SHIPPING_STATUS } from './EbayShippingEvidence.js';
import { getEbayOfferStorePath } from './AffiliateStoragePaths.js';

export const EBAY_OFFER_STORE_SCHEMA_VERSION = '1.0.0';

const ALLOWED_MARKETPLACES = new Set(['EBAY_NL', 'EBAY_DE']);
const ACTIVE_MATCH_TYPES = new Set([
  MATCH_TYPES.EXACT_MPN,
  MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION,
  MATCH_TYPES.VERIFIED_REPLACEMENT
]);

/**
 * Composite key: one listing can legitimately be proven for more than one
 * canonical part number, so part_number is part of the identity.
 *
 * @param {string} itemId
 * @param {string} marketplace
 * @param {string} [partNumber]
 * @returns {string}
 */
export function ebayOfferKey(itemId, marketplace, partNumber = '') {
  return `${String(partNumber || '')}:${String(marketplace || '').toUpperCase()}:${String(itemId || '')}`;
}

/**
 * Validates an eBay affiliate URL: https, ebay.nl/de/com host, exactly the
 * configured EPN campaign id.
 *
 * @param {string} rawUrl
 * @param {string} [campaignId]
 * @returns {{ valid: boolean, url: string, reason?: string }}
 */
export function validateEbayAffiliateUrl(rawUrl, campaignId = process.env.EBAY_EPN_CAMPAIGN_ID) {
  if (typeof rawUrl !== 'string' || !rawUrl) return { valid: false, url: '', reason: 'AFFILIATE_URL_INVALID' };
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, url: '', reason: 'AFFILIATE_URL_INVALID' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return { valid: false, url: '', reason: 'AFFILIATE_URL_INVALID' };
  }
  if (!/^(?:[a-z0-9-]+\.)*ebay\.(?:de|nl|com)$/i.test(parsed.hostname)) {
    return { valid: false, url: '', reason: 'AFFILIATE_URL_INVALID' };
  }
  const ids = [...parsed.searchParams.getAll('campid'), ...parsed.searchParams.getAll('affiliateCampaignId')];
  if (!campaignId || ids.length !== 1 || ids[0] !== String(campaignId)) {
    return { valid: false, url: '', reason: 'CAMPAIGN_ID_MISMATCH' };
  }
  return { valid: true, url: parsed.toString() };
}

/**
 * Normalizes an adjudicated engine offer to the canonical store record.
 * Returns null when the offer may never be published.
 *
 * @param {Object} offer
 * @param {Object} [options]
 * @param {string} [options.campaignId]
 * @returns {Object|null}
 */
export function toCanonicalEbayOffer(offer, options = {}) {
  if (!offer || typeof offer !== 'object') return null;
  const part = PartNormalizer.normalizePartNumber(offer.part_number);
  if (!part || part.length !== 11) return null;
  const marketplace = String(offer.marketplaceId || offer.marketplace || '').toUpperCase();
  if (!ALLOWED_MARKETPLACES.has(marketplace)) return null;
  const itemId = typeof offer.item_id === 'string' ? offer.item_id : '';
  if (!itemId) return null;

  const decision = offer.decision;
  const status = offer.status;
  if (decision !== 'ACCEPT') return null;
  if (status && status !== OFFER_STATUSES.ACTIVE) return null;
  if (!ACTIVE_MATCH_TYPES.has(offer.match_type)) return null;
  if (offer.ships_to_nl !== true) return null;
  if ((offer.shipping_status || SHIPPING_STATUS.CONFIRMED) !== SHIPPING_STATUS.CONFIRMED) return null;

  const affiliate = validateEbayAffiliateUrl(offer.affiliate_url || offer.itemAffiliateWebUrl, options.campaignId);
  if (!affiliate.valid) return null;

  const itemPrice = Number.isFinite(Number(offer.item_price ?? offer.price)) ? Number(offer.item_price ?? offer.price) : null;
  const shippingCost = Number.isFinite(Number(offer.shipping_cost_nl ?? offer.shipping_cost))
    ? Number(offer.shipping_cost_nl ?? offer.shipping_cost)
    : null;

  const relatedParts = [...new Set([
    part,
    ...(Array.isArray(offer.related_part_numbers) ? offer.related_part_numbers.map(p => PartNormalizer.normalizePartNumber(p)).filter(Boolean) : [])
  ])];

  return {
    part_number: part,
    related_part_numbers: relatedParts,
    item_id: itemId,
    marketplace,
    marketplace_id: marketplace,
    status: OFFER_STATUSES.ACTIVE,
    decision: 'ACCEPT',
    match_type: offer.match_type,
    match_basis: offer.match_basis || null,
    title: typeof offer.title === 'string' ? offer.title : '',
    mpn: offer.mpn || '',
    brand: offer.brand || '',
    gtin: offer.gtin || null,
    seller_name: offer.seller_name || '',
    item_price: itemPrice,
    shipping_cost_nl: shippingCost,
    currency: offer.currency || 'EUR',
    ships_to_nl: true,
    shipping_status: SHIPPING_STATUS.CONFIRMED,
    shipping_evidence: offer.evidence?.shipping || null,
    product_evidence: offer.evidence?.product || null,
    affiliate_url: affiliate.url,
    item_url: affiliate.url,
    itemAffiliateWebUrl: affiliate.url,
    campaign_id: String(options.campaignId || process.env.EBAY_EPN_CAMPAIGN_ID || ''),
    condition: offer.condition || null,
    checked_at: offer.checked_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Reads the store; always returns a well-formed document.
 *
 * @param {string} [filePath]
 * @returns {{ schema_version: string, updated_at: string|null, offers: Array<Object> }}
 */
export function loadEbayOfferStore(filePath = getEbayOfferStorePath()) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { schema_version: EBAY_OFFER_STORE_SCHEMA_VERSION, updated_at: null, offers: [] };
    }
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      schema_version: doc.schema_version || EBAY_OFFER_STORE_SCHEMA_VERSION,
      updated_at: doc.updated_at || null,
      offers: Array.isArray(doc.offers) ? doc.offers : []
    };
  } catch {
    return { schema_version: EBAY_OFFER_STORE_SCHEMA_VERSION, updated_at: null, offers: [] };
  }
}

/**
 * Merges adjudicated offers into the store without deleting untouched ACTIVE
 * records, then writes atomically.
 *
 * @param {string} filePath
 * @param {Array<Object>} offers
 * @param {Object} [options]
 * @returns {{ written: number, preserved: number, rejected: number, doc: Object }}
 */
export function saveEbayOfferStore(filePath = getEbayOfferStorePath(), offers = [], options = {}) {
  const existing = loadEbayOfferStore(filePath);
  const merged = new Map();
  for (const record of existing.offers) {
    if (!record || typeof record !== 'object') continue;
    const key = ebayOfferKey(record.item_id, record.marketplace, record.part_number);
    merged.set(key, record);
  }
  let written = 0;
  let rejected = 0;
  const preservedKeys = new Set(merged.keys());
  for (const offer of (Array.isArray(offers) ? offers : [])) {
    const canonical = toCanonicalEbayOffer(offer, options);
    if (!canonical) {
      rejected++;
      continue;
    }
    const key = ebayOfferKey(canonical.item_id, canonical.marketplace, canonical.part_number);
    const previous = merged.get(key);
    if (previous && Array.isArray(previous.related_part_numbers)) {
      canonical.related_part_numbers = [...new Set([...previous.related_part_numbers, ...canonical.related_part_numbers])];
    }
    merged.set(key, canonical);
    preservedKeys.delete(key);
    written++;
  }
  const doc = {
    schema_version: EBAY_OFFER_STORE_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    campaign_id: String(options.campaignId || process.env.EBAY_EPN_CAMPAIGN_ID || ''),
    policy: {
      activatable_match_types: [...ACTIVE_MATCH_TYPES],
      requires_shipping: SHIPPING_STATUS.CONFIRMED,
      commerce_disclosure: 'sponsored nofollow noopener'
    },
    metrics: {
      total: merged.size,
      active: [...merged.values()].filter(o => o.status === OFFER_STATUSES.ACTIVE).length
    },
    offers: [...merged.values()]
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
  return { written, preserved: preservedKeys.size, rejected, doc };
}

/**
 * Builds the Map consumed by EbayAffiliateProvider.
 *
 * @param {string} [filePath]
 * @returns {Map<string, Array<Object>>}
 */
export function loadEbayCachedOffers(filePath = getEbayOfferStorePath()) {
  const map = new Map();
  const doc = loadEbayOfferStore(filePath);
  for (const offer of doc.offers) {
    if (!offer || offer.decision !== 'ACCEPT' || offer.status !== OFFER_STATUSES.ACTIVE) continue;
    const part = PartNormalizer.normalizePartNumber(offer.part_number);
    if (!part) continue;
    if (!map.has(part)) map.set(part, []);
    map.get(part).push(offer);
  }
  return map;
}
