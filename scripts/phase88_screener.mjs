/**
 * scripts/phase88_screener.mjs
 *
 * Strict technical-fit, brand, multipack, and component-type verifier for Phase 88.
 * Builds on Phase 87.3 safeguards and adds guards for ignition leads, spark plug boots,
 * valves, gaskets, seals, springs, diaphragms, sprockets, bars, chains, and mowing heads.
 */

export const BAD_BRAND_RE = /^(generic|generisch|unbranded|unbra|merkloos|unknown|markenlos|noname|no name|oem|replaces|universel|universal|stihl compatible|motorrad-styling|tuin|diy|brandless|sans marque|ohne marke)$/i;
export const AFTERMARKET_CLUE_RE = /\b(vervangt|vervanging|compatibel|compatible|passend\s+f[üu]r|geschikt\s+voor|ersatz|replaces|replacement|fits\s+for|fit\s+for|aftermarket|adaptable|anpassbar|für stihl)\b/i;

export const STRONG_MULTIPACK_RE = /\b(\d+\s*[- ]?(?:x|pcs|pieces|stuks|stks|stcs|stk|stück|stueck|pc|sets?|delig|delige|teiliges?|pack|er[- ]pack|er[- ]set)|1\/[2-9]\s*set|pack of\s*[2-9]|pack van\s*[2-9]|pak van\s*[2-9]|lot de\s*[2-9]|paar|pair|2-pack|3-pack|4-pack|5-pack|10-pack|dubbelpak|partij)\b/i;

export const OEM_EQUIVALENTS = new Set(['Oregon', 'NGK', 'Bosch', 'Walbro', 'Zama', 'Champion']);

const KNOWN_MULTIWORD_OR_CASE_BRANDS = [
  [/^ISE\b/i, 'ISE'],
  [/^Sägenspezi\b/i, 'Sägenspezi'],
  [/^Oregon\b/i, 'Oregon'],
  [/^NGK\b/i, 'NGK'],
  [/^Bosch\b/i, 'Bosch'],
  [/^Walbro\b/i, 'Walbro'],
  [/^Zama\b/i, 'Zama'],
  [/^Champion\b/i, 'Champion'],
  [/^vhbw\b/i, 'vhbw'],
  [/^C[·.]?T[·.]?S\b/i, 'C·T·S'],
  [/^Ratioparts\b/i, 'Ratioparts'],
  [/^ECSiNG\b/i, 'ECSiNG'],
  [/^perfektGarten\b/i, 'perfektGarten'],
  [/^Hippotech\b/i, 'Hippotech'],
  [/^MCHNIC\b/i, 'MCHNIC'],
  [/^Cancanle\b/i, 'Cancanle'],
  [/^Adefol\b/i, 'Adefol'],
  [/^QHALEN\b/i, 'QHALEN'],
  [/^HUYUR\b/i, 'HUYUR'],
  [/^ProPart\b/i, 'ProPart'],
  [/^Jardiaffaires\b/i, 'Jardiaffaires'],
  [/^Jardinvest\b/i, 'Jardinvest'],
  [/^Trade-Shop\b/i, 'Trade-Shop'],
  [/^Rotary\b/i, 'Rotary'],
  [/^OTOTEC\b/i, 'OTOTEC'],
  [/^YINETTECH\b/i, 'YINETTECH'],
  [/^Haishine\b/i, 'Haishine'],
  [/^Gubeter\b/i, 'Gubeter'],
  [/^GardenPal\b/i, 'GardenPal'],
  [/^Stens\b/i, 'Stens'],
  [/^YAMASCO\b/i, 'YAMASCO'],
  [/^QINYUN\b/i, 'QINYUN']
];

export function extractRawBrand(check) {
  const b = (check.byline || '').trim();
  if (/^(?:Merk|Brand|Marke):\s*/i.test(b)) return b.replace(/^(?:Merk|Brand|Marke):\s*/i, '').trim();
  const m = b.match(/^(?:De|The|Den)\s+(.+?)(?:-Store|\s+Store|\s+Shop)\b/i);
  if (m) return m[1].trim();
  const t = (check.title || '').trim();
  if (/^stihl\b/i.test(t) || /\boriginele stihl\b|\boriginal stihl\b/i.test(t)) return 'Stihl';
  for (const [re, name] of KNOWN_MULTIWORD_OR_CASE_BRANDS) {
    if (re.test(t)) return name;
  }
  return '';
}

