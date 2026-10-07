#!/usr/bin/env node
/**
 * Real Live Parts Harvester Smoke Test (Phase 52A-R3)
 * Performs REAL live HTTP requests over the internet, checks robots/WAF policy,
 * calculates SHA-256 hashes, verifies structured live source discovery and extraction,
 * and asserts strict pass/fail criteria (no pass on 403 or zero parsed parts).
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { HttpClient } from '../src/parts/HttpClient.js';
import { SparePartsWorldSource } from '../src/parts/sources/SparePartsWorldSource.js';
import { LsEngineersSource } from '../src/parts/sources/LsEngineersSource.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';
import { PartsTreeSource } from '../src/parts/sources/PartsTreeSource.js';
import { OfficialStihlSource } from '../src/parts/sources/OfficialStihlSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🌐 RUNNING REAL LIVE STIHL PARTS HARVESTER SMOKE TEST (R3)');
console.log('===============================================================\n');

async function main() {
  const liveClient = new HttpClient({ mode: 'LIVE', useCache: false, minDelayMs: 300 });

  // 1. Live Robots.txt / Policy Preflight
  console.log('▶ Step 1: Live Robots.txt & Policy Preflight Checks...');
  const diySource = new DiySparePartsSource(liveClient);
  const ptSource = new PartsTreeSource(liveClient);
  const lsSource = new LsEngineersSource(liveClient);
  const spwSource = new SparePartsWorldSource(liveClient);

  const diyPolicy = await diySource.checkRobotsPolicy();
  console.log(`  • DIY Spare Parts robots : HTTP ${diyPolicy.http_status} [${diyPolicy.decision}] (${diyPolicy.notes})`);

  const ptPolicy = await ptSource.checkRobotsPolicy();
  console.log(`  • PartsTree robots       : HTTP ${ptPolicy.http_status} [${ptPolicy.decision}] (${ptPolicy.notes})`);

  const lsPolicy = await lsSource.checkRobotsPolicy();
  console.log(`  • L&S Engineers robots   : HTTP ${lsPolicy.status} [${lsPolicy.allowed ? 'PERMITTED' : 'DISALLOWED'}]`);

  const spwPolicy = await spwSource.checkRobotsPolicy();
  console.log(`  • Spare Parts World      : HTTP ${spwPolicy.status} [${spwPolicy.allowed ? 'PERMITTED' : 'DISALLOWED'}] (${spwPolicy.reason})`);

  assert.strictEqual(spwPolicy.status, 200, 'Spare Parts World robots.txt returned HTTP 200');
  assert.ok(spwPolicy.allowed, 'Spare Parts World policy permits product crawling');

  // 2. Candidate Source WAF / Harvestability Check
  console.log('\n▶ Step 2: Blocked vs Accessible Candidate Source Check...');
  const diyDiscovery = await diySource.discoverModel('MS 261');
  console.log(`  • DIY Spare Parts (MS 261): HTTP ${diyDiscovery.http_status} (Harvestable: false, Reason: WAF_BLOCKED)`);
  assert.ok(diyDiscovery.http_status === 403 || diyDiscovery.http_status === 404, 'DIY returns 403/404 on automated request');

  const lsDiscovery = await lsSource.discoverModel('MS 261');
  console.log(`  • L&S Engineers (MS 261)  : HTTP ${lsDiscovery.status} (Harvestable: false, Reason: WAF_BLOCKED)`);
  assert.strictEqual(lsDiscovery.status, 403, 'L&S returns 403 Cloudflare challenge on automated request');

  // 3. Primary Structured Source Live Harvest (MS 261)
  console.log('\n▶ Step 3: Primary Live Source Harvest (Spare Parts World - MS 261)...');
  const ms261Discovery = await spwSource.discoverModel('MS 261');
  console.log(`  • URL: ${ms261Discovery.url}`);
  console.log(`  • HTTP Status: ${ms261Discovery.status}`);
  console.log(`  • Content SHA-256: ${ms261Discovery.sha256}`);
  console.log(`  • Body Length: ${ms261Discovery.rawHtml.length} bytes`);

  // STRICT HARVEST GATES:
  assert.strictEqual(ms261Discovery.status, 200, 'Model page HTTP status must be 200');
  assert.ok(!ms261Discovery.rawHtml.includes('Just a moment...'), 'Response must not be a Cloudflare WAF challenge');
  assert.ok(!ms261Discovery.rawHtml.includes('Access Denied'), 'Response must not be an Akamai access denied block');
  assert.ok(ms261Discovery.rawHtml.length > 50000, 'Model page must contain full HTML catalogue body');

  const sections = spwSource.discoverSections(ms261Discovery.rawHtml, 'MS 261');
  console.log(`  • Discovered Diagram Sections: ${sections.length}`);
  sections.slice(0, 8).forEach(s => console.log(`    - ${s.diagram_index}: ${s.section_name} (${s.section_key})`));
  assert.ok(sections.length > 0, 'Must discover at least one diagram section');

  const parsedParts = spwSource.parsePartsFromHtml(ms261Discovery.rawHtml, 'MS 261', ms261Discovery.url);
  console.log(`  • Extracted Exploded Parts: ${parsedParts.length}`);
  assert.ok(parsedParts.length > 50, 'Must extract substantive exploded parts (>50 records)');

  // Validate part numbers format
  let valid11DigitCount = 0;
  for (const p of parsedParts) {
    if (/^\d{11}$/.test(p.part_number)) {
      valid11DigitCount++;
    }
  }
  const validRate = valid11DigitCount / parsedParts.length;
  console.log(`  • Valid 11-digit STIHL Part Rate: ${(validRate * 100).toFixed(1)}% (${valid11DigitCount}/${parsedParts.length})`);
  assert.strictEqual(validRate, 1.0, 'All parsed part numbers must be valid 11-digit STIHL numbers');

  // 4. Representative Live Part Verification (20 parts)
  console.log('\n▶ Step 4: Representative Live Part Samples Validation (20 items)...');
  const sampleParts = parsedParts.slice(0, 20);
  for (let i = 0; i < sampleParts.length; i++) {
    const p = sampleParts[i];
    console.log(`  [#${i + 1}] ${p.part_number_display} | Pos: ${p.diagram_position} | ${p.part_name_raw} | Section: ${p.section_name}`);
    assert.ok(p.part_number.length === 11, 'Part number is 11 digits');
    assert.ok(p.part_name_raw.length > 0, 'Part name raw is non-empty');
  }

  // 5. Official Source Evidence Provenance
  console.log('\n▶ Step 5: Official STIHL Service Evidence Provenance...');
  const officialSource = new OfficialStihlSource();
  const officialParts = await officialSource.getOfficialPartsForModel('MS 261');
  assert.ok(officialParts.length > 0, 'Official parts returned');
  for (const p of officialParts) {
    console.log(`  • [${p.source_evidence_status}] ${p.part_number_display}: ${p.part_name_raw} (${p.notes})`);
    assert.strictEqual(p.source_id, 'official_stihl');
    assert.ok(p.source_url.startsWith('https://www.stihl.'));
  }

  console.log('\n===============================================================');
  console.log('🎉 REAL LIVE SMOKE TEST COMPLETED AND VERIFIED 100% CLEAN!');
  console.log('===============================================================');
}

main().catch(err => {
  console.error('\n❌ Real live smoke test failure:', err.message);
  process.exit(1);
});
