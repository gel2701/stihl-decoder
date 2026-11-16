/**
 * Phase 87.1 — candidate selection from the Amazon search audit.
 *
 * Picks, per queued part, the best Amazon.nl listing whose title carries the exact
 * STIHL number, and records why. A title match is a strong candidate signal and the
 * activation gate still runs over each chosen ASIN after the product page and the
 * independent dealer catalog have been checked (see apply_phase87_1_expansion.mjs).
 *
 * Output: output/phase87_1/selection_plan.json
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const queue = read('output/phase87_1/queue.json').queue;
const hits = read('output/phase87_1/search_hits_amazon_nl.json');
const registry = read('data/affiliate/verified_amazon_registry.json');

const digits = s => String(s || '').replace(/[^0-9]/g, '');
const activeParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
const activeAsins = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.asin));

function scoreCandidate(part, hit) {
  const title = hit.title || '';
  const t = title.toLowerCase();
  let score = 0;
  const d = digits(title);
  if (!d.includes(part)) return -99;
  score += 6;
  const idx = d.indexOf(part);
  if (idx >= 0 && idx < 16) score += 2;
  if (/\b(genuine|origineel|original|oem|stihl original)\b/.test(t)) score += 3;
  if (/\bstihl\b/.test(t)) score += 1;
  if (/\b(pack of|2x|3x|4x|2 pcs|2pcs|2 stuks|set of|setje|kit|tune[- ]?up|service kit)\b/.test(t)) score -= 4;
  const others = (title.match(/\b\d{4}[\s-]?\d{3}[\s-]?\d{4}\b/g) || []).map(digits).filter(n => n.length === 11 && n !== part);
  score -= others.length * 2;
  if (hit.sponsored) score -= 1;
  if (hit.has_price) score += 1;
  if (activeAsins.has(hit.asin)) score -= 50;
  return score;
}

const rows = [];
for (const row of queue) {
  const part = row.part_number;
  const rec = hits[part] || { hits: [] };
  const scored = (rec.hits || [])
    .map(h => ({ ...h, score: scoreCandidate(part, h) }))
    .filter(h => h.score > -50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  rows.push({
    part_number: part,
    part_display: row.part_display,
    part_name: row.part_name,
    rank: row.rank,
    score: row.score,
    reasons: row.reasons,
    priority_models: row.priority_models,
    superseded_by: row.superseded_by,
    ebay: row.ebay ? row.ebay[0] : null,
    already_active: activeParts.has(part),
    query: rec.query || null,
    hits_seen: (rec.hits || []).length,
    candidates: scored
  });
}

const withCandidates = rows.filter(r => r.candidates.length > 0);
const asins = [...new Set(withCandidates.flatMap(r => r.candidates.map(c => c.asin)))];
const partsToCorroborate = withCandidates.map(r => r.part_number);

fs.writeFileSync(path.join(ROOT, 'output/phase87_1/selection_plan.json'), JSON.stringify({
  schema_version: '1.0.0',
  phase: '87.1',
  generated_at: new Date().toISOString(),
  parts: rows.length,
  parts_with_candidate: withCandidates.length,
  unique_candidate_asins: asins.length,
  asins,
  parts_to_corroborate: partsToCorroborate,
  plan: rows
}, null, 1) + '\n');

console.log(JSON.stringify({ parts: rows.length, withCandidate: withCandidates.length, uniqueAsins: asins.length }, null, 1));
for (const r of withCandidates.slice(0, 12)) {
  console.log(`${r.part_display} ${r.candidates[0].asin} (${r.candidates[0].score}) ${r.candidates[0].title.slice(0, 70)}`);
}
