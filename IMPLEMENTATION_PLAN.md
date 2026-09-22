# STIHLDecoder Implementation Plan

This plan tracks future product and architecture work that builds on the immutable foundation defined in `FOUNDATION.md`.

## Planning rules

- Existing foundation behavior remains intact unless a later migration explicitly supersedes it.
- Canonical STIHL technical data remains separated from user/private machine data.
- New ideas enter here as planned work before becoming active implementation scope.
- External repositories may be used as inspiration only when licensing and security allow it; unlicensed source code is not copied into STIHLDecoder.

---

## Planned — Official Evidence Reconciliation: BR Batch 1

**Status:** PLANNED / NEXT DATA-QUALITY PHASE  
**Origin:** Full first-party STIHL Brazil product harvest: 200/200 products harvested, 0 failed, with canonical STIHL data left byte-identical.

### Goal

Use the completed STIHL Brazil official-product harvest to strengthen existing STIHLDecoder records through controlled evidence reconciliation, while preserving market-specific differences and the existing review/promotion architecture.

The first reconciliation batch must focus on already known machine models before any large-scale onboarding of new BR-only/current products.

### Current harvest baseline

- 200 unique official STIHL Brazil products discovered via the deterministic product sitemap;
- 200/200 successfully harvested;
- 8 existing STIHLDecoder model matches;
- 128 new machine/product model candidates;
- 64 ambiguous accessory records (chains, guide bars and other non-machine products);
- 200/200 official STIHL article/reference numbers;
- 135 products with official manuals;
- 43 `DATABASE_MISSING` field verdicts across the 8 matched models;
- 24 `HIGH_VALUE_DATABASE_CANDIDATES`;
- 0 `CONFLICT_REVIEW_REQUIRED` verdicts;
- 3 `POSSIBLE_MARKET_VARIANT` differences;
- automatic promotion disabled;
- canonical `stihl_database.json` and `public_evidence_facts.json` unchanged.

### BR Batch 1 — existing-model reconciliation

Review the 8 existing model matches first:

- MS 260
- MS 261
- HS 45
- SR 430
- SR 450
- FS 120
- FS 38
- BR 600

For each matched model:

1. verify model identity and STIHL article/reference provenance;
2. reconcile every comparable technical field;
3. classify exact matches separately from missing canonical fields;
4. review the 24 high-value candidates individually;
5. attach supporting official source URL, market and retrieval metadata;
6. attach official manual evidence where available;
7. do not promote market-specific values into EU/NL canonical data without explicit review;
8. create a review record for every proposed canonical change.

### High-value candidate rules

A `HIGH_VALUE_DATABASE_CANDIDATE` is eligible for review only when:

- the source is an official STIHL manufacturer page or document;
- the model match is exact or otherwise unambiguous;
- the canonical database currently lacks the field;
- the value is technically clear and normalized;
- no conflicting official evidence exists;
- no BR/EU/NL market-variant risk is present;
- provenance can be retained at field level.

**Hard rule:** high-value status is not permission for automatic promotion.

### Market variants

The current harvest found three values that must stay market-aware:

- MS 261 power: BR `2.95 kW` vs current DB `3.0 kW`;
- MS 260 weight: BR `4.9 kg` vs current DB `4.8 kg`;
- BR 600 weight: BR `10.1 kg` vs current DB `10.3 kg`.

These must be classified as `POSSIBLE_MARKET_VARIANT` unless independent evidence establishes that the canonical value itself is wrong.

Do not silently overwrite EU/NL values with BR product-page values.

### Missing-field priorities

Prioritize technically useful fields currently absent from matched records, especially:

- vibration left/right;
- fuel tank capacity;
- oil tank capacity;
- sound pressure;
- sound power;
- displacement where missing;
- power where missing;
- weight where missing;
- chain/guide-bar specifications where unambiguous.

Examples from the harvest that deserve early review include:

- MS 260 / MS 261 vibration and tank data;
- FS 38 / FS 120 vibration and tank data;
- SR 430 / SR 450 displacement, power and weight.

### Official manuals

Treat the 135 discovered official manual links as documentation/evidence sources rather than merely product-page metadata.

For matched models:

- associate manuals with the exact model/reference where possible;
- retain market/language metadata;
- record verification status (`VERIFIED_OK`, `UNREACHABLE`, etc.);
- do not treat an unreachable URL as proof that the document is invalid;
- flag broken STIHL-hosted links for review rather than deleting the evidence record.

### Accessory separation

The 64 ambiguous chain/bar/accessory results must not be forced into the machine `models` collection.

Plan a separate product/part evidence domain for:

- saw chains;
- guide bars;
- cutting attachments;
- batteries/chargers where they are not machine models;
- other accessories and consumables.

No fuzzy machine matching is allowed for these records.

### Phase after BR Batch 1 — new model intake

Only after the 8 matched models and evidence rules are reconciled should STIHLDecoder process the 128 new model candidates.

Recommended order:

1. high-confidence machine models with complete official specifications;
2. current chainsaws and power tools absent from the database;
3. battery machines and newer product families;
4. secondary categories such as pressure washers;
5. accessories only after a dedicated part/product schema exists.

Initial high-interest candidates include MS 162, MS 172, MS 182, MS 212, MS 363 and MS 382 because the official BR source provides rich multi-field specifications.

### Dependency cleanup follow-up

`fetch-stihl-products@2.0.5` appears redundant after completion of the first-party harvester and is the source of the currently identified legacy `npm audit` dependency chain.

Before removal:

1. verify no scripts/tests/runtime paths import it;
2. remove it on a separate focused change;
3. regenerate lockfile;
4. rerun CI and security audit;
5. classify any remaining findings independently.

### Acceptance criteria

BR Batch 1 is complete only when:

- all 8 existing model matches have an explicit field-by-field review;
- all 24 high-value candidates have a documented decision;
- the 3 market variants remain market-scoped unless separately proven otherwise;
- official manuals are linked as evidence where appropriate;
- no accessory is promoted as a machine model;
- all canonical changes, if any, pass the existing evidence/promotion process;
- no automatic promotion path is introduced;
- canonical safety/regression tests remain green relative to baseline.

---

## Planned — STIHL Paspoort 2.0: Warranty & Service History

**Status:** PLANNED / NOT YET ACTIVE  
**Origin:** Functional concept observed in `HaydenJa27/Warranty-Management-System` (STIHL Shop Dandenong). Use the concept only; do not copy source code or assets because the repository has no stated license.

### Goal

Expand the current STIHL Paspoort from a machine/result export into a persistent digital machine passport that combines machine identity with ownership, purchase, warranty, maintenance and repair history.

### Proposed functional scope

1. **Machine identity**
   - internal `machine_id`
   - serial number
   - linked canonical `model_id`
   - STIHL article/reference number where available
   - manufacture/production evidence already provided by STIHLDecoder
   - QR passport identifier

2. **Purchase & warranty**
   - purchase date
   - dealer / seller
   - purchase document reference
   - warranty start date
   - warranty end date
   - warranty status
   - optional proof-of-purchase upload

3. **Service history**
   - service date
   - maintenance type
   - repairs performed
   - replaced parts / part numbers
   - operating hours where applicable
   - costs
   - technician/workshop or self-service indicator
   - free-text notes
   - optional photos/documents

4. **Machine timeline**
   - chronological purchase, warranty, service and repair events
   - clear audit trail per machine
   - future support for ownership transfer without losing technical/service history

5. **Search & management**
   - search by serial number, model, machine ID and QR passport
   - sort/filter by model, warranty state and service date
   - private owner dashboard / "Mijn machines"
   - admin/review tools only where necessary

### Data architecture

Keep these domains strictly separated:

```text
CANONICAL STIHL DATA
  model / serial interpretation / technical specs / evidence

MACHINE PASSPORT
  machine_id / serial_number / model_id / purchase / warranty

PRIVATE OWNER DATA
  authenticated account / owner profile / contact data

SERVICE HISTORY
  service events / repairs / parts / costs / notes / documents
```

**Hard rule:** private owner, warranty or service information must never be written to:

- `data/stihl_database.json`
- `data/public_evidence_facts.json`

Use a separate private datastore with explicit authorization and access control.

### Privacy & security requirements

Before implementation:

- define authentication and authorization model;
- define data ownership and deletion/export behavior;
- minimize stored personal data;
- encrypt/secure sensitive document storage;
- keep public QR views separate from authenticated private detail views;
- do not expose owner contact information through a public serial-number lookup;
- add audit logging for privileged/admin changes.

### Suggested delivery phases

**P2.0-A — Data model & privacy design**  
Define schema, ownership rules, public/private boundaries and migration strategy.

**P2.0-B — Persistent machine passport**  
Create authenticated machine records linked to canonical STIHL model/serial data and existing QR passport functionality.

**P2.0-C — Warranty module**  
Purchase date, dealer, warranty dates/status and document references.

**P2.0-D — Service & repair timeline**  
Maintenance events, repairs, parts, costs, notes and attachments.

**P2.0-E — My Machines UX**  
Search, filters, timeline, machine detail and mobile/QR flow.

**P2.0-F — Transfer / workshop workflow**  
Optional ownership transfer, workshop entries and controlled third-party service updates.

### Future value

This turns STIHLDecoder from primarily a decoding/reference tool into a long-lived machine record: decode -> identify -> passport -> maintain -> repair -> document -> transfer.

### Explicit non-goals for first implementation

- no automatic warranty claims;
- no assumption of official STIHL warranty-system integration;
- no public exposure of personal data;
- no copying of the VB Warranty Management System code or STIHL logo/assets from that repository;
- no modification of canonical technical evidence as a side effect of passport/service activity.

---

## Phase 43A — BR Batch 1 Execution Checkpoint

