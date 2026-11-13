/**
 * src/affiliate/EbayEvidenceRegistry.js
 *
 * Phase 80 — Shared, persistable evidence registry for eBay items.
 *
 * A getItem response is expensive (rate-limited API call) and its product
 * identity / shipping facts do not change minute to minute. This registry
 * stores the normalized detail per item so the same listing is never verified
 * twice inside the freshness window, and so a batch can resume without
 * re-buying the same evidence.
 *
 * The registry stores EVIDENCE only. It never stores a decision: decisions are
 * recomputed from evidence by OfferEvidenceMatcher so a stale approval can
 * never survive a rule change.
 */

import fs from 'fs';
import path from 'path';

export const EBAY_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class EbayEvidenceRegistry {
  /**
   * @param {Object} [options]
   * @param {string} [options.path] JSON file path; null keeps it in memory only
   * @param {number} [options.maxAgeMs]
   */
  constructor(options = {}) {
    this.path = options.path || null;
    this.maxAgeMs = options.maxAgeMs ?? EBAY_EVIDENCE_MAX_AGE_MS;
    this.items = new Map();
    this.stats = { hits: 0, misses: 0, recorded: 0 };
    if (this.path) this.load();
  }

  /**
   * @param {string} itemId
   * @param {Object} [options]
   * @param {number} [options.now]
   * @param {number} [options.maxAgeMs]
   * @returns {Object|null} fresh evidence copy flagged with reused: true
   */
  get(itemId, options = {}) {
    if (typeof itemId !== 'string' || !itemId) return null;
    const record = this.items.get(itemId);
    if (!record) {
      this.stats.misses++;
      return null;
    }
    const now = options.now ?? Date.now();
    const maxAgeMs = options.maxAgeMs ?? this.maxAgeMs;
    const fetchedAt = Date.parse(record.fetched_at || '');
    if (!Number.isFinite(fetchedAt) || (now - fetchedAt) > maxAgeMs) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return { ...record, reused: true, age_ms: now - fetchedAt };
  }

  /**
   * @param {string} itemId
   * @param {Object} record normalized item detail evidence
   * @returns {Object|null} the stored record
   */
  record(itemId, record) {
    if (typeof itemId !== 'string' || !itemId || !record || typeof record !== 'object') return null;
    const stored = {
      ...record,
      item_id: itemId,
      fetched_at: record.fetched_at || new Date().toISOString(),
      reused: false
    };
    this.items.set(itemId, stored);
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
      for (const [itemId, record] of Object.entries(items)) {
        if (record && typeof record === 'object') this.items.set(itemId, record);
      }
    } catch {
      // A corrupt evidence cache must never break activation: start empty.
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
        max_age_ms: this.maxAgeMs,
        item_count: this.items.size,
        stats: this.stats,
        items: Object.fromEntries(this.items)
      };
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    } catch {
      // Persistence is best-effort; in-memory caching still applies.
    }
  }

  /**
   * @returns {{ size: number, hits: number, misses: number, recorded: number }}
   */
  summary() {
    return { size: this.items.size, ...this.stats };
  }
}
