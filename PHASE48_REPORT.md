# FASE 48 — AFFILIATE COMPATIBILITY DATASET & COMMERCIAL PILOT REPORT

**Datum:** 25 september 2026  
**Branch:** `feat/phase48-affiliate-commercial-pilot`  
**Base Commit:** `4e16a0dee53639a76caee93a69fd02f8357444de` (`origin/main`)  
**Status:** ✅ SUCCESS — 16/16 Test Suites Passing (100% Clean)  
**Main Branch Status:** 🛡️ UNTOUCHED (No promotion or merge to main)

---

## 1. Executive Summary

In Fase 48 is de eerste **evidence-driven commerciële laag** voor STIHLDecoder.nl gerealiseerd. Het doel was om de transitie te maken van:
$$\text{Model} \longrightarrow \text{Technische Specificaties}$$
naar:
$$\text{Model} \longrightarrow \text{Bewezen Compatibele Onderdelen} \longrightarrow \text{Commerciële Aanbiedingen} \longrightarrow \text{Affiliate-conversie}$$

Hierbij is de fundamentele architecturale voorwaarde strikt gehandhaafd:
> **COMMERCIAL OFFER MAG NOOIT TECHNICAL COMPATIBILITY BEPALEN OF WIJZIGEN.**  
> Technische compatibiliteit is 100% onafhankelijk vastgesteld op basis van officiële brondocumentatie en canonical evidence alvorens enige commerciële koppeling plaatsvindt.

---

## 2. Drie-Lagen Architectuurscheiding (Three-Layer Separation)

De implementatie handhaaft een harde, ondoordringbare scheiding tussen drie domeinen:

```
┌────────────────────────────────────────────────────────┐
│  LAAG 1: MACHINE IDENTITY                             │
│  - model_slug, series_code, category, canonical_id     │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  LAAG 2: TECHNISCHE COMPATIBILITEIT (EVIDENCE-FIRST)   │
│  - Bougies, zaagkettingen, geleiderbladen, filters     │
│  - OEM onderdeelnummers (11-cijferig xxxx xxx xxxx)   │
│  - public_evidence_facts.json binding                  │
│  - Status: VERIFIED, SPECIFICATION_MATCH, GENERIC      │
│  - READ-ONLY & IMMUTABLE VOOR COMMERCIËLE DATA         │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  LAAG 3: COMMERCIËLE AANBIEDINGEN (COMMERCIAL OFFERS)  │
│  - Provider-onafhankelijke offer ingestie              │
│  - Geregistreerde merchants met strikte domain allowlist│
│  - Baseline: UNMONETIZED (offers: [], links: inactive) │
│  - Prijzen onderhevig aan staleness check (max 7 dagen)│
│  - Affiliate disclosure strikt gekoppeld aan offers    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Pilot Scope & Pilot Modellen

Uit het feitelijke register in [`data/stihl_database.json`](data/stihl_database.json) zijn alle canoniek aanwezige pilot-kandidaten geselecteerd:

| Model Slug | Modelnaam | Serie | Categorie | Status in Database | Pilot Status |
|:---|:---|:---|:---|:---|:---|
| `ms-170` | MS 170 | 1130 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-180` | MS 180 | 1130 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-251` | MS 251 | 1143 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-260` | MS 260 | 1121 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-261` | MS 261 | 1141 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-362` | MS 362 | 1140 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-440` | MS 440 | 1128 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-462` | MS 462 | 1142 | Kettingzaag | Aanwezig | Inbegrepen in Pilot |
| `ms-211` | MS 211 | - | Kettingzaag | **Niet aanwezig** | **Uitgesloten (niet gefabriceerd)** |
| `ms-500i` | MS 500i | - | Kettingzaag | **Niet aanwezig** | **Uitgesloten (niet gefabriceerd)** |

*Conform de instructies zijn ontbrekende modellen niet verzonnen of gesynthetiseerd.*

---

## 4. Affiliate Provider Research & Merchant Register

In [`PHASE48_AFFILIATE_PROVIDER_RESEARCH.md`](PHASE48_AFFILIATE_PROVIDER_RESEARCH.md) zijn 5 Nederlandse affiliate-netwerken en merchant-programma's onderzocht:
1. **Bol.com Partnerprogramma** (Direct partnerplatform)
2. **Amazon.nl Associates Program** (Direct partnerplatform)
3. **Awin Benelux** (Netwerk voor gespecialiseerde tuin/park webshops)
4. **TradeTracker Nederland** (Netwerk voor doe-het-zelf en tuin)
5. **Daisycon** (Netwerk voor niche webshops)

In [`data/affiliate_merchants.json`](data/affiliate_merchants.json) zijn geregistreerd:
- `bol` (Bol.com B.V., allowed domains: `bol.com`, `partner.bol.com`)
- `amazon_nl` (Amazon Europe Core S.à r.l., allowed domains: `amazon.nl`, `amzn.to`)
- `stihl_official` (ANDREAS STIHL AG & Co. KG, referentie/non-affiliate)