**Status:** EXECUTED (2026-09-17)
**Branch:** `audit/phase43a-br-batch1-evidence-reconciliation`
**Commits:** none yet (artifacts created, tests pending)

### Harvest execution

- Harvest artifact: `data/candidate_evidence/official_products/harvest_BR_2026-09-17T01-53-11-199Z.json`
- Scope: 8 target models only (full 200-product harvest not executed)
- 8/8 harvested, 0 failed
- 6 exact model matches, 2 variant matches (SR 430/450 — harvester name mismatch, models already exist in database)
- automatic_promotion_allowed: false

### Reconciliation results

| Category | Count |
|---|---|
| Total field comparisons | 57 |
| EXACT_MATCH | 13 |
| POSSIBLE_MARKET_VARIANT | 3 |
| ALREADY_PRESENT_EQUIVALENT | 15 |
| DATABASE_MISSING (true new) | 26 |
| NOT_COMPARABLE | 0 |

### Market variants (3 confirmed)

- MS 261 power: BR 2.95 kW vs canonical 3.0 kW
- MS 260 weight: BR 4.9 kg vs canonical 4.8 kg
- BR 600 weight: BR 10.1 kg vs canonical 10.3 kg

### SR 430/450 identity note

Harvester reported "new model" for SR 430/450 due to Portuguese product name prefix ("PULVERIZADOR A COMBUSTAO"). Models already exist in database with 9-10 public evidence facts each. All BR values match existing evidence.

### Canonical data changes

- `stihl_database.json`: NO CHANGES (frozen)
- `public_evidence_facts.json`: NO CHANGES (frozen)

### Artifacts produced (12 files)

All in `data/`:
1. `phase43a_br_source_manifest.json`
2. `phase43a_br_model_identity_review.json`
3. `phase43a_br_field_reconciliation.json`
4. `phase43a_br_database_missing_disposition.json`
5. `phase43a_br_high_value_candidate_review.json`
6. `phase43a_br_market_variant_review.json`
7. `phase43a_br_manual_evidence_audit.json`
8. `phase43a_br_accessory_exclusion_audit.json`
9. `phase43a_br_deferred_new_model_inventory.json`
10. `phase43a_br_phase43b_ready_candidates.json`
11. `phase43a_br_coverage_summary.json`
12. `phase43a_br_final_report.json`

### Phase 43B readiness

- 20 HIGH_VALUE candidates identified for Phase 43B activation (of 32 total; 12 already present in public evidence)
- 0 new models to onboard (SR 430/450 already exist)
- 0 accessories in scope
- Canonical DB frozen; promotion requires explicit Phase 43B approval

---

## Phase 43B — BR Batch 1 High-Value Evidence Activation

**Status:** ACTIVATION CANDIDATE COMPLETE (2026-09-17)
**Branch:** `feat/phase43b-br-batch1-evidence-activation`
**Parent:** `fc076a8` (Phase 43A)

### Activation results

| Category | Count |
|---|---|
| Phase 43A READY inputs | 32 |
| Canonical + evidence activated | 20 |
| Already present equivalent | 12 |
| Market variant blocked | 3 |
| Configuration dependent blocked | 0 |
| Unaccounted | 0 |

### Canonical database

- Models before: 62
- Models after: 62 (unchanged)
- CORE5: 62/62
- production_confidence: all UNKNOWN
- specs_verified: no true values introduced

### Public evidence

- Facts before: 492
- Facts added: 20
- Facts after: 512
- Old facts removed: 0
- Old facts mutated: 0
- Fact ID collisions: 0

### Market variant safety

- MS 261 power: preserved at 3.0 kW (not BR 2.95)
- MS 260 weight: preserved at 4.8 kg (not BR 4.9)
- BR 600 weight: preserved at 10.3 kg (not BR 10.1)
- Market variants canonicalized: 0

### Models affected (5 of 8)

- MS 260: +6 fields (sound_pressure, sound_power, vibration_left/right, oil_tank, fuel_tank)
- MS 261: +4 fields (sound_pressure, sound_power, vibration_left/right)
- HS 45: +4 fields (sound_pressure, sound_power, vibration_left/right)
- FS 120: +5 fields (weight, sound_pressure, sound_power, vibration_left/right)
- BR 600: +1 field (sound_power)
- SR 430: 0 new canonical writes (all fields already in public evidence)
- SR 450: 0 new canonical writes (all fields already in public evidence)
- FS 38: 0 new canonical writes (all fields already in public evidence)

### DATABASE_MISSING crosswalk

- 26 DATABASE_MISSING fields reported by Phase 43A
- 20 overlap with HIGH_VALUE candidates (activated)
- 6 in DATABASE_MISSING only (already present in public evidence from other sources)
- 12 in HIGH_VALUE only (fields not in DATABASE_MISSING disposition but available from BR pages)

### Artifacts produced (7 files)

All in `data/`:
1. `phase43b_ready_candidate_crosswalk.json`
2. `phase43b_database_missing_high_value_crosswalk.json`
3. `phase43b_model_field_delta.json`
4. `phase43b_source_activation_audit.json`
5. `phase43b_canonical_activation_audit.json`
6. `phase43b_blocked_candidates.json`
7. `phase43b_public_evidence_activation.json`

### Tests

- Phase 43B tests: 20/20 PASS
- All regression gates: PASS
- canonical_policy: PASS
- Phase 39C: PASS
- Phase 40B: PASS (updated fact count)
- Phase 41: PASS
- Phase 42D: PASS (updated fact count)
- Phase 43A: PASS (updated fact count)
- Harvester: PASS

### Next

Phase 43C — BR Batch 1 Production Promotion & Live Verification

---

## Phase 43C — BR Batch 1 Production Promotion & Live Verification

**Status:** COMPLETE — PROMOTED / DEPLOYED / LIVE VERIFIED (2026-09-17)
**Branch:** `main` (cherry-picked from `feat/phase43b-br-batch1-evidence-activation`)
**Promoted commit:** `6ecacb31e59e4ead247fb39ef9c10138fe2c7a59`
**Promoted tree:** `59e3d1e76f3d1a322534f0a89072c338649cdbeb`

### Promotion results

- Cherry-pick method: Phase 43A (`8bec12f`) then Phase 43B (`6ecacb3`) onto main
- Conflicts: 0
- Post-promotion tests: all PASS
- Live deployment: Render auto-deploy from main
- Live verification: HTTP 200, 114 sitemap URLs, all target routes present

### Final BR Batch 1 state

| Metric | Value |
|---|---|
| Existing models reviewed | 8 |
| Canonical fields added | 20 |
| Public evidence facts added | 20 |
| Fact count | 492 → 512 |
| Market variants preserved | 3 |
| Canonical overwrites | 0 |
| Non-target mutations | 0 |
| Canonical models | 62 |
| CORE5 | 62/62 |

### Live verification

- Homepage: HTTP 200
- Sitemap: 114 URLs
- Target model routes: all present (ms-260, ms-261, hs-45, sr-430, sr-450, fs-120, fs-38, br-600)
- Phase 42C routes: BG 56/66/86, SH 56/86, MS 201 T-CM all present
- production_confidence: all UNKNOWN
- specs_verified: no true values

### Tests

- canonical_policy: PASS
- Phase 39C: PASS
- Phase 40B: PASS
- Phase 41: PASS
- Phase 42D: PASS
- Phase 43A: PASS
- Phase 43B: 20/20 PASS
- Harvester: PASS
- New regressions: 0

---

## Phase 44A — BR Full Catalog Harvest, New Model Intake Audit & Prioritization

**Status:** COMPLETE — AUDIT-ONLY (2026-09-17)
**Branch:** `audit/phase44a-br-full-catalog-intake`
**Base commit:** `947eb3e5ac8345abb3f1c7aac7bd9191487f5c02`

### Goal

Establish the full authoritative BR catalog from STIHL's official e-commerce platform, separate machines from accessories, reconcile against the existing 62-model database, and prioritize new candidates for Phase 44B activation.

### Catalog discovery

- **Source:** VTEX Catalog System API (`https://loja.stihl.com.br/api/catalog_system/pub/products/search`)
- **Method:** API pagination (50 products per batch, 5 batches)
- **Total products discovered:** 201
- **Historical plan correction:** Previous plan cited 200 products from first-party harvester; actual VTEX API discovery yielded 201

### Classification results

| Category | Count |
|---|---|
| Machines | 118 |
| Accessories | 71 |
| Unknown | 12 |
| **Total** | **201** |

### Machine type breakdown

| Type | Count |
|---|---|
| BRUSHCUTTER | 20 |
| CHAINSAW | 19 |
| HEDGE_TRIMMER | 18 |
| PRESSURE_WASHER | 11 |
| BLOWER | 9 |
| LAWNMOWER | 9 |
| SPRAYER | 9 |
| VACUUM | 7 |
| GENERATOR | 4 |
| PRUNING_SAW | 4 |
| WATER_PUMP | 3 |
| CIRCULAR_SAW | 2 |
| PRUNING_SHEARS | 1 |
| AUGER | 1 |
| TILLER | 1 |

### Reconciliation with existing database

- Existing database models: 62
- Matched with catalog: 13
- New machine candidates: 105

### Priority tier assignment

| Tier | Description | Count |
|---|---|---|
| TIER_1_HIGH | High-demand combustion machines with references | 21 |
| TIER_2_MEDIUM | Battery-powered or medium-demand machines | 72 |
| TIER_3_LOW | Specialized equipment or ambiguous naming | 12 |
| TIER_4_DEFERRED | Accessories (separate schema required) | 0 |

### Phase 44B batch definition

