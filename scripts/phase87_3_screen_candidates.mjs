/**
 * scripts/phase87_3_screen_candidates.mjs
 *
 * Strictly screens all 597 already-rendered /dp/ candidates in
 * output/phase87_3/existing_checked_pool.json + the 12 ready_above_cap items
 * against strict component-type, pitch/teeth/length, multipack, brand, and NL-delivery rules.
 *
 * Writes:
 *   output/phase87_3/screened_candidates.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase87_3');
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const reg = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const catDoc = readOpt('data/parts_catalog.json', { parts: [] });
const catalog = Array.isArray(catDoc) ? catDoc : (catDoc.parts || []);
const catByPart = Object.fromEntries(catalog.map(p => [p.part_number, p]));
const pool = readOpt('output/phase87_3/existing_checked_pool.json', []);

const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {})
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {})
};

const activeKeys = new Set(reg.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace || 'amazon.nl'}:${o.asin}`));
const activeByPartMkt = new Set(reg.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace || 'amazon.nl'}`));

const BAD_BRAND_RE = /^(generic|unbranded|merkloos|unknown|markenlos|noname|no name|oem|stihl compatible|motorrad-styling|tuin|diy)$/i;
const AFTERMARKET_CLUE_RE = /\b(vervangt|vervanging|compatibel|compatible|passend\s+f[üu]r|geschikt\s+voor|ersatz|replaces|replacement|fits\s+for|aftermarket|adaptable|anpassbar)\b/i;

function resolveCleanBrand(check, rawBrand) {
  const b = (rawBrand || '').trim();
  const byline = (check.byline || '').trim();
  const title = (check.title || '').trim();
  if (/^ISE\b/i.test(title) && /essie|caps ise/i.test(`${byline} ${b}`)) return 'ISE';
  if (/^Sägenspezi\b/i.test(title) || /sägenspezi/i.test(byline)) return 'Sägenspezi';
  if (/^Oregon\b/i.test(title) || /\boregon\b/i.test(byline)) return 'Oregon';
  if (/^NGK\b/i.test(title) || /\bngk\b/i.test(byline)) return 'NGK';
  if (/^Bosch\b/i.test(title) || /\bbosch\b/i.test(byline)) return 'Bosch';
  if (/^Walbro\b/i.test(title) || /\bwalbro\b/i.test(byline)) return 'Walbro';
  if (/^Zama\b/i.test(title) || /\bzama\b/i.test(byline)) return 'Zama';
  if (/^vhbw\b/i.test(title) || /\bvhbw\b/i.test(byline)) return 'vhbw';
  if (/^C[·.]?T[·.]?S\b/i.test(title) || /c[·.]?t[·.]?s/i.test(byline)) return 'C·T·S';
  if (/^Ratioparts\b/i.test(title) || /ratioparts/i.test(byline)) return 'Ratioparts';
  if (/^ECSiNG\b/i.test(title)) return 'ECSiNG';
  if (/^perfektGarten\b/i.test(title)) return 'perfektGarten';
  if (/^Hippotech\b/i.test(title)) return 'Hippotech';
  if (/^MCHNIC\b/i.test(title)) return 'MCHNIC';
  if (/^Cancanle\b/i.test(title)) return 'Cancanle';
  if (/^Adefol\b/i.test(title)) return 'Adefol';
  if (/^QHALEN\b/i.test(title)) return 'QHALEN';
  if (/^HUYUR\b/i.test(title)) return 'HUYUR';
  if (/^ProPart\b/i.test(title)) return 'ProPart';
  if (/^Jardiaffaires\b/i.test(title)) return 'Jardiaffaires';
  if (/^Jardinvest\b/i.test(title)) return 'Jardinvest';
  if (/^Trade-Shop\b/i.test(title)) return 'Trade-Shop';
  if (/^Rotary\b/i.test(title) || /rotary/i.test(byline)) return 'Rotary';
  if (/^STIHL\b/i.test(byline) || /^STIHL Store/i.test(byline) || (/^Stihl\b/i.test(title) && !AFTERMARKET_CLUE_RE.test(title))) {
    return 'Stihl';
  }
  return b;
}

function classifyBrand(brand, check) {
  if (/^stihl$/i.test(brand)) {
    const by = (check.byline || '').trim();
    if (by && !/stihl/i.test(by)) return 'MANUFACTURER_AFTERMARKET';
    if (AFTERMARKET_CLUE_RE.test(check.title || '') && !/\boriginal|\borigineel|\boriginele|\bgenuine\b/i.test(check.title || '')) {
      return 'MANUFACTURER_AFTERMARKET';
    }
    return 'GENUINE_STIHL';
  }
  if (['Oregon', 'NGK', 'Bosch', 'Walbro', 'Zama', 'Champion'].some(x => x.toLowerCase() === brand.toLowerCase())) {
    return 'OEM_SUPPLIER_EQUIVALENT';
  }
  return 'MANUFACTURER_AFTERMARKET';
}

const STRONG_MULTIPACK_RE = /\b(\d+\s*(?:x|pcs|pieces|stuks|stks|stcs|stk|stück|stueck|pc|sets?|delig|delige|teiliges?|er[- ]pack|er[- ]set)|1\/[2-9]\s*set|pack of\s*[2-9]|pack van\s*[2-9]|pak van\s*[2-9]|lot de\s*[2-9]|paar|pair|2-pack|3-pack|4-pack|5-pack|10-pack|dubbelpak|partij)\b/i;

function evaluateTechnicalFit(item, check) {
  const partName = (item.part_name || '').toLowerCase();
  const title = (check.title || '').toLowerCase();
  const full = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.description || ''}`.toLowerCase();
  const isKitPart = /\b(kit|set|pack|pair|satz)\b/i.test(partName);

  // 1. Multipack guard (allow "6-teiliges Kolben-Kit" only for Piston? Wait: Piston contains rings/pin/clips = 6 parts, whereas "4 Stk/partij Zuiger Ring" or "10 stcs" is a true multipack!)
  if (!isKitPart && STRONG_MULTIPACK_RE.test(check.title || '')) {
    const m = (check.title || '').match(STRONG_MULTIPACK_RE);
    const tok = m ? m[0].toLowerCase() : '';
    const allowedPistonParts = /\bpiston\b/.test(partName) && /teiliges?\s*kolben-kit/i.test(title);
    if (m && !/^1\s*(?:x|pc|stuk|stück)/i.test(tok) && !allowedPistonParts) {
      return { ok: false, reason: `MULTIPACK_TITLE (${m[0]})` };
    }
  }
  if (!isKitPart && /\b([2-9]|10)\s*(?:x|pcs|pieces|stuks|stück|stcs|stk)\b/i.test(title)) {
    return { ok: false, reason: 'MULTIPACK_COUNT_IN_TITLE' };
  }

  // 2. Product-type alignment guards
  if (/\bcap\b/.test(partName) && !/\b(dop|deksel|cap|tankdeckel|verschluss|schraubverschluss|ölverschluss|kraftstoffverschluss)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cap)' };
  }
  if (/\bgasket\b/.test(partName) && !/\bset|kit\b/.test(partName)) {
    if (/\b(cilinder|zylinder|cylinder|carburat|vergaser|piston|zuiger|kolben|aanzuigpomp|primer|oliekeerring|afdichtring|pakking.*set|pakking.*kit)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (single gasket vs kit/wrong part)' };
    }
    if (!/\b(pakking|dichtung|gasket|dichtungsdämpfer|uitlaatpakking|cilinderpakking)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected gasket)' };
    }
  }
  if (/cylinder and piston|cylinder with piston/.test(partName)) {
    if (!/(cilinder|zylinder|cylinder)/i.test(title) || !/(zuiger|kolben|piston)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cylinder & piston)' };
    }
  } else if (/\bpiston ring\b/.test(partName)) {
    if (/\b(cilinder|zylinder|cylinder)\b/i.test(title) && !/\b(zuigerveer|zuigerring|kolbenring|piston ring|segmente)\b/i.test(title.slice(0, 50))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
    if (!/\b(zuigerveer|zuigerring|kolbenring|piston ring|segmente|zuiger ring|ring)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
  } else if (/\bpiston pin\b/.test(partName)) {
    if (!/\b(pin|bolzen|kolbenbolzen|zuigerpen)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston pin)' };
    }
  } else if (/\bpiston\b/.test(partName)) {
    if (!/\b(zuiger|kolben|piston)\b/i.test(title) || /\b(vergaser|carburat|luchtfilterset|cilinder.*zuiger)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston)' };
    }
  }
  if (/\bcrankshaft\b/.test(partName)) {
    if (!/\b(krukas|kurbelwelle|crankshaft|crank)\b/i.test(title) || /\b(motorcilinderzuigerset|cylinder)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected crankshaft)' };
    }
  }
  if (/\bmuffler\b/.test(partName) && !/\bgasket\b/.test(partName)) {
    if (!/\b(uitlaat|uitlaatdemper|demper|auspuff|schalldämpfer|muffler|geluiddemper)\b/i.test(title) || /\b(afdichtingsset|pakkingbout|gasket.*kit|dichtung.*kit|bout.*schroefset)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected muffler)' };
    }
  }
  if (/\bcarburett?or\b/.test(partName) && !/\b(parts|kit|set|reparatie|diaphragm|membraan|gasket)\b/.test(partName)) {
    if (!/\b(carburateur|carburator|carburetor|vergaser)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected carburetor)' };
    }
    if (/\b(reparatieset|repair kit|reparatursatz|membraan|diaphragm)\b/i.test(title) && !/\bwalbro|zama|tillotson|carburateur\b/i.test(title.slice(0, 35))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (repair kit instead of carburetor)' };
    }
  }
  if (/\b(air filter cover|carburett?or box cover)\b/.test(partName)) {
    if (!/\b(deksel|kap|afdekking|behuizing|cover|gehäuse|haube|abdeckung|hood|shroud|vergaserkastendeckel)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected filter/box cover)' };
    }
  } else if (/\bchain sprocket cover\b/.test(partName)) {
    if (!/\b(cover|afdekking|deksel|kettingafdekking|kettingwieldeksel|kettingscherm|deflektor|kupplungsabdeckung|deckel|bezug|hoes)\b/i.test(title) || /\bmoer en schroef\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected sprocket cover)' };
    }
  } else if (/\bair filter\b/.test(partName)) {
    if (!/\b(luchtfilter|luftfilter|air filter|filter|filtre|voorfilter)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected air filter)' };
    }
  }
  if (/\brewind spring\b|\bstarter spring\b|\btorsion spring\b/.test(partName)) {
    if (!/\b(veer|terugtrekveer|starterveer|feder|rückzugfeder|starterfeder|spring)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spring)' };
    }
  } else if (/\bspring\b/.test(partName) && !/\b(veer|feder|spring)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spring)' };
  }
  if (/\brewind starter\b|\bfan housing\b/.test(partName)) {
    if (!/\b(starter|trekstarter|terugslagstarter|terugspoelen|seilstarter|anwerf|recoil|fan housing|ventilatorhuis)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected rewind starter)' };
    }
  }
  if (/\bignition module\b/.test(partName) && !/\b(ontsteking|bobine|ignition|zündmodul|zündspule)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected ignition module)' };
  }
  if (/\bflywheel\b/.test(partName) && !/\b(vliegwiel|schwungrad|flywheel)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected flywheel)' };
  }
  if (/\boil pump\b/.test(partName)) {
    if (!/\b(oliepomp|ölpumpe|oil pump)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected oil pump)' };
    }
  }
  if (/\bclutch drum\b/.test(partName) && !/\b(drum|trommel|glocke|kupplungstrommel)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch drum)' };
  } else if (/\bclutch\b/.test(partName) && !/\bdrum\b/.test(partName)) {
    if (!/\b(koppeling|kupplung|clutch)\b/i.test(title) || /\b(nadellagersatz|tandwiel|drum|trommel)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch)' };
    }
  }
  if (/\brim sprocket\b|\bchain sprocket\b/.test(partName)) {
    if (!/\b(tandwiel|kettingwiel|ritzel|kettenrad|ringkettenrad|sprocket|drum|trommel|kupplungstrommel|velg)\b/i.test(title) || /\bölpumpe|oliepomp|oil pump\b/i.test(title.slice(0, 45))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected sprocket)' };
    }
    const pitchMatch = partName.match(/(3\/8|\.325|\.404|1\/4)/);
    if (pitchMatch) {
      const pTok = pitchMatch[1];
      if (pTok === '.325' && /\b3\/8\b/.test(title) && !/\.325|325/.test(title)) return { ok: false, reason: 'PITCH_MISMATCH (expected .325, saw 3/8)' };
      if (pTok === '3/8' && /\.325\b/.test(title) && !/3\/8/.test(title)) return { ok: false, reason: 'PITCH_MISMATCH (expected 3/8, saw .325)' };
      if (pTok === '.404' && !/\.404|404/.test(full)) return { ok: false, reason: 'PITCH_MISMATCH (expected .404)' };
    }
    const teethMatch = partName.match(/\b([678])\s*t\b/i);
    if (teethMatch) {
      const tVal = teethMatch[1];
      const titleTeeth = title.match(/\b([678])\s*(?:t|z|tanden|zähne|tooth|teeth)\b/i);
      if (titleTeeth && titleTeeth[1] !== tVal) {
        return { ok: false, reason: `TOOTH_MISMATCH (expected ${tVal}T, saw ${titleTeeth[1]}T)` };
      }
    }
  }
  if (/\b(fuel hose|hose)\b/.test(partName) && !/\bhandlebar\b/.test(partName)) {
    if (/\b(carburateur|vergaser|carburetor)\b/i.test(title) && !/\bslang|hose|schlauch\b/i.test(title.slice(0, 40))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected hose, saw carburetor)' };
    }
  }
  if (/\bmotorrad-styling\b/i.test(title) || /\bhusqvarna\b/i.test(resolveCleanBrand(check, item.brand))) {
    return { ok: false, reason: 'BRAND_NOISE' };
  }

  return { ok: true };
}

// Re-inject the 2 Phase 87.2 ready_above_cap records whose phase87_3_runner checks now confirm hasAddCart:true
const seedExtras = [
  { part_number: '11286403206', marketplace: 'amazon.nl', asin: 'B0FQSTWS2Z' },
  { part_number: '11280201221', marketplace: 'amazon.nl', asin: 'B0CNSGPZ2R' }
];
const seenPool = new Set(pool.map(r => `${r.part_number}:${r.marketplace}:${r.asin}`));
for (const s of seedExtras) {
  const k = `${s.part_number}:${s.marketplace}:${s.asin}`;
  if (!seenPool.has(k) && checksNl[s.asin]?.hasAddCart) {
    pool.unshift({
      part_number: s.part_number,
      marketplace: s.marketplace,
      asin: s.asin,
      ready_above_cap: true,
      has_any_active: false,
      has_mkt_active: false,
      brand: checksNl[s.asin].byline?.replace(/^(?:Merk|Brand):\s*/i, '') || 'Luxuypon',
      part_name: catByPart[s.part_number]?.part_name || '',
      title: checksNl[s.asin].title || ''
    });
  }
}

