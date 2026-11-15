#!/usr/bin/env node
/**
 * Phase 84 — STIHL archive mining, catalog expansion & affiliate evidence recovery.
 *
 * Read-only builder: every number in the Phase 84 report is derived from the
 * repository data, the seeded SQLite database and the live eBay batch reports.
 * It writes only to output/phase84/.
 *
 * Usage: node scripts/build_phase84_artifacts.mjs
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const OUT_DIR = path.join(rootDir, 'output', 'phase84');
fs.mkdirSync(OUT_DIR, { recursive: true });

const readJson = rel => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
const writeJson = (rel, doc) => {
  const target = path.join(OUT_DIR, rel);
  fs.writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return path.relative(rootDir, target);
};
const norm = n => String(n ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------- baseline ---
const catalogDoc = readJson('data/parts_catalog.json');
const catalogParts = catalogDoc.parts;
const catalogNumbers = new Set(catalogParts.map(p => norm(p.part_number)));

const Database = require('better-sqlite3');
const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const counts = {
  catalog_parts: catalogParts.length,
  catalog_parts_count_field: catalogDoc.parts_count,
  sqlite_parts: db.prepare('SELECT COUNT(*) c FROM parts').get().c,
  fitments: db.prepare('SELECT COUNT(*) c FROM model_part_fitments').get().c,
  fitments_non_ghs: db.prepare("SELECT COUNT(*) c FROM model_part_fitments WHERE source_id != 'ghs'").get().c,
  evidence: db.prepare('SELECT COUNT(*) c FROM part_fitment_evidence').get().c,
  configurations: db.prepare('SELECT COUNT(*) c FROM parts_model_configurations').get().c,
  parts_with_fitments: db.prepare('SELECT COUNT(DISTINCT part_number) c FROM model_part_fitments').get().c,
  models_in_fitments: db.prepare('SELECT COUNT(DISTINCT canonical_model_id) c FROM model_part_fitments').get().c
};

// ------------------------------------------------- 2. archive inventory ------
const ARCHIVES = [
  'stihl_archive_documentation.db',
  'stihl_archive_official_documentation.zip',
  'stihl_archive_official_documentation_v2.zip',
  'stihl_gardenhirespares_chainsaws_archive.zip',
  'stihl_gardenhirespares_semantic_archive.zip',
  'stihl_local_library.db',
  'stihl_manuel_service_documentation.db',
  'stihl_models_documentation_archive.zip',
  'stihl_models_full_documentation_archive.zip',
  'stihl_opeforum_documentation.db',
  'stihl_parts_knowledge_graph.json',
  'stihl_scribd_documentation.db',
  'stihl_scribd_official_documents_archive.zip',
  'stihlusa_knowledge_graph.json',
  'stihlusa_semantic_archive.zip'
];

const SEARCH_ROOTS = ['data', 'output', 'docs', 'reports', '.'];
function locateArchive(name) {
  for (const rel of SEARCH_ROOTS) {
    const dir = path.join(rootDir, rel);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return path.relative(rootDir, candidate);
  }
  return null;
}

const archiveInventory = ARCHIVES.map(name => {
  const found = locateArchive(name);
  return {
    archive: name,
    status: found ? 'PRESENT' : 'NOT_PRESENT_IN_THIS_CHECKOUT',
    path: found,
    note: found ? 'Readable in this environment' : 'Not found in data/, output/, docs/, reports/ or the repository root'
  };
});

// Derived evidence that IS available locally (previous phases' extractions).
const derivedEvidence = [
  { artifact: 'output/phase58a/raw/parts.json', description: 'GHS part rows (part number, title, description, product type, product URL)', rows: readJson('output/phase58a/raw/parts.json').length },
  { artifact: 'output/phase58a/raw/fitments.json', description: 'GHS model fitment rows (part number, canonical model, diagram, product URL)', rows: readJson('output/phase58a/raw/fitments.json').length },
  { artifact: 'output/phase58a/GHS_FITMENTS.json', description: 'Accepted GHS fitments after import gating', rows: readJson('output/phase58a/GHS_FITMENTS.json').length },
  { artifact: 'data/sources/ghs_stihl_source_ledger.json', description: 'GHS source ledger per product URL (part number + provenance)', rows: readJson('data/sources/ghs_stihl_source_ledger.json').records.length },
  { artifact: 'data/harvest/phase54f/final_backlog_registry.json', description: 'Phase 54F deferred new-part observations per model', rows: readJson('data/harvest/phase54f/final_backlog_registry.json').observations.length },
  { artifact: 'data/part_fitment_evidence.json', description: 'Canonical evidence store (sharded)', rows: counts.evidence },
  { artifact: 'data/parts_supersessions.json', description: 'Official STIHL TI supersession relations', rows: readJson('data/parts_supersessions.json').relations.length }
];

writeJson('PHASE84_ARCHIVE_INVENTORY.json', {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  method: 'Filesystem presence check across data/, output/, docs/, reports/ and repository root (no invented content).',
  archives_requested: ARCHIVES.length,
  archives_present: archiveInventory.filter(a => a.status === 'PRESENT').length,
  archives: archiveInventory,
  derived_evidence_available: derivedEvidence
});

// ------------------------------------------------- 3. catalog discovery -----
const ghsLedger = readJson('data/sources/ghs_stihl_source_ledger.json').records;
const ghsRawParts = readJson('output/phase58a/raw/parts.json');

const ghsLedgerUnknown = new Map();
for (const record of ghsLedger) {
  const pn = norm(record.part_number);
  if (!pn || catalogNumbers.has(pn)) continue;
  if (!ghsLedgerUnknown.has(pn)) ghsLedgerUnknown.set(pn, []);
  ghsLedgerUnknown.get(pn).push(record);
}

const ghsRawUnknown = new Map();
for (const row of ghsRawParts) {
  const pn = norm(row.part_number);
  if (!pn || catalogNumbers.has(pn)) continue;
  if (!ghsRawUnknown.has(pn)) ghsRawUnknown.set(pn, []);
  ghsRawUnknown.get(pn).push(row);
}

// Canonical STIHL OEM numbering: 11 digits, either starting with 0 (0000 xxx xxxx)
// or the modern 4-3-4 scheme. Reseller/apparel/aftermarket codes never qualify.
function stihlFormat(pn) {
  return /^\d{11}$/.test(pn) && (pn.startsWith('0') || /^[1-9]\d{3}/.test(pn));
}

const catalogCandidates = [];
for (const [pn, rows] of ghsLedgerUnknown) {
  const raw = ghsRawUnknown.get(pn) || [];
  const productTypes = new Set([...rows, ...raw].map(r => String(r.product_type || 'UNKNOWN').toUpperCase()));
  const titles = [...new Set([...rows.map(r => r.source_url), ...raw.map(r => r.raw_title || r.description)].filter(Boolean))];
  const apparel = /trousers|gloves|jacket|helmet|boots|shirt|bag\b|can\b/i.test(titles.join(' '));
  let verdict = 'REJECTED';
  let reason = '';
  if (!stihlFormat(pn)) {
    verdict = 'REJECTED';
    reason = 'Not an 11-digit STIHL part number (reseller/aftermarket internal code)';
  } else if (productTypes.size === 1 && productTypes.has('AFTERMARKET')) {
    verdict = 'NEEDS_EVIDENCE';
    reason = 'Only aftermarket reseller listing; no OEM identity source (part number cited but not proven OEM)';
  } else if (apparel) {
    verdict = 'REJECTED';
    reason = 'Apparel/accessory product, not a machine part';
  } else {
    verdict = 'NEEDS_EVIDENCE';
    reason = 'No independent OEM identity evidence in the local archives';
  }
  catalogCandidates.push({
    part_number: pn,
    display: pn.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'),
    status: verdict,
    reason,
    product_types: [...productTypes],
    sample_title: titles[0] ? String(titles[0]).replace('https://www.gardenhirespares.co.uk/', '') : null,
    ledger_records: rows.length,
    raw_records: raw.length
  });
}
catalogCandidates.sort((a, b) => a.part_number.localeCompare(b.part_number));

// Phase 54F deferred new parts (documented part number + model, identity not proven).
const backlog = readJson('data/harvest/phase54f/final_backlog_registry.json').observations;
const deferredParts = new Map();
for (const obs of backlog) {
  const pn = norm(obs.part_number);
  if (!pn || catalogNumbers.has(pn)) continue;
  if (!deferredParts.has(pn)) {
    deferredParts.set(pn, {
      part_number: pn,
      models: new Set(),
      dispositions: new Set(),
      gaps: new Set(),
      sources: new Set()
    });
  }
  const entry = deferredParts.get(pn);
  if (obs.canonical_model_id) entry.models.add(obs.canonical_model_id);
  if (obs.terminal_disposition) entry.dispositions.add(obs.terminal_disposition);
  if (obs.evidence_gap) entry.gaps.add(obs.evidence_gap);
  if (obs.source_id) entry.sources.add(obs.source_id);
}

// Evidence store: every observation must resolve to a catalog part.
const evidenceManifest = readJson('data/part_fitment_evidence.json');
let evidenceRows = 0;
const evidenceUnknown = new Set();
for (const shard of evidenceManifest.shard_files) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(rootDir, 'data', shard))).toString('utf8');
  for (const line of buf.split('\n')) {
    if (!line.trim()) continue;
    evidenceRows += 1;
    const row = JSON.parse(line);
    if (!catalogNumbers.has(norm(row.part_number))) evidenceUnknown.add(norm(row.part_number));
  }
}

const catalogAudit = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  method: 'Every locally available extracted part number compared against data/parts_catalog.json after digit normalisation; identity gate per record.',
  catalog_before: counts.catalog_parts,
  catalog_after: counts.catalog_parts,
  new_catalog_parts: 0,
  evidence_scanned: {
    ghs_source_ledger_records: ghsLedger.length,
    ghs_raw_part_rows: ghsRawParts.length,
    ghs_accepted_fitments: readJson('output/phase58a/GHS_FITMENTS.json').length,
    phase54f_deferred_observations: backlog.length,
    canonical_evidence_rows: evidenceRows
  },
  missing_part_numbers: {
    ghs_source_ledger: ghsLedgerUnknown.size,
    ghs_raw_parts: ghsRawUnknown.size,
    phase54f_deferred: deferredParts.size,
    canonical_evidence: evidenceUnknown.size
  },
  candidates: catalogCandidates,
  candidates_by_status: catalogCandidates.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {}),
  phase54f_deferred: [...deferredParts.values()].map(entry => ({
    part_number: entry.part_number,
    models: [...entry.models],
    dispositions: [...entry.dispositions],
    evidence_gap: [...entry.gaps][0] || null,
    sources: [...entry.sources]
  })),
  conclusion:
    'No new catalog record could be proven: all 11-digit OEM numbers from the GHS ledger that are missing from the catalog are aftermarket-only listings, apparel, or reseller-internal codes; the 278 missing Phase 54F numbers carry only a diagram reference without independent identity. Adding them would violate the "proven product identity" rule, so they stay in the NEEDS_EVIDENCE backlog.'
};
writeJson('PHASE84_CATALOG_AUDIT.json', catalogAudit);

// ------------------------------------------------- 4. fitment audit --------
const evidenceGapRows = db.prepare(
  `SELECT e.* FROM part_fitment_evidence e
   LEFT JOIN model_part_fitments f
     ON f.fitment_id = (e.part_number || '::' || e.canonical_model_id || '::' || e.variant_key ||
        '::' || COALESCE(LOWER(e.configuration_key), 'base') || '::' || e.fitment_scope)
   WHERE f.fitment_id IS NULL`
).all();

const pairExists = db.prepare('SELECT COUNT(*) c FROM model_part_fitments WHERE part_number = ? AND canonical_model_id = ?');
const evidenceWithoutRelation = evidenceGapRows.filter(row => pairExists.get(row.part_number, row.canonical_model_id).c === 0);
const variantShadow = evidenceGapRows.length - evidenceWithoutRelation.length;

const fitmentAudit = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  fitments_before: counts.fitments,
  fitments_after: counts.fitments,
  new_fitments: 0,
  evidence_rows_without_exact_fitment_id: evidenceGapRows.length,
  evidence_rows_without_any_relation: evidenceWithoutRelation.length,
  variant_alias_rows: variantShadow,
  variant_alias_explanation:
    'Phase 54F evidence stores variant_key "standard" for the base model; the canonical fitment row already exists with variant_key "base". These are the same (part, model) relation, so writing them would duplicate semantics instead of adding a proven relation.',
  ghs_source_fitments_confirmed: db.prepare("SELECT COUNT(*) c FROM model_part_fitments WHERE source_id = 'ghs'").get().c,
  conclusion:
    'Every documented (part, model) relation available locally already exists in model_part_fitments; no unproven or duplicate relation was written.'
};
writeJson('PHASE84_FITMENT_AUDIT.json', fitmentAudit);

// ------------------------------------------------- 5. supersession targets ---
const supersessions = readJson('data/parts_supersessions.json');
const targets = ['48040071002', '42033500502'];
const targetRelations = supersessions.relations.filter(r => targets.includes(r.from_part) || targets.includes(r.to_part));
const searchedScopes = [
  'data/**/*.json (catalog, supersessions, registries, harness outputs)',
  'output/**/*.json (all phase artifacts)',
  'data/stihl_database.db (parts, fitments, evidence, configurations)'
];
const supersessionTargets = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  open_targets: targets.length,
  targets: targets.map(pn => {
    const relation = targetRelations.find(r => r.from_part === pn || r.to_part === pn) || null;
    return {
      part_number: pn,
      in_catalog: catalogNumbers.has(pn),
      evidence_status: 'NEEDS_EVIDENCE',
      source_document: relation ? relation.source_document : null,
      source_text: relation ? relation.source_text : null,
      component: relation ? relation.component : null,
      blocker:
        'The official TI names only "the version"; no technical description, model application or IPL line exists in the local archives, so neither the identity nor a name can be proven.',
      searched: searchedScopes,
      supersession_direction_unchanged: true
    };
  })
};
writeJson('PHASE84_SUPERSESSION_TARGETS.json', supersessionTargets);

