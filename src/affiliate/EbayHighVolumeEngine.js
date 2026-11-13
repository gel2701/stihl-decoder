/**
 * src/affiliate/EbayHighVolumeEngine.js
 *
 * Phase 76C/76G — High-Volume eBay Affiliate Engine
 * Phase 80 — Evidence-completing activation pipeline.
 *
 * Batches 100–5,000+ canonical STIHL parts against eBay.nl and eBay.de with
 * checkpoint-resume, multi-vendor search, strict matching and API backoff.
 *
 * Phase 80 changes:
 *  - ONE canonical decision: OfferEvidenceMatcher (identity) +
 *    EbayShippingEvidence (NL delivery). No layer re-decides with less data.
 *  - A REVIEW candidate is no longer a dead end: when evidence is missing the
 *    engine asks eBay getItem for the item detail and re-adjudicates with that
 *    evidence (cached in EbayEvidenceRegistry, so nothing is fetched twice).
 *  - Only ACCEPT becomes ACTIVE. REVIEW is stored as NEEDS_EVIDENCE.
 *  - Offers carry the exact fields the public provider and store read
 *    (affiliate_url, itemAffiliateWebUrl, item_url, marketplace, shipping_status,
 *    match_type, decision, status, evidence).
 */

import fs from 'fs';
import { PartNormalizer } from '../parts/PartNormalizer.js';
import {
  classifyOffer,
  MATCH_TYPES,
  OFFER_STATUSES,
  extractPartNumbers,
  isBundleTitle
} from './OfferEvidenceMatcher.js';
import {
  evaluateShippingEvidence,
  SHIPPING_STATUS
} from './EbayShippingEvidence.js';

const MATCH_BASIS_BY_TYPE = Object.freeze({
  [MATCH_TYPES.EXACT_MPN]: 'MPN_EXACT',
  [MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION]: 'PART_NUMBER_CORROBORATED',
  [MATCH_TYPES.VERIFIED_REPLACEMENT]: 'VERIFIED_REPLACEMENT',
  [MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE]: 'TITLE_ONLY'
});

const STATUS_BY_DECISION = Object.freeze({
  ACCEPT: OFFER_STATUSES.ACTIVE,
  REVIEW: OFFER_STATUSES.NEEDS_EVIDENCE,
  REJECT: OFFER_STATUSES.REJECTED
});

const REJECT_CODES = new Set([
  'MISSING_REQUIRED_DATA', 'PART_NUMBER_MISMATCH', 'CONFLICTING_MPN',
  'CONFLICTING_TITLE_PART_NUMBER', 'PRODUCT_TYPE_CONFLICT', 'BUNDLE_OR_KIT',
  'OUT_OF_STOCK', 'AFFILIATE_URL_INVALID', 'CAMPAIGN_ID_MISMATCH',
  'CONTRADICTORY_MATCH'
]);

function asBrowseEvidence(candidate) {
  if (!candidate || typeof candidate !== 'object' || candidate.confirmed !== true) return null;
  if (candidate.source === 'BROWSE_DELIVERY_COUNTRY_FILTER'
    || candidate.delivery_country === 'NL'
    || typeof candidate.filter === 'string') return candidate;
  return null;
}

/**
 * Collects the NL delivery evidence that was already recorded for a listing.
 *
 * Existing review offers store it in different shapes depending on when they
 * were produced (`shipping_evidence.browse_delivery`, `evidence.shipping`, a flat
 * `browse_delivery_evidence`, or just a confirmed shipping status). Dropping any
 * of those shapes silently turned proven NL delivery back into "unknown".
 *
 * @param {Object} item stored offer / summary item
 * @param {Object|null} detail getItem detail
 * @param {{ marketplace?: string|null }} [context]
 * @returns {Object|null} browse delivery evidence or null
 */
export function priorDeliveryEvidence(item = {}, detail = null, context = {}) {
  const candidates = [
    item?.shipping_evidence?.browse_delivery,
    item?.shipping_evidence,
    item?.browse_delivery_evidence,
    item?.evidence?.shipping?.browse_delivery,
    item?.evidence?.shipping,
    detail?.shipping_evidence?.browse_delivery,
    detail?.browse_delivery_evidence,
    detail?.evidence?.shipping?.browse_delivery
  ];
  for (const candidate of candidates) {
    const evidence = asBrowseEvidence(candidate);
    if (evidence) return evidence;
  }
  // Explicitly recorded confirmation from an earlier canonical decision. Only
  // reused when it carries a timestamp, so stale delivery claims expire.
  const status = item?.shipping_status || detail?.shipping_status;
  if (status === SHIPPING_STATUS.CONFIRMED) {
    const confirmedAt = item?.shipping_confirmed_at || item?.checked_at || item?.verified_at
      || item?.updated_at || detail?.fetched_at || null;
    if (confirmedAt) {
      return {
        source: 'PRIOR_BATCH_RECORD',
        delivery_country: 'NL',
        filter: 'deliveryCountry:NL',
        marketplace: context.marketplace || item?.marketplace || null,
        api_status: 200,
        confirmed: true,
        confirmed_at: confirmedAt,
        item_count: 0,
        queries: [],
        end_user_context: null
      };
    }
  }
  return null;
}

