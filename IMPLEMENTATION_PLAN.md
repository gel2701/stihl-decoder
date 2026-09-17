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

## Phase 44B — BR Tier 1 Model Activation (PLANNED / NEXT)

**Status:** PLANNED / NOT YET ACTIVE

### Goal

Activate 21 Tier 1 high-priority machine models with official evidence from the VTEX catalog.

### Scope

- 21 Tier 1 models from Phase 44A batch definition
- Update `stihl_database.json` with new model entries
- Update `public_evidence_facts.json` with evidence facts
- Run regression tests
- Commit and potentially deploy

### Models to activate

MS 162, MS 172, MS 182, MS 212, MS 363, MS 382, FS 161, FS 221, FS 55, BG 50, and 11 more Tier 1 candidates

### Not in scope for Phase 44B

- Tier 2/3 models (future phases)
- Accessory schema (separate future domain)
- STIHL Paspoort 2.0 (remains PLANNED / NOT YET ACTIVE)

---

## Backlog note

Prioritize the official evidence reconciliation/data-quality work before activating STIHL Paspoort 2.0. Re-evaluate Paspoort 2.0 scope only after the harvester/evidence pipeline and canonical-data review process are stable, so the private account/data architecture is designed deliberately rather than added onto the public evidence store.
