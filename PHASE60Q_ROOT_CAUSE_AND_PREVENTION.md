# Phase 60Q: Root-Cause Analysis, Prevention Safeguards & Agent Token Protection

**Repository:** `gel2701/stihl-decoder`  
**Phase:** 60Q — Permanent Quality Gate & Agent Token Protection  
**Status:** COMPLETED & VERIFIED  
**Date:** 2026-11-03  

---

## 1. Executive Summary

During previous commercial acceleration phases (Phase 60 and Phase 60.1), coding agents staged candidate Amazon affiliate matches for STIHL parts. Despite having verification frameworks (`TwoGateVerifier.js`), subtle and recurring data-integrity failures, incorrect product matches, and parity errors crept into manifests and candidate pools:
- **EAN check-digit parity mismatch**: NGK CMR6H used `0087295133652` instead of GS1-valid `0087295133651`.
- **Part number inversion**: `0000 400 7000` (NGK BPMR7A) was misassociated with CMR6H.
- **Packaging and quantity discrepancies**: 10-packs or multipacks matched against single-item parts (e.g. `0000 400 7025` CMR7H 10-pack `B07RHQ5FR4`).
- **Fitment / Specification mismatches**: Oregon 18720 small 7-spline (SM7) rim sprocket matched against standard 7-spline (SD7) STIHL `0000 642 1223`.
- **Self-certifying AI agent prose**: Agents authored strings like `"ASIN B001RMA5S2 matches NGK CMR6H single spark plug"` which previous code accepted as satisfying Gate 2 identity proof without external validation.

Phase 60Q installs **permanent, automated, fail-closed safeguards** and a repository-specific **Agent Skill** (`.agents/skills/stihldecoder-quality-gate/SKILL.md`) following the Agent Skills specification and methodology inspired by `obra/superpowers` (systematic TDD, rigorous pre-completion verification, and strict debugging protocols).

---

## 2. Forensic Root-Cause Analysis

### A. How Invalid or Contradictory Evidence Passed Gate 2
1. **Uncorroborated Text Proofs**: In `TwoGateVerifier.js`, `asin_product_identity_proof` was historically checked with:
   ```javascript
   if (!record.asin_product_identity_proof || typeof record.asin_product_identity_proof !== 'string' || record.asin_product_identity_proof.trim().length === 0)
   ```
   This allowed an LLM agent to generate descriptive English or Dutch text asserting validity without citing any corroborating third-party source or catalog entry.
2. **Conflation of Fitment Sources with ASIN Identity**: Agents supplied Danish or German STIHL IPL (Illustrated Parts List) PDF links in `independent_evidence_url`. While an IPL proves Gate 1 STIHL part-to-machine fitment, an IPL PDF from STIHL can **never** mention an Amazon ASIN (e.g. `B0...`). Because `TwoGateVerifier.js` only checked that the URL was syntactically valid and reachable, IPL links falsely satisfied the ASIN product identity requirement.
3. **Absence of GS1 Modulo-10 Parity Enforcement**: GTIN/EAN values were accepted as arbitrary strings of 8–14 digits. Typographical transposition errors (such as calculating or copying a check digit with bad parity) passed silently.
4. **Scattered Historical Mismatches**: When previous audits disqualified invalid ASINs (e.g., Phase 59F.1 disqualification of `B07RHQ5FR4` or Oregon `B000IBWVWG`), disqualifications were recorded only in isolated markdown reports or comments rather than an active, machine-enforced negative fixture registry.

---

## 3. Architecture of Permanent Safeguards

### Pillar 1: Separation of Verification Claims (5 Independent Dimensions)
1. **STIHL Part Identity**: Canonical normalized 11-digit format (`^\d{11}$`) validated against `canonical_parts.json` (18,373 parts).
2. **Machine Fitment**: Official STIHL documentation / IPL references proving model compatibility.
3. **Manufacturer Product Identity**: Specific brand (NGK, Bosch, Oregon, Stens) and manufacturer part number (MPN) matching STIHL OEM cross-references.
4. **ASIN-to-Product Identity**: Proof that Amazon's ASIN uniquely identifies the manufacturer's product, corroborated by an external merchant or manufacturer catalog (disallowing self-certifying narrative text and disallowing IPL manuals as ASIN proof).
5. **Packaging & Quantity**: Verification that the listing represents single-unit OEM replacement unless multi-pack is explicitly required by the canonical bill of materials.

