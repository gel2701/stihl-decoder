import crypto from 'crypto';

const DEFAULT_MARKET = 'BR';
const DEFAULT_SOURCE = 'STIHL_BR_OFFICIAL_STORE';

const FIELD_MAP = [
  [/^pot[eê]ncia\b/i, 'power_kw'],
  [/^cilindrada\b/i, 'displacement_cc'],
  [/^peso\b/i, 'weight_kg'],
  [/^passo da corrente\b/i, 'chain_pitch'],
  [/^corrente\b/i, 'chain_model'],
  [/^tipo de sabre/i, 'guide_bar'],
  [/press[aã]o sonora/i, 'sound_pressure_db'],
  [/pot[eê]ncia sonora/i, 'sound_power_db'],
  [/vibra[cç][aã]o/i, 'vibration_m_s2'],
  [/tanque de [oó]leo/i, 'oil_tank_ml'],
  [/tanque de combust[ií]vel/i, 'fuel_tank_ml'],
  [/^motor\b/i, 'engine_type']
];

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function text(value = '') {
  return decodeEntities(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function numberPt(value) {
  const match = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeModelName(title = '') {
  const cleaned = text(title)
    .replace(/^STIHL\s+/i, '')
    .replace(/^(motosserra|ro[cç]adeira|soprador|aparador|podador|lavadora|cortador|perfurador)\s+(a\s+combust[aã]o\s+|el[eé]tric[oa]\s+|a\s+bateria\s+)?/i, '')
    .trim();
  const match = cleaned.match(/\b((?:MS|MSE|MSA|FS|FSA|BR|BGA|BG|HS|HSA|HT|HTA|KM|KMA|TS|TSA|BT|RE|RMA|RM)\s*[-A-Z0-9.]+(?:\s+[A-Z][A-Z0-9-]*)?)\b/i);
  return (match ? match[1] : cleaned).replace(/\s+/g, ' ').trim().toUpperCase();
}

function extractFirst(html, regex) {
  const match = String(html).match(regex);
  return match ? text(match[1]) : '';
}

function extractTitle(html) {
  return extractFirst(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    || extractFirst(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*\|.*$/, '');
}

function extractReference(html) {
  const plain = text(html);
  const match = plain.match(/\bRef\s*:\s*([0-9]{4}[\s-]?[0-9]{3}[\s-]?[0-9]{4}(?:[\s-]?[A-Z])?)\b/i);
  return match ? match[1].replace(/\s+/g, '-').replace(/--+/g, '-') : null;
}

function collectAnchors(html) {
  const anchors = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html)))) {
    anchors.push({ href: decodeEntities(match[1]), label: text(match[2]) });
  }
  return anchors;
}

function absoluteUrl(href, baseUrl) {
  try { return new URL(href, baseUrl).href; } catch { return null; }
}

function extractManualUrl(html, baseUrl) {
  const anchors = collectAnchors(html);
  const preferred = anchors.find((a) => /manual|instru[cç][oõ]es|baixar|download/i.test(`${a.label} ${a.href}`) && /\.pdf(?:$|\?)/i.test(a.href));
  const fallback = anchors.find((a) => /\.pdf(?:$|\?)/i.test(a.href));
  return absoluteUrl((preferred || fallback)?.href, baseUrl);
}

function extractImages(html, baseUrl) {
  const urls = new Set();
  const regex = /<(?:img|source)\b[^>]*(?:src|data-src|srcset)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(String(html)))) {
    const first = match[1].split(',')[0].trim().split(/\s+/)[0];
    const url = absoluteUrl(first, baseUrl);
    if (url && /stihl|vtexassets/i.test(url)) urls.add(url);
  }
  return [...urls];
}

function extractDescription(html) {
  const meta = String(html).match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || String(html).match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
  return meta ? decodeEntities(meta[1]).trim() : '';
}

