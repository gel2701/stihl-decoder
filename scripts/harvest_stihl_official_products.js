#!/usr/bin/env node
/**
 * STIHL Official Product Harvester (BR) — candidate/review layer only.
 *
 * ABSOLUTE SAFETY RULE: this script NEVER writes to
 *   data/stihl_database.json
 *   data/public_evidence_facts.json
 * All output goes to data/generated/official_products/BR/ (gitignored).
 *
 * Usage:
 *   node scripts/harvest_stihl_official_products.js [--limit N] [--concurrency N]
 *     [--market BR] [--out data/generated/official_products/BR] [--urls a,b,c]
 *     [--skip-manual-check] [--timeout-ms N] [--live]
 *
 * Without --live the script runs discovery only when --urls is absent? No:
 * default mode is LIVE (network). Unit tests import lib/ modules directly and
 * never invoke this file, so CI unit runs stay offline.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  discoverBrCatalog,
  fetchText,
  BR_CATALOG_URL,
} from '../lib/officialHarvester/discovery.js';
import { parseProductPage } from '../lib/officialHarvester/productPage.js';
import { normalizeSpecs } from '../lib/officialHarvester/normalize.js';
import { buildCandidate } from '../lib/officialHarvester/evidence.js';
import { matchModel, compareFields, findHighValueCandidates } from '../lib/officialHarvester/matching.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const CANONICAL_DB = path.join(ROOT, 'data', 'stihl_database.json');
const CANONICAL_FACTS = path.join(ROOT, 'data', 'public_evidence_facts.json');

function parseArgs(argv) {
  const out = { limit: 0, concurrency: 4, market: 'BR', out: 'data/generated/official_products/BR', urls: [], skipManualCheck: false, timeoutMs: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') out.limit = Number(argv[++i]) || 0;
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--market') out.market = String(argv[++i] || 'BR').toUpperCase();
    else if (a === '--out') out.out = String(argv[++i]);
    else if (a === '--urls') out.urls = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--skip-manual-check') out.skipManualCheck = true;
    else if (a === '--timeout-ms') out.timeoutMs = Number(argv[++i]) || 30000;
  }
  return out;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, { timeoutMs, tries = 3 }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) STIHLDecoder-OfficialHarvester/1.0',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          Accept: 'text/html,*/*',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr;
}

async function checkUrlOk(url, timeoutMs) {
  try {
    let res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return true;
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(timeoutMs) });
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error: String((error && error.message) || error) };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function slugFromUrl(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    return (p[p.length - 2] || p[p.length - 1] || 'unknown').toLowerCase();
  } catch {
    return 'unknown';
  }
}

