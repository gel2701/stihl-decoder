# Phase 69C — Amazon Compatibility First & Commercial Acceleration

## 1. Besluit van de projecteigenaar

Op 9 november 2026 heeft de projecteigenaar besloten dat de eerdere Two-Gate-verificatie te restrictief was en de commerciële doorontwikkeling van STIHLDecoder belemmerde.

Vanaf Phase 69C geldt:
- Een actuele Amazon-productvermelding waarin expliciet een STIHL-model of exact onderdeelnummer als geschikt wordt genoemd, geldt als voldoende compatibiliteitsbewijs voor een directe affiliateproductlink (`AMAZON_LISTING_COMPATIBLE`).
- Er is geen aanvullende externe niet-Amazon-fabrikantbevestiging vereist om deze status toe te kennen.
- Er is geen verplichte EAN-controle vereist wanneer de productidentiteit en vermelding duidelijk zijn.
- De verificatie-engine blokkeert uitsluitend nog op concrete issues: verkeerd artikel, verkeerd model, ongeldige/niet-bestaande ASIN, conflicterende technische specificaties, variant-/verpakkingsverwarring, of een niet-gecontroleerde vermelding zonder modelvermelding.

## 2. Capaciteitsverhoging & Status

- **Capaciteit (beleidscap):** Verhoogd van 3 naar 25 (`MAX_PILOT_ACTIVE_OFFERS = 25`).
- **Bestaande actieve producten:** De 3 originele pilot-producten (`11104007005` / `B0068M5NAG`, `00004007000` / `B001RM8J76`, `00004007011` / `B001RMA5S2`) blijven 100% actief en ongewijzigd.
- **Nieuwe activaties:** Exact 10 nieuwe, daadwerkelijk gecontroleerde Amazon-productlinks geactiveerd onder de classificatie `AMAZON_LISTING_COMPATIBLE`.
- **Totaal actieve producten in productie:** 13 (binnen de veilige limiet van 25).
- **Overige catalogus (18.360 onderdelen):** Blijft deterministic search fallback behouden.

## 3. Beoordeling van de Batch-Kandidaten

| Deelnummer | ASIN | Product & Merk | Modelgeschiktheid | Status | Toelichting |
|---|---|---|---|---|---|
| `0000 400 7009` | `B09QH68W83` | Bosch USR7AC bougie | BG 56, BG 86, FS 56, MS 150 | **ACTIVE** | Expliciete modelgeschiktheid op Amazon.nl. OEM-equivalent. |
| `0000 642 1240` | `B000IBWVWG` | Oregon 18720 kettingwielring | N/A | **BLOCKED_CONFLICT** | **Technisch conflict:** STIHL `0000 642 1240` is 3/8 Picco (low-profile) 7T; Oregon 18720 is standaard 3/8 7T. Afwijkende steek veroorzaakt schade. Geblokkeerd tegen activatie. |
| `4147 007 4102` | `B09R1T6X4D` | STIHL Service Kit 41 | FS 460 C-EM, FS 410, FS 360 | **ACTIVE** | Originele STIHL onderhoudsset expliciet geschikt voor FS 460/410/360. |
| `4147 141 0300` | `B08F9K47R9` | STIHL Luchtfilter vlies | FS 460 C-EM, FS 410, FS 360 | **ACTIVE** | Origineel STIHL vliesfilter expliciet voor FS 460. |
| `4147 140 4400` | `B09JGG2L99` | STIHL Voorfilter schuim | FS 460 C-EM, FS 410, FS 360 | **ACTIVE** | Origineel STIHL voorfilter expliciet voor FS 460. |
| `0000 350 3521` | `B079DNGM5Y` | STIHL Brandstoffilter / zuigkop | FS 460, MS 261, MS 362 | **ACTIVE** | Origineel STIHL brandstoffilter expliciet voor FS 460, MS 261. |
| `0781 120 1109` | `B007X6X91K` | STIHL Superlub FS 80g tandwielvet | FS 460, FS 350, FS 55 | **ACTIVE** | Origineel STIHL aandrijftandwielvet voor FS-bosmaaiers. |
| `0781 120 1110` | `B00474640Y` | STIHL Superlub FS 225g tandwielvet | FS 460, FS 350, FS 550 | **ACTIVE** | Origineel STIHL aandrijftandwielvet (225g tube) voor bosmaaiers. |
| `4147 190 0600` | `B08F9MKGTR` | STIHL Terugtrekveer starter | FS 460 C-EM, FS 410, FS 360 | **ACTIVE** | Originele STIHL startveer expliciet voor FS 460 C-EM. |
| `4119 710 6000` | `B017SBNY52` | STIHL Afsnijdmes maaikopkap | FS 460, FS 350, FS 55 | **ACTIVE** | Origineel STIHL afsnijdmes voor beschermkap van FS-serie. |
| `1130 124 0800` | `B079DLYRGL` | STIHL Luchtfilter vlies | MS 170, MS 180, 017, 018 | **ACTIVE** | Aanvullend hoog-prioritair slijtagedeel voor STIHLDecoder topmodel MS 170. |

## 4. Omkeerbaarheid & Rollback

- Elke actieve koppeling kan per direct worden gedeactiveerd via `VerifiedOfferRegistry.deactivateOffer(partNumber)` (terugval naar `VERIFIED`) of `VerifiedOfferRegistry.suspendOffer(partNumber, reason)` (terugval naar `SUSPENDED`).
- Elke individuele aanbieding beschikt over een `kill_switch_id` (bijv. `KILL_PILOT_00004007009`).
- Een algemene noodstop (`AMAZON_DIRECT_ASIN_ENABLED=false` of `policy.production_activation_allowed: false`) schakelt direct alle productlinks sitewide terug naar deterministic search fallback.

## 5. Presentatie op de Website

- Actieve productlinks worden weergegeven als een directe productkaart met duidelijke compatibiliteitsmelding:
  `"Geschikt voor STIHL [model] (volgens Amazon-productvermelding). Controleer vóór aankoop altijd machine-uitvoering en bouwjaar."`
- Geen ongefundeerde OEM-claims op third-party vermeldingen.
- Volledige Amazon Operating Agreement compliance: transparante affiliate-disclosures en `rel="sponsored nofollow noopener"`.
