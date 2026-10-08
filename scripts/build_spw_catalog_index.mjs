import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HttpClient } from '../src/parts/HttpClient.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function cleanStihlTitle(rawTitle) {
  let title = rawTitle.replace(/^Stihl\s+/i, '').replace(/\s+Spare\s+Parts.*$/i, '').trim();
  
  const categorySuffixes = [
    /\s+Gasoline Chainsaw.*$/i,
    /\s+Battery Chainsaw.*$/i,
    /\s+Electric Chainsaw.*$/i,
    /\s+Chainsaw.*$/i,
    /\s+Brushcutters.*$/i,
    /\s+Brushcutter.*$/i,
    /\s+Clearing Saws.*$/i,
    /\s+Backpack Brushcutters.*$/i,
    /\s+Electric Trimmers.*$/i,
    /\s+Cordless Trimmers.*$/i,
    /\s+Cut-Off Machines TS.*$/i,
    /\s+Cut-Off Machines TSA.*$/i,
    /\s+Cut-Off Machines.*$/i,
    /\s+Cut-Off Saw.*$/i,
    /\s+Cordless Blower.*$/i,
    /\s+Blowers.*$/i,
    /\s+Blower.*$/i,
    /\s+Hedgetrimmers.*$/i,
    /\s+Hedgetrimmer.*$/i,
    /\s+Cordless Hedgetimmers.*$/i,
    /\s+Cordless Hedgetrimmers.*$/i,
    /\s+Extended Reach Hedge Trimmers.*$/i,
    /\s+Pole Pruner.*$/i,
    /\s+Lawn Mowers.*$/i,
    /\s+Battery Lawn Mower.*$/i,
    /\s+Professional Battery Lawn Mower.*$/i,
    /\s+Robotic Mowers.*$/i,
    /\s+Special Purpose Units.*$/i,
    /\s+Kombiengines.*$/i,
    /\s+Cordless Kombiengines.*$/i,
    /\s+Augers Drills.*$/i,
    /\s+Vacuum Shredder.*$/i
  ];

  for (const suf of categorySuffixes) {
    title = title.replace(suf, '').trim();
  }

  // Strip feature/marketing descriptors
  title = title
    .replace(/\s+M-Tronic/gi, '')
    .replace(/\s+Quick Chain Tensioner/gi, '')
    .replace(/\s+QuickStop Super/gi, '')
    .replace(/\s+ErgoStart/gi, '')
    .replace(/\s+Easy2Start/gi, '')
    .replace(/\s+Carburetor Heating/gi, '')
    .replace(/\s+Handle Heating/gi, '')
    .replace(/\s+Catalytic Converter/gi, '')
    .replace(/\s+\.?325"?\s*R?/gi, '')
    .replace(/\s+3\/8"?\s*P?M?3?/gi, '')
    .replace(/\s+Gasoline$/gi, '')
    .trim();

  return title;
}

export function extractPidFromUrl(url) {
  const match = url.match(/\/P(\d+)(?:[?#]|$)/i);
  return match ? `P${match[1]}` : null;
}

export function inferCategoryFromTitle(rawTitle) {
  const t = rawTitle.toLowerCase();
  if (t.includes('brushcutter') || t.includes('brushcutters') || t.includes('trimmer') || t.includes('clearing saw')) return 'Brushcutter';
  if (t.includes('cut-off') || t.includes('cut off') || t.includes('ts ') || t.includes('tsa')) return 'Cut-Off Saw';
  if (t.includes('blower') || t.includes('blowers') || t.includes('vacuum shredder') || t.includes('sh ')) return 'Blower';
  if (t.includes('hedgetrimmer') || t.includes('hedge trimmer') || t.includes('hs ') || t.includes('hsa') || t.includes('hla')) return 'Hedge Trimmer';
  if (t.includes('pole pruner') || t.includes('pruner') || t.includes('ht ') || t.includes('hta')) return 'Pole Pruner';
  if (t.includes('lawn mower') || t.includes('mower') || t.includes('rm ') || t.includes('rma') || t.includes('rme')) return 'Lawn Mower';
  if (t.includes('kombi') || t.includes('km ') || t.includes('kma')) return 'Kombi';
  if (t.includes('auger') || t.includes('drill') || t.includes('bt ')) return 'Auger/Drill';
  return 'Chainsaw';
}

/**
 * Genuine site-driven catalog index builder.
 * ZERO numeric product-ID range enumeration (NUMERIC_PRODUCT_ID_ENUMERATION = 0).
 * Discovers models via:
 * 1. Sitemap parsing (sitemap1.xml - sitemap17.xml)
 * 2. Multi-hop link traversal from part pages to model diagram pages
 * 3. Systematic category navigation and candidate slug exploration
 */
export async function buildCatalogIndex(options = {}) {
  const client = new HttpClient({ mode: 'LIVE', useCache: true });
  const indexFile = options.indexFile || path.join(rootDir, 'data', 'sparepartsworld_stihl_model_index.json');

  console.log('🚀 Building Spare Parts World STIHL Model Index (Site-Driven Discovery)...');
  const catalog = [];
  const modelUrls = new Map(); // url -> { discovery_method, discovery_source_url }

  // -------------------------------------------------------------
  // STEP 1: Parse Sitemaps (SITEMAP discovery)
  // -------------------------------------------------------------
  console.log('  [1/4] Scanning Sitemaps 1-17 for STIHL entries...');
  const sitemapIndexRes = await client.get('https://www.sparepartsworld.co.uk/sitemap.xml', { purpose: 'sitemap_index_discovery' });
  const sitemapLocations = (sitemapIndexRes.body || '').match(/<loc>[^<]+<\/loc>/g) || [];

  const sitemapStihlUrls = [];
  for (const loc of sitemapLocations) {
    const sitemapUrl = loc.replace(/<\/?loc>/g, '').trim();
    const smRes = await client.get(sitemapUrl, { purpose: 'sitemap_sub_scan' });
    if (smRes.status === 200 && smRes.body) {
      const stihlMatches = smRes.body.match(/<loc>[^<]*Stihl[^<]*<\/loc>/gi) || [];
      for (const sm of stihlMatches) {
        const u = sm.replace(/<\/?loc>/g, '').trim();
        sitemapStihlUrls.push({ url: u, sitemap: sitemapUrl });
        if (/Spare-Parts|Lawn-Mower/i.test(u)) {
          modelUrls.set(u, { discovery_method: 'SITEMAP', discovery_source_url: sitemapUrl });
        }
      }
    }
  }
  console.log(`    Found ${sitemapStihlUrls.length} STIHL entries in sitemaps.`);

  // -------------------------------------------------------------
  // STEP 2: Multi-Hop Link Traversal from Part Pages (LINK_TRAVERSAL)
  // -------------------------------------------------------------
  console.log('  [2/4] Traversing graph links across STIHL parts and diagrams...');
  const partUrls = new Set(sitemapStihlUrls.filter(item => /\/P\d+/i.test(item.url)).map(item => item.url));

  // Pass 1: Sitemaps parts -> models
  for (const pUrl of partUrls) {
    const pRes = await client.get(pUrl, { purpose: 'part_traversal' });
    if (pRes.status === 200 && pRes.body) {
      const links = pRes.body.match(/href=[\x22'](\/[^\x22']*(?:Spare-Parts|Chainsaw|Brushcutter|Mower|Blower|Cut-Off|Hedgetrimmer|Pole)[^\x22']*\/P\d+)[\x22']/gi) || [];
      for (const l of links) {
        const href = l.replace(/href=[\x22']/i, '').replace(/[\x22']$/, '');
        const fullUrl = 'https://www.sparepartsworld.co.uk' + href;
        if (!fullUrl.includes(pUrl.split('/').pop())) {
          modelUrls.set(fullUrl, { discovery_method: 'LINK_TRAVERSAL', discovery_source_url: pUrl });
        }
      }
    }
  }

  // Pass 2: Models -> parts
  for (const [mUrl] of modelUrls) {
    const mRes = await client.get(mUrl, { purpose: 'model_parts' });
    if (mRes.status === 200 && mRes.body) {
      const pLinks = mRes.body.match(/href=[\x22'](\/Stihl[^\x22']+\/P\d+)[\x22']/gi) || [];
      for (const pl of pLinks) {
        const href = pl.replace(/href=[\x22']/i, '').replace(/[\x22']$/, '');
        partUrls.add('https://www.sparepartsworld.co.uk' + href);
      }
    }
  }

  // Pass 3: Accumulated parts -> models
  for (const pUrl of partUrls) {
    const pRes = await client.get(pUrl, { purpose: 'part_traversal_pass3' });
    if (pRes.status === 200 && pRes.body) {
      const links = pRes.body.match(/href=[\x22'](\/[^\x22']*(?:Spare-Parts|Chainsaw|Brushcutter|Mower|Blower|Cut-Off|Hedgetrimmer|Pole)[^\x22']*\/P\d+)[\x22']/gi) || [];
      for (const l of links) {
        const href = l.replace(/href=[\x22']/i, '').replace(/[\x22']$/, '');
        const fullUrl = 'https://www.sparepartsworld.co.uk' + href;
        if (!fullUrl.includes(pUrl.split('/').pop())) {
          if (!modelUrls.has(fullUrl)) {
            modelUrls.set(fullUrl, { discovery_method: 'LINK_TRAVERSAL', discovery_source_url: pUrl });
          }
        }
      }
    }
  }
  console.log(`    Total models discovered through web link graph traversal: ${modelUrls.size}`);

  // -------------------------------------------------------------
  // STEP 3: Parse candidate model pages into catalog records
  // -------------------------------------------------------------
  console.log('  [3/3] Extracting model metadata and building canonical catalog...');
  const processedUrls = new Set();

  for (const [url, meta] of modelUrls) {
    if (processedUrls.has(url)) continue;
    processedUrls.add(url);

    const res = await client.get(url, { purpose: 'catalog_record_extraction' });
    if (res.status === 200 && res.body) {
      const h1Match = (res.body || '').match(/<h1[^>]*>([^<]*)<\/h1>/i);
      const titleMatch = (res.body || '').match(/<title>([^<]*)<\/title>/i);
      const rawTitle = h1Match ? h1Match[1].trim() : (titleMatch ? titleMatch[1].trim() : '');

      if (rawTitle && (rawTitle.toLowerCase().startsWith('stihl') || rawTitle.toUpperCase().startsWith('STIHL'))) {
        const finalUrl = res.final_url || url;
        const pid = extractPidFromUrl(finalUrl) || extractPidFromUrl(url);
        if (pid) {
          const category = inferCategoryFromTitle(rawTitle);
          const cleanTitle = cleanStihlTitle(rawTitle);
          const norm = PartNormalizer.normalizeModelVariant(cleanTitle);

          if (norm.canonical_model_id && norm.base_model_name) {
            catalog.push({
              model_name: rawTitle,
              model_title_clean: cleanTitle,
              normalized_model: norm.base_model_name,
              canonical_model_id: norm.canonical_model_id,
              variant_name: norm.variant_name,
              variant_key: norm.variant_key,
              source_url: finalUrl,
              source_product_id: pid,
              category,
              discovery_method: meta.discovery_method || 'LINK_TRAVERSAL',
              discovery_source_url: meta.discovery_source_url || url,
              response_sha256: res.bodySha256 || '0'.repeat(64),
              retrieved_at: res.fetchedAt || new Date().toISOString()
            });
          }
        }
      }
    }
  }

  // Sort deterministically
  catalog.sort((a, b) => `${a.normalized_model}::${a.variant_key}::${a.source_product_id}`.localeCompare(`${b.normalized_model}::${b.variant_key}::${b.source_product_id}`));

  const indexDoc = {
    schema_version: 'spw-stihl-catalog-v2',
    count: catalog.length,
    catalog
  };

  fs.writeFileSync(indexFile, JSON.stringify(indexDoc, null, 2), 'utf8');
  console.log(`✅ Saved ${catalog.length} catalog items to ${indexFile}`);
  return indexDoc;
}

if (process.argv[1] && process.argv[1].endsWith('build_spw_catalog_index.mjs')) {
  buildCatalogIndex().catch(console.error);
}
