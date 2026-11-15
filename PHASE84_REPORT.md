# Phase 84 — STIHL Archive Mining, Catalog Expansion & Affiliate Evidence Recovery

**Repository:** `gel2701/stihl-decoder` · **Startpunt:** `main` @ `609eeef` · **Branch:** `phase84/archive-mining`

## 1. Productiebaseline (gecontroleerd vóór wijzigingen)

| Onderdeel | Baseline | Gemeten |
|---|---:|---|
| Catalogusonderdelen | 18.397 | 18.397 (`data/parts_catalog.json`, `parts_count` = arraylengte) |
| SQLite `parts` | 18.397 | 18.397 |
| Model-fitmentrelaties | 181.394 | 181.394 |
| Evidence-rijen | 220.444 | 220.444 |
| Configuraties | 3.143 | 3.143 |
| ACTIVE eBay-aanbiedingen | 1.648 | 1.648 (productiestore, niet in deze checkout) |
| Onderdelen met eBay-koopmogelijkheid | 201 | 201 |
| ACTIVE Amazon-aanbiedingen | 99 / 86 onderdelen | registry ongewijzigd |

Er is niets aan bestaande ACTIVE-aanbiedingen, bronverwijzingen of kill-switches gewijzigd.

## 2. Archiefinventaris

Alle vijftien gevraagde archieven zijn in deze uitvoeromgeving **niet aanwezig** (gecontroleerd in `data/`, `output/`, `docs/`, `reports/` en de repository-root; 0 van 15 gevonden). Dat is consistent met `output/phase77a/PHASE77A_DIAGRAM_INVENTORY.json`, dat dezelfde paden als `NOT_PRESENT_IN_THIS_CHECKOUT` registreerde.

Wel lokaal beschikbaar zijn de eerder geëxtraheerde, gecommitte artefacten:

| Artefact | Rijen | Gebruikt voor |
|---|---:|---|
| `output/phase58a/raw/parts.json` | 7.538 | GHS-onderdelen met titel, producttype en product-URL |
| `output/phase58a/raw/fitments.json` | 8.722 | GHS-modeltoepassingen met canonieke model-ID |
| `output/phase58a/GHS_FITMENTS.json` | 7.394 | geaccepteerde GHS-fitments na import-gates |
| `data/sources/ghs_stihl_source_ledger.json` | 16.522 | provenance per productpagina |
| `data/harvest/phase54f/final_backlog_registry.json` | 1.053 | uitgestelde new-part-observaties |
| `data/part_fitment_evidence.json` (8 shards) | 218.639 | canonieke evidence-store |
| `data/parts_supersessions.json` | 22 relaties | officiële TI-vervangingen |

## 3. Nieuwe catalogusonderdelen — 0 (bewust)

Elk lokaal geëxtraheerd nummer is genormaliseerd en vergeleken met de catalogus:

| Bron | Records | Nummers niet in catalogus |
|---|---:|---:|
| GHS source ledger | 16.522 | 30 |
| GHS raw parts | 7.538 | 21 |
| Phase 54F deferred observaties | 1.053 | 278 |
| Canonieke evidence-store | 218.639 | **0** |
| GHS raw fitments | 8.722 | 0 (na ontdubbeling tegen alle 181.394 relaties) |

Van de 30 GHS-nummers zijn er 4 afgewezen (apparel/accessoire of reseller-intern nummer) en 26 blijven `NEEDS_EVIDENCE`: het zijn stuk voor stuk **aftermarket-aanbiedingen** van een reseller die het STIHL-nummer alleen citeert ("Stihl TS400 Carburettor – 4223 120 0600", product type `AFTERMARKET`). Er is geen onafhankelijke OEM-bron voor die nummers, dus toevoegen zou een onbewezen productidentiteit in de catalogus zetten. De 278 Phase 54F-nummers hebben alleen een diagramreferentie zonder zelfstandige identiteit en blijven in de bestaande werkvoorraad. **Geen enkel onderdeel is toegevoegd of verwijderd.**

## 4. Modelcompatibiliteit — 0 nieuwe relaties (bewezen verzadiging)

De evidence-store bevat 1.805 rijen zonder exact passende `fitment_id`. Analyse daarvan:

- 1.805 / 1.805 hebben `variant_key = "standard"`, terwijl de canonieke rij voor dezelfde `(part_number, canonical_model_id)` al bestaat met `variant_key = "base"` (0 rijen zonder enige relatie).
- Alle GHS-`(part, model)`-paren uit `raw/fitments.json` bestaan al in `model_part_fitments` (0 ontbrekend).

