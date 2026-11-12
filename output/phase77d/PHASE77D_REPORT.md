# Phase 77D — GSC-first commercial parts coverage

Datum: 2026-11-12T23:15:01.116Z
Research-only: geen productiecode, geen databasewijziging, geen nieuwe ASIN, geen publieke tekening.

## 1. GSC-status en demand-bronnen

- **Live GSC**: `NOT_CONFIGURED` — Geen OAuth-token in deze omgeving; de API-integratielaag faalt veilig gesloten en er zijn geen verzonnen GSC-cijfers gebruikt.
  Vereist: GSC_ACCESS_TOKEN, GSC_SITE_URL met scope `https://www.googleapis.com/auth/webmasters.readonly`.
- **Historische GSC-baseline** (1 aug – 31 okt 2026): 4 vastgelegde regels.
- **Historische traffic-index**: 117.474 zoekopdrachten / 114.667 onderdeelweergaven, alleen als geciteerd cijfer; de
  `analytics_events`-tabel bevat in deze checkout 0 rijen, dus niet reproduceerbaar.
- **Zoekterm-dataset**: niet aanwezig. Er zijn geen queries verzonnen.

| Onderwerp | Vertoningen | Klikken | CTR | Positie |
| --- | --- | --- | --- | --- |
| /bosmaaiers/fs-460/onderdelen/ | 315 | 0 | 0% | 9.36 |
| stihl fs 460 c onderdelen | 283 | 0 | 0% | 9.12 |
| /kettingzagen/ms-440/onderdelen/ | 277 | 2 | 0.72% | 11.4 |
| /kettingzagen/ms-170/onderdelen/ | 150 | 3 | 2% | 8.7 |

**Interpretatie van de koopintentie.** De enige aantoonbare commerciële query is `stihl fs 460 c onderdelen`
(283 vertoningen, 0 klikken, positie 9,12). Dat is geen vraagprobleem maar een klik- en aanbodprobleem: de pagina
staat op pagina 1, maar de titel en de koopdekking overtuigen niet. Dezelfde logica geldt voor de prioriteitsmodellen.

## 2. Prioriteitsmodellen: huidige koopdekking

| # | Model | Catalogusonderdelen | Serviceonderdelen | ACTIVE NL | ACTIVE DE | Dekking | Alleen zoekfallback | Concrete secties | Historische score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | MS 440 | 277 | 186 | 4 | 6 | 3.61% | 267 | 3 (4 onderdelen) | 76 |
| 2 | MS 170 | 248 | 180 | 10 | 8 | 6.85% | 231 | 4 (10 onderdelen) | 93 |
| 3 | BG 86 | 169 | 128 | 8 | 0 | 4.73% | 161 | 12 (87 onderdelen) | — |
| 4 | MS 461 | 263 | 174 | 3 | 5 | 3.04% | 255 | 2 (2 onderdelen) | — |
| 5 | BR 600 | 239 | 160 | 2 | 0 | 0.84% | 237 | 12 (151 onderdelen) | 75 |
| 6 | MS 390 | 213 | 148 | 5 | 0 | 2.35% | 208 | 2 (5 onderdelen) | — |
| 7 | MS 361 | 278 | 190 | 3 | 3 | 2.16% | 272 | 3 (9 onderdelen) | 82 |
| 8 | HS 45 | 205 | 149 | 6 | 0 | 2.93% | 199 | 9 (99 onderdelen) | — |
| 9 | MS 250 | 276 | 197 | 10 | 5 | 5.07% | 262 | 6 (14 onderdelen) | 95 |

- Registry in deze checkout: **99 ACTIVE**, 3 VERIFIED (staging), 55 RESEARCH_REQUIRED.
- Unie over de negen modellen: **1487** unieke catalogusonderdelen, waarvan **44** met een directe ACTIVE-link (2.96%); 1443 onderdelen hebben alleen een zoekfallback.
- Phase 77C-overlap met deze modellen: **0** van 214 kandidaten.
- Geen enkel prioriteitsmodel heeft een directe kooplink voor meer dan een handvol onderdelen; de rest is zoekfallback.

## 3. Top 25 onderdelen (scoreformule in `PHASE77D_TOP25.json`)

