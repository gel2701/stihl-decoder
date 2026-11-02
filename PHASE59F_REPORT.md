# STIHLDECODER — PHASE 59F REPORT
## Amazon Affiliate Scaling — First 25 Additional Verified Offers

**Repository:** `gel2701/stihl-decoder`  
**Datum:** 2 november 2026  
**Baseline main commit:** `4f8bad660e7d347c4fd5f97546fa9d05307b4a34`  
**Feature Branch:** `feat/phase59f-amazon-affiliate-scaling`  
**Status:** EVIDENCE VERIFIED & STAGED (PRODUCTION LOCK PRESERVED — READY FOR APPROVAL)

---

### 1. Doel & Samenvatting van Phase 59F

Het doel van Phase 59F is het gecontroleerd opschalen van de werkende Amazon affiliate-implementatie van **3 actieve pilot-aanbiedingen** naar een pool van **28 geverifieerde productaanbiedingen**, met behoud van de bestaande architectuur en strikte Two-Gate verificatie.

**Kernprincipes:**
1. **Behoud van de Werkende Pilot:** De drie live pilot-ASINs (`1110 400 7005`, `0000 400 7000`, `0000 400 7011`) blijven 100% ongewijzigd, actief en functioneel op productie.
2. **Geen Ongeautoriseerde Productie-Activering:** Er worden in deze fase géén nieuwe ASINs live gezet zonder expliciete toestemming van de operator (`max_active_offers_allowed: 3`, `pilot_activated_parts` strikt beperkt tot de 3 pilot-onderdelen).
3. **Actief Bewijsherstel:** 25 aanvullende onderdelen zijn grondig onderzocht. Promotie vindt alleen plaats bij waterdicht bewijs van compatibiliteit (Gate 1) én actuele Amazon.nl productidentiteit/verpakkingseenheid (Gate 2).
4. **Zoekfallback Behoud:** Alle overige 18.370 onderdelen en alle gestagete onderdelen behouden 100% compliant zoekfallback met tag `srihldecoder2-21`.

---

### 2. Status van de Drie Live Pilot-Aanbiedingen

Vóór aanvang van Phase 59F is de live productie-status op `main` geauditeerd:
- `1110 400 7005` → Bosch WSR6F (`B0068M5NAG`): **LIVE ACTIVE**
- `0000 400 7000` → NGK BPMR7A (`B001RM8J76`): **LIVE ACTIVE**
- `0000 400 7011` → NGK CMR6H (`B001RMA5S2`): **LIVE ACTIVE**

Alle 3 aanbiedingen bevatten direct de parameter `tag=srihldecoder2-21`, `rel="sponsored nofollow noopener"`, `target="_blank"`, zonder redirects en met werkende client-side click-telemetrie (`part_commercial_click`).

---

### 3. Selectie van de 25 Aanvullende Onderdelen

De selectie van 25 onderdelen volgt strikt de prioriteiten uit de specificatie:
- **13 Backlog-kandidaten** uit Phase 59D met status `PART_COMPATIBILITY_VERIFIED`.
- **12 Onderhoudsonderdelen met Hoge Vraag** geselecteerd uit de canonieke catalogus op basis van fitment-breedte en onderhoudsfrequentie:
  - *Bougies:* `0000 400 7009` (Bosch USR7AC)
  - *Luchtfilters:* `1141 120 1600` (MS 261 fleece filter), `4180 141 0300` (FS 90/100/130), `4140 124 2800` (FS 38/45/55), `4229 120 1800` (BG 55/85)
  - *Brandstoffilters:* `0000 350 0533` (Pick-up body klein 6mm), `0000 350 0525` (Pick-up body vilt)
  - *Aandrijving & Tandwielen:* `0000 642 1223` (Rim sprocket 3/8" 7T small spline), `0000 642 1240` (Rim sprocket .325" 8T), `3636 000 0050` (Picco Micro 3 ketting 50DL), `3610 000 0044` (Picco Micro Mini 3 44DL)
  - *Startmechanisme:* `1125 195 7200` (Starterpawl / Klink), `1123 195 0400` (Starter rope 3.0mm)