export function resolveCleanBrand(check) {
  const raw = extractRawBrand(check);
  const byline = (check.byline || '').trim();
  const title = (check.title || '').trim();

  if (/^ISE\b/i.test(title) && /essie|caps ise/i.test(`${byline} ${raw}`)) return 'ISE';
  for (const [re, name] of KNOWN_MULTIWORD_OR_CASE_BRANDS) {
    if (re.test(title) || re.test(byline.replace(/^(?:Merk|Brand|Marke|De|The|Den)\s+/i, ''))) {
      return name;
    }
  }
  if (/^STIHL\b/i.test(byline) || /^STIHL Store/i.test(byline) || (/^Stihl\b/i.test(title) && !AFTERMARKET_CLUE_RE.test(title))) {
    return 'Stihl';
  }
  return raw;
}

export function classifyBrand(brand, check) {
  if (/^stihl$/i.test(brand)) {
    const by = (check.byline || '').trim();
    if (by && !/stihl/i.test(by)) return 'MANUFACTURER_AFTERMARKET';
    if (AFTERMARKET_CLUE_RE.test(check.title || '') && !/\boriginal|\borigineel|\boriginele|\bgenuine\b/i.test(check.title || '')) {
      return 'MANUFACTURER_AFTERMARKET';
    }
    return 'GENUINE_STIHL';
  }
  for (const eq of OEM_EQUIVALENTS) {
    if (eq.toLowerCase() === brand.toLowerCase()) return 'OEM_SUPPLIER_EQUIVALENT';
  }
  return 'MANUFACTURER_AFTERMARKET';
}

