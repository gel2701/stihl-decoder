# Phase 54F-A — Controlled Technical Reharvest Pilot & Section Resolution Report

**Repository**: `gel2701/stihl-decoder`  
**Production**: `https://www.stihldecoder.nl`  
**Baseline SHA**: `b2a8d4259d8c7661c31e68af3b043a8acec846fc`  
**Branch**: `feat/phase54f-controlled-technical-reharvest`  
**PR Number**: `17`
**Review Policy**: `CODEX_REVIEW_REQUIRED = NO`  
**PR Policy**: `PR_OPEN = YES`, `PR_MERGED = NO`  

---

## 1. Executive Summary

Phase 54F-A executes a controlled, fail-closed technical reharvest pilot aimed at recovering authentic exploded-view diagram/assembly section context for STIHL parts previously cataloged under `"Unresolved Diagram Section"`. 

Prior to Phase 54F-A, only 857 parts (5.02%) and 2,798 fitments (1.60%) had meaningful diagram assembly sections, despite 16,600 parts and 169,990 fitments having genuine diagram callout positions. 

Phase 54F-A proves that missing diagram assembly context can be deterministically and safely recovered from structured external technical sources using a strictly rate-limited, staging-first architecture with zero count drift and zero runtime scraping.

### R1 Scope & Promotion Hardening Summary:
Under Phase 54F-A-R1, the promotion logic was strictly hardened to eliminate over-propagation and ambiguity:
1. **Context Scope Integrity**: Model-level source observations (`source_scope = 'MODEL_LEVEL_ONLY'`) are strictly isolated to base-model canonical fitments (`configuration_key === null`). Model-level sections are NEVER propagated to configuration-specific fitments (`MODEL_LEVEL_SECTION_PROPAGATED_TO_CONFIGURATION_SPECIFIC_FITMENTS = 0`).
2. **Synthetic Configuration Elimination**: Removed all generated/invented configuration identities (`SYNTHETIC_SOURCE_CONFIGURATION_KEYS = 0`). All raw harvest observations record `configuration_key = null`, `configuration_name = null`, and `variant_key = null`.
3. **Multi-Section Ambiguity Quarantine**: All 399 model-part pairs appearing across multiple distinct diagram sections (958 observations total, representing 1,518 candidate fitments) are quarantined to `conflicts.json` without selecting an arbitrary winner (`AMBIGUOUS_ENRICHMENTS_PROMOTED = 0`).
4. **Canonical Evidence Promotion Safety**: Separated raw harvest observations (`observations.jsonl`, 3,677 valid records) from canonical accepted evidence (`accepted_evidence.jsonl`, 1,998 records). Staging-only observations (1,679 records) are not promoted to canonical evidence until configuration or catalog identity is resolved.
5. **Exact Fitment ID Lookup Only**: In `data/seed.cjs`, section enrichment lookup uses `sectionEnrichmentMap.get(f.fitment_id)` only (`SECTION_ENRICHMENT_LOOKUP_MODE = EXACT_FITMENT_ID_ONLY`), eliminating broad part+model fallbacks.
6. **Robots Compliance Verified**: Independent HTTP check of `https://www.diyspareparts.com/robots.txt` returned HTTP 404 (no disallow rules for diagram paths; `TARGET_PATH_ALLOWED = true`).
7. **Report & Manifest Reconciled**: Manifest metrics and report metrics are 100% mathematically conserved with 0 discrepancies (`REPORT_MANIFEST_METRIC_MISMATCHES = 0`).

---

## 2. Reharvest Pilot Execution Metrics

| Metric | Planned Limit | Actual Measured | Status |
| :--- | :--- | :--- | :--- |
| **PILOT_MODELS_QUEUED** | <= 50 | 16 | PASS |
| **MODELS_ATTEMPTED** | <= 50 | 16 | PASS |
| **MODELS_RESOLVED** | - | 13 | PASS (81.25% resolution) |
| **MODELS_NO_DATA** | - | 3 (`ms_362`, `038`, `066`) | PASS (Legitimate fail-closed) |
| **MAX_HTTP_REQUESTS** | 250 | 250 | PASS |
| **HTTP_REQUESTS_USED** | <= 250 | 219 | PASS (Budget respected) |
| **NEW_DIAGRAM_HARVEST_REQUESTS** | 0 (R1) | 0 | PASS |
| **COMPLIANCE_REQUESTS** | <= 1 | 1 | PASS |
| **CONCURRENCY** | 1 | 1 | PASS |
| **MIN_DELAY_BETWEEN_REQUESTS** | >= 3000ms | >= 3000ms | PASS |
| **SOURCES_ATTEMPTED** | - | 1 (DIY Spare Parts) | PASS |
| **SOURCES_BLOCKED** | 0 | 0 | PASS (0 CAPTCHAs, 0 403s) |
| **ROBOTS_FETCH_STATUS** | - | `404_NO_DISALLOW` | PASS |
| **ROBOTS_POLICY_VERIFIED** | YES | YES | PASS |
| **TARGET_PATH_ALLOWED** | YES | YES | PASS |

---

## 3. Raw Harvest & Staging Accounting