Een rij toevoegen zou dus een **dubbele semantische relatie** opleveren, geen nieuwe bewezen compatibiliteit. Daarom is hier niets geschreven; de telling blijft 181.394.

## 5. Twee open supersession-doelen

| Nummer | Status | Oorzaak |
|---|---|---|
| `48040071002` | NEEDS_EVIDENCE | TI_09_1998_30 noemt alleen "the version"; geen naam, model of IPL-regel in de lokale bronnen |
| `42033500502` | NEEDS_EVIDENCE | TI_40_1998_30 idem |

De vervangingsrichting en de brondocumenten zijn ongewijzigd; beide nummers blijven buiten de catalogus. `output/phase84/PHASE84_SUPERSESSION_TARGETS.json` legt de doorzochte scope vast.

## 6. eBay — 42 nieuwe ACTIVE aanbiedingen op 5 onderdelen

Live run (`scripts/phase80_evidence_batch.mjs --live`) op de gedocumenteerde, nog niet doorzochte wachtrij `output/phase82/PHASE82_REMAINING_QUEUE.json` (109 onderdelen).

**Correctie op een eerste aanname:** deze vijf onderdelen hadden al een bewezen ACTIVE-kooplink uit Phase 82 (41 aanbiedingen). Phase 84 voegt dus **extra aanbiedingen** toe op die onderdelen — geen nieuw koopbaar onderdeel. Dat is expliciet gecontroleerd: 0 van de 42 `item_id`'s komt voor in de Phase 81/82/83-payloads en alle vijf onderdelen staan in `output/phase82/ebay_offers_phase82.json`. De productiepagina's van deze onderdelen tonen al eBay-koopknoppen met `campid=5339245312`.

| Onderdeel | Nieuwe ACTIVE aanbiedingen |
|---|---:|
| `11280292301` | 16 |
| `00009302212` | 9 |
| `11201290905` | 7 |
| `41281290900` | 6 |
| `42291290901` | 4 |

- **42/42** nieuwe listings, alle `SHIPS_TO_NL_CONFIRMED`, campagnecode `5339245312` in elke affiliate-URL, resolverstatus `VERIFIED`, `store_rejected_by_guard = 0`.
- Matchbewijs: 39 × `EXACT_MPN`, 3 × `EXACT_PART_NUMBER_WITH_CORROBORATION`.
- 33 kandidaten bleven `TITLE_ONLY_NEEDS_EVIDENCE` (geen zelfstandige MPN/GTIN-koppeling).
- 12 kandidaten `REJECTED` met `CONFLICTING_MPN` (tegenstrijdig onderdeelnummer in de listing zelf).
- **Rate limit:** na deze 5 onderdelen gaf de eBay Browse API `HTTP 429`; ook na 8 minuten wachten bleef dat zo. De overige 104 wachtrij-onderdelen zijn daarom niet in deze fase doorzocht en blijven in de queue staan. Er is niets op titelovereenkomst geactiveerd.

Payload: `output/phase84/ebay_offers_phase84.json` (42 aanbiedingen).

## 7. Amazon — 0 nieuwe aanbiedingen (geblokkeerd)

Geen PA-API-credentials in deze omgeving (`AMAZON_ACCESS_KEY`/`AMAZON_SECRET_KEY` ontbreken) en de publieke Amazon-pagina's leveren geen buybox- of NL-leveringsbewijs. De drie VERIFIED-kandidaten en de 55 RESEARCH_REQUIRED-kandidaten blijven ongewijzigd; er is geen ASIN verzonnen of ongeverifieerd geactiveerd.

## 8. GSC-dekking

Gemeten prioriteitsmodellen (17 modellen, 4.601 catalogusonderdelen):

| Metric | Voor | Na |
|---|---:|---:|
| Onderdelen met directe koopmogelijkheid | 252 | 252 |
| Modellen met extra aanbiedingen op bestaande directe onderdelen | — | **11** (MS 440, BR 600, MS 250, BG 86, MS 461, MS 390, HS 45 +2, MS 260 +2, FS 55 +2, FS 85 +2, FS 350) |
| Nieuwe ACTIVE eBay-aanbiedingen in deze modellen | — | 15 part-model-koppelingen |

