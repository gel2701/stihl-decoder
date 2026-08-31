import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIMARY_HOST, PRIMARY_ORIGIN, SITE_URL, buildCanonicalUrl } from './src/config.js';
import { getDatabaseHealthSnapshot, getDatabasePath, isPersistentDiskActive } from './src/databaseConfig.js';
import { decodeStihlCode } from './src/decoder.js';
import { handleDecodeApiV1 } from './src/StihlDecoderController.js';
import { renderModelPageHtml } from './src/components/ModelPageTemplate.js';
import { renderIntentPageHtml } from './src/components/IntentPageTemplate.js';
import { renderCategoryPageHtml } from './src/components/CategoryPageTemplate.js';
import { renderComparisonPageHtml } from './src/components/ComparisonPageTemplate.js';
import { renderModelPartsPageHtml } from './src/components/ModelPartsPageTemplate.js';
import { generateSitemapXml, generateRobotsTxt } from './src/components/SitemapGenerator.js';
import { generateSeoAuditReport } from './src/components/SeoAuditEngine.js';
import { logStihlEvent, EVENT_TYPES } from './src/components/AnalyticsTracker.js';
import { getSafeCategorySlug, getSafeModelPath, getSafeModelPartsPath, getValuationPublicationState, resolveComparisonRoute } from './src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const publicEvidencePath = path.join(__dirname, 'data', 'public_evidence_facts.json');

// Load database (JSON or SQLite fallback)
const jsonPath = path.join(__dirname, 'data', 'stihl_database.json');
let database = {};

try {
  if (fs.existsSync(jsonPath)) {
    database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log('✅ STIHL Database JSON successfully loaded.');
  }
} catch (err) {
  console.error('⚠️ Could not load stihl_database.json:', err);
}

