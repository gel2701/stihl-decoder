# STIHLDECODER — PHASE 58A REPORT
## Complete Garden Hire Spares STIHL Catalog Harvest (Authoritative Source Import)

- **Root Source URL**: `https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns.html`
- **Discovery Method**: `PUBLIC_SEARCH_INDEX` (Public API probe followed by Search-Index Seeded Recursive Graph Harvest)
- **Source Authority**: `GHS_STIHL_PRIMARY` (`source_status = AUTHORITATIVE`)
- **Final Phase Status**: `COMPLETE_WITH_RETRYABLE_FAILURES`

---

## 1. Before / After Canonical Catalog Metrics

| Metric | Before (Pre-58A) | After (Phase 58A) | Delta |
| :--- | ---: | ---: | ---: |
| **Total Catalog Models** | 956 | 1138 | **+182** |
| **Parts Model Variants** | 1227 | 1452 | **+225** |
| **Canonical STIHL OEM Parts** | 17082 | 17837 | **+755** (1882 enriched) |
| **Canonical Model-Part Fitments** | 175106 | 179523 | **+4417** (2981 confirmed) |
| **Diagram Configurations** | 766 | 1194 | **+428** |
| **Source / Evidence Records** | 206607 | 214001 | **+7394** |
| **Serial Number Ranges** | 8 | 8 | **0** (Untouched) |

---

## 2. Crawl & Diagram Coverage

- **Visited URLs**: 4763
- **Successfully Parsed Pages**: 1141 (Category/Root: 121, Model: 7, Diagram: 343, Product: 615)
- **Deferred / Retryable URLs**: 3621 (Discovered via internal graph links; live origin behind Cloudflare 403 managed challenge and not yet snapshotted in public index)
- **Non-Retryable HTTP 404 URLs**: 1
- **Models with GHS Diagrams**: 79 (63 with multiple diagram sections)
- **Total Diagram Sections Extracted**: 428 (428 with diagram image URLs preserved)
- **Parts Assigned to Diagram Section**: 1648
- **Parts with Model-Level Association Only**: 989

---

## 3. Hard Gates Verification

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
  "FABRICATED_DIAGRAMS": 0
}
```

---

## 4. Top New Models & Fitment Growth (Sample)

### Top Models by New Fitments Added
- `km_130_r`: **+180** new canonical fitments (276 total GHS fitments)
- `km_131_r`: **+180** new canonical fitments (222 total GHS fitments)
- `km_111_r`: **+178** new canonical fitments (216 total GHS fitments)
- `km_110_r`: **+165** new canonical fitments (250 total GHS fitments)
- `km_85_r`: **+159** new canonical fitments (280 total GHS fitments)
- `km_90_r`: **+159** new canonical fitments (208 total GHS fitments)
- `km_94_rc_e`: **+159** new canonical fitments (173 total GHS fitments)
- `kr_85`: **+144** new canonical fitments (167 total GHS fitments)
- `km_100_r`: **+133** new canonical fitments (229 total GHS fitments)
- `mm_55_z`: **+124** new canonical fitments (150 total GHS fitments)
- `km_56_rc_e`: **+119** new canonical fitments (152 total GHS fitments)
- `se_201`: **+116** new canonical fitments (122 total GHS fitments)
- `se_100`: **+109** new canonical fitments (113 total GHS fitments)
- `mm_55_c_e`: **+103** new canonical fitments (106 total GHS fitments)
- `se_120`: **+79** new canonical fitments (81 total GHS fitments)

### Top New Diagram Families
- **HT 131** (`ht_131`): 24 diagram sections (A - Engine Ø 43 mm; B - Rewind starter, Fuel tank; C - Muffler, Air filter)
- **TS 410** (`ts_410`): 17 diagram sections (A - Crankcase Assembly; B - Cylinder, Muffler Assembly; C - Clutch, Handlebar Assembly)
- **MS 271 C-BE** (`ms_271_c_be`): 16 diagram sections (A - Motor housing; B - Cylinder; C - Muffler)
- **KM 100** (`km_100`): 13 diagram sections (A - Cylinder, Engine pan; B - Valve timing gear; C - Rewind starter, Fuel tank)
- **KM 110 R** (`km_110_r`): 13 diagram sections (A - Cylinder, Engine pan; B - Valve timing gear; E - Clutch, Fan housing)
- **KM 131** (`km_131`): 13 diagram sections (A - Engine Ø 43 mm; B - Rewind starter, Fuel tank; C - Muffler, Air filter)
- **KM 85 R** (`km_85_r`): 13 diagram sections (C - Ignition system, Clutch; D - Air filter, Fuel tank; E - Carburetor 4137/28)
- **KM 85** (`km_85`): 13 diagram sections (A - Crankcase, Cylinder; B - Rewind starter, Muffler; C - Ignition system, Clutch)
- **KM 111 R** (`km_111_r`): 12 diagram sections (A - Engine Ø 40 mm; B - Rewind starter, Fuel tank; C - Muffler, Air filter)
- **KM 130 R** (`km_130_r`): 12 diagram sections (A - Cylinder, Engine pan; C - Rewind starter, Fuel tank; D - Muffler, Air filter)
- **KM 131 R** (`km_131_r`): 12 diagram sections (A - Engine Ø 43 mm; B - Rewind starter, Fuel tank; C - Muffler, Air filter)
- **MS 310** (`ms_310`): 12 diagram sections (A - Cylinder; B - Motor housing; C - Oil pump, Clutch)
- **RE 127 PLUS** (`re_127_plus`): 12 diagram sections (A - Electric motor; B - Pump, valve block; C - Chassis, Connecting cable)
- **KM 100 R** (`km_100_r`): 11 diagram sections (A - Cylinder, Engine pan; B - Valve timing gear; J - Carburetor C1Q-S88)
- **KM 130** (`km_130`): 10 diagram sections (A - Cylinder, Engine pan; B - Valve timing gear; C - Rewind starter, Fuel tank)
