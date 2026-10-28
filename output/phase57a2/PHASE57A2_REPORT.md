# STIHLDECODER — PHASE 57A.2 REPORT
# REAL DISCOVERY EVIDENCE & FAIL-CLOSED AFFILIATE IMPORT SECURITY

**Phase:** Phase 57A.2
**Repository:** `gel2701/stihl-decoder`
**Branch:** `fix/phase57a2-real-evidence-import-safety`
**Baseline Main SHA:** `6b83ddabfdbf937cd3e3adf5069b3bcee609a2bf`
**Status:** PASS

---

## 1. Executive Summary

Phase 57A.2 thoroughly resolves all provenance defects and import safety vulnerabilities identified following Phase 57A.1:
1. **Defect A Eliminated (Zero Synthetic Discovery):** Completely eliminated synthetic result counters, fake timestamps (`baseTime + offset`), and fabricated titles. Created `output/phase57a2/RAW_DISCOVERY_EVIDENCE.json` as the sole authoritative source of truth containing 60 actual executed queries across the 10-part cohort.
2. **Authoritative 10-Part Discovery Cohort:** Completed live multi-route discovery for 10 high-commercial parts, including mandatory items `1141 120 1600` (HD2 air filter), `0000 400 7000` (spark plug), `1123 160 2050` (clutch), and `0000 642 1236` (rim sprocket).
3. **Critical Mismatch Rejected & Documented (`0000 400 7000`):** STIHL reference documentation establishes `0000 400 7000` as NGK BPMR7A (M14 thread), whereas NGK CMR6H is `0000 400 7011` (M10 thread). The candidate mapping to ASIN `B001RMA5S2` has been strictly **REJECTED** as `PART_NUMBER_PRODUCT_IDENTITY_MISMATCH`. The discrepancy in the current catalog label has been documented in `output/phase57a2/CATALOG_LABEL_DISCREPANCIES.json`.
4. **Defect B Eliminated (Fail-Closed Importer Allowlist):** Hardened `scripts/import_verified_amazon_offers.mjs` to strictly accept only production-verified classifications (`VERIFIED_OEM_EXACT`, `VERIFIED_AFTERMARKET_EXACT`, `OEM_STIHL_EXACT`, `AFTERMARKET_EXACT_REFERENCE`). Hard rejects all non-verified classifications before defaulting. Forbids automatic creation of verification metadata.
5. **Defect C Eliminated (Evidence Source Contract):** Hardened `src/affiliate/AmazonExactMatchVerifier.js` and `src/affiliate/AmazonProductionOfferContract.js` to reject empty evidence objects like `[{}]`. Mandates full structured evidence objects (`type`, `url`, `title`, `claim`, valid ISO `retrieved_at`) and structured `proof` (`exact_part_number_found`, `asin_identity_verified`, `marketplace_verified`).
6. **Provider Defense-in-Depth:** Hardened `isValidManualAsinOverride` in `src/affiliate/AmazonAffiliateProvider.js` to validate production classifications, reject mismatches, and verify marketplace availability.
7. **Legacy Reclassification:** Reclassified 21 unevidenced records from Phase 57A.1 as `UNAUDITED_LEGACY_PHASE57A1`.

---

## 2. Baseline & Frozen Metrics

| Metric | Before Phase 57A.2 | After Phase 57A.2 | Change | Status |
|---|---|---|---|---|
| Canonical Parts | 17,082 | 17,082 | 0 | FROZEN |
| Direct Verified ASIN Links | 0 | 0 | 0 | FROZEN (Fail-closed) |
| Amazon Search Fallbacks | 17,082 | 17,082 | 0 | FROZEN |
| Uncontrolled /dp/ Links | 0 | 0 | 0 | CLEAN |
| Associate Tag | srihldecoder2-21 | srihldecoder2-21 | - | PRESERVED |
| Canonical Test Suites | 69 | 70 | +1 | 70/70 PASS |

---

## 3. Discovery Cohort Evaluation & Evidence Provenance

