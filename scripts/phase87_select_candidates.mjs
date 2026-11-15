/**
 * Phase 87 — candidate selection for the Amazon recovery.
 *
 * Picks, for every catalog part whose offer is SUSPENDED or RESEARCH_REQUIRED,
 * the best live Amazon.nl listing observed in the Phase 87 search audit.
 *
 * Selection is deliberately conservative:
 *  - the exact 11-digit STIHL number must appear in the listing title;
 *  - multi-packs, tool kits and listings that mention several different STIHL
 *    numbers are scored down, because the physical quantity/identity is ambiguous;
 *  - genuine-STIHL wording scores up, independent brands score neutral.
 *
 * Output: output/phase87/selection_plan.json (one row per part) for review.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const registry = read('data/affiliate/verified_amazon_registry.json');
const searchHits = read('output/phase87/amazon_search_hits.json');
const dealer = read('output/phase87/dealer_corroboration.json');
const productChecks = read('output/phase87/amazon_product_checks.json');
const phase86Alts = read('output/phase86/PHASE86_AMAZON_ACTIVATION.json');

const altMap = Object.fromEntries(
  phase86Alts.alternative_asins.alternatives.map(a => [a.part_number, a.top_hits.map(h => h.asin)])
);

const normalize = s => String(s || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
const digits = s => String(s || '').replace(/[^0-9]/g, '');

function scoreCandidate(part, hit) {
  const title = hit.title || '';
  const t = title.toLowerCase();
  let score = 0;
  if (digits(title).includes(part)) score += 4;
  // Part number near the start of the title = primary reference.
  const idx = digits(title).indexOf(part);
  if (idx >= 0 && idx < 20) score += 2;
  if (/\b(genuine|origineel|original|oem)\b/.test(t)) score += 3;
  if (/\bstihl\b/.test(t)) score += 1;
  if (/\b(pack of|2x|3x|2 pcs|2pcs|2 stuks|set of|setje|kit)\b/.test(t)) score -= 4;
  if (/\b(tool|sleutel|wrench|filter kit|tune up|tune-up|service kit)\b/.test(t)) score -= 3;
  const otherStihlNumbers = (title.match(/\b\d{4}[\s-]?\d{3}[\s-]?\d{4}\b/g) || [])
    .map(digits)
    .filter(n => n.length === 11 && n !== part);
  score -= otherStihlNumbers.length * 2;
  if (hit.sponsored) score -= 1;
  return score;
}

const parts = [...new Set(
  registry.offers
    .filter(o => o.status === 'SUSPENDED' || o.status === 'RESEARCH_REQUIRED')
    .map(o => o.part_number)
)];

const plan = [];
for (const part of parts) {
  const original = registry.offers.filter(o => o.part_number === part && (o.status === 'SUSPENDED' || o.status === 'RESEARCH_REQUIRED'));
  const origin = original[0];
  const fromSearch = (searchHits[part]?.hits || []).filter(h => h.asin && digits(h.title).includes(part));
  const fromAlternatives = (altMap[part] || []).flatMap(asin => {
    const check = productChecks[asin];
    return check && check.listed ? [{ asin, title: check.title, sponsored: false, source: 'phase86_alternative' }] : [];
  });
  const seen = new Set();
  const candidates = [...fromSearch.map(c => ({ ...c, source: 'phase87_search' })), ...fromAlternatives]
    .filter(c => c.asin && !seen.has(c.asin) && seen.add(c.asin))
    .map(c => ({ ...c, score: scoreCandidate(part, c) }))
    .sort((a, b) => b.score - a.score);

  const dealerRec = dealer[part] || null;
  plan.push({
    part_number: part,
    part_name: origin?.product_title || null,
    original_status: origin?.status || null,
    original_asin: origin?.asin || null,
    original_brand: origin?.brand || null,
    original_oem: origin?.oem_brand_classification || null,
    dealer_corroborated: !!dealerRec?.found,
    dealer_hit: dealerRec?.hits?.[0] || null,
    dealer_url: dealerRec?.source_url || null,
    candidates: candidates.slice(0, 4)
  });
}

const outPath = path.join(ROOT, 'output/phase87/selection_plan.json');
fs.writeFileSync(outPath, JSON.stringify({
  schema_version: '1.0.0',
  phase: 87,
  generated_at: new Date().toISOString(),
  parts: plan.length,
  parts_with_dealer_evidence: plan.filter(p => p.dealer_corroborated).length,
  parts_with_candidate: plan.filter(p => p.candidates.length > 0).length,
  plan
}, null, 1) + '\n');

console.log(`parts=${plan.length} dealer=${plan.filter(p => p.dealer_corroborated).length} withCandidate=${plan.filter(p => p.candidates.length).length}`);
for (const row of plan) {
  const top = row.candidates[0];
  console.log([
    row.part_number,
    row.original_status,
    row.dealer_corroborated ? 'DEALER' : '-------',
    top ? `${top.asin}(${top.score})` : 'NO-CANDIDATE',
    top ? top.title.slice(0, 70) : ''
  ].join(' | '));
}
