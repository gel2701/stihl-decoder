/**
 * Phase 77C — Regression invariants check (read-only).
 *
 * Verifies that the research branch did not change production behaviour:
 * 99 active offers, working affiliate resolver, buy buttons above the model
 * list, untouched passport/serial/evidence code, unchanged SEO surface.
 *
 * Usage: node scripts/phase77c_regression_checks.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='));
const outDir = path.join(root, outDirArg ? outDirArg.slice('--out-dir='.length) : path.join('output', 'phase77c'));
const outFileName = process.argv.find(arg => arg.startsWith('--out-name='))?.slice('--out-name='.length) || 'PHASE77C_REGRESSION_CHECKS.json';
fs.mkdirSync(outDir, { recursive: true });

process.env.AMAZON_AFFILIATE_ENABLED = process.env.AMAZON_AFFILIATE_ENABLED || 'true';
process.env.AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21';

const checks = [];
const record = (id, description, status, detail) => checks.push({ id, description, status, detail });

const git = (command) => {
  try { return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
};
const BASE_REF = (() => {
  for (const candidate of [process.env.PHASE77C_BASE_REF, 'main', 'origin/main', 'FETCH_HEAD']) {
    if (!candidate) continue;
    if (git(`git rev-parse --verify ${candidate}`)) return candidate;
  }
  return null;
})();
const diffAgainstBase = (file) => (BASE_REF ? git(`git diff --name-only ${BASE_REF} -- ${file}`) : null);

const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8'));
const active = registry.offers.filter(o => o.status === 'ACTIVE');
const mkt = (o) => String(o.marketplace || 'amazon.nl').toLowerCase();
record(
  'ACTIVE_OFFERS',
  '99 active Amazon offers are preserved (53 Amazon.nl / 46 Amazon.de)',
  active.length === 99 && active.filter(o => mkt(o) === 'amazon.nl').length === 53 && active.filter(o => mkt(o) === 'amazon.de').length === 46 ? 'PASS' : 'FAIL',
  `${active.length} active (${active.filter(o => mkt(o) === 'amazon.nl').length} NL / ${active.filter(o => mkt(o) === 'amazon.de').length} DE)`
);

const evidenceDiff = diffAgainstBase('data/affiliate/verified_amazon_registry.json');
record(
  'EVIDENCE_UNCHANGED',
  'Evidence registry is byte-identical to the base branch',
  evidenceDiff === null ? 'ERROR' : (evidenceDiff === '' ? 'PASS' : 'FAIL'),
  evidenceDiff === null ? `base ref unavailable (${BASE_REF})` : (evidenceDiff || `identical to ${BASE_REF}`)
);

const { resolvePurchaseOffer } = await import('../src/search/IntelligentPartsSearchEngine.js');
const { defaultVerifiedOfferRegistry } = await import('../src/affiliate/VerifiedOfferRegistry.js');
defaultVerifiedOfferRegistry.productionActivationAllowed = true;
defaultVerifiedOfferRegistry.activeWhitelist = null;

const nl = resolvePurchaseOffer('11104007005', 'Bosch WSR6F');
const de = resolvePurchaseOffer('30050003905', 'Zaagblad');
const fallback = resolvePurchaseOffer('11231602050', 'Stihl Clutch');
record(
  'RESOLVER',
  'Affiliate resolver returns direct NL/DE offers and a search fallback without a direct offer',
  nl.type === 'DIRECT_ASIN' && nl.url.includes('tag=srihldecoder2-21') &&
  de.type === 'DIRECT_ASIN' && de.marketplace === 'amazon.de' && de.url.includes('tag=srihldecode00-21') &&
  fallback.type === 'SEARCH_FALLBACK' ? 'PASS' : 'FAIL',
  `NL=${nl.type}/${nl.marketplace}, DE=${de.type}/${de.marketplace}, fallback=${fallback.type}`
);

const { renderPartDetailPageHtml } = await import('../src/components/PartDetailPageTemplate.js');
const database = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stihl_database.json'), 'utf8'));
const html = renderPartDetailPageHtml('11104007005', database, 'https://www.stihldecoder.nl');
const buyIdx = html.indexOf('data-offer-type="MANUAL_ASIN"');
const modelsIdx = html.indexOf('Geschikte STIHL Modellen');
record(
  'BUY_BUTTONS',
  'Direct buy button still renders above the full model list',
  buyIdx > -1 && modelsIdx > -1 && buyIdx < modelsIdx ? 'PASS' : 'FAIL',
  `buy=${buyIdx}, models=${modelsIdx}`
);

const untouched = ['src/components/StihlPassportGenerator.js', 'src/components/IntentPageTemplate.js', 'index.html', 'css/tailwind.css'];
const untouchedDiffs = untouched.map(file => ({ file, diff: diffAgainstBase(file) }));
const touchedProduction = untouchedDiffs.filter(item => item.diff === null || item.diff !== '').map(item => item.file);
record(
  'PASSPORT_UNCHANGED',
  'Passport/homepage/CSS production files are not part of this branch',
  touchedProduction.length === 0 ? 'PASS' : 'FAIL',
  touchedProduction.length ? `changed: ${touchedProduction.join(', ')}` : 'no diff'
);

const serialDiff = diffAgainstBase('src/serial src/decoder src/SerialDecoder.js');
record(
  'SERIAL_UNCHANGED',
  'Serial number decoder code is unchanged',
  serialDiff === null ? 'ERROR' : (serialDiff === '' ? 'PASS' : 'FAIL'),
  serialDiff === null ? `base ref unavailable (${BASE_REF})` : (serialDiff || `identical to ${BASE_REF}`)
);

const { generateSitemapXml } = await import('../src/components/SitemapGenerator.js');
const sitemap = generateSitemapXml('https://www.stihldecoder.nl', database);
const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
const committedSitemap = fs.existsSync(path.join(root, 'sitemap.xml'))
  ? (fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length
  : null;
record(
  'SEO_SITEMAP',
  'Generated sitemap keeps the canonical 1,024 URL surface (and matches the committed file when present)',
  sitemapUrls === 1024 && (committedSitemap === null || sitemapUrls === committedSitemap) ? 'PASS' : 'FAIL',
  `generated=${sitemapUrls}, committed=${committedSitemap ?? 'not present'}`
);

const researchOnlyPatterns = [/^output\/phase77[a-z]\//, /^scripts\/phase77[a-z]_/, /^reports\/phase77[a-z]_/];
const statusOut = git('git status --porcelain') ?? '';
const changed = statusOut.split('\n').map(l => l.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim()).filter(Boolean);
const committedDiff = git(`git diff --name-only ${BASE_REF || 'HEAD'}...HEAD`) ?? '';
const changedAll = [...new Set([...changed, ...committedDiff.split('\n').filter(Boolean)])];
const outsideResearch = changedAll.filter(file => !researchOnlyPatterns.some(pattern => pattern.test(file)));
record(
  'BRANCH_SCOPE',
  'Branch only contains research files (working tree + committed diff vs base)',
  BASE_REF && outsideResearch.length === 0 ? 'PASS' : 'FAIL',
  outsideResearch.length ? `outside scope: ${outsideResearch.join(', ')}` : `${changedAll.length} research files vs ${BASE_REF}`
);

const failed = checks.filter(c => c.status !== 'PASS');
const payload = {
  schema_version: '1.0.0',
  phase: '77C',
  generated_at_utc: new Date().toISOString(),
  read_only: true,
  result: failed.length === 0 ? 'PASS' : 'FAIL',
  checks
};
fs.writeFileSync(path.join(outDir, outFileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(payload, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
