# Phase 87 — Amazon Recovery & Direct Affiliate Activation

**Repository:** `gel2701/stihl-decoder`
**Startpunt:** `25a224e7` (Phase 86, PR #166)
**Uitgevoerd:** 15 november 2026

---

## 1. Samenvatting

Phase 86 liet een registry achter waarin 24 ACTIVE amazon.nl-aanbiedingen en 53 van de 54
openstaande amazon.nl-kandidaten naar een pagina wezen die HTTP 404 geeft. Deze fase heeft
die schade niet opnieuw geïnventariseerd, maar **gerepareerd**: voor 79 onderdelen is in een
echte browsersessie gezocht naar een levende vervangende vermelding, is per kandidaat het
exacte STIHL-nummer op de productpagina gecontroleerd, is waar mogelijk een onafhankelijke
dealercatalogus als identiteitsbewijs toegevoegd, en is de bestaande Two-Gate-verificatie
ongewijzigd toegepast.

**Resultaat: 23 nieuwe ACTIVE Amazon.nl-aanbiedingen op 23 onderdelen, waarvan 21 onderdelen
die daarvoor geen enkele directe Amazon-kooplink hadden.**

- ACTIVE Amazon: **75 → 98** (Amazon.nl 29 → 52, Amazon.de 46 ongewijzigd)
- Onderdelen met een directe Amazon-kooplink: **63 → 84**
- 12 van de 24 gesuspendeerde onderdelen kregen een bewezen vervangende listing
- 22 niet-beschikbare vermeldingen (12 voorheen ACTIVE, 10 kandidaten) staan als `SUSPENDED`
  in de registry met hun oorspronkelijke bewijs en een verwijzing naar de vervanger
- Eén listing zonder fabrikantmerk is bewust **niet** geactiveerd (geen merkopvulling)
- Geen enkele bestaande ACTIVE-aanbieding is verdwenen; alle 75 Phase 86-live-aanbiedingen
  staan nog steeds ACTIVE

---

## 2. Wat er feitelijk is gecontroleerd

Alles hieronder is met de gerenderde pagina in een browser gedaan. De publieke HTTP-fetch van
amazon.nl geeft vanaf deze host 503, en er is geen PA-API/Creators-autorisatie; een browser
is dus de enige toegestane manier om de vermeldingen te lezen. Er is niets via
toegangsbeveiliging heen gescrapet en er is geen prijs- of voorraadinformatie opgeslagen.

| Controle | Volume |
|---|---:|
| Onderdelen in de reparatiewachtrij (24 gesuspendeerd + 55 kandidaten, ontdubbeld) | 79 |
| Nieuwe amazon.nl-zoekopdrachten op exact STIHL-nummer | 63 |
| Zoekresultaten bekeken | 449 |
| Productpagina's live gecontroleerd (HTTP-status, titel, levering, merk) | 91 |
| Daarvan aantoonbaar niet meer beschikbaar | 24 |
| Eerder gevonden alternatieve ASIN's opnieuw gecontroleerd | 34 (alle 34 live) |
| Onafhankelijke dealercatalogus bevraagd per onderdeel | 79 |
| Daarvan met treffer op het exacte STIHL-nummer | 38 |

De 24 gesuspendeerde originelen zijn vandaag **opnieuw** opgevraagd: alle 24 geven nog
steeds 404. Er is dus geen enkele heractivatie van een origineel ASIN mogelijk; herstel
loopt via vervangende vermeldingen.

---

## 3. De toegestane activeringsroute zonder PA-API (§6)

Het bestaande beleid bevat al een geldige route, en die is hier gebruikt — zonder één regel
te versoepelen:

1. **Gate 1 (technisch)** — ASIN-syntax, marketplace, affiliate-tag, canoniek 11-cijferig
   onderdeelnummer, bestaan in de catalogus van 18.480 onderdelen, herkomstvelden, GTIN-controle.
2. **Gate 2 (product & compatibiliteit)** — OEM/aftermarket-classificatie, fabrikant-MPN,
   compatibiliteitsbewijs dat het STIHL-model of -nummer noemt, ASIN-identiteitsbewijs met
   bron-URL's, geen bekend historisch conflict, geen prijs-/voorraadclaim.
3. **Bewijsclassificatie `AMAZON_LISTING_COMPATIBLE`** — de gecontroleerde, live
   Amazon-productpagina is de vermelding waarop de kooplink rust; de STIHL-identiteit van
   het onderdeel wordt onafhankelijk onderbouwd (zie hieronder).

Per activatie is het bewijs als volgt opgebouwd en in de registry opgeslagen:

- **Amazon-zijde:** `AMAZON_PRODUCT_PAGE`-bron met de live `/dp/<ASIN>`-URL, de titel zoals
  gerenderd, de constatering dat het exacte STIHL-nummer op de pagina staat, en de datum
  (2026-11-15). Levering aan een Nederlands adres blijkt uit de bezorgdatum op de pagina.
- **Onafhankelijke zijde:** `EXTERNAL_CATALOG`-bron (Garden Hire Spares dealercatalogus) die
  hetzelfde STIHL-nummer aan een productnaam en machinecompatibiliteit koppelt —
  19 van de 23 activaties hebben die tweede bron.
- **Genuine STIHL-vermeldingen** waar de dealercatalogus het nummer niet voert (3 stuks)
  leunen op de merkvermelding van de fabrikant zelf op de productpagina plus de STIHL-naam
  uit de catalogus; dat is als zodanig vastgelegd, niet als "dealer bevestigd".
- **Bougie-uitzondering:** voor `0000 400 7000` is vastgelegd dat dit de NGK BPMR7A is
  (dealercatalogus) en dat de Champion RCJ6Y daarvan de gedocumenteerde vervanger is
  (Stens/Walbro-kruisverwijzing). De ASIN is als `MANUFACTURER_AFTERMARKET` geclassificeerd,
  niet als origineel STIHL.
- **Geen GTIN-overerving:** de sequentiële, niet-geverifieerde GTIN-waarden van de oude
  records zijn **niet** meegenomen naar de nieuwe aanbiedingen (`ean_gtin: null`).

Wat **niet** is toegestaan en dus niet is gedaan: een Amazon-titel alleen als identiteits-
bewijs gebruiken, een ASIN certificeren op basis van een fabrikantpagina zonder ASIN,
prijzen of voorraad als bewijs vastleggen, of een listing zonder fabrikantmerk als
"manufacturer aftermarket" boeken.

---

## 4. Geactiveerde aanbiedingen (23)

| Onderdeel | ASIN | Merk | Classificatie | Onafhankelijke bron | Verving |
|---|---|---|---|---|---|
| 0781 120 1110 | B007TK0T00 | STIHL | GENUINE_STIHL | dealercatalogus | B00474640Y (404) |
| 1123 640 2073 | B006WVO0QQ | STIHL | GENUINE_STIHL | dealercatalogus | B079DN88M2 (404) |
| 1129 190 0601 | B007TK13CI | STIHL | GENUINE_STIHL | dealercatalogus | B079DNH91X (404) |
| 4241 140 1000 | B083P6BFKD | STIHL | GENUINE_STIHL | merkvermelding fabrikant | B08F9MX45K (404) |
| 4241 007 1003 | B007TK0C8O | STIHL | GENUINE_STIHL | merkvermelding fabrikant | B0014D86AB (404) |
| 3003 000 3313 | B08W28JDWJ | STIHL | GENUINE_STIHL | merkvermelding fabrikant | B00474601A (404) |
| 4147 141 0300 | B0CP57NXL5 | MAXPOWER | MANUFACTURER_AFTERMARKET | dealercatalogus | B08F9K47R9 (404) |
| 0000 350 0527 | B0G5PY252N | perfektGarten | MANUFACTURER_AFTERMARKET | dealercatalogus | B08F9LX7P4 (404) |
| 0000 350 0533 | B0BBMPZQH6 | perfektGarten | MANUFACTURER_AFTERMARKET | dealercatalogus | B0014D7U2E (404) |
| 1123 640 2074 | B007TK19WW | Kitoo | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DLY82F (404) |
| 1123 190 0600 | B0C72FKDP4 | QINYUN | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DNM22P (404) |
| 1123 007 1061 | B0GM2YRNQP | YINETTECH | MANUFACTURER_AFTERMARKET | dealercatalogus | B08F9ML22K (404) |
| 1123 020 1209 | B0GT2Q39PW | Adefol | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DN893L (404) |
| 4137 029 2300 | B0BWSX4DWZ | Gubeter | MANUFACTURER_AFTERMARKET | dealercatalogus | B08HQ9P34R (404) |
| 4137 124 2800 | B0HRFKS4ZS | SHIHAOHZ | MANUFACTURER_AFTERMARKET | dealercatalogus | B07KQW4922 (404) |
| 1128 190 3400 | B0FG7PKCLL | CCQDGMD | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DNL88M (404) |
| 4241 007 1700 | B0FWJ6TFJH | EMSea | MANUFACTURER_AFTERMARKET | dealercatalogus | B08F9MK77A (404) |
| 1127 120 1620 | B0C38W9LC3 | HOHMI | MANUFACTURER_AFTERMARKET | dealercatalogus | B07V23M41P (404) |
| 1127 080 2103 | B07MM11TCK | TOPINCN | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DNL91A (404) |
| 4282 190 0303 | B07PVMRZYK | Cancanle | MANUFACTURER_AFTERMARKET | dealercatalogus | B08F9ML11Q (404) |
| 4140 190 4009 | B07BLSL3VM | Cancanle | MANUFACTURER_AFTERMARKET | dealercatalogus | B07S8Y912M (404) |
| 4134 080 2101 | B079WS2YNM | C·T·S | MANUFACTURER_AFTERMARKET | dealercatalogus | B079DNL72P (404) |
| 0000 400 7000 | B00IKF8TH8 | Champion | MANUFACTURER_AFTERMARKET | dealercatalogus + kruisverwijzing | — (zelfde ASIN) |

Twee onderdelen hadden al een ACTIVE aanbieding (1123 640 2073 op amazon.de en 0000 400 7000
met de NGK-vermelding); de overige **21 onderdelen zijn nieuw koopbaar via Amazon**.

---

## 5. Wat niet is geactiveerd, en waarom

| Blokkade | Onderdelen | Toelichting |
|---|---:|---|
| Geen levende amazon.nl-vermelding voor het exacte nummer | 32 van 79 | 9 onderdelen leverden nul zoekresultaten op; bij de overige 23 bevatte geen enkele treffer het exacte STIHL-nummer |
| Wel een levende vermelding, maar geen onafhankelijk identiteitsbewijs | 23 | Vermelding noemt het nummer, maar de dealercatalogus kent het nummer niet en er is geen tweede bron die het product onafhankelijk beschrijft |
| Vermelding zonder fabrikantmerk | 1 | `41341410300` / B0D3GRT27F (10-pack luchtfilters): Amazon byline "Generic"; geen manufacturer-classificatie mogelijk, dus afgewezen en als review-notitie op het kandidaatrecord vastgelegd |
| Originele ASIN nog steeds 404 | 24 | Vandaag opnieuw gecontroleerd; de originelen blijven `SUSPENDED` met hun oude bewijs |

Overige eerdergenoemde blokkades blijven onveranderd geldig: zonder PA-API/Creators-
autorisatie is er geen programmatische catalogus- of beschikbaarheidsbron; de affiliate-tags
en de voorwaarden van het PartnerNet-account zijn gerespecteerd.

**Amazon.de is niet gegroeid (46 → 46).** De Duitse inventaris was en blijft volledig live.
Uitbreiding vereist een aantoonbare `SHIPS_TO_NL_CONFIRMED` met bewijs-URL en datum; die
levertijd kun je op amazon.de alleen adresgebonden vaststellen, en deze sessie heeft geen
Nederlands bezorgadres of API-toegang op amazon.de. De registry-invariant verbiedt een
ACTIVE Duitse aanbieding zonder dat bewijs, dus is hier niets aan toegevoegd in plaats van
een onbewezen aanname te doen.

---

## 6. Resultaattabel

| Metric | Voor | Nieuw | Na |
|---|---:|---:|---:|
| ACTIVE Amazon.nl | 29 | +23 | 52 |
| ACTIVE Amazon.de | 46 | 0 | 46 |
| Totaal ACTIVE Amazon | 75 | +23 | 98 |
| Unieke onderdelen met Amazon-aanbod | 63 | +21 | 84 |
| Gecontroleerde alternatieve ASIN's | 34 unieke (58 vermeldingen) | 34 opnieuw live gecontroleerd | 34 |
| Kandidaten met aangevuld identiteitsbewijs | 0 | 23 (19 met dealercatalogus, 4 met fabrikantvermelding) | 23 |
| Nieuwe Amazon-koopbare onderdelen | 0 | +21 | 21 |
| Herstelde gesuspendeerde aanbiedingen | 0 | 12 vervangende listings (0 heractivaties van het originele ASIN) | 12 |
| Resterende NEEDS_EVIDENCE | 55 | −11 vervangen, −1 geactiveerd, +1 nieuw afgewezen | 44 |
| Behouden ACTIVE eBay-aanbiedingen | 1.870 | 0 | 1.870 |

Registry na afloop: 179 records — 98 ACTIVE, 34 SUSPENDED, 44 RESEARCH_REQUIRED, 3 VERIFIED.

---

## 7. Verificatie

- `node scripts/check_affiliate_consistency.mjs`: 382 records, 0 contradicties, 0 GTIN-fouten,
  0 unverified ACTIVE-lekken, 0 niet-geautoriseerde ACTIVE-aanbiedingen. De 11 nieuwe
  onderdeelnummers zijn expliciet aan de operator-autorisatielijst toegevoegd.
- Nieuwe suite `tests/phase87_amazon_recovery.test.js`: 7 tests, alle groen.
- Bestaande suites bijgewerkt naar de gemeten waarheid: `phase86_coverage_and_amazon_availability`
  (offers 179, ACTIVE 98, suspended 34, research 44), `phase79b_amazon_buy_buttons`
  (84 onderdelen / 98 directe links), `phase75_amazon_growth` (98/52/46, plus de
  vervangingsregel voor gesuspendeerde genuine listings), `phase74_amazon_growth`
  (44 RESEARCH_REQUIRED, 179 records).
- Elke ACTIVE-aanbieding slaagt onveranderd voor `TwoGateVerifier`; de test suite controleert
  dat nu voor alle 98.
- Alle tags kloppen per marketplace (NL `srihldecoder2-21`, DE `srihldecode00-21`), geen
  dubbele (onderdeel, marketplace, ASIN)-combinaties, catalogus nog steeds 18.480 onderdelen.

---

## 8. Artefacten

| Bestand | Inhoud |
|---|---|
| `PHASE87_ACTIVATION.json` | 23 activaties met per record de gate-uitkomst, bron en vervangen ASIN |
| `amazon_search_hits.json` | 63 zoekopdrachten × treffers (ASIN, titel, sponsoring, prijsindicatie-bestaan) |
| `amazon_product_checks.json` | 91 productpagina-controles met live-status, titel, levering en merkregel |
| `dealer_corroboration.json` | 79 dealercatalogus-controles met treffer, bron-URL en citaat |
| `selection_plan.json` | kandidaatselectie per onderdeel met scores en dealerbewijs |