export class EbayHighVolumeEngine {
  constructor(options = {}) {
    if (!options.apiClient) throw new Error('[EbayHighVolumeEngine] apiClient is required');
    this.apiClient = options.apiClient;
    this.batchDelayMs = options.batchDelayMs ?? 100;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? 5000;
    this.vendors = options.vendors ?? ['saegenspezi_de', 'ebay_shop_seller', 'general_parts_nl'];
    this.marketplaces = options.marketplaces ?? ['EBAY_NL', 'EBAY_DE'];
    this.enrichByDefault = options.enrich ?? true;
    this.maxEnrichments = options.maxEnrichments ?? 250;
    this.evidenceRegistry = options.evidenceRegistry || null;
    this.classifications = new Map(); // part → { type, confidence, models }
    this.activeOffers = new Map(); // part → [{ vendor, marketplace, item_id, price, ... }]
    this.rejectedOffers = new Map(); // part → [{ reason, item_id, vendor, ... }]
    this.checkpoints = []; // { timestamp, partIndex, processedCount }
  }

  /**
   * Classify a part number into a category for stricter matching.
   * Phase 76G: concrete product-type words only. "saw" inside "chainsaw" must
   * never classify a part as saw_chain — category and explicit part-type words win.
   * Phase 80: also carries the catalog model relations used as corroboration.
   * @param {string} part 11-digit number
   * @param {Array} knownParts canonical database ({part_number, description, category, models})
   * @returns {Object} { type: string, confidence: number, models: string[] }
   */
  classifyPart(part, knownParts = []) {
    const match = knownParts.find(p => PartNormalizer.normalizePartNumber(p.part_number) === part);
    if (!match) return { type: 'unknown', confidence: 0, models: [] };
    const models = Array.isArray(match.models)
      ? match.models
      : (Array.isArray(match.model_ids) ? match.model_ids : (Array.isArray(match.compatible_models) ? match.compatible_models : []));
    const base = { models };
    const desc = String(match.description || '').toLowerCase();
    const category = String(match.category || '').toLowerCase();
    const hay = `${category} ${desc}`;
    // Ordered, most specific first. Word-bounded patterns — no bare 'saw', no bare 'chain', no bare 'carb', no bare 'plug'.
    if (/\bbougie\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bglühkerze\b|\bgluehkerze\b/.test(hay)) return { type: 'spark_plug', confidence: 0.95, ...base };
    if (/\bcarburateur(\w*)\b|\bcarburetor\b|\bvergaser\b|\bvergaserkit\b/.test(hay)) return { type: 'carburetor', confidence: 0.95, ...base };
    if (/\bluchtfilter\b|\bair\s*filter\b|\bluftfilter\b/.test(hay)) return { type: 'air_filter', confidence: 0.9, ...base };
    if (/\bsaw\s*chain\b|\bsägekette\b|\bsaegekette\b|\bzaagketting\b|\bchainsaw\s*chain\b/.test(hay)) return { type: 'saw_chain', confidence: 0.9, ...base };
    if (/\bstarter\b|\bstartkoord\b|\bstartkoord\b|\brewind\s*starter\b|\brecoil\s*starter\b/.test(hay)) return { type: 'starter', confidence: 0.9, ...base };
    if (/\boliepomp\b|\boil\s*pump\b|\bölpumpe\b|\bolpumpe\b/.test(hay)) return { type: 'oil_pump', confidence: 0.9, ...base };
    if (/\bbrandstoffilter\b|\bfuel\s*filter\b|\bkraftstoffilter\b|\bpickup\s*body\b/.test(hay)) return { type: 'fuel_filter', confidence: 0.9, ...base };
    if (/\bkoppeling\b|\bclutch\b/.test(hay)) return { type: 'clutch', confidence: 0.9, ...base };
    return { type: 'generic_part', confidence: 0.8, ...base };
  }

  /**
   * Backwards-compatible wrapper: returns the validated offer object for
   * ACCEPT/REVIEW and null for REJECT. Use evaluateOffer() for diagnostics.
   * @returns {Object|null}
   */
  validateOffer(item, targetPart, classification = {}) {
    return this.evaluateOffer(item, targetPart, classification).offer;
  }

