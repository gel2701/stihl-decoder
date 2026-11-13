/**
 * src/affiliate/EbayHighVolumeEngine.js
 *
 * Phase 76C — High-Volume eBay Affiliate Engine
 * Batches 100–5,000+ canonical STIHL parts against eBay.nl and eBay.de.
 * Checkpoint-resume, multi-vendor search, strict matching, API backoff.
 */

import fs from 'fs';
import { PartNormalizer } from '../parts/PartNormalizer.js';

export class EbayHighVolumeEngine {
  constructor(options = {}) {
    if (!options.apiClient) throw new Error('[EbayHighVolumeEngine] apiClient is required');
    this.apiClient = options.apiClient;
    this.batchDelayMs = options.batchDelayMs ?? 100;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? 5000;
    this.vendors = options.vendors ?? ['saegenspezi_de', 'ebay_shop_seller', 'general_parts_nl'];
    this.marketplaces = options.marketplaces ?? ['EBAY_NL', 'EBAY_DE'];
    this.classifications = new Map(); // part → { type: 'spark_plug' | 'carburetor' | 'unknown', confidence: 0–1 }
    this.activeOffers = new Map(); // part → [{ vendor, marketplace, item_id, price, ... }]
    this.rejectedOffers = new Map(); // part → [{ reason, item_id, vendor, ... }]
    this.checkpoints = []; // { timestamp, partIndex, processedCount }
  }

