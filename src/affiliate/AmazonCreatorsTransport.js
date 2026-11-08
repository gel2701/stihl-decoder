const TOKEN_URL = 'https://api.amazon.co.uk/auth/o2/token';
const API_URL = 'https://creatorsapi.amazon/catalog/v1/';
const MAX_BYTES = 1024 * 1024;
const MARKETPLACES = { 'amazon.nl': 'www.amazon.nl', 'amazon.de': 'www.amazon.de' };

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validString(value) {
  return typeof value === 'string' && !!value.trim() && value === value.trim();
}

async function readJson(response, url) {
  if (response.redirected || (response.url && response.url !== url)) throw fail('CREATORS_REDIRECT');
  if (response.status === 401 || response.status === 403) throw fail('CREATORS_AUTH_ERROR');
  if (response.status === 429) throw fail('CREATORS_RATE_LIMITED');
  if (response.status >= 500) throw fail('CREATORS_SERVER_ERROR');
  if (!response.ok) throw fail('CREATORS_HTTP_ERROR');
  if (Number(response.headers?.get?.('content-length')) > MAX_BYTES) throw fail('CREATORS_INVALID_RESPONSE');
  let text;
  try {
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_BYTES) throw fail('CREATORS_INVALID_RESPONSE');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } else {
      text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw fail('CREATORS_INVALID_RESPONSE');
    }
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail('CREATORS_INVALID_RESPONSE');
    return data;
  } catch {
    throw fail('CREATORS_INVALID_RESPONSE');
  }
}

export function createAmazonCreatorsTransport({ enabled = false, credentialVersion, clientId, clientSecret, marketplace, partnerTag, fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
  if (enabled !== true) return async () => { throw fail('CREATORS_DISABLED'); };
  if (credentialVersion !== '3.2' || !validString(clientId) || !validString(clientSecret) ||
      !Object.hasOwn(MARKETPLACES, marketplace) || !validString(partnerTag) ||
      typeof fetcher !== 'function' || typeof now !== 'function') throw fail('CREATORS_INVALID_CONFIG');
  const domain = MARKETPLACES[marketplace];
  let token;
  let expires = 0;
  let pending;
  const post = async (url, body, headers) => {
    let response;
    try {
      response = await fetcher(url, {
        method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw fail('CREATORS_NETWORK_ERROR');
    }
    return readJson(response, url);
  };
  const accessToken = async () => {
    if (token && now() < expires) return token;
    if (!pending) pending = (async () => {
      const data = await post(TOKEN_URL, {
        grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
        scope: 'creatorsapi::default'
      });
      if (!validString(data.access_token) || data.token_type?.toLowerCase() !== 'bearer' ||
          !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw fail('CREATORS_INVALID_RESPONSE');
      token = data.access_token;
      expires = now() + Math.max(0, data.expires_in * 1000 - 60000);
      return token;
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return async ({ operation, marketplace: requestedMarketplace, partnerTag: requestedTag, params } = {}) => {
    if (requestedMarketplace !== marketplace || requestedTag !== partnerTag ||
        !params || typeof params !== 'object' || Array.isArray(params) ||
        Object.getPrototypeOf(params) !== Object.prototype ||
        !Array.isArray(params.resources) || !params.resources.length ||
        !params.resources.every(value => validString(value) && /^[a-zA-Z][a-zA-Z0-9.]*$/.test(value))) {
      throw fail('CREATORS_INVALID_REQUEST');
    }
    let body;
    let path;
    if (operation === 'GetItems' && Array.isArray(params.itemIds) &&
        params.itemIds.length >= 1 && params.itemIds.length <= 10 &&
        params.itemIds.every(id => typeof id === 'string' && /^[A-Z0-9]{10}$/.test(id)) &&
        Object.keys(params).every(key => ['itemIds', 'resources'].includes(key))) {
      path = 'getItems';
      body = { itemIds: params.itemIds, itemIdType: 'ASIN' };
    } else if (operation === 'SearchItems' && validString(params.keywords) &&
               Object.keys(params).every(key => ['keywords', 'resources'].includes(key))) {
      path = 'searchItems';
      body = { keywords: params.keywords };
    } else throw fail('CREATORS_INVALID_REQUEST');
    const access = await accessToken();
    const data = await post(API_URL + path, { ...body, marketplace: domain, partnerTag, resources: params.resources },
      { Authorization: `Bearer ${access}`, 'x-marketplace': domain });
    const result = path === 'getItems' ? data.itemsResult : data.searchResult;
    if (!result || !Array.isArray(result.items) || result.items.length > 10) throw fail('CREATORS_INVALID_RESPONSE');
    return data;
  };
}
