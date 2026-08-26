import http from 'http';

// Start server on port 3097 for test isolation
process.env.PORT = '3097';
await import('../server.js');

// Wait 500ms for server startup
await new Promise(r => setTimeout(r, 500));

console.log('🧪 Starting Emergency Production Redirect Loop Fix Audit...\n');

// Test 1: Request to non-www HTTPS (x-forwarded-host: stihldecoder.nl, x-forwarded-proto: http - Render internal proxy format)
const testNonWww = await fetchUrl('http://localhost:3097/kettingzagen/ms-261/?ref=test', {
  'x-forwarded-host': 'stihldecoder.nl',
  'x-forwarded-proto': 'http'
});

console.log(`✅ Non-WWW Request Status: ${testNonWww.status}`);
console.log(`✅ Redirect Target Header: ${testNonWww.headers.location || 'NONE (Direct 200 OK)'}`);

const nonWwwPass = (testNonWww.status === 200 && !testNonWww.headers.location);
console.log(`✅ Non-WWW Direct 200 Test: ${nonWwwPass ? 'PASSED (0 Redirect Loops)' : 'FAILED'}`);

// Test 2: Request to www (x-forwarded-host: www.stihldecoder.nl)
const testWww = await fetchUrl('http://localhost:3097/kettingzagen/ms-261/?ref=test', {
  'x-forwarded-host': 'www.stihldecoder.nl',
  'x-forwarded-proto': 'https'
});

console.log(`\n✅ WWW Request Status: ${testWww.status}`);
console.log(`✅ WWW Redirect Target: ${testWww.headers.location}`);

const wwwPass = (
  testWww.status === 301 &&
  testWww.headers.location === 'https://stihldecoder.nl/kettingzagen/ms-261/?ref=test'
);
console.log(`✅ WWW 301 -> Non-WWW Test: ${wwwPass ? 'PASSED (Single 301 Hop)' : 'FAILED'}`);

const isEmergencyFixGo = nonWwwPass && wwwPass;
console.log(`\n🚦 EMERGENCY PRODUCTION FIX DECISION: ${isEmergencyFixGo ? '✅ GO' : '❌ NO-GO'}`);

process.exit(isEmergencyFixGo ? 0 : 1);

function fetchUrl(url, headers = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers
    };

    http.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        });
      });
    }).on('error', (err) => {
      resolve({ status: 500, headers: {}, body: err.message });
    });
  });
}