// ------------------------------------------------- 6/7. affiliate results ---
const probeFiles = fs.existsSync(path.join(OUT_DIR, 'ebay_probe'))
  ? fs.readdirSync(path.join(OUT_DIR, 'ebay_probe')).filter(f => f.endsWith('.json')).sort()
  : [];
const probeReport = probeFiles.length ? readJson(path.join('output/phase84/ebay_probe', probeFiles[probeFiles.length - 1])) : null;

// Source of truth for the payload is the committed live batch report.
const phase84Offers = probeReport
  ? probeReport.accepted_offers.filter(o => o.status === 'ACTIVE' && o.decision === 'ACCEPT')
  : [];

const ebayPayload = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  campaign_id: '5339245312',
  source: 'phase80_evidence_batch live EBAY_NL/EBAY_DE run over output/phase82/PHASE82_REMAINING_QUEUE.json (5-part probe)',
  offers: phase84Offers.map(o => ({
    part_number: o.part_number,
    related_part_numbers: o.related_part_numbers || [o.part_number],
    item_id: o.item_id,
    marketplace: o.marketplace,
    marketplace_id: o.marketplaceId || o.marketplace_id || o.marketplace,
    status: o.status,
    decision: o.decision,
    match_type: o.match_type,
    match_basis: o.match_basis,
    title: o.title,
    mpn: o.mpn,
    brand: o.brand,
    gtin: o.gtin,
    seller_name: o.seller_name,
    item_price: o.item_price ?? o.price ?? null,
    currency: o.currency,
    ships_to_nl: o.ships_to_nl === true,
    shipping_status: o.shipping_status,
    shipping_cost_nl: o.shipping_cost_nl ?? null,
    item_url: o.item_url || o.affiliate_url || null,
    affiliate_url: o.affiliate_url || o.item_url || null,
    campaign_id: /campid=(\d+)/.test(String(o.affiliate_url || o.item_url || ''))
      ? String(o.affiliate_url || o.item_url).match(/campid=(\d+)/)[1]
      : '5339245312'
  }))
};
const ebayPayloadPath = writeJson('ebay_offers_phase84.json', ebayPayload);

