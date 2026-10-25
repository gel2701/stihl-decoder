# STIHLDECODER — PHASE 56L.2 SEMANTIC FAMILY EVIDENCE VERIFICATION REPORT

**Status:** PASS
**Baseline commit:** `43fe7741b083a050a5767e878d1835436c7c7212`
**Datum:** 2026-10-25T15:58:17.525Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Probleemstelling (Phase 56L.2)

Phase 56L.1 heeft de functionele drive-resolution correcties (attachment safety, explicit evidence propagation contract, conflict quarantine, historical 026) succesvol geïmplementeerd.
Phase 56L.2 lost het **semantische provenance defect** op:
- Voorheen was verificatie gebaseerd op loutere HTTP 200 en de string "stihl". Hierdoor kregen niet-overeenkomende pagina's (zoals MSE -> "RM 2 R kopen", FS -> "GHE 250 kopen", HSA -> "RT 5097 kopen", BGA -> "Bezemrol KW-MM kopen") ten onrechte de status `VERIFIED`.
- In Phase 56L.2 is een strikt semantisch evidence-contract geïmplementeerd met controle op zowel **modelfamilietokens/modellen** als **relevante aandrijvingstermen** en **negatieve patroonherkenning** (valse-positieven preventie).
- Slechts semantisch geverifieerde regels worden geactiveerd. Unverified/disabled regels falen gesloten.
- Het timestamp ordering defect bij cache-hergebruik is hersteld (`IMPOSSIBLE_TIMESTAMP_ORDER_RECORDS = 0`).

---

## 2. Hard Gates Status (Phase 56L.2)

| Hard Gate | Eis | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `POWERED_ATTACHMENT_MISCLASSIFICATIONS` | `0` | `0` | **PASS** |
| `EXPLICIT_EVIDENCE_PROPAGATION_VALID` | `true` | `true` | **PASS** |
| `FABRICATED_FAMILY_PROVENANCE` | `0` | `0` | **PASS** |
| `WRONG_CONTENT_VERIFIED_RECORDS` | `0` | `0` | **PASS** |
| `IMPOSSIBLE_TIMESTAMP_ORDER_RECORDS` | `0` | `0` | **PASS** |
| `ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE` | `0` | `0` | **PASS** |
| `SEMANTIC_FAMILY_PROVENANCE_VERIFIED` | `true` | `true` | **PASS** |

---

## 3. Semantische Verificatie & Evidence Resultaten

- **Totaal geëvalueerde familiedoelen:** 28
- **Semantisch VERIFIED regels:** **27**
  - Benzine (`PETROL`): 12 (MS, FS, FR, TS, HS, HL, HT, KM, BG, BR, SH, SR)
  - Accu (`BATTERY`): 9 (MSA, FSA, TSA, HSA, HLA, HTA, KMA, BGA, SHA)
  - Elektrisch 230V (`MAINS_ELECTRIC`): 6 (MSE, FSE, HSE, HLE, BGE, SHE)
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
  - Modelfamilie opgelost (semantisch geverifieerd): 291
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
