/**
 * Google Search Console Integration Layer for STIHLDecoder.nl
 * Phase 56G — Safe, reusable, fail-closed GSC access
 *
 * INVARIANTS:
 * 1. Never fabricates metrics. Without valid authorization every call returns status NOT_CONFIGURED
 *    (or an explicit error status) and an empty row set.
 * 2. Credentials are read only from environment variables and are never logged or returned.
 * 3. Every returned row is tagged with provenance 'GSC_LIVE_API' so live data can never be confused
 *    with offline / reproducible analyses ('OFFLINE_ANALYSIS').
 * 4. Read-only scope only (https://www.googleapis.com/auth/webmasters.readonly).
 *
 * Required configuration (not present in repository):
 *   GSC_ACCESS_TOKEN  — short-lived OAuth 2.0 access token with webmasters.readonly scope
 *                       (minted externally, e.g. via a service account that is added as a user
 *                        on the Search Console property, or via an OAuth consent flow)
 *   GSC_SITE_URL      — property identifier, e.g. 'sc-domain:stihldecoder.nl' or 'https://www.stihldecoder.nl/'
 */

export const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_DEFAULT_SITE_URL = 'sc-domain:stihldecoder.nl';
export const GSC_PROVENANCE_LIVE = 'GSC_LIVE_API';
export const GSC_PROVENANCE_OFFLINE = 'OFFLINE_ANALYSIS';

export const GSC_STATUSES = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURED: 'CONFIGURED',
  OK: 'OK',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST'
};

const ALLOWED_DIMENSIONS = new Set(['query', 'page', 'country', 'device', 'date', 'searchAppearance']);
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns configuration state without exposing secrets.
 * @param {Object} [env=process.env]
 */
export function getSearchConsoleConfigState(env = process.env) {
  const hasToken = typeof env.GSC_ACCESS_TOKEN === 'string' && env.GSC_ACCESS_TOKEN.trim().length > 0;
  const siteUrl = (typeof env.GSC_SITE_URL === 'string' && env.GSC_SITE_URL.trim()) ? env.GSC_SITE_URL.trim() : null;
  const missing = [];
  if (!hasToken) missing.push('GSC_ACCESS_TOKEN');
  if (!siteUrl) missing.push('GSC_SITE_URL');
  return {
    status: missing.length === 0 ? GSC_STATUSES.CONFIGURED : GSC_STATUSES.NOT_CONFIGURED,
    has_access_token: hasToken,
    site_url: siteUrl,
    suggested_site_url: GSC_DEFAULT_SITE_URL,
    required_scope: GSC_READONLY_SCOPE,
    missing
  };
}

/**
 * Builds and validates a Search Analytics request body.
 * @returns {{ ok: boolean, body?: Object, error?: string }}
 */
export function buildSearchAnalyticsRequest({ startDate, endDate, dimensions = ['query'], rowLimit = 1000, startRow = 0 } = {}) {
  if (!DATE_REGEX.test(String(startDate || '')) || !DATE_REGEX.test(String(endDate || ''))) {
    return { ok: false, error: 'INVALID_DATE_RANGE' };
  }
  if (startDate > endDate) return { ok: false, error: 'START_AFTER_END' };
  if (!Array.isArray(dimensions) || dimensions.length === 0 || dimensions.some(d => !ALLOWED_DIMENSIONS.has(d))) {
    return { ok: false, error: 'INVALID_DIMENSIONS' };
  }
  const limit = Math.max(1, Math.min(Number(rowLimit) || 1000, 25000));
  return {
    ok: true,
    body: { startDate, endDate, dimensions: [...dimensions], rowLimit: limit, startRow: Math.max(0, Number(startRow) || 0), dataState: 'final' }
  };
}

/**
 * Normalizes raw GSC rows; computes nothing that is not in the source payload.
 */
export function normalizeSearchAnalyticsRows(rawRows, dimensions) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .filter(r => r && Array.isArray(r.keys))
    .map(r => {
      const row = { provenance: GSC_PROVENANCE_LIVE };
      dimensions.forEach((d, i) => { row[d] = r.keys[i]; });
      row.clicks = Number.isFinite(r.clicks) ? r.clicks : null;
      row.impressions = Number.isFinite(r.impressions) ? r.impressions : null;
      row.ctr = Number.isFinite(r.ctr) ? r.ctr : null;
      row.position = Number.isFinite(r.position) ? r.position : null;
      return row;
    });
}

