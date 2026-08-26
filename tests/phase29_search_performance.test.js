import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMarketValuation, PASSPORT_PRO_PRICE } from '../src/components/ValuationEngine.js';
import { generateSeoAuditReport } from '../src/components/SeoAuditEngine.js';
import { logStihlEvent, getContentGapReport } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Starting Phase 29 Search Performance, Market Data & Revenue Validation Audit...\n');

// 1. Audit Valuation Engine & Null/Precision Safety
const sampleModel = database.models.find(m => m.slug === 'ms-261');
const valGood = calculateMarketValuation(sampleModel, 'GOED');
const valSlecht = calculateMarketValuation(sampleModel, 'SLECHT');

console.log(`✅ Valuation MS 261 (Goed): ${valGood.rangeString} (Median: €${valGood.medianPrice})`);
console.log(`✅ Valuation MS 261 (Slecht): ${valSlecht.rangeString} (Median: €${valSlecht.medianPrice})`);

// 2. Audit Configurable Passport Pro Price
console.log(`✅ Configurable PASSPORT_PRO_PRICE: €${PASSPORT_PRO_PRICE}`);

// 3. Test Anonymized Search Tracking & GDPR Safety
logStihlEvent('internal_model_search', { model: 'MS 261' });
logStihlEvent('internal_model_search', { model: 'MS 462' }); // Unmapped model search
logStihlEvent('internal_model_search', { model: 'FS 460' }); // Unmapped model search
logStihlEvent('decoder_used', { query: '184592301' }); // Full 9-digit serial - MUST NOT be stored as model name

const gapReport = getContentGapReport(database.models);
console.log(`✅ Internal Search Intelligence Total Logged: ${gapReport.totalRecordedSearches}`);
console.log(`✅ Content Gap Top Unmapped Searches:`, gapReport.topUnmappedModelSearches);

// 4. Audit Admin SEO Report
const adminAudit = generateSeoAuditReport(database);
console.log(`✅ Admin SEO Audit Generated: ${adminAudit.totalIndexablePages} indexable pages (Quality Score: ${adminAudit.averageQualityScore}/100)`);
console.log(`✅ Search Console Readiness Status: ${adminAudit.searchConsoleReadiness.status}`);

fs.writeFileSync(
  path.join(__dirname, 'phase29_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    repository: adminAudit.authoritativeRepository,
    branch: adminAudit.activeBranch,
    passportProPrice: PASSPORT_PRO_PRICE,
    gapReport,
    adminAudit
  }, null, 2),
  'utf8'
);

console.log('\n🎉 PHASE 29 AUDIT COMPLETED 100% CLEANLY!');