Omdat er geen nieuw koopbaar onderdeel bijkomt, blijft de directe onderdelen dekking per model gelijk; wat groeit is het aantal kooplinks (meer listings, dus meer prijs-/aanbiederskeuze) per onderdeel.

## 9. Publicatie

De catalogus is niet gewijzigd, dus er is geen catalogusmigratie nodig. De 42 aanbiedingen staan in de repo-payload; de productiestore op de Render-persistente schijf moet één keer idempotent bijgewerkt worden. Bestaande 1.648 aanbiedingen worden daarbij behouden (`saveEbayOfferStore` is additief op `(item_id, marketplace, part_number)`), verwacht totaal **1.690** ACTIVE aanbiedingen.

Tot die import is uitgevoerd, is de fase-publicatie beperkt tot de code en de audit-artefacten; de nieuwe kooplinks zijn dan nog niet zichtbaar op STIHLDecoder.nl.

## 9a. Metricstabel

| Metric | Voor | Nieuw | Na |
|---|---:|---:|---:|
| Catalogusonderdelen | 18.397 | 0 | **18.397** |
| Fitmentrelaties | 181.394 | 0 | **181.394** |
| Nieuwe officiële bewijsrecords | — | 0 | 218.639 evidence-rijen ongewijzigd |
| Nieuwe supersession-relaties | — | 0 | 22 relaties (11 actief in catalogus) |
| Open supersession-doelen | 2 | — | **2** (`48040071002`, `42033500502`; TI noemt alleen "the version") |
| Nieuwe ACTIVE eBay-aanbiedingen | 1.648 | **42** | 1.690 na store-import |
| Nieuwe ACTIVE Amazon-aanbiedingen | 99 | 0 | 99 (PA-API niet beschikbaar) |
| Unieke onderdelen met koopmogelijkheid | 201 | 0 | **201** |
| Kandidaten automatisch verrijkt | — | 5 onderdelen / 42 nieuwe listings | 33 NEEDS_EVIDENCE, 12 REJECTED in dezelfde batch |
| Resterende NEEDS_EVIDENCE | — | — | 33 title-only (batch), 104 ondoorzochte wachtrij-onderdelen (HTTP 429), 26 GHS-aftermarketnummers, 278 Phase 54F-kandidaten, 2 supersession-doelen |
| GSC-modeldekking | 252 directe onderdelen | 0 | 252 (15 part-model-koppelingen met extra aanbiedingen) |
| Productiepublicatie | — | — | merge `cd22ea6` live op STIHLDecoder.nl; aanbiedingen pas na store-import |

## 10. Tests

- `tests/phase84_affiliate_recovery.test.js` (nieuw, 4 tests): elke ACTIVE aanbieding is Two-Gate-bewezen, NL-leverbaar, voorzien van de juiste campagncode en verwijst naar een bestaand catalogusonderdeel; gerapporteerde aantallen moeten exact met de payload overeenkomen; catalogus- en fitmentbaseline mogen niet verschuiven; de twee supersession-doelen houden richting en status.
- Stage A (`check_affiliate_consistency.mjs`), Stage B (`affiliate_quality_gate.test.js`), de geraakte suites en de volledige productiesuite zijn gedraaid; resultaten staan in de PR.

## Bronnen die niet automatisch verwerkt konden worden

1. Alle 15 gevraagde archieven (`stihl_archive_documentation.db`, `stihl_archive_official_documentation[_v2].zip`, `stihl_gardenhirespares_chainsaws_archive.zip`, `stihl_gardenhirespares_semantic_archive.zip`, `stihl_local_library.db`, `stihl_manuel_service_documentation.db`, `stihl_models_[full_]documentation_archive.zip`, `stihl_opeforum_documentation.db`, `stihl_parts_knowledge_graph.json`, `stihl_scribd_documentation.db`, `stihl_scribd_official_documents_archive.zip`, `stihlusa_knowledge_graph.json`, `stihlusa_semantic_archive.zip`) — niet aanwezig in deze checkout.
2. Amazon PA-API en publieke Amazon-productpagina's (buybox/NL-levering niet vast te stellen).
3. 104 eBay-wachtrij-onderdelen — geblokkeerd door `HTTP 429` van de Browse API.
4. 26 GHS-aftermarketnummers en 278 Phase 54F-kandidaten — bewaard als NEEDS_EVIDENCE (geen zelfstandige identiteit).
5. `48040071002` en `42033500502` — officiële TI noemt alleen "the version".
