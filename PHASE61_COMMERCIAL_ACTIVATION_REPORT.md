# PHASE 61: Verified Affiliate Activation & Commercial Growth Report
**Repository:** `gel2701/stihl-decoder`  
**Baseline:** `feb130a0d4f5bc177068aea64e798d940427a812` (PR #102)  
**Date:** 3 November 2026  
**Status:** COMPLETE & VERIFIED  

---

## 1. Wat daadwerkelijk verbeterd is

1. **Permanente Quality Gate Naleving**:
   - Geen parallelle beveiligingssystemen gebouwd. Volledig gebruik gemaakt van de bestaande `TwoGateVerifier.js`, `GtinValidator.js`, `HistoricalMismatches.js` en `VerifiedOfferRegistry.js`.
   - `npm run test:gate` doorloopt 105 geauditeerde records over alle 5 affiliate-manifesten in **<25 ms** met 100% PASS.

2. **Systematische Candidate Audits voor Focusmodellen**:
   - **FS 460 C-EM** (`fs_460`): 246 canonieke catalogusonderdelen, 64 SEO-indexeerbare onderdelen. Actieve pilot bougie `0000 400 7011` (NGK CMR6H / `B001RMA5S2`) bevestigd. 9 gestagete kandidaat-aanbiedingen (Service Kit 41, filters, vet, messen) missen externe machine-verifieerbare ASIN-corroboratie en worden strikt conform de regels als `PART_COMPATIBILITY_VERIFIED` in veilige Amazon-zoekfallback gehouden.
   - **MS 440** (`ms_440`): 258 catalogusonderdelen, 61 SEO-indexeerbare onderdelen. Twee actieve pilot-bougies bevestigd (`1110 400 7005` Bosch WSR6F / `B0068M5NAG` en `0000 400 7000` NGK BPMR7A / `B001RM8J76`). Historische fout `0000 642 1223` -> Oregon 18720 / `B000IBWVWG` (Small Spline 19mm vs Standard Spline 22.2mm) permanent geblokkeerd; veilige zoekfallback behouden.
   - **MS 260** (`ms_260`): 261 catalogusonderdelen, 125 SEO-indexeerbare onderdelen. Twee actieve pilot-bougies bevestigd (`1110 400 7005` en `0000 400 7000`). Overige onderdelen blijven veilig in zoekfallback.
   - **MS 170** (`ms_170`): 200 catalogusonderdelen, 38 SEO-indexeerbare onderdelen. Actieve pilot-bougie bevestigd (`1110 400 7005`). Luchtfilters (`B079DLYRGL` STIHL / `B08F9ML1XY` Hipa) en slijtagedelen behouden de veilige zoekfallback.

3. **Verificatie van Doorklik- & Conversiemeting**:
   - Volledige end-to-end validatie van de eerstepartij, privacy-vriendelijke analytics pipeline (`/api/affiliate/track`, `AnalyticsTracker.trackEvent`, `AffiliateIntelligence.computeAffiliateIntelligence`).
   - Directe Amazon uitgaande navigatie (`rel="sponsored nofollow noopener"`) zonder tussenliggende 302-redirects. Clicks worden gedebounced en niet-blokkerend verwerkt via beacon/fetch payload.

4. **Nieuwe Canonical Test Suite**:
   - Geïmplementeerd in `tests/phase61_verified_affiliate_activation.test.js` (6 subtests).
   - Opgenomen in de canonieke productietest-runner (`tests/run_current_production_tests.js`).

---

## 2. Welke nieuwe ASINs onafhankelijk bewezen zijn

Twee kandidaat-aanbiedingen zijn onafhankelijk en machine-verifieerbaar bewezen via geauditeerde externe catalogi conform Gate 1 en Gate 2 van `TwoGateVerifier.js`:

| STIHL Onderdeel | Fabrikant / Type | ASIN | GTIN / EAN | Verpakking | Onafhankelijke Externe Bron | Two-Gate Status |
|---|---|---|---|---|---|---|
| **`0000 400 7009`** | Bosch USR7AC (0242035503) | `B09QH68W83` | `4047023059468` | 1 stuk (enkelstuks) | Motointegrator Automotive Catalogus (`motointegrator.de`) | **PASS (VERIFIED_STAGED_READY)** |
| **`0000 642 1240`** | Oregon 18720 (SM7 Small Spline 3/8" 7T) | `B000IBWVWG` | `0036577187202` | 1 stuk (enkelstuks) | Officiële Oregon Fitment Chart (`oregonproducts.com`) & Amazon Catalog | **PASS (VERIFIED_STAGED_READY)** |

---

## 3. Welke aanbiedingen klaarstaan voor operator-goedkeuring

Conform de strikte richtlijn (*"Geen nieuwe ASIN-links activeren zonder mijn toestemming"*) zijn deze bewezen aanbiedingen **niet** geactiveerd in de live runtime (`data/affiliate/verified_amazon_registry.json`). Zij staan gestaged en gereed in `PHASE60_1_VERIFIED_OFFERS.json` in afwachting van expliciete operator-autorisatie:

1. **Klaargezet voor goedkeuring**:
   - `0000 400 7009` → Bosch USR7AC (`B09QH68W83`) | Toepassing: BG 86, FS 56, SH 86, MS 150
   - `0000 642 1240` → Oregon 18720 (`B000IBWVWG`) | Toepassing: MS 290, MS 310, MS 390
2. **Huidige actieve live pilot links (onveranderd exact 3 stuks)**:
   - `1110 400 7005` → Bosch WSR6F (`B0068M5NAG`) [MS 440, MS 260, MS 170]
   - `0000 400 7000` → NGK BPMR7A (`B001RM8J76`) [MS 440, TS 420, MS 290, MS 390]
   - `0000 400 7011` → NGK CMR6H (`B001RMA5S2`) [FS 460 C-EM, BR 600, FS 360]
3. **Veilige zoekfallbacks**:
   - Alle overige 18.370 onderdelen behouden de veilige zoekfallback naar Amazon.nl met tag `srihldecoder2-21`.

---

## 4. Welke commerciële resultaten meetbaar zijn

Commerciële baseline per focusmodel op basis van **echte Google Search Console data** (periode 1 augustus t/m 31 oktober 2026) en **eerstepartij SQLite analytics**:

| Model | Machine Type | Catalogus Onderdelen | Indexeerbare SEO Onderdelen | GSC Vertoningen (1 aug - 31 okt) | GSC Organische Klikken | GSC CTR | Eerstepartij Paginaweergaven | Affiliate Klikken | Geverifieerde Directe Links (Live) | Staged Klaar voor Goedkeuring |
|---|---|---|---|---|---|---|---|---|---|---|
| **FS 460 C-EM** (`fs_460`) | Bosmaaier | 246 | 64 | 315 | 0 | 0,00% | 554 | 0 | 1 (`0000 400 7011`) | 0 |
| **MS 440** (`ms_440`) | Kettingzaag | 258 | 61 | 277 | 2 | 0,72% | 552 | 0 | 2 (`1110 400 7005`, `0000 400 7000`) | 0 |
| **MS 170** (`ms_170`) | Kettingzaag | 200 | 38 | 150 | 3 | 2,00% | 442 | 0 | 1 (`1110 400 7005`) | 0 |
| **MS 260** (`ms_260`) | Kettingzaag | 261 | 125 | 482 | 8 | 1,66% | 536 | 0 | 2 (`1110 400 7005`, `0000 400 7000`) | 0 |

*Alle cijfers zijn direct ontleend aan werkelijke metingen. Er zijn geen fictieve omzetcijfers of commissies berekend.*

---

## 5. Welke vervolgstap de meeste omzetkans biedt

1. **Operator-autorisatie en activatie van de 2 klaargezette aanbiedingen**:
   - Activatie van `0000 400 7009` (Bosch USR7AC) dekt direct de veelgebruikte tuinmachine-serie (BG 86 bladblazer en FS 56 bosmaaier).
   - Activatie van `0000 642 1240` (Oregon 18720) ontsluit directe aankopen voor de populaire MS 290 / Farm Boss-serie.
2. **FS 460 Zoekintentie & CTR-verbetering**:
   - FS 460 heeft met 315 vertoningen een aanzienlijke zichtbaarheid in Google, maar 0 klikken. Door in de modelnavigatie en interne links specifieke bosmaaier-intenties (AutoCut 46-2 maaikop, 2.7mm maaidraad, maaimessen en service kits) direct te koppelen aan de al actieve `0000 400 7011` bougie, ontstaat de snelste conversie van impressies naar doorkliks.
3. **Gerichte EAN/GTIN-verificatie voor hoogfrequente lucht- en brandstoffilters**:
   - Luchtfilters (zoals MS 170 `1130 124 0800` en FS 460 `4147 141 0300`) behoren tot de meest gezochte onderdelen. Zodra betrouwbare distributeurs (zoals Motointegrator of Kramp) ASIN-cross-references publiceren, kunnen deze via TwoGateVerifier direct worden klaargezet.

---

## 6. Productie-Invarianten Status

| Invariant | Vereiste Waarde | Gemeten Waarde | Status |
|---|---|---|---|
| Canonieke catalogusonderdelen | Exact 18.373 | 18.373 | **PASS** |
| SEO indexeerbare onderdelen | Exact 843 | 843 | **PASS** |
| Sitemap URL's | Exact 1.024 | 1.024 | **PASS** |
| Actieve live pilot ASINs | Exact 3 | 3 | **PASS** |
| Affiliate partner-tag | `srihldecoder2-21` | `srihldecoder2-21` | **PASS** |
| Formuleringsgarantie | Geen "Gegarandeerd passend" | 0 voorkomens | **PASS** |
