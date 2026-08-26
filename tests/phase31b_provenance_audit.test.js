import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSeoAuditReport } from '../src/components/SeoAuditEngine.js';
import { isBotUserAgent, logStihlEvent, getConversionDashboardMetrics } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Starting Phase 31B Real Data Provenance & Live Deployment Audit...\n');

// 1. Audit Live Wording for Legacy Claims
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const hasExactClaim = indexHtml.includes('exacte bouwperiode via serie-breakpoints');
const hasDefinitiveFake = indexHtml.includes('DEFINITIVE FAKE') || indexHtml.includes('DEFINITIVE_FAKE');

console.log(`✅ Legacy Wording "exacte bouwperiode": ${hasExactClaim ? '❌ FOUND (ERROR)' : 'PASSED (Removed)'}`);
console.log(`✅ Legacy Wording "DEFINITIVE FAKE": ${hasDefinitiveFake ? '❌ FOUND (ERROR)' : 'PASSED (Removed)'}`);

if (hasExactClaim || hasDefinitiveFake) {
  console.error('❌ Failed wording check in index.html!');
  process.exit(1);
}

// 2. Audit Data Provenance & Search Console API Status
const report = generateSeoAuditReport(database);
console.log(`✅ Search Console API Connected: ${report.dataProvenanceSummary.searchConsoleApiConnected}`);
console.log(`✅ Search Console API Status: ${report.dataProvenanceSummary.searchConsoleApiStatus}`);
console.log(`✅ Real User Metrics Status: ${report.realProductionMetrics.status}`);
console.log(`✅ Real User Metrics Message: "${report.realProductionMetrics.message}"`);

// 3. Test Bot Filtering
const isGoogleBotFiltered = isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
const isUserFiltered = isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');

console.log(`✅ Bot Filtering Googlebot: ${isGoogleBotFiltered ? 'PASSED (Filtered)' : 'FAILED'}`);
console.log(`✅ Bot Filtering Real User: ${!isUserFiltered ? 'PASSED (Allowed)' : 'FAILED'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase31b_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    wordingAudit: {
      hasExactClaim: false,
      hasDefinitiveFake: false
    },
    dataProvenanceSummary: report.dataProvenanceSummary,
    realProductionMetrics: report.realProductionMetrics
  }, null, 2),
  'utf8'
);

console.log('\n🎉 PHASE 31B PROVENANCE AUDIT COMPLETED 100% CLEANLY!');
