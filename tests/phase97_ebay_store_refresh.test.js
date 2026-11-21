/**
 * Phase 97 — eBay resolver cache refresh after boot-time publication.
 *
 * The eBay provider snapshots the offer store when the resolver module is
 * imported. Server startup reconciles committed offers into the persistent
 * store after that import, so without an explicit refresh a deploy keeps
 * serving the offers that existed before the publication until the next
 * restart. These tests pin that refresh behaviour.
 */

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';
process.env.EBAY_CLIENT_ID = 'test-client-id';
process.env.EBAY_CLIENT_SECRET = 'test-client-secret';

const { AffiliateOfferResolver } = await import('../src/affiliate/AffiliateOfferResolver.js');

const repoStore = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'affiliate', 'ebay_offers.json'), 'utf8'));
const publishable = repoStore.offers.filter(offer => offer.decision === 'ACCEPT' && offer.status === 'ACTIVE');
const targetPart = publishable[0].part_number;
const targetOffers = publishable.filter(offer => offer.part_number === targetPart);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase97-refresh-'));
const publishedStorePath = path.join(tmpDir, 'ebay_offers.json');
fs.writeFileSync(publishedStorePath, JSON.stringify({
  schema_version: repoStore.schema_version,
  updated_at: new Date().toISOString(),
  offers: targetOffers
}, null, 2));

const directEbayOffers = (offers) => offers.filter(offer => offer.link_type === 'DIRECT_EBAY_ITEM');

// 1. A resolver created before the publication has no offers for the new part.
const resolver = new AffiliateOfferResolver({
  ebayStorePath: path.join(tmpDir, 'empty-store.json'),
  ebayCachedOffers: new Map()
});
assert.strictEqual(
  directEbayOffers(resolver.resolveOffers({ partNumber: targetPart })).length,
  0,
  'resolver starts without the not-yet-published offers'
);

// 2. Refreshing from the published store makes the offers resolvable in-process.
assert.strictEqual(resolver.refreshEbayOffers({ ebayStorePath: publishedStorePath }), true);
const refreshed = directEbayOffers(resolver.resolveOffers({ partNumber: targetPart }));
assert.ok(refreshed.length > 0, 'refresh exposes the published offers without a restart');
assert.ok(refreshed.every(offer => offer.part_number === targetPart));

// 3. Refreshing an already loaded provider replaces, and does not stack, the snapshot.
resolver.refreshEbayOffers({ ebayStorePath: publishedStorePath });
assert.strictEqual(
  directEbayOffers(resolver.resolveOffers({ partNumber: targetPart })).length,
  refreshed.length,
  'repeated refresh is idempotent'
);

// 4. The static helper drives the shared production resolver, and a disabled
//    eBay provider reports that nothing was loaded instead of throwing.
assert.strictEqual(typeof AffiliateOfferResolver.refreshDefaultEbayOffers, 'function');
const disabledResolver = new AffiliateOfferResolver({ ebayStorePath: publishedStorePath });
const previous = process.env.EBAY_ENABLED;
process.env.EBAY_ENABLED = 'false';
assert.strictEqual(disabledResolver.refreshEbayOffers({ ebayStorePath: publishedStorePath }), false);
process.env.EBAY_ENABLED = previous;

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('phase97_ebay_store_refresh: 6 assertions passed');
