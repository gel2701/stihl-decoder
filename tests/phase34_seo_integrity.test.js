import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildStructuredData } from '../src/components/StructuredData.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { generateSitemapXml, collectSitemapDiagnostics } from '../src/components/SitemapGenerator.js';
import { getValuationPublicationState, getSafeModelPath } from '../src/publicationRules.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const preUrlsPath = path.join(__dirname, '..', 'data', 'phase34_pre_urls.json');
const indexPath = path.join(__dirname, '..', 'index.html');

const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'public_evidence_facts.json'), 'utf8'));
const preUrlsData = JSON.parse(fs.readFileSync(preUrlsPath, 'utf8'));
const indexHtml = fs.readFileSync(indexPath, 'utf8');

console.log('🧪 Starting Phase 34A SEO integrity assertions...');

const fs100 = database.models.find((model) => model.slug === 'fs-100');
const br600 = database.models.find((model) => model.slug === 'br-600');
const ms261 = database.models.find((model) => model.slug === 'ms-261');
const ts420 = database.models.find((model) => model.slug === 'ts-420');

assert.ok(fs100 && br600 && ms261 && ts420, 'Core validation models must exist.');

const fs100Graph = buildStructuredData({ pageType: 'model', model: fs100, url: `${PRIMARY_ORIGIN}/bosmaaiers/fs-100/` })['@graph'];
const fs100Product = fs100Graph.find((node) => node['@type'] === 'Product');
const fs100Faq = fs100Graph.find((node) => node['@type'] === 'FAQPage');
assert.ok(fs100Product === undefined || Array.isArray(fs100Product.additionalProperty || []), 'FS100 Product schema, if present, must be evidence-safe.');
assert.ok(fs100Faq, 'FS100 should emit FAQ schema.');
assert.ok(fs100Faq.mainEntity.some((item) => item.acceptedAnswer.text.includes('bosmaaier')), 'FS100 serial location must be category-aware.');
assert.strictEqual(JSON.stringify(fs100Graph).includes('geleideblad'), false, 'FS100 schema must not mention guide bars.');
assert.strictEqual(JSON.stringify(fs100Graph).includes('ketting'), false, 'FS100 schema must not inherit chainsaw wording.');

const br600Graph = buildStructuredData({ pageType: 'model', model: br600, url: `${PRIMARY_ORIGIN}/bladblazers/br-600/` })['@graph'];
assert.strictEqual(JSON.stringify(br600Graph).includes('ketting'), false, 'BR600 schema must not inherit chainsaw wording.');
assert.strictEqual(JSON.stringify(br600Graph).includes('geleideblad'), false, 'BR600 schema must not mention guide bars.');

const ms261Graph = buildStructuredData({ pageType: 'model', model: ms261, url: `${PRIMARY_ORIGIN}/kettingzagen/ms-261/` })['@graph'];
const ms261Product = ms261Graph.find((node) => node['@type'] === 'Product');
assert.ok(ms261Product === undefined || Array.isArray(ms261Product.additionalProperty || []), 'MS261 Product schema, if present, must be evidence-safe.');

const ts420Graph = buildStructuredData({ pageType: 'model', model: ts420, url: `${PRIMARY_ORIGIN}/doorslijpers/ts-420/` })['@graph'];
assert.strictEqual(ts420Graph.find((node) => node['@type'] === 'Product'), undefined, 'TS420 must not emit Product schema without primary-document verification.');
assert.strictEqual(JSON.stringify(ts420Graph).includes('ketting'), false, 'TS420 schema must not inherit chain wording.');

const unknownGraph = buildStructuredData({
  pageType: 'model',
  model: { id: 'unknown_model', model_name: 'Unknown Model', slug: 'unknown-model', category_slug: null },
  url: `${PRIMARY_ORIGIN}/modellen-onbekend/unknown-model/`
})['@graph'];
assert.strictEqual(unknownGraph.find((node) => node['@type'] === 'Product'), undefined, 'Unknown model must not emit Product schema.');

const valuationState = getValuationPublicationState(ms261);
assert.strictEqual(valuationState.canIndex, false, 'Valuation route should not be indexable without model-specific market data.');
assert.strictEqual(valuationState.showPrice, false, 'Valuation route should not show a fallback price.');
assert.ok(valuationState.metaDescription.includes('onvoldoende modelspecifieke marktdata'), 'Valuation metadata must disclose insufficient market data.');

const blowerCategoryHtml = renderCategoryPageHtml('bladblazers', database, PRIMARY_ORIGIN);
assert.strictEqual(blowerCategoryHtml.includes('MS 260 vs MS 261'), false, 'Blower category page must not show chainsaw comparison block.');

const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
const postUrls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.strictEqual(postUrls.length, preUrlsData.total_count, 'Sitemap URL count must remain stable at 94.');
assert.strictEqual(postUrls.includes(`${PRIMARY_ORIGIN}/waarde/ms-261/`), false, 'Noindex valuation routes must not appear in sitemap.');
assert.strictEqual(postUrls.every((url) => url.startsWith(PRIMARY_ORIGIN)), true, 'Sitemap URLs must be self-canonical WWW URLs.');

const diagnostics = collectSitemapDiagnostics(database);
assert.deepStrictEqual(diagnostics.categoryMissingModels, [], 'No model may silently fall back into chainsaw sitemap routes.');

assert.strictEqual(indexHtml.includes('"@type": "WebSite"'), true, 'Homepage JSON-LD must include WebSite schema.');
assert.strictEqual((indexHtml.match(/"@type": "WebSite"/g) || []).length, 1, 'Homepage must contain exactly one WebSite node.');
assert.strictEqual(indexHtml.includes('Exact Breakpoint Matching'), false, 'Homepage must not use Exact Breakpoint Matching copy.');
assert.strictEqual(indexHtml.includes('184592301 (MS 261 C-M Gen 2)'), false, 'Homepage example serial must not claim a model match.');

console.log('✅ Phase 34A SEO integrity assertions passed.');
