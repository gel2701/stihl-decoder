# STIHLDECODER — PHASE 59E REPORT
## First Verified Amazon ASIN Production Pilot

**Repository:** `gel2701/stihl-decoder`  
**Datum:** 1 november 2026  
**Baseline main commit:** `4bfcfdc34d89bbd692ae3c9cd444e88f2bfdae7d`  
**Feature Branch:** `feat/phase59e-first-verified-amazon-asin-pilot`  
**Status:** TECHNISCH VOORBEREID & GEVERIFIEERD (PRODUCTIE-ACTIVATIE STANDAARD UITGESCHAKELD)

---

### 1. Doel & Samenvatting van Phase 59E

Phase 59E bereidt de eerste gecontroleerde productieactivering van drie geverifieerde Amazon-productlinks voor StihlDecoder voor:
- **Bosch WSR6F** (`1110 400 7005` → ASIN `B0068M5NAG`)
- **NGK BPMR7A** (`0000 400 7000` → ASIN `B001RM8J76`)
- **NGK CMR6H** (`0000 400 7011` → ASIN `B001RMA5S2`)

**Cruciale waarborgen:**
1. **Standaard Uitgeschakeld:** In productie blijft de directe ASIN-koppeling standaard uitgeschakeld (`production_activation_allowed: false`, `pilot_active: false`). Er worden exact **0** ASIN-links getoond aan eindgebruikers; alle 18.373 onderdelen behouden hun universele zoekfallback.
2. **Geen Productie-Activering Zonder Toestemming:** Er is conform de instructie géén live ASIN-activatie uitgevoerd in deze fase.
3. **Bestaande Infrastructuur Hergebruikt:** Er is geen overbodige infrastructuur gebouwd; de bestaande `VerifiedOfferRegistry` en `TwoGateVerifier` zijn hergebruikt en uitgebreid met granulaire whitelist- en kill-switch voorzieningen.

---

### 2. Documentatiecorrectie (`PHASE59D2_CI_RECOVERY.md`)

In `PHASE59D2_CI_RECOVERY.md` was in sectie 4 abusievelijk een verouderde lijst van staged carburateur-/filternummers uit Phase 54 opgenomen. Deze is gecorrigeerd en sluit nu 1-op-1 aan op `PHASE59D_VERIFIED_OFFERS.json` en `PHASE59D1_PRODUCTION_READINESS.md`:

| Categorie | Aantal | Onderdelen | Classificatie | Status |
| :--- | :---: | :--- | :--- | :--- |
| **Geverifieerde Pilotkandidaten** | **3** | `1110 400 7005` (Bosch WSR6F), `0000 400 7000` (NGK BPMR7A), `0000 400 7011` (NGK CMR6H) | `OEM_SUPPLIER_EQUIVALENT` | `VERIFIED` (Staged voor pilot) |
| **Compatibiliteit Geverifieerd (Backlog)** | **13** | `0000 350 3502`, `1117 640 3800`, `0000 642 1234`, `0000 642 1236`, `1118 195 3500`, `0000 195 8200`, `4282 141 0300`, `1123 640 7102`, `1123 120 1613`, `1130 124 0800`, `1123 640 3200`, `1141 120 1600`, `0000 400 7025` | `PART_COMPATIBILITY_VERIFIED` | `STAGED` |
| **Mismatch Bevestigd (Afgewezen)** | **3** | `0000 350 3518` (Oregon 33-518 is Kohler ontstekingsspoel), `1123 640 2074` (Oregon 106114 is Husqvarna sprocket), `4238 140 1800` (Stens 605-385 is MS 260 filter) | `INCORRECT_MATCH_CONFIRMED` | `SUSPENDED` |

---

### 3. Forensische Verificatie van de Drie Pilotkandidaten

Iedere kandidaat is onderworpen aan onafhankelijke verificatie van fabrikantgegevens, EAN/GTIN-kruisreferenties, verpakkingseenheid en Amazon-productidentiteit:

#### Kandidaat 1: STIHL `1110 400 7005` → Bosch WSR6F (ASIN `B0068M5NAG`)
- **Productidentiteit:** Bosch Zündkerze WSR6F (Herstellernummer / MPN: `0 242 240 506` / `0242240506`, Bestelnummer: `7547`, EAN: `3165141051063`).
- **Verpakkingseenheid:** 1 stuk (blister / vouwdoos).
- **STIHL-Compatibiliteit:** Officiële STIHL standaardbougie voor kettingzagen 017, 018, 021, 023, 025, 026, MS 170, MS 180, MS 210, MS 230, MS 250, MS 260.
- **Amazon.nl Bestemming:** `https://www.amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21`.
- **Classificatie:** `OEM_SUPPLIER_EQUIVALENT` (Badge: `OEM-kwaliteit (Bosch)`).
- **Two-Gate Status:** **Gate 1: PASS, Gate 2: PASS**.