- **Batch ID:** `phase44b_br_tier1`
- **Total models:** 21
- **Estimated activation date:** 2026-09-18
- **Models:** MS 162, MS 172, MS 182, MS 212, MS 363, MS 382, FS 161, FS 221, FS 55, BG 50, and 11 more Tier 1 candidates

### Output artifacts

1. `data/phase44a_vtex_full_catalog.json` — Full VTEX catalog (201 products)
2. `data/phase44a_br_catalog_classified.json` — All products classified
3. `data/phase44a_br_catalog_machines.json` — Machine subset (118)
4. `data/phase44a_br_catalog_accessories.json` — Accessory subset (71)
5. `data/phase44a_br_catalog_analysis.json` — Analysis results
6. `data/phase44a_br_intake_prioritization.json` — Priority tier report
7. `data/phase44a_br_new_candidates_prioritized.json` — 105 new candidates with tiers
8. `data/phase44b_br_batch_definition.json` — Phase 44B batch (21 models)
9. `data/phase44a_br_source_manifest.json` — Source manifest
10. `data/phase44a_br_product_dispositions.json` — Product dispositions
11. `data/phase44a_br_existing_model_matches.json` — 13 existing model matches
12. `data/phase44a_br_new_machine_candidates.json` — 105 new machine candidates
13. `data/phase44a_br_accessory_inventory.json` — 71 accessories (deferred)
14. `data/phase44a_br_ambiguous_inventory.json` — 12 unknown items
15. `data/phase44a_br_core5_staging.json` — CORE5 staging report
16. `data/phase44a_br_final_report.json` — Final Phase 44A report

### Gates

- No production data mutation: PASS
- No deployment: PASS
- No merge to main: PASS
- All artifacts created: PASS
- Regression tests: PASS

### Tests

- canonical_policy: PASS
- official_product_harvester: PASS
- Phase 39C: PASS (14/14)
- New regressions: 0

### Not in scope for Phase 44A

- Accessory schema implementation (separate future domain)
- fetch-stihl-products cleanup (separate future change)
- STIHL Paspoort 2.0 (remains PLANNED / NOT YET ACTIVE)
- Production data writes (deferred to Phase 44B)

---

## Phase 44B — BR Tier 1 Canonical Identity & CORE5 Activation

**Status:** COMPLETE — CANDIDATE ONLY (2026-09-17)
**Branch:** `feat/phase44b-br-tier1-identity-activation`
**Base commit:** `4c1d7bd250e5feae48de7be742d5cd34af4d22af` (Phase 44A)
**Base tree:** `6b39663b68f7d415673abc2c61555b5979ab1e0b` (Phase 44A)

### Goal

Activate 21 Tier 1 high-priority machine models from Phase 44A with canonical identity and CORE5 classification.

### Activation results

| Metric | Value |
|---|---|
| Input Tier 1 models | 21 |
| Activated | 21 |
| Already canonical | 0 |
| Blocked | 0 |
| Models before | 62 |
| Models after | 83 |

### Sub-batch execution

- **Sub-batch 1:** 11 models (MS 182, MS 162, FS 161, BG 50, MS 172, FS 221, FS 55, MS 363, BR 800, FS 131, FS 85)
- **Sub-batch 2:** 10 models (FS 80, MS 661, FR 410, FS 351, FS 291, FS 55 R, MS 382, BR 420, MS 172 C-BE, MS 212)
- Both sub-batches passed all gates

### Activated models

| Model | Slug | Category | CORE5 | Aliases |
|---|---|---|---|---|
| MS 182 | ms-182 | Kettingzaag | 5/5 | MS182 |
| MS 162 | ms-162 | Kettingzaag | 5/5 | MS162 |
| FS 161 | fs-161 | Bosmaaier | 5/5 | FS161 |
| BG 50 | bg-50 | Bladblazer | 5/5 | BG50 |
| MS 172 | ms-172 | Kettingzaag | 5/5 | MS172 |
| FS 221 | fs-221 | Bosmaaier | 5/5 | FS221 |
| FS 55 | fs-55 | Bosmaaier | 5/5 | FS55 |
| MS 363 | ms-363 | Kettingzaag | 5/5 | MS363 |
| BR 800 | br-800 | Bladblazer | 5/5 | BR800 |
| FS 131 | fs-131 | Bosmaaier | 5/5 | FS131 |
| FS 85 | fs-85 | Bosmaaier | 5/5 | FS85 |
| FS 80 | fs-80 | Bosmaaier | 5/5 | FS80 |
| MS 661 | ms-661 | Kettingzaag | 5/5 | MS661 |
| FR 410 | fr-410 | Bosmaaier | 5/5 | FR410 |
| FS 351 | fs-351 | Bosmaaier | 5/5 | FS351 |
| FS 291 | fs-291 | Bosmaaier | 5/5 | FS291 |
| FS 55 R | fs-55-r | Bosmaaier | 5/5 | FS55R |
| MS 382 | ms-382 | Kettingzaag | 5/5 | MS382 |
| BR 420 | br-420 | Bladblazer | 5/5 | BR420 |
| MS 172 C-BE | ms-172-c-be | Kettingzaag | 5/5 | MS172C-BE |
| MS 212 | ms-212 | Kettingzaag | 5/5 | MS212 |

### Policy compliance

- production_confidence: UNKNOWN (all new models)
- specs_verified: false (all new models)
- Public facts: 512 (unchanged)
- Technical facts added: 0
- Existing 62 models mutated: 0
- Suffix preservation: 100%
- Slug collisions: 0
- Alias collisions: 0

### Tests

- canonical_policy: PASS
- official_product_harvester: PASS
- Phase 39C: PASS (14/14)
- Phase 44B: PASS (all gates)
- New regressions: 0

### Output artifacts

1. `data/phase44b_identity_dispositions.json` — 21 model dispositions
2. `data/phase44b_existing_model_immutability_audit.json` — 62 existing models unchanged
3. `data/phase44b_identity_activation_audit.json` — Identity activation details
4. `data/phase44b_core5_activation_audit.json` — CORE5 5/5 for all activated
5. `data/phase44b_route_integration_audit.json` — Route integration details
6. `data/phase44b_search_integration_audit.json` — Search integration details
7. `data/phase44b_batch_accounting.json` — Batch accounting
8. `data/public_evidence_baseline_manifest.json` — Updated manifest

### Not in scope for Phase 44B

- Technical evidence activation (deferred to Phase 44C)
- Tier 2/3 models (future phases)
- Accessory schema (separate future domain)
- STIHL Paspoort 2.0 (remains PLANNED / NOT YET ACTIVE)
- Production promotion (deferred to Phase 44D)

---

## Phase 44C — BR Tier 1 Technical Evidence Reconciliation & Activation

**Status:** COMPLETE ✅

### Outcome

Technical evidence activation for 21 BR Tier 1 models from official STIHL BR product pages.

- Models: 83 → 83 (frozen)
- CORE5: 83/83 (frozen)
- Public facts: 512 → **701** (+189)
- Canonical field writes: 189
- Blocked candidates: 8 (all: weight_kg CONFIGURATION_DEPENDENT_BLOCKED for chainsaws)
- Existing canonical field overwrites: 0
- production_confidence: UNKNOWN (all)
- specs_verified: false (all)
- Branch: `feat/phase44c-br-tier1-technical-evidence`
- All regression tests PASS

---

## Phase 44D — BR Tier 1 Production Promotion & Live Verification

**Status:** COMPLETE ✅ — promoted, deployed, live verified 2026-09-21.

### Result

BR Tier 1 candidate (R2/R3 accepted tree) promoted to production via fast-forward. Original Phase44C remains REJECTED.

- **Promotion method:** FAST-FORWARD from `947eb3e` to `eae6f8e`
- **Promoted main:** `eae6f8e883cc95a87cf1f21c9d97ed73ac19f5dd`
- **Promoted tree:** `5adc68af6c7d34d3a40dbf387dfbb2f32a6985c2`
- **Deployment:** Render — LIVE, deployed SHA matches promoted main
- **Rejected Phase44C deployed:** NO

### Production state

- Models: **83**
- CORE5: **83/83**
- Baseline facts: 512 (0 mutated, 0 removed)
- Safe new facts: 153
- Final public facts: **665** (512 + 153)
- Safe canonical technical fields: **153**
- Blocked candidates: **44** (all protected in production)
- Baseline unindexed debt: **38** (unchanged, 0 newly indexed)

### Verification results

- R2/R3 data parity: IDENTICAL (all 3 canonical data files + src/ + package files)
- Regression: 0 new candidate-only regressions (P→C: 28 EP / 21 EHF / 0 R; B→C: 28 EP / 21 EHF / 0 R)
- Canonical policy: 83/83 production_confidence=UNKNOWN, 0 specs_verified=true
- 21/21 Tier1 routes: HTTP 200
- 10/10 prior identity routes: HTTP 200
- 8/8 blocked chainsaw weights: PROTECTED
- Variant isolation (MS172/MS172 C-BE, FS55/FS55 R): PASS, 0 cross-leakage
- Phase43 market variants (MS261 3.0kW, MS260 4.8kg, BR600 10.3kg): 3/3 PROTECTED
- Sitemap: 146 URLs, 0 duplicates, 0 broken, 21/21 Tier1 present
- Homepage H1: correct, count=1
- 0 orphan Tier1 pages (all linked from category pages)
- Dependency freeze: package.json/lock unchanged, fetch-stihl-products=2.0.5 devDep only, 0 runtime imports
- R3 audit workflow: EXISTS, production runtime impact=NONE

### BR Tier 1 Pipeline Status

**COMPLETE.** 21 Tier1 identities + 153 safe technical canonical fields and evidence facts live in production with 44 blocked unsafe/ambiguous candidates protected.

### Phase44D production report

See `data/phase44d_tier1_production_report.json`.

---

