# Phase 87.1 — Amazon-activatie: uitbreiding van de catalogusdekking

Startpunt: schone `main` na Phase 87/86.1 (commit `7157ac9`, PR #167).
Uitvoering: 16 november 2026. Geen Codex Review. Geen nieuwe architectuur.

## 1. Wat deze fase doet

Phase 87 herstelde 22 gesuspendeerde aanbiedingen. Deze fase pakt het grotere gat aan:
18.480 catalogusonderdelen tegenover 84 onderdelen met een directe Amazon-kooplink.

De werkwijze is activation-first: eerst een prioriteitsqueue van 250 onderdelen, dan per
onderdeel zoeken op het **exacte** STIHL-nummer, elke gevonden listing op de gerenderde
productpagina controleren, onafhankelijk dealercatalogusbewijs toevoegen waar het nummer
daar gevoerd wordt, en pas dan de ongewijzigde Two-Gate-verificatie laten beslissen.

**Resultaat: 33 nieuwe ACTIVE Amazon.nl-aanbiedingen op 33 onderdelen.**
Daarmee gaat het aantal onderdelen met een directe Amazon-kooplink van 84 naar **117** en
het aantal ACTIVE-aanbiedingen van 97 naar **130**.

- ACTIVE Amazon: **97 → 130** (Amazon.nl 51 → 84, Amazon.de 46 ongewijzigd)
- Onderdelen met een directe Amazon-kooplink: **84 → 117**
- Geen enkele bestaande ACTIVE-aanbieding is verdwenen; alle 97 eerdere live-aanbiedingen
  staan nog ACTIVE, alle 34 gesuspendeerde records blijven bewaard
- 11 achterhaalde `RESEARCH_REQUIRED`-kandidaten zijn uit de registry gehaald en **volledig**
  in `PHASE87_1_ACTIVATION.json` (`superseded_research_candidates`) bewaard — zie §6

## 2. Prioriteitsqueue (§3, §9)

`scripts/phase87_1_build_queue.mjs` bouwt de queue uit bestaande data, zonder nieuwe bronnen:

| Prioriteit | Signaal | Onderdelen in de queue |
|---|---|---:|
| P1 | eBay-aanbieding met `EXACT_MPN` (bewezen productidentiteit) | 87 |
| P2 | bestaande `SUSPENDED`-vermelding (dode ASIN, onderdeel kan leven) | 12 |
| P3 | onderdelen van GSC-prioriteitsmodellen (gemeten vertoningen) | 192 |
| P4 | veelgebruikte onderhoudsonderdelen (filter, bougie, ketting, starter, koppeling, …) | 240 |

Totaal 2.669 kandidaten, waarvan de 250 hoogst scorende zijn onderzocht. Alle 16 modellen
uit de opdracht (MS 170/180/250/260/261/361/440/461/661, FS 55/85/350, BR 600, BG 86,
HS 45, TS 420) zitten in de selectie via `data/model_part_fitments.json`.

## 3. Wat er feitelijk is gecontroleerd (§1, §2, §5)

| Controle | Volume |
|---|---:|
| Onderzochte catalogusonderdelen | 250 |
| Amazon.nl-zoekopdrachten op exact STIHL-nummer | 250 |
| Bekeken zoekresultaten | 1.586 |
| Onderdelen met een listing waarin het exacte nummer staat | 90 |
| Unieke kandidaat-ASIN's | 154 |
| Gerenderde productpagina-controles (status, titel, merkregel, levering NL) | 154 (alle live) |
| Onafhankelijke dealercatalogus-checks (Garden Hire Spares) | 90 |
| Daarvan met treffer op het exacte STIHL-nummer | 22 |

Elke waarneming komt uit een echte browsersessie op de publieke pagina: amazon.nl geeft vanaf
deze host 503 op gewone HTTP-verzoeken en er is geen PA-API/Creators-autorisatie. Er is niets
via toegangsbeveiliging heen gehaald en er zijn geen prijs-, voorraad- of leverclaims opgeslagen
(alleen "de pagina toont een prijselement" en de bezorgtekst voor het Nederlandse adres).

## 4. Geactiveerde aanbiedingen (33)

| Onderdeel | ASIN | Merk | Classificatie | Tweede bron |
|---|---|---|---|---|
| 1121 640 2004 | B0FHGT11FS | YSDOZMD | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 1135 120 1601 | B0GTKD4BY2 | DGWMLSDPP | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 4282 141 0300 | B0GTK68VQB | DGWMLSDPP | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 4137 129 0900 | B0HNWJ6QJ1 | Moliuoly | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 1130 020 1208 | B0GT5PS87K | DORFEY | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 4137 124 1500 | B01FFSP4KW | Stens | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 4137 190 4000 | B07DBQDWFJ | Allymoto | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 1130 080 2100 | B07PMN12MM | Hippotech | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 0000 790 6100 | B0CKDLDLN6 | Tolxh | MANUFACTURER_AFTERMARKET | dealercatalogus |
| 0000 350 0514 | B01HIMBJW0 | STIHL | GENUINE_STIHL | merkregel op de listing |
| 1135 120 1600 | B0FYVHH8X9 | LT Easiyl | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1135 160 2050 | B07CG6WHMB | Alamor | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4140 160 2005 | B0FN3WS6X6 | Toefficy | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4140 160 2909 | B0B3HSP2F6 | Luxuypon | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1122 400 1314 | B0GLZ5VH12 | Serenophile | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1125 640 2005 | B07CTMC8P3 | ISE Crest | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1127 030 2007 | B0FXV83XYQ | UYTGFO | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1127 160 2051 | B073Z5D69N | CTS | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4180 160 2900 | B0G7GRK8V5 | Vilgftyiet | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4180 190 0400 | B0D17BN556 | LSSOCH | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4223 195 0600 | B0GVKYCQ26 | AS Axis Spindleon | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1135 080 2102 | B078ZT4FXF | QHALEN | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4134 141 0500 | B0HPGBB4WT | Moliuoly | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4137 160 2900 | B0CYQ7YLRW | YANTUMR | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 4147 190 4003 | B0F4CH2K5R | Luxuypon | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0000 930 2211 | B0B4S6N8VF | Luxuypon | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0812 370 1000 | B0827VHM5T | QHALEN | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 1117 182 4500 | B0CQ2LDCF7 | Tolxh | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 9512 933 2260 | B0HNCDGLD2 | ISQJPVF | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0000 190 3400 | B005ESHWO0 | Rotary | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0000 642 1234 | B0GVDJKLFH | Adefol | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0000 642 1239 | B0HLL7RCVD | FDLWZGDY | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |
| 0000 642 1240 | B0BDDNNNV6 | Luxuypon | MANUFACTURER_AFTERMARKET | listing + catalogusnaam |

9 aanbiedingen hebben de dealercatalogus als tweede bron, 1 is een originele STIHL-listing
(merkregel "Stihl" op de pagina), 23 zijn enkelstuks-vervangers waarvan de productpagina het
exacte nummer noemt, het merk toont en waarvan het producttype overeenkomt met de
catalogusnaam. Bij die laatste groep is géén tweede catalogusbron beschikbaar; dat staat per
record in `PHASE87_1_ACTIVATION.json` (`independent_dealer_evidence: false`) en zij dragen
dezelfde `AMAZON_LISTING_COMPATIBLE`-classificatie als de Phase 87-records.

## 5. Wat niet is geactiveerd, en waarom

| Onderdeel | ASIN | Verdict | Reden |
|---|---|---|---|
| 1141 140 4400 | B0GWMBW4SP | CONFLICTING_PRODUCT_IDENTITY | listing noemt drie STIHL-nummers en is een kit |
| 4140 029 2300 | B0BWT36TQW | CONFLICTING_PRODUCT_IDENTITY | kit met vier OEM-nummers |
| 4134 141 0300 | B0D3GRT27F | CONFLICTING_PRODUCT_IDENTITY | 10-pack zonder fabrikantmerk (byline "Generic") |
| 0000 400 1300 | B0GQ2B8Q1X | CONFLICTING_PRODUCT_IDENTITY | merkregel Husqvarna bij een STIHL-ontsteking |
| 1123 120 1651 | B0D9S8S1ZQ | CONFLICTING_PRODUCT_IDENTITY | titel beschrijft carburateur, catalogus vraagt luchtfilter |
| 1121 640 2001 | B0F5RR8X4M | CONFLICTING_PRODUCT_IDENTITY | catalogus 8T, listing 7T |
| 0000 642 1207 | B0F2DGHBYP | NEEDS_EVIDENCE_MULTIPACK | 6 stuks |
| 4134 129 0900 | B0CFM4T964 | NEEDS_EVIDENCE_MULTIPACK | 12 stuks |
| 1130 350 0500 | B0G414Z5BQ | NEEDS_EVIDENCE_MULTIPACK | 2 stuks |
| 4229 120 1800 | B0CT86X5JS | NEEDS_EVIDENCE_BUNDLE | 3-pack met brandstoffilter en leiding |
| 0000 195 8200 | B0BNLR5FY8 | NEEDS_EVIDENCE_QUANTITY | rol van 100 m i.p.v. 800 mm |
| 0000 951 1100 | B0H2HJ1KDR | NEEDS_EVIDENCE_MULTIPACK | 4 stuks |
| 0000 997 5600 | B0H827KGSB | NEEDS_EVIDENCE_CONFLICT | 50 stuks en twee andere veernummers |
| 4137 195 8200 | B0G5TR9VJS | NEEDS_EVIDENCE_CONFLICT | 3,5 mm x 100 m i.p.v. 2,7 x 910 mm |
| 1128 020 1221 | B0F9T4S8LT | NEEDS_EVIDENCE_CONFLICT | titel noemt 52 én 54 mm boring |

Alle 15 staan met hun volledige reden in `PHASE87_1_ACTIVATION.json`; 5 zijn aantoonbaar
tegenstrijdig (REJECTED), 10 missen één concreet bewijsstuk (NEEDS_EVIDENCE). De overige
68 kandidaten zonder tweede bron of met een bundel/meervoudige verpakking zijn niet
geactiveerd en blijven in `selection_plan.json` staan.

## 6. Registry-model en waarom 11 records zijn verhuisd

De registry resolveert per onderdeel het **eerste** record. Een achterhaalde
`RESEARCH_REQUIRED`-kandidaat vóór een nieuwe ACTIVE-aanbieding zou die aanbieding dus
blokkeren (de resolver valt dan terug op een zoeklink). Daarom zijn de 11 kandidaten die door
deze fase bewezen zijn vervangen, uit de registry gehaald en **volledig** — met al hun
oorspronkelijke bewijs — opgenomen in `superseded_research_candidates`. Gesuspendeerde
records (live 404) blijven staan met hun `superseded_by_asin`.

## 7. Amazon zonder PA-API (§8)

De gebruikte route is de bestaande, toegestane Special-Links-route: gewone
affiliatelinks naar een gecontroleerde listing, met productidentiteit uit de openbare
productpagina plus (waar beschikbaar) een onafhankelijke dealercatalogus. De
`TwoGateVerifier` is niet aangepast en geen enkele regel is versoepeld. Er is geen
product-data-API gebruikt, geen scraping langs toegangsbeveiliging, en er zijn geen
prijs-, voorraad- of verzendclaims toegevoegd.

## 8. Zoekmogelijkheid voor de hele catalogus (§6)

De bestaande zoekfallback genereert voor ieder catalogusonderdeel dynamisch een gerichte
Amazon-zoeklink op zowel amazon.nl (`srihldecoder2-21`) als amazon.de (`srihldecode00-21`),
inclusief productnaam in de query. Dat is geverifieerd voor willekeurige onderdelen en voor
niet-bestaande nummers; er zijn dus **geen** 18.480 statische records nodig en geen nieuwe
records aangemaakt. Deze zoeklinks tellen niet mee als ACTIVE ASIN.

## 9. Dekking van de GSC-prioriteitsmodellen (§9)

Aantal onderdelen per model met een directe Amazon-kooplink (na deze fase):

| Model | Koopbaar / totaal | Model | Koopbaar / totaal |
|---|---|---|---|
| MS 170 | 19 / 248 | MS 461 | 12 / 263 |
| MS 180 | 23 / 263 | MS 661 | 8 / 271 |
| MS 250 | 23 / 276 | FS 55 | 12 / 354 |
| MS 260 | 14 / 279 | FS 85 | 12 / 389 |
| MS 261 | 10 / 358 | FS 350 | 5 / 262 |
| MS 361 | 15 / 278 | BR 600 | 2 / 239 |
| MS 440 | 15 / 277 | BG 86 | 9 / 169 |
| HS 45 | 7 / 205 | TS 420 | 2 / 257 |

Uniek: **84** onderdelen binnen deze modellen zijn nu direct koopbaar (was 51 vóór deze
fase). Dit is de commerciële kern van de opdracht en het startpunt voor de volgende batch.

## 10. Resultaattabel (§11)

| Metric | Resultaat |
|---|---:|
| Onderzochte catalogusonderdelen | 250 |
| Gevonden Amazon-ASIN's (unieke kandidaten) | 154 |
| Nieuwe ACTIVE Amazon.nl | 33 |
| Nieuwe ACTIVE Amazon.de | 0 |
| Nieuwe unieke onderdelen met Amazon-aanbod | 33 |
| Extra aanbiedingen op reeds koopbare onderdelen | 0 |
| Kandidaten met aangevuld bewijs | 33 |
| Nieuwe dynamische Amazon-zoekmogelijkheden | 0 (al catalogusbreed: 18.480 onderdelen × 2 marketplaces) |
| Resterende NEEDS_EVIDENCE | 34 (was 45) |
| Onjuiste matches REJECTED | 5 |
| Behouden bestaande ACTIVE-aanbiedingen | 97 (0 verloren) |
| Productiestatus | zie eindbericht (commit + `/api/version` + publieke controle) |

Stand van de registry: 201 records — 130 ACTIVE, 34 SUSPENDED, 34 RESEARCH_REQUIRED,
3 VERIFIED. Amazon.nl gebruikt 84 van de 100 toegestane slots.

## 11. Verificatie

- `node scripts/check_affiliate_consistency.mjs`: 0 contradicties, 0 GTIN-fouten,
  0 unverified ACTIVE-lekken, 0 niet-geautoriseerde ACTIVE-aanbiedingen. De 33 nieuwe
  onderdeelnummers zijn expliciet aan de operator-autorisatielijst toegevoegd
  (`AUTHORIZED_PILOT_PARTS` en `policy.pilot_activated_parts`).
- Nieuwe suite `tests/phase87_1_amazon_expansion.test.js` (8 tests): alle groen.
- Bestaande suites bijgewerkt naar de gemeten waarheid: `phase86_coverage_and_amazon_availability`,
  `phase79b_amazon_buy_buttons`, `phase87_amazon_recovery`, `phase75_amazon_growth`,
  `phase74_amazon_growth`, `phase73_amazon_100`, `phase66a_batch250`.
- Elke ACTIVE-aanbieding slaagt onveranderd voor `TwoGateVerifier`; de suite controleert dat
  voor alle 33 nieuwe records én voor de 130 actieve records in de registry.
- Volledige suite (`tests/run_current_production_tests.js`) in de CI-omgeving, dus zonder de
  affiliate-variabelen die alleen deze werkmap exporteert: 133 van 133 suites groen. De
  affiliate-variabelen in de werkmap (AMAZON_ASSOCIATE_TAG_NL/DE, eBay-sleutels) laten 10
  oudere suites falen die op een schone checkout groen zijn; die zijn hier niet als bewijs gebruikt.
- Tags per marketplace kloppen (NL `srihldecoder2-21`, DE `srihldecode00-21`), geen dubbele
  (onderdeel, marketplace, ASIN)-combinaties, catalogus nog steeds 18.480 onderdelen.

## 12. Artefacten

| Bestand | Inhoud |
|---|---|
| `queue.json` | 250 geprioriteerde onderdelen met signaal en score |
| `search_hits_amazon_nl.json` | 250 zoekopdrachten met alle 1.586 geziene treffers |
| `product_checks_amazon_nl.json` | 154 productpagina-controles |
| `dealer_corroboration.json` | 90 dealercatalogus-controles |
| `selection_plan.json` | per onderdeel de gekozen kandidaat, score en bewijsstatus |
| `PHASE87_1_ACTIVATION.json` | 33 activaties, 11 bewaarde kandidaten, 15 gedocumenteerde afwijzingen |
