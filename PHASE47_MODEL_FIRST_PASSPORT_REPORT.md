# PHASE 47 — MODEL-FIRST STIHL PASSPORT & AFFILIATE FOUNDATION
**Status:** Completed & Validated | **Branch:** `feat/model-first-passport-affiliate-foundation` | **Commit:** `bdf88bb`

---

## 1. Executive Summary

Phase 47 transforms the STIHL Passport from a serial-number-dependent tool into a **model-first, universal machine passport and digital dossier architecture**.

### Core Achievements
1. **Model-First Passport:** Users can create and export a complete digital machine passport based solely on the machine model (`model_only` mode). The serial number is completely optional and can be enriched at any later time.
2. **Passport Multi-Mode Architecture:** Clear visual and structural distinction between:
   - `MODEL_ONLY` (Model identified, serial number optional / enrichable)
   - `MODEL_WITH_SERIAL` (Model + user/unanchored serial number, factory provenance resolved)
   - `OFFICIAL_SERIAL_VERIFIED` (Official MY STIHL verified serial anchor, official variant and verification timestamp preserved)
3. **Robust Serial Enrichment & Conflict Safety:**
   - Enriching a dossier with a serial number resolves official identity anchors (e.g. `163118080` -> `MS 440-Z 3/8" RIM Magnum Motorsäge`, `verifiedAt: 2026-09-22`).
   - If an enriched serial points to an official identity conflicting with the stored model (e.g. user stored `MS 260` but enters `163118080`), an explicit `IDENTITY_CONFLICT` is raised.
   - **Zero silent overwrites:** The user is provided two explicit, deterministic resolution paths: `KEEP_STORED` (retains model, rejects conflicting serial) or `SWITCH_TO_OFFICIAL` (upgrades model identity to official variant while preserving all maintenance records, history, and notes).
   - Historical ranges without official anchors (such as `160500000`) enrich factory provenance without altering or guessing the model.
4. **Affiliate Foundation (3-Layer Separation):**
   - **Layer 1:** Canonical Machine Specs & Maintenance Requirements (derived from database).
   - **Layer 2:** Generic Recommendation Slots (compatible part categories, specs, maintenance items; zero merchant bias).
   - **Layer 3:** Merchant & Affiliate Offer Layer (isolated, inactive: `offers: []`, `offers_active: false`; zero fictional merchants, URLs, or prices).
5. **Strict Privacy Analytics:**
   - Event tracking whitelist strictly excludes serial numbers, user notes, and personal identifiers.
   - Tracked events: `passport_created`, `passport_viewed`, `passport_exported_pdf`, `passport_serial_enriched`, `passport_conflict_detected`, `passport_conflict_resolved`, `recommendation_slot_viewed`.

---

## 2. Architecture & Dossier Schema

### 2.1 Machine Dossier Schema (v2.0.0)
The schema has been upgraded from v1 to v2 to explicitly support nullable serial numbers and resolution statuses:

```json
{
  "dossier_id": "dossier_ms_440_1727196000000",
  "schema_version": "2.0.0",
  "created_at": "2026-09-24T16:40:00.000Z",
  "updated_at": "2026-09-24T16:40:00.000Z",
  "model_slug": "ms-440",
  "model_name": "STIHL MS 440",
  "model_id": "stihl_ms_440",
  "serial_number": null,
  "passport_mode": "MODEL_ONLY",
  "serial_resolution": null,
  "official_anchor": null,
  "maintenance_events": [],
  "user_notes": []
}
```

### 2.2 V1 -> V2 Transactional Migration
Existing stored dossiers (v1.0.0) lacking `passport_mode` or schema versioning are safely migrated in memory upon load:
- If `serial_number` is missing or null: assigned `passport_mode = "MODEL_ONLY"`.
- If `serial_number` is present and matches an official anchor: assigned `passport_mode = "OFFICIAL_SERIAL_VERIFIED"`, `official_anchor` populated with provenance.
- If `serial_number` is present without official anchor: assigned `passport_mode = "MODEL_WITH_SERIAL"`.
- All maintenance history, custom notes, and timestamps are preserved 100% losslessly.

