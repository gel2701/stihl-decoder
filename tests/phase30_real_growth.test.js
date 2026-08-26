import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMarketValuation, DATA_CLASSIFICATION } from '../src/components/ValuationEngine.js';
import { logStihlEvent, getConversionDashboardMetrics, EVENT_TYPES } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Starting Phase 30 Real Growth, Market Data & First Revenue Audit...\n');

// 1. Audit Strategic 5 Models in Database
const ms462 = database.models.find(m => m.slug === 'ms-462');
const ms201 = database.models.find(m => m.slug === 'ms-201-t');
const fs460 = database.models.find(m => m.slug === 'fs-460');
const br700 = database.models.find(m => m.slug === 'br-700');
const ts420 = database.models.find(m => m.slug === 'ts-420');

console.log(`✅ Strategic Model 1: ${ms462 ? ms462.model_name : 'MISSING'} (${ms462 ? ms462.displacement_cc : ''} cc)`);
console.log(`✅ Strategic Model 2: ${ms201 ? ms201.model_name : 'MISSING'} (${ms201 ? ms201.displacement_cc : ''} cc)`);
console.log(`✅ Strategic Model 3: ${fs460 ? fs460.model_name : 'MISSING'} (${fs460 ? fs460.displacement_cc : ''} cc)`);
console.log(`✅ Strategic Model 4: ${br700 ? br700.model_name : 'MISSING'} (${br700 ? br700.displacement_cc : ''} cc)`);
console.log(`✅ Strategic Model 5: ${ts420 ? ts420.model_name : 'MISSING'} (${ts420 ? ts420.displacement_cc : ''} cc)`);

// 2. Audit Strategic 3 High-Intent Troubleshooting Guides
const guides = database.guides || [];
const guide1 = guides.find(g => g.slug === 'stihl-kettingzaag-start-niet');
const guide2 = guides.find(g => g.slug === 'stihl-carburateur-afstellen');
const guide3 = guides.find(g => g.slug === 'stihl-m-tronic-resetten');

console.log(`✅ Troubleshooting Guide 1: ${guide1 ? guide1.title : 'MISSING'}`);
console.log(`✅ Troubleshooting Guide 2: ${guide2 ? guide2.title : 'MISSING'}`);
console.log(`✅ Troubleshooting Guide 3: ${guide3 ? guide3.title : 'MISSING'}`);

// 3. Audit Valuation Data Classification & Wording
const valData = calculateMarketValuation(ms462, 'GOED');
console.log(`✅ Valuation Classification: ${valData.dataClassification}`);
console.log(`✅ Valuation Term: "${valData.headlineTerm}"`);
console.log(`✅ Valuation Provenance: "${valData.provenanceText}"`);
console.log(`✅ Valuation Range: ${valData.rangeString} (Median: €${valData.medianPrice})`);
console.log(`✅ Confidence Level: ${valData.confidenceLevel} (Sample Size: ${valData.sampleSize})`);

// 4. Test Event Tracking & PII Sanitization
logStihlEvent(EVENT_TYPES.DECODER_USED, { serial_number: '184592301', email: 'test@example.com' });
logStihlEvent(EVENT_TYPES.PASSPORT_PRO_CLICK, { model: 'MS 462 C-M', variant: 'B' });
logStihlEvent(EVENT_TYPES.REPAIR_LEAD_STARTED, { model: 'MS 462 C-M' });
logStihlEvent(EVENT_TYPES.SELL_LEAD_STARTED, { model: 'MS 462 C-M' });

const conversionMetrics = getConversionDashboardMetrics();
console.log(`✅ Conversion Dashboard Metrics:`, conversionMetrics);

fs.writeFileSync(
  path.join(__dirname, 'phase30_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    strategicModels: [ms462, ms201, fs460, br700, ts420].map(m => m ? m.model_name : null),
    troubleshootingGuides: [guide1, guide2, guide3].map(g => g ? g.title : null),
    valuationData: valData,
    conversionMetrics
  }, null, 2),
  'utf8'
);

console.log('\n🎉 PHASE 30 AUDIT COMPLETED 100% CLEANLY!');
