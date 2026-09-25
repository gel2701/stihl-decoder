import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderIntentPageHtml } from '../src/components/IntentPageTemplate.js';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import {
  KNOWN_PUBLIC_CATEGORIES,
  COMPARISON_REGISTRY,
  GUIDE_PUBLICATION_STATUS,
  INTENT_PUBLICATION_STATUS,
  isPetrolModel,
  isBatteryModel,
  getSafeCategorySlug
} from '../src/publicationRules.js';
import { renderPartNumberHubHtml, renderPartNumberSeriesHtml } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
  'Geverifieerde STIHL Machinegidsen'
];

const HOLD_GUIDE_SLUGS = Object.entries(GUIDE_PUBLICATION_STATUS)
  .filter(([_, status]) => status === 'HOLD')
  .map(([slug]) => slug);

const HOLD_INTENT_SLUGS = Object.entries(INTENT_PUBLICATION_STATUS)
  .filter(([_, status]) => status === 'HOLD')
  .map(([slug]) => slug);

const databasePath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🔍 RUNNING COMPREHENSIVE FULL-ROUTE PUBLIC TRUST AUDIT...');
console.log('===============================================================\n');

let totalPagesAudited = 0;
let unsupportedClaimsCount = 0;
let brokenCtasCount = 0;
let brokenFormsCount = 0;
let holdLinkLeaksCount = 0;
let driveContextErrorsCount = 0;

const violations = [];

function auditPage(pageName, html, context = {}) {
  totalPagesAudited++;

  // 1. Unsupported / Forbidden claims
  for (const claim of FORBIDDEN_CLAIMS) {
    const regex = new RegExp(`\\b${claim}\\b`, 'i');
    if (regex.test(html)) {
      unsupportedClaimsCount++;
      violations.push({ page: pageName, type: 'UNSUPPORTED_CLAIM', detail: claim });
    }
  }

  // 2. Broken CTAs
  const emptyHrefMatches = html.match(/href=["'](#|"|')/gi) || [];
  for (const match of emptyHrefMatches) {
    if (match.toLowerCase() === 'href="#"') {
      brokenCtasCount++;
      violations.push({ page: pageName, type: 'BROKEN_CTA', detail: 'Empty hash href="#"' });
    }
  }

  // 3. Broken Forms & Dead Lead MVPs
  if (html.includes('action="/" method="GET"')) {
    brokenFormsCount++;
    violations.push({ page: pageName, type: 'BROKEN_FORM', detail: 'action="/" method="GET"' });
  }
  if (html.includes('passport-pro-mvp') || html.includes('lead-mvp')) {
    brokenFormsCount++;
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
}

// 1. Audit static index.html
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
auditPage('Homepage (index.html)', indexHtml);

// 2. Audit All Public Categories
for (const catSlug of KNOWN_PUBLIC_CATEGORIES) {
  const catHtml = renderCategoryPageHtml(catSlug, database, baseUrl);
  auditPage(`Category: /${catSlug}/`, catHtml);
}

// 3. Audit All Models & All Parts Pages
for (const model of database.models) {
  const modelName = model.model_name || model.slug;
  const modelHtml = renderModelPageHtml(model, database, baseUrl);
  auditPage(`Model: ${modelName}`, modelHtml);

  const partsHtml = renderModelPartsPageHtml(model, database, baseUrl);
  auditPage(`ModelParts: ${modelName}`, partsHtml, { isPartsPage: true, model });
}

// 4. Audit All Comparisons
for (const comp of COMPARISON_REGISTRY) {
  const compHtml = renderComparisonPageHtml(comp.slug, database, baseUrl);
  auditPage(`Comparison: /vergelijk/${comp.slug}/`, compHtml);
}

// 5. Audit Published Guides
const publishedGuides = (database.guides || []).filter(g => GUIDE_PUBLICATION_STATUS[g.slug] === 'PUBLISHED');
for (const guide of publishedGuides) {
  const guideHtml = renderGuidePageHtml(guide, database, baseUrl);
  auditPage(`Guide: /gidsen/${guide.slug}/`, guideHtml);
}

// 6. Audit Published Intent Pages
const publishedIntents = (database.intent_pages || []).filter(i => INTENT_PUBLICATION_STATUS[i.slug] === 'PUBLISHED');
for (const intent of publishedIntents) {
  const intentHtml = renderIntentPageHtml(intent, database, baseUrl);
  auditPage(`Intent: /${intent.slug}/`, intentHtml);
}

// 7. Audit Part Number Hub & Series Routes
const partHubHtml = renderPartNumberHubHtml(database, baseUrl);
auditPage('PartNumberHub: /onderdeelnummer/', partHubHtml);

const sampleSeries = ['1121', '1130', '1141'];
for (const s of sampleSeries) {
  const seriesHtml = renderPartNumberSeriesHtml(s, database, baseUrl);
  auditPage(`PartNumberSeries: /onderdeelnummer/stihl-${s}/`, seriesHtml);
}

console.log('===============================================================');
console.log('📊 PUBLIC TRUST AUDIT METRICS');
console.log('===============================================================');
console.log(`TOTAL_PAGES_AUDITED: ${totalPagesAudited}`);
console.log(`UNSUPPORTED_CLAIMS: ${unsupportedClaimsCount}`);
console.log(`BROKEN_CTAS: ${brokenCtasCount}`);
console.log(`BROKEN_FORMS: ${brokenFormsCount}`);
console.log(`HOLD_LINK_LEAKS: ${holdLinkLeaksCount}`);
console.log(`DRIVE_CONTEXT_ERRORS: ${driveContextErrorsCount}`);
console.log('===============================================================');

if (violations.length > 0) {
  console.error(`\n❌ Public trust claims audit FAILED with ${violations.length} total violations:`);
  for (const v of violations.slice(0, 20)) {
    console.error(`  - [${v.type}] on ${v.page}: ${v.detail}`);
  }
  if (violations.length > 20) {
    console.error(`  ... and ${violations.length - 20} more violations.`);
  }
  process.exit(1);
} else {
  console.log('\n🎉 ALL PUBLIC ROUTES 100% CLEAN AND COMPLIANT WITH USER TRUST MANDATE!');
  process.exit(0);
}
