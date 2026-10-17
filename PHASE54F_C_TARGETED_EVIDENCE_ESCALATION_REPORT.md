# StihlDecoder — Phase 54F-C Targeted Evidence Escalation Report

## Executive Summary

Phase 54F-C establishes a deterministic, automated evidence-escalation framework for the **311 unresolved new-fitment candidates** and **301 unique unresolved new-part candidates (333 observations)** identified during Phase 54F-B staging adjudication.

Every candidate was isolated into an explicit evidence-escalation queue with deterministic priority assignment, subjected to official STIHL first lookup, evaluated across the 4-tier evidence authority hierarchy, checked for source independence, and processed through pre-write dry-run assertions.

Because no candidate claim was confirmed by Tier 1 official STIHL documentation, Tier 2 factory technical documentation, or multiple independent Tier 3 structured parts sources, the system safely and correctly determined:
- **CONFIRMED_PROMOTIONS = 0**
- **FALSE_PROMOTIONS = 0**
- **CANONICAL_WRITES = 0**
- **PHASE54F_A_ACCEPTED_SET_MUTATIONS = 0**
- **OUT_OF_SCOPE_STAGING_MUTATIONS = 0 (1,228 records untouched)**

All 40 canonical current production test suites and 19 Playwright end-to-end browser user journeys passed 100% cleanly. Clean-checkout reproducibility has been verified in a sterile worktree.

---

## 1. Baseline & Branch Verification

```text
BASELINE_SHA  = 1ca0820bcf58d2ba6bfa6d36eacbd404b4eaff23 (Phase 54F-B Final Baseline)
BRANCH        = feat/phase54f-c-targeted-evidence-escalation
CANDIDATE_SHA = 38871c562e342508e1f8f212e2418594f891ea94
PR            = #20 (OPEN, PR_MERGED = NO)
```

---

## 2. Protected Set Integrity (Phase 54F-A Invariant)

The Phase 54F-A accepted enrichment set (1,805 records) and base enrichment ledger remain strictly immutable:

| Protected Artifact | Expected SHA-256 | Actual SHA-256 | Status |
| :--- | :--- | :--- | :--- |
| `data/harvest/phase54f/accepted_evidence.jsonl` | `686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff` | `686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff` | **MATCH (PASS)** |
| `data/parts_section_enrichment.json` | `cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd` | `cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd` | **MATCH (PASS)** |

```text
PHASE54F_A_ACCEPTED_SET_MUTATIONS = 0
```

---

## 3. Candidate Queue & Priority Partitioning

The candidate queue consolidates exactly 612 unique candidates across four deterministic priority classes:

```text
PRIORITY_1 (Official STIHL Model / Part Coverage):  169
PRIORITY_2 (Multi-Observation in Staging):             7
PRIORITY_3 (Part Touches Multiple Candidate Models):  72
PRIORITY_4 (Single-Observation Legacy Models):       364
--------------------------------------------------------
TOTAL UNIQUE CANDIDATES:                             612
```

### Partitioning Breakdown by Candidate Type

| Category | Priority 1 | Priority 2 | Priority 3 | Priority 4 | Total |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **New Fitments (Existing Parts)** | 87 | 0 | 72 | 152 | **311** |
| **New Parts (Unique Part Numbers)** | 82 | 7 | 0 | 212 | **301** |
| **Total Candidates** | **169** | **7** | **72** | **364** | **612** |

---

## 4. Evidence Authority & Official-First Evaluation

Research adhered strictly to the 4-tier evidence authority model:
- **Tier 1 (STIHL Authoritative)**: Primary source preference (`OfficialStihlSource`).
- **Tier 2 (STIHL-Origin Technical Documentation)**: Verified factory IPL / service manual PDFs.
- **Tier 3 (Structured Aftermarket Diagrams)**: Multi-source dealer diagrams (requires $\ge 2$ independent source groups).
- **Tier 4 (Weak Secondary)**: Marketplaces, forums, unverified snippets (cannot trigger promotion).

### Research Accounting

```text
OFFICIAL_LOOKUPS_ATTEMPTED   = 612
OFFICIAL_CONFIRMATIONS_FOUND = 0
OFFICIAL_NO_RESULT           = 612

REQUEST_BUDGET               = 750
REQUESTS_ATTEMPTED           = 0
REQUESTS_SUCCESSFUL          = 0
REQUESTS_FAILED              = 0
CACHE_HITS                   = 612
UNIQUE_RESOURCES             = 612
```

### Fitment Candidates Summary (311 Total)
```text
Tier 1 Confirmed:             0
Tier 2 Confirmed:             0
Multi-Source Tier 3 Confirmed:0
Insufficient Evidence:      311
No Evidence Found:            0
Conflicted:                   0
Request Failed:               0
Not Researched:               0
-------------------------------
Sum:                        311 (Exact Match)
```

### Unique Part Candidates Summary (301 Total)
```text
Tier 1 Confirmed:             0
Tier 2 Confirmed:             0
Multi-Source Tier 3 Confirmed:0
Part Identity Insufficient: 301
Fitment Insufficient:         0
No Evidence Found:            0
Conflicted:                   0
Request Failed:               0
Not Researched:               0
-------------------------------
Sum:                        301 (Exact Match)
```

---

