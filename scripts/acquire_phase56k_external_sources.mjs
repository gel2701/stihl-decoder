/**
 * Phase 56K — Real External Source Acquisition (read-only, polite, no bypass)
 *
 * For each of the max 40 pilot targets:
 *   1. Discovery: DuckDuckGo HTML search (robots.txt: Allow /) -> result URLs. DISCOVERY_ONLY, never evidence.
 *   2. Fetch: at most MAX_PAGES_PER_TARGET result pages, one GET each, robots.txt respected per host,
 *      >= 1.5s delay between requests, no cookies/login/CAPTCHA/JS execution, no retries on 403/429.
 *   3. Record only what is literally present in the fetched HTML: HTTP status, final URL, <title>, <h1>,
 *      headings preceding the part-number occurrence, model-token presence, a <=240 char text extract,
 *      and a SHA-256 of the response body. Full page bodies are NOT stored in the repository.
 *
 * Output: data/harvest/phase56k/fetch_ledger.json (consumed by build_phase56k_external_evidence_pilot.mjs)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const outPath = path.join(rootDir, 'data', 'harvest', 'phase56k', 'fetch_ledger.json');

export const USER_AGENT = 'STIHLDecoder-EvidencePilot/1.0 (+https://www.stihldecoder.nl)';
const DELAY_MS = 1500;
const MAX_QUERIES_PER_TARGET = 2;
const MAX_PAGES_PER_TARGET = 4;

// Hosts excluded before fetching, with concrete reasons (not lineage guesses).
export const EXCLUDED_HOSTS = {
  'stihldecoder.nl': 'OWN_SITE_CIRCULAR',
  'www.stihldecoder.nl': 'OWN_SITE_CIRCULAR',
  'www.sparepartsworld.co.uk': 'EXISTING_CANONICAL_SOURCE_ALREADY_INGESTED',
  'sparepartsworld.co.uk': 'EXISTING_CANONICAL_SOURCE_ALREADY_INGESTED',
  'www.diyspareparts.com': 'EXISTING_PHASE54F_SOURCE_ALREADY_INGESTED',
  'diyspareparts.com': 'EXISTING_PHASE54F_SOURCE_ALREADY_INGESTED',
  'www.scribd.com': 'USER_UPLOADED_DOCUMENT_HOST_UNKNOWN_PUBLISHER',
  'www.ebay.com': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.ebay.co.uk': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.ebay.de': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.amazon.com': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.amazon.co.uk': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.amazon.de': 'MARKETPLACE_LISTING_NOT_TECHNICAL_DOCUMENTATION',
  'www.youtube.com': 'VIDEO_NOT_TECHNICAL_DOCUMENTATION',
  'www.facebook.com': 'SOCIAL_NOT_TECHNICAL_DOCUMENTATION',
  'www.reddit.com': 'FORUM_NOT_TECHNICAL_EVIDENCE',
  'www.arboristsite.com': 'FORUM_NOT_TECHNICAL_EVIDENCE'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

export function modelDisplay(canonId) {
  const m = canonId.match(/^([a-z]+)_(\d+)$/);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : canonId.toUpperCase();
}

export function partNumberRegex(pn) {
  const a = pn.slice(0, 4), b = pn.slice(4, 7), c = pn.slice(7, 11);
  return new RegExp(`${a}[\\s\\-.]?${b}[\\s\\-.]?${c}`, 'i');
}

export function modelTokenRegex(canonId) {
  const m = canonId.match(/^([a-z]+)_(\d+)$/);
  if (!m) return new RegExp(`\\b${canonId}\\b`, 'i');
  return new RegExp(`\\b${m[1]}[\\s\\-]?${m[2]}(?![0-9])`, 'i');
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}
const stripTags = s => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const robotsCache = new Map();
async function isAllowedByRobots(urlObj) {
  const origin = urlObj.origin;
  if (!robotsCache.has(origin)) {
    let rules = { status: null, disallow: [], allow: [] };
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000), redirect: 'follow' });
      rules.status = r.status;
      if (r.ok) {
        const txt = await r.text();
        let applies = false;
        for (const raw of txt.split(/\r?\n/)) {
          const line = raw.replace(/#.*/, '').trim();
          if (!line) continue;
          const [k, ...rest] = line.split(':');
          const key = k.trim().toLowerCase();
          const val = rest.join(':').trim();
          if (key === 'user-agent') applies = (val === '*');
          else if (applies && key === 'disallow' && val) rules.disallow.push(val);
          else if (applies && key === 'allow' && val) rules.allow.push(val);
        }
      } else if (r.status === 401 || r.status === 403) {
        rules.disallow.push('/'); // robots itself protected -> treat as disallowed, do not bypass
      }
    } catch (e) {
      rules.status = 'ERR';
    }
    robotsCache.set(origin, rules);
    await sleep(DELAY_MS);
  }
  const rules = robotsCache.get(origin);
  const p = urlObj.pathname + urlObj.search;
  const match = (pat) => {
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return re.test(p);
  };
  const longestAllow = Math.max(-1, ...rules.allow.filter(match).map(s => s.length));
  const longestDis = Math.max(-1, ...rules.disallow.filter(match).map(s => s.length));
  return { allowed: longestDis < 0 || longestAllow >= longestDis, robots_status: rules.status };
}