---

## 3. Passport Modes & UI Matrix

| Feature / Attribute | `MODEL_ONLY` | `MODEL_WITH_SERIAL` | `OFFICIAL_SERIAL_VERIFIED` |
|---|---|---|---|
| **Identity Header** | Generic Model Name (`STIHL MS 440`) | Generic Model Name | Official Verified Variant (`MS 440-Z 3/8" RIM Magnum Motorsäge`) |
| **Serial Badge** | `OPTIONEEL (NOG NIET GEKOPPELD)` | Serial number displayed + Factory plant | Serial number displayed + `OFFICIEEL MY STIHL VERIFIED` |
| **Production Year / Plant** | "Niet van toepassing (Modelpaspoort)" | Derived from serial chronology & plant map | Derived from official anchor & plant map |
| **Enrichment Action** | Direct CTA: `[➕ Serienummer Koppelen]` | Can update/verify serial | Fully verified, locked provenance |
| **Technical Specs** | Factory specifications for model | Factory specifications for model | Factory specifications for model |
| **Maintenance Slots** | Active based on model requirements | Active based on model requirements | Active based on model requirements |
| **QR Code Link** | Links to canonical model page (`/modellen/ms-440/`) | Links to model passport with serial query param | Links to verified model passport with anchor |

---

## 4. Serial Enrichment & Conflict Resolution

```mermaid
flowchart TD
    A[Model-First Dossier (e.g. MS 260)] --> B[User inputs Serial (e.g. 163118080)]
    B --> C{Official Anchor Exists?}
    C -->|Yes: MS 440| D{Matches Stored Model?}
    C -->|No: Historical Range| E[Enrich Plant Provenance Only; Keep Model]
    D -->|Yes: Matches| F[Upgrade to OFFICIAL_SERIAL_VERIFIED]
    D -->|No: Conflict!| G[Set Conflict State: IDENTITY_CONFLICT]
    G --> H{User Action}
    H -->|KEEP_STORED| I[Retain MS 260; Drop Conflicting Serial]
    H -->|SWITCH_TO_OFFICIAL| J[Upgrade to Official MS 440 Identity; Retain History]
```

### 4.1 Official Anchor Validation (`163118080`)
- **Official Identity:** `MS 440-Z 3/8" RIM Magnum Motorsäge`
- **Verification Date:** `2026-09-22`
- **Result on MS 440 Dossier:** Upgrades passport to `OFFICIAL_SERIAL_VERIFIED` with exact variant name and verified date badge.
- **Result on MS 260 Dossier:** Detects contradiction (`stored: stihl_ms_260` vs `official: stihl_ms_440`). Shows modal warning detailing the contradiction.

### 4.2 Historical Production Range Validation (`160500000`)
- Falls within `160000000–169999999` (Germany / Waiblingen, historical range).
- **Semantics:** Identifies production country (Germany) and plant (Waiblingen Plant 2), but yields `exactModel = null`, `modelIdentityStatus = MODEL_NOT_IDENTIFIED`.
- **Result on Dossier:** Enriches plant/origin metadata without overwriting or altering the stored model identity.

---

## 5. Affiliate Foundation & Privacy Architecture

### 5.1 3-Layer Decoupled Architecture
```
+-------------------------------------------------------------------+
| LAYER 1: Canonical Machine Specs & Part Requirements (Database)  |
| - displacement, chain_pitch, guide_bar, spark_plug, file_size    |
+-------------------------------------------------------------------+
                                  │
                                  ▼
+-------------------------------------------------------------------+
| LAYER 2: Generic Recommendation Slots (modelRecommendations.js)   |
| - compatible_spec: "3/8\" Rapid Super (RS) / 1.6mm"              |
| - compatibility_status: "EXACT_OEM_SPEC"                          |
| - maintenance_interval: "Na elke 25 draaiuren"                    |
| - offers: [] (Empty placeholder)                                 |
+-------------------------------------------------------------------+
                                  │
                                  ▼
+-------------------------------------------------------------------+
| LAYER 3: Commercial & Merchant Layer (Future / Inactive)          |
| - offers_active: false                                            |
| - Zero mock URLs, zero fictional pricing, zero affiliate cookies  |
+-------------------------------------------------------------------+
```

