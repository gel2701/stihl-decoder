# STIHLDECODER — PHASE 62 REPORT
## Fast Affiliate Scaling — From 3 Direct Links to a Commercial Catalog

**Repository:** `gel2701/stihl-decoder`  
**Branch:** `feat/phase62-fast-affiliate-scaling`  
**Datum:** 3 november 2026  
**Status:** **GEREED VOOR PRODUCTIE-REVIEW**

---

## 1. Commerciële Catalogusstatus (Aantallen per Niveau)

Phase 62 vereenvoudigt de commerciële funnel naar een heldere 3-niveau architectuur (`COMMERCIAL_TIERS`), geïmplementeerd in `src/affiliate/AmazonAffiliateProvider.js`, `src/affiliate/VerifiedOfferRegistry.js` en `src/search/IntelligentPartsSearchEngine.js`.

| Niveau | Definitie | Productielink | Aantal in Batch (100) | Aantal in Totale Catalogus (18.373) |
|---|---|---|---|---|
| **DIRECT_VERIFIED** | Volledige fysieke productidentiteit, EAN/GTIN, MPN en compatibiliteit bewezen via Two-Gate Verifier en goedgekeurd door operator. | Direct naar `/dp/<ASIN>?tag=srihldecoder2-21` | **3** (actieve pilot ASINs) | **3** |
| **TARGETED_SEARCH** | Canoniek STIHL-onderdeelnummer en genormaliseerde functienaam bekend. Gerichte Amazon-zoeklink zonder misleidende productclaims. | Naar `/s?k=STIHL+<onderdeelnummer>+<zoekwoorden>&tag=srihldecoder2-21` | **97** (inclusief 2 staged ready offers) | **18.370** |
| **INFORMATION_ONLY** | Onvolledige technische gegevens, tegenstrijdig bewijs of veiligheidsblokkade. Geen commerciële aanbieding getoond. | Geen uitgaande link | **0** (in deze gecureerde batch) | **0** (fail-closed fallback) |

### Categorieverdeling binnen de Eerste 100 Commerciële Onderdelen
De eerste batch van 100 onderdelen (`data/affiliate/commercial_catalog_100.json`) richt zich doelgericht op hoge omloopsnelheid en slijtage:
- **Filters (Lucht & Brandstof)**: 31 onderdelen
- **Starters (Touwen, Grepen, Veren, Klinken)**: 28 onderdelen
- **Carburateur (Pakkingsets, Membranen, Revisiesets)**: 14 onderdelen
- **Zaaguitrusting (Kettingen, Zaagbladen)**: 8 onderdelen
- **Ontsteking (Bougies)**: 5 onderdelen
- **Overig (Behuizing, Doppen)**: 5 onderdelen
- **Oliesmering (Wormwielen, Pompen)**: 3 onderdelen
- **Maaigarnituur (Maaikoppen, Maaidraad)**: 2 onderdelen
- **Koppeling (Tandwielen, Centrifugaalkoppelingen)**: 2 onderdelen
- **Bevestiging (Borgringen, Clips)**: 2 onderdelen

---

## 2. Status Officiële Amazon Catalogusdata (Creators API / PA-API)

Er is een formeel onderzoek uitgevoerd naar de beschikbaarheid en inzetbaarheid van de officiële Amazon Product Advertising API (PA-API v5) / Amazon Creators API:

1. **Toegangsvereisten**:
   - Vereist een actief Amazon Associates account dat ten minste 3 goedgekeurde verkopen (qualifying sales) heeft gegenereerd in de voorafgaande 180 dagen.
   - Vereist AWS IAM programmatic credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) en een gekoppelde Associate Tag.
   - Initiële API call limit is beperkt tot 1 request per seconde (1 TPS) met dynamische daglimieten gebaseerd op de gerealiseerde omzet (GMS) van de afgelopen 30 dagen.
2. **Huidige Status in Repository & Runtime**:
   - Geen PA-API credentials of Creator API tokens geconfigureerd in omgevingsvariabelen of plugins (`list_plugin_accounts` gerapporteerd 0 accounts).
   - Direct scrapen van `amazon.nl` / `amazon.de` is strikt verboden conform de Amazon Operating Agreement, `robots.txt` en de STIHLDecoder guardrails.
3. **Conclusie & Handeling**:
   - **Blokkade vastgesteld**: Conform de opdrachtinstructie ("Bij blokkades: direct door met TARGETED_SEARCH") schakelt het platform automatisch en fail-closed over naar **TARGETED_SEARCH** voor alle niet-gevalideerde ASINs.

---

## 3. Verbeterde Zoekquery-Structuur en Validatie

