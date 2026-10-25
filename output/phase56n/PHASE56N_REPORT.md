# STIHLDECODER — PHASE 56N.1 HOS / USG POWERED SHARPENER CORRECTION REPORT

**Status:** PASS
**Baseline commit:** `4883ff1b910da34ee7076b9978ac8c0870dbf2bd`
**Datum:** 2026-10-25T19:38:46.115Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Opdrachtstelling

Phase 56N.1 corrigeert de onterechte classificatie van **HOS Sharpeners** en **USG Sharpeners** als accessoires in Phase 56N.
Volgens officiële STIHL-instructiehandleidingen (`hosmanual.pdf` en `USG_Manual.pdf` / `0458-523-0121-A`) zijn dit elektrisch aangedreven machines uitgerust met een 230 V eenfasige wisselstroommotor (0,18 kW, 2.800 RPM).
Deze twee modellen zijn hersteld naar de aangedreven machinepopulatie (`POWERED_MACHINE`) en exact opgelost als `MAINS_ELECTRIC` via `EXPLICIT_MODEL`.

---

## 2. Hard Gates Status

| Hard Gate | Eis | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `HOS_POWERED_MACHINE` | `true` | `true` | **PASS** |
| `USG_POWERED_MACHINE` | `true` | `true` | **PASS** |
| `HOS_EXPLICIT_MAINS_ELECTRIC` | `true` | `true` | **PASS** |
| `USG_EXPLICIT_MAINS_ELECTRIC` | `true` | `true` | **PASS** |
| `POWERED_SHARPENERS_FALSE_EXCLUDED` | `0` | `0` | **PASS** |
| `TRUE_NON_MACHINE_COUNT` | `52` | `52` | **PASS** |
| `POWERED_MACHINE_CANDIDATES` | `879` | `879` | **PASS** |
| `NEW_EXACT_DRIVE_RESOLUTIONS` | `2` | `2` | **PASS** |
| `UNSAFE_DRIVE_PROMOTIONS` | `0` | `0` | **PASS** |
| `DRIVE_CONFLICTS_INTRODUCED` | `0` | `0` | **PASS** |
| `ATTACHMENT_REGRESSIONS` | `0` | `0` | **PASS** |
| `POWERED_MACHINE_FALSE_EXCLUSIONS` | `0` | `0` | **PASS** |
| `NON_MACHINE_STILL_COUNTED_AS_POWERED` | `0` | `0` | **PASS** |
| `CATALOG_FREEZE_INTACT` | `true` | `true` | **PASS** |

---

## 3. Officiële Evidence Provenance

### HOS Sharpeners
- **Bron:** STIHL HOS Instruction Manual (`hosmanual.pdf`)
- **Document Part Number:** `hosmanual.pdf`
- **Specificaties:** Eenfasige AC-motor, 230 V, 0,18 kW (180 W), 2.800 RPM.
- **Nieuwe machine eligibility:** `POWERED_MACHINE`
- **Nieuw aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL` (geen family prefix rule)
- **PDF-verificatie:** Authentieke PDF-tekstextractie via `pdfjs-dist`, status `VERIFIED`.

### USG Sharpeners
- **Bron:** STIHL USG Universal Sharpener Instruction Manual (`0458-523-0121-A` / `USG_Manual.pdf`)
- **Document Part Number:** `0458-523-0121-A` (Page 28, Section 21.1)
- **Specificaties:** Eenfasige AC-motor, 230 V, 50 Hz, 1,1 A / 1,3 A, 0,18 kW (180 W), 2.800 RPM.
- **Nieuwe machine eligibility:** `POWERED_MACHINE`
- **Nieuw aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL` (geen family prefix rule)
- **PDF-verificatie:** Authentieke PDF-tekstextractie via `pdfjs-dist`, status `VERIFIED`.

---

## 4. Gecorrigeerde Populatie- en Dekkingsstatistieken

| Indicator | Phase 56M Baseline | Phase 56N (Voor correctie) | Phase 56N.1 (Na correctie) | Delta t.o.v. 56N |
| :--- | :--- | :--- | :--- | :--- |
| Totaal catalogusmodellen | 956 | 956 | 956 | 0 |
| Kombi/MultiTool attachments | 25 | 25 | 25 | 0 |
| Echte niet-machine ruis | 0 | 54 | **52** | -2 (herstel slijpmachines) |
| - Non-machine accessories | 0 | 49 | **47** | -2 (HOS, USG verwijderd) |
| - Replacement parts as model | 0 | 5 | **5** | 0 |
| **Aangedreven machinekandidaten (noemer)** | **931** | **877** | **879** | **+2** |
| Opgeloste aangedreven machines | 401 | 401 | **403** | **+2** (HOS, USG opgelost) |
| Onbekende aangedreven machines | 530 | 476 | **476** | 0 |
| **Dekkingspercentage** | **43,07%** | **45,72%** | **45,85%** | **+0,13%** |

---

## 5. Catalogus-, SEO- en Commerciële Invarianten

- Canonical parts: 17.082 (**INTACT**)
- Canonical fitments: 175.106 (**INTACT**)
- Configurations: 766 (**INTACT**)
- Evidence ledger: 208.412 (**INTACT**)
- Section contexts: 814 (**INTACT**)
- Indexable part pages: 843 (**INTACT**)
- Sitemap URLs: 1.024 (**INTACT**)
- Amazon fallbacks: 17.082 (**INTACT**)
- Amazon partner tag: `srihldecoder2-21` (**INTACT**)
- Verified direct ASINs: 0 (**INTACT**)
