# PHASE 53A-P — PROTECTED MERGE & PRODUCTION VALIDATION REPORT

## 1. EXECUTIVE SUMMARY & PROVENANCE

- **Phase**: 53A-P — Protected Merge & Production Validation
- **Repository**: `gel2701/stihl-decoder`
- **Production URL**: `https://www.stihldecoder.nl`
- **Merge Method**: GitHub Pull Request Merge API (PR #10)
- **Status**: **COMPLETE & PRODUCTION VERIFIED**

```text
PRE_MERGE_MAIN_SHA  = 9f8f05fe590da30d3020854eefaf916e5fc7fd57
CANDIDATE_SHA       = 68266a2e10fe12c1169c42126913a4fa5d4be7be

PR_NUMBER           = 10
PR_HEAD_SHA         = 68266a2e10fe12c1169c42126913a4fa5d4be7be
PR_BASE_SHA         = 9f8f05fe590da30d3020854eefaf916e5fc7fd57
PR_STATE_BEFORE     = open
PR_MERGEABLE        = true

CI_PR_RUN_ID        = 38000515352
NODE_CONTRACT_TESTS = completed / success
BROWSER_E2E         = completed / success
TRUST_AUDIT         = completed / success

SOURCE_BYTES        = 8377145
SOURCE_SHA256       = 0987022cf96f48d392c348dcef5c5682a0177db69055ba3e4b7552d07bf3579b

BLOCKERS_PRE_MERGE  = 0
```

---

## 2. GITHUB PROTECTED MERGE VERIFICATION

PR #10 was merged into `main` via the GitHub Pull Request merge API with exact SHA-binding to candidate `68266a2e10fe12c1169c42126913a4fa5d4be7be`.

```text
PR_MERGED           = YES
MERGED_AT           = 2026-10-11T08:31:18Z
MERGE_COMMIT_SHA    = d77c427620c59af4615b7441e099cf0692e3a285
MERGE_PARENT_1      = 9f8f05fe590da30d3020854eefaf916e5fc7fd57
MERGE_PARENT_2      = 68266a2e10fe12c1169c42126913a4fa5d4be7be

POST_MERGE_MAIN_SHA = d77c427620c59af4615b7441e099cf0692e3a285
POST_MERGE_TESTS    = PASS (29/29 suites passed)
POST_MERGE_SERIAL_PARITY = PASS (100% JSON vs SQLite)
POST_MERGE_PARTS_AUDIT   = PASS (1,429 items)
```

---

## 3. IMMUTABLE DATA INVARIANTS & ACCOUNTING

```text
SOURCE_ROWS = 6822
UNIQUE_INPUT_SERIALS = 6820

SAFE_OFFICIAL_EXACT = 6031
RECONFIRMED_EXISTING = 2
NEW_OFFICIAL_ANCHORS = 6029

RECHECK_TOTAL = 789
  TECHNICAL_TIMEOUT = 736
  TECHNICAL_ERROR = 34
  FOUND_WITHOUT_USABLE_IDENTITY = 19

ROWS_PARTICIPATING_IN_DUPLICATE_GROUPS = 4 (163140540 x2, 163150525 x2)
EXCESS_DUPLICATE_ROWS = 2 (6822 rows - 6820 unique serial inputs)

OFFICIAL_ANCHORS = 8874
OFFICIAL_ALIASES = 171

IDENTITY_CONFLICTS = 0
UNACCOUNTED_INPUTS = 0

INFERRED_SERIAL_RANGES_ADDED = 0
SYNTHETIC_SERIAL_ANCHORS = 0

JSON_SQLITE_PARITY = PASS (100% match across all 8,874 records)
PARTS_INVARIANTS = PASS (17,082 parts, 175,106 fitments, 206,607 evidence, 766 configs — untouched)
SERIAL_REGRESSION = PASS
ALIAS_REGRESSION = PASS
PASSPORT_REGRESSION = PASS
SECURITY_REGRESSION = PASS

PHASE48_IMMUTABLE_PRE = YES (5b39ff9440c99f5be6570b3a1a930b2d9a2fc725)
PHASE49B_IMMUTABLE_PRE = YES (64173e04b3d8be07eb9d42c655e205953d4a634e)
PHASE48_IMMUTABLE_POST = YES
PHASE49B_IMMUTABLE_POST = YES
```

---

## 4. LIVE RENDER PRODUCTION AUDIT (`https://www.stihldecoder.nl`)

Live verification conducted against production deployment serving commit `d77c427620c59af4615b7441e099cf0692e3a285`:

```text
PRODUCTION_SHA      = d77c427620c59af4615b7441e099cf0692e3a285
PRODUCTION_VERIFIED = YES
```

### Live Serial Decoding Results
| Input Serial | Expected Identity | Type | Live Result |
| :--- | :--- | :--- | :--- |
| `163130555` | `MS 440-Z 3/8" RIM Magnum Motorsäge` | Reconfirmed | **`PASS`** (HTTP 200) |
| `163158080` | `HS 45 Heckenschere, 600mm/24"` | Reconfirmed | **`PASS`** (HTTP 200) |
| `163148080` | `MS 260-W .325" P Motorsäge` | Preserved over Timeout | **`PASS`** (HTTP 200) |
| `10000000` | `FS 55 RC-E Z Motorsense` | Alias | **`PASS`** (HTTP 200) |
| `010000000` | `FS 55 RC-E Z Motorsense` | Leading Zero Alias | **`PASS`** (HTTP 200) |
| `163118080` | `MS 440-Z 3/8" RIM Magnum Motorsäge` | Legacy Batch 2 | **`PASS`** (HTTP 200) |
| `163130560` | `MS 440-Z 3/8" RIM Magnum Motorsäge` | New Chainsaw Anchor | **`PASS`** (HTTP 200) |
| `163130785` | `FS 450 Freischneider` | New Brushcutter Anchor | **`PASS`** (HTTP 200) |
| `163135610` | `TS 400-Z Trennschleifer` | New Cut-off Machine Anchor | **`PASS`** (HTTP 200) |
| `163138390` | `SH 85 SaugHäcksler` | New Shredder Anchor | **`PASS`** (HTTP 200) |
| `163149170` | `HS 45 Heckenschere, 600mm/24"` | New Hedge Trimmer Anchor | **`PASS`** (HTTP 200) |
| `163140540` | `MS 210 3/8"P Motorsäge` | Collapsed Duplicate Anchor | **`PASS`** (HTTP 200) |
| `163150525` | `FS 450 Freischneider` | Resolved Duplicate Anchor | **`PASS`** (HTTP 200) |
| `163155135` | `BT 360 Bohrgerät` | New Earth Auger Anchor | **`PASS`** (HTTP 200) |
| `163154800` | `HT 75 3/8"P P Hoch-Entaster` | New Pole Pruner Anchor | **`PASS`** (HTTP 200) |
| `163156645` | `BG 55 Blasgerät` | New Blower Anchor | **`PASS`** (HTTP 200) |

### Actual Recheck Queue Negative Controls (Committed Queue Records)
- `163133770` (Actual Queue Record - `TECHNICAL_TIMEOUT`, Row 645): `FORMAT_VALIDATED`, `anchor: false`, `model: Nog niet definitief bevestigd` (**`PASS`**)
- `163150360` (Actual Queue Record - `TECHNICAL_ERROR`, Row 3964): `FORMAT_VALIDATED`, `anchor: false`, `model: Nog niet definitief bevestigd` (**`PASS`**)
- `163133490` (Actual Queue Record - `FOUND_WITHOUT_USABLE_IDENTITY`, Row 589): `FORMAT_VALIDATED`, `anchor: false`, `model: Nog niet definitief bevestigd` (**`PASS`**)

### General Negative Controls
- `999999999`: Correctly flagged as suspected fake / clone serial (**`PASS`**)
- `INVALID!#$`: Fail-closed `NOT_FOUND` (**`PASS`**)
- `12345678`: Context warning for 8-digit inputs without anchor (**`PASS`**)

```text
FALSE_POSITIVE_IDENTITIES = 0
EXACT_MODEL_IDENTIFIED    = NO (for all recheck records)
OFFICIAL_ANCHOR_MATCH     = NO (for all recheck records)
```

---

## 5. BROWSER HEALTH & ZERO RUNTIME SCRAPING

During live Playwright browser audits on production:

```text
CONSOLE_ERRORS                  = 0
PAGE_ERRORS                     = 0
FAILED_REQUESTS                 = 0

RUNTIME_MY_STIHL_REQUESTS       = 0
RUNTIME_EXTERNAL_SERIAL_LOOKUPS = 0
RUNTIME_EXTERNAL_PARTS_REQUESTS = 0
```

- **Passport Flow**: Machinepaspoort created cleanly without mandatory serial (`PASS`).
- **Parts Flow**: Canonical hubs render with diagram tables; individual parts gated with `noindex, follow` (`PASS`).
- **Security Boundaries**: `/src/decoder.js` returns HTTP 404; public client resolvers return HTTP 200 (`PASS`).

---

## 6. FINAL COMPLETION GATE

```text
PR_MERGED                     = YES
CANDIDATE_SHA                 = 68266a2e10fe12c1169c42126913a4fa5d4be7be
POST_MERGE_MAIN_SHA           = d77c427620c59af4615b7441e099cf0692e3a285
PRODUCTION_SHA                = d77c427620c59af4615b7441e099cf0692e3a285
PRODUCTION_VERIFIED           = YES

OFFICIAL_ANCHORS              = 8874
OFFICIAL_ALIASES              = 171
RECHECK_TOTAL                 = 789

IDENTITY_CONFLICTS            = 0
UNACCOUNTED_INPUTS            = 0
JSON_SQLITE_PARITY            = PASS
PARTS_INVARIANTS              = PASS
SERIAL_REGRESSION             = PASS
PASSPORT_REGRESSION           = PASS
SECURITY_REGRESSION           = PASS

CONSOLE_ERRORS                = 0
PAGE_ERRORS                   = 0

RUNTIME_MY_STIHL_REQUESTS       = 0
RUNTIME_EXTERNAL_SERIAL_LOOKUPS = 0
RUNTIME_EXTERNAL_PARTS_REQUESTS = 0

BLOCKERS_FINAL                = 0

PHASE53A_INTEGRATION_COMPLETE = YES
PHASE53B_STARTED              = NO
```
