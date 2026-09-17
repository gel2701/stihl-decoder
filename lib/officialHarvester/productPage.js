/**
 * Official STIHL BR product page parser.
 * Sources per page:
 *  - JSON-LD (schema.org Product): name, mpn (STIHL article number), image, description
 *  - VTEX TechnicalSpecificationName/Value pairs: raw_specs
 *  - Manual links (linkManual + /arquivos/*.pdf anchors)
 *  - Product images (/arquivos/ids/...) with UI-asset filtering + &amp; normalization
 *
 * Pure string/regex parsing — no DOM library, no browser.
 */

export const BR_BASE_URL = 'https://loja.stihl.com.br';

export function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function parseJsonLdProduct(html) {
  const re = new RegExp('<script[^>]*type="application/ld\\+json"[^>]*>([\\s\\S]*?)</script>', 'gi');
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (c && (c['@type'] === 'Product' || (Array.isArray(c['@type']) && c['@type'].includes('Product')))) {
          return c;
        }
      }
    } catch {
      // ignore malformed blocks
    }
  }
  return null;
}

export function parseSpecPairs(html) {
  const re = new RegExp(
    'TechnicalSpecificationName">([^<]+)</span><span[^>]*TechnicalSpecificationValue">([^<]+)</span>',
    'g'
  );
  const specs = {};
  for (const m of html.matchAll(re)) {
    const key = decodeHtmlEntities(m[1]).trim().replace(/\s+/g, ' ');
    const value = decodeHtmlEntities(m[2]).trim().replace(/\s+/g, ' ');
    if (key && value && !(key in specs)) specs[key] = value;
  }
  return specs;
}

/** STIHL article/reference number: prefer JSON-LD mpn, else "Ref:" product identifier. */
export function parseProductReference(html, jsonLd) {
  const mpn = jsonLd && (jsonLd.mpn || jsonLd.sku);
  if (mpn && /^\d{3,4}-\d{3}-\d{3,4}$/.test(String(mpn).trim())) return String(mpn).trim();
  const refRe = new RegExp(
    'product-identifier__label">Ref</span><span[^>]*>:\\s*</span><span[^>]*product-identifier__value">([^<]+)</span>',
    'i'
  );
  const m = html.match(refRe);
  if (m) {
    const v = decodeHtmlEntities(m[1]).trim();
    if (v && v.toLowerCase() !== 'id') return v;
  }
  // VTEX __STATE__ embedded productReferenceCode fallback
  const stateRe = new RegExp('"productReference(?:Code)?":"([^"]+)"');
  const s = html.match(stateRe);
  if (s && /^[A-Z0-9][A-Z0-9 ._-]{2,}$/i.test(s[1])) return s[1].trim();
  if (mpn && String(mpn).trim()) return String(mpn).trim();
  return null;
}

export function parseTitle(html, jsonLd) {
  if (jsonLd && jsonLd.name) return decodeHtmlEntities(jsonLd.name).trim();
  const h1Re = new RegExp('<h1[^>]*>([\\s\\S]*?)</h1>', 'i');
  const h1 = html.match(h1Re);
  if (h1) {
    const text = h1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return decodeHtmlEntities(text);
  }
  return null;
}

export function parseDescription(html, jsonLd) {
  if (jsonLd && jsonLd.description) return decodeHtmlEntities(jsonLd.description).trim().slice(0, 2000);
  return null;
}

/**
 * Extract official model name from a title like
 * "Motosserra a combustão MS 162" -> "MS 162".
 * Returns null when no STIHL-like model token is found.
 */
export function extractModelName(title) {
  if (!title) return null;
  const clean = String(title).replace(/\s+/g, ' ').trim();
  // Prefer the LAST strong model token (titles start with category words).
  const re = /\b([A-Z]{1,4}\s?\d{2,4}(?:[\s./-]*[A-Z0-9]+(?:[\s-][A-Z0-9]+){0,3})?)\b/g;
  const hits = [...clean.matchAll(re)]
    .map((m) => m[1].replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim())
    .filter((h) => /\d/.test(h) && h.length >= 3 && h.length <= 24);
  if (hits.length === 0) return null;
  // Drop pure-number fragments; prefer tokens with a letter prefix.
  const withLetters = hits.filter((h) => /^[A-Z]{1,4}\s?\d/.test(h));
  const pool = withLetters.length > 0 ? withLetters : hits;
  return pool[pool.length - 1].replace(/\s*\/\s*/g, ' / ');
}