---

### 4. Resultaten Forensisch Bewijsherstel

Alle 25 kandidaten zijn gedocumenteerd in `PHASE59F_MATCH_EVIDENCE.json` en beoordeeld via Two-Gate verificatie:

#### A. 3 Nieuw Geverifieerde Kandidaten (Gereed voor Activeringsgoedkeuring)

Deze drie kandidaten voldoen 100% aan Gate 1 én Gate 2 (enkelstuks verpakking, stabiele EAN/GTIN, consistente Amazon.nl identiteit):

1. **STIHL `0000 400 7025` → NGK CMR7H (ASIN `B07RHQ5FR4`)**
   - **Productidentiteit:** NGK Zündkerze CMR7H (Stock No. `3066`, EAN `0087295130667`, schroefdraad M10x1.0, SW 16).
   - **Verpakking:** 1 stuk (individuele vouwdoos).
   - **Fitment:** STIHL 4-MIX motoren: FS 90, FS 100, FS 110, FS 130, HT 101, HT 131, KM 90, KM 130.
   - **Classificatie:** `OEM_SUPPLIER_EQUIVALENT` (Tier-1 OEM leverancier).
   - **Two-Gate Status:** Gate 1: PASS, Gate 2: PASS. Status: `VERIFIED`.

2. **STIHL `0000 400 7009` → Bosch USR7AC (ASIN `B09QH68W83`)**
   - **Productidentiteit:** Bosch Bougie USR7AC (MPN `0 242 035 503` / `0242035503`, EAN `4047023059468`, compact SW 16).
   - **Verpakking:** 1 stuk (individuele doos).
   - **Fitment:** STIHL heggenscharen & bosmaaiers: HS 45, HS 81, HS 86, FS 38, FS 45, FS 55.
   - **Classificatie:** `OEM_SUPPLIER_EQUIVALENT` (Tier-1 OEM leverancier).
   - **Two-Gate Status:** Gate 1: PASS, Gate 2: PASS. Status: `VERIFIED`.

3. **STIHL `0000 642 1223` → Oregon 18720 (ASIN `B000IBWVWG`)**
   - **Productidentiteit:** Oregon Power Mate Rim Sprocket 3/8" Pitch 7-Teeth Small Spline (SD7, MPN `18720`, UPC `036577003489`, EAN `5400182633457`).
   - **Verpakking:** 1 stuk.
   - **Fitment:** STIHL kettingzagen met kleine spiebaan: 024, 026, 028, MS 260, MS 261, MS 270, MS 271, MS 280.
   - **Classificatie:** `MANUFACTURER_AFTERMARKET` (A-merk gecertificeerd zaaggereedschap).
   - **Two-Gate Status:** Gate 1: PASS, Gate 2: PASS. Status: `VERIFIED`.

#### B. 22 Gestagete Kandidaten (`PART_COMPATIBILITY_VERIFIED`, Status `STAGED`)

Voor de overige 22 onderdelen is STIHL-compatibiliteit (Gate 1) 100% bevestigd, maar faalt Gate 2 conform de voorwaarden voor directe ASIN-activering:
- Veel ketting- en filteraanbiedingen op Amazon.nl worden aangeboden door 3rd-party verkopers in wisselende multi-packs (bijv. 2-pack, 5-pack) of gecombineerde onderhoudssets.
- Het toewijzen van een directe productlink naar een variabele multi-pack schendt het transparantiebeginsel (eindgebruiker verwacht 1 specifiek onderdeelnummer).
- **Besluit:** Deze 22 onderdelen blijven strikt in `status: "STAGED"` en behouden de betrouwbare Amazon-zoekfallback met tag `srihldecoder2-21`.

