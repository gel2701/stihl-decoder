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

const MODEL_PREFIXES = [
  'MS', 'MSE', 'MSA', 'FS', 'FSA', 'FSE', 'FR', 'BR', 'BGA', 'BGE', 'BG', 'SH',
  'HS', 'HSA', 'HSE', 'HL', 'HLA', 'HT', 'HTA', 'KM', 'KMA', 'TS', 'TSA', 'BT',
  'RE', 'REA', 'RCA', 'RMA', 'RM', 'GTA', 'SEA', 'SHA', 'SE', 'SG', 'SGA', 'SR',
  'RB', 'RLA', 'RGA', 'RMI', 'KGA', 'KOA', 'MH', 'WP', 'EHC', 'ASA', 'GR', 'IR'
];

const ACCESSORY_PRODUCT_REGEX = /\b(?:corrente|sabre|l[aâ]mina|cabe[cç]ote|fio de corte|bateria|carregador|[oó]leo|lubrificante|detergente|mangueira|escova|filtro|vela de igni[cç][aã]o|protetor|cinto|arn[eê]s|kit de afia[cç][aã]o|lima|disco de corte|bico|adaptador|extens[aã]o|acess[oó]rio)\b/i;

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

function detectModelName(value = '') {
  const normalized = text(value)
    .replace(/[_/]+/g, ' ')
    .replace(/-/g, ' ')
    .toUpperCase();
  const prefixGroup = [...MODEL_PREFIXES].sort((a, b) => b.length - a.length).join('|');
  const regex = new RegExp(`\\b(${prefixGroup})\\s*([0-9]{1,4}(?:\\.[0-9]+)?)(?:\\s*([A-Z]{1,4}(?:\\s*[A-Z]{1,4})?))?\\b`, 'i');
  const match = normalized.match(regex);
  if (!match) return null;
  const suffixRaw = String(match[3] || '').replace(/\s+/g, '-').toUpperCase();
  const ignoredSuffixes = new Set(['COM', 'KIT', 'SEM']);
  const suffix = suffixRaw && !ignoredSuffixes.has(suffixRaw) ? ` ${suffixRaw}` : '';
  return `${match[1].toUpperCase()} ${match[2]}${suffix}`;
}

function modelNameFromTitleAndUrl(title, url) {
  const fromTitle = detectModelName(title);
  if (fromTitle) return fromTitle;
  try {
    const pathHint = new URL(url).pathname.replace(/[-_]/g, ' ');
    return detectModelName(pathHint);
  } catch {
    return null;
  }
}

function looksLikeAccessory(title, url = '') {
  const combined = `${text(title)} ${String(url).replace(/[-_/]+/g, ' ')}`;
  if (ACCESSORY_PRODUCT_REGEX.test(combined)) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (/\/(?:\d{2,3}-)?rm-\d+(?:-|\/|$)/i.test(pathname) && !/cortador|cortador-de-grama|cortador-a-combustao/i.test(pathname)) return true;
  } catch {}
  return false;
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

