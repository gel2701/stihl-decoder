import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';

const ROOT = process.cwd();
const AGENT_ROOT = path.resolve(ROOT, '..');
const OUT_DIR = path.join(ROOT, 'output', 'phase91');
fs.mkdirSync(OUT_DIR, { recursive: true });

const dbJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stihl_database.json'), 'utf8'));

const MACHINE_PREFIXES = new Set([
  'MS', 'MSA', 'MSE', 'E', 'GS',
  'FS', 'FSA', 'FSE', 'FR', 'FC', 'FCA', 'KM', 'KMA', 'MM', 'HL', 'HLA', 'HLE', 'HT', 'HTA', 'HTE', 'SP', 'BT',
  'BG', 'BGA', 'BGE', 'BR', 'SH', 'SHA', 'SHE',
  'HS', 'HSA', 'HSE',
  'TS', 'TSA',
  'SR', 'SG', 'SGA',
  'GTA', 'SEA', 'SE', 'RE', 'REA', 'RG', 'RGA', 'RM', 'RMA', 'RME', 'RL', 'RLA', 'RLE', 'RT', 'GH', 'GHE', 'WP', 'KGA', 'KG', 'PC', 'CONTRA'
]);

const SUFFIX_TOKEN_RE = /^(?:C|B|E|BE|BQ|BEQ|EM|M|BM|MQ|EQ|Q|R|RX|RZ|T|TC|VW|W|Z|D|K|L|S|N|I|IEM|AV|AVE|AVEQ|AVQ|MAGNUM|SUPER|PRO|ARCTIC|WOOD|FARM|BOSS|QS|KT|KW|SZ|V|X)$/;

// Known genuine legacy 3-digit STIHL saws + series codes from official catalogs/manuals
const KNOWN_SERIES_CODES = {
  '009': '1120', '010': '1120', '011': '1120', '012': '1120',
  '015': '1116',
  '017': '1130', '018': '1130', 'MS 170': '1130', 'MS 180': '1130', 'MS 171': '1139', 'MS 181': '1139', 'MS 211': '1139',
  '019': '1132', '020': '1129', 'MS 200': '1129',
  '021': '1123', '023': '1123', '025': '1123', 'MS 210': '1123', 'MS 230': '1123', 'MS 250': '1123',
  '024': '1121', '026': '1121', 'MS 240': '1121', 'MS 260': '1121',
  '028': '1118',
  '029': '1127', '039': '1127', 'MS 290': '1127', 'MS 310': '1127', 'MS 390': '1127',
  '030': '1113', '031': '1113', '032': '1113',
  '034': '1125', '036': '1125', 'MS 360': '1125',
  '038': '1119',
  '040': '1110', '041': '1110',
  '042': '1117', '048': '1117',
  '044': '1128', '046': '1128', 'MS 440': '1128', 'MS 460': '1128', 'MS 461': '1128',
  '045': '1115', '056': '1115',
  '050': '1111', '051': '1111', '075': '1111', '076': '1111',
  '064': '1122', '066': '1122', 'MS 640': '1122', 'MS 650': '1122', 'MS 660': '1122',
  '070': '1106', '090': '1106', 'CONTRA': '1106',
  '084': '1124', '088': '1124', 'MS 880': '1124',
  'TS 350': '4201', 'TS 360': '4201',
  'TS 400': '4223',
  'TS 410': '4238', 'TS 420': '4238',
  'TS 460': '4221',
  'TS 510': '1111', 'TS 760': '1111',
  'TS 700': '4224', 'TS 800': '4224',
  'BR 320': '4203', 'BR 340': '4203', 'BR 400': '4203', 'BR 420': '4203',
  'SR 320': '4203', 'SR 340': '4203', 'SR 400': '4203', 'SR 420': '4203',
  'BR 500': '4282', 'BR 550': '4282', 'BR 600': '4282', 'BR 700': '4282',
  'HS 45': '4228', 'HS 81': '4237', 'HS 82': '4237', 'HS 86': '4237', 'HS 87': '4237',
  'FS 120': '4134', 'FS 200': '4134', 'FS 250': '4134', 'FS 300': '4134', 'FS 350': '4134', 'FS 400': '4128', 'FS 450': '4128', 'FS 480': '4128',
  'FS 36': '4130', 'FS 40': '4144', 'FS 50': '4144', 'FS 56': '4144', 'FS 70': '4144',
  'FS 75': '4137', 'FS 80': '4137', 'FS 85': '4137', 'HL 75': '4137', 'HT 70': '4137', 'HT 75': '4137', 'FC 75': '4137', 'FC 85': '4137', 'KM 85': '4137',
  'FS 87': '4180', 'FS 90': '4180', 'FS 100': '4180', 'FS 110': '4180', 'FS 130': '4180', 'HT 101': '4180', 'HT 131': '4180', 'KM 90': '4180', 'KM 100': '4180', 'KM 110': '4180', 'KM 130': '4180',
  'FS 91': '4180', 'FS 94': '4149', 'FS 111': '4180', 'FS 131': '4180', 'FS 240': '4147', 'FS 360': '4147', 'FS 410': '4147', 'FS 460': '4147', 'FS 490': '4148', 'FS 510': '4148', 'FS 560': '4148'
};