  /**
   * Central validation. Fail-closed: every failed check becomes a reason code and
   * the first blocking step is reported.
   *
   * Reason codes: MISSING_REQUIRED_DATA, PART_NUMBER_MISMATCH, CONFLICTING_MPN,
   * CONFLICTING_TITLE_PART_NUMBER, PRODUCT_TYPE_CONFLICT, BUNDLE_OR_KIT,
   * OUT_OF_STOCK, AFFILIATE_URL_INVALID, CAMPAIGN_ID_MISMATCH,
   * CONTRADICTORY_MATCH, SHIPPING_NOT_CONFIRMED.
   *
   * @returns {{decision: 'ACCEPT'|'REVIEW'|'REJECT', reason_codes: string[], first_blocking_step: string|null, offer: Object|null, match_type: string|null, status: string, evidence_gaps: string[]}}
   */
  evaluateOffer(item, targetPart, classification = {}) {
    const reason_codes = [];
    const add = code => { if (!reason_codes.includes(code)) reason_codes.push(code); };

    if (!item || !(item.itemId || item.item_id)) {
      return {
        decision: 'REJECT', reason_codes: ['MISSING_REQUIRED_DATA'], first_blocking_step: 'MISSING_REQUIRED_DATA',
        offer: null, match_type: null, status: OFFER_STATUSES.REJECTED, evidence_gaps: []
      };
    }

    // Normalize: raw Browse API shape, client-parsed shape, or an enriched item
    // carrying getItem detail (item_detail / itemDetail).
    const detail = item.item_detail || item.itemDetail || null;
    const detailShipping = Array.isArray(detail?.shipping_options)
      ? detail.shipping_options
      : (Array.isArray(detail?.shippingOptions) ? detail.shippingOptions : []);
    const rawShipping = Array.isArray(item.shippingOptions)
      ? item.shippingOptions
      : (Array.isArray(item.shipping_options) ? item.shipping_options : (detailShipping.length > 0 ? detailShipping : null));
    const targetCompact = String(targetPart).replace(/[\s-]/g, '');
    // A recorded NL confirmation from an earlier batch is evidence, but only as
    // an explicit confirmation with a timestamp (never inferred from a bare flag).
    const priorConfirmed = item.ships_to_nl === true
      && (item.shipping_status === undefined || item.shipping_status === SHIPPING_STATUS.CONFIRMED);
    const shippingOptions = rawShipping
      ? rawShipping
      : (priorConfirmed ? [{ shipToLocations: ['NL'], shippingCost: { value: item.shipping_cost_nl } }] : []);
    // Evidence is read from every shape eBay and older batches produced: a
    // normalized record (`aspects`), a raw getItem response (`localizedAspects`)
    // or the product container. Reading only `aspects` dropped the MPN aspect of
    // records that had already been fetched.
    const aspects = [
      ...(Array.isArray(item.aspects) ? item.aspects : []),
      ...(Array.isArray(item.localizedAspects) ? item.localizedAspects : []),
      ...(Array.isArray(detail?.aspects) ? detail.aspects : []),
      ...(Array.isArray(detail?.localizedAspects) ? detail.localizedAspects : []),
      ...(Array.isArray(detail?.product?.aspects) ? detail.product.aspects : [])
    ];
    // Any seller-declared MPN equal to the target wins over other declared MPNs,
    // so a listing that lists several compatible numbers is still provable.
    const declaredMpns = [
      item.mpn,
      detail?.mpn,
      ...(Array.isArray(detail?.mpns) ? detail.mpns : []),
      ...(Array.isArray(detail?.product?.mpns) ? detail.product.mpns : [])
    ].filter(value => typeof value === 'string' && value.trim());
    const mpnForTarget = declaredMpns.find(value => extractPartNumbers(value).includes(targetCompact));
    const norm = {
      itemId: item.itemId ?? item.item_id,
      title: item.title || detail?.title || '',
      mpn: mpnForTarget || declaredMpns[0] || '',
      seller: item.seller ?? { username: item.seller_name },
      price: item.price?.value != null ? item.price : { value: item.item_price ?? detail?.price, currency: item.currency ?? detail?.currency },
      shippingOptions,
      itemDetailShippingOptions: detailShipping,
      estimatedAvailabilities: item.estimatedAvailabilities ?? detail?.availability,
      itemAffiliateWebUrl: item.itemAffiliateWebUrl ?? item.affiliate_url ?? detail?.affiliate_url ?? '',
      condition: item.condition ?? detail?.condition,
      quantity: item.quantity ?? detail?.quantity,
      brand: item.brand ?? detail?.brand ?? '',
      manufacturer: item.manufacturer ?? detail?.manufacturer ?? '',
      gtin: item.gtin ?? detail?.gtin ?? null,
      aspects,
      marketplace: item.marketplace || item.marketplaceId || detail?.marketplace || null,
      shippingEvidence: priorDeliveryEvidence(item, detail, {
        marketplace: item.marketplace || item.marketplaceId || detail?.marketplace || null
      }),
      verifiedReplacements: Array.isArray(item.verified_replacements) ? item.verified_replacements : []
    };
    const title = String(norm.title || '').toLowerCase();
    const targetFormatted = targetCompact.slice(0, 4) + ' ' + targetCompact.slice(4, 7) + ' ' + targetCompact.slice(7);

    if (!norm.title) add('MISSING_REQUIRED_DATA');

    // --- Identity: one canonical decision -----------------------------------
    const identity = classifyOffer({
      targetPart: targetCompact,
      title: norm.title,
      mpn: norm.mpn,
      gtin: norm.gtin,
      aspects: norm.aspects,
      brand: norm.brand,
      manufacturer: norm.manufacturer,
      catalogModels: Array.isArray(classification.models) ? classification.models : [],
      verifiedReplacements: norm.verifiedReplacements
    });
    for (const code of identity.reason_codes) add(code);

    // Rule 1 (diagnostic): target part number must be an explicit reference.
    const separatorRegex = targetFormatted.replace(/\s/g, '[\\s-]*');
    const inMpn = Boolean(norm.mpn) && new RegExp(`(^|\\D)${separatorRegex}(\\D|$)`).test(String(norm.mpn).toLowerCase());
    const inTitle = new RegExp(`(^|\\D)${separatorRegex}(\\D|$)`).test(title);
    if (!inMpn && !inTitle) add('PART_NUMBER_MISMATCH');

    // Rule 1b: conflicting part numbers anywhere in the listing. Part numbers
    // registered as verified replacements of the target are not conflicts.
    const allowedReplacementNumbers = new Set(norm.verifiedReplacements
      .filter(replacement => replacement?.verified === true
        && String(replacement.part_number || '').replace(/[\s-]/g, '') === targetCompact)
      .map(replacement => String(replacement.replacement_part_number || '').replace(/[\s-]/g, ''))
      .filter(part => /^\d{11}$/.test(part)));
    const isAllowedReference = number => number === targetCompact || allowedReplacementNumbers.has(number);
    const mpnNumbers = extractPartNumbers(norm.mpn);
    const titleNumbers = extractPartNumbers(title);
    if (mpnNumbers.some(n => !isAllowedReference(n))) add('CONFLICTING_MPN');
    if (titleNumbers.some(n => !isAllowedReference(n))) add('CONFLICTING_TITLE_PART_NUMBER');

    // Rule 2: product type — reject conflicting types in the title.
    const expectedType = classification?.type;
    const TYPE_CONFLICTS = {
      spark_plug: /\bcarburetor\b|\bvergaser\b|\bair\s*filter\b|\bluftfilter\b|\bsaw\s*chain\b|\bzaagketting\b/,
      carburetor: /\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bair\s*filter\b|\bluftfilter\b|\bsaw\s*chain\b|\bzaagketting\b/,
      air_filter: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bsaw\s*chain\b|\bzaagketting\b/,
      saw_chain: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bair\s*filter\b|\bluftfilter\b/,
      starter: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bair\s*filter\b|\bluftfilter\b|\bsaw\s*chain\b|\bzaagketting\b/,
      oil_pump: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b/,
      fuel_filter: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b/,
      clutch: /\bcarburetor\b|\bvergaser\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b/
    };
    if (expectedType && TYPE_CONFLICTS[expectedType] && TYPE_CONFLICTS[expectedType].test(title)) add('PRODUCT_TYPE_CONFLICT');

    // Rule 3: bundle/kit from the title only. Browse `quantity` is the available
    // stock count, not a multipack: treating stock > 1 as a bundle used to turn
    // every enriched REVIEW candidate into a REJECT.
    if (isBundleTitle(title)) add('BUNDLE_OR_KIT');
    if (Array.isArray(norm.estimatedAvailabilities)
      && norm.estimatedAvailabilities.some(a => (typeof a === 'string' ? a : a?.estimatedAvailabilityStatus) === 'OUT_OF_STOCK')
      && !Array.isArray(detail?.availability)) add('OUT_OF_STOCK');

    // Rule 4: affiliate URL must be present, on eBay, HTTPS and carry exactly the EPN campaign ID
    const campaignId = process.env.EBAY_EPN_CAMPAIGN_ID || '';
    let parsedAff = null;
    if (!norm.itemAffiliateWebUrl || typeof norm.itemAffiliateWebUrl !== 'string') {
      add('AFFILIATE_URL_INVALID');
    } else {
      try {
        parsedAff = new URL(norm.itemAffiliateWebUrl);
      } catch {
        add('AFFILIATE_URL_INVALID');
      }
    }
    if (parsedAff) {
      const hasEbayHost = parsedAff.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*ebay\.(?:de|nl|com)$/i.test(parsedAff.hostname);
      if (!hasEbayHost) add('AFFILIATE_URL_INVALID');
      const campids = parsedAff.searchParams.getAll('campid');
      if (!campaignId || campids.length !== 1 || campids[0] !== campaignId) add('CAMPAIGN_ID_MISMATCH');
    }

    // Rule 5: NL shipping evidence (item options first, deliveryCountry filter second).
    const shipping = evaluateShippingEvidence({
      shippingOptions: norm.shippingOptions,
      itemDetailShippingOptions: norm.itemDetailShippingOptions,
      browseDeliveryEvidence: norm.shippingEvidence
    });
    if (shipping.status !== SHIPPING_STATUS.CONFIRMED) add('SHIPPING_NOT_CONFIRMED');

    const evidenceGaps = [...(identity.evidence_gaps || [])];
    if (shipping.status !== SHIPPING_STATUS.CONFIRMED) evidenceGaps.push('SHIPPING_TO_NL');

    const blocking = reason_codes.find(code => REJECT_CODES.has(code)) || null;
    if (blocking) {
      return {
        decision: 'REJECT', reason_codes, first_blocking_step: blocking, offer: null,
        match_type: identity.match_type, status: OFFER_STATUSES.REJECTED, evidence_gaps: evidenceGaps
      };
    }
    if (shipping.status === SHIPPING_STATUS.DOES_NOT_SHIP) {
      return {
        decision: 'REJECT', reason_codes, first_blocking_step: 'SHIPPING_NOT_CONFIRMED', offer: null,
        match_type: identity.match_type, status: OFFER_STATUSES.REJECTED, evidence_gaps: evidenceGaps
      };
    }
    if (shipping.status === SHIPPING_STATUS.UNKNOWN) {
      return {
        decision: 'REVIEW', reason_codes, first_blocking_step: 'SHIPPING_NOT_CONFIRMED',
        offer: this.buildOffer(norm, inMpn, false, { identity, shipping, decision: 'REVIEW', evidenceGaps }),
        match_type: identity.match_type, status: OFFER_STATUSES.NEEDS_EVIDENCE, evidence_gaps: evidenceGaps
      };
    }
    if (identity.status !== OFFER_STATUSES.ACTIVE) {
      // Shipping is proven; only product-identity corroboration is missing.
      return {
        decision: 'REVIEW', reason_codes,
        first_blocking_step: 'PRODUCT_IDENTITY_EVIDENCE_MISSING',
        offer: this.buildOffer(norm, inMpn, true, { identity, shipping, decision: 'REVIEW', evidenceGaps }),
        match_type: identity.match_type, status: OFFER_STATUSES.NEEDS_EVIDENCE, evidence_gaps: evidenceGaps
      };
    }
    return {
      decision: 'ACCEPT', reason_codes, first_blocking_step: null,
      offer: this.buildOffer(norm, inMpn, true, { identity, shipping, decision: 'ACCEPT', evidenceGaps }),
      match_type: identity.match_type, status: OFFER_STATUSES.ACTIVE, evidence_gaps: evidenceGaps
    };
  }