## Phase 45A — BR Tier 2 Identity Review & Batch Prioritization

**Status:** COMPLETE ✅ — audit complete, identities reconciled, Phase 45B Wave 1 defined.

### Goal

Review the 72 Tier 2 BR machine candidates from Phase 44A intake for identity activation eligibility, bundle deduplication, category architecture readiness, and batch prioritization.

### Key Audit Findings

- **Total input records:** 72 product records from `phase44a_br_new_candidates_prioritized.json` (TIER_2_MEDIUM)
- **Accounted records:** 72/72 (100%)
- **Unique machine identities:** **63**
- **Bundle duplicates:** **9** (all kit/battery/charger bundles matching standalone tool or duplicate kit SKUs)
- **Existing canonical exact collisions:** **0** (checked against all 83 current production models)
- **Slug / alias collisions:** **0**
- **modelInfo-null records reviewed:** **18/18** parsed and reviewed
- **Category architecture readiness:**
  - Route-ready existing categories: **27** identities (chainsaws, brushcutters, blowers, hedge trimmers)
  - New category architecture required: **36** identities (pressure washers, lawnmowers, sprayers, vacuums, pruning saws/shears, cut-off machines)
- **CORE5 staging:** 63/63 identities staged with complete 5/5 attributes
- **Priority classification:**
  - `45B_WAVE1_READY`: **23** identities
  - `45B_WAVE2_READY`: **4** identities
  - `CATEGORY_ARCHITECTURE_REQUIRED`: **36** identities

### Accounting Equation

```text
72 product records = 63 unique machine identities + 9 bundle duplicate records
```

### Phase 45B Wave 1 Selection

Wave 1 selects **15** high-confidence, route-ready, collision-free identities fitting existing website category architecture (`kettingzagen`, `bosmaaiers`, `bladblazers`, `heggenscharen`):

1. **FSA 45** (brushcutter / `bosmaaiers`)
2. **BGA 30** (blower / `bladblazers`)
3. **FSA 50** (brushcutter / `bosmaaiers`)
4. **HLA 40** (hedge trimmer / `heggenscharen`)
5. **HSA 40** (hedge trimmer / `heggenscharen`)
6. **SHA 56** (vacuum shredder / `bladblazers`)
7. **HSA 30** (hedge trimmer / `heggenscharen`)
8. **HSA 100** (hedge trimmer / `heggenscharen`)
9. **FSA 30** (brushcutter / `bosmaaiers`)
10. **MSA 60 C-B** (chainsaw / `kettingzagen`)
11. **MSA 160 C-B** (chainsaw / `kettingzagen`)
12. **FSA 135** (brushcutter / `bosmaaiers`)
13. **MSA 220 C-B** (chainsaw / `kettingzagen`)
14. **MSA 200 C-B** (chainsaw / `kettingzagen`)
15. **MSA 70 C-B** (chainsaw / `kettingzagen`)

### Deferred Scope from Phase 45A

- Wave 2 route-ready candidates: **12** identities (including 8 remaining 45B_WAVE1_READY candidates and 4 45B_WAVE2_READY)
- New category architecture candidates: **36** identities
- Tier 3 machine candidates: **12**
- Accessories: **71**
- Unknown/ambiguous records: **12**
- Historical test baseline modernization: deferred
- Baseline 38 unindexed facts: deferred
- STIHL Paspoort 2.0: PLANNED / NOT YET ACTIVE

---

## Phase 45B — BR Tier 2 Wave 1 Canonical Identity & CORE5 Activation

**Status:** CANDIDATE COMPLETE ✅ — 15 Wave 1 identities activated in canonical database, CORE5 98/98, facts frozen at 665. Ready for Phase 45C technical evidence reconciliation.

### Scope & Results

- **Input:** 15 Wave 1 identities from Phase 45A definition
- **Activated:** 15 (FSA 45, BGA 30, FSA 50, HLA 40, HSA 40, SHA 56, HSA 30, HSA 100, FSA 30, MSA 60 C-B, MSA 160 C-B, FSA 135, MSA 220 C-B, MSA 200 C-B, MSA 70 C-B)
- **Blocked:** 0
- **Already canonical:** 0
- **Models after:** **98** (83 + 15 = 98)
- **CORE5 after:** **98/98** (all 5/5 completeness, mapped to canonical controlled vocabulary)
- **Public facts:** **665** (frozen — 0 added, 0 removed, 0 mutated, byte-identical hash)
- **Technical fields:** **null** across all 14 protected fields (0 technical additions, battery_system = null)
- **Production confidence:** UNKNOWN (all 98 models)
- **Specs verified:** false (0 violations)
- **Sub-batch 1:** 8 models activated (FSA 45, BGA 30, FSA 50, HLA 40, HSA 40, SHA 56, HSA 30, HSA 100)
- **Sub-batch 2:** 7 models activated (FSA 30, MSA 60 C-B, MSA 160 C-B, FSA 135, MSA 220 C-B, MSA 200 C-B, MSA 70 C-B)

### Deferred Scope from Phase 45B

- Remaining Wave 1-ready identities: **8** deferred
- Wave 2-ready identities: **4** deferred
- New category architecture candidates: **36** deferred
- Tier 3 machine candidates: **12**
- Accessories: **71**
- Unknown/ambiguous records: **12**
- Historical test baseline modernization: deferred
- Baseline 38 unindexed facts: deferred
- STIHL Paspoort 2.0: PLANNED / NOT YET ACTIVE

---

## Phase 45C — BR Tier 2 Wave 1 Technical Evidence Reconciliation

**Status:** NOT ACCEPTED FOR PRODUCTION ⚠️ — candidate required remediation; standalone source precedence not proven for BGA 30 / HSA 30, and raw-to-ledger candidate expansion was not explicitly accounted for in reporting. Superseded by Phase 45C-R1.

### Scope & Results

- **Target models:** 15 Wave 1 identities
- **Models count:** **98**
- **CORE5 completeness:** **98/98**
- **Findings leading to R1:**
  - `phase45c_capture_sources.mjs` selected sources by array position rather than standalone precedence, causing BGA 30 and HSA 30 to anchor to kit URLs/references.
  - Textual report cited 175 raw candidates, leaving the 187 semantic ledger rows mathematically unexplained.

---

## Phase 45C-R1 — Standalone Source Precedence & Evidence Accounting Remediation

**Status:** PASS ✅ — standalone machine source precedence proven (3/3), kit-only sources preserved (2/2), 0 conflicts, candidate expansion audit complete (175 raw DOM rows + 12 compound rows = 187 semantic ledger rows), accounting fully reconciled, 28/28 targeted assertions pass. Ready for Phase 45D production promotion.

### Scope & Remediated Results

- **Target models:** 15 Wave 1 identities
- **Models count:** **98** (83 pre-45B + 15 Wave 1)
- **CORE5 completeness:** **98/98**
- **Standalone source precedence:** **3/3** (BGA 30, HSA 30, FSA 50 anchored to exact standalone product pages and references)
- **Kit-only classifications:** **2/2** (HSA 40 and FSA 30 correctly retained as `KIT_ONLY_IDENTITY_SOURCE`)
- **Source selection algorithm:** Fully order-independent and deterministic across catalog variations
- **Machine-spec comparison:** All 3 groups (BGA 30, HSA 30, FSA 50) verified 100% identical machine specs between standalone and kit pages (0 conflicts)
- **Fact ID crosswalk:** 6 rebound facts (4 BGA 30, 2 HSA 30) explicitly crosswalked from kit to standalone provenance (`RETAIN_REBIND_TO_STANDALONE`)
- **Raw candidate DOM rows:** **175**
- **Compound source rows:** **12** (10 dual-handle left/right vibration + 2 FSA 135 nylon/blade dual-handle vibration)
- **Semantic ledger rows:** **187** (163 single-component rows + 24 compound component candidates = 187)
- **Ledger partition:**
  - **SAFE:** **56** (32 `SAFE_SINGLE_VALUE`, 24 `SAFE_COMPOUND_COMPONENT`)
  - **NON-SAFE:** **131** (31 `CONFIGURATION_DEPENDENT_BLOCKED`, 31 `FIELD_SEMANTIC_AMBIGUOUS_BLOCKED`, 23 `NOT_CANONICAL_FIELD`, 15 `BATTERY_CONFIGURATION_BLOCKED`, 11 `CHARGER_SPEC_BLOCKED`, 20 `EVIDENCE_ONLY_SCOPED`)
  - **Sum:** 56 + 131 = 187 (PASS)
- **Safe canonical writes:** **56**
- **Safe public evidence facts added:** **56**
- **Public facts total:** **721** (665 baseline + 56 = 721)
- **Pre-existing 665 facts mutated:** **0**
- **Pre-existing 38 unindexed baseline debt:** **38** (untouched)
- **Model index & Field index:** 56/56 indexed with zero stale IDs
- **Runtime resolvable & canonical parity:** 56/56 PASS
- **Production confidence:** UNKNOWN (all 98 models)
- **Specs verified:** false (all 98 models)

---

## Phase 45D — BR Tier 2 Wave 1 Production Promotion & Live Verification

**Status:** COMPLETE / LIVE / VERIFIED ✅

### Promotion & Deployment Summary

- **Promoted commit:** `f0e4fba6e6641991cd1845f358029828e706fad5`
- **Promoted tree:** `3c0d917f462801a46c297b749407d0ffa4e31f30`
- **Method:** Fast-forward only (linear history, ahead 4, behind 0 from previous main baseline `bf4183e`)
- **Parity:** Exact tree parity verified, zero application data drift
- **Render Deployment:** Live deployed commit `f0e4fba6e6641991cd1845f358029828e706fad5`, HTTP 200, database connected & persistent (schema v3)

### Production Verification State

