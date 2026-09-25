import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderIntentPageHtml } from '../src/components/IntentPageTemplate.js';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import {
  getPublishedCategories,
  CATEGORY_REGISTRY,
  COMPARISON_REGISTRY,
  GUIDE_ROUTE_CONFIG,
  INTENT_ROUTE_CONFIG,
  getGuidePublicationStatus,
  getIntentPublicationStatus,
  getCanonicalPartSeriesCodes,
  isPetrolModel,
  isBatteryModel,
  getSafeCategorySlug
} from '../src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3105;
process.env.PORT = String(PORT);
const { server, renderPartNumberHubHtml, renderPartNumberSeriesHtml } = await import('../server.js');

// Allow server 400ms to initialize
await new Promise((r) => setTimeout(r, 400));
const activePort = server.address()?.port || PORT;

const FORBIDDEN_CLAIMS = [
  'Premium',
  '€4.99',
  '€4,99',
  'Directe download',
  'binnen 24 uur',
  'Ontvang Bod',
  'Inkoopaanbod',
  'Verkooprapport',
  'Aanvraag Ontvangen',
  'politiecertificering',
  'officieel serienummer bestaat uit exact 9 cijfers',
  'Geverifieerde STIHL Machinegidsen',
  'geregistreerde fabriek van herkomst',
  'Het ingeslagen nummer in het metalen carter is altijd leidend'
];

const HOLD_GUIDE_SLUGS = Object.entries(GUIDE_ROUTE_CONFIG)
  .filter(([_, conf]) => conf.status === 'HOLD')
  .map(([slug]) => slug);

const HOLD_INTENT_SLUGS = Object.entries(INTENT_ROUTE_CONFIG)
  .filter(([_, conf]) => conf.status === 'HOLD')
  .map(([slug]) => slug);

const databasePath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🔍 RUNNING COMPREHENSIVE END-TO-END PUBLIC ROUTE & CLAIM AUDIT');
console.log('===============================================================\n');

let totalPublicPagesRendered = 0;
let totalInternalLinks = 0;
let totalFragmentLinks = 0;
let totalPartSeriesRoutesAudited = 0;
let http200Destinations = 0;
let validRedirectsCount = 0;
let brokenInternalLinksCount = 0;
let brokenFragmentTargetsCount = 0;
let semanticCtaMismatchesCount = 0;
let unsupportedClaimsCount = 0;
let driveContextErrorsCount = 0;
let holdLinkLeaksCount = 0;

const violations = [];
const renderedPagesHtml = new Map();
const internalDestinationsSet = new Set();
const fragmentLinksToCheck = [];
const ctasToCheck = [];

