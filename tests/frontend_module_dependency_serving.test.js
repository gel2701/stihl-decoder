import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3098;
process.env.PORT = String(PORT);
await import('../server.js');
await new Promise(r => setTimeout(r, 600));

function fetchUrl(pathStr) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: '127.0.0.1',
      port: PORT,
      path: pathStr,
      headers: {
        'Host': 'www.stihldecoder.nl',
        'x-forwarded-host': 'www.stihldecoder.nl',
        'x-forwarded-proto': 'https'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

console.log('🧪 Starting Frontend Module Dependency Serving Test...');

// 1. Check exact required endpoints
const resHome = await fetchUrl('/');
assert.strictEqual(resHome.status, 200, '/ must respond 200');

const resGietklok = await fetchUrl('/components/tools/GietklokHelper.js');
assert.strictEqual(resGietklok.status, 200, '/components/tools/GietklokHelper.js must respond 200');
assert.ok(resGietklok.headers['content-type'].includes('text/javascript'), 'GietklokHelper must have text/javascript Content-Type');

const resPassport = await fetchUrl('/src/components/StihlPassportGenerator.js');
assert.strictEqual(resPassport.status, 200, '/src/components/StihlPassportGenerator.js must respond 200');
assert.ok(resPassport.headers['content-type'].includes('text/javascript'), 'Passport generator must have text/javascript Content-Type');

const resWhitelist = await fetchUrl('/src/categoryWhitelist.js');
assert.strictEqual(resWhitelist.status, 200, '/src/categoryWhitelist.js must respond 200');
assert.ok(resWhitelist.headers['content-type'].includes('text/javascript'), 'Category whitelist must have text/javascript Content-Type');

const resDriveClass = await fetchUrl('/src/driveClassification.js');
assert.strictEqual(resDriveClass.status, 200, '/src/driveClassification.js must respond 200');
assert.ok(resDriveClass.headers['content-type'].includes('text/javascript'), 'Drive classification must have text/javascript Content-Type');

console.log('✅ Required frontend modules respond 200 OK with text/javascript.');

// 2. Security Gate: unlisted src files must NOT be public
const resDecoder = await fetchUrl('/src/decoder.js');
assert.strictEqual(resDecoder.status, 404, '/src/decoder.js must remain 404');
console.log('✅ Unlisted src files (/src/decoder.js) remain private (404).');

// 3. Import Graph Verification: Parse all imports recursively from index.html and verify server accessibility
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const importRegex = /import\s+.*?from\s+["'](.*?)["']/g;
let match;
const initialImports = [];
while ((match = importRegex.exec(indexHtml)) !== null) {
  initialImports.push(match[1]);
}

const discoveredModules = new Set();
async function traceModule(modPath) {
  if (discoveredModules.has(modPath)) return;
  discoveredModules.add(modPath);
  const res = await fetchUrl(modPath);
  assert.ok(res.headers['content-type'].includes('text/javascript'), `Module ${modPath} must have text/javascript Content-Type`);
  const relativeFile = modPath.startsWith('/') ? modPath.slice(1) : modPath;
  const filePath = path.join(rootDir, relativeFile);
  if (fs.existsSync(filePath)) {
    const code = fs.readFileSync(filePath, 'utf8');
    const impRegex = /import\s+.*?from\s+["'](.*?)["']/g;
    let impMatch;
    while ((impMatch = impRegex.exec(code)) !== null) {
      const impRelative = impMatch[1];
      const resolved = impRelative.startsWith('.')
        ? path.posix.normalize(path.posix.dirname(modPath) + '/' + impRelative)
        : impRelative;
      await traceModule(resolved);
    }
  }
}

for (const imp of initialImports) {
  await traceModule(imp);
}

console.log('📦 Discovered & verified browser module graph:', Array.from(discoveredModules));
assert.ok(discoveredModules.has('/components/tools/GietklokHelper.js'), 'Must contain GietklokHelper');
assert.ok(discoveredModules.has('/src/components/StihlPassportGenerator.js'), 'Must contain StihlPassportGenerator');
assert.ok(discoveredModules.has('/src/categoryWhitelist.js'), 'Must contain categoryWhitelist');
assert.ok(discoveredModules.has('/src/driveClassification.js'), 'Must contain driveClassification');

console.log('✅ CLIENT_IMPORT_GRAPH_COVERAGE = PASS');
console.log('🎉 ALL FRONTEND MODULE DEPENDENCY TESTS PASSED CLEANLY!\n');
process.exit(0);
