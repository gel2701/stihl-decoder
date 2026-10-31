/**
 * Phase 59A evidence merge — READ ONLY. Applies conservative classifications.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const samplePath = path.join(root, 'PHASE59A_PRODUCT_MATCH_SAMPLE.json');
const probePath = path.join(root, 'PHASE59A_INDEX_PROBES.json');
const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const probeData = JSON.parse(fs.readFileSync(probePath, 'utf8'));

// Evidence captured earlier during Phase 59A via a public search index (DuckDuckGo HTML),
// before that index started returning a bot challenge. Record exact observed ASINs only.
const capturedEvidence = {
  '11231602050': {
    source: 'duckduckgo_html_index',
    query: 'site:amazon.nl "1123 160 2050"',
    observed_asins: ['B0FR969PZ7', 'B09X9QR1TX', 'B0BR355ZQS'],
    observed_titles: [
      '1123 160 2050 Koppeling for Kettingzaag 017 018 021 023 025 MS170 MS180 ...'
    ],
    interpretation: 'Public index surfaces aftermarket clutch kits that reference the OEM part number. Titles indicate aftermarket kits, not OEM STIHL parts. Amazon product pages could not be opened: CAPTCHA (ACCESS_BLOCKED).',
    classification: 'ACCESS_BLOCKED'
  },
  '00000071043': {
    source: 'duckduckgo_html_index',
    query: 'site:amazon.nl "0000 007 1043"',
    observed_asins: [],
    observed_titles: [],
    interpretation: 'Public index returned no amazon.nl result for the exact part number. This is not proof of unavailability.',
    classification: 'SEARCH_ONLY_UNVERIFIED'
  }
};

const probesByPart = new Map(probeData.probes.map(p => [p.part_number, p]));

for (const part of sample.parts) {
  const captured = capturedEvidence[part.part_number];
  const probe = probesByPart.get(part.part_number);
  if (captured) {
    part.classification = captured.classification;
    part.evidence = {
      method: 'public_search_index_plus_blocked_amazon_page',
      public_probe: {
        source: captured.source,
        query: captured.query,
        observed_asins: captured.observed_asins,
        observed_titles: captured.observed_titles,
        amazon_page_access: 'ACCESS_BLOCKED_CAPTCHA'
      },
      interpretation: captured.interpretation,
      note: 'No ASIN was promoted, stored as an offer, or presented as a verified match.'
    };
  } else if (probe) {
    part.evidence = {
      method: 'public_search_index_probe_inconclusive',
      public_probe: {
        source: 'bing_html_index',
        query: probe.query,
        http_status: probe.bing_http_status,
        amazon_nl_results_observed: probe.amazon_nl_result_count,
        no_results_assertion: probe.bing_no_results
      },
      interpretation: probe.bing_no_results
        ? 'Bing returned no organic amazon.nl result for the exact part number. Because Bing failed to surface a known-indexed example in the same batch, this is treated as inconclusive, not as evidence of unavailability.'
        : 'Bing probe returned results that did not include an amazon.nl listing for the exact part number. Inconclusive.',
      note: 'Amazon search and product pages were ACCESS_BLOCKED; no bypass attempted.'
    };
  } else {
    part.evidence = {
      method: 'static_link_analysis_only',
      public_probe: null,
      note: 'Not probed individually. Static analysis shows a deterministic Amazon search URL; a search URL cannot prove a product match.'
    };
  }
}

sample.classification_counts = {};
for (const p of sample.parts) sample.classification_counts[p.classification] = (sample.classification_counts[p.classification] || 0) + 1;
sample.verification_summary = {
  sampled_parts: sample.parts.length,
  individually_probed_parts: probeData.probes.length,
  verified_exact: sample.classification_counts.VERIFIED_EXACT || 0,
  verified_compatible_aftermarket: sample.classification_counts.VERIFIED_COMPATIBLE_AFTERMARKET || 0,
  search_only_unverified: sample.classification_counts.SEARCH_ONLY_UNVERIFIED || 0,
  incorrect_match: sample.classification_counts.INCORRECT_MATCH || 0,
  unavailable: sample.classification_counts.UNAVAILABLE || 0,
  access_blocked: sample.classification_counts.ACCESS_BLOCKED || 0,
  amazon_live_verification_possible: false,
  amazon_block_reason: 'Search endpoint returned HTTP 503; product endpoint returned CAPTCHA validation page. No bypass attempted.'
};
sample.probe_log_file = 'PHASE59A_INDEX_PROBES.json';

fs.writeFileSync(samplePath, JSON.stringify(sample, null, 2) + '\n');
console.log(sample.classification_counts, sample.verification_summary);
