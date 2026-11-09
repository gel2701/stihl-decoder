# STIHLDecoder — Phase 69D: Amazon Affiliate Growth & Practical Product Matching

## Statusoverzicht

- **Beleidsstatus:** GOEDGEKEURD door projecteigenaar (`AMAZON_LISTING_COMPATIBLE`)
- **Beleidslimiet:** Maximaal 25 actieve directe affiliate-aanbiedingen (`MAX_PILOT_ACTIVE_OFFERS = 25`)
- **Totaal actieve directe affiliate-aanbiedingen in productie:** **18**
- **Baseline gehandhaafd:** 4 actieve bougies (Bosch WSR6F, NGK BPMR7A, NGK CMR6H, Bosch USR7AC)
- **Nieuw geactiveerd in Phase 69D:** **14** onderhouds- en slijtageonderdelen voor populaire machines
- **Geblokkeerde conflicten gehandhaafd:** 1 (Oregon 18720 kettingwiel `0000 642 1240` wegens steekconflict)
- **Zoek-fallback voor niet-geactiveerde catalogus:** 100% operationeel en deterministisch

---

## 1. Auditcorrectie & Taxonomie (Onderzoek van historische ASIN's)

Conform de instructies is onderscheid gemaakt tussen:
- `INVALID`: Aantoonbaar een verkeerd product op Amazon (bijv. een ander machineonderdeel dan geclaimd).
- `UNVERIFIABLE`: Productpagina op Amazon.nl/de niet toegankelijk of levert HTTP 404. Dit is geen bewijs van een ongeldig product, maar verhindert directe verificatie.
- `COMPATIBLE`: Actuele Amazon-vermelding met expliciete STIHL model- of onderdeelnummergeschiktheid.

| ASIN | STIHL Onderdeel | Oorspronkelijke Claim | Live Status & Categorie | Actie in Phase 69D |
|---|---|---|---|---|
| `B079DLYRGL` | `1130 124 0800` | STIHL Luchtfilter MS 170 | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Vervangen door actuele actieve vermelding `B07KJYFPLM` (`COMPATIBLE`) |
| `B079DNGM5Y` | `0000 350 3521` | STIHL Brandstoffilter zuigkop | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Vervangen door actuele actieve vermelding `B0HLBXNGQQ` (`COMPATIBLE`) |
| `B073XS9V11` | `3636 000 0050` | Oregon 91VXL050E ketting | `INVALID` (Amazon toont SpeedMax XL zaagblad .404 2.0mm) | Vervangen door actuele actieve vermelding `B00FYRVGHU` (`COMPATIBLE`) |
| `B09R1T6X4D` | `4147 007 4102` | STIHL Service Kit 41 | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B08F9K47R9` | `4147 141 0300` | STIHL Luchtfilter FS 460 | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B09JGG2L99` | `4147 140 4400` | STIHL Voorfilter FS 460 | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B007X6X91K` | `0781 120 1109` | STIHL Tandwielvet 80g | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B00474640Y` | `0781 120 1110` | STIHL Tandwielvet 225g | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B08F9MKGTR` | `4147 190 0600` | STIHL Startveer FS 460 | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B017SBNY52` | `4119 710 6000` | STIHL Afsnijdmes maaikop | `UNVERIFIABLE` (HTTP 404 op Amazon.nl/de) | Veilig gerouteerd naar zoek-fallback |
| `B000IBWVWG` | `0000 642 1240` | Oregon 18720 kettingwiel | `BLOCKED_CONFLICT` (3/8 Picco vs 3/8 std conflict) | Strikt gehandhaafd als geblokkeerd |

---

## 2. Productie-inventaris: 18 Actieve Directe Affiliatekoppelingen