async function gscFetch(url, options, env, fetchImpl) {
  const token = env.GSC_ACCESS_TOKEN.trim();
  let res;
  try {
    res = await fetchImpl(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return { status: GSC_STATUSES.NETWORK_ERROR, data: null };
  }
  if (res.status === 401) return { status: GSC_STATUSES.UNAUTHORIZED, data: null };
  if (res.status === 403) return { status: GSC_STATUSES.FORBIDDEN, data: null };
  if (!res.ok) return { status: GSC_STATUSES.API_ERROR, http_status: res.status, data: null };
  try {
    return { status: GSC_STATUSES.OK, data: await res.json() };
  } catch {
    return { status: GSC_STATUSES.API_ERROR, data: null };
  }
}

/**
 * Queries Search Analytics. Fail-closed: returns { status, rows: [] } whenever not authorized.
 */
export async function fetchSearchAnalytics(params = {}, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = getSearchConsoleConfigState(env);
  if (config.status !== GSC_STATUSES.CONFIGURED) {
    return { status: GSC_STATUSES.NOT_CONFIGURED, missing: config.missing, provenance: null, rows: [] };
  }
  const req = buildSearchAnalyticsRequest(params);
  if (!req.ok) return { status: GSC_STATUSES.INVALID_REQUEST, error: req.error, provenance: null, rows: [] };
  if (typeof fetchImpl !== 'function') return { status: GSC_STATUSES.NETWORK_ERROR, provenance: null, rows: [] };

  const url = `${GSC_API_BASE}/sites/${encodeURIComponent(config.site_url)}/searchAnalytics/query`;
  const result = await gscFetch(url, { method: 'POST', body: JSON.stringify(req.body) }, env, fetchImpl);
  if (result.status !== GSC_STATUSES.OK) return { status: result.status, provenance: null, rows: [] };
  return {
    status: GSC_STATUSES.OK,
    provenance: GSC_PROVENANCE_LIVE,
    request: req.body,
    rows: normalizeSearchAnalyticsRows(result.data?.rows, req.body.dimensions)
  };
}

/**
 * Lists submitted sitemaps for the property (processing status). Fail-closed.
 */
export async function fetchSitemaps({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = getSearchConsoleConfigState(env);
  if (config.status !== GSC_STATUSES.CONFIGURED) {
    return { status: GSC_STATUSES.NOT_CONFIGURED, missing: config.missing, sitemaps: [] };
  }
  if (typeof fetchImpl !== 'function') return { status: GSC_STATUSES.NETWORK_ERROR, sitemaps: [] };
  const url = `${GSC_API_BASE}/sites/${encodeURIComponent(config.site_url)}/sitemaps`;
  const result = await gscFetch(url, { method: 'GET' }, env, fetchImpl);
  if (result.status !== GSC_STATUSES.OK) return { status: result.status, sitemaps: [] };
  const sitemaps = (result.data?.sitemap || []).map(s => ({
    provenance: GSC_PROVENANCE_LIVE,
    path: s.path,
    last_submitted: s.lastSubmitted || null,
    last_downloaded: s.lastDownloaded || null,
    is_pending: Boolean(s.isPending),
    warnings: Number(s.warnings) || 0,
    errors: Number(s.errors) || 0,
    contents: Array.isArray(s.contents) ? s.contents.map(c => ({ type: c.type, submitted: Number(c.submitted) || 0, indexed: c.indexed != null ? Number(c.indexed) : null })) : []
  }));
  return { status: GSC_STATUSES.OK, sitemaps };
}

/**
 * Computes high-impression / low-CTR opportunities strictly from live rows.
 * Returns [] for anything that is not live GSC data.
 */
export function findLowCtrOpportunities(rows, { minImpressions = 100, maxCtr = 0.02 } = {}) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && r.provenance === GSC_PROVENANCE_LIVE && Number.isFinite(r.impressions) && Number.isFinite(r.ctr))
    .filter(r => r.impressions >= minImpressions && r.ctr <= maxCtr)
    .sort((a, b) => b.impressions - a.impressions);
}