const accepted = [];
const rejected = [];

const EXCLUDED_ASINS = new Set([
  'B0F3WVPVK5', // Multi-part fuel + oil cap pair
  'B0BWSWFXZ1', // Multi-part fuel & oil cap kit
  'B0FRWHW3H4', // Multi-part cylinder + muffler gasket bundle
  'B0DYDHVRD9', // Claims MS 310/382 instead of 1128 MS 440/460
  'B0DZ5CHDVZ', // Claims MS 310/382 instead of 1128 MS 440/460
  'B0DP8YY5FR', // Claims MS 361/341 on 1130 120 0610
  'B0FRVB8RRC', // Multi-part cylinder + muffler gasket bundle
  'B0BYS32MYS', // Filter + cover bundle (check vs cover only)
  'B0CJT69ZF5'  // 4238 140 1800 / 4401 / 4402 filter set
]);

// Explicit primary SKU assignment for ASINs that list two adjacent OEM numbers
const PREFERRED_PART_BY_ASIN = new Map([
  ['B0GBVVD67Y', '41371200628'], // First/primary SKU 4137 120 0628
  ['B0G2JNKGYX', '11304001310'], // First/primary SKU 1130 400 1310
  ['B0GZ36TFNV', '11301200612'], // C1Q-S286 1130 120 0612
  ['B0CTMX13YG', '11410201200']  // First/primary SKU 1141 020 1200
]);

