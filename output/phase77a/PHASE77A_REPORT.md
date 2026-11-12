# Phase 77A — Herstel bestaande STIHL-explosietekeningen (inventarisatie)

Datum: 2026-11-12T21:12:55.307Z
Status: read-only inventarisatie. Geen afbeelding gedownload, geen afbeelding gepubliceerd, geen catalogusdata gewijzigd.

## 0. Bereik van deze uitvoering (belangrijk)

De opdracht noemt drie lokale archieven (`stihl_scribd_documents_output`, `stihl_archive_downloads`,
`stihl_gardenhirespares_output`, `stihl_models_full_documentation_archive`) op een Windows-machine.
Die mappen zijn in deze checkout **niet aanwezig**; ze zijn hieronder als `NOT_PRESENT_IN_THIS_CHECKOUT`
geregistreerd. Wat wél aanwezig is, is de volledige metadata- en cataloguslaag: de GHS-catalogus met
diagram-URL's, de documentregistries van de lokale archieven, de PDF-page-index en de onderdelendatabase.
Dit rapport kwantificeert daarom precies hoeveel tekeningen er in de verzamelde bronnen zitten en hoeveel
daarvan technisch koppelbaar zijn; de bestanden zelf kunnen op de machine met de archieven met hetzelfde
script worden geïnventariseerd via `PHASE77A_ARCHIVE_ROOTS`.

## 1. Inventarisatie van bronnen

| Bron | Aanwezig | Bestanden | PDF's | Afbeeldingen | Opmerking |
| --- | --- | --- | --- | --- | --- |
| `C:\Users\GelliusSnippe\.agents\stihl_scribd_documents_output` | nee | 0 | 0 | 0 | NOT_PRESENT_IN_THIS_CHECKOUT |
| `stihl_archive_downloads` | nee | 0 | 0 | 0 | NOT_PRESENT_IN_THIS_CHECKOUT |
| `stihl_gardenhirespares_output` | nee | 0 | 0 | 0 | NOT_PRESENT_IN_THIS_CHECKOUT |
| `stihl_models_full_documentation_archive` | nee | 0 | 0 | 0 | NOT_PRESENT_IN_THIS_CHECKOUT |
| `data` | ja | 933 | 3 | 3 | — |
| `output` | ja | 266 | 0 | 0 | — |
| `reports` | ja | 13 | 0 | 0 | — |
| `docs` | ja | 2 | 0 | 0 | — |