### 5.2 Strict Analytics Privacy Policy
In compliance with user data protection policies:
- Serial numbers are strictly blocked from analytics payloads (`cleanMetadata`).
- PII, user notes, and IP addresses are stripped before logging or persistent event queuing.
- Whitelisted event keys: `model_slug`, `model_name`, `passport_mode`, `conflict_type`, `resolution_strategy`, `slot_category`, `compatibility_status`.

---

## 6. Test Suite & Verification Results

All 11 production test suites pass 100% cleanly:

| Suite Name | Tests / Scope | Status | Duration |
|---|---|---|---|
| `official_serial_anchor_and_range_semantics.test.js` | Official anchors & fail-closed historical ranges | ✅ PASS | 223ms |
| `serial_decoder_recovery_current.test.js` | Serial decoder recovery, plant mapping, fallback checks | ✅ PASS | 244ms |
| `baseline.test.js` | Core classification & engine baseline | ✅ PASS | 358ms |
| `canonical_policy.test.js` | Canonical URL and SEO policy enforcement | ✅ PASS | 124ms |
| `phase36_serial_user_value_engine.test.js` | Value estimation and user guidance engine | ✅ PASS | 171ms |
| `render_www_alignment.test.js` | WWW routes and SSR template validation | ✅ PASS | 818ms |
| `production_validation.test.js` | SEO topical authority, sitemap integrity, 0 errors | ✅ PASS | 1973ms |
| `decoder.test.js` | SSR pilot pages and schema graphs | ✅ PASS | 250ms |
| `model_first_passport.test.js` | Model-first dossiers, null serials, V1->V2 migration, CTA | ✅ PASS | 142ms |
| `passport_serial_enrichment.test.js` | Serial enrichment, conflict detection, KEEP/SWITCH strategies | ✅ PASS | 159ms |
| `affiliate_foundation.test.js` | 3-layer recommendation schema, spec slots, privacy tracker | ✅ PASS | 163ms |
| **Total** | **11 Suites / 100+ Assertions** | **✅ 100% PASS** | **~4.6s** |

---

## 7. Modified & Created Files Summary

- `src/components/MachineDossierManager.js`: Permitted null serial numbers, added serial enrichment, conflict resolution (`resolveDossierConflict`), plant map lookup.
- `src/components/StihlPassportGenerator.js` & `.tsx`: Generalized passport generation for `MODEL_ONLY`, `MODEL_WITH_SERIAL`, and `OFFICIAL_SERIAL_VERIFIED` modes, added recommendation slot rendering.
- `src/components/ModelPageTemplate.js`: Added "Mijn STIHL Paspoort" CTA block directing to `/stihl-paspoort/#add=${slug}`.
- `src/components/IntentPageTemplate.js`: Added interactive modals for passport view, serial enrichment, and conflict resolution; injected database reference.
- `src/modelRecommendations.js`: Layer 2 generic recommendation slots generator and HTML renderer (`offers_active: false`, `offers: []`).
- `data/model_recommendation_schema.json`: Formal JSON schema for the 3-layer recommendation engine.
- `src/components/AnalyticsTracker.js`: Added event handlers and strict privacy metadata whitelist.
- `server.js`: Whitelisted `/src/modelRecommendations.js` and `/src/components/AnalyticsTracker.js`.
- `tests/model_first_passport.test.js`: Suite for model-first dossier operations and template integration.
- `tests/passport_serial_enrichment.test.js`: Suite for official anchor enrichment and conflict handling.
- `tests/affiliate_foundation.test.js`: Suite for recommendation architecture and analytics privacy.
- `tests/run_current_production_tests.js`: Registered new suites in the canonical production runner.
