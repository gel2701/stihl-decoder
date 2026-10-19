# StihlDecoder — Phase 55A
## Final Phase Close Report — Batches A + B

```text
PHASE 55A — FINAL CLOSE

STATUS = PASS

PHASE_55A_CLOSE = PASS
PHASE_55A_CLOSED

START_BASELINE = 1dcc18d04495feba2099607a1208681ddab7fd56
PHASE55A_CANDIDATE = 0e1f996883d06ff31357babcca1a44425b004c89
PHASE55A_MERGE_COMMIT = 0e2e9d9abc5788cc8815d77a20defd13ea8ce968
PR = #31 (MERGED)

BATCH_A_ROWS_ACCOUNTED = 7303/7303
BATCH_B_ROWS_ACCOUNTED = 7103/7103
TOTAL_SOURCE_ROWS_ACCOUNTED = 14406/14406
PHASE55A_UNIQUE_SERIALS = 13700

ANCHORS_BEFORE = 8874
NEW_OFFICIAL_ANCHORS_BATCH_A = 1543
ANCHORS_AFTER_BATCH_A = 10417
NEW_OFFICIAL_ANCHORS_BATCH_B = 5243
NEW_OFFICIAL_ANCHORS = 6786
ANCHORS_AFTER = 15660

ALIASES_BEFORE = 171
NEW_ALIASES = 0
ALIASES_AFTER = 171

CROSS_STORE_PARITY = PASS (15660 across JSON, stihl_database.json, SQLite)
CROSS_STORE_ALIAS_PARITY = PASS (171 across JSON and SQLite)

IDENTITY_CONFLICTS = 0
RANGE_INFERENCE = 0
GENERIC_PREFIX_RULES = 0
NEGATIVE_RUNTIME_EVIDENCE = 0
HISTORICAL_BATCHES_MUTATED = 0
HISTORICAL_PHASE53A_GATE = STRICT
REMOTE_NODE22_CLEAN_CHECKOUT = PASS
BATCH_B_NEW_ANCHOR_LIVE_SMOKE = PASS
READY_FOR_NEXT_PHASE = YES
NEXT_PHASE_STARTED = NO
```

---

### 1. Executive Summary & Authoritative Disposition

**Phase 55A — Manual MY STIHL Serial Evidence Reconciliation** has been successfully and formally closed following the full reconciliation and promotion of both manual evidence batches:
- **Batch A (`stihl_resultaten_17_10.csv`)**: 7,303 source rows reconciled, resulting in +1,543 official anchors.
- **Batch B (`stihl_resultaten(3).csv`)**: 7,103 source rows reconciled, resulting in +5,243 official anchors.

All manual records have been 100% accounted for with zero identity conflicts, zero range extrapolations, zero generic prefix derivations, and zero mutations to catalog entities outside canonical serial anchor registries.

The reconciliation pull request **PR #31** was merged into `main` at commit `0e2e9d9abc5788cc8815d77a20defd13ea8ce968`. Post-merge GitHub Actions CI and production Render auto-deployments completed with 100% green status.

---

### 2. Cumulative Accounting Metrics (Batch A ∪ Batch B)

Every source row across both manual verification datasets was individually and deterministically categorized:

| Metric / Classification | Batch A (2026-10-17) | Batch B (2026-10-19) | Cumulative Total |
|:---|:---:|:---:|:---:|
| **Source File** | `stihl_resultaten_17_10.csv` | `stihl_resultaten_3.csv` | 2 Files |
| **Total Populated Rows** | 7,303 | 7,103 | 14,406 |
| **Unique Serials** | 7,202 | 6,618 | 13,700 *(120 cross-batch overlap)* |
| **Duplicate Source Rows** | 101 | 485 | 586 |
| **Reconfirmed Existing Anchors** | 604 | 1,243 | 1,847 |
| **Previously Unresolved Now Positive** | 13 | 33 | 46 |
| **New Positive Observations** | 1,530 | 5,210 | 6,740 |
| **New Official Anchors Promoted** | **+1,543** | **+5,243** | **+6,786** |
| **Negative Evidence (Audit Only)** | 5,050 | 122 | 5,172 |
| **Usable Identity Missing (Recheck)** | 4 | 10 | 14 |
| **Technical Errors (Unresolved)** | 1 | 0 | 1 |
| **Identity Conflicts** | **0** | **0** | **0** |
| **Invalid Input Serials** | **0** | **0** | **0** |
| **Accounting Parity** | **7,303 / 7,303 (100%)** | **7,103 / 7,103 (100%)** | **14,406 / 14,406 (100%)** |

#### Cross-Batch Overlap (Batch A ∩ Batch B)
- **Overlapping Serials**: 120
- **Identical Positive Identifications**: 117
- **Timeouts on Existing Canonical Anchors**: 3
- **Conflicting Positive Identifications**: 0

---

### 3. Production Registry Cross-Parity & Invariant Verification

```text
================================================================================
CANONICAL REGISTRY STATE AUDIT
================================================================================
ANCHORS_BEFORE_PHASE55A:                  8,874
BATCH_A_NEW_OFFICIAL_ANCHORS:            +1,543
ANCHORS_AFTER_BATCH_A:                   10,417
BATCH_B_NEW_OFFICIAL_ANCHORS:            +5,243
FINAL_CANONICAL_ANCHORS:                 15,660

data/official_serial_anchors.json:       15,660 anchors
data/stihl_database.json:                15,660 anchors
data/stihl_database.db (SQLite):         15,660 anchors
CROSS_STORE_ANCHOR_PARITY:                PASS (100% Identical)

OFFICIAL_INPUT_ALIASES (JSON):              171 aliases
OFFICIAL_INPUT_ALIASES (SQLite):            171 aliases
CROSS_STORE_ALIAS_PARITY:                  PASS (100% Identical)
================================================================================
```