| Metric | Value | Conservation Notes |
| :--- | :--- | :--- |
| **OBSERVATIONS_RAW_ATTEMPTED** | 3,719 | Total observation records captured during pilot crawl |
| **OBSERVATIONS_UNIQUE_VALID** | 3,677 | Distinct valid observations with full provenance |
| **OBSERVATIONS_DUPLICATE** | 42 | Exact duplicate evidence IDs suppressed during crawl |
| **OBSERVATIONS_QUARANTINED** | 0 | 0 malformed part numbers or invalid sections |
| **RAW_CONSERVATION** | 3,719 | 3,677 (valid) + 42 (duplicate) + 0 (quarantined) = 3,719 |

### Raw Valid Observations Classification:
| Classification Category | Observations Count | Notes |
| :--- | :--- | :--- |
| **CANONICAL_EVIDENCE_PROMOTED** | 1,998 | Unambiguous base-model evidence promoted to canonical DB |
| **STAGING_ONLY_EVIDENCE** | 1,679 | Quarantined in staging; not promoted to canonical DB |
| **VALID_OBSERVATIONS_CONSERVATION** | 3,677 | 1,998 (promoted) + 1,679 (staging) = 3,677 |

### Staging-Only Observations Breakdown (1,679 records):
1. **Ambiguous Multi-Section Observations on Existing Fitments**: 842 records (representing part/model pairs appearing in >1 diagram section).
2. **Configuration-Specific Only Fitment Observations**: 77 records (part/model pairs that only exist in canonical fitments with `configuration_key != null`).
3. **New Part Candidate Observations**: 383 records (318 unique valid 11-digit part numbers not in canonical 17,082 parts).
4. **New Fitment Candidate Observations**: 377 records (337 unique model-part pairs not in canonical 175,106 fitments).
5. **Sum**: 842 + 77 + 383 + 377 = **1,679** (100% exact mathematical conservation).

---

## 4. Ambiguity Quarantine & Scope Integrity

| Metric | Value | Requirement / Gate |
| :--- | :--- | :--- |
| **MULTI_SECTION_MODEL_PART_PAIRS** | 399 | Recorded in `conflicts.json` |
| **TOTAL_AMBIGUOUS_SOURCE_OBSERVATIONS** | 958 | Total observations across all 399 multi-section pairs |
| **AMBIGUOUS_SOURCE_OBSERVATIONS** | 842 | Ambiguous observations on existing canonical fitments |
| **AMBIGUOUS_ENRICHMENTS_REJECTED** | 1,518 | Potential fitments blocked from arbitrary assignment |
| **AMBIGUOUS_ENRICHMENTS_PROMOTED** | 0 | Strict fail-closed gate passed |
| **AMBIGUOUS_PAIR_PROMOTED_TO_SINGLE_SECTION** | 0 | Strict fail-closed gate passed |
| **CONFIGURATION_SPECIFIC_SOURCE_OBSERVATIONS** | 0 | DIY Spare Parts source is model-level only |
| **MODEL_LEVEL_SOURCE_OBSERVATIONS** | 3,677 | All valid observations marked `MODEL_LEVEL_ONLY` |
| **SYNTHETIC_SOURCE_CONFIGURATION_KEYS** | 0 | Zero invented configurations |
| **MODEL_LEVEL_TO_CONFIG_PROMOTIONS** | 0 | Zero model-to-config propagation |
| **MODEL_LEVEL_SECTION_PROPAGATED_TO_CONFIGURATION_SPECIFIC_FITMENTS** | 0 | Zero configuration-specific fitments mutated |
| **SECTION_ENRICHMENT_LOOKUP_MODE** | `EXACT_FITMENT_ID_ONLY` | Fallbacks eliminated in seed |

---

## 5. Candidate Registry

| Metric | Observations Count | Unique Entities Count | Canonical Infiltration |
| :--- | :--- | :--- | :--- |
| **NEW_PART_CANDIDATES** | 383 | 318 | 0 (Canonical `parts = 17082` frozen) |
| **NEW_FITMENT_CANDIDATES** | 377 | 337 | 0 (Canonical `fitments = 175106` frozen) |

---

## 6. Catalog & Section Coverage Comparison

| Metric | Before (Phase 54E Baseline) | After (Phase 54F-A-R1 Final) | Net Safe Change |
| :--- | :--- | :--- | :--- |
| **PARTS** | 17,082 | 17,082 | 0 (Strictly frozen) |
| **FITMENTS** | 175,106 | 175,106 | 0 (Strictly frozen) |
| **CONFIGURATIONS** | 766 | 766 | 0 (Strictly frozen) |
| **EVIDENCE** | 206,607 | 208,605 | +1,998 safe accepted evidence |
| **PARTS_WITH_MEANINGFUL_SECTION** | 857 (5.02%) | 2,302 (13.48%) | **+1,445 (+168.6%)** |
| **FITMENTS_WITH_MEANINGFUL_SECTION** | 2,798 (1.60%) | 6,311 (3.60%) | **+3,513 (+125.6%)** |
| **VALID_SECTION_ENRICHMENTS** | 0 | 3,513 | +3,513 safe unambiguous base-model |
| **PARTS_WITH_MEANINGFUL_POSITION** | 16,600 (97.18%) | 16,600 (97.18%) | 0 (Strictly preserved) |
| **FITMENTS_WITH_MEANINGFUL_POSITION** | 169,990 (97.08%) | 169,990 (97.08%) | 0 (Strictly preserved) |
| **RAW_PLACEHOLDER_POSITIONS** | 5,116 | 5,116 | 0 (Strictly preserved) |
| **FALSE_POSITIVE_SECTION_ASSIGNMENTS** | 0 | 0 | 0 (100% verified provenance) |

