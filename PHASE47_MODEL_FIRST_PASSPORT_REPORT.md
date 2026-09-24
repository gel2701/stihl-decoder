# PHASE 47 & 47A — MODEL-FIRST STIHL PASSPORT & PRIVACY/COMPATIBILITY HARDENING
**Status:** Completed, Hardened & Validated | **Branch:** `feat/model-first-passport-affiliate-foundation`

---

## 1. Executive Summary

Phase 47 and Phase 47A transform the STIHL Passport from a serial-dependent tool into a **model-first, universal machine passport and digital dossier architecture** with strict privacy, identity decoupling, and evidence-gated compatibility foundations.

### Core Achievements
1. **Model-First Passport:** Users can create and export a complete digital machine passport based solely on the machine model (`MODEL_ONLY` mode). The serial number is completely optional and can be enriched at any later time.
2. **Passport Multi-Mode Architecture:** Clear visual and structural distinction between:
   - `MODEL_ONLY` (Model identified, serial number optional / enrichable, factory/year unlinked, StopHeling box suppressed)
   - `MODEL_WITH_SERIAL` (Model + user/unanchored serial number, factory provenance resolved via canonical plant records)
   - `OFFICIAL_SERIAL_VERIFIED` (Official MY STIHL verified serial anchor, official variant and verification timestamp preserved)
3. **QR Privacy Hard Gate (Zero Serial Numbers to External Services):**
   - In all passport modes (`MODEL_ONLY`, `MODEL_WITH_SERIAL`, `OFFICIAL_SERIAL_VERIFIED`), the QR code target always points strictly to the public canonical model URL (`https://www.stihldecoder.nl/<category>/<model-slug>/`).
   - Serial numbers are **never** passed to `api.qrserver.com` or any external service.
4. **JS / TSX Parity:**
   - [`src/components/StihlPassportGenerator.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/components/StihlPassportGenerator.js) and [`src/components/StihlPassportGenerator.tsx`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/components/StihlPassportGenerator.tsx) are semantically identical.
   - Elimination of all hardcoded demonstration data (e.g. `26-08-2026`).
5. **Decoupled Canonical Model vs Official Product Variant:**
   - For official anchor serial `163118080`:
     - Canonical Identity: `model_slug = "ms-440"`, `model_name = "MS 440"`, `canonical_model_id = "stihl_ms_440"`.
     - Official Product Identity: `official_product_name = "MS 440-Z 3/8\" RIM Magnum Motorsäge"`, `verified_at = "2026-09-22"`.
   - On `SWITCH_TO_OFFICIAL` resolution, `model_name` remains `"MS 440"` and is never overwritten by the full variant string. All maintenance records, user notes, and reminders are preserved losslessly.
6. **Centralized Factory / Plant Resolution:**
   - Removed duplicate local `STIHL_PLANT_MAP` definitions.
   - Centralized plant resolution through exported `resolvePlantRecord(database, factoryDigit)` from [`src/decoder.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/decoder.js). Passport components never self-derive plants from serial digits without verified decoder/database provenance.
7. **Compatibility Evidence Gates (Zero Unproven Claims):**
   - `VERIFIED_MODEL_COMPATIBILITY` strictly requires display-eligible documented evidence with reliable source status matching the exact canonical model scope.
   - Technical specifications without documented evidence yield `SPECIFICATION_MATCH_ONLY`.
   - Partial chain specs (pitch + gauge without drive link count or official part record) yield `SPECIFICATION_MATCH_ONLY` with cautious guidance.
   - Universal claims sanitized: generic chain oil is described as "Kettingolie voor kettingzaagtoepassingen", and 2-stroke oil advises checking model-specific fuel mix ratio.
   - Commercial layer remains completely inert: `offers: []`, `offers_active: false`, zero merchant URLs or affiliate links.
8. **Strict Privacy Analytics:**
   - Serial numbers, user nicknames, and personal notes are strictly blocked from analytics telemetry via explicit metadata whitelisting.

---

## 2. Architecture & Dossier Schema

### 2.1 Machine Dossier Schema (v2.0.0)
The schema explicitly supports nullable serial numbers and decoupled identity tracking:

