/**
 * Normalize pt-BR VTEX spec labels/values to canonical STIHLDecoder fields.
 * - Decimal comma ("30,1") -> dot
 * - Units: ml<->l, cm, mm, kg, dB, m/s², V, bar — explicit, no aggressive tolerance
 * - Power "kW/cv" single value is kW (VTEX lists kW first); dual "1,6 / 1,7" kept raw + first value
 * - Everything unmapped is preserved under extra_specs; raw_specs always retained by caller
 */

export function parsePtNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  // Take first of "127 / 220" style dual values for numeric fields.
  s = s.split('/')[0].trim();
  // Remove unit suffixes and qualifiers ("4,5 - sem conjunto de corte", "40 min", "≈").
  const m = s.match(/[-+]?\d[\d\s.]*(,\d+)?/);
  if (!m) return null;
  const num = m[0].replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(num);
  return Number.isFinite(n) ? n : null;
}

export function parseVolumeMl(value) {
  if (value == null) return null;
  const s = String(value);
  const n = parsePtNumber(s);
  if (n == null) return null;
  if (/\bl\b/i.test(s) && !/ml/i.test(s)) return Math.round(n * 1000); // liters -> ml
  return n;
}

function normKey(label) {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Ordered: first match wins. Keep specific before generic.
const FIELD_RULES = [
  { fields: ['displacement_cc'], match: [/^cilindrada/] },
  { fields: ['power_kw', 'power_hp'], match: [/^potencia\b/], power: true },
  { fields: ['weight_kg'], match: [/^peso\b/] },
  { fields: ['guide_bar_length_cm'], match: [/comprimento (do|da) (sabre|lamina)/, /^sabre.*comprimento/, /comprimento.*sabre/] },
  { fields: ['guide_bar'], match: [/^tipo de sabre/, /^sabre$/] },
  { fields: ['chain_model'], match: [/^corrente$/, /^cadeia$/] },
  { fields: ['chain_pitch'], match: [/passo da cor?r?ente/, /^passo$/] },
  { fields: ['chain_gauge_mm'], match: [/bitola/, /calibre/, /espessura.*elo/, /ranhura/] },
  { fields: ['sound_pressure_db'], match: [/pressao sonora/] },
  { fields: ['sound_power_db'], match: [/potencia sonora/] },
  { fields: ['vibration_left_m_s2'], match: [/vibracao.*esquerda/, /vibracao.*dianteira/] },
  { fields: ['vibration_right_m_s2'], match: [/vibracao.*direita/, /vibracao.*traseira/] },
  { fields: ['vibration_m_s2'], match: [/^vibracao/, /nivel de vibracao/] },
  { fields: ['fuel_tank_ml'], match: [/tanque de combustivel/, /capacidade.*combustivel/, /deposito.*combustivel/] },
  { fields: ['oil_tank_ml'], match: [/tanque de oleo/, /oleo.*corrente.*tanque/, /deposito.*oleo/] },
  { fields: ['battery_system'], match: [/sistema de bateria/] },
  { fields: ['voltage_v'], match: [/tensao da bateria/, /tensao nominal/] },
  { fields: ['cutting_length_cm'], match: [/comprimento de corte/] },
  { fields: ['tooth_spacing_mm'], match: [/espacamento entre.*dentes/] },
  { fields: ['battery_runtime_min'], match: [/autonomia.*bateria/] },
  { fields: ['engine_type'], match: [/^motor$/] },
  { fields: ['max_pressure_bar'], match: [/pressao maxima/] },
  { fields: ['working_pressure_bar'], match: [/pressao de trabalho/] },
  { fields: ['max_flow_l_h'], match: [/vazao maxima/] },
  { fields: ['hose_length_m'], match: [/mangueira/] },
  { fields: ['cable_length_m'], match: [/cabo eletrico/] },
  { fields: ['max_water_inlet_temp_c'], match: [/temperatura maxima.*agua/] },
];

export function normalizeSpecs(rawSpecs) {
  const specs = {};
  const extra_specs = {};
  const unmapped = [];
  for (const [label, value] of Object.entries(rawSpecs || {})) {
    const key = normKey(label);
    // Combined "esquerda/direita" value ("3,9/3,6"): split explicitly, keep raw.
    if (/vibra/.test(key) && /esquerda/.test(key) && /direita/.test(key)) {
      const parts = String(value).split('/');
      const left = parsePtNumber(parts[0]);
      const right = parsePtNumber(parts[1]);
      if (left != null) specs.vibration_left_m_s2 = left;
      if (right != null) specs.vibration_right_m_s2 = right;
      if (left == null && right == null) {
        extra_specs[label] = value;
        unmapped.push(label);
      } else {
        extra_specs[`${label} — raw`] = value;
      }
      continue;
    }
    const rule = FIELD_RULES.find((r) => r.match.some((re) => re.test(key)));
    if (!rule) {
      extra_specs[label] = value;
      unmapped.push(label);
      continue;
    }
    if (rule.power) {
      const n = parsePtNumber(value);
      if (n != null) {
        specs.power_kw = n;
        // VTEX "Potência (kW/cv)" single number is kW; do NOT invent hp conversion.
        extra_specs['Potência (kW/cv) — raw'] = value;
      } else {
        extra_specs[label] = value;
      }
      continue;
    }
    const target = rule.fields[0];
    let parsed = null;
    if (target === 'fuel_tank_ml' || target === 'oil_tank_ml') parsed = parseVolumeMl(value);
    else if (target === 'battery_system' || target === 'engine_type' || target === 'guide_bar' || target === 'chain_model' || target === 'chain_pitch') {
      parsed = String(value).trim() || null;
    } else parsed = parsePtNumber(value);
    if (parsed == null || (typeof parsed === 'number' && !Number.isFinite(parsed))) {
      extra_specs[label] = value;
      unmapped.push(label);
      continue;
    }
    specs[target] = parsed;
    if (rule.fields.length > 1) extra_specs[`${label} — note`] = `mapped to ${rule.fields.join(', ')}; raw: ${value}`;
  }
  return { specs, extra_specs, unmapped };
}

/** Normalize a model name for comparison: uppercase, single spaces, unify separators. */
export function normalizeModelName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/–|—/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();
}