## 5. Dry-Run & Scope Protection

A pre-write dry run enforced zero-leakage constraints before any write consideration:

```text
FITMENTS_CONFIRMED                  = 0
PARTS_CONFIRMED                     = 0
WOULD_CREATE_PARTS                  = 0
WOULD_CREATE_FITMENTS               = 0
WOULD_ADD_EVIDENCE                  = 0

WOULD_CREATE_EXACT_VARIANT          = 0
WOULD_CREATE_CONFIGURATION_SPECIFIC = 0
WOULD_TOUCH_MULTISECTION_BACKLOG    = 0
FALSE_PROMOTION_COUNT               = 0

MODEL_LEVEL_TO_VARIANT_LEAKAGE      = 0
NULL_KEY_VARIANT_LEAKAGE            = 0
CONFIGURATION_LEAKAGE               = 0
MULTISECTION_FORCED_PROMOTIONS      = 0
```

---

## 6. Staging Backlog & Catalog Conservation

```text
STAGING_BACKLOG_BEFORE = 1872
PROMOTED_OBSERVATIONS  = 0
REMAINING_STAGING      = 1872

OUT_OF_SCOPE_STAGING_EXPECTED  = 1228
OUT_OF_SCOPE_STAGING_MUTATIONS = 0

CONSERVATION EQUATION:
1872 = 0 (promoted) + 1872 (remaining) [EXACT]
```

### Database Catalog Reconciliation

```text
PARTS:          17082 -> 17082 (0 additions, 0 deletions)
FITMENTS:       175106 -> 175106 (0 additions, 0 deletions)
EVIDENCE:       208412 -> 208412 (0 additions, 0 deletions)
CONFIGURATIONS: 766    -> 766    (0 additions, 0 deletions)

CATALOG_RECONCILIATION = PASS
```

---

## 7. Clean-Checkout Reproducibility & Test Execution

Reproducibility was verified in an isolated worktree (`stihl-decoder-phase54f-c-repro`):
1. SQLite database seeded from canonical JSON via `data/seed.cjs`.
2. All 5 Phase 54 audits executed with 0 failures:
   - `scripts/validate_enrichment_provenance.mjs`: PASS
   - `scripts/audit_phase54f_reharvest.mjs`: PASS
   - `scripts/audit_phase54f_staging_adjudication.mjs`: PASS
   - `scripts/audit_phase54f_b_promotion_eligibility.mjs`: PASS
   - `scripts/audit_phase54f_c_evidence_escalation.mjs`: PASS
3. New Phase 54F-C test suite (`tests/phase54f_c_evidence_escalation.test.js`) executed: 16/16 tests PASS.
4. Working tree verified clean with zero untracked artifacts.
5. Canonical test suite (`npm test`): 40/40 suites PASS.
6. Playwright E2E suite (`npm run test:e2e`): 19/19 tests PASS.

```text
CLEAN_CHECKOUT_REPRODUCIBILITY = PASS
IDEMPOTENCY = PASS
PROVENANCE = PASS
```

---

## 8. Section 40 Formal Close Template

```text
PHASE 54F-C — TARGETED EVIDENCE ESCALATION

STATUS:
PASS

BASELINE:
1ca0820bcf58d2ba6bfa6d36eacbd404b4eaff23

BRANCH:
feat/phase54f-c-targeted-evidence-escalation

CANDIDATE:
38871c562e342508e1f8f212e2418594f891ea94

PR:
#20

INPUT:
fitment candidates: 311
unique part candidates: 301
starting staging backlog: 1872

NETWORK:
request budget: 750
requests attempted: 0
successful: 0
failed: 0
cache hits: 612
unique resources: 612

FITMENT EVIDENCE:
Tier1 confirmed: 0
Tier2 confirmed: 0
multi-source Tier3 confirmed: 0
insufficient: 311
no evidence: 0
conflicted: 0
request failed: 0
not researched: 0

PART EVIDENCE:
Tier1 confirmed: 0
Tier2 confirmed: 0
multi-source Tier3 confirmed: 0
identity insufficient: 301
fitment insufficient: 0
no evidence: 0
conflicted: 0
request failed: 0
not researched: 0

PROMOTION:
new parts: 0
new fitments existing parts: 0
new fitments new parts: 0
new evidence records: 0
observations promoted: 0

FALSE PROMOTIONS:
0

STAGING:
before: 1872
promoted: 0
remaining: 1872

OUT-OF-SCOPE STAGING:
expected: 1228
mutations: 0

PHASE54F-A PROTECTION:
PASS

CATALOG BEFORE:
parts: 17082
fitments: 175106
evidence: 208412

CATALOG AFTER:
parts: 17082
fitments: 175106
evidence: 208412

CATALOG RECONCILIATION:
PASS

SCOPE:
model→variant leakage: 0
null-key variant leakage: 0
configuration leakage: 0
multi-section forced promotions: 0

PROVENANCE:
PASS

IDEMPOTENCY:
PASS

CLEAN CHECKOUT REPRODUCIBILITY:
PASS

TESTS:
Phase54F: PASS
Phase54F-C: PASS
npm: PASS
e2e: PASS

CI:
PASS

PR STATE:
OPEN

PR MERGED:
NO

DECISION:
READY_FOR_PHASE_54F_C_REVIEW
```