```json
{
  "dossier_id": "dossier_ms_440_1727196000000",
  "schema_version": "2.0.0",
  "created_at": "2026-09-24T16:40:00.000Z",
  "updated_at": "2026-09-24T16:40:00.000Z",
  "model_slug": "ms-440",
  "model_name": "MS 440",
  "canonical_model_id": "stihl_ms_440",
  "official_product_name": null,
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
| **Identity Header** | Canonical Model (`MS 440`) | Canonical Model (`MS 440`) | Canonical Model (`MS 440`) + Verified Variant Subtitle |
| **Serial Badge** | `Nog niet toegevoegd` (gestreept kader) | Serial number displayed + Factory plant | Serial number displayed + `✓ Officieel STIHL` |
| **Herkomst / Fabriek** | "Nog niet gekoppeld (geen serienummer)" | Resolved via canonical `resolvePlantRecord` | Resolved via canonical `resolvePlantRecord` |
| **Bouwjaar** | "Niet opgegeven" (tenzij gebruiker aankoopjaar invoert) | Afgeleid uit decoder productiechronologie | Afgeleid uit officiële anchor / chronologie |
| **StopHeling Blok** | **Onderdrukt** (geen StopHeling zonder serienummer) | Actieve statusweergave | Actieve statusweergave |
| **QR Code Doel** | Canonical modelpagina (`/kettingzagen/ms-440/`) | Canonical modelpagina (`/kettingzagen/ms-440/`) | Canonical modelpagina (`/kettingzagen/ms-440/`) |
| **Externe QR Request** | **Geen serienummer** (`api.qrserver.com` ontvangt enkel model-URL) | **Geen serienummer** (`api.qrserver.com` ontvangt enkel model-URL) | **Geen serienummer** (`api.qrserver.com` ontvangt enkel model-URL) |
| **Aanbevelingsslots** | Actief op basis van modelvereisten | Actief op basis van modelvereisten | Actief op basis van modelvereisten |

---

## 4. Serial Enrichment & Conflict Resolution

```mermaid
flowchart TD
    A[Model-First Dossier: MS 260] --> B[User enters Serial: 163118080]
    B --> C{Official Anchor Exists?}
    C -->|Yes: MS 440-Z| D{Matches Stored Model?}
    C -->|No: Historical Range| E[Enrich Plant Provenance Only; Retain Stored Model]
    D -->|Yes: Matches| F[Upgrade to OFFICIAL_SERIAL_VERIFIED]
    D -->|No: Conflict!| G[Set Conflict State: IDENTITY_CONFLICT]
    G --> H{User Action}
    H -->|KEEP_STORED| I[Retain MS 260; Drop Conflicting Serial]
    H -->|SWITCH_TO_OFFICIAL| J[Upgrade Identity to Canonical MS 440 + Variant Record; Retain History]
```

### 4.1 Canonical Model vs Official Variant on SWITCH_TO_OFFICIAL
When resolving an `IDENTITY_CONFLICT` via `SWITCH_TO_OFFICIAL`:
- `target.identity.model_slug = "ms-440"`
- `target.identity.model_name = "MS 440"` (Canonical base model name from database)
- `target.identity.canonical_model_id = "stihl_ms_440"`
- `target.identity.official_product_name = "MS 440-Z 3/8\" RIM Magnum Motorsäge"`
- `target.identity.verified_at = "2026-09-22"`
- `target.machine.serial_number = "163118080"`
- All existing maintenance events, user notes, and reminders are preserved without data loss.

---

## 5. Affiliate Foundation & Privacy Architecture

### 5.1 3-Layer Decoupled Architecture
```
+---------------------------------------------------------------------------------+
| LAYER 1: Canonical Machine Specs & Part Requirements (Database)                |
| - displacement, chain_pitch, chain_gauge, spark_plug, file_size                |
+---------------------------------------------------------------------------------+
                                         │
                                         ▼
+---------------------------------------------------------------------------------+
| LAYER 2: Generic Recommendation Slots (modelRecommendations.js)                 |
| - Status hierarchy:                                                            |
|   * VERIFIED_MODEL_COMPATIBILITY (Requires eligible documented evidence)       |
|   * SPECIFICATION_MATCH_ONLY (Partial specs or specs without evidence)         |
|   * GENERIC_CATEGORY_RECOMMENDATION (Category-wide maintenance guidance)        |
|   * UNVERIFIED (Missing technical specifications)                               |
|   * CONFLICTED (Incompatible configuration)                                    |
| - offers: [] (Strictly empty array)                                             |
+---------------------------------------------------------------------------------+
                                         │
                                         ▼
