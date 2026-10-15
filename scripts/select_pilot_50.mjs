import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartIndexReadinessClassifier } from '../src/seo/PartIndexReadinessClassifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });

const query = `
  SELECT
    p.part_number,
    p.part_name,
    p.part_number_display,
    COUNT(f.fitment_id) as fitment_count,
    COUNT(DISTINCT f.canonical_model_id) as model_count,
    COUNT(DISTINCT f.section_name) as section_count,
    MAX(CASE WHEN f.diagram_position IS NOT NULL AND f.diagram_position != '' THEN 1 ELSE 0 END) as has_pos,
    MAX(CASE WHEN f.configuration_key IS NOT NULL AND f.configuration_key != '' THEN 1 ELSE 0 END) as has_config
  FROM parts p
  JOIN model_part_fitments f ON p.part_number = f.part_number
  GROUP BY p.part_number
`;

const rawParts = db.prepare(query).all();
db.close();
console.log('Total raw parts from SQLite:', rawParts.length);

const COMPONENT_RULES = [
  {
    name: 'Carburateur',
    pattern: /\bcarburetor\b/i,
    exclude: /gasket|kit|diaphragm|needle|screw|cover|body|jet|spring|lever|shaft/i
  },
  {
    name: 'Koppeling',
    pattern: /\bclutch\b/i,
    exclude: /spring|shoe|drum|carrier|washer|cover|kit|plate|retaining|screw/i
  },
  {
    name: 'Oliepomp',
    pattern: /\boil\s+pump\b/i,
    exclude: /piston|worm|gear|hose|gasket|screw|line|spring/i
  },
  {
    name: 'Kettingwieldeksel',
    pattern: /\bchain\s+sprocket\s+cover\b/i,
    exclude: /washer|nut|screw|strip|plate/i
  },
  {
    name: 'Kettingwiel',
    pattern: /\b(rim\s+sprocket|spur\s+sprocket|chain\s+sprocket)\b/i,
    exclude: /cover|washer|bearing|kit|screw|clip|ring/i
  },
  {
    name: 'Handstarter',
    pattern: /\b(rewind\s+starter|recoil\s+starter)\b/i,
    exclude: /spring|rope|cord|grip|cup|pawl|rotor|handle|pulley/i
  },
  {
    name: 'Startkoord',
    pattern: /\b(starter\s+rope|starter\s+cord)\b/i,
    exclude: /guide|rotor|spring|grip|handle|cup/i
  },
  {
    name: 'Luchtfilter',
    pattern: /\bair\s+filter\b/i,
    exclude: /cover|housing|base|prefilter|screw|flange|gasket/i
  },
  {
    name: 'Brandstoffilter',
    pattern: /\b(fuel\s+filter|pickup\s+body)\b/i,
    exclude: /hose|line|tank|cap|vent/i
  },
  {
    name: 'Cilinder met zuiger',
    pattern: /\bcylinder\s+with\s+piston\b/i,
    exclude: /gasket|pin|ring|bearing|screw/i
  },
  {
    name: 'Bougie',
    pattern: /\bspark\s+plug\b/i,
    exclude: /boot|terminal|wrench|cover/i
  },
  {
    name: 'Ontstekingsmodule',
    pattern: /\b(ignition\s+module|ignition\s+coil)\b/i,
    exclude: /cable|wire|lead|boot|screw/i
  },
  {
    name: 'Carter',
    pattern: /\bcrankcase\b/i,
    exclude: /sleeve|gasket|bearing|bushing|washer|screw|seal|hose/i
  },
  {
    name: 'Maaikop',
    pattern: /\b(mowing\s+head|trimmer\s+head|autocut)\b/i,
    exclude: /spring|line|eyelet|cover|spool|nut/i
  },
  {
    name: 'Brandstoftank',
    pattern: /\b(fuel\s+tank|tank\s+housing)\b/i,
    exclude: /cap|vent|hose|filter|line|screw/i
  }
];

function normalizePartName(rawName) {
  if (!rawName) return null;
  if (/[\uFFFD]/.test(rawName)) return null;
  if (/pack of|set of \d+|oem no|sale|buy now|for sale|sleeve|gasket|washer|screw|bolt|nut|ring|pin|boot/i.test(rawName)) return null;

  for (const rule of COMPONENT_RULES) {
    if (rule.pattern.test(rawName) && !rule.exclude.test(rawName)) {
      return rule.name;
    }
  }
  return null;
}