function isValidManualHref(href = '') {
  if (!/\.pdf(?:$|\?)/i.test(href)) return false;
  if (/(?:^|\/)(?:undefined|null)(?:$|[/?#])/i.test(href)) return false;
  try {
    const url = new URL(href, 'https://example.invalid');
    const basename = decodeURIComponent(url.pathname.split('/').pop() || '').trim().toLowerCase();
    if (!basename || ['.pdf', '..pdf', 'na.pdf', 'undefined.pdf', 'null.pdf'].includes(basename)) return false;
  } catch {
    return false;
  }
  return true;
}

function extractManualUrl(html, baseUrl) {
  const anchors = collectAnchors(html).filter((a) => isValidManualHref(a.href));
  const preferred = anchors.find((a) => /manual|instru[cç][oõ]es|baixar|download/i.test(`${a.label} ${a.href}`));
  const selected = preferred || anchors[0];
  return selected ? absoluteUrl(selected.href, baseUrl) : null;
}

function extractImages(html, baseUrl) {
  const urls = new Map();
  const regex = /<(?:img|source)\b[^>]*(?:src|data-src|srcset)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(String(html)))) {
    const first = decodeEntities(match[1]).split(',')[0].trim().split(/\s+/)[0];
    const url = absoluteUrl(first, baseUrl);
    if (!url || !/stihl|vtexassets/i.test(url) || /\.svg(?:$|\?)/i.test(url)) continue;
    const idMatch = url.match(/\/arquivos\/ids\/(\d+)/i);
    const key = idMatch ? `vtex-id:${idMatch[1]}` : url.split('?')[0];
    if (!urls.has(key)) urls.set(key, url);
  }
  return [...urls.values()];
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
    'Modelo da corrente', 'Tipo da corrente STIHL', 'Passo da corrente', 'Peso (kg)', 'Motor',
    'Nível de pressão sonora dB(A)', 'Nível de potência sonora dB(A)',
    'Nível de vibração esquerda/direita (m/s²)', 'Capacidade do tanque de óleo (ml)',
    'Capacidade do tanque de combustível (ml)'
  ];
  const specs = {};
  for (const label of knownLabels) {
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

function normalizePitch(value) {
  const source = String(value || '')
    .replace(/[”“″’]/g, '"')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  const match = source.match(/(\d+\s*\/\s*\d+|0?\.\d+)\s*["']?\s*(P)?/i);
  if (!match) return source.replace(/\s*\/\s*/g, '/');
  let token = match[1].replace(/\s*\/\s*/g, '/');
  if (/^0\.\d+$/.test(token)) token = token.slice(1);
  return `${token}"${match[2] ? ' P' : ''}`;
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
    } else if (key === 'chain_pitch') {
      value = normalizePitch(rawValue);
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
  const detectedModelName = modelNameFromTitleAndUrl(title, url);
  const accessoryLike = looksLikeAccessory(title, url);
  const recordType = detectedModelName && !accessoryLike ? 'MACHINE_MODEL' : 'ACCESSORY_OR_CONSUMABLE';
  const modelName = recordType === 'MACHINE_MODEL' ? detectedModelName : null;
  const payload = {
    schema_version: 2,
    source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    source_name: DEFAULT_SOURCE,
    market,
    promotion_status: 'CANDIDATE',
    source_url: url,
    retrieved_at: retrievedAt,
    record_type: recordType,
    model_name: modelName,
    product_name: title,
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

function comparable(field, value) {
  if (field === 'chain_pitch') return normalizePitch(value).toUpperCase();
  if (typeof value === 'number') return value;
  return String(value ?? '').trim().toUpperCase();
}

export function compareCandidateToDatabase(candidate, database) {
  const models = Array.isArray(database?.models) ? database.models : [];
  const needle = String(candidate.model_name || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const model = needle
    ? models.find((m) => String(m.model_name || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === needle) || null
    : null;
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
      status: current === null
        ? 'DATABASE_MISSING'
        : comparable(candidateKey, current) === comparable(candidateKey, incoming)
          ? 'MATCH'
          : 'CONFLICT_REVIEW_REQUIRED'
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
    if (url && /loja\.stihl\.com\.br/i.test(url) && /\/p(?:\?|$)/i.test(url)) urls.add(url.split('?')[0]);
  }
  return [...urls].sort();
}

export function productUrlFromVtexRecord(product, origin) {
  if (!product || typeof product !== 'object') return null;
  if (typeof product.link === 'string' && product.link) {
    const url = absoluteUrl(product.link, origin);
    return url ? url.split('?')[0] : null;
  }
  if (typeof product.linkText === 'string' && product.linkText) {
    return absoluteUrl(`/${product.linkText.replace(/^\/+|\/+$/g, '')}/p`, origin);
  }
  return null;
}