function auditPageContent(pageName, pagePath, html, context = {}) {
  totalPublicPagesRendered++;
  renderedPagesHtml.set(pagePath, html);

  // 1. Unsupported / Forbidden claims
  for (const claim of FORBIDDEN_CLAIMS) {
    const regex = new RegExp(`\\b${claim.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i');
    if (regex.test(html)) {
      unsupportedClaimsCount++;
      violations.push({ page: pageName, type: 'UNSUPPORTED_CLAIM', detail: claim });
    }
  }

  // 2. Empty or dead CTAs
  const emptyHrefMatches = html.match(/href=["'](#|"|')/gi) || [];
  for (const match of emptyHrefMatches) {
    if (match.toLowerCase() === 'href="#"') {
      brokenInternalLinksCount++;
      violations.push({ page: pageName, type: 'BROKEN_INTERNAL_LINK', detail: 'Empty hash href="#"' });
    }
  }

  // 3. Broken Forms & Dead Lead MVPs
  if (html.includes('action="/" method="GET"')) {
    brokenInternalLinksCount++;
    violations.push({ page: pageName, type: 'BROKEN_FORM', detail: 'action="/" method="GET"' });
  }
  if (html.includes('passport-pro-mvp') || html.includes('lead-mvp')) {
    brokenInternalLinksCount++;
    violations.push({ page: pageName, type: 'BROKEN_FORM', detail: 'Contains decommissioned MVP form markup' });
  }

  // 4. HOLD Link Leaks
  for (const holdSlug of HOLD_GUIDE_SLUGS) {
    const pattern = new RegExp(`href=["']\\/gidsen\\/${holdSlug}\\/?["']`, 'i');
    if (pattern.test(html)) {
      holdLinkLeaksCount++;
      violations.push({ page: pageName, type: 'HOLD_LINK_LEAK', detail: `/gidsen/${holdSlug}/` });
    }
  }
  for (const holdSlug of HOLD_INTENT_SLUGS) {
    const pattern = new RegExp(`href=["']\\/${holdSlug}\\/?["']`, 'i');
    if (pattern.test(html)) {
      holdLinkLeaksCount++;
      violations.push({ page: pageName, type: 'HOLD_LINK_LEAK', detail: `/${holdSlug}/` });
    }
  }

  // 5. Drive Context Errors (Parts pages)
  if (context.isPartsPage && context.model) {
    const model = context.model;
    const isBattery = isBatteryModel(model);
    const categorySlug = getSafeCategorySlug(model);
    const isChainsaw = categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen';
    const isTrimmer = categorySlug === 'bosmaaiers' || (model.basic_classification && model.basic_classification.equipment_type === 'TRIMMER');

    if (isBattery) {
      const petrolTerms = ['Bougie', 'Carburateur', 'Membraan', 'Brandstoffilter', '2-takt', 'M-Tronic'];
      for (const term of petrolTerms) {
        if (html.includes(term)) {
          driveContextErrorsCount++;
          violations.push({ page: pageName, type: 'DRIVE_CONTEXT_ERROR', detail: `Battery model contains petrol term "${term}"` });
        }
      }
    }

    if (isTrimmer) {
      const chainsawTerms = ['Zaagketting', 'Zaagblad'];
      for (const term of chainsawTerms) {
        if (html.includes(term)) {
          driveContextErrorsCount++;
          violations.push({ page: pageName, type: 'DRIVE_CONTEXT_ERROR', detail: `Trimmer contains chainsaw term "${term}"` });
        }
      }
    }

    if (isChainsaw) {
      const trimmerTerms = ['PolyCut'];
      for (const term of trimmerTerms) {
        if (html.includes(term)) {
          driveContextErrorsCount++;
          violations.push({ page: pageName, type: 'DRIVE_CONTEXT_ERROR', detail: `Chainsaw contains trimmer term "${term}"` });
        }
      }
    }
  }

  // 6. Extract all <a href> tags for graph & fragment resolution
  const anchorRegex = /<a\s+[^>]*?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const anchorText = match[2].replace(/<[^>]*>/g, '').trim();

    if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:') || rawHref.startsWith('tel:') || rawHref.startsWith('mailto:')) {
      continue;
    }

    let urlPath = rawHref;
    if (urlPath.startsWith(baseUrl)) {
      urlPath = urlPath.slice(baseUrl.length);
    } else if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
      // External link - skip HTTP check
      continue;
    }

    if (!urlPath.startsWith('/') && !urlPath.startsWith('#')) {
      continue;
    }

    totalInternalLinks++;

    let targetPath = '';
    let targetFrag = null;

    if (urlPath.startsWith('#')) {
      targetPath = pagePath;
      targetFrag = urlPath.slice(1);
    } else {
      const hashIndex = urlPath.indexOf('#');
      if (hashIndex !== -1) {
        targetPath = urlPath.slice(0, hashIndex) || '/';
        targetFrag = urlPath.slice(hashIndex + 1);
      } else {
        targetPath = urlPath;
      }
    }

    if (!targetPath.startsWith('/')) {
      targetPath = `/${targetPath}`;
    }

    internalDestinationsSet.add(targetPath);

    if (targetFrag) {
      totalFragmentLinks++;
      fragmentLinksToCheck.push({
        sourcePage: pageName,
        targetPath,
        targetFrag
      });
    }

    // Semantic CTA check
    ctasToCheck.push({
      sourcePage: pageName,
      targetPath,
      anchorText,
      rawHref
    });
  }
}

