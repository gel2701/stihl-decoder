# STIHLDECODER — PHASE 56P REPORT
## VIKING MB Verified Drive-Type Expansion & Evidence Integrity Closure

**Status:** PASS<br>
**Datum:** 2026-10-26T21:47:16.905Z<br>
**Baseline commit:** `8253d08fe11275b1826cb92132a4fb613f005925`<br>
**Branch:** `fix/phase56p1-mb-evidence-integrity`

---

## 1. INLEIDING & DOEL

Phase 56P breidt de verified drive-type resolution van STIHL-decoder uit naar de historische **VIKING MB grasmaaiers** (48 catalogusmodellen).
VIKING werd in 1992 overgenomen door ANDREAS STIHL AG & Co. KG en in 2018 omgevormd tot STIHL Tirol GmbH. In 2019 zijn alle VIKING-machines onder het merk STIHL gerebrand, waarbij STIHL officieel 10 jaar service en onderdelenvoorziening garandeert.

Er is uitdrukkelijk **geen algemene blanket rule** toegepast. Alleen modellen waarvoor authentieke documentatie van de fabrikant beschikbaar is, zijn geactiveerd:
- **36 modellen** geactiveerd als `PETROL` (9 gedocumenteerde generaties);
- **12 historische modellen** blijven `UNKNOWN` (`UNSUPPORTED_GENERATION`) fail-closed wegens het ontbreken van digitale handleiding-bytes op STIHL-infrastructuur.

In Phase 56P.1 zijn alle 12 gebruikte manuals cryptografisch gecontroleerd via SHA-256, met PDF.js uitgelezen, voorzien van geverifieerde excerpten met SHA-256 excerpt-hashes, en is canonical model designation normalisatie ingevoerd.

---

## 2. GENERATION MATRIX & DYNAMIC ACTIVATION

| Generatiegroep | Aantal | Status | Primaire Officiële Documentatie | Modellen |
| :--- | :--- | :--- | :--- | :--- |
| **MB 2.x** | 3 | COVERED | 0478-111-9926-C | MB 2, MB 2.1, MB 2.2 |
| **MB 248 / 253** | 6 | COVERED | 0478-111-9828-B, 0478-111-9928-B, Service Kit 51 | MB 248.0, MB 248.1, MB 248.3, MB 248.4, MB 253.0, MB 253.1 |
| **MB 3.x** | 3 | COVERED | 0478-111-9933-A | MB 3, MB 3.1, MB 3.2 |
| **MB 4.x** | 2 | COVERED | 0478-111-9929-B | MB 4.0, MB 4.1 |
| **MB 443 / 448** | 4 | COVERED | 0478-111-9923-F | MB 443.0, MB 443.1, MB 448.0, MB 448.1 |
| **MB 545** | 2 | COVERED | 0478-111-9932-B | MB 545.0, MB 545.1 |
| **MB 6.x** | 3 | COVERED | 0478-111-9917-F | MB 6, MB 6.1, MB 6.2 |
| **MB 650 / 655** | 7 | COVERED | 0478-111-9918-F, 0478-111-9931-D | MB 650.0, MB 650.1, MB 650.3, MB 655.0, MB 655.1, MB 655.2, MB 655.3 |
| **MB 750 / 755 / 756** | 6 | COVERED | 0478-111-9921-A, 0478-111-9925-E | MB 750.0, MB 750.1, MB 755.0, MB 755.1, MB 755.2, MB 756.0 |
| **MB 1xx** | 1 | UNSUPPORTED | Geen digitale manual bytes | MB 140 |
| **MB 4xx** | 6 | UNSUPPORTED | Geen digitale manual bytes | MB 400, MB 410, MB 450, MB 455, MB 460, MB 465 |
| **MB 5xx** | 3 | UNSUPPORTED | Geen digitale manual bytes | MB 500, MB 505, MB 555 |
| **MB 7xx / 8xx** | 2 | UNSUPPORTED | Geen digitale manual bytes | MB 780.1, MB 858.0 |

---

## 3. STARTACCU ≠ BATTERY DRIVE DISCRIMINATIE

Sommige MB-modellen, zoals **MB 545 VE**, beschikken over een elektrische sleutelstart met een kleine lithium-ion startaccu.
Handleiding `0478-111-9932-B` sectie 8.6 documenteert expliciet:
> *"De grasmaaier MB 545 VE is voorzien van een elektrische startmotor. Als startaccu is een lithium-ionaccu ingebouwd."*

De hoofdmotor / primaire aandrijving is een 4-takt benzinemotor. De startaccu is louter een hulpmiddel voor de elektrische startmotor.
De aandrijfclassificatie van **MB 545 VE** lost conform deze verificatie correct op als:
- `drive_type = PETROL`
- `display = Benzine`
- `resolution = FAMILY_RULE`

---

## 4. COVERAGE ACCOUNTING

```text
Totaal catalogusmodellen:        956
Onbekrachtigde aanbouwdelen:      25
Vervangingsonderdelen / ruis:     52

Bekrachtigde machinekandidaten:  879
Opgelost vóór Phase 56P:         481 (54.72%)
Onbekend vóór Phase 56P:         398

Gepromoveerd in Phase 56P:       +36 (MB gedocumenteerde generaties)
Onopgelost gelaten (fail-closed): 12 (MB niet-gedocumenteerde generaties)

Opgelost ná Phase 56P:           517 (58.82%)
Onbekend ná Phase 56P:           362
Dekkingstoename:                 +4.10%
Conflicten:                        0
```

---

## 5. HARD GATES & INVARIANTEN

| Hard Gate | Doel | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `MB_TARGET_TOTAL` | 48 modellen in catalogus | 48 | PASS |
| `MB_ATTACHMENT_LEAKAGE` | 0 onbekrachtigde aanbouwdelen | 0 | PASS |
| `MB_NON_MACHINE_LEAKAGE` | 0 ruisrecords | 0 | PASS |
| `MB_BLANKET_RULE_PREVENTED` | Geen blinde family activatie | Model filter gehandhaafd | PASS |
| `MB_PROMOTIONS_EXACT` | Exact 36 modellen gepromoveerd | 36 | PASS |
| `MB_UNSUPPORTED_EXACT` | Exact 12 modellen fail-closed UNKNOWN | 12 | PASS |
| `MB_DRIVE_CONFLICTS` | 0 conflicten | 0 | PASS |
| `STARTER_BATTERY_DISCRIMINATED` | MB 545 VE is PETROL (niet BATTERY) | PETROL | PASS |
| `VERIFIED_MANUALS_WITHOUT_EXCERPT_HASH` | 0 geverifieerde manuals zonder excerpt hash | 0 | PASS |
| `PROMOTIONS_REFERENCING_UNVERIFIED_MANUALS` | 0 promoties met ongeverifieerde manuals | 0 | PASS |
| `CLEAN_CHECKOUT_REPRODUCIBLE` | Live fetch & cache reproduceerbaar | PASS | PASS |
| `CATALOG_FREEZE_INTACT` | Catalogus- en SEO-bevriezing intact | 956/25/52/879 | PASS |

---

## 6. CONCLUSIE

Phase 56P.1 verifieert alle 12 MB-handleidingen cryptografisch en semantisch. Geen enkel record vertrouwt op statische metadata. Alle excerpt hashes zijn non-null en afgeleid van daadwerkelijke PDF-tekst. De dekking van **58.82%** (517 bekrachtigde machines) is 100% fail-closed geborgd.
