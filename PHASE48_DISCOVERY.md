# FASE 48 — AFFILIATE COMPATIBILITY DATASET & COMMERCIAL PILOT
## READ-ONLY DISCOVERY & ARCHITECTURAL INVENTORY

*Documentversie: 1.0.0 — Fase 48 Pre-Implementation Analysis*  
*Repository: gel2701/stihl-decoder*  
*Base commit: 4e16a0dee53639a76caee93a69fd02f8357444de (main)*

---

### 1. Inleiding & Doelstelling

Fase 48 bouwt de eerste evidence-driven commerciële laag voor STIHLDecoder.nl. De kern van deze fase is het verbinden van de drie lagen:
$$\text{Model Identity} \longrightarrow \text{Technical Compatibility} \longrightarrow \text{Commercial Offers}$$

**Fundamenteel principe:**  
> **COMMERCIAL OFFER MAG NOOIT TECHNICAL COMPATIBILITY BEPALEN.**  
> Technische compatibiliteit is een onafhankelijk, feitelijk gegeven dat uitsluitend rust op canonieke STIHL-brondocumentatie (handleidingen, onderdelenlijsten, publieke feiten). Een merchant of aanbieding levert alleen marktdata (titel, prijs, url), maar kan een compatibiliteitsstatus nooit verhogen, toekennen of overschrijven.

---

### 2. Inventarisatie van Bestaande Componenten

#### 2.1 Bestaande Compatibility Statussen
Gedefinieerd in [`src/modelRecommendations.js`](../src/modelRecommendations.js) en [`data/model_recommendation_schema.json`](../data/model_recommendation_schema.json):
- `VERIFIED_MODEL_COMPATIBILITY`: Hard bewezen op modelniveau via canonieke STIHL documentatie (`CANONICAL_VERIFIED` of `OFFICIAL_DOCUMENTED`).
- `SPECIFICATION_MATCH_ONLY`: Specificatie matcht op parameters, maar mist individueel model-specifiek documentbewijs of volledige zaagkettingconfiguratie (steek + groefbreedte zonder schakels).
- `GENERIC_CATEGORY_RECOMMENDATION`: Algemene categorieaanbeveling zonder unieke machinebinding (bv. 2-takt mengolie 1:50, zaagkettinghechtolie, gehoorbescherming).
- `UNVERIFIED`: Specificatie nog te controleren vóór aanschaf (geen betrouwbare specificatiematch).
- `CONFLICTED`: Officiële bronnen vermelden tegenstrijdige waarden (bv. verschillende revisies of marktvarianten).

#### 2.2 Bestaande Evidence Policy (Fase 47C Baseline)
Vastgelegd in [`src/publicEvidence.js`](../src/publicEvidence.js) en verankerd in [`src/modelRecommendations.js`](../src/modelRecommendations.js):
- **Canonical status vereist:** Fact moet voldoen aan `isPublicDisplayEligibleFact(ev) === true` én `isSingleValuePublicFact(ev) === true`.
- **Expliciete single-value geschiktheid:** `ev.single_value_eligible === true` (geen undefined of false).
- **Geen `source_class` override:** Een hoge bronklasse (`OFFICIAL_MANUAL`) kan een `UNKNOWN` of niet-canonieke status nooit promoveren.
- **Unit-aware matching:** Veld-canonieke eenheden worden strikt gevalideerd via `FIELD_CANONICAL_UNITS`. Een afwijkende eenheid (bv. `1.6 inch` voor `chain_gauge_mm`) resulteert in onmiddellijke afwijzing.
- **Configuration Isolation:** Individuele bewijsstukken voor zaagkettingen (`pitch`, `gauge`, `drive_links`) moeten aantoonbaar tot dezelfde configuratie behoren (`uniqueConfigs.size <= 1`).

#### 2.3 Bestaande Recommendation Types
Gedefinieerd in [`src/modelRecommendations.js`](../src/modelRecommendations.js):
1. `spark_plug` (Bougies)
2. `air_filter` (Luchtfilters)
3. `fuel_filter` (Brandstoffilters)
4. `chain` (Zaagkettingen)
5. `bar` (Zaagbladen / Geleiderbladen)
6. `chain_oil` (Kettingzaagolie)
7. `two_stroke_oil` (Tweetakt Mengsmering)
8. `filing_tool` (Kettingvijlen & vijlmallen)
9. `maintenance_tool` (Onderhoudsgereedschap / combisleutels)
10. `protective_gear` (Persoonlijke beschermingsmiddelen)

#### 2.4 Beschikbare Technische Feiten per Model
In [`data/public_evidence_facts.json`](../data/public_evidence_facts.json) zijn in totaal **761 feiten** vastgelegd over 34 velden.
Voor de motorkettingzagen omvat dit velden zoals:
- `displacement_cc` (77 records)
- `power_kw` (62 records)
- `bore_mm` (51 records)
- `stroke_mm` (51 records)
- `idle_speed_rpm` (48 records)
- `spark_plug` (47 records, gestructureerde fabrikant/model arrays)
- `electrode_gap_mm` (15 records) / `spark_plug_gap_mm` (34 records)
- `fuel_tank_l` / `fuel_tank_ml` (46 records)
- `oil_tank_l` / `oil_tank_ml` (23 records)
- `weight_kg` (25 records)
- `chain_pitch` (12 records)

