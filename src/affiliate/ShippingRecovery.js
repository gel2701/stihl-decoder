/**
 * src/affiliate/ShippingRecovery.js
 *
 * Phase 80.3 — Targeted NL delivery recovery for known listings.
 *
 * Problem it solves: 165 candidates were blocked by SHIPPING_NOT_CONFIRMED even
 * though the listing itself is deliverable to the Netherlands. The stored getItem
 * detail has no shipping options, so the only honest way to prove delivery is an
 * official Browse search that carries `filter=deliveryCountry:NL` and returns the
 * exact same listing. That is exactly what this module does, for the known
 * part/marketplace pairs only — no new discovery, no assumption about items that
 * do not come back.
 *
 * Evidence is stored per `marketplace + item_id`, so a confirmation from EBAY_DE
 * can never be attached to an EBAY_NL offer (or the other way around).
 */

import { BROWSE_DELIVERY_FILTER, DELIVERY_COUNTRY } from './EbayShippingEvidence.js';

/**
 * @param {Object} record
 * @returns {boolean}
 */
function isConfirmed(record) {
  return Boolean(record && typeof record === 'object' && record.confirmed === true);
}

export class ShippingRecovery {
  /**
   * @param {Object} options
   * @param {Object} options.apiClient EbayBrowseApiClient (searchItems)
   * @param {import('./EbayShippingEvidenceRegistry.js').EbayShippingEvidenceRegistry} [options.registry]
   * @param {string} [options.seller='ALL']
   * @param {number} [options.limit=10]
   */
  constructor(options = {}) {
    if (!options.apiClient) throw new Error('[ShippingRecovery] apiClient is required');
    this.apiClient = options.apiClient;
    this.registry = options.registry || null;
    this.seller = options.seller ?? 'ALL';
    this.limit = options.limit ?? 10;
    this.sleepFn = options.sleepFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.batchDelayMs = options.batchDelayMs ?? 0;
  }

