# Phase 54F-E — Variant & Configuration Scope Resolution Report

## 1. Executive Summary

Phase 54F-E addresses the staging scope backlog consisting of 293 observations across 276 unique model-part pairs:
- **151 variant scope observations** (142 unique pairs): 135 from Phase 54F-B + 16 unmasked from Phase 54F-D.
- **142 configuration scope observations** (134 unique pairs): 126 from Phase 54F-B + 16 unmasked from Phase 54F-D.
- **Protected out-of-scope backlog**: Exactly 769 observations (383 new part [333 + 50], 377 new fitment [311 + 66], 5 duplicate, 4 section conflict).
- **Conservation**: 293 scope input + 769 out-of-scope = 1,062 active backlog observations conserved (`ACTIVE_BACKLOG_BEFORE = 1062`).

Under strict Phase 54F-E constraints:
1. **Repository Evidence Only**: Zero external network requests (`EXTERNAL_NETWORK_REQUESTS = 0`).
2. **Rule 13 & 15 (Candidate Uniqueness != Source Evidence)**: Even if a single candidate variant or configuration fitment exists in the database for a given model and part, model-level evidence cannot be promoted to that narrow variant or configuration without explicit identity in the stored source evidence.
3. **No Synthetic Configurations & No Broad-to-Narrow Inferences**: Zero guessing, zero AI inference.
4. **Result**: All 293 observations originate from `diyspareparts.com` with `source_scope: 'MODEL_LEVEL_ONLY'`, base-model URLs, and no explicit variant or configuration markers. Consequently, all 293 observations correctly remain unresolved (`FALSE_SCOPE_RESOLUTION_COUNT = 0`).
5. **Backlog Conservation**: `ACTIVE_BACKLOG_AFTER = 1062`.

---

## 2. Baseline & Candidate Tracking

