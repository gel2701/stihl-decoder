import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://stihldecoder.nl';

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

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const KNOWN_CATEGORIES = ['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen', 'accu-kettingzagen', 'doorslijpers'];

const server = http.createServer((req, res) => {
  const host = (req.headers.host || 'stihldecoder.nl').toLowerCase();
  
  // 0. Primary Canonical Host Enforcement (301 Redirect www.stihldecoder.nl -> stihldecoder.nl)
  if (host.startsWith('www.')) {
    const cleanHost = host.replace(/^www\./, '');
    res.writeHead(301, { 'Location': `https://${cleanHost}${req.url}` });
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${host}`);
  let pathname = urlObj.pathname;

  // 1. Dynamic Route: GET /sitemap.xml
  if (pathname === '/sitemap.xml') {
    const sitemapXml = generateSitemapXml(BASE_URL, database);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=UTF-8', 'X-Robots-Tag': 'noindex' });
    res.end(sitemapXml);
    return;
  }

  // 2. Dynamic Route: GET /robots.txt
  if (pathname === '/robots.txt') {
    const robotsTxt = generateRobotsTxt(BASE_URL);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end(robotsTxt);
    return;
  }

  // 2b. Dynamic Route: GET /api/version
  if (pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      repository: 'https://github.com/gel2701/stihl-decoder.git',
      active_branch: 'main',
      environment: 'production',
      deployed_at: new Date().toISOString()
    }));
    return;
  }

  // 3. REST API v1: POST /api/v1/decode
  if (pathname === '/api/v1/decode' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      let bodyObj = {};
      try {
        if (bodyStr) bodyObj = JSON.parse(bodyStr);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: 'Ongeldige JSON body.' }));
        return;
      }

      const result = handleDecodeApiV1(bodyObj, database);
      logStihlEvent(EVENT_TYPES.DECODER_USED, { input: bodyObj.serial_number || bodyObj.code, result: result.status });
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.body));
    });
    return;
  }

  // 4. REST API Lead Submission MVP Routes
  if (pathname === '/api/v1/leads/repair' && req.method === 'POST') {
    logStihlEvent(EVENT_TYPES.REPAIR_LEAD_COMPLETED);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end('<article style="background:#111;color:#fff;padding:2rem;font-family:sans-serif;"><h2>✅ Reparatie Aanvraag Ontvangen!</h2><p>Wij nemen binnen 24 uur contact met u op.</p><a href="/" style="color:#f97316;">← Terug naar Home</a></article>');
    return;
  }

  if (pathname === '/api/v1/leads/sell' && req.method === 'POST') {
    logStihlEvent(EVENT_TYPES.SELL_LEAD_COMPLETED);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end('<article style="background:#111;color:#fff;padding:2rem;font-family:sans-serif;"><h2>✅ Verkoop Aanvraag Ontvangen!</h2><p>U ontvangt binnenkort een overnamebod op het opgegeven e-mailadres.</p><a href="/" style="color:#f97316;">← Terug naar Home</a></article>');
    return;
  }

  // 5. REST API: GET /api/decode?code=...
  if (pathname === '/api/decode') {
    const code = urlObj.searchParams.get('code') || '';
    const result = decodeStihlCode(code, database);
    logStihlEvent(EVENT_TYPES.DECODER_USED, { input: code, success: result.success });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // 6. Category Landing Pages
  const cleanCategory = pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
  if (KNOWN_CATEGORIES.includes(cleanCategory)) {
    const categoryHtml = renderCategoryPageHtml(cleanCategory, database, BASE_URL);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(categoryHtml);
    return;
  }

  // 7. Comparison Engine Routes (/vergelijk/ or /vergelijk/:pair/)
  if (pathname.startsWith('/vergelijk')) {
    const pairSlug = pathname.replace('/vergelijk/', '').replace('/vergelijk', '').replace(/\/$/, '');
    const html = renderComparisonPageHtml(pairSlug || 'ms-260-vs-ms-261', database, BASE_URL);
    logStihlEvent(EVENT_TYPES.COMPARISON_VIEWED, { pairSlug });
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
      const models = database.models || [];
      const targetModel = models.find(m => (m.slug || m.id.replace(/_/g, '-')).toLowerCase() === modelSlug);

      if (targetModel) {
        const partsHtml = renderModelPartsPageHtml(targetModel, database, BASE_URL);
        logStihlEvent(EVENT_TYPES.PART_SEARCH, { model: targetModel.model_name });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(partsHtml);
        return;
      }
    }
  }

  // 9. Protected Internal Route: GET /admin/seo-audit
  if (pathname === '/admin/seo-audit' || pathname === '/admin/seo-audit/') {
    const apiKey = urlObj.searchParams.get('key') || req.headers['x-admin-key'];
    if (apiKey !== 'stihl-seo-admin-2026' && process.env.NODE_ENV === 'production') {
      res.writeHead(401, { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' });
      res.end(JSON.stringify({ error: 'Geen toegang tot admin audit.' }));
      return;
    }

    const auditReport = generateSeoAuditReport(database, BASE_URL);
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
      const catSlug = targetModel.category_slug || 'kettingzagen';
      const mSlug = targetModel.slug || targetModel.id.replace(/_/g, '-');
      res.writeHead(301, { 'Location': `/${catSlug}/${mSlug}/` });
      res.end();
      return;
    }

    res.writeHead(301, { 'Location': '/' });
    res.end();
    return;
  }

  // 11. Guides SSR Route (/gidsen/:slug/)
  if (pathname.startsWith('/gidsen/')) {
    const guideSlug = pathname.replace('/gidsen/', '').replace(/\/$/, '');
    const guides = database.guides || [];
    const guide = guides.find(g => g.slug === guideSlug);

    if (guide) {
      const html = renderGuidePageHtml(guide, database, BASE_URL);
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
    const html = renderIntentPageHtml(matchedIntent, database, BASE_URL);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // 13. Part Number Routes Hub (/onderdeelnummer/ & /onderdeelnummer/stihl-:series/)
  if (cleanPath === 'onderdeelnummer') {
    const html = renderPartNumberHubHtml(database, BASE_URL);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  if (pathname.startsWith('/onderdeelnummer/')) {
    const seriesCode = cleanPath.replace('onderdeelnummer/', '').replace(/^stihl-/, '');
    const html = renderPartNumberSeriesHtml(seriesCode, database, BASE_URL);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // 14. Scoped Clean Category Model Routes
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length === 2 && KNOWN_CATEGORIES.includes(pathParts[0].toLowerCase())) {
    const catSlug = pathParts[0].toLowerCase();
    const modelSlug = pathParts[1].toLowerCase();

    const models = database.models || [];
    const targetModel = models.find(m => {
      const mSlug = (m.slug || m.id).toLowerCase();
      const mCleanSlug = mSlug.replace(/^stihl-/, '');
      return (m.category_slug === catSlug || catSlug === 'kettingzagen') && 
             (mSlug === modelSlug || mCleanSlug === modelSlug || m.id === modelSlug);
    });

    if (targetModel) {
      const html = renderModelPageHtml(targetModel, database, BASE_URL);
      logStihlEvent(EVENT_TYPES.MODEL_IDENTIFIED, { model: targetModel.model_name });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(html);
      return;
    }
  }

  // 15. Valuation Preview Routes (/waarde/:slug/)
  if (pathParts.length === 2 && pathParts[0].toLowerCase() === 'waarde') {
    const modelSlug = pathParts[1].toLowerCase();
    const models = database.models || [];
    const targetModel = models.find(m => (m.slug || m.id).replace(/^stihl-/, '').toLowerCase() === modelSlug);

    logStihlEvent(EVENT_TYPES.VALUATION_STARTED, { model: modelSlug });

    const valuationHtml = `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STIHL ${targetModel ? targetModel.model_name : modelSlug.toUpperCase()} Marktwaarde & Taxatie | STIHLDecoder</title>
  <meta name="description" content="Indicatieve tweedehands marktwaarde en taxatie voor de STIHL ${targetModel ? targetModel.model_name : modelSlug.toUpperCase()}.">
  <link rel="canonical" href="${BASE_URL}/waarde/${modelSlug}/">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
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
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">Indicatieve Taxatie</span>
      <h1 class="text-3xl font-extrabold text-white">STIHL ${targetModel ? targetModel.model_name : modelSlug.toUpperCase()} Waardebepaling</h1>
      <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
        <span class="text-xs text-gray-400 block font-medium">Indicatieve Marktwaarde Range (Tweedehands):</span>
        <span class="text-2xl font-black text-orange-400 font-mono">€250 - €550 (Afhankelijk van staat & bouwjaar)</span>
        <p class="text-xs text-gray-400 pt-2 border-t border-gray-800">
          💡 Maak een <a href="/stihl-paspoort/" class="text-orange-400 underline">STIHL Machinepaspoort</a> met serienummer-controle voor een geverifieerd Marktplaats verkooprapport.
        </p>
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
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
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
});

function renderGuidePageHtml(guide, database, baseUrl) {
  const canonicalUrl = `${baseUrl}/gidsen/${guide.slug}/`;

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guide.title} | STIHLDecoder Gidsen</title>
  <meta name="description" content="${guide.description}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STIHL Onderdeelnummer Opzoeken & Gietnummers | STIHLDecoder</title>
  <meta name="description" content="Zoek STIHL onderdeelnummers (Teilenummer) en 4-cijferige serie prefixes op. Verifieer bij welke STIHL modellen een onderdeel past.">
  <link rel="canonical" href="${baseUrl}/onderdeelnummer/">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STIHL Serie ${seriesCode} Onderdeelnummers & Compatibiliteit | STIHLDecoder</title>
  <meta name="description" content="Bekijk welke STIHL kettingzagen of machines gebruik maken van onderdeelnummers behorend tot serie ${seriesCode}.">
  <link rel="canonical" href="${baseUrl}/onderdeelnummer/stihl-${seriesCode}/">
  <meta name="robots" content="index, follow">
  <script src="https://cdn.tailwindcss.com"></script>
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
});