const VALID_LEGACY_3DIGIT = new Set([
  '009', '010', '011', '012', '015', '017', '018', '019', '020', '021', '023', '024', '025', '026', '028', '029',
  '030', '031', '032', '034', '036', '038', '039', '040', '041', '042', '044', '045', '046', '048',
  '050', '051', '056', '064', '066', '070', '075', '076', '084', '088', '090'
]);

function parseStihlMachineName(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let raw = rawInput
    .replace(/\u00a0/g, ' ')
    .replace(/^(?:GENUINE\s+)?STIHL\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^\d{4}\s*\d{3}/.test(raw)) return null;
  if (/^(?:AP|AK|AL|AR)\s*\d+/i.test(raw)) return null;
  if (/\b(?:MANUAL|PARTS LIST|DIAGRAM|CONTAINER|STRAP|SCABBARD|OIL|GREASE|HELMET|GLASSES|GLOVES|BLADE ONLY|SPARK PLUG|KNOCKOFF|CAP ASSIST|INTERVIEW)\b/i.test(raw)) return null;

  const leg = raw.match(/^(0\d{2})(?:\s*[- ]\s*|\s*)([A-Z0-9 -]{1,14})?$/i);
  if (leg) {
    const num = leg[1];
    if (!VALID_LEGACY_3DIGIT.has(num)) return null;
    let suf = (leg[2] || '').toUpperCase().trim().replace(/\s+/g, ' ');
    if (suf) {
      const tokens = suf.split(/[\s-]+/).filter(Boolean);
      if (!tokens.every(t => SUFFIX_TOKEN_RE.test(t))) suf = '';
    }
    const baseModel = num;
    return { baseModel, variant: suf || '', full: suf ? `${baseModel} ${suf}` : baseModel, isLegacy: true };
  }

  if (/^CONTRA(?:\s+(?:S|GS|AV|SUPER))?$/i.test(raw)) {
    const m = raw.toUpperCase();
    return { baseModel: 'CONTRA', variant: m === 'CONTRA' ? '' : m.replace('CONTRA ', ''), full: m, isLegacy: true };
  }

  const mod = raw.match(/^([A-Z]{1,4})[\s\-]?(\d{2,4})(I)?(?:\s*[-\s]?\s*([A-Z0-9\- ]{1,14}))?$/i);
  if (mod) {
    const prefix = mod[1].toUpperCase();
    if (!MACHINE_PREFIXES.has(prefix)) return null;
    const num = parseInt(mod[2], 10);
    if (mod[2].length === 4 && num > 1000) {
      if (!['RM', 'RMA', 'RME', 'RE', 'REA', 'SE', 'SEA', 'RL', 'FS'].includes(prefix)) return null;
      if (prefix === 'FS' && num === 3900) return null; // unconfirmed variant typo
    }
    if (num === 0 || (num < 10 && !['RG', 'RE', 'SE'].includes(prefix))) return null;
    if (prefix === 'E' && ![10, 14, 15, 20, 30, 140, 160, 180, 200, 220].includes(num)) return null;

    const inj = mod[3] ? 'i' : '';
    const baseModel = `${prefix} ${mod[2]}${inj}`;
    let suf = (mod[4] || '').toUpperCase().trim().replace(/\s+/g, '-').replace(/^-|-$/g, '');
    if (suf) {
      const tokens = suf.split('-').filter(Boolean);
      if (!tokens.every(t => SUFFIX_TOKEN_RE.test(t))) return null;
      suf = suf
        .replace(/^C-B-E-Q$/, 'C-BEQ')
        .replace(/^C-B-E$/, 'C-BE')
        .replace(/^C-E-M$/, 'C-EM')
        .replace(/^T-C-M$/, 'TC-M');
    }
    return { baseModel, variant: suf || '', full: suf ? `${baseModel} ${suf}` : baseModel, isLegacy: false };
  }
  return null;
}

