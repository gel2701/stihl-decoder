/**
 * Phase 59A link inventory — READ ONLY.
 * Full deterministic inventory of every production-affiliate-capable part link.
 * Compact rows + aggregate integrity hash to keep the artefact reviewable.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'parts_catalog.json'), 'utf8'));
const offers = JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate/amazon_part_offers.json'), 'utf8'));
const resolver = new AffiliateOfferResolver();
const parts = catalog.parts.slice().sort((a, b) => a.part_number.localeCompare(b.part_number));

const links = [];
const variantCounts = { VARIANT_A: 0, VARIANT_B: 0 };
const hostCounts = {};
const tagCounts = {};
const matchCounts = {};
const queryCounts = {};

for (const p of parts) {
  const o = resolver.resolveOffers({ partNumber: p.part_number })[0];
  if (!o) continue;
  const variant = o.query_variant || null;
  variantCounts[variant] = (variantCounts[variant] || 0) + 1;
  const host = new URL(o.url).hostname;
  hostCounts[host] = (hostCounts[host] || 0) + 1;
  tagCounts[o.tag || ''] = (tagCounts[o.tag || ''] || 0) + 1;
  matchCounts[o.match_type] = (matchCounts[o.match_type] || 0) + 1;
  const q = new URL(o.url).searchParams.get('k') || '';
  queryCounts[q] = (queryCounts[q] || 0) + 1;
  links.push({ part_number: p.part_number, variant, url: o.url });
}

const duplicates = Object.entries(queryCounts).filter(([, n]) => n > 1);
const compact = links.map(l => [l.part_number, l.variant, l.url]);
const sha256 = crypto.createHash('sha256').update(JSON.stringify(compact)).digest('hex');

const out = {
  schema_version: '1.0.0',
  phase: '59A',
  read_only: true,
  generated_at_utc: new Date().toISOString(),
  baseline_commit: 'b0a388756924d723f88a52c41d41cebe399be379',
  source: {
    catalog_file: 'data/parts_catalog.json',
    catalog_parts_count: catalog.parts_count,
    manual_offer_file: 'data/affiliate/amazon_part_offers.json',
    manual_offers_declared: Array.isArray(offers.offers) ? offers.offers.length : null,
    provider_file: 'src/affiliate/AmazonAffiliateProvider.js',
    resolver_file: 'src/affiliate/AffiliateOfferResolver.js',
    render_file: 'src/components/PartDetailPageTemplate.js',
    redirect_file: 'server.js',
    audit_script: 'scripts/audit_amazon_affiliate_links.mjs'
  },
  link_construction: {
    pattern: 'https://<marketplace-host>/s?k=STIHL+<variant-part-number>&tag=<AMAZON_ASSOCIATE_TAG>',
    marketplaces_allowlisted: ['www.amazon.nl', 'amazon.nl', 'www.amazon.de', 'amazon.de', 'www.amazon.com', 'amazon.com'],
    marketplace_used: 'amazon.nl',
    variants: {
      VARIANT_A: 'STIHL <spaced part number>',
      VARIANT_B: 'STIHL <compact 11-digit part number>',
      selection: 'deterministic hash of part number, 50/50'
    },
    click_path: 'part page -> /api/affiliate/out?... -> HTTP 302 -> amazon.nl',
    link_attributes: 'rel="sponsored nofollow noopener" target="_blank"'
  },
  totals: {
    canonical_parts: catalog.parts_count,
    affiliate_capable_links: links.length,
    direct_asin_links: links.filter(l => l.url.includes('/dp/')).length,
    search_links: links.filter(l => l.url.includes('/s?')).length,
    verified_product_offers: (matchCounts.MANUAL_ASIN || 0) + (matchCounts.API_EXACT || 0),
    distinct_queries: Object.keys(queryCounts).length,
    duplicate_queries: duplicates.length,
    controlled_redirect_endpoint_links: links.length
  },
  distribution: { variant_counts: variantCounts, host_counts: hostCounts, tag_counts: tagCounts, match_type_counts: matchCounts },
  integrity: {
    row_format: '[part_number, query_variant, url]',
    rows_sha256: sha256,
    note: 'Regenerate with scripts/phase59a_build_inventory.mjs and compare rows_sha256 to detect drift.'
  },
  classification_note: 'Every generated link is an Amazon search URL. A search URL cannot establish an exact product match, so all 18,373 links are SEARCH_ONLY_UNVERIFIED by construction.',
  links: compact
};

fs.writeFileSync(path.join(root, 'PHASE59A_LINK_INVENTORY.json'), JSON.stringify(out));
console.log(JSON.stringify({ totals: out.totals, distribution: out.distribution, sha256 }, null, 2));