export function evaluateTechnicalFit(partNumber, partName, check, brand) {
  const pnLower = String(partName || '').toLowerCase();
  const title = (check.title || '').toLowerCase();
  const full = `${check.title || ''} ${(check.bullets || []).join(' ')} ${check.description || ''}`.toLowerCase();
  const isKitPart = /\b(kit|set|pack|pair|satz)\b/i.test(pnLower);

  if (!brand || BAD_BRAND_RE.test(brand) || /\b(husqvarna|motorrad-styling|auto-zubehör)\b/i.test(`${brand} ${title.slice(0, 35)}`)) {
    return { ok: false, reason: 'INVALID_OR_NOISY_BRAND' };
  }

  // Exact 11-digit number anywhere in page text (title/bullets/description)
  const fullDigits = full.replace(/[^0-9]/g, '');
  if (!fullDigits.includes(partNumber)) {
    return { ok: false, reason: 'EXACT_PART_NUMBER_ABSENT' };
  }

  // Multipack guard
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

  // Product-type alignment guards
  if (/\bcap\b/.test(pnLower) && !/\bboot\b/.test(pnLower)) {
    if (!/\b(dop|deksel|cap|tankdeckel|verschluss|schraubverschluss|ölverschluss|kraftstoffverschluss)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cap)' };
    }
  }
  if (/\bspark plug boot\b|\bplug boot\b/.test(pnLower)) {
    if (!/\b(bougiedop|zündkerzenstecker|kerzenstecker|spark plug boot|plug boot|stecker|cap|boot)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spark plug boot)' };
    }
  }
  if (/\bgasket\b/.test(pnLower) && !/\bset|kit\b/.test(pnLower)) {
    if (/\b(cilinder|zylinder|cylinder|carburat|vergaser|piston|zuiger|kolben|aanzuigpomp|primer|oliekeerring|afdichtring|montageblöcke|pakking.*set|pakking.*kit)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (single gasket vs kit)' };
    }
    if (!/\b(pakking|dichtung|gasket|dichtungsdämpfer|uitlaatpakking|cilinderpakking)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected gasket)' };
    }
  }
  if (/\bspindle\b/.test(pnLower) && !/\b(spindel|spindle|as|welle|drive shaft)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spindle)' };
  }
  if (/\b(screw|nut|bolt|clip|circlip|e-clip|snap ring|washer|piston ring)\b/.test(pnLower) && !isKitPart) {
    if (/\b(kit|set|cilinder|zylinder|cylinder|carburateur|carburetor|vergaser|starter|choke|tandwiel)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (hardware vs kit/assembly)' };
    }
  }
  if (/cylinder and piston|cylinder with piston/.test(pnLower)) {
    if (!/(cilinder|zylinder|cylinder)/i.test(title) || !/(zuiger|kolben|piston)/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected cylinder & piston)' };
    }
  } else if (/\bpiston ring\b/.test(pnLower)) {
    if (/\b(cilinder|zylinder|cylinder)\b/i.test(title) && !/\b(zuigerveer|zuigerring|kolbenring|piston ring|segmente)\b/i.test(title.slice(0, 50))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
    if (!/\b(zuigerveer|zuigerring|kolbenring|piston ring|segmente|zuiger ring|ring)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston ring)' };
    }
  } else if (/\bpiston pin\b/.test(pnLower)) {
    if (!/\b(pin|bolzen|kolbenbolzen|zuigerpen)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston pin)' };
    }
  } else if (/\bpiston\b/.test(pnLower)) {
    if (!/\b(zuiger|kolben|piston)\b/i.test(title) || /\b(vergaser|carburat|luchtfilterset|cilinder.*zuiger)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected piston)' };
    }
  }
  if (/\bcrankshaft\b/.test(pnLower)) {
    if (!/\b(krukas|kurbelwelle|crankshaft|crank)\b/i.test(title) || /\b(motorcilinderzuigerset|cylinder)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected crankshaft)' };
    }
  }
  if (/\bmuffler\b/.test(pnLower) && !/\bgasket\b/.test(pnLower)) {
    if (!/\b(uitlaat|uitlaatdemper|demper|auspuff|schalldämpfer|muffler|geluiddemper)\b/i.test(title) || /\b(afdichtingsset|pakkingbout|gasket.*kit|dichtung.*kit|bout.*schroefset)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected muffler)' };
    }
  }
  if (/\bcarburett?or\b/.test(pnLower) && !/\b(parts|kit|set|reparatie|diaphragm|membraan|gasket)\b/.test(pnLower)) {
    if (!/\b(carburateur|carburator|carburetor|vergaser)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected carburetor)' };
    }
    if (/\b(reparatieset|repair kit|reparatursatz|membraan|diaphragm)\b/i.test(title) && !/\bwalbro|zama|tillotson|carburateur\b/i.test(title.slice(0, 35))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (repair kit instead of carburetor)' };
    }
  }
  if (/\bdiaphragm\b|\bcarburett?or parts\b|\bset of carburett?or\b/.test(pnLower)) {
    if (!/\b(membraan|membran|diaphragm|reparatie|reparatur|repair|kit|set|pakking|dichtung|parts|teile)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected diaphragm/repair kit)' };
    }
  }
  if (/\b(air filter cover|carburett?or box cover)\b/.test(pnLower)) {
    if (!/\b(deksel|kap|afdekking|behuizing|cover|gehäuse|haube|abdeckung|hood|shroud|vergaserkastendeckel)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected filter/box cover)' };
    }
  } else if (/\bchain sprocket cover\b/.test(pnLower)) {
    if (!/\b(cover|afdekking|deksel|kettingafdekking|kettingwieldeksel|kettingscherm|deflektor|kupplungsabdeckung|deckel|bezug|hoes)\b/i.test(title) || /\bmoer en schroef\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected sprocket cover)' };
    }
  } else if (/\bair filter\b/.test(pnLower)) {
    if (!/\b(luchtfilter|luftfilter|air filter|filter|filtre|voorfilter)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected air filter)' };
    }
  }
  if (/\bfuel filter\b|\bpickup body\b/.test(pnLower)) {
    if (!/\b(brandstoffilter|benzinfilter|kraftstofffilter|fuel filter|zuigkop|saugkopf|filter)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected fuel filter)' };
    }
  }
  if (/\bspring\b/.test(pnLower)) {
    if (!/\b(veer|terugtrekveer|starterveer|torsieveer|feder|rückzugfeder|starterfeder|spring)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected spring)' };
    }
  }
  if (/\brewind starter\b|\bfan housing\b/.test(pnLower)) {
    if (!/\b(starter|trekstarter|terugslagstarter|terugspoelen|seilstarter|anwerf|recoil|fan housing|ventilatorhuis)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected rewind starter)' };
    }
  }
  if (/\bstarter rope\b/.test(pnLower)) {
    if (!/\b(touw|koord|starterkoord|seil|starterseil|anwerfseil|rope|cord|griff)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected starter rope)' };
    }
  }
  if (/\bstarter grip\b|\belastostart\b/.test(pnLower)) {
    if (!/\b(greep|handgreep|griff|startergriff|elastostart|grip|handle)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected starter grip)' };
    }
  }
  if (/\bignition module\b|\bignition coil\b/.test(pnLower)) {
    if (!/\b(ontsteking|bobine|ignition|zündmodul|zündspule)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected ignition module)' };
    }
  }
  if (/\bflywheel\b/.test(pnLower) && !/\b(vliegwiel|schwungrad|flywheel|polrad)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected flywheel)' };
  }
  if (/\boil pump\b/.test(pnLower) && !/\b(oliepomp|ölpumpe|oil pump)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected oil pump)' };
  }
  if (/\boil seal\b|\bshaft seal\b|\bsimmerring\b/.test(pnLower)) {
    if (!/\b(oliekeerring|keerring|wellendichtring|simmerring|afdichtring|oil seal|seal)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected oil seal)' };
    }
  }
  if (/\bvalve\b/.test(pnLower)) {
    if (!/\b(klep|ventiel|ontluchter|dekompressie|ventil|dekompressionsventil|valve|vent)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected valve)' };
    }
  }
  if (/\bclutch drum\b/.test(pnLower) && !/\b(drum|trommel|glocke|kupplungstrommel)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch drum)' };
  } else if (/\bclutch\b/.test(pnLower) && !/\bdrum\b/.test(pnLower)) {
    if (!/\b(koppeling|kupplung|clutch)\b/i.test(title) || /\b(nadellagersatz|tandwiel|drum|trommel)\b/i.test(title)) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected clutch)' };
    }
  }
  if (/\brim sprocket\b|\bchain sprocket\b/.test(pnLower)) {
    if (!/\b(tandwiel|kettingwiel|ritzel|kettenrad|ringkettenrad|sprocket|drum|trommel|kupplungstrommel|velg)\b/i.test(title) || /\bölpumpe|oliepomp|oil pump\b/i.test(title.slice(0, 45))) {
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
  if (/\b(fuel hose|hose)\b/.test(pnLower) && !/\bhandlebar\b/.test(pnLower)) {
    if (/\b(carburateur|vergaser|carburetor)\b/i.test(title) && !/\bslang|hose|schlauch\b/i.test(title.slice(0, 40))) {
      return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected hose, saw carburetor)' };
    }
  }
  if (/\bguard\b|\bdeflector\b/.test(pnLower) && !/\b(deflector|beschermkap|schutz|guard|abweiser)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected guard/deflector)' };
  }
  if (/\bmowing head\b|\bautocut\b|\bpolycut\b|\bdurocut\b/.test(pnLower) && !/\b(maaikop|mähkopf|fadenkopf|autocut|polycut|durocut|mowing head|trimmer head|head)\b/i.test(title)) {
    return { ok: false, reason: 'COMPONENT_TYPE_MISMATCH (expected mowing head)' };
  }

  // Multi-variant OEM guard: reject titles listing "Fuel & Oil Cap Kit" or "cilinder + uitlaatpakking" bundles for single SKU
  if (!isKitPart && /\bfuel\s*(?:&|and|en)\s*oil\s*cap|uitlaatpakking.*cilinder|cilinderkop.*uitlaatpakking\b/i.test(title)) {
    return { ok: false, reason: 'MULTI_COMPONENT_BUNDLE' };
  }

  return { ok: true };
}
