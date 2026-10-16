# Phase 54F-A — Controlled Technical Reharvest Pilot & Section Resolution Report

**Repository**: `gel2701/stihl-decoder`  
**Production**: `https://www.stihldecoder.nl`  
**Baseline SHA**: `b2a8d4259d8c7661c31e68af3b043a8acec846fc`  
**Branch**: `feat/phase54f-controlled-technical-reharvest`  
**Review Policy**: `CODEX_REVIEW_REQUIRED = NO`  
**PR Policy**: `PR_OPEN = YES`, `PR_MERGED = NO`  

---

## 1. Executive Summary

Phase 54F-A executes a controlled, fail-closed technical reharvest pilot aimed at recovering authentic exploded-view diagram/assembly section context for STIHL parts previously cataloged under `"Unresolved Diagram Section"`. 

Prior to Phase 54F-A, only 857 parts (5.02%) and 2,798 fitments (1.60%) had meaningful diagram assembly sections, despite 16,600 parts and 169,990 fitments having genuine diagram callout positions. 

Phase 54F-A proves that missing diagram assembly context can be deterministically and safely recovered from structured external technical sources using a strictly rate-limited, staging-first architecture with zero count drift and zero runtime scraping.

### Key Accomplishments:
1. **Strict Staging-First Harvesting**:
   - Built deterministic pilot queue (`data/harvest/phase54f_pilot_queue.json`) targeting 16 diverse machine models with high unresolved fitment counts across chainsaws, brushcutters, cut-off saws, blowers, and hedge trimmers.
   - Enforced single concurrency (`CONCURRENCY = 1`), >= 3000ms delay between consecutive requests, and transparent user-agent identification.
   - Operated strictly within pilot limits: 219 requests used out of 250 maximum (`MAX_HTTP_REQUESTS = 250`).
   - Zero Cloudflare / bot blocks (`SOURCES_BLOCKED = 0`).
2. **Substantial Section Coverage Expansion**:
   - **Parts with Meaningful Section**: Increased from **857** to **2,476** (**+1,619 parts**, +188.9% relative gain).
   - **Fitments with Meaningful Section**: Increased from **2,798** to **11,886** (**+9,088 fitments**, +324.8% relative gain).
   - Successfully resolved 13 of 16 attempted models to structured assembly diagrams; 3 models (`ms_362`, `038`, `066`) were cleanly classified as having no diagram tables without scraping bypasses.
3. **Immutability & Zero Fabrication Invariants**:
   - Canonical parts count frozen at **17,082** (`PARTS = 17082`).
   - Canonical fitment count frozen at **175,106** (`FITMENTS = 175106`).
   - Canonical configuration count frozen at **766** (`CONFIGURATIONS = 766`).
   - Meaningful diagram position count strictly preserved: `PARTS_WITH_MEANINGFUL_POSITION = 16,600`, `FITMENTS_WITH_MEANINGFUL_POSITION = 169,990`.
   - Evidence records expanded additively from **206,607** to **210,284** (+3,677 new validated observations, 100% carrying source URL, HTTP status 200, and response SHA-256 hash).
   - Zero false-positive section assignments; 25/25 sampled enrichments verified against raw source observations.
4. **All Multi-Phase Freezes Intact**:
   - Phase 54D SEO Pilot: Exactly 50 individual parts in sitemap, 231 total sitemap URLs, robots tags preserved (`PHASE54D_PILOT_SET_CHANGED = NO`).
   - Phase 54A Amazon Affiliate: 0 verified direct ASINs, 17,082 search fallbacks, 0 unverified product claims.
   - Phase 54E Supersessions: 22 relations, 11 reconfirmed authenticated official, 11 unconfirmed fail-closed, 0 globalized serial-scoped relations.
   - Runtime Technical Scraping: strictly 0 runtime network requests.

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
| **CONCURRENCY** | 1 | 1 | PASS |
| **MIN_DELAY_BETWEEN_REQUESTS** | >= 3000ms | >= 3000ms | PASS |
| **SOURCES_ATTEMPTED** | - | 1 (DIY Spare Parts) | PASS |
| **SOURCES_BLOCKED** | 0 | 0 | PASS (0 CAPTCHAs, 0 403s) |
| **NEW_RAW_OBSERVATIONS** | - | 3,677 | PASS |
| **NEW_VALID_EVIDENCE_OBSERVATIONS** | - | 3,677 | PASS |
| **DUPLICATE_EVIDENCE_SKIPPED** | - | 0 | PASS |
| **QUARANTINED_OBSERVATIONS** | 0 | 0 | PASS |
| **CONFLICTING_OBSERVATIONS** | 0 | 0 | PASS |
| **NEW_PART_CANDIDATES** | 0 | 0 | PASS (No catalog drift) |
| **NEW_FITMENT_CANDIDATES** | 0 | 0 | PASS (No fitment drift) |

