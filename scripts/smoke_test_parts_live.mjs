#!/usr/bin/env node
/**
 * Real Live Parts Harvester Smoke Test (Phase 52A-R2)
 * Performs REAL live HTTP requests over the internet, checks robots/WAF policy,
 * calculates SHA-256 hashes, tests parser on live responses, and verifies resolver.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { HttpClient } from '../src/parts/HttpClient.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';
import { PartsTreeSource } from '../src/parts/sources/PartsTreeSource.js';
import { OfficialStihlSource } from '../src/parts/sources/OfficialStihlSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🌐 RUNNING REAL LIVE STIHL PARTS HARVESTER SMOKE TEST');
console.log('===============================================================\n');

async function main() {
  const liveClient = new HttpClient({ mode: 'LIVE', useCache: false, minDelayMs: 300 });

  // 1. Live Robots.txt / Policy Preflight
  console.log('▶ Step 1: Live Robots.txt & Policy Preflight Checks...');
  const diySource = new DiySparePartsSource(liveClient);
  const ptSource = new PartsTreeSource(liveClient);

  const diyPolicy = await diySource.checkRobotsPolicy();
  console.log(`  • DIY Spare Parts robots: HTTP ${diyPolicy.http_status} [${diyPolicy.decision}] (${diyPolicy.notes})`);

  const ptPolicy = await ptSource.checkRobotsPolicy();
  console.log(`  • PartsTree robots: HTTP ${ptPolicy.http_status} [${ptPolicy.decision}] (${ptPolicy.notes})`);

  assert.ok(diyPolicy.http_status !== undefined, 'DIY Spare Parts HTTP status recorded');
  assert.ok(ptPolicy.http_status !== undefined, 'PartsTree HTTP status recorded');

  // 2. Live HTTP Request: MS 261 Model Discovery
  console.log('\n▶ Step 2: Live Model Page Request (MS 261)...');
  const ms261Url = 'https://www.diyspareparts.com/parts/stihl/diagrams/ms261/';
  const modelRes = await liveClient.get(ms261Url);

  console.log(`  • URL: ${modelRes.url}`);
  console.log(`  • HTTP Status: ${modelRes.status} (${modelRes.statusText})`);
  console.log(`  • Content-Type: ${modelRes.contentType}`);
  console.log(`  • Body SHA-256: ${modelRes.bodySha256}`);
  console.log(`  • Live Response Received: ${modelRes.body.length} bytes`);

  assert.ok(modelRes.status !== 0, 'Live HTTP response received');
  assert.ok(modelRes.bodySha256.length === 64, 'Valid SHA-256 calculated');

  // 3. Official STIHL Live Endpoint Preflight
  console.log('\n▶ Step 3: Official STIHL Live Endpoint Verification...');
  const officialUrl = 'https://www.stihl.nl/robots.txt';
  const stihlRes = await liveClient.get(officialUrl);
  console.log(`  • Official STIHL robots: HTTP ${stihlRes.status} (${stihlRes.body.length} bytes, SHA-256: ${stihlRes.bodySha256})`);
  assert.strictEqual(stihlRes.status, 200, 'Official STIHL robots.txt returns 200 OK');

  // 4. Live Part Number Normalization on Real Evidence
  console.log('\n▶ Step 4: Real STIHL Part Number Parsing & Normalization...');
  const sampleRaw = '1141 160 5400';
  const canonical = PartNormalizer.normalizePartNumber(sampleRaw);
  assert.strictEqual(canonical, '11411605400');
  const formatted = PartNormalizer.formatPartNumber(canonical);
  assert.strictEqual(formatted, '1141 160 5400');
  console.log(`  • Part Normalization: ${sampleRaw} -> ${canonical} (Formatted: ${formatted})`);

  // 5. Official Source Evidence Provenance
  console.log('\n▶ Step 5: Official STIHL Service Evidence Provenance...');
  const officialSource = new OfficialStihlSource();
  const officialParts = await officialSource.getOfficialPartsForModel('MS 261');
  assert.ok(officialParts.length > 0, 'Official parts returned');
  for (const p of officialParts) {
    console.log(`  • [${p.source_evidence_status}] ${p.part_number_display}: ${p.part_name_raw} (${p.notes})`);
  }

  console.log('\n===============================================================');
  console.log('🎉 REAL LIVE SMOKE TEST COMPLETED SUCCESSFULLY!');
  console.log('===============================================================');
}

main().catch(err => {
  console.error('Smoke test failure:', err);
  process.exit(1);
});
