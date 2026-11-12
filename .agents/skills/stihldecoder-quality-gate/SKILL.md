---
name: stihldecoder-quality-gate
description: Permanent quality gate, data-integrity safeguards, and token-efficient verification workflows for STIHLDecoder.nl.
---

# STIHLDecoder Quality Gate & Agent Verification Skill

This skill enforces mandatory engineering disciplines, data-integrity guarantees, and token-efficient testing practices for AI coding agents working on the `stihl-decoder` repository.

It incorporates core principles from modern software engineering methodologies (including `superpowers` by Jesse Vincent: Test-Driven Development, Systematic Debugging, and Verification Before Completion).

---

## 1. Ten Mandatory Agent Commandments

1. **Inspect Before Changing**: Read and understand the existing production implementation (`TwoGateVerifier.js`, `VerifiedOfferRegistry.js`, `AmazonProductionOfferContract.js`, `HistoricalMismatches.js`) before modifying code.
2. **Preserve Canonical Invariants**:
   - Exactly **18,373 canonical parts** in `data/parts_catalog.json` and SQLite.
   - Exactly **843 indexable SEO parts** in `src/seo/PartIndexationRegistry.js`.
   - Exactly **1,024 sitemap URLs** in `sitemap.xml`.
   - Live direct offers are governed by the **ACTIVE** registry and existing runtime eligibility gates (Two-Gate verification, per-marketplace caps, applicable shipping evidence, kill-switches, and any explicit operator whitelist). Do not reinstate the historical three-ASIN pilot whitelist as a default.
   - Affiliate tags must match their marketplace: Amazon.nl `srihldecoder2-21`; Amazon.de `srihldecode00-21`. Never use an NL tag on a DE direct link.
   - Formulation must always be `Bevestigde compatibiliteit`, never `Gegarandeerd passend op`.
3. **Minimal, Targeted Changes**: Prefer surgical, focused edits over wide-ranging refactors or file rewrites. Do not change line endings or reformat unrelated code.
4. **Reuse Existing Infrastructure**: Never construct parallel verification engines or duplicate validation logic. Extend `TwoGateVerifier.js`, `GtinValidator.js`, and `HistoricalMismatches.js`.
5. **Real Evidence for All Factual Claims**:
   - A STIHL manual or IPL proves model fitment (Gate 1). It **never** proves a third-party Amazon ASIN identity (Gate 2).
   - An ASIN identity claim requires independent external merchant or manufacturer catalog corroboration linking that specific ASIN to the MPN/GTIN.
   - Self-certifying descriptive strings (e.g. `"ASIN X matches MPN Y"`) without external sources must be rejected.
6. **Check Historical Mismatches First**: Consult `src/affiliate/HistoricalMismatches.js` on every cross-reference. Known mismatches must fail closed immediately.
7. **Run Targeted Tests First**: Execute fast, targeted unit tests (`tests/affiliate_quality_gate.test.js`) before running full production suites.
8. **Reject Unsupported Success Claims**: Never declare "100% verified" or "all candidates pass" if any candidate lacks verifiable external ASIN identity proof. Mark uncorroborated candidates `ASIN_IDENTITY_UNVERIFIED`.
9. **Zero Redundant Full-Suite Loops**: Avoid running the full 87-suite test runner (`tests/run_current_production_tests.js`) repeatedly during debugging. Use the Staged Testing Workflow (Stages A–F).
10. **Truthful & Grounded Reporting**: Report only genuine, reproducible blockers and verified factual results. No fictitious claims or speculative numbers.

---

## 2. Staged Testing Workflow (Token & Resource Optimization)

To protect agent context windows and avoid wasting minutes per tool call, execute testing in strict stages:

```
Stage A: Fast Static Integrity & Consistency
  ↳ node scripts/check_affiliate_consistency.mjs (runtime < 1s)
  ↳ git diff --check (formatting & whitespace)

Stage B: Targeted Unit Test Suite
  ↳ node tests/affiliate_quality_gate.test.js (runtime < 0.1s)
  ↳ Run specific test for the file modified

Stage C: Affected Integration Tests
  ↳ node tests/phase60_1_evidence_recovery.test.js
  ↳ node tests/phase59f1_match_correction.test.js

Stage D: Full Production Suite (Only Once Pre-PR Ready)
  ↳ node tests/run_current_production_tests.js (all 88 suites)
  ↳ npx playwright test (34 browser journeys)

Stage E: GitHub Actions CI Verification
  ↳ Fast `quality-gate` job executes first in CI (< 15s)
  ↳ Full matrix completes in background

Stage F: Post-Merge Main Verification
  ↳ Verify merge commit on `main` branch
```

