/**
 * scripts/phase95_screener.mjs
 *
 * Phase 95 — Compound-Noun & Component-Alignment Refinement on top of phase88_screener.
 *
 * Preserves all strict multipack, single-vs-kit, pitch/teeth, dimension, wrong-component,
 * brand, and historical-mismatch guards while fixing genuine Dutch/German compound nouns
 * (e.g. Koppelingsveer, Motoroliekeerring, Overdrukventiel, Inlaatpakking, Spritzschirm,
 * Rücklaufstarter, Luchtfilterelement, Tankdeksel) and specific hyphenated OEM names
 * (e.g. Spring Starter Pawl Clip, Crankshaft Locking Screw, Carburettor Box Cover,
 * Clutch Spring, Service Kit, Line Spool).
 */

import {
  BAD_BRAND_RE,
  AFTERMARKET_CLUE_RE,
  STRONG_MULTIPACK_RE,
  OEM_EQUIVALENTS,
  extractRawBrand,
  resolveCleanBrand,
  classifyBrand
} from './phase88_screener.mjs';

export {
  BAD_BRAND_RE,
  AFTERMARKET_CLUE_RE,
  STRONG_MULTIPACK_RE,
  OEM_EQUIVALENTS,
  extractRawBrand,
  resolveCleanBrand,
  classifyBrand
};

/**
 * Resolves the clean brand from an Amazon /dp/ check record, stripping localized
 * store boilerplate (`De X Store openen`, `Visit the X Store`, `Marke: X`).
 *
 * @param {Object} check
 * @returns {string}
 */
export function cleanBrand95(check) {
  let b = resolveCleanBrand(check) || '';
  b = b
    .replace(/^De\s+(.+?)\s+Store\s+openen$/i, '$1')
    .replace(/^Visit\s+the\s+(.+?)\s+Store$/i, '$1')
    .replace(/^Bezoek\s+de\s+store\s+van\s+(.+)$/i, '$1')
    .replace(/^Marke:\s*/i, '')
    .trim();
  if (!b && check?.byline) {
    const m = String(check.byline).trim().match(/^(?:De|The|Den)\s+(.+?)\s+(?:Store|Shop)\b/i);
    if (m) b = m[1].trim();
  }
  return b;
}