function classifyModel(baseModel) {
  const up = baseModel.toUpperCase();
  if (/^0\d{2}$/.test(up) || up === 'CONTRA') {
    return { category_slug: 'kettingzagen', category: 'Kettingzaag', equipment_type: 'CHAINSAW', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)' };
  }
  if (/^MSA\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Accu-kettingzaag', equipment_type: 'CHAINSAW', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^HTA\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Accu-hoogsnoeier', equipment_type: 'POLE_PRUNER', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^GTA\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Accu-snoeizaag', equipment_type: 'CHAINSAW', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^(?:MSE|E)\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Elektrische kettingzaag', equipment_type: 'CHAINSAW', fuel_type: 'ELECTRIC', fuel_type_label: 'Elektrische aandrijving (230V)' };
  if (/^MS\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Kettingzaag', equipment_type: 'CHAINSAW', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)' };
  if (/^HT\b/.test(up)) return { category_slug: 'kettingzagen', category: 'Hoogsnoeier', equipment_type: 'POLE_PRUNER', fuel_type: 'PETROL', fuel_type_label: 'Benzine-aandrijving' };
  if (/^GS\b/.test(up)) return { category_slug: 'doorslijpers', category: 'Betonzaag', equipment_type: 'CUTOFF_SAW', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)' };
  if (/^TSA\b/.test(up)) return { category_slug: 'doorslijpers', category: 'Accu-doorslijper', equipment_type: 'CUTOFF_SAW', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^TS\b/.test(up)) return { category_slug: 'doorslijpers', category: 'Doorslijper', equipment_type: 'CUTOFF_SAW', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)' };
  if (/^(?:FSA|KMA|RGA)\b/.test(up)) return { category_slug: 'bosmaaiers', category: 'Accu-bosmaaier / Trimmer', equipment_type: 'TRIMMER', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^FSE\b/.test(up)) return { category_slug: 'bosmaaiers', category: 'Elektrische trimmer', equipment_type: 'TRIMMER', fuel_type: 'ELECTRIC', fuel_type_label: 'Elektrische aandrijving (230V)' };
  if (/^(?:FS|FR|FC|FCA|KM|MM|BT|SP)\b/.test(up)) {
    const label = /^KM\b/.test(up) ? 'CombiMotor' : /^FR\b/.test(up) ? 'Ruggedragen bosmaaier' : /^FC\b/.test(up) ? 'Kantenmaaier' : /^BT\b/.test(up) ? 'Grondboor' : 'Bosmaaier / Trimmer';
    return { category_slug: 'bosmaaiers', category: label, equipment_type: 'TRIMMER', fuel_type: 'PETROL', fuel_type_label: 'Benzine-aandrijving' };
  }
  if (/^(?:BGA|SHA)\b/.test(up)) return { category_slug: 'bladblazers', category: 'Accu-bladblazer', equipment_type: 'BLOWER', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^(?:BGE|SHE)\b/.test(up)) return { category_slug: 'bladblazers', category: 'Elektrische bladblazer', equipment_type: 'BLOWER', fuel_type: 'ELECTRIC', fuel_type_label: 'Elektrische aandrijving (230V)' };
  if (/^(?:BG|BR|SH)\b/.test(up)) {
    const label = /^BR\b/.test(up) ? 'Ruggedragen bladblazer' : /^SH\b/.test(up) ? 'Bladzuiger / Hakselaar' : 'Handbladblazer';
    return { category_slug: 'bladblazers', category: label, equipment_type: 'BLOWER', fuel_type: 'PETROL', fuel_type_label: 'Benzine-aandrijving' };
  }
  if (/^(?:HSA|HLA)\b/.test(up)) return { category_slug: 'heggenscharen', category: 'Accu-heggenschaar', equipment_type: 'HEDGE_TRIMMER', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^(?:HSE|HLE)\b/.test(up)) return { category_slug: 'heggenscharen', category: 'Elektrische heggenschaar', equipment_type: 'HEDGE_TRIMMER', fuel_type: 'ELECTRIC', fuel_type_label: 'Elektrische aandrijving (230V)' };
  if (/^(?:HS|HL)\b/.test(up)) return { category_slug: 'heggenscharen', category: 'Heggenschaar', equipment_type: 'HEDGE_TRIMMER', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)' };
  if (/^SGA\b/.test(up)) return { category_slug: 'nevelspuiten', category: 'Accu-drukspuit', equipment_type: 'SPRAYER', fuel_type: 'BATTERY', fuel_type_label: 'Accu-aandrijving' };
  if (/^(?:SR|SG)\b/.test(up)) return { category_slug: 'nevelspuiten', category: 'Nevelspuit', equipment_type: 'SPRAYER', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)' };
  return null;
}