const IMAGE_EXCLUDE_RE =
  /(login-icon|file-manager-graphql|vtex\.assets-builder|sprite|spinner|placeholder|logo|icon-|-icon|favicon|payment|social|flag|banner)/i;

export function isProductImageUrl(url) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg')) return false;
  if (IMAGE_EXCLUDE_RE.test(url)) return false;
  // Genuine VTEX product media lives under /arquivos/ids/.
  if (!/\/arquivos\/ids\//.test(url)) return false;
  return true;
}

export function normalizeImageUrl(url) {
  let u = decodeHtmlEntities(url).trim();
  // Dedupe thumbnails: drop resize params, keep the media id + version.
  try {
    const parsed = new URL(u);
    const idMatch = parsed.pathname.match(/\/arquivos\/ids\/(\d+)/);
    if (idMatch) {
      const v = parsed.searchParams.get('v');
      return `https://stihlferramentas.vtexassets.com/arquivos/ids/${idMatch[1]}${v ? `?v=${v}` : ''}`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return u;
  }
}

export function parseImages(html, jsonLd) {
  const found = [];
  if (jsonLd && jsonLd.image) {
    const list = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
    for (const img of list) {
      const u = typeof img === 'string' ? img : img && img.url;
      if (u) found.push(decodeHtmlEntities(u).trim());
    }
  }
  const imgRe = new RegExp('<img[^>]+src="([^"]+)"', 'gi');
  for (const m of html.matchAll(imgRe)) found.push(decodeHtmlEntities(m[1]).trim());
  // <a href to full-size images>
  const aImgRe = new RegExp('href="((?:https?:)?//[^"]*?/arquivos/ids/[^"]+)"', 'gi');
  for (const m of html.matchAll(aImgRe)) {
    const u = m[1].startsWith('//') ? `https:${m[1]}` : m[1];
    found.push(decodeHtmlEntities(u).trim());
  }
  const seen = new Set();
  const out = [];
  for (const raw of found) {
    if (!isProductImageUrl(raw)) continue;
    const norm = normalizeImageUrl(raw);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export function parseManuals(html, pageUrl) {
  const found = [];
  const push = (href, title) => {
    let abs;
    try {
      abs = new URL(decodeHtmlEntities(href).trim(), pageUrl).toString();
    } catch {
      return;
    }
    if (!/\.pdf($|\?)/i.test(abs)) return;
    // Only official STIHL hosts.
    let host;
    try {
      host = new URL(abs).hostname;
    } catch {
      return;
    }
    if (!/(\.|^)(loja\.stihl\.com\.br|stihl\.com|stihl\.com\.br|stihlferramentas\.vtexassets\.com)$/.test(host)) return;
    const cleanTitle = (title || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    const label = /^(baixar|download)?$/i.test(cleanTitle) ? '' : cleanTitle;
    found.push({
      url: abs,
      title: label || 'Official STIHL manual (PDF)',
      source: 'STIHL_OFFICIAL',
      market: 'BR',
    });
  };
  // Preferred: explicit manual download anchors (content may embed a long inline SVG).
  const manualRe = new RegExp(
    '<a[^>]*class="[^"]*linkManual[^"]*"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)</a>',
    'gi'
  );
  for (const m of html.matchAll(manualRe)) push(m[1], m[2]);
  // Supplement: any /arquivos/*.pdf anchor.
  const pdfRe = new RegExp('<a[^>]*href="([^"]*\\.pdf[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
  for (const m of html.matchAll(pdfRe)) push(m[1], m[2]);
  const seen = new Set();
  return found.filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

export function parseProductPage(html, pageUrl) {
  const jsonLd = parseJsonLdProduct(html);
  const title = parseTitle(html, jsonLd);
  return {
    page_url: pageUrl,
    title,
    model_name: extractModelName(title),
    product_reference: parseProductReference(html, jsonLd),
    description: parseDescription(html, jsonLd),
    raw_specs: parseSpecPairs(html),
    manuals: parseManuals(html, pageUrl),
    images: parseImages(html, jsonLd),
    jsonld_name: (jsonLd && jsonLd.name) || null,
  };
}
