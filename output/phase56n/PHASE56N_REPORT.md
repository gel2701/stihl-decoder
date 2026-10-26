# STIHLDECODER — PHASE 56N.3 ARCHIVED HOS PROVENANCE TRUTHFULNESS CLOSURE REPORT

**Status:** PASS
**Baseline commit:** `ed05fbe15063965b7151c520246f42bba5eec88f`
**Datum:** 2026-10-25T23:05:14.228Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Opdrachtstelling

Phase 56N.3 voltooit de definitieve **Archived HOS Provenance Truthfulness Closure**.
In Phase 56N.2 werd een Common Crawl WARC capture van het HOS-handboek gebruikt, maar werd het resultaat van de lokale PDF-structuurreconstructie ten onrechte aangeduid als een rechtstreekse HTTP-fetch en als officiële documenthash.
Phase 56N.3 maakt de provenance 100% waarheidsgetrouw:
1. De Common Crawl capture wordt eerlijk geregistreerd als `ARCHIVED_OFFICIAL_HTTP_CAPTURE` (`archive_provider = COMMON_CRAWL`).
2. De originele STIHL CDN URL en de daadwerkelijke WARC-retrieval URL worden expliciet onderscheiden.
3. De originele 1.048.576 bytes uit de HTTP-body worden als afzonderlijk brondocument bewaard en gehasht (`10f84eb019b7c4e2e90f5168edb0ac473d8254a020b4b45541f0e804912649d7`).
4. De gereconstrueerde PDF geldt strikt als `derived_parser_artifact` met een eigen hash (`e4488c2687e47486071dea11771ac50c584b26b1393664f9ea18cda62cc5de83`).
5. Aangetoond is dat alle bewijsdragende PDF-objecten (pagina 20: objecten 179, 180, 181) al volledig binnen de oorspronkelijke responsebody aanwezig waren.
6. Lokaal toegevoegde structuurobjecten bevatten nul semantische termen (`LOCAL_RECONSTRUCTION_ADDED_SEMANTIC_CONTENT = 0`).
7. Dynamische PDF-tekstextractie via `pdfjs-dist` en excerpt-matching worden opnieuw programmatisch uitgevoerd.
8. USG Sharpeners behoudt de geverifieerde rechtstreekse live HTTP-fetch (`OFFICIAL_HTTP_FETCH`).

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
| `FABRICATED_SHARPENER_PROVENANCE` | `0` | `0` | **PASS** |
| `MISLABELED_ARCHIVE_AS_LIVE_HTTP` | `0` | `0` | **PASS** |
| `LOCAL_RECONSTRUCTION_ADDED_SEMANTIC_CONTENT` | `0` | `0` | **PASS** |
| `HOS_SOURCE_ORIGIN_TRUTHFUL` | `true` | `true` | **PASS** |
| `HOS_EVIDENCE_TRACEABLE_TO_SOURCE_BYTES` | `true` | `true` | **PASS** |
| `HOS_PDF_REEXTRACTION_SUCCESS` | `true` | `true` | **PASS** |
| `HOS_EXCERPT_REVALIDATED` | `true` | `true` | **PASS** |
| `USG_PDF_REEXTRACTION_SUCCESS` | `true` | `true` | **PASS** |
| `USG_EXCERPT_REVALIDATED` | `true` | `true` | **PASS** |
| `SHARPENER_PROVENANCE_INTEGRITY` | `true` | `true` | **PASS** |
| `CATALOG_FREEZE_INTACT` | `true` | `true` | **PASS** |

---

## 3. Officiële Evidence Provenance