---

## 7. Quality & Provenance Verification

- **Deterministic Sample Verification**: Checked 25 random enriched fitment records against raw observations:
  - Sample size: 25
  - Sample failures: 0
  - False-positive section assignments: 0
- **Canonical Evidence Referential Integrity**:
  - `PROMOTED_EVIDENCE_WITH_UNKNOWN_PART = 0`
  - `PROMOTED_EVIDENCE_WITH_UNKNOWN_FITMENT = 0`
  - Every promoted observation references a verified canonical part, verified model, and verified base-model fitment.
- **Section Normalization Determinism**:
  - Raw section names normalized deterministically via `src/parts/SectionNormalizer.js` and `data/parts_section_aliases.json`.
  - Zero fabricated section titles.
- **Diagram Position Preservation**:
  - Diagram position callouts remain strictly untouched. The 16,600 parts and 169,990 fitments with meaningful positions are 100% intact.
- **Clean Reseed Reproducibility**:
  - `node data/seed.cjs` verified from clean state: builds exact SQLite state matching canonical counts.
  - `CLEAN_RESEED_REPRODUCIBLE = YES`.

---

## 8. Frozen Subsystem Verification

| Subsystem | Verified Invariants | Status |
| :--- | :--- | :--- |
| **SEO Pilot (Phase 54D)** | Pilot size = 50 parts, 231 total sitemap URLs, 0 set changes, robots tags clean | PASS |
| **Amazon Commercial (Phase 54A)** | 0 direct ASIN links, 17,082 search fallback links, 0 unverified product claims | PASS |
| **Supersessions (Phase 54E-R2)** | 22 relations, 11 reconfirmed, 11 unconfirmed fail-closed, 0 globalized | PASS |
| **Runtime Scraping** | `RUNTIME_TECHNICAL_SCRAPING = 0` (0 runtime external network calls) | PASS |

---

## 9. Test & Audit Suite Results

| Test / Audit Command | Result | Details |
| :--- | :--- | :--- |
| `npm test` | **PASS** | 37 test suites passed cleanly (including 18 Phase 54F unit tests) |
| `npm run test:e2e` | **PASS** | 19 of 19 Playwright tests passed |
| `npm run audit:parts-catalog` | **PASS** | Catalog audit passed (1429 models audited) |
| `node scripts/audit_public_trust_claims.mjs` | **PASS** | 258 pages, 18,393 links, 0 broken, 0 claim errors |
| `node scripts/audit_parts_seo.mjs` | **PASS** | Hub, 24 series, 85 model parts, 50 pilot parts 100% clean |
| `node scripts/audit_amazon_affiliate_links.mjs` | **PASS** | 0 direct ASINs, 17,082 fallback search links verified |
| `node scripts/audit_part_indexation_pilot.mjs` | **PASS** | 50 pilot parts valid, metadata clean, sitemap exact |
| `node scripts/audit_parts_technical_enrichment.mjs` | **PASS** | R2 exact-pair provenance & encoding invariants verified (0 errors) |
| `node scripts/audit_phase54f_reharvest.mjs` | **PASS** | Staging artifacts, observations, enrichments & DB verified (0 errors) |
| `git diff --check` | **PASS** | 0 trailing whitespaces, 0 git diff check errors |

---

## 10. Phase 54F-B Expansion Readiness & Merge Gate

- `VALID_SECTION_ENRICHMENTS > 0`: YES (3,513 safe enrichments)
- `MULTI_SECTION_UNSAFE_PROMOTION = 0`: YES (0)
- `CONFIGURATION_GLOBALIZATION = 0`: YES (0)
- `CANONICAL_EVIDENCE_REFERENTIAL_INTEGRITY = PASS`: YES (0 unknown parts/fitments)
- `REPORT_MANIFEST_METRIC_MISMATCHES = 0`: PASS (100% reconciled)
- `ROBOTS_ACCESS_POLICY = PASS`: YES (404 no disallow rules)
- `SAMPLE_FAILURES = 0`: YES (0)
- `FALSE_POSITIVE_SECTION_ASSIGNMENTS = 0`: YES (0)
- `ALL_REGRESSION_TESTS_PASS = YES`: YES (37 suites pass)
- **`READY_FOR_PHASE54F_B_EXPANSION = YES`**
- **`READY_FOR_PROTECTED_MERGE = YES`**
- **`PHASE54F_A_R1_COMPLETE = YES`**
- **`PHASE54F_A_MERGED = NO`**
- **`PHASE54F_B_STARTED = NO`** (Strict fail-closed hard stop)