function getPrimaryEquipmentCategory(models) {
  const norm = models.map(m => (m.model_name || m.slug || '').toLowerCase().replace(/^stihl\s+/, '').replace(/-/g, '_'));

  if (norm.some(m => m.startsWith('ts_') || m.startsWith('tsa_') || m.startsWith('ts '))) return 'doorslijpers';
  if (norm.some(m => m.startsWith('hs_') || m.startsWith('hse_') || m.startsWith('hsa_') || m.startsWith('hl_') || m.startsWith('hs '))) return 'heggenscharen';
  if (norm.some(m => m.startsWith('bg_') || m.startsWith('br_') || m.startsWith('bge_') || m.startsWith('bga_') || m.startsWith('sh_') || m.startsWith('bg ') || m.startsWith('br '))) return 'bladblazers';
  if (norm.some(m => m.startsWith('fs_') || m.startsWith('fr_') || m.startsWith('fse_') || m.startsWith('fsa_') || m.startsWith('bt_') || m.startsWith('fc_') || m.startsWith('fs '))) return 'bosmaaiers';
  if (norm.some(m => m.startsWith('ms_') || m.startsWith('msa_') || /^\d{3}$/.test(m) || m.startsWith('ms '))) return 'kettingzagen';

  return 'overige';
}

const categorized = {
  kettingzagen: [],
  bosmaaiers: [],
  heggenscharen: [],
  doorslijpers: [],
  bladblazers: []
};

for (const raw of rawParts) {
  const evalResult = PartIndexReadinessClassifier.evaluatePart(raw);
  if (evalResult.tier !== 'STRONG_CANDIDATE') continue;

  const clean = normalizePartName(raw.part_name);
  if (!clean) continue;

  const res = PartCatalogResolver.resolvePartNumber(raw.part_number);
  if (!res || !res.compatible_models || res.compatible_models.length === 0) continue;

  const cat = getPrimaryEquipmentCategory(res.compatible_models);
  if (!categorized[cat]) continue;

  categorized[cat].push({
    part_number: raw.part_number,
    part_number_display: raw.part_number_display || raw.part_number,
    raw_name: raw.part_name,
    clean_name: clean,
    category: cat,
    model_count: raw.model_count,
    fitment_count: raw.fitment_count,
    section_count: raw.section_count,
    score: evalResult.score,
    sample_models: res.compatible_models.slice(0, 3).map(m => m.model_name)
  });
}

console.log('Available strong candidates by category:');
for (const [cat, list] of Object.entries(categorized)) {
  list.sort((a, b) => b.score - a.score || b.fitment_count - a.fitment_count);
  console.log(`  ${cat}: ${list.length}`);
}

// Select balanced 50:
// 20 chainsaws
// 12 brushcutters
// 6 hedge trimmers
// 6 cut-off saws
// 6 blowers
const selected = [
  ...categorized.kettingzagen.slice(0, 20),
  ...categorized.bosmaaiers.slice(0, 12),
  ...categorized.heggenscharen.slice(0, 6),
  ...categorized.doorslijpers.slice(0, 6),
  ...categorized.bladblazers.slice(0, 6)
];

console.log('\nTotal selected:', selected.length);
const seenNumbers = new Set();
for (const s of selected) {
  if (seenNumbers.has(s.part_number)) {
    console.error('DUPLICATE:', s.part_number);
  }
  seenNumbers.add(s.part_number);
}
console.log('Unique parts:', seenNumbers.size);

const outputPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
const pilotJson = {
  schema_version: '1.0.0',
  phase: '54D',
  policy: 'EXPLICIT_ALLOWLIST_ONLY',
  pilot_size: selected.length,
  parts: selected.map(p => ({
    part_number: p.part_number,
    part_number_display: p.part_number_display,
    clean_name: p.clean_name,
    category: p.category,
    enabled: true,
    model_count: p.model_count,
    fitment_count: p.fitment_count,
    sample_models: p.sample_models,
    reason: `Canonical fitments across ${p.model_count} models including ${p.sample_models.join(', ')}`
  }))
};

fs.writeFileSync(outputPath, JSON.stringify(pilotJson, null, 2));
console.log(`Wrote ${outputPath} successfully.`);
