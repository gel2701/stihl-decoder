/**
 * tests/phase86_coverage_and_amazon_availability.test.js
 *
 * Phase 86 — Catalog coverage, Amazon availability and eBay expansion.
 *
 * Verifies the three things this phase actually changed:
 *
 *  1. the Amazon registry now records what a live browser saw: 24 amazon.nl
 *     listings return HTTP 404 and are suspended instead of being served as
 *     purchasable links;
 *  2. a suspended listing never resolves as an active offer;
 *  3. the eBay expansion payload distinguishes new listings from re-imports,
 *     keeps full shipping evidence on every accepted offer and leaves the
 *     title-only candidates in the NEEDS_EVIDENCE work stock;
 *  4. catalog and fitment invariants are untouched by this phase.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { loadEbayOfferStore, saveEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const amazonReport = readJson('output/phase86/PHASE86_AMAZON_ACTIVATION.json');
const ebayAudit = readJson('output/phase86/PHASE86_AFFILIATE_AUDIT.json');
const ebayPayload = readJson('output/phase86/ebay_offers_phase86.json');
const needsGroups = readJson('output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json');

describe('Phase 86 — Amazon availability audit', () => {
  it('1. records the live audit result per marketplace and keeps every record', () => {
    // No historical live or suspended Phase 86 record may be deleted in subsequent growth phases.
    assert.ok(registryDoc.offers.length >= 216, 'No live or suspended record may be deleted');
    assert.ok(registryDoc.availability_audit, 'The registry must carry the Phase 86 availability audit');
    assert.strictEqual(registryDoc.availability_audit.method, 'LIVE_BROWSER_GET');
    assert.strictEqual(registryDoc.availability_audit.controls.live_asin_control.http_status, 200);
    assert.strictEqual(registryDoc.availability_audit.controls.missing_asin_control.http_status, 404);
    assert.ok(
      registryDoc.availability_audit.per_marketplace['amazon.nl'].not_found >= 70,
      'The amazon.nl inventory must record every listing that returns HTTP 404'
    );
    assert.strictEqual(
      registryDoc.availability_audit.per_marketplace['amazon.de'].not_found,
      0,
      'Every amazon.de listing was live at audit time'
    );
  });

  it('2. suspends exactly the ACTIVE listings that returned HTTP 404, with evidence', () => {
    const suspended = registryDoc.offers.filter((o) =>
      o.status === 'SUSPENDED' &&
      o.suspension_reason === 'LISTING_NOT_AVAILABLE_404' &&
      o.previous_status === 'ACTIVE'
    );
    assert.strictEqual(suspended.length, 24, 'Exactly the 24 delisted ACTIVE listings stay suspended');
    for (const offer of suspended) {
      assert.strictEqual(offer.marketplace, 'amazon.nl', 'Every suspended listing was an amazon.nl listing');
      assert.strictEqual(offer.suspension_reason, 'LISTING_NOT_AVAILABLE_404');
      assert.strictEqual(offer.previous_status, 'ACTIVE');
      assert.strictEqual(offer.pilot_active, false, 'A suspended offer must not stay pilot_active');
      assert.strictEqual(offer.suspension_evidence.http_status, 404);
      assert.strictEqual(offer.availability_audit.verdict, 'LISTING_NOT_AVAILABLE');
      assert.ok(offer.suspension_evidence.checked_at, 'Suspension must record when the 404 was observed');
    }
  });

  it('3. keeps the metrics consistent with the lifecycle (Phase 87 recovery included)', () => {
    const active = registryDoc.offers.filter((o) => o.status === 'ACTIVE');
    assert.strictEqual(registryDoc.metrics.active, active.length);
    assert.ok(registryDoc.metrics.active >= 150);
    assert.ok(registryDoc.metrics.active_nl >= 100);
    assert.ok(registryDoc.metrics.active_de >= 50);
    assert.strictEqual(registryDoc.metrics.suspended, 34);
    assert.ok(registryDoc.metrics.research_required >= 0);
    assert.strictEqual(registryDoc.metrics.verified, 3);
    assert.ok(
      active.every((o) => o.availability_audit?.verdict === 'LISTING_LIVE' || /Phase 8[78]/.test(o.status_reason || '')),
      'Every ACTIVE offer must be a live listing, either audited in Phase 86 or re-verified in Phase 87+'
    );
    assert.strictEqual(amazonReport.after.active_offers, 75);
    assert.strictEqual(amazonReport.suspended_active_offers.length, 24);
  });

  it('4. a suspended listing never resolves as an active offer', () => {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    const active = registry.listOffers({ status: 'ACTIVE' });
    assert.strictEqual(active.length, registryDoc.metrics.active);
    for (const offer of registryDoc.offers.filter((o) => o.status === 'SUSPENDED')) {
      const resolved = registry.getActiveOffer(offer.part_number, offer.marketplace, offer.asin);
      assert.strictEqual(
        resolved,
        null,
        `Suspended listing ${offer.asin} must never resolve as an active offer`
      );
      assert.ok(!active.some((a) => a.asin === offer.asin), `Suspended listing ${offer.asin} must not appear in the active list`);
    }
  });

  it('5. records the blocked candidates that no longer exist on Amazon.nl', () => {
    const blocked = registryDoc.offers.filter((o) => o.status !== 'ACTIVE' && o.availability_audit);
    const dead = blocked.filter((o) => o.availability_audit.verdict === 'LISTING_NOT_AVAILABLE');
    assert.ok(dead.length >= 50, `Expected at least 50 dead/suspended records preserved (found ${dead.length})`);
    // The Phase 86 report is a dated snapshot (77 dead listings at that time); Phase 87.1
    // proved 11 of them with live replacements, so the live registry now holds 66.
    assert.strictEqual(amazonReport.blocked_candidates_with_dead_listing, 77);
    assert.strictEqual(amazonReport.blocked_candidates_with_live_listing, 5);
    assert.ok(
      amazonReport.activation_blockers.some((b) => /Product Advertising API|Creators API/.test(b)),
      'The report must name the missing authorization instead of silently dropping Amazon'
    );
    assert.ok(amazonReport.alternative_asins.parts_with_alternatives >= 15, 'Alternative live ASINs must be recorded per part');
  });
});

describe('Phase 86 — eBay expansion', () => {
  it('6. measures 104 open parts and separates new listings from re-imports', () => {
    assert.strictEqual(ebayAudit.input.parts_in_queue, 104);
    assert.strictEqual(ebayAudit.input.parts_queried, 104);
    assert.strictEqual(ebayAudit.offers.new_listings + ebayAudit.offers.reimported_listings, ebayAudit.offers.unique_accepted_listings);
    assert.strictEqual(ebayAudit.offers.new_listings, 136);
    assert.strictEqual(
      ebayAudit.offers.new_listings_by_marketplace.EBAY_NL + ebayAudit.offers.new_listings_by_marketplace.EBAY_DE,
      ebayAudit.offers.new_listings
    );
    assert.strictEqual(ebayAudit.offers.parts_receiving_new_listings, 28);
    assert.strictEqual(ebayAudit.offers.new_parts_with_direct_purchase, 1);
    assert.deepStrictEqual(ebayAudit.offers.new_parts, ['11300203034']);
  });

  it('7. every accepted listing carries complete product and NL shipping evidence', () => {
    assert.ok(ebayPayload.offers.length > 0);
    for (const offer of ebayPayload.offers) {
      assert.strictEqual(offer.decision, 'ACCEPT');
      assert.strictEqual(offer.status, 'ACTIVE');
      assert.strictEqual(offer.shipping_status, 'SHIPS_TO_NL_CONFIRMED');
      assert.ok(offer.shipping_evidence && Object.keys(offer.shipping_evidence).length > 0, `Offer ${offer.item_id} must keep its shipping evidence`);
      assert.ok(['EXACT_MPN', 'EXACT_PART_NUMBER_WITH_CORROBORATION', 'VERIFIED_REPLACEMENT'].includes(offer.match_type));
      assert.ok(String(offer.title || '').length > 0, 'A listing without a title cannot be audited');
    }
  });

  it('8. title-only candidates stay in the NEEDS_EVIDENCE work stock', () => {
    assert.strictEqual(ebayAudit.needs_evidence.distinct_listings, 586);
    assert.deepStrictEqual(ebayAudit.needs_evidence.groups, { TITLE_ONLY_NEEDS_EVIDENCE: 586 });
    assert.deepStrictEqual(needsGroups.needs_evidence_groups, { TITLE_ONLY_NEEDS_EVIDENCE: 586 });
    assert.strictEqual(ebayAudit.rejected.distinct_listings, 51);
    assert.deepStrictEqual(ebayAudit.rejected.groups, { CONFLICTING_MPN: 101 });
  });

  it('9. the MPN enrichment run reported what it completed and what it did not', () => {
    const enrichment = ebayAudit.evidence_enrichment;
    assert.ok(enrichment.candidates_processed > 0);
    assert.ok(enrichment.get_item_requests > 0, 'Enrichment must really call getItem');
    assert.strictEqual(enrichment.evidence_completed, enrichment.activated);
    assert.ok(enrichment.still_needs_evidence > 0, 'Remaining candidates must be reported, not dropped');
  });

  it('10. re-importing the same payload is idempotent and keeps the stored evidence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase86-store-'));
    const storePath = path.join(dir, 'ebay_offers.json');
    const offers = ebayPayload.offers.slice(0, 25);
    const first = saveEbayOfferStore(storePath, offers, { campaignId: ebayPayload.campaign_id });
    assert.strictEqual(first.added, first.written);
    const second = saveEbayOfferStore(storePath, offers, { campaignId: ebayPayload.campaign_id });
    assert.strictEqual(second.added, 0, 'A re-import may never add duplicates');
    assert.strictEqual(second.updated, second.written);
    const store = loadEbayOfferStore(storePath);
    assert.strictEqual(store.offers.length, first.written);
    assert.ok(store.offers.every((o) => o.shipping_evidence && Object.keys(o.shipping_evidence).length > 0));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Phase 86 — Catalog invariants', () => {
  it('11. catalog and fitment counts are unchanged by an affiliate-only phase', () => {
    const catalog = readJson('data/parts_catalog.json');
    const fitments = readJson('data/model_part_fitments.json');
    assert.strictEqual((catalog.parts || catalog).length, 18480);
    assert.strictEqual(fitments.fitments_count, 181394);
    assert.strictEqual(ebayAudit.catalog.fitment_relations, 181394);
    assert.strictEqual(ebayAudit.catalog.canonical_parts, 18480);
  });
});