- **Start Baseline**: `894eaa3eb9d2ec76e09bc3f75e50e6a5d4366826` (`main` post-PR #25 merge)
- **Branch**: `feat/phase54f-e-scope-resolution`
- **Candidate Head**: (to be recorded at commit)
- **PR**: Open against `main` (title: `feat(parts): Phase 54F-E variant and configuration scope resolution`)
- **PR State**: OPEN (NOT merged within this task)

---

## 3. Scope Cohort Accounting & Conservation

| Category | Origin Phase | Observations | Unique Pairs | Status |
|:---|:---:|:---:|:---:|:---|
| Variant Scope Unresolved | Phase 54F-B | 135 | 135 | Evaluated |
| Multi-Section Variant Scope Unresolved | Phase 54F-D | 16 | 7 | Evaluated |
| **Total Variant Scope Input** | — | **151** | **142** | **100% Accounted** |
| Configuration Scope Unresolved | Phase 54F-B | 126 | 126 | Evaluated |
| Multi-Section Configuration Scope Unresolved | Phase 54F-D | 16 | 8 | Evaluated |
| **Total Configuration Scope Input** | — | **142** | **134** | **100% Accounted** |
| **Total Phase 54F-E Scope Input** | — | **293** | **276** | **100% Accounted** |
| New-Part Candidates (quarantined) | 54F-B + 54F-D | 383 (333 + 50) | — | Protected / Untouched |
| New-Fitment Candidates (quarantined) | 54F-B + 54F-D | 377 (311 + 66) | — | Protected / Untouched |
| Duplicate / Redundant | Phase 54F-B | 5 | — | Protected / Untouched |
| Conflicting Canonical Section | Phase 54F-B | 4 | — | Protected / Untouched |
| **Total Protected Out-of-Scope Backlog** | — | **769** | — | **0 Mutations** |
| **Active Staging Backlog Before** | — | **1,062** | — | **Conservation: 293 + 769 = 1,062** |

---

## 4. Classification Breakdown

### 4.1 Variant Scope Classification (151 Observations / 142 Unique Pairs)

| Classification Status | Count | Rationale / Forensics |
|:---|:---:|:---|
| `VARIANT_SCOPE_RESOLVED_EXPLICIT_SOURCE_IDENTITY` | 0 | No stored source evidence contains explicit variant tokens. |
| `VARIANT_SCOPE_UNRESOLVED_MODEL_LEVEL_ONLY` | 7 | Single candidate variant exists in catalog (`fs_55` [4], `ms_260` [1]), but source evidence is strictly base-model level. Promotion forbidden by Rule 13 (`UNIQUE DATABASE CANDIDATE != SOURCE EVIDENCE`). |
| `VARIANT_SCOPE_AMBIGUOUS_MULTIPLE_CANONICAL_MATCHES` | 144 | Multiple canonical variant fitments exist in catalog (e.g. `hs_81` variants `r`, `rc_e`, `t`, `tc_e`). Source provides no discriminator. |
| `VARIANT_SCOPE_CONFLICTING_SOURCE_IDENTITY` | 0 | No conflicting source markers. |
| `VARIANT_SCOPE_NO_EXISTING_EXACT_FITMENT` | 0 | Existing exact fitments verified in DB. |
| `VARIANT_SCOPE_INVALID_SOURCE_METADATA` | 0 | Raw metadata valid and well-formed. |
| **Total Variant Observations** | **151** | **Sum: 151 / 151 exact** |

### 4.2 Configuration Scope Classification (142 Observations / 134 Unique Pairs)

| Classification Status | Count | Rationale / Forensics |
|:---|:---:|:---|
| `CONFIGURATION_SCOPE_RESOLVED_EXPLICIT_SOURCE_IDENTITY` | 0 | No stored source evidence contains explicit configuration tokens. |
| `CONFIGURATION_SCOPE_UNRESOLVED_MODEL_LEVEL_ONLY` | 92 | Single candidate configuration fitment in catalog, but source is base-model level. Promotion forbidden by Rule 15 (`UNIQUE DATABASE CANDIDATE != SOURCE EVIDENCE`). |
| `CONFIGURATION_SCOPE_AMBIGUOUS_MULTIPLE_CANONICAL_MATCHES` | 50 | Multiple canonical configurations exist in catalog. Source provides no discriminator. |
| `CONFIGURATION_SCOPE_CONFLICTING_SOURCE_IDENTITY` | 0 | No conflicting source markers. |
| `CONFIGURATION_SCOPE_NO_EXISTING_EXACT_FITMENT` | 0 | Existing configuration fitments verified in DB. |
| `CONFIGURATION_SCOPE_INVALID_SOURCE_METADATA` | 0 | Raw metadata valid and well-formed. |
| **Total Configuration Observations** | **142** | **Sum: 142 / 142 exact** |

---

## 5. Additive Scope Resolution Architecture

To safely support explicit scope resolutions without mutating raw historical evidence or existing catalog fitments, Phase 54F-E introduces:

### Schema: `part_fitment_scope_resolutions`

```sql
CREATE TABLE IF NOT EXISTS part_fitment_scope_resolutions (
  resolution_id VARCHAR(150) PRIMARY KEY,
  source_evidence_id VARCHAR(150) UNIQUE NOT NULL,
  resolved_fitment_id VARCHAR(150) NOT NULL,
  resolved_scope_type VARCHAR(50) NOT NULL,
  resolved_variant_key VARCHAR(50),
  resolved_configuration_key VARCHAR(100),
  resolution_status VARCHAR(100) NOT NULL,
  provenance_hash VARCHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scope_res_fitment ON part_fitment_scope_resolutions(resolved_fitment_id);
CREATE INDEX IF NOT EXISTS idx_scope_res_source ON part_fitment_scope_resolutions(source_evidence_id);
```

- **Canonical Tracked File**: `data/part_fitment_scope_resolutions.json`
- **Record Count**: 0 (retained with `record_count: 0, resolutions: []` for full reproducibility and schema readiness).
- **SQLite Seeding**: Fully integrated into `data/seed.cjs`.

---

## 6. Invariant Verification & Catalog Freezes

| Metric | Baseline | Target | Actual | Status |
|:---|:---:|:---:|:---:|:---|
| `PARTS` | 17,082 | 17,082 | 17,082 | **PASS** (0 new parts) |
| `FITMENTS` | 175,106 | 175,106 | 175,106 | **PASS** (0 new fitments) |
| `CONFIGURATIONS` | 766 | 766 | 766 | **PASS** (0 synthetic configs) |
| `EVIDENCE` | 208,412 | 208,412 | 208,412 | **PASS** (0 raw evidence mutations) |
| `SECTION_CONTEXTS` | 810 | 810 | 810 | **PASS** (0 D-contexts mutations) |
| `SCALAR_SECTION_MUTATIONS` | 0 | 0 | 0 | **PASS** (170,503 unresolved preserved) |
| `FALSE_SCOPE_RESOLUTIONS` | 0 | 0 | 0 | **PASS** (Zero guessing) |
| `VARIANT_LEAKAGE` | 0 | 0 | 0 | **PASS** (Zero leakage) |
| `CONFIGURATION_LEAKAGE` | 0 | 0 | 0 | **PASS** (Zero leakage) |
| `EXTERNAL_NETWORK_REQUESTS` | 0 | 0 | 0 | **PASS** (Zero HTTP requests) |

---

## 7. Audit Results

All 7 Phase 54 audits execute and pass cleanly:
1. `node scripts/validate_enrichment_provenance.mjs`: **PASS**
2. `node scripts/audit_phase54f_reharvest.mjs`: **PASS**
3. `node scripts/audit_phase54f_staging_adjudication.mjs`: **PASS**
4. `node scripts/audit_phase54f_b_promotion_eligibility.mjs`: **PASS**
5. `node scripts/audit_phase54f_c_evidence_escalation.mjs`: **PASS**
6. `node scripts/audit_phase54f_d_multisection_resolution.mjs`: **PASS**
7. `node scripts/audit_phase54f_e_scope_resolution.mjs`: **PASS**

---

## 8. Analytics & Test Suite Verification

- **Analytics Protection**: `node tests/sitewide_google_analytics.test.js` **PASS** (`GA4_ID = G-P2V0J69LDX`, `CONSENT_MODE = PRESERVED`, `WRITEHEAD_FIX = PRESERVED`).
- **Phase 54F-E Dedicated Test**: `tests/phase54f_e_scope_resolution.test.js` **13/13 PASS**.
- **Production Suite**: `npm test` **43/43 suites PASS** (`FAILED = 0`).
- **E2E Tests**: `npm run test:e2e` **19/19 PASS**.

---

## 9. Next Steps

- **PR**: Open PR to `main` with title `feat(parts): Phase 54F-E variant and configuration scope resolution`.
- **CI**: Verify `trust-audit`, `browser-e2e`, and `node-contract-tests` succeed on candidate HEAD.
- **Merge**: PR remains OPEN per instructions (`PR_MERGED = NO`, `NEXT_PHASE_STARTED = NO`).