+---------------------------------------------------------------------------------+
| LAYER 3: Commercial & Merchant Layer (Future / Inactive)                        |
| - offers_active: false                                                          |
| - Zero mock URLs, zero fictional pricing, zero affiliate cookies                |
+---------------------------------------------------------------------------------+
```

### 5.2 Compatibility Evidence Gates Matrix

| Recommendation Type | Input Conditions | Required Evidence | Resulting Status & Display Guidance |
|---|---|---|---|
| **Bougie** | `spark_plug: 'Bosch WSR6F'` | None | `SPECIFICATION_MATCH_ONLY` ("Specificatiematch op basis van technische gegevens") |
| **Bougie** | `spark_plug: 'Bosch WSR6F'` | `display_eligible: true`, `OFFICIAL_DOCUMENTED` | `VERIFIED_MODEL_COMPATIBILITY` ("Geschikt voor jouw STIHL MS 440") |
| **Zaagketting** | `pitch: '3/8"'`, `gauge: '1.6'` | None / Missing drive links | `SPECIFICATION_MATCH_ONLY` ("Steek en dikte komen overeen; controleer aantal aandrijfschakels...") |
| **Zaagketting** | `pitch`, `gauge`, `drive_links: 72` | `display_eligible: true`, `OFFICIAL_DOCUMENTED` | `VERIFIED_MODEL_COMPATIBILITY` ("Geschikt voor jouw STIHL MS 440") |
| **Kettingolie** | Chainsaw category | Category standard | `GENERIC_CATEGORY_RECOMMENDATION` ("Kettingolie voor kettingzaagtoepassingen") |
| **2-Takt Olie** | Combustion category | Standard operating procedure | `GENERIC_CATEGORY_RECOMMENDATION` ("Controleer de voorgeschreven brandstof/mengverhouding...") |

### 5.3 Strict Analytics Privacy Policy
In compliance with user data protection policies:
- Serial numbers, user nicknames, and custom notes are strictly filtered from analytics payloads.
- Whitelisted event keys: `model_slug`, `model_name`, `passport_mode`, `conflict_type`, `resolution_strategy`, `slot_category`, `compatibility_status`.

---

---

## 6. Phase 47B — Final Evidence Integrity Hardening Policies

Phase 47B enforces complete zero-overclaim and provenance integrity across machine identity, technical recommendations, and passport specifications:

### 6.1 Verification Date Provenance Policy
- **Zero Date Fabrication:** Hardcoded fallback dates (such as `|| '2026-09-22'`) are eliminated repository-wide from identity resolution.
- If an official anchor record does not supply an explicit `verification_date` or `verified_at`, `target.identity.verified_at` resolves strictly to `null`.
- The date `2026-09-22` exists strictly and exclusively as the historical provenance of canonical anchor `163118080`.
- Verified by adversarial unit test: synthetic official anchors without verification dates produce `verified_at === null`.

### 6.2 Strict Evidence Field Matching Policy
- In `findEligibleEvidence()`, evidence field identification is normalized across `ev.field || ev.field_name || ev.canonical_field || null`.
- If the normalized evidence field does not strictly match the requested field (`evidenceField !== requestedField`), the evidence is rejected immediately.
- Disallowed: evidence for `power_kw` matching a `spark_plug` request, even if model and value match.

### 6.3 Exact Evidence Value Matching Policy
- `VERIFIED_MODEL_COMPATIBILITY` strictly requires that the evidence fact's proven value matches the technical specification.
- Values are normalized for comparison across strings, codes (e.g. `Bosch WSR 6 F` vs `Bosch WSR6F`), alternative arrays, and numeric values with units.
- Mismatched values (e.g. spec requires `Bosch WSR6F` but evidence proves `NGK BPMR7A`) fail the verification gate and fall back to `SPECIFICATION_MATCH_ONLY`.

### 6.4 Single-Value Eligibility Policy
- Technical compatibility claims presenting a single concrete value for a model require `isSingleValuePublicFact(ev) === true`.
- Facts with status `OFFICIAL_CONFLICTED` or explicit `single_value_eligible === false` are rejected from single-value verification.
- Reuses central public evidence policies (`DISPLAY_ELIGIBLE_STATUSES`, `SINGLE_VALUE_ELIGIBLE_STATUSES`) from [`src/publicEvidence.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/publicEvidence.js).

### 6.5 Full Chain Configuration Evidence Requirements
- For chainsaw chains, exact compatibility (`VERIFIED_MODEL_COMPATIBILITY`) strictly requires:
  1. ALL THREE parameters (`pitch`, `gauge`, `drive_links`) individually backed by eligible, value-matching evidence; OR
  2. An explicit official complete part configuration record (`part_type === 'chain'`, `full_config === true`) matching all three parameters.
- Partial specifications (e.g. pitch proven, but gauge and drive links unproven) strictly yield `SPECIFICATION_MATCH_ONLY` with cautious guidance.