// ==============================================================
// STEP 1: RENDER ALL PUBLIC PAGES
// ==============================================================

// 1. Homepage
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
auditPageContent('Homepage (index.html)', '/', indexHtml);

// 2. Published Categories
const publishedCategories = getPublishedCategories();
for (const catSlug of publishedCategories) {
  const catHtml = renderCategoryPageHtml(catSlug, database, baseUrl);
  auditPageContent(`Category: /${catSlug}/`, `/${catSlug}/`, catHtml);
}

// 3. All Models & All Parts Pages
for (const model of database.models) {
  const modelName = model.model_name || model.slug;
  const categorySlug = getSafeCategorySlug(model);
  const modelSlug = model.slug || model.id?.replace(/_/g, '-');
  const modelPath = categorySlug && modelSlug ? `/${categorySlug}/${modelSlug}/` : null;
  const partsPath = modelPath ? `${modelPath}onderdelen/` : null;

  if (modelPath) {
    const modelHtml = renderModelPageHtml(model, database, baseUrl);
    auditPageContent(`Model: ${modelName}`, modelPath, modelHtml);
  }

  if (partsPath) {
    const partsHtml = renderModelPartsPageHtml(model, database, baseUrl);
    auditPageContent(`ModelParts: ${modelName}`, partsPath, partsHtml, { isPartsPage: true, model });
  }
}

// 4. All Comparisons
for (const comp of COMPARISON_REGISTRY) {
  const compHtml = renderComparisonPageHtml(comp.slug, database, baseUrl);
  auditPageContent(`Comparison: /vergelijk/${comp.slug}/`, `/vergelijk/${comp.slug}/`, compHtml);
}

// 5. Published Guides
const publishedGuides = (database.guides || []).filter(g => getGuidePublicationStatus(g.slug) === 'PUBLISHED');
for (const guide of publishedGuides) {
  const guideHtml = renderGuidePageHtml(guide, database, baseUrl);
  auditPageContent(`Guide: /gidsen/${guide.slug}/`, `/gidsen/${guide.slug}/`, guideHtml);
}

// 6. Published Intent Pages
const publishedIntents = (database.intent_pages || []).filter(i => getIntentPublicationStatus(i.slug) === 'PUBLISHED');
for (const intent of publishedIntents) {
  const intentHtml = renderIntentPageHtml(intent, database, baseUrl);
  auditPageContent(`Intent: /${intent.slug}/`, `/${intent.slug}/`, intentHtml);
}

// 7. Part Number Hub & Canonical Series Pages
const partHubHtml = renderPartNumberHubHtml(database, baseUrl);
auditPageContent('PartNumberHub: /onderdeelnummer/', '/onderdeelnummer/', partHubHtml);

const canonicalSeriesCodes = getCanonicalPartSeriesCodes(database);
for (const s of canonicalSeriesCodes) {
  totalPartSeriesRoutesAudited++;
  const seriesPath = `/onderdeelnummer/stihl-${s}/`;
  const seriesHtml = renderPartNumberSeriesHtml(s, database, baseUrl);
  auditPageContent(`PartNumberSeries: ${seriesPath}`, seriesPath, seriesHtml);

  // Validate that only models with series_code === s are displayed
  const expectedModels = (database.models || []).filter(m => m.series_code === s);
  for (const expModel of expectedModels) {
    if (!seriesHtml.includes(expModel.model_name)) {
      violations.push({
        page: seriesPath,
        type: 'PART_SERIES_MODEL_MISSING',
        detail: `Expected model STIHL ${expModel.model_name} missing from series ${s} page`
      });
    }
  }
}

// ==============================================================
// STEP 2: TEST ALL INTERNAL DESTINATIONS VIA REAL HTTP REQUESTS
// ==============================================================

function fetchHttp(urlPath) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: 'localhost',
      port: activePort,
      path: urlPath
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', (err) => resolve({ statusCode: 500, error: err.message, headers: {}, body: '' }));
  });
}

