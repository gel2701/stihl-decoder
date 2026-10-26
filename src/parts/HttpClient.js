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
      this.cacheDir = options.cacheDir || options.fixtureDir || FIXTURE_DIR;
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
          const isBinary = Boolean(
            cached.is_binary ||
            cached.body_encoding === 'latin1' ||
            (cached.content_type && cached.content_type.includes('application/pdf')) ||
            url.endsWith('.pdf')
          );

          if (isBinary) {
            const encoding = cached.body_encoding || 'latin1';
            const buffer = Buffer.from(cached.body, encoding);
            const observedHash = crypto.createHash('sha256').update(buffer).digest('hex');
            const storedHash = cached.body_sha256 || null;

            if (!storedHash || storedHash.toLowerCase() !== observedHash.toLowerCase()) {
              cached.cache_integrity = 'INVALID_HASH';
              cached.observed_sha256 = observedHash;
              if (this.mode === 'LIVE') {
                try { fs.unlinkSync(cachePath); } catch (e) {}
                return null;
              }
            } else {
              cached.cache_integrity = 'VERIFIED';
              cached.observed_sha256 = observedHash;
            }
            cached.buffer = buffer;
            cached.is_binary = true;
            cached.body_encoding = encoding;
          } else {
            const observedHash = crypto.createHash('sha256').update(cached.body, 'utf8').digest('hex');
            const storedHash = cached.body_sha256 || null;

            if (!storedHash || storedHash.toLowerCase() !== observedHash.toLowerCase()) {
              cached.cache_integrity = 'INVALID_HASH';
              cached.observed_sha256 = observedHash;
              if (this.mode === 'LIVE') {
                try { fs.unlinkSync(cachePath); } catch (e) {}
                return null;
              }
            } else {
              cached.cache_integrity = 'VERIFIED';
              cached.observed_sha256 = observedHash;
            }
            cached.buffer = null;
            cached.is_binary = false;
            cached.body_encoding = 'utf8';
          }

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

  writeToCache(url, status, body, headers = {}, finalUrl = null, options = {}) {
    if (!this.useCache) return;
    try {
      const cachePath = this.getCachePath(url);
      const isBinary = Boolean(
        options.isBinary ||
        options.buffer ||
        options.bodyEncoding === 'latin1' ||
        (headers['content-type'] && headers['content-type'].includes('application/pdf')) ||
        url.endsWith('.pdf')
      );

      const bodyEncoding = options.bodyEncoding || (isBinary ? 'latin1' : 'utf8');

      let bodySha256;
      if (options.bodySha256) {
        bodySha256 = options.bodySha256;
      } else if (options.buffer) {
        bodySha256 = crypto.createHash('sha256').update(options.buffer).digest('hex');
      } else if (isBinary) {
        const buf = Buffer.from(body || '', bodyEncoding);
        bodySha256 = crypto.createHash('sha256').update(buf).digest('hex');
      } else {
        bodySha256 = crypto.createHash('sha256').update(body || '', 'utf8').digest('hex');
      }

      const cacheData = {
        url,
        requested_url: url,
        final_url: finalUrl || url,
        status,
        content_type: headers['content-type'] || (isBinary ? 'application/pdf' : 'text/html'),
        fetched_at: new Date().toISOString(),
        is_binary: isBinary,
        body_encoding: bodyEncoding,
        body_sha256: bodySha256,
        cache_integrity: 'VERIFIED',
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
      if (cached.cache_integrity === 'INVALID_HASH') {
        if (this.mode === 'LIVE') {
          // Already invalidated in readFromCache, will fall through to live fetch
        } else {
          return {
            url,
            requested_url: cached.requested_url || cached.url || url,
            final_url: cached.final_url || cached.url || url,
            status: cached.status,
            statusText: 'CACHE_INVALID_HASH',
            contentType: cached.content_type || 'text/html',
            body: cached.body,
            buffer: cached.buffer || null,
            bodySha256: cached.body_sha256,
            cache_integrity: 'INVALID_HASH',
            fromCache: true,
            fetchedAt: cached.fetched_at,
            mode: this.mode,
            error: 'INVALID_BINARY_CACHE: stored hash does not match computed payload hash'
          };
        }
      } else {
        return {
          url,
          requested_url: cached.requested_url || cached.url || url,
          final_url: cached.final_url || cached.url || url,
          status: cached.status,
          statusText: cached.status === 200 ? 'OK' : `HTTP ${cached.status}`,
          contentType: cached.content_type || 'text/html',
          body: cached.body,
          buffer: cached.buffer || null,
          bodySha256: cached.body_sha256,
          cache_integrity: cached.cache_integrity || 'VERIFIED',
          fromCache: true,
          fetchedAt: cached.fetched_at,
          mode: this.mode
        };
      }
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

        const contentType = response.headers.get('content-type') || 'text/html';
        const isPdf = contentType.includes('application/pdf') || url.endsWith('.pdf') || Boolean(options.binary);
        let body;
        let buffer = null;
        if (isPdf) {
          const ab = await response.arrayBuffer();
          buffer = Buffer.from(ab);
          body = buffer.toString('latin1');
        } else {
          body = await response.text();
        }
        const bodySha256 = buffer
          ? crypto.createHash('sha256').update(buffer).digest('hex')
          : crypto.createHash('sha256').update(body || '', 'utf8').digest('hex');
        const finalUrl = response.url || url;

        // Cache response in live cache directory
        this.writeToCache(url, response.status, body, { 'content-type': contentType }, finalUrl, {
          buffer,
          bodySha256,
          isBinary: Boolean(isPdf),
          bodyEncoding: isPdf ? 'latin1' : 'utf8'
        });

        return {
          url,
          requested_url: url,
          final_url: finalUrl,
          status: response.status,
          statusText: response.statusText || (response.status === 200 ? 'OK' : `HTTP ${response.status}`),
          contentType,
          body,
          buffer,
          bodySha256,
          cache_integrity: 'VERIFIED',
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
