# STIHLDECODER — PHASE 56L.3 EVIDENCE EXTRACTION & CONTEXT BINDING CLOSURE REPORT

**Status:** PASS
**Baseline commit:** `ccdaf09e739fdf401f00b47d14ffd91cd8504a6d`
**Datum:** 2026-10-25T16:55:59.664Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Probleemstelling (Phase 56L.3)

Phase 56L.2 heeft semantische STIHL-family-verificatie sterk verbeterd, maar liet twee provenance-defecten open:
1. **Defect A (PDF Parsing)**: PDF-bronnen werden als ruwe Latin-1 bytes behandeld zonder font- decoding of stream decompression. In Phase 56L.3 is echte PDF text extraction geïmplementeerd via `pdfjs-dist/legacy/build/pdf.mjs`. Elke PDF-bron registreert nu exact de geëxtraheerde tekstlengte, het aantal pagina's en het specifieke paginanummer waar zowel de familie als de aandrijvingsterm voorkomen (`RAW_PDF_BYTE_VERIFICATION_RECORDS = 0`, `ACTIVE_PDF_RULES_WITHOUT_EXTRACTED_TEXT = 0`).
2. **Defect B (HTML Context Binding)**: HTML family/drive evidence werd over het hele document gezocht, waardoor secundaire elementen (navigatie, gerelateerde producten slider, footer links) valse positieven konden veroorzaken. In Phase 56L.3 isoleert `extractPrimaryProductEvidence` de primaire productcontext (`page_title`, `h1`, `jsonld_product_name`, `primary_text`) van secundaire context. Beide entiteiten moeten binnen dezelfde primaire context vallen (`PRIMARY_CONTEXT_MISMATCH_VERIFIED_RECORDS = 0`, `CONTEXT_BOUND_FAMILY_PROVENANCE_VERIFIED = true`).

---

## 2. Hard Gates Status (Phase 56L.3)

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
