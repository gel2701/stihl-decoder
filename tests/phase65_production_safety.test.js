import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';
import { AmazonCandidateMatcher } from '../src/affiliate/AmazonCandidateMatcher.js';
import { checkAmazonHealth } from '../src/affiliate/AmazonHealthMonitor.js';
import { validateAmazonLink } from '../src/affiliate/AmazonLinkValidator.js';

const registryPath = new URL('../data/affiliate/verified_amazon_registry.json', import.meta.url);
const registry = JSON.parse(readFileSync(registryPath));
const active = registry.offers.filter(offer => offer.status === 'ACTIVE');
const activeNL = active.filter(offer => !offer.marketplace || offer.marketplace === 'amazon.nl');
const activeMap = new Map(active.map(offer => [offer.part_number, offer.asin]));
assert.equal(activeMap.get('11104007005'), 'B0068M5NAG');
assert.equal(activeMap.get('00004007000'), 'B001RM8J76');
assert.equal(activeMap.get('00004007011'), 'B001RMA5S2');
assert.ok(activeNL.length <= 100);
assert.ok(registry.policy.max_active_offers_allowed >= 25);
for (const offer of active) {
  assert.equal(validateAmazonLink(offer.direct_affiliate_url, {
    marketplace: offer.marketplace, asin: offer.asin, tag: offer.affiliate_tag
  }).valid, true);
}
const report = await checkAmazonHealth({ registryPath });
assert.equal(report.results.length, active.length);
assert.ok(report.results.every(item => item.state === 'UNKNOWN'));
const tagBefore = process.env.AMAZON_ASSOCIATE_TAG;
const enabledBefore = process.env.AMAZON_AFFILIATE_ENABLED;
try {
  process.env.AMAZON_ASSOCIATE_TAG = 'test-21';
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  const provider = new AmazonAffiliateProvider();
  const offers = provider.getOffers({ partNumber: '11104007005' });
  assert.equal(offers[0].link_type, 'SEARCH_FALLBACK');
  assert.equal(validateAmazonLink(offers[0].url, { marketplace: 'amazon.nl', tag: 'test-21' }).valid, true);
  const unverified = AmazonCandidateMatcher.matchCandidate(null, {
    part_number: '11104007005', asin: 'B0068M5NAG', marketplace: 'amazon.nl',
    manufacturer: 'Bosch', ean_gtin: '3165141051063'
  });
  assert.equal(unverified.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(provider.getAssociateTag('amazon.fr'), null);
  assert.equal(provider.getAssociateTag('amazon.de'), process.env.AMAZON_ASSOCIATE_TAG_DE || null);
} finally {
  if (tagBefore === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
  else process.env.AMAZON_ASSOCIATE_TAG = tagBefore;
  if (enabledBefore === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
  else process.env.AMAZON_AFFILIATE_ENABLED = enabledBefore;
}
console.log('Phase 65 production safety: PASS');