async function ddgDiscover(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = { query, discovery_url: url, status: null, result_urls: [], snippets: [] };
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
    res.status = r.status;
    const html = await r.text();
    const anchorRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = anchorRe.exec(html)) !== null) {
      let href = decodeEntities(m[1]);
      const ud = href.match(/[?&]uddg=([^&]+)/);
      if (ud) href = decodeURIComponent(ud[1]);
      if (href.startsWith('//')) href = 'https:' + href;
      if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
      res.result_urls.push(href);
      res.snippets.push({ url: href, result_title: stripTags(m[2]).slice(0, 200) });
    }
  } catch (e) {
    res.status = 'ERR:' + e.message;
  }
  await sleep(DELAY_MS);
  return res;
}

export function extractFromHtml(html, pn, targetModels) {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const title = stripTags((clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 300);
  const h1 = stripTags((clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '').slice(0, 300);
  const pnRe = partNumberRegex(pn);

  // Locate first part-number occurrence in raw cleaned HTML and the nearest preceding heading (h2-h4)
  const pnMatch = pnRe.exec(clean);
  let precedingHeading = null;
  let extract = null;
  if (pnMatch) {
    const before = clean.slice(0, pnMatch.index);
    const headRe = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let hm, last = null;
    while ((hm = headRe.exec(before)) !== null) last = hm;
    if (last) precedingHeading = stripTags(last[2]).slice(0, 200) || null;
    const text = stripTags(clean.slice(Math.max(0, pnMatch.index - 600), pnMatch.index + 600));
    const tm = pnRe.exec(text);
    if (tm) extract = text.slice(Math.max(0, tm.index - 120), tm.index + 120).trim();
  }
  const fullText = stripTags(clean);
  const modelsInTitleOrH1 = targetModels.filter(mId => modelTokenRegex(mId).test(`${title} ${h1}`));
  const modelsInBody = targetModels.filter(mId => modelTokenRegex(mId).test(fullText));
  return {
    page_title: title || null,
    page_h1: h1 || null,
    part_number_present: Boolean(pnMatch),
    preceding_heading: precedingHeading,
    text_extract: extract,
    models_in_title_or_h1: modelsInTitleOrH1,
    models_in_body: modelsInBody
  };
}

export async function fetchPage(url, pn, targetModels) {
  const rec = {
    requested_url: url,
    final_url: null,
    host: null,
    robots_allowed: null,
    robots_status: null,
    http_status: null,
    content_type: null,
    body_sha256: null,
    fetch_outcome: null,
    retrieval_started_at: null,
    retrieved_at: null,
    page_title: null,
    page_h1: null,
    part_number_present: false,
    models_in_title_or_h1: [],
    models_in_body: [],
    preceding_heading: null,
    text_extract: null
  };
  let u;
  try { u = new URL(url); } catch { rec.fetch_outcome = 'INVALID_URL'; return rec; }
  rec.host = u.hostname;
  if (EXCLUDED_HOSTS[u.hostname]) { rec.fetch_outcome = `EXCLUDED:${EXCLUDED_HOSTS[u.hostname]}`; return rec; }
  if (/\.pdf($|\?)/i.test(u.pathname)) { rec.fetch_outcome = 'SKIPPED_PDF_NOT_PARSED_IN_PILOT'; return rec; }
  const rb = await isAllowedByRobots(u);
  rec.robots_allowed = rb.allowed;
  rec.robots_status = rb.robots_status;
  if (!rb.allowed) { rec.fetch_outcome = 'ROBOTS_DISALLOWED'; return rec; }
  try {
    rec.retrieval_started_at = new Date().toISOString();
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    rec.retrieved_at = new Date().toISOString();
    rec.http_status = r.status;
    rec.final_url = r.url;
    rec.content_type = r.headers.get('content-type');
    const body = await r.text();
    rec.body_sha256 = sha256(body);
    if (r.status === 403 || r.status === 429 || r.status === 503) {
      rec.fetch_outcome = 'BLOCKED_NO_BYPASS_ATTEMPTED';
    } else if (!r.ok) {
      rec.fetch_outcome = `HTTP_${r.status}`;
    } else if (!/html/i.test(rec.content_type || '')) {
      rec.fetch_outcome = 'NON_HTML_CONTENT';
    } else {
      rec.fetch_outcome = 'FETCHED';
      Object.assign(rec, extractFromHtml(body, pn, targetModels));
    }
  } catch (e) {
    rec.fetch_outcome = 'NETWORK_ERROR:' + e.message;
    rec.retrieved_at = rec.retrieved_at || new Date().toISOString();
  }
  await sleep(DELAY_MS);
  return rec;
}

export async function revalidateExistingObservations() {
  if (!fs.existsSync(outPath)) {
    throw new Error(`fetch_ledger.json does not exist at ${outPath}`);
  }
  const ledger = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const pilot = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56k', 'EXTERNAL_EVIDENCE_PILOT_INPUT.json'), 'utf8'));
  const targetsMap = new Map(pilot.pilot_targets.map(t => [t.part_number, t]));

  console.log('🔄 Revalidating existing Phase 56K external observations with exact per-page timestamps...');
  let revalidatedCount = 0;
  for (const t of ledger.targets) {
    const pilotTarget = targetsMap.get(t.part_number);
    const targetModels = pilotTarget?.published_models || [];
    for (let i = 0; i < t.pages.length; i++) {
      const p = t.pages[i];
      if (p.fetch_outcome === 'FETCHED' || p.requested_url) {
        if (p.fetch_outcome === 'FETCHED') {
          console.log(`  Fetching live page for target #${t.pilot_rank} (${t.part_number}): ${p.requested_url}`);
          const updated = await fetchPage(p.requested_url, t.part_number, targetModels);
          t.pages[i] = updated;
          revalidatedCount++;
        }
      }
    }
  }
  ledger.revalidated_at = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  console.log(`✅ Revalidated ${revalidatedCount} pages with distinct per-page timestamps in ${outPath}`);
  return ledger;
}

export async function acquire() {
  const pilot = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56k', 'EXTERNAL_EVIDENCE_PILOT_INPUT.json'), 'utf8'));
  const targets = pilot.pilot_targets;
  const ledger = {
    phase: 'PHASE_56K',
    artifact: 'FETCH_LEDGER',
    user_agent: USER_AGENT,
    policy: {
      discovery_engine: 'html.duckduckgo.com (robots.txt: Allow /) — DISCOVERY_ONLY, never evidence',
      robots_respected: true,
      delay_ms_between_requests: DELAY_MS,
      max_queries_per_target: MAX_QUERIES_PER_TARGET,
      max_pages_per_target: MAX_PAGES_PER_TARGET,
      no_login_captcha_paywall_or_js_bypass: true,
      no_retry_on_403_429_503: true,
      full_page_bodies_stored_in_repo: false
    },
    started_at: new Date().toISOString(),
    targets: []
  };

  for (const t of targets) {
    const pn = t.part_number;
    const queryModels = (t.unresolved_base_models.length ? t.unresolved_base_models : t.unresolved_published_models.length ? t.unresolved_published_models : t.published_models).slice(0, MAX_QUERIES_PER_TARGET);
    const tRec = { pilot_rank: t.pilot_rank, part_number: pn, part_number_display: t.part_number_display, query_models: queryModels, discovery: [], pages: [] };
    const seen = new Set();
    const toFetch = [];
    for (const qm of queryModels) {
      const d = await ddgDiscover(`"${t.part_number_display}" STIHL "${modelDisplay(qm)}"`);
      tRec.discovery.push(d);
      for (const u of d.result_urls) {
        if (seen.has(u)) continue;
        seen.add(u);
        toFetch.push(u);
      }
    }
    // Prefer non-excluded hosts, keep discovery order; cap pages
    const candidates = toFetch.filter(u => { try { return !EXCLUDED_HOSTS[new URL(u).hostname]; } catch { return false; } });
    const skipped = toFetch.filter(u => !candidates.includes(u)).map(u => ({ requested_url: u, host: (() => { try { return new URL(u).hostname; } catch { return null; } })(), fetch_outcome: `EXCLUDED:${EXCLUDED_HOSTS[(() => { try { return new URL(u).hostname; } catch { return ''; } })()] || 'INVALID_URL'}` }));
    tRec.pages.push(...skipped);
    for (const u of candidates.slice(0, MAX_PAGES_PER_TARGET)) {
      tRec.pages.push(await fetchPage(u, pn, t.published_models));
    }
    ledger.targets.push(tRec);
    const fetched = tRec.pages.filter(p => p.fetch_outcome === 'FETCHED');
    console.log(`#${t.pilot_rank} ${pn}: discovered=${toFetch.length} fetched=${fetched.length} pn_present=${fetched.filter(p => p.part_number_present).length}`);
  }
  ledger.finished_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  console.log('Wrote', outPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await acquire();
}