| # | Onderdeel | Model(len) | Status | Score | Volgende actie |
| --- | --- | --- | --- | --- | --- |
| 1 | 42821410300 — Stihl Air Filter | BR 600 | RESEARCH_REQUIRED | 84 | ASIN-identiteit onafhankelijk onderbouwen of laten vallen; tot die tijd zoekfallback. |
| 2 | 11280292301 — Stihl Cylinder Gasket 0.5Mm | MS 440 | RESEARCH_REQUIRED | 80.3 | ASIN-identiteit onafhankelijk onderbouwen of laten vallen; tot die tijd zoekfallback. |
| 3 | 11281201602 — Stihl Air Filter | MS 440 | RESEARCH_REQUIRED | 77 | ASIN-identiteit onafhankelijk onderbouwen of laten vallen; tot die tijd zoekfallback. |
| 4 | 11280802104 — Stihl Fan Housing With Rewind Starter | MS 440 | NO_OFFER | 76.2 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 5 | 00004007000 — Spark plug NGK BPMR7A | MS 440, MS 170, MS 461, MS 390, MS 361, HS 45, MS 250 | ACTIVE_NL_ONLY | 76 | Al gedekt op NL; tweede marktplaats toevoegen levert de resterende dekking. |
| 6 | 11300074101 — Service Kit 7 (Air Filter Fleece, Spark Plug Bosch WSR6F, Fuel Pickup Body) | MS 170 | NO_OFFER | 76 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 7 | 11300074103 — Service Kit 45 (Air Filter Fleece, Spark Plug Bosch WSR6F, Fuel Pickup Body) | MS 170 | NO_OFFER | 76 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 8 | 11281903400 — Stihl 11281903400 Starter Grip Elastostart 3.5mm for MS390 MS400 MS440 MS441 MS460 MS500i | MS 440, MS 461, MS 390, MS 361 | RESEARCH_REQUIRED | 75.2 | ASIN-identiteit onafhankelijk onderbouwen of laten vallen; tot die tijd zoekfallback. |
| 9 | 11300802110 — Stihl Fan Housing With Rewind Starter | MS 170 | NO_OFFER | 74.2 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 10 | 42411200606 — Stihl 42411200606 Carburetor C1M-S228B for SH 86 Vacuum Shredder / BG 86 Blower | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 11 | 42411401002 — Stihl Filter Cover | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 12 | 42411402800 — Stihl Filter Housing | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 13 | 42411402803 — Stihl Filter Housing | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 14 | 42411404401 — Stihl Air Filter | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 15 | 42414051000 — Stihl Spark Plug Boot | BG 86 | NO_OFFER | 74 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 16 | 11300201207 — Stihl Cylinder And Piston 37Mm | MS 170 | NO_OFFER | 73.3 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 17 | 11201958200 — Stihl 11201958200 Starter Rope 3 x 1060mm for BT 45 FS 55 BG 86 | BG 86, HS 45 | NO_OFFER | 72.2 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 18 | 42410802110 — Stihl Fan Housing With Rewind Starter | BG 86 | NO_OFFER | 72.2 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 19 | 42414001320 — Stihl Ignition Module | BG 86 | NO_OFFER | 72.2 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 20 | 00001410601 — Stihl Prefilter | MS 440, MS 461 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 21 | 00006421239 — Stihl 00006421239 Rim Sprocket .325" 9T | MS 440, MS 461, MS 361 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 22 | 11226480403 — Stihl Chain Sprocket Cover | MS 440, MS 461 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 23 | 11256401701 — Stihl Chain Sprocket Cover | MS 440 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 24 | 11280071000 — Stihl 11280071000 Rim Sprocket Kit Chainsaw Parts 3/8" 7T MS361 / MS361C MS440 MS460  MS362 / MS362C MS441 / MS441C | MS 440, MS 361 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |
| 25 | 11280071001 — Stihl Rim Sprocket Kit 3/8" 8T | MS 440, MS 361 | NO_OFFER | 72 | Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen. |

Verdeling: 0 op beide marktplaatsen actief, 1 op één marktplaats actief, 0 staged geverifieerd, 4 research-kandidaat, 20 zonder aanbod.

## 4. Technische sectiedekking

| Model | Concrete GHS-secties | Onderdelen met sectie | Dekking |
| --- | --- | --- | --- |
| MS 440 | 3 | 4 | 1.44% |
| MS 170 | 4 | 10 | 4.03% |
| BG 86 | 12 | 87 | 51.48% |
| MS 461 | 2 | 2 | 0.76% |
| BR 600 | 12 | 151 | 63.18% |
| MS 390 | 2 | 5 | 2.35% |
| MS 361 | 3 | 9 | 3.24% |
| HS 45 | 9 | 99 | 48.29% |
| MS 250 | 6 | 14 | 5.07% |

- Alleen `ghs`-secties met een concrete identiteit tellen; `general_unresolved` en `model_parts_breakdown` zijn uitgesloten.
- De 214 kandidaten uit Phase 77C zijn **niet** van toepassing op deze modellen (0 overlap) en zijn niet geactiveerd.
- Er is in deze fase **geen** nieuwe koppeling afgeleid en niets als `VERIFIED` gelabeld.

## 5. Verwachte verbeterkansen

1. **Klikwinst vóór aanbodwinst**: de GSC-baseline toont posities 8–11 met 0–3 klikken. Titel/description per modelpagina
   levert sneller resultaat dan nieuwe ASIN's.
2. **Dekkingswinst bij de grootste servicecatalogi**: MS 250 (197), MS 361 (190), MS 440 (186) hebben de meeste serviceonderdelen; elk extra ACTIVE-onderdeel raakt daar de meeste bezoekers.
3. **Bouwmotoren (BG 86, BR 600, HS 45) hebben nauwelijks koopdekking**: hier zit de grootste relatieve gat, maar ook de
   grootste verificatie-inspanning.

## 6. Concreet vervolgplan

1. **Geen nieuwe ASIN's**: eerst de bestaande 3 staged VERIFIED-offers door de operator laten beoordelen.
2. **Per model één koopblok**: de top 3 onderdelen uit de top 25, met bestaande directe link of expliciete zoekfallback.
3. **GSC live aansluiten** met `GSC_ACCESS_TOKEN` + `GSC_SITE_URL`, daarna `fetchSearchAnalytics` per modelpagina;
   zonder die stap blijft de rangschikking een beredeneerde prioritering.
4. **Sectiebewijs pas dan uitbreiden** wanneer een bron daadwerkelijk een concrete sectie voor het prioriteitsmodel levert.
5. **Meten**: CTR en affiliate-clicks per modelpagina vergelijken vóór en na stap 2.

## 7. Wat expliciet niet is gedaan

- Geen productiecode of database gewijzigd.
- Geen ASIN geactiveerd of gePromoveerd.
- Geen afbeelding of explosietekening gepubliceerd of gedownload.
- Geen GSC-cijfers verzonnen; live GSC is niet geconfigureerd.
