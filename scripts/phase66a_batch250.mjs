import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { validateAmazonLink } from '../src/affiliate/AmazonLinkValidator.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = ['output/phase56a/AMAZON_VERIFICATION_QUEUE.json', 'data/parts_catalog.json', 'data/affiliate/verified_amazon_registry.json', 'PHASE59F1_ACTIVATION_CANDIDATES.json', 'PHASE60_1_VERIFIED_OFFERS.json'];
const read = async path => readFile(resolve(root, path), 'utf8');
const json = text => JSON.parse(text);
const validAsin = asin => typeof asin === 'string' && /^[A-Z0-9]{10}$/.test(asin) && asin !== 'B000000000';
const atomic = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, content);
  await rename(temp, path);
};
const stringify = value => `${JSON.stringify(value, null, 2)}\n`;

export async function run({ checkpoint, stopAfterBatches = Infinity, sources, onBatch } = {}) {
  if (sources !== undefined) throw new Error('External sources unavailable: offline-only batch');
  if (!Number.isInteger(stopAfterBatches) && stopAfterBatches !== Infinity || stopAfterBatches < 1) throw new Error('Invalid batch limit');
  const texts = await Promise.all(inputs.map(read));
  const fingerprint = createHash('sha256').update(texts.join('\0')).digest('hex');
  const [queue, catalog, registry, phase59, phase60] = texts.map(json);
  const parts = new Map(catalog.parts.map(p => [p.part_number, p]));
  const rows = queue.queue;
  if (rows.length !== 250 || new Set(rows.map(p => p.part_number)).size !== 250 || rows.some((p, i) => !/^\d{11}$/.test(p.part_number) || !parts.has(p.part_number) || p.queue_rank !== i + 1)) throw new Error('Queue must contain exactly 250 unique ranked canonical catalog parts');
  const nlOffers = registry.offers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
  if (nlOffers.length < 3 || nlOffers.length > 25 || nlOffers.some(o => o.status !== 'ACTIVE' || !o.pilot_active || !registry.policy.pilot_activated_parts.includes(o.part_number))) throw new Error('Active registry pilot changed');
  const active = new Map(nlOffers.map(o => [o.part_number, o]));
  const staged = new Map();
  for (const [source, offers] of [[inputs[3], phase59.offers], [inputs[4], phase60.offers]]) {
    for (const offer of offers) {
      if (!staged.has(offer.part_number)) staged.set(offer.part_number, []);
      staged.get(offer.part_number).push({ source, offer });
    }
  }
  const statePath = checkpoint ? resolve(checkpoint) : join(tmpdir(), 'opencode', `phase66a-v2-${createHash('sha256').update(root).digest('hex').slice(0, 16)}.json`);
  const protectedPaths = [...inputs.map(p => resolve(root, p)), resolve(root, 'reports/phase66a_affiliate_candidates.json'), resolve(root, 'reports/phase66a_affiliate_summary.md')];
  const within = (parent, path) => { const rel = relative(parent, path); return !rel || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
  if (protectedPaths.includes(statePath) || within(resolve(root, 'data'), statePath) || within(resolve(root, 'reports'), statePath)) throw new Error('Checkpoint path overlaps protected input or report');
  let state;
  try { state = json(await readFile(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (state && (state.fingerprint !== fingerprint || !Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor > 250 || state.cursor % 25 !== 0 || Object.keys(state).sort().join(',') !== 'cursor,fingerprint')) throw new Error('Checkpoint mismatch; remove stale checkpoint manually');
  const cursor = state?.cursor ?? 0;
  const records = [];
  const catalogParts = new Set(parts.keys());
  const target = Math.min(250, cursor + (stopAfterBatches === Infinity ? 250 : stopAfterBatches * 25));
  while (records.length < target) {
    for (const item of rows.slice(records.length, records.length + 25)) {
      const part = parts.get(item.part_number);
      const matches = [];
      const offer = active.get(item.part_number);
      const context = { catalogPartMap: catalogParts, expectedTag: registry.policy.affiliate_tag };
      if (offer) {
        const gate = TwoGateVerifier.verifyOffer(offer, context);
        const url = validateAmazonLink(offer.direct_affiliate_url, { marketplace: offer.marketplace, asin: offer.asin, tag: offer.affiliate_tag });
        if (!gate.passed || !url.valid || checkHistoricalMismatch(item.part_number, offer.asin, offer.product_title, offer.ean_gtin).isMismatch) throw new Error(`Active offer failed two-gate or URL: ${item.part_number}`);
        matches.push({ asin: offer.asin, marketplace: offer.marketplace, status: 'VERIFIED', activation_state: 'ACTIVE', research_status: 'EXISTING_REGISTRY_VERIFIED', source: inputs[2], source_timestamp: offer.verification_date ?? null, manufacturer: offer.manufacturer ?? null, manufacturer_part_number: offer.manufacturer_part_number ?? null, ean_gtin: offer.ean_gtin ?? null, package_quantity: offer.package_quantity ?? null, evidence_sources: offer.verifiable_evidence_sources, gate_1: 'PASS', gate_2: 'PASS' });
      }
      for (const { source, offer: candidate } of staged.get(item.part_number) ?? []) {
        if (!validAsin(candidate.asin)) continue;
        if (matches.some(m => m.asin === candidate.asin && m.marketplace === candidate.marketplace)) continue;
        const mismatch = checkHistoricalMismatch(item.part_number, candidate.asin, `${candidate.product_title ?? ''} ${candidate.manufacturer_part_number ?? ''}`, candidate.ean_gtin ?? '');
        const gate = source === inputs[3] ? TwoGateVerifier.verifyOffer(candidate, context) : null;
        const link = candidate.direct_affiliate_url ? validateAmazonLink(candidate.direct_affiliate_url, { marketplace: candidate.marketplace, asin: candidate.asin, tag: candidate.affiliate_tag }) : null;
        matches.push({ asin: candidate.asin, marketplace: candidate.marketplace, status: mismatch.isMismatch ? 'REJECTED' : 'STAGED', activation_state: 'INACTIVE', research_status: mismatch.isMismatch ? 'HISTORICAL_MISMATCH' : 'RESEARCH_REQUIRED', source, source_timestamp: candidate.verification_date ?? candidate.updated_at ?? (source === inputs[3] ? phase59.generated_at : phase60.audit_timestamp) ?? null, source_status: candidate.status ?? candidate.current_status ?? null, manufacturer: candidate.manufacturer ?? null, manufacturer_part_number: candidate.manufacturer_part_number ?? null, ean_gtin: candidate.ean_gtin ?? null, package_quantity: candidate.package_quantity ?? null, evidence_sources: candidate.verifiable_evidence_sources ?? [], reason: mismatch.isMismatch ? mismatch.record.id : 'Not active in production registry; offline evidence cannot establish current ASIN identity', evidence_url: candidate.gate_2_product_identity?.evidence_url ?? candidate.independent_evidence_url ?? null, gate_1: gate?.gate1.status ?? candidate.gate_1_technical?.status ?? null, gate_2: gate?.gate2.status ?? candidate.gate_2_product_identity?.status ?? null, url_valid: link?.valid ?? null });
      }
      const fallback = `https://www.amazon.nl/s?k=${encodeURIComponent(`STIHL ${item.part_number_display}`)}&tag=${encodeURIComponent(registry.policy.affiliate_tag)}`;
      if (!validateAmazonLink(fallback, { marketplace: 'amazon.nl', tag: registry.policy.affiliate_tag }).valid) throw new Error(`Invalid fallback: ${item.part_number}`);
      records.push({ queue_rank: item.queue_rank, part_number: item.part_number, part_name: part.part_name, queue_name: item.display_name, name_corrected: part.part_name !== item.display_name, category: item.category, fitment: { models: item.models, fitment_count: item.fitment_count, section: item.section }, search_profile: { query: `STIHL ${item.part_number_display} ${part.part_name}`, marketplace: 'amazon.nl', research_required: !offer, searches_performed: 0 }, catalog_sources: part.sources, candidates: matches, status: offer ? 'VERIFIED' : matches.some(m => m.status === 'STAGED') ? 'STAGED' : matches.some(m => m.status === 'REJECTED') ? 'REJECTED' : 'RESEARCH_REQUIRED', activation_state: offer ? 'ACTIVE' : 'INACTIVE', research_status: offer ? 'EXISTING_REGISTRY_VERIFIED' : matches.some(m => m.status === 'STAGED') ? 'CANDIDATE_NEEDS_VERIFICATION' : matches.some(m => m.status === 'REJECTED') ? 'HISTORICAL_MISMATCH' : 'RESEARCH_REQUIRED', current_link_type: offer ? 'EXISTING_ACTIVE_REGISTRY_LINK' : 'SEARCH_FALLBACK', search_fallback_url: fallback });
    }
    if (records.length > cursor) {
      await atomic(statePath, stringify({ fingerprint, cursor: records.length }));
      if (onBatch) await onBatch(records.length);
    }
  }
  if (records.length !== 250) return { complete: false, processed: records.length, checkpoint: statePath };
  const candidates = records.flatMap(r => r.candidates.map(c => ({ part_number: r.part_number, ...c })));
  const counts = Object.fromEntries(['VERIFIED', 'STAGED', 'REJECTED', 'RESEARCH_REQUIRED', 'NO_CANDIDATE'].map(status => [status, records.filter(r => r.status === status).length]));
  const mappingCounts = Object.fromEntries(['VERIFIED', 'STAGED', 'REJECTED'].map(status => [status, candidates.filter(c => c.status === status).length]));
  const tally = values => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]));
  const categories = tally(records.map(r => r.category));
  const nextBatch = records.filter(r => r.status === 'STAGED' || r.status === 'RESEARCH_REQUIRED').slice(0, 25).map(r => r.part_number);
  const output = { phase: '66A', mode: 'OFFLINE', blocked_lookups: [{ lookup: 'Live Amazon marketplace discovery and current identity/availability', reason: 'Offline-only batch; no permitted live source or current lookup performed' }], sources_used: inputs, input_fingerprint: fingerprint, batch_size: 25, counts: { parts: records.length, unique_parts: new Set(records.map(r => r.part_number)).size, active_existing_verified: mappingCounts.VERIFIED, new_verified: 0, permitted_searches_performed: 0, unique_asins: new Set(candidates.map(c => c.asin)).size, unique_mappings: new Set(candidates.map(c => `${c.part_number}:${c.marketplace}:${c.asin}`)).size, part_statuses: counts, candidate_mappings: mappingCounts, manufacturers: tally(candidates.map(c => c.manufacturer ?? 'UNKNOWN')), marketplaces: tally(candidates.map(c => c.marketplace ?? 'UNKNOWN')), categories }, quota_redistribution: { performed: false, reason: 'No live research; redistribute only after permitted searches and category results' }, next_verification_batch: nextBatch, records };
  const summary = `# Phase 66A affiliate candidate audit\n\nOffline only. No live Amazon discovery, current identity or availability checks. Only previously recorded candidates were evaluated; most parts still need external research. No production data changed.\n\n- Queue: ${records.length} unique catalog parts; batches of 25\n- Existing active verified mappings: ${mappingCounts.VERIFIED}; NEW verified: 0\n- Parts: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}\n- Historical candidate mappings (not newly verified): ${Object.entries(mappingCounts).map(([k, v]) => `${k} ${v}`).join(', ')}\n- Unique ASINs: ${output.counts.unique_asins}; unique part/marketplace/ASIN mappings: ${output.counts.unique_mappings}\n- Manufacturers: ${JSON.stringify(output.counts.manufacturers)}\n- Marketplaces: ${JSON.stringify(output.counts.marketplaces)}\n- Categories: ${JSON.stringify(categories)}\n- Quota redistribution: none; requires permitted searches and category results.\n- Sources used: ${inputs.join(', ')}\n- Blocked lookups: ${output.blocked_lookups.map(x => `${x.lookup} (${x.reason})`).join('; ')}\n- Next verification batch (queue order, 25): ${nextBatch.join(', ')}\n- Staged historical evidence needs independent current verification; placeholder B000000000 excluded. Rejected historical mismatches cannot become direct links. No NO_CANDIDATE verdict without permitted searches.\n- Catalog name overrides stale queue name, including 00004007000 (Spark plug NGK BPMR7A).\n- Fingerprint: ${fingerprint}\n`;
  await atomic(resolve(root, 'reports/phase66a_affiliate_candidates.json'), stringify(output));
  await atomic(resolve(root, 'reports/phase66a_affiliate_summary.md'), summary);
  return { complete: true, counts: output.counts, checkpoint: statePath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowed = new Set(['--checkpoint', '--stop-after-batches']);
  if (args.length % 2 || args.some((arg, i) => i % 2 === 0 && !allowed.has(arg))) throw new Error('Usage: node scripts/phase66a_batch250.mjs [--checkpoint path] [--stop-after-batches count]');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  run({ checkpoint: options['--checkpoint'], stopAfterBatches: options['--stop-after-batches'] === undefined ? Infinity : Number(options['--stop-after-batches']) }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
}