const inventory = new Map();
function ensureEntry(baseModel) {
  if (!inventory.has(baseModel)) {
    inventory.set(baseModel, {
      base_model: baseModel,
      classification: classifyModel(baseModel),
      in_existing_db: false,
      existing_id: null,
      series_codes: new Set(KNOWN_SERIES_CODES[baseModel] ? [KNOWN_SERIES_CODES[baseModel]] : []),
      variants: new Map(),
      sources: new Map(),
      fitment_canonical_ids: new Set(),
      fitment_count: 0,
      configurations_count: 0,
      specs_candidates: []
    });
  }
  return inventory.get(baseModel);
}

function addEvidence(parsed, sourceName, ref) {
  if (!parsed || !parsed.baseModel) return null;
  const entry = ensureEntry(parsed.baseModel);
  if (!entry.classification) return null;
  if (!entry.sources.has(sourceName)) entry.sources.set(sourceName, new Set());
  entry.sources.get(sourceName).add(ref);
  if (parsed.variant) {
    if (!entry.variants.has(parsed.full)) entry.variants.set(parsed.full, new Set());
    entry.variants.get(parsed.full).add(`${sourceName}:${ref}`);
  }
  return entry;
}

for (const m of dbJson.models) {
  const parsed = parseStihlMachineName(m.model_name) || { baseModel: m.model_name, variant: '', full: m.model_name };
  const entry = ensureEntry(parsed.baseModel);
  entry.in_existing_db = true;
  entry.existing_id = m.id;
  if (m.series_code) entry.series_codes.add(String(m.series_code));
}

