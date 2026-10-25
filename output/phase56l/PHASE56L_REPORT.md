# STIHLDECODER — PHASE 56L VERIFIED MODEL-FAMILY DRIVE-TYPE RESOLUTION REPORT

**Status:** PASS
**Baseline commit:** `40c76e21beac7474f60390741c28e674799815d2`
**Datum:** 2026-10-25T00:17:19.699Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Concrete Aanleiding

Op de modelpagina van **MS 211** verscheen voorheen:
`Aandrijving: Niet vastgesteld`

Dit werd veroorzaakt doordat MS 211 als onderdeelcatalogusmodel geen harde technische `fuel_type` of `power_source` attributen had in `stihl_database.json`.
Omdat MS 211 onomstotelijk behoort tot de officiële STIHL **MS**-familie (Motorsägen / benzinekettingzagen), lost Phase 56L dit generiek, provenance-aware en fail-closed op via de geverifieerde modelfamilieregels van STIHL.

---

## 2. Model Family Inventory & Prefix Classificatie

Er zijn in totaal **956 unieke STIHL-modellen** onderzocht in het volledige platform (database, parts catalogus, fitments).

- **Actief geverifieerde STIHL-families:** **28** families (MS, MSA, MSE, FS, FSA, FSE, FR, TS, TSA, HS, HSA, HSE, HL, HLA, HLE, HT, HTA, HTE, KM, KMA, BG, BGA, BGE, BR, SH, SHA, SHE, SR)
- **Ongeverifieerde / geisoleerde prefixes:** **67** prefixes (waaronder BRA, RM/RMA/RME/RMI, MB, ME, MA, RE, SE, etc.)
- **Prefix parsing:** Strict **longest-prefix-first** (bijv. MSA/MSE vóór MS, FSA/FSE vóór FS, TSA vóór TS, HSA/HSE vóór HS, BGA/BGE vóór BG).

---

## 3. Officiële STIHL Family Evidence & Provenance

Alle 28 actieve families zijn voorzien van volledige provenance:
- **Confidence:** HIGH
- **Source type:** `OFFICIAL_STIHL_FAMILY_EVIDENCE`
- **Bron URLs:** Officiële STIHL catalogi en handleidingendomeinen (`stihl.nl`, `stihl.com`)
- **Locators:** Geverifieerde categorie- en serieverwijzingen

### Belangrijkste familie-toewijzingen:
| Familie | Machine Type | Aandrijvingstype | Weergavelabel | Officiële STIHL Bron |
|---|---|---|---|---|
| **MS** | Kettingzaag | `PETROL` | Benzine | STIHL Motorsägen (MS) - Benzinekettingzagen |
| **MSA** | Kettingzaag | `BATTERY` | Accu | STIHL Accukettingzagen (MSA) - Lithium-Ion |
| **MSE** | Kettingzaag | `MAINS_ELECTRIC` | Elektrisch / netstroom | STIHL Elektrische kettingzagen (MSE) |
| **FS** | Bosmaaier | `PETROL` | Benzine | STIHL Benzinebosmaaiers en kantenmaaiers (FS) |
| **FSA** | Bosmaaier | `BATTERY` | Accu | STIHL Accubosmaaiers (FSA) |
| **TS** | Doorslijper | `PETROL` | Benzine | STIHL Benzinedoorslijpers (TS) |
| **TSA** | Doorslijper | `BATTERY` | Accu | STIHL Accudoorslijpers (TSA) |
| **BG** | Bladblazer | `PETROL` | Benzine | STIHL Handgedragen benzinebladblazers (BG) |
| **BGA** | Bladblazer | `BATTERY` | Accu | STIHL Accubladblazers (BGA) |

---

## 4. Acceptatietests & Verificatie

Alle acceptatiecases en negatieve controlegevallen zijn 100% geslaagd:

