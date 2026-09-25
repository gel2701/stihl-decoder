# FASE 48 / 48A — CANONICAL COMPATIBILITY EVIDENCE & SAFE COMMERCIAL PILOT REPORT

**Datum:** 25 september 2026
**Branch:** `feat/phase48-affiliate-commercial-pilot`
**Base Commit:** `4e16a0dee53639a76caee93a69fd02f8357444de` (`origin/main`)
**Status:** ✅ SUCCESS — 16/16 Productie Test Suites PASS (100% Clean)
**Main Branch Status:** 🛡️ UNTOUCHED (Geen promotie of merge naar main)

---

## 1. Executive Summary & Architecturale Invariant

In Fase 48A is de **evidence-driven commerciële laag** voor STIHLDecoder.nl verder aangescherpt en gehard tegen overclaiming en onveilige offer-rendering.

De fundamentele architecturale invariant:
> **COMMERCIAL OFFER MAG NOOIT TECHNICAL COMPATIBILITY BEPALEN OF WIJZIGEN.**
> Technische compatibiliteit wordt uitsluitend en onafhankelijk vastgesteld op basis van canonieke brondocumentatie alvorens enige commerciële koppeling plaatsvindt.

In Fase 48A is dit principe uitgebreid met het **Hard Verified Evidence Contract**:
> Een record mag **uitsluitend** de status `VERIFIED_MODEL_COMPATIBILITY` dragen indien er direct gekoppelde canonieke feiten (`evidence_fact_ids`) aanwezig zijn die voldoen aan alle canonical evidence policies (`display_eligible === true`, `single_value_eligible === true`, toegestane bronstatus, passend veld en correcte modelscope).

Vrije tekst in `evidence_basis` of de aanwezigheid van een geldig OEM onderdeelnummer bewijst op zichzelf **geen** modelcompatibiliteit.

---

## 2. Evidence Audit & Remediatie

Bij de audit van alle 26 records die initieel als `VERIFIED_MODEL_COMPATIBILITY` gemarkeerd stonden, is het volgende onderscheid gemaakt:

| Categorie | Aantal | Omschrijving | Actie in Fase 48A |
|:---|:---:|:---|:---|
| **A. VERIFIED_CANONICAL_EVIDENCE** | **6** | Bougies voor MS 170, MS 180, MS 251, MS 260, MS 261, MS 440 met exacte, display-eligible canonieke feiten in `public_evidence_facts.json` (12 fact IDs totaal). | **Behouden als `VERIFIED_MODEL_COMPATIBILITY`** |
| **B. OFFICIAL_SOURCE_DISCOVERED_BUT_NOT_CANONICALIZED** | **20** | Zaagkettingen (10) en geleiderbladen (10) met plausibele fabrieksspecificaties en OEM onderdeelnummers, maar zonder sluitend samengesteld canoniek configuratiefeit in de public evidence store. | **Gedowngraded naar `SPECIFICATION_MATCH_ONLY`** |
| **C. INSUFFICIENT_EVIDENCE** | **0** | Onvolledige of ontbrekende specificaties. | N.v.t. |

### Remediatie Resultaten (Exacte Cijfers):
- **VERIFIED_BEFORE:** `26`
- **VERIFIED_AFTER:** `6`
- **DOWNGRADED_TO_SPECIFICATION_MATCH:** `20`
- **CANONICALIZED_NEW_EVIDENCE:** `0`
- **VERIFIED_RECORDS_WITHOUT_EVIDENCE:** `0` (Strikt 0; validator handhaaft dit hard)
- **TOTAL_SPECIFICATION_MATCH_ONLY:** `56` (voorheen 36)
- **TOTAL_GENERIC_RECOMMENDATIONS:** `24`
- **TOTAL_UNVERIFIED:** `2`
- **TOTAL_OEM_PART_NUMBERS:** `24` (ongewijzigd, bewaard als specificatiematch)

---

## 3. Ketting- en Zaagbladconfiguraties

In overeenstemming met de Fase 48A vereisten:
- Alle **12 kettingconfiguraties** zijn geclassificeerd als `SPECIFICATION_MATCH_ONLY` totdat pitch, gauge, drive links, bar length en OEM part number als één enkel samengesteld configuratiefeit canoniek worden ingevoerd.
- Alle **12 geleiderbladconfiguraties** zijn geclassificeerd als `SPECIFICATION_MATCH_ONLY`.
- Alle 24 OEM part numbers blijven behouden en voldoen aan het STIHL formaat `xxxx xxx xxxx`.
- `display_claim` teksten zijn ontdaan van de claim "Bewezen" voor niet-geverifieerde onderdelen (bv. *"Ketting 30 cm..."* i.p.v. *"Bewezen ketting 30 cm..."*).

---

## 4. Tweetakt Mengsmering Review (Geen 1:50 Overclaiming)

Conform Sectie 16 zijn alle hardcoded `1:50` claims in de generieke categorie `two_stroke_oil` verwijderd:
- **Nieuwe display_claim:** *"2-Takt mengsmering of alkylaatbrandstof"*
- **Nieuwe display_guidance:** *"Controleer de voorgeschreven brandstof/mengverhouding voor jouw model."*
- **Specificatie:** `product_type: "2-takt olie / alkylaatbrandstof"` (geen hardcoded `mix_ratio: "1:50"`).

---

## 5. Veilige Commerciële Render Pipeline & Beveiliging

In `src/commercialOffers.js` en `src/components/ModelProductCompatibilitySection.js` is de render-pipeline volledig beveiligd:

1. **Centrale Offer Policy:** UI renderen van aanbiedingen verloopt uitsluitend via `getActiveOffersForRecommendation()` en `validateCommercialOffer()`.
2. **Merchant Activity Gate:** Een `ACTIVE_AFFILIATE` aanbod mag **uitsluitend** renderen als de betreffende merchant in `affiliate_merchants.json` staat én `affiliate_active === true`. Bij `affiliate_active: false` wordt de affiliate CTA onderdrukt en toont de UI de neutrale technische informatie knop.
3. **Prijsstaleness & Onderdrukking:**
   - Indien `observed_at` ontbreekt: prijs wordt onderdrukt (`display_price: null`).
   - Indien prijs ouder is dan 7 dagen (`DEFAULT_MAX_PRICE_AGE_MS`): prijs wordt onderdrukt.
   - Uitsluitend verse, geldige prijzen worden getoond (`€X.XX`).
4. **Domein Allowlist & Protocol Hardening:**
   - Gevaarlijke URI schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `about:`) worden resoluut geweigerd.
   - Alleen domeinen uit de allowlist van de geregistreerde merchant zijn toegestaan.
   - Geen URL shorteners (amzn.to verwijderd uit documentatie; register bevat alleen `amazon.nl`, `www.amazon.nl`, `bol.com`, `partnerplatform.bol.com`).
5. **XSS & Attribute Injection Escaping:**
   - Centrale `escapeHtml()` helper beveiligt alle gerenderde waarden (`offer.title`, `display_claim`, `display_guidance`, `oem_part_number`, `recommendation_id`, `merchant_id`, `offer_id`, `affiliate_url`, `modelName`).
   - Pogingen tot attribute-breakout of tag-injectie worden veilig ge-escaped naar `&quot;`, `&lt;`, `&gt;`, `&amp;`.
6. **Affiliate Disclosure Notice:**
   - Wordt **uitsluitend** getoond indien er daadwerkelijk een valide, actieve affiliate-aanbieding gerenderd wordt.
   - In de huidige onbemonetiseerde baseline blijft de disclosure inactief.
7. **Neutrale Sectietekst:**
   - Sectiebeschrijving aangepast naar: *"Technische compatibiliteitsinformatie en onderhoudsadvies"*.

---

## 6. Statistische Samenvatting (Actuele Repo-Status)

| Metriek | Waarde | Toelichting |
|:---|:---:|:---|
| **TOTAL_PILOT_MODELS** | **8** | MS 170, MS 180, MS 251, MS 260, MS 261, MS 362, MS 440, MS 462 |
| **TOTAL_RECOMMENDATIONS** | **88** | 8 modellen × (10-12 aanbevelingen) |
| **TOTAL_VERIFIED_COMPATIBILITY_RECORDS** | **6** | Alleen canoniek bewezen bougies |
| **TOTAL_SPECIFICATION_MATCH_ONLY** | **56** | Technische matches zonder samengesteld bewijs |
| **TOTAL_GENERIC_RECOMMENDATIONS** | **24** | Algemeen onderhouds- en veiligheidsadvies |
| **TOTAL_UNVERIFIED** | **2** | Filters met onvolledige documentatie |
| **TOTAL_OEM_PART_NUMBERS** | **24** | Formaat `xxxx xxx xxxx` |
| **TOTAL_CHAIN_CONFIGURATIONS_VERIFIED** | **0** | Conform Phase 48A contract (12 in spec match) |
| **TOTAL_GUIDE_BAR_CONFIGURATIONS_VERIFIED** | **0** | Conform Phase 48A contract (12 in spec match) |
| **VERIFIED_WITHOUT_CANONICAL_EVIDENCE** | **0** | Hard afgedwongen: 0 overclaims |
| **TOTAL_MERCHANTS_REGISTERED** | **3** | bol, amazon_nl, stihl_official |
| **TOTAL_COMMERCIAL_OFFERS** | **0** | Baseline is unmonetized |
| **TOTAL_ACTIVE_AFFILIATE_OFFERS** | **0** | Geen fake links of trackers |
| **TECHNICAL_DATA_READY** | **true** | Volledig gevalideerd |
| **COMMERCIAL_DATA_READY** | **true** | Pipeline klaar voor gebruik |
| **AFFILIATE_LINKS_ACTIVE** | **false** | Veiligheidswaarborg |
| **DISCLOSURE_ACTIVE** | **false** | Geen actieve links in baseline |
| **ANALYTICS_READY** | **true** | Whitelisted tracking voorbereid |

---

## 7. Productie Testmatrix (16/16 PASS)

Alle 16 productietestsuites slagen 100%:

```
===============================================================
📊 PRODUCTION SUITE SUMMARY
===============================================================
  ✅ tests/official_serial_anchor_and_range_semantics.test.js [PASS]
  ✅ tests/serial_decoder_recovery_current.test.js [PASS]
  ✅ tests/baseline.test.js [PASS]
  ✅ tests/canonical_policy.test.js [PASS]
  ✅ tests/phase36_serial_user_value_engine.test.js [PASS]
  ✅ tests/render_www_alignment.test.js [PASS]
  ✅ tests/production_validation.test.js [PASS]
  ✅ tests/decoder.test.js [PASS]
  ✅ tests/model_first_passport.test.js [PASS]
  ✅ tests/passport_serial_enrichment.test.js [PASS]
  ✅ tests/affiliate_foundation.test.js [PASS]
  ✅ tests/passport_hardening.test.js [PASS]
  ✅ tests/evidence_integrity_hardening.test.js [PASS]
  ✅ tests/phase48_compatibility_dataset.test.js [PASS]
  ✅ tests/phase48_commercial_offers.test.js [PASS]
  ✅ tests/phase48_ui_analytics.test.js [PASS]
---------------------------------------------------------------
Total Suites: 16 | Passed: 16 | Failed: 0
===============================================================
🎉 ALL CURRENT PRODUCTION SUITES PASSED 100% CLEANLY!
```
