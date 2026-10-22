# StihlDecoder — Phase 56C Report
## Affiliate Production Verification & Conversion Readiness

**Status**: PASS  
**Timestamp**: 2026-10-22T00:02:53.223Z  
**Baseline Git Commit**: `986282789b0c5ca8c103a32d4295872c371d4bbb`  
**Target Repository**: `gel2701/stihl-decoder`  

---

### 1. Executive Summary

Phase 56C has successfully verified the live Amazon Affiliate commercial pipeline and prepared it for conversion measurement and controlled scaling:
1. **Production Associate Tag Audit**: Confirmed `srihldecoder2-21` as the genuine production tracking tag for Amazon.nl. Resolved the documentation mismatch where `stihldecoder-21` had been used as an example. Proved that runtime strictly reads `process.env.AMAZON_ASSOCIATE_TAG` with zero tag hardcoding in production source.
2. **Live Affiliate Chain Audit**: Audited end-to-end link flow (`Part page -> CTA -> /api/affiliate/out -> Amazon`) across 30 representative parts (10 Phase 56A indexable, 10 other canonical, 5 commercial high, 5 commercial medium). Result: **30/30 valid, 0 broken, 0 missing tags, 0 open redirect vulnerabilities**.
3. **Deterministic Search Query Experiment**: Designed and implemented a fail-closed, deterministic 50/50 A/B query variant assignment based on a stable 31-multiplier hash of canonical part numbers:
   - **Variant A** (`STIHL <formatted part number>`, e.g. `STIHL 1123 160 2050`): **8,541 parts (50.00%)**
   - **Variant B** (`STIHL <compact part number>`, e.g. `STIHL 11231602050`): **8,541 parts (50.00%)**
   - Query variant is passed to `/api/affiliate/out` and recorded in analytics for empirical conversion comparison.
4. **Amazon.de Optional Marketplace Support**: Verified fail-closed behavior for the German marketplace via `AMAZON_ASSOCIATE_TAG_DE`. When no regional tag is set, **0 Amazon.de CTAs are rendered**. No cross-border tag leakage is permitted.
5. **Manual Verified ASIN Intake Tooling**: Deployed `scripts/import_verified_amazon_offers.mjs` with atomic batch pre-write validation, rejecting any invalid ASINs, uncataloged parts, duplicates, price/stock claims, or missing provenance before writing.
6. **Commercial Analytics Readiness**: Configured dedicated event schemas for `amazon_search_fallback_click` and `amazon_verified_product_click` with whitelisted non-PII metadata (`query_variant`, `commercial_tier`, `seo_tier`, `marketplace`). Commercial conversion status recorded as `DATA_NOT_YET_MATURE`.
7. **Strict Invariant & SEO Freeze**: Preserved all 17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence, 814 section contexts, 400 indexable part pages, and 581 sitemap URLs.

---

### 2. Key Metrics & Audit Results

| Metric | Baseline | Phase 56C Result | Status |
| :--- | :--- | :--- | :--- |
| **Canonical Parts** | 17,082 | 17,082 | **FROZEN** |
| **Model-Part Fitments** | 175,106 | 175,106 | **FROZEN** |
| **Configurations** | 766 | 766 | **FROZEN** |
| **Evidence Records** | 208,412 | 208,412 | **FROZEN** |
| **Section Contexts** | 814 | 814 | **FROZEN** |
| **Indexable Part Pages** | 400 | 400 | **FROZEN** |
| **Sitemap Total URLs** | 581 | 581 | **FROZEN** |
| **Amazon Search Fallback Coverage** | 17,082 / 17,082 | 17,082 / 17,082 | **100% INTACT** |
| **Verified Direct ASIN Mappings** | 0 | 0 | **ZERO FABRICATION** |
| **Production Associate Tag (NL)** | Unverified | `srihldecoder2-21` | **CONFIRMED & AUDITED** |
| **Affiliate Links Audited** | 0 | 30 | **30/30 VALID** |
| **Broken Affiliate Links** | 0 | 0 | **0 BROKEN** |
| **Missing-Tag URLs** | 0 | 0 | **0 MISSING** |
| **Query Variant A (Formatted)** | 0 | 8,541 (50.00%) | **DETERMINISTIC 50/50** |
| **Query Variant B (Compact)** | 17,082 | 8,541 (50.00%) | **DETERMINISTIC 50/50** |
| **Amazon.de Marketplace** | Unconfigured | Fail-Closed (0 CTAs) | **VERIFIED** |
| **Verified ASIN Intake Script** | Missing | `import_verified_amazon_offers.mjs` | **PRODUCTION-READY** |
| **Conversion Data Maturity** | Unknown | `DATA_NOT_YET_MATURE` | **HONEST REPORTING** |