try {
  if (fs.existsSync(publicEvidencePath)) {
    database.public_evidence = JSON.parse(fs.readFileSync(publicEvidencePath, 'utf8'));
    console.log('✅ Public evidence overlay successfully loaded.');
  }
} catch (err) {
  database.public_evidence = null;
  console.error('⚠️ Could not load public_evidence_facts.json, continuing in canonical-only mode:', err.message);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const KNOWN_CATEGORIES = ['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen', 'accu-kettingzagen', 'doorslijpers'];
const MAX_JSON_BODY_BYTES = 32 * 1024;
const PUBLIC_ROOT_FILES = new Set([
  'index.html',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'favicon-96x96.png',
  'favicon-192x192.png',
  'favicon-512x512.png',
  'apple-touch-icon.png',
  'site.webmanifest'
]);
const PUBLIC_PREFIXES = ['/css/'];
const PUBLIC_EXACT_FILES = new Set([
  '/components/tools/GietklokHelper.js',
  '/src/components/StihlPassportGenerator.js',
  '/src/categoryWhitelist.js'
]);

const server = http.createServer(async (req, res) => {
  try {
  const forwardedHost = (req.headers['x-forwarded-host'] || req.headers.host || PRIMARY_HOST).toLowerCase();
  const forwardedProto = (req.headers['x-forwarded-proto'] || 'https').toLowerCase();
  const urlObj = new URL(req.url, `http://${forwardedHost}`);
  let pathname = urlObj.pathname;

  // Diagnostic Logging for Forensics (NO PII)
  if (process.env.NODE_ENV === 'production' || process.env.DEBUG_REDIRECTS) {
    console.log(`[HTTP-Request] host: "${req.headers.host}", x-forwarded-host: "${req.headers['x-forwarded-host']}", x-forwarded-proto: "${forwardedProto}", url: "${req.url}"`);
  }

  // 0. Render Alignment: Node.js serves 200 OK directly for all incoming requests.
  // Host redirects (apex -> www) are handled cleanly by Render Edge CDN without application-level conflict.

  // 1. Dynamic Route: GET /sitemap.xml
  if (pathname === '/sitemap.xml') {
    const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=UTF-8', 'X-Robots-Tag': 'noindex' });
    res.end(sitemapXml);
    return;
  }

  // 2. Dynamic Route: GET /robots.txt
  if (pathname === '/robots.txt') {
    const robotsTxt = generateRobotsTxt(PRIMARY_ORIGIN);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end(robotsTxt);
    return;
  }

  // 2b. Dynamic Route: GET /api/version
  if (pathname === '/api/version') {
    const persistent = isPersistentDiskActive();
    const databaseHealth = getDatabaseHealthSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      repository: 'https://github.com/gel2701/stihl-decoder.git',
      commit: process.env.RENDER_GIT_COMMIT || '014e201',
      branch: process.env.RENDER_GIT_BRANCH || 'main',
      environment: process.env.NODE_ENV || 'production',
      database: {
        connected: databaseHealth.connected,
        persistent,
        path_type: persistent ? 'persistent_disk' : 'local_or_ephemeral',
        analytics_schema_ready: databaseHealth.analyticsSchemaReady,
        schema_version: databaseHealth.schemaVersion,
        last_error: databaseHealth.lastError
      },
      deployed_at: new Date().toISOString()
    }));
    return;
  }

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function checkRateLimit(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || (now - entry.startTime > RATE_LIMIT_WINDOW_MS)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

  // 3. REST API v1: POST /api/v1/decode
  if (pathname === '/api/v1/decode' && req.method === 'POST') {
    if (checkRateLimit(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' }));
      return;
    }

    const bodyObj = await readJsonBody(req, res);
    if (bodyObj === null) return;

    if (bodyObj.serialNumber && typeof bodyObj.serialNumber === 'string') {
      bodyObj.serialNumber = bodyObj.serialNumber.trim().substring(0, 50).replace(/[^a-zA-Z0-9\s\.\-_\/]/g, '');
    }

    const result = await handleDecodeApiV1(bodyObj, database);
    logStihlEvent(
      EVENT_TYPES.DECODER_USED,
      { model: bodyObj.serialNumber || bodyObj.serial_number || bodyObj.code || null },
      req.headers['user-agent']
    );
    res.writeHead(result.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result.body));
    return;
  }

  // 4. REST API Lead Submission MVP Routes
  if (pathname === '/api/v1/leads/repair' && req.method === 'POST') {
    logStihlEvent(EVENT_TYPES.REPAIR_LEAD_COMPLETED, {}, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end('<article style="background:#111;color:#fff;padding:2rem;font-family:sans-serif;"><h2>✅ Reparatie Aanvraag Ontvangen!</h2><p>Wij nemen binnen 24 uur contact met u op.</p><a href="/" style="color:#f97316;">← Terug naar Home</a></article>');
    return;
  }

  if (pathname === '/api/v1/leads/sell' && req.method === 'POST') {
    logStihlEvent(EVENT_TYPES.SELL_LEAD_COMPLETED, {}, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end('<article style="background:#111;color:#fff;padding:2rem;font-family:sans-serif;"><h2>✅ Verkoop Aanvraag Ontvangen!</h2><p>U ontvangt binnenkort een overnamebod op het opgegeven e-mailadres.</p><a href="/" style="color:#f97316;">← Terug naar Home</a></article>');
    return;
  }

  // 5. REST API: GET /api/decode?code=...
  if (pathname === '/api/decode') {
    if (checkRateLimit(req)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' }));
      return;
    }

    let code = (urlObj.searchParams.get('code') || '').trim();
    if (code.length > 50) code = code.substring(0, 50);
    code = code.replace(/[^a-zA-Z0-9\s\.\-_\/]/g, '');

    const result = decodeStihlCode(code, database);
    logStihlEvent(EVENT_TYPES.DECODER_USED, { input: code, success: result.success }, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // 6. Category Landing Pages
  const cleanCategory = pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
  if (KNOWN_CATEGORIES.includes(cleanCategory)) {
    const categoryHtml = renderCategoryPageHtml(cleanCategory, database, PRIMARY_ORIGIN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(categoryHtml);
    return;
  }

  // 7. Comparison Engine Routes (/vergelijk/ or /vergelijk/:pair/)
  if (pathname.startsWith('/vergelijk')) {
    const pairSlug = pathname.replace('/vergelijk/', '').replace('/vergelijk', '').replace(/\/$/, '');
    const comparisonRoute = resolveComparisonRoute(pairSlug, database);
    if (comparisonRoute.status === 'REDIRECT') {
      res.writeHead(301, { 'Location': `${PRIMARY_ORIGIN}/vergelijk/${comparisonRoute.canonicalSlug}/` });
      res.end();
      return;
    }
    if (comparisonRoute.status !== 'CANONICAL') {
      renderNotFound(res);
      return;
    }
    const html = renderComparisonPageHtml(comparisonRoute.canonicalSlug, database, PRIMARY_ORIGIN);
    logStihlEvent(EVENT_TYPES.COMPARISON_VIEWED, { pairSlug: comparisonRoute.canonicalSlug }, req.headers['user-agent']);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // 8. Model Parts Compatibility Pages (e.g. /kettingzagen/ms-261/onderdelen/)
  if (pathname.endsWith('/onderdelen/') || pathname.endsWith('/onderdelen')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && KNOWN_CATEGORIES.includes(parts[0].toLowerCase())) {
      const catSlug = parts[0].toLowerCase();
      const modelSlug = parts[1].toLowerCase();
      const targetModel = findModelBySlug(modelSlug, database);

      if (targetModel) {
        const canonicalCategory = getSafeCategorySlug(targetModel);
        if (!canonicalCategory) {
          renderNotFound(res);
          return;
        }
        if (canonicalCategory !== catSlug) {
          res.writeHead(301, { 'Location': `${PRIMARY_ORIGIN}/${canonicalCategory}/${modelSlug}/onderdelen/` });
          res.end();
          return;
        }
        const partsHtml = renderModelPartsPageHtml(targetModel, database, PRIMARY_ORIGIN);
        logStihlEvent(EVENT_TYPES.PART_SEARCH, { model: targetModel.model_name }, req.headers['user-agent']);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(partsHtml);
        return;
      }
    }
    renderNotFound(res);
    return;
  }

  // 9. Protected Internal Route: GET /admin/seo-audit
  if (pathname === '/admin/seo-audit' || pathname === '/admin/seo-audit/') {
    const apiKey = req.headers['x-admin-key'];
    const expectedApiKey = process.env.ADMIN_AUDIT_KEY || '';
    if (process.env.NODE_ENV === 'production' && !expectedApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' });
      res.end(JSON.stringify({ error: 'Admin audit secret ontbreekt op de server.' }));
      return;
    }
    if (process.env.NODE_ENV === 'production' && !timingSafeEqual(apiKey, expectedApiKey)) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' });
      res.end(JSON.stringify({ error: 'Geen toegang tot admin audit.' }));
      return;
    }

    const auditReport = generateSeoAuditReport(database, PRIMARY_ORIGIN);
    res.writeHead(200, { 
      'Content-Type': 'application/json; charset=UTF-8', 
      'X-Robots-Tag': 'noindex, nofollow',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(auditReport, null, 2));
    return;
  }

  // 10. 301 Permanent Redirect for Legacy Routes (/modellen/* -> /:category/:slug/)
  if (pathname.startsWith('/modellen')) {
    const parts = pathname.split('/').filter(Boolean);
    let targetSlug = parts[parts.length - 1] || '';
    let targetModel = null;

    if (targetSlug && database.models) {
      const cleanSlug = targetSlug.toLowerCase().replace(/^stihl-/, '');
      targetModel = database.models.find(m => {
        const mSlug = (m.slug || m.id).toLowerCase();
        return mSlug === targetSlug.toLowerCase() || mSlug.replace(/^stihl-/, '') === cleanSlug;
      });
    }

    if (targetModel) {
      const safePath = getSafeModelPath(targetModel);
      if (!safePath) {
        renderNotFound(res);
        return;
      }
      res.writeHead(301, { 'Location': `${PRIMARY_ORIGIN}${safePath}` });
      res.end();
      return;
    }

    res.writeHead(301, { 'Location': PRIMARY_ORIGIN });
    res.end();
    return;
  }

  // 11. Guides SSR Route (/gidsen/:slug/)
  if (pathname.startsWith('/gidsen/')) {
    const guideSlug = pathname.replace('/gidsen/', '').replace(/\/$/, '');
    const guides = database.guides || [];
    const guide = guides.find(g => g.slug === guideSlug);

    if (guide) {
      const html = renderGuidePageHtml(guide, database, PRIMARY_ORIGIN);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(html);
      return;
    }
  }

  // 12. Intent Landing Pages
  const cleanPath = pathname.replace(/^\//, '').replace(/\/$/, '');
  const intentPages = database.intent_pages || [];
  const matchedIntent = intentPages.find(ip => ip.slug === cleanPath);

  if (matchedIntent) {
    const html = renderIntentPageHtml(matchedIntent, database, PRIMARY_ORIGIN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // 13. Part Number Routes Hub (/onderdeelnummer/ & /onderdeelnummer/stihl-:series/)
  if (cleanPath === 'onderdeelnummer') {
    const html = renderPartNumberHubHtml(database, PRIMARY_ORIGIN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  if (pathname.startsWith('/onderdeelnummer/')) {
    const seriesCode = cleanPath.replace('onderdeelnummer/', '').replace(/^stihl-/, '');
    const hasSeries = Boolean(
      (database.part_family_prefixes && database.part_family_prefixes[seriesCode]) ||
      (database.models || []).some((model) => model.series_code === seriesCode)
    );
    if (!hasSeries) {
      renderNotFound(res);
      return;
    }
    const html = renderPartNumberSeriesHtml(seriesCode, database, PRIMARY_ORIGIN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // 14. Scoped Clean Category Model Routes
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length === 2 && KNOWN_CATEGORIES.includes(pathParts[0].toLowerCase())) {
    const catSlug = pathParts[0].toLowerCase();
    const modelSlug = pathParts[1].toLowerCase();
    const targetModel = findModelBySlug(modelSlug, database);

    if (targetModel) {
      const canonicalCategory = getSafeCategorySlug(targetModel);
      if (!canonicalCategory) {
        renderNotFound(res);
        return;
      }
      if (canonicalCategory !== catSlug) {
        res.writeHead(301, { 'Location': `${PRIMARY_ORIGIN}/${canonicalCategory}/${modelSlug}/` });
        res.end();
        return;
      }
      const html = renderModelPageHtml(targetModel, database, PRIMARY_ORIGIN);
      logStihlEvent(EVENT_TYPES.MODEL_IDENTIFIED, { model: targetModel.model_name }, req.headers['user-agent']);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(html);
      return;
    }
  }

  // 15. Valuation Preview Routes (/waarde/:slug/)
  if (pathParts.length === 2 && pathParts[0].toLowerCase() === 'waarde') {
    const modelSlug = pathParts[1].toLowerCase();
    const targetModel = findModelBySlug(modelSlug, database);

    if (!targetModel) {
      renderNotFound(res);
      return;
    }

    logStihlEvent(EVENT_TYPES.VALUATION_STARTED, { model: modelSlug }, req.headers['user-agent']);
    const valuationState = getValuationPublicationState(targetModel);
    const modelPath = getSafeModelPath(targetModel);

    const valuationHtml = `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${valuationState.titleLabel} | STIHLDecoder</title>
  <meta name="description" content="${valuationState.metaDescription}">
  <link rel="canonical" href="${PRIMARY_ORIGIN}/waarde/${modelSlug}/">
  <meta name="robots" content="${valuationState.robotsContent}">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 p-4">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-white flex items-center gap-2">
        <span class="w-8 h-8 rounded bg-orange-600 flex items-center justify-center font-black">S</span>
        STIHL Decoder
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Zoeken</a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">Waardestatus</span>
      <h1 class="text-3xl font-extrabold text-white">${valuationState.titleLabel}</h1>
      <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
        <span class="text-xs text-gray-400 block font-medium">Publicatiestatus:</span>
        <span class="text-xl font-black text-orange-400">Nog onvoldoende modelspecifieke marktdata</span>
        <p class="text-xs text-gray-400 pt-2 border-t border-gray-800">
          Deze pagina blijft op <strong>${valuationState.robotsContent}</strong> totdat modelspecifieke marktwaarnemingen beschikbaar zijn. Gebruik het serienummer- en bronstatusrapport voor machine-identificatie, niet voor een prijsclaim.
        </p>
        ${modelPath ? `<p class="text-xs text-gray-400">Bekijk eerst de <a href="${modelPath}" class="text-orange-400 underline">modelgids van STIHL ${targetModel.model_name}</a> voor bronstatus en technische context.</p>` : ''}
      </div>
    </article>
  </main>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(valuationHtml);
    return;
  }

  // 16. Serve static files
  let filePath = resolveStaticFilePath(pathname);
  if (!filePath) {
    renderNotFound(res);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>404 Niet Gevonden</h1><p>De gevraagde pagina bestaat niet op STIHLDecoder.nl.</p>');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Fout: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
  } catch (err) {
    console.error('Unhandled request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ status: 'error', message: 'Interne serverfout.' }));
    } else {
      res.end();
    }
  }
});

function renderGuidePageHtml(guide, database, baseUrl) {
  const canonicalUrl = `${baseUrl}/gidsen/${guide.slug}/`;

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${guide.title} | STIHLDecoder Gidsen</title>
  <meta name="description" content="${guide.description}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 p-4">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-white flex items-center gap-2">
        <span class="w-8 h-8 rounded bg-orange-600 flex items-center justify-center font-black">S</span>
        STIHL Decoder
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Home</a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <h1 class="text-3xl font-extrabold text-white">${guide.title}</h1>
      <p class="text-sm text-gray-300 leading-relaxed">${guide.description}</p>
    </article>
  </main>
</body>
</html>`;
}

function renderPartNumberHubHtml(database, baseUrl) {
  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL Onderdeelnummer Opzoeken & Gietnummers | STIHLDecoder</title>
  <meta name="description" content="Zoek STIHL onderdeelnummers (Teilenummer) en 4-cijferige serie prefixes op. Verifieer bij welke STIHL modellen een onderdeel past.">
  <link rel="canonical" href="${baseUrl}/onderdeelnummer/">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 p-4">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-white flex items-center gap-2">
        <span class="w-8 h-8 rounded bg-orange-600 flex items-center justify-center font-black">S</span>
        STIHL Decoder
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Zoeken</a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      <h1 class="text-3xl font-extrabold text-white">STIHL Onderdeelnummer Gids & Prefix Opzoeken</h1>
      <p class="text-xs text-gray-300">
        STIHL onderdeelnummers (11 cijfers) beginnen met een 4-cijferige serie-prefix die de machinetechnische familie aanduidt.
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
        <a href="/onderdeelnummer/stihl-1121/" class="bg-gray-950 p-3 rounded-xl border border-gray-800 hover:border-orange-500 block">
          <span class="font-mono font-bold text-orange-400">Serie 1121</span>
          <span class="text-gray-400 block text-2xs">MS 260 / 026 Pro</span>
        </a>
        <a href="/onderdeelnummer/stihl-1141/" class="bg-gray-950 p-3 rounded-xl border border-gray-800 hover:border-orange-500 block">
          <span class="font-mono font-bold text-orange-400">Serie 1141</span>
          <span class="text-gray-400 block text-2xs">MS 261 / MS 261 C-M</span>
        </a>
        <a href="/onderdeelnummer/stihl-1130/" class="bg-gray-950 p-3 rounded-xl border border-gray-800 hover:border-orange-500 block">
          <span class="font-mono font-bold text-orange-400">Serie 1130</span>
          <span class="text-gray-400 block text-2xs">MS 170 / MS 180</span>
        </a>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function renderPartNumberSeriesHtml(seriesCode, database, baseUrl) {
  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL Serie ${seriesCode} Onderdeelnummers & Compatibiliteit | STIHLDecoder</title>
  <meta name="description" content="Bekijk welke STIHL kettingzagen of machines gebruik maken van onderdeelnummers behorend tot serie ${seriesCode}.">
  <link rel="canonical" href="${baseUrl}/onderdeelnummer/stihl-${seriesCode}/">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 p-4">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-white flex items-center gap-2">
        <span class="w-8 h-8 rounded bg-orange-600 flex items-center justify-center font-black">S</span>
        STIHL Decoder
      </a>
      <a href="/onderdeelnummer/" class="text-xs text-orange-400 font-bold hover:underline">← Alle Onderdeelnummers</a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">Serie Code: ${seriesCode}</span>
      <h1 class="text-3xl font-extrabold text-white">STIHL Serie ${seriesCode} Onderdeelnummers</h1>
      <p class="text-xs text-gray-300">
        Onderdeelnummers die beginnen met <strong>${seriesCode}</strong> behoren tot de STIHL ${seriesCode} modelfamilie.
      </p>
      <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs">
        <h3 class="font-bold text-white mb-2">Gekoppelde STIHL Modellen:</h3>
        <p class="text-gray-300">MS 261 C-M, MS 260, MS 271, MS 291</p>
      </div>
    </article>
  </main>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log(`🚀 STIHL Decoder Server actief op http://localhost:${PORT}`);
  console.log(`   PRIMARY_HOST=${PRIMARY_HOST}`);
  console.log(`   PRIMARY_ORIGIN=${PRIMARY_ORIGIN}`);
  console.log(`   SITE_URL=${SITE_URL}`);
  console.log(`   DATABASE_PATH=${getDatabasePath()}`);
  console.log(`   NODE_ENV=${process.env.NODE_ENV || 'development'}`);
});

export { server };

function findModelBySlug(modelSlug, database) {
  const models = database.models || [];
  return models.find((model) => {
    const slug = (model.slug || model.id.replace(/_/g, '-')).toLowerCase();
    const cleanSlug = slug.replace(/^stihl-/, '');
    return slug === modelSlug || cleanSlug === modelSlug || model.id.toLowerCase() === modelSlug;
  }) || null;
}

function resolveStaticFilePath(pathname) {
  if (pathname === '/') {
    return path.join(__dirname, 'index.html');
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const resolved = path.resolve(path.join(__dirname, `.${pathname}`));
    const allowedDir = path.resolve(path.join(__dirname, prefix.slice(1)));
    return resolved.startsWith(allowedDir) ? resolved : null;
  }

  if (PUBLIC_EXACT_FILES.has(pathname)) {
    return path.resolve(path.join(__dirname, `.${pathname}`));
  }

  const normalizedPath = pathname.replace(/^\//, '');
  if (!PUBLIC_ROOT_FILES.has(normalizedPath)) {
    return null;
  }

  return path.join(__dirname, normalizedPath);
}

function renderNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
  res.end('<h1>404 Niet Gevonden</h1><p>De gevraagde pagina bestaat niet op STIHLDecoder.nl.</p>');
}

async function readJsonBody(req, res) {
  let bodyStr = '';
  let bodyTooLarge = false;

  return await new Promise((resolve) => {
    req.on('data', (chunk) => {
      bodyStr += chunk;
      if (bodyStr.length > MAX_JSON_BODY_BYTES) {
        bodyTooLarge = true;
        req.destroy();
      }
    });

    req.on('close', () => {
      if (bodyTooLarge && !res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: 'Request body is te groot.' }));
        resolve(null);
      }
    });

    req.on('end', () => {
      if (bodyTooLarge) {
        resolve(null);
        return;
      }

      try {
        resolve(bodyStr ? JSON.parse(bodyStr) : {});
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: 'Ongeldige JSON body.' }));
        resolve(null);
      }
    });

    req.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: 'Kon request body niet lezen.' }));
      }
      resolve(null);
    });
  });
}

function timingSafeEqual(actualValue, expectedValue) {
  if (typeof actualValue !== 'string' || typeof expectedValue !== 'string') {
    return false;
  }

  const actual = Buffer.from(actualValue);
  const expected = Buffer.from(expectedValue);

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}