const httpCache = new Map();

for (const destPath of internalDestinationsSet) {
  const res = await fetchHttp(destPath);
  httpCache.set(destPath, res);

  if (res.statusCode === 200) {
    http200Destinations++;
  } else if (res.statusCode === 301 || res.statusCode === 302) {
    const loc = res.headers.location || '';
    if (loc) {
      validRedirectsCount++;
    } else {
      brokenInternalLinksCount++;
      violations.push({ page: 'HTTP_AUDIT', type: 'BROKEN_REDIRECT', detail: `${destPath} redirected with no Location header` });
    }
  } else if (res.statusCode === 404) {
    brokenInternalLinksCount++;
    violations.push({ page: 'HTTP_AUDIT', type: 'BROKEN_INTERNAL_LINK', detail: `${destPath} returned 404 Not Found` });
  } else if (res.statusCode === 410) {
    brokenInternalLinksCount++;
    violations.push({ page: 'HTTP_AUDIT', type: 'BROKEN_INTERNAL_LINK', detail: `${destPath} returned 410 Gone (decommissioned endpoint)` });
  } else {
    brokenInternalLinksCount++;
    violations.push({ page: 'HTTP_AUDIT', type: 'BROKEN_INTERNAL_LINK', detail: `${destPath} returned status ${res.statusCode}` });
  }
}

// ==============================================================
// STEP 3: FRAGMENT TARGET INTEGRITY
// ==============================================================

for (const fragCheck of fragmentLinksToCheck) {
  // If targetFrag is client-side router hash parameter (e.g. add=ms-170 on /stihl-paspoort/)
  if (fragCheck.targetFrag.startsWith('add=')) {
    if (fragCheck.targetPath.includes('paspoort')) {
      continue;
    }
  }

  let targetHtml = renderedPagesHtml.get(fragCheck.targetPath);
  if (!targetHtml && httpCache.has(fragCheck.targetPath)) {
    targetHtml = httpCache.get(fragCheck.targetPath).body;
  }

  if (!targetHtml) {
    brokenFragmentTargetsCount++;
    violations.push({
      page: fragCheck.sourcePage,
      type: 'BROKEN_FRAGMENT_TARGET',
      detail: `Target page ${fragCheck.targetPath} not found for #${fragCheck.targetFrag}`
    });
    continue;
  }

  const idRegex = new RegExp(`id=["']${fragCheck.targetFrag}["']`, 'i');
  const nameRegex = new RegExp(`name=["']${fragCheck.targetFrag}["']`, 'i');

  if (!idRegex.test(targetHtml) && !nameRegex.test(targetHtml)) {
    brokenFragmentTargetsCount++;
    violations.push({
      page: fragCheck.sourcePage,
      type: 'BROKEN_FRAGMENT_TARGET',
      detail: `Anchor #${fragCheck.targetFrag} does not exist on destination ${fragCheck.targetPath}`
    });
  }
}

// ==============================================================
// STEP 4: SEMANTIC CTA CHECKS
// ==============================================================