- **Total models:** **98** (83 previous + 15 Wave 1)
- **CORE5 completeness:** **98/98**
- **Public evidence facts:** **721** (665 previous + 56 Wave 1)
- **Safe canonical technical fields:** **56**
- **Non-safe candidates blocked:** **131** (0 leaks of charger mains 127V/220V, 0 un-flattened weights)
- **Baseline unindexed debt:** **38** (preserved untouched)
- **Wave 1 routes (15/15 HTTP 200):**
  - `/bosmaaiers/fsa-45/`
  - `/bladblazers/bga-30/`
  - `/bosmaaiers/fsa-50/`
  - `/heggenscharen/hla-40/`
  - `/heggenscharen/hsa-40/`
  - `/bladblazers/sha-56/`
  - `/heggenscharen/hsa-30/`
  - `/heggenscharen/hsa-100/`
  - `/bosmaaiers/fsa-30/`
  - `/kettingzagen/msa-60-c-b/`
  - `/kettingzagen/msa-160-c-b/`
  - `/bosmaaiers/fsa-135/`
  - `/kettingzagen/msa-220-c-b/`
  - `/kettingzagen/msa-200-c-b/`
  - `/kettingzagen/msa-70-c-b/`
- **Sitemap:** All 15 Wave 1 model URLs present and valid in `sitemap.xml`
- **Category inlinks:** All 15 models accessible from their respective category hubs (0 orphan models)
- **Zero regressions:** Verified across all prior production models (MS 182, MS 172, MS 172 C-BE, FS 55, FS 55 R, MS 661, BR 800, BR 420, MS 251 C, BG 56, BG 66, BG 86, SH 56, SH 86, MS 260, MS 261, BR 600, MS 201 TC-M)
- **Production checkpoint report:** `data/phase45d_wave1_production_report.json`

---

## Phase 46A — BR Tier 2 Wave 2 Intake & Prioritization

**Status:** PLANNED / NOT STARTED ⏳

---

## Backlog note

Prioritize the official evidence reconciliation/data-quality work before activating STIHL Paspoort 2.0. Re-evaluate Paspoort 2.0 scope only after the harvester/evidence pipeline and canonical-data review process are stable, so the private account/data architecture is designed deliberately rather than added onto the public evidence store.


## Phase 44C-R2 — Technical Evidence Semantic Reconstruction & Runtime Remediation

**Historical R2 status:** HARD STOP — semantic reconstruction locally validated; regression equivalence was not yet established. Superseded by the R3 proof below; the original R2 report remains unchanged as historical evidence.

- Original Phase44C (`15fefa2`) is **REJECTED FOR PRODUCTION**: runtime schema/index defects, unit defects and unsafe scalar collapse. Historical Phase44C completion text above records the original claim, not production acceptance.
- Phase44D preflight: HARD STOP; no promotion or deployment.
- Phase44C-R1: HARD STOP after unit and multivalue defects were confirmed; no remediation committed.
- R2 reconstructed from exact Phase44B (`0c00214`) and frozen Phase44C captured sources. No new source research.
- 197 candidates accounted: 153 safe canonical fields and public facts, 44 blocked; 36 original Phase44C writes rolled back.
- 83 models, CORE5 83/83; 512 unchanged baseline facts + 153 safe facts = 665 facts.
- 11 configuration pairs blocked; BR800 and BR420 air-volume punctuation blocked as ambiguous; 10 incomplete kW/CV records and 13 weights lacking measurement definition also blocked.
- 44 vibration components retain explicit left/right binding; 8 original chainsaw weights remain blocked.
- All 153 retained facts resolve through existing runtime; old facts/indexes/runtime behavior unchanged, including 38 unindexed baseline facts.
- Targeted tests and actual repeat execution PASS. Full regression must pass before acceptance.
- Phase44D: **PENDING R2 ACCEPTANCE / NOT READY FOR RETRY** until regression verification succeeds.
- Main and production unchanged. Tier2/Tier3/accessories/unknown and Passport 2.0 remain deferred.

### R2 regression checkpoint

- Existing full runner executed in isolated worktrees: 49 files, 23 PASS / 26 FAIL on both rejected Phase44C and R2. Zero additional failing files; full behavioral equivalence is not established by those counts.
- Native dependency installation failed under Node 25 and Node 24 (better-sqlite3 build requires unavailable Visual Studio C++ tooling). Other failures include historical fixed-count assertions, replay reference configuration, and preserved baseline evidence debt.
- Phase39C initially exposed unnecessary baseline-ID drift in R2 manifest metadata. The historical baseline ID was preserved, and the unchanged Phase39C suite now passes.
- The new scoped index test initially compared filtered extant references with the entire baseline index. It now compares all non-R2 references exactly, including pre-existing stale references; no baseline index entries were repaired or dropped. Existing tests remain unchanged.
- See `data/phase44c_r2_regression_report.json` for paired results. R2 targeted runtime tests PASS; overall R2 acceptance remains HARD STOP.
- No R2 commit or remote push; no main mutation or deployment. Phase44D remains blocked pending separate resolution/acceptance.

## Phase 44C-R3 — Immutable Regression Equivalence & CI Reproducibility

**Status:** PASS — R2 semantic reconstruction accepted as feature candidate; zero new regressions under Node22. Phase44D READY FOR RETRY, not executed.

- Immutable production P: `947eb3e5ac8345abb3f1c7aac7bd9191487f5c02` (tree `c0a5739787343d57c5dcd5fa8c0065abc4e18849`).
- Immutable Phase44B B: `0c00214888a67f90eb2a6466ceb0d85b166e5314` (tree `8fb0681cc4dd96dba528a827250cdfcc8a6cbde3`).
- Exact R2 checkpoint C: `7fde0027ffdf93fbe9276d6b7f831a337bd3dc51` (tree `ca6e823a5e06c96920b3a4b55f38fa5e87ad2883`). Snapshot manifest records all 19 original changed R2 files and binary patch checksum.
- Authoritative fallback: GitHub Actions run `35524758295`, Ubuntu 24.04.5 x64, Node22.23.2, npm10.9.8; separate clean `npm ci` PASS for P/B/C. Same package/lock/49 test blobs, timeout 120 seconds and real `origin/main=P`; full Git history. Windows setup was abandoned after the hosted environment succeeded; no compiler or package remediation.
- All 147 individual executions accounted for: each snapshot 28 PASS / 21 FAIL. Both P→C and B→C: 28 EQUIVALENT_PASS, 21 PRE_EXISTING_EQUIVALENT_FAIL, 0 TIMEOUT, 0 methodology reclassifications, **0 REGRESSION**.
- All 10 formerly differing failures reviewed at assertion level. Fixed counts/hashes and first-failure masking explain the differences. Read-only probe confirms the same 49 ready dossiers, all 63 added model queries pass, and the same two legacy ms-251-c query failures. Candidate validator has only the exact same 20 baseline missing-document-identity findings; four stale baseline hash/count findings are removed.
- R2 targeted: 19 groups PASS on hosted Node22; canonical policy and official harvester PASS. 83 models, CORE5 83/83, 665 facts, 153 safe fields/facts, runtime and canonical parity 153/153, 44 blocked, zero original 512 fact/index mutations, 38 baseline unindexed facts untouched. Deterministic reconstruction/idempotence PASS.
- Production CI run `35180278876` and candidate CI run `35524758271` both use Node22.23.2/npm10.9.8, `npm ci` PASS, `npm test` FAIL with the same 27-file failure set. Six extra CI failures come from default shallow checkout missing pinned historical Git objects; all six pass for full-history P/B/C. No unexplained CI-only failures.
- Required proof: `data/phase44c_r3_test_universe.json`, `phase44c_r3_environment_manifest.json`, `phase44c_r3_regression_matrix.json`, `phase44c_r3_differing_failure_analysis.json`, plus semantic probe and CI confirmation artifacts. Raw per-file stdout/stderr, exits and timings are retained in the matrix.
- Original Phase44C: REJECTED. Phase44C-R1: HARD STOP. Phase44C-R2: semantic reconstruction validated. Phase44C-R3: regression equivalence validated under Node22.
- R3 production-data/runtime/historical-test/package changes: zero. Main remains P; no Render deployment. This is feature-candidate acceptance only; Tier1 is not live.

### Historical regression debt — planning only

Historical regression suite contains stale fixed-count/baseline assertions, missing replay-reference/pypdf setup, shallow-history assumptions and legacy source-path/query fixtures. No historical tests were edited or modernized. Consider a separate TEST BASELINE MODERNIZATION phase only after production promotion, preserving historical fixtures and negative controls. Do not repair the 38 baseline-unindexed facts in R3.

---

## SERIAL DECODER RECOVERY — Historical Regression Audit & Range Engine Repair

**Status:** RECOVERY CANDIDATE COMPLETE / PASS (Awaiting User Production Review)
**Branch:** `fix/serial-decoder-historical-recovery`
**Baseline Commit:** `00fd2c81de132a8d0887a4dbd223f79897cc549e` (Phase 45D Main)
**Protected State:** Models: 98, CORE5: 98/98, Public Evidence Facts: 721 (byte-frozen)