  /**
   * Classify a part number into a category for stricter matching.
   * Phase 76G: concrete product-type words only. "saw" inside "chainsaw" must
   * never classify a part as saw_chain — category and explicit part-type words win.
   * @param {string} part 11-digit number
   * @param {Array} knownParts canonical database ({part_number, description, category})
   * @returns {Object} { type: string, confidence: number }
   */
  classifyPart(part, knownParts = []) {
    const match = knownParts.find(p => PartNormalizer.normalizePartNumber(p.part_number) === part);
    if (!match) return { type: 'unknown', confidence: 0 };
    const desc = String(match.description || '').toLowerCase();
    const category = String(match.category || '').toLowerCase();
    const hay = `${category} ${desc}`;
    // Ordered, most specific first. Word-bounded patterns — no bare 'saw', no bare 'chain', no bare 'carb', no bare 'plug'.
    if (/\bbougie\b|\bspark\s*plug\b|\bzündkerze\b|\bzuendkerze\b|\bglühkerze\b|\bgluehkerze\b/.test(hay)) return { type: 'spark_plug', confidence: 0.95 };
    if (/\bcarburateur(\w*)\b|\bcarburetor\b|\bvergaser\b|\bvergaserkit\b/.test(hay)) return { type: 'carburetor', confidence: 0.95 };
    if (/\bluchtfilter\b|\bair\s*filter\b|\bluftfilter\b/.test(hay)) return { type: 'air_filter', confidence: 0.9 };
    if (/\bsaw\s*chain\b|\bsägekette\b|\bsaegekette\b|\bzaagketting\b|\bchainsaw\s*chain\b/.test(hay)) return { type: 'saw_chain', confidence: 0.9 };
    if (/\bstarter\b|\bstartkoord\b|\bstartkoord\b|\brewind\s*starter\b|\brecoil\s*starter\b/.test(hay)) return { type: 'starter', confidence: 0.9 };
    if (/\boliepomp\b|\boil\s*pump\b|\bölpumpe\b|\bolpumpe\b/.test(hay)) return { type: 'oil_pump', confidence: 0.9 };
    if (/\bbrandstoffilter\b|\bfuel\s*filter\b|\bkraftstoffilter\b|\bpickup\s*body\b/.test(hay)) return { type: 'fuel_filter', confidence: 0.9 };
    if (/\bkoppeling\b|\bclutch\b/.test(hay)) return { type: 'clutch', confidence: 0.9 };
    return { type: 'generic_part', confidence: 0.8 };
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
   * Phase 76G — central diagnostic validation.
   * Fail-closed: every check that fails is recorded as a reason code; the first
   * blocking step is reported. Only a clean candidate can become ACCEPT.
   *
   * Reason codes: MISSING_REQUIRED_DATA, PART_NUMBER_MISMATCH, CONFLICTING_MPN,
   * CONFLICTING_TITLE_PART_NUMBER, PRODUCT_TYPE_CONFLICT, BUNDLE_OR_KIT,
   * OUT_OF_STOCK, AFFILIATE_URL_INVALID, CAMPAIGN_ID_MISMATCH, SHIPPING_NOT_CONFIRMED.
   *
   * @returns {{decision: 'ACCEPT'|'REVIEW'|'REJECT', reason_codes: string[], first_blocking_step: string|null, offer: Object|null}}
   */
  evaluateOffer(item, targetPart, classification = {}) {
    const reason_codes = [];
    const add = code => { if (!reason_codes.includes(code)) reason_codes.push(code); };

    if (!item || !(item.itemId || item.item_id)) {
      return { decision: 'REJECT', reason_codes: ['MISSING_REQUIRED_DATA'], first_blocking_step: 'MISSING_REQUIRED_DATA', offer: null };
    }

    // Normalize: raw Browse API shape or client-parsed shape (EbayBrowseApiClient.parseItemSummaries)
    const rawShipping = Array.isArray(item.shippingOptions) ? item.shippingOptions : null;
    const shippingOptions = rawShipping
      ? rawShipping
      : (item.ships_to_nl === true ? [{ shipToLocations: ['NL'], shippingCost: { value: item.shipping_cost_nl } }] : []);
    const norm = {
      itemId: item.itemId ?? item.item_id,
      title: item.title || '',
      mpn: item.mpn ?? '',
      seller: item.seller ?? { username: item.seller_name },
      price: item.price?.value != null ? item.price : { value: item.item_price, currency: item.currency },
      shippingOptions,
      estimatedAvailabilities: item.estimatedAvailabilities,
      itemAffiliateWebUrl: item.itemAffiliateWebUrl ?? item.affiliate_url,
      condition: item.condition,
      quantity: item.quantity
    };
    const title = String(norm.title || '').toLowerCase();
    const mpn = String(norm.mpn || '').toLowerCase();
    const targetCompact = String(targetPart).replace(/[\s-]/g, '');
    const targetFormatted = targetPart.slice(0, 4) + ' ' + targetPart.slice(4, 7) + ' ' + targetPart.slice(7);

    if (!title) add('MISSING_REQUIRED_DATA');

    // Rule 1: target part number must be an explicit reference in MPN or title
    const separatorRegex = targetFormatted.replace(/\s/g, '[\\s-]*');
    const inMpn = Boolean(mpn) && new RegExp(`(^|\\D)${separatorRegex}(\\D|$)`).test(mpn);
    const inTitle = new RegExp(`(^|\\D)${separatorRegex}(\\D|$)`).test(title);
    if (!inMpn && !inTitle) add('PART_NUMBER_MISMATCH');

    // Rule 1b: conflicting part numbers. Exact MPN is not enough when the title
    // or MPN references a different canonical 11-digit STIHL part number.
    const extractPartNumbers = text => {
      const found = new Set();
      const formatted = /(?<!\d)(\d{4})[\s-]*(\d{3})[\s-]*(\d{4})(?!\d)/g;
      let m;
      while ((m = formatted.exec(text))) found.add(`${m[1]}${m[2]}${m[3]}`);
      const compact = /(?<!\d)(\d{11})(?!\d)/g;
      while ((m = compact.exec(text))) found.add(m[1]);
      return [...found];
    };
    const mpnNumbers = extractPartNumbers(mpn);
    const titleNumbers = extractPartNumbers(title);
    if (mpnNumbers.some(n => n !== targetCompact)) add('CONFLICTING_MPN');
    if (titleNumbers.some(n => n !== targetCompact)) add('CONFLICTING_TITLE_PART_NUMBER');

    // Rule 2: product type — reject conflicting types in the title
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

    // Rule 3: bundle/kit, multi-quantity and availability
    if (/\bkit\b|\bset\b|\bbundle\b|\bpack\b|\btune-up\b/.test(title)) add('BUNDLE_OR_KIT');
    if (norm.quantity && norm.quantity > 1) add('BUNDLE_OR_KIT');
    if (norm.estimatedAvailabilities?.some(a => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK')) add('OUT_OF_STOCK');

    // Rule 4: affiliate URL must be present, on eBay, HTTPS and carry exactly the EPN campaign ID
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
      const campaignId = process.env.EBAY_EPN_CAMPAIGN_ID || '';
      const campids = parsedAff.searchParams.getAll('campid');
      if (!campaignId || campids.length !== 1 || campids[0] !== campaignId) add('CAMPAIGN_ID_MISMATCH');
    }

    // Rule 5: NL shipping must be confirmed. Unknown shipping -> REVIEW (never ACCEPT);
    // explicit non-NL destinations are a hard reject. No assumptions about shipping.
    const destinations = norm.shippingOptions.flatMap(opt => {
      const locations = opt.shipToLocations;
      if (Array.isArray(locations)) return locations.map(loc => (typeof loc === 'string' ? loc : loc?.country));
      if (locations?.country) return [locations.country];
      return opt.shippingDestination?.country ? [opt.shippingDestination.country] : [];
    }).filter(Boolean);
    const shippingToNl = destinations.includes('NL');
    const explicitNonNl = destinations.length > 0 && !shippingToNl;
    if (!shippingToNl) add('SHIPPING_NOT_CONFIRMED');

    const REJECT_CODES = new Set([
      'MISSING_REQUIRED_DATA', 'PART_NUMBER_MISMATCH', 'CONFLICTING_MPN',
      'CONFLICTING_TITLE_PART_NUMBER', 'PRODUCT_TYPE_CONFLICT', 'BUNDLE_OR_KIT',
      'OUT_OF_STOCK', 'AFFILIATE_URL_INVALID', 'CAMPAIGN_ID_MISMATCH'
    ]);
    const blocking = reason_codes.find(code => REJECT_CODES.has(code)) || null;
    if (blocking) {
      return { decision: 'REJECT', reason_codes, first_blocking_step: blocking, offer: null };
    }
    if (!shippingToNl) {
      if (explicitNonNl) {
        return { decision: 'REJECT', reason_codes, first_blocking_step: 'SHIPPING_NOT_CONFIRMED', offer: null };
      }
      // Shipping data missing/unconfirmed — needs verification, never auto-accepted.
      return { decision: 'REVIEW', reason_codes, first_blocking_step: 'SHIPPING_NOT_CONFIRMED', offer: this.buildOffer(norm, inMpn, false) };
    }
    const decision = inMpn ? 'ACCEPT' : 'REVIEW';
    return {
      decision,
      reason_codes,
      first_blocking_step: null,
      offer: this.buildOffer(norm, inMpn, true)
    };
  }

  /**
   * Builds the normalized offer payload for ACCEPT/REVIEW decisions.
   * @private
   */
  buildOffer(item, inMpn, shipsToNl) {
    return {
      decision: inMpn ? 'ACCEPT' : 'REVIEW',
      match_basis: inMpn ? 'MPN_EXACT' : 'TITLE_ONLY',
      item_id: item.itemId,
      title: item.title || '',
      mpn: item.mpn,
      seller_name: item.seller?.username || '',
      price: item.price?.value ? Number(item.price.value) : null,
      currency: item.price?.currency || 'EUR',
      shipping_cost: item.shippingOptions?.[0]?.shippingCost?.value ? Number(item.shippingOptions[0].shippingCost.value) : null,
      ships_to_nl: Boolean(shipsToNl),
      condition: item.condition || 'NEW',
      affiliate_url: item.itemAffiliateWebUrl,
      validation_confidence: inMpn ? 0.98 : 0.85
    };
  }

  /**
   * Batch-process canonical parts across multiple marketplaces and vendors.
   * @param {Array<string>} canonicalParts 11-digit STIHL part numbers
   * @param {Object} options { maxItems, knownParts, checkpoint, resumeFrom }
   * @returns {Promise<Object>} summary with active_offers, rejected, metrics
   */
  async processBatch(canonicalParts = [], options = {}) {
    const maxItems = Math.min(options.maxItems || 5000, canonicalParts.length);
    const knownParts = options.knownParts || [];
    const checkpoint = options.checkpoint || { partIndex: 0, processedParts: 0 };
    const resumeFrom = options.resumeFrom ?? checkpoint.partIndex;

    const activeOffers = [];
    const reviewOffers = [];
    const seen = new Set();
    const rejectedOffers = [];
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
      backoff_delays: 0
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
                limit: 10
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
              for (const item of res.items || []) {
                const verdict = this.evaluateOffer(item, part, classification);
                if (verdict.decision === 'ACCEPT') {
                  metrics.offers_validated++;
                  const offer = { part_number: part, marketplace, vendor, ...verdict.offer };
                  const key = `${offer.marketplace}:${offer.item_id}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    activeOffers.push(offer);
                  }
                } else if (verdict.decision === 'REVIEW') {
                  // Unconfirmed data — needs manual review, never auto-accepted
                  metrics.offers_reviewed++;
                  const offer = { part_number: part, marketplace, vendor, ...verdict.offer, reason_codes: verdict.reason_codes };
                  const key = `${offer.marketplace}:${offer.item_id}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    reviewOffers.push(offer);
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
                    reason_codes: verdict.reason_codes
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