  /**
   * Builds the canonical offer payload for ACCEPT/REVIEW decisions.
   * Field names are the contract every consumer reads:
   * affiliate_url / itemAffiliateWebUrl / item_url, marketplace, part_number,
   * decision, status, match_type, shipping_status, evidence.
   *
   * @private
   */
  buildOffer(item, inMpn, shipsToNl, extra = {}) {
    const decision = extra.decision || (inMpn ? 'ACCEPT' : 'REVIEW');
    const matchType = extra.identity?.match_type ?? (inMpn ? MATCH_TYPES.EXACT_MPN : MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE);
    const shippingStatus = extra.shipping?.status
      ?? (shipsToNl ? SHIPPING_STATUS.CONFIRMED : SHIPPING_STATUS.UNKNOWN);
    const affiliateUrl = item.itemAffiliateWebUrl || '';
    return {
      decision,
      status: STATUS_BY_DECISION[decision] || OFFER_STATUSES.NEEDS_EVIDENCE,
      match_type: matchType,
      match_basis: MATCH_BASIS_BY_TYPE[matchType] || (inMpn ? 'MPN_EXACT' : 'TITLE_ONLY'),
      item_id: item.itemId,
      title: item.title || '',
      mpn: item.mpn || '',
      brand: item.brand || '',
      manufacturer: item.manufacturer || '',
      gtin: item.gtin || null,
      seller_name: item.seller?.username || '',
      price: item.price?.value ? Number(item.price.value) : null,
      item_price: item.price?.value ? Number(item.price.value) : null,
      currency: item.price?.currency || 'EUR',
      shipping_cost: item.shippingOptions?.[0]?.shippingCost?.value ? Number(item.shippingOptions[0].shippingCost.value) : null,
      shipping_cost_nl: extra.shipping?.shipping_cost_nl ?? null,
      ships_to_nl: Boolean(shipsToNl),
      shipping_status: shippingStatus,
      shipping_evidence: extra.shipping?.evidence || null,
      condition: item.condition || 'NEW',
      marketplace: item.marketplace || null,
      marketplaceId: item.marketplace || null,
      item_url: affiliateUrl || null,
      affiliate_url: affiliateUrl,
      itemAffiliateWebUrl: affiliateUrl,
      evidence: {
        product: {
          match_type: matchType,
          corroboration: extra.identity?.corroboration || [],
          contradictory_part_numbers: extra.identity?.contradictory_part_numbers || []
        },
        shipping: extra.shipping?.evidence || null,
        affiliate: { campaign_id: process.env.EBAY_EPN_CAMPAIGN_ID || null, url_source: 'itemAffiliateWebUrl' }
      },
      evidence_gaps: Array.isArray(extra.evidenceGaps) ? extra.evidenceGaps : [],
      checked_at: new Date().toISOString(),
      validation_confidence: decision === 'ACCEPT' ? (matchType === MATCH_TYPES.EXACT_MPN ? 0.98 : 0.95) : 0.85
    };
  }

