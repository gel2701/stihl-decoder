/**
 * Part Name Normalizer for STIHL Parts Catalog
 * Phase 54E / Phase 54E-R1 / Phase 96 — Technical Data Integrity & Dutch Terminology Localization
 *
 * Provides safe, deterministic normalization of part names into clean Dutch technical display names.
 * Priority:
 *   1. Approved explicit override (data/parts_name_overrides.json)
 *   2. Fail-closed on unresolved encoding (U+FFFD -> safe neutral fallback)
 *   3. HTML & deterministic character encoding normalization
 *   4. Safe technical core extraction (stripping vendor prefixes, availability tags, part number duplication, trailing retailer lists)
 *   5. Central Dutch technical glossary + deterministic structural composition (data/parts_glossary_nl.json)
 *   6. Clean canonical fallback
 *
 * Strict invariants:
 *   - RAW_PART_NAMES_CHANGED = 0 (raw remains intact in part_name_raw for full provenance)
 *   - GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS = 0 (never guess U+FFFD to Ø or any other arbitrary character)
 *   - NAME_NORMALIZATION_NON_IDEMPOTENT = 0 (normalize(normalize(raw)) === normalize(raw))
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from './PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const overridesPath = path.join(rootDir, 'data', 'parts_name_overrides.json');
const glossaryPath = path.join(rootDir, 'data', 'parts_glossary_nl.json');

let overridesMap = new Map();
function loadOverrides() {
  overridesMap = new Map();
  try {
    if (fs.existsSync(overridesPath)) {
      const doc = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
      if (Array.isArray(doc.overrides)) {
        for (const o of doc.overrides) {
          if (o.part_number && o.display_name_nl) {
            overridesMap.set(o.part_number, o.display_name_nl);
          }
        }
      }
    }
  } catch (e) {
    overridesMap = new Map();
  }
}

let phraseMap = new Map();
let canonicalTerms = [];
function loadGlossary() {
  phraseMap = new Map();
  canonicalTerms = [];
  try {
    if (fs.existsSync(glossaryPath)) {
      const doc = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
      if (Array.isArray(doc.canonical_terms)) {
        canonicalTerms = doc.canonical_terms;
      }
      if (doc.phrase_map && typeof doc.phrase_map === 'object') {
        for (const [k, v] of Object.entries(doc.phrase_map)) {
          if (k && v) {
            phraseMap.set(k.trim().toLowerCase(), v.trim());
          }
        }
      }
    }
  } catch (e) {
    phraseMap = new Map();
    canonicalTerms = [];
  }
}

loadOverrides();
loadGlossary();

const POSITION_QUALIFIERS_NL = new Map([
  ['left', 'links'],
  ['right', 'rechts'],
  ['upper', 'boven'],
  ['lower', 'onder'],
  ['outer', 'buiten'],
  ['inner', 'binnen'],
  ['front', 'voor'],
  ['rear', 'achter'],
  ['fan side', 'ventilatorzijde'],
  ['ignition side', 'ontstekingszijde'],
  ['clutch side', 'koppelingszijde']
]);

function normalizeSpecTail(spec = '') {
  let out = spec
    .replace(/\s+/g, ' ')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*Mm\b/g, '$1 mm')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*Cm\b/g, '$1 cm')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*[Μµu]f\b/gi, '$1 µF')
    .replace(/\bDin(\d)/gi, 'DIN $1')
    .replace(/\bDin\s+(\d)/gi, 'DIN $1')
    .replace(/\bIs-([A-Za-z0-9])/g, 'IS-$1')
    .trim();
  while (/(\d)X(\d)/.test(out)) {
    out = out.replace(/(\d)X(\d)/g, '$1x$2');
  }
  return out;
}

function lookupGlossary(text) {
  if (!text) return null;
  const lc = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return phraseMap.get(lc) || null;
}

function translateHeadAndModifiers(clean) {
  if (!clean) return clean;
  const lc = clean.toLowerCase();

  // 1. Direct glossary match
  const exact = phraseMap.get(lc);
  if (exact) return exact;

  // 2. "X / Y" dual slash component names (only pure word phrases, not fraction/imperial specs)
  if (/^[a-z\s\-()]+\s+\/\s+[a-z\s\-()]+$/i.test(clean)) {
    const parts = clean.split(' / ');
    if (parts.length === 2) {
      const t1 = lookupGlossary(parts[0]) || translateHeadAndModifiers(parts[0]);
      const t2 = lookupGlossary(parts[1]) || translateHeadAndModifiers(parts[1]);
      if (t1 !== parts[0] || t2 !== parts[1]) {
        return `${t1} / ${t2}`;
      }
    }
  }

  // 3. "<Head> with <Tail>" / "<Head> and <Tail>" (translate Tail recursively including specs)
  const withMatch = clean.match(/^(.+?)\s+(?:with|met)\s+(.+)$/i);
  if (withMatch) {
    const headTr = lookupGlossary(withMatch[1]);
    const tailTr = translateHeadAndModifiers(withMatch[2].trim());
    if (headTr || tailTr !== withMatch[2].trim()) {
      const h = headTr || withMatch[1].trim();
      const t = tailTr.charAt(0).toLowerCase() + tailTr.slice(1);
      return `${h} met ${t}`;
    }
  }

  const andMatch = clean.match(/^(.+?)\s+(?:and|en)\s+(.+)$/i);
  if (andMatch) {
    const headTr = lookupGlossary(andMatch[1]);
    const tailTr = translateHeadAndModifiers(andMatch[2].trim());
    if (headTr && tailTr !== andMatch[2].trim()) {
      return `${headTr} en ${tailTr.charAt(0).toLowerCase() + tailTr.slice(1)}`;
    }
  }

  // 4. "<Head>, <Qualifier>" or "<Head> <position qualifier>"
  const commaMatch = clean.match(/^(.+?),\s*([a-z\s\-]+)$/i);
  if (commaMatch) {
    const headTr = lookupGlossary(commaMatch[1]);
    const qLc = commaMatch[2].trim().toLowerCase();
    const qualTr = POSITION_QUALIFIERS_NL.get(qLc);
    if (headTr && qualTr) {
      return `${headTr} (${qualTr})`;
    }
  }

  const posTailMatch = clean.match(/^(.+?)\s+(left|right|upper|lower|outer|inner|front|rear)$/i);
  if (posTailMatch) {
    const headTr = lookupGlossary(posTailMatch[1]);
    const qualTr = POSITION_QUALIFIERS_NL.get(posTailMatch[2].toLowerCase());
    if (headTr && qualTr) {
      return `${headTr} (${qualTr})`;
    }
  }

  // 5. "<Head> DIN..." / "<Head> IS-..." / "<Head> <technical dimension/model/spec>"
  const specMatch = clean.match(
    /^(.+?)\s+((?:\(?DIN\s*\d|IS-[A-Z0-9]|Ø\s*\d|\d+(?:[.,\/x×]\d+)?\s*(?:mm|cm|m|v|w|a|kw|hz|µf|uf|t|dl|tg|z|"|')?|\d{3,4}\/\d+[a-z0-9\-]*|[A-Z]{1,4}\d+[A-Z0-9\-\/]*|M\d+(?:[.,x×]\d+)*|P\d+(?:[.,x×]\d+)*|d\d+).*)$/i
  );
  if (specMatch) {
    const headRaw = specMatch[1].trim();
    const specRaw = specMatch[2].trim();
    const headTr = lookupGlossary(headRaw) || translateHeadAndModifiers(headRaw);
    const normSpec = normalizeSpecTail(specRaw);
    if (headTr !== headRaw || normSpec !== specRaw) {
      return `${headTr} ${normSpec}`.trim();
    }
  }

  // 6. "<Head> kit" / "<Head> assembly" / "<Head> assy" / "Set of <Head>"
  const setOfMatch = clean.match(/^set\s+of\s+(.+?)(?:\s+(\d+.*))?$/i);
  if (setOfMatch) {
    const itemTr = lookupGlossary(setOfMatch[1]) || lookupGlossary(setOfMatch[1].replace(/s$/, ''));
    if (itemTr) {
      const tail = setOfMatch[2] ? ` ${normalizeSpecTail(setOfMatch[2])}` : '';
      return `Set ${itemTr.charAt(0).toLowerCase() + itemTr.slice(1)}${tail}`;
    }
  }

  const kitMatch = clean.match(/^(.+?)\s+kit(?:\s+(.*))?$/i);
  if (kitMatch) {
    const baseTr = lookupGlossary(kitMatch[1]);
    if (baseTr) {
      const suffix = kitMatch[2] ? ` ${normalizeSpecTail(kitMatch[2])}` : '';
      const combined = baseTr.toLowerCase().endsWith('set') ? baseTr : `${baseTr}set`;
      return `${combined}${suffix}`;
    }
  }

  const assyMatch = clean.match(/^(.+?)\s+(?:assembly|assy\.?)(?:\s+(.*))?$/i);
  if (assyMatch) {
    const baseTr = lookupGlossary(assyMatch[1]);
    if (baseTr) {
      const suffix = assyMatch[2] ? ` ${normalizeSpecTail(assyMatch[2])}` : '';
      return `${baseTr} (compleet)${suffix}`;
    }
  }

  // 7. Model-plate / pictogram / cover / warning prefixes followed by STIHL series code
  const seriesSuffixMatch = clean.match(/^(model plate|name plate|rating plate|warning pictogram)\s+([a-z0-9\-\/\s]+)$/i);
  if (seriesSuffixMatch) {
    const prefixTr = lookupGlossary(seriesSuffixMatch[1]);
    if (prefixTr) {
      return `${prefixTr} ${seriesSuffixMatch[2].trim().toUpperCase()}`;
    }
  }

  return clean;
}

export class PartNameNormalizer {
  /**
   * Reload overrides map and glossary from disk.
   */
  static reloadOverrides() {
    loadOverrides();
    loadGlossary();
  }

  /**
   * Exposes loaded canonical Dutch glossary entries for search alias builders and audits.
   */
  static getGlossaryTerms() {
    return canonicalTerms;
  }

  /**
   * Normalizes a raw part name into a safe, clean technical Dutch display name.
   *
   * @param {string} rawName - original harvested part name
   * @param {string} [partNumber] - canonical 11-digit part number for prefix stripping
   * @returns {string} clean display name
   */
  static normalizeDisplayName(rawName, partNumber = '') {
    return PartNameNormalizer.normalizePartName(rawName, partNumber);
  }

  /**
   * Evaluates deterministic quality status of a part name.
   *
   * @param {string} rawName - original harvested part name
   * @param {string} [partNumber] - canonical 11-digit part number
   * @returns {string} CLEAN | NORMALIZED_SAFE | EXPLICIT_OVERRIDE | ENCODING_UNRESOLVED | RETAILER_STYLE_UNRESOLVED | MISSING
   */
  static assessQuality(rawName, partNumber = '') {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return 'MISSING';
    }

    if (partNumber && overridesMap.has(partNumber)) {
      return 'EXPLICIT_OVERRIDE';
    }

    if (rawName.includes('\uFFFD')) {
      return 'ENCODING_UNRESOLVED';
    }

    if (/&#\d+;|&[a-z]+;|Ã¸|Âø|Ã¤|Âä|Ã¼|Âü|Ã¶|Âö/.test(rawName)) {
      return 'NORMALIZED_SAFE';
    }

    if (/\b(?:genuine|for stihl)\b/i.test(rawName) || /\b-\s*OEM\s*No/i.test(rawName)) {
      return 'NORMALIZED_SAFE';
    }

    const normalized = PartNameNormalizer.normalizePartName(rawName, partNumber);
    if (normalized !== rawName) {
      return 'NORMALIZED_SAFE';
    }

    return 'CLEAN';
  }

  /**
   * Normalizes a raw part name into a safe, clean technical display name.
   * Fails closed on unknown characters (U+FFFD).
   *
   * @param {string} rawName - original harvested part name
   * @param {string} [partNumber] - canonical 11-digit part number for prefix stripping
   * @returns {string} clean display name
   */
  static normalizePartName(rawName, partNumber = '') {
    if (!rawName || typeof rawName !== 'string') return '';

    // 1. Check approved explicit override
    if (partNumber && overridesMap.has(partNumber)) {
      return overridesMap.get(partNumber);
    }

    // 2. Fail closed on unresolved Unicode replacement character U+FFFD
    // Never guess U+FFFD as Ø or any other arbitrary character
    if (rawName.includes('\uFFFD')) {
      const formatted = PartNormalizer.formatPartNumber(partNumber);
      return formatted ? `Onderdeel ${formatted}` : 'STIHL onderdeel';
    }

    // 3. Normalize deterministic HTML entities, whitespace, and unambiguous mojibake sequences
    let clean = rawName
      .replace(/&#8203;/g, '')
      .replace(/&#8209;/g, '-')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/\t+/g, ' ')
      .replace(/Ã¸|Âø/g, 'ø')
      .replace(/Ã¤|Âä/g, 'ä')
      .replace(/Ã¼|Âü/g, 'ü')
      .replace(/Ã¶|Âö/g, 'ö')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 4. Strip vendor / availability / retailer prefix and duplicate part numbers iteratively
    let changed = true;
    while (changed) {
      const prev = clean;
      clean = clean.replace(/^(?:\(\s*NO LONGER AVAILABLE\s*\)|\[\s*NO LONGER AVAILABLE\s*\]|NO LONGER AVAILABLE)\s*/i, '');
      clean = clean.replace(/^(?:genuine\s+)?stihl\s+/i, '');
      clean = clean.replace(/^genuine\s+/i, '');
      clean = clean.replace(/^ST\s*(?=\d{4})/i, '');
      if (partNumber) {
        const formattedPart = PartNormalizer.formatPartNumber(partNumber);
        clean = clean.replace(new RegExp(`^${partNumber}\\s*`, 'i'), '');
        if (formattedPart) {
          clean = clean.replace(new RegExp(`^${formattedPart}\\s*`, 'i'), '');
        }
      }
      clean = clean.replace(/^\d{4}[\s\-]?\d{3}[\s\-]?\d{4}\s*/i, '');
      clean = clean.replace(/^\d{11}\s*/i, '');
      changed = (clean !== prev);
    }

    // 5. Strip trailing retailer / compatibility model lists and broken pack suffixes (iteratively for idempotence)
    let stripChanged = true;
    while (stripChanged) {
      const prev = clean;
      clean = clean.replace(/\s*\(\(\s*(?:For|Fits|Voor|Für)\b[^)]*\)\)\s*$/i, '');
      clean = clean.replace(/\s*\(\(\s*Qty\b.*$/i, '');
      clean = clean.replace(/\s+(?:for|fits)\s+(?:the\s+)?[A-Z0-9]{1,4}\s*\d*[a-z0-9\s\/\.,\-_]*$/i, '');
      clean = clean.replace(/\s+(?:Chainsaw|Brushcutter|Hedgetrimmer|Hedge Trimmer|Blower|Trimmer|Clearing Saw|Disc Cutter)\s+Parts\b.*$/i, '');
      clean = clean.replace(/\s+(?:(?:BG|BGE|BGA|BR|BT|FC|FR|FS|FSA|FSE|HL|HLA|HS|HSA|HSE|HT|KM|MM|MS|MSA|MSE|RM|RMA|SE|SG|SH|SHA|SP|SR|TS)\s*\d{2,3}[A-Z0-9\-\/]*|0\d{2}\s*\/\s*0\d{2})\b[\s,\/\-]+(?:[A-Z0-9,\s\/\-\.\|]*\bParts\b.*|(?:BG|BGE|BGA|BR|BT|FC|FR|FS|FSA|FSE|HL|HLA|HS|HSA|HSE|HT|KM|MM|MS|MSA|MSE|RM|RMA|SE|SG|SH|SHA|SP|SR|TS|0\d{2})\b.*)$/i, '');
      clean = clean.replace(/\s+(?:BG|BGE|BGA|BR|BT|FC|FR|FS|FSA|FSE|HL|HLA|HS|HSA|HSE|HT|KM|MM|MS|MSA|MSE|RM|RMA|SE|SG|SH|SHA|SP|SR|TS)\s*\d{2,3}[A-Z0-9\-]*\s*\/\s*(?:BG|BGE|BGA|BR|BT|FC|FR|FS|FSA|FSE|HL|HLA|HS|HSA|HSE|HT|KM|MM|MS|MSA|MSE|RM|RMA|SE|SG|SH|SHA|SP|SR|TS)\s*\d{2,3}[A-Z0-9\-]*$/i, '');
      clean = clean.replace(/\s+-\s*OEM\s*No\.?\s*[\d\s\-]+$/i, '');
      clean = clean.replace(/\s*\(\s*pack\s+of\s+\d+\s*\)/gi, '');
      clean = clean.replace(/\s*,\s*pack of \d+.*$/gi, '');
      clean = clean.replace(/\s+pack of \d+.*$/gi, '');
      clean = clean.replace(/\s*\|\s*Stihl\s*.*$/i, '');
      clean = clean.replace(/[\.\s\/]+$/, '').trim();
      stripChanged = (clean !== prev);
    }

    // 6. Central Dutch technical glossary + safe structural translation
    const translated = translateHeadAndModifiers(clean);
    return translated || clean || rawName;
  }
}
