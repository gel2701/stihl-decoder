/**
 * scripts/phase90_audit.mjs
 *
 * Audits all Phase 90 ACTIVE offers for:
 *  - Baseline preservation (1,578 ACTIVE, 34 SUSPENDED)
 *  - Multi-SKU ASIN collisions & duplicate kill_switch_ids
 *  - TwoGateVerifier & checkHistoricalMismatch
 *  - Brand quality (BAD_BRAND_RE / missing from tests/phase75_amazon_growth.test.js)
 *  - Accidental multipacks on single-item catalog parts
 *  - Basic semantic mismatches between catalog part_name and product_title
 *
 * Optional `--prune` removes flagged Phase 90: offers (only if `--apply` / `--prune` passed)
 * and resyncs registry.metrics cleanly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { BAD_BRAND_RE, STRONG_MULTIPACK_RE } from './phase88_screener.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'affiliate', 'verified_amazon_registry.json');

const applyPrune = process.argv.includes('--prune');

const registryDoc = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts_catalog.json'), 'utf8')).parts;
const catalogByPart = new Map();
for (const p of catalog) {
  catalogByPart.set(PartNormalizer.normalizePartNumber(p.part_number), p);
}

// Extract existing approvedManufacturers from tests/phase75_amazon_growth.test.js
const phase75Src = fs.readFileSync(path.join(ROOT, 'tests', 'phase75_amazon_growth.test.js'), 'utf8');
const setMatch = phase75Src.match(/approvedManufacturers\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
const approvedSet = new Set();
if (setMatch) {
  for (const m of setMatch[1].matchAll(/'([^']+)'/g)) {
    approvedSet.add(m[1].toLowerCase());
  }
}

const activeAll = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase90Active = activeAll.filter(o => /^Phase 90:/.test(o.status_reason || ''));
const baselineActive = activeAll.filter(o => !/^Phase 90:/.test(o.status_reason || ''));

const asinMkt = new Map();
const multiSkuCollisions = [];
const dupKeys = [];
const dupKs = [];
const keySeen = new Set();
const ksSeen = new Set();

for (const o of activeAll) {
  const k = `${o.part_number}:${o.marketplace || 'amazon.nl'}:${o.asin}`;
  if (keySeen.has(k)) dupKeys.push(k);
  keySeen.add(k);

  if (ksSeen.has(o.kill_switch_id)) dupKs.push(o.kill_switch_id);
  ksSeen.add(o.kill_switch_id);

  const am = `${o.marketplace || 'amazon.nl'}|${o.asin}`;
  const prev = asinMkt.get(am);
  if (prev && prev !== o.part_number) multiSkuCollisions.push({ am, prev, curr: o.part_number });
  asinMkt.set(am, o.part_number);
}

const flagged = [];
const phase90Brands = new Map();

const MULTIPACK_CATALOG_RE = /\b(set|kit|pack|pair|paar|2er|3er|4er|5er|10er|\d+\s*pcs|\d+\s*stuks)\b/i;

for (const o of phase90Active) {
  const mkt = o.marketplace || 'amazon.nl';
  const expectedTag = mkt === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
  const norm = PartNormalizer.normalizePartNumber(o.part_number);
  const cat = catalogByPart.get(norm);
  const issues = [];

  if (!cat) {
    issues.push('MISSING_CATALOG_PART');
  } else {
    const v = TwoGateVerifier.verifyOffer(o, { catalogPartMap: new Set(catalogByPart.keys()), expectedTag });
    if (!v.passed) issues.push(`TWO_GATE:${v.errors.join('|')}`);
    const mm = checkHistoricalMismatch(o.part_number, o.asin, o.product_title);
    if (mm.isMismatch) issues.push(`HISTORICAL_MISMATCH:${mm.reason}`);

    const catName = cat.part_name || '';
    const title = o.product_title || '';
    const brand = (o.brand || '').trim();
    if (!brand || BAD_BRAND_RE.test(brand) || /\b(replaces|universal|generic|unknown|compatible)\b/i.test(brand)) {
      issues.push(`SUSPICIOUS_BRAND:${brand}`);
    }
    if (STRONG_MULTIPACK_RE.test(title) && !MULTIPACK_CATALOG_RE.test(catName)) {
      issues.push(`MULTIPACK_ON_SINGLE_PART:${title.slice(0, 60)}`);
    }
  }

  const bl = (o.brand || '').trim().toLowerCase();
  if (bl) phase90Brands.set(bl, (phase90Brands.get(bl) || 0) + 1);

  if (issues.length > 0) {
    flagged.push({
      part_number: o.part_number,
      marketplace: mkt,
      asin: o.asin,
      brand: o.brand,
      title: o.product_title,
      issues
    });
  }
}

const missingBrands = [...phase90Brands.keys()]
  .filter(b => !approvedSet.has(b))
  .sort();

console.log(JSON.stringify({
  baseline_active_preserved: baselineActive.length,
  phase90_active: phase90Active.length,
  total_active: activeAll.length,
  total_nl: activeAll.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length,
  total_de: activeAll.filter(o => o.marketplace === 'amazon.de').length,
  unique_parts: new Set(activeAll.map(o => o.part_number)).size,
  suspended: registryDoc.offers.filter(o => o.status === 'SUSPENDED').length,
  research_required: registryDoc.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
  verified_inactive: registryDoc.offers.filter(o => o.status === 'VERIFIED').length,
  dup_keys: dupKeys.length,
  dup_kill_switches: dupKs.length,
  multi_sku_collisions: multiSkuCollisions.length,
  flagged_count: flagged.length,
  flagged_samples: flagged.slice(0, 25),
  missing_approved_brands_in_phase75: missingBrands,
  missing_brands_count: missingBrands.length
}, null, 2));

if (applyPrune && flagged.length > 0) {
  const dropSet = new Set(flagged.map(f => `${f.part_number}|${f.marketplace}|${f.asin}`));
  registryDoc.offers = registryDoc.offers.filter(o => {
    if (!/^Phase 90:/.test(o.status_reason || '')) return true;
    const k = `${o.part_number}|${o.marketplace || 'amazon.nl'}|${o.asin}`;
    return !dropSet.has(k);
  });
  const afterActive = registryDoc.offers.filter(o => o.status === 'ACTIVE');
  registryDoc.metrics.active = afterActive.length;
  registryDoc.metrics.active_nl = afterActive.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length;
  registryDoc.metrics.active_de = afterActive.filter(o => o.marketplace === 'amazon.de').length;
  registryDoc.metrics.parts_with_amazon_offer = new Set(afterActive.map(o => o.part_number)).size;
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registryDoc, null, 1).replace(/\r\n/g, '\n') + '\n', 'utf8');
  console.log(`Pruned ${flagged.length} flagged Phase 90 offers. New ACTIVE=${afterActive.length}`);
}
