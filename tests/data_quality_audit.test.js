import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Starting Phase 27 Data Quality, Content Authority & Programmatic SEO Audit...\n');

const liveModels = [
  'ms-170', 'ms-180', 'ms-200', 'ms-210', 'ms-230', 'ms-250', 'ms-260', 'ms-261',
  'ms-270', 'ms-280', 'ms-290', 'ms-310', 'ms-311', 'ms-340', 'ms-341', 'ms-360',
  'ms-361', 'ms-362', 'ms-390', 'ms-400', 'ms-441', 'ms-460', 'fs-350'
];

const auditResults = [];
let totalContentQuality = 0;
let totalTechnicalSeo = 0;

const renderedHtmlMap = new Map();

for (const modelSlug of liveModels) {
  const model = database.models.find(m => m.slug === modelSlug || m.id.replace(/_/g, '-') === modelSlug);
  if (!model) {
    console.error(`❌ Model ${modelSlug} not found in database!`);
    continue;
  }

  const html = renderModelPageHtml(model, database);
  renderedHtmlMap.set(modelSlug, html);

  // 1. Data Quality Checks
  const hasCc = model.displacement_cc != null;
  const hasPower = model.power_hp != null || model.power_kw != null;
  const hasWeight = model.weight_kg != null;
  const hasSpark = model.spark_plug != null;
  const hasChain = model.chain_pitch != null || model.category_slug !== 'kettingzagen';
  const hasSource = model.data_source != null;
  const hasConfidence = model.data_confidence != null && model.production_confidence != null;

  // 2. Strict Wording Checks
  const hasExactClaim = html.includes('Exact bouwjaar') || html.includes('Exacte productiedatum') || html.includes('Exact productiejaar');
  const hasEstimatedPeriod = html.includes('Geschatte productieperiode');
  const hasEeatDisclaimer = html.includes('E-E-A-T / Transparantie Disclaimer') || html.includes('werkplaatshandboeken');

  // 3. Technical SEO Score (0-100)
  let techSeoScore = 100;
  if (!html.includes('<title>')) techSeoScore -= 20;
  if (!html.includes('canonical')) techSeoScore -= 20;
  if (!html.includes('BreadcrumbList')) techSeoScore -= 20;
  if (!html.includes('<h1')) techSeoScore -= 20;
  if (hasExactClaim) techSeoScore -= 20;

  // 4. Content Quality Score (0-100)
  let contentQualityScore = 0;
  // Technische juistheid (30)
  if (hasCc && hasPower && hasWeight) contentQualityScore += 30;
  else if (hasCc && hasPower) contentQualityScore += 20;

  // Unieke content (20)
  if (html.includes(model.model_name) && html.length >= 4000) contentQualityScore += 20;

  // Zoekintentie (15)
  if (html.includes('Serienummer Decoder') && html.includes('Fabrieksspecificaties')) contentQualityScore += 15;

  // Model-specifieke informatie (15)
  if (html.includes('Bougie') || html.includes('Carburateur')) contentQualityScore += 15;

  // Interne links (10)
  if (html.includes('Handige STIHL Links')) contentQualityScore += 10;

  // Bron/transparantie (10)
  if (hasEeatDisclaimer && hasSource) contentQualityScore += 10;

  totalContentQuality += contentQualityScore;
  totalTechnicalSeo += techSeoScore;

  const isFullyVerified = hasCc && hasPower && hasWeight && hasSpark && hasChain && hasSource && hasConfidence && !hasExactClaim;

  auditResults.push({
    model: `STIHL ${model.model_name}`,
    category: model.category,
    dataQuality: isFullyVerified ? 'GREEN' : 'ORANGE',
    contentQualityScore,
    techSeoScore,
    productionConfidence: model.production_confidence || 'HIGH',
    status: (contentQualityScore >= 90 && techSeoScore >= 95) ? 'GREEN' : 'ORANGE'
  });
}

// 5. Calculate Similarity Matrix for Key Pairs
const similarityMS260_261 = calculateJaccardSimilarity(renderedHtmlMap.get('ms-260'), renderedHtmlMap.get('ms-261'));
const similarityMS361_362 = calculateJaccardSimilarity(renderedHtmlMap.get('ms-361'), renderedHtmlMap.get('ms-362'));

const avgContentQuality = Math.round(totalContentQuality / auditResults.length);
const avgTechnicalSeo = Math.round(totalTechnicalSeo / auditResults.length);

console.log('==================================================');
console.log('PHASE 27 DATA QUALITY & CONTENT AUTHORITY SUMMARY');
console.log('==================================================');
console.log(`- Audited Live Models: ${auditResults.length}`);
console.log(`- Fully Verified Models: ${auditResults.filter(r => r.dataQuality === 'GREEN').length}`);
console.log(`- Average Content Quality Score: ${avgContentQuality} / 100`);
console.log(`- Average Technical SEO Score: ${avgTechnicalSeo} / 100`);
console.log(`- Textual Similarity MS 260 ↔ MS 261: ${similarityMS260_261}%`);
console.log(`- Textual Similarity MS 361 ↔ MS 362: ${similarityMS361_362}%`);

console.log('\nModel Quality Audit Breakdown:');
console.table(auditResults);

fs.writeFileSync(
  path.join(__dirname, 'data_quality_audit_report.json'),
  JSON.stringify({
    auditedModelsCount: auditResults.length,
    avgContentQuality,
    avgTechnicalSeo,
    similarityMS260_261,
    similarityMS361_362,
    auditResults
  }, null, 2),
  'utf8'
);

function calculateJaccardSimilarity(str1 = '', str2 = '') {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return Math.round((intersection.size / union.size) * 100);
}
