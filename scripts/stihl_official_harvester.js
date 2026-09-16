import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const STIHL_BR_SOURCE = Object.freeze({
  source_id: 'stihl-br-official-shop',
  source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
  market: 'BR',
  language: 'pt-BR',
  base_url: 'https://loja.stihl.com.br',
  catalog_endpoint: '/api/catalog_system/pub/products/search',
  manual_index_url: 'https://loja.stihl.com.br/manuais-de-instrucoes'
});

const MODEL_PREFIXES = [
  'MSA', 'MSE', 'MS', 'FSA', 'FS', 'FR', 'BGA', 'BG', 'BR', 'HSA', 'HS',
  'HTA', 'HT', 'TSA', 'TS', 'KMA', 'KM', 'RMA', 'RM', 'REA', 'RE', 'SEA',
  'SE', 'SHA', 'SH', 'GTA', 'ASA', 'RGA', 'SGA', 'SG', 'BT', 'MM', 'MH', 'WP'
];

const SPEC_ALIASES = [
  { match: ['cilindrada'], field: 'displacement_cc', unit: 'cc' },
  { match: ['potencia kw', 'potencia maxima kw'], field: 'power_kw', unit: 'kW' },
  { match: ['peso kg'], field: 'weight_kg', unit: 'kg' },
  { match: ['capacidade do tanque de combustivel ml'], field: 'fuel_tank_l', unit: 'l', scale: 0.001 },
  { match: ['capacidade do tanque de combustivel l'], field: 'fuel_tank_l', unit: 'l' },
  { match: ['capacidade do tanque de oleo ml'], field: 'oil_tank_l', unit: 'l', scale: 0.001 },
  { match: ['capacidade do tanque de oleo l'], field: 'oil_tank_l', unit: 'l' },
  { match: ['nivel de pressao sonora'], field: 'sound_pressure_db', unit: 'dB(A)' },
  { match: ['nivel de potencia sonora'], field: 'sound_power_db', unit: 'dB(A)' },
  { match: ['rotacao rpm'], field: 'max_speed_rpm', unit: 'rpm' },
  { match: ['comprimento do sabre cm'], field: 'guide_bar_cm', unit: 'cm' },
  { match: ['passo da corrente'], field: 'chain_pitch', unit: null, rawOnly: true },
  { match: ['corrente'], field: 'chain_model', unit: null, rawOnly: true },
  { match: ['motor'], field: 'engine_type', unit: null, rawOnly: true }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[³²]/g, (char) => (char === '³' ? '3' : '2'))
    .replace(/[^a-zA-Z0-9/"' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseLocaleNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/-?\d[\d.]*([,]\d+)?|-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let token = match[0];
  if (token.includes(',')) {
    token = token.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (token.match(/\./g) || []).length;
    if (dotCount > 1 || /^-?\d{1,3}\.\d{3}$/.test(token)) token = token.replace(/\./g, '');
  }
  const number = Number(token);
  return Number.isFinite(number) ? number : null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function absoluteUrl(value, baseUrl = STIHL_BR_SOURCE.base_url) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractModelIdentity(productName) {
  const text = String(productName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const prefixPattern = MODEL_PREFIXES.join('|');
  const expression = new RegExp(`\\b(${prefixPattern})\\s*[- ]?\\s*(\\d{1,4})(?:\\s+([A-Z](?:-[A-Z]+)?))?\\b`);
  const match = text.match(expression);
  if (!match) return { model_name: null, model_slug: null, family: null };
  const suffix = match[3] ? ` ${match[3]}` : '';
  const modelName = `${match[1]} ${match[2]}${suffix}`.replace(/\s+/g, ' ').trim();
  return {
    model_name: modelName,
    model_slug: modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    family: match[1]
  };
}

function flattenSpecValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(' / ');
  if (value == null) return '';
  return String(value);
}

export function extractRawSpecifications(product) {
  const names = Array.isArray(product?.allSpecifications) ? product.allSpecifications : [];
  const raw = {};
  for (const name of names) {
    const value = product?.[name];
    if (value != null && value !== '') raw[name] = flattenSpecValue(value);
  }

  if (Object.keys(raw).length === 0) {
    const ignored = new Set([
      'productId', 'productName', 'brand', 'brandId', 'brandImageUrl', 'linkText', 'productReference',
      'productReferenceCode', 'categoryId', 'productTitle', 'metaTagDescription', 'releaseDate', 'clusterHighlights',
      'productClusters', 'searchableClusters', 'categories', 'categoriesIds', 'link', 'allSpecifications',
      'allSpecificationsGroups', 'description', 'items'
    ]);
    for (const [key, value] of Object.entries(product || {})) {
      if (ignored.has(key)) continue;
      if (!Array.isArray(value) || value.length === 0) continue;
      if (value.every((entry) => ['string', 'number'].includes(typeof entry))) raw[key] = flattenSpecValue(value);
    }
  }
  return raw;
}

function mapSingleSpec(label, rawValue) {
  const normalizedLabel = normalizeText(label);
  if (normalizedLabel.includes('vibracao') && normalizedLabel.includes('esquerda') && normalizedLabel.includes('direita')) {
    const numbers = String(rawValue).match(/\d+(?:[.,]\d+)?/g) || [];
    const left = numbers[0] ? parseLocaleNumber(numbers[0]) : null;
    const right = numbers[1] ? parseLocaleNumber(numbers[1]) : null;
    return [
      left == null ? null : ['vibration_left_m_s2', { value: left, unit: 'm/s2', raw: rawValue, source_label: label }],
      right == null ? null : ['vibration_right_m_s2', { value: right, unit: 'm/s2', raw: rawValue, source_label: label }]
    ].filter(Boolean);
  }

  for (const alias of SPEC_ALIASES) {
    if (!alias.match.some((needle) => normalizedLabel.includes(needle))) continue;
    if (alias.rawOnly) {
      return [[alias.field, { value: String(rawValue).trim(), unit: alias.unit, raw: rawValue, source_label: label }]];
    }
    const parsed = parseLocaleNumber(rawValue);
    if (parsed == null) return [];
    return [[alias.field, {
      value: alias.scale ? parsed * alias.scale : parsed,
      unit: alias.unit,
      raw: rawValue,
      source_label: label
    }]];
  }
  return [];
}

export function normalizeSpecifications(rawSpecifications) {
  const canonical = {};
  for (const [label, rawValue] of Object.entries(rawSpecifications || {})) {
    for (const [field, payload] of mapSingleSpec(label, rawValue)) {
      if (!(field in canonical)) canonical[field] = payload;
    }
  }
  return canonical;
}

function extractImages(product) {
  const urls = [];
  for (const item of product?.items || []) {
    for (const image of item?.images || []) urls.push(image?.imageUrl || image?.imageTag || null);
  }
  return unique(urls.map((url) => absoluteUrl(url)).filter(Boolean));
}

function extractPrice(product) {
  const prices = [];
  for (const item of product?.items || []) {
    for (const seller of item?.sellers || []) {
      const offer = seller?.commertialOffer || seller?.commercialOffer;
      if (Number.isFinite(offer?.Price)) prices.push(offer.Price);
    }
  }
  return prices.length ? Math.min(...prices) : null;
}

function categoryFromProduct(product) {
  const categories = Array.isArray(product?.categories) ? product.categories : [];
  const parts = categories
    .flatMap((entry) => String(entry).split('/'))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.at(-1) || null;
}

export function transformVtexProduct(product, retrievedAt = new Date().toISOString()) {
  const identity = extractModelIdentity(product?.productName || product?.productTitle || '');
  const rawSpecifications = extractRawSpecifications(product);
  const canonicalSpecs = normalizeSpecifications(rawSpecifications);
  const productUrl = absoluteUrl(product?.link || (product?.linkText ? `/${product.linkText}/p` : null));

  return {
    candidate_id: stableHash({
      source: STIHL_BR_SOURCE.source_id,
      product_id: product?.productId || null,
      reference: product?.productReference || null,
      link: productUrl
    }).slice(0, 20),
    promotion_status: 'CANDIDATE_REVIEW_REQUIRED',
    display_eligible: false,
    single_value_eligible: false,
    market: STIHL_BR_SOURCE.market,
    language: STIHL_BR_SOURCE.language,
    source_class: STIHL_BR_SOURCE.source_class,
    source_url: productUrl,
    source_retrieved_at: retrievedAt,
    source_payload_sha256: stableHash(product),
    product_id: product?.productId ? String(product.productId) : null,
    product_reference: product?.productReference || product?.productReferenceCode || null,
    product_name: product?.productName || product?.productTitle || null,
    model_name: identity.model_name,
    model_slug: identity.model_slug,
    model_family: identity.family,
    category: categoryFromProduct(product),
    description: product?.description || product?.metaTagDescription || null,
    price_brl: extractPrice(product),
    raw_specifications: rawSpecifications,
    canonical_specs: canonicalSpecs,
    image_urls: extractImages(product),
    manual_urls: []
  };
}

export function extractManualLinksFromHtml(html, pageUrl = STIHL_BR_SOURCE.base_url) {
  const text = String(html || '');
  const links = [];
  const hrefExpression = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefExpression.exec(text))) {
    const href = match[1];
    const context = text.slice(Math.max(0, match.index - 240), Math.min(text.length, hrefExpression.lastIndex + 240));
    if (!/\.pdf(?:[?#]|$)/i.test(href) && !/manual|instru[cç][aã]o/i.test(context)) continue;
    const url = absoluteUrl(href, pageUrl);
    if (url) links.push(url);
  }
  return unique(links);
}

export async function enrichCandidateFromProductPage(candidate, { fetchImpl = globalThis.fetch } = {}) {
  if (!candidate?.source_url || typeof fetchImpl !== 'function') return candidate;
  const response = await fetchImpl(candidate.source_url, {
    headers: { 'accept': 'text/html,application/xhtml+xml', 'user-agent': 'STIHLDecoderOfficialHarvester/1.0 (+https://www.stihldecoder.nl)' }
  });
  if (!response.ok) throw new Error(`Product page request failed (${response.status}) for ${candidate.source_url}`);
  const html = await response.text();
  const manualUrls = extractManualLinksFromHtml(html, candidate.source_url);
  const referenceMatch = html.match(/(?:Ref(?:er[eê]ncia)?)[\s:]*([0-9]{4}[- ][0-9]{3}[- ][0-9]{4})/i);
  return {
    ...candidate,
    product_reference: candidate.product_reference || (referenceMatch ? referenceMatch[1].replace(/\s+/g, '-') : null),
    manual_urls: manualUrls,
    product_page_sha256: crypto.createHash('sha256').update(html).digest('hex')
  };
}

async function fetchWithRetry(url, options, { fetchImpl = globalThis.fetch, retries = 3 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available');
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, options);
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await sleep(300 * (2 ** (attempt - 1)));
  }
  throw lastError;
}

export async function fetchCatalogPage({ from = 0, to = 49, fetchImpl = globalThis.fetch } = {}) {
  const url = new URL(STIHL_BR_SOURCE.catalog_endpoint, STIHL_BR_SOURCE.base_url);
  url.searchParams.set('_from', String(from));
  url.searchParams.set('_to', String(to));
  const response = await fetchWithRetry(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'STIHLDecoderOfficialHarvester/1.0 (+https://www.stihldecoder.nl)'
    }
  }, { fetchImpl });
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Unexpected VTEX catalog response: array expected');
  return data;
}

