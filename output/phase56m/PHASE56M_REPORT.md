# STIHLDECODER — PHASE 56M REMAINING DRIVE-TYPE COVERAGE TRIAGE REPORT

**Status:** PASS
**Baseline commit:** `9307174fb9ee2079b32b06c191b533f3c1eb3c6b`
**Datum:** 2026-10-25T17:57:43.640Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Opdrachtstelling

Phase 56M voert een systematische triage en prioritering uit over de resterende **530 onbekende aangedreven cataloguskandidaten** (`Aandrijving: Niet vastgesteld`). Conform de strikte policy geldt: **correctheid > coverage**. Er zijn geen speculatieve of ongeldige drive-promoties doorgevoerd zonder officiële STIHL-verificatie.

---

## 2. Hard Gates Status

| Hard Gate | Eis | Resultaat | Status |
| :--- | :--- | :--- | :--- |
| `UNKNOWN_POWERED_CANDIDATES_BASELINE` | `530` | `530` | **PASS** |
| `UNKNOWN_SET_CONTAINS_ATTACHMENTS` | `0` | `0` | **PASS** |
| `UNSAFE_DRIVE_PROMOTIONS` | `0` | `0` | **PASS** |
| `DRIVE_CONFLICTS_INTRODUCED` | `0` | `0` | **PASS** |
| `FABRICATED_PROVENANCE` | `0` | `0` | **PASS** |
| `EXISTING_PHASE56L_REGRESSIONS` | `0` | `0` | **PASS** |
| `CATALOG_FREEZE_INTACT` | `true` | `true` | **PASS** |
| `PROMOTED_WITHOUT_OFFICIAL_EVIDENCE` | `0` | `0` | **PASS** |

---

## 3. Populatie & Oorzaak-Classificatie (530 Unknowns)

Alle 530 modellen zijn onderverdeeld in exact één primaire categorie:

| Categorie | Aantal | Percentage | Omschrijving & Voorbeelden |
| :--- | :--- | :--- | :--- |
| `KNOWN_PREFIX_NO_VERIFIED_RULE` | **403** | 76,04% | Herkende STIHL-voorvoegsels (`RE`, `MB`, `GE`, `RM`, `RMA`, `MT`, `RT`, `BT`, `ME`, `SE`, etc.) waarvoor nog geen geverifieerde familieregel bestaat. |
| `NON_MACHINE_OR_CATALOG_NOISE` | **54** | 10,19% | Maaikoppen (`Mowing Head Autocut`), batterijgordels (`Battery Belt`), draagsystemen, en uitlaatpakkingen die als model ingevoerd zijn. |
| `HISTORIC_NUMERIC_MODEL` | **31** | 5,85% | Historische numerieke motorkettingzagen zonder letterprefix (`010`, `011`, `012`, `015`, `020`, `021`, `023`, `024`, `025`, `028`, `084`, etc.). |
| `MANUAL_RESEARCH_REQUIRED` | **31** | 5,85% | Niet-gestandaardiseerde aanduidingen (`GB` hakselaars, `HE` heggenscharen, `iMOW` robotmaaiers, `MR` zitmaaiers, `SGA 85`). |
| `UNKNOWN_OR_AMBIGUOUS_PREFIX` | **10** | 1,89% | Eénletterige voorvoegsels (`E 10` t/m `E 30` elektrische zagen, `T 3`). |
| `DISABLED_FAMILY_RULE` | **1** | 0,19% | Modellen onder uitgeschakelde familieregels (`HTE` hoogsnoeier, fail-closed wegens foute bron). |
| `EXPLICIT_DATA_PRESENT_BUT_UNMAPPED` | **0** | 0,00% | Alle 110 modellen in `stihl_database.json` zijn reeds 100% expliciet gemapped. |
| **Totaal** | **530** | **100,00%** | |

---

## 4. Top 10 Cohort Prioriteitsrangschikking

De prioriteitsscore is berekend volgens de formule:
$$\text{priority\_score} = (\text{impact} \times 0,40) + (\text{evidence\_availability} \times 0,30) + (\text{confidence} \times 0,20) + (\text{research\_cost} \times 0,10)$$