---

## 3. Systematic Debugging Protocol

When a test fails, do NOT immediately re-run the full suite or attempt speculative fixes:

1. **Isolate the Failure**:
   - Extract the exact test assertion error, expected vs actual values, and stack trace.
   - Identify whether the defect is in data, logic, or an external transient factor.
2. **Reproduce Locally in Minimal Scope**:
   - Run only the single failing test file: `node tests/<failing_test>.test.js`.
3. **Trace Provenance**:
   - If a data record differs, inspect where the file is read and where it is seeded (`data/seed.cjs`, SQLite vs JSON).
4. **Implement Surgical Fix**:
   - Edit only the root cause.
   - Verify with the single test file.
5. **Verify Non-Regression**:
   - Run Stage A (`check_affiliate_consistency.mjs`) and Stage B (`affiliate_quality_gate.test.js`).

---

## 4. GS1 GTIN Validation Rules

All EAN / UPC / GTIN values must be validated with `validateGtin()` from `src/affiliate/GtinValidator.js`.

- Supported lengths: 8, 12, 13, 14 digits.
- Standard GS1 Modulo-10 check digit calculated right-to-left with alternating 3 and 1 multipliers.
- Remember: **A mathematically valid EAN is a necessary but not sufficient condition for product identity.** It proves the number is valid GS1 syntax, not that the physical product matches the machine.

---

## 5. Amazon Product Verification Contract (Dual-Gate & Loopholes Closed)

An affiliate candidate must pass both gates in `TwoGateVerifier.js`:

| Gate | Focus | What It Validates | Failure Status |
| :--- | :--- | :--- | :--- |
| **Gate 1** | Technical & Catalog | ASIN format, allowed marketplace, canonical 11-digit STIHL part number, exists in catalog, fresh verification date, valid GTIN syntax | `GATE_1: FAIL` |
| **Gate 2** | Product & Compatibility | OEM brand taxonomy, manufacturer MPN proof, STIHL compatibility proof, external ASIN-to-product proof, zero historical mismatches, zero volatile prices/stock | `GATE_2: FAIL` |

### Closed Loopholes & Anti-Bypass Invariants:
1. **No Self-Certified ASIN Text**: Text claims like "Agent verified", "Title match", or non-empty `asin_product_identity_proof` strings without structured external sources fail Gate 2 with `ASIN_IDENTITY_UNVERIFIED`.
2. **Attributable External Corroboration**: Generic URLs (e.g., `amazon.nl/`, `google.com/`) and unverified source types (`AMAZON`, `MERCHANT`, `CATALOG`) are rejected. Corroboration requires attributable external merchant/distributor evidence.
3. **No Bare Manufacturer URL Bypasses**: Manufacturer websites (e.g. `ngkntk.com`, `oregonproducts.com`, `stihl.*`) prove fitment/MPN, but cannot corroborate an Amazon ASIN unless the candidate ASIN is explicitly cited.
4. **No Boolean Overrides**: Manually setting `asin_identity_corroborated: true` has zero effect on `TwoGateVerifier.js` evaluation.
5. **Cross-Check Invariants**: If evidence sources claim an ASIN or GTIN differing from the candidate, verification fails with `ASIN_MISMATCH` or `GTIN_MISMATCH`. Multi-pack title contradictions with `package_quantity: 1` fail with `PACKAGE_QUANTITY_MISMATCH`.
6. **Explicit Lifecycle Taxonomy**: Supported candidate and offer statuses are:
   - `ACTIVE` (strictly reserved for audited live production pilot offers)
   - `VERIFIED` / `VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE` (fully passed Gate 1 and Gate 2)
   - `PART_COMPATIBILITY_ONLY` (fitment proven, ASIN unverified)
   - `ASIN_IDENTITY_UNVERIFIED` (pending independent ASIN corroboration)
   - `CONFLICTING_EVIDENCE` (incompatible claims across sources)
   - `INCORRECT_MATCH_CONFIRMED` (rejected/blocked mismatch)

If external ASIN identity is missing, the offer must remain `status: "ASIN_IDENTITY_UNVERIFIED"` with Amazon search fallback enabled. It must never be promoted to `ACTIVE` in production.
