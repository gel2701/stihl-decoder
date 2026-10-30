# STIHLDECODER — PHASE 58A.1 REPORT
## GHS Deferred URL Recovery & Catalog Completion (`GHS_STIHL_PRIMARY`)

- **Final Phase Status**: `COMPLETE_WITH_UNAVAILABLE_PUBLIC_PAGES`
- **Source Authority**: `GHS_STIHL_PRIMARY` (`source_status = AUTHORITATIVE`)
- **Catalog Data Complete for All Recovered Pages**: `true`
- **Public Source Coverage Complete**: `false` (104 URLs remain unavailable in public archives and behind Cloudflare 403 on live origin)

---

## 1. Deferred Queue Recovery Accounting (Baseline = 3,622 URLs)

| Metric | Count |
| :--- | ---: |
| **Starting Deferred URLs (`output/phase58a/CRAWL_ERRORS.json`)** | `3622` |
| **Recovered from Deferred Queue (`RECOVERED`)** | **`3515`** |
| **Confirmed HTTP 404 / Dead (`CONFIRMED_404`)** | `2` |
| **Duplicate / Alias of Parsed URL (`DUPLICATE`)** | `1` |
| **Out of Scope (`OUT_OF_SCOPE`)** | `0` |
| **Still Unavailable Publicly (`STILL_UNAVAILABLE_PUBLICLY`)** | `104` |

---

## 2. Discovery Rounds & Saturation

| Round | New Eligible GHS STIHL URLs | Recovered in Round | Description |
| :--- | ---: | ---: | :--- |
| **Round 1** | `1008` | `1008` | Breakdown hierarchy expansion across archived GHS category/model sitemaps |
| **Round 2** | `4500` | `4500` | Model-linked diagram section & OEM fitment product expansion across Wayback & Common Crawl |
| **Round 3** | `0` | `0` | Full saturation verification pass #1 (`NEW_ELIGIBLE_GHS_STIHL_URLS = 0`) |
| **Round 4** | `0` | `0` | Full saturation verification pass #2 (`NEW_ELIGIBLE_GHS_STIHL_URLS = 0`) |

- **Total URLs in `URL_RECOVERY_LEDGER.json`**: `10271` (`ALREADY_PARSED_PHASE58A = 1141`, `RECOVERED = 9023`, `CONFIRMED_404 = 2`, `DUPLICATE = 1`, `STILL_UNAVAILABLE_PUBLICLY = 104`)

---

## 3. Model Page Terminal-State Accounting

- **Phase 58A 497 Raw Model Entries Reconciled**:
  - `PARSED_PHASE58A`: `7`
  - `RECOVERED_PHASE58A1`: `185`
  - `DUPLICATE_ALIAS_URL`: `256`
  - `NOT_MODEL_PAGE`: `49`
  - `DEFERRED_STILL_BLOCKED`: `0`
  - `CONFIRMED_404`: `0`
  - `OUT_OF_SCOPE`: `0`
  - **Total**: `497 / 497` (Mismatch = `0`)
- **All Discovered Dedicated Model-Page URLs Across 58A + 58A.1 (`984` URLs)**:
  - `PARSED_PHASE58A`: `7`
  - `RECOVERED_PHASE58A1`: `977`
  - `DUPLICATE_ALIAS_URL`: `0`
  - `NOT_MODEL_PAGE`: `0`
  - `DEFERRED_STILL_BLOCKED`: `0`
  - `CONFIRMED_404`: `0`
  - `OUT_OF_SCOPE`: `0`
  - **Total**: `984 / 984` (`MODEL_PAGE_STATE_ACCOUNTING_MISMATCH = 0`)

---

## 4. Before / After Canonical Catalog Metrics

| Metric | Before (Phase 58A) | After (Phase 58A.1) | Delta |
| :--- | ---: | ---: | ---: |
| **Canonical Catalog Models** | `1138` | `1490` | **`+352`** |
| **Parts Model Variants (`parts_model_variants.json`)** | `1452` | `1848` | **`+396`** |
| **Canonical STIHL OEM Parts (`parts_catalog.json`)** | `17837` | `18373` | **`+536`** |
| **Canonical Model-Part Fitments (`model_part_fitments`)** | `179523` | `181394` | **`+1871`** |
| **Diagram Configurations (`parts_model_configurations.json`)** | `1194` | `3143` | **`+1949`** |
| **Source / Evidence Records (shards)** | `214001` | `218639` | **`+4638`** |
| **GHS Source Ledger (`ghs_stihl_source_ledger.json`)** | `7499` | `16522` | **`+9023`** |
| **Serial Number Ranges** | `8` | `8` | **`0`** (Untouched) |

---

## 5. Hard Gates

```json
{
  "DUPLICATE_SOURCE_URLS_PROCESSED": 0,
  "PAGINATION_PAGES_SILENTLY_SKIPPED": 0,
  "NEW_PART_WITHOUT_SOURCE_URL": 0,
  "NEW_FITMENT_WITHOUT_SOURCE_URL": 0,
  "GHS_SKU_MISTAKEN_FOR_STIHL_PART_NUMBER": 0,
  "AFTERMARKET_MISTAKEN_FOR_OEM": 0,
  "FABRICATED_PART_NUMBERS": 0,
  "FABRICATED_MODELS": 0,
  "FABRICATED_DIAGRAMS": 0,
  "URLS_WITHOUT_TERMINAL_STATE": 0,
  "MODEL_PAGE_STATE_ACCOUNTING_MISMATCH": 0,
  "RECOVERED_RECORDS_WITHOUT_GHS_PROVENANCE": 0,
  "ARCHIVE_RECORDS_WITHOUT_ORIGINAL_GHS_URL": 0,
  "DISCOVERY_URLS_WITHOUT_PUBLIC_OR_GHS_ORIGIN": 0,
  "PRICE_OR_STOCK_PROMOTED_FROM_ARCHIVE": 0
}
```
