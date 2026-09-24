/**
 * scripts/validate_model_product_compatibility.mjs
 * Validation script for Phase 48 compatibility dataset and commercial offers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDomainAllowlisted, COMMERCIAL_OFFER_STATUSES } from '../src/commercialOffers.js';
import { RECOMMENDATION_TYPES, COMPATIBILITY_STATUSES } from '../src/modelRecommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ALLOWED_RECOMMENDATION_TYPES = new Set(Object.values(RECOMMENDATION_TYPES));
const ALLOWED_COMPATIBILITY_STATUSES = new Set(Object.values(COMPATIBILITY_STATUSES));

const OEM_PART_NUMBER_REGEX = /^\d{4}\s\d{3}\s\d{4}$/;

export function validateCompatibilityDataset() {
  const errors = [];
  const warnings = [];

  // Load referenced files
  const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
  const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
  const merchPath = path.join(rootDir, 'data', 'affiliate_merchants.json');
  const compatPath = path.join(rootDir, 'data', 'model_product_compatibility.json');

  if (!fs.existsSync(dbPath)) errors.push(`Missing stihl_database.json at ${dbPath}`);
  if (!fs.existsSync(evPath)) errors.push(`Missing public_evidence_facts.json at ${evPath}`);
  if (!fs.existsSync(merchPath)) errors.push(`Missing affiliate_merchants.json at ${merchPath}`);
  if (!fs.existsSync(compatPath)) errors.push(`Missing model_product_compatibility.json at ${compatPath}`);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const evData = JSON.parse(fs.readFileSync(evPath, 'utf8'));
  const merchData = JSON.parse(fs.readFileSync(merchPath, 'utf8'));
  const compatData = JSON.parse(fs.readFileSync(compatPath, 'utf8'));

  const canonicalSlugs = new Set((db.models || []).map((m) => m.slug));
  const factsArray = Array.isArray(evData.facts) ? evData.facts : Object.values(evData.facts || {});
  const factsMap = new Map(factsArray.map((f) => [f.fact_id, f]));
  const merchantsList = merchData.merchants || [];
  const merchantMap = new Map(merchantsList.map((m) => [m.merchant_id, m]));

  if (!compatData.models || typeof compatData.models !== 'object') {
    errors.push('model_product_compatibility.json: missing root "models" object');
    return { valid: false, errors, warnings };
  }

  let totalModels = 0;
  let totalRecommendations = 0;
  let totalOffers = 0;

  for (const [modelSlug, modelData] of Object.entries(compatData.models)) {
    totalModels++;

    // 1. Validate canonical model existence
    if (!canonicalSlugs.has(modelSlug)) {
      errors.push(`Model "${modelSlug}" is not present in canonical stihl_database.json`);
    }

    if (!modelData.machine_identity) {
      errors.push(`Model "${modelSlug}": missing machine_identity`);
      continue;
    }

    if (modelData.machine_identity.model_slug !== modelSlug) {
      errors.push(`Model "${modelSlug}": machine_identity.model_slug mismatch ("${modelData.machine_identity.model_slug}")`);
    }

    if (!modelData.categories || typeof modelData.categories !== 'object') {
      errors.push(`Model "${modelSlug}": missing or invalid categories object`);
      continue;
    }

    // 2. Validate categories and recommendations
    for (const [categoryKey, recommendations] of Object.entries(modelData.categories)) {
      if (!ALLOWED_RECOMMENDATION_TYPES.has(categoryKey)) {
        errors.push(`Model "${modelSlug}": invalid category key "${categoryKey}"`);
      }

      if (!Array.isArray(recommendations)) {
        errors.push(`Model "${modelSlug}": category "${categoryKey}" recommendations must be an array`);
        continue;
      }

      for (const rec of recommendations) {
        totalRecommendations++;

        if (!rec.recommendation_id) {
          errors.push(`Model "${modelSlug}" category "${categoryKey}": missing recommendation_id`);
        }

        if (!ALLOWED_RECOMMENDATION_TYPES.has(rec.recommendation_type)) {
          errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": invalid recommendation_type "${rec.recommendation_type}"`);
        }

        if (rec.recommendation_type !== categoryKey) {
          errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": recommendation_type "${rec.recommendation_type}" does not match category "${categoryKey}"`);
        }

        // 3. Validate canonical status
        if (!ALLOWED_COMPATIBILITY_STATUSES.has(rec.compatibility_status)) {
          errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": invalid compatibility_status "${rec.compatibility_status}"`);
        }

        // 4. Validate evidence fact IDs
        if (Array.isArray(rec.evidence_fact_ids)) {
          for (const factId of rec.evidence_fact_ids) {
            const fact = factsMap.get(factId);
            if (!fact) {
              errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": evidence_fact_id "${factId}" not found in public_evidence_facts.json`);
            } else if (fact.model_slug !== modelSlug) {
              errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": evidence_fact_id "${factId}" belongs to model "${fact.model_slug}", not "${modelSlug}"`);
            }
          }
        }

        // 5. Validate OEM Part Number format if present
        if (rec.oem_part_number != null) {
          if (!OEM_PART_NUMBER_REGEX.test(rec.oem_part_number)) {
            errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": oem_part_number "${rec.oem_part_number}" does not match STIHL format "xxxx xxx xxxx"`);
          }
        }

        // 6. Validate chain configuration consistency
        if (rec.recommendation_type === RECOMMENDATION_TYPES.CHAIN && rec.specification) {
          const spec = rec.specification;
          if (spec.drive_links != null && (!Number.isInteger(spec.drive_links) || spec.drive_links <= 0)) {
            errors.push(`Model "${modelSlug}" chain "${rec.recommendation_id}": invalid drive_links count "${spec.drive_links}"`);
          }
          if (spec.gauge_mm != null && (typeof spec.gauge_mm !== 'number' || spec.gauge_mm <= 0)) {
            errors.push(`Model "${modelSlug}" chain "${rec.recommendation_id}": invalid gauge_mm "${spec.gauge_mm}"`);
          }
        }

        if (rec.recommendation_type === RECOMMENDATION_TYPES.BAR && rec.specification) {
          const spec = rec.specification;
          if (spec.bar_length_cm != null && (typeof spec.bar_length_cm !== 'number' || spec.bar_length_cm <= 0)) {
            errors.push(`Model "${modelSlug}" bar "${rec.recommendation_id}": invalid bar_length_cm "${spec.bar_length_cm}"`);
          }
        }

        // 7. Validate commercial offers if present
        const offers = rec.commercial_offers?.offers || [];
        for (const offer of offers) {
          totalOffers++;
          if (!offer.merchant_id || !merchantMap.has(offer.merchant_id)) {
            errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": unknown merchant_id "${offer.merchant_id}"`);
            continue;
          }

          const merch = merchantMap.get(offer.merchant_id);

          if (!offer.product_url) {
            errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": missing product_url`);
          } else if (!isDomainAllowlisted(offer.product_url, merch, merchantsList)) {
            errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": product_url domain not allowlisted for "${offer.merchant_id}": ${offer.product_url}`);
          }

          if (offer.status === COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE) {
            if (!offer.affiliate_url) {
              errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": ACTIVE_AFFILIATE requires affiliate_url`);
            } else if (!isDomainAllowlisted(offer.affiliate_url, merch, merchantsList)) {
              errors.push(`Model "${modelSlug}" recommendation "${rec.recommendation_id}": affiliate_url domain not allowlisted for "${offer.merchant_id}": ${offer.affiliate_url}`);
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalModels,
      totalRecommendations,
      totalOffers
    }
  };
}

// Direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running model product compatibility validation...');
  const result = validateCompatibilityDataset();

  if (result.valid) {
    console.log(`✅ Validation PASSED (${result.stats.totalModels} models, ${result.stats.totalRecommendations} recommendations, ${result.stats.totalOffers} offers).`);
    process.exit(0);
  } else {
    console.error(`❌ Validation FAILED with ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}