#### 2.5 Reeds Aanwezige OEM / Part Numbers
Door diepgaande inspectie van de brondocumentatie en officiële STIHL catalogi zijn de volgende canonieke OEM onderdeelnummers (11-cijferig formaat `xxxx xxx xxxx`) geïdentificeerd:
- **Service Kits:**
  - `1130 007 4103`: Service Kit 45 (MS 170, MS 180 met 2-MIX motor — vliesluchtfilter, bougie, brandstoffilter)
  - `1130 007 4100`: Service Kit 6 (MS 170, MS 180 zonder 2-MIX motor)
  - `1143 007 4100`: Service Kit 15 (MS 231, MS 251 — vliesluchtfilter, bougie, brandstoffilter)
  - `1140 007 4101`: Service Kit 11 (MS 261, MS 362 — HD2 filter, bougie, brandstoffilter)
- **Geleiderbladen (Guide Bars):**
  - `3005 000 3905`: Rollomatic E Mini, 30 cm, 3/8" P, 1.1 mm (MS 170 / MS 180)
  - `3005 000 3909`: Rollomatic E Mini, 35 cm, 3/8" P, 1.1 mm (MS 170 / MS 180)
  - `3003 000 3313`: Rollomatic E Light 04, 40 cm, .325", 1.3 mm (MS 261 / MS 260)
  - `3003 000 6813`: Rollomatic E, 40 cm, .325", 1.6 mm (MS 261 / MS 260)
  - `3003 000 5221`: Rollomatic E, 50 cm, 3/8", 1.6 mm (MS 440)
  - `3003 000 9421`: Rollomatic ES, 50 cm, 3/8", 1.6 mm (MS 440)
- **Zaagkettingen (Saw Chains):**
  - `3610 000 0044`: 61 PMM3 Picco Micro Mini 3, 3/8" P, 1.1 mm, 44 aandrijfschakels (30 cm)
  - `3610 000 0050`: 61 PMM3 Picco Micro Mini 3, 3/8" P, 1.1 mm, 50 aandrijfschakels (35 cm)
  - `3690 000 0067`: 23 RS Pro Rapid Super Pro, .325", 1.3 mm, 67 aandrijfschakels (40 cm)
  - `3695 000 0067`: 23 RM3 Pro Rapid Micro 3 Pro, .325", 1.3 mm, 67 aandrijfschakels (40 cm)
  - `3639 000 0067`: 26 RS Rapid Super, .325", 1.6 mm, 67 aandrijfschakels (40 cm)
  - `3621 000 0072`: 36 RS Rapid Super, 3/8", 1.6 mm, 72 aandrijfschakels (50 cm)

#### 2.6 Huidige Affiliate / Commercial Offer Contracts
In [`data/model_recommendation_schema.json`](../data/model_recommendation_schema.json) is vastgelegd:
- `offers_active`: boolean (in baseline strikt `false`)
- `disclosure_template`: vaste wettelijke affiliate disclosure
- `offers`: array met aanbiedingen. In baseline strikt `offers: []`.
- Provider-onafhankelijke architectuur met verplichte scheiding tussen technische en commerciële attributen.

#### 2.7 Bestaande UI Integraties
- **Modelpagina SSR Template** ([`src/components/ModelPageTemplate.js`](../src/components/ModelPageTemplate.js)):
  - Bevat technische specificatiesgrid, modelvergelijking, serienummercontrole en Mijn STIHL paspoort CTA.
  - Klaar voor toevoeging van de sectie *"Onderdelen & onderhoud voor jouw STIHL [MODEL]"*.
- **Machinepaspoort Generator** ([`src/components/StihlPassportGenerator.js`](../src/components/StihlPassportGenerator.js)):
  - Rendert veilige paspoortweergave voor zowel `MODEL_ONLY` als `FULL_ANCHORED` dossiers.
  - Bevat [`renderPassportRecommendationSlotsHtml()`](../src/modelRecommendations.js) met compacte weergave (max 4 slots) en strikte serial privacy.

#### 2.8 Bestaande Analytics Tracker
In [`src/components/AnalyticsTracker.js`](../src/components/AnalyticsTracker.js):
- Gevalideerde events: `recommendation_viewed`, `affiliate_offer_impression`, `affiliate_offer_click`, `affiliate_click`.
- Whitelist sanitization: alleen toegestane metadata keys worden verwerkt.
- Bot filtering: automatische filtering van crawlers en headless browsers.
- Privacy-waarborg: serienummers, familienamen, notities of PII worden nooit gelogd.