### 6.6 Passport Source-Tag Policy
- In `getFactSourceTag()` and `buildSafePassportSpecRows()`:
  - If a specification has no matching, display-eligible public fact, `getFactSourceTag()` returns an empty string `''`.
  - Zero "silent verification": technical specification rows are NEVER decorated with `(✓ Officieel bevestigd)` without eligible evidence.
  - Rows with documented provenance render document ID, edition, and page numbers (e.g. `(✓ STIHL 0458-260-0121 Ed. 2003, p. 42)`).

---

## 7. Test Suite & Verification Results

All 13 production test suites in the canonical production runner pass 100% cleanly:

| Suite Name | Tests / Scope | Status | Duration |
|---|---|---|---|
| `official_serial_anchor_and_range_semantics.test.js` | Official anchors & fail-closed historical ranges | ✅ PASS | 279ms |
| `serial_decoder_recovery_current.test.js` | Serial decoder recovery, plant mapping, fallback checks | ✅ PASS | 315ms |
| `baseline.test.js` | Core classification & engine baseline regression | ✅ PASS | 523ms |
| `canonical_policy.test.js` | Canonical URL and SEO policy enforcement | ✅ PASS | 115ms |
| `phase36_serial_user_value_engine.test.js` | Value estimation and user guidance engine | ✅ PASS | 156ms |
| `render_www_alignment.test.js` | WWW routes and SSR template validation | ✅ PASS | 853ms |
| `production_validation.test.js` | SEO topical authority, sitemap integrity, 0 errors | ✅ PASS | 2001ms |
| `decoder.test.js` | SSR pilot pages and schema graphs | ✅ PASS | 258ms |
| `model_first_passport.test.js` | Model-first dossiers, null serials, V1->V2 migration, CTA | ✅ PASS | 163ms |
| `passport_serial_enrichment.test.js` | Serial enrichment, conflict detection, KEEP/SWITCH strategies | ✅ PASS | 182ms |
| `affiliate_foundation.test.js` | 3-layer recommendation schema, Gates A-F, privacy tracker | ✅ PASS | 179ms |
| `passport_hardening.test.js` | Phase 47A QR privacy, JS/TSX parity, identity decoupling | ✅ PASS | 230ms |
| `evidence_integrity_hardening.test.js` | Phase 47B negative evidence injection (Tests A-L) | ✅ PASS | 182ms |
| **Total** | **13 Suites / 120+ Assertions** | **✅ 100% PASS** | **~5.4s** |

---

## 8. Modified & Created Files Summary

- [`src/decoder.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/decoder.js): Exported `resolvePlantRecord(database, factoryDigit)` for centralized plant mapping.
- [`src/components/MachineDossierManager.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/components/MachineDossierManager.js): Centralized plant resolution; decoupled canonical model (`model_name`) from official product variant (`official_product_name`); replaced all hardcoded `2026-09-22` fallbacks with `null`.
- [`src/components/StihlPassportGenerator.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/components/StihlPassportGenerator.js): Enforced QR privacy; hardened `getFactSourceTag` and `buildSafePassportSpecRows` to omit official badges when evidence is missing.
- [`src/components/StihlPassportGenerator.tsx`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/components/StihlPassportGenerator.tsx): Full semantic parity with JS implementation; removed fake demonstration dates; suppressed StopHeling box on `MODEL_ONLY`.
- [`src/publicEvidence.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/publicEvidence.js): Exported `DISPLAY_ELIGIBLE_STATUSES` and `SINGLE_VALUE_ELIGIBLE_STATUSES`; hardened `isPublicDisplayEligibleFact` and `isSingleValuePublicFact`.
- [`src/modelRecommendations.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/modelRecommendations.js): Implemented `valueMatches`; hardened `findEligibleEvidence` with strict field, value, and single-value eligibility gates; enforced complete chain configuration requirements.
- [`tests/evidence_integrity_hardening.test.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/tests/evidence_integrity_hardening.test.js): New dedicated Phase 47B test suite testing adversarial negative evidence injection (A through L).
- [`tests/passport_hardening.test.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/tests/passport_hardening.test.js): Dedicated Phase 47A test suite testing QR privacy, parity, identity decoupling, and privacy.
- [`tests/affiliate_foundation.test.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/tests/affiliate_foundation.test.js): Upgraded Test 3 to verify Gates A-F with proven values.
- [`tests/passport_serial_enrichment.test.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/tests/passport_serial_enrichment.test.js): Updated Test K to verify canonical `model_name = "MS 440"` vs `official_product_name`.
- [`tests/run_current_production_tests.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/tests/run_current_production_tests.js): Added `evidence_integrity_hardening.test.js` (13 suites total).
