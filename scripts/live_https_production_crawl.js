import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { INDEXABLE_COMPARISONS, getSafeModelSlug } from '../src/publicationRules.js';

const LIVE_ORIGIN = 'https://www.stihldecoder.nl';
const APEX_ORIGIN = 'https://stihldecoder.nl';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'phase34a_live_validation.json');
const PRE_URLS_PATH = path.join(process.cwd(), 'data', 'phase34_pre_urls.json');
const DB_PATH = path.join(process.cwd(), 'data', 'stihl_database.json');

const seedPaths = [
  '/',
  '/kettingzagen/ms-261/',
  '/bosmaaiers/fs-100/',
  '/bosmaaiers/fs-100-rx/',
  '/bladblazers/br-600/',
  '/doorslijpers/ts-420/',
  '/stihl-serienummer-decoder/',
  '/stihl-bouwjaar/',
  '/onderdeelnummer/',
  '/sitemap.xml',
  '/robots.txt',
  '/favicon.ico'
];

const explicitRouteProbes = [
  '/vergelijk/ms-170-vs-ms-180/',
  '/vergelijk/ms-180-vs-ms-170/',
  '/vergelijk/ms-210-vs-ms-170/',
  '/vergelijk/fs-100-vs-fs-350/',
  '/vergelijk/br-700-vs-br-600/'
];

const database = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const models = database.models || [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input) {
  const url = new URL(input, LIVE_ORIGIN);
  url.hash = '';
  url.search = '';
  return url.toString();
}

function pathToUrl(pathName) {
  return normalizeUrl(`${LIVE_ORIGIN}${pathName}`);
}

function getKnownRouteCandidates() {
  const valuationRoutes = models
    .map((model) => getSafeModelSlug(model))
    .filter(Boolean)
    .map((slug) => `/waarde/${slug}/`);

  const comparisonRoutes = INDEXABLE_COMPARISONS.flatMap((comparisonSlug) => {
    const [leftSlug, rightSlug] = comparisonSlug.split('-vs-');
    return [`/vergelijk/${comparisonSlug}/`, `/vergelijk/${rightSlug}-vs-${leftSlug}/`];
  });

  return [...new Set([...valuationRoutes, ...comparisonRoutes, ...explicitRouteProbes])];
}

async function fetchWithRedirects(inputUrl, maxRedirects = 5) {
  const visited = [];
  let currentUrl = normalizeUrl(inputUrl);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let response;
    let body = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'user-agent': 'STIHLDecoder Phase34B Validation Bot/1.0 (+https://www.stihldecoder.nl)'
        }
      });

      body = await response.text();
      if (response.status < 500 || attempt === 2) {
        break;
      }
      await sleep(250 * (attempt + 1));
    }

    visited.push({
      url: currentUrl,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body
    });

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    const location = response.headers.get('location');
    if (!location) {
      break;
    }

    currentUrl = normalizeUrl(new URL(location, currentUrl).toString());
    await sleep(50);
  }

  return visited;
}

function extractMeta(body, name) {
  const regex = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const match = body.match(regex) || body.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'));
  return match ? match[1].trim() : null;
}

function extractCanonical(body) {
  const match = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match ? match[1].trim() : null;
}

function extractTitle(body) {
  const match = body.match(/<title[^>]*>(.*?)<\/title>/is);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

function extractH1(body) {
  const match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function extractJsonLdTypes(body) {
  const types = new Set();
  const scriptMatches = body.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  function visit(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    if (node['@type']) {
      if (Array.isArray(node['@type'])) {
        node['@type'].forEach((value) => types.add(String(value)));
      } else {
        types.add(String(node['@type']));
      }
    }
    Object.values(node).forEach(visit);
  }

  for (const scriptTag of scriptMatches) {
    const contentMatch = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!contentMatch) continue;
    try {
      visit(JSON.parse(contentMatch[1].trim()));
    } catch {
      // Ignore malformed JSON-LD in type summary.
    }
  }

  return [...types].sort();
}

function extractInternalLinks(body) {
  const links = [];
  const hrefMatches = body.match(/<a\b[^>]*href=["']([^"']+)["']/gi) || [];
  for (const match of hrefMatches) {
    const href = match.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }
    if (href.startsWith('/')) {
      links.push(normalizeUrl(href));
      continue;
    }
    if (href.startsWith(LIVE_ORIGIN) || href.startsWith(APEX_ORIGIN)) {
      links.push(normalizeUrl(href));
    }
  }
  return [...new Set(links)];
}

