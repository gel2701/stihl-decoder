import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from './src/decoder.js';
import { handleDecodeApiV1 } from './src/StihlDecoderController.js';
import { generateModelJsonLd } from './src/components/ModelJsonLd.js';
import { generateSitemapXml, generateRobotsTxt } from './src/components/SitemapGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

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

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // Dynamic Route: GET /sitemap.xml
  if (pathname === '/sitemap.xml') {
    const sitemapXml = generateSitemapXml(`http://${req.headers.host}`, database);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=UTF-8' });
    res.end(sitemapXml);
    return;
  }

  // Dynamic Route: GET /robots.txt
  if (pathname === '/robots.txt') {
    const robotsTxt = generateRobotsTxt(`http://${req.headers.host}`);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end(robotsTxt);
    return;
  }

  // Dynamic Route: GET /modellen / GET /modellen/:slug
  if (pathname === '/modellen' || pathname.startsWith('/modellen/')) {
    const slug = pathname.replace('/modellen/', '').replace('/modellen', '');
    
    let targetModel = null;
    if (slug && database.models) {
      const cleanSlug = slug.replace(/^stihl-/, '').replace(/-/g, '');
      targetModel = database.models.find(m => {
        const mSlug = (m.model_name || m.id).toLowerCase().replace(/[^a-z0-9]/g, '');
        return mSlug.includes(cleanSlug) || cleanSlug.includes(mSlug);
      });
    }

    const modelName = targetModel ? targetModel.model_name : 'MS 261 C-M';
    const category = targetModel ? targetModel.category : 'Kettingzaag';
    const displacement = targetModel ? targetModel.displacement_cc : 50.2;
    const powerHp = targetModel ? targetModel.power_hp : 4.1;
    const sparkPlug = targetModel ? targetModel.spark_plug : 'NGK CMR6H';
    const carbH = targetModel ? targetModel.carb_h_setting : 'M-Tronic (Auto)';
    const carbL = targetModel ? targetModel.carb_l_setting : 'M-Tronic (Auto)';
    const carbLA = targetModel ? targetModel.carb_la_setting : 'M-Tronic (Auto)';

    const jsonLdData = generateModelJsonLd({
      modelName,
      category,
      displacementCc: displacement,
      powerHp,
      sparkPlug,
      carbSettings: { H: carbH, L: carbL, LA: carbLA },
      url: `http://${req.headers.host}${pathname}`
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STIHL ${modelName} Specificaties, Bouwjaar & Serienummer Decodering</title>
  <meta name="description" content="Bekijk de technische specificaties, carburateurafstelling (${carbH}), bougie (${sparkPlug}) en serienummer herkenning voor de STIHL ${modelName}.">
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLdData)}</script>
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
    <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">STIHL ${category}</span>
      <h1 class="text-3xl font-extrabold text-white">STIHL ${modelName}</h1>
      <p class="text-sm text-gray-300 leading-relaxed">
        Officiële technische gids voor de STIHL ${modelName}. Bekijk carburateur basisafstellingen, bougiespecificaties, kettingsteek en controleer serienummers op echtheid.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-800 text-xs">
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
          <h3 class="font-bold text-orange-400 uppercase">Motor Specificaties</h3>
          <div><span class="text-gray-400">Cilinderinhoud:</span> <strong class="text-white">${displacement} cc</strong></div>
          <div><span class="text-gray-400">Vermogen:</span> <strong class="text-white">${powerHp} pk (${targetModel ? targetModel.power_kw : 3.0} kW)</strong></div>
          <div><span class="text-gray-400">Bougie:</span> <strong class="text-white">${sparkPlug}</strong></div>
        </div>
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
          <h3 class="font-bold text-orange-400 uppercase">Carburateur Basisafstelling</h3>
          <div><span class="text-gray-400">H-Schroef:</span> <strong class="text-white">${carbH}</strong></div>
          <div><span class="text-gray-400">L-Schroef:</span> <strong class="text-white">${carbL}</strong></div>
          <div><span class="text-gray-400">LA-Schroef:</span> <strong class="text-white">${carbLA}</strong></div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(htmlContent);
    return;
  }

  // REST API v1: POST /api/v1/decode
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
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.body));
    });
    return;
  }

  // REST API: GET /api/decode?code=...
  if (pathname === '/api/decode') {
    const code = urlObj.searchParams.get('code') || '';
    const result = decodeStihlCode(code, database);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(result));
    return;
  }

  // REST API: GET /api/database
  if (pathname === '/api/database') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(database));
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>404 Niet Gevonden</h1><p>De gevraagde pagina bestaat niet.</p>');
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

server.listen(PORT, () => {
  console.log(`🚀 STIHL Decoder Server actief op http://localhost:${PORT}`);
});
