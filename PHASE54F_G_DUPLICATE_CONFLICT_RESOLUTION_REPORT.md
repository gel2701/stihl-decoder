# StihlDecoder — Phase 54F-G
## Duplicate & Canonical Section Conflict Resolution Report

**Phase:** Phase 54F-G  
**Baseline SHA:** `29a7ad24c5095f1dcd615e08a6969a58f3721ad2`  
**Branch:** `feat/phase54f-g-duplicate-conflict-resolution`  
**Date:** 2026-10-18  
**Router:** 9Router  
**Codex Gate:** None (no Codex review, no Codex gate, no Codex artifacts, no Codex approval)

---

## 1. Executive Summary

Phase 54F-G processes the exact 9 staging observations from `data/harvest/phase54f/staging_adjudication.json` designated as:
- `DUPLICATE_OR_REDUNDANT`: 5 observations
- `CONFLICTING_CANONICAL_SECTION`: 4 observations

All 9 target observations have been 100% evaluated and resolved:
1. **5/5 Duplicates Resolved**: Verified against canonical base fitments with identical normalized section keys. Safely resolved as `CORROBORATING_DUPLICATE_RESOLVED` with zero mutations, zero promotions, and zero data duplication.
2. **4/4 Conflicts Resolved Non-Lossy**: Verified against confirmed canonical base fitments. Because the source evidence documents genuine alternative diagram placements on the base machine, each observation is preserved additively in `data/model_part_fitment_section_contexts.json` (`SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT`) while the existing scalar canonical section names in `model_part_fitments` remain 100% immutable (`SCALAR_SECTION_MUTATIONS = 0`).
3. **Additive Context Growth**: Canonical section contexts grew strictly from 810 to 814 (+4 contexts), preserving all 810 historical contexts with complete provenance and zero leakage.
4. **Active Backlog Conservation**: Active staging backlog reduced from 1,062 to 1,053. The 1,053 out-of-scope staging observations remain strictly untouched.
5. **Zero External Requests**: Handled completely using local canonical records and staging files (`EXTERNAL_NETWORK_REQUESTS = 0`).

---

## 2. Ingested Cohorts & Conservation Accounting

```text
ACTIVE_BACKLOG_BEFORE          = 1062
TARGET_OBSERVATIONS_TOTAL      = 9
  - DUPLICATE_OR_REDUNDANT     = 5
  - CONFLICTING_CANONICAL_SEC  = 4
OUT_OF_SCOPE_BACKLOG           = 1053

CONSERVATION_INVARIANT         : 9 + 1053 === 1062 (VERIFIED)

RESOLVED_DUPLICATES            = 5
RESOLVED_CONFLICTS             = 4
TOTAL_RESOLVED_OBSERVATIONS    = 9
ACTIVE_BACKLOG_AFTER           = 1053 (1062 - 9 = 1053)
```

---

## 3. Duplicate Resolution Ledger (5/5 Corroborating Duplicates)

All 5 duplicate observations correspond to parts and base fitments already established in the canonical catalog with identical normalized section keys:

| Evidence ID | Model | Part Number | Source Section | Canonical Section | Fitment Scope | Final Status |
|:---|:---|:---|:---|:---|:---|:---|
| `ev_p54f_ms_260_11216403202_oil_pump` | MS 260 | `11216403202` | Oil Pump | Oil pump (`oil_pump`) | `BASE_MODEL_CONFIRMED` | `CORROBORATING_DUPLICATE_RESOLVED` |
| `ev_p54f_ts_410_42380202613_crankcase` | TS 410 | `42380202613` | Crankcase | Crankcase (`crankcase`) | `BASE_MODEL_CONFIRMED` | `CORROBORATING_DUPLICATE_RESOLVED` |
| `ev_p54f_ts_410_42383500854_tank_housing` | TS 410 | `42383500854` | Tank Housing | Tank housing (`tank_housing`) | `BASE_MODEL_CONFIRMED` | `CORROBORATING_DUPLICATE_RESOLVED` |
| `ev_p54f_br_600_42827901305_control_handle` | BR 600 | `42827901305` | Control Handle | Control handle (`control_handle`) | `BASE_MODEL_CONFIRMED` | `CORROBORATING_DUPLICATE_RESOLVED` |
| `ev_p54f_br_600_42821900303_rewind_starter` | BR 600 | `42821900303` | Rewind Starter | Rewind starter (`rewind_starter`) | `BASE_MODEL_CONFIRMED` | `CORROBORATING_DUPLICATE_RESOLVED` |

- **New Parts Created:** 0
- **New Fitments Created:** 0
- **New Evidence Records:** 0
- **New Contexts:** 0

---

## 4. Conflicting Canonical Section Ledger (4/4 Non-Lossy Contexts)

Each conflict was examined against canonical base fitments and source diagram documentation:

| Evidence ID | Model | Part Number | Source Diagram Section | Canonical Scalar Section | Resolution Action | Fitment Scope | Final Status |
|:---|:---|:---|:---|:---|:---|:---|:---|
| `ev_p54f_fs_400_41287107108_h_clutch_housing` | FS 400 | `41287107108` | H-Clutch Housing | Drive Tube Assembly | Add context `ctx_fit_fs_400_41287107108_base_h_clutch_housing_na` | `BASE_MODEL_CONFIRMED` | `SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT` |
| `ev_p54f_ts_350_11064051000_b_cylinder` | TS 350 | `11064051000` | B-Cylinder | Connector | Add context `ctx_fit_ts_350_11064051000_base_b_cylinder_na` | `BASE_MODEL_CONFIRMED` | `SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT` |
| `ev_p54f_br_600_42820212502_cylinder` | BR 600 | `42820212502` | Cylinder | Engine | Add context `ctx_fit_br_600_42820212502_base_cylinder_na` | `BASE_MODEL_CONFIRMED` | `SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT` |
| `ev_p54f_br_600_99910035087_fan_housing` | BR 600 | `99910035087` | Fan Housing | Engine | Add context `ctx_fit_br_600_99910035087_base_fan_housing_na` | `BASE_MODEL_CONFIRMED` | `SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT` |

