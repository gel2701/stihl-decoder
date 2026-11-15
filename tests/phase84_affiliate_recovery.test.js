/**
 * Phase 84 — Affiliate recovery & catalog evidence guards.
 *
 * Locks the Phase 84 outcome:
 *  1. Every activated eBay offer in the Phase 84 payload is fully evidenced
 *     (Two-Gate match type, NL shipping confirmation, correct campaign, ACTIVE).
 *  2. No offer points at a part that is missing from the canonical catalog.
 *  3. The reported metrics match the payload (no inflated reporting).
 *  4. The catalog and fitment baselines were not silently changed by this phase.
 *  5. The two open supersession targets keep their direction and NEEDS_EVIDENCE status.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = rel => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const catalog = readJson('data/parts_catalog.json');
const catalogNumbers = new Set(catalog.parts.map(p => String(p.part_number)));
const payload = readJson('output/phase84/ebay_offers_phase84.json');
const affiliateAudit = readJson('output/phase84/PHASE84_AFFILIATE_AUDIT.json');
const summary = readJson('output/phase84/PHASE84_SUMMARY.json');
const supersessionTargets = readJson('output/phase84/PHASE84_SUPERSESSION_TARGETS.json');
const gscCoverage = readJson('output/phase84/PHASE84_GSC_MODEL_COVERAGE.json');

const ALLOWED_MATCH_TYPES = new Set(['EXACT_MPN', 'EXACT_PART_NUMBER_WITH_CORROBORATION']);

test('Phase 84: every activated eBay offer is fully evidenced and NL-shippable', () => {
  assert.ok(payload.offers.length > 0, 'Phase 84 must contain activated offers');
  for (const offer of payload.offers) {
    assert.strictEqual(offer.status, 'ACTIVE', `${offer.item_id} must be ACTIVE`);
    assert.strictEqual(offer.decision, 'ACCEPT', `${offer.item_id} must be ACCEPT`);
    assert.ok(
      ALLOWED_MATCH_TYPES.has(offer.match_type),
      `${offer.item_id} match_type ${offer.match_type} is not a Two-Gate proof`
    );
    assert.strictEqual(
      offer.shipping_status,
      'SHIPS_TO_NL_CONFIRMED',
      `${offer.item_id} must have confirmed NL shipping`
    );
    assert.ok(['EBAY_NL', 'EBAY_DE'].includes(offer.marketplace), `${offer.item_id} marketplace must be NL or DE`);
    assert.strictEqual(offer.campaign_id, payload.campaign_id, `${offer.item_id} must carry the payload campaign id`);
    assert.ok(
      String(offer.affiliate_url || offer.item_url || '').includes(`campid=${payload.campaign_id}`),
      `${offer.item_id} affiliate URL must carry campid=${payload.campaign_id}`
    );
    if (offer.match_type === 'EXACT_MPN') {
      assert.ok(offer.mpn, `${offer.item_id} EXACT_MPN offer must carry the listing MPN`);
    } else {
      assert.strictEqual(offer.match_basis, 'PART_NUMBER_CORROBORATED', `${offer.item_id} must be corroborated on the part number`);
    }
    assert.strictEqual(offer.ships_to_nl, true, `${offer.item_id} must be shippable to NL`);
  }
  assert.strictEqual(payload.campaign_id, '5339245312', 'EPN campaign id must stay 5339245312');
});

test('Phase 84: offers resolve to canonical catalog parts and are unique', () => {
  const keys = new Set();
  for (const offer of payload.offers) {
    assert.ok(catalogNumbers.has(offer.part_number), `${offer.part_number} must exist in the canonical catalog`);
    const key = `${offer.item_id}::${offer.marketplace}::${offer.part_number}`;
    assert.ok(!keys.has(key), `duplicate offer ${key}`);
    keys.add(key);
  }
});

test('Phase 84: reported metrics match the payload and the frozen baselines', () => {
  const uniqueParts = new Set(payload.offers.map(o => o.part_number));

  // Phase 85 correction: 41 of the 42 payload offers already existed in the Phase 82
  // payload (same part, marketplace and item_id). They are re-imports of known
  // listings, not new offerings; only one listing is genuinely new.
  const priorOfferKeys = new Set();
  for (const rel of ['output/phase81/ebay_offers_phase81.json', 'output/phase82/ebay_offers_phase82.json', 'output/phase83/ebay_offers_phase83.json']) {
    for (const offer of readJson(rel).offers || []) {
      if (offer.status !== 'ACTIVE') continue;
      priorOfferKeys.add(`${offer.part_number}:${String(offer.marketplace || offer.marketplaceId || '').toUpperCase()}:${offer.item_id}`);
    }
  }
  const identity = (offer) => `${offer.part_number}:${String(offer.marketplace || offer.marketplaceId || '').toUpperCase()}:${offer.item_id}`;
  const reimported = payload.offers.filter(o => priorOfferKeys.has(identity(o)));
  const genuinelyNew = payload.offers.filter(o => !priorOfferKeys.has(identity(o)));

  assert.strictEqual(affiliateAudit.offer_count_in_payload ?? affiliateAudit.offers_in_payload, payload.offers.length);
  assert.strictEqual(affiliateAudit.reimported_active_offers, reimported.length);
  assert.strictEqual(affiliateAudit.new_active_offers, genuinelyNew.length);
  assert.strictEqual(affiliateAudit.parts_with_new_offers, uniqueParts.size);
  assert.strictEqual(summary.after.offers_in_payload, payload.offers.length);
  assert.strictEqual(summary.after.reimported_ebay_offers, reimported.length);
  assert.strictEqual(summary.after.new_active_ebay_offers, genuinelyNew.length);
  assert.strictEqual(summary.after.parts_receiving_new_offers, uniqueParts.size);
  assert.strictEqual(summary.after.new_active_ebay_parts, 0, 'no part became newly buyable in this phase');

  // Phase 84 added listings, not new buyable parts: every offer part already had
  // a proven ACTIVE offer in an earlier phase payload.
  const priorParts = new Set();
  for (const rel of ['output/phase81/ebay_offers_phase81.json', 'output/phase82/ebay_offers_phase82.json', 'output/phase83/ebay_offers_phase83.json']) {
    for (const offer of readJson(rel).offers || []) {
      if (offer.status === 'ACTIVE') priorParts.add(offer.part_number);
    }
  }
  assert.deepStrictEqual(affiliateAudit.new_direct_parts, [], 'Phase 84 must not claim new buyable parts');
  for (const part of uniqueParts) {
    assert.ok(priorParts.has(part), `${part} already had a proven ACTIVE offer before Phase 84`);
  }
  assert.strictEqual(affiliateAudit.unique_parts_with_direct_purchase_before, affiliateAudit.unique_parts_with_direct_purchase_after);

  // Frozen Phase 84 artifact values: the phase itself added no catalog parts.
  // Later phases may grow the catalog above this baseline.
  assert.strictEqual(summary.baseline_verified.catalog_parts, 18397);
  assert.strictEqual(summary.after.catalog_parts, 18397);
  assert.ok(catalog.parts.length >= summary.after.catalog_parts, 'the catalog may grow but never below the Phase 84 baseline');
  assert.strictEqual(summary.real_growth.new_catalog_parts, 0);
  assert.strictEqual(summary.real_growth.new_fitment_relations, 0);
  assert.strictEqual(catalog.parts_count, catalog.parts.length);

  assert.ok(gscCoverage.totals.direct_after >= gscCoverage.totals.direct_before, 'GSC direct coverage must not shrink');
  assert.strictEqual(
    gscCoverage.totals.direct_after,
    gscCoverage.totals.direct_before,
    'without new buyable parts the direct part coverage cannot grow'
  );
  const perModelExtraOffers = Object.values(gscCoverage.models).reduce(
    (sum, row) => sum + (row.parts_with_extra_offers_phase84 || 0),
    0
  );
  assert.strictEqual(gscCoverage.totals.part_model_links_with_extra_offers, perModelExtraOffers);
  assert.ok(perModelExtraOffers >= uniqueParts.size, 'every offer part must be counted on at least one model');
});

test('Phase 84: Drive sources are inventoried and candidates stay out of the catalog', () => {
  const sources = readJson('output/phase84/PHASE84_DRIVE_SOURCES.json');
  assert.strictEqual(sources.schema_version, '1.0.0');
  assert.strictEqual(sources.requested_archives.length, 15, 'all fifteen requested archives must be tracked');
  assert.deepStrictEqual(
    [...sources.archives_present].sort(),
    ['stihl_local_library.db', 'stihl_opeforum_documentation.db', 'stihlusa_knowledge_graph.json'],
    'only these archives were actually present in the shared folder'
  );
  assert.strictEqual(sources.archives_missing.length, 11, 'eleven requested archives are still missing');
  assert.ok(
    sources.requested_archives.every(name =>
      sources.archives_present.includes(name) ||
      sources.archives_derived_present.includes(name) ||
      sources.archives_missing.includes(name)
    ),
    'every requested archive must have exactly one status'
  );

  const carb = sources.candidate_queue.carburetor_cross_reference;
  assert.ok(carb.unique_rows > 0, 'the Walbro cross-reference table must be parsed');
  assert.ok(carb.missing_from_catalog > 0, 'the table must yield catalog candidates');
  assert.strictEqual(
    carb.missing_from_catalog,
    new Set(carb.entries.map(entry => entry.part_number)).size,
    'each missing number must appear once in the queue'
  );
  for (const entry of carb.entries) {
    assert.match(entry.part_number, /^\d{11}$/, `${entry.part_number} must be canonical`);
    assert.ok(!catalogNumbers.has(entry.part_number), `${entry.part_number} must not enter the catalog unproven`);
  }
  assert.strictEqual(carb.status, 'NEEDS_IDENTITY_REVIEW');

  for (const entry of sources.candidate_queue.supersession_statements.entries) {
    assert.strictEqual(entry.from_in_catalog, catalogNumbers.has(entry.from_part));
    assert.strictEqual(entry.to_in_catalog, catalogNumbers.has(entry.to_part));
    assert.ok(entry.source_text && entry.document_title, 'a supersession statement needs a document and a quote');
  }

  assert.strictEqual(sources.catalog_untouched.written_records, 0, 'this intake writes no catalog records');
  assert.strictEqual(sources.catalog_untouched.parts_in_catalog, catalog.parts.length);
});

test('Phase 84: open supersession targets keep direction and NEEDS_EVIDENCE', () => {
  const relations = readJson('data/parts_supersessions.json').relations;
  assert.strictEqual(supersessionTargets.open_targets, 2);
  for (const target of supersessionTargets.targets) {
    assert.strictEqual(target.in_catalog, false, `${target.part_number} must stay out of the catalog`);
    assert.strictEqual(target.evidence_status, 'NEEDS_EVIDENCE');
    assert.strictEqual(target.supersession_direction_unchanged, true);
    const relation = relations.find(r => r.from_part === target.part_number || r.to_part === target.part_number);
    assert.ok(relation, `${target.part_number} must still have a documented supersession relation`);
    assert.strictEqual(relation.source_document, target.source_document, 'source document must not be rewritten');
  }
});
