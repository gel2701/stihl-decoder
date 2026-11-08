import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';

process.env.PORT = '0';
process.env.NODE_ENV = 'production';

const { server, resetAffiliateRateLimits } = await import('../server.js');
const { getDatabaseConnection } = await import('../src/databaseConfig.js');

after(() => server.close());

const db = getDatabaseConnection();
const affiliateTypes = ['affiliate_click', 'amazon_verified_product_click', 'amazon_search_fallback_click'];

function affiliateRows() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT event_id, event_type, metadata_json FROM analytics_events WHERE event_type IN (?, ?, ?)`, affiliateTypes, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function request(path, method = 'POST', body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method,
      headers
    }, res => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('public affiliate endpoints discard all claims, never write events, and keep route guards', async () => {
  const before = await affiliateRows();
  const marker = `phase683_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const logged = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logged.push(args.map(String).join(' '));
  };
  try {
    for (const endpoint of ['/api/affiliate/track', '/api/affiliate/click']) {
      for (const [suffix, claim] of [
        ['', { consent: 'granted', is_test: false }],
        ['', { consent: 'denied', is_test: true }],
        ['?test=1', { consent: 'granted', is_test: true }]
      ]) {
        const result = await request(endpoint + suffix, 'POST', JSON.stringify({ ...claim, event_id: marker, destination_url: `https://example.com/${marker}`, metadata: marker }), {
          'Content-Type': 'application/json',
          'User-Agent': marker
        });
        assert.equal(result.status, 202);
        assert.deepEqual(JSON.parse(result.body), { success: true, recorded: false });
        assert.equal(result.body.includes(marker), false);
        assert.equal(result.headers['set-cookie'], undefined);
      }
      const options = await request(endpoint, 'OPTIONS');
      assert.equal(options.status, 204);
      assert.equal(options.headers.allow, 'POST, OPTIONS');
      const invalidMethod = await request(endpoint, 'GET');
      assert.equal(invalidMethod.status, 405);
      assert.equal(invalidMethod.headers.allow, 'POST');
    }
    const gone = await request('/api/affiliate/out?url=https://example.com/', 'GET');
    assert.equal(gone.status, 410);
    assert.equal(gone.headers.location, undefined);
    assert.equal(gone.headers['set-cookie'], undefined);

    for (let i = 0; i < 24; i++) {
      const result = await request('/api/affiliate/click', 'POST', marker);
      assert.equal(result.status, 202);
    }
    const limited = await request('/api/affiliate/track', 'POST', marker);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.includes(marker), false);

    const spoofed = await request('/api/affiliate/track', 'POST', marker, { 'X-Forwarded-For': '192.0.2.83' });
    assert.equal(spoofed.status, 429);
    assert.equal(spoofed.body.includes(marker), false);

    const afterRows = await affiliateRows();
    assert.deepEqual(afterRows, before);
    assert.equal(logged.some(line => line.includes(marker)), false);
  } finally {
    console.log = originalLog;
  }
});

test('verified first-party consent cookie authorizes analytics recording on /api/affiliate/track', async () => {
  resetAffiliateRateLimits();
  const marker = `phase683_verified_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const before = await affiliateRows();

  // 1. With verified consent cookie (stihl_cookie_consent=granted)
  const result = await request('/api/affiliate/track', 'POST', JSON.stringify({
    event_id: marker,
    destination_url: 'https://www.amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21',
    provider: 'amazon',
    marketplace: 'amazon.nl',
    part_number: '1110 400 7005',
    product_verified: true,
    offer_type: 'MANUAL_ASIN',
    link_type: 'DIRECT_ASIN',
    placement: 'verified_product_card'
  }), {
    'Content-Type': 'application/json',
    'Cookie': 'stihl_cookie_consent=granted',
    'User-Agent': 'Mozilla/5.0 Test'
  });

  assert.equal(result.status, 202);
  assert.deepEqual(JSON.parse(result.body), { success: true, recorded: true });

  const after = await affiliateRows();
  assert.equal(after.length, before.length + 2, 'Must record primary and specific affiliate events');
  assert.ok(after.some(r => r.event_id === marker));

  // 2. With denied consent cookie (stihl_cookie_consent=denied)
  const deniedMarker = `phase683_denied_${Date.now()}`;
  const deniedResult = await request('/api/affiliate/track', 'POST', JSON.stringify({
    event_id: deniedMarker,
    destination_url: 'https://www.amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21',
    part_number: '1110 400 7005'
  }), {
    'Content-Type': 'application/json',
    'Cookie': 'stihl_cookie_consent=denied',
    'User-Agent': 'Mozilla/5.0 Test'
  });

  assert.equal(deniedResult.status, 202);
  assert.deepEqual(JSON.parse(deniedResult.body), { success: true, recorded: false });

  const afterDenied = await affiliateRows();
  assert.equal(afterDenied.length, after.length, 'Must not record events when cookie is denied');
});