function summarizeResponse(requestedUrl, visited) {
  const finalResponse = visited[visited.length - 1];
  const redirectCount = visited.length - 1;
  const body = finalResponse.body;
  const contentType = finalResponse.headers['content-type'] || null;
  const isHtml = String(contentType).includes('text/html');
  const internalLinks = isHtml ? extractInternalLinks(body) : [];
  const pathName = new URL(requestedUrl).pathname;
  const robots = isHtml ? (extractMeta(body, 'robots') || finalResponse.headers['x-robots-tag'] || null) : (finalResponse.headers['x-robots-tag'] || null);

  return {
    url: requestedUrl,
    path: pathName,
    initial_status: visited[0]?.status || finalResponse.status,
    http_status: finalResponse.status,
    final_url: finalResponse.url,
    redirect_count: redirectCount,
    title: isHtml ? extractTitle(body) : null,
    meta_description: isHtml ? extractMeta(body, 'description') : null,
    canonical: isHtml ? extractCanonical(body) : null,
    robots,
    h1: isHtml ? extractH1(body) : null,
    h1_count: isHtml ? (body.match(/<h1\b/gi) || []).length : 0,
    json_ld_types: isHtml ? extractJsonLdTypes(body) : [],
    tailwind_cdn: isHtml ? body.includes('https://cdn.tailwindcss.com') : false,
    local_css: isHtml ? body.includes('/css/tailwind.css') : false,
    internal_link_count: internalLinks.length,
    internal_links: internalLinks,
    content_type: contentType
  };
}

function classifyPath(pathname) {
  if (pathname === '/') return 'HOME';
  if (pathname === '/onderdeelnummer/') return 'PARTS';
  if (/^\/onderdeelnummer\/stihl-[^/]+\/$/.test(pathname)) return 'PARTS';
  if (pathname.startsWith('/vergelijk/')) return 'COMPARISONS';
  if (pathname.startsWith('/gidsen/')) return 'GUIDES';
  if (pathname.startsWith('/waarde/')) return 'VALUATION';
  if (pathname === '/kettingzagen/' || pathname === '/bosmaaiers/' || pathname === '/bladblazers/' || pathname === '/heggenscharen/' || pathname === '/doorslijpers/') return 'CATEGORIES';
  if (/^\/(kettingzagen|bosmaaiers|bladblazers|heggenscharen|doorslijpers)\/[^/]+\/$/.test(pathname)) return 'MODELS';
  if (/^\/(kettingzagen|bosmaaiers|bladblazers|heggenscharen|doorslijpers)\/[^/]+\/onderdelen\/$/.test(pathname)) return 'PARTS';
  if (/^\/(stihl-|waar-staat-serienummer-stihl)/.test(pathname)) return 'INTENT';
  return 'OTHER';
}

function buildSeoHash(entry) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: entry.title || '',
    description: entry.meta_description || '',
    h1: entry.h1 || '',
    canonical: entry.canonical || '',
    robots: entry.robots || '',
    jsonLdTypes: entry.json_ld_types || []
  })).digest('hex');
}

async function crawlUrlSet(urls) {
  const queue = [...new Set(urls.map((value) => normalizeUrl(value)))];
  const seen = new Set(queue);
  const results = new Map();

  while (queue.length > 0) {
    const url = queue.shift();
    const visited = await fetchWithRedirects(url);
    const summary = summarizeResponse(url, visited);
    results.set(url, summary);

    if (!String(summary.content_type || '').includes('text/html')) {
      continue;
    }

    for (const link of summary.internal_links) {
      if (seen.has(link)) continue;
      seen.add(link);
      queue.push(link);
    }
  }

  return results;
}

const preUrls = JSON.parse(fs.readFileSync(PRE_URLS_PATH, 'utf8'));

console.log('🌐 Running true HTTPS production crawl against https://www.stihldecoder.nl ...');

const seedResults = [];
for (const pathName of seedPaths) {
  const visited = await fetchWithRedirects(pathToUrl(pathName));
  seedResults.push(summarizeResponse(pathToUrl(pathName), visited));
}

const sitemapFetch = await fetchWithRedirects(`${LIVE_ORIGIN}/sitemap.xml`);
const sitemapBody = sitemapFetch[sitemapFetch.length - 1].body;
const sitemapUrls = [...sitemapBody.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => normalizeUrl(match[1]));
const crawlCandidates = [
  ...seedPaths.map(pathToUrl),
  ...sitemapUrls,
  ...getKnownRouteCandidates().map(pathToUrl)
];

const crawlResultsMap = await crawlUrlSet(crawlCandidates);
const crawlResults = [...crawlResultsMap.values()].sort((a, b) => a.path.localeCompare(b.path));
const pageResults = sitemapUrls
  .map((url) => crawlResultsMap.get(url))
  .filter(Boolean)
  .sort((a, b) => a.path.localeCompare(b.path));

const htmlPages = crawlResults.filter((entry) => String(entry.content_type || '').includes('text/html'));
const uniqueInternalLinks = new Set();
for (const entry of htmlPages) {
  for (const link of entry.internal_links) {
    uniqueInternalLinks.add(link);
  }
}

const internalLinkAudit = [...uniqueInternalLinks]
  .sort()
  .map((url) => {
    const entry = crawlResultsMap.get(url);
    return entry ? {
      url,
      requested_status: entry.initial_status,
      final_url: entry.final_url,
      status: entry.http_status,
      redirect_count: entry.redirect_count,
      robots: entry.robots
    } : {
      url,
      final_url: null,
      status: 0,
      redirect_count: 0,
      robots: null
    };
  });