### Non-Lossy Model Implementation
- Scalar `section_name` and `section_key` in `model_part_fitments` are **not altered** (`SCALAR_SECTION_MUTATIONS = 0`).
- The 4 source-observed diagram placements are stored additively in `data/model_part_fitment_section_contexts.json` and the SQLite `model_part_fitment_section_contexts` table.
- Each context includes complete provenance: `fitment_id`, `canonical_model_id`, `part_number`, `source_evidence_id`, `source_url`, `source_scope = MODEL_LEVEL_ONLY`, `variant_key = base`, and a deterministic 64-character SHA-256 provenance hash.
- **Section Contexts Count:** 810 -> 814 (+4). All original 810 contexts are 100% preserved.

---

## 5. Active Staging Backlog Reconciliation

```text
ACTIVE_BACKLOG_START          : 1062
TARGET_COHORT_OBSERVATIONS    : 9 (5 duplicate + 4 conflict)
RESOLVED_OBSERVATIONS         : 9 (5 corroborating + 4 additional context)
UNRESOLVED_OBSERVATIONS       : 0
ACTIVE_BACKLOG_END            : 1053 (1062 - 9)
PROTECTED_OUT_OF_SCOPE        : 1053
CONSERVATION_RECONCILIATION   : 9 + 1053 === 1062 (EXACT)
```

Remaining 1,053 observations breakdown:
- `NEW_PART_CANDIDATE`: 383 observations (333 original + 50 unmasked in 54F-D)
- `NEW_FITMENT_CANDIDATE`: 377 observations (311 original + 66 unmasked in 54F-D)
- `VARIANT_SCOPE_UNRESOLVED`: 151 observations (135 original + 16 unmasked in 54F-D)
- `CONFIGURATION_SCOPE_UNRESOLVED`: 142 observations (126 original + 16 unmasked in 54F-D)
- **Total:** 383 + 377 + 151 + 142 = 1,053 observations.

---

## 6. Catalog Counts & Invariant Freezes

| Metric | Baseline (54F-F) | Phase 54F-G | Delta | Status |
|:---|:---|:---|:---|:---|
| **Parts** | 17,082 | 17,082 | +0 | FROZEN |
| **Fitments** | 175,106 | 175,106 | +0 | FROZEN |
| **Configurations** | 766 | 766 | +0 | FROZEN |
| **Evidence** | 208,412 | 208,412 | +0 | FROZEN |
| **Section Contexts** | 810 | 814 | +4 | ADDITIVE RESOLUTION |
| **Active Staging Backlog** | 1,062 | 1,053 | -9 | RESOLVED |
| **Scalar Section Mutations**| 0 | 0 | 0 | IMMUTABLE |
| **Variant Leakage** | 0 | 0 | 0 | ZERO LEAKAGE |
| **Configuration Leakage** | 0 | 0 | 0 | ZERO LEAKAGE |
| **False Resolutions** | 0 | 0 | 0 | ZERO FALSE RES |
| **External Requests** | 0 | 0 | 0 | ZERO NETWORK |

---

## 7. Verification Gates & Audit Results

1. **Provenance & Scope Validator**:
   - `node scripts/validate_enrichment_provenance.mjs` -> PASS (1,805 valid enrichments, 0 errors).
2. **Historical Phase Audits (1-8)**:
   - `node scripts/audit_phase54f_reharvest.mjs` -> PASS (All Phase 54F-A invariants OK).
   - `node scripts/audit_phase54f_staging_adjudication.mjs` -> PASS (All 1,872 items accounted).
   - `node scripts/audit_phase54f_b_promotion_eligibility.mjs` -> PASS (All 612 candidate reviews OK).
   - `node scripts/audit_phase54f_c_evidence_escalation.mjs` -> PASS (All Tier-3 research gates OK).
   - `node scripts/audit_phase54f_d_multisection_resolution.mjs` -> PASS (399 pairs / 958 obs / 810 contexts preserved).
   - `node scripts/audit_phase54f_e_scope_resolution.mjs` -> PASS (293 scope obs evaluated, 0 mutations).
   - `node scripts/audit_phase54f_f_unmasked_evidence.mjs` -> PASS (50 pairs / 116 obs unmasked evidence OK).
3. **Phase 54F-G Duplicate & Conflict Audit**:
   - `node scripts/audit_phase54f_g_duplicate_conflict_resolution.mjs` -> PASS (All 10 verification gates OK, idempotency verified).
4. **Analytics Gate**:
   - `node tests/sitewide_google_analytics.test.js` -> PASS (Direct site-wide GA4 tag & Consent Mode intact).
5. **Full Production Test Suite**:
   - `npm test` -> PASS (45 suites, 45 passed, 0 failures).
6. **End-to-End Test Suite**:
   - `npm run test:e2e` -> PASS (19 Playwright browser tests, 19 passed, 0 failures).
7. **Clean Checkout Verification**:
   - Verified in isolated worktree with clean npm install and database seed.

---

## 8. Certification

Phase 54F-G is fully verified, audited, and certified for candidate PR creation against `main`.
- **Status:** PASS
- **Candidate Head:** Pending commit on `feat/phase54f-g-duplicate-conflict-resolution`
- **Target Merge Baseline:** `29a7ad24c5095f1dcd615e08a6969a58f3721ad2`