### Oorzaakanalyse Parameterafhandeling
In `IntelligentPartsSearchEngine.js` werd `buildSearchUrl(norm, partnerTag, partName)` aangeroepen waarbij `partName` als 3e argument werd meegegeven. `AmazonAffiliateProvider.buildSearchUrl` behandelde het 3e argument echter als `queryVariant` (`VARIANT_A` / `VARIANT_B`). Hierdoor werd de onderdeelnaam volledig genegeerd in zoekopdrachten.

### Technische Oplossing
1. **Flexibele Signature**:
   `buildSearchUrl(canonicalPartNumber, tag, variantOrOptions = null, extraOptions = {}, marketplace = this.marketplace)` accepteert nu naadloos zowel een variant-string, een onderdeelnaam-string, als een opties-object (`{ partName, queryVariant, mpn, replacedBy }`).
2. **Keyword Normalizer**:
   `extractTargetedSearchKeywords(rawPartName)` filtert merknamen ("stihl"), machinenamen ("ms 170", "fs 460"), stopwoorden ("voor", "van", "de", "het") en numerieke catalogusnummers weg, en selecteert maximaal **2 kernwoorden**.
3. **Validatie Prioritaire Filters**:
   - **MS 170 Luchtfilter (`1130 124 0800`)**:
     - Variant A: `STIHL 1130 124 0800 luchtfilter`
     - Variant B: `STIHL 11301240800 luchtfilter`
     - URL: `https://amazon.nl/s?k=STIHL+11301240800+luchtfilter&tag=srihldecoder2-21`
   - **FS 460 Luchtfilter (`4147 141 0300`)**:
     - Variant A: `STIHL 4147 141 0300 luchtfilter`
     - Variant B: `STIHL 41471410300 luchtfilter`
     - URL: `https://amazon.nl/s?k=STIHL+4147+141+0300+luchtfilter&tag=srihldecoder2-21`

---

## 4. Eerste 100 Geselecteerde Onderdelen met Classificatie

De volledige selectie is opgeslagen in `data/affiliate/commercial_catalog_100.json`. Alle 100 onderdelen zijn geverifieerd aanwezig in de canonieke 18.373 catalogusonderdelen (`parts_catalog.json`).

### Representatieve Steekproef uit de Batch:

| # | Onderdeelnummer | Benaming | Categorie | Doelmodellen | Commercieel Niveau | Status |
|---|---|---|---|---|---|---|
| 1 | `1110 400 7005` | Bougie Bosch WSR6F | Ontsteking | MS 170, MS 180, MS 260 | `DIRECT_VERIFIED` | Actieve pilot (`B0068M5NAG`) |
| 2 | `0000 400 7000` | Bougie NGK BPMR7A | Ontsteking | MS 170, MS 180, MS 250 | `DIRECT_VERIFIED` | Actieve pilot (`B001RM8J76`) |
| 3 | `0000 400 7011` | Bougie NGK CMR6H | Ontsteking | FS 460 C-EM, FS 410, MS 201 | `DIRECT_VERIFIED` | Actieve pilot (`B003CJIOVU`) |
| 4 | `0000 400 7009` | Bougie Bosch USR7AC | Ontsteking | BG 86, SH 86, FS 56 | `TARGETED_SEARCH` | Staged ready (`B09QH68W83`) |
| 5 | `0000 642 1240` | Kettingwiel 3/8 Picco 7T | Zaaguitrusting | MS 290, MS 310, MS 390 | `TARGETED_SEARCH` | Staged ready (`B000IBWVWG`) |
| 6 | `1130 124 0800` | Luchtfilter Vlies | Filters | MS 170, MS 180, 017 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 7 | `4147 141 0300` | Luchtfilter | Filters | FS 460 C-EM, FS 410, FS 490 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 8 | `0000 350 3500` | Brandstoffilter Zuigkop | Filters | MS 170, MS 180, MS 250 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 9 | `0000 350 3502` | Brandstoffilter Zuigkop | Filters | FS 460 C-EM, FS 410 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 10 | `4002 710 2169` | AutoCut 46-2 Maaikop | Maaigarnituur | FS 460 C-EM, FS 410 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 11 | `0000 930 2246` | Maaidraad Rond 2.7mm | Maaigarnituur | FS 460 C-EM, FS 410 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 12 | `1121 120 1617` | Luchtfilter HD | Filters | MS 260, 026 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 13 | `1141 120 1600` | Luchtfilter HD2 | Filters | MS 261, MS 261 C-M | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 14 | `1128 640 2000` | Kettingwiel Rondsel 3/8 | Zaaguitrusting | MS 440, MS 460 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 15 | `1128 190 3400` | ElastoStart Handgreep | Starter | MS 440, MS 460, MS 361 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 16 | `4238 140 1800` | Luchtfilter Hoofdelement | Filters | TS 410, TS 420 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 17 | `4238 140 4401` | Voorfilter Schuim | Filters | TS 410, TS 420 | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 18 | `1118 195 3500` | Starterklink Veerclip | Starter | 179 machinemodellen | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 19 | `0000 930 2208` | Startkoord 3.0mm x 30.5m | Starter | 77 machinemodellen | `TARGETED_SEARCH` | Doelgerichte zoeklink |
| 20 | `4140 195 3400` | Startgreep Standaard | Starter | 72 machinemodellen | `TARGETED_SEARCH` | Doelgerichte zoeklink |