---

### 3. Pilot Modellen Onderzoek

Er is onderzocht of de 10 gevraagde modellen canoniek aanwezig zijn in [`data/stihl_database.json`](../data/stihl_database.json):

| Model | Gevraagd | Status | Slug | Seriecode | Bewezen feiten in db |
|---|---|---|---|---|---|
| **MS 170** | Ja | **FOUND** | `ms-170` | 1130 | 10 feiten (o.a. bougie, cilinderinhoud, vermogen) |
| **MS 180** | Ja | **FOUND** | `ms-180` | 1130 | 12 feiten (o.a. bougie, steek 3/8" P, tankinhoud) |
| **MS 211** | Ja | **MISSING** | — | — | *Niet aanwezig in canonieke database* |
| **MS 251** | Ja | **FOUND** | `ms-251` | 1143 | 9 feiten (o.a. bougie CMR 6 H, vermogen 2.2 kW) |
| **MS 260** | Ja | **FOUND** | `ms-260` | 1121 | 14 feiten (o.a. bougie WSR 6 F / BPMR 7 A, tank) |
| **MS 261** | Ja | **FOUND** | `ms-261` | 1141 | 17 feiten (o.a. bougie, steek .325", vermogen 3.0 kW) |
| **MS 362** | Ja | **FOUND** | `ms-362` | 1140 | 4 feiten (o.a. cilinderinhoud 59 cc, vermogen 3.5 kW) |
| **MS 440** | Ja | **FOUND** | `ms-440` | 1128 | 9 feiten (o.a. bougie, toerental, vermogen 4.0 kW) |
| **MS 462** | Ja | **FOUND** | `ms-462` | 1142 | 0 documentfeiten (status `SERIES_SOURCE_LINKED`) |
| **MS 500i** | Ja | **MISSING** | — | — | *Niet aanwezig in canonieke database* |

#### Conclusie Pilot Modellen:
- **`PILOT_MODELS_FOUND` (8):** `ms-170`, `ms-180`, `ms-251`, `ms-260`, `ms-261`, `ms-362`, `ms-440`, `ms-462`.
- **`PILOT_MODELS_MISSING` (2):** `MS 211`, `MS 500i`.
- In overeenstemming met de instructies worden er **geen** fictieve modellen verzonnen. De pilot opereert strikt op de 8 daadwerkelijk aanwezige modellen.

---

### 4. Architectuurplan voor Fase 48

1. **Dataset Commerciële Compatibiliteit** ([`data/model_product_compatibility.json`](../data/model_product_compatibility.json)):
   - Gestructureerd volgens de Three-Layer contracten: Machine Identity, Technical Compatibility, Commercial Offers.
   - Exacte koppeling naar `evidence_fact_ids` voor alle `VERIFIED_MODEL_COMPATIBILITY` records.
   - Zaagkettingen en zaagbladen strikt configuratiespecifiek opgeslagen (steek, groefbreedte, aandrijfschakels, bladlengte).
   - Generieke verbruiksartikelen gemarkeerd als `GENERIC_CATEGORY_RECOMMENDATION`.
   - Onbewezen specificaties gemarkeerd als `SPECIFICATION_MATCH_ONLY` of `UNVERIFIED`.

2. **Affiliate Merchants Register** ([`data/affiliate_merchants.json`](../data/affiliate_merchants.json)):
   - Register van goedgekeurde merchants en domeinen (`allowed_domains`).
   - Harde validatie tegen javascript: URLs, data: URLs, redirects en niet-geregistreerde hosts.
   - Status per merchant (`affiliate_active: false` zolang er geen actieve accounts zijn geconfigureerd).

3. **Commerciële Offer Ingestielaag** ([`src/commercialOffers.js`](../src/commercialOffers.js)):
   - Functies voor normalisatie, validatie, domein-check en stale-price filtering.
   - Strikt read-only ten aanzien van technische compatibiliteit: een offer kan nooit de status of specs van een aanbeveling wijzigen.

4. **Validatiescript** ([`scripts/validate_model_product_compatibility.mjs`](../scripts/validate_model_product_compatibility.mjs)):
   - Automatische controle op model-existentie, evidence fact validiteit, statusregels, single-value vereiste, eenheden, configuratieconsistentie en merchant domeinen.

5. **Test Suites**:
   - [`tests/phase48_compatibility_dataset.test.js`](../tests/phase48_compatibility_dataset.test.js) (data-integriteit, evidence checks, chain configuration)
   - [`tests/phase48_commercial_offers.test.js`](../tests/phase48_commercial_offers.test.js) (offer ingestie, domain allowlist, url sanitization, security, stale prices)

6. **UI & Analytics Hardening**:
   - Modelpagina template verrijken met de onderdelensectie voor de 8 pilot modellen.
   - Analytics whitelisted keys uitbreiden met `recommendation_id`, `merchant_id`, `offer_id`, `placement` met behoud van strikte privacy.
