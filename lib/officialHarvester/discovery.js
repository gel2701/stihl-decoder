/**
 * Official STIHL product catalog discovery (BR market).
 *
 * Primary source: official VTEX sitemap feed
 *   https://loja.stihl.com.br/sitemap/product-0.xml
 * This is a first-party catalog feed and is preferred over DOM scraping.
 * The `todos-os-produtos` HTML page only renders a paginated subset
 * ("Mostrar Mais"), so it is used only as a fallback/supplement.
 *
 * No browser automation. Native fetch only.
 */

export const BR_BASE_URL = 'https://loja.stihl.com.br';
export const BR_SITEMAP_INDEX = `${BR_BASE_URL}/sitemap.xml`;
export const BR_PRODUCT_SITEMAP = `${BR_BASE_URL}/sitemap/product-0.xml`;
export const BR_CATALOG_URL = `${BR_BASE_URL}/todos-os-produtos`;

export const HARVESTER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) STIHLDecoder-OfficialHarvester/1.0 (+https://github.com/gel2701/stihl-decoder)';

export async function fetchText(url, { timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': HARVESTER_USER_AGENT,
      'Accept-Language': 'pt-BR,pt;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return await res.text();
}

export function parseSitemapLocs(xml) {
  const re = new RegExp('<loc>([^<]+)</loc>', 'g');
  return [...xml.matchAll(re)].map((m) => m[1].trim()).filter(Boolean);
}

/** Keep only real product pages: same host, path ending in /p (VTEX product route). */
export function isProductUrl(url) {
  let parsed;
  try {
    parsed = new URL(url, BR_BASE_URL);
  } catch {
    return false;
  }
  if (parsed.hostname !== 'loja.stihl.com.br' && parsed.hostname !== 'www.loja.stihl.com.br') return false;
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/p')) return false;
  if (path.split('/').length !== 3) return false; // /<slug>/p only
  const slug = path.split('/')[1];
  if (!slug || slug.length < 3) return false;
  // Exclude known non-product routes that still match /p shape (defensive).
  const lower = slug.toLowerCase();
  if (/(busca|checkout|account|login|quick-view|espiar|buscapagina)/.test(lower)) return false;
  return true;
}

export function normalizeProductUrl(url) {
  const parsed = new URL(url, BR_BASE_URL);
  parsed.hostname = 'loja.stihl.com.br';
  parsed.search = '';
  parsed.hash = '';
  let path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

/** Extract candidate /slug/p links from catalog HTML (fallback source). */
export function extractProductLinksFromHtml(html) {
  const re = new RegExp('href="(/[^"]*/p)"', 'g');
  const out = [];
  for (const m of html.matchAll(re)) {
    try {
      const abs = new URL(m[1], BR_BASE_URL).toString();
      if (isProductUrl(abs)) out.push(normalizeProductUrl(abs));
    } catch {
      // ignore malformed
    }
  }
  return [...new Set(out)].sort();
}

export function buildDiscoveryReport({ catalogUrl, discoveryMethod, discoveredUrls, productUrls }) {
  const unique = [...new Set((productUrls || []).map(normalizeProductUrl))].sort();
  return {
    catalog_url: catalogUrl,
    discovery_method: discoveryMethod,
    discovered_urls: discoveredUrls ?? (productUrls || []).length,
    unique_product_urls: unique.length,
    product_urls: unique,
  };
}

/**
 * Discover all official BR product URLs.
 * Strategy: sitemap index -> product sitemap(s) -> filter. Falls back to
 * catalog HTML when any step fails.
 */
export async function discoverBrCatalog({ fetchImpl = fetchText } = {}) {
  // 1. Try product sitemap directly (deterministic, official feed).
  try {
    const xml = await fetchImpl(BR_PRODUCT_SITEMAP);
    const locs = parseSitemapLocs(xml);
    const products = locs.filter(isProductUrl);
    if (products.length > 0) {
      return buildDiscoveryReport({
        catalogUrl: BR_CATALOG_URL,
        discoveryMethod: 'sitemap:product-0.xml',
        discoveredUrls: locs.length,
        productUrls: products,
      });
    }
  } catch {
    // fall through to index + html fallback
  }

  // 2. Try sitemap index -> every *product* sitemap.
  try {
    const indexXml = await fetchImpl(BR_SITEMAP_INDEX);
    const sitemaps = parseSitemapLocs(indexXml).filter((u) => /sitemap\/product-/.test(u));
    const all = [];
    for (const sm of sitemaps) {
      const xml = await fetchImpl(sm);
      all.push(...parseSitemapLocs(xml));
    }
    const products = all.filter(isProductUrl);
    if (products.length > 0) {
      return buildDiscoveryReport({
        catalogUrl: BR_CATALOG_URL,
        discoveryMethod: 'sitemap:index->product-*.xml',
        discoveredUrls: all.length,
        productUrls: products,
      });
    }
  } catch {
    // fall through
  }

  // 3. Fallback: catalog HTML (paginated subset only — flagged in method).
  const html = await fetchImpl(BR_CATALOG_URL);
  const products = extractProductLinksFromHtml(html);
  return buildDiscoveryReport({
    catalogUrl: BR_CATALOG_URL,
    discoveryMethod: 'html-fallback:todos-os-produtos (paginated subset)',
    discoveredUrls: products.length,
    productUrls: products,
  });
}