export async function harvestOfficialCatalog({
  fetchImpl = globalThis.fetch,
  pageSize = 50,
  maxProducts = 1000,
  enrichPages = false,
  retrievedAt = new Date().toISOString()
} = {}) {
  const rawProducts = [];
  for (let from = 0; from < maxProducts; from += pageSize) {
    const page = await fetchCatalogPage({ from, to: Math.min(from + pageSize - 1, maxProducts - 1), fetchImpl });
    rawProducts.push(...page);
    if (page.length < pageSize) break;
  }

  const seen = new Set();
  const products = [];
  for (const rawProduct of rawProducts) {
    let candidate = transformVtexProduct(rawProduct, retrievedAt);
    const dedupeKey = candidate.product_id || candidate.product_reference || candidate.source_url || candidate.candidate_id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (enrichPages) {
      try {
        candidate = await enrichCandidateFromProductPage(candidate, { fetchImpl });
      } catch (error) {
        candidate = { ...candidate, enrichment_error: error.message };
      }
    }
    products.push(candidate);
  }

  return {
    schema_version: 'stihl-official-candidate-v1',
    generated_at: retrievedAt,
    write_policy: 'CANDIDATE_ONLY_NO_CANONICAL_MUTATION',
    source: STIHL_BR_SOURCE,
    stats: {
      product_count: products.length,
      identified_model_count: products.filter((product) => product.model_slug).length,
      technical_spec_product_count: products.filter((product) => Object.keys(product.canonical_specs || {}).length > 0).length,
      manual_link_product_count: products.filter((product) => product.manual_urls?.length > 0).length
    },
    products
  };
}

