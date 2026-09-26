import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🧪 RUNNING HOMEPAGE BROWSER MODULE GRAPH & BUTTON WIRING SUITE');
console.log('===============================================================\n');

// 1. Static Homepage Wiring & Interaction Test
console.log('▶ Test 1: Homepage DOM elements & event binding verification...');
const indexHtmlPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

assert.strictEqual(indexHtml.includes('id="search-btn"'), true, 'Must have #search-btn element');
assert.strictEqual(indexHtml.includes('id="code-input"'), true, 'Must have #code-input element');
assert.strictEqual(indexHtml.includes('async function handleDecode()'), true, 'Must define handleDecode function');
assert.strictEqual(indexHtml.includes("searchBtn.addEventListener('click', handleDecode)"), true, 'Must bind handleDecode to search-btn click');
assert.strictEqual(indexHtml.includes("if (e.key === 'Enter') handleDecode()"), true, 'Must bind handleDecode to Enter key');

// Error feedback verification (Section 10)
assert.strictEqual(
  indexHtml.includes('De analyse kon niet worden uitgevoerd. Probeer het opnieuw.'),
  true,
  'Must display friendly error feedback upon API/network failure'
);
assert.strictEqual(
  indexHtml.includes("showToast('De analyse kon niet worden uitgevoerd. Probeer het opnieuw.')"),
  true,
  'Must notify user via toast on fetch error'
);
console.log('  ✅ Test 1 Passed: #search-btn, #code-input, handleDecode binding and error feedback verified.');

// 2. Recursive Browser Module Graph Audit
console.log('\n▶ Test 2: Recursive browser module graph traversal & Node-builtin audit...');

// Extract module imports from index.html
const moduleScriptMatch = indexHtml.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(moduleScriptMatch, 'index.html must contain a <script type="module">');

const rootImportRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
const rootModules = [];
let match;
while ((match = rootImportRegex.exec(moduleScriptMatch[1])) !== null) {
  rootModules.push(match[1]);
}

assert.ok(rootModules.length >= 4, `Must find root browser modules (found ${rootModules.length})`);
console.log(`  Identified ${rootModules.length} browser root modules in index.html:`, rootModules);