#### Kandidaat 2: STIHL `0000 400 7000` → NGK BPMR7A (ASIN `B001RM8J76`)
- **Productidentiteit:** NGK Standard Spark Plug BPMR7A (Stock No.: `6703`, MPN: `BPMR7A`, UPC/GTIN: `0087295167038` / `087295167038`).
- **Verpakkingseenheid:** 1 stuk (individuele NGK geel/zwarte doos).
- **STIHL-Compatibiliteit:** STIHL Quick Reference Guide primaire fabrieksbougie voor TS 400, TS 410, TS 420 doorslijpers en MS 290, MS 310, MS 390, 029, 039 kettingzagen.
- **Amazon.nl Bestemming:** `https://www.amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21`.
- **Classificatie:** `OEM_SUPPLIER_EQUIVALENT` (Badge: `OEM-kwaliteit (NGK)`).
- **Two-Gate Status:** **Gate 1: PASS, Gate 2: PASS**.

#### Kandidaat 3: STIHL `0000 400 7011` → NGK CMR6H (ASIN `B001RMA5S2`)
- **Productidentiteit:** NGK Compact Spark Plug CMR6H (Stock No.: `3365`, MPN: `CMR6H`, EAN/GTIN: `0087295133651` / `87295133651`, M10x1.0 schroefdraad).
- **Verpakkingseenheid:** 1 stuk (individuele compactdoos).
- **STIHL-Compatibiliteit:** Officiële STIHL compactbougie voor 4-MIX & 2-MIX motoren (o.a. MS 261, MS 271, MS 362, BR 500, BR 600, FS 90, FS 100, FS 130).
- **Amazon.nl Bestemming:** `https://www.amazon.nl/dp/B001RMA5S2?tag=srihldecoder2-21`.
- **Classificatie:** `OEM_SUPPLIER_EQUIVALENT` (Badge: `OEM-kwaliteit (NGK)`).
- **Two-Gate Status:** **Gate 1: PASS, Gate 2: PASS**.

> **Beperking & Beschikbaarheid:** Hoewel productidentiteit en STIHL-compatibiliteit 100% onafhankelijk zijn bewezen, garandeert dit niet dat Amazon.nl de voorraad te allen tijde gegarandeerd direct kan leveren. Daarom blijft de status strikt op `VERIFIED` (staged) en schakelt het systeem bij de minste frictie direct over naar zoekfallback.

---

### 4. Technische Implementatie & Beveiliging

1. **Pilot Manifest (`PHASE59E_ACTIVATION_CANDIDATES.json`):**
   - Bevat de 3 kandidaten met alle Two-Gate bewijsstukken, EAN/GTIN, MPN en veilige affiliate URLs.
   - `production_activation_allowed: false` en `pilot_active: false` garanderen dat er geen ongeautoriseerde activatie plaatsvindt.
2. **Granulaire Whitelist & Pilot Cap in `VerifiedOfferRegistry`:**
   - Ondersteunt `activeWhitelist` via code of de omgevingsvariabele `AMAZON_PILOT_ACTIVE_PARTS` (komma-gescheiden 11-cijferige onderdeelnummers).
   - `MAX_PILOT_ACTIVE_OFFERS = 3`: Pogingen om meer dan 3 aanbiedingen tegelijk te activeren falen direct closed.
3. **Multi-Layer Kill-Switch (`PHASE59E_ROLLBACK_PLAN.md`):**
   - Niveau 0: Instant methoden `registry.deactivateOffer(partNo)` en `registry.suspendOffer(partNo)` (0ms latentie).
   - Niveau 1: Whitelist omgevingsvariabele `AMAZON_PILOT_ACTIVE_PARTS`.
   - Niveau 2: Globale disarm `AMAZON_DIRECT_ASIN_ENABLED=false`.
   - Niveau 3: Configuratie git-commit.
4. **Compliance & UI Invarianten:**
   - Geen redirects: directe Amazon-links met `rel="sponsored nofollow noopener"`.
   - Geen automatische Amazon-navigatie.
   - Geen prijzen of voorraadclaims (`price: null`, `in_stock: null`).
   - Geen misleidende OEM-badges (`OEM-kwaliteit (Bosch/NGK)` conform OEM Brand Taxonomy).
   - Affiliate-tag `srihldecoder2-21` gewaarborgd.
   - Privacy-vriendelijke telemetrie via beacon `/api/affiliate/track`.

---

### 5. Test- en Auditresultaten van het Kooptraject

De nieuwe testsuite `tests/phase59e_pilot_activation.test.js` valideert het complete kooptraject:

```text
✔ Phase 59E — 1. Pilot Candidates Manifest Integrity
✔ Phase 59E — 2. Two-Gate Verification of All 3 Pilot Candidates
✔ Phase 59E — 3. Default Production Safety Lock (Zero Runtime ASINs)
✔ Phase 59E — 4. Controlled Simulation: Single Offer Activation
✔ Phase 59E — 5. Controlled Simulation: Granular Whitelist Enforcement
✔ Phase 59E — 6. Multi-Layer Kill-Switch & Immediate Rollback
✔ Phase 59E — 7. Pilot Limit Gate: Maximum 3 Active Offers
✔ Phase 59E — 8. OEM Brand Taxonomy & Non-Misleading Badging
✔ Phase 59E — 9. Server-Side Rendering (SSR) HTML Simulation
✔ Phase 59E — 10. Privacy-Conscious Telemetry & Beacon Contract
✔ Phase 59E — 11. Core Catalog and SEO Invariant Freeze
Total: 11 tests | 11 passed | 0 failed
```