export function writeCandidateStore(store, outputPath = path.join(rootDir, 'data', 'candidates', 'stihl_br_official_products.json')) {
  const resolved = path.resolve(outputPath);
  const allowedRoot = path.resolve(rootDir, 'data', 'candidates') + path.sep;
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error(`Refusing to write outside candidate staging directory: ${resolved}`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return resolved;
}

function parseCliArgs(argv) {
  const options = { write: false, enrichPages: false, maxProducts: 1000 };
  for (const arg of argv) {
    if (arg === '--write') options.write = true;
    else if (arg === '--enrich-pages') options.enrichPages = true;
    else if (arg.startsWith('--max=')) options.maxProducts = Math.max(1, Number(arg.slice(6)) || 1000);
    else if (arg.startsWith('--output=')) options.outputPath = path.resolve(rootDir, arg.slice(9));
  }
  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const store = await harvestOfficialCatalog({
    enrichPages: options.enrichPages,
    maxProducts: options.maxProducts
  });
  if (options.write) {
    const target = writeCandidateStore(store, options.outputPath);
    console.log(`STIHL official candidate store written: ${target}`);
  } else {
    console.log(JSON.stringify({ schema_version: store.schema_version, source: store.source.source_id, stats: store.stats }, null, 2));
    console.log('Dry run only. Use --write to persist candidate data.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
