# PHASE 56H REPORT — Evidence-Based Diagram Section Resolution & Commercial Unlock

## 1. Executive Summary
Phase 56H voert een strikt bewijsgedreven audit en resolutie uit op alle `Unresolved Diagram Section` fitments in de STIHLdecoder-onderdelencatalogus, zonder secties te gokken, zonder model-family inference en met behoud van alle historische Phase 54F/56G data- en testinvarianten.

- **Unresolved fitments vóór Phase 56H**: `170.503` (van `175.106` totale fitments; `4.603` scalar resolved)
- **Opgeloste fitments in Phase 56H**: **`344`** fitments (`10` via Rule A exact-scope bronbewijs + `334` via Rule C geverifieerde multi-section contexten in `model_part_fitment_section_contexts`, goed voor `820` sectietoewijzingen op voorheen onopgeloste fitments + `4` additionele contexten op reeds opgeloste fitments)
- **Effectief resolved fitments ná Phase 56H**: **`4.947`** (`4.603` + `344`)
- **Effectief unresolved fitments ná Phase 56H**: **`170.159`** (waarbij de SQLite scalar kolom op `170.503` bewaard blijft voor non-lossy Phase 54F-D pariteit)
- **Unieke onderdelen met nieuw geactiveerde secties**: **`241`**
- **Nieuw vrijgespeelde onderdelen onder strikte Wave 3/4 criteria (H1–H7)**: van **`4`** (in Phase 56G) naar **`45`** (**`+41`** nieuwe Wave 4-ready onderdelen, waarvan **`32` COMMERCIAL_HIGH** en **`9` COMMERCIAL_MEDIUM**)

---

## 2. Unresolved Section Baseline & Evidence Classification

| Categorie | Aantal Fitments | Toelichting |
| :--- | ---: | :--- |
| `EXPLICIT_SECTION_EVIDENCE` (Rule A) | **10** | Exacte match op `(canonical_model_id, part_number, fitment_scope, variant_key, configuration_key)` met een `MAPPED` sectie in `part_fitment_evidence` (`official_stihl` / `sparepartsworld`). |
| `EXISTING_CANONICAL_CONTEXT` (Rule C) | **334** | Exacte `fitment_id` match met `810` geverifieerde multi-section contexten in `model_part_fitment_section_contexts` (Phase 54F-D), die voorheen nog niet door `PartCatalogResolver` werden geladen. |
| `CROSS_SCOPE_BLOCKED_EVIDENCE` | **5.357** | Onderdeel heeft op hetzelfde model een resolved sectie op `BASE_MODEL_CONFIRMED`, maar het onopgeloste fitment betreft een `EXACT_CONFIGURATION` of `EXACT_VARIANT`. Cross-scope overdracht is strikt geblokkeerd. |
| `SCOPE_AMBIGUOUS_DEFERRED_EVIDENCE` | **658** | Model-level bronobservaties zonder expliciete variant- of configuratie-identiteit (Phase 54F-E quarantaine). |
| `INSUFFICIENT_SECTION_EVIDENCE` | **164144** | Uitsluitend `UNRESOLVED` bronobservaties aanwezig (`general_unresolved`). |
| **Totaal Unresolved Fitments** | **170.503** | **100% verklaard en geclassificeerd** |

---

## 3. De 10 Rule A Exact-Scope Resoluties (`data/parts_section_resolutions_56h.json`)

