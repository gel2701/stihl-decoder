# STIHLDecoder — Phase 68 Conversion Improvement Plan

**Datum:** 8 november 2026  
**Status:** Geïmplementeerd & Gevalideerd  
**Repository:** `gel2701/stihl-decoder`  

---

## 1. Doelstelling & Kernprincipes

Het doel van Phase 68 is het optimaliseren van de conversie van bestaande bezoekers op STIHLDecoder.nl naar relevante Amazon-onderdelen, ter voorbereiding op formele account-goedkeuring door het Amazon Associates programma.

### Kernprincipes:
1. **Technische Betrouwbaarheid:** Alleen 100% geverifieerde onderdelen krijgen een directe `/dp/` productlink.
2. **Eerlijkheid & Zero-Fictitious Claims:** Geen verzonnen prijzen, dynamische sterren of voorraadclaims zonder live Creators API.
3. **Duidelijke Demarcatie:** Strikt onderscheid tussen geverifieerde producten en dynamische Amazon zoekresultaten.
4. **Mobile First:** Alle CTA's geoptimaliseerd voor touch-targets (minstens 44x44px).

---

## 2. Productkaart Ontwerp- en Specificatiestandaard (Section 4A)

### 2.1 Geverifieerde Productkaart (Emerald Badge)
Wordt uitsluitend getoond voor onderdelen met status `ACTIVE` en `is_verified: true` (strikt begrensd tot de 3 pilot ASINs):

```html
+-----------------------------------------------------------------------+
| [✓ Geverifieerd Product (Directe Link)] [OEM-Fabrikant / Eerste Montage] |
|                                             ASIN: B001RM8J76 · Amazon.nl|
|                                                                       |
| NGK 6703 BPMR7A Standaard Bougie                                      |
| Voor dit specifieke onderdeelnummer is de officiële fabrikant- en     |
| productkoppeling op Amazon.nl geverifieerd.                           |
|-----------------------------------------------------------------------|
| Fabrikant/Merk: NGK | MPN: BPMR7A / 6703 | STIHL Onderdeel: 0000 400 7000|
| Geschikt voor o.a.: MS 170, MS 210, MS 261, MS 440, BG 86, FS 350     |
|-----------------------------------------------------------------------|
| Directe productpagina op Amazon.nl. Geen onbevestigde prijs/voorraad. |
|                                   [ Bekijk NGK product op Amazon.nl ↗]|
+-----------------------------------------------------------------------+
```

**Specificaties:**
- **Badge:** `✓ Geverifieerd Product (Directe Link)` (Emerald groen).
- **OEM Label:** `OEM-Fabrikant / Eerste Montage` (NGK/Bosch originele toeleverancier).
- **Details:** Fabrikant, MPN, STIHL artikelnummer, preview van compatibele modellen.
- **CTA:** `w-full sm:w-auto min-h-[44px]` touch target, oranje contrastrijke knop.
- **Compliance:** `rel="sponsored nofollow noopener"` en expliciete mededeling dat er geen verouderde prijs- of voorraadclaims worden gedaan.

---

## 3. Zoekfallback Ontwerp- en Demarcatiestandaard (Section 4B)

Wordt getoond voor alle catalogusonderdelen zonder geactiveerde ASIN:

```html
+-----------------------------------------------------------------------+
| Amazon.nl  [Amazon-zoekopdracht (Niet vooraf gecontroleerd)]          |
|                                                                       |
| Zoek op Amazon naar STIHL onderdeel 1123 160 2050. De beschikbaarheid  |
| en exacte overeenkomst zijn niet vooraf bevestigd.                    |
| Dit betreft een dynamische zoekopdracht. Controleer altijd zelf de    |
| pasvorm en productspecificaties vóór aankoop.                         |
|                                                                       |
|                                                  [ Zoek op Amazon.nl ↗]|
+-----------------------------------------------------------------------+
```

**Specificaties:**
- **Badge:** `Amazon-zoekopdracht (Niet vooraf gecontroleerd)` (Amber / donkergrijs).
- **Disclaimer:** Duidelijke uitleg dat zoekresultaten op Amazon dynamisch zijn en door de bezoeker zelf gecontroleerd moeten worden.
- **CTA:** Neutrale grijze knop met `Zoek op Amazon.nl ↗`.

---

## 4. Telemetrie & Tracking Architectuur (Section 4D)

Tracking vindt plaats zonder de navigatie van de bezoeker te vertragen of te blokkeren:

### 4.1 Client-side Event Beacon
```javascript
window.trackStihlEvent('affiliate_click', {
  provider: 'amazon',
  part_number: '00004007000',
  asin_if_known: 'B001RM8J76',
  product_verified: true,
  placement: 'verified_product_card', // of 'search_fallback', 'model_parts_table', 'guide_content'
  device_type: 'mobile',              // of 'desktop'
  is_mobile: true,
  page_path: window.location.pathname
});
```

### 4.2 Server-side Telemetrie Sanitization
- Uitbreiding van `WHITELISTED_METADATA_KEYS` in `AnalyticsTracker.js`:
  - `placement`
  - `device_type`
  - `is_mobile`
  - `click_target`
- `/api/affiliate/track` endpoint in `server.js` detecteert automatisch het apparaattype en verwerkt de payload asynchronously zonder blocking.

---

## 5. Inhoudelijke Kennisbankintegratie (Section 4E)

Implementatie van de complete handleiding:
`src/content/guides/stihl-bougie-vervangen.js`

### Gedekte GSC Prioriteitsmodellen:
1. **MS 440:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
2. **MS 210:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
3. **MS 170:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
4. **MS 461:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
5. **BG 86:** M10x1.0, 16 mm sleutel, 0,5 mm elektrode, 12 Nm (NGK CMR6H)
6. **MS 390:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
7. **BR 600:** M10x1.0, 16 mm sleutel, 0,5 mm elektrode, 12 Nm (NGK CMR6H)
8. **MS 361:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
9. **MS 261:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
10. **HS 45:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
11. **FS 350:** M14x1.25, 19 mm sleutel, 0,5 mm elektrode, 25 Nm (Bosch WSR6F / NGK BPMR7A)
12. **FS 460:** M10x1.0, 16 mm sleutel, 0,5 mm elektrode, 12 Nm (NGK CMR6H)

**Handleidingreferenties:**
- STIHL MS 170 / MS 180 Handleiding (0458-208-0121)
- STIHL MS 261 C-M Handleiding (0458-261-0121)
- STIHL MS 440 Handleiding (0458-440-0121)
- STIHL BG 86 Handleiding (0458-428-0121)
- STIHL BR 600 Handleiding (0458-468-0121)
