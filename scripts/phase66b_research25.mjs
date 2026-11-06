import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { validateAmazonLink } from '../src/affiliate/AmazonLinkValidator.js';
import { ALLOWED_AMAZON_MARKETPLACES } from '../src/affiliate/AmazonProductionOfferContract.js';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = resolve(root, 'reports/phase66b_research25.json');
const summaryPath = resolve(root, 'reports/phase66b_summary.md');
export const ids = '00006421240,00004007025,00004007026,00003503518,00003503502,00003503503,00001404407,11411201600,11411404400,00001201653,11181953500,11284051000,00009302208,11131958200,00009302203,11281903400,41401953400,41471904012,00006421234,00006421236,00006421231,11256401701,41804051000,41284051000,00001903400'.split(',');
const quotes = {
  '00006421240': "Rim Sprocket 3/8'' Picco 7T for Stihl MS250, MS250C - 0000 642 1240",
  '00004007025': 'Stihl Spark Plug (Each) ZK C for Stihl FS 361.0 C-EM, FS 38 Clearing Saws - OEM No. 0000 400 7025',
  '00004007026': 'Spark Plug Stihl Zk C 10 (1= Set Of 40) - Genuine Stihl Part - OEM No. 0000 400 7026',
  '00003503518': 'Search returned near 0000 350 3504 and 0000 350 3502; no exact 0000 350 3518 result',
  '00003503502': 'Pick Up Body Fuel Filter for Stihl TS410, TS420 Disc Cutters - OEM No. 0000 350 3502',
  '00003503503': 'Pickup Body for Stihl HS 72, HS 74 Hedge Trimmer - OEM No. 0000 350 3503',
  '00001404407': 'Air Filter HD2 for Stihl MS880, MS460 Chainsaw - OEM No. 0000 140 4407',
  '11411201600': 'Air Filter Fleece for Stihl MS231, MS231C Chainsaws - OEM No. 1141 120 1600',
  '11411404400': 'Air Filter for Stihl MS 241 C, MS 261, MS 261 C Chainsaws - 1141 140 4400',
  '00009302208': 'Starter Rope 3mm x 30.5 M for Stihl FS72, FS74 - 0000 930 2208',
  '00009302203': 'Starter Rope for Stihl MS290, MS310 Chainsaw - OEM No. 0000 930 2203',
  '00006421234': "Rim Sprocket 0.325'' 8T for Stihl MS290, MS310 Chainsaws - 0000 642 1234",
  '00006421236': "Rim Sprocket 0.325'' 7T for Stihl 034, 024 Chainsaws - 0000 642 1236",
  '00006421231': "Rim Sprocket 3/8'' 7T for Stihl MS261, MS261C - 0000 642 1231",
  '11284051000': 'Spark Plug Cap for Stihl TS400, TS410, TS420 Disc Cutter - OEM No. 1128 405 1000'
};
const formatted = id => `${id.slice(0, 4)} ${id.slice(4, 7)} ${id.slice(7)}`;
const searchUrl = id => `https://www.lsengineers.co.uk/catalogsearch/result/?q=${encodeURIComponent(formatted(id))}`;
const observed_at = '2026-11-06';
export const curated = ids.flatMap(id => {
  if (id in quotes) {
    const observations = [{ part_number: id, observed_at, source_url: searchUrl(id), source_kind: 'DISTRIBUTOR_SEARCH', page_type: 'SEARCH_RESULTS', claim: quotes[id], exact_part_found: id !== '00003503518' }];
    if (id === '00006421240') observations.push({ part_number: id, observed_at, source_url: 'https://www.oregonproducts.com/en/rim-sprocket--3-8%22-pitch-7-tooth/p/18720', source_kind: 'MANUFACTURER_PRODUCT', page_type: 'PRODUCT', claim: 'Pitch: 3/8", Size: Standard 7 Spline, Tooth Count: 7', exact_part_found: false });
    return observations;
  }
  return [
    { part_number: id, observed_at, source_url: `https://loja.stihl.com.br/${id}`, source_kind: 'MANUFACTURER_SEARCH', page_type: 'SEARCH_RESULTS', claim: 'Ops, não encontramos nenhum resultado para sua busca', exact_part_found: false },
    { part_number: id, observed_at, source_url: `https://www.stihl.com/en/search?text=${id}`, source_kind: 'MANUFACTURER_SEARCH', page_type: 'SEARCH_UI', claim: 'Search UI only; no product result confirmed', exact_part_found: false }
  ];
});

