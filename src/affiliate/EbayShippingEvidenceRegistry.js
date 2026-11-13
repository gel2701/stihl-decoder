/**
 * src/affiliate/EbayShippingEvidenceRegistry.js
 *
 * Phase 80.3 — Persistent NL delivery evidence per marketplace + item id.
 *
 * The Phase 80.2 recovery showed 165 candidates blocked only by
 * SHIPPING_NOT_CONFIRMED: the stored getItem detail did not carry shipping
 * options. A Browse search that carries `filter=deliveryCountry:NL` and returns
 * the exact listing IS positive delivery evidence (official eBay Buy API field
 * filter), so it is recorded here and reused.
 *
 * Rules:
 *  - Identity is `marketplace + item_id`; evidence never crosses a marketplace.
 *  - Only a confirmed, successful (HTTP 200) filtered response is stored.
 *  - Evidence expires (default 30 days) so a stale delivery claim is re-checked.
 *  - This registry stores EVIDENCE only, never a decision.
 */

import fs from 'fs';
import path from 'path';

export const SHIPPING_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {string} itemId
 * @param {string} marketplace
 * @returns {string}
 */
export function shippingEvidenceKey(itemId, marketplace) {
  return `${String(marketplace || '').toUpperCase()}:${String(itemId || '')}`;
}

export class EbayShippingEvidenceRegistry {
  /**
   * @param {Object} [options]
   * @param {string} [options.path] JSON file path; null keeps it in memory only
   * @param {number} [options.maxAgeMs]
   */
  constructor(options = {}) {
    this.path = options.path || null;
    this.maxAgeMs = options.maxAgeMs ?? SHIPPING_EVIDENCE_MAX_AGE_MS;
    this.items = new Map();
    this.stats = { hits: 0, misses: 0, recorded: 0 };
    if (this.path) this.load();
  }

  /**
   * @param {string} itemId
   * @param {string} marketplace
   * @param {Object} [options]
   * @param {number} [options.now]
   * @param {number} [options.maxAgeMs]
   * @returns {Object|null} fresh evidence record
   */
  get(itemId, marketplace, options = {}) {
    if (!itemId || !marketplace) return null;
    const record = this.items.get(shippingEvidenceKey(itemId, marketplace));
    if (!record || record.confirmed !== true) {
      this.stats.misses++;
      return null;
    }
    const now = options.now ?? Date.now();
    const maxAgeMs = options.maxAgeMs ?? this.maxAgeMs;
    const confirmedAt = Date.parse(record.confirmed_at || '');
    if (!Number.isFinite(confirmedAt) || (now - confirmedAt) > maxAgeMs) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return { ...record, reused: true, age_ms: now - confirmedAt };
  }

  /**
   * @param {string} itemId
   * @param {string} marketplace
   * @param {Object} record confirmed delivery evidence
   * @returns {Object|null}
   */
  record(itemId, marketplace, record) {
    if (!itemId || !marketplace || !record || record.confirmed !== true) return null;
    const stored = {
      ...record,
      item_id: itemId,
      marketplace: String(marketplace).toUpperCase(),
      delivery_country: 'NL',
      confirmed: true,
      confirmed_at: record.confirmed_at || new Date().toISOString()
    };
    this.items.set(shippingEvidenceKey(itemId, marketplace), stored);
    this.stats.recorded++;
    return stored;
  }

  /**
   * @param {string} [filePath]
   */
  load(filePath = this.path) {
    if (!filePath) return;
    try {
      if (!fs.existsSync(filePath)) return;
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const items = doc && typeof doc.items === 'object' && doc.items ? doc.items : {};
      for (const record of Object.values(items)) {
        if (record && typeof record === 'object' && record.item_id && record.marketplace) {
          this.items.set(shippingEvidenceKey(record.item_id, record.marketplace), record);
        }
      }
    } catch {
      this.items.clear();
    }
  }

  /**
   * @param {string} [filePath]
   */
  save(filePath = this.path) {
    if (!filePath) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const doc = {
        schema_version: '1.0.0',
        updated_at: new Date().toISOString(),
        identity_key: 'marketplace + item_id',
        delivery_country: 'NL',
        max_age_ms: this.maxAgeMs,
        item_count: this.items.size,
        stats: this.stats,
        items: Object.fromEntries(this.items)
      };
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, filePath);
    } catch {
      // Persistence is best-effort; in-memory evidence still applies.
    }
  }

  /**
   * @returns {{ size: number, hits: number, misses: number, recorded: number }}
   */
  summary() {
    return { size: this.items.size, ...this.stats };
  }
}