const internalLinkSummary = internalLinkAudit.reduce((acc, entry) => {
  if (entry.status === 200) acc['200'] += 1;
  else if (entry.status === 301) acc['301'] += 1;
  else if (entry.status === 404) acc['404'] += 1;
  else acc.other += 1;
  if (entry.redirect_count > 1) acc.redirectChains += 1;
  return acc;
}, { '200': 0, '301': 0, '404': 0, other: 0, redirectChains: 0 });

const indexableToNoindexLinks = [];
for (const entry of htmlPages) {
  const sourceIndexable = !String(entry.robots || 'index, follow').toLowerCase().includes('noindex');
  if (!sourceIndexable) continue;
  for (const link of entry.internal_links) {
    const target = crawlResultsMap.get(link);
    if (target && String(target.robots || '').toLowerCase().includes('noindex')) {
      indexableToNoindexLinks.push({ from: entry.url, to: link });
    }
  }
}

const discoveredIndexableUrls = htmlPages
  .filter((entry) => (
    entry.http_status === 200
    && entry.redirect_count === 0
    && normalizeUrl(entry.final_url) === entry.url
    && !String(entry.robots || 'index, follow').toLowerCase().includes('noindex')
  ))
  .map((entry) => ({
    ...entry,
    seo_hash: buildSeoHash(entry)
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

const websiteSchemaCount = (() => {
  const home = crawlResultsMap.get(`${LIVE_ORIGIN}/`);
  return home ? home.json_ld_types.filter((type) => type === 'WebSite').length : 0;
})();

const apexVisited = await fetchWithRedirects(`${APEX_ORIGIN}/`);
const wwwVisited = await fetchWithRedirects(`${LIVE_ORIGIN}/`);

const inventory = discoveredIndexableUrls.reduce((acc, entry) => {
  const bucket = classifyPath(new URL(entry.url).pathname);
  if (bucket === 'VALUATION') {
    const isNoindex = String(entry.robots || '').toLowerCase().includes('noindex');
    acc[isNoindex ? 'VALUATION_NOINDEX' : 'VALUATION_INDEXABLE'] += 1;
  } else {
    acc[bucket] += 1;
  }
  return acc;
}, {
  HOME: 0,
  CATEGORIES: 0,
  MODELS: 0,
  PARTS: 0,
  COMPARISONS: 0,
  INTENT: 0,
  GUIDES: 0,
  VALUATION_INDEXABLE: 0,
  VALUATION_NOINDEX: 0,
  OTHER: 0
});

const knownRouteAudit = getKnownRouteCandidates()
  .map(pathToUrl)
  .map((url) => {
    const entry = crawlResultsMap.get(url);
    return {
      url,
      requested_status: entry?.initial_status || 0,
      status: entry?.http_status || 0,
      final_url: entry?.final_url || null,
      redirect_count: entry?.redirect_count || 0,
      robots: entry?.robots || null
    };
  });

const result = {
  generated_at: new Date().toISOString(),
  validation_target: LIVE_ORIGIN,
  localhost_mislabel_fixed: true,
  seed_paths: seedPaths,
  seed_results: seedResults,
  sitemap_url_count: sitemapUrls.length,
  pre_url_count: preUrls.total_count,
  url_delta: {
    added: sitemapUrls.filter((url) => !preUrls.urls.includes(url)),
    removed: preUrls.urls.filter((url) => !sitemapUrls.includes(url))
  },
  inventory,
  page_results: pageResults.map((entry) => ({
    ...entry,
    seo_hash: buildSeoHash(entry)
  })),
  crawled_results: crawlResults.map((entry) => ({
    ...entry,
    seo_hash: buildSeoHash(entry)
  })),
  discovered_indexable_urls: discoveredIndexableUrls,
  discovered_indexable_total: discoveredIndexableUrls.length,
  homepage_website_schema_count: websiteSchemaCount,
  topology: {
    www: {
      status: wwwVisited[wwwVisited.length - 1].status,
      final_url: wwwVisited[wwwVisited.length - 1].url,
      redirect_count: wwwVisited.length - 1
    },
    apex: {
      status: apexVisited[0].status,
      final_url: apexVisited[apexVisited.length - 1].url,
      redirect_count: apexVisited.length - 1,
      redirect_chain: apexVisited.map((step) => ({ url: step.url, status: step.status, location: step.headers.location || null }))
    }
  },
  internal_link_summary: {
    total_unique_internal_links: uniqueInternalLinks.size,
    ...internalLinkSummary
  },
  indexable_to_noindex_links: indexableToNoindexLinks,
  internal_link_audit: internalLinkAudit,
  known_route_audit: knownRouteAudit,
  sitemap_urls: sitemapUrls
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
console.log(`✅ Wrote ${OUTPUT_PATH}`);