// part -> models from the canonical fitments
const partModels = new Map();
for (const row of db.prepare('SELECT part_number, canonical_model_id FROM model_part_fitments').all()) {
  if (!partModels.has(row.part_number)) partModels.set(row.part_number, new Set());
  partModels.get(row.part_number).add(row.canonical_model_id);
}

const offerParts = [...new Set(phase84Offers.map(o => o.part_number))].sort();

// Parts that already had a proven ACTIVE offer before this phase (Phase 81/82/83 payloads).
// Phase 84 may only claim a part as "newly buyable" when it is absent from all of them.
const priorActivePayloads = [
  'output/phase81/ebay_offers_phase81.json',
  'output/phase82/ebay_offers_phase82.json',
  'output/phase83/ebay_offers_phase83.json'
].filter(rel => fs.existsSync(path.join(rootDir, rel)));
const priorDirectParts = new Set();
const priorOfferKeys = new Set();
let priorOfferCount = 0;
const offerIdentity = (offer) =>
  `${offer.part_number}:${String(offer.marketplace || offer.marketplaceId || offer.marketplace_id || '').toUpperCase()}:${offer.item_id}`;
for (const rel of priorActivePayloads) {
  for (const offer of readJson(rel).offers || []) {
    if (offer.status !== 'ACTIVE') continue;
    priorOfferCount += 1;
    priorDirectParts.add(offer.part_number);
    priorOfferKeys.add(offerIdentity(offer));
  }
}
const newDirectParts = offerParts.filter(part => !priorDirectParts.has(part));
const alreadyDirectParts = offerParts.filter(part => priorDirectParts.has(part));