// Load server.js to extract PUBLIC_EXACT_FILES
const serverJsContent = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');
const publicExactMatch = serverJsContent.match(/const PUBLIC_EXACT_FILES = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(publicExactMatch, 'server.js must define PUBLIC_EXACT_FILES set');

const publicExactFiles = new Set(
  publicExactMatch[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(Boolean)
);

const forbiddenNodeBuiltins = new Set([
  'fs', 'node:fs',
  'path', 'node:path',
  'url', 'node:url',
  'crypto', 'node:crypto',
  'child_process', 'node:child_process',
  'os', 'node:os'
]);

const visitedModules = new Set();
const queue = [...rootModules];
let browserModuleGraphErrors = 0;
const graphErrorMessages = [];

while (queue.length > 0) {
  const currentUrl = queue.shift();
  if (visitedModules.has(currentUrl)) continue;
  visitedModules.add(currentUrl);

  // Check A: served publicly
  if (!publicExactFiles.has(currentUrl)) {
    browserModuleGraphErrors++;
    graphErrorMessages.push(`Module "${currentUrl}" is NOT in server.js PUBLIC_EXACT_FILES.`);
  }

  // Check B: file exists
  const localFilePath = path.join(rootDir, currentUrl.replace(/^\//, ''));
  if (!fs.existsSync(localFilePath)) {
    browserModuleGraphErrors++;
    graphErrorMessages.push(`Module file "${localFilePath}" does not exist on disk.`);
    continue;
  }

  // Parse imports in module file
  const fileContent = fs.readFileSync(localFilePath, 'utf8');
  const importRegex = /(?:import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+|import\s+)['"]([^'"]+)['"]/g;
  let importMatch;
  while ((importMatch = importRegex.exec(fileContent)) !== null) {
    const importSpecifier = importMatch[1];

    // Check C: no Node built-ins
    if (forbiddenNodeBuiltins.has(importSpecifier)) {
      browserModuleGraphErrors++;
      graphErrorMessages.push(`Module "${currentUrl}" imports forbidden Node built-in "${importSpecifier}".`);
    }

    // Resolve relative import path in browser terms
    if (importSpecifier.startsWith('.')) {
      const currentDir = path.dirname(currentUrl);
      const resolvedRelative = path.posix.normalize(path.posix.join(currentDir, importSpecifier));
      if (!visitedModules.has(resolvedRelative)) {
        queue.push(resolvedRelative);
      }
    }
  }
}

console.log(`  Traversed ${visitedModules.size} unique modules in browser graph:`);
for (const mod of visitedModules) {
  console.log(`   - ${mod}`);
}

// Check D: decoder.js must NOT be in browser graph
assert.strictEqual(
  Array.from(visitedModules).some(m => m.endsWith('decoder.js')),
  false,
  'CRITICAL: decoder.js must NOT be present in browser module graph'
);
console.log('  ✅ Verified: decoder.js is completely absent from browser module graph.');

// Check E: plantResolver.js must be in browser graph
assert.strictEqual(
  visitedModules.has('/src/plantResolver.js'),
  true,
  'plantResolver.js must be present in browser module graph'
);
console.log('  ✅ Verified: /src/plantResolver.js is present in browser module graph.');

// Check F: publicEvidence.js must be in browser graph
assert.strictEqual(
  visitedModules.has('/src/publicEvidence.js'),
  true,
  'publicEvidence.js must be present in browser module graph'
);
console.log('  ✅ Verified: /src/publicEvidence.js is present in browser module graph.');

assert.strictEqual(
  browserModuleGraphErrors,
  0,
  `Browser module graph audit failed with errors: ${graphErrorMessages.join('; ')}`
);
console.log(`  ✅ Test 2 Passed: Recursive browser graph is 100% clean (BROWSER_MODULE_GRAPH_ERRORS = 0).`);

// 3. Live HTTP Module Serving & Decoder API Verification
console.log('\n▶ Test 3: Live HTTP serving test for all browser modules...');
const TEST_PORT = 3122;
process.env.PORT = String(TEST_PORT);
const { server } = await import('../server.js');

// Wait for server to bind
await new Promise(r => setTimeout(r, 400));

const fetchHttp = (reqPath) => new Promise((resolve, reject) => {
  const req = http.get({
    hostname: 'localhost',
    port: TEST_PORT,
    path: reqPath
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve({
      statusCode: res.statusCode,
      headers: res.headers,
      body
    }));
  });
  req.on('error', reject);
});

// Test each module via HTTP GET
for (const modPath of visitedModules) {
  const res = await fetchHttp(modPath);
  assert.strictEqual(res.statusCode, 200, `Module ${modPath} must return HTTP 200 (got ${res.statusCode})`);
  assert.ok(
    (res.headers['content-type'] || '').includes('javascript'),
    `Module ${modPath} must have JavaScript content-type (got ${res.headers['content-type']})`
  );
  assert.strictEqual(res.body.includes('<!DOCTYPE html>'), false, `Module ${modPath} must not return HTML fallback`);
  console.log(`  ✅ HTTP GET ${modPath} -> 200 (${res.headers['content-type']})`);
}

// Explicit check: /src/decoder.js MUST remain 404 private
console.log('\n▶ Test 4: Verifying /src/decoder.js remains strictly private (404)...');
const decoderRes = await fetchHttp('/src/decoder.js');
assert.strictEqual(decoderRes.statusCode, 404, '/src/decoder.js must return HTTP 404');
console.log('  ✅ Verified: /src/decoder.js returns HTTP 404 (strictly protected from browser exposure).');

// 5. Decoder API Parity Verification
console.log('\n▶ Test 5: Backend decoder API functionality verification...');

// Serial decode
const serialRes = await fetchHttp('/api/decode?code=163118080');
assert.strictEqual(serialRes.statusCode, 200, 'Serial API must return 200');
const serialData = JSON.parse(serialRes.body);
assert.strictEqual(serialData.type, 'SERIAL_NUMBER', 'Must decode as SERIAL_NUMBER');
assert.strictEqual(serialData.cleaned, '163118080', 'Cleaned serial must match');
assert.ok(serialData.officialAnchor, 'Official anchor must be present');
assert.strictEqual(serialData.officialAnchor.verificationStatus, 'OFFICIAL_STIHL_LOOKUP', 'Official anchor verificationStatus must match');
assert.strictEqual(serialData.factory?.code, '1', 'Factory code must match');
console.log('  ✅ Serial decode API verified (/api/decode?code=163118080 -> SERIAL_NUMBER, official anchor intact).');

// Part number decode
const partRes = await fetchHttp('/api/decode?code=11210210800');
assert.strictEqual(partRes.statusCode, 200, 'Part number API must return 200');
const partData = JSON.parse(partRes.body);
assert.strictEqual(partData.type, 'PART_NUMBER', 'Must decode as PART_NUMBER');
assert.strictEqual(partData.familyCode, '1121', 'Must identify family 1121');
console.log('  ✅ Part number decode API verified (/api/decode?code=11210210800 -> PART_NUMBER).');

// Model decode
const modelRes = await fetchHttp('/api/decode?code=MS%20261%20C-M');
assert.strictEqual(modelRes.statusCode, 200, 'Model decode API must return 200');
const modelData = JSON.parse(modelRes.body);
assert.strictEqual(modelData.type, 'MODEL_DECODE', 'Must decode as MODEL_DECODE');
assert.strictEqual(modelData.input, 'MS 261 C-M', 'Must match input model');
console.log('  ✅ Model decode API verified (/api/decode?code=MS%20261%20C-M -> MODEL_DECODE).');

server.close(() => {
  console.log('\n🎉 ALL HOMEPAGE BROWSER MODULE GRAPH & BUTTON WIRING TESTS PASSED 100% CLEANLY!');
  process.exit(0);
});
