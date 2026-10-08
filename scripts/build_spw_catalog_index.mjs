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
    /\s+Extended Reach Hedge Trimmers.*$/i,
    /\s+Pole Pruner.*$/i,
    /\s+Lawn Mowers.*$/i,
    /\s+Robotic Mowers.*$/i,
    /\s+Special Purpose Units.*$/i
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

export async function buildCatalogIndex(options = {}) {
  const client = new HttpClient({ mode: 'LIVE', useCache: true });
  const indexFile = options.indexFile || path.join(rootDir, 'data', 'sparepartsworld_stihl_model_index.json');

  console.log('Building Spare Parts World STIHL Model Index...');
  const catalog = [];
  const seenUrls = new Set();

  const ranges = [
    [782550, 782860], // Chainsaws (Gasoline, Cordless, Electric, 0-series)
    [782909, 783150], // Pole Pruners, Trimmers, Brushcutters (FS-series)
    [783920, 783945], // Cut-Off Machines (TS-series)
    [783960, 784000]  // Blowers (BG, BR, BGA-series)
  ];

  const pList = [];
  for (const [start, end] of ranges) {
    for (let p = start; p <= end; p++) {
      pList.push(p);
    }
  }

  const BATCH_SIZE = 30;
  for (let i = 0; i < pList.length; i += BATCH_SIZE) {
    const chunk = pList.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      chunk.map(async (p) => {
        const url = `https://www.sparepartsworld.co.uk/p/P${p}`;
        try {
          const res = await client.get(url, { purpose: 'catalog_discovery' });
          return { p, url, res };
        } catch (e) {
          return { p, url, res: null };
        }
      })
    );

    for (const { p, url, res } of results) {
      if (res && res.status === 200 && res.body) {
        const h1Match = res.body.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        const titleMatch = res.body.match(/<title>([^<]*)<\/title>/i);
        const rawTitle = h1Match ? h1Match[1].trim() : (titleMatch ? titleMatch[1].trim() : '');

        if (rawTitle.toLowerCase().startsWith('stihl')) {
          const finalUrl = res.final_url || url;
          if (!seenUrls.has(finalUrl)) {
            seenUrls.add(finalUrl);

            let category = 'Chainsaw';
            if (rawTitle.includes('Brushcutter') || rawTitle.includes('Brushcutters') || rawTitle.includes('Trimmer') || rawTitle.includes('Clearing Saws')) category = 'Brushcutter';
            else if (rawTitle.includes('Cut-Off') || rawTitle.includes('Cut Off') || rawTitle.includes('TS')) category = 'Cut-Off Saw';
            else if (rawTitle.includes('Blower') || rawTitle.includes('Blowers')) category = 'Blower';
            else if (rawTitle.includes('Hedgetrimmer') || rawTitle.includes('Hedge Trimmer')) category = 'Hedge Trimmer';
            else if (rawTitle.includes('Pole Pruner') || rawTitle.includes('Pruner')) category = 'Pole Pruner';

            const cleanTitle = cleanStihlTitle(rawTitle);
            const norm = PartNormalizer.normalizeModelVariant(cleanTitle);

            catalog.push({
              model_name: rawTitle,
              model_title_clean: cleanTitle,
              normalized_model: norm.base_model_name,
              canonical_model_id: norm.canonical_model_id,
              variant_name: norm.variant_name,
              variant_key: norm.variant_key,
              source_url: finalUrl,
              source_product_id: `P${p}`,
              category,
              discovery_source_url: url,
              response_sha256: res.bodySha256,
              retrieved_at: res.fetchedAt || new Date().toISOString()
            });
          }
        }
      }
    }
  }

  catalog.sort((a, b) => `${a.normalized_model}::${a.variant_key}::${a.source_product_id}`.localeCompare(`${b.normalized_model}::${b.variant_key}::${b.source_product_id}`));

  const indexDoc = { schema_version: 'spw-stihl-catalog-v1', count: catalog.length, catalog };
  fs.writeFileSync(indexFile, JSON.stringify(indexDoc, null, 2), 'utf8');
  console.log(`Saved ${catalog.length} catalog items to ${indexFile}`);
  return indexDoc;
}

if (process.argv[1] && process.argv[1].endsWith('build_spw_catalog_index.mjs')) {
  buildCatalogIndex().catch(console.error);
}