| Fitment ID | Model | Onderdeel | Scope | Opgeloste Sectie | Bron & Evidence ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `00004007000::ms_261::c_m::base::EXACT_VARIANT` | `ms_261` | `0000 400 7000` | `EXACT_VARIANT` | **Ignition System** | `official_stihl` (`obs_00004007000_ms_261_c_m_base_official_stihl_ignition_system_OFFICIAL_REF`) |
| `11104007005::026::base::base::BASE_MODEL_CONFIRMED` | `026` | `1110 400 7005` | `BASE_MODEL_CONFIRMED` | **Ignition System** | `official_stihl` (`obs_11104007005_026_base_base_official_stihl_ignition_system_OFFICIAL_REF`) |
| `11104007005::ms_170::base::base::BASE_MODEL_CONFIRMED` | `ms_170` | `1110 400 7005` | `BASE_MODEL_CONFIRMED` | **Ignition System** | `official_stihl` (`obs_11104007005_ms_170_base_base_official_stihl_ignition_system_OFFICIAL_REF`) |
| `11104007005::ms_180::base::base::BASE_MODEL_CONFIRMED` | `ms_180` | `1110 400 7005` | `BASE_MODEL_CONFIRMED` | **Ignition System** | `official_stihl` (`obs_11104007005_ms_180_base_base_official_stihl_ignition_system_OFFICIAL_REF`) |
| `11104007005::ts_420::base::base::BASE_MODEL_CONFIRMED` | `ts_420` | `1110 400 7005` | `BASE_MODEL_CONFIRMED` | **Ignition System** | `official_stihl` (`obs_11104007005_ts_420_base_base_official_stihl_ignition_system_OFFICIAL_REF`) |
| `11211201612::026::base::base::BASE_MODEL_CONFIRMED` | `026` | `1121 120 1612` | `BASE_MODEL_CONFIRMED` | **Air Filter** | `official_stihl` (`obs_11211201612_026_base_base_official_stihl_air_filter_OFFICIAL_REF`) |
| `11301240800::ms_170::base::base::BASE_MODEL_CONFIRMED` | `ms_170` | `1130 124 0800` | `BASE_MODEL_CONFIRMED` | **Air Filter** | `official_stihl` (`obs_11301240800_ms_170_base_base_official_stihl_air_filter_OFFICIAL_REF`) |
| `11301240800::ms_180::base::base::BASE_MODEL_CONFIRMED` | `ms_180` | `1130 124 0800` | `BASE_MODEL_CONFIRMED` | **Air Filter** | `official_stihl` (`obs_11301240800_ms_180_base_base_official_stihl_air_filter_OFFICIAL_REF`) |
| `11413500824::ms_261::c_m::base::EXACT_VARIANT` | `ms_261` | `1141 350 0824` | `EXACT_VARIANT` | **Tank Housing** | `sparepartsworld` (`obs_11413500824_ms_261_c_m_base_sparepartsworld_tank_housing_1`) |
| `11480074101::ms_182::base::base::BASE_MODEL_CONFIRMED` | `ms_182` | `1148 007 4101` | `BASE_MODEL_CONFIRMED` | **Service Kits** | `official_stihl` (`obs_11480074101_ms_182_base_base_official_stihl_service_kits_OFFICIAL_REF`) |

---

## 4. Deep Audit Focusmodellen (`MS 261`, `MS 170`, `FS 55`)

| Model | Totale Fitments | Unresolved Vóór | Nieuw Opgelost | Unresolved Ná | Effectief Resolved Ná | Multi-Section Fitments | Diagram Positie Dekking |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **STIHL MS 261** (`ms_261`) | 1817 | 1610 | **+8** | 1602 | **215** | 6 | 99.01% |
| **STIHL MS 170** (`ms_170`) | 681 | 668 | **+2** | 666 | **15** | 0 | 99.56% |
| **STIHL FS 55** (`fs_55`) | 1399 | 1264 | **+63** | 1201 | **198** | 63 | 99.29% |

- **MS 261**: `6` base-model multi-section fitments (`14` sectiecontexten waaronder *Carburetor C1Q-S252 (06.2014)*, *Cylinder, Muffler*, *Crankcase*, *Chain Sprocket Cover*, *Rewind Starter*, *Brake Band, Hand Guard*, *Fuel Tank*, *Handle Housing*) + `2` exact-variant `c_m` fitments (`0000 400 7000` -> *Ignition System*, `1141 350 0824` -> *Tank Housing*) opgelost.
- **MS 170**: `2` kern-onderhoudsfitments op base-model opgelost via officiële STIHL referentiebewijzen (`1110 400 7005` Bougie -> *Ignition System*, `1130 124 0800` Luchtfilter -> *Air Filter*).
- **FS 55**: `63` base-model multi-section fitments (`189` geverifieerde sectiecontexten) geactiveerd in runtime sectieweergave en onderdeeldetailpagina's.

---

## 5. SEO & Commercial Unlock Heranalyse (Analytisch)

Door de integratie van `SectionResolutionRegistry` in `PartCatalogResolver` stijgt het aantal onderdelen op gepubliceerde modellen met $\ge 2$ onafhankelijke diagramsecties (criterium **H3**) van **`57`** naar **`155`** (**`+98`**).

Onder de volledige strikte H1–H7 criteria stijgt het aantal geschikte Wave 3/4 kandidaten van **`4`** naar **`45`** (**`+41`** nieuw vrijgespeelde onderdelen):
- **Nieuw vrijgespeeld `COMMERCIAL_HIGH`**: `32`
- **Nieuw vrijgespeeld `COMMERCIAL_MEDIUM`**: `9`
- **Actieve indexatie in Phase 56H**: conform instructie bevroren op **`804`** indexeerbare onderdeelpagina's en **`985`** sitemap URL's.

---

## 6. GSC & Verified ASIN Status
- **GSC Status**: `NOT_CONFIGURED` (geen OAuth token aanwezig in omgeving; 0 verzonnen statistieken).
- **Verified ASIN Delta**: `0` (`17.082 / 17.082` deterministische Amazon.nl zoekfallbacks actief met tag `srihldecoder2-21`).
