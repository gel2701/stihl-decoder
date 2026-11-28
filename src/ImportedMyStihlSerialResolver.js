import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILES = [
  path.resolve(__dirname, '..', 'data', 'serial_imports', 'my_stihl_2026_10_20.jsonl'),
  path.resolve(__dirname, '..', 'data', 'serial_imports', 'my_stihl_2026_10_17.jsonl')
];
const OFFICIAL_URL = 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number';
let cached = null;

// Stored observations are exact MY STIHL screen-text captures; never infer serial ranges.
function observations() {
  if (cached) return cached;
  const result = new Map();
  const conflicts = new Set();
  for (const sourcePath of SOURCE_FILES) {
    if (!fs.existsSync(sourcePath)) continue;
    for (const line of fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const serial = String(row.serial_number || '');
      const product = String(row.official_product_text || '').trim();
      if (!/^\d{8,10}$/.test(serial) || !product || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.lookup_date || ''))) continue;
      const prior = result.get(serial);
      if (prior && prior.official_product_text !== product) {
        conflicts.add(serial);
      } else if (!prior) {
        result.set(serial, row);
      }
    }
  }
  for (const serial of conflicts) result.delete(serial);
  cached = result;
  return result;
}

function normalize(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^STIHL\s+/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A base model must never absorb an undocumented C-M, C-BE, AV, Z, R etc. variant.
const VARIANT_PREFIX = /^(?:C(?:\s+(?:M|EM|BE|B|E))?|TC(?:\s+(?:M|E))?|AV|DW|VW|Z|R|T|W)(?:\s|$)/;

function modelFromProductLabel(label, models) {
  const slash = String(label || '').indexOf(' / ');
  if (slash < 0) return null;
  const description = label.slice(slash + 3).replace(/^(?:Benzine|Akku|Accu|Elektro|Elektrisch|Diesel|Battery|Electric)\s+/i, '');
  const normalized = normalize(description);
  const candidates = [];
  for (const model of models) {
    if (!model || !model.id || !model.model_name) continue;
    const name = normalize(model.model_name);
    if (!name || name.length < 4) continue;
    if (normalized !== name && !normalized.startsWith(name + ' ')) continue;
    candidates.push({ model, name, remainder: normalized.slice(name.length).trim() });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.name.length - a.name.length);
  const longest = candidates[0].name.length;
  const top = candidates.filter((x) => x.name.length === longest);
  if (new Set(top.map((x) => x.model.id)).size !== 1) return null;
  const best = top[0];
  if (VARIANT_PREFIX.test(best.remainder)) return null;
  return best.model;
}

/**
 * Exact serial-only observation from a user-supplied MY STIHL lookup export.
 * Existing official anchors retain priority in OfficialSerialAnchorResolver.
 * A unique exact canonical model match is mandatory; unknown variants fail closed.
 */
export function resolveImportedMyStihlSerial(serialInput, database = {}) {
  const serial = String(serialInput || '').trim();
  if (!/^\d{8,10}$/.test(serial)) return null;
  const observation = observations().get(serial);
  if (!observation) return null;
  const model = modelFromProductLabel(observation.official_product_text, database.models || []);
  if (!model) return null;
  return {
    serial_number: serial,
    model_name: model.model_name,
    canonical_model_id: model.id,
    category: model.category || model.category_slug || null,
    verification_status: 'OFFICIAL_STIHL_LOOKUP',
    source: 'MY_STIHL',
    source_url: OFFICIAL_URL,
    verification_date: observation.lookup_date,
    evidence_capture: 'USER_SUPPLIED_MY_STIHL_SCREEN_TEXT',
    official_product_text: observation.official_product_text
  };
}
