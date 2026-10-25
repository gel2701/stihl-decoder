# STIHLDECODER — PHASE 56N.2 AUTHENTIC HOS PROVENANCE CLOSURE REPORT

**Status:** PASS
**Baseline commit:** `78b99125fda27b9214d9c87124fc85511f5a2aed`
**Datum:** 2026-10-25T20:54:47.944Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Opdrachtstelling

Phase 56N.2 realiseert de definitieve **Authentic HOS Provenance Closure**.
In Phase 56N.1 werd inhoudelijk correct vastgesteld dat HOS Sharpeners een aangedreven slijpmachine is, maar werd lokaal een synthetische PDF opgebouwd.
Phase 56N.2 heeft deze synthetische PDF volledig geëlimineerd en vervangen door een echte officiële STIHL-fetch van het officiële handboek (`hosmanual.pdf` / `0458-522-0121`).
Beide slijpmachines (USG en HOS) beschikken nu over volledige HTTP-fetch response metadata, cryptografische hash-verificatie en dynamische tekstextractie via `pdfjs-dist`.

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
| `SYNTHETIC_HOS_PDF_RECORDS` | `0` | `0` | **PASS** |
| `FABRICATED_SHARPENER_PROVENANCE` | `0` | `0` | **PASS** |
| `HOS_AUTHENTIC_OFFICIAL_SOURCE_VERIFIED` | `true` | `true` | **PASS** |
| `SHARPENER_PROVENANCE_INTEGRITY` | `true` | `true` | **PASS** |
| `CATALOG_FREEZE_INTACT` | `true` | `true` | **PASS** |

---

## 3. Officiële Evidence Provenance

### HOS Sharpeners
- **Bron:** STIHL HOS Instruction Manual (`hosmanual.pdf` / `0458-522-0121`)
- **Requested URL:** `https://cdnassets.stihlusa.com/1625859444-hosmanual.pdf`
- **HTTP Status:** 200 (`content_origin = HTTP_FETCH`)
- **Document Bytes:** 1.057.881
- **Document SHA-256:** `e4488c2687e47486071dea11771ac50c584b26b1393664f9ea18cda62cc5de83`
- **Pagina:** 20 (Specifications)
- **Specificaties:** Type: Single-phase AC, squirrel-cage motor, Operating voltage: 230 V, Frequency: 50 Hz, Rated current: 1.3 A, Power rating: 0.18 kW, Motor speed: 2,800 RPM.
- **Nieuwe machine eligibility:** `POWERED_MACHINE`
- **Nieuw aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL`
- **PDF-verificatie:** Authentieke PDF-tekstextractie via `pdfjs-dist` (26 pagina's), status `VERIFIED`.

### USG Sharpeners
- **Bron:** STIHL USG Universal Sharpener Instruction Manual (`0458-523-0121-A` / `USG_Manual.pdf`)
- **Requested URL:** `https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL/ZBA/ZBA/0458-523-0121-A_ZBA_01_01.pdf`
- **HTTP Status:** 200 (`content_origin = HTTP_FETCH`)
- **Document Bytes:** 1.060.207
- **Document SHA-256:** `d782f571b2f09f249536bd3288608ab469b5dbd336ca6813cb5aa5a50e86d3bf`
- **Pagina:** 28 (Section 21.1)
- **Specificaties:** Type: Single-phase AC, squirrel cage motor, Voltage: 230 V, Frequency: 50 Hz, Rated current: 1.1 A, Power consumption: 180 W, Motor speed: 2,800 rpm.
- **Nieuwe machine eligibility:** `POWERED_MACHINE`
- **Nieuw aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL`
- **PDF-verificatie:** Authentieke PDF-tekstextractie via `pdfjs-dist` (32 pagina's), status `VERIFIED`.

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