Alle merchants staan in de baseline op `affiliate_active: false`. Er zijn geen accounts aangemaakt en geen geheimen opgeslagen.

---

## 5. Technische Compatibiliteit Dataset (`data/model_product_compatibility.json`)

De dataset dekt alle 10 canonieke productcategorieën voor alle 8 pilotmodellen:
1. `spark_plug`: Bougies (Bosch WSR 6 F, NGK BPMR 7 A, NGK CMR 6 H)
2. `air_filter`: Luchtfilters (vlies, HD2)
3. `fuel_filter`: Brandstoffilters
4. `chain`: Zaagkettingen (Picco Micro Mini 3, Rapid Super Pro, Rapid Super)
5. `bar`: Geleiderbladen (Rollomatic E Mini 3005, Rollomatic E Light 04 3003, Rollomatic E 3003, Rollomatic ES 3003)
6. `chain_oil`: Kettingolie (STIHL SynthPlus / BioPlus)
7. `two_stroke_oil`: Tweetaktolie (STIHL HP Ultra 1:50)
8. `filing_tool`: Vijlmallen en ronde vijlen (4,0 mm, 4,8 mm, 5,2 mm)
9. `maintenance_tool`: Combisleutels (19-13 mm)
10. `protective_gear`: Persoonlijke beschermingsmiddelen (Zaagbroek klasse 1, helm, gehoorbescherming)

### Factual Evidence Binding:
- **16 feitelijke evidence fact IDs** uit [`data/public_evidence_facts.json`](data/public_evidence_facts.json) direct gekoppeld aan de overeenkomstige model-slugs.
- **24 officiële STIHL OEM onderdeelnummers** (11-cijferig formaat `xxxx xxx xxxx`) gevalideerd en opgenomen.
- Kettinggeometrieën (steek, dikte, aantal schakels, bladlengte) 100% sluitend gedocumenteerd.

---

## 6. Provider-Independent Commercial Offers Layer (`src/commercialOffers.js`)

De commerciële engine biedt:
- `normalizeCommercialOffer`: Valideert en normaliseert ruwe offers naar een strikt contract.
- `validateCommercialOffer`: Handhaaft statusregels, merchant-registratie en allowlist.
- `isDomainAllowlisted`: Blokkeert kwaadaardige URI schemes (`javascript:`, `data:`, `vbscript:`, etc.) en ongeautoriseerde domeinen.
- `isOfferStale`: Prijzen ouder dan 7 dagen (`DEFAULT_MAX_PRICE_AGE_MS`) worden gedetecteerd en onderdrukt (`display_price: null`).
- `attachOfferToRecommendation`: Voegt een commercieel aanbod toe aan een aanbeveling waarbij technische compatibiliteit **strikt ongewijzigd** blijft.
- `getActiveOffersForRecommendation`: Filtert inactieve en invalide offers en past stale-price onderdrukking toe.

---

## 7. Geautomatiseerde Validatie (`scripts/validate_model_product_compatibility.mjs`)

Het validatiescript controleert:
- ✅ Aanwezigheid van het model in `stihl_database.json`
- ✅ Geldigheid van `recommendation_type` tegen `RECOMMENDATION_TYPES`
- ✅ Geldigheid van `compatibility_status` tegen `COMPATIBILITY_STATUSES`
- ✅ Koppeling van `evidence_fact_ids` aan bestaande feiten van hetzelfde model
- ✅ Formaat van OEM onderdeelnummers (`^\d{4}\s\d{3}\s\d{4}$`)
- ✅ Consistentie van kettinggeometrie en zaagblad specificaties
- ✅ Domeinveiligheid en merchant allowlists voor commerciële aanbiedingen

Resultaat bij uitvoering:
```
Running model product compatibility validation...
✅ Validation PASSED (8 models, 88 recommendations, 0 offers).
```

---

## 8. UI Integratie & Privacy

### 8.1 Model Page Template (`src/components/ModelPageTemplate.js` & `ModelProductCompatibilitySection.js`)
- Nieuwe sectie *"🔧 Onderdelen & onderhoud voor jouw STIHL [MODEL]"* toegevoegd aan modelpagina's.
- **Bewezen compatibel** badge (`VERIFIED_MODEL_COMPATIBILITY`) en **Specificatiematch** badge (`SPECIFICATION_MATCH_ONLY`) duidelijk weergegeven.
- **Unmonetized baseline:** Toont *"ℹ️ Bekijk technische informatie"*.
- **Affiliate disclosure:** Wordt uitsluitend getoond wanneer er een actieve affiliate-aanbieding aanwezig is. In de pilot baseline blijft de disclosure inactief.
- **Gesponsorde links:** Bevatten verplicht `rel="sponsored noopener noreferrer"` en `target="_blank"`.