// 1. stihl_local_library.db
const ldbPath = path.join(AGENT_ROOT, 'stihl_local_library.db');
if (fs.existsSync(ldbPath)) {
  const ldb = new Database(ldbPath, { readonly: true });
  const tsRows = ldb.prepare("SELECT file_path, content_text FROM extracted_text_contents WHERE file_path LIKE '%TS_Data%'").all();
  for (const row of tsRows) {
    const fileName = row.file_path.split(/[\\/]/).pop();
    const stem = fileName.replace(/_body\.htm$/i, '');
    const parsed = parseStihlMachineName(stem);
    if (!parsed) continue;
    const entry = addEvidence(parsed, 'stihl_local_library_ts_data', fileName);
    if (!entry) continue;

    const txt = row.content_text.replace(/\s+/g, ' ');
    const specs = {};
    const dispM = txt.match(/1\s+Piston displacement\s+(?:cc|cm3)\s+cu\.?\s*in\.?\s+([\d.]+)/i);
    if (dispM) specs.displacement_cc = parseFloat(dispM[1]);
    const kwM = txt.match(/4\s+Engine power\s+kW\s*\(?bhp\)?(?:\s*@\s*r\.?p\.?m\.?)?\s+([\d.]+)\s*\(([\d.]+)\)/i);
    if (kwM) {
      specs.power_kw = parseFloat(kwM[1]);
      specs.power_hp = parseFloat(kwM[2]);
    }
    const plugGapM = txt.match(/7\s+Spark plug electrode gap\s+mm\s+in\s+([\d.]+)/i);
    if (plugGapM) specs.electrode_gap_mm = parseFloat(plugGapM[1]);

    const plugSec = txt.match(/6\s+Type of spark plug\s+(.*?)\s+7\s+Spark plug/i);
    if (plugSec) {
      const pTxt = plugSec[1];
      const plugs = [];
      const bMatch = pTxt.match(/\b(W\s*S\s*R\s*\d+\s*F|W\s*K\s*A\s*\d+\s*T|U\s*S\s*R\s*\d+\s*[A-Z]?|W\s*R\s*\d+\s*F)\b/i);
      const nMatch = pTxt.match(/\b(B\s*P\s*M\s*R\s*\d+\s*[A-Z]?|C\s*M\s*R\s*\d+\s*[A-Z]?)\b/i);
      if (bMatch) plugs.push(`Bosch ${bMatch[1].replace(/\s+/g, ' ').trim()}`);
      if (nMatch) plugs.push(`NGK ${nMatch[1].replace(/\s+/g, ' ').trim()}`);
      if (plugs.length > 0) specs.spark_plug = plugs.join(' / ');
    }
    if (Object.keys(specs).length > 0) {
      entry.specs_candidates.push({ source: 'stihl_local_library_ts_data', ref: fileName, data: specs });
    }
  }

  // Only manual_documents (real file titles/doc categories) rather than noisy numeric hits in model_index
  const docRows = ldb.prepare("SELECT file_path, title, stihl_models, doc_type FROM manual_documents").all();
  const reTok = /\b((?:0\d{2})|(?:MS|MSA|MSE|FS|FSA|FSE|FR|FC|HS|HSA|HSE|HL|HLA|HT|HTA|BG|BGA|BR|SH|TS|TSA|GS|SR|KM|MM|BT)[\s\-]?\d{2,3}i?(?:\s*(?:C-?BE|C-?EM|C-?M|TC-?M|AV|AVEQ|T|R|Q|C))?)\b/gi;
  for (const row of docRows) {
    const srcStr = `${row.stihl_models || ''} ${row.title || ''} ${row.file_path.split(/[\\/]/).pop()}`;
    let m;
    while ((m = reTok.exec(srcStr)) !== null) {
      const parsed = parseStihlMachineName(m[1]);
      if (parsed) addEvidence(parsed, 'stihl_local_library_docs', row.file_path.split(/[\\/]/).pop());
    }
  }
  ldb.close();
}

