/**
 * scripts/report_affiliate_commercial_metrics.mjs
 *
 * Phase 72: Commercial Analytics & Growth Engine Reporter
 *
 * Evaluates:
 * - Direct Amazon offer capacity and active count per marketplace (amazon.nl, amazon.de)
 * - Coverage across Google Search Console high-impression models
 * - Direct ASIN part coverage vs search fallback coverage
 * - Progress towards commercial milestones (50, 100, 250)
 * - Clear delineation between website outbound clicks and qualifying Amazon PartnerNet sales
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const GSC_MODEL_METRICS = [
  { modelId: 'ms_440', modelName: 'MS 440', impressions: 446, clicks: 2, category: 'Kettingzaag' },
  { modelId: 'fs_460', modelName: 'FS 460', impressions: 315, clicks: 0, category: 'Bosmaaier' },
  { modelId: 'ms_170', modelName: 'MS 170', impressions: 195, clicks: 7, category: 'Kettingzaag' },
  { modelId: 'ms_461', modelName: 'MS 461', impressions: 163, clicks: 2, category: 'Kettingzaag' },
  { modelId: 'bg_86', modelName: 'BG 86', impressions: 160, clicks: 4, category: 'Bladblazer' },
  { modelId: 'ms_390', modelName: 'MS 390', impressions: 125, clicks: 1, category: 'Kettingzaag' },
  { modelId: 'br_600', modelName: 'BR 600', impressions: 113, clicks: 6, category: 'Rugblazer' },
  { modelId: 'ms_361', modelName: 'MS 361', impressions: 101, clicks: 1, category: 'Kettingzaag' },
  { modelId: 'hs_45', modelName: 'HS 45', impressions: 52, clicks: 2, category: 'Heggenschaar' },
  { modelId: 'fs_350', modelName: 'FS 350', impressions: 42, clicks: 6, category: 'Bosmaaier' },
  { modelId: 'ms_250', modelName: 'MS 250', impressions: 39, clicks: 2, category: 'Kettingzaag' },
  { modelId: 'fs_80', modelName: 'FS 80', impressions: 36, clicks: 0, category: 'Bosmaaier' },
  { modelId: 'ms_210', modelName: 'MS 210', impressions: 341, clicks: 1, category: 'Kettingzaag' }
];

export function generateCommercialReport(options = {}) {
  const registryPath = options.registryPath || path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry not found at ${registryPath}`);
  }

  const regDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const allOffers = regDoc.offers || [];
  const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' || o.pilot_active === true);

  const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
  const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');

  const uniqueActiveParts = new Set(activeOffers.map(o => PartNormalizer.normalizePartNumber(o.part_number)));
  const uniqueNlParts = new Set(activeNl.map(o => PartNormalizer.normalizePartNumber(o.part_number)));
  const uniqueDeParts = new Set(activeDe.map(o => PartNormalizer.normalizePartNumber(o.part_number)));

  // Model-level coverage calculation
  const modelCoverage = [];
  for (const gsc of GSC_MODEL_METRICS) {
    const canonicalModelParts = PartCatalogResolver.getPartsForModel(gsc.modelId) || [];
    const canonicalPartNumbers = new Set(
      canonicalModelParts.map(p => PartNormalizer.normalizePartNumber(p.part_number)).filter(Boolean)
    );

    const matchingActiveOffers = activeOffers.filter(o => {
      const p = PartNormalizer.normalizePartNumber(o.part_number);
      if (canonicalPartNumbers.has(p)) return true;
      // Also check explicit model mentions in compatibility proof
      const comp = (o.compatibility_proof || '').toUpperCase().replace(/\s+/g, '');
      const cleanModel = gsc.modelName.toUpperCase().replace(/\s+/g, '');
      return comp.includes(cleanModel);
    });

    const uniqueMatchingParts = new Set(matchingActiveOffers.map(o => o.part_number));

    modelCoverage.push({
      model_id: gsc.modelId,
      model_name: gsc.modelName,
      category: gsc.category,
      gsc_impressions: gsc.impressions,
      gsc_clicks: gsc.clicks,
      canonical_parts_count: canonicalPartNumbers.size,
      active_offers_count: matchingActiveOffers.length,
      distinct_active_parts_count: uniqueMatchingParts.size,
      active_parts: Array.from(uniqueMatchingParts),
      coverage_status: uniqueMatchingParts.size >= 3 ? 'STRONG' : (uniqueMatchingParts.size > 0 ? 'MODERATE' : 'GAP')
    });
  }

  // Commercial milestones
  const milestones = {
    milestone_50: {
      target: 50,
      current: activeOffers.length,
      achieved: activeOffers.length >= 50,
      percentage: Math.min(100, Math.round((activeOffers.length / 50) * 100))
    },
    milestone_100: {
      target: 100,
      current: activeOffers.length,
      achieved: activeOffers.length >= 100,
      percentage: Math.min(100, Math.round((activeOffers.length / 100) * 100))
    },
    milestone_250: {
      target: 250,
      current: activeOffers.length,
      achieved: activeOffers.length >= 250,
      percentage: Math.min(100, Math.round((activeOffers.length / 250) * 100))
    }
  };

  const unprovenCandidates = allOffers.filter(o => o.status === 'RESEARCH_REQUIRED');
  const pendingShippingDe = allOffers.filter(o => o.marketplace === 'amazon.de' && o.status === 'VERIFIED');
  const rejectedCandidates = allOffers.filter(o => o.status === 'REJECTED');
  const uniqueConfirmedAsins = new Set(activeOffers.map(o => o.asin));

  const evidenceAuditSummary = {
    total_registered_candidates: allOffers.length,
    verified_active_offers: activeOffers.length,
    unproven_candidates: unprovenCandidates.length,
    pending_shipping_confirmation_de: pendingShippingDe.length,
    rejected_candidates: rejectedCandidates.length,
    unique_confirmed_asins: uniqueConfirmedAsins.size,
    unique_parts_with_direct_buy: uniqueActiveParts.size,
    milestone_100_achieved: false,
    audit_notes: 'Phase 73A Emergency Evidence Audit: unproven product claims deactivated to RESEARCH_REQUIRED. Evidence prioritised over arbitrary numbers.'
  };

  const report = {
    report_title: 'STIHLDecoder Phase 73A Emergency Amazon Evidence Audit & Commercial Report',
    generated_at: new Date().toISOString(),
    evidence_audit_summary: evidenceAuditSummary,
    marketplaces: {
      amazon_nl: {
        active_offers: activeNl.length,
        distinct_parts: uniqueNlParts.size,
        affiliate_tag: 'srihldecoder2-21',
        status: 'OPERATIONAL'
      },
      amazon_de: {
        active_offers: activeDe.length,
        distinct_parts: uniqueDeParts.size,
        affiliate_tag: 'srihldecode00-21',
        shipping_requirement: 'SHIPS_TO_NL_CONFIRMED',
        status: 'OPERATIONAL'
      },
      total_active_offers: activeOffers.length,
      total_registered_offers: allOffers.length,
      distinct_active_parts: uniqueActiveParts.size
    },
    milestones,
    gsc_model_coverage: modelCoverage,
    commercial_telemetry_disclaimer: {
      statement: 'Website outbound clicks measure user purchase intent and conversion funnel navigation. They do NOT represent realized Amazon sales.',
      sales_tracking_source: 'Official qualifying sales and earnings are exclusively measured in Amazon Associates PartnerNet (nl.associates.amazon.com / partnernet.amazon.de).',
      first_sales_qualification_requirement: 'Amazon Associates account review and programmatic Creators API access require at least 3 qualifying sales within 180 days driven from approved affiliate links.'
    }
  };

  return report;
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const report = generateCommercialReport();
  const outputPath = path.join(rootDir, 'data', 'affiliate', 'commercial_performance_report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log('===============================================================');
  console.log('📈 STIHLDECODER COMMERCIAL AFFILIATE & GSC GROWTH REPORT');
  console.log('===============================================================\n');
  console.log(`Active Offers Total : ${report.marketplaces.total_active_offers} (Milestone 50 Achieved: ${report.milestones.milestone_50.achieved ? 'YES ✅' : 'NO ❌'})`);
  console.log(`- Amazon.nl         : ${report.marketplaces.amazon_nl.active_offers} offers (${report.marketplaces.amazon_nl.distinct_parts} distinct parts)`);
  console.log(`- Amazon.de         : ${report.marketplaces.amazon_de.active_offers} offers (${report.marketplaces.amazon_de.distinct_parts} distinct parts, all with NL delivery confirmation)`);
  console.log(`\nMilestones:`);
  console.log(`  50  Offers: ${report.milestones.milestone_50.percentage}% (${report.milestones.milestone_50.current}/${report.milestones.milestone_50.target})`);
  console.log(`  100 Offers: ${report.milestones.milestone_100.percentage}% (${report.milestones.milestone_100.current}/${report.milestones.milestone_100.target})`);
  console.log(`  250 Offers: ${report.milestones.milestone_250.percentage}% (${report.milestones.milestone_250.current}/${report.milestones.milestone_250.target})`);

  console.log('\n--- GSC High-Impression Models Coverage ---');
  for (const m of report.gsc_model_coverage) {
    console.log(`- ${m.model_name.padEnd(8)}: ${m.gsc_impressions.toString().padStart(4)} imp, ${m.gsc_clicks.toString().padStart(2)} clicks | ${m.active_offers_count.toString().padStart(2)} active offers (${m.distinct_active_parts_count} parts) [${m.coverage_status}]`);
  }
  console.log(`\nReport written to: ${outputPath}`);
}