### Pillar 2: Strict GS1 Modulo-10 Check-Digit Validation Engine
Implemented in `src/affiliate/GtinValidator.js`:
- Supports GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13), and GTIN-14.
- Implements the exact GS1 standard alternating 3x/1x weighting algorithm.
- Rejects invalid formats, dummy numbers (`0000000000000`), and restricted coupon/in-store ranges (`02`, `04`, `05`, `98`, `99`).
- Exposes `calculateGs1CheckDigit()` and `validateGtin()`.

### Pillar 3: Centralized Negative Regression Registry
Implemented in `src/affiliate/HistoricalMismatches.js`:
- Codifies all 9 historical errors encountered across Phases 54 through 60.1:
  1. `MISMATCH_CMR7H_10PACK`: STIHL `0000 400 7025` vs `B07RHQ5FR4` (10-pack mismatch).
  2. `MISMATCH_OREGON_18720_SM7_SPLINE`: STIHL `0000 642 1223` vs `B000IBWVWG` (SM7 small spline vs SD7 standard spline).
  3. `MISMATCH_OREGON_KOHLER_COIL`: STIHL `0000 350 3518` vs Oregon `33-518` Kohler ignition coil.
  4. `MISMATCH_OREGON_106114_HUSQVARNA_SPROCKET`: STIHL `1123 640 2074` vs Husqvarna rim sprocket.
  5. `MISMATCH_STENS_605_385`: STIHL `4238 140 1800` vs air filter kit.
  6. `MISMATCH_WSR6F_INVERSION`: STIHL `1110 400 7005` vs Bosch `WSR6F` `B001RM8J76` inversion.
  7. `MISMATCH_BPMR7A_CMR6H_CONFUSION`: STIHL `0000 400 7000` (BPMR7A) vs CMR6H spark plug.
  8. `MISMATCH_CMR6H_PARITY_ERROR_GTIN`: EAN `0087295133652` invalid parity check digit.
  9. `MISMATCH_0000_642_1223_BAR_COMBO`: STIHL `0000 642 1223` vs `B00004RA6N` chainsaw bar combo.
- Any attempt to stage or verify these fixtures fails immediately with clear error codes.

### Pillar 4: Hardened Dual-Gate Contract (`TwoGateVerifier.js`)
- Integrated `validateGtin` into Gate 1.
- Integrated `checkHistoricalMismatch` into Gate 2.
- Added strict checks rejecting `ASIN_IDENTITY_UNVERIFIED` placeholder tokens or self-certifying non-source statements.
- Explicitly rejects IPL PDF URLs as evidence for Amazon ASIN product identity.
- Explicitly checks for multi-pack keywords (`pack of`, `10er pack`, `box of 10`) when quantity is expected to be single.

### Pillar 5: Cross-Manifest Automated Auditor (`scripts/check_affiliate_consistency.mjs`)
- Scans all active and candidate affiliate records across all manifests (`PHASE60_1_VERIFIED_OFFERS.json`, `PHASE60_AMAZON_MATCHING_CANDIDATES.json`, `PHASE60_1_REJECTED_AND_PENDING.json`).
- Checks canonical database grounding, GTIN validity, historical mismatch absence, dual-gate compliance, and active authorization limits.
- **Current status: 105 records scanned, 0 contradictions, 0 GTIN errors, 0 unauthorized active offers.**

### Pillar 6: CI Quality Gate Job (`.github/workflows/ci.yml`)
- Added a fast `quality-gate` job that executes `npm run test:gate` (`check_affiliate_consistency.mjs` + `affiliate_quality_gate.test.js`) before or in parallel with longer suites.
- Runs in under 5 seconds, providing immediate feedback on PRs.