for (const cta of ctasToCheck) {
  const textLower = cta.anchorText.toLowerCase();

  // Exclude brand navigation header links to "/"
  if (cta.rawHref === '/' && textLower.includes('stihl decoder')) {
    continue;
  }

  // 1. "Serienummer controleren" / "Decoder" -> destination must have decoder
  if (textLower.includes('serienummer controleren') || (textLower.includes('decoder') && !textLower.includes('alle') && !textLower.includes('gids') && !textLower.includes('kennisbank'))) {
    let destHtml = renderedPagesHtml.get(cta.targetPath);
    if (!destHtml && httpCache.has(cta.targetPath)) {
      destHtml = httpCache.get(cta.targetPath).body;
    }
    const hasDecoder = Boolean(
      (destHtml && (destHtml.includes('id="decoder"') || destHtml.includes('decode') || destHtml.includes('Decoder'))) ||
      cta.rawHref.includes('#decoder')
    );
    if (!hasDecoder) {
      semanticCtaMismatchesCount++;
      violations.push({
        page: cta.sourcePage,
        type: 'SEMANTIC_CTA_MISMATCH',
        detail: `CTA "${cta.anchorText}" points to ${cta.rawHref} which lacks decoder functionality`
      });
    }
  }

  // 2. "Bekijk onderdelen" -> destination must have parts content
  if (textLower.includes('bekijk onderdelen')) {
    const isPartsDest = cta.targetPath.includes('onderdelen') || cta.targetPath.includes('onderdeelnummer');
    if (!isPartsDest) {
      semanticCtaMismatchesCount++;
      violations.push({
        page: cta.sourcePage,
        type: 'SEMANTIC_CTA_MISMATCH',
        detail: `CTA "${cta.anchorText}" points to ${cta.rawHref} which is not a parts destination`
      });
    }
  }

  // 3. "Machinepaspoort" -> destination must contain passport content
  if (textLower.includes('machinepaspoort') && !textLower.includes('overzicht')) {
    const isPassportDest = cta.targetPath.includes('paspoort');
    if (!isPassportDest) {
      semanticCtaMismatchesCount++;
      violations.push({
        page: cta.sourcePage,
        type: 'SEMANTIC_CTA_MISMATCH',
        detail: `CTA "${cta.anchorText}" points to ${cta.rawHref} which is not a passport destination`
      });
    }
  }
}

// Close server
await new Promise((resolve) => server.close(resolve));

// ==============================================================
// STEP 5: OUTPUT METRICS TABLE
// ==============================================================

const totalUniqueInternalDestinations = internalDestinationsSet.size;

console.log('===============================================================');
console.log('📊 PUBLIC TRUST & ROUTE AUDIT METRICS');
console.log('===============================================================');
console.log(`TOTAL_PUBLIC_PAGES_RENDERED: ${totalPublicPagesRendered}`);
console.log(`TOTAL_INTERNAL_LINKS: ${totalInternalLinks}`);
console.log(`TOTAL_UNIQUE_INTERNAL_DESTINATIONS: ${totalUniqueInternalDestinations}`);
console.log(`TOTAL_FRAGMENT_LINKS: ${totalFragmentLinks}`);
console.log(`TOTAL_PART_SERIES_ROUTES_AUDITED: ${totalPartSeriesRoutesAudited}`);
console.log(`HTTP_200_DESTINATIONS: ${http200Destinations}`);
console.log(`VALID_REDIRECTS: ${validRedirectsCount}`);
console.log(`BROKEN_INTERNAL_LINKS: ${brokenInternalLinksCount}`);
console.log(`BROKEN_FRAGMENT_TARGETS: ${brokenFragmentTargetsCount}`);
console.log(`SEMANTIC_CTA_MISMATCHES: ${semanticCtaMismatchesCount}`);
console.log(`UNSUPPORTED_CLAIMS: ${unsupportedClaimsCount}`);
console.log(`DRIVE_CONTEXT_ERRORS: ${driveContextErrorsCount}`);
console.log(`HOLD_LINK_LEAKS: ${holdLinkLeaksCount}`);
console.log('===============================================================');

const hasFailures = (
  brokenInternalLinksCount > 0 ||
  brokenFragmentTargetsCount > 0 ||
  semanticCtaMismatchesCount > 0 ||
  unsupportedClaimsCount > 0 ||
  driveContextErrorsCount > 0 ||
  holdLinkLeaksCount > 0
);

if (hasFailures || violations.length > 0) {
  console.error(`\n❌ Public trust & route audit FAILED with ${violations.length} total violations:`);
  for (const v of violations.slice(0, 30)) {
    console.error(`  - [${v.type}] on ${v.page}: ${v.detail}`);
  }
  if (violations.length > 30) {
    console.error(`  ... and ${violations.length - 30} more violations.`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 ALL PUBLIC ROUTES, FRAGMENTS, CTAS & TECHNICAL CLAIMS 100% CLEAN AND VERIFIED!');
  process.exit(0);
}