---

## 5. Verificatie- en Mismatchresultaten

1. **Permanente Blokkade Historische Fouten**:
   - `0000 400 7025` (NGK CMR7H) → `B07RHQ5FR4` blijft permanent geblokkeerd en kan niet worden gepromoot of geactiveerd. In de batch blijft dit onderdeel geclassificeerd als zuivere `TARGETED_SEARCH`.
2. **3 Actieve Live Pilot ASINs (Geverifieerd Behouden)**:
   - `1110 400 7005`: Bosch WSR6F (`B0068M5NAG`), EAN 3165141051063.
   - `0000 400 7000`: NGK BPMR7A (`B001RM8J76`), EAN 0087295167032.
   - `0000 400 7011`: NGK CMR6H (`B003CJIOVU`), EAN 0087295133651.
3. **2 Staged Ready Offers (Klaargezet voor Operator-Review)**:
   - `0000 400 7009`: Bosch USR7AC (`B09QH68W83`), EAN 4047023059468. Voldoet aan Gate 1 & Gate 2; gehandhaafd in `TARGETED_SEARCH` totdat de operator de productie-activatie autoriseert.
   - `0000 642 1240`: Oregon 18720 (`B000IBWVWG`), EAN 0036577187208. Voldoet aan Gate 1 & Gate 2; gehandhaafd in `TARGETED_SEARCH` in afwachting van operator-activatie.

---

## 6. Meetresultaten en Commerciële Prestaties

De meting is uitgevoerd via `AffiliateIntelligence.js` op basis van first-party analytics events:

1. **Uitsluiting Testevents**:
   - Alle events met `is_test = 1` worden strikt uitgesloten van alle aggregaties en ratio's.
2. **Huidige Lokale SQLite Baseline**:
   - In de lokale snapshot van `stihl_database.db` zijn momenteel **0** reële uitgaande affiliate-klikken geregistreerd.
   - De gemeten Click-Through-Rate (CTR) per model en per onderdeel is derhalve `0.0%` (status `NOT_COMPUTABLE / ZERO_DENOMINATOR`).
3. **Google Search Console Zichtbaarheid Baseline**:
   - **FS 460**: 315 vertoningen, 0 klikken (CTR: 0,00%)
   - **MS 440**: 277 vertoningen, 2 klikken (CTR: 0,72%)
   - **MS 170**: 260 vertoningen, 5 klikken (CTR: 1,92%)
4. **Geen Fictieve Claims**:
   - Conform Invariant 4 worden geen fictieve verkopen, orders of commissiebedragen geclaimd. Deze data is uitsluitend via het officiële Amazon Associates rapport beschikbaar.

---

## 7. Volgende Commerciële Stappen

1. **Operator-Autorisatie voor de 2 Klaargezette Aanbiedingen**:
   - Vrijgave van `0000 400 7009` (Bosch USR7AC voor BG 86 / FS 56) en `0000 642 1240` (Oregon 18720 voor MS 290 Farm Boss) brengt het aantal actieve directe ASINs van 3 naar 5.
2. **Monitoring van Zoekquery-Prestaties op Amazon.nl**:
   - Analyseer via het Amazon Associates dashboard welke gerichte zoekopdrachten (bv. `STIHL 1130 124 0800 luchtfilter` vs `STIHL 4147 141 0300 luchtfilter`) tot effectieve mandplaatsingen leiden.
3. **Opschaling naar Volgende Golf Hoge-CTR Modellen**:
   - Breid de catalogus uit met onderdelen voor MS 211, MS 231, FS 90 en TS 500i zodra betrouwbare distributeurs-GTINs beschikbaar komen.

---

## 8. Productie-Invarianten Status

| Invariant | Vereiste Waarde | Gemeten Waarde | Status |
|---|---|---|---|
| Canonieke catalogusonderdelen | Exact 18.373 | 18.373 | **PASS** |
| SEO indexeerbare onderdelen | Exact 843 | 843 | **PASS** |
| Sitemap URL's | Exact 1.024 | 1.024 | **PASS** |
| Actieve live pilot ASINs | Exact 3 | 3 | **PASS** |
| Staged ready ASINs | Exact 2 | 2 | **PASS** |
| Affiliate partner-tag | `srihldecoder2-21` | `srihldecoder2-21` | **PASS** |
| Formuleringsgarantie | Geen "Gegarandeerd passend" | 0 voorkomens | **PASS** |
| Batch-dekking in canonieke catalogus | 100% (100/100) | 100/100 | **PASS** |