| Test Case | Verwachte Familie | Verwachte Aandrijving | Weergavelabel | Resolutiemethode | Status |
|---|---|---|---|---|---|
| **MS 211** | MS | `PETROL` | Benzine | `FAMILY_RULE` | **PASS** |
| **MSA 300** | MSA | `BATTERY` | Accu | `FAMILY_RULE` | **PASS** |
| **MSE 210** | MSE | `MAINS_ELECTRIC` | Elektrisch / netstroom | `FAMILY_RULE` | **PASS** |
| **FS 55** | FS | `PETROL` | Benzine | `FAMILY_RULE` | **PASS** |
| **FSA 120** | FSA | `BATTERY` | Accu | `FAMILY_RULE` | **PASS** |
| **TS 420** | TS | `PETROL` | Benzine | `FAMILY_RULE` | **PASS** |
| **TSA 230** | TSA | `BATTERY` | Accu | `FAMILY_RULE` | **PASS** |
| **BG 86** | BG | `PETROL` | Benzine | `FAMILY_RULE` | **PASS** |
| **BGA 30** | BGA | `BATTERY` | Accu | `FAMILY_RULE` | **PASS** |
| **BRA 100** | BRA | `UNKNOWN` | Niet vastgesteld | `UNVERIFIED_FAMILY` | **PASS** |
| **RM 248** | RM | `UNKNOWN` | Niet vastgesteld | `UNVERIFIED_FAMILY` | **PASS** |

> [!NOTE]
> Geen enkele motortechnologie-inferentie (zoals 2-takt of 4-MIX) wordt gedaan op basis van de familie; de regel resolveert uitsluitend het aandrijvingstype (`PETROL`, `BATTERY`, `MAINS_ELECTRIC`).

---

## 5. Precedentie & Conflicthantering

De precedentieketen is strikt geïmplementeerd:
1. **Expliciet modelbewijs** (`EXACT_MODEL_PROPERTY`)
2. **Officieel geverifieerde STIHL modelfamilieregel** (`FAMILY_RULE`)
3. **Fail-closed Onbekend** (`UNKNOWN` / `Niet vastgesteld`)

Indien expliciet bewijs strijdig zou zijn met de actieve familieregel, wordt het record in quarantaine geplaatst (`CONFLICT_QUARANTINED`).
- **Aantal gedetecteerde conflicten:** **0**
- **Aantal in quarantaine geplaatst:** **0**

---

## 6. Dekkingsresultaten (Before vs After)

| Metriek | Voor Phase 56L | Na Phase 56L | Delta |
|---|---|---|---|
| **Totale unieke modellen** | 956 | 956 | 0 |
| **Gedefinieerde aandrijving** | 110 (11.51%) | 400 (41.84%) | **+298** (+30.33%) |
| **Onbekend (`Niet vastgesteld`)** | 846 (88.49%) | 556 (58.16%) | **-298** |

### Verdeling na resolutie:
- **Benzine (`PETROL`):** 276 modellen
- **Accu (`BATTERY`):** 100 modellen
- **Netstroom (`MAINS_ELECTRIC`):** 24 modellen
- **Niet vastgesteld / ongeverifieerd (`UNKNOWN`):** 556 modellen

---

## 7. Catalogus- en SEO Freeze Invarianten

Alle strikte freeze-invarianten blijven 100% gehandhaafd:
- **Canonical parts:** 17.082 (intact)
- **Canonical fitments:** 175.106 (intact)
- **Diagram configuraties:** 766 (intact)
- **Evidence ledger records:** 208.412 (intact)
- **Diagram contexten:** 814 (intact)
- **Phase 56H diagram resoluties:** 344 (intact)
- **Phase 56J classificaties:** 110 (intact)
- **Indexable part pages:** 843 (exact intact, geen nieuwe promoties)
- **Sitemap URLs:** 1.024 (exact intact)
- **Amazon search fallback URLs:** 17.082 met production Associate Tag `srihldecoder2-21`
- **Verified ASIN mappings:** 0 (geen speculatieve ASINs)

---

## 8. Agent Routing & Compliance

- **9Router gebruikt:** Nee
- **Codex gebruikt:** Nee
- **Codex-review aangevraagd:** Nee
- **Uitvoeringsstatus:** Volledig conform de instructies.
