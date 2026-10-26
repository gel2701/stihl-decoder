# STIHLDecoder — Phase 56O.2 Eindrapport
## Reproducible Evidence & Fail-Closed Verification Closure

**Status:** PASS<br>
**Datum:** 2026-10-26T07:11:24.316Z<br>
**Baseline commit:** `2de799a97eb7146ac24215eb10a4cc63e77b0dd5`<br>
**Branch:** `fix/phase56o2-reproducible-evidence-closure`

---

## 1. Doel & Context

In Phase 56O.2 zijn de laatste drie integriteits- en provenance-defecten van de RE/RM/RMA drive-uitbreiding definitief gesloten:
1. **Architecturale scheiding & Fail-Closed Verifier:** Cryptografische verificatie verplaatst van de browser-facing registry naar `scripts/lib/verify_family_evidence_provenance.mjs`. Strikte fail-closed controles op `source_excerpt`, `source_excerpt_hash` en hasherbeschikbaarheid.
2. **Reproduceerbare bronverwerving:** `.cache/` geëlimineerd als vereiste voor documentbewijs. UK Product Catalogue 2023 PDF (`406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162`) wordt via officiële live fetch verworven en gevalideerd op pagina's 107, 108 en 161.
3. **Model-Level Promotion Enforcement:** Alleen modellen uit `COVERED` generatiegroepen worden gepromoveerd. RE 1xx (31 modellen) is geverifieerd via website en UK Catalogue p.161. Historische RE-generaties (2xx-9xx, 40 modellen) trekken fail-closed terug naar `UNKNOWN`.
4. **Shared Source Reuse:** Selectieve verversing van gedeelde documentbronnen (zoals BGE en SHE) gerepareerd tegen oppervlakkig hergebruik van ledger-metadata zonder contentpayload.

---

## 2. Populatie & Coverage Resultaten

| Parameter | Baseline (Phase 56N) | Na Phase 56O.2 | Delta |
| :--- | :--- | :--- | :--- |
| **Catalogustotaal** | 956 | 956 | 0 |
| **Niet-aangedreven attachments** | 25 | 25 | 0 |
| **Non-machine ruis / componenten** | 52 | 52 | 0 |
| **Aangedreven machinepopulatie (noemer)** | **879** | **879** | **0** |
| **Opgeloste aangedreven machines** | **403** | **481** | **+78 (+19.35%)** |
| **Onbekende aangedreven machines** | **476** | **398** | **-78 (-16.39%)** |
| **Coverage percentage** | **45.85%** | **54.72%** | **+8.87 pp** |

---

## 3. Evidence-Gedreven Generation Matrix

### RE Generaties (`MAINS_ELECTRIC`)
- **1xx (31 modellen) — COVERED:** Gedekt door live HTML (`RE 130 PLUS`) en *STIHL GB Catalogue 2023* p. 161.
- **2xx-9xx (40 modellen) — UNSUPPORTED:** Historische handleidingen niet officieel/reproduceerbaar opvraagbaar via actuele URL's. Fail-closed teruggetrokken naar `UNKNOWN`.

### RM Generaties (`PETROL`)
- **2xx, 4xx, 5xx, 6xx, 7xx (25 modellen) — COVERED:** Volledig gedekt door live HTML (`RM 448 T`), *STIHL GB Catalogue 2023* p. 107 en Service Kit 49 doc `0458-007-0049`.

### RMA Generaties (`BATTERY`)
- **2xx, 3xx, 4xx, 7xx (22 modellen) — COVERED:** Volledig gedekt door live HTML (`RMA 448 V`) en *STIHL GB Catalogue 2023* p. 108.

---

## 4. Hard Gates Verificatie

```text
MISSING_SOURCE_EXCERPTS                = 0
MISSING_SOURCE_EXCERPT_HASHES          = 0
HASH_COMPUTATION_FAILURES              = 0
EXCERPT_HASH_MISMATCHES                = 0

PDF_DOCUMENT_HASH_MISMATCHES           = 0
PDF_EXTRACTION_FAILURES                = 0
PAGE_EVIDENCE_FAILURES                 = 0

PROMOTIONS_WITHOUT_VERIFIED_GENERATION = 0
SHARED_SOURCE_REUSE_REGRESSIONS        = 0

CLEAN_CHECKOUT_EVIDENCE_REPRODUCIBLE   = true

REGISTRY_LEDGER_FETCH_ID_MISMATCHES    = 0
ACTIVE_RULE_LEDGER_PARITY_ERRORS       = 0
BODY_HASH_MISMATCHES                   = 0
UNVERIFIED_ACTIVE_LEDGER_RECORDS       = 0
NON_CONTEXT_BOUND_ACTIVE_RECORDS       = 0
PROMOTIONS_WITHOUT_EVIDENCE_IDS        = 0
PROMOTIONS_WITH_UNSUPPORTED_GENERATION = 0
FABRICATED_PROVENANCE                  = 0
SYNTHETIC_PROVENANCE                   = 0
PREFIX_COLLISION_ERRORS                = 0
DRIVE_CONFLICTS_INTRODUCED             = 0
PHASE56O_EVIDENCE_INTEGRITY            = true
CATALOG_FREEZE_INTACT                  = true
```

---

## 5. Conclusie

Phase 56O.2 is succesvol afgerond met reproduceerbare bewijsvalidatie in schone checkouts, fail-closed cryptografische verificatie en exacte afstemming van de aangedreven machinepopulatie (481 resolved, 398 unknown, 54.72% coverage).
