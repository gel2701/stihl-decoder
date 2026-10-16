# Phase 54F-A-R2 — Evidence Scope Hardening & Variant Leakage Elimination Report

**Repository**: `gel2701/stihl-decoder`<br>
**Production**: `https://www.stihldecoder.nl`<br>
**Baseline SHA**: `b2a8d4259d8c7661c31e68af3b043a8acec846fc`<br>
**Branch**: `feat/phase54f-controlled-technical-reharvest`<br>
**PR Number**: `17`<br>
**Review Policy**: `CODEX_REVIEW_REQUIRED = NO`<br>
**PR Policy**: `PR_OPEN = YES`, `PR_MERGED = NO`

---

## 1. Executive Summary

Phase 54F-A executes a controlled, fail-closed technical reharvest pilot aimed at recovering authentic exploded-view diagram/assembly section context for STIHL parts previously cataloged under `"Unresolved Diagram Section"`.

Prior to Phase 54F-A, only 857 parts (5.02%) and 2,798 fitments (1.60%) possessed meaningful diagram assembly sections, despite 16,600 parts and 169,990 fitments having genuine diagram callout positions.

### R1 Reconciliation:
Phase 54F-A-R1 eliminated synthetic configuration generation (`SYNTHETIC_SOURCE_CONFIGURATION_KEYS = 0`), quarantined all 399 multi-section ambiguous model-part pairs (`AMBIGUOUS_ENRICHMENTS_PROMOTED = 0`), and isolated model-level evidence from configuration-specific fitments (`configuration_key != null`).

### R2 Root Cause & Evidence Scope Hardening:
In Phase 54F-A-R2, forensic auditing identified a critical semantic defect in R1:
- **1,708 enrichments** were applied to `EXACT_VARIANT` fitments (e.g., `ms_261` variants such as `c_be`, `c_bm`, `c_m`, `c_m_vw`), even though the supporting diagram source observations were explicitly `MODEL_LEVEL_ONLY` with `variant_key = null`.
- **Root Cause**: The R1 selection filter checked `fit.configuration_key !== null` but omitted checking `fit.variant_key !== null` or `fit.fitment_scope === 'EXACT_VARIANT'`. Consequently, `variant_key = null` functioned as an inadvertent wildcard across all model variants.
- **Rule Enforced**: `NO CLAIM MAY BE MORE SPECIFIC THAN ITS SUPPORTING EVIDENCE` (`evidence specificity >= claim specificity`). A model-level diagram source can NEVER be promoted to prove an exact-variant fitment claim. `variant_key = null` is strictly not a wildcard.
- **Resolution**: Implemented `src/parts/EnrichmentScopeValidator.js` and CLI runner `scripts/validate_enrichment_provenance.mjs`. Enforced fail-closed filtering in `scripts/phase54f_reharvest.mjs`:
  - Exactly **1,708** invalid model-level to exact-variant promotions rejected.
  - Exactly **1,805** safe `BASE_MODEL_CONFIRMED` enrichments accepted and seeded.
  - Conservation: `1,805 (safe) + 1,708 (rejected) = 3,513 (R1 total)`.
  - Promoted canonical evidence updated to exactly 1,805 records. The 193 variant-only pairs remain in staging (1,679 R1 + 193 = 1,872 staging evidence). Total valid observations conserved: `1,805 + 1,872 = 3,677`.
  - Database reseeded cleanly: PARTS = 17,082, FITMENTS = 175,106, CONFIGURATIONS = 766, EVIDENCE = 208,412.
  - Meaningful sections: PARTS = 2,210 (+1,353 over baseline), FITMENTS = 4,603 (+1,805 over baseline).
  - Positions strictly frozen at 16,600 parts and 169,990 fitments.

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
| **NEW_DIAGRAM_HARVEST_REQUESTS** | 0 (R1 & R2) | 0 | PASS |
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

### Valid Observations Scope Classification:
| Classification Category | Observations Count | Notes |
| :--- | :--- | :--- |
| **CANONICAL_EVIDENCE_PROMOTED** | 1,805 | Safe unambiguous base-model evidence promoted to canonical DB |
| **STAGING_ONLY_EVIDENCE** | 1,872 | Quarantined in staging; not promoted to canonical DB |
| **VALID_OBSERVATIONS_CONSERVATION** | 3,677 | 1,805 (promoted) + 1,872 (staging) = 3,677 |

