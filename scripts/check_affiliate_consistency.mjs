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
  // Phase 76 MS 440 / 044 Commercial Expansion (15 Sägenspezi Amazon.de offers)
  '30030005217', // 45cm Schwert-Set Drive + 2 Vollmeißelketten 3/8" 66TG 1.6mm (B00LAHENAA)
  '30030009417', // 45cm Schwert-Set Drive + 4 Vollmeißelketten 3/8" 66TG 1.6mm (B00LAHGMUE)
  '30030005221', // 50cm Schwert-Set Drive + 2 Vollmeißelketten 3/8" 72TG 1.6mm (B00LAHIYAU)
  '30030009421', // 50cm Schwert-Set Drive + 2 Halbmeißelketten 3/8" 72TG 1.6mm (B00LAHI9QE)
  '30030005231', // 63cm Führungsschiene Solid Drive 3/8" 84TG 1.6mm (B00LAHQF0Q)
  '30030009431', // 63cm Schwert-Set Solid Drive + 2 Vollmeißelketten 3/8" 84TG 1.6mm (B00LAHMFU0)
  '30030006041', // 75cm Schwert-Set Solid Drive + 2 Vollmeißelketten 3/8" 98TG 1.6mm (B00LAHP2KA)
  '00006421216', // Ringkettenrad 3/8" 8Z inkl. Nadellager 22.3mm (B00LPH14UW)
  '11281202202', // Flansch Adapter 044 / MS 440 (B07434JVX4)
  '00003503518', // Kraftstoffschlauch und Benzinfilter Set 044 / MS 440 (B00QM7TH36)
  '11286407112', // Schnecke für Ölpumpe 044 / MS 440 (B00LAHFW96)
  '11281200625', // Vergaser 044 / MS 440 (B00LAHQXLW)
  '11280201227', // Zylinder Kolben Set 50mm 12mm Kolbenbolzen 044 / MS 440 (B00LAHOFMQ)
  '11280802115', // Starter 044 / MS 440 (B00LAHP3AE)
  '11280071050', // Dichtsatz 044 / MS 440 (B00LAHMQD6)
  '30050004713', // Phase 75G MS 250 40cm .325" 1.6mm 62DL guide bar (Sägenspezi B00LAHOXZK)
  '11301402803', // Phase 75F MS 180 air filter housing with filter (Sägenspezi B00LAHKMBO)
  '36360000044', // Phase 75F MS 180 30cm 3/8" P 1.3mm 44DL saw chain (Sägenspezi B0723GG5VR)
  '11301200608', // Phase 75F MS 180 1-screw compensator carburetor C1Q-S152E (Sägenspezi B00LAHQFX8)
  '11236403800', // Phase 75E MS 170 oil pickup filter (RUURUU B0FP2XR798)
  '36360000055', // Phase 75E MS 170 40cm 3/8" P 1.3mm 55DL saw chain (Oregon 91PX055E B005MCM2YS)
  '11236402003', // Phase 75D MS 170 coverage
  '11300074100', // Phase 75D MS 170 coverage
  '30050003905', // Phase 75D MS 170 coverage
  '30050003909', // Phase 75D MS 170 coverage
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
  '11210201200', // SÃ¤genspezi Zylinder Kolben Set MS 260 44mm (B00PGX7STM)
  '11230302003', // SÃ¤genspezi Kolben 40mm MS 210 (B00LAHGFRO)
  '00006421223', // Oregon 68210 Rim Sprocket 3/8" 7T SD7 MS 440 (B00455Q028)
  '00006421231', // Oregon 18720 Rim Sprocket 3/8" 7T SM7 MS 261 / MS 290 (B000IBWVWG)
  '07811201109', // STIHL MultiLub Tandwielvet 80g Tube HS 45 (B007TK174M)
  '30050004809', // Oregon 140SDEA074 Zaagblad 14" MS 170 / MS 210 (B001FUALX0)
  '30050004813', // Oregon 160SDEA074 Zaagblad 16" MS 210 / MS 250 (B002VAAQC4)
  '56057504303', // STIHL 2-in-1 Feilenhalter 4.0mm MS 170 / MS 210 (B00CIRQW0K)
  // Phase 75 Commercial Expansion to Milestone 50 (Focus models + genuine brands)
  '30030002021', // STIHL Zaagblad 50 cm MS 440 / MS 461 (B00474612C)
  '42821401003', // STIHL Luchtfilterkap BR 600 (B08F9MY78P)
  '42821900303', // STIHL Trekstarter BR 600 (B08F9ML11Q)
  '42820071020', // STIHL Filterhuis ombouwset BR 600 (B08F9ML33K)
  '42410074100', // STIHL Service Kit 36 BG 86 (B09R1T61KL)
  '42410071700', // STIHL Membraanset BG 86 (B08F9MK77A)
  '42411401000', // STIHL Filterdeksel BG 86 (B08F9MX45K)
  '42410071003', // STIHL Dakgoot-set BG 86 (B0014D86AB)
  '11270802103', // STIHL Trekstarter MS 390 (B079DNL91A)
  '41470074102', // STIHL Service Kit 41 FS 460 (B09R1T6X4D)
  '41471410300', // STIHL Luchtfilter FS 460 (B08F9K47R9)
  '41471404400', // STIHL Voorfilter FS 460 (B09JGG2L99)
  '41471900600', // STIHL Startveer FS 460 (B08F9MKGTR)
  '41471602002', // STIHL Koppeling FS 460 (B08F9MQ91L)
  '11231201651', // STIHL Luchtfilter MS 210 (B079DM87N4)
  '11231900600', // STIHL Terugtrekveer MS 210 (B079DNM22P)
  '11230071061', // Walbro D10-WAT Membraanset MS 210 (B08F9ML22K)
  '11236402073', // STIHL Kettingwiel 6T MS 170 (B079DN88M2)
  '11291900601', // STIHL Startveer MS 170 (B079DNH91X)
  '11303500500', // STIHL Olietankdop MS 170 (B0014D8F1Y)
  '11300802100', // STIHL Trekstarter MS 170 (B079DNL19R)
  '36360000056', // STIHL PM3 Zaagketting MS 210 (B003V4L8NA)
  '07811201110', // STIHL Tandwielvet 225g FS 460 / FS 80 (B00474640Y)
  '30030003313', // STIHL Zaagblad Light 04 40cm MS 261 / MS 260 (B00474601A)
  // Phase 75B Commercial Expansion: Oregon 90PX050E chain for 3610 000 0050
  '36100000050', // Oregon 90PX050E Zaagketting 35cm 3/8" LP 1.1mm 50DL (B00HQ63YUY)
  // Phase 75C Expansion: 4 Amazon.nl verified parts + 6 SÃ¤genspezi Amazon.de parts
  '36100000044', // Oregon 90PX044E Zaagketting 30cm (B002X3IIYC)
  '41303506200', // Walbro 188-512-1 / Stens 615-764 Primerbalg (B0773YKFX3)
  '11230071060', // CÂ·TÂ·S / Walbro K20-WAT Carburateurset (B073NJNXMF)
  '40037102115', // STIHL AutoCut 46-2 Maaikop (B01BBVB4HY)
  '11301200603', // SÃ¤genspezi Vergaser MS 170 (B00LAHQK2Y)
  '11304001302', // SÃ¤genspezi ZÃ¼ndmodul MS 170 / MS 180 (B00LAHQD8A)
  '11231200605', // SÃ¤genspezi Vergaser MS 250 (B00LAHQRM2)
  '11211200611', // SÃ¤genspezi Carburateur MS 260 (B07MM5R1KG)
  '11230071000', // SÃ¤genspezi Kettingspanner zijdelings ombouwkit (B07F6CH3BV)
  '11231412200', // SÃ¤genspezi Ansaugstutzen MS 210 / MS 230 / MS 250 (B00LAHFB1U)
  // Phase 87 Amazon recovery: replacement listings for delisted amazon.nl ASINs,
  // each verified live in a browser with the exact STIHL number on the page and,
  // where marked, corroborated by an independent dealer catalog.
  '00003500527', // perfektGarten Tankdop FS 130 / TS 400 (B0G5PY252N, dealer-corroborated)
  '00003500533', // perfektGarten Olietankdop KM 90 / FR 130 (B0BBMPZQH6, dealer-corroborated)
  '11236402074', // Kitoo Kettingwiel .325 7T MS 250 (B007TK19WW, dealer-corroborated)
  '11230201209', // Adefol Cilinderkit 42,5mm MS 250 (B0GT2Q39PW, dealer-corroborated)
  '41370292300', // Gubeter Pakkingset FS 75 / FS 80 (B0BWSX4DWZ, dealer-corroborated)
  '41371242800', // SHIHAOHZ Voorfilter FS 75 / FS 80 (B0HRFKS4ZS, dealer-corroborated)
  '11281903400', // CCQDGMD ElastoStart MS 290 / MS 440 (B0FG7PKCLL, dealer-corroborated)
  '11271201620', // HOHMI Luchtfilter MS 290 / MS 390 (B0C38W9LC3, dealer-corroborated)
  '41401904009', // Cancanle Trekstarter FS 38 / FS 55 (B07BLSL3VM, dealer-corroborated)
  '41340802101', // CÂ·TÂ·S Trekstarterhuis FS 120 / FS 250 (B079WS2YNM, dealer-corroborated)
  // Phase 87.1 Amazon.nl expansion (33 offers, exact STIHL number on a live listing)
  '11216402004', // B0FHGT11FS
  '11351201600', // B0FYVHH8X9
  '11351201601', // B0GTKD4BY2
  '42821410300', // B0GTK68VQB
  '41371290900', // B0HNWJ6QJ1
  '11300201208', // B0GT5PS87K
  '41371241500', // B01FFSP4KW
  '41371904000', // B07DBQDWFJ
  '11300802100', // B07PMN12MM
  '00003500514', // B01HIMBJW0
  '00007906100', // B0CKDLDLN6
  '11351602050', // B07CG6WHMB
  '41401602005', // B0FN3WS6X6
  '41401602909', // B0B3HSP2F6
  '11224001314', // B0GLZ5VH12
  '11256402005', // B07CTMC8P3
  '11270302007', // B0FXV83XYQ
  '11271602051', // B073Z5D69N
  '41801602900', // B0G7GRK8V5
  '41801900400', // B0D17BN556
  '42231950600', // B0GVKYCQ26
  '11350802102', // B078ZT4FXF
  '41341410500', // B0HPGBB4WT
  '41371602900', // B0CYQ7YLRW
  '41471904003', // B0F4CH2K5R
  '00009302211', // B0B4S6N8VF
  '08123701000', // B0827VHM5T
  '11171824500', // B0CQ2LDCF7
  '95129332260', // B0HNCDGLD2
  '00001903400', // B005ESHWO0
  '00006421234', // B0GVDJKLFH
  '00006421239', // B0HLL7RCVD
  '00006421240', // B0BDDNNNV6
  // Phase 87.2 Amazon Maximum Activation (16 NL + 4 DE, within 100/50 caps)
  '41477108108', // B08TRF8B6H (STIHL Deflector FS 460)
  '00009302246', // B01FW5336K (STIHL Maaidraad 2.4mm x 253m)
  '11256401701', // B007TK1BK2 (STIHL Kettingwielafdekking MS 260/440)
  '41404001308', // B007TK0L6W (STIHL Ontstekingsmodule FS 55/HS 45)
  '41401900601', // B08TRJRV2S (STIHL Terugtrekveer FS 55/38)
  '41447108117', // B08TRJMVRK (STIHL Deflector FS 55/70)
  '42291201800', // B0GVRCPL89 (Qiuwanzia Luchtfilter BG 55/85)
  '41197106000', // B07HLM39J5 (Cancanle Afsnijmes FS 55/350/460)
  '41371200636', // B0HLBHL5DG (C·T·S Carburateur FS 75/80/85)
  '11271201621', // B08K3LCV69 (ProPart Vlies Luchtfilter MS 290/310/390)
  '11280802104', // B083NQJ7WW (Wifehelper Trekstarter MS 440/044)
  '11287901750', // B0749N79V2 (QHALEN Handgreepbeugel MS 440/044)
  '11281602004', // B0D2KM9XR6 (DLUPING Koppeling MS 440/044)
  '11351400650', // B07YGQMS5W (Hippotech Uitlaatdemper MS 361)
  '11280201250', // B09TQYZCWF (GardenPal Cilinder-zuigerset MS 461)
  '11237911702', // B0CXHYGL8W (perfektGarten Handgreepbeugel MS 230/250)
  '36100000055', // B004U7B83M (STIHL Zaagketting 40cm 1.1mm 55TG, DE)
  '11231201612', // B007TK18ZU (STIHL Luchtfilter MS 210/230/250, DE)
  '11221903400', // B006VYS29A (STIHL ElastoStart MS 460/660/661, DE)
  '11216403203'  // B098BFMP68 (C·T·S Oliepomp MS 240/260, DE)
]);