### 8.2 Analytics Tracker Privacy (`src/components/AnalyticsTracker.js`)
- `WHITELISTED_METADATA_KEYS` uitgebreid met:
  - `recommendation_id`
  - `merchant_id`
  - `offer_id`
  - `placement`
- **Geen PII:** Serienummers, e-mailadressen, IP-adressen en notities worden strikt gefilterd en nooit meegenomen in telemetry.

---

## 9. Statistische Samenvatting (Exacte Cijfers)

| Metriek | Waarde | Toelichting |
|:---|:---|:---|
| **TOTAL_PILOT_MODELS** | **8** | MS 170, MS 180, MS 251, MS 260, MS 261, MS 362, MS 440, MS 462 |
| **TOTAL_RECOMMENDATIONS** | **88** | 8 modellen × (10-12 aanbevelingen per model) |
| **TOTAL_VERIFIED_COMPATIBILITY_RECORDS** | **26** | Bewezen op modelniveau via officiële handleidingen/catalogus |
| **TOTAL_SPECIFICATION_MATCH_ONLY** | **36** | Technische match op basis van fabrieksspecificatie |
| **TOTAL_GENERIC_RECOMMENDATIONS** | **24** | Algemeen veiligheids- en onderhoudsadvies |
| **TOTAL_UNVERIFIED** | **2** | Filter/spec niet sluitend bewezen |
| **TOTAL_CHAIN_CONFIGURATIONS_VERIFIED** | **12** | Volledige geometrie (steek, dikte, schakels, lengte) |
| **TOTAL_GUIDE_BAR_CONFIGURATIONS_VERIFIED** | **12** | Bladlengte, steek, dikte en STIHL aansluiting (3005/3003) |
| **TOTAL_OEM_PART_NUMBERS** | **24** | Formaat `xxxx xxx xxxx` |
| **TOTAL_MERCHANTS_RESEARCHED** | **5** | Bol.com, Amazon.nl, Awin, TradeTracker, Daisycon |
| **TOTAL_REGISTERED_MERCHANTS** | **3** | bol, amazon_nl, stihl_official |
| **TOTAL_COMMERCIAL_OFFERS** | **0** | Baseline pilot is unmonetized (geen fake aanbiedingen) |
| **TOTAL_ACTIVE_AFFILIATE_OFFERS** | **0** | Geen fictieve links of tracking codes |
| **TECHNICAL_DATA_READY** | **true** | Volledig gevalideerd en gedekt |
| **COMMERCIAL_DATA_READY** | **true** | Ingestion pipeline operationeel |
| **AFFILIATE_LINKS_ACTIVE** | **false** | Veiligheidswaarborg: links staan uit |
| **DISCLOSURE_ACTIVE** | **false** | Wordt pas actief bij eerste echte aanbieding |
| **ANALYTICS_READY** | **true** | Whitelisted tracking voorbereid |

---

## 10. Test Suites Resultaten (16/16 Pass)

| Suite | Status | Duur |
|:---|:---|:---|
| `tests/official_serial_anchor_and_range_semantics.test.js` | ✅ PASS | 533ms |
| `tests/serial_decoder_recovery_current.test.js` | ✅ PASS | 319ms |
| `tests/baseline.test.js` | ✅ PASS | 411ms |
| `tests/canonical_policy.test.js` | ✅ PASS | 133ms |
| `tests/phase36_serial_user_value_engine.test.js` | ✅ PASS | 236ms |
| `tests/render_www_alignment.test.js` | ✅ PASS | 1052ms |
| `tests/production_validation.test.js` | ✅ PASS | 2583ms |
| `tests/decoder.test.js` | ✅ PASS | 317ms |
| `tests/model_first_passport.test.js` | ✅ PASS | 205ms |
| `tests/passport_serial_enrichment.test.js` | ✅ PASS | 212ms |
| `tests/affiliate_foundation.test.js` | ✅ PASS | 207ms |
| `tests/passport_hardening.test.js` | ✅ PASS | 347ms |
| `tests/evidence_integrity_hardening.test.js` | ✅ PASS | 284ms |
| `tests/phase48_compatibility_dataset.test.js` | ✅ PASS | 180ms |
| `tests/phase48_commercial_offers.test.js` | ✅ PASS | 133ms |
| `tests/phase48_ui_analytics.test.js` | ✅ PASS | 217ms |
| **Totaal: 16 Suites** | **16 PASS** | **0 FAIL** |

---

## 11. Conclusie & Volgende Stap

Fase 48 is conform alle vereisten voltooid op de feature branch `feat/phase48-affiliate-commercial-pilot`.  
`origin/main` is **niet gewijzigd**. De code is klaar voor beoordeling door de gebruiker.
