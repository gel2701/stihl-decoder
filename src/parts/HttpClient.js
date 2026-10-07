import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache', 'parts-harvester');

export class HttpClient {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
    this.useCache = options.useCache !== false;
    this.refresh = Boolean(options.refresh);
    this.timeoutMs = options.timeoutMs || 15000;
    this.maxRetries = options.maxRetries ?? 3;
    this.backoffMs = options.backoffMs || 1000;
    this.minDelayMs = options.minDelayMs || 1000; // 1s rate limit pacing
    this.userAgent = options.userAgent || 'STIHLDecoder-PartsHarvester/1.0 (Pilot Research; +https://www.stihldecoder.nl)';
    this.lastRequestTimes = new Map();

    if (this.useCache && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
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
    if (!this.useCache || this.refresh) return null;
    const cachePath = this.getCachePath(url);
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached && cached.url === url && cached.status === 200 && typeof cached.body === 'string') {
          return cached;
        }
      } catch (err) {
        // Corrupted cache file - ignore and refetch
      }
    }
    return null;
  }

  writeToCache(url, status, body, headers = {}) {
    if (!this.useCache) return;
    try {
      const cachePath = this.getCachePath(url);
      const cacheData = {
        url,
        status,
        fetched_at: new Date().toISOString(),
        body_sha256: crypto.createHash('sha256').update(body || '').digest('hex'),
        body: body || ''
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
      // Invalid URL format fallback
    }
  }

  async get(url, options = {}) {
    // 1. Check local cache
    const cached = this.readFromCache(url);
    if (cached) {
      return {
        url,
        status: cached.status,
        body: cached.body,
        fromCache: true,
        fetchedAt: cached.fetched_at
      };
    }

    // 2. Pace request per host
    await this.paceRequest(url);

    // 3. Execute with retries & exponential backoff
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.backoffMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...(options.headers || {})
          }
        });
        clearTimeout(timeoutId);

        const status = res.status;
        const body = await res.text();

        if (status === 200) {
          this.writeToCache(url, status, body);
          return {
            url,
            status,
            body,
            fromCache: false,
            fetchedAt: new Date().toISOString()
          };
        } else if (status === 404) {
          // 404 is not retryable
          return {
            url,
            status,
            body,
            fromCache: false,
            error: 'HTTP 404 Not Found'
          };
        } else {
          lastError = new Error(`HTTP ${status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    return {
      url,
      status: 0,
      body: null,
      fromCache: false,
      error: lastError?.message || 'Request failed after retries'
    };
  }
}
