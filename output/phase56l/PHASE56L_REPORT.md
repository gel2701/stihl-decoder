# STIHLDECODER — PHASE 56L.4 PRIMARY CONTEXT PARSER FINAL CLOSURE REPORT

**Status:** PASS
**Baseline commit:** `fa38574e404f00362e9f553c560a90f0821c2ec1`
**Datum:** 2026-10-25T17:25:55.115Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Probleemstelling (Phase 56L.4)

Phase 56L.3 heeft:
- echte PDF text extraction;
- page-bound PDF evidence;
- primary HTML context binding;
- attachment safety;
- explicit evidence precedence;
succesvol ingevoerd.

Phase 56L.4 repareert definitief de twee resterende HTML-parsergaten:
1. **Defect A (Nesting-aware Secondary Removal)**: Regex matching op secundaire containers (`div.related`, `nav`, `footer`, enz.) was niet nesting-aware en kon bij child tags te vroeg stoppen waardoor gerelateerde producten lekten naar `primary_text`. In Phase 56L.4 is `parse5` geïntegreerd voor een volledige DOM tree traversal, waarbij secundaire containers en al hun nakomelingen recursief worden geëxtraheerd naar `secondary_text` en gestript uit `primary_text` (`NESTED_SECONDARY_CONTENT_LEAKS = 0`).
2. **Defect B (JSON-LD Product Type Validation)**: In plaats van losse `item.name` matching worden alleen strikte Schema.org `Product` / `ProductModel` entiteiten (zowel enkele string als array `@type`) als product evidence geaccepteerd. `WebSite`, `Organization`, `Brand`, `BreadcrumbList` en andere niet-product schema types worden strikt genegeerd (`NON_PRODUCT_JSONLD_EVIDENCE_RECORDS = 0`, `PRIMARY_CONTEXT_PARSER_VERIFIED = true`).

---

## 2. Hard Gates Status (Phase 56L.4)

| Hard Gate | Eis | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `POWERED_ATTACHMENT_MISCLASSIFICATIONS` | `0` | `0` | **PASS** |
| `EXPLICIT_EVIDENCE_PROPAGATION_VALID` | `true` | `true` | **PASS** |
| `FABRICATED_FAMILY_PROVENANCE` | `0` | `0` | **PASS** |
| `WRONG_CONTENT_VERIFIED_RECORDS` | `0` | `0` | **PASS** |
| `IMPOSSIBLE_TIMESTAMP_ORDER_RECORDS` | `0` | `0` | **PASS** |
| `ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE` | `0` | `0` | **PASS** |
| `RAW_PDF_BYTE_VERIFICATION_RECORDS` | `0` | `0` | **PASS** |
| `PRIMARY_CONTEXT_MISMATCH_VERIFIED_RECORDS` | `0` | `0` | **PASS** |
| `ACTIVE_PDF_RULES_WITHOUT_EXTRACTED_TEXT` | `0` | `0` | **PASS** |
| `CONTEXT_BOUND_FAMILY_PROVENANCE_VERIFIED` | `true` | `true` | **PASS** |
| `NESTED_SECONDARY_CONTENT_LEAKS` | `0` | `0` | **PASS** |
| `NON_PRODUCT_JSONLD_EVIDENCE_RECORDS` | `0` | `0` | **PASS** |
| `PRIMARY_CONTEXT_PARSER_VERIFIED` | `true` | `true` | **PASS** |

---

## 3. Semantische Verificatie, Context Binding & PDF Resultaten

- **Totaal geëvalueerde familiedoelen:** 28
- **Context-gebonden VERIFIED regels:** **27**
  - Benzine (`PETROL`): 12 (MS, FS, FR, TS, HS, HL, HT, KM, BG, BR, SH, SR)
  - Accu (`BATTERY`): 9 (MSA, FSA, TSA, HSA, HLA, HTA, KMA, BGA, SHA)
  - Elektrisch 230V (`MAINS_ELECTRIC`): 6 (MSE, FSE, HSE, HLE, BGE, SHE)
- **PDF-regels geëxtraheerd via pdfjs-dist:** 3 (HLE: pagina 34; BGE: pagina 7; SHE: pagina 13)
- **Ruwe PDF byte-verificatie records:** 0
- **Primary context mismatches:** 0
- **Nested secondary content leaks:** 0
- **Non-product JSON-LD evidence records:** 0
- **Uitgeschakelde / Unverified regels:** **1** (`HTE` — Snoeischaar PG 20 redirect, faalt fail-closed conform instructie)
- **Unieke HTTP fetches:** **27**
- **Gedeelde cached fetches:** **1** (`SHE` deelt handleiding met `BGE` zonder timestamp-corruptie)
- **Valse-positieven / verkeerde pagina's per abuis geverifieerd:** **0**

---

## 4. Modeldekking & Resolutieverschillen

- **Totaal catalogusmodellen:** 956
  - **Niet-aangedreven opzetstukken:** 25 (veilig geïsoleerd als `ATTACHMENT_NOT_POWERED`)
  - **Kandidaten aangedreven machines:** 931
- **Opgeloste aandrijvingen:**
  - Expliciet opgelost: 110
  - Modelfamilie opgelost (semantisch & context-gebonden): 291
  - **Totaal opgelost:** 401 / 931 (43.07%)
  - Onbekend / Niet vastgesteld (fail-closed): 530
- **Conflicten / Quarantaine:** 0

---

## 5. Acceptatiegevallen Verificatie

Alle 15 acceptatiemodellen slagen 100%:
- `MS 211` -> Benzine (`PETROL`, `FAMILY_RULE`) [**PASS**]
- `MSA 300` -> Accu (`BATTERY`, `FAMILY_RULE`) [**PASS**]
- `MSE 210` -> Elektrisch (`MAINS_ELECTRIC`, `FAMILY_RULE`) [**PASS**]
- `FS 55` -> Benzine (`PETROL`, `FAMILY_RULE`) [**PASS**]
- `FSA 120` -> Accu (`BATTERY`, `FAMILY_RULE`) [**PASS**]
- `TS 420` -> Benzine (`PETROL`, `FAMILY_RULE`) [**PASS**]
- `TSA 230` -> Accu (`BATTERY`, `FAMILY_RULE`) [**PASS**]
- `BG 86` -> Benzine (`PETROL`, `FAMILY_RULE`) [**PASS**]
- `HT 131` -> Benzine (`PETROL`, `FAMILY_RULE`) [**PASS**]
- `BG-KM`, `FS-KM`, `HL-KM`, `HT-KM`, `FS Power Tool Attachments` -> `ATTACHMENT_NOT_POWERED` [**PASS**]
- `026` -> Benzine (`EXPLICIT_MODEL`) [**PASS**]

---

## 6. Catalogus & SEO Invarianten

- Canonical parts: 17082 (17.082) [**INTACT**]
- Canonical fitments: 175106 (175.106) [**INTACT**]
- Configurations: 766 (766) [**INTACT**]
- Evidence ledger: 208412 (208.412) [**INTACT**]
- Section contexts: 814 (814) [**INTACT**]
- Indexable part pages: 843 [**INTACT**]
- Sitemap URLs: 1.024 [**INTACT**]
- Amazon fallbacks: 17082 (17.082) [**INTACT**]
- Amazon associate tag: `srihldecoder2-21` [**INTACT**]
- Verified ASIN mappings: 0 [**INTACT**]

---