export async function harvest({ limit = 0, concurrency = 4, market = 'BR', outDir, urls = [], skipManualCheck = false, timeoutMs = 30000, discoverImpl } = {}) {
  if (market !== 'BR') throw new Error(`unsupported market ${market} (only BR implemented)`);
  const out = outDir || path.join(ROOT, 'data', 'generated', 'official_products', 'BR');
  fs.mkdirSync(out, { recursive: true });

  // Safety: snapshot canonical hashes; verify afterwards.
  const dbBefore = sha256File(CANONICAL_DB);
  const factsBefore = sha256File(CANONICAL_FACTS);
  const db = JSON.parse(fs.readFileSync(CANONICAL_DB, 'utf8'));
  const dbModels = db.models || [];

  let discovery;
  let productUrls = urls;
  if (productUrls.length === 0) {
    discovery = discoverImpl ? await discoverImpl() : await discoverBrCatalog({ fetchImpl: fetchText });
    productUrls = discovery.product_urls;
  } else {
    discovery = {
      catalog_url: BR_CATALOG_URL,
      discovery_method: 'cli:--urls',
      discovered_urls: productUrls.length,
      unique_product_urls: productUrls.length,
      product_urls: productUrls,
    };
  }
  const targetUrls = limit > 0 ? productUrls.slice(0, limit) : productUrls;
  const retrievedAt = new Date().toISOString();

  const results = await runPool(targetUrls, concurrency, async (url) => {
    const html = await fetchWithRetry(url, { timeoutMs });
    const parsed = parseProductPage(html, url);
    const normalized = normalizeSpecs(parsed.raw_specs);
    const match = matchModel({ model_name: parsed.model_name, product_reference: parsed.product_reference }, dbModels);
    const comparison = match.model ? compareFields(normalized.specs, match.model) : [];
    let manuals = parsed.manuals;
    if (!skipManualCheck) {
      const checked = [];
      for (const man of manuals) {
        const ok = await checkUrlOk(man.url, timeoutMs);
        checked.push({ ...man, url_status: ok ? 'OK' : 'UNREACHABLE' });
      }
      manuals = checked;
    }
    const candidate = buildCandidate({
      parsed: { ...parsed, manuals },
      normalized,
      match: { status: match.status, via: match.via, matched_model: match.model ? match.model.model_name : null, candidates: match.candidates || [] },
      fieldComparison: comparison,
      retrievedAt,
    });
    const slug = slugFromUrl(url);
    fs.writeFileSync(path.join(out, `${slug}.candidate.json`), JSON.stringify(candidate, null, 2), 'utf8');
    return { url, slug, candidate, match, comparison };
  });

  const candidates = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.ok) candidates.push(r.value);
    else failed.push({ url: targetUrls[i], error: r.error });
  });

  const byStatus = { EXACT_MATCH: 0, MODEL_MATCH: 0, NEW_MODEL: 0, AMBIGUOUS_MODEL: 0 };
  const verdictCounts = { MATCH: 0, DATABASE_MISSING: 0, SOURCE_MISSING: 0, CONFLICT_REVIEW_REQUIRED: 0, POSSIBLE_MARKET_VARIANT: 0 };
  let withRef = 0, withSpecs = 0, withManuals = 0, totalManuals = 0, withImages = 0;
  const newModels = [];
  const missingFieldNotes = new Map();
  const conflicts = [];
  const manualsIndex = [];
  const highValue = [];

  for (const c of candidates) {
    byStatus[c.match.status] = (byStatus[c.match.status] || 0) + 1;
    for (const row of c.comparison) verdictCounts[row.verdict] = (verdictCounts[row.verdict] || 0) + 1;
    if (c.candidate.product_reference) withRef++;
    if (Object.keys(c.candidate.specs).length > 0) withSpecs++;
    if (c.candidate.manuals.length > 0) { withManuals++; totalManuals += c.candidate.manuals.length; }
    if (c.candidate.images.length > 0) withImages++;
    if (c.match.status === 'NEW_MODEL') newModels.push({ model: c.candidate.model_name, reference: c.candidate.product_reference, url: c.url });
    for (const row of c.comparison) {
      if (row.verdict === 'DATABASE_MISSING') {
        const k = c.match.model ? c.match.model.model_name : c.candidate.model_name;
        if (!missingFieldNotes.has(k)) missingFieldNotes.set(k, new Set());
        missingFieldNotes.get(k).add(row.field);
      }
      if (row.verdict === 'CONFLICT_REVIEW_REQUIRED' || row.verdict === 'POSSIBLE_MARKET_VARIANT') {
        conflicts.push({ model: c.match.model ? c.match.model.model_name : c.candidate.model_name, field: row.field, database_value: row.database_value, br_value: row.source_value, url: c.url, classification: row.classification || row.verdict });
      }
    }
    for (const man of c.candidate.manuals) manualsIndex.push({ model: c.candidate.model_name, reference: c.candidate.product_reference, manual_url: man.url, status: man.url_status || 'NOT_CHECKED' });
    highValue.push(...findHighValueCandidates(c.candidate, { status: c.match.status, model: c.match.model }));
  }

  const summary = {
    generated_at: retrievedAt,
    market: 'BR',
    catalog_url: discovery.catalog_url,
    discovery_method: discovery.discovery_method,
    discovered_urls: discovery.discovered_urls,
    unique_product_urls: discovery.unique_product_urls,
    products_attempted: targetUrls.length,
    products_harvested: candidates.length,
    products_failed: failed.length,
    failed,
    match_counts: { existing_model_matches: (byStatus.EXACT_MATCH || 0) + (byStatus.MODEL_MATCH || 0), new_models: byStatus.NEW_MODEL || 0, ambiguous_models: byStatus.AMBIGUOUS_MODEL || 0, by_status: byStatus },
    evidence: { with_reference: withRef, with_specs: withSpecs, with_manuals: withManuals, total_manuals: totalManuals, with_images: withImages },
    field_verdicts: verdictCounts,
    new_models: newModels,
    database_gaps: [...missingFieldNotes.entries()].map(([model, fields]) => ({ model, missing_fields: [...fields].sort() })),
    conflicts,
    manuals: manualsIndex,
    high_value_database_candidates: highValue,
    safety: {
      automatic_promotion_allowed: false,
      canonical_db_sha256_before: dbBefore,
      canonical_db_sha256_after: sha256File(CANONICAL_DB),
      canonical_facts_sha256_before: factsBefore,
      canonical_facts_sha256_after: sha256File(CANONICAL_FACTS),
    },
  };
  summary.safety.canonical_unchanged =
    summary.safety.canonical_db_sha256_before === summary.safety.canonical_db_sha256_after &&
    summary.safety.canonical_facts_sha256_before === summary.safety.canonical_facts_sha256_after;
  if (!summary.safety.canonical_unchanged) throw new Error('SAFETY VIOLATION: canonical data changed during harvest');

  fs.writeFileSync(path.join(out, 'latest_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(out, 'latest_report.md'), renderReport(summary), 'utf8');
  return summary;
}

function renderReport(s) {
  const lines = [];
  lines.push(`# STIHL BR Official Harvest — ${s.generated_at}`);
  lines.push('');
  lines.push(`- Catalog: ${s.catalog_url} (${s.discovery_method})`);
  lines.push(`- Discovered URLs: ${s.discovered_urls} | unique products: ${s.unique_product_urls}`);
  lines.push(`- Attempted: ${s.products_attempted} | harvested: ${s.products_harvested} | failed: ${s.products_failed}`);
  lines.push(`- Matches: ${s.match_counts.existing_model_matches} | new: ${s.match_counts.new_models} | ambiguous: ${s.match_counts.ambiguous_models}`);
  lines.push(`- Evidence: ref ${s.evidence.with_reference}, specs ${s.evidence.with_specs}, manuals ${s.evidence.with_manuals} (${s.evidence.total_manuals} files), images ${s.evidence.with_images}`);
  lines.push(`- Verdicts: ${Object.entries(s.field_verdicts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  lines.push(`- Safety: canonical unchanged = ${s.safety.canonical_unchanged}, automatic_promotion_allowed = false`);
  lines.push('');
  lines.push('## New models');
  for (const n of s.new_models.slice(0, 100)) lines.push(`- ${n.model || '(unknown)'} | ${n.reference || '-'} | ${n.url}`);
  lines.push('');
  lines.push('## Database gaps (BR has it, DB misses it)');
  for (const g of s.database_gaps.slice(0, 100)) lines.push(`- ${g.model}: ${g.missing_fields.join(', ')}`);
  lines.push('');
  lines.push('## Conflicts / market variants');
  for (const c of s.conflicts.slice(0, 150)) lines.push(`- ${c.model} | ${c.field} | DB=${JSON.stringify(c.database_value)} | BR=${JSON.stringify(c.br_value)} | ${c.classification} | ${c.url}`);
  lines.push('');
  lines.push('## Official manuals');
  for (const m of s.manuals.slice(0, 150)) lines.push(`- ${m.model || '(unknown)'} | ${m.reference || '-'} | ${m.manual_url} [${m.status}]`);
  lines.push('');
  lines.push('## High-value database candidates (REPORT ONLY — do not auto-promote)');
  for (const h of s.high_value_database_candidates.slice(0, 150)) lines.push(`- ${h.model} | ${h.field} = ${JSON.stringify(h.source_value)} | ${h.source_url}`);
  if (s.products_failed > 0) {
    lines.push('');
    lines.push('## Failed');
    for (const f of s.failed.slice(0, 100)) lines.push(`- ${f.url} :: ${f.error}`);
  }
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  harvest(args).then(
    (s) => {
      console.log(`harvested ${s.products_harvested}/${s.products_attempted}, failed ${s.products_failed}`);
      console.log(`matches=${s.match_counts.existing_model_matches} new=${s.match_counts.new_models} ambiguous=${s.match_counts.ambiguous_models}`);
      console.log(`canonical unchanged: ${s.safety.canonical_unchanged}`);
    },
    (err) => {
      console.error(`harvest failed: ${(err && err.message) || err}`);
      process.exit(1);
    }
  );
}