### 1. Root Cause
- **Last Known-Good Commit:** `45c3b49` (Phase 30, containing 15 discrete, verified historical ranges across plants 1, 2, 3).
- **First Bad Commit / Range Collapse:** `40d3cb7` (Phase 35.1), which synthetically merged discrete ranges into a monolithic 25,000,000 range (`145000000–169999999`) assigned to MS 260, absorbing 15,000,000 blower serials (`145M–159M` BR 340 / BR 420), and dropping Plant 2 (BR 600) and Plant 8 (MS 170).
- **Fallback Regression Commit:** `c3cf8a4` (Phase 36), which introduced broad prefix/family fallback heuristics (`14/15/16 -> MS 260`, `17/18 -> MS 261`), defaulting arbitrary Plant 1 serials to `MS 261 C-M Gen 2` and default category `Kettingzaag`.
- **UI State Leakage:** `index.html` failed to reset `currentModelName`, `currentYearsFormatted`, and DOM text elements (`res-model`, `res-serial-display`, `model-assist-*`) at the start of `handleDecode()`, allowing previous search results to persist when an unmapped or invalid code was entered.
- **Source-of-Truth Drift:** `data/seed.js` was obsolete dead code with outdated ranges; `data/seed.cjs` was the active SQLite builder. SQLite and JSON had drifted in active range count.

### 2. Recovered Data & Range Inventory
- Reconstructed 8 canonical, non-overlapping, verified serial ranges:
  1. `stihl_026` (DE, Plant 1): `120000000–139999999` (1989–1997, 026 / MS 260 Vroeg)
  2. `stihl_br_420` (DE, Plant 1): `145000000–159999999` (1999–2009, BR 340 / BR 420 Blower) — *Liberated 15M serials falsely attributed to MS 260*
  3. `stihl_ms_260` (DE, Plant 1): `160000000–169999999` (2002–2011, MS 260 Laat)
  4. `stihl_ms_261_cm` (DE, Plant 1): `171000000–179999999` (2010–2016, MS 261 Gen 1)
  5. `stihl_ms_261_cm` (DE, Plant 1): `180000000–199999999` (2016–2024, MS 261 C-M Gen 2)
  6. `stihl_ms_290` (US, Plant 2): `240000000–269999999` (1993–2011, MS 290 Farm Boss)
  7. `stihl_br_600` (US, Plant 2): `270000000–289999999` (2006–2020, BR 600 4-Mix Blower)
  8. `stihl_fs_120` (BR, Plant 3): `330000000–350000000` (1997–2014, FS 120 Bosmaaier)
- Plant 8 (China) unassisted serials (`824061159`) preserved fail-closed as `MODEL_NOT_IDENTIFIED` with `modelAssistAvailable: true` per Phase 36 acceptance contract.

### 3. Engine Architecture & Policy Alignment
- Overhaul of `StihlRangeResolver.js` & `.ts` with `findMatches()` and explicit overlap classification (`UNIQUE_RANGE_MATCH`, `SAME_MODEL_OVERLAP`, `AMBIGUOUS_MULTI_CANDIDATE`).
- Strict separation: Plant/Factory vs Production Chronology vs Model Family vs Exact Model.
- Probable model series never inherits exact technical specifications (`technicalSpecs: {}` fail-closed).
- Rebuilt `data/stihl_database.json` and synchronized `data/stihl_database.db` via `seed.cjs`.

### 4. Verification & Invariants
- **10,000 Deterministic Distribution Test:**
  - Total Serials Tested: 10,000 across valid plants (1, 2, 3, 4, 5, 8, 9).
  - MS 260 count: 417 (4.17%) — down from >95% false fallback rate.
  - MS 261 count: 418 (4.18%).
  - Other models/families: 1,241 (12.41%).
  - Honest Unknown / Format-only: 7,924 (79.24%).
  - Suspicious concentration alert (>25%): NO.
  - Critical mass fallback (>50%): NO.
- **API vs UI Parity Audit:** 13/13 test cases PASS; sequential state reset PASS; zero leakage.
---

## Phase 45C — BR Tier 2 Wave 1 Technical Evidence Reconciliation

**Status:** NOT ACCEPTED FOR PRODUCTION ⚠️ — candidate required remediation; standalone source precedence not proven for BGA 30 / HSA 30, and raw-to-ledger candidate expansion was not explicitly accounted for in reporting. Superseded by Phase 45C-R1.

### Scope & Results

- **Target models:** 15 Wave 1 identities
- **Models count:** **98**
- **CORE5 completeness:** **98/98**
- **Findings leading to R1:**
  - `phase45c_capture_sources.mjs` selected sources by array position rather than standalone precedence, causing BGA 30 and HSA 30 to anchor to kit URLs/references.
  - Textual report cited 175 raw candidates, leaving the 187 semantic ledger rows mathematically unexplained.

---

## Phase 45C-R1 — Standalone Source Precedence & Evidence Accounting Remediation

**Status:** PASS ✅ — standalone machine source precedence proven (3/3), kit-only sources preserved (2/2), 0 conflicts, candidate expansion audit complete (175 raw DOM rows + 12 compound rows = 187 semantic ledger rows), accounting fully reconciled, 28/28 targeted assertions pass. Ready for Phase 45D production promotion.

### Scope & Remediated Results

- **Target models:** 15 Wave 1 identities
- **Models count:** **98** (83 pre-45B + 15 Wave 1)
- **CORE5 completeness:** **98/98**
- **Standalone source precedence:** **3/3** (BGA 30, HSA 30, FSA 50 anchored to exact standalone product pages and references)
- **Kit-only classifications:** **2/2** (HSA 40 and FSA 30 correctly retained as `KIT_ONLY_IDENTITY_SOURCE`)
- **Source selection algorithm:** Fully order-independent and deterministic across catalog variations
- **Machine-spec comparison:** All 3 groups (BGA 30, HSA 30, FSA 50) verified 100% identical machine specs between standalone and kit pages (0 conflicts)
- **Fact ID crosswalk:** 6 rebound facts (4 BGA 30, 2 HSA 30) explicitly crosswalked from kit to standalone provenance (`RETAIN_REBIND_TO_STANDALONE`)
- **Raw candidate DOM rows:** **175**
- **Compound source rows:** **12** (10 dual-handle left/right vibration + 2 FSA 135 nylon/blade dual-handle vibration)
- **Semantic ledger rows:** **187** (163 single-component rows + 24 compound component candidates = 187)
- **Ledger partition:**
  - **SAFE:** **56** (32 `SAFE_SINGLE_VALUE`, 24 `SAFE_COMPOUND_COMPONENT`)
  - **NON-SAFE:** **131** (31 `CONFIGURATION_DEPENDENT_BLOCKED`, 31 `FIELD_SEMANTIC_AMBIGUOUS_BLOCKED`, 23 `NOT_CANONICAL_FIELD`, 15 `BATTERY_CONFIGURATION_BLOCKED`, 11 `CHARGER_SPEC_BLOCKED`, 20 `EVIDENCE_ONLY_SCOPED`)
  - **Sum:** 56 + 131 = 187 (PASS)
- **Safe canonical writes:** **56**
- **Safe public evidence facts added:** **56**
- **Public facts total:** **721** (665 baseline + 56 = 721)
- **Pre-existing 665 facts mutated:** **0**
- **Pre-existing 38 unindexed baseline debt:** **38** (untouched)
- **Model index & Field index:** 56/56 indexed with zero stale IDs
- **Runtime resolvable & canonical parity:** 56/56 PASS
- **Production confidence:** UNKNOWN (all 98 models)
- **Specs verified:** false (all 98 models)

---

## Phase 45D — BR Tier 2 Wave 1 Production Promotion & Live Verification

**Status:** COMPLETE / LIVE / VERIFIED ✅

### Promotion & Deployment Summary

- **Promoted commit:** `f0e4fba6e6641991cd1845f358029828e706fad5`
- **Promoted tree:** `3c0d917f462801a46c297b749407d0ffa4e31f30`
- **Method:** Fast-forward only (linear history, ahead 4, behind 0 from previous main baseline `bf4183e`)
- **Parity:** Exact tree parity verified, zero application data drift
- **Render Deployment:** Live deployed commit `f0e4fba6e6641991cd1845f358029828e706fad5`, HTTP 200, database connected & persistent (schema v3)

### Production Verification State

- **Total models:** **98** (83 previous + 15 Wave 1)
- **CORE5 completeness:** **98/98**
- **Public evidence facts:** **721** (665 previous + 56 Wave 1)
- **Safe canonical technical fields:** **56**
- **Non-safe candidates blocked:** **131** (0 leaks of charger mains 127V/220V, 0 un-flattened weights)
- **Baseline unindexed debt:** **38** (preserved untouched)
- **Wave 1 routes (15/15 HTTP 200):**
  - `/bosmaaiers/fsa-45/`
  - `/bladblazers/bga-30/`
  - `/bosmaaiers/fsa-50/`
  - `/heggenscharen/hla-40/`
  - `/heggenscharen/hsa-40/`
  - `/bladblazers/sha-56/`
  - `/heggenscharen/hsa-30/`
  - `/heggenscharen/hsa-100/`
  - `/bosmaaiers/fsa-30/`
  - `/kettingzagen/msa-60-c-b/`
  - `/kettingzagen/msa-160-c-b/`
  - `/bosmaaiers/fsa-135/`
  - `/kettingzagen/msa-220-c-b/`
  - `/kettingzagen/msa-200-c-b/`
  - `/kettingzagen/msa-70-c-b/`
- **Sitemap:** All 15 Wave 1 model URLs present and valid in `sitemap.xml`
- **Category inlinks:** All 15 models accessible from their respective category hubs (0 orphan models)
- **Zero regressions:** Verified across all prior production models (MS 182, MS 172, MS 172 C-BE, FS 55, FS 55 R, MS 661, BR 800, BR 420, MS 251 C, BG 56, BG 66, BG 86, SH 56, SH 86, MS 260, MS 261, BR 600, MS 201 TC-M)
- **Production checkpoint report:** `data/phase45d_wave1_production_report.json`

---

## Phase 46A — BR Tier 2 Wave 2 Intake & Prioritization

**Status:** PLANNED / NOT STARTED ⏳

---

## Backlog note