---

### 3. Associate Tag Audit & Resolution

- **Account Tag**: `srihldecoder2-21` (explicitly verified by account owner for Amazon.nl).
- **Previous Discrepancy**: Earlier documentation and test files referenced `stihldecoder-21`.
- **Resolution**:
  - Updated `docs/affiliate-amazon-setup.md` to explicitly specify `srihldecoder2-21`.
  - Verified runtime code in `src/affiliate/AmazonAffiliateProvider.js` strictly accesses `process.env.AMAZON_ASSOCIATE_TAG` without hardcoded values.
  - Zero hardcoding in production source code.

---

### 4. Search Query A/B Experiment Design

To optimize search query match rates on Amazon.nl without compromising safety:
- **Variant A**: `STIHL <formatted part number>` (e.g. `STIHL 1123 160 2050`)
- **Variant B**: `STIHL <compact part number>` (e.g. `STIHL 11231602050`)
- **Deterministic Partitioning**:
  ```javascript
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  return (hash % 2 === 0) ? 'VARIANT_B' : 'VARIANT_A';
  ```
- Result across all 17,082 canonical parts:
  - Variant A: exactly 8,541 parts
  - Variant B: exactly 8,541 parts
  - Perfectly balanced 50.00% / 50.00% split.
  - Consistent: the same part always renders the same query variant across all pageviews.
  - Metadata `query_variant` is passed through `/api/affiliate/out` to analytics.

---

### 5. Manual Verified ASIN Intake Pipeline

Created `scripts/import_verified_amazon_offers.mjs` for future manual or API-verified matches:
- Validates 11-digit canonical part number existence against `data/parts_catalog.json`.
- Validates 10-character alphanumeric ASIN syntax.
- Enforces strict classification: only `OEM_STIHL_EXACT` or `AFTERMARKET_EXACT_REFERENCE`.
- Rejects volatile data: `price` and `in_stock` must be null.
- Enforces evidence source URL and valid ISO timestamp.
- Atomic fail-closed: if a single record in an intake batch is invalid, duplicate, or ambiguous, the entire batch is rejected with zero partial writes.

---

### 6. Phase 56C Output Artifacts

The following 9 artifacts were generated in `output/phase56c/`:
1. `AFFILIATE_PRODUCTION_BASELINE.json`
2. `ASSOCIATE_TAG_AUDIT.json`
3. `AFFILIATE_LINK_CHAIN_AUDIT.json`
4. `SEARCH_QUERY_EXPERIMENT.json`
5. `MARKETPLACE_READINESS.json`
6. `VERIFIED_ASIN_INTAKE_CONTRACT.json`
7. `COMMERCIAL_ANALYTICS_READINESS.json`
8. `PHASE56C_SUMMARY.json`
9. `PHASE56C_REPORT.md`

---

### 7. Acceptance Criteria Verification

- [x] Production affiliate tag source checked and verified (`srihldecoder2-21`)
- [x] Tag inconsistencies documented and resolved fail-closed
- [x] Live affiliate link chain technically valid (30/30 valid, 0 broken)
- [x] 17,082 Amazon fallbacks intact
- [x] Query experiment deterministic and measurable (8,541 / 8,541)
- [x] Zero false commercial claims (0 prices, 0 stock claims)
- [x] Optional Amazon.de marketplace fail-closed (0 CTAs without tag)
- [x] Manual verified-ASIN intake script available
- [x] 400 SEO pages exactly preserved
- [x] All catalog invariants intact (17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence, 814 section contexts)
