import { ALLOWED_AMAZON_MARKETPLACES, ASIN_REGEX } from './AmazonProductionOfferContract.js';

export function validateAmazonLink(raw, { marketplace, asin, tag } = {}) {
  let url;
  try {
    if (typeof raw !== 'string') throw new Error();
    url = new URL(raw);
  } catch {
    return { valid: false, reason: 'INVALID_URL' };
  }
  const host = url.hostname.startsWith('www.') ? url.hostname.slice(4) : url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !ALLOWED_AMAZON_MARKETPLACES.has(host) || (marketplace && host !== marketplace)) {
    return { valid: false, reason: 'INVALID_HOST' };
  }
  const tags = url.searchParams.getAll('tag');
  if (tags.length !== 1 || !tags[0] || (tag && tags[0] !== tag)) return { valid: false, reason: 'INVALID_TAG' };
  const match = /^\/(?:dp|gp\/product)\/([A-Z0-9]{10})\/?$/.exec(url.pathname);
  if (match) {
    if (!ASIN_REGEX.test(match[1]) || (asin && match[1] !== asin)) return { valid: false, reason: 'PRODUCT_MISMATCH' };
    return { valid: true, kind: 'PRODUCT', url: raw, asin: match[1] };
  }
  if (url.pathname === '/s' && !asin && url.searchParams.getAll('k').length === 1 && url.searchParams.get('k')) {
    return { valid: true, kind: 'SEARCH_FALLBACK', url: raw };
  }
  return { valid: false, reason: asin ? 'PRODUCT_MISMATCH' : 'INVALID_PATH' };
}

export function extractAmazonAsin(raw) {
  const result = validateAmazonLink(raw);
  return result.valid && result.kind === 'PRODUCT' ? result.asin : null;
}

export function normalizeAmazonUrl(raw, expected = {}) {
  const result = validateAmazonLink(raw, expected);
  if (!result.valid) return null;
  const url = new URL(raw);
  url.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : url.hostname;
  return url.href;
}

export function classifyAmazonResponse(response, expected = {}) {
  if (!response || typeof response !== 'object') return 'UNKNOWN';
  if (response.error || [401, 403, 408, 429].includes(response.status) || response.status >= 500) return 'TEMPORARY_FAILURE';
  if (response.status === 404 || response.available === false) return 'UNAVAILABLE';
  if (response.status !== 200) return 'UNKNOWN';
  if (response.url) {
    const result = validateAmazonLink(response.url, expected);
    if (!result.valid) return result.reason === 'PRODUCT_MISMATCH' ? 'PRODUCT_MISMATCH' : 'WARNING';
    if (expected.asin && result.kind !== 'PRODUCT') return 'PRODUCT_MISMATCH';
  }
  if (response.asin && expected.asin && response.asin !== expected.asin) return 'PRODUCT_MISMATCH';
  if (response.part_number && expected.part_number && response.part_number !== expected.part_number) return 'PRODUCT_MISMATCH';
  if (!response.asin || !expected.asin) return 'UNKNOWN';
  return response.warning ? 'WARNING' : 'HEALTHY';
}