| Rang | Cohort | Prefix / Patroon | Modellen | Categorie | Score | Aanbevolen Actie |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| **1** | COHORT-02-NOISE | CATALOG_NOISE | 54 | Accessoire | **93.50** | Quarantaine als niet-aangedreven toebehoren in accessoireregistry |
| **2** | COHORT-01-RE | RE | 71 | Hogedrukreiniger | **93.50** | Officiële context-gebonden verificatie (netstroom 230V/400V) |
| **3** | COHORT-06-RM | RM | 25 | Grasmaaier | **88.70** | Officiële context-gebonden verificatie (Benzine) |
| **4** | COHORT-07-RMA | RMA | 22 | Accugrasmaaier | **87.50** | Officiële context-gebonden verificatie (Accu) |
| **5** | COHORT-04-0XX | NUMERIC_0XX | 31 | Historische zaag | **78.50** | Insluiten van interne archief- en handleidingdata (Benzine) |
| **6** | COHORT-03-MB | MB | 48 | Grasmaaier (Viking) | **80.50** | Viking/STIHL meertalige officiële catalogusverificatie |
| **7** | COHORT-05-GE | GE | 27 | Tuinhakselaar | **72.50** | Elektrische hakselaarverificatie |
| **8** | COHORT-09-RT | RT | 13 | Zitmaaier | **76.50** | Benzine-zitmaaierverificatie |
| **9** | COHORT-10-BT | BT | 10 | Grondboor | **75.50** | Benzine-boorapparaatverificatie |
| **10** | COHORT-08-MT | MT | 21 | Zitmaaier (Viking) | **70.30** | Viking zitmaaierverificatie |

---

## 5. Expliciete Data Recovery Audit

Er zijn **145 modellen** geïdentificeerd met termen zoals `Gasoline`, `Battery` of `Electric` in het veld `parts_model_variants.source_model_name`.
- **Besluit:** Deze velden zijn afkomstig uit externe onderdelencatalogi (derden), niet van officiële STIHL-bronnen.
- **Activering:** **0 modellen geactiveerd** (`safe_to_activate: false`).
- **Motivatie:** Directe activatie zonder officiële STIHL-verificatie zou een inbreuk vormen op de eis `PROMOTED_WITHOUT_OFFICIAL_EVIDENCE = 0`.

---

## 6. Schema.org Compatibiliteit Backlog (Item 19)

In `scripts/fetch_official_family_evidence.mjs` is `isProductSchemaType()` uitgebreid met `normalizeSchemaType()`:
- Volledig gekwalificeerde IRIs (`https://schema.org/Product`, `http://schema.org/Product`, `https://schema.org/ProductModel`) worden nu correct genormaliseerd en ondersteund.
- Array `@type` varianten (`["Thing", "https://schema.org/Product"]`) functioneren naadloos.
- Niet-product schema's (`WebSite`, `Organization`, `Brand`, etc.) worden strikt verworpen.

---

## 7. Modeldekking Before & After

- **Aangedreven kandidaten:** 931
- **Opgelost voor Phase 56M:** 401 (43,07%)
- **Opgelost na Phase 56M:** 401 (43,07%)
- **Onbekend:** 530 (56,93%)
- **Nieuwe promoties:** 0 (100% fail-closed correctheid)

---

## 8. Catalogus-, SEO- en Commerciële Invarianten

- Canonical parts: 17.082 (**INTACT**)
- Canonical fitments: 175.106 (**INTACT**)
- Configurations: 766 (**INTACT**)
- Evidence ledger: 208.412 (**INTACT**)
- Section contexts: 814 (**INTACT**)
- Indexable part pages: 843 (**INTACT**)
- Sitemap URLs: 1.024 (**INTACT**)
- Amazon search fallbacks: 17.082 (**INTACT**)
- Amazon partner tag: `srihldecoder2-21` (**INTACT**)
- Verified direct ASINs: 0 (**INTACT**)