---

## 4. Agent Skill & Token Protection Methodology

To prevent repetitive, expensive agent token consumption caused by broad trial-and-error debugging loops, the following standards are codified in `.agents/skills/stihldecoder-quality-gate/SKILL.md` and referenced in repository root `AGENTS.md`:

### Fast-Failing Staged Verification Pipeline
Agents working on this repository must execute tests in strict hierarchical stages:
```
Stage A: Cross-Manifest Consistency Check (<100ms)
         node scripts/check_affiliate_consistency.mjs
                     ↓ PASS
Stage B: Negative Regression & Quality Gate (<50ms)
         node tests/affiliate_quality_gate.test.js
                     ↓ PASS
Stage C: Affected Domain Regression Suite (<150ms)
         node tests/phase60_1_evidence_recovery.test.js
                     ↓ PASS
Stage D: Full Canonical Production Suite (89 suites, ~20s)
         npm test
                     ↓ PASS
Stage E: Security & Link Audits (~5s)
         node scripts/audit_amazon_affiliate_links.mjs
         node scripts/audit_public_trust_claims.mjs
         git diff --check
                     ↓ PASS
Stage F: End-to-End Browser Journeys (~45s)
         npm run test:e2e
```
**Token Protection Impact**: If an agent introduces an invalid GTIN or a mismatched part, Stage A or Stage B fails in <100ms with an explicit error. The agent never wastes thousands of tokens executing slow browser tests or entire regression suites on broken data.

### Systematic Debugging Protocol
- **Reproduce First**: Recreate failures with minimal unit scripts before touching production logic.
- **Root Cause over Symptom Treatment**: Never bypass a check or delete an assertion when a test fails; fix the underlying data or logic defect.
- **Zero-Tolerance for False Verifications**: Never stage an affiliate match based on title similarity alone without independent manufacturer MPN/EAN corroboration.

---

## 5. Acceptance Criteria Verification Matrix

| Requirement | Implementation | Status |
| :--- | :--- | :--- |
| **Pillar 1: 5 Verification Pillars** | `TwoGateVerifier.js` & `check_affiliate_consistency.mjs` | **VERIFIED** |
| **Pillar 2: GS1 GTIN Modulo-10** | `src/affiliate/GtinValidator.js` | **VERIFIED** (8, 12, 13, 14 digits) |
| **Pillar 3: Negative Fixtures** | `src/affiliate/HistoricalMismatches.js` & `tests/affiliate_quality_gate.test.js` | **VERIFIED** (9 historical cases blocked) |
| **Pillar 4: Reject Agent Text as Proof** | `TwoGateVerifier.js` rejects self-certifying text | **VERIFIED** |
| **Pillar 5: Reject IPL as ASIN Proof** | `TwoGateVerifier.js` checks URL against IPL regex | **VERIFIED** |
| **Pillar 6: Cross-Manifest Audit** | `scripts/check_affiliate_consistency.mjs` | **VERIFIED** (105 records, 0 errors) |
| **Pillar 7: Agent Skill & AGENTS.md** | `.agents/skills/stihldecoder-quality-gate/SKILL.md` + `AGENTS.md` | **VERIFIED** |
| **Pillar 8: Fast CI Job** | `.github/workflows/ci.yml` `quality-gate` job | **VERIFIED** |
| **Pillar 9: Production Test Runner** | `tests/run_current_production_tests.js` updated to 89 suites | **VERIFIED** |
| **Production Invariant Preservation** | 18,373 canonical parts, 843 SEO parts, 1,024 sitemap URLs, 3 active pilot ASINs | **VERIFIED** |

---

## 6. Conclusion

Phase 60Q permanently resolves the vulnerability where invalid or ambiguous product claims could pass verification gates. By codifying checks in code and defining explicit agent instructions, future development phases can safely accelerate affiliate monetization without risking catalog integrity, public trust, or agent resource depletion.
