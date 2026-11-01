# STIHLDECODER — PHASE 59E.1 PRE-FLIGHT REPORT
## First Live Amazon ASIN Pilot — Controlled Launch Readiness

**Repository:** `gel2701/stihl-decoder`  
**Datum:** 1 november 2026  
**Baseline main commit:** `98d142e251a0bb1babb0de448917125efab6ae40`  
**Feature Branch:** `feat/phase59e1-first-live-amazon-asin-launch`  
**Status:** TECHNISCH GEREED & GETEST — **GEBLOKKEERD VOOR ACTIVATIE (WACHT OP EXPLICIETE GOEDKEURING)**

---

### 1. Welke van de Drie Aanbiedingen zijn Activeringsklaar?

Alle **3** onderzochte pilotkandidaten zijn 100% forensisch gecontroleerd en voldoen aan alle voorwaarden van de `TwoGateVerifier`:

1. **`1110 400 7005`** — Bosch WSR6F (`0242240506`) — ASIN `B0068M5NAG`: **ACTIVERINGSKLAAR**
2. **`0000 400 7000`** — NGK BPMR7A (`6703`) — ASIN `B001RM8J76`: **ACTIVERINGSKLAAR**
3. **`0000 400 7011`** — NGK CMR6H (`3365`) — ASIN `B001RMA5S2`: **ACTIVERINGSKLAAR**

Er zijn **0** mismatches of twijfelgevallen onder deze drie; geen enkele kandidaat hoeft te worden teruggestuurd naar staging.

---

### 2. Actuele Amazon-Productidentiteit & Corroboratie

| STIHL Onderdeel | Product & MPN | EAN / UPC | ASIN | Amazon.nl Productidentiteit & Specificaties |
| :--- | :--- | :--- | :--- | :--- |
| **`1110 400 7005`** | Bosch WSR6F (`0242240506`, bestelnr. 7547) | `3165141051063` | `B0068M5NAG` | **Bosch WSR6F Garden Tool Spark Plug**.<br>• M14x1.25 schroefdraad, 9.5 mm schroefdraadlengte, 19 mm zeskant.<br>• Enkelstuks blister/vouwdoos.<br>• Officiële eerste-montage specificatie voor o.a. STIHL MS 170, MS 180, MS 210, MS 230, MS 250, MS 260. |
| **`0000 400 7000`** | NGK BPMR7A (Stock No. `6703`) | `0087295167038` | `B001RM8J76` | **NGK 6703 BPMR7A Standard Spark Plug**.<br>• 14mm x 1.25, 98% zuivere koperen kern, ontstoord.<br>• Enkelstuks kartonnen doosje.<br>• Officiële standaardbougie voor STIHL tweetakt motoren. |
| **`0000 400 7011`** | NGK CMR6H (Stock No. `3365`) | `0087295133651` | `B001RMA5S2` | **NGK 3365 CMR6H Compact Spark Plug**.<br>• M10 x 1.0 schroefdraad, 12.7 mm lengte, 16 mm zeskant, 10 kOhm ontstoord.<br>• Enkelstuks fabrieksverpakking.<br>• Compacte bougie voor moderne STIHL 4-MIX en compacte zagen/bosmaaiers (o.a. MS 150, MS 201, FS 90, BR 500/600). |

*Affiliate Link Bestemmingen:*
- Bosch WSR6F: `https://www.amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21`
- NGK BPMR7A: `https://www.amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21`
- NGK CMR6H: `https://www.amazon.nl/dp/B001RMA5S2?tag=srihldecoder2-21`

---

### 3. Exacte Productieaanpassing (Wat er Verandert na Goedkeuring)

Na uw expliciete goedkeuring worden de volgende afgebakende stappen gezet:

1. **Manifest Statuswijziging (`PHASE59E_ACTIVATION_CANDIDATES.json`):**
   - De status van de 3 records wordt geüpdatet van `"VERIFIED"` naar `"ACTIVE"`.
   - `pilot_active` wordt `true` voor deze 3 onderdelen.
   - `production_activation_allowed` wordt `true` in het manifest.
   - `pilot_activated_parts` bevat exact: `["11104007005", "00004007000", "00004007011"]`.
2. **Runtime Code-Schakelaar:**
   - In `VerifiedOfferRegistry.js` wordt de productie-slot geactiveerd voor de geautoriseerde whitelist:
     `activeWhitelist: new Set(['11104007005', '00004007000', '00004007011'])`.
   - De cap van maximaal 3 actieve aanbiedingen (`MAX_PILOT_ACTIVE_OFFERS = 3`) blijft onwrikbaar gehandhaafd.
