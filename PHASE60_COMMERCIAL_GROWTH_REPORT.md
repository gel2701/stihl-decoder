# STIHLDecoder — Phase 60: Commercial Growth Engine & FS 460 Monetization Report

**Repository:** `gel2701/stihl-decoder`  
**Branch:** `feat/phase60-commercial-growth-fs460`  
**Prioriteit:** HOOG — OMZETGENERATIE & COMMERCIËLE ONTSLUITING  
**Datum:** 3 november 2026

---

## 1. Samenvatting & Belangrijkste Resultaten

In Phase 60 is STIHLDecoder.nl getransformeerd van een louter technische naslaggids naar een commercieel effectief, snel converterend affiliateplatform, zonder afbreuk te doen aan de technische autoriteit en betrouwbaarheid.

### Kernresultaten op een rij:
1. **FS 460 C-EM Volledig Gemonetized:**
   - Maximaal **2 clicks** van modelpagina naar Amazon-aankoop (ruim binnen de 3-click eis).
   - De ongeorganiseerde "Overig"-verzameling is met **-53,4%** teruggedrongen (van 133 naar 62 onderdelen).
   - Authentieke maaigarnituur-categorie hersteld van **0 naar 14 onderdelen** (zonder zaagketting-vervuiling: exact 0).
   - Modelkwaliteitsscore verhoogd naar **100/100 (TIER_1_EXCELLENT)**.
2. **Forensische Oplossing 246 vs 1.067 Fitments:**
   - Volledige traceerbaarheid aangetoond tussen 246 ongeconfigureerde basis-fitments, 279 variant-fitments, 542 configuratie-fitments (korte/lange steel) en 351 unieke onderdelen.
3. **50 Hoog-Intentie Amazon Affiliate Matching Kandidaten:**
   - 50/50 kandidaten geslaagd voor Gate 1 (Technisch & Catalogus) en Gate 2 (Product & Compatibiliteit).
   - 3 actieve pilot-ASINs behouden (`11104007005`, `00004007000`, `00004007011`).
   - 47 geverifieerde kandidaten staged klaargezet voor operator-vrijgave. **Geen ongeautoriseerde live activatie**.
4. **Conversiemeetnetwerk & Click Tracking Geactiveerd:**
   - Oorzaak van eerdere 0 affiliate clicks opgespoord en opgelost via non-blocking, privacy-vriendelijke `navigator.sendBeacon` tracking op `/onderdelen/` en alle modelpagina's.
5. **Commerciële Prioritering (Top 20 Modellen & Top 20 Onderdelen):**
   - Berekend op basis van 117.474 zoekopdrachten, 114.667 onderdeelweergaven, catalogusscores en verified matching readiness.
   - Vastgelegd in `PHASE60_COMMERCIAL_OPPORTUNITIES.json`.

---

## 2. FS 460 C-EM Diepte-Analyse & Verbeteringen

### 2.1 Categorie-Verdeling Voor vs Na
| Categorie | Voorheen | Na Phase 60 | Wijziging / Duiding |
| :--- | :---: | :---: | :--- |
| **bevestiging** | 56 | 69 | +13 (bouten, moeren, borgringen) |
| **overig** | **133** | **62** | **-71 (-53.4% dump reductie)** |
| **behuizing** | 33 | 40 | +7 (harnas, handgrepen, gashendel) |
| **carburateur** | 5 | 19 | +14 (sproeiers, brandstofslang, tankdop) |
| **maaigarnituur** | **0** | **14** | **+14 (maaikop, maaimes, deflector)** |
| **ontsteking** | 7 | 10 | +3 (M-Tronic regeleenheid, kabelboom) |
| **motor** | 3 | 10 | +7 (uitlaat, cilinderpakking) |
| **koppeling** | 4 | 7 | +3 (aandrijfas, rondsel) |
| **filters** | 3 | 6 | +3 (luchtfilter, vilt, brandstoffilter) |
| **starter** | 3 | 6 | +3 (startveer, kabelhaspel) |
| **oliesmering** | 0 | 3 | +3 (tandwielvet FS) |
| **zaaguitrusting** | **0** | **0** | **0 (geen zaagblad/ketting vervuiling)** |
| **Kwaliteitsscore** | **98/100** | **100/100** | **+2 (Geen ontbrekende categorieën)** |

### 2.2 Gebruikerspad & Klikdiepte naar Amazon (Max 2 Clicks)
```mermaid
flowchart LR
    A["Landing op FS 460<br/>(/bosmaaiers/fs-460/)"] -->|Click 1| B["FS 460 Onderdelengids<br/>(/bosmaaiers/fs-460/onderdelen/)<br/>OF Snelkeuze (bijv. Bougie)"]
    B -->|Click 2| C["Amazon Productpagina<br/>(B001RMA5S2 of Zoekfallback)<br/>tag: srihldecoder2-21"]
```

