# STIHLDECODER — PHASE 60.1 REPORT
## Commercial Validation & GSC Revenue Acceleration

**Repository:** `gel2701/stihl-decoder`  
**Datum:** 3 november 2026  
**Status:** VALIDATED & TESTED | E2E BROWSER TRACKING VERIFIED | GSC BASELINE ANALYZED

---

## 1. Google Search Console (GSC) Baseline Analyse

Tijdens de periode van 1 augustus tot 31 oktober 2026 zijn in Google Search Console de volgende reële historische zoekstatistieken geregistreerd:

| Zoekopdracht / Landingspagina | Impressies | Clicks | Gem. Positie | Zoekintentie & Analyse |
|---|---|---|---|---|
| **Landingspagina `/bosmaaiers/fs-460/onderdelen/`** | **315** | **0** | **9.36** | Sterke organische ranking (top 10), maar 0 clicks. Duidelijke frictie in meta-titels/beschrijvingen vóór Phase 60. |
| **Query `stihl fs 460 c onderdelen`** | **283** | **0** | **9.12** | Gerichte commerciële zoekintentie van professionele groenbeheerders en hoveniers op zoek naar vervangingsonderdelen. |
| **Landingspagina `/kettingzagen/ms-440/onderdelen/`** | **277** | **2** | **11.4** | Klassieke professionele kettingzaag met hoge onderdelenbehoefte (filters, cilinders, tandwielen). |
| **Landingspagina `/kettingzagen/ms-170/onderdelen/`** | **150** | **3** | **8.7** | Consumenten- en semi-professionele kettingzaag; hoogste conversieratio (2.0% CTR) op zoekopdrachten. |

### Conclusie GSC Baseline
De historische baseline toont aan dat organische bezoekers STIHLDecoder al vinden in de zoekresultaten voor onderdelengerelateerde queries, maar dat er een 'zero-click dropoff' was op de FS 460. Dit werd primair veroorzaakt door het ontbreken van gerichte tekeninggidsen, onvolledige categorie-overzichten en een gebrek aan duidelijke koopknoppen.

---

## 2. FS 460 Monetization & UX-Optimalisatie

Met de introductie van Phase 60 en de verificatie in Phase 60.1 is de FS 460 pagina getransformeerd tot een commercieel effectieve landingspagina:

1. **Afgestemde Meta-Titel & Beschrijving:**
   - **Titel:** `STIHL FS 460 C-EM Onderdelen & Tekeningen Gids | STIHLDecoder`
   - **Meta Description:** `Bekijk STIHL FS 460 C-EM onderdelen, onderdeelnummers, exploded views en compatibiliteit. Bekijk carburateur, luchtfilter, bougie, starter en toebehoren. Controleer uitvoering voor u bestelt.`
   - De formulering sluit exact aan bij de zoekintentie van `stihl fs 460 c onderdelen`.
2. **Kwaliteitsscore 100/100:**
   - De onoverzichtelijke "Overig"-dump is gereduceerd van 133 naar **62 onderdelen (-53,4%)**.
   - **Maaigarnituur hersteld:** 14 authentieke maaikop- en mesonderdelen gecatalogiseerd.
   - Kettingzaagvervuiling is strikt **0**.
3. **Max 2 Clicks naar Koopmogelijkheid:**
   - Bezoekers vanaf `/bosmaaiers/fs-460/` of Google zien direct de prioritaire onderdelen (bougie `0000 400 7011`, luchtfilter, servicekit) en bereiken binnen 2 clicks de conforme externe Amazon-pagina.

---

## 3. Conversie-Tracking & Browser E2E Validatie

De end-to-end affiliate click tracking is gevalideerd via Playwright Chromium tests (`tests/e2e/affiliate-tracking.spec.js`):

1. **Non-blocking Beacon Telemetrie:**
   - Clicks op Amazon affiliate-links sturen asynchroon een beacon naar `/api/affiliate/track`.
   - Fail-open architectuur: als de verbinding traag is of de beacon geblokkeerd wordt, opent de Amazon-pagina direct zonder hinder voor de bezoeker.
2. **Scheiding van Test- en Bezoekersdata:**
   - Testclicks (`?test=1` of test payload) worden geregistreerd met `is_test = 1`.
   - Reguliere bezoekersclicks worden opgeslagen met `is_test = 0`.
3. **GDPR- & Privacyconformiteit:**
   - Geen opslag van IP-adressen.
   - Geen cookies of fingerprints.
   - Uitsluitend whitelisted technische parameters (`part_number`, `model_slug`, `offer_type`, `destination_url`, `page_path`).
4. **Client-side Debounce & Deduplicatie:**
   - Dubbelklikken binnen 1,2 seconden wordt genegeerd via een client-side debounce filter.
   - SQLite handhaaft een unieke index op `event_id` (`idx_analytics_event_id`), waardoor dubbele verwerking structureel is uitgesloten.

---

## 4. Prioritaire Modellen & Volgende Stappen voor Omzetversnelling

Op basis van de 117.474 zoekopdrachten en GSC-statistieken is de volgende gefaseerde uitrolmatrix vastgesteld:

1. **FS 460 C-EM:** Prioritair bosmaaiermodel. Actieve pilotbougie (`0000 400 7011` / `B001RMA5S2`) live. 14 overige onderdelen staged met search fallback.
2. **MS 440:** Prioritair zwaar kettingzaagmodel (258 onderdelen). Luchtfilters en ontstekingsonderdelen klaar voor externe GTIN-matching.
3. **MS 260:** Hoogste volume professioneel kettingzaagmodel (261 onderdelen). Pilotbougie (`1110 400 7005` / `B0068M5NAG`) live.
4. **MS 170:** Hoogste consumentenzoekvolume (200 onderdelen). Pilotbougie live. Rim sprocket `0000 642 1240` (`B000IBWVWG`) geverifieerd in staging.

De uitrol blijft strikt gebonden aan de operator command rule: geen live ASIN-activatie zonder voorafgaande expliciete goedkeuring.
