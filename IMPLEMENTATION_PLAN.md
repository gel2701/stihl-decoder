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

- 22 HIGH_VALUE candidates identified for Phase 43B activation
- 0 new models to onboard (SR 430/450 already exist)
- 0 accessories in scope
- Canonical DB frozen; promotion requires explicit Phase 43B approval

---

## Backlog note

Prioritize the official evidence reconciliation/data-quality work before activating STIHL Paspoort 2.0. Re-evaluate Paspoort 2.0 scope only after the harvester/evidence pipeline and canonical-data review process are stable, so the private account/data architecture is designed deliberately rather than added onto the public evidence store.
