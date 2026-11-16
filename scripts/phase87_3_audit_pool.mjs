/**
 * scripts/phase87_3_audit_pool.mjs
 *
 * Audits all existing Phase 87.1 and 87.2 browser data (search hits, /dp/ checks,
 * dealer corroboration, and ready_above_cap) to produce:
 *   1. output/phase87_3/existing_checked_pool.json — all already-rendered single-unit candidates
 *   2. output/phase87_3/unchecked_queue.json       — prioritized unchecked candidate ASINs for live /dp/ + shipping checks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase87_3');
fs.mkdirSync(OUT, { recursive: true });

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const reg = read('data/affiliate/verified_amazon_registry.json');
const catDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catDoc) ? catDoc : (catDoc.parts || []);
const catByPart = Object.fromEntries(catalog.map(p => [p.part_number, p]));
const act872 = read('output/phase87_2/PHASE87_2_ACTIVATION.json');
const dealer = readOpt('output/phase87_2/dealer_corroboration.json', {});

const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {})
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {})
};
const hitsNl = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json', {})
};
const hitsDe = {
  ...readOpt('output/phase87_2/search_hits_amazon_de.json', {})
};

const readySet = new Set((act872.ready_above_cap || []).map(r => `${r.part}:${r.mkt}:${r.asin}`));
const rejectedSet = new Set((act872.not_activated || []).map(r => r.asin));
const activeKeys = new Set(reg.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace || 'amazon.nl'}:${o.asin}`));
const activePartsMkt = new Set(reg.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace || 'amazon.nl'}`));
const activePartsAny = new Set(reg.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
const suspendedAsins = new Set(reg.offers.filter(o => o.status === 'SUSPENDED').map(o => `${o.marketplace || 'amazon.nl'}:${o.asin}`));

const digits = s => String(s || '').replace(/[^0-9]/g, '');
const MULTIPACK_RE = /\b(pack of\s*[2-9]|2x|3x|4x|5x|6x|10x|[2-9]\s*(?:x|pcs|pieces|stuks|stks|stück|stueck|pc|er\s*pack)|pak van\s*[2-9]|paar|pair|2-pack|3-pack|5-pack|10-pack|lot de\s*[2-9]|set of\s*[2-9])\b/i;
const BUNDLE_RE = /\b(met bougie|mit zündkerze|with spark plug|fuel filter.*primer|air filter.*fuel|onderhoudsset|wartungsset|service kit|tune[- ]?up|rebuild kit|reparatieset)\b/i;
const REPUTABLE_RE = /\b(stihl|oregon|sägenspezi|saegenspezi|walbro|zama|ngk|bosch|champion|stens|rotary|ratioparts|c[·.]?t[·.]?s|hippotech|perfektgarten|mchnic|trade-shop|vhbw|adefol|ecsing|cancanle)\b/i;

function extractBrand(c) {
  const b = (c.byline || '').trim();
  if (/^(?:Merk|Brand|Marke):\s*/i.test(b)) return b.replace(/^(?:Merk|Brand|Marke):\s*/i, '').trim();
  const m = b.match(/^(?:De|The|Den)\s+(.+?)(?:-Store|\s+Store|\s+Shop)\b/i);
  if (m) return m[1].trim();
  const t = (c.title || '').trim();
  if (/^stihl\b/i.test(t) || /\boriginele stihl\b|\boriginal stihl\b/i.test(t)) return 'Stihl';
  const brandMatch = t.match(/^(oregon|sägenspezi|walbro|zama|ngk|bosch|champion|stens|rotary|ratioparts|vhbw|hippotech|perfektgarten|cancanle|adefol|ecsing|mchnic|gardenpal|wifehelper|dluping|qhalen|propart|qiuwanzia)\b/i);
  if (brandMatch) return brandMatch[1];
  return '';
}

