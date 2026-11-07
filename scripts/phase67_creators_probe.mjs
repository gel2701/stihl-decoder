import { pathToFileURL } from 'node:url';
import { AmazonCreatorsClient } from '../src/affiliate/AmazonCreatorsClient.js';
import { createAmazonCreatorsTransport } from '../src/affiliate/AmazonCreatorsTransport.js';

const RESOURCES = ['itemInfo.title', 'itemInfo.byLineInfo', 'itemInfo.externalIds', 'itemInfo.productInfo'];
const SAFE_ERRORS = new Set(['CREATORS_AUTH_ERROR', 'CREATORS_RATE_LIMITED', 'CREATORS_QUOTA_EXCEEDED', 'CREATORS_INVALID_RESPONSE', 'CREATORS_NETWORK_ERROR', 'CREATORS_SERVER_ERROR', 'CREATORS_HTTP_ERROR', 'CREATORS_REDIRECT', 'CREATORS_CLOCK_ERROR']);

export async function runCreatorsProbe(args = [], { env = process.env, transport: injectedTransport, now = Date.now } = {}) {
  let marketplace;
  let asin;
  let keywords;
  let live = false;
  let preflight = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--marketplace' && marketplace === undefined) marketplace = args[++i];
    else if (arg === '--asin' && asin === undefined) asin = args[++i];
    else if (arg === '--keywords' && keywords === undefined) keywords = args[++i];
    else if (arg === '--live' && !live) live = true;
    else if (arg === '--preflight' && !preflight) preflight = true;
    else return { status: 'INVALID_ARGUMENTS', marketplace: null, count: 0 };
  }
  if (!['amazon.nl', 'amazon.de'].includes(marketplace) || (asin !== undefined && (typeof asin !== 'string' || !/^[A-Z0-9]{10}$/.test(asin))) ||
      (keywords !== undefined && (typeof keywords !== 'string' || keywords !== keywords.trim() || !keywords.length || keywords.length > 200 || /[\x00-\x1f\x7f]/.test(keywords))) ||
      (asin !== undefined && keywords !== undefined) || (live && preflight) || (live && asin === undefined && keywords === undefined)) {
    return { status: 'INVALID_ARGUMENTS', marketplace: ['amazon.nl', 'amazon.de'].includes(marketplace) ? marketplace : null, count: 0 };
  }
  const tagKey = marketplace === 'amazon.nl' ? 'AMAZON_CREATORS_PARTNER_TAG_NL' : 'AMAZON_CREATORS_PARTNER_TAG_DE';
  const keys = ['AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', tagKey, 'AMAZON_CREATORS_CREDENTIAL_VERSION'];
  const missingEnvKeys = keys.filter(key => typeof env[key] !== 'string' || !env[key].trim() || env[key] !== env[key].trim() ||
    (key === 'AMAZON_CREATORS_CREDENTIAL_VERSION' && env[key] !== '3.2'));
  if (missingEnvKeys.length) return { status: { code: 'MISSING_ENV', missingEnvKeys }, marketplace, count: 0 };
  if (!live) return { status: 'READY', marketplace, count: 0 };

  let transportError;
  try {
    const transport = injectedTransport ?? createAmazonCreatorsTransport({
      enabled: true, credentialVersion: env.AMAZON_CREATORS_CREDENTIAL_VERSION,
      clientId: env.AMAZON_CREATORS_CLIENT_ID, clientSecret: env.AMAZON_CREATORS_CLIENT_SECRET,
      partnerTag: env[tagKey], marketplace
    });
    if (typeof transport !== 'function') return { status: 'CREATORS_INVALID_CONFIG', marketplace, count: 0 };
    const client = new AmazonCreatorsClient({
      enabled: true, transport: async request => {
        try { return await transport(request); }
        catch (error) { transportError = SAFE_ERRORS.has(error?.code) ? error.code : 'CREATORS_TRANSPORT_ERROR'; throw error; }
      }, marketplace, partnerTag: env[tagKey], perSecond: 1, daily: 5, now
    });
    const result = asin === undefined
      ? await client.searchItems({ keywords, resources: RESOURCES })
      : await client.getItems({ itemIds: [asin], resources: RESOURCES });
    const items = (asin === undefined ? result?.searchResult : result?.itemsResult)?.items;
    if (!Array.isArray(items) || items.length > 10) return { status: 'CREATORS_INVALID_RESPONSE', marketplace, count: 0 };
    const candidateAsins = items.map(item => item?.asin);
    if (candidateAsins.some(id => typeof id !== 'string' || !/^[A-Z0-9]{10}$/.test(id))) {
      return { status: 'CREATORS_INVALID_RESPONSE', marketplace, count: 0 };
    }
    return { status: 'CANDIDATES_UNVERIFIED', marketplace, count: candidateAsins.length, candidateAsins };
  } catch (error) {
    return { status: transportError ?? (SAFE_ERRORS.has(error?.code) ? error.code : 'CREATORS_INVALID_CONFIG'), marketplace, count: 0 };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCreatorsProbe(process.argv.slice(2)).then(result => {
    console.log(JSON.stringify(result));
    if (result.status !== 'READY' && result.status !== 'CANDIDATES_UNVERIFIED') process.exitCode = 1;
  });
}