/**
 * Evaluates technical alignment between canonical STIHL part metadata and a live
 * Amazon product page check.
 *
 * @param {string} partNumber Canonical 11-digit STIHL part number
 * @param {string} partName Canonical English catalog name
 * @param {Object} check Scraped /dp/ record
 * @param {string} brand Cleaned brand
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateTechnicalFit95(partNumber, partName, check, brand) {
  const pnLower = String(partName || '').toLowerCase();
  const title = (check.title || '').toLowerCase();
  const full = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.techSpecs || ''} ${check.description || ''}`.toLowerCase();
  const isKitPart = /\b(kit|set|pack|pair|satz|service kit|maintenance kit)\b/i.test(pnLower);

  if (!brand || BAD_BRAND_RE.test(brand) || /\b(husqvarna|motorrad-styling|auto-zubehör)\b/i.test(`${brand} ${title.slice(0, 35)}`)) {
    return { ok: false, reason: 'INVALID_OR_NOISY_BRAND' };
  }

  const fullDigits = full.replace(/[^0-9]/g, '');
  if (!fullDigits.includes(partNumber)) {
    return { ok: false, reason: 'EXACT_PART_NUMBER_ABSENT' };
  }

  // Non-STIHL product protection (e.g. Nilfisk/Kärcher high-pressure parts)
  if (/\b(?:nilfisk|kärcher|karcher|husqvarna|makita|dewalt|milwaukee|einhell|gardena|ryobi|black\s*\+?\s*decker|worx|bosch|stiga|al-ko|mtd)\b/i.test(title) && !/\bstihl\b/i.test(title)) {
    return { ok: false, reason: 'NON_STIHL_PRODUCT_IN_TITLE' };
  }

  // Strict multipack guard (applies even to kits when explicitly N-pack >= 2, unless catalog name specifies pack)
  const catHasPack = /\b(?:pack of \d+|\d+[- ]?pack|zweiteilig|2-delig|2-pack)\b/i.test(pnLower);
  if (!catHasPack && /\b(?:set van\s*(?:[2-9]|\d{2})|pack van\s*(?:[2-9]|\d{2})|pack of\s*(?:[2-9]|\d{2})|pak van\s*(?:[2-9]|\d{2})|lot de\s*(?:[2-9]|\d{2})|zweiteiliges?\s*set|([2-9]|\d{2})\s*[- ]?(?:stuks|stks|stcs|stück|stueck|pcs|pieces|er[- ]pack|er[- ]set))\b/i.test(check.title || '')) {
    return { ok: false, reason: 'MULTIPACK_COUNT_EXPLICIT' };
  }
  if (!isKitPart && STRONG_MULTIPACK_RE.test(check.title || '')) {
    const m = (check.title || '').match(STRONG_MULTIPACK_RE);
    const tok = m ? m[0].toLowerCase() : '';
    const allowedPistonParts = /\bpiston\b/.test(pnLower) && /teiliges?\s*kolben-kit/i.test(title);
    if (m && !/^1\s*(?:x|pc|stuk|stück)/i.test(tok) && !allowedPistonParts) {
      return { ok: false, reason: `MULTIPACK_TITLE (${m[0]})` };
    }
  }
  if (!isKitPart && /\b([2-9]|10)\s*(?:x|pcs|pieces|stuks|stück|stcs|stk)\b/i.test(title)) {
    return { ok: false, reason: 'MULTIPACK_COUNT_IN_TITLE' };
  }

  // Service / Maintenance Kit branch: handled upfront so nested "(HD2 Air Filter, ...)"
  // components in catalog description do not falsely trigger single-filter guards.
  if (/\b(service\s*kit|maintenance\s*kit)\b/.test(pnLower)) {
    if (!/(service\s*kit|onderhoudsset|onderhoudskit|wartungskit|wartungsset|inspektionskit)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected service kit)' };
    }
    return { ok: true };
  }

  // Specialized compound catalog nouns handled before generic single-word checks:
  const isBoxOrFilterCover = /\b(air filter cover|carburett?or box cover|carburetor box cover)\b/.test(pnLower);
  const isSprocketCover = /\bchain sprocket cover\b/.test(pnLower);
  const isClutchSpring = /\bclutch spring\b/.test(pnLower);
  const isCrankshaftLock = /\bcrankshaft locking\b/.test(pnLower);
  const isLineSpool = /\bline spool\b/.test(pnLower);

  // 1. Covers & Caps
  if (isBoxOrFilterCover) {
    if (!/(deksel|kap|afdekking|behuizing|cover|gehäuse|haube|abdeckung|hood|shroud|deckel)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected filter/box cover)' };
    }
  } else if (isSprocketCover) {
    if (!/(cover|afdekking|deksel|abdeckung|deckel|kettingscherm|hoes|bezug)/i.test(title) || /\bmoer en schroef\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected sprocket cover)' };
    }
  } else if (/\bcap\b/.test(pnLower) && !/\bboot\b/.test(pnLower)) {
    if (!/(dop|deksel|cap|tankdeckel|deckel|kappe|verschluss|sluiting)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cap)' };
    }
  }

  if (/\bspark plug boot\b|\bplug boot\b/.test(pnLower)) {
    if (!/(bougiedop|zündkerzenstecker|kerzenstecker|spark plug boot|plug boot|stecker|cap|boot)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spark plug boot)' };
    }
  }

  // 2. Gaskets & Seals (support compound NL/DE nouns; strictly block multi-part kits)
  if (/\bgasket\b/.test(pnLower) && !/\bset|kit\b/.test(pnLower)) {
    const isCylinderGasket = /\bcylinder(?:\s+head)?\s+gasket\b/.test(pnLower);
    if (/\b(carburat|vergaser|piston|zuiger|kolben|aanzuigpomp|primer)\b/i.test(title) ||
        /(pakkingset|pakking\s*set|pakking\s*kit|dichtungs?satz|gasket\s*kit|dichtung\s*kit|pakkingen\b|dichtungen\b|\bset van \d+)/i.test(title) ||
        (isCylinderGasket && /(uitlaatpakking|auspuffdichtung)/i.test(title)) ||
        (!isCylinderGasket && /\b(cilinder|zylinder|cylinder)\b/i.test(title))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (single gasket vs kit)' };
    }
    if (!/(pakking|dichtung|afdichting|gasket|dichtungsdämpfer)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected gasket)' };
    }
  }

  // 3. Hardware (screw, nut, bolt, clip, circlip, washer, piston ring)
  if (/\bspindle\b/.test(pnLower) && !/(spindel|spindle|\bas\b|welle|drive shaft)/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spindle)' };
  }
  if (/\b(screw|nut|bolt|clip|circlip|e-clip|snap ring|washer|piston ring)\b/.test(pnLower) && !isKitPart) {
    const starterAllowed = /\bstarter\b/.test(pnLower) && /\bstarter[-\s]*(?:pawl|klammer|clip)\b/i.test(title) && !/\b(seilzugstarter|rewind starter|trekstarter|terugslagstarter|anwerf)\b/i.test(title);
    if (/\b(kit|set|satz|cilinder|zylinder|cylinder|carburateur|carburetor|vergaser|choke|tandwiel)\b/i.test(title) || (!starterAllowed && /\bstarter\b/i.test(title))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (hardware vs kit/assembly)' };
    }
  }

  // 4. Pistons, Rings, Pins, Crankshafts, Mufflers
  const catDiaMatch = pnLower.match(/\b(\d{2}(?:\.\d+)?)\s*(?:mm|x\d)/i);
  if (catDiaMatch && /\bpiston\b/.test(pnLower)) {
    const expectedDia = parseFloat(catDiaMatch[1]);
    const titleDiaMatches = [...title.matchAll(/\b(\d{2}(?:[.,]\d+)?)\s*mm\b/gi)];
    if (titleDiaMatches.length > 0 && !titleDiaMatches.some(m => Math.abs(parseFloat(m[1].replace(',', '.')) - expectedDia) < 0.15)) {
      return { ok: false, reason: `DIAMETER_MISMATCH (expected ${expectedDia}mm)` };
    }
  }
  if (/cylinder and piston|cylinder with piston/.test(pnLower)) {
    if (!/(cilinder|zylinder|cylinder)/i.test(title) || !/(zuiger|kolben|piston)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cylinder & piston)' };
    }
  } else if (/\bpiston ring\b/.test(pnLower)) {
    if (/\b(cilinder|zylinder|cylinder)\b/i.test(title) && !/(zuigerveer|zuigerring|kolbenring|piston ring|segmente)/i.test(title.slice(0, 50))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
    if (!/(zuigerveer|zuigerring|kolbenring|piston ring|segmente|zuiger ring|\bring\b)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
  } else if (/\bpiston pin\b/.test(pnLower)) {
    if (!/(pin|bolzen|kolbenbolzen|zuigerpen)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston pin)' };
    }
  } else if (/\bpiston\b/.test(pnLower)) {
    const isRingOnly = /(kolbenring|zuigerveer|zuigerring|piston ring)/i.test(title) && !/(\bzuiger|\bkolben|\bpiston|zuigerkit|kolbenkit|kolbensatz|kolbenreparatur|zuigerpen)/i.test(title.replace(/(kolbenring|zuigerveer|zuigerring|piston ring)\w*/gi, ''));
    if (isRingOnly || !/(zuiger|kolben|piston)/i.test(title) || /\b(vergaser|carburat|luchtfilterset|cilinder.*zuiger)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston)' };
    }
  }

  if (isCrankshaftLock) {
    if (!/(zuigerstopper|kolbenstopper|locking screw|blokkeer|piston stop|kurbelwellenarretier)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected crankshaft locking tool)' };
    }
  } else if (/\bcrankshaft\b/.test(pnLower)) {
    if (!/(krukas|kurbelwelle|crankshaft|crank)/i.test(title) || /(dichtungs?satz|pakkingset|afdichting|\bseal\b|\bpakking\b|\bdichtung\b|motorcilinderzuigerset|\bcylinder\b)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected crankshaft)' };
    }
  }

  if (/\bmuffler\b/.test(pnLower) && !/\bgasket\b/.test(pnLower)) {
    if (!/(uitlaat|uitlaatdemper|demper|auspuff|schalldämpfer|muffler|geluiddemper)/i.test(title) || /\b(afdichtingsset|pakkingbout|gasket.*kit|dichtung.*kit|bout.*schroefset)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected muffler)' };
    }
  }

  // 5. Carburetors & Diaphragms
  if (!isBoxOrFilterCover && /\bcarburett?or\b/.test(pnLower) && !/\b(parts|kit|set|reparatie|diaphragm|membraan|gasket)\b/.test(pnLower)) {
    if (!/(carburateur|carburator|carburetor|vergaser)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected carburetor)' };
    }
    if (/\b(reparatieset|repair kit|reparatursatz|membraan|diaphragm)\b/i.test(title) && !/\bwalbro|zama|tillotson|carburateur\b/i.test(title.slice(0, 35))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (repair kit instead of carburetor)' };
    }
  }
  if (/\bdiaphragm\b|\bcarburett?or parts\b|\bset of carburett?or\b/.test(pnLower)) {
    if (!/(membraan|membran|diaphragm|reparatie|reparatur|repair|reparatursatz|membransatz|kit|set|pakking|dichtung|parts|teile)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected diaphragm/repair kit)' };
    }
  }

  // 6. Filters
  if (!isBoxOrFilterCover && /\bair filter\b/.test(pnLower)) {
    if (!/(luchtfilter|luftfilter|air filter|filter|filtre|voorfilter|vorfilter)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected air filter)' };
    }
  }
  if (/\bfuel filter\b|\bpickup body\b/.test(pnLower)) {
    if (!/(brandstoffilter|benzinfilter|kraftstofffilter|fuel filter|zuigkop|saugkopf|filter)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected fuel filter)' };
    }
  }

  // 7. Springs (NL/DE compound suffixes `*veer`, `*veren`, `*feder`, `*federn`, `pawl clip/klammer` for Spring Starter Pawl Clip)
  if (/\bspring\b/.test(pnLower)) {
    const isPawlClipSpring = /\bpawl\s*clip\b/.test(pnLower);
    const hasSpringWord = /(veer|veren|feder|federn|spring)/i.test(title) ||
      (/(?:terugslag|terugspoelen).*lente\b/i.test(title)) ||
      (isPawlClipSpring && /(pawl[-\s]?clip|starter[-\s]?klammer|ersatz[-\s]?starter[-\s]?klammer)/i.test(title));
    if (!hasSpringWord) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spring)' };
    }
  }

  // 8. Starters, Ropes, Grips, Ignitions, Flywheels, Oil Pumps, Oil Seals, Valves
  if (/\brewind starter\b|\bfan housing\b/.test(pnLower)) {
    if (!/(starter|trekstarter|terugslagstarter|rücklaufstarter|anlasser|seilzugstarter|handstarter|terugspoelen|seilstarter|anwerf|recoil|fan housing|ventilatorhuis|ventilatorbehuizing|lüftergehäuse|kupplungsgehäuse)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected rewind starter)' };
    }
  }
  if (/\bstarter rope\b/.test(pnLower)) {
    if (!/(touw|koord|starterkoord|seil|startseil|starterseil|anwerfseil|rope|cord|griff)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected starter rope)' };
    }
  }
  if (/\bstarter grip\b|\belastostart\b/.test(pnLower)) {
    if (!/(greep|handgreep|griff|startergriff|elastostart|grip|handle)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected starter grip)' };
    }
  }
  if (/\bignition module\b|\bignition coil\b/.test(pnLower)) {
    if (!/(ontsteking|bobine|ignition|zündmodul|zündspule)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected ignition module)' };
    }
  }
  if (/\bflywheel\b/.test(pnLower) && !/(vliegwiel|schwungrad|flywheel|polrad)/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected flywheel)' };
  }
  if (/\boil pump\b/.test(pnLower) && !/(oliepomp|ölpumpe|oil pump)/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected oil pump)' };
  }
  if (/\boil seal\b|\bshaft seal\b|\bsimmerring\b/.test(pnLower)) {
    if (!/(oliekeerring|keerring|wellendichtring|simmerring|öldichtung|afdichtring|oil seal|seal)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected oil seal)' };
    }
  }
  if (/\bvalve\b/.test(pnLower)) {
    if (!/(klep|ventiel|ontluchter|dekompressie|ventil|valve|vent)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected valve)' };
    }
  }

  // 9. Clutch & Sprocket (skip bare clutch check on clutch spring!)
  if (!isClutchSpring) {
    if (/\bclutch drum\b/.test(pnLower) && !/(drum|trommel|glocke|kupplungstrommel)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch drum)' };
    } else if (/\bclutch\b/.test(pnLower) && !/\bdrum\b/.test(pnLower)) {
      if (!/(koppeling|kupplung|clutch)/i.test(title) || /(nadellagersatz|tandwiel|kupplungstrommel|koppelingstrommel|clutch\s*drum|\bdrum\b|\btrommel\b)/i.test(title)) {
        return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch)' };
      }
    }
  }

  if (!isSprocketCover && /\brim sprocket\b|\bchain sprocket\b/.test(pnLower)) {
    if (!/(tandwiel|kettingwiel|ringkettingwiel|ritzel|felgenritzel|kettenrad|zahnrad|sprocket|drum|trommel|kupplungstrommel|velg)/i.test(title) || /\b(ölpumpe|oliepomp|oil pump)\b/i.test(title.slice(0, 45))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected sprocket)' };
    }
    const pitchMatch = pnLower.match(/(3\/8|\.325|\.404|1\/4)/);
    if (pitchMatch) {
      const pTok = pitchMatch[1];
      if (pTok === '.325' && /\b3\/8\b/.test(title) && !/\.325|325/.test(title)) return { ok: false, reason: 'PITCH_MISMATCH (expected .325, saw 3/8)' };
      if (pTok === '3/8' && /\.325\b/.test(title) && !/3\/8/.test(title)) return { ok: false, reason: 'PITCH_MISMATCH (expected 3/8, saw .325)' };
      if (pTok === '.404' && !/\.404|404/.test(full)) return { ok: false, reason: 'PITCH_MISMATCH (expected .404)' };
    }
    const teethMatch = pnLower.match(/\b([678])\s*t\b/i);
    if (teethMatch) {
      const tVal = teethMatch[1];
      const titleTeeth = title.match(/\b([678])\s*(?:t|z|tanden|zähne|tooth|teeth)\b/i);
      if (titleTeeth && titleTeeth[1] !== tVal) {
        return { ok: false, reason: `TOOTH_MISMATCH (expected ${tVal}T, saw ${titleTeeth[1]}T)` };
      }
    }
  }

  // 10. Hoses, Guards/Deflectors, Mowing heads / Spools
  if (/\b(fuel hose|hose)\b/.test(pnLower) && !/\bhandlebar\b/.test(pnLower)) {
    if (/\b(carburateur|vergaser|carburetor)\b/i.test(title) && !/(slang|hose|schlauch)/i.test(title.slice(0, 40))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected hose, saw carburetor)' };
    }
  }
  if (/\bguard\b|\bdeflector\b/.test(pnLower) && !/(deflector|beschermkap|handbescherming|spanschutz|schutz|schutzhaube|spritzschirm|reflektor|guard|abweiser)/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected guard/deflector)' };
  }
  if (isLineSpool) {
    if (!/(spoel|spule|spool|maaidraad|mähfaden)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected line spool)' };
    }
  } else if (/\bmowing head\b|\bautocut\b|\bpolycut\b|\bdurocut\b/.test(pnLower) && !/(maaikop|mähkopf|fadenkopf|autocut|polycut|durocut|mowing head|trimmer head|head|maaidraad)/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected mowing head)' };
  }

  if (!isKitPart && /\bfuel\s*(?:&|and|en)\s*oil\s*cap|uitlaatpakking.*cilinder|cilinderkop.*uitlaatpakking\b/i.test(title)) {
    return { ok: false, reason: 'MULTI_COMPONENT_BUNDLE' };
  }

  return { ok: true };
}
