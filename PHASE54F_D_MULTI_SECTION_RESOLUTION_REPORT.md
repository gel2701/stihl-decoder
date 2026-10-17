# Phase 54F-D — Multi-Section Context Resolution & Non-Lossy Section Model Report

## 1. Executive Summary

Phase 54F-D successfully resolves the 958 staging observations across 399 model-part pairs previously frozen under `MULTI_SECTION_AMBIGUOUS` in Phase 54F-B. 

By dissecting the precedence masking in the Phase 54F-B staging adjudicator, Phase 54F-D revealed that the multi-section flag previously masked underlying catalog status:
- **24 pairs (50 observations)** were unmasked as missing the part in the catalog (`MULTI_SECTION_NEW_PART_REQUIRED`).
- **26 pairs (66 observations)** were unmasked as having the part in the catalog but lacking the base model fitment (`MULTI_SECTION_NEW_FITMENT_REQUIRED`).
- **7 pairs (16 observations)** were isolated to exact-variant scopes on `hs_81` (`MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED`).
- **8 pairs (16 observations)** were isolated to configuration-specific scopes on `fs_55`, `fs_85`, and `ms_261` (`MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED`).
- **334 pairs (810 observations)** represent legitimate, authentic multi-section placements for confirmed base-model fitments.

Rather than forcing arbitrary single-section winners or overwriting existing catalog records, Phase 54F-D implements an additive, non-lossy relational model:
`model_part_fitment_section_contexts`

All 810 legitimate section contexts were generated and seeded with complete evidence provenance, preserving all distinct section appearances without scalar mutations, without fitment duplication, and without false promotions.

---

## 2. Baseline & Candidate Tracking