export function checkAffiliateConsistency() {
  console.log('===============================================================');
  console.log('ðŸ›¡ï¸  PHASE 60Q: CROSS-MANIFEST AFFILIATE CONSISTENCY CHECKER');
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
      console.log(`â© Skipping optional/missing manifest: ${manifest.name}`);
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

    console.log(`â–¶ Auditing ${records.length} records in ${manifest.name} (${manifest.type})...`);

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
    const regOffersList = (regDoc.offers || []).filter(o => !o.marketplace || o.marketplace === 'amazon.nl');

    for (const item of (comDoc.parts || [])) {
      const normPart = PartNormalizer.normalizePartNumber(item.part_number);
      if (item.commercial_tier === 'DIRECT_VERIFIED') {
        const regOffer = regOffersList.find(o => PartNormalizer.normalizePartNumber(o.part_number) === normPart && (!item.asin || o.asin === item.asin)) ||
                         regOffersList.find(o => PartNormalizer.normalizePartNumber(o.part_number) === normPart);
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
  console.log('ðŸ“Š AUDIT SUMMARY REPORT');
  console.log('===============================================================');
  console.log(`TOTAL_RECORDS_SCANNED       : ${totalScanned}`);
  console.log(`CONTRADICTION_VIOLATIONS    : ${contradictions.length}`);
  console.log(`GTIN_CHECK_DIGIT_FAILURES   : ${gtinErrors.length}`);
  console.log(`UNVERIFIED_ACTIVE_LEAKS     : ${unverifiedActives.length}`);
  console.log(`UNAUTHORIZED_ACTIVE_OFFERS  : ${unauthorizedActives.length}`);
  console.log('===============================================================\n');

  if (contradictions.length > 0 || gtinErrors.length > 0 || unverifiedActives.length > 0 || unauthorizedActives.length > 0) {
    console.error('âŒ CONSISTENCY AUDIT FAILED:');
    for (const c of contradictions) console.error(`  - [CONTRADICTION] ${c.file} (${c.part_number || 'N/A'}): ${c.error}`);
    for (const g of gtinErrors) console.error(`  - [GTIN ERROR] ${g.file} (${g.part_number}): ${g.gtin} - ${g.error}`);
    for (const u of unverifiedActives) console.error(`  - [UNVERIFIED ACTIVE] ${u.file} (${u.part_number}): ${u.error}`);
    for (const a of unauthorizedActives) console.error(`  - [UNAUTHORIZED ACTIVE] ${a.file} (${a.part_number}): ${a.error}`);
    return { success: false, contradictions, gtinErrors, unverifiedActives, unauthorizedActives };
  }

  console.log('âœ… ALL AFFILIATE MANIFESTS, GTINS, AND OFFERS ARE 100% CONSISTENT AND VERIFIED CLEAN!\n');
  return { success: true, contradictions, gtinErrors, unverifiedActives, unauthorizedActives };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkAffiliateConsistency();
  if (!result.success) {
    process.exit(1);
  }
}
