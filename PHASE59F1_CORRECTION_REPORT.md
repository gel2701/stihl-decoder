# STIHLDECODER — PHASE 59F.1 REPORT
## Correct Incorrect Match & Prepare Immediate Activation

**Repository:** `gel2701/stihl-decoder`
**Datum:** 3 november 2026
**Baseline main commit:** `4b29997f77a7e89fee4e2d8449e57bfd2d7a1627`
**Branch:** `fix/phase59f1-correct-match-and-prepare-activation`  
**Status:** MISMATCHES CORRECTED & SUSPENDED | BOSCH USR7AC READY FOR ACTIVATION | PRODUCTION LOCK PRESERVED

---

### 1. Urgente Correctie: STIHL `0000 400 7025`

Onderzoek van officiële STIHL-onderdelenlijsten en primaire dealerbronnen (o.a. Sandbysmeden's officiële BR 700 & BR 200 onderdelenboeken) toont onomstotelijk aan:
- **Officiële STIHL-definitie:** `0000 400 7025` is de officiële fabriekscode voor **STIHL ZK C 10 — verpakking van 10 stuks bougies** (`1=10 Stk`).
- **Primaire referentiebron:** [Sandbysmeden STIHL BR 700 IPL](https://www.sandbysmeden.dk/wp-content/uploads/2023/09/Stihl-BR-700.pdf), Sectie Ontsteking / Zündanlage.
- **Kandidaat-ASIN:** `B07RHQ5FR4` is een **enkelstuks (1 pc)** verpakking van de NGK CMR7H (Stock No. `3066`).

#### Vastgestelde Fout & Afkeuring:
1. **Aantalsfout (Quantity Mismatch):** `0000 400 7025` betreft een werkplaatsverpakking van 10 stuks. ASIN `B07RHQ5FR4` levert 1 losse bougie.
2. **Model- en Hittegraadfout (Model Mismatch):** STIHL ZK C correspondeert met warmtegraad 6 (conform NGK CMR6H, standaard op BR 700 / BR 200), niet met CMR7H (warmtegraad 7).

#### Doorgevoerde Maatregelen:
- Match permanent gemarkeerd als `INCORRECT_MATCH_CONFIRMED`.
- Status in alle Phase 59F/59F.1 manifesten en `VerifiedOfferRegistry` gezet op `SUSPENDED`.
- Directe ASIN-activering is contractueel en programmatisch geblokkeerd via `isKnownPartNumberMismatch`.
- Onderdeel valt fail-closed direct terug op de conforme zoekfallback: `https://www.amazon.nl/s?k=STIHL+0000+400+7025&tag=srihldecoder2-21`.
- **Behoud van de Onderzoekskandidaat:** NGK CMR7H (`B07RHQ5FR4`) blijft behouden in de onderzoeksbacklog voor koppeling zodra een authentieke enkelstuks STIHL-referentie is gevalideerd.

---

### 2. Forensische Controle van de Overige Twee Kandidaten

#### A. Kandidaat: STIHL `0000 642 1223` → Oregon 18720 (`B000IBWVWG`) — **AFGEWEZEN & GESUSPENDEERD**
Er is een diepgaande technische verificatie uitgevoerd van tandsteek, tandenaantal, spline-type en machineconfiguraties:

- **STIHL `0000 642 1223` Technische Specificaties:**
  - Tandsteek (Pitch): 3/8" (0.375")
  - Aantal tanden: 7 tanden (7T)
  - **Spline-type:** **Standard 7-Spline (SD7)** — binnendiameter ca. 22.2 mm (7/8").
  - **Compatibele machines:** Professionele motorkettingzagen met Standard Spline koppelingstrommel: 034 Super, 036, 038, 044, 046, 064, 066, MS 341, MS 360, MS 361, MS 362, MS 400, MS 440, MS 441, MS 460, MS 461, MS 462, MS 500i, MS 650, MS 660, MS 661.
- **Oregon 18720 Technische Specificaties (ASIN `B000IBWVWG`):**
  - Tandsteek (Pitch): 3/8" (0.375")
  - Aantal tanden: 7 tanden (7T)
  - **Spline-type:** **Small 7-Spline (SM7)** — binnendiameter ca. 19.0 mm (3/4").
  - **Compatibele machines:** Compacte/middenklasse zagen met Small Spline trommel (028, 029, 039, MS 290, MS 310, MS 390 met 3/8" conversie).

#### Vastgestelde Fout & Afkeuring:
- **Fysieke Spline-incompatibiliteit:** Oregon 18720 heeft een Small Spline (19 mm) en **past fysiek niet** op de Standard Spline trommel (22 mm) van STIHL `0000 642 1223`.
- **Echte Equivalenten:**
  - De werkelijke Oregon-vervanger voor STIHL `0000 642 1223` is **Oregon 68210** (Standard 7-Spline SD7).
  - De werkelijke STIHL-referentie voor Oregon 18720 is **STIHL `0000 642 1249`** (Small 7-Spline SM7).

#### Doorgevoerde Maatregelen:
- Match `0000 642 1223` → Oregon 18720 (`B000IBWVWG`) gemarkeerd als `INCORRECT_MATCH_CONFIRMED`.
- Status gezet op `SUSPENDED`. Directe ASIN-activering geblokkeerd via `isKnownPartNumberMismatch`.
- Valt fail-closed terug op zoekfallback: `https://www.amazon.nl/s?k=STIHL+0000+642+1223&tag=srihldecoder2-21`.
- Oregon 18720 behouden in de onderzoeksbacklog voor koppeling aan STIHL `0000 642 1249`.

---

#### B. Kandidaat: STIHL `0000 400 7009` → Bosch USR7AC (`B09QH68W83`) — **100% GEVERIFIEERD & KLAAR VOOR ACTIVATIE**

- **STIHL Referentie:** `0000 400 7009` (`[NO LONGER AVAILABLE] Stihl Spark Plug Bosch Usr7Ac` in canonieke catalogus).
- **Fabrikant:** Robert Bosch GmbH (Tier-1 OEM eerste montage leverancier).
- **Fabrikant MPN:** `0 242 035 503` / `0242035503`.
- **Korte Handelsaanduiding:** `USR7AC` (Bestelnummer: `79169`).
- **EAN / GTIN:** `4047023059468`.
- **Uitvoering & Specificaties:** Compactbougie, schroefdraad M10 x 1.0 mm, schroefdraadlengte 12.7 mm, sleutelwijdte Hex 16 mm, geïntegreerde 10 kOhm ontstoringsweerstand.
- **Verpakkingseenheid:** 1 stuk (individuele vouwdoos).
- **ASIN:** `B09QH68W83` op Amazon.nl.
- **Compatibiliteit:** STIHL compacte machines met Bosch USR7AC specificatie: heggenscharen HS 45, HS 81, HS 86, bosmaaiers FS 38, FS 45, FS 55, combimotoren KM 55.
- **Two-Gate Status:** **Gate 1: PASS, Gate 2: PASS**.
- **Conclusie:** Dit is de **enige kandidaat** uit de uitbreidingspool die 100% waterdicht is bewezen en activeringsklaar klaarstaat.

---

### 3. Activering- en Beveiligingsstatus

1. **Behoud van de Drie Live Pilot-Aanbiedingen:**
   - `1110 400 7005` → Bosch WSR6F (`B0068M5NAG`) — **LIVE ACTIVE**
   - `0000 400 7000` → NGK BPMR7A (`B001RM8J76`) — **LIVE ACTIVE**
   - `0000 400 7011` → NGK CMR6H (`B001RMA5S2`) — **LIVE ACTIVE**
2. **Productielock Strikt Actief:**
   - `max_active_offers_allowed: 3`
   - `pilot_activated_parts: ["11104007005", "00004007000", "00004007011"]`
   - Er is **geen nieuwe ASIN geactiveerd** in productie.
3. **Status van de Pool (28 Onderdelen):**
   - **3 ACTIVE:** De live pilot-bougies.
   - **1 VERIFIED:** Bosch USR7AC (`0000 400 7009` → `B09QH68W83`), wachtend op expliciet akkoord van de operator.
   - **2 SUSPENDED:** `0000 400 7025` (aantalsfout) en `0000 642 1223` (spline-type fout), geblokkeerd en op zoekfallback.
   - **22 STAGED:** Compatibiliteit geverifieerd, in staging met zoekfallback.
4. **Zoekfallback & Affiliate-Integriteit:**
   - Alle 18.370 overige onderdelen en de 24 niet-actieve kandidaten behouden hun conforme zoekfallback met tag `srihldecoder2-21`.

---

### 4. Testresultaten

- **85 Productietestsuites:** 100% PASS (`node tests/run_current_production_tests.js`).
- **31 Playwright Browser E2E Journeys:** 100% PASS (`npx playwright test`).
- **Affiliate Link Audit:** 100% PASS (`node scripts/audit_amazon_affiliate_links.mjs`).
- **Public Trust Audit:** 100% PASS (5.086/5.086 routes HTTP 200, `node scripts/audit_public_trust_claims.mjs`).
- **Dedicated Phase 59F.1 Test Suite:** 100% PASS (`node tests/phase59f1_match_correction.test.js`).
- **Git Diff & Whitespace Verification:** 100% PASS (`git diff --check`).