const existingChecked = [];
for (const [mkt, hits, checks] of [['amazon.nl', hitsNl, checksNl], ['amazon.de', hitsDe, checksDe]]) {
  const seen = new Set();
  for (const [pn, row] of Object.entries(hits)) {
    const part = catByPart[pn];
    if (!part) continue;
    for (const h of (row.hits || [])) {
      const c = checks[h.asin];
      if (!c || c.listed !== true || c.isDead === true || !c.hasAddCart || c.cannotShipNl) continue;
      if (suspendedAsins.has(`${mkt}:${c.asin}`) || rejectedSet.has(c.asin)) continue;
      if (activeKeys.has(`${pn}:${mkt}:${c.asin}`)) continue;
      const k = `${pn}:${mkt}:${c.asin}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const delivAll = [c.deliveryBlock || '', ...(c.delivery || [])].join(' ');
      if (mkt === 'amazon.de' && !/Nederland|Niederlande|bezorging/i.test(delivAll)) continue;
      if (/niet beschikbaar|unavailable|kan niet worden bezorgd/i.test(delivAll)) continue;

      const fullText = [c.title, ...(c.bullets || []), c.description].join(' ');
      if (!digits(fullText).includes(pn)) continue;

      const catalogIsKit = /\b(kit|set|pack|pair)\b/i.test(part.part_name || '');
      if (!catalogIsKit && MULTIPACK_RE.test(`${c.title || ''} ${(c.bullets || []).join(' ')}`)) continue;
      if (!catalogIsKit && BUNDLE_RE.test(c.title || '')) continue;

      const brand = extractBrand(c);
      if (!brand || /^(generic|unbranded|merkloos|unknown|markenlos)$/i.test(brand)) continue;

      existingChecked.push({
        part_number: pn,
        marketplace: mkt,
        asin: c.asin,
        ready_above_cap: readySet.has(k),
        has_any_active: activePartsAny.has(pn),
        has_mkt_active: activePartsMkt.has(`${pn}:${mkt}`),
        brand,
        part_name: part.part_name,
        title: c.title || '',
        delivery: (c.deliveryBlock || '').slice(0, 80),
        dealer_hit: !!(dealer[pn]?.hits?.length),
        source_count_clue: REPUTABLE_RE.test(brand) ? 2 : 1
      });
    }
  }
}

// Sort: ready_above_cap first, then parts with zero active offer, then reputable brands
existingChecked.sort((a, b) => {
  if (a.ready_above_cap !== b.ready_above_cap) return a.ready_above_cap ? -1 : 1;
  if (a.has_any_active !== b.has_any_active) return a.has_any_active ? 1 : -1;
  if (a.source_count_clue !== b.source_count_clue) return b.source_count_clue - a.source_count_clue;
  return a.part_number.localeCompare(b.part_number);
});

fs.writeFileSync(path.join(OUT, 'existing_checked_pool.json'), JSON.stringify(existingChecked, null, 2) + '\n');

// Build unchecked queue: candidate ASINs with exact MPN in title that have NOT yet been /dp/-checked
function buildUnchecked(hits, checks, mkt) {
  const items = [];
  const seenAsin = new Set();
  for (const [pn, row] of Object.entries(hits)) {
    const part = catByPart[pn];
    if (!part) continue;
    const catalogIsKit = /\b(kit|set|pack|pair)\b/i.test(part.part_name || '');
    const cands = (row.hits || []).filter(h => {
      if (!h.asin || checks[h.asin] || seenAsin.has(h.asin)) return false;
      if (suspendedAsins.has(`${mkt}:${h.asin}`) || rejectedSet.has(h.asin)) return false;
      if (activeKeys.has(`${pn}:${mkt}:${h.asin}`)) return false;
      if (!digits(h.title).includes(pn)) return false;
      if (!catalogIsKit && MULTIPACK_RE.test(h.title || '')) return false;
      if (!catalogIsKit && BUNDLE_RE.test(h.title || '')) return false;
      if (mkt === 'amazon.de' && !h.has_price && !/Nederland|bezorging|Lieferung/i.test(h.delivery || '')) return false;
      return true;
    }).map(h => {
      let score = 5;
      if (REPUTABLE_RE.test(h.title || '')) score += 6;
      if (/\b(genuine|origineel|original|oem)\b/i.test(h.title || '')) score += 3;
      if (h.has_price) score += 2;
      if (!activePartsAny.has(pn)) score += 5;
      return { ...h, score };
    }).sort((a, b) => b.score - a.score).slice(0, 2);

    for (const c of cands) {
      seenAsin.add(c.asin);
      items.push({ part_number: pn, part_name: part.part_name, marketplace: mkt, asin: c.asin, title: c.title, score: c.score, has_any_active: activePartsAny.has(pn) });
    }
  }
  items.sort((a, b) => b.score - a.score);
  return items;
}

const uncheckedNl = buildUnchecked(hitsNl, checksNl, 'amazon.nl');
const uncheckedDe = buildUnchecked(hitsDe, checksDe, 'amazon.de');
fs.writeFileSync(path.join(OUT, 'unchecked_queue.json'), JSON.stringify({ nl: uncheckedNl, de: uncheckedDe }, null, 2) + '\n');

const newPartsChecked = new Set(existingChecked.filter(r => !r.has_any_active).map(r => r.part_number));
console.log(`existingChecked rows=${existingChecked.length}, new_parts=${newPartsChecked.size}, ready_above_cap=${existingChecked.filter(r=>r.ready_above_cap).length}`);
console.log(`unchecked NL ASINs=${uncheckedNl.length} (new_parts=${new Set(uncheckedNl.filter(x=>!x.has_any_active).map(x=>x.part_number)).size})`);
console.log(`unchecked DE ASINs=${uncheckedDe.length} (new_parts=${new Set(uncheckedDe.filter(x=>!x.has_any_active).map(x=>x.part_number)).size})`);