// 2. stihl_models_full_output/*.md
const mdFullDir = path.join(AGENT_ROOT, 'stihl_models_full_output');
if (fs.existsSync(mdFullDir)) {
  for (const f of fs.readdirSync(mdFullDir).filter(f => f.endsWith('_FULL.md'))) {
    const content = fs.readFileSync(path.join(mdFullDir, f), 'utf8');
    const titleM = content.match(/\*\*Machine Model\*\*:\s*([^\r\n]+)/i);
    const typeM = content.match(/\*\*STIHL Type Number\*\*:\s*(\d{4})/i);
    if (!titleM) continue;
    const parts = titleM[1].trim().split(/[,/]/).map(s => s.trim());
    for (const part of parts) {
      const parsed = parseStihlMachineName(part);
      if (!parsed) continue;
      const entry = addEvidence(parsed, 'stihl_models_full_output', f);
      if (entry && typeM && parts.length === 1) entry.series_codes.add(typeM[1]);
    }
  }
}

// 3. stihl_manuel_service_documentation.db
const mdbPath = path.join(AGENT_ROOT, 'stihl_manuel_service_documentation.db');
if (fs.existsSync(mdbPath)) {
  const mdb = new Database(mdbPath, { readonly: true });
  for (const row of mdb.prepare("SELECT m.model_name, f.file_name, f.doc_code FROM model_index m JOIN service_manual_files f ON m.file_path = f.file_path").all()) {
    const parsed = parseStihlMachineName(row.model_name);
    if (parsed) {
      const entry = addEvidence(parsed, 'stihl_manuel_service_db', row.file_name);
      if (entry && row.doc_code && /^\d{4}$/.test(row.doc_code)) entry.series_codes.add(row.doc_code);
    }
  }
  mdb.close();
}

// 4. stihl_opeforum_documentation.db
const odbPath = path.join(AGENT_ROOT, 'stihl_opeforum_documentation.db');
if (fs.existsSync(odbPath)) {
  const odb = new Database(odbPath, { readonly: true });
  const re = /\b((?:0\d{2})|(?:MS|MSA|MSE|FS|FSA|FSE|FR|FC|HS|HSA|HSE|HL|HLA|HT|HTA|BG|BGA|BR|SH|TS|TSA|GS|SR|KM|MM|BT)[\s\-]?\d{2,3}i?(?:\s*(?:C-?BE|C-?EM|C-?M|TC-?M|AV|AVEQ|T|R|Q|C))?)\b/gi;
  for (const a of odb.prepare("SELECT filename FROM manual_attachments").all()) {
    let m;
    while ((m = re.exec(a.filename)) !== null) {
      const parsed = parseStihlMachineName(m[1]);
      if (parsed) addEvidence(parsed, 'stihl_opeforum_manuals', a.filename);
    }
  }
  odb.close();
}

// 5. stihl_scribd_documentation.db & stihl_archive_documentation.db (strict STIHL manual title extraction)
const manualRe = /\b((?:0\d{2})|(?:MS|MSA|MSE|FS|FSA|FSE|FR|FC|FCA|HS|HSA|HSE|HL|HLA|HT|HTA|BG|BGA|BGE|BR|SH|SHE|TS|TSA|GS|SR|SG|KM|KMA|MM|BT|E|GTA)[\s\-]?\d{2,3}i?(?:\s*(?:C-?BEQ|C-?BE|C-?EM|C-?M|TC-?M|AV|AVEQ|T|R|Q|C))?)\b/gi;
const sdbPath = path.join(AGENT_ROOT, 'stihl_scribd_documentation.db');
if (fs.existsSync(sdbPath)) {
  const sdb = new Database(sdbPath, { readonly: true });
  for (const row of sdb.prepare("SELECT doc_id, title FROM documents WHERE lower(title) LIKE '%stihl%'").all()) {
    let m;
    while ((m = manualRe.exec(row.title)) !== null) {
      const parsed = parseStihlMachineName(m[1]);
      if (parsed) addEvidence(parsed, 'stihl_scribd_docs', `${row.doc_id}:${row.title.slice(0, 60)}`);
    }
  }
  sdb.close();
}