  /**
   * Verifies NL delivery for the given pending listings.
   *
   * @param {Array<{part_number:string, marketplace:string, item_id:string}>} pending
   * @param {Object} [options]
   * @param {number} [options.maxParts] only search this many distinct parts
   * @param {string[]} [options.markets] restrict to these marketplaces
   * @returns {Promise<Object>} per-pair outcome and written evidence records
   */
  async verifyListings(pending = [], options = {}) {
    const maxParts = options.maxParts ?? 10;
    const allowedMarkets = Array.isArray(options.markets) && options.markets.length > 0
      ? new Set(options.markets.map(m => String(m).toUpperCase()))
      : null;

    const groups = new Map();
    for (const entry of (Array.isArray(pending) ? pending : [])) {
      const part = String(entry?.part_number || '').replace(/[\s-]/g, '');
      const itemId = entry?.item_id;
      const marketplace = String(entry?.marketplace || '').toUpperCase();
      if (!/^\d{11}$/.test(part) || !itemId || !marketplace) continue;
      if (allowedMarkets && !allowedMarkets.has(marketplace)) continue;
      const key = `${part}:${marketplace}`;
      if (!groups.has(key)) groups.set(key, { part, marketplace, pairs: new Map() });
      groups.get(key).pairs.set(itemId, { item_id: itemId, title: entry.title || '' });
    }

    // Bound the number of distinct parts that are searched (default: the 10
    // original parts), never the number of known listings per part.
    const distinctParts = [...new Set([...groups.values()].map(group => group.part))].slice(0, maxParts);
    const partSet = new Set(distinctParts);

    const records = [];
    const notReturned = [];
    const restricted = [];
    const unconfirmed = [];
    const errors = [];
    const perPair = [];
    let searchedGroups = 0;

    for (const group of groups.values()) {
      if (!partSet.has(group.part)) continue;
      searchedGroups++;
      if (this.batchDelayMs > 0) await this.sleepFn(this.batchDelayMs);
      const res = await this.apiClient.searchItems({
        partNumber: group.part,
        seller: this.seller,
        marketplace: group.marketplace,
        limit: this.limit
      });
      if (!res || res.success !== true) {
        const error = res?.errors?.[0] || 'SEARCH_FAILED';
        errors.push(`${group.part}@${group.marketplace}: ${error}`);
        for (const pair of group.pairs.values()) perPair.push({ ...pair, part_number: group.part, marketplace: group.marketplace, outcome: 'API_ERROR' });
        continue;
      }
      const responseEvidence = res.delivery_evidence;
      const responseConfirmed = isConfirmed(responseEvidence)
        && (responseEvidence.applied !== false)
        && (responseEvidence.api_status === undefined || responseEvidence.api_status === null || responseEvidence.api_status === 200);
      const itemsById = new Map((Array.isArray(res.items) ? res.items : []).map(item => [item.item_id, item]));

      for (const pair of group.pairs.values()) {
        const item = itemsById.get(pair.item_id);
        if (!item) {
          notReturned.push({ ...pair, part_number: group.part, marketplace: group.marketplace });
          perPair.push({ ...pair, part_number: group.part, marketplace: group.marketplace, outcome: 'NOT_RETURNED' });
          continue;
        }
        const destinations = Array.isArray(item.shipping_destinations) ? item.shipping_destinations.map(d => String(d).toUpperCase()) : [];
        if (destinations.length > 0 && !destinations.includes(DELIVERY_COUNTRY)) {
          restricted.push({ ...pair, part_number: group.part, marketplace: group.marketplace, destinations });
          perPair.push({ ...pair, part_number: group.part, marketplace: group.marketplace, outcome: 'EXPLICIT_NON_NL', destinations });
          continue;
        }
        const itemEvidence = item.shipping_evidence?.browse_delivery || item.evidence?.shipping?.browse_delivery || null;
        const evidence = isConfirmed(itemEvidence) ? itemEvidence : (responseConfirmed ? responseEvidence : null);
        if (!evidence) {
          unconfirmed.push({ ...pair, part_number: group.part, marketplace: group.marketplace });
          perPair.push({ ...pair, part_number: group.part, marketplace: group.marketplace, outcome: 'NO_CONFIRMED_FILTER_EVIDENCE' });
          continue;
        }
        const record = {
          source: 'BROWSE_SEARCH_DELIVERY_FILTER',
          item_id: pair.item_id,
          marketplace: group.marketplace,
          delivery_country: DELIVERY_COUNTRY,
          filter: evidence.filter || BROWSE_DELIVERY_FILTER,
          api_status: evidence.api_status ?? 200,
          applied: true,
          confirmed: true,
          confirmed_at: evidence.confirmed_at || new Date().toISOString(),
          seller: this.seller,
          query_part: group.part,
          queries: Array.isArray(evidence.queries) ? evidence.queries.slice(0, 10) : [],
          title: item.title || pair.title || '',
          shipping_destinations: destinations,
          shipping_cost_nl: item.shipping_cost_nl ?? null,
          item_price: item.item_price ?? null,
          currency: item.currency ?? null
        };
        if (this.registry) this.registry.record(pair.item_id, group.marketplace, record);
        records.push(record);
        perPair.push({ ...pair, part_number: group.part, marketplace: group.marketplace, outcome: 'CONFIRMED_NL' });
      }
    }

    return {
      searched_groups: searchedGroups,
      searched_parts: distinctParts.length,
      searched_pairs: perPair.length,
      confirmed_pairs: records.length,
      not_returned_pairs: notReturned.length,
      restricted_pairs: restricted.length,
      unconfirmed_pairs: unconfirmed.length,
      error_pairs: errors.length,
      errors,
      records,
      not_returned: notReturned,
      restricted,
      per_pair: perPair
    };
  }
}

/**
 * Attaches renewed NL delivery evidence to the exact marketplace + item id only.
 *
 * @param {Array<Object>} candidates part candidates with `existing` offers
 * @param {Array<Object>} records evidence records from verifyListings
 * @returns {{ applied: number, matched_records: number }}
 */
export function applyShippingEvidence(candidates = [], records = []) {
  const byKey = new Map();
  for (const record of (Array.isArray(records) ? records : [])) {
    if (!record?.item_id || !record?.marketplace || record.confirmed !== true) continue;
    byKey.set(`${String(record.marketplace).toUpperCase()}:${record.item_id}`, record);
  }
  let applied = 0;
  for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
    for (const offer of (Array.isArray(candidate?.existing) ? candidate.existing : [])) {
      const marketplace = String(offer.marketplace || offer.marketplaceId || '').toUpperCase();
      const record = byKey.get(`${marketplace}:${offer.item_id || offer.itemId}`);
      if (!record) continue;
      offer.shipping_evidence = { ...(offer.shipping_evidence || {}), browse_delivery: record };
      applied++;
    }
  }
  return { applied, matched_records: byKey.size };
}
