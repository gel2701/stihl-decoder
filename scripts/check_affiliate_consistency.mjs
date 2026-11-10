/**
 * scripts/check_affiliate_consistency.mjs
 *
 * Phase 60Q: Cross-Manifest Contradiction & Data Integrity Checker
 *
 * Performs read-only consistency auditing across all affiliate manifests and registries:
 * - Part number vs Manufacturer / MPN / GTIN
 * - ASIN vs Manufacturer / MPN
 * - Packaging quantity & multi-pack consistency
 * - Historical mismatch registry violations
 * - GS1 Modulo-10 GTIN check-digit compliance
 * - Active vs Staged authorization invariants
 *
 * Fails with exit code 1 if any active or verified production offer contains contradictions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mandatory authorized pilot ASINs (Phase 59E baseline + Phase 69C/D expansion + Phase 70 DE confirmed shipping)
const AUTHORIZED_PILOT_PARTS = new Set([
  '11104007005', // Bosch WSR6F (B0068M5NAG)
  '00004007000', // NGK BPMR7A (B001RM8J76)
  '00004007011', // NGK CMR6H (B001RMA5S2)
  '00004007009', // Bosch USR7AC (B09QH68W83)
  '36160000050', // STIHL Zaagketting Picco Super PS 3/8" 1.3mm 50GL (B007QJL16A)
  '36360000050', // Oregon S50 Zaagketting 3/8" LP 1.3mm 50DL (B00FYRVGHU)
  '11301240800', // Haishine Luchtfilter MS 170 / MS 180 (B07KJYFPLM)
  '11231201613', // Haishine Luchtfilter MS 250 / MS 230 / MS 210 (B0DPCHJ2TD)
  '11211201617', // MCHNIC Luchtfilter MS 260 / 026 (B0CQXCJSDC)
  '11411201600', // Trade-Shop HD2 Luchtfilter MS 261 / MS 362 (B09ZV1SQ7K)
  '42411201800', // MCHNIC Luchtfilter BG 56 / BG 86 (B0D7ZKJTRX)
  '41401242800', // MospdyGear Luchtfilter FS 55 / HS 45 (B0F53RHZLS)
  '40027102169', // STIHL AutoCut C 26-2 Maaikop FS 55 (B06XZZ84JC)
  '41190071027', // YOUSHARES AutoCut 25-2 Maaikop FS 55 (B09ZKYGPDG)
  '11210071062', // Yingshop Walbro K10-WAT Membraanset (B071ZMCCYD)
  '00003503500', // vhbw Brandstoffilter MS 170 / MS 250 / FS 55 (B0874SJ4CK)
  '00003503521', // Haishine Brandstoffilter zuigkop FS 460 / MS 261 (B0HLBXNGQQ)
  '11231950400', // ECSiNG Starter katrol / veer kit FS 55 / MS 170 (B0BG49Y65H)
  '11210201200', // Sägenspezi Zylinder Kolben Set MS 260 44mm (B00PGX7STM)
  '11230302003', // Sägenspezi Kolben 40mm MS 210 (B00LAHGFRO)
  '00006421223', // Oregon 68210 Rim Sprocket 3/8" 7T SD7 MS 440 (B00455Q028)
  '00006421231', // Oregon 18720 Rim Sprocket 3/8" 7T SM7 MS 261 / MS 290 (B000IBWVWG)
  '07811201109', // STIHL MultiLub Tandwielvet 80g Tube HS 45 (B007TK174M)
  '30050004809', // Oregon 140SDEA074 Zaagblad 14" MS 170 / MS 210 (B001FUALX0)
  '30050004813', // Oregon 160SDEA074 Zaagblad 16" MS 210 / MS 250 (B002VAAQC4)
  '56057504303'  // STIHL 2-in-1 Feilenhalter 4.0mm MS 170 / MS 210 (B00CIRQW0K)
]);

export function checkAffiliateConsistency() {
  console.log('===============================================================');
  console.log('🛡️  PHASE 60Q: CROSS-MANIFEST AFFILIATE CONSISTENCY CHECKER');
  console.log('===============================================================\n');

  const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error('Missing canonical parts catalog at data/parts_catalog.json');
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const canonicalParts = new Map(catalog.parts.map(p => [p.part_number, p]));
  console.log(`Loaded ${canonicalParts.size} canonical parts from catalog.\n`);

  const manifestFiles = [
    { name: 'data/affiliate/amazon_part_offers.json', type: 'RUNTIME_ACTIVE' },
    { name: 'data/affiliate/verified_amazon_registry.json', type: 'REGISTRY' },
    { name: 'data/affiliate/commercial_catalog_100.json', type: 'COMMERCIAL_CATALOG' },
    { name: 'PHASE60_1_VERIFIED_OFFERS.json', type: 'VERIFIED_OFFERS' },
    { name: 'PHASE60_1_REJECTED_AND_PENDING.json', type: 'REJECTED_PENDING' },
    { name: 'PHASE60_AMAZON_MATCHING_CANDIDATES.json', type: 'CANDIDATES' }
  ];

  let totalScanned = 0;
  let contradictions = [];
  let gtinErrors = [];
  let unverifiedActives = [];
  let unauthorizedActives = [];

  for (const manifest of manifestFiles) {
    const fullPath = path.join(rootDir, manifest.name);
    if (!fs.existsSync(fullPath)) {
      console.log(`⏩ Skipping optional/missing manifest: ${manifest.name}`);
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (err) {
      contradictions.push({ file: manifest.name, error: `JSON Parse Error: ${err.message}` });
      continue;
    }

    const records = Array.isArray(doc)
      ? doc
      : (doc.parts || doc.offers || doc.verified_offers || doc.candidates || doc.items || doc.rejected_or_pending || []);

    console.log(`▶ Auditing ${records.length} records in ${manifest.name} (${manifest.type})...`);

    // Audit registry metrics synchronization (Phase 74B invariant)
    if (manifest.type === 'REGISTRY' && doc.metrics) {
      const activeCount = records.filter(o => o.status === 'ACTIVE' || o.pilot_active === true).length;
      const activeNlCount = records.filter(o => (o.status === 'ACTIVE' || o.pilot_active === true) && (!o.marketplace || o.marketplace === 'amazon.nl')).length;
      const activeDeCount = records.filter(o => (o.status === 'ACTIVE' || o.pilot_active === true) && o.marketplace === 'amazon.de').length;
      const researchCount = records.filter(o => o.status === 'RESEARCH_REQUIRED').length;
      const verifiedInactiveCount = records.filter(o => o.status === 'VERIFIED' && !o.pilot_active).length;

      if (doc.metrics.total_registered !== records.length) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.total_registered (${doc.metrics.total_registered}) !== offers count (${records.length})`
        });
      }
      if (doc.metrics.active !== activeCount) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.active (${doc.metrics.active}) !== actual active count (${activeCount})`
        });
      }
      if (doc.metrics.active_nl !== activeNlCount) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.active_nl (${doc.metrics.active_nl}) !== actual active NL count (${activeNlCount})`
        });
      }
      if (doc.metrics.active_de !== activeDeCount) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.active_de (${doc.metrics.active_de}) !== actual active DE count (${activeDeCount})`
        });
      }
      if (doc.metrics.research_required !== researchCount) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.research_required (${doc.metrics.research_required}) !== actual research_required count (${researchCount})`
        });
      }
      if (doc.metrics.verified !== verifiedInactiveCount) {
        contradictions.push({
          file: manifest.name,
          error: `Registry metrics.verified (${doc.metrics.verified}) !== actual verified inactive count (${verifiedInactiveCount})`
        });
      }
    }

    for (const rec of records) {
      totalScanned++;
      const normPart = PartNormalizer.normalizePartNumber(rec.part_number);
      const asin = typeof rec.asin === 'string' ? rec.asin.trim().toUpperCase() : '';
      const title = rec.product_title || rec.title || rec.matched_title || rec.product || '';
      const gtin = rec.ean_gtin || rec.gtin || rec.ean || '';
      const status = manifest.type === 'COMMERCIAL_CATALOG'
        ? (rec.commercial_tier === 'DIRECT_VERIFIED' ? 'ACTIVE' : 'STAGED')
        : (rec.status || 'STAGED');

      // 1. Canonical Part Grounding
      if (!normPart || !canonicalParts.has(normPart)) {
        contradictions.push({
          file: manifest.name,
          part_number: rec.part_number,
          asin,
          error: `Part number "${rec.part_number}" does not exist in canonical parts catalog.`
        });
      }

      // 2. GTIN / EAN GS1 Check-Digit Verification
      if (gtin) {
        const gtinRes = validateGtin(gtin);
        if (!gtinRes.valid) {
          gtinErrors.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            gtin,
            error: gtinRes.error
          });
        }
      }

      // 3. Selection Rationale ASIN Consistency (Commercial Catalog)
      if (rec.selection_rationale && typeof rec.selection_rationale === 'string') {
        const asinInRationale = rec.selection_rationale.match(/ASIN\s+([A-Z0-9]{10})/i);
        if (asinInRationale && asinInRationale[1].toUpperCase() !== asin) {
          contradictions.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            error: `Selection rationale mentions ASIN ${asinInRationale[1]} but record ASIN is ${asin || 'NONE'}`
          });
        }
      }

      // 4. Historical Mismatch Check
      const mismatchCheck = checkHistoricalMismatch(normPart, asin, title, gtin);
      if (mismatchCheck.isMismatch) {
        // If present in REJECTED_PENDING, it is quarantined (valid negative storage)
        // If present in ACTIVE or VERIFIED, it is a critical violation!
        const isQuarantined = manifest.type === 'REJECTED_PENDING' || status === 'INCORRECT_MATCH_CONFIRMED' || status === 'SUSPENDED';
        if (!isQuarantined) {
          contradictions.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            error: `CRITICAL_MISMATCH_DETECTED: ${mismatchCheck.record.reason}`
          });
        }
      }

      // 5. TwoGate Compliance for ACTIVE or VERIFIED offers
      if (status === 'ACTIVE' || status === 'VERIFIED') {
        if (manifest.type !== 'COMMERCIAL_CATALOG') {
          const twoGate = TwoGateVerifier.verifyOffer(rec, { catalogPartMap: canonicalParts });
          if (!twoGate.passed) {
            contradictions.push({
              file: manifest.name,
              part_number: normPart,
              asin,
              status,
              error: `TwoGateVerifier failed for ${status} offer: ${twoGate.errors.join('; ')}`
            });
          }
        }

        // Active Authorization Invariant: only the 3 authorized pilot parts may be ACTIVE
        if (status === 'ACTIVE' && !AUTHORIZED_PILOT_PARTS.has(normPart)) {
          unauthorizedActives.push({
            file: manifest.name,
            part_number: normPart,
            asin,
            error: `Unauthorized active offer: ${normPart} is not in authorized pilot whitelist`
          });
        }
      }

      // 6. ASIN_IDENTITY_UNVERIFIED & RESEARCH_REQUIRED Safety Check
      if ((rec.status === 'ASIN_IDENTITY_UNVERIFIED' || rec.status === 'RESEARCH_REQUIRED' || rec.evidence_audit_category === 'RESEARCH_REQUIRED') && (rec.is_active === true || rec.pilot_active === true)) {
        unverifiedActives.push({
          file: manifest.name,
          part_number: normPart,
          asin,
          error: `Offer has unproven status (${rec.status || rec.evidence_audit_category}) but is marked active (is_active: ${rec.is_active}, pilot_active: ${rec.pilot_active})`
        });
      }
    }
  }

  // 7. Cross-Manifest Concordance Audit (Commercial Catalog vs Verified Registry vs Staged)
  const regPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
  const comPath = path.join(rootDir, 'data', 'affiliate', 'commercial_catalog_100.json');
  if (fs.existsSync(regPath) && fs.existsSync(comPath)) {
    const regDoc = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const comDoc = JSON.parse(fs.readFileSync(comPath, 'utf8'));
    const regOffers = new Map((regDoc.offers || []).filter(o => !o.marketplace || o.marketplace === 'amazon.nl').map(o => [PartNormalizer.normalizePartNumber(o.part_number), o]));

    for (const item of (comDoc.parts || [])) {
      const normPart = PartNormalizer.normalizePartNumber(item.part_number);
      if (item.commercial_tier === 'DIRECT_VERIFIED') {
        const regOffer = regOffers.get(normPart);
        if (!regOffer) {
          contradictions.push({
            file: 'commercial_catalog_100.json',
            part_number: normPart,
            error: `DIRECT_VERIFIED part ${normPart} missing in verified_amazon_registry.json`
          });
        } else {
          if (regOffer.status !== 'ACTIVE') {
            contradictions.push({
              file: 'commercial_catalog_100.json',
              part_number: normPart,
              error: `DIRECT_VERIFIED part ${normPart} has status ${regOffer.status} in registry (must be ACTIVE)`
            });
          }
          if (regOffer.asin !== item.asin) {
            contradictions.push({
              file: 'commercial_catalog_100.json',
              part_number: normPart,
              error: `ASIN conflict between commercial catalog (${item.asin}) and registry (${regOffer.asin})`
            });
          }
          if (regOffer.ean_gtin && item.ean_gtin && regOffer.ean_gtin !== item.ean_gtin) {
            contradictions.push({
              file: 'commercial_catalog_100.json',
              part_number: normPart,
              error: `EAN conflict between commercial catalog (${item.ean_gtin}) and registry (${regOffer.ean_gtin})`
            });
          }
        }
      }
    }
  }

  console.log('\n===============================================================');
  console.log('📊 AUDIT SUMMARY REPORT');
  console.log('===============================================================');
  console.log(`TOTAL_RECORDS_SCANNED       : ${totalScanned}`);
  console.log(`CONTRADICTION_VIOLATIONS    : ${contradictions.length}`);
  console.log(`GTIN_CHECK_DIGIT_FAILURES   : ${gtinErrors.length}`);
  console.log(`UNVERIFIED_ACTIVE_LEAKS     : ${unverifiedActives.length}`);
  console.log(`UNAUTHORIZED_ACTIVE_OFFERS  : ${unauthorizedActives.length}`);
  console.log('===============================================================\n');

  if (contradictions.length > 0 || gtinErrors.length > 0 || unverifiedActives.length > 0 || unauthorizedActives.length > 0) {
    console.error('❌ CONSISTENCY AUDIT FAILED:');
    for (const c of contradictions) console.error(`  - [CONTRADICTION] ${c.file} (${c.part_number || 'N/A'}): ${c.error}`);
    for (const g of gtinErrors) console.error(`  - [GTIN ERROR] ${g.file} (${g.part_number}): ${g.gtin} - ${g.error}`);
    for (const u of unverifiedActives) console.error(`  - [UNVERIFIED ACTIVE] ${u.file} (${u.part_number}): ${u.error}`);
    for (const a of unauthorizedActives) console.error(`  - [UNAUTHORIZED ACTIVE] ${a.file} (${a.part_number}): ${a.error}`);
    return { success: false, contradictions, gtinErrors, unverifiedActives, unauthorizedActives };
  }

  console.log('✅ ALL AFFILIATE MANIFESTS, GTINS, AND OFFERS ARE 100% CONSISTENT AND VERIFIED CLEAN!\n');
  return { success: true, contradictions, gtinErrors, unverifiedActives, unauthorizedActives };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkAffiliateConsistency();
  if (!result.success) {
    process.exit(1);
  }
}