---

### 6. Bescherming van Productie-invarianten

| Invariant | Norm | Gerealiseerd Resultaat | Status |
| :--- | :--- | :--- | :---: |
| **Canonieke Catalogus** | Exact 18.373 onderdelen | **18.373 onderdelen** | ✅ BEHOUDEN |
| **SEO Tier A Pagina's** | Exact 843 onderdelen | **843 onderdelen** | ✅ BEHOUDEN |
| **Sitemap URL's** | Exact 1.024 URL's | **1.024 URL's** | ✅ BEHOUDEN |
| **Runtime ASIN Links** | Exact 0 actieve links in runtime | `amazon_part_offers.json` heeft **0 offers** | ✅ BEHOUDEN |
| **Zoeklink Fallback** | 100% compliant zoeklinks | **18.373 zoeklinks actief** | ✅ BEHOUDEN |
| **Affiliate Tag** | `srihldecoder2-21` | **100% compliant toegepast** | ✅ BEHOUDEN |

---

### 7. Productie-configuratieaudit (Environment Audit)

In overeenstemming met de vereisten is een formele audit uitgevoerd naar de relatie tussen de verschillende omgevingsconfiguraties en beveiligingslagen:

#### A. Vergelijking van Omgevingsvariabelen & Beveiligingssloten
1. **`AMAZON_AFFILIATE_ENABLED`:**
   - Dit is de globale schakelaar voor het StihlDecoder Amazon Associates programma.
   - Wanneer `true`: het platform genereert Amazon-links conform het affiliatebeleid.
   - Standaard levert dit voor alle 18.373 onderdelen de 100% goedgekeurde zoekfallback-links op (`https://amazon.nl/s?k=STIHL+<query>&tag=srihldecoder2-21`).
   - Wanneer `false`: worden er in zijn geheel geen affiliate-uitingen getoond.
2. **`VerifiedOfferRegistry.productionActivationAllowed` (Code-niveau Lock):**
   - Dit is de fail-closed beveiligingspoort specifiek voor directe ASIN-productlinks.
   - Deze staat in productiecode **standaard hardcoded op `false`**.
   - Zolang deze vlag `false` is, retourneert `registry.getActiveOffer(partNo)` altijd `null`.
   - **Cruciaal:** Het uitschakelen van de directe ASIN-koppeling schakelt de bestaande affiliate-zoeklinks **NIET** uit. De `AffiliateOfferResolver` valt in dat geval onmiddellijk terug op `SEARCH_FALLBACK`. De inkomstenstroom en de dekking van alle 18.373 onderdelen blijven 100% intact.
3. **Render Hosting Omgeving:**
   - Op Render is momenteel geconfigureerd:
     - `AMAZON_AFFILIATE_ENABLED=true`
     - `AMAZON_ASSOCIATE_TAG=srihldecoder2-21`
   - Er zijn in deze fase **geen wijzigingen aangebracht** in de productie-omgevingsvariabelen op Render.

#### B. Vereiste Configuratie voor Toekomstige Activering (Runbook)
Zodra de gebruiker expliciet afzonderlijke toestemming verleent om de pilot live te zetten, zijn de volgende stappen vereist:
1. **Omgevingsvariabelen (optioneel voor whitelisting):**
   - `AMAZON_PILOT_ACTIVE_PARTS=11104007005,00004007000,00004007011`
2. **Applicatie-initialisatie:**
   - De resolver/registry instantieert met `productionActivationAllowed: true`.
   - `VerifiedOfferRegistry` controleert runtime Two-Gate verificatie en de `activeWhitelist`.
   - Slechts de maximaal 3 geautoriseerde bougies worden omgezet naar `DIRECT_ASIN`; alle overige 18.370 onderdelen blijven op `SEARCH_FALLBACK`.

---

### 8. Conclusie & Status voor Activering

- **Kandidaten gereed voor activatie:**
  1. `1110 400 7005` (Bosch WSR6F, ASIN `B0068M5NAG`)
  2. `0000 400 7000` (NGK BPMR7A, ASIN `B001RM8J76`)
  3. `0000 400 7011` (NGK CMR6H, ASIN `B001RMA5S2`)
- **Resterende blokkades:**
  - Expliciete, afzonderlijke toestemming van de gebruiker (human-in-the-loop) alvorens de vlaggen `AMAZON_DIRECT_ASIN_ENABLED` en `AMAZON_PILOT_ACTIVE_PARTS` in productie worden ingeschakeld.
- **Productie-activatie in deze PR:** **UITGESCHAKELD (0 ASINs actief)**.
- **Status Testsuites & E2E:** 77/77 productietests geslaagd (100%), 19/19 Playwright E2E browser tests geslaagd (100%), 0 auditschendingen.