Prioritize the official evidence reconciliation/data-quality work before activating STIHL Paspoort 2.0. Re-evaluate Paspoort 2.0 scope only after the harvester/evidence pipeline and canonical-data review process are stable, so the private account/data architecture is designed deliberately rather than added onto the public evidence store.


## Phase 44C-R2 — Technical Evidence Semantic Reconstruction & Runtime Remediation

**Historical R2 status:** HARD STOP — semantic reconstruction locally validated; regression equivalence was not yet established. Superseded by the R3 proof below; the original R2 report remains unchanged as historical evidence.

- Original Phase44C (`15fefa2`) is **REJECTED FOR PRODUCTION**: runtime schema/index defects, unit defects and unsafe scalar collapse. Historical Phase44C completion text above records the original claim, not production acceptance.
- Phase44D preflight: HARD STOP; no promotion or deployment.
- Phase44C-R1: HARD STOP after unit and multivalue defects were confirmed; no remediation committed.
- R2 reconstructed from exact Phase44B (`0c00214`) and frozen Phase44C captured sources. No new source research.
- 197 candidates accounted: 153 safe canonical fields and public facts, 44 blocked; 36 original Phase44C writes rolled back.
- 83 models, CORE5 83/83; 512 unchanged baseline facts + 153 safe facts = 665 facts.
- 11 configuration pairs blocked; BR800 and BR420 air-volume punctuation blocked as ambiguous; 10 incomplete kW/CV records and 13 weights lacking measurement definition also blocked.
- 44 vibration components retain explicit left/right binding; 8 original chainsaw weights remain blocked.
- All 153 retained facts resolve through existing runtime; old facts/indexes/runtime behavior unchanged, including 38 unindexed baseline facts.
- Targeted tests and actual repeat execution PASS. Full regression must pass before acceptance.
- Phase44D: **PENDING R2 ACCEPTANCE / NOT READY FOR RETRY** until regression verification succeeds.
- Main and production unchanged. Tier2/Tier3/accessories/unknown and Passport 2.0 remain deferred.

### R2 regression checkpoint

- Existing full runner executed in isolated worktrees: 49 files, 23 PASS / 26 FAIL on both rejected Phase44C and R2. Zero additional failing files; full behavioral equivalence is not established by those counts.
- Native dependency installation failed under Node 25 and Node 24 (better-sqlite3 build requires unavailable Visual Studio C++ tooling). Other failures include historical fixed-count assertions, replay reference configuration, and preserved baseline evidence debt.
- Phase39C initially exposed unnecessary baseline-ID drift in R2 manifest metadata. The historical baseline ID was preserved, and the unchanged Phase39C suite now passes.
- The new scoped index test initially compared filtered extant references with the entire baseline index. It now compares all non-R2 references exactly, including pre-existing stale references; no baseline index entries were repaired or dropped. Existing tests remain unchanged.
- See `data/phase44c_r2_regression_report.json` for paired results. R2 targeted runtime tests PASS; overall R2 acceptance remains HARD STOP.
- No R2 commit or remote push; no main mutation or deployment. Phase44D remains blocked pending separate resolution/acceptance.

## Phase 44C-R3 — Immutable Regression Equivalence & CI Reproducibility

**Status:** PASS — R2 semantic reconstruction accepted as feature candidate; zero new regressions under Node22. Phase44D READY FOR RETRY, not executed.

- Immutable production P: `947eb3e5ac8345abb3f1c7aac7bd9191487f5c02` (tree `c0a5739787343d57c5dcd5fa8c0065abc4e18849`).
- Immutable Phase44B B: `0c00214888a67f90eb2a6466ceb0d85b166e5314` (tree `8fb0681cc4dd96dba528a827250cdfcc8a6cbde3`).
- Exact R2 checkpoint C: `7fde0027ffdf93fbe9276d6b7f831a337bd3dc51` (tree `ca6e823a5e06c96920b3a4b55f38fa5e87ad2883`). Snapshot manifest records all 19 original changed R2 files and binary patch checksum.
- Authoritative fallback: GitHub Actions run `35524758295`, Ubuntu 24.04.5 x64, Node22.23.2, npm10.9.8; separate clean `npm ci` PASS for P/B/C. Same package/lock/49 test blobs, timeout 120 seconds and real `origin/main=P`; full Git history. Windows setup was abandoned after the hosted environment succeeded; no compiler or package remediation.
- All 147 individual executions accounted for: each snapshot 28 PASS / 21 FAIL. Both P→C and B→C: 28 EQUIVALENT_PASS, 21 PRE_EXISTING_EQUIVALENT_FAIL, 0 TIMEOUT, 0 methodology reclassifications, **0 REGRESSION**.
- All 10 formerly differing failures reviewed at assertion level. Fixed counts/hashes and first-failure masking explain the differences. Read-only probe confirms the same 49 ready dossiers, all 63 added model queries pass, and the same two legacy ms-251-c query failures. Candidate validator has only the exact same 20 baseline missing-document-identity findings; four stale baseline hash/count findings are removed.
- R2 targeted: 19 groups PASS on hosted Node22; canonical policy and official harvester PASS. 83 models, CORE5 83/83, 665 facts, 153 safe fields/facts, runtime and canonical parity 153/153, 44 blocked, zero original 512 fact/index mutations, 38 baseline unindexed facts untouched. Deterministic reconstruction/idempotence PASS.
- Production CI run `35180278876` and candidate CI run `35524758271` both use Node22.23.2/npm10.9.8, `npm ci` PASS, `npm test` FAIL with the same 27-file failure set. Six extra CI failures come from default shallow checkout missing pinned historical Git objects; all six pass for full-history P/B/C. No unexplained CI-only failures.
- Required proof: `data/phase44c_r3_test_universe.json`, `phase44c_r3_environment_manifest.json`, `phase44c_r3_regression_matrix.json`, `phase44c_r3_differing_failure_analysis.json`, plus semantic probe and CI confirmation artifacts. Raw per-file stdout/stderr, exits and timings are retained in the matrix.
- Original Phase44C: REJECTED. Phase44C-R1: HARD STOP. Phase44C-R2: semantic reconstruction validated. Phase44C-R3: regression equivalence validated under Node22.
- R3 production-data/runtime/historical-test/package changes: zero. Main remains P; no Render deployment. This is feature-candidate acceptance only; Tier1 is not live.

### Historical regression debt — planning only

Historical regression suite contains stale fixed-count/baseline assertions, missing replay-reference/pypdf setup, shallow-history assumptions and legacy source-path/query fixtures. No historical tests were edited or modernized. Consider a separate TEST BASELINE MODERNIZATION phase only after production promotion, preserving historical fixtures and negative controls. Do not repair the 38 baseline-unindexed facts in R3.

---

## SERIAL DECODER RECOVERY — Historical Regression Audit & Range Engine Repair

**Status:** RECOVERY CANDIDATE COMPLETE / PASS (Awaiting User Production Review)
**Branch:** `fix/serial-decoder-historical-recovery`
**Baseline Commit:** `00fd2c81de132a8d0887a4dbd223f79897cc549e` (Phase 45D Main)
**Protected State:** Models: 98, CORE5: 98/98, Public Evidence Facts: 721 (byte-frozen)

### 1. Root Cause
- **Last Known-Good Commit:** `45c3b49` (Phase 30, containing 15 discrete, verified historical ranges across plants 1, 2, 3).
- **First Bad Commit / Range Collapse:** `40d3cb7` (Phase 35.1), which synthetically merged discrete ranges into a monolithic 25,000,000 range (`145000000–169999999`) assigned to MS 260, absorbing 15,000,000 blower serials (`145M–159M` BR 340 / BR 420), and dropping Plant 2 (BR 600) and Plant 8 (MS 170).
- **Fallback Regression Commit:** `c3cf8a4` (Phase 36), which introduced broad prefix/family fallback heuristics (`14/15/16 -> MS 260`, `17/18 -> MS 261`), defaulting arbitrary Plant 1 serials to `MS 261 C-M Gen 2` and default category `Kettingzaag`.
- **UI State Leakage:** `index.html` failed to reset `currentModelName`, `currentYearsFormatted`, and DOM text elements (`res-model`, `res-serial-display`, `model-assist-*`) at the start of `handleDecode()`, allowing previous search results to persist when an unmapped or invalid code was entered.
- **Source-of-Truth Drift:** `data/seed.js` was obsolete dead code with outdated ranges; `data/seed.cjs` was the active SQLite builder. SQLite and JSON had drifted in active range count.

### 2. Recovered Data & Range Inventory
- Reconstructed 8 canonical, non-overlapping, verified serial ranges:
  1. `stihl_026` (DE, Plant 1): `120000000–139999999` (1989–1997, 026 / MS 260 Vroeg)
  2. `stihl_br_420` (DE, Plant 1): `145000000–159999999` (1999–2009, BR 340 / BR 420 Blower) — *Liberated 15M serials falsely attributed to MS 260*
  3. `stihl_ms_260` (DE, Plant 1): `160000000–169999999` (2002–2011, MS 260 Laat)
  4. `stihl_ms_261_cm` (DE, Plant 1): `171000000–179999999` (2010–2016, MS 261 Gen 1)
  5. `stihl_ms_261_cm` (DE, Plant 1): `180000000–199999999` (2016–2024, MS 261 C-M Gen 2)
  6. `stihl_ms_290` (US, Plant 2): `240000000–269999999` (1993–2011, MS 290 Farm Boss)
  7. `stihl_br_600` (US, Plant 2): `270000000–289999999` (2006–2020, BR 600 4-Mix Blower)
  8. `stihl_fs_120` (BR, Plant 3): `330000000–350000000` (1997–2014, FS 120 Bosmaaier)