3. **Frontend Presentatie:**
   - Op de 3 betreffende onderdeelpagina's wijzigt de knop van *"Zoek op Amazon.nl"* naar een directe productknop met OEM-label: *"OEM-kwaliteit (Bosch)"* of *"OEM-kwaliteit (NGK)"*.
   - Alle andere 18.370 onderdelen blijven exact zoals nu: 100% universele zoekfallback via Amazon.nl zoekopdrachten met tag `srihldecoder2-21`.
4. **Geen Wijzigingen in:**
   - Canonieke database (18.373 onderdelen blijven bevroren).
   - SEO-tiers (843 indexeerbare pagina's en 1.024 sitemap URLs blijven bevroren).
   - Geen statische prijzen, geen voorraadclaims, geen redirects.

---

### 4. Rollback- en Kill-Switch Procedures (< 60 seconden)

Mocht Amazon.nl een ASIN wijzigen, uit voorraad raken of een kwaliteitsprobleem vertonen:

- **Niveau 1 (Individuele Uitval):**
  Aanroep van `registry.deactivateOffer(partNo, reason)` of toevoegen van het onderdeelnummer aan `SUSPENDED` schakelt direct (binnen milliseconden in runtime) terug naar de 100% zoeklink fallback voor dat onderdeel.
- **Niveau 2 (Granulaire Whitelist):**
  Het verwijderen van een onderdeelnummer uit `process.env.AMAZON_PILOT_ACTIVE_PARTS` of het manifest deactiveert uitsluitend dat specifieke onderdeel.
- **Niveau 3 (Algehele Pilot Kill-Switch):**
  Het zetten van `productionActivationAllowed = false` (of omgevingsvariabele `AMAZON_DIRECT_ASIN_ENABLED=false`) trekt in 1 keer alle directe ASIN-links in. Alle 18.373 onderdelen vallen ogenblikkelijk terug op zoeklinks.
- **Niveau 4 (Git Revert / Deploy Rollback):**
  Een `git revert` van de activatiecommit herstelt de huidige toestand in minder dan 60 seconden via de Render deploy-pijplijn.

---

### 5. Resultaten van Alle Tests & Simulaties

Alle validaties en contractcontroles zijn lokaal en end-to-end geslaagd:

- **`node tests/phase59e1_live_pilot_simulation.test.js`**:
  - `✔ 1. Forensic Verification of the 3 Pilot Candidates`: PASSED
  - `✔ 2. Default Fail-Closed State (0 Published ASINs in Runtime)`: PASSED
  - `✔ 3. Simulated Full Production Activation of All 3 Offers`: PASSED
  - `✔ 4. Granular Whitelist Simulation (Partial Activation)`: PASSED
  - `✔ 5. Universal Search Fallback Preserved for Non-Pilot Parts`: PASSED
  - `✔ 6. Runtime Safety Guard: Corrupted or Stale Record Fails Closed`: PASSED
  - `✔ 7. Reproducible Multi-Layer Rollback Execution`: PASSED
  - `✔ 8. Strict Production Invariant Freeze (18,373 parts, 843 SEO)`: PASSED
- **`node scripts/audit_amazon_affiliate_links.mjs`**: PASSED (0 ongecontroleerde links, 0 tag leaks, 18.373 search fallback links).
- **`node tests/phase56b_amazon_exact_match_pilot.test.js`**: 12/12 PASSED.
- **`node scripts/audit_public_trust_claims.mjs`**: PASSED (258 publieke pagina's, 5.086 HTTP 200 bestemmingen, 0 broken links).

---

### 6. Goedkeuringsvraag (Wacht op Expliciete Toestemming)

> [!IMPORTANT]
> **STOP — KLAAR VOOR PRODUCTIE-ACTIVATIE**
> 
> De simulaties, fallback-systemen en Two-Gate integriteit zijn 100% geverifieerd.
> 
> **Wilt u dat ik de eerste drie geverifieerde Amazon ASIN-productlinks activeer voor productie?**
> - Bosch WSR6F (`1110 400 7005` → ASIN `B0068M5NAG`)
> - NGK BPMR7A (`0000 400 7000` → ASIN `B001RM8J76`)
> - NGK CMR6H (`0000 400 7011` → ASIN `B001RMA5S2`)
