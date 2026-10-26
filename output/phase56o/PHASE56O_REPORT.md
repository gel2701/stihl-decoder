# STIHLDecoder — Phase 56O.1 Eindrapport
## Evidence Integrity & Generation Coverage Closure

**Status:** PASS<br>
**Datum:** 2026-10-26T06:06:00.000Z<br>
**Baseline commit:** `762bbefc15dfea21e04dc29f64d48c97131ea191`<br>
**Branch:** `fix/phase56o-evidence-integrity-closure`

---

## 1. Doel & Context

In Phase 56O.1 is de provenance-audit voor de drie gepromoveerde STIHL-machinefamilies (`RE`, `RM`, `RMA`) definitief gesloten:
- **Registry ↔ Ledger Parity:** Exacte afstemming van fetch IDs (`fetch_stihl_family_028`, `029`, `030`), URL's, timestamps en hashes.
- **Excerpt SHA-Integriteit:** Strikte invariant gehandhaafd dat `source_excerpt_hash = SHA256(UTF8(source_excerpt))` en dat `body_sha256 ≠ source_excerpt_hash` voor HTML-bronnen.
- **Dynamische Provenance Gates:** Alle integriteits- en provenance-validaties worden dynamisch berekend zonder hardcoded constanten.
- **Evidence-Gedreven Generation Coverage:** Elke generatiegroep (`1xx`-`9xx` voor RE; `2xx`-`7xx` voor RM; `2xx`-`7xx` voor RMA) is expliciet gekoppeld aan authentieke officiële documentatie.

---

## 2. Populatie & Coverage Resultaten

| Parameter | Baseline (Phase 56N) | Na Phase 56O / 56O.1 | Delta |
| :--- | :--- | :--- | :--- |
| **Catalogustotaal** | 956 | 956 | 0 |
| **Niet-aangedreven attachments** | 25 | 25 | 0 |
| **Non-machine ruis / componenten** | 52 | 52 | 0 |
| **Aangedreven machinepopulatie (noemer)** | **879** | **879** | **0** |
| **Opgeloste aangedreven machines** | **403** | **521** | **+118 (+29.28%)** |
| **Onbekende aangedreven machines** | **476** | **358** | **-118 (-24.79%)** |
| **Coverage percentage** | **45.85%** | **59.27%** | **+13.42 pp** |

---

## 3. Evidence-Gedreven Generation Matrix

### RE Generaties (`MAINS_ELECTRIC`)
- **1xx (31 modellen):** Gedekt door live HTML (`RE 130 PLUS`) en *STIHL GB Catalogue 2023* p. 156-161.
- **2xx (8 modellen):** Gedekt door officiële handleiding `0458-647-9021-A` (RE 271, 281).
- **3xx (6 modellen) & 4xx (5 modellen):** Gedekt door officiële handleiding `0458-671-9021` (RE 361, 461, 471 K).
- **5xx (8 modellen):** Gedekt door officiële handleiding `0458-675-9021` (RE 521, 551, 581).
- **6xx (4 modellen), 8xx (5 modellen), 9xx (4 modellen):** Gedekt door officiële handleiding `0458-676-9021` (RE 661, 881, 981).

### RM Generaties (`PETROL`)
- **2xx, 4xx, 5xx, 6xx, 7xx (25 modellen):** Volledig gedekt door live HTML (`RM 448 T`), *STIHL GB Catalogue 2023* p. 107 en Service Kit 49 doc `0458-007-0049`.

### RMA Generaties (`BATTERY`)
- **2xx, 3xx, 4xx, 7xx (22 modellen):** Volledig gedekt door live HTML (`RMA 448 V`) en *STIHL GB Catalogue 2023* p. 108.

---

## 4. Hard Gates Verificatie

```text
REGISTRY_LEDGER_FETCH_ID_MISMATCHES   = 0
ACTIVE_RULE_LEDGER_PARITY_ERRORS     = 0
EXCERPT_HASH_MISMATCHES              = 0
BODY_HASH_MISMATCHES                 = 0
UNVERIFIED_ACTIVE_LEDGER_RECORDS     = 0
NON_CONTEXT_BOUND_ACTIVE_RECORDS     = 0
PROMOTIONS_WITHOUT_EVIDENCE_IDS      = 0
PROMOTIONS_WITH_UNSUPPORTED_GEN     = 0
FABRICATED_PROVENANCE                = 0
SYNTHETIC_PROVENANCE                 = 0
PREFIX_COLLISION_ERRORS              = 0
DRIVE_CONFLICTS_INTRODUCED           = 0
PHASE56O_EVIDENCE_INTEGRITY          = true
CATALOG_FREEZE_INTACT                = true
```

---

## 5. Conclusie

Phase 56O.1 is succesvol afgerond met volledige provenance-integriteit, geverifieerde generatiedekking en 100% sluitende parity tussen registry en fetch ledger.