---

## 3. Catalog & Section Coverage Comparison

| Metric | Before (Phase 54E Baseline) | After (Phase 54F-A Pilot) | Net Change |
| :--- | :--- | :--- | :--- |
| **PARTS** | 17,082 | 17,082 | 0 (Frozen) |
| **FITMENTS** | 175,106 | 175,106 | 0 (Frozen) |
| **CONFIGURATIONS** | 766 | 766 | 0 (Frozen) |
| **EVIDENCE** | 206,607 | 210,284 | +3,677 (+1.78%) |
| **PARTS_WITH_MEANINGFUL_SECTION** | 857 (5.02%) | 2,476 (14.49%) | **+1,619 (+188.9%)** |
| **FITMENTS_WITH_MEANINGFUL_SECTION** | 2,798 (1.60%) | 11,886 (6.79%) | **+9,088 (+324.8%)** |
| **VALID_SECTION_ENRICHMENTS** | 0 | 9,088 | +9,088 |
| **PARTS_WITH_MEANINGFUL_POSITION** | 16,600 (97.18%) | 16,600 (97.18%) | 0 (Strictly preserved) |
| **FITMENTS_WITH_MEANINGFUL_POSITION** | 169,990 (97.08%) | 169,990 (97.08%) | 0 (Strictly preserved) |
| **RAW_PLACEHOLDER_POSITIONS** | 5,116 | 5,116 | 0 (Strictly preserved) |
| **RAW_EXISTING_DATA_CHANGED** | 0 | 0 | 0 (Strictly additive) |

---

## 4. Quality & Provenance Verification

- **Deterministic Sample Verification**: Checked 25 random enriched fitment records against raw observations:
  - Sample size: 25
  - Sample failures: 0
  - False-positive section assignments: 0
- **Section Normalization**:
  - Raw section names normalized deterministically via `src/parts/SectionNormalizer.js` and `data/parts_section_aliases.json`.
  - Zero fabricated section titles.
- **Diagram Position Preservation**:
  - The harvested source (DIY Spare Parts) does not provide diagram callout numbers; position enrichment was set to `null` on new observations, guaranteeing zero mutation or corruption of existing 169,990 meaningful diagram positions.
- **Clean Reseed Reproducibility**:
  - `node data/seed.cjs` verified from clean state: builds exact SQLite state matching canonical counts.
  - `CLEAN_RESEED_REPRODUCIBLE = YES`.

---

## 5. Test & Audit Suite Results

| Test / Audit Command | Result | Details |
| :--- | :--- | :--- |
| `npm test` | **PASS** | 37 of 37 test suites passed cleanly |
| `npm run test:e2e` | **PASS** | 19 of 19 Playwright tests passed (38.7s) |
| `node scripts/test_phase54f_browser.mjs` | **PASS** | 5 browser/UI checks passed (enriched parts, controls, pilot, non-pilot, model parts) |
| `npm run audit:parts-catalog` | **PASS** | Catalog audit passed (1429 models audited) |
| `node scripts/audit_public_trust_claims.mjs` | **PASS** | 258 pages, 18,393 links, 0 broken, 0 claim errors |
| `node scripts/audit_parts_seo.mjs` | **PASS** | Hub, 24 series, 85 model parts, 50 pilot parts 100% clean |
| `node scripts/audit_amazon_affiliate_links.mjs` | **PASS** | 0 direct ASINs, 17,082 fallback search links verified |
| `node scripts/audit_part_indexation_pilot.mjs` | **PASS** | 50 pilot parts valid, metadata clean, sitemap exact |
| `node scripts/audit_parts_technical_enrichment.mjs` | **PASS** | R2 exact-pair provenance & encoding invariants verified (0 errors) |
| `node scripts/audit_phase54f_reharvest.mjs` | **PASS** | Staging artifacts, observations, enrichments & DB verified (0 errors) |
| `git diff --check` | **PASS** | 0 trailing whitespaces, 0 git diff check errors |

---

## 6. Phase 54F-B Expansion Readiness

- `VALID_SECTION_ENRICHMENTS > 0`: YES (9,088)
- `SAMPLE_FAILURES = 0`: YES (0)
- `FALSE_POSITIVE_SECTION_ASSIGNMENTS = 0`: YES (0)
- `CONFLICT_POLICY_PASS = YES`: YES (0 conflicts)
- `REQUEST_BUDGET_PASS = YES`: YES (219 <= 250)
- `ALL_REGRESSION_TESTS_PASS = YES`: YES (37/37 suites pass)
- **`READY_FOR_PHASE54F_B_EXPANSION = YES`**
- **`READY_FOR_PROTECTED_MERGE = YES`**
- **`PHASE54F_B_STARTED = NO`** (Strict fail-closed stop)