- **Start Baseline**: `55af50478769e669d59c782e21f8553108c58db3` (includes Phase 54F-C closed, PR #20 merged, site-wide GA4 + Consent Mode live, PR #24 writeHead fix merged)
- **Working Branch**: `feat/phase54f-d-multisection-context-resolution`
- **PR**: #25 (to be opened against `main`)
- **PR State**: OPEN (NOT merged within this task)

---

## 3. Precedence Masking Dissection & Classification

In Phase 54F-B, the adjudicator checked:
```javascript
if (obsList.length > 1 && distinctSections.length > 1) {
  // Flagged as MULTI_SECTION_AMBIGUOUS before checking part or fitment existence!
}
```
This masked pairs where the part or fitment did not even exist in the catalog, as well as pairs with variant or configuration scoping constraints.

### Pair Classification Accounting (399 / 399)

| Classification Category | Model-Part Pairs | Staging Observations | Resolution Status |
|:---|:---:|:---:|:---|
| `LEGITIMATE_MULTI_SECTION_EXISTING_BASE_FITMENT` | 334 | 810 | **Resolved into Section Contexts** |
| `MULTI_SECTION_NEW_PART_REQUIRED` (unmasked) | 24 | 50 | Quarantined (missing part) |
| `MULTI_SECTION_NEW_FITMENT_REQUIRED` (unmasked) | 26 | 66 | Quarantined (missing fitment) |
| `MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED` | 7 | 16 | Quarantined (exact-variant scope) |
| `MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED` | 8 | 16 | Quarantined (configuration scope) |
| `ALIAS_COLLAPSED_SINGLE_SECTION` | 0 | 0 | N/A |
| **Total Multi-Section Input** | **399** | **958** | **Conserved 100%** |

### Observation-Level Accounting & Active Backlog

- **Total Staging Input**: 1,872 observations
- **Multi-Section Observations Input**: 958 observations
- **Non-Multisection Staging Observations (Untouched)**: 914 observations
- **Resolved Section Contexts**: 810 observations
- **Unresolved Multi-Section Backlog**: 148 observations (50 + 66 + 16 + 16)
- **Active Backlog After Phase 54F-D**: **1,062 observations** (1,872 - 810 = 1,062)

---

## 4. Non-Lossy Section Model Architecture

### Schema: `model_part_fitment_section_contexts`

```sql
CREATE TABLE IF NOT EXISTS model_part_fitment_section_contexts (
  context_id TEXT PRIMARY KEY,
  fitment_id TEXT NOT NULL,
  canonical_part_number TEXT NOT NULL,
  canonical_model_id TEXT NOT NULL,
  configuration_key TEXT,
  section_name_raw TEXT NOT NULL,
  section_name_canonical TEXT NOT NULL,
  diagram_position_raw TEXT NOT NULL,
  has_meaningful_position INTEGER NOT NULL DEFAULT 0,
  scope_type TEXT NOT NULL DEFAULT 'BASE_MODEL_GENERIC',
  source_evidence_id TEXT NOT NULL,
  FOREIGN KEY (fitment_id) REFERENCES model_part_fitments(id),
  FOREIGN KEY (canonical_part_number) REFERENCES parts(canonical_part_number),
  FOREIGN KEY (source_evidence_id) REFERENCES part_fitment_evidence(id)
);
CREATE INDEX IF NOT EXISTS idx_sec_ctx_fitment ON model_part_fitment_section_contexts(fitment_id);
CREATE INDEX IF NOT EXISTS idx_sec_ctx_part ON model_part_fitment_section_contexts(canonical_part_number);
CREATE INDEX IF NOT EXISTS idx_sec_ctx_model ON model_part_fitment_section_contexts(canonical_model_id);
```

### Relational Properties
- **Exact Count**: Exactly 810 contexts generated and stored in `data/model_part_fitment_section_contexts.json` and SQLite database.
- **Deduplication**: Deduplication across `(fitment_id, normalized_section_key, diagram_position)` yielded 810 unique contexts from 810 input observations (0 duplicate contexts).
- **Zero Orphan Contexts**: Every context references an existing, confirmed fitment in `model_part_fitments`, an existing part in `parts`, and a valid source observation in `observations.jsonl`.
- **Zero Arbitrary Winners**: Components appearing in multiple sections (e.g. screws, collar nuts, sealing rings in Crankcase, Starter, and Carburetor) preserve all distinct section placements.

---

## 5. Invariant Verification & Catalog Integrity

| Invariant Metric | Target | Actual | Status |
|:---|:---:|:---:|:---:|
| `PARTS` | 17,082 | 17,082 | PASS |
| `FITMENTS` | 175,106 | 175,106 | PASS |
| `CONFIGURATIONS` | 766 | 766 | PASS |
| `EVIDENCE` | 208,412 | 208,412 | PASS |
| `SECTION_CONTEXTS` | 810 | 810 | PASS |
| `SCALAR_SECTION_MUTATIONS` | 0 | 0 | PASS |
| `FITMENT_DUPLICATION` | 0 | 0 | PASS |
| `NEW_PARTS_CREATED` | 0 | 0 | PASS |
| `NEW_FITMENTS_CREATED` | 0 | 0 | PASS |
| `FALSE_PROMOTION_COUNT` | 0 | 0 | PASS |
| `VARIANT_LEAKAGE` | 0 | 0 | PASS |
| `CONFIGURATION_LEAKAGE` | 0 | 0 | PASS |
| `EXTERNAL_NETWORK_REQUESTS` | 0 | 0 | PASS |
| `PHASE54F_A_ACCEPTED_SET_MUTATIONS` | 0 | 0 | PASS |
| `PHASE54F_C_CANDIDATE_MUTATIONS` | 0 | 0 | PASS |
| `NON_MULTISECTION_STAGING_MUTATIONS` | 0 | 0 | PASS |

---

## 6. Audit & Test Suite Results

1. **Phase 54 Audits**:
   - `node scripts/validate_enrichment_provenance.mjs`: **PASS** (1,805 valid, 0 invalid, 0 leakage)
   - `node scripts/audit_phase54f_reharvest.mjs`: **PASS** (all invariants OK)
   - `node scripts/audit_phase54f_staging_adjudication.mjs`: **PASS** (all invariants OK)
   - `node scripts/audit_phase54f_b_promotion_eligibility.mjs`: **PASS** (all invariants OK)
   - `node scripts/audit_phase54f_c_evidence_escalation.mjs`: **PASS** (all invariants OK)
   - `node scripts/audit_phase54f_d_multisection_resolution.mjs`: **PASS** (10/10 gates pass)

2. **Test Suites**:
   - `node tests/phase54f_d_multisection_resolution.test.js`: **PASS** (16/16 tests pass)
   - `node tests/sitewide_google_analytics.test.js`: **PASS** (GA4 contract intact)
   - `npm test`: **PASS** (42/42 production suites pass)
   - `npm run test:e2e`: **PASS** (19/19 Playwright tests pass)

---

## 7. Next Steps & Phase Boundaries

Phase 54F-D strictly bounds its scope to resolving the multi-section ambiguity and creating the non-lossy section context relation.
Future phases will address:
- Phase 54F-E: Variant & Configuration Scope Resolution for the remaining 1,062 active staging backlog records.
- PR #25 is opened and kept OPEN for review; merging will occur only during dedicated close-gate procedures.
