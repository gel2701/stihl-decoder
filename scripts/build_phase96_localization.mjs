import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function writeJson(relPath, data) {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// 1. Audit and update part_name_normalized across parts_catalog.json (RAW part_name untouched!)
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const partsMap = new Map();

let rawUntouched = true;
let normUpdated = 0;
let nonIdempotent = 0;
let unresolvedEncoding = 0;
let dutchCount = 0;

for (const p of catalogDoc.parts) {
  const beforeRaw = p.part_name;
  const n1 = PartNameNormalizer.normalizeDisplayName(beforeRaw, p.part_number);
  const n2 = PartNameNormalizer.normalizeDisplayName(n1, p.part_number);
  if (n1 !== n2) nonIdempotent++;
  if (PartNameNormalizer.assessQuality(beforeRaw, p.part_number) === 'ENCODING_UNRESOLVED') {
    unresolvedEncoding++;
  } else if (n1 !== beforeRaw) {
    dutchCount++;
  }
  if (p.part_name_normalized !== n1) {
    p.part_name_normalized = n1;
    normUpdated++;
  }
  if (p.part_name !== beforeRaw) rawUntouched = false;
  partsMap.set(p.part_number, p);
}

writeJson('data/parts_catalog.json', catalogDoc);

// 2. Normalize clean_name in data/seo/part_indexation_*.json cohorts (keep pilot untouched if already Dutch, normalize all English/raw clean_name)
const seoFiles = [
  'data/seo/part_indexation_pilot.json',
  'data/seo/part_indexation_expansion_56a.json',
  'data/seo/part_indexation_wave2_56d.json',
  'data/seo/part_indexation_wave3_56g.json',
  'data/seo/part_indexation_wave4_56i.json'
];

const seoSummary = {};
for (const rel of seoFiles) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) continue;
  const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
  const list = Array.isArray(doc.parts) ? doc.parts : (Array.isArray(doc) ? doc : []);
  let updated = 0;
  for (const entry of list) {
    const rawPart = partsMap.get(entry.part_number);
    const sourceText = entry.clean_name || rawPart?.part_name || '';
    const nlName = PartNameNormalizer.normalizeDisplayName(sourceText, entry.part_number);
    if (nlName && nlName !== entry.clean_name && !PartNameNormalizer.assessQuality(sourceText, entry.part_number).includes('ENCODING_UNRESOLVED')) {
      entry.clean_name = nlName;
      updated++;
    } else if (rawPart && entry.clean_name === rawPart.part_name) {
      const fromRaw = PartNameNormalizer.normalizeDisplayName(rawPart.part_name, entry.part_number);
      if (fromRaw && fromRaw !== entry.clean_name) {
        entry.clean_name = fromRaw;
        updated++;
      }
    }
  }
  if (updated > 0) writeJson(rel, doc);
  seoSummary[rel] = { total: list.length, updated };
}

// 3. Test EN/DE/NL search parity across core terminology
const parityTriplets = [
  { label: 'Carburateur', nl: 'carburateur', en: 'carburetor', de: 'vergaser' },
  { label: 'Ontstekingsspoel', nl: 'ontstekingsspoel', en: 'ignition coil', de: 'zündspule' },
  { label: 'Trekstarter', nl: 'trekstarter', en: 'recoil starter', de: 'anwerfer' },
  { label: 'Koppelingstrommel', nl: 'koppelingstrommel', en: 'clutch drum', de: 'kupplungstrommel' },
  { label: 'Krukas', nl: 'krukas', en: 'crankshaft', de: 'kurbelwelle' },
  { label: 'Oliepomp', nl: 'oliepomp', en: 'oil pump', de: 'ölpumpe' },
  { label: 'Brandstoffilter', nl: 'brandstoffilter', en: 'fuel filter', de: 'kraftstofffilter' },
  { label: 'Zuigerset', nl: 'zuigerset', en: 'piston kit', de: 'kolbensatz' },
  { label: 'Luchtfilter', nl: 'luchtfilter', en: 'air filter', de: 'luftfilter' },
  { label: 'Vliegwiel', nl: 'vliegwiel', en: 'flywheel', de: 'polrad' },
  { label: 'Wormwiel', nl: 'wormwiel', en: 'worm gear', de: 'schnecke' },
  { label: 'Inlaatspruitstuk', nl: 'inlaatspruitstuk', en: 'intake manifold', de: 'ansaugstutzen' },
  { label: 'Bougie', nl: 'bougie', en: 'spark plug', de: 'zündkerze' },
  { label: 'Starterklink', nl: 'starterklink', en: 'starter pawl', de: 'sperrklinke' },
  { label: 'Kettingspanner', nl: 'kettingspanner', en: 'chain tensioner', de: 'kettenspanner' }
];

const parityResults = [];
for (const t of parityTriplets) {
  const rNl = PartCatalogResolver.searchParts(t.nl, 10).map(x => x.part_number);
  const rEn = PartCatalogResolver.searchParts(t.en, 10).map(x => x.part_number);
  const rDe = PartCatalogResolver.searchParts(t.de, 10).map(x => x.part_number);
  parityResults.push({
    label: t.label,
    nl_count: rNl.length,
    en_count: rEn.length,
    de_count: rDe.length,
    identical_nl_en: JSON.stringify(rNl) === JSON.stringify(rEn),
    identical_nl_de: JSON.stringify(rNl) === JSON.stringify(rDe)
  });
}

const report = {
  generated_at: new Date().toISOString(),
  catalog_total: catalogDoc.parts.length,
  raw_part_names_untouched: rawUntouched,
  part_name_normalized_updated: normUpdated,
  non_idempotent_count: nonIdempotent,
  dutch_normalized_count: dutchCount,
  unresolved_encoding_fail_closed: unresolvedEncoding,
  seo_cohorts: seoSummary,
  search_parity_sample: parityResults
};

writeJson('output/phase96/PHASE96_LOCALIZATION.json', report);
console.log(JSON.stringify(report, null, 2));