  /**
   * Fetches item detail for a candidate that still needs product or shipping
   * evidence. Uses the shared evidence registry first so the same listing is
   * never verified twice, then getItem with its own in-memory cache.
   *
   * @param {Object} item
   * @param {Object} [options]
   * @returns {Promise<{ item: Object, source: 'REGISTRY'|'GET_ITEM' }|null>}
   */
  async enrichCandidate(item, options = {}) {
    const itemId = item?.itemId ?? item?.item_id;
    if (typeof itemId !== 'string' || !itemId) return null;
    const marketplace = item.marketplace || item.marketplaceId || null;
    const registry = options.evidenceRegistry || this.evidenceRegistry;
    let detail = registry && typeof registry.get === 'function' ? registry.get(itemId) : null;
    let source = 'REGISTRY';
    if (!detail) {
      if (!this.apiClient || typeof this.apiClient.getItem !== 'function') return null;
      const res = await this.apiClient.getItem(itemId, { marketplace });
      if (!res || !res.success || !res.item) return null;
      detail = res.item;
      source = 'GET_ITEM';
      if (registry && typeof registry.record === 'function') registry.record(itemId, detail);
    }
    const merged = {
      ...item,
      item_detail: detail,
      mpn: item.mpn || detail.mpn || '',
      gtin: item.gtin || detail.gtin || null,
      brand: item.brand || detail.brand || '',
      manufacturer: item.manufacturer || detail.manufacturer || '',
      aspects: [...(Array.isArray(item.aspects) ? item.aspects : []), ...(Array.isArray(detail.aspects) ? detail.aspects : [])],
      itemAffiliateWebUrl: item.itemAffiliateWebUrl || item.affiliate_url || detail.affiliate_url || ''
    };
    return { item: merged, source, evidence_reused: source === 'REGISTRY' };
  }

