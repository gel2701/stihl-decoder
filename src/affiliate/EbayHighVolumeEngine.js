/**
 * src/affiliate/EbayHighVolumeEngine.js
 *
 * Phase 76C — High-Volume eBay Affiliate Engine
 * Batches 100–5,000+ canonical STIHL parts against eBay.nl and eBay.de.
 * Checkpoint-resume, multi-vendor search, strict matching, API backoff.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';

export class EbayHighVolumeEngine {
  constructor(options = {}) {
    if (!options.apiClient) throw new Error('[EbayHighVolumeEngine] apiClient is required');
    this.apiClient = options.apiClient;
    this.batchDelayMs = options.batchDelayMs ?? 100;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? 5000;
    this.vendors = options.vendors ?? ['saegenspezi_de', 'ebay_shop_seller', 'general_parts_nl'];
    this.classifications = new Map(); // part → { type: 'spark_plug' | 'carburetor' | 'unknown', confidence: 0–1 }
    this.activeOffers = new Map(); // part → [{ vendor, marketplace, item_id, price, ... }]
    this.rejectedOffers = new Map(); // part → [{ reason, item_id, vendor, ... }]
    this.checkpoints = []; // { timestamp, partIndex, processedCount }
  }

  /**
   * Classify a part number into a category for stricter matching.
   * @param {string} part 11-digit number
   * @param {Array} knownParts canonical database
   * @returns {Object} { type: string, confidence: number }
   */
  classifyPart(part, knownParts = []) {
    const match = knownParts.find(p => PartNormalizer.normalizePartNumber(p.part_number) === part);
    if (!match) return { type: 'unknown', confidence: 0 };
    const desc = String(match.description || '').toLowerCase();
    if (/spark.*plug|zündkerze|spark|plug/.test(desc)) return { type: 'spark_plug', confidence: 0.95 };
    if (/carburetor|vergaser|carb/.test(desc)) return { type: 'carburetor', confidence: 0.95 };
    if (/chain|kette|saw|kettingzaag/.test(desc)) return { type: 'saw_chain', confidence: 0.9 };
    return { type: 'generic_part', confidence: 0.8 };
  }

  /**
   * Validates an offer against strict matching rules fail-closed.
   * @param {Object} item raw eBay Browse API item
   * @param {string} targetPart canonical part number
   * @param {Object} classification part type classification
   * @returns {Object|null} validated offer or null if rejected
   */
  validateOffer(item, targetPart, classification = {}) {
    if (!item || !item.itemId) return null;
    const title = String(item.title || '').toLowerCase();
    const mpn = String(item.mpn || '').toLowerCase();
    const targetFormatted = targetPart.slice(0, 4) + ' ' + targetPart.slice(4, 7) + ' ' + targetPart.slice(7);
    const targetCompact = targetPart.replace(/[\s-]/g, '');

    // Rule 1: Part number must be in MPN or title (explicit reference, not incidental mention)
    const inMpn = mpn && new RegExp(`(^|\\D)${targetFormatted}(\\D|$)`).test(mpn);
    const inTitle = new RegExp(`(^|\\D)${targetFormatted}(\\D|$)`).test(title);
    if (!inMpn && !inTitle) return null;

    // Rule 2: Type classification — reject if conflicting type in title
    const { type: expectedType } = classification;
    if (expectedType === 'spark_plug' && /vergaser|carburetor|carb|kit/.test(title)) return null;
    if (expectedType === 'carburetor' && /zündkerze|spark.*plug/.test(title)) return null;
    if (expectedType === 'saw_chain' && /vergaser|carburetor/.test(title)) return null;

    // Rule 3: Availability and shipping
    if (item.estimatedAvailabilities?.some(a => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK')) return null;
    const shippingToNl = Array.isArray(item.shippingOptions) && item.shippingOptions.some(opt =>
      (Array.isArray(opt.shipToLocations) && opt.shipToLocations.includes('NL')) ||
      opt.shippingDestination?.country === 'NL'
    );
    if (!shippingToNl) return null;

    // Rule 4: Affiliate URL must be present and valid
    if (!item.itemAffiliateWebUrl || typeof item.itemAffiliateWebUrl !== 'string') return null;
    try {
      new URL(item.itemAffiliateWebUrl);
    } catch {
      return null;
    }

    // Rule 5: Bundle/set detection — reject if quantity > 1 or "bundle/set/kit" in title
    if (/\bkit\b|\bset\b|\bbundle\b|\bpack\b/.test(title) && !inMpn) return null;
    if (item.quantity && item.quantity > 1) return null;

    // Passed all gates
    return {
      item_id: item.itemId,
      title: item.title || '',
      mpn: mpn,
      seller_name: item.seller?.username || '',
      price: item.price?.value ? Number(item.price.value) : null,
      currency: item.price?.currency || 'EUR',
      shipping_cost: item.shippingOptions?.[0]?.shippingCost?.value ? Number(item.shippingOptions[0].shippingCost.value) : null,
      ships_to_nl: true,
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
    const rejectedOffers = [];
    const metrics = {
      scanned_parts: 0,
      total_searches: 0,
      offers_found: 0,
      offers_validated: 0,
      offers_rejected: 0,
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
      for (const marketplace of ['EBAY_NL', 'EBAY_DE']) {
        for (const vendor of this.vendors) {
          metrics.total_searches++;
          let retries = 0;
          const maxRetries = 2;

          while (retries <= maxRetries) {
            try {
              const res = await this.apiClient.searchItems({
                partNumber: part,
                seller: vendor,
                limit: 10
              });

              if (!res.success) {
                if (res.errors?.some(e => e.includes('429'))) {
                  // Rate limit — exponential backoff
                  const backoffMs = Math.min(1000 * Math.pow(2, retries), 30000);
                  metrics.backoff_delays++;
                  await new Promise(resolve => setTimeout(resolve, backoffMs));
                  retries++;
                  continue;
                }
                metrics.errors.push(`${part}@${marketplace}/${vendor}: ${res.errors?.[0]}`);
                break;
              }

              metrics.api_calls++;

              // Validate each item
              for (const item of res.items || []) {
                const validated = this.validateOffer(item, part, classification);
                if (validated) {
                  metrics.offers_validated++;
                  activeOffers.push({
                    part_number: part,
                    marketplace,
                    vendor,
                    ...validated
                  });
                } else {
                  metrics.offers_rejected++;
                  rejectedOffers.push({
                    part_number: part,
                    marketplace,
                    vendor,
                    item_id: item.itemId,
                    reason: 'validation_failed'
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
          await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
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
        offers_found: metrics.offers_found,
        offers_validated: metrics.offers_validated,
        offers_rejected: metrics.offers_rejected,
        errors_count: metrics.errors.length,
        backoff_delays: metrics.backoff_delays,
        duration_ms: Date.now() - startTime
      },
      active_offers: activeOffers,
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
}