- Plant 8 (China) unassisted serials (`824061159`) preserved fail-closed as `MODEL_NOT_IDENTIFIED` with `modelAssistAvailable: true` per Phase 36 acceptance contract.

### 3. Engine Architecture & Policy Alignment
- Overhaul of `StihlRangeResolver.js` & `.ts` with `findMatches()` and explicit overlap classification (`UNIQUE_RANGE_MATCH`, `SAME_MODEL_OVERLAP`, `AMBIGUOUS_MULTI_CANDIDATE`).
- Strict separation: Plant/Factory vs Production Chronology vs Model Family vs Exact Model.
- Probable model series never inherits exact technical specifications (`technicalSpecs: {}` fail-closed).
- Rebuilt `data/stihl_database.json` and synchronized `data/stihl_database.db` via `seed.cjs`.

### 4. Verification & Invariants
- **10,000 Deterministic Distribution Test:**
  - Total Serials Tested: 10,000 across valid plants (1, 2, 3, 4, 5, 8, 9).
  - MS 260 count: 417 (4.17%) — down from >95% false fallback rate.
  - MS 261 count: 418 (4.18%).
  - Other models/families: 1,241 (12.41%).
  - Honest Unknown / Format-only: 7,924 (79.24%).
  - Suspicious concentration alert (>25%): NO.
  - Critical mass fallback (>50%): NO.
- **API vs UI Parity Audit:** 13/13 test cases PASS; sequential state reset PASS; zero leakage.
- **Recovery Acceptance Test Suite (`tests/serial_decoder_recovery.test.js`):** 26/26 gates PASS (100%).
- **Phase 45C-R1 Regression Suite:** 28/28 PASS.
- **Phase 36 Chronology & User-Value Suites:** 100% PASS.
- **Canonical Policy & Harvester Suites:** PASS.

### 5. Candidate Status
- Candidate branch `fix/serial-decoder-historical-recovery` ready.
- Merged to main: NO.
- Deployed to Render: NO.
- Phase 46 branches untouched.
- STOPPED for explicit user review.

---

## SERIAL DECODER RECOVERY R1 — Range Provenance, Confidence & Historical-Evidence Calibration

**Status:** REMEDIATION CANDIDATE COMPLETE / PASS (Awaiting User Review)  
**Branch:** `fix/serial-decoder-recovery-r1-evidence-calibration`  
**Base Commit:** `9a8075ccfc7842a48c4d7da4436aec57542dd060` (Serial Decoder Recovery)  
**Protected State:** Models: 98, CORE5: 98/98, Public Evidence Facts: 721 (byte-frozen)  

### 1. Objectives & Provenance Calibration
- **Core Principle:** Prevent false certainty (schijnzekerheid) by distinguishing primary-documented ranges from historical repository evidence, calibrating confidence levels, and classifying family vs series semantics honestly.
- **Audit of Historical TI References (`data/serial_recovery_r1_source_reference_audit.json`):**
  - Audited 4 legacy references: `TI-2010-044`, `TI-2016-018`, `TI-2007-009`, `TI-2012-088`.
  - Findings: STIHL technical bulletins format as `TI [Number].[Year]` (e.g., `TI 51.2010`), not `TI-YYYY-NNN`. All 4 are legacy code string placeholders originating in early `seed.js`.
  - All 4 classified as `LEGACY_CODE_ONLY`.
  - Zero phantom sources grant HIGH confidence.
- **Confidence Calibration:**
  - HIGH Confidence: 0 (0.0%) — No range possesses open, authoritative primary manufacturer range breakpoint documentation.
  - MEDIUM Confidence: 8 (100.0%) — Sound internal consistency, factory match, zero surviving conflicts, substantiated by historical repository evidence or era correlation.
  - LOW Confidence: 0 (0.0%).
  - Unsupported HIGH confidence count: 0.
- **Evidence Classes:**
  - PRIMARY_DOCUMENTED: 0
  - HISTORICAL_REPOSITORY_EVIDENCE: 6 (`stihl_026` early, `stihl_br_420`, `stihl_ms_260` late, `stihl_ms_290` family, `stihl_br_600`, `stihl_fs_120` family)
  - HISTORICAL_REPOSITORY_CORROBORATED: 2 (`stihl_ms_261_cm` Gen 1, `stihl_ms_261_cm` Gen 2)
  - HEURISTIC: 0
- **Semantic Levels:**
  - `MODEL_FAMILY_RANGE`: 4 ranges (`026 / MS 260 Vroeg`, `BR 340 / BR 420`, `MS 290 / MS 310 / MS 390`, `FS 120 / FS 250`) where the range represents a platform family and Model Assist presents confirmed model choices.
  - `PROBABLE_MODEL_SERIES_RANGE`: 4 ranges (`MS 260 Laat`, `MS 261 Gen 1`, `MS 261 Gen 2`, `BR 600`) representing historical model series.

### 2. Runtime & Engine Updates
- `src/StihlRangeResolver.js` & `src/StihlRangeResolver.ts`:
  - Propagate `range_evidence_class`, `range_semantic_level`, `confidence: MEDIUM`, `confidence_reason`.
  - Output calibrated `matchReason`: `'Serienummer valt binnen een bekende historische modelreeks.'` (historical) or `'Serienummer valt binnen een door primaire STIHL-bron ondersteunde modelreeks.'` (primary).
- `src/decoder.js`:
  - Expose `rangeEvidenceClass`, `rangeSemanticLevel`, `confidence`, `confidenceReason` in `serialResolution`.
  - Calibrate `serialResolution.level`: returns `MODEL_FAMILY_RANGE` for family ranges, `HISTORICAL_SERIAL_RANGE` for probable series ranges, `PRIMARY_VERIFIED_SERIAL_RANGE` only when backed by primary evidence, or `USER_CONFIRMED_MODEL`.
  - `buildModelAssist` updated: retains candidates regardless of whether public evidence facts exist, ensuring catalog-only models (like BR 420) are surfaced.
  - Fail-closed specifications: probable and family ranges return `technicalSpecs: {}` and `safeTechnicalPreview.available: true`.

### 3. Database & Deprecation Alignment
- `data/seed.js`: Added explicit deprecation header directing to canonical source of truth `data/stihl_database.json`.
- `data/seed.cjs`: Schema updated to include `range_evidence_class` and `range_semantic_level` on `model_serial_ranges`; SQLite rebuilt and verified in byte parity.

### 4. Verification Suite Results
- **R1 Acceptance Suite (`tests/serial_decoder_recovery_r1_evidence.test.js`):** 26/26 gates PASS (100%).
- **Recovery Acceptance Suite (`tests/serial_decoder_recovery.test.js`):** 26/26 gates PASS (100%).
- **10,000 Deterministic Distribution Test:**
  - Tested: 10,000 across plants 1–9.
  - MS 260: 4.17%, MS 261: 4.18%, Other: 12.41%, Unknown/Format: 79.24%.
  - High probable count: 0 (0.0%), Medium probable count: 2,076 (20.76%), Low: 0 (0.0%).
  - Concentration alert: NO, Critical mass fallback: NO.
- **API vs UI Parity Audit (`scripts/audit_api_ui_parity.mjs`):** 13/13 PASS; sequential state reset PASS.
- **Phase 45C-R1 Regression Suite (`tests/phase45c_r1_source_precedence.test.js`):** 28/28 PASS.
- **Canonical Policy & Harvester Suites:** PASS.
- **Phase 36 Chronology & User-Value Suites:** PASS.

### 5. Candidate Status
- Branch: `fix/serial-decoder-recovery-r1-evidence-calibration`
- Status: MERGED TO MAIN & DEPLOYED TO PRODUCTION ✅

---

## SERIAL DECODER RECOVERY — PRODUCTION PROMOTION & LIVE VERIFICATION

**Status:** COMPLETE / LIVE / VERIFIED ✅  
**Deployment Date:** 2026-09-22T01:15:09.127Z  
**Promoted Commit:** `170284798c05d18b29e49479f3f95f4010a96ec3`  
**Promoted Tree:** `2351b6e3221b6d580f33b5dcd30ac4c64b13828b`  
**Parent Baseline:** `00fd2c81de132a8d0887a4dbd223f79897cc549e` (Phase 45D)  
**Promotion Method:** FAST-FORWARD ONLY (linear history, ahead 2, behind 0)  

### Checkpoint Summary
- **FUNCTIONAL RECOVERY:** COMPLETE ✅
- **R1 EVIDENCE CALIBRATION:** COMPLETE ✅
- **PRODUCTION PROMOTION:** COMPLETE ✅
- **LIVE VERIFIED:** YES ✅
- **PHASE 46 STATUS:** PARKED (Untouched, awaiting explicit user authorization)

### Verified Live Production State
- **URL:** `https://www.stihldecoder.nl`
- **Render Service:** Live on commit `170284798c05d18b29e49479f3f95f4010a96ec3` (`HTTP 200`, persistent disk schema v3).
- **Models:** 98 (98/98 CORE5 completeness).
- **Public Evidence Facts:** 721 (byte-frozen, 0 mutations).
- **Active Serial Ranges:** 8 (0 HIGH, 8 MEDIUM, 0 LOW; 4 `MODEL_FAMILY_RANGE`, 4 `PROBABLE_MODEL_SERIES_RANGE`).
- **MS 260 / MS 261 Mass Fallback:** Completely eliminated (`150123456` resolves cleanly to `BR 420` Bladblazer family; generic fallback = 0).
- **UI State Reset:** Verified sequentially (`160500000 -> 412345678` and `150123456 -> 824061159` have zero stale residue).
- **Specification Safety:** Zero technical specs leaked before explicit user confirmation (`technicalSpecs: {}` fail-closed).
- **Other Systems:** Part Number Decoder, Model Search, StopHeling all operational without regressions.

