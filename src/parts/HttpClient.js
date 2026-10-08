import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const LIVE_CACHE_DIR = path.resolve(ROOT_DIR, '.cache', 'parts-harvester', 'live');
const FIXTURE_DIR = path.resolve(ROOT_DIR, 'tests', 'fixtures', 'parts', 'cache');

export class HttpClient {
  constructor(options = {}) {
    // Mode must be explicitly 'LIVE' or 'FIXTURE'
    this.mode = options.mode ? String(options.mode).toUpperCase() : (options.live ? 'LIVE' : 'FIXTURE');
    this.useCache = options.useCache !== false;
    this.refresh = Boolean(options.refresh);
    this.timeoutMs = options.timeoutMs || 15000;
    this.maxRetries = options.maxRetries ?? 2;
    this.backoffMs = options.backoffMs || 1000;
    this.minDelayMs = options.minDelayMs || 500;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (Compatible; STIHLDecoder-PartsHarvester/1.0; +https://www.stihldecoder.nl)';
    this.lastRequestTimes = new Map();

    if (this.mode === 'LIVE') {
      this.cacheDir = options.cacheDir || LIVE_CACHE_DIR;
      if (this.useCache && !fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } else {
      this.cacheDir = options.fixtureDir || FIXTURE_DIR;
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    }
  }

  getCacheKey(url) {
    const canonicalUrl = String(url).trim();
    return crypto.createHash('sha256').update(canonicalUrl).digest('hex');
  }

  getCachePath(url) {
    const key = this.getCacheKey(url);
    return path.join(this.cacheDir, `${key}.json`);
  }

  readFromCache(url) {
    if (!this.useCache || (this.refresh && this.mode === 'LIVE')) return null;

    const cachePath = this.getCachePath(url);
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached && cached.url === url && typeof cached.body === 'string') {
          return cached;
        }
      } catch (err) {
        // Corrupted cache file
      }
    }

    // STRICT INVARIANT: In LIVE mode, NEVER fallback to fixture directory!
    if (this.mode === 'LIVE') {
      return null;
    }

    return null;
  }

  writeToCache(url, status, body, headers = {}, finalUrl = null) {
    if (!this.useCache) return;
    try {
      const cachePath = this.getCachePath(url);
      const cacheData = {
        url,
        requested_url: url,
        final_url: finalUrl || url,
        status,
        content_type: headers['content-type'] || 'text/html',
        fetched_at: new Date().toISOString(),
        body_sha256: crypto.createHash('sha256').update(body || '').digest('hex'),
        body: body || '',
        mode: this.mode
      };
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[HttpClient] Failed writing cache for ${url}:`, err.message);
    }
  }

  async paceRequest(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const lastTime = this.lastRequestTimes.get(host) || 0;
      const now = Date.now();
      const elapsed = now - lastTime;
      if (elapsed < this.minDelayMs) {
        const waitTime = this.minDelayMs - elapsed;
        await new Promise(r => setTimeout(r, waitTime));
      }
      this.lastRequestTimes.set(host, Date.now());
    } catch (e) {
      // Invalid URL format
    }
  }

  async get(url, options = {}) {
    // 1. Check local cache for the active mode
    const cached = this.readFromCache(url);
    if (cached) {
      return {
        url,
        requested_url: cached.requested_url || cached.url || url,
        final_url: cached.final_url || cached.url || url,
        status: cached.status,
        statusText: cached.status === 200 ? 'OK' : `HTTP ${cached.status}`,
        contentType: cached.content_type || 'text/html',
        body: cached.body,
        bodySha256: cached.body_sha256 || crypto.createHash('sha256').update(cached.body || '').digest('hex'),
        fromCache: true,
        fetchedAt: cached.fetched_at,
        mode: this.mode
      };
    }

    // 2. In FIXTURE mode, do NOT make network calls
    if (this.mode === 'FIXTURE') {
      return {
        url,
        requested_url: url,
        final_url: url,
        status: 404,
        statusText: 'FIXTURE_NOT_FOUND',
        contentType: 'text/plain',
        body: '',
        bodySha256: crypto.createHash('sha256').update('').digest('hex'),
        fromCache: false,
        error: 'FIXTURE_NOT_FOUND (FIXTURE mode does not perform network requests)',
        mode: 'FIXTURE'
      };
    }

    // 3. In LIVE mode: execute real HTTP request with polite rate limiting and retry backoff
    await this.paceRequest(url);

    let lastError = null;
    let attempts = 0;
    const maxAttempts = this.maxRetries + 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8,de;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...(options.headers || {})
          },
          signal: controller.signal,
          redirect: 'follow'
        });

        clearTimeout(timeout);

        const body = await response.text();
        const contentType = response.headers.get('content-type') || 'text/html';
        const bodySha256 = crypto.createHash('sha256').update(body || '').digest('hex');
        const finalUrl = response.url || url;

        // Cache response in live cache directory
        this.writeToCache(url, response.status, body, { 'content-type': contentType }, finalUrl);

        return {
          url,
          requested_url: url,
          final_url: finalUrl,
          status: response.status,
          statusText: response.statusText || (response.status === 200 ? 'OK' : `HTTP ${response.status}`),
          contentType,
          body,
          bodySha256,
          fromCache: false,
          fetchedAt: new Date().toISOString(),
          mode: 'LIVE'
        };
      } catch (err) {
        lastError = err;
        if (attempts < maxAttempts) {
          const delay = this.backoffMs * Math.pow(2, attempts - 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    return {
      url,
      status: 0,
      statusText: 'NETWORK_ERROR',
      contentType: 'text/plain',
      body: '',
      bodySha256: crypto.createHash('sha256').update('').digest('hex'),
      fromCache: false,
      error: lastError ? lastError.message : 'Unknown network error',
      mode: 'LIVE'
    };
  }
}
