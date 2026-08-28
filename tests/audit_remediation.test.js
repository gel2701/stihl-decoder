import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StopHelingService } from '../src/StopHelingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
JSON.parse(fs.readFileSync(dbPath, 'utf8'));

process.env.PORT = '0';
process.env.NODE_ENV = 'production';
process.env.ADMIN_AUDIT_KEY = 'test-admin-secret';
const { server } = await import('../server.js');

await new Promise((resolve) => setTimeout(resolve, 500));
const port = server.address().port;

const originalFetch = global.fetch;

try {
  global.fetch = async () => {
    throw new Error('network down');
  };

  const stopHelingResult = await StopHelingService.verifySerialNumber('184592301');
  assert.strictEqual(stopHelingResult.status, 'UNVERIFIED');
  assert.strictEqual(stopHelingResult.isStolen, null);

  const decodeResponse = await requestJson('/api/v1/decode', {
    method: 'POST',
    body: JSON.stringify({ serialNumber: '184592301' })
  });
  assert.strictEqual(decodeResponse.status, 200);
  assert.strictEqual(decodeResponse.body.data.verificationStatus, 'FORMAT_VALIDATED');
  assert.strictEqual(decodeResponse.body.data.matchedModel.name, 'UNKNOWN');
  assert.strictEqual(decodeResponse.body.data.theftCheck.status, 'UNVERIFIED');

  const healthResponse = await requestJson('/api/version');
  assert.strictEqual(healthResponse.status, 200);
  assert.strictEqual(typeof healthResponse.body.database.connected, 'boolean');

  const staticLeak = await request('/server.js');
  assert.strictEqual(staticLeak.status, 404);

  const unknownValuation = await request('/waarde/nonsense/');
  assert.strictEqual(unknownValuation.status, 404);

  const unknownSeries = await request('/onderdeelnummer/stihl-xxxx/');
  assert.strictEqual(unknownSeries.status, 404);

  const wrongCategory = await request('/kettingzagen/br-600/');
  assert.strictEqual(wrongCategory.status, 301);
  assert.strictEqual(wrongCategory.headers.location, 'https://www.stihldecoder.nl/bladblazers/br-600/');

  const badAdmin = await request('/admin/seo-audit', { headers: { 'x-admin-key': 'wrong-secret' } });
  assert.strictEqual(badAdmin.status, 401);

  const goodAdmin = await request('/admin/seo-audit', { headers: { 'x-admin-key': 'test-admin-secret' } });
  assert.strictEqual(goodAdmin.status, 200);

  console.log('✅ Audit remediation checks passed.');
} finally {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function requestJson(pathname, options = {}) {
  const response = await request(pathname, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return {
    ...response,
    body: response.body ? JSON.parse(response.body) : null
  };
}
