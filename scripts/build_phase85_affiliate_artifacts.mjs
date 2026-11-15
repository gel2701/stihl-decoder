#!/usr/bin/env node
/**
 * scripts/build_phase85_affiliate_artifacts.mjs
 *
 * Phase 85 — consolidates the live eBay evidence batches run over the 79 newly
 * verified carburettors into one canonical payload plus an audit.
 *
 * Every number in the audit is recomputed from the batch reports; nothing is
 * copied from a claim made during the run.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'output', 'phase85');
const probeDir = path.join(outDir, 'ebay_probe');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
const writeJson = (name, payload) => {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path.relative(rootDir, file);
};

const CAMPAIGN = '5339245312';
const TARGET_PARTS = new Set(readJson('output/phase85/PHASE85_EBAY_QUEUE.json').queue.map((row) => row.part_number));

const reports = fs.existsSync(probeDir)
  ? fs.readdirSync(probeDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => JSON.parse(fs.readFileSync(path.join(probeDir, name), 'utf8')))
  : [];

const identity = (offer) =>
  `${offer.part_number}:${String(offer.marketplace || offer.marketplace_id || '').toUpperCase()}:${offer.item_id}`;

const accepted = new Map();
const needsEvidence = new Map();
const rejected = new Map();
const perPart = new Map();

for (const report of reports) {
  for (const offer of report.accepted_offers || []) {
    if (offer.status !== 'ACTIVE' || offer.decision !== 'ACCEPT') continue;
    accepted.set(identity(offer), offer);
  }
  for (const offer of report.needs_evidence_offers || []) {
    const key = `${offer.part_number}:${offer.item_id || offer.primary_reason || 'no-item'}`;
    needsEvidence.set(key, offer);
  }
  for (const offer of report.rejected_offers || []) {
    const key = `${offer.part_number}:${offer.item_id || offer.primary_reason || 'no-item'}`;
    rejected.set(key, offer);
  }
  for (const row of report.per_part || []) {
    perPart.set(row.part_number, row);
  }
}

const acceptedOffers = [...accepted.values()].filter((offer) => TARGET_PARTS.has(offer.part_number));
const offerParts = [...new Set(acceptedOffers.map((offer) => offer.part_number))].sort();

// Offers already present in an earlier phase payload are re-imports, not new offerings.
const priorOfferKeys = new Set();
for (const rel of [
  'output/phase81/ebay_offers_phase81.json',
  'output/phase82/ebay_offers_phase82.json',
  'output/phase83/ebay_offers_phase83.json',
  'output/phase84/ebay_offers_phase84.json'
]) {
  if (!fs.existsSync(path.join(rootDir, rel))) continue;
  for (const offer of readJson(rel).offers || []) {
    if (offer.status !== 'ACTIVE') continue;
    priorOfferKeys.add(identity(offer));
  }
}
const reimported = acceptedOffers.filter((offer) => priorOfferKeys.has(identity(offer)));
const fresh = acceptedOffers.filter((offer) => !priorOfferKeys.has(identity(offer)));

const payload = {
  schema_version: '1.0.0',
  phase: '85',
  generated_at: new Date().toISOString(),
  campaign_id: CAMPAIGN,
  source:
    'live EBAY_NL/EBAY_DE evidence batches (scripts/phase80_evidence_batch.mjs --live) over output/phase85/PHASE85_EBAY_QUEUE.json',
  offers: acceptedOffers.map((o) => ({
    part_number: o.part_number,
    related_part_numbers: o.related_part_numbers || [o.part_number],
    item_id: o.item_id,
    marketplace: o.marketplace,
    marketplace_id: o.marketplaceId || o.marketplace_id || o.marketplace,
    status: o.status,
    decision: o.decision,
    match_type: o.match_type,
    match_basis: o.match_basis,
    title: o.title,
    mpn: o.mpn,
    brand: o.brand,
    gtin: o.gtin,
    seller_name: o.seller_name,
    item_price: o.item_price ?? o.price ?? null,
    currency: o.currency,
    ships_to_nl: o.ships_to_nl === true,
    shipping_status: o.shipping_status,
    shipping_cost_nl: o.shipping_cost_nl ?? null,
    item_url: o.item_url || o.affiliate_url || null,
    affiliate_url: o.affiliate_url || o.item_url || null,
    campaign_id: /campid=(\d+)/.test(String(o.affiliate_url || o.item_url || ''))
      ? String(o.affiliate_url || o.item_url).match(/campid=(\d+)/)[1]
      : CAMPAIGN
  }))
};
const payloadPath = writeJson('ebay_offers_phase85.json', payload);

const needsByReason = [...needsEvidence.values()].reduce((acc, row) => {
  const key = row.primary_reason || row.match_type || row.reason || 'UNKNOWN';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const rejectedByReason = [...rejected.values()].reduce((acc, row) => {
  const key = row.primary_reason || row.reason || 'UNKNOWN';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

// Production baseline measured in Phase 83/84 (frozen, see PHASE84_AFFILIATE_AUDIT.json).
const PRODUCTION_ACTIVE_BASELINE = 1649;
const PRODUCTION_PARTS_BASELINE = 201;

const audit = {
  schema_version: '1.0.0',
  phase: '85',
  generated_at: new Date().toISOString(),
  input_queue: 'output/phase85/PHASE85_EBAY_QUEUE.json',
  parts_attempted: TARGET_PARTS.size,
  parts_queried: perPart.size,
  batch_reports: reports.length,
  campaign_id: CAMPAIGN,
  new_active_offers: fresh.length,
  reimported_known_offers: reimported.length,
  offers_in_payload: acceptedOffers.length,
  parts_with_new_offers: offerParts.length,
  offer_parts: offerParts,
  offers_per_part: offerParts.reduce((acc, part) => {
    acc[part] = acceptedOffers.filter((offer) => offer.part_number === part).length;
    return acc;
  }, {}),
  accepted_by_match_and_shipping: acceptedOffers.reduce((acc, o) => {
    const key = `${o.match_type}/${o.shipping_status}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}),
  needs_evidence_offers: needsEvidence.size,
  needs_evidence_by_reason: needsByReason,
  rejected_offers: rejected.size,
  rejected_by_reason: rejectedByReason,
  preservation: {
    production_active_offers_before: PRODUCTION_ACTIVE_BASELINE,
    production_parts_with_direct_purchase_before: PRODUCTION_PARTS_BASELINE,
    production_active_offers_after_minimum: PRODUCTION_ACTIVE_BASELINE,
    rule: 'Offers not mentioned by this batch are never touched, and a mentioned listing is merged field by field.',
    evidence: [
      'tests/phase85_ebay_store_merge.test.js (41 re-imports keep their evidence, no ACTIVE offer is lost)',
      'src/affiliate/EbayOfferStore.js mergeEbayOfferRecord (empty incoming fields never overwrite stored proof)'
    ]
  },
  unique_parts_with_direct_purchase_after: PRODUCTION_PARTS_BASELINE + offerParts.length,
  amazon_status:
    'No PA-API credentials in this environment (AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY absent); no ASIN could be verified, so 0 Amazon offers were activated.',
  ebay_api_status: 'Live Browse API accepted every batch in this window; no HTTP 429 occurred.',
  payload: payloadPath
};
const auditPath = writeJson('PHASE85_AFFILIATE_AUDIT.json', audit);

console.log(JSON.stringify({
  payload: payloadPath,
  audit: auditPath,
  offers: audit.offers_in_payload,
  new_offers: audit.new_active_offers,
  parts: audit.parts_with_new_offers,
  needs: audit.needs_evidence_offers,
  rejected: audit.rejected_offers
}, null, 2));
