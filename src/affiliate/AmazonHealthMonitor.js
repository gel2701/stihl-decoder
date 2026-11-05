import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateAmazonLink, classifyAmazonResponse } from './AmazonLinkValidator.js';

export async function checkAmazonHealth({ registryPath, outputPath, inspect, now = () => new Date().toISOString() } = {}) {
  if (!registryPath) throw new Error('registryPath required');
  const doc = JSON.parse(await readFile(registryPath, 'utf8'));
  if (!Array.isArray(doc.offers)) throw new Error('Invalid registry offers');
  const active = doc.offers.filter(offer => offer.status === 'ACTIVE');
  const seen = new Set();
  const results = [];
  for (const offer of active) {
    const expected = { marketplace: offer.marketplace, asin: offer.asin, tag: offer.affiliate_tag, part_number: offer.part_number };
    const url = offer.direct_affiliate_url || offer.affiliate_url || offer.url || '';
    const checked = validateAmazonLink(url, expected);
    const key = `${offer.marketplace}:${offer.asin}:${offer.part_number}`;
    const duplicate = seen.has(key);
    seen.add(key);
    let state = duplicate ? 'WARNING' : !checked.valid ? (checked.reason === 'PRODUCT_MISMATCH' ? 'PRODUCT_MISMATCH' : 'WARNING') : 'UNKNOWN';
    if (checked.valid && !duplicate && inspect) {
      try {
        state = classifyAmazonResponse(await inspect({ ...offer, url }), expected);
      } catch {
        state = 'TEMPORARY_FAILURE';
      }
    }
    results.push({ part_number: offer.part_number, asin: offer.asin, marketplace: offer.marketplace, state, reason: duplicate ? 'DUPLICATE' : checked.valid ? null : checked.reason });
  }
  const report = { checked_at: now(), results };
  if (outputPath) {
    const target = resolve(outputPath);
    if (target === resolve(registryPath)) throw new Error('Output must not overwrite registry');
    let previous = {};
    try {
      previous = JSON.parse(await readFile(target, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const oldStates = new Map((previous.results || []).filter(item => item.reason !== 'DUPLICATE').map(item => [`${item.marketplace}:${item.part_number}:${item.asin}`, item.state]));
    report.transitions = results.filter(item => item.reason !== 'DUPLICATE' && oldStates.has(`${item.marketplace}:${item.part_number}:${item.asin}`) && oldStates.get(`${item.marketplace}:${item.part_number}:${item.asin}`) !== item.state).map(item => ({ part_number: item.part_number, asin: item.asin, from: oldStates.get(`${item.marketplace}:${item.part_number}:${item.asin}`), to: item.state, checked_at: report.checked_at }));
    report.history = [...(Array.isArray(previous.history) ? previous.history : []), ...report.transitions];
    const temporary = resolve(dirname(target), `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  return report;
}
