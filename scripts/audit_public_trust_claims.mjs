import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderIntentPageHtml } from '../src/components/IntentPageTemplate.js';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';

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
  'politiecertificering'
];

console.log('🔍 RUNNING PUBLIC TRUST CLAIMS AUDIT...');

const databasePath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

let violations = [];

function checkContent(sourceName, content) {
  for (const claim of FORBIDDEN_CLAIMS) {
    const regex = new RegExp(`\\b${claim}\\b`, 'i');
    if (regex.test(content)) {
      violations.push({ source: sourceName, claim });
    }
  }
}

// 1. Audit static index.html
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
checkContent('index.html', indexHtml);

// 2. Audit SSR Model pages (sample varied models)
const sampleSlugs = ['ms-261-c-m', 'ms-170', 'fsa-45', 'msa-60-c-b', 'fs-350'];
for (const slug of sampleSlugs) {
  const model = database.models.find(m => (m.slug || m.id) === slug || m.model_name.toLowerCase().replace(/[\s\/]/g, '-') === slug);
  if (model) {
    const html = renderModelPageHtml(model, database, baseUrl);
    checkContent(`ModelPage:${model.model_name}`, html);

    const partsHtml = renderModelPartsPageHtml(model, database, baseUrl);
    checkContent(`ModelPartsPage:${model.model_name}`, partsHtml);
  }
}

// 3. Audit Categories
const sampleCategories = ['kettingzagen', 'bosmaaiers'];
for (const cat of sampleCategories) {
  const html = renderCategoryPageHtml(cat, database, baseUrl);
  checkContent(`CategoryPage:${cat}`, html);
}

// 4. Audit Published Guides
const serialGuide = database.guides.find(g => g.slug === 'serienummer-locaties');
if (serialGuide) {
  const html = renderGuidePageHtml(serialGuide, database, baseUrl);
  checkContent('GuidePage:serienummer-locaties', html);
}

// 5. Audit Published Intent Pages
const passportIntent = database.intent_pages.find(i => i.slug === 'stihl-paspoort');
if (passportIntent) {
  const html = renderIntentPageHtml(passportIntent, database, baseUrl);
  checkContent('IntentPage:stihl-paspoort', html);
}

// 6. Audit Comparison Page
const compHtml = renderComparisonPageHtml('ms-170-vs-ms-180', database, baseUrl);
checkContent('ComparisonPage:ms-170-vs-ms-180', compHtml);

if (violations.length > 0) {
  console.error(`❌ Public trust claim audit failed! Found ${violations.length} violations:`);
  for (const v of violations) {
    console.error(`  - In ${v.source}: matches forbidden claim "${v.claim}"`);
  }
  process.exit(1);
} else {
  console.log('✅ 0 forbidden trust claims found in all public SSR and static templates.');
  console.log('🎉 PUBLIC TRUST AUDIT PASSED!');
}