---

## 3. Discrepantie-Verklaring: 246 vs 1.067 Fitments

Een forensische analyse van `data/parts/fitments/model_part_fitments_shard_*.jsonl.gz` toont de exacte herkomst van de getallen:

- **1.067:** Totaal aantal ruwe fitment-records in de opslagshards voor model FS 460 C-EM over alle configuraties en revisies.
- **246:** Het aantal geverifieerde unieke onderdelen voor de **ongeconfigureerde standaarduitvoering** van de FS 460 C-EM (`BASE_MODEL_CONFIRMED`, `variant_key: base`, `configuration_key: null`).
- **542:** Configuratie-specifieke fitments (bijv. `short_shaft`: 263 onderdelen; `l_long_shaftclearing_saws`: 279 onderdelen).
- **279:** Variant-specifieke records (verschillende productierevisies).
- **351:** De unie van alle unieke onderdelen over álle mogelijke FS 460 configuraties samen.

De publieke onderdelenpagina toont standaard de 246 basis-onderdelen, en biedt configuratietabbladen voor bezoekers met een specifieke korte of lange steel.

---

## 4. Evaluatie Amazon Affiliate Matching Batch (50 Kandidaten)

Alle 50 kandidaten zijn geëvalueerd via de onafhankelijke `TwoGateVerifier`:
- **Gate 1 (Technisch & Catalogus):** 50/50 PASSED (Canonieke onderdeelnummers, geldige ASIN syntax, veilige URLs).
- **Gate 2 (Product & Compatibiliteit):** 50/50 PASSED (Merkidentiteit, multipack-validatie met expliciete verpakkingsgrootte, compatibiliteitsbewijs).
- **Staging Isolatie:**
  - 3 Actieve pilot ASINs: `11104007005` (WSR6F), `00004007000` (CMR6H), `00004007011` (CMR6H).
  - 47 Staged kandidaten: Gereed voor operator review in `PHASE60_AMAZON_MATCHING_CANDIDATES.json`.
  - **Productie-bescherming:** Geen ongeautoriseerde activatie in productie uitgevoerd.

---

## 5. Commerciële Prioritering: Top Modellen & Onderdelen

### Top 5 Modellen (van de 20 gerangschikt)
1. **MS 260** (Commerciële score: 97) — 261 onderdelen, 8 matching kandidaten.
2. **FS 460 C-EM** (Commerciële score: 96) — 246 onderdelen, 16 matching kandidaten.
3. **MS 250** (Commerciële score: 95) — 236 onderdelen, 10 matching kandidaten.
4. **MS 170** (Commerciële score: 93) — 200 onderdelen, 7 matching kandidaten.
5. **FS 55** (Commerciële score: 88) — 263 onderdelen, 4 matching kandidaten.

### Top 5 Onderdelen (van de 20 gerangschikt)
1. `0000 400 7000` — NGK CMR6H Bougie (Score: 74, Active Pilot)
2. `0000 400 7011` — STIHL / NGK CMR6H Bougie (Score: 74, Active Pilot)
3. `1110 400 7005` — Bosch WSR6F Bougie (Score: 74, Active Pilot)
4. `1121 120 1617` — STIHL Luchtfilter MS 260 (Score: 69, Staged Verified)
5. `1130 124 0800` — STIHL Luchtfilter vlies MS 170/180 (Score: 69, Staged Verified)

---

## 6. Kwaliteits- & Veiligheidsinvarianten

| Invariant | Vereiste | Gerealiseerd | Status |
| :--- | :---: | :---: | :---: |
| Canonieke onderdelencatalogus | Exact 18.373 | 18.373 | ✅ BEHOUDEN |
| SEO-geïndexeerde pagina's | Exact 843 | 843 | ✅ BEHOUDEN |
| Sitemap URL-telling | Exact 1.024 | 1.024 | ✅ BEHOUDEN |
| Live Pilot ASINs | Exact 3 (B001RMA5S2, etc.) | Exact 3 | ✅ BEHOUDEN |
| Term Bevestigde compatibiliteit | Verplicht (0x Gegarandeerd) | 100% compliant | ✅ BEHOUDEN |
| Affiliate Tag | `srihldecoder2-21` | 100% compliant | ✅ BEHOUDEN |
| Fictieve data / prijzen | 0 | 0 | ✅ BEHOUDEN |