### Staging-Only Observations Breakdown (1,872 records):
1. **Ambiguous Multi-Section Observations on Existing Fitments**: 842 records (representing part/model pairs appearing in >1 diagram section).
2. **Variant-Only Model-Part Pairs (No Base-Model Fitment)**: 193 records (model-part pairs present in canonical fitments only under exact variants).
3. **Configuration-Specific Only Fitment Observations**: 77 records (part/model pairs that only exist in canonical fitments with `configuration_key != null`).
4. **New Part Candidate Observations**: 383 records (318 unique valid 11-digit part numbers not in canonical 17,082 parts).
5. **New Fitment Candidate Observations**: 377 records (337 unique model-part pairs not in canonical 175,106 fitments).
6. **Sum**: 842 + 193 + 77 + 383 + 377 = **1,872** (100% exact mathematical conservation).

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
| **MODEL_LEVEL_SECTION_PROPAGATED_TO_EXACT_VARIANT_FITMENTS** | 0 | Zero exact-variant fitments mutated |
| **MODEL_LEVEL_TO_EXACT_VARIANT_LEAKAGE** | 0 | Zero leakage verified by `EnrichmentScopeValidator` |
| **NULL_VARIANT_KEY_EXACT_VARIANT_ENRICHMENTS** | 0 | Zero null wildcard promotions |
| **EXACT_VARIANT_ENRICHMENTS_REJECTED** | 1,724 | 1,708 candidate fitments + 16 staging fitments rejected |
| **R1_TOTAL_ENRICHMENTS** | 3,513 | Historical R1 total before variant isolation (formerly misnamed R1_EXACT_VARIANT_ENRICHMENTS) |
| **R1_SAFE_BASE_MODEL_ENRICHMENTS** | 1,805 | Safe base-model enrichments confirmed |
| **R1_INVALID_MODEL_LEVEL_TO_EXACT_VARIANT** | 1,708 | Exactly eliminated in R2 (1,805 + 1,708 = 3,513) |
| **TOTAL_ENRICHMENTS** | 1,805 | Safe `BASE_MODEL_CONFIRMED` enrichments |
| **MODEL_LEVEL_ENRICHMENTS** | 1,805 | 100% of accepted enrichments are base model |
| **EXACT_VARIANT_ENRICHMENTS** | 0 | 0 exact variant claims made from model-level evidence |
| **SECTION_ENRICHMENT_LOOKUP_MODE** | `EXACT_FITMENT_ID_ONLY` | Fallbacks eliminated in seed |

---

## 5. Scope Before vs Scope After Comparison

| Pipeline Stage / Scope | Phase 54F-A-R1 | Phase 54F-A-R2 | Net Change / Action |
| :--- | :--- | :--- | :--- |
| **`BASE_MODEL_CONFIRMED` Enrichments** | 1,805 | 1,805 | Retained & Verified |
| **`EXACT_VARIANT` Enrichments** | 1,708 | 0 | **-1,708 (Eliminated)** |
| **Total Section Enrichments Applied** | 3,513 | 1,805 | -1,708 (Strict Specificity Bound) |
| **Model-Level to Variant Leakage** | 1,708 | 0 | **0 Leakage (PASS)** |
| **Promoted Canonical Evidence** | 1,998 | 1,805 | -193 (Variant-only pairs kept in staging) |
| **Staging-Only Evidence** | 1,679 | 1,872 | +193 (Safely retained in staging) |
| **Total Valid Observations** | 3,677 | 3,677 | 0 (Conserved) |

---

## 6. Candidate Registry

| Metric | Observations Count | Unique Entities Count | Canonical Infiltration |
| :--- | :--- | :--- | :--- |
| **NEW_PART_CANDIDATES** | 383 | 318 | 0 (Canonical `parts = 17082` frozen) |
| **NEW_FITMENT_CANDIDATES** | 377 | 337 | 0 (Canonical `fitments = 175106` frozen) |

---

## 7. Catalog & Section Coverage Comparison

