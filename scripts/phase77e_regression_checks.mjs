/**
 * Phase 77E — Regression checks after the fast-track activation.
 * Read-only: verifies caps, tags, resolver behaviour, buy buttons and untouched
 * production files. Exits non-zero when a check fails.
 *
 * Usage: node scripts/phase77e_regression_checks.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77e');
fs.mkdirSync(outDir, { recursive: true });

if (process.env.AMAZON_AFFILIATE_ENABLED === undefined) process.env.AMAZON_AFFILIATE_ENABLED = 'true';
if (process.env.AMAZON_ASSOCIATE_TAG_NL === undefined) process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
if (process.env.AMAZON_ASSOCIATE_TAG_DE === undefined) process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';

const { defaultVerifiedOfferRegistry } = await import('../src/affiliate/VerifiedOfferRegistry.js');
const { resolvePurchaseOffer } = await import('../src/search/IntelligentPartsSearchEngine.js');
const { renderPartDetailPageHtml } = await import('../src/components/PartDetailPageTemplate.js');
const { generateSitemapXml } = await import('../src/components/SitemapGenerator.js');

const checks = [];
const record = (id, description, status, detail) => checks.push({ id, description, status, detail });
const git = (command) => {
  try { return execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
};
const diffAgainstBase = (file) => git(`git diff --name-only main -- ${file}`);

const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8'));
const active = registry.offers.filter(o => o.status === 'ACTIVE');
const activeNl = active.filter(o => o.marketplace === 'amazon.nl');
const activeDe = active.filter(o => o.marketplace === 'amazon.de');
const nlCap = registry.policy?.max_active_offers_per_marketplace?.['amazon.nl'];
const deCap = registry.policy?.max_active_offers_per_marketplace?.['amazon.de'];
const totalCap = registry.policy?.max_active_offers_allowed;

record(
  'ACTIVE_WITHIN_CAPS',
  'ACTIVE offers stay within the 100 total and per-marketplace caps',
  active.length <= totalCap && activeNl.length <= nlCap && activeDe.length <= deCap && totalCap <= 100 ? 'PASS' : 'FAIL',
  `total=${active.length}/${totalCap}, NL=${activeNl.length}/${nlCap}, DE=${activeDe.length}/${deCap}`
);

const tagViolations = active.filter(o => (o.marketplace === 'amazon.de' ? o.affiliate_tag !== 'srihldecode00-21' : o.affiliate_tag !== 'srihldecoder2-21'));
record(
  'MARKETPLACE_TAGS',
  'Every ACTIVE offer carries the tag of its own marketplace',
  tagViolations.length === 0 ? 'PASS' : 'FAIL',
  tagViolations.length ? tagViolations.map(o => `${o.part_number}:${o.affiliate_tag}`).join(', ') : 'all tags correct'
);

const registryDiff = git('git diff --name-only main -- data/affiliate/verified_amazon_registry.json');
record(
  'REGISTRY_UNCHANGED',
  'The offer registry is unchanged: Phase 77E refused to promote unproven candidates',
  registryDiff === '' ? 'PASS' : (registryDiff === null ? 'ERROR' : 'FAIL'),
  registryDiff === null ? 'base ref unavailable' : (registryDiff || 'identical to main')
);

defaultVerifiedOfferRegistry.productionActivationAllowed = true;
defaultVerifiedOfferRegistry.activeWhitelist = null;
const direct = resolvePurchaseOffer('00004007000', 'Spark plug');
const fallback = resolvePurchaseOffer('11281903400', 'Starter grip');
record(
  'RESOLVER',
  'A verified ACTIVE part resolves to a direct NL link; an unverified part falls back to search',
  direct.type === 'DIRECT_ASIN' && direct.url.includes('tag=srihldecoder2-21') && fallback.type === 'SEARCH_FALLBACK' ? 'PASS' : 'FAIL',
  `direct=${direct.type}/${direct.marketplace}, fallback=${fallback.type}`
);

const database = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stihl_database.json'), 'utf8'));
const partPage = renderPartDetailPageHtml('00004007000', database, 'https://www.stihldecoder.nl');
record(
  'PART_PAGE_BUY_BUTTON',
  'An ACTIVE offer still renders a direct buy button on its part page',
  partPage.includes('data-offer-type="MANUAL_ASIN"') ? 'PASS' : 'FAIL',
  `direct marker=${partPage.includes('data-offer-type="MANUAL_ASIN"')}`
);

const untouched = ['src/components/StihlPassportGenerator.js', 'src/SerialDecoder.js', 'src/affiliate/TwoGateVerifier.js', 'src/affiliate/VerifiedOfferRegistry.js', 'index.html'];
const changedProduction = untouched.filter(file => {
  const diff = diffAgainstBase(file);
  return diff === null || diff !== '';
});
record(
  'PRODUCTION_CODE_UNCHANGED',
  'Passport, decoder, affiliate engine and homepage are untouched',
  changedProduction.length === 0 ? 'PASS' : 'FAIL',
  changedProduction.length ? `changed: ${changedProduction.join(', ')}` : 'no diff vs main'
);

const sitemap = generateSitemapXml('https://www.stihldecoder.nl', database);
const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
record(
  'SEO_SITEMAP',
  'Sitemap keeps the canonical 1,024 URLs',
  sitemapUrls === 1024 ? 'PASS' : 'FAIL',
  `generated=${sitemapUrls}`
);

const policyUnchanged = registry.policy.max_active_offers_allowed === 100 &&
  registry.policy.max_active_offers_per_marketplace?.['amazon.nl'] === 100 &&
  registry.policy.max_active_offers_per_marketplace?.['amazon.de'] === 50;
record(
  'POLICY_UNCHANGED',
  'Registry caps and marketplace limits are unchanged',
  policyUnchanged ? 'PASS' : 'FAIL',
  `total=${totalCap}, NL=${nlCap}, DE=${deCap}; registry=${registryDiff || 'identical to main'}`
);

const allowedPatterns = [/^output\/phase77e\//, /^scripts\/phase77e_/, /^data\/affiliate\/verified_amazon_registry\.json$/];
const statusOut = git('git status --porcelain') ?? '';
const working = statusOut.split('\n').map(l => l.replace(/^[ MADRCU?!]{1,2}\s+/, '').trim()).filter(Boolean);
const committed = (git('git diff --name-only main...HEAD') ?? '').split('\n').filter(Boolean);
const changedAll = [...new Set([...working, ...committed])];
const outside = changedAll.filter(file => !allowedPatterns.some(pattern => pattern.test(file)));
record(
  'BRANCH_SCOPE',
  'Only the registry offer set and Phase 77E research artifacts changed',
  outside.length === 0 ? 'PASS' : 'FAIL',
  outside.length ? `outside scope: ${outside.join(', ')}` : `${changedAll.length} allowed files`
);

const failed = checks.filter(c => c.status !== 'PASS');
const payload = {
  schema_version: '1.0.0',
  phase: '77E',
  generated_at_utc: new Date().toISOString(),
  result: failed.length === 0 ? 'PASS' : 'FAIL',
  checks
};
fs.writeFileSync(path.join(outDir, 'PHASE77E_REGRESSION_CHECKS.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(payload, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
