/**
 * Phase 59A sample builder — READ ONLY.
 * Deterministic systematic sample of the canonical parts catalog plus
 * static affiliate-link analysis. No network calls here.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDeterministicQueryVariant } from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'parts_catalog.json'), 'utf8'));
const parts = catalog.parts.slice().sort((a, b) => a.part_number.localeCompare(b.part_number));

const TARGET = 200;
const STEP = Math.floor(parts.length / TARGET); // 91
const START = 45;
const picked = [];
const pickedSet = new Set();
for (let i = START; picked.length < TARGET && i < parts.length; i += STEP) {
  picked.push(parts[i]);
  pickedSet.add(parts[i].part_number);
}
// Ensure the reference part used elsewhere in the audit is present.
const anchor = '11231602050';
if (!pickedSet.has(anchor)) {
  const idx = parts.findIndex(p => p.part_number === anchor);
  if (idx >= 0) {
    picked[picked.length - 1] = parts[idx];
    pickedSet.add(anchor);
  }
}
picked.sort((a, b) => a.part_number.localeCompare(b.part_number));

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const resolver = new AffiliateOfferResolver();
const sample = picked.map((p) => {
  const resolved = PartCatalogResolver.resolvePartNumber(p.part_number);
  const layout = resolved?.technical_profile?.canonical_sections?.[0] || null;
  const offers = resolver.resolveOffers({ partNumber: p.part_number });
  const offer = offers[0] || null;
  const models = (resolved?.compatible_models || []).map(m => ({
    model_id: m.model_id,
    model_name: m.model_name,
    variants: m.variants || [],
    configurations: m.configurations || []
  }));
  const variant = offer?.query_variant || getDeterministicQueryVariant(p.part_number);
  return {
    sample_index: null,
    part_number: p.part_number,
    part_number_display: p.part_number_display,
    part_name: p.part_name,
    prefix: p.part_number.slice(0, 4),
    source_count: p.source_count,
    fitment_count: resolved?.fitment_count ?? null,
    model_count: models.length,
    models_sample: models.slice(0, 5),
    model_ids_all: models.map(m => m.model_id),
    sections: resolved?.technical_profile?.canonical_sections || [],
    query_variant: variant,
    amazon_query: `STIHL ${variant === 'VARIANT_A' ? p.part_number_display : p.part_number}`,
    amazon_search_url: offer?.url || null,
    associate_tag: offer?.tag || null,
    offer_match_type: offer?.match_type || null,
    offer_is_verified: Boolean(offer?.is_verified),
    classification: 'SEARCH_ONLY_UNVERIFIED',
    evidence: {
      method: 'static_link_analysis',
      public_probe: null,
      note: 'Amazon live search and product pages returned ACCESS_BLOCKED during Phase 59A; no result-set verification possible.'
    }
  };
});

sample.forEach((s, i) => { s.sample_index = i + 1; });

const out = {
  schema_version: '1.0.0',
  phase: '59A',
  generated_at_utc: new Date().toISOString(),
  read_only: true,
  catalog: {
    file: 'data/parts_catalog.json',
    parts_count: parts.length
  },
  selection: {
    method: 'systematic_every_nth_after_part_number_sort_with_anchor',
    step: STEP,
    start_index_zero_based: START,
    target_size: TARGET,
    anchor_forced_included: anchor,
    note: 'Deterministic and reproducible from the baseline catalog without randomness.'
  },
  classification_scheme: [
    'VERIFIED_EXACT',
    'VERIFIED_COMPATIBLE_AFTERMARKET',
    'SEARCH_ONLY_UNVERIFIED',
    'INCORRECT_MATCH',
    'UNAVAILABLE',
    'ACCESS_BLOCKED'
  ],
  classification_counts: {},
  parts: sample
};
for (const s of sample) out.classification_counts[s.classification] = (out.classification_counts[s.classification] || 0) + 1;

fs.writeFileSync(path.join(root, 'PHASE59A_PRODUCT_MATCH_SAMPLE.json'), JSON.stringify(out, null, 2) + '\n');
console.log('written', sample.length, out.classification_counts);