| Metric | Before (Phase 54E Baseline) | After (Phase 54F-A-R2 Final) | Net Safe Change |
| :--- | :--- | :--- | :--- |
| **PARTS** | 17,082 | 17,082 | 0 (Strictly frozen) |
| **FITMENTS** | 175,106 | 175,106 | 0 (Strictly frozen) |
| **CONFIGURATIONS** | 766 | 766 | 0 (Strictly frozen) |
| **EVIDENCE** | 206,607 | 208,412 | +1,805 safe accepted evidence |
| **PARTS_WITH_MEANINGFUL_SECTION** | 857 (5.02%) | 2,210 (12.94%) | **+1,353 (+157.9%)** |
| **FITMENTS_WITH_MEANINGFUL_SECTION** | 2,798 (1.60%) | 4,603 (2.63%) | **+1,805 (+64.5%)** |
| **VALID_SECTION_ENRICHMENTS** | 0 | 1,805 | +1,805 safe unambiguous base-model |
| **PARTS_WITH_MEANINGFUL_POSITION** | 16,600 (97.18%) | 16,600 (97.18%) | 0 (Strictly preserved) |
| **FITMENTS_WITH_MEANINGFUL_POSITION** | 169,990 (97.08%) | 169,990 (97.08%) | 0 (Strictly preserved) |
| **RAW_PLACEHOLDER_POSITIONS** | 5,116 | 5,116 | 0 (Strictly preserved) |
| **FALSE_POSITIVE_SECTION_ASSIGNMENTS** | 0 | 0 | 0 (100% verified provenance) |

---

## 8. Quality & Provenance Verification

- **Deterministic Sample Verification**: Checked 25 random enriched fitment records against raw observations:
  - Sample size: 25
  - Sample failures: 0
  - False-positive section assignments: 0
- **Scope & Provenance Validator (`EnrichmentScopeValidator`)**:
  - Total records audited: 1,805
  - Valid records: 1,805 (100%)
  - Invalid records: 0
  - Model-level to exact-variant leakage: 0
  - Null-variant-key exact-variant enrichments: 0
- **Canonical Evidence Referential Integrity**:
  - `PROMOTED_EVIDENCE_WITH_UNKNOWN_PART = 0`
  - `PROMOTED_EVIDENCE_WITH_UNKNOWN_FITMENT = 0`
  - Every promoted observation references a verified canonical part, verified model, and verified base-model fitment (`fitment_scope = BASE_MODEL_CONFIRMED`).
- **Section Normalization Determinism**:
  - Raw section names normalized deterministically via `src/parts/SectionNormalizer.js` and `data/parts_section_aliases.json`.
  - Zero fabricated section titles.
- **Diagram Position Preservation**:
  - Diagram position callouts remain strictly untouched. The 16,600 parts and 169,990 fitments with meaningful positions are 100% intact.
- **Clean Reseed Reproducibility**:
  - `node data/seed.cjs` verified from clean state: builds exact SQLite state matching canonical counts.
  - `CLEAN_RESEED_REPRODUCIBLE = YES`.

---

## 9. Frozen Subsystem Verification

| Subsystem | Verified Invariants | Status |
| :--- | :--- | :--- |
| **SEO Pilot (Phase 54D)** | Pilot size = 50 parts, 231 total sitemap URLs, 0 set changes, robots tags clean | PASS |
| **Amazon Commercial (Phase 54A)** | 0 direct ASIN links, 17,082 search fallback links, 0 unverified product claims | PASS |
| **Supersessions (Phase 54E-R2)** | 22 relations, 11 reconfirmed, 11 unconfirmed fail-closed, 0 globalized | PASS |
| **Runtime Scraping** | `RUNTIME_TECHNICAL_SCRAPING = 0` (0 runtime external network calls) | PASS |

---

## 10. Test & Audit Suite Results

| Test / Audit Command | Result | Details |
| :--- | :--- | :--- |
| `node scripts/validate_enrichment_provenance.mjs` | **PASS** | 1,805 valid enrichments, 0 invalid, 0 variant leakage |
| `node --test tests/phase54f_controlled_reharvest.test.js` | **PASS** | 8 Section 12 test suites passed cleanly |
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

## 11. Phase 54F-A-R2 Close Gate & Status

```text
PHASE_54F_A_R2 = PASS
READY_FOR_PHASE_54F_A_CLOSE
PR_OPEN = YES
PR_MERGED = NO
PHASE54F_B_STARTED = NO
```