| Part Number | Name / Description | Live Queries Executed | Raw Evidence IDs | Discovered Candidate | Classification | Reason / Outcome |
|---|---|---|---|---|---|---|
| `1141 120 1600` | HD2 Air filter | 6 | 57A2-11411201600-Q1..Q6 | Stens 605-205 (ASIN B01LXML5G0 observed) | `DISCOVERED_UNVERIFIED` | Stens replacement confirmed; active listing on Amazon.nl unverified. Fail-closed. |
| `0000 400 7000` | Spark plug (catalog label NGK CMR6H) | 6 | 57A2-00004007000-Q1..Q6 | NGK CMR6H (ASIN B001RMA5S2) | `REJECTED` | `PART_NUMBER_PRODUCT_IDENTITY_MISMATCH`: 0000 400 7000 is NGK BPMR7A; CMR6H is 0000 400 7011. |
| `1123 160 2050` | Clutch assembly | 6 | 57A2-11231602050-Q1..Q6 | Stens 646-170 | `DISCOVERED_UNVERIFIED` | Stens replacement confirmed; ASIN unconfirmed on Amazon.nl. |
| `0000 642 1236` | Rim sprocket .325" 7T | 6 | 57A2-00006421236-Q1..Q6 | Oregon 11892 (ASIN B07VF4NN98 observed) | `DISCOVERED_UNVERIFIED` | Oregon 11892 cross-reference confirmed; ASIN B07VF4NN98 confirmed inactive on Amazon.nl. |
| `1118 195 3500` | Starter pawl spring clip | 6 | 57A2-11181953500-Q1..Q6 | STIHL OEM 1118 195 3500 | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |
| `1128 405 1000` | Spark plug boot cap | 6 | 57A2-11284051000-Q1..Q6 | STIHL OEM 1128 405 1000 | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |
| `0000 930 2208` | Starter cord 3.0mm x 30.5m | 6 | 57A2-00009302208-Q1..Q6 | STIHL OEM 0000 930 2208 | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |
| `1113 121 4705` | Metering diaphragm | 6 | 57A2-11131214705-Q1..Q6 | STIHL OEM / Walbro | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |
| `0000 350 3518` | Pickup body / fuel filter | 6 | 57A2-00003503518-Q1..Q6 | STIHL OEM 0000 350 3518 | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |
| `0000 642 1223` | Rim sprocket 3/8" 7T | 6 | 57A2-00006421223-Q1..Q6 | STIHL OEM 0000 642 1223 | `DISCOVERED_UNVERIFIED` | OEM identity confirmed; no verified direct ASIN on Amazon.nl. |

---

## 4. Security Audit & Negative Fixtures

11 negative security fixtures were tested directly against `import_verified_amazon_offers.mjs`:
1. `NOT_FOUND` + valid ASIN: **REJECTED**
2. `DISCOVERED_UNVERIFIED` + valid ASIN: **REJECTED**
3. `AMBIGUOUS` + valid ASIN: **REJECTED**
4. `UNAUDITED` + valid ASIN: **REJECTED**
5. `evidence_sources: [{}]` (empty evidence object): **REJECTED**
6. Missing structured proof (`proof: null`): **REJECTED**
7. `proof.marketplace_verified = false`: **REJECTED**
8. Missing `verification_status`: **REJECTED**
9. Missing `verification_method`: **REJECTED**
10. Missing `verified_at`: **REJECTED**
11. Known mismatch `0000 400 7000` + `B001RMA5S2`: **REJECTED**

**Result:** 11/11 rejected, 0 accepted, 0 dirty writes.

---

## 5. Provenance Hard Gates

- `SYNTHETIC_SEARCH_EVIDENCE`: 0 (PASS)
- `GENERATED_FAKE_EXECUTION_TIMESTAMPS`: 0 (PASS)
- `CLASSIFICATIONS_WITHOUT_RAW_EVIDENCE`: 0 (PASS)
- `NOT_FOUND_WITHOUT_EXECUTED_QUERY_SET`: 0 (PASS)
- `EMPTY_EVIDENCE_OBJECTS_ACCEPTED`: 0 (PASS)
- `INVALID_EVIDENCE_SOURCE_ENTRIES_ACCEPTED`: 0 (PASS)
- `NON_VERIFIED_CLASSIFICATIONS_IMPORTABLE`: 0 (PASS)
- `AUTO_VERIFICATION_METADATA_CREATED`: 0 (PASS)
- `UNVERIFIED_RECORDS_RENDERED_AS_DIRECT_PRODUCT`: 0 (PASS)
- `KNOWN_WRONG_ASIN_PART_MAPPING_ACCEPTED`: 0 (PASS)
- `FABRICATED_ASINS`: 0 (PASS)
- `GUESSED_ASINS`: 0 (PASS)

---

## 6. Catalog Label Discrepancy

- Part: `0000 400 7000`
- Current Catalog Label: `Spark plug NGK CMR6H`
- Authoritative STIHL Reality: `Spark plug NGK BPMR7A`
- Canonical Twin: `0000 400 7011` is `Stihl 00004007011 Spark Plug Ngk Cmr6H`
- Action: Catalog frozen; discrepancy formally recorded in `output/phase57a2/CATALOG_LABEL_DISCREPANCIES.json`.
