#!/usr/bin/env node
/**
 * scripts/apply_phase86_amazon_availability.mjs
 *
 * Phase 86 — Amazon listing availability.
 *
 * Phase 86 opened every blocked and every ACTIVE Amazon ASIN in a real browser
 * (same session, with a live ASIN and a non-existent ASIN as controls) and
 * recorded the HTTP status of each listing. The audit found that a large part
 * of the amazon.nl inventory is delisted: the product page returns HTTP 404.
 *
 * This script writes that finding into the registry:
 *
 *  - an ACTIVE offer whose listing returns 404 is suspended
 *    (`status: SUSPENDED`, `suspension_reason: LISTING_NOT_AVAILABLE_404`) with
 *    the live audit as evidence, so the site never sends a visitor to a dead
 *    Amazon page;
 *  - a live ACTIVE offer keeps its status and gets `availability_audit` fields;
 *  - a blocked candidate keeps its lifecycle status but records availability, so
 *    the activation backlog separates "unproven identity" from "listing gone";
 *  - nothing is activated: identity proof is unchanged by this script.
 *
 * Usage:
 *   node scripts/apply_phase86_amazon_availability.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const outputPath = path.join(rootDir, 'output', 'phase86', 'PHASE86_AMAZON_ACTIVATION.json');

const dryRun = process.argv.includes('--dry-run');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const registry = readJson('data/affiliate/verified_amazon_registry.json');
const auditNlActive = readJson('output/phase86/amazon_audit_batch_a.json');
const auditDe = readJson('output/phase86/amazon_audit_de_status.json');
const auditRrNl = readJson('output/phase86/amazon_audit_rr_nl_status.json');

const CHECKED_AT = new Date().toISOString();
const METHOD = 'LIVE_BROWSER_GET';
const CONTROLS = {
  live_asin_control: { asin: 'B0068M5NAG', http_status: 200 },
  missing_asin_control: { asin: 'B000000000', http_status: 404 }
};

/** Build one lookup keyed on `marketplace:asin`. */
const status = new Map();
for (const row of auditNlActive) {
  if (!row.asin) continue;
  status.set(`amazon.nl:${row.asin}`, {
    http_status: row.http_status ?? null,
    buybox_present: row.buybox === true,
    mentions_nl: row.mentions_nl === true,
    page_title: row.title || null
  });
}
for (const row of auditRrNl) {
  if (!row.asin || !row.http_status) continue;
  status.set(`amazon.nl:${row.asin}`, {
    http_status: row.http_status,
    buybox_present: null,
    mentions_nl: null,
    page_title: null
  });
}
for (const row of auditDe) {
  if (!row.asin || !row.http_status) continue;
  status.set(`amazon.de:${row.asin}`, {
    http_status: row.http_status,
    buybox_present: null,
    mentions_nl: null,
    page_title: null
  });
}

const audit = {
  method: METHOD,
  checked_at: CHECKED_AT,
  controls: CONTROLS,
  marketplace: {
    'amazon.nl': { checked: 0, live: 0, not_found: 0 },
    'amazon.de': { checked: 0, live: 0, not_found: 0 }
  }
};
const suspended = [];
const live = [];
const unverifiable = [];

for (const offer of registry.offers) {
  const key = `${offer.marketplace}:${offer.asin}`;
  const result = status.get(key);
  const bucket = audit.marketplace[offer.marketplace];
  if (!result || result.http_status === null) {
    unverifiable.push({ part_number: offer.part_number, asin: offer.asin, marketplace: offer.marketplace, status: offer.status });
    continue;
  }
  if (bucket) bucket.checked += 1;
  const notFound = result.http_status === 404;
  if (bucket) {
    if (notFound) bucket.not_found += 1;
    else if (result.http_status === 200) bucket.live += 1;
  }

  offer.availability_audit = {
    method: METHOD,
    checked_at: CHECKED_AT,
    http_status: result.http_status,
    verdict: notFound ? 'LISTING_NOT_AVAILABLE' : (result.http_status === 200 ? 'LISTING_LIVE' : 'UNKNOWN'),
    buybox_present: result.buybox_present,
    mentions_nl: result.mentions_nl,
    listing_title: result.page_title
  };

  if (notFound && offer.status === 'ACTIVE') {
    offer.previous_status = 'ACTIVE';
    offer.status = 'SUSPENDED';
    offer.pilot_active = false;
    offer.suspension_reason = 'LISTING_NOT_AVAILABLE_404';
    offer.suspension_evidence = {
      type: 'LIVE_LISTING_HTTP_STATUS',
      url: offer.direct_affiliate_url || null,
      http_status: 404,
      checked_at: CHECKED_AT,
      method: METHOD
    };
    offer.status_reason = 'Phase 86 availability audit: the Amazon listing returns HTTP 404, so the direct buy link is no longer purchasable. Suspended instead of serving a dead affiliate link.';
    suspended.push({ part_number: offer.part_number, asin: offer.asin, marketplace: offer.marketplace });
  } else if (offer.status === 'ACTIVE') {
    live.push({ part_number: offer.part_number, asin: offer.asin, marketplace: offer.marketplace, buybox_present: offer.availability_audit.buybox_present });
  }
  offer.updated_at = CHECKED_AT;
}