Overzicht van de 22 gestagete onderdelen:
`0000 350 3502`, `1117 640 3800`, `0000 642 1234`, `0000 642 1236`, `1118 195 3500`, `0000 195 8200`, `4282 141 0300`, `1123 640 7102`, `1123 120 1613`, `1130 124 0800`, `1123 640 3200`, `1141 120 1600`, `0000 642 1240`, `3636 000 0050`, `3610 000 0044`, `4180 141 0300`, `4140 124 2800`, `4229 120 1800`, `0000 350 0533`, `0000 350 0525`, `1125 195 7200`, `1123 195 0400`.

---

### 5. Conversie- & Telemetriebaseline (`PHASE59F_CONVERSION_BASELINE.md`)

De actuele productie-telemetrie uit `data/stihl_database.db` (130.961 geregistreerde events) is geanalyseerd:
- **Totaal unieke events:** 130.961
- **Onderdeelpagina-weergaven (`part_page_view`):** 60.883
- **Onderdeelzoekacties (`part_search`):** 62.358
  - Met resultaten: 59.508
  - Zonder resultaten (zero-result): 221 (slechts 4,79% van alle distincte zoekopdrachten)
- **Commerciële outbound clicks (`part_commercial_click`):** 0 (pilot is pas net live; dit vormt de zuivere nulmeting).
- **Commerciële integriteit:** Conform contractuele regels worden géén conversie- of commissieclaims gedaan zonder officiële Amazon Associates Central exportrapporten.

---

### 6. Technische Borging & Productiebeveiliging

1. **Manifest Pariteit (`PHASE59F_ACTIVATION_CANDIDATES.json`):**
   - Bevat exact 28 aanbiedingen (3 `ACTIVE`, 3 `VERIFIED`, 22 `STAGED`).
   - `policy.max_active_offers_allowed: 3`
   - `policy.pilot_activated_parts: ["11104007005", "00004007000", "00004007011"]`
2. **Productielock Gehandhaafd:**
   - In runtime resolveert `VerifiedOfferRegistry` uitsluitend de 3 geautoriseerde pilot-onderdelen naar directe ASINs.
   - De 3 nieuw geverifieerde kandidaten resolven op productie nog als zoekfallback totdat de operator expliciet akkoord geeft.
3. **Sandbox Simulatie:**
   - Geïsoleerde test in `tests/phase59f_amazon_scaling.test.js` bewijst dat bij verhoging van de cap naar 6 en toevoeging aan de whitelist, alle 6 aanbiedingen direct en foutloos resolven naar directe ASINs met onmiddellijke rollback-mogelijkheid.
4. **Onveranderde Productie-Invarianten:**
   - Exact 18.373 canonieke onderdelen.
   - Exact 843 indexeerbare SEO-onderdelenpagina's.
   - Exact 1.024 sitemap URLs.
   - Affiliate-tag `srihldecoder2-21` universeel actief.

---

### 7. Testresultaten

- **79 Productietestsuites:** 100% PASS (`node tests/run_current_production_tests.js`).
- **19 Playwright Browser Journeys:** 100% PASS (`npm run test:e2e`).
- **Affiliate Link Audit:** 100% PASS (`node scripts/audit_amazon_affiliate_links.mjs`).
- **Public Trust Audit:** 100% PASS (`node scripts/audit_public_trust_claims.mjs`).
- **Git Diff Check:** Schoon (geen whitespace- of line-ending fouten).

---

### 8. Aanbeveling voor Volgende Stap (Phase 59F.1)

Zodra de operator akkoord geeft, kunnen de volgende drie extra aanbiedingen in productie worden geactiveerd:
- `0000 400 7025` → NGK CMR7H (`B07RHQ5FR4`)
- `0000 400 7009` → Bosch USR7AC (`B09QH68W83`)
- `0000 642 1223` → Oregon 18720 Rim Sprocket (`B000IBWVWG`)

Hiervoor hoeft uitsluitend `max_active_offers_allowed` verhoogd te worden naar 6 en de 3 onderdeelnummers toegevoegd te worden aan de whitelist. Tot die tijd blijft de productielock 100% intact.
