import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';

const TEST_PORT = 3119;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, error: e.message });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('===============================================================');
  console.log('🧪 RUNNING CRITICAL API CONTRACT TEST SUITE');
  console.log('===============================================================');

  // Spawn local test server instance
  const serverProc = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      DATABASE_PATH: './data/test_stihl_database.db'
    },
    stdio: 'ignore'
  });

  try {
    // Wait for server ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const check = await fetchJson('/api/version');
        if (check.status === 200 && check.body?.commit) {
          ready = true;
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    assert.strictEqual(ready, true, 'Server failed to start on port ' + TEST_PORT);

    // Contract 1: GET /api/decode?code=163118080 -> SERIAL_NUMBER, OFFICIAL_STIHL_LOOKUP
    console.log('\n▶ Contract 1: Serial decode (163118080) canonical response shape...');
    const serialRes = await fetchJson('/api/decode?code=163118080');
    assert.strictEqual(serialRes.status, 200, 'Expected HTTP 200 for 163118080');
    assert.strictEqual(serialRes.body.type, 'SERIAL_NUMBER', 'Expected type SERIAL_NUMBER');
    assert.strictEqual(serialRes.body.cleaned, '163118080', 'cleaned serial must match');
    assert.strictEqual(serialRes.body.model, 'MS 440-Z 3/8" RIM Magnum Motorsäge', 'Model variant must match');
    assert.strictEqual(serialRes.body.officialAnchor?.verificationStatus, 'OFFICIAL_STIHL_LOOKUP', 'Official verification status must match');
    assert.strictEqual(serialRes.body.sourceStatus, 'OFFICIAL_STIHL_LOOKUP', 'Source status must be OFFICIAL_STIHL_LOOKUP');
    assert.ok(serialRes.body.factory, 'Must include factory object');
    assert.strictEqual(serialRes.body.factory.country, 'Duitsland', 'Factory country must be Duitsland');
    console.log('  ✅ Contract 1 Passed: Official serial anchor response shape verified.');

    // Contract 2: GET /api/decode?code=11210210800 -> PART_NUMBER, family 1121
    console.log('\n▶ Contract 2: Part number decode (11210210800) response shape...');
    const partRes = await fetchJson('/api/decode?code=11210210800');
    assert.strictEqual(partRes.status, 200, 'Expected HTTP 200 for 11210210800');
    assert.strictEqual(partRes.body.type, 'PART_NUMBER', 'Expected type PART_NUMBER');
    assert.strictEqual(partRes.body.familyCode, '1121', 'familyCode must be 1121');
    assert.ok(partRes.body.formattedPartNo.includes('1121 021 0800'), 'formattedPartNo must format properly');
    assert.ok(partRes.body.modelGroup.includes('MS 260'), 'modelGroup must reference MS 260');
    assert.strictEqual(partRes.body.isWarning, true, 'Part numbers must carry warning flag');
    console.log('  ✅ Contract 2 Passed: Part number response shape verified.');

    // Contract 3: GET /api/decode?code=MS%20261%20C-M -> MODEL_DECODE
    console.log('\n▶ Contract 3: Model query decode (MS 261 C-M) response shape...');
    const modelRes = await fetchJson('/api/decode?code=MS%20261%20C-M');
    assert.strictEqual(modelRes.status, 200, 'Expected HTTP 200 for MS 261 C-M');
    assert.strictEqual(modelRes.body.type, 'MODEL_DECODE', 'Expected type MODEL_DECODE');
    assert.ok(modelRes.body.technicalSpecs, 'Must contain technicalSpecs object');
    assert.strictEqual(modelRes.body.technicalSpecs.displacement_cc, 50.2, 'Displacement must be 50.2 cc');
    assert.ok(modelRes.body.driveClassification, 'Must contain driveClassification');
    assert.strictEqual(modelRes.body.driveClassification.power_source, 'PETROL', 'Power source must be PETROL');
    console.log('  ✅ Contract 3 Passed: Model query decode response shape verified.');

    // Contract 4: GET /api/version -> valid JSON contract
    console.log('\n▶ Contract 4: System version API (/api/version) JSON contract...');
    const verRes = await fetchJson('/api/version');
    assert.strictEqual(verRes.status, 200, 'Expected HTTP 200 for /api/version');
    assert.ok(typeof verRes.body.commit === 'string' && verRes.body.commit.length >= 7, 'Commit SHA must be valid');
    assert.ok(typeof verRes.body.branch === 'string', 'Branch must be a string');
    assert.ok(typeof verRes.body.environment === 'string', 'Environment must be specified');
    assert.ok(verRes.body.database && typeof verRes.body.database.connected === 'boolean', 'Database health must be reported');
    console.log('  ✅ Contract 4 Passed: System version API contract verified.');

    // Contract 5: GET /api/models -> valid array contract
    console.log('\n▶ Contract 5: Models registry API (/api/models) array contract...');
    const modelsRes = await fetchJson('/api/models');
    assert.strictEqual(modelsRes.status, 200, 'Expected HTTP 200 for /api/models');
    assert.ok(Array.isArray(modelsRes.body), 'Response must be an Array');
    assert.ok(modelsRes.body.length >= 100, `Expected at least 100 models, received ${modelsRes.body.length}`);
    const sample = modelsRes.body[0];
    assert.ok(sample.model_name, 'Model entry must have model_name');
    assert.ok(sample.slug, 'Model entry must have slug');
    console.log(`  ✅ Contract 5 Passed: Models array contract verified (${modelsRes.body.length} models).`);

    console.log('\n===============================================================');
    console.log('🎉 ALL CRITICAL API CONTRACT TESTS PASSED 100% CLEANLY!');
    console.log('===============================================================');
  } finally {
    serverProc.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error('\n❌ CRITICAL API CONTRACT FAILED:', err);
  process.exit(1);
});