function parseSpecItemsByClasses(html) {
  const specs = {};
  const itemRegex = /<[^>]+class=["'][^"']*TechnicalSpecificationItem[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let item;
  while ((item = itemRegex.exec(String(html)))) {
    const block = item[1];
    const name = extractFirst(block, /<[^>]+class=["'][^"']*TechnicalSpecificationName[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    const value = extractFirst(block, /<[^>]+class=["'][^"']*TechnicalSpecificationValue[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (name && value) specs[name] = value;
  }
  return specs;
}

function parseSpecItemsFallback(html) {
  const plain = text(html);
  const knownLabels = [
    'Potência (kW/cv)', 'Cilindrada (cm³)', 'Tipo de sabre e tamanho (cm/pol)', 'Corrente',
    'Passo da corrente', 'Peso (kg)', 'Motor', 'Nível de pressão sonora dB(A)',
    'Nível de potência sonora dB(A)', 'Nível de vibração esquerda/direita (m/s²)',
    'Capacidade do tanque de óleo (ml)', 'Capacidade do tanque de combustível (ml)'
  ];
  const specs = {};
  for (let i = 0; i < knownLabels.length; i += 1) {
    const label = knownLabels[i];
    const start = plain.indexOf(label);
    if (start < 0) continue;
    const valueStart = start + label.length;
    let end = plain.length;
    for (const other of knownLabels) {
      const idx = plain.indexOf(other, valueStart);
      if (idx >= 0 && idx < end) end = idx;
    }
    const sectionEnd = plain.indexOf('Conteúdo da embalagem', valueStart);
    if (sectionEnd >= 0 && sectionEnd < end) end = sectionEnd;
    const value = plain.slice(valueStart, end).trim();
    if (value && value.length < 180) specs[label] = value;
  }
  return specs;
}

export function normalizeSpecs(rawSpecs = {}) {
  const normalized = {};
  for (const [label, rawValue] of Object.entries(rawSpecs)) {
    const key = FIELD_MAP.find(([pattern]) => pattern.test(label))?.[1];
    if (!key) continue;
    let value = rawValue;
    if (['power_kw', 'displacement_cc', 'weight_kg', 'sound_pressure_db', 'sound_power_db', 'oil_tank_ml', 'fuel_tank_ml'].includes(key)) {
      value = numberPt(rawValue);
    } else if (key === 'vibration_m_s2') {
      const nums = String(rawValue).match(/\d+(?:[.,]\d+)?/g) || [];
      value = nums.slice(0, 2).map((n) => Number(n.replace(',', '.')));
    }
    if (value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) normalized[key] = value;
  }
  return normalized;
}

export function parseOfficialProductHtml(html, { url, market = DEFAULT_MARKET, retrievedAt = new Date().toISOString() } = {}) {
  if (!html || !url) throw new Error('html and url are required');
  const title = extractTitle(html);
  if (!title) throw new Error(`No product title found for ${url}`);
  const rawSpecs = Object.keys(parseSpecItemsByClasses(html)).length ? parseSpecItemsByClasses(html) : parseSpecItemsFallback(html);
  const modelName = normalizeModelName(title);
  const payload = {
    schema_version: 1,
    source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    source_name: DEFAULT_SOURCE,
    market,
    promotion_status: 'CANDIDATE',
    source_url: url,
    retrieved_at: retrievedAt,
    model_name: modelName,
    title,
    product_reference: extractReference(html),
    description: extractDescription(html),
    specs: normalizeSpecs(rawSpecs),
    raw_specs: rawSpecs,
    manual_url: extractManualUrl(html, url),
    images: extractImages(html, url)
  };
  payload.evidence_hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return payload;
}

export function compareCandidateToDatabase(candidate, database) {
  const models = Array.isArray(database?.models) ? database.models : [];
  const needle = String(candidate.model_name || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const model = models.find((m) => String(m.model_name || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === needle) || null;
  const comparison = {};
  const pairs = {
    displacement_cc: 'displacement_cc', power_kw: 'power_kw', weight_kg: 'weight_kg', chain_pitch: 'chain_pitch'
  };
  for (const [candidateKey, dbKey] of Object.entries(pairs)) {
    if (!(candidateKey in candidate.specs)) continue;
    const incoming = candidate.specs[candidateKey];
    const current = model?.[dbKey] ?? null;
    comparison[candidateKey] = {
      incoming,
      current,
      status: current === null ? 'DATABASE_MISSING' : String(current) === String(incoming) ? 'MATCH' : 'CONFLICT_REVIEW_REQUIRED'
    };
  }
  return {
    model_match: Boolean(model),
    database_model_id: model?.id || null,
    database_model_name: model?.model_name || null,
    market: candidate.market,
    automatic_promotion_allowed: false,
    comparison
  };
}

export function discoverProductUrls(html, catalogUrl) {
  const urls = new Set();
  for (const { href } of collectAnchors(html)) {
    const url = absoluteUrl(href, catalogUrl);
    if (url && /loja\.stihl\.com\.br/i.test(url) && /\/p(?:\?|$)/i.test(url)) urls.add(url);
  }
  return [...urls].sort();
}