const adbPath = path.join(AGENT_ROOT, 'stihl_archive_documentation.db');
if (fs.existsSync(adbPath)) {
  const adb = new Database(adbPath, { readonly: true });
  for (const row of adb.prepare("SELECT identifier, title FROM archive_items WHERE lower(title) LIKE '%stihl%'").all()) {
    if (!/^(?:STIHL\s+|.*(?:Manual|Parts|Instruction|Bedienungsanleitung|Handleiding))/i.test(row.title) && !row.identifier.startsWith('manual')) continue;
    let m;
    while ((m = manualRe.exec(row.title)) !== null) {
      const parsed = parseStihlMachineName(m[1]);
      if (parsed) addEvidence(parsed, 'stihl_archive_docs', `${row.identifier}:${row.title.slice(0, 60)}`);
    }
  }
  adb.close();
}

// 6. stihlusa_knowledge_graph.json
const usaPath = path.join(AGENT_ROOT, 'stihlusa_knowledge_graph.json');
if (fs.existsSync(usaPath)) {
  const usa = JSON.parse(fs.readFileSync(usaPath, 'utf8'));
  for (const rec of (usa.records || [])) {
    for (const c of (rec.compatibility || [])) {
      const fullStr = c.canonical_model || `${c.base_model}${c.variant_suffix ? ' ' + c.variant_suffix : ''}`;
      const parsed = parseStihlMachineName(fullStr);
      if (parsed) addEvidence(parsed, 'stihlusa_official', rec.source?.source_product_slug || fullStr);
    }
  }
}

// 7. Repo document registries
for (const regFile of ['document_registry.json', 'batch2_document_registry.json', 'additional_sources_document_registry.json']) {
  const p = path.join(ROOT, 'data', regFile);
  if (!fs.existsSync(p)) continue;
  const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const doc of (reg.documents || [])) {
    for (const cand of (doc.model_candidates || doc.models || [])) {
      const parsed = parseStihlMachineName(typeof cand === 'string' ? cand : cand.model_name);
      if (parsed) addEvidence(parsed, `repo_${regFile}`, doc.document_id || regFile);
    }
  }
}

// 8. Parts catalog + fitments
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts_model_configurations.json'), 'utf8'));
const varr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts_model_variants.json'), 'utf8'));
const fitManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'model_part_fitments.json'), 'utf8'));

function canonicalIdToReadableModel(id) {
  if (!id || typeof id !== 'string') return null;
  if (/^\d{4,}_/.test(id)) return null;
  return parseStihlMachineName(id.replace(/_/g, ' ').replace(/\s+/g, ' ').trim());
}

const cfgCountByModel = new Map();
for (const c of (cfg.configurations || [])) {
  cfgCountByModel.set(c.canonical_model_id, (cfgCountByModel.get(c.canonical_model_id) || 0) + 1);
  const parsed = canonicalIdToReadableModel(c.canonical_model_id);
  if (parsed) {
    const entry = addEvidence(parsed, 'parts_model_configurations', c.canonical_model_id);
    if (entry) entry.fitment_canonical_ids.add(c.canonical_model_id);
  }
}

for (const v of (varr.variants || [])) {
  const baseP = parseStihlMachineName(v.base_model_name);
  if (baseP) {
    const entry = addEvidence(baseP, 'parts_model_variants', v.canonical_model_id);
    if (entry) entry.fitment_canonical_ids.add(v.canonical_model_id);
  }
  const fullP = parseStihlMachineName(v.variant_name || v.base_model_name);
  if (fullP) {
    const entry = addEvidence(fullP, 'parts_model_variants', `${v.canonical_model_id}:${v.variant_key}`);
    if (entry) entry.fitment_canonical_ids.add(v.canonical_model_id);
  }
}

