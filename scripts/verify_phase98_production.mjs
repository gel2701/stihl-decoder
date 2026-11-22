#!/usr/bin/env node
/**
 * scripts/verify_phase98_production.mjs
 *
 * Checks the live site after the Phase 98 deploy: the deployed commit, and for a
 * sample of the new parts (plus a few parts that already had offers) whether the
 * public page shows the expected eBay item id with the campaign id.
 *
 * Read-only. Usage: node scripts/verify_phase98_production.mjs [--sample 12]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const SAMPLE = Number(readArg('--sample', 12));
const BASE = 'https://www.stihldecoder.nl';

const data = readJson('output/phase98/PHASE98_EBAY_ACTIVATION.json');
const offers = data.accepted_offers;

const byPart = new Map();
for (const offer of offers) {
  if (!byPart.has(offer.part_number)) byPart.set(offer.part_number, []);
  byPart.get(offer.part_number).push(offer);
}
const newParts = [...byPart.keys()].sort();
const step = Math.max(1, Math.floor(newParts.length / SAMPLE));
const sample = newParts.filter((_, index) => index % step === 0).slice(0, SAMPLE);

// Parts that were already live before Phase 98 must keep working.
const existing = readJson('output/phase97/PHASE97_EBAY_ACTIVATION.json').accepted_parts.slice(0, 3);

const partUrl = part => `${BASE}/onderdeelnummer/stihl-${part.slice(0, 4)}-${part.slice(4, 7)}-${part.slice(7)}/`;

const fetchText = async url => {
  const response = await fetch(url, { headers: { 'user-agent': 'stihl-decoder-phase98-verify' } });
  return { status: response.status, text: await response.text() };
};

const version = await fetchText(`${BASE}/api/version`).catch(error => ({ status: 0, text: error.message }));
let versionDoc = null;
try {
  versionDoc = JSON.parse(version.text);
} catch {
  // keep the raw text
}

const rows = [];
let passed = 0;
for (const [kind, list] of [['NEW', sample], ['EXISTING', existing]]) {
  for (const part of list) {
    const expected = kind === 'NEW' ? byPart.get(part) : null;
    const url = partUrl(part);
    let result = { kind, part_number: part, url };
    try {
      const page = await fetchText(url);
      const html = page.text;
      const itemIds = [...html.matchAll(/ebay\.[a-z]{2,3}\/itm\/(\d+)/g)].map(match => match[1]);
      const uniqueItems = [...new Set(itemIds)];
      const campid = /campid=5339245312/.test(html);
      const expectedIds = expected
        ? expected.map(offer => String(offer.item_id).replace(/^v1\|/, '').replace(/\|.*$/, ''))
        : [];
      const hasExpected = kind === 'NEW'
        ? expectedIds.some(id => html.includes(id))
        : uniqueItems.length > 0;
      result = {
        ...result,
        status: page.status,
        ebay_links: uniqueItems.length,
        campid,
        expected_ids: expectedIds,
        has_expected_item: hasExpected,
        ok: page.status === 200 && hasExpected && campid
      };
    } catch (error) {
      result = { ...result, error: error.message, ok: false };
    }
    if (result.ok) passed += 1;
    rows.push(result);
    console.log(JSON.stringify(result));
  }
}

const summary = {
  deployed_version: versionDoc,
  new_parts_checked: sample.length,
  existing_parts_checked: existing.length,
  passed,
  total: rows.length,
  failures: rows.filter(row => !row.ok)
};
fs.writeFileSync(
  path.join(ROOT, 'output', 'phase98', 'PHASE98_PRODUCTION_VERIFICATION.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), summary, rows }, null, 2) + '\n',
  'utf8'
);
console.log(JSON.stringify({ passed, total: rows.length, deployed: versionDoc?.commit || null, failures: rows.filter(row => !row.ok).map(row => row.part_number) }, null, 2));