  /**
   * Batch-process canonical parts across multiple marketplaces and vendors.
   * @param {Array<string>} canonicalParts 11-digit STIHL part numbers
   * @param {Object} options { maxItems, knownParts, checkpoint, resumeFrom, enrich, maxEnrichments, evidenceRegistry }
   * @returns {Promise<Object>} summary with active_offers, review_offers, rejected_offers, metrics
   */
  async processBatch(canonicalParts = [], options = {}) {
    const maxItems = Math.min(options.maxItems || 5000, canonicalParts.length);
    const knownParts = options.knownParts || [];
    const checkpoint = options.checkpoint || { partIndex: 0, processedParts: 0 };
    const resumeFrom = options.resumeFrom ?? checkpoint.partIndex;
    const enrich = options.enrich ?? this.enrichByDefault;
    const maxEnrichments = options.maxEnrichments ?? this.maxEnrichments;
    const evidenceRegistry = options.evidenceRegistry || this.evidenceRegistry;

    const activeOffers = [];
    const reviewOffers = [];
    const seen = new Set();
    const rejectedOffers = [];
    let enrichmentsUsed = 0;
    const metrics = {
      scanned_parts: 0,
      total_searches: 0,
      raw_results: 0,
      client_passed: 0,
      client_rejected: 0,
      client_rejection_reasons: {},
      offers_found: 0,
      offers_validated: 0,
      offers_reviewed: 0,
      offers_rejected: 0,
      rejections_by_reason: {},
      first_blocking_steps: {},
      errors: [],
      api_calls: 0,
      backoff_delays: 0,
      enrichment_attempts: 0,
      evidence_enriched: 0,
      evidence_reused: 0,
      needs_evidence: 0
    };

    const startTime = Date.now();
    let lastCheckpoint = startTime;

    for (let i = resumeFrom; i < Math.min(resumeFrom + maxItems, canonicalParts.length); i++) {
      const part = PartNormalizer.normalizePartNumber(canonicalParts[i]);
      if (!part) continue;

      metrics.scanned_parts++;
      const classification = this.classifyPart(part, knownParts);

      // Search across multiple marketplaces and vendors
      for (const marketplace of this.marketplaces) {
        for (const vendor of this.vendors) {
          metrics.total_searches++;
          let retries = 0;
          const maxRetries = 2;

          while (retries <= maxRetries) {
            try {
              const res = await this.apiClient.searchItems({
                partNumber: part,
                seller: vendor,
                marketplace,
                limit: 10,
                catalogModels: classification.models
              });

              if (!res.success) {
                if (res.errors?.some(e => e.includes('429'))) {
                  // Rate limit — exponential backoff
                  const backoffMs = Math.min(this.backoffBaseMs * Math.pow(2, retries), 30000);
                  metrics.backoff_delays++;
                  if (backoffMs > 0) await new Promise(resolve => setTimeout(resolve, backoffMs));
                  retries++;
                  continue;
                }
                metrics.errors.push(`${part}@${marketplace}/${vendor}: ${res.errors?.[0]}`);
                break;
              }

              metrics.api_calls++;
              // Phase 76G funnel: raw API results vs client filter vs engine validation
              if (res.stats) {
                metrics.raw_results += res.stats.raw_count || 0;
                metrics.client_passed += res.stats.client_passed_count || 0;
                metrics.client_rejected += res.stats.client_rejected_count || 0;
                for (const [code, n] of Object.entries(res.stats.client_rejection_reasons || {})) {
                  metrics.client_rejection_reasons[code] = (metrics.client_rejection_reasons[code] || 0) + n;
                }
              } else {
                metrics.raw_results += res.items?.length || 0;
                metrics.client_passed += res.items?.length || 0;
              }

              // Classification: ACCEPT/REVIEW/REJECT — only ACCEPT may enter active_offers
              for (const rawItem of res.items || []) {
                let item = { ...rawItem, marketplace: rawItem.marketplace || marketplace };
                let verdict = this.evaluateOffer(item, part, classification);
                let enrichment = null;

                // Phase 80: missing evidence is completed, not punished. Only
                // candidates whose identity/shipping evidence is the blocker are
                // enriched; contradictory matches stay rejected.
                const missingEvidence = verdict.decision === 'REVIEW'
                  && verdict.evidence_gaps.length > 0
                  && enrich
                  && enrichmentsUsed < maxEnrichments;
                if (missingEvidence) {
                  enrichmentsUsed++;
                  metrics.enrichment_attempts++;
                  enrichment = await this.enrichCandidate(item, { evidenceRegistry });
                  if (enrichment) {
                    if (enrichment.evidence_reused) metrics.evidence_reused++;
                    item = enrichment.item;
                    verdict = this.evaluateOffer(item, part, classification);
                  }
                }

                if (verdict.decision === 'ACCEPT') {
                  metrics.offers_validated++;
                  if (enrichment && enrichment.item) metrics.evidence_enriched++;
                  const offer = { part_number: part, marketplace, vendor, ...verdict.offer, marketplace, marketplaceId: marketplace };
                  const key = `${offer.marketplace}:${offer.item_id}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    activeOffers.push(offer);
                  }
                } else if (verdict.decision === 'REVIEW') {
                  // Unconfirmed data — needs evidence, never auto-accepted and
                  // never stored as ACTIVE.
                  metrics.offers_reviewed++;
                  metrics.needs_evidence++;
                  const offer = { part_number: part, marketplace, vendor, ...verdict.offer, marketplace, marketplaceId: marketplace, reason_codes: verdict.reason_codes };
                  const key = `${offer.marketplace}:${offer.item_id}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    reviewOffers.push({
                      ...offer,
                      status: OFFER_STATUSES.NEEDS_EVIDENCE,
                      enrichment: enrichment ? { attempted: true, source: enrichment.source, evidence_reused: Boolean(enrichment.evidence_reused) } : { attempted: false }
                    });
                  }
                } else {
                  metrics.offers_rejected++;
                  for (const code of verdict.reason_codes) {
                    metrics.rejections_by_reason[code] = (metrics.rejections_by_reason[code] || 0) + 1;
                  }
                  const firstStep = verdict.first_blocking_step || 'MISSING_REQUIRED_DATA';
                  metrics.first_blocking_steps[firstStep] = (metrics.first_blocking_steps[firstStep] || 0) + 1;
                  rejectedOffers.push({
                    part_number: part,
                    marketplace,
                    vendor,
                    item_id: item.itemId ?? item.item_id,
                    title: item.title || '',
                    mpn: item.mpn || '',
                    reason: 'validation_failed',
                    primary_reason: firstStep,
                    reason_codes: verdict.reason_codes,
                    match_type: verdict.match_type,
                    status: OFFER_STATUSES.REJECTED
                  });
                }
              }

              metrics.offers_found += res.items?.length || 0;
              break; // Success, move to next vendor
            } catch (err) {
              metrics.errors.push(`${part}@${marketplace}/${vendor}: ${err.message}`);
              break;
            }
          }

          // API rate-limit respect
          if (this.batchDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }
      }

      // Checkpoint every 5s
      const now = Date.now();
      if (now - lastCheckpoint > this.checkpointIntervalMs) {
        this.checkpoints.push({
          timestamp: new Date().toISOString(),
          partIndex: i + 1,
          processedCount: metrics.scanned_parts,
          activeCount: activeOffers.length,
          reviewCount: reviewOffers.length,
          rejectedCount: rejectedOffers.length
        });
        lastCheckpoint = now;
      }
    }

    return {
      status: 'complete',
      summary: {
        scanned_parts: metrics.scanned_parts,
        total_searches: metrics.total_searches,
        api_calls: metrics.api_calls,
        raw_results: metrics.raw_results,
        client_passed: metrics.client_passed,
        client_rejected: metrics.client_rejected,
        client_rejection_reasons: metrics.client_rejection_reasons,
        offers_found: metrics.offers_found,
        offers_validated: metrics.offers_validated,
        offers_reviewed: metrics.offers_reviewed,
        offers_rejected: metrics.offers_rejected,
        rejections_by_reason: metrics.rejections_by_reason,
        first_blocking_steps: metrics.first_blocking_steps,
        enrichment_attempts: metrics.enrichment_attempts,
        evidence_enriched: metrics.evidence_enriched,
        evidence_reused: metrics.evidence_reused,
        needs_evidence: metrics.needs_evidence,
        errors_count: metrics.errors.length,
        backoff_delays: metrics.backoff_delays,
        duration_ms: Date.now() - startTime
      },
      active_offers: activeOffers,
      review_offers: reviewOffers,
      rejected_offers: rejectedOffers,
      metrics,
      checkpoints: this.checkpoints
    };
  }

