/**
 * src/affiliate/AffiliateStoragePaths.js
 *
 * Phase 80.1 — Persistent affiliate storage paths.
 *
 * On Render the affiliate offer store, the evidence registry and Phase 80 batch
 * reports must live on the persistent disk (`/var/data`), otherwise every deploy
 * loses the ACTIVE offers that were just proven.
 *
 * Resolution order (first match wins):
 *   1. AFFILIATE_DATA_DIR          explicit override (tests, local runs)
 *   2. EBAY_OFFER_STORE_PATH / EBAY_EVIDENCE_REGISTRY_PATH / PHASE80_OUTPUT_DIR
 *   3. RENDER_DISK_PATH            Render persistent disk mount
 *   4. /var/data                   when it exists
 *   5. <project>/data              local fallback (non-persistent)
 *
 * Local layout stays unchanged: data/affiliate/ebay_offers.json and
 * output/phase80/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {{ root: string, persistent: boolean, source: string }}
 */
export function resolveStorageRoot(env = process.env, exists = fs.existsSync) {
  const explicit = typeof env.AFFILIATE_DATA_DIR === 'string' ? env.AFFILIATE_DATA_DIR.trim() : '';
  if (explicit) return { root: path.resolve(explicit), persistent: true, source: 'AFFILIATE_DATA_DIR' };

  const renderDisk = typeof env.RENDER_DISK_PATH === 'string' ? env.RENDER_DISK_PATH.trim() : '';
  if (renderDisk) return { root: path.resolve(renderDisk), persistent: true, source: 'RENDER_DISK_PATH' };

  if (exists('/var/data')) return { root: '/var/data', persistent: true, source: '/var/data' };

  return { root: path.join(projectRoot, 'data'), persistent: false, source: 'PROJECT_DATA' };
}

/**
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {string}
 */
export function getAffiliateDataDir(env = process.env, exists = fs.existsSync) {
  return path.join(resolveStorageRoot(env, exists).root, 'affiliate');
}

/**
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {string}
 */
export function getEbayOfferStorePath(env = process.env, exists = fs.existsSync) {
  const override = typeof env.EBAY_OFFER_STORE_PATH === 'string' ? env.EBAY_OFFER_STORE_PATH.trim() : '';
  if (override) return path.resolve(override);
  return path.join(getAffiliateDataDir(env, exists), 'ebay_offers.json');
}

/**
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {string}
 */
export function getEbayEvidenceRegistryPath(env = process.env, exists = fs.existsSync) {
  const override = typeof env.EBAY_EVIDENCE_REGISTRY_PATH === 'string' ? env.EBAY_EVIDENCE_REGISTRY_PATH.trim() : '';
  if (override) return path.resolve(override);
  return path.join(getAffiliateDataDir(env, exists), 'ebay_evidence_registry.json');
}

/**
 * Batch reports: <persistent root>/phase80 on Render, output/phase80 locally.
 *
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {string}
 */
export function getPhase80OutputDir(env = process.env, exists = fs.existsSync) {
  const override = typeof env.PHASE80_OUTPUT_DIR === 'string' ? env.PHASE80_OUTPUT_DIR.trim() : '';
  if (override) return path.resolve(override);
  const resolved = resolveStorageRoot(env, exists);
  return resolved.persistent ? path.join(resolved.root, 'phase80') : path.join(projectRoot, 'output', 'phase80');
}

/**
 * True when findings survive a deploy (persistent disk configured).
 *
 * @param {Object} [env]
 * @param {(p: string) => boolean} [exists]
 * @returns {boolean}
 */
export function isPersistentStorageConfigured(env = process.env, exists = fs.existsSync) {
  return resolveStorageRoot(env, exists).persistent;
}
