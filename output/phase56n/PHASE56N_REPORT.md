# STIHLDECODER — PHASE 56N CATALOG NOISE & POWERED-MACHINE BOUNDARY CLOSURE REPORT

**Status:** PASS
**Baseline commit:** `42d941ac347f4339ee58261a6f02b41f3823e8a7`
**Datum:** 2026-10-25T18:36:34.182Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Opdrachtstelling

Phase 56N corrigeert de grens van de aangedreven-machine populatie door **54 catalogus-noise records** (maaikoppen, batterijgordels, draagsystemen, en vervangingsonderdelen) formeel te classificeren als niet-machines (`NON_MACHINE_ACCESSORY` en `REPLACEMENT_PART_AS_MODEL`). Deze records worden verwijderd uit de noemer van aangedreven machinekandidaten. Er zijn **0 drive types gewijzigd of toegevoegd**.

---

## 2. Hard Gates Status

| Hard Gate | Eis | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `PHASE56M_NOISE_BASELINE` | `54` | `54` | **PASS** |
| `POWERED_MACHINE_FALSE_EXCLUSIONS` | `0` | `0` | **PASS** |
| `KNOWN_ATTACHMENT_REGRESSIONS` | `0` | `0` | **PASS** |
| `NON_MACHINE_STILL_COUNTED_AS_POWERED` | `0` | `0` | **PASS** |
| `DRIVE_TYPES_CHANGED_BY_PHASE56N` | `0` | `0` | **PASS** |
| `UNSAFE_ELIGIBILITY_CLASSIFICATIONS` | `0` | `0` | **PASS** |
| `EXISTING_PHASE56L_REGRESSIONS` | `0` | `0` | **PASS** |
| `CATALOG_FREEZE_INTACT` | `true` | `true` | **PASS** |

---

## 3. Catalogus-brede Machine Eligibility Classificatie (956 Records)

Alle 956 catalogusmodellen zijn geauditeerd door `resolveMachineEligibility()`:

| Categorie | Aantal | Percentage | Betekenis |
| :--- | :--- | :--- | :--- |
| `POWERED_MACHINE` | **877** | 91,74% | Zelfstandige aangedreven machines (kandidaten voor aandrijvingstype) |
| `UNPOWERED_ATTACHMENT` | **25** | 2,61% | KombiTools & MultiTools (BG-KM, FS-KM, BF-MM, etc.) |
| `NON_MACHINE_ACCESSORY` | **49** | 5,13% | Maaikoppen (43x), batterijgordels, draagsystemen, adapters |
| `REPLACEMENT_PART_AS_MODEL` | **5** | 0,52% | Maaimessen, plastic bussen, uitlaatpakkingen, startkoorden |
| `UNKNOWN_ELIGIBILITY` | **0** | 0,00% | Geen ambigue records |
| **Totaal catalogusmodellen** | **956** | **100,00%** | |

---

## 4. Noemer-Correctie & Dekking (Denominator Correction)

| Indicator | Voor Phase 56N | Na Phase 56N | Delta | Toelichting |
| :--- | :--- | :--- | :--- | :--- |
| Totaal catalogusmodellen | 956 | 956 | 0 | Catalogusbestand ongewijzigd |
| Kombi/MultiTool attachments | 25 | 25 | 0 | Behouden onder `ATTACHMENT_NOT_POWERED` |
| Niet-machine ruis (accessoires + onderdelen) | 0 | 54 | +54 | Formeel geïsoleerd uit noemer |
| **Aangedreven machinekandidaten (noemer)** | **931** | **877** | **-54** | **Zuivering van noemer** |
| Opgeloste aangedreven machines | 401 | 401 | 0 | Geen nieuwe drive types |
| Onbekende aangedreven machines | 530 | 476 | -54 | Gedaald door noemerzuivering |
| **Dekkingspercentage** | **43,07%** | **45,72%** | **+2,65%** | **Zuivere noemercorrectie** |

> **Belangrijk:** De stijging van het dekkingspercentage met +2,65% is zuiver het gevolg van een noemercorrectie (`DENOMINATOR_CORRECTION`), **niet** van nieuwe aandrijvingsresoluties.

---

## 5. Publieke Exposure Audit (54 Ruis-records)

- **Publieke modelpagina's:** 0 / 54 (geen enkel ruisrecord heeft een URL of modelpagina in de `models` tabel)
- **Sitemap URLs:** 0 / 54 (geen enkel ruisrecord staat in `sitemap.xml`)
- **Gestructureerde data (JSON-LD):** 0 / 54
- **Zoekresultaten:** Geen standalone machine-blootstelling; uitsluitend onderdelenschema's blijven toegankelijk.

---

## 6. Catalogus-, SEO- en Commerciële Invarianten

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
