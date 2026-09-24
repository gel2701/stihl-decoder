/**
 * scripts/generate_compatibility_coverage.js
 * Generates PHASE48_COMPATIBILITY_COVERAGE.json based on data/model_product_compatibility.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const compatPath = path.join(rootDir, 'data', 'model_product_compatibility.json');
const outputPath = path.join(rootDir, 'PHASE48_COMPATIBILITY_COVERAGE.json');

const compatData = JSON.parse(fs.readFileSync(compatPath, 'utf8'));

let totalVerified = 0;
let totalSpecMatch = 0;
let totalGeneric = 0;
let totalUnverified = 0;
let totalOemParts = 0;
let totalOffers = 0;
let totalActiveAffiliateOffers = 0;

const modelsReport = {};

for (const [slug, m] of Object.entries(compatData.models)) {
  const verifiedCats = new Set();
  const specMatchCats = new Set();
  const genericCats = new Set();
  const unverifiedCats = new Set();
  const chainConfigs = [];
  const barConfigs = [];
  const oemParts = [];
  let modelOffers = 0;
  let modelActiveAffiliate = 0;

  for (const [catName, recs] of Object.entries(m.categories)) {
    for (const r of recs) {
      if (r.compatibility_status === 'VERIFIED_MODEL_COMPATIBILITY') {
        verifiedCats.add(catName);
        totalVerified++;
      } else if (r.compatibility_status === 'SPECIFICATION_MATCH_ONLY') {
        specMatchCats.add(catName);
        totalSpecMatch++;
      } else if (r.compatibility_status === 'GENERIC_CATEGORY_RECOMMENDATION') {
        genericCats.add(catName);
        totalGeneric++;
      } else {
        unverifiedCats.add(catName);
        totalUnverified++;
      }

      if (r.oem_part_number) {
        oemParts.push({
          part_number: r.oem_part_number,
          category: catName,
          title: r.display_claim
        });
        totalOemParts++;
      }

      if (r.recommendation_type === 'chain' && r.specification) {
        chainConfigs.push({
          recommendation_id: r.recommendation_id,
          pitch: r.specification.pitch,
          gauge_mm: r.specification.gauge_mm,
          drive_links: r.specification.drive_links,
          bar_length_cm: r.specification.guide_bar_length_cm,
          oem_part_number: r.oem_part_number || null,
          status: r.compatibility_status
        });
      }

      if (r.recommendation_type === 'bar' && r.specification) {
        barConfigs.push({
          recommendation_id: r.recommendation_id,
          length_cm: r.specification.bar_length_cm,
          mount_type: r.specification.mount_type,
          pitch: r.specification.pitch,
          gauge_mm: r.specification.gauge_mm,
          oem_part_number: r.oem_part_number || null,
          status: r.compatibility_status
        });
      }

      const offers = r.commercial_offers?.offers || [];
      modelOffers += offers.length;
      totalOffers += offers.length;
      const active = offers.filter((o) => o.status === 'ACTIVE_AFFILIATE').length;
      modelActiveAffiliate += active;
      totalActiveAffiliateOffers += active;
    }
  }

  modelsReport[slug] = {
    model_slug: slug,
    model_name: m.machine_identity.model_name,
    series_code: m.machine_identity.series_code,
    verified_categories: Array.from(verifiedCats),
    specification_match_categories: Array.from(specMatchCats),
    generic_categories: Array.from(genericCats),
    unverified_categories: Array.from(unverifiedCats),
    chain_configurations: chainConfigs,
    guide_bar_configurations: barConfigs,
    oem_part_numbers: oemParts,
    commercial_offers_count: modelOffers,
    active_affiliate_offers_count: modelActiveAffiliate,
    readiness_flags: {
      TECHNICAL_DATA_READY: true,
      COMMERCIAL_DATA_READY: true,
      AFFILIATE_LINKS_ACTIVE: modelActiveAffiliate > 0,
      DISCLOSURE_ACTIVE: modelActiveAffiliate > 0,
      ANALYTICS_READY: true
    }
  };
}

const coverage = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  phase: '48',
  total_pilot_models: Object.keys(modelsReport).length,
  summary: {
    total_recommendations: totalVerified + totalSpecMatch + totalGeneric + totalUnverified,
    total_verified: totalVerified,
    total_specification_match: totalSpecMatch,
    total_generic_recommendations: totalGeneric,
    total_unverified: totalUnverified,
    total_oem_part_numbers: totalOemParts,
    total_commercial_offers: totalOffers,
    total_active_affiliate_offers: totalActiveAffiliateOffers,
    status_flags: {
      TECHNICAL_DATA_READY: true,
      COMMERCIAL_DATA_READY: true,
      AFFILIATE_LINKS_ACTIVE: totalActiveAffiliateOffers > 0,
      DISCLOSURE_ACTIVE: totalActiveAffiliateOffers > 0,
      ANALYTICS_READY: true
    }
  },
  models: modelsReport
};

fs.writeFileSync(outputPath, JSON.stringify(coverage, null, 2), 'utf8');
console.log(`✅ Generated ${outputPath}`);
console.log(`Summary:`, JSON.stringify(coverage.summary, null, 2));