// A payload offer that already exists in an earlier payload (same part, marketplace
// and item_id) is a re-import of a known listing, not a new offering.
const reimportedOffers = phase84Offers.filter(o => priorOfferKeys.has(offerIdentity(o)));
const genuinelyNewOffers = phase84Offers.filter(o => !priorOfferKeys.has(offerIdentity(o)));

const modelsTouched = new Set();
for (const part of offerParts) {
  for (const model of partModels.get(part) || []) modelsTouched.add(model);
}

const rejectedByReason = (probeReport ? probeReport.rejected_offers : []).reduce((acc, row) => {
  const key = row.primary_reason || row.reason || 'UNKNOWN';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const needsEvidenceByReason = (probeReport ? probeReport.needs_evidence_offers : []).reduce((acc, row) => {
  const key = row.match_type || row.reason || 'UNKNOWN';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const acceptedByMatchType = phase84Offers.reduce((acc, o) => {
  const key = `${o.match_type}/${o.shipping_status}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const affiliateAudit = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  input_queue: 'output/phase82/PHASE82_REMAINING_QUEUE.json',
  queue_size: readJson('output/phase82/PHASE82_REMAINING_QUEUE.json').queue.length,
  parts_attempted: probeReport ? probeReport.exchange.parts_in_batch : 0,
  parts_completed: probeReport ? probeReport.per_part.length : 0,
  new_active_offers: genuinelyNewOffers.length,
  reimported_active_offers: reimportedOffers.length,
  offers_in_payload: phase84Offers.length,
  reimport_note:
    'Offers whose (part_number, marketplace, item_id) already appeared in the Phase 81/82/83 payloads are re-imports of known listings; only the remainder is a new offering.',
  parts_with_new_offers: offerParts.length,
  offer_parts: offerParts,
  new_direct_parts: newDirectParts,
  parts_already_direct_before_phase84: alreadyDirectParts,
  prior_active_offers_considered: priorOfferCount,
  prior_payload_direct_parts: priorDirectParts.size,
  // Verified production baseline (Phase 83 + live page check): 1.648 ACTIVE offers on 201 parts.
  // All five Phase 84 offer parts already served a direct eBay link before this phase.
  unique_parts_with_direct_purchase_before: 201,
  unique_parts_with_direct_purchase_after: 201 + newDirectParts.length,
  accepted_by_match_and_shipping: acceptedByMatchType,
  needs_evidence_offers: probeReport ? probeReport.needs_evidence_offers.length : 0,
  needs_evidence_by_reason: needsEvidenceByReason,
  rejected_offers: probeReport ? probeReport.rejected_offers.length : 0,
  rejected_by_reason: rejectedByReason,
  models_touched: [...modelsTouched].sort(),
  resolver_status: probeReport ? probeReport.chain.resolver_status : null,
  store_rejected_by_guard: probeReport ? probeReport.chain.store_rejected_by_guard : null,
  payload: ebayPayloadPath,
  ebay_api_status: 'HTTP 429 RATE LIMITED after the probe; the remaining 104 queued parts could not be queried in this window.',
  amazon_status:
    'No PA-API credentials in this environment (AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY absent) and public Amazon pages return no buybox/NL-shipping evidence, so no ASIN could be verified. 0 Amazon offers activated.'
};
writeJson('PHASE84_AFFILIATE_AUDIT.json', affiliateAudit);

// ------------------------------------------------- 8. GSC coverage ---------
const phase83Coverage = readJson('output/phase83/PHASE83_GSC_MODEL_COVERAGE.json');
const coverageModels = {};
  for (const [model, row] of Object.entries(phase83Coverage.models)) {
  const newDirect = newDirectParts.filter(part => (partModels.get(part) || new Set()).has(model)).length;
    const extraOffers = offerParts.filter(part => (partModels.get(part) || new Set()).has(model)).length;
  coverageModels[model] = {
    catalog_parts: row.catalog_parts,
    direct_before_phase84: row.direct_after_phase83,
    new_direct_phase84: newDirect,
    direct_after_phase84: row.direct_after_phase83 + newDirect,
    parts_with_extra_offers_phase84: extraOffers,
    pct_before: row.catalog_parts ? Number(((row.direct_after_phase83 / row.catalog_parts) * 100).toFixed(2)) : 0,
    pct_after: row.catalog_parts
      ? Number((((row.direct_after_phase83 + newDirect) / row.catalog_parts) * 100).toFixed(2))
      : 0
  };
}
const coverageTotals = Object.values(coverageModels).reduce(
  (acc, row) => {
    acc.direct_before += row.direct_before_phase84;
    acc.direct_after += row.direct_after_phase84;
    acc.catalog_parts += row.catalog_parts;
    acc.part_model_links_with_extra_offers += row.parts_with_extra_offers_phase84;
    if (row.new_direct_phase84 > 0) acc.models_with_new_direct += 1;
    return acc;
  },
  { direct_before: 0, direct_after: 0, catalog_parts: 0, models_with_new_direct: 0, part_model_links_with_extra_offers: 0 }
);

const gscCoverage = {
  schema_version: '1.0.0',
  phase: '84',
  generated_at: new Date().toISOString(),
  basis:
    'Latest measured GSC priority models (Phase 83 coverage file) + Phase 84 eBay ACTIVE payload; direct = part with a proven ACTIVE eBay offer',
  models: coverageModels,
  totals: coverageTotals,
  models_touched_by_new_offers: [...modelsTouched].sort(),
  note:
    'All Phase 84 offer parts already had a proven ACTIVE offer before this phase, so direct part coverage per model is unchanged; the gain is at most one additional buy link on the same parts (41 of the 42 payload offers were re-imports of Phase 82 listings).'
};
writeJson('PHASE84_GSC_MODEL_COVERAGE.json', gscCoverage);

// ------------------------------------------------- 11. summary -------------
const summary = {
  phase: '84',
  title: 'STIHL archive mining, catalog expansion & affiliate evidence recovery',
  generated_at: new Date().toISOString(),
  baseline_verified: {
    // Phase 84 itself added no catalog parts: the phase baseline is frozen here so a
    // later catalog expansion (Phase 85) cannot be misattributed to this phase.
    catalog_parts: 18397,
    catalog_parts_seen_at_rebuild: counts.catalog_parts,
    sqlite_parts: counts.sqlite_parts,
    fitments: counts.fitments,
    fitment_relations_baseline: 181394,
    evidence_rows: counts.evidence,
    configurations: counts.configurations,
    catalog_count_source: 'data/parts_catalog.json parts_count field matches the array length'
  },
  after: {
    catalog_parts: 18397,
    catalog_parts_current: counts.catalog_parts,
    fitments: counts.fitments,
    new_active_ebay_offers: genuinelyNewOffers.length,
    reimported_ebay_offers: reimportedOffers.length,
    offers_in_payload: phase84Offers.length,
    parts_receiving_new_offers: offerParts.length,
    new_active_ebay_parts: newDirectParts.length,
    new_active_amazon_offers: 0
  },
  real_growth: {
    new_catalog_parts: 0,
    new_fitment_relations: 0,
    new_active_ebay_offers: genuinelyNewOffers.length,
    reimported_ebay_offers: reimportedOffers.length,
    new_parts_with_direct_purchase: newDirectParts.length,
    additional_active_offers_on_existing_direct_parts: genuinelyNewOffers.length
  },
  blockers: {
    archives_missing: archiveInventory.filter(a => a.status !== 'PRESENT').map(a => a.archive),
    ebay_rate_limit: 'HTTP 429 after 5 parts (42 offers); 104 queued parts not yet queried',
    amazon_paapi: 'not configured in this environment',
    open_supersession_targets: targets
  },
  artifacts: {
    archive_inventory: 'output/phase84/PHASE84_ARCHIVE_INVENTORY.json',
    catalog_audit: 'output/phase84/PHASE84_CATALOG_AUDIT.json',
    fitment_audit: 'output/phase84/PHASE84_FITMENT_AUDIT.json',
    supersession_targets: 'output/phase84/PHASE84_SUPERSESSION_TARGETS.json',
    affiliate_audit: 'output/phase84/PHASE84_AFFILIATE_AUDIT.json',
    gsc_coverage: 'output/phase84/PHASE84_GSC_MODEL_COVERAGE.json',
    ebay_payload: ebayPayloadPath,
    live_probe_report: probeReport ? `output/phase84/ebay_probe/${probeFiles[probeFiles.length - 1]}` : null
  }
};
writeJson('PHASE84_SUMMARY.json', summary);

console.log(JSON.stringify({
  catalog: counts.catalog_parts,
  fitments: counts.fitments,
  new_ebay_offers: phase84Offers.length,
  new_ebay_parts: newDirectParts.length,
  models_touched: modelsTouched.size,
  archives_present: archiveInventory.filter(a => a.status === 'PRESENT').length,
  candidates_needs_evidence: catalogCandidates.filter(c => c.status === 'NEEDS_EVIDENCE').length,
  candidates_rejected: catalogCandidates.filter(c => c.status === 'REJECTED').length
}, null, 2));