const fitmentCountByCid = new Map();
for (const relShard of (fitManifest.shard_files || [])) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', relShard))).toString('utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const cid = JSON.parse(line).canonical_model_id;
    fitmentCountByCid.set(cid, (fitmentCountByCid.get(cid) || 0) + 1);
  }
}

for (const entry of inventory.values()) {
  let fCount = 0, cCount = 0;
  const candCids = new Set(entry.fitment_canonical_ids);
  candCids.add(entry.base_model.toLowerCase().replace(/[\s-]+/g, '_'));
  for (const cid of candCids) {
    fCount += fitmentCountByCid.get(cid) || 0;
    cCount += cfgCountByModel.get(cid) || 0;
  }
  entry.fitment_count = fCount;
  entry.configurations_count = cCount;
}

const outRecords = [];
for (const entry of inventory.values()) {
  if (!entry.classification) continue;
  const sourcesObj = {};
  for (const [k, s] of entry.sources.entries()) sourcesObj[k] = Array.from(s).slice(0, 10);
  const mergedSpecs = {};
  const specSources = {};
  for (const sc of entry.specs_candidates) {
    for (const [field, val] of Object.entries(sc.data)) {
      if (val !== undefined && val !== null && !(field in mergedSpecs)) {
        mergedSpecs[field] = val;
        specSources[field] = `${sc.source}:${sc.ref}`;
      }
    }
  }
  outRecords.push({
    base_model: entry.base_model,
    in_existing_db: entry.in_existing_db,
    existing_id: entry.existing_id,
    classification: entry.classification,
    series_codes: Array.from(entry.series_codes),
    variants: Array.from(entry.variants.keys()).sort(),
    source_count: entry.sources.size,
    sources: sourcesObj,
    fitment_canonical_ids: Array.from(entry.fitment_canonical_ids),
    fitment_count: entry.fitment_count,
    configurations_count: entry.configurations_count,
    verified_specs: mergedSpecs,
    spec_sources: specSources
  });
}

outRecords.sort((a, b) => a.base_model.localeCompare(b.base_model, undefined, { numeric: true }));

const eligibleNew = outRecords.filter(r => !r.in_existing_db && (
  r.source_count >= 2 ||
  r.sources.stihl_local_library_ts_data ||
  r.sources.stihl_manuel_service_db ||
  r.sources.stihlusa_official ||
  r.sources.stihl_models_full_output ||
  r.fitment_count >= 1
));

const legacy0xx = outRecords.filter(r => /^0\d{2}$/.test(r.base_model));
const legacyMissingEligible = legacy0xx.filter(r => !r.in_existing_db && eligibleNew.includes(r));

const report = {
  generated_at: new Date().toISOString(),
  existing_db_models: dbJson.models.length,
  total_inventory_models: outRecords.length,
  eligible_new_models: eligibleNew.length,
  legacy_0xx_total: legacy0xx.length,
  legacy_0xx_missing_eligible: legacyMissingEligible.map(r => r.base_model),
  fitment_canonical_model_ids_count: fitmentCountByCid.size,
  models: outRecords
};

fs.writeFileSync(path.join(OUT_DIR, 'model_inventory.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'fitment_model_ids.json'), JSON.stringify(Array.from(fitmentCountByCid.keys()).sort(), null, 2));

console.log('Existing DB:', report.existing_db_models);
console.log('Total clean discovered:', report.total_inventory_models);
console.log('Eligible new verified models:', report.eligible_new_models);
console.log('Legacy 0xx missing & eligible:', legacyMissingEligible.length, '->', legacyMissingEligible.map(m => m.base_model).join(', '));
console.log('TS_Data specs populated count:', outRecords.filter(r => r.verified_specs.displacement_cc).length);