const active = registry.offers.filter((o) => o.status === 'ACTIVE');

registry.metrics = {
  ...registry.metrics,
  total_registered: registry.offers.length,
  verified: registry.offers.filter((o) => o.status === 'VERIFIED').length,
  active: active.length,
  active_nl: active.filter((o) => o.marketplace === 'amazon.nl').length,
  active_de: active.filter((o) => o.marketplace === 'amazon.de').length,
  research_required: registry.offers.filter((o) => o.status === 'RESEARCH_REQUIRED').length,
  suspended: registry.offers.filter((o) => o.status === 'SUSPENDED').length,
  last_updated: CHECKED_AT
};
registry.availability_audit = {
  phase: '86',
  method: METHOD,
  checked_at: CHECKED_AT,
  controls: CONTROLS,
  per_marketplace: audit.marketplace,
  suspended_active_offers: suspended.length,
  live_active_offers: live.length,
  unverifiable_offers: unverifiable.length,
  note: 'Live browser GET of every registered product page. 404 = the listing no longer exists on that marketplace; a known-live ASIN returns 200 and a made-up ASIN returns 404 in the same session, so the 404s are delistings, not bot blocks.'
};

const activeParts = new Set(active.map((o) => o.part_number));
const blockedAvailability = registry.offers
  .filter((o) => o.status !== 'ACTIVE' && o.availability_audit)
  .map((o) => ({ part_number: o.part_number, asin: o.asin, marketplace: o.marketplace, status: o.status, verdict: o.availability_audit.verdict }));

const alternativesRaw = fs.existsSync(path.join(rootDir, 'output', 'phase86', 'amazon_alternative_search.json'))
  ? readJson('output/phase86/amazon_alternative_search.json')
  : [];
const alternatives = alternativesRaw.map((entry) => {
  const hits = (entry.hits || []).filter((h) => String(h.text).replace(/\D/g, '').includes(entry.part_number));
  return {
    part_number: entry.part_number,
    query: entry.query || null,
    listing_hits_with_exact_part_number: hits.length,
    top_hits: hits.slice(0, 3).map((h) => ({ asin: h.asin, title: h.text }))
  };
}).filter((entry) => entry.listing_hits_with_exact_part_number > 0);

const report = {
  schema_version: '1.0.0',
  phase: '86',
  generated_at: CHECKED_AT,
  baseline: {
    active_offers: 99,
    active_nl: 53,
    active_de: 46,
    parts_with_amazon_offer: 86,
    research_required: 55,
    verified_blocked: 3
  },
  after: {
    active_offers: active.length,
    active_nl: registry.metrics.active_nl,
    active_de: registry.metrics.active_de,
    parts_with_amazon_offer: activeParts.size,
    research_required: registry.metrics.research_required,
    verified_blocked: registry.metrics.verified,
    suspended: registry.metrics.suspended
  },
  listings_audited: audit.marketplace,
  suspended_active_offers: suspended,
  live_active_offers: live.length,
  live_active_offers_with_buybox: live.filter((o) => o.buybox_present === true).length,
  blocked_candidates: blockedAvailability,
  blocked_candidates_with_live_listing: blockedAvailability.filter((b) => b.verdict === 'LISTING_LIVE').length,
  blocked_candidates_with_dead_listing: blockedAvailability.filter((b) => b.verdict === 'LISTING_NOT_AVAILABLE').length,
  alternative_asins: {
    note: 'Live amazon.nl search per part number for the parts whose previous ASIN is delisted. Recorded as candidates only: an Amazon listing cannot by itself satisfy the independent ASIN identity gate.',
    parts_with_alternatives: alternatives.length,
    alternatives
  },
  activation_blockers: [
    'Amazon Product Advertising API / Creators API credentials are not configured in this environment (only the associate tags AMAZON_ASSOCIATE_TAG_NL / _DE are present), so no authenticated marketplace offer, buybox or delivery data can be collected.',
    'Repo policy (AGENTS.md directive 4 + TwoGateVerifier Gate 2) requires independent external corroboration linking the exact ASIN to the manufacturer and MPN. An Amazon product page, live or not, cannot supply that corroboration on its own.',
    'De public Amazon product page is niet programmeerbaar op te halen: https://www.amazon.nl/dp/<asin> geeft HTTP 503 aan een gewone HTTP-client; alleen een echte browser render de pagina. Daarmee is bewijs per ASIN alleen handmatig/browser-matig te verzamelen.'
  ]
};

if (!dryRun) {
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  dry_run: dryRun,
  active_before: 99,
  active_after: active.length,
  suspended: suspended.length,
  live_active: live.length,
  live_active_with_buybox: report.live_active_offers_with_buybox,
  research_required: registry.metrics.research_required,
  verified: registry.metrics.verified,
  parts_with_amazon_offer: activeParts.size,
  alternatives_parts: alternatives.length
}, null, 2));
