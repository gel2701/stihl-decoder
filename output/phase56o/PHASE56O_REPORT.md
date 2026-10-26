# STIHLDecoder — Phase 56O Eindrapport
## Verified RE / RM / RMA Drive-Type Expansion

**Status:** PASS  
**Datum:** 2026-10-26T01:41:19.474Z  
**Baseline commit:** `b00fa1188bd56f56a1bd573bd7716e0a464fc7d3`  
**Branch:** `feat/phase56o-re-rm-rma-drive-expansion`

---

## 1. Doel & Context

In Phase 56O zijn drie hoogwaardige STIHL machinefamilies onderzocht en gepromoveerd naar geverifieerde aandrijvingstypes:
- **RE**: Hogedrukreinigers (`MAINS_ELECTRIC`)
- **RM**: Benzinemaaiers (`PETROL`)
- **RMA**: Accugrasmaaiers (`BATTERY`)

Er is voldaan aan de harde eis: uitsluitend promotie op basis van authentieke, officiële STIHL-evidence en met strikte prefix collision boundaries.

---

## 2. Populatie & Coverage Resultaten

| Parameter | Baseline (Phase 56N) | Na Phase 56O | Delta |
| :--- | :--- | :--- | :--- |
| **Catalogustotaal** | 956 | 956 | 0 |
| **Niet-aangedreven attachments** | 25 | 25 | 0 |
| **Non-machine ruis / componenten** | 52 | 52 | 0 |
| **Aangedreven machinepopulatie (noemer)** | **879** | **879** | **0** |
| **Opgeloste aangedreven machines** | **403** | **521** | **+118 (+29.28%)** |
| **Onbekende aangedreven machines** | **476** | **358** | **-118 (-24.79%)** |
| **Coverage percentage** | **45.85%** | **59.27%** | **+13.42 pp** |

### Uitsplitsing promoties per familie:
- **RE (Hogedrukreinigers)**: **71 modellen** gepromoveerd naar `MAINS_ELECTRIC`.
- **RM (Benzinegrasmaaiers)**: **25 modellen** gepromoveerd naar `PETROL`.
- **RMA (Accugrasmaaiers)**: **22 modellen** gepromoveerd naar `BATTERY`.
- **Totaal promoties**: **118 modellen**.

---

## 3. Officiële STIHL Evidence

1. **RE Familie (`MAINS_ELECTRIC`):**
   - **Live HTML:** `https://www.stihl.nl/nl/p/hogedrukreinigers-re-130-81522` (SHA-256: `bb312ab038f1f0366e48906a75fb16df91d8ec522a27b76108226ecef7a280aa`)
     - *"Nominale spanning 220-240 V Aantal fases 1 Opgenomen vermogen 2.30 kW", "robuuste, borstelloze inductiemotor"*
   - **PDF Catalogus 2023:** `https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf` (SHA-256: `406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162`), Pagina 161 (Mains voltage 230 / 1~ / 50, Power cable length 5 m, Power consumption kW).

2. **RM Familie (`PETROL`):**
   - **Live HTML:** `https://www.stihl.nl/nl/p/grasmaaiers-rm-448-185012` (SHA-256: `0859432bfc193b32503a27a51d75ea724f54c5d955ff1cfe37e2fd1d539da729`)
     - *"Grasmaaiers RM 448 T benzine"*
   - **PDF Catalogus 2023:** `https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf` (SHA-256: `406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162`), Pagina 107 (petrol lawn mowers, Displacement cm3, Engine type STIHL EVC 200 / Kohler XT800 / Kawasaki FJ 180).
   - **Service Kit 49:** Doc `0458-007-0049` bevestigt verbrandingsmotoronderdelen (luchtfilter, bougie, brandstoffilter).

3. **RMA Familie (`BATTERY`):**
   - **Live HTML:** `https://www.stihl.nl/nl/p/grasmaaiers-rma-448-ak-systeem-185059` (SHA-256: `029075bc0de0f7bc8ccfdd15f669c664efb8684f04de1022d55230c0efc5075f`)
     - *"Grasmaaiers RMA 448 V, AK systeem, accu"*
   - **PDF Catalogus 2023:** `https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf` (SHA-256: `406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162`), Pagina 108 (cordless lawn mowers, STIHL cordless power system, 36 V).

---

## 4. Prefix Collision Safety Audit

| Regel | Geteste Negatieve Controle / Prefix | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| **RE** | `REA 60.0`, `REA 100.0` (Cordless) | Geen match met RE | **GEEN COLLISIE (PASS)** |
| **RM** | `RMA 448`, alle 22 RMA modellen | Matched RMA (BATTERY), niet RM | **GEEN COLLISIE (PASS)** |
| **RM** | `RME 339.0 C`, `RME 443.0 C`, `RME 545.0 C` | Geen match met RM | **GEEN COLLISIE (PASS)** |
| **RM** | `RMI 422.0`, `RMI 522.0 C`, `RMI 632.0 PC` | Geen match met RM | **GEEN COLLISIE (PASS)** |

---

## 5. Hard Gates Verificatie

```text
UNSAFE_DRIVE_PROMOTIONS              = 0
PROMOTIONS_WITHOUT_OFFICIAL_EVIDENCE = 0
PREFIX_COLLISION_ERRORS              = 0
RE_RULE_AFFECTED_REA                 = 0
RM_RULE_AFFECTED_RMA                 = 0
RM_RULE_AFFECTED_RME                 = 0
RM_RULE_AFFECTED_RMI                 = 0
TARGET_NON_MACHINE_RECORDS           = 0
TARGET_ATTACHMENT_RECORDS            = 0
DRIVE_CONFLICTS_INTRODUCED           = 0
FABRICATED_PROVENANCE                = 0
PHASE56N_REGRESSIONS                 = 0
CATALOG_FREEZE_INTACT                = true
PHASE56O_EVIDENCE_INTEGRITY          = true
```

---

## 6. Routing & Governance Status

```text
9router_endpoint_reachable = YES
9router_used = NO
9router_model/routes_used = NONE
9router_fallback_reason = 503 upstream / 402 Credits Required; native fallback actief

agent_initiated_codex = NO
automatic_external_review_triggered = NO
codex_feedback_used = NO
codex_used_for_acceptance = NO
```

---

## 7. Conclusie

Phase 56O is succesvol afgerond met 100% sluitende evidence, 0 prefix collisions, 0 regressies en een stijging van de aangedreven coverage van 45.85% naar 59.27%.
