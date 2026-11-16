/**
 * scripts/phase87_2_select_candidates.mjs
 *
 * Scores search hits from both Amazon.nl and Amazon.de, filters out active ASINs,
 * and ranks single-unit exact-part-number candidates per part & marketplace for
 * live /dp/ + NL delivery + GardenHireSpares dealer verification.
 *
 * Output: output/phase87_2/selection_plan.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase87_2');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

const registry = read('data/affiliate/verified_amazon_registry.json');
const queueDoc = read('output/phase87_2/queue.json');
const nlHits = readOpt(path.join(OUT, 'search_hits_amazon_nl.json'), {});
const deHits = readOpt(path.join(OUT, 'search_hits_amazon_de.json'), {});

const digits = s => String(s || '').replace(/[^0-9]/g, '');
const activeParts = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
const activeAsins = new Set(registry.offers.filter(o => o.status === 'ACTIVE').map(o => o.asin));

const REPUTABLE_RE = /\b(stihl|oregon|sägenspezi|saegenspezi|walbro|zama|ngk|bosch|champion|stens|rotary|c[·.]?t[·.]?s|hippotech|perfektgarten|mchnic|rade-shop|trade-shop|vhbw|adefol|ecsing)\b/i;
const MULTIPACK_RE = /\b(pack of\s*[2-9]|2x|3x|4x|5x|6x|10x|2 pcs|3 pcs|4 pcs|5 pcs|6 pcs|10 pcs|12 pcs|2 stuks|3 stuks|4 stuks|5 stuks|6 stuks|10 stuks|2 stks|3 stks|5 stks|10 stks|2 stück|3 stück|4 stück|5 stück|6 stück|10 stück|paar|pair|2-pack|3-pack|5-pack)\b/i;
const BUNDLE_RE = /\b(met bougie|mit zündkerze|with spark plug|fuel filter.*primer|air filter.*fuel|onderhoudsset|wartungsset|service kit|tune[- ]?up|rebuild kit|reparatieset)\b/i;

function scoreHit(part, partName, hit, marketplace) {
  const title = hit.title || '';
  const t = title.toLowerCase();
  const d = digits(title);
  if (!d.includes(part)) return -99;
  if (activeAsins.has(hit.asin)) return -99;

  let score = 6;
  const idx = d.indexOf(part);
  if (idx >= 0 && idx < 20) score += 2;
  if (REPUTABLE_RE.test(title)) score += 6;
  if (/\b(genuine|origineel|original|oem)\b/.test(t) && /\bstihl\b/.test(t)) score += 4;
  if (/\bsägenspezi|saegenspezi\b/i.test(title)) score += 4;
  if (hit.has_price) score += 2;
  if (hit.sponsored) score -= 1;

  // Prefer single unit matching catalog item, penalize multipacks/bundles unless catalog item itself is a set/kit
  const catalogIsKit = /\b(kit|set|pack|pair)\b/i.test(partName || '');
  if (!catalogIsKit && MULTIPACK_RE.test(t)) score -= 8;
  if (!catalogIsKit && BUNDLE_RE.test(t)) score -= 6;

  // Penalize excessive unrelated 11-digit OEM numbers in title
  const otherNums = (title.match(/\b\d{4}[\s-]?\d{3}[\s-]?\d{4}\b/g) || []).map(digits).filter(n => n.length === 11 && n !== part);
  score -= otherNums.length * 2;

  // Shipping clue from search card
  if (marketplace === 'amazon.de') {
    if (/Wordt verzonden naar Nederland|Bezorging|Lieferung/i.test(hit.delivery || '')) score += 2;
    else if (!hit.has_price) score -= 5;
  }
  return score;
}

const allQueued = new Map();
for (const r of (queueDoc.existing_research || [])) {
  if (!r.already_has_active) {
    allQueued.set(r.part_number, {
      part_number: r.part_number,
      part_display: r.part_display,
      part_name: r.part_name,
      source: 'EXISTING_RESEARCH',
      priority_models: [],
      score: 80
    });
  }
}
for (const r of (queueDoc.next_500 || [])) {
  if (!allQueued.has(r.part_number)) {
    allQueued.set(r.part_number, {
      part_number: r.part_number,
      part_display: r.part_display,
      part_name: r.part_name,
      source: 'NEXT_500',
      priority_models: r.priority_models || [],
      score: r.score || 10
    });
  }
}

const nlPlan = [];
const dePlan = [];

for (const item of allQueued.values()) {
  if (activeParts.has(item.part_number)) continue;

  const nlRec = nlHits[item.part_number];
  if (nlRec?.hits?.length) {
    const cands = nlRec.hits
      .map(h => ({ ...h, hit_score: scoreHit(item.part_number, item.part_name, h, 'amazon.nl') }))
      .filter(h => h.hit_score >= 4)
      .sort((a, b) => b.hit_score - a.hit_score)
      .slice(0, 2);
    if (cands.length) nlPlan.push({ ...item, candidates: cands });
  }

  const deRec = deHits[item.part_number];
  if (deRec?.hits?.length) {
    const cands = deRec.hits
      .map(h => ({ ...h, hit_score: scoreHit(item.part_number, item.part_name, h, 'amazon.de') }))
      .filter(h => h.hit_score >= 4)
      .sort((a, b) => b.hit_score - a.hit_score)
      .slice(0, 2);
    if (cands.length) dePlan.push({ ...item, candidates: cands });
  }
}

nlPlan.sort((a, b) => (b.candidates[0].hit_score + b.score * 0.2) - (a.candidates[0].hit_score + a.score * 0.2));
dePlan.sort((a, b) => (b.candidates[0].hit_score + b.score * 0.2) - (a.candidates[0].hit_score + a.score * 0.2));

const nlAsins = [...new Set(nlPlan.flatMap(r => r.candidates.map(c => c.asin)))];
const deAsins = [...new Set(dePlan.flatMap(r => r.candidates.map(c => c.asin)))];
const partsToCorroborate = [...new Set([...nlPlan.map(r => r.part_number), ...dePlan.map(r => r.part_number)])];

const outDoc = {
  schema_version: '1.0.0',
  phase: '87.2',
  generated_at: new Date().toISOString(),
  counts: {
    nl_parts_with_clean_candidate: nlPlan.length,
    nl_unique_asins: nlAsins.length,
    de_parts_with_clean_candidate: dePlan.length,
    de_unique_asins: deAsins.length,
    parts_to_corroborate: partsToCorroborate.length
  },
  nl_asins: nlAsins,
  de_asins: deAsins,
  parts_to_corroborate: partsToCorroborate,
  nl_plan: nlPlan,
  de_plan: dePlan
};

fs.writeFileSync(path.join(OUT, 'selection_plan.json'), JSON.stringify(outDoc, null, 1) + '\n');
console.log(JSON.stringify(outDoc.counts, null, 1));
console.log('Top 10 NL:');
for (const r of nlPlan.slice(0, 10)) console.log(`  ${r.part_display} | ${r.candidates[0].asin} (s=${r.candidates[0].hit_score}) | ${r.candidates[0].title.slice(0, 70)}`);
console.log('Top 10 DE:');
for (const r of dePlan.slice(0, 10)) console.log(`  ${r.part_display} | ${r.candidates[0].asin} (s=${r.candidates[0].hit_score}) | ${r.candidates[0].title.slice(0, 70)}`);