#### Invariant Verification
- `RANGES_CREATED = 0`: No speculative serial ranges created.
- `GENERIC_PREFIX_RULES_CREATED = 0`: No heuristic 8->9 digit prefix expansions.
- `NEGATIVE_RUNTIME_EVIDENCE = 0`: Negative lookups isolated to audit logs only.
- `CATALOG_PARTS_CREATED = 0`: Zero catalog parts added or modified.
- `CATALOG_FITMENTS_CREATED = 0`: Zero machine-part fitments created or modified.
- `CATALOG_CONFIGURATIONS_CREATED = 0`: Zero configuration entities created or modified.
- `HISTORICAL_BATCHES_MUTATED = 0`: Prior batch directories (`serials_2026-09-26`, `serials_2026-10-06`, `serials_2026-10-09`) remain immutable.
- `HISTORICAL_PHASE53A_GATE = STRICT`: Tests 14 and 15 in `tests/phase53a_reproducibility.test.js` maintained strict fail-closed contract against immutable recheck queue records (`163136620` TECHNICAL_TIMEOUT, `163150360` TECHNICAL_ERROR, `163136520` FOUND_WITHOUT_USABLE_IDENTITY).

---

### 4. Batch Manifest Hierarchy

Two complete, reproducible batch structures were generated:

1. **Batch A**: `data/import_batches/serials_2026-10-17_manual_followup/`
   - Manifest: `batch_manifest.json` (SHA256 verified)
   - Source: `source/stihl_resultaten_17_10.csv` (SHA256: `c7e682f06fe67881f9c66243b645cbd5f1c272323cd51f9451ec2b66684b7680`)
   - New anchors: `data/new_official_serial_anchors_only_2026-10-17.json` (1,543 records)

2. **Batch B**: `data/import_batches/serials_2026-10-19_manual_followup/`
   - Manifest: `batch_manifest.json` (SHA256 verified)
   - Source: `source/stihl_resultaten_3.csv` (SHA256: `523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c`)
   - New anchors: `data/new_official_serial_anchors_only_2026-10-19.json` (5,243 records)

---

### 5. CI/CD & Production Verification

- **PR #31 Merge Commit**: `0e2e9d9abc5788cc8815d77a20defd13ea8ce968`
- **GitHub Actions Clean-Checkout CI**:
  - `node-contract-tests` (Run 118264014093): **completed / success**
  - `trust-audit` (Run 118264014013): **completed / success**
  - `browser-e2e` (Run 118264013591): **completed / success**
- **Render Production Deploy**:
  - Endpoint: `https://stihl-decoder.onrender.com/api/version`
  - Active Commit: `0e2e9d9abc5788cc8815d77a20defd13ea8ce968`
  - Database: Connected, persistent disk, SQLite v3
- **Live Smoke Tests (`npm run test:live-smoke`)**:
  - Client module statuses: `publicEvidence.js` (200), `plantResolver.js` (200), `decoder.js` (404 as expected).
  - Browser journeys: Serial click journey (`163118080`), Model search (`MS 261 C-M`), Part number search (`11210210800`), Serial enter-key (`163118080`): **PASS (0 errors)**.
- **Direct Live Anchor Verifications**:
  - Batch A Anchor: `188100000 -> BG 86` (`OFFICIAL_ANCHOR_MATCH`, `OFFICIAL_STIHL_LOOKUP`)
  - Batch B Anchor: `163133522 -> FS 400 Freischneider` (`OFFICIAL_ANCHOR_MATCH`, `OFFICIAL_STIHL_LOOKUP`)
  - Batch B Anchor: `161130050 -> HS 75 Heckenschere,500mm/20"` (`OFFICIAL_ANCHOR_MATCH`, `OFFICIAL_STIHL_LOOKUP`)
- **Live Production Routes & GA4 Tagging**:
  - `/` -> HTTP 200, GA4 `G-P2V0J69LDX` verified.
  - `/kettingzagen/ms-200/` -> HTTP 200, GA4 `G-P2V0J69LDX` verified.
  - `/kettingzagen/ms-200/onderdelen/` -> HTTP 200, GA4 `G-P2V0J69LDX` verified.
  - `/kettingzagen/ms-261/onderdelen/` -> HTTP 200, GA4 `G-P2V0J69LDX` verified.
  - `/onderdeelnummer/11210210800/` -> HTTP 200, GA4 `G-P2V0J69LDX` verified.

---

### 6. Phase 55A Formal Sign-Off

```text
PHASE_55A_CLOSE = PASS
PHASE_55A_CLOSED
BATCH_A_ROWS_ACCOUNTED = 7303/7303
BATCH_B_ROWS_ACCOUNTED = 7103/7103
PHASE55A_UNIQUE_SERIALS = 13700
NEW_OFFICIAL_ANCHORS = 6786
ANCHORS_AFTER = 15660
IDENTITY_CONFLICTS = 0
RANGE_INFERENCE = 0
GENERIC_PREFIX_RULES = 0
NEGATIVE_RUNTIME_EVIDENCE = 0
HISTORICAL_PHASE53A_GATE = STRICT
REMOTE_NODE22_CLEAN_CHECKOUT = PASS
BATCH_B_NEW_ANCHOR_LIVE_SMOKE = PASS
READY_FOR_NEXT_PHASE = YES
NEXT_PHASE_STARTED = NO
```
