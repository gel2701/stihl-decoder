/**
 * scripts/phase87_3_runner.mjs
 *
 * Resumable Playwright live /dp/ + NL delivery collector for Phase 87.3.
 * Reuses output/phase87_1 and output/phase87_2 cached /dp/ checks and appends
 * new checks to output/phase87_3/product_checks_amazon_nl.json and _de.json.
 *
 * Scrubs any city/postal text before writing JSON to disk.
 * Stops immediately on CAPTCHA / 503 without bypassing any gate.
 *
 * Usage:
 *   node scripts/phase87_3_runner.mjs check-dp --marketplace amazon.nl --limit 250
 *   node scripts/phase87_3_runner.mjs check-dp --marketplace amazon.de --limit 180
 *   node scripts/phase87_3_runner.mjs dealer --limit 250
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase87_3');
fs.mkdirSync(OUT, { recursive: true });

const readOpt = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scrubGeo = s => String(s || '').replace(/\b(Bezorgen\s+aan|Wordt\s+bezorgd\s+aan)\s+[^\n,|]{2,40}/gi, '$1 NL').replace(/\b\d{4}\s*[A-Z]{2}\b/g, 'NL-POSTAL');
function argVal(flag, def = null) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
function isBlockedPage(status, title, body) {
  if (status === 503 || status === 429) return true;
  if (/Type the characters you see|Enter the characters you see|Robot Check|Automated access|captcha/i.test(`${title} ${body.slice(0, 600)}`)) return true;
  return false;
}

async function initMarketplaceSession(page, marketplace) {
  await page.goto(`https://www.${marketplace}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.locator('#sp-cc-accept').click().catch(() => {});
  await sleep(400);
  await page.locator('#nav-global-location-popover-link').click().catch(() => {});
  await sleep(900);
  if (marketplace === 'amazon.de') {
    if (await page.locator('select#GLUXCountryList').count()) {
      await page.locator('select#GLUXCountryList').selectOption('NL').catch(() => {});
      await sleep(400);
      await page.locator('button[name="glowDoneButton"], .a-popover-footer button').first().click().catch(() => {});
      await sleep(1200);
    }
  } else {
    // Optional NL postal input via NL_DELIVERY_POSTAL env var without persisting postal codes in repo
    const zipInput = page.locator('#GLUXZipUpdateInput');
    if (process.env.NL_DELIVERY_POSTAL && await zipInput.count()) {
      await zipInput.fill(process.env.NL_DELIVERY_POSTAL).catch(() => {});
      await sleep(250);
      await page.locator('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate-announce').first().click().catch(() => {});
      await sleep(700);
      await page.locator('button[name="glowDoneButton"], #GLUXConfirmClose').first().click().catch(() => {});
      await sleep(900);
    }
  }
}

async function checkDp(mkt, limit) {
  const suffix = mkt === 'amazon.de' ? 'de' : 'nl';
  const outPath = path.join(OUT, `product_checks_amazon_${suffix}.json`);
  const prev872 = readOpt(path.join(ROOT, 'output', 'phase87_2', `product_checks_amazon_${suffix}.json`), {});
  const cur = readOpt(outPath, {});
  const combined = { ...prev872, ...cur };

  const queueDoc = readOpt(path.join(OUT, 'unchecked_queue.json'), { nl: [], de: [] });
  const list = (suffix === 'de' ? queueDoc.de : queueDoc.nl) || [];

  // Prepend legacy phase87_1 items & VERIFIED DE offers for fresh confirmation
  const seedAsins = suffix === 'nl'
    ? ['B0CNSGPZ2R', 'B0FQSTWS2Z']
    : ['B013KONKZY', 'B00LAHKSDQ', 'B00SVDWDRG'];

  const todo = [];
  const seen = new Set();
  for (const asin of seedAsins) {
    if (!cur[asin] && !seen.has(asin)) {
      seen.add(asin);
      todo.push(asin);
    }
  }
  for (const row of list) {
    if (combined[row.asin] || seen.has(row.asin)) continue;
    seen.add(row.asin);
    todo.push(row.asin);
    if (todo.length >= limit) break;
  }

  console.log(`[${mkt}] /dp/ pending=${todo.length} (cur_cached=${Object.keys(cur).length})`);
  if (todo.length === 0) return;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'nl-NL',
    viewport: { width: 1280, height: 900 }
  });

  const concurrency = 4;
  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await ctx.newPage();
    if (i === 0) await initMarketplaceSession(p, mkt);
    pages.push(p);
  }
  for (let i = 1; i < pages.length; i++) {
    await pages[i].goto(`https://www.${mkt}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  }

  let idx = 0;
  let rateLimited = false;
  let processed = 0;

  async function worker(page, workerId) {
    while (idx < todo.length && !rateLimited) {
      const asin = todo[idx++];
      try {
        await sleep(workerId * 120);
        const resp = await page.goto(`https://www.${mkt}/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(650);
        const status = resp ? resp.status() : 200;
        if (status === 404 || status === 410) {
          cur[asin] = { asin, marketplace: mkt, http_status: status, checked_at: new Date().toISOString(), listed: false };
          processed++;
          continue;
        }
        const data = await page.evaluate(() => {
          const textOf = el => el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
          const delivTexts = [...document.querySelectorAll('#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage, #contextualIngressPtLabel_deliveryShortLine, #exports_desktop_qualifiedBuybox_deliveryBlock_feature_div')]
            .map(textOf).filter(Boolean);
          const sellerTexts = [...document.querySelectorAll('#merchant-info, #sellerProfileTriggerId, #tabular-buybox')]
            .map(textOf).filter(Boolean).slice(0, 3);
          const bullets = [...document.querySelectorAll('#feature-bullets li span')].map(textOf).filter(Boolean).slice(0, 8);
          const addCart = !!document.querySelector('#add-to-cart-button, #buy-now-button');
          const price = !!document.querySelector('.a-price .a-offscreen');
          const bodyHead = (document.body.innerText || '').slice(0, 700);
          return {
            pageTitle: document.title || '',
            bodyHead,
            title: textOf(document.querySelector('#productTitle')),
            byline: textOf(document.querySelector('#bylineInfo')),
            avail: textOf(document.querySelector('#availability')),
            deliveryBlock: delivTexts.join(' | ').slice(0, 350),
            delivery: delivTexts.map(s => s.slice(0, 180)),
            seller: sellerTexts.map(s => s.slice(0, 180)),
            bullets,
            description: textOf(document.querySelector('#productDescription, #aplus')).slice(0, 800),
            hasPrice: price,
            hasAddCart: addCart,
            cannotShipNl: /kan niet worden bezorgd|cannot be shipped|nicht.*Niederlande.*geliefert|nicht an die ausgewählte/i.test(`${delivTexts.join(' ')} ${textOf(document.querySelector('#availability'))}`)
          };
        });

        if (isBlockedPage(status, data.pageTitle, data.bodyHead)) {
          rateLimited = true;
          console.log(`[${mkt}] Rate limit/CAPTCHA (${status}) at ${asin}; stopping cleanly.`);
          break;
        }

        cur[asin] = {
          asin,
          marketplace: mkt,
          http_status: status,
          checked_at: new Date().toISOString(),
          listed: !!data.title && !/Page Not Found|Pagina niet gevonden|Seite wurde nicht gefunden/i.test(data.pageTitle),
          isDead: /Page Not Found|Pagina niet gevonden|Seite wurde nicht gefunden/i.test(data.pageTitle),
          pageTitle: scrubGeo(data.pageTitle),
          title: scrubGeo(data.title),
          byline: scrubGeo(data.byline),
          avail: scrubGeo(data.avail),
          deliveryBlock: scrubGeo(data.deliveryBlock),
          delivery: data.delivery.map(scrubGeo),
          seller: data.seller.map(scrubGeo),
          bullets: data.bullets.map(scrubGeo),
          description: scrubGeo(data.description),
          hasPrice: data.hasPrice,
          hasAddCart: data.hasAddCart,
          cannotShipNl: data.cannotShipNl
        };
        processed++;
        if (processed % 15 === 0) {
          writeJson(outPath, cur);
          console.log(`[${mkt}] checked=${processed}/${todo.length}`);
        }
      } catch (err) {
        cur[asin] = { asin, marketplace: mkt, error: err.message.slice(0, 120), checked_at: new Date().toISOString() };
        processed++;
      }
    }
  }

  await Promise.all(pages.map((p, i) => worker(p, i)));
  writeJson(outPath, cur);
  await browser.close();
  console.log(`[${mkt}] DONE checked=${processed}, total_saved=${Object.keys(cur).length}, rateLimited=${rateLimited}`);
}

const cmd = process.argv[2];
const mkt = argVal('--marketplace', 'amazon.nl');
const limit = parseInt(argVal('--limit', '200'), 10);
if (cmd === 'check-dp') {
  checkDp(mkt, limit).catch(e => { console.error(e); process.exit(1); });
} else {
  console.log('Usage: node scripts/phase87_3_runner.mjs check-dp --marketplace amazon.nl|amazon.de --limit N');
}
