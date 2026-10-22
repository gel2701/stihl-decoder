# STIHLDecoder — Phase 56G Rapport
## Controlled SEO Wave 3, Affiliate Intelligence & Interactive Parts Pilot

**Repository**: `gel2701/stihl-decoder`  
**Branch**: `feat/phase56g-seo-affiliate-diagrams`  
**Status**: VOLTOOID (Evidence-First, Fail-Closed)

---

## 1. Baseline & Database-Invarianten

Alle canonieke database-invarianten zijn gecontroleerd en ongewijzigd gebleven:

| Invariant | Waarde | Status |
| :--- | ---: | :--- |
| Canonieke onderdelen (`parts`) | 17.082 | BEVROREN |
| Model-onderdeel fitments (`model_part_fitments`) | 175.106 | BEVROREN |
| Configuraties (`parts_model_configurations`) | 766 | BEVROREN |
| Evidence records (`part_fitment_evidence`) | 208.412 | BEVROREN |
| Sectiecontexten (`model_part_fitment_section_contexts`) | 814 | BEVROREN |
| Gepubliceerde STIHL-modellen | 85 | BEVROREN |

---

## 2. SEO Wave 3 — Gecontroleerde Uitbreiding

Alle 16.282 nog niet-indexeerbare onderdelen zijn geëvalueerd met `scripts/build_phase56g_wave3_cohort.mjs` tegen zeven harde kwaliteitscriteria (`H1` t/m `H7`):

1. **H1**: Nog niet in Pilot (50), Wave 1 (350) of Wave 2 (400).
2. **H2**: Geverifieerde fitment op ten minste één **gepubliceerd** STIHL-model met een publieke onderdelenpagina (voorkomt weespagina's).
3. **H3**: Ten minste **twee onafhankelijke, genormaliseerde diagramsecties** op gepubliceerde modellen (exclusief `Unresolved Diagram Section` en `Algemene sectie`).
4. **H4**: Ten minste één betekenisvol diagram-positienummer (`PartNormalizer.isMeaningfulDiagramPosition`).
5. **H5**: Schone technische naam zonder encoding-fouten en zonder gescrapete retailer-titels.
6. **H6**: Geen generiek bevestigingsmateriaal (schroeven, moeren, ringen, pennen, klinknagels, O-ringen zonder specifieke functie) om dunne en identieke pagina's uit te sluiten.
7. **H7**: 100% unieke paginatitel binnen de volledige indexeerbare set.

### Resultaat van de selectie
- Van de **3.904** onderdelen die op gepubliceerde modellen voorkomen, hebben er **3.847** slechts 0 of 1 opgeloste diagramsectie (`H3_FEWER_THAN_2_INDEPENDENT_SECTIONS`).
- Van de resterende **57** onderdelen met $\ge 2$ onafhankelijke secties zijn er **53** afgewezen wegens generiek bevestigingsmateriaal (`H6`) of retailer-stijl naamgeving (`H5`).
- Conform de opdracht (*"Publiceer uitsluitend kandidaten die volledig aan de kwaliteitscriteria voldoen. Als minder dan 400 kandidaten geschikt zijn, publiceer dan minder"*) zijn exact **4 onderdelen** gepromoveerd naar SEO Wave 3:

| Onderdeelnummer | Weergave | Schone Naam | Score | Onafhankelijke Secties | Gepubliceerde Modellen | Primaire Sectie |
| :--- | :--- | :--- | ---: | ---: | ---: | :--- |
| `96390031230` | `9639 003 1230` | Oil Seal Din3760-As12X22X7 | 82 | 2 | 7 | Crankcase |
| `95030039853` | `9503 003 9853` | Grooved Ball Bearing Din625-609-2Z | 80 | 2 | 7 | Gear Head - Deflector |
| `11250071021` | `1125 007 1021` | Spur Gear / Chain Adjusting Screw Kit | 69 | 2 | 14 | Chain Brake |
| `42291226701` | `4229 122 6701` | High Speed Screw | 53 | 2 | 5 | Carburetor C1Q-S70 |

- **Indexeerbare onderdelen**: **800 → 804** (+4).
- **Sitemap URL's**: **981 → 985** (+4), 0 duplicaten, 0 weespagina's.

---

## 3. Google Search Console (GSC) Status & Integratielaag

- **DNS-eigendomsverificatie**: Actief op `stihldecoder.nl` (`google-site-verification=3JhAloi6IyG5Q53QmzXv6YMjjqLriLmszkcGvTZwNWI`).
- **Live API-toegang**: Niet geconfigureerd in deze omgeving (`GSC_ACCESS_TOKEN` en `GSC_SITE_URL` ontbreken).
- **Gebouwde herbruikbare integratielaag**: `src/seo/SearchConsoleClient.js` ondersteunt `fetchSearchAnalytics`, `fetchSitemaps` en `findLowCtrOpportunities`, faalt veilig gesloten naar `NOT_CONFIGURED` zonder verzonnen statistieken en labelt live rijen expliciet met `provenance: 'GSC_LIVE_API'`.
- **Echte GSC-metingen (klikken, vertoningen, CTR, positie)**: `null` (geen OAuth-token aanwezig; 0 verzonnen cijfers).

---

## 4. Affiliate Intelligence Dashboard

- **Module**: `src/analytics/AffiliateIntelligence.js` + `output/phase56g/AFFILIATE_INTELLIGENCE_DASHBOARD.json`.
- **Instrumentatie**:
  - `MODEL_PAGE_VIEW` toegevoegd aan `AnalyticsTracker.js` en `server.js` bij modelpaginaweergaven.
  - `query_variant` toegevoegd aan de client-side `affiliate_click` tracking op `PartDetailPageTemplate.js`.
- **A/B Queryvariant-verdeling**:
  - Catalogus (17.082 onderdelen): Variant A (`STIHL <geformatteerd>`): **8518** (49.87%), Variant B (`STIHL <compact>`): **8564**.
  - Indexeerbare set (804 onderdelen): Variant A: **414**, Variant B: **390**.
- **Eerste-partij productiemetingen**: 10 productie-events in de lokale database; conversieratio's worden uitsluitend berekend wanneer teller én noemer $> 0$ zijn (anders `null` met status `NOT_COMPUTABLE`).
- **Verkopen / commissies**: Niet gerapporteerd (`null`); vereist externe Amazon Associates rapportage.

---

## 5. Interactive Exploded View Pilot

- **Prototype**: `src/components/InteractiveDiagramViewer.js` getest op **MS 261** (`Rewind Starter`, 18 geverifieerde posities, 1 zonder positie), **MS 170** (`Muffler`, 6 geverifieerde posities) en **FS 55** (`Air Filter - Fuel Tank`, 25 geverifieerde posities).
- **Geen publieke uitrol van ongeverifieerde tekeningen**: Omdat officiële STIHL-explosietekeningen auteursrechtelijk beschermd zijn en de database geen $(x, y)$-afbeeldingscoördinaten bevat, blijft het component een geïsoleerd technisch prototype met 100% originele SVG-schemageometrie en een volledige HTML-tabelfallback zonder JavaScript.