### HOS Sharpeners
- **Bron:** STIHL HOS Instruction Manual (`0458-522-0121`)
- **Source Mode:** `ARCHIVED_OFFICIAL_CAPTURE`
- **Content Origin:** `ARCHIVED_OFFICIAL_HTTP_CAPTURE`
- **Original Target URL:** `https://cdnassets.stihlusa.com/1625859444-hosmanual.pdf`
- **Live Fetch Status:** 403 (`FAILED_RETIRED_CDN_ASSET`)
- **Archive Provider:** Common Crawl (`CC-MAIN-2024-18`)
- **Evidence Retrieval URL:** `https://data.commoncrawl.org/crawl-data/CC-MAIN-2024-18/segments/1712296817819.93/warc/CC-MAIN-20240421194551-20240421224551-00324.warc.gz`
- **WARC Record SHA-256:** `8a38c323a3bd2a5da8251ce0bcf86f269ee1ddeb4281fedca44f5573bb3741f6`
- **Archived Source Body Bytes:** 1.048.576
- **Archived Source Body SHA-256:** `10f84eb019b7c4e2e90f5168edb0ac473d8254a020b4b45541f0e804912649d7`
- **Derived Parser Artifact:** `hosmanual.pdf` (1.057.881 bytes, SHA-256: `e4488c2687e47486071dea11771ac50c584b26b1393664f9ea18cda62cc5de83`)
- **Derived Structure Added:** `true` (page tree + xref exclusively as parsing aid)
- **Local Reconstruction Added Semantic Content:** `0`
- **Evidence Page:** 20 (Specifications)
- **Evidence Objects:** 179, 180, 181 (alle aanwezig binnen de 1.048.576 source bytes)
- **Specificaties:** Type: Single-phase AC, squirrel-cage motor, Operating voltage: 230 V, Frequency: 50 Hz, Rated current: 1.3 A, Power rating: 0.18 kW, Motor speed: 2,800 RPM.
- **Machine Eligibility:** `POWERED_MACHINE`
- **Aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL`
- **PDF-extractie & Excerpt:** Verse re-extractie via `pdfjs-dist` (26 pagina's), excerpt re-validated, status `VERIFIED`.

### USG Sharpeners
- **Bron:** STIHL USG Universal Sharpener Instruction Manual (`0458-523-0121-A` / `USG_Manual.pdf`)
- **Source Mode:** `LIVE_OFFICIAL_HTTP`
- **Content Origin:** `OFFICIAL_HTTP_FETCH`
- **Original & Final URL:** `https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL/ZBA/ZBA/0458-523-0121-A_ZBA_01_01.pdf`
- **HTTP Status:** 200
- **Document Bytes:** 1.060.207
- **Document SHA-256:** `d782f571b2f09f249536bd3288608ab469b5dbd336ca6813cb5aa5a50e86d3bf`
- **Pagina:** 28 (Section 21.1)
- **Specificaties:** Type: Single-phase AC, squirrel cage motor, Voltage: 230 V, Frequency: 50 Hz, Rated current: 1.1 A, Power consumption: 180 W, Motor speed: 2,800 rpm.
- **Machine Eligibility:** `POWERED_MACHINE`
- **Aandrijvingstype:** `MAINS_ELECTRIC` (`Elektrisch / netstroom`)
- **Resolutiemethode:** `EXPLICIT_MODEL`
- **PDF-extractie & Excerpt:** Verse re-extractie via `pdfjs-dist` (32 pagina's), excerpt re-validated, status `VERIFIED`.

---

## 4. Gecorrigeerde Populatie- en Dekkingsstatistieken

| Indicator | Phase 56M Baseline | Phase 56N.1 / 56N.2 | Phase 56N.3 | Delta |
| :--- | :--- | :--- | :--- | :--- |
| Totaal catalogusmodellen | 956 | 956 | 956 | 0 |
| Kombi/MultiTool attachments | 25 | 25 | 25 | 0 |
| Echte niet-machine ruis | 0 | 52 | **52** | 0 |
| - Non-machine accessories | 0 | 47 | **47** | 0 |
| - Replacement parts as model | 0 | 5 | **5** | 0 |
| **Aangedreven machinekandidaten (noemer)** | **931** | **879** | **879** | **0** |
| Opgeloste aangedreven machines | 401 | 403 | **403** | 0 |
| Onbekende aangedreven machines | 530 | 476 | **476** | 0 |
| **Dekkingspercentage** | **43,07%** | **45,85%** | **45,85%** | **0,00%** |

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

---

## 6. Historische CI-Audit & Phase 56N.4 Opvolging

- **PR #64 Candidate Commit SHA**: `577228ee72b634aecc3206c11385bef92871edcf`
- **PR #64 Merge Commit SHA**: `86e60d9882a0855b9427536357737859b66ad183`
- **PR #64 CI Status**:
  - `browser-e2e`: **PASS**
  - `trust-audit`: **PASS**
  - `node-contract-tests`: **FAIL**
  - **Oorzaak**: `tests/phase52a_parts_harvester.test.js` Test 35 faalde op externe HTTP 404 voor de gearchiveerde/gepensioneerde officiële STIHL bron van Service Kit 45 (`https://www.stihl.nl/nl/ap/service-kit-45-140895`).
- **Phase 56N.4 Oplossing**:
  - Canonieke compatibiliteitsclaim behouden: Service Kit 45 (`1130 007 4103`) voor `MS 170` en `MS 180` (2-MIX motoren).
  - Gepensioneerde URL waarheidsgetrouw geregistreerd: `previous_source_url = 'https://www.stihl.nl/nl/ap/service-kit-45-140895'`, `previous_source_status = 'RETIRED_404'`.
  - Officiële vervangende bron geverifieerd: STIHL Product Catalogue (`https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf`, pagina 184, doc_ref `0463 931 8023`, SHA-256 `406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162`).
  - Strict Content-Level Validator uitgebreid met formele Source-Rot Policy (`SOURCE_RETIRED_REPLACEMENT_VERIFIED`) en dynamische PDF-tekstextractie via `pdfjs-dist`.
  - Dedicated Test 42 toegevoegd aan `tests/phase52a_parts_harvester.test.js`.