| Nr | Onderdeelnummer | Omschrijving & Merk | ASIN | Compatibele Modellen in Amazon-vermelding | Classificatie |
|---|---|---|---|---|---|
| 1 | `1110 400 7005` | Bosch WSR6F Bougie | `B0068M5NAG` | MS 170, MS 180, MS 210, MS 230, MS 250, MS 260 | `OEM_SUPPLIER_EQUIVALENT` |
| 2 | `0000 400 7000` | NGK BPMR7A Bougie | `B001RM8J76` | MS 170, MS 180, MS 210, MS 230, MS 250, MS 260, MS 361 | `OEM_SUPPLIER_EQUIVALENT` |
| 3 | `0000 400 7011` | NGK CMR6H Bougie | `B001RMA5S2` | BG 86, BR 600, MS 261, FS 460, MS 201 T | `OEM_SUPPLIER_EQUIVALENT` |
| 4 | `0000 400 7009` | Bosch USR7AC Bougie | `B09QH68W83` | BG 56, BG 86, SH 56, SH 86, FS 56 | `AMAZON_LISTING_COMPATIBLE` |
| 5 | `3616 000 0050` | STIHL Picco Super PS Zaagketting 35cm 3/8" 1.3mm 50GL | `B007QJL16A` | MS 210, MS 230, MS 250, MS 211, MS 241, 021, 025 | `AMAZON_LISTING_COMPATIBLE` |
| 6 | `3636 000 0050` | Oregon S50 Zaagketting 35cm 3/8" LP 1.3mm 50DL | `B00FYRVGHU` | MS 210, MS 230, MS 250, 021, 025 | `AMAZON_LISTING_COMPATIBLE` |
| 7 | `1130 124 0800` | Haishine 2x Luchtfilter voor MS 170 / MS 180 | `B07KJYFPLM` | MS 170, MS 180, 017, 018 | `AMAZON_LISTING_COMPATIBLE` |
| 8 | `1123 120 1613` | Haishine Luchtfilter MS250 met bougie | `B0DPCHJ2TD` | MS 210, MS 230, MS 250, 021, 023, 025 | `AMAZON_LISTING_COMPATIBLE` |
| 9 | `1121 120 1617` | MCHNIC Luchtfilter met brandstoffilter en bougie | `B0CQXCJSDC` | MS 260, MS 240, 026, 024 | `AMAZON_LISTING_COMPATIBLE` |
| 10 | `1141 120 1600` | Trade-Shop 2x HD2 Luchtfilter | `B09ZV1SQ7K` | MS 261, MS 362, MS 271, MS 291, MS 311 | `AMAZON_LISTING_COMPATIBLE` |
| 11 | `4241 120 1800` | MCHNIC 2x Luchtfilter voor bladblazer | `B0D7ZKJTRX` | BG 56, BG 86, SH 56, SH 86 | `AMAZON_LISTING_COMPATIBLE` |
| 12 | `4140 124 2800` | MospdyGear Luchtfilter & Bougieset | `B0F53RHZLS` | FS 55, FS 38, FS 45, FC 55, HS 45 | `AMAZON_LISTING_COMPATIBLE` |
| 13 | `4002 710 2169` | STIHL Origineel AutoCut C 26-2 Maaikop M10x1.0 | `B06XZZ84JC` | FS 55, FS 56, FS 70, FS 91, FS 131, FS 240 | `AMAZON_LISTING_COMPATIBLE` |
| 14 | `4119 007 1027` | YOUSHARES 2x AutoCut 25-2 Maaikop M10x1.0 | `B09ZKYGPDG` | FS 55, FS 85, FS 90, FS 120, FS 130, KM 55 | `AMAZON_LISTING_COMPATIBLE` |
| 15 | `1121 007 1062` | Yingshop Walbro K10-WAT Membraan- en pakkingset | `B071ZMCCYD` | 026, MS 260, MS 210, MS 250, FS 350, HS 45 | `AMAZON_LISTING_COMPATIBLE` |
| 16 | `0000 350 3500` | vhbw Universeel Brandstoffilter | `B0874SJ4CK` | MS 170, MS 180, MS 210, MS 250, FS 55, BG 86 | `AMAZON_LISTING_COMPATIBLE` |
| 17 | `0000 350 3521` | Haishine 2x Brandstoffilter Zuigkop groot | `B0HLBXNGQQ` | FS 460, MS 261, MS 361, MS 440, MS 461, TS 410 | `AMAZON_LISTING_COMPATIBLE` |
| 18 | `1123 195 0400` | ECSiNG Starter Katrol & Veerset | `B0BG49Y65H` | FS 55, FC 55, MS 170, MS 180, MS 210, MS 250 | `AMAZON_LISTING_COMPATIBLE` |

---

## 3. Technische & Kwaliteitsgaranties

1. **Two-Gate Verification:** Alle 18 aanbiedingen slagen 100% voor Gate 1 (technische en linkvalidatie) en Gate 2 (compatibiliteit en productidentiteit).
2. **Cap Guardrail:** Met 18 actieve links blijft het register binnen de door de eigenaar vastgestelde limiet van 25 (`MAX_PILOT_ACTIVE_OFFERS = 25`).
3. **Conflict Guard:** Bekende steekconflicten (zoals Oregon 18720) worden programmatisch en contractueel geblokkeerd (`BLOCKED_CONFLICT`).
4. **Consistente Mappings:** Alle geactiveerde onderdelen zijn strikt canoniek gegrond in `data/parts_catalog.json` en gesynchroniseerd met `scripts/check_affiliate_consistency.mjs`.