for (const item of pool) {
  if (EXCLUDED_ASINS.has(item.asin)) {
    rejected.push({ ...item, reject_reason: 'EXCLUDED_BUNDLE_OR_CONFLICT' });
    continue;
  }
  const preferredPart = PREFERRED_PART_BY_ASIN.get(item.asin);
  if (preferredPart && preferredPart !== item.part_number) {
    rejected.push({ ...item, reject_reason: `SECONDARY_SKU_ON_SHARED_ASIN (primary=${preferredPart})` });
    continue;
  }
  const check = (item.marketplace === 'amazon.de' ? checksDe : checksNl)[item.asin];
  if (!check || check.listed !== true || check.hasAddCart !== true || check.cannotShipNl) {
    rejected.push({ ...item, reject_reason: 'NOT_LISTED_OR_NO_CART_OR_NO_SHIP' });
    continue;
  }
  if (activeKeys.has(`${item.part_number}:${item.marketplace}:${item.asin}`)) continue;

  const cleanBrand = resolveCleanBrand(check, item.brand);
  if (!cleanBrand || BAD_BRAND_RE.test(cleanBrand)) {
    rejected.push({ ...item, reject_reason: `INVALID_BRAND (${cleanBrand})` });
    continue;
  }
  const classification = classifyBrand(cleanBrand, check);
  const fit = evaluateTechnicalFit({ ...item, brand: cleanBrand }, check);
  if (!fit.ok) {
    rejected.push({ ...item, brand: cleanBrand, reject_reason: fit.reason });
    continue;
  }

  accepted.push({
    ...item,
    brand: cleanBrand,
    classification,
    score: (item.ready_above_cap ? 100 : 0) +
      (!item.has_any_active ? 50 : 0) +
      (!item.has_mkt_active ? 20 : 0) +
      (classification === 'GENUINE_STIHL' ? 30 : classification === 'OEM_SUPPLIER_EQUIVALENT' ? 20 : 0) +
      (item.dealer_hit ? 10 : 0) +
      (/sägenspezi|ratioparts|oregon|c·t·s|hippotech|perfektgarten|mchnic|vhbw|cancanle|adefol/i.test(cleanBrand) ? 5 : 0)
  });
}

const bestByPartMkt = new Map();
accepted.sort((a, b) => b.score - a.score);
for (const c of accepted) {
  const mk = `${c.part_number}:${c.marketplace}`;
  if (activeByPartMkt.has(mk)) continue;
  if (!bestByPartMkt.has(mk)) {
    bestByPartMkt.set(mk, c);
  }
}

const selected = Array.from(bestByPartMkt.values());
const selNl = selected.filter(s => s.marketplace === 'amazon.nl');
const selDe = selected.filter(s => s.marketplace === 'amazon.de');
const uniqueNewParts = new Set(selected.filter(s => !s.has_any_active).map(s => s.part_number));

fs.writeFileSync(path.join(OUT, 'screened_candidates.json'), JSON.stringify({ selected, rejected }, null, 2) + '\n');

console.log(`SELECTED total=${selected.length} (NL=${selNl.length}, DE=${selDe.length}), brand-new parts=${uniqueNewParts.size}, cross-mkt=${selected.length - uniqueNewParts.size}`);
console.log(`Ready_above_cap in selected=${selected.filter(s => s.ready_above_cap).length}`);
console.log(`Rejected during strict technical fit audit=${rejected.length}`);