  /**
   * Deduplicate and consolidate offers by part × marketplace.
   * @param {Array} offers raw validated offers
   * @returns {Map} part → { marketplace → [offers sorted by price] }
   */
  consolidateOffers(offers) {
    const consolidated = new Map();
    for (const offer of offers) {
      const key = offer.part_number;
      if (!consolidated.has(key)) consolidated.set(key, new Map());
      const markets = consolidated.get(key);
      const market = offer.marketplace;
      if (!markets.has(market)) markets.set(market, []);
      markets.get(market).push(offer);
    }
    // Sort by price per marketplace
    for (const [part, markets] of consolidated) {
      for (const [market, list] of markets) {
        list.sort((a, b) => (a.price || 9999) - (b.price || 9999));
      }
    }
    return consolidated;
  }

  /**
   * Persist batch state (results + checkpoint) so restarts can resume.
   * @param {string} filePath target JSON file
   * @param {Object} state { summary, active_offers, rejected_offers, checkpoints, next_part_index }
   */
  saveState(filePath, state) {
    const payload = {
      saved_at: new Date().toISOString(),
      campaign_id: process.env.EBAY_EPN_CAMPAIGN_ID || null,
      next_part_index: state.next_part_index ?? 0,
      summary: state.summary ?? {},
      checkpoints: state.checkpoints ?? this.checkpoints,
      active_offers: state.active_offers ?? [],
      review_offers: state.review_offers ?? [],
      rejected_offers: state.rejected_offers ?? []
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  /**
   * Load persisted state; drops expired offers so stale listings never resurface.
   * @param {string} filePath
   * @param {Object} [options] { maxAgeMs } default 24h
   * @returns {Object|null} state with fresh offers or null when unreadable
   */
  static loadState(filePath, options = {}) {
    const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const savedAt = Date.parse(parsed.saved_at || '');
      const ageOk = Number.isFinite(savedAt) ? Date.now() - savedAt <= maxAgeMs : false;
      const active = Array.isArray(parsed.active_offers) ? parsed.active_offers : [];
      const fresh = ageOk ? active : [];
      return {
        saved_at: parsed.saved_at || null,
        next_part_index: Number(parsed.next_part_index) || 0,
        summary: parsed.summary || {},
        checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
        active_offers: fresh,
        expired_offers_dropped: active.length - fresh.length,
        review_offers: Array.isArray(parsed.review_offers) ? parsed.review_offers : [],
        rejected_offers: Array.isArray(parsed.rejected_offers) ? parsed.rejected_offers : [],
        state_fresh: ageOk
      };
    } catch {
      return null;
    }
  }
}