- Totaal gescande bestanden: **1214** (.json: 1020, .html: 34, .jsonl: 3, .txt: 1, .pdf: 3, .bin: 1, .csv: 83, .md: 43, .gz: 18, .cjs: 1, .js: 1, .db: 2, .db-shm: 2, .db-wal: 2).
- JSON/MD/HTML-artefacten gescand op afbeeldingsreferenties: **1097**.
- Afbeeldingsreferenties in die metadata: **5364** verwijzingen naar **2422** unieke URL's (metadata, geen artwork).
- Lokale afbeeldingsbestanden in de gescande mappen: **0**; echte lokale explosietekeningen: **0** (de repo-iconen staan buiten de gescande archiefmappen).
- Lokale PDF's: **3**, samen **5** ingebedde afbeeldingsobjecten. Het zijn handleidingen, geen IPL's.
- Documentregistries: `data/batch2_document_registry.json`: 1790, `data/additional_sources_document_registry.json`: 792, `data/batch3_pdf_document_registry.json`: 78; PDF-page-index: **6560** pagina's; canonieke documenten: **2137**.
- Vermeldingen in de registries: Scribd **0**, USA Parts **0**, Garden Hire Spares **0**, parts lists **430**.
- Eerdere GitHub-onderzoeken bevestigen het beeld: `PHASE61D_REPORT.md` (0 publieke explosietekeningen) en `PHASE61D_DIAGRAM_AUDIT.json` (46 configuratie-URL's voor 5 modellen). Phase 77A breidt dat uit naar **alle** 224 modellen met diagramreferenties.

## 2. Gevonden explosietekeningen

- GHS-catalogusrijen: **3143**, waarvan **2377** met een diagram-URL.
- Unieke tekeningen na deduplicatie (URL + SHA-256): **2376**.
- Dubbele referenties: **1** (1 dedupe-groepen; dezelfde tekening wordt door meerdere configuratierijen gebruikt).
- Classificatie: **2319** echte exploded-view sheets, **57** aandraaimoment-tabellen (EXPLODED_DIAGRAM_SHEET: 2319, TIGHTENING_TORQUE_TABLE: 57).
- Er zijn **geen** lokale tekeningbestanden, geen vector-Illustrator/SVG-bronnen en geen uit PDF's gerenderde IPL-pagina's in deze checkout.
- De tekeningen zijn uitsluitend als externe URL bekend (1 host: www.gardenhirespares.co.uk); er is niets gedownload.

## 3. Modellen en varianten

- Modellen met minstens één diagramreferentie: **224**.
- Daarvan herkenbaar in onze eigen fitment-database: **162**; niet gebonden: **62**.
- Variantconflicten die een handmatige review vereisen: **22**. Een tekening van een andere uitvoering wordt nooit als exacte match getoond.

## 4. Koppeling aan bestaande diagramsecties en posities

- Tekeningen gekoppeld aan een bestaande, geresolveerde catalogussectie: **235** van 2377 (9.9%).
- Niet koppelbaar op sectieniveau: **2142**, vooral omdat **94.0%** van onze fitments nog in `general_unresolved` staat (10891 van 181394 fitments hebben een geresolveerde sectie).
- Gekoppelde tekeningposities: **710**; gekoppelde onderdeelnummers: **512**.
- Catalogusdekking: **2.79%** van 18377 onderdelen.
- Van de gekoppelde onderdelen hebben **7** een actieve Amazon-aanbieding; dat levert **9** volledige viewer-ketens (tekening → positie → onderdeelnummer → Amazon-aanbieding).
- eBay: de providers bestaan (`src/affiliate/EbayAffiliateProvider.js`, `EbaySyncEngine.js`, `EbayBrowseApiClient.js`), maar er staan geen actieve eBay-aanbiedingen in de repository, dus eBay-links zijn in deze fase niet meetbaar.

## 5. Proefkoppeling — vijf modellen

| Model | Bronconfiguraties | Met tekening | Gekoppelde secties | Posities | Onderdelen | Met Amazon-aanbod | Viewer-gereedheid |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MS 170 | 16 | 14 | 1 | 1 | 1 | 0 | POSITION_VIEWER_DATA_READY |
| MS 261 | 20 | 17 | 11 | 132 | 132 | 3 | POSITION_VIEWER_DATA_READY |
| 026 / MS 260 | 36 | 32 | 13 | 133 | 133 | 3 | POSITION_VIEWER_DATA_READY |
| FS 55 | 3 | 0 | 0 | 0 | 0 | 0 | SECTIONS_WITHOUT_IMAGE |
| HS 81 | 0 | 0 | 0 | 0 | 0 | 0 | MISSING_MODEL_IN_SOURCE |

## 6. Vijf uitgewerkte koppelingen

### Voorbeeld 1 — ms_261, sectie C — Oil pump, Clutch

- Brontekening: `https://www.gardenhirespares.co.uk/media/catalog/product/cache/52e9459b2885810d8c25f2dc39403969/m/s/ms261_c.jpg`
- Rechten: RIGHTS_UNKNOWN (niet publiceerbaar)
- Catalogussectie: oil_pump_clutch — Oil Pump. Clutch (SECTION_AND_VARIANT_MATCH)
  - positie 1 → `11416403200` Stihl Oil Pump — geen actieve Amazon-aanbieding
  - positie 2 → `00009580408` Stihl Washer — geen actieve Amazon-aanbieding
  - positie 3 → `00009972002` Stihl Compression Spring — geen actieve Amazon-aanbieding
  - positie 4 → `11216470603` Stihl Pump Piston — geen actieve Amazon-aanbieding
  - positie 5 → `11216419400` Stihl Bearing Bushing — geen actieve Amazon-aanbieding
  - positie 6 → `96469450160` Stihl O-Ring Din3771-S4X2 — geen actieve Amazon-aanbieding
  - positie 26 → `00006421231` Stihl 00006421231 Rim Sprocket 3/8" 7T — amazon.nl B000IBWVWG (srihldecoder2-21)

### Voorbeeld 2 — ms_260, sectie J — Tank housing

- Brontekening: `https://www.gardenhirespares.co.uk/media/catalog/product/cache/52e9459b2885810d8c25f2dc39403969/m/s/ms260_j.jpg`
- Rechten: RIGHTS_UNKNOWN (niet publiceerbaar)
- Catalogussectie: tank_housing — Tank Housing (SECTION_AND_VARIANT_MATCH)
  - positie 1 → `11213500834` Stihl Tank Housing — geen actieve Amazon-aanbieding
  - positie 2 → `11211226600` Stihl Collar Screw — geen actieve Amazon-aanbieding
  - positie 3 → `00009677247` Stihl Warning Pictogram Ms — geen actieve Amazon-aanbieding
  - positie 4 → `00003505800` Stihl 00003505800 Tank Vent For MS261 MS271 MS291 MS362 MS400 MS462 — geen actieve Amazon-aanbieding
  - positie 6 → `11217912800` Stihl Stop Buffer — geen actieve Amazon-aanbieding
  - positie 7 → `00003500533` Stihl 00003500533 Oil Tank Cap for MS171 MS200 MS261 MS362 MS462 MS500i — geen actieve Amazon-aanbieding
  - positie 15 → `00003503518` Stihl 00003503518 Pickup Body for MS200 MS231 MS380 MS400 MS440 MS441 — amazon.de B00QM7TH36 (srihldecode00-21)

### Voorbeeld 3 — 044, sectie B — Cylinder

- Brontekening: `https://www.gardenhirespares.co.uk/media/catalog/product/cache/52e9459b2885810d8c25f2dc39403969/0/4/044cylinder.jpg`
- Rechten: RIGHTS_UNKNOWN (niet publiceerbaar)
- Catalogussectie: cylinder — Cylinder (SECTION_AND_VARIANT_MATCH)
  - positie 1 → `11280201227` Stihl Cylinder And Piston 50Mm — amazon.de B00LAHOFMQ (srihldecode00-21)
  - positie 6 → `11280292301` Stihl Cylinder Gasket 0.5Mm — geen actieve Amazon-aanbieding
  - positie 44 → `11280292302` Stihl Cylinder Gasket 1Mm — geen actieve Amazon-aanbieding

### Voorbeeld 4 — ms_440, sectie B — Cylinder

- Brontekening: `https://www.gardenhirespares.co.uk/media/catalog/product/cache/52e9459b2885810d8c25f2dc39403969/m/s/ms440_b.jpg`
- Rechten: RIGHTS_UNKNOWN (niet publiceerbaar)
- Catalogussectie: cylinder — Cylinder (SECTION_AND_VARIANT_MATCH)
  - positie 1 → `11280201227` Stihl Cylinder And Piston 50Mm — amazon.de B00LAHOFMQ (srihldecode00-21)
  - positie 9 → `11280292301` Stihl Cylinder Gasket 0.5Mm — geen actieve Amazon-aanbieding

### Voorbeeld 5 — 026, sectie B — Cylinder, Muffler

- Brontekening: `https://www.gardenhirespares.co.uk/media/catalog/product/cache/52e9459b2885810d8c25f2dc39403969/0/2/026_b.jpg`
- Rechten: RIGHTS_UNKNOWN (niet publiceerbaar)
- Catalogussectie: cylinder — Cylinder (SECTION_AND_VARIANT_MATCH)
  - positie OFFICIAL_REF → `11210201200` Cylinder with piston 44mm — amazon.de B00PGX7STM (srihldecode00-21)

## 7. Rechten

| Bron | Rechthebbende | Status | Publiceerbaar |
| --- | --- | --- | --- |
| Garden Hire Spares (GHS) — STIHL IPL section pages | ANDREAS STIHL AG & Co. KG (artwork); GHS (page/photography layer) | RIGHTS_UNKNOWN | nee |
| STIHL official Illustrated Parts Lists | ANDREAS STIHL AG & Co. KG | PUBLICATION_RESTRICTED | nee |
| Local STIHL archive (batch2 local library + archive.org copies) | Various (STIHL, dealers, forum uploaders, archive.org uploaders) | RIGHTS_UNKNOWN | nee |
| PDF documents present in the repository (data/) | ANDREAS STIHL AG & Co. KG | PUBLICATION_RESTRICTED | nee |
| Own site icons (favicons/PWA) | StihlDecoder (own work) | PUBLICATION_ALLOWED | ja |

- Afbeeldingen met vastgestelde publicatierechten: **0**.
- `RIGHTS_UNKNOWN`: **2376** tekeningen (GHS).
- `PUBLICATION_RESTRICTED`: **3** lokale PDF's (STIHL).
- Een Scribd-abonnement of een openbaar bereikbare afbeelding is géén publicatietoestemming; alle referenties blijven metadata-only in de afgeschermde onderzoeksomgeving.

## 8. Conclusie en voorstel

**Technisch**: de keten tekening → positie → onderdeelnummer → aanbieding is aantoonbaar te bouwen voor 710 posities over 512 onderdelen, waarvan 9 posities direct een actieve Amazon-aanbieding opleveren; voor de overige tekeningen ontbreekt het aan een geresolveerde sectie-identiteit in onze eigen catalogus, niet aan de afbeelding.

**Juridisch**: 0 van 2376 tekeningen is vandaag publiceerbaar. Zonder licentie geen publieke viewer met GHS- of STIHL-artwork.

**Voorstel voor geautomatiseerde verwerking van de rest:**
1. Draai dit script op de machine met de lokale archieven (`PHASE77A_ARCHIVE_ROOTS=...`) om PDF's, Scribd-output en USA Parts-bestanden te hashen en te classificeren.
2. Los eerst de sectie-identiteit op: breid de bestaande sectie-resolutie uit zodat meer dan 6.0% van de fitments een echte `section_key` heeft. Zonder die stap blijft elke tekening een model-breed plaatje in plaats van een positie-viewer.
3. Koppel daarna per model de GHS-sectie aan de geresolveerde sectie (dit script doet dat al deterministisch) en valideer variantrevisies handmatig.
4. Publiceer niets tot een schriftelijke licentie of gelicenseerde catalogusfeed beschikbaar is; bouw de viewer intussen intern tegen de metadata.

## 9. Meest kansrijke bronnen en ontbrekende bestanden

- **Meest kansrijk**: de GHS-catalogus (2376 tekeningen, 224 modellen,direct gekoppeld aan model + sectienaam) — mits licentie.
- **Aanvullend**: de lokale archiefbibliotheek (1790 documenten, waarvan 430 als parts list) en de archive.org-set (663 documenten) — hier zitten de IPL-PDF's, maar de bestanden zijn hier niet aanwezig en de page-index bevat alleen tekst, geen afbeeldingen.
- **Ontbrekend in deze checkout**: de vier genoemde archiefmappen, de Scribd-output, USA Parts-bestanden en alle IPL-PDF's buiten de drie lokale handleidingen. Ook ontbreken beeldcoördinaten (x/y) per positienummer; onze data heeft alleen positienummers.