export function validateObservation(o) {
  if (!o || !ids.includes(o.part_number) || !/^\d{11}$/.test(o.part_number) || !/^\d{4}-\d{2}-\d{2}$/.test(o.observed_at) || !Number.isFinite(Date.parse(o.observed_at)) || typeof o.claim !== 'string' || !o.claim.trim() || !['DISTRIBUTOR_SEARCH', 'MANUFACTURER_SEARCH', 'MANUFACTURER_PRODUCT', 'MARKETPLACE_PRODUCT', 'INDEPENDENT_CATALOG'].includes(o.source_kind) || !['SEARCH_RESULTS', 'SEARCH_UI', 'PRODUCT'].includes(o.page_type) || typeof o.exact_part_found !== 'boolean') throw new Error('Invalid observation fields');
  let url;
  try { url = new URL(o.source_url); } catch { throw new Error('Invalid observation URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Invalid observation URL');
  const kinds = { 'www.lsengineers.co.uk': ['DISTRIBUTOR_SEARCH', 'SEARCH_RESULTS'], 'loja.stihl.com.br': ['MANUFACTURER_SEARCH', 'SEARCH_RESULTS'], 'www.stihl.com': ['MANUFACTURER_SEARCH', 'SEARCH_UI'], 'www.oregonproducts.com': ['MANUFACTURER_PRODUCT', 'PRODUCT'] };
  if (o.source_kind === 'MARKETPLACE_PRODUCT') {
    if (o.page_type !== 'PRODUCT' || !o.asin || !o.marketplace || !ALLOWED_AMAZON_MARKETPLACES.has(o.marketplace) || !validateAmazonLink(o.source_url, { marketplace: o.marketplace, asin: o.asin }).valid || validateAmazonLink(o.source_url, { marketplace: o.marketplace, asin: o.asin }).kind !== 'PRODUCT') throw new Error('Source attribution mismatch');
  } else if (!kinds[url.hostname] || kinds[url.hostname][0] !== o.source_kind || kinds[url.hostname][1] !== o.page_type || o.asin != null || o.marketplace != null || o.source_kind === 'INDEPENDENT_CATALOG') throw new Error('Source attribution mismatch');
  if (o.manufacturer != null && (typeof o.manufacturer !== 'string' || !o.manufacturer.trim())) throw new Error('Invalid manufacturer');
  if (o.ean_gtin != null && !validateGtin(o.ean_gtin).valid) throw new Error('Invalid GTIN');
  if (o.package_quantity != null && (!Number.isInteger(o.package_quantity) || o.package_quantity < 1)) throw new Error('Invalid quantity');
  if (o.asin != null && (!/^[A-Z0-9]{10}$/.test(o.asin) || o.asin === 'B000000000' || o.source_kind !== 'MARKETPLACE_PRODUCT' || !o.source_url.includes(o.asin))) throw new Error('Unattributed ASIN');
  if (o.marketplace != null && (!/^amazon\.[a-z.]+$/.test(o.marketplace) || o.source_kind !== 'MARKETPLACE_PRODUCT' || url.hostname !== `www.${o.marketplace}` && url.hostname !== o.marketplace)) throw new Error('Marketplace attribution mismatch');
  if (o.asin && !o.marketplace || o.marketplace && !o.asin) throw new Error('ASIN and marketplace required together');
  return o;
}

export function assess(row, observations, candidates = []) {
  const evidence = observations.filter(o => o.part_number === row.part_number);
  evidence.forEach(validateObservation);
  const historical = row.candidates.map(c => ({ ...c, provenance: 'HISTORICAL_ONLY', activation_state: 'INACTIVE' }));
  const incoming = candidates.filter(c => c.part_number === row.part_number).map(c => {
    if (!/^[A-Z0-9]{10}$/.test(c.asin ?? '') || c.asin === 'B000000000' || !ALLOWED_AMAZON_MARKETPLACES.has(c.marketplace) || !c.source_url || !validateAmazonLink(c.source_url, { marketplace: c.marketplace, asin: c.asin }).valid || validateAmazonLink(c.source_url, { marketplace: c.marketplace, asin: c.asin }).kind !== 'PRODUCT') throw new Error('Invalid candidate');
    const supporting = evidence.filter(o => o.source_kind === 'MARKETPLACE_PRODUCT' && o.asin === c.asin && o.marketplace === c.marketplace && o.page_type === 'PRODUCT');
    const conflicts = evidence.filter(o => o.asin === c.asin && o.marketplace && o.marketplace !== c.marketplace || o.asin === c.asin && o.ean_gtin && c.ean_gtin && o.ean_gtin !== c.ean_gtin || o.asin === c.asin && o.package_quantity && c.package_quantity && o.package_quantity !== c.package_quantity || o.asin === c.asin && o.manufacturer && c.manufacturer && o.manufacturer.trim().toLowerCase() !== c.manufacturer.trim().toLowerCase());
    const mismatch = checkHistoricalMismatch(row.part_number, c.asin, c.product_title ?? '', c.ean_gtin ?? '');
    const gate = TwoGateVerifier.verifyOffer({ ...c, part_number: row.part_number, status: 'ASIN_IDENTITY_UNVERIFIED' }, { catalogPartMap: new Set([row.part_number]) });
    return { asin: c.asin, marketplace: c.marketplace, status: mismatch.isMismatch || conflicts.length ? 'REJECTED' : 'STAGED', activation_state: 'INACTIVE', provenance: 'IMPORTED_UNVERIFIED', reason: mismatch.isMismatch ? mismatch.record.id : conflicts.length ? 'CONFLICTING_EVIDENCE' : 'Independent exact marketplace ASIN corroboration and TwoGate required', marketplace_product_observations: supporting.length, gate_1: gate.gate1.status, gate_2: gate.gate2.status };
  });
  const unique = new Map([...historical, ...incoming].map(c => [`${c.marketplace}:${c.asin}`, c]));
  const mappings = [...unique.values()];
  const status = mappings.some(c => c.status === 'STAGED') ? 'STAGED' : mappings.some(c => c.status === 'REJECTED') ? 'REJECTED' : 'RESEARCH_REQUIRED';
  return { priority: ids.indexOf(row.part_number) + 1, part_number: row.part_number, queue_rank: row.queue_rank, part_name: row.part_name, category: row.category, observations: evidence, candidates: mappings, status, activation_state: 'INACTIVE', product_identity_confirmed: false, reason: row.part_number === '00006421240' ? 'Historical Oregon ASIN unresolved: Picco 7T versus standard 7 spline pitch; no direct ASIN corroboration' : row.part_number === '00004007025' ? 'Historical ASIN rejected; search says each, catalog says pack of 10' : row.part_number === '11411201600' ? 'Search says fleece, queue says HD2; product page not verified' : evidence.some(o => o.exact_part_found) ? 'Exact part appears in search result only; product page not verified' : 'No exact product result confirmed' };
}

const serialized = value => `${JSON.stringify(value, null, 2)}\n`;
const atomic = async (path, data) => { const temp = `${path}.${process.pid}.tmp`; try { await writeFile(temp, data); await rename(temp, path); } catch (e) { const { unlink } = await import('node:fs/promises'); await unlink(temp).catch(() => {}); throw e; } };
export async function run({ importPath, stopAfter = 25, refresh = false } = {}) {
  if (!Number.isInteger(stopAfter) || stopAfter < 1 || stopAfter > 25) throw new Error('Invalid stopAfter');
  const input = await readFile(resolve(root, 'reports/phase66a_affiliate_candidates.json'), 'utf8');
  const original = JSON.parse(input);
  const imported = importPath ? JSON.parse(await readFile(resolve(importPath), 'utf8')) : { observations: [], candidates: [] };
  if (!imported || !Array.isArray(imported.observations) || !Array.isArray(imported.candidates)) throw new Error('Expected observations and candidates arrays');
  const observations = [...curated, ...imported.observations].map(validateObservation);
  const candidateKeys = new Set();
  for (const c of imported.candidates) {
    if (!ids.includes(c.part_number) || !/^[A-Z0-9]{10}$/.test(c.asin ?? '') || c.asin === 'B000000000' || !ALLOWED_AMAZON_MARKETPLACES.has(c.marketplace) || !c.source_url || !validateAmazonLink(c.source_url, { marketplace: c.marketplace, asin: c.asin }).valid || validateAmazonLink(c.source_url, { marketplace: c.marketplace, asin: c.asin }).kind !== 'PRODUCT' || c.ean_gtin != null && !validateGtin(c.ean_gtin).valid || c.package_quantity != null && (!Number.isInteger(c.package_quantity) || c.package_quantity < 1) || c.manufacturer != null && (typeof c.manufacturer !== 'string' || !c.manufacturer.trim())) throw new Error('Invalid imported candidate');
    const key = `${c.part_number}:${c.marketplace}:${c.asin}`;
    if (candidateKeys.has(key)) throw new Error('Duplicate imported candidate');
    candidateKeys.add(key);
  }
  const fingerprint = createHash('sha256').update(input).update(serialized(imported)).digest('hex');
  const rows = new Map(original.records.map(r => [r.part_number, r]));
  if (new Set(ids).size !== 25 || ids.some(id => !rows.has(id))) throw new Error('Selection not present in Phase 66A');
  const build = length => {
    const records = ids.slice(0, length).map(id => assess(rows.get(id), observations, imported.candidates));
    const mappings = records.flatMap(r => r.candidates);
    const counts = { selected: 25, processed: length, source_checked: records.filter(r => r.observations.length > 0).length, exact_search_results: records.filter(r => r.observations.some(o => o.page_type === 'SEARCH_RESULTS' && o.exact_part_found)).length, product_identity_confirmed: records.filter(r => r.product_identity_confirmed).length, new_verified: 0, imported_candidates: imported.candidates.length, staged: records.filter(r => r.status === 'STAGED').length, rejected: records.filter(r => r.status === 'REJECTED').length, unresolved: records.filter(r => r.status === 'RESEARCH_REQUIRED').length, unique_candidates: new Set(mappings.map(c => `${c.marketplace}:${c.asin}`)).size, marketplace_coverage: [...new Set(mappings.map(c => c.marketplace).filter(Boolean))].sort(), reused_asins: new Set(mappings.filter(c => c.provenance === 'HISTORICAL_ONLY').map(c => c.asin)).size, new_asins: new Set(mappings.filter(c => c.provenance === 'IMPORTED_UNVERIFIED').map(c => c.asin)).size, source_availability: { provided: records.filter(r => r.observations.length).length, missing: records.filter(r => !r.observations.length).length } };
    return { phase: '66B', mode: 'IMPORTED_OBSERVATIONS_UNVERIFIED', observed_at, input_fingerprint: fingerprint, counts, selection_reason: 'Fixed 25 priority part numbers from Phase 66A queue', blocked_lookups: ['No live marketplace lookup or independent exact ASIN corroboration'], records };
  };
  let existing;
  try { existing = JSON.parse(await readFile(reportPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing && !refresh && (existing.input_fingerprint !== fingerprint || !Array.isArray(existing.records) || existing.records.length > 25 || !isDeepStrictEqual(existing, build(existing.records.length)))) throw new Error('Invalid or changed checkpoint');
  const output = build(Math.max(refresh ? 0 : existing?.records.length ?? 0, stopAfter));
  let summary;
  try { summary = await readFile(summaryPath, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const text = `# Phase 66B research\n\n- Selected: 25; processed: ${output.counts.processed}; source available: ${output.counts.source_checked}; missing: ${output.counts.source_availability.missing}.\n- Staged: ${output.counts.staged}; rejected: ${output.counts.rejected}; unresolved: ${output.counts.unresolved}; verified: 0.\n- Unique candidates: ${output.counts.unique_candidates}; marketplaces: ${output.counts.marketplace_coverage.join(', ') || 'none'}; reused ASINs: ${output.counts.reused_asins}; new ASINs: ${output.counts.new_asins}.\n- Curated public pages fetched on 2026-11-06; script replays observations offline. No live Amazon lookup or activation. Search-result listings establish no confirmed product identity. Source quotes and URLs are in JSON report.\n`;
  if (existing && !refresh && summary !== undefined && summary !== `# Phase 66B research\n\n- Selected: 25; processed: ${existing.counts.processed}; source available: ${existing.counts.source_checked}; missing: ${existing.counts.source_availability.missing}.\n- Staged: ${existing.counts.staged}; rejected: ${existing.counts.rejected}; unresolved: ${existing.counts.unresolved}; verified: 0.\n- Unique candidates: ${existing.counts.unique_candidates}; marketplaces: ${existing.counts.marketplace_coverage.join(', ') || 'none'}; reused ASINs: ${existing.counts.reused_asins}; new ASINs: ${existing.counts.new_asins}.\n- Curated public pages fetched on 2026-11-06; script replays observations offline. No live Amazon lookup or activation. Search-result listings establish no confirmed product identity. Source quotes and URLs are in JSON report.\n`) throw new Error('Changed summary report');
  await atomic(reportPath, serialized(output));
  if (output.records.length === 25) await atomic(summaryPath, text);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length % 2 || args.some((x, i) => i % 2 === 0 && !['--import', '--stop-after', '--refresh'].includes(x))) throw new Error('Usage: node scripts/phase66b_research25.mjs [--import JSON] [--stop-after 1..25] [--refresh true]');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]));
  run({ importPath: options['--import'], stopAfter: options['--stop-after'] === undefined ? 25 : Number(options['--stop-after']), refresh: options['--refresh'] === 'true' }).then(result => console.log(JSON.stringify(result.counts))).catch(error => { console.error(error); process.exitCode = 1; });
}
