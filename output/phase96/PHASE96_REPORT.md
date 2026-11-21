# Phase 96 — eBay-activatie: directe kooplinks voor prioriteitsonderdelen

Uitgevoerd op branch `phase96/ebay-activation`, bovenop `main` `fe1860e` (Phase 95).
Alleen de eBay-kant is aangeraakt; de Amazon-registry en de Amazon-route zijn niet gewijzigd.

## 1. Nulmeting

| | Voor | Na |
|---|---:|---:|
| ACTIVE eBay-aanbiedingen | 1.773 | 2.968 |
| Unieke onderdelen met een directe eBay-kooplink | 220 | 503 |
| Onderzochte onderdelen in deze batch | — | 276 |

De nulmeting komt uit het bestaande aanbodregister `data/affiliate/ebay_offers.json`
(1.773 ACTIVE: 1.146 eBay.nl, 627 eBay.de). Alle bestaande ACTIVE-aanbiedingen zijn
behouden; `saveEbayOfferStore` voegt samen en verwijdert nooit wat een batch niet heeft
onderzocht.

## 2. Werkwijze (bestaande engine, geen nieuwe architectuur)

1. `scripts/phase96_build_ebay_queue.mjs` bouwt de werkvoorraad uit bestaande data:
   catalogus (18.480), model-fitments uit `stihl_database.db`, GSC-prioriteitsmodellen
   (`output/phase81/PHASE81_PRIORITY_MODELS.json`), het eBay-register en de
   Amazon-registry. 18.260 catalogusonderdelen hebben geen eBay-aanbieding; 16.482
   daarvan hebben ook geen enkele directe kooplink. De queue rangschikt eerst op
   "geen enkele kooplink", dan GSC-prioriteitsmodel, dan aantal machines, dan
   onderhoudsonderdeel.
2. `scripts/phase96_ebay_activation.mjs` zoekt per onderdeel met de bestaande
   `EbayBrowseApiClient` op **eBay.de eerst, dan eBay.nl**, met
   `filter=deliveryCountry:NL` en `X-EBAY-C-ENDUSERCTX` (NL-context uit fase 76G).
   Gezocht wordt op het geformatteerde én compacte exacte STIHL-nummer en op
   `STIHL <nummer>`, zonder verkoperfilter (alle verkopers).
3. Elke treffer gaat door `EbayHighVolumeEngine.evaluateOffer()` — de bestaande
   ACCEPT/REVIEW/REJECT-beslissing met `reason_codes` en `first_blocking_step`.
   Kandidaten met ontbrekende identiteit of verzendbewijs worden via `getItem`
   (fieldgroup PRODUCT) aangevuld; bewijs wordt hergebruikt uit
   `EbayEvidenceRegistry` (1.213 eerder opgeslagen listings).
4. Alleen ACCEPT wordt ACTIVE, via de bestaande schrijfroute `saveEbayOfferStore`.
   REVIEW blijft NEEDS_EVIDENCE met de concrete reden, REJECT alleen bij
   aantoonbaar tegenstrijdige productmatches.

## 3. Resultaat van deze batch

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **695** |
| Nieuwe unieke onderdelen met een directe eBay-kooplink | **159** |
| Waarvan zonder enige andere directe kooplink | 159 |
| Waarvan op een GSC-prioriteitsmodel | 159 |
| Onderzochte onderdelen | 276 |
| Onderdelen zonder enige listing op eBay.de/nl | 90 |
| Kandidaten met aangevuld bewijs | 846 (NEEDS_EVIDENCE) |
| Onderdelen waar bewijs is aangevuld via getItem | 159 |
| Onderdelen waarop eerder bewijs is hergebruikt | 79 |
| Onjuiste matches REJECTED | 13 |
| Modellen met nieuwe dekking | 558 |

Marktplaatsverdeling van de nieuwe aanbiedingen: **eBay.de 254**,
**eBay.nl 441**. Bij alle aanbiedingen bevestigt de
Browse API met `deliveryCountry:NL` dat het item naar Nederland levert
(`shipping_status: SHIPS_TO_NL_CONFIRMED`, `ships_to_nl: true`); de affiliate-URL is de
door eBay geleverde `itemAffiliateWebUrl` met campagneprefix `campid` gelijk aan
`EBAY_EPN_CAMPAIGN_ID` (de engine keurt een afwijkende campain-ID af als
`CAMPAIGN_ID_MISMATCH`).

## 4. Nieuwe dekking per GSC-prioriteitsmodel (top 25)

| Model | Nieuwe onderdelen |
|---|---:|
| 044 | 94 |
| ms_440 | 92 |
| 046 | 82 |
| ms_460 | 82 |
| ms_461 | 71 |
| ms_361 | 63 |
| ms_341 | 58 |
| ms_441 | 53 |
| 064 | 51 |
| 066 | 50 |
| ms_362 | 49 |
| ms_660 | 48 |
| ms_650 | 46 |
| ms_360 | 46 |
| ms_640 | 44 |
| ms_260 | 42 |
| ms_290 | 41 |
| ms_310 | 41 |
| ms_390 | 41 |
| ms_340 | 41 |
| ms_462 | 40 |
| gs_461 | 39 |
| ms_400 | 39 |
| ms_880 | 38 |
| ms_210 | 38 |

## 5. Resterende blokkades (gegroepeerd op engine-reden)

NEEDS_EVIDENCE (846 kandidaten):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
| `LISTING_MPN` | 846 |

REJECTED (13 kandidaten):

| Reden | Kandidaten |
|---|---:|
| `CONFLICTING_MPN` | 13 |

De NEEDS_EVIDENCE-kandidaten zijn listings waarvan de titel wel het juiste
onderdeelnummer noemt maar die geen door de verkoper opgegeven MPN-aspect hebben; de
engine accepteert zo'n titel-only match niet als bewezen productidentiteit. Ze blijven
in de werkvoorraad staan met hun item-ID en reden voor een volgende ronde.

## 6. Per nieuwe actieve aanbieding

Eerste bewezen aanbieding per onderdeel (volledige lijst met alle 695
aanbiedingen staat in `output/phase96/PHASE96_EBAY_ACTIVATION.json` onder
`accepted_offers`). "Verzending NL" is de bevestiging uit de Browse API
(`deliveryCountry:NL` + bevestigde verzendoptie).

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Aanbiedingen |
|---|---|---|---|---:|---:|
| 00001410601 | 044, 046, 064, 066 | v1|296685650921|0 | EBAY_DE | ja | 8 |
| 00001957001 | fs_500, fs_550, mc_200, ms_162 | v1|267693068878|0 | EBAY_DE | ja | 5 |
| 00006600850 | ms_290, ms_310, ms_311, ms_390 | v1|306663914929|0 | EBAY_DE | ja | 6 |
| 00006640700 | ms_260, ms_340, ms_341, ms_360 | v1|257544204086|0 | EBAY_DE | ja | 4 |
| 00007912009 | 044, 046, 048, 064 | v1|116324471131|0 | EBAY_NL | ja | 2 |
| 00009302251 | 039, 044, 046, 048 | v1|278066428819|0 | EBAY_DE | ja | 7 |
| 00009302267 | 039, 044, 046, br_400 | v1|297138597930|0 | EBAY_DE | ja | 3 |
| 00009580518 | 044, 046, ms_241, ms_341 | v1|335661189048|0 | EBAY_NL | ja | 1 |
| 00009580607 | 044, 046, 064, 066 | v1|334279817399|0 | EBAY_NL | ja | 2 |
| 00009580806 | fr_410, fr_460, fs_411_0, fs_460 | v1|187547399706|0 | EBAY_DE | ja | 8 |
| 00009630808 | 044, 046, 064, 066 | v1|126762639418|0 | EBAY_DE | ja | 4 |
| 00009672035 | 044, 046, 064, 066 | v1|297937071411|0 | EBAY_DE | ja | 6 |
| 00009677247 | 039, 044, 046, 051 | v1|353159242970|0 | EBAY_NL | ja | 1 |
| 00009885211 | 039, 044, 046, 048 | v1|267693069044|0 | EBAY_DE | ja | 7 |
| 00009888600 | fc_85, fh_145, fh_75, fh_km | v1|257553488193|0 | EBAY_DE | ja | 6 |
| 00009891002 | fs_491, fs_491_0, fs_561, fs_561_0 | v1|278066428735|0 | EBAY_DE | ja | 4 |
| 00009891010 | 039, 041, 044, 045 | v1|405571103463|0 | EBAY_DE | ja | 4 |
| 00009970227 | 044, 046, ms_440, ms_460 | v1|257553491026|0 | EBAY_DE | ja | 7 |
| 00009970615 | 039, 044, 046, ms_241 | v1|204124867911|0 | EBAY_NL | ja | 3 |
| 00009970628 | 039, 044, 046, 064 | v1|117493530712|0 | EBAY_DE | ja | 5 |
| 11100849102 | 009, 010, 011, 012 | v1|880135698063|0 | EBAY_DE | ja | 7 |
| 11101227400 | 009, 010, 011, 012 | v1|156933377516|0 | EBAY_NL | ja | 6 |
| 11101459001 | 041, 042, 044, 045 | v1|257858005699|0 | EBAY_NL | ja | 2 |
| 11104329200 | 024, 026, 028, 031 | v1|296684008811|0 | EBAY_DE | ja | 7 |
| 11131411805 | 020, 024, 026, 028 | v1|198755798132|0 | EBAY_DE | ja | 7 |
| 11141217800 | 009, 010, 011, 012 | v1|135391772854|0 | EBAY_DE | ja | 3 |
| 11141227100 | 009, 010, 011, 012 | v1|146837546545|0 | EBAY_DE | ja | 4 |
| 11151227400 | 017, 019, 020, 021 | v1|303878537855|0 | EBAY_NL | ja | 2 |
| 11171229000 | 009, 010, 011, 012 | v1|156473493555|0 | EBAY_NL | ja | 3 |
| 11173500905 | 015, 020, 041, 042 | v1|800844121510|0 | EBAY_NL | ja | 3 |
| 11201217800 | 009, 010, 011, 012 | v1|278066426331|0 | EBAY_DE | ja | 5 |
| 11201219200 | 009, 010, 011, 012 | v1|257553487979|0 | EBAY_DE | ja | 4 |
| 11201223004 | 009, 010, 011, 012 | v1|126762766516|0 | EBAY_DE | ja | 4 |
| 11201226601 | 009, 010, 011, 012 | v1|136254009553|0 | EBAY_DE | ja | 2 |
| 11201227400 | 009, 010, 011, 012 | v1|376884091420|0 | EBAY_NL | ja | 3 |
| 11201227800 | 009, 010, 011, 012 | v1|168106738492|0 | EBAY_NL | ja | 1 |
| 11201229000 | 009, 010, 011, 012 | v1|117530377732|0 | EBAY_DE | ja | 5 |
| 11211625200 | 024, 026, 029, 034 | v1|126763232535|0 | EBAY_DE | ja | 5 |
| 11216601000 | 017, 018, 019, 023 | v1|198755798098|0 | EBAY_DE | ja | 7 |
| 11220841405 | 024, 026, 036, 044 | v1|297445157876|0 | EBAY_DE | ja | 8 |
| 11221217700 | 024, 026, 029, 039 | v1|333618726349|0 | EBAY_NL | ja | 1 |
| 11221621000 | 064, 066, ms_341, ms_361 | v1|127376841106|0 | EBAY_DE | ja | 6 |
| 11226642200 | 024, 026, 028, 034 | v1|126763287277|0 | EBAY_DE | ja | 6 |
| 11226644500 | 036, 044, 046, 064 | v1|176324351209|0 | EBAY_NL | ja | 7 |
| 11230212800 | 017, 018, 023, 025 | v1|316842300245|0 | EBAY_NL | ja | 3 |
| 11231210800 | 019, 020, 021, 023 | v1|234017670051|0 | EBAY_NL | ja | 3 |
| 11231210801 | 019, 020, 021, 023 | v1|405556649285|0 | EBAY_NL | ja | 1 |
| 11231217800 | 017, 018, 019, 020 | v1|117493530670|0 | EBAY_DE | ja | 8 |
| 11231223000 | 017, 018, 019, 020 | v1|126762766690|0 | EBAY_DE | ja | 8 |
| 11231625200 | 017, 018, 019, 029 | v1|267693069787|0 | EBAY_DE | ja | 5 |
| 11231625205 | 017, 018, 019, 029 | v1|267693069900|0 | EBAY_DE | ja | 5 |
| 11231625800 | 017, 018, 019, 021 | v1|257544204170|0 | EBAY_DE | ja | 8 |
| 11236401700 | 017, 018, 023, 025 | v1|278066428683|0 | EBAY_DE | ja | 6 |
| 11236472400 | 017, 018, 019, 021 | v1|296685652636|0 | EBAY_DE | ja | 8 |
| 11236482202 | 017, 018, 019, 023 | v1|278066429648|0 | EBAY_DE | ja | 7 |
| 11236483800 | 017, 018, 023, 025 | v1|113730313226|0 | EBAY_DE | ja | 7 |
| 11236642402 | 017, 018, 019, 023 | v1|167703074370|0 | EBAY_NL | ja | 3 |
| 11240848300 | 044, 046, 064, 066 | v1|234594066236|0 | EBAY_NL | ja | 2 |
| 11250848900 | 029, 034, 036, 039 | v1|127347396474|0 | EBAY_DE | ja | 6 |
| 11251227403 | 017, 018, 019, 020 | v1|227598527280|0 | EBAY_NL | ja | 4 |
| 11251229001 | 017, 018, 019, 020 | v1|236360096983|0 | EBAY_NL | ja | 1 |
| 11251229002 | 017, 018, 019, 020 | v1|335398639862|0 | EBAY_NL | ja | 1 |
| 11256641400 | 024, 026, 028, 034 | v1|135391780175|0 | EBAY_DE | ja | 8 |
| 11271623000 | 017, 018, 019, 021 | v1|187596970341|0 | EBAY_DE | ja | 5 |
| 11280071011 | 044, 046, ms_361, ms_362 | v1|278066428556|0 | EBAY_DE | ja | 5 |
| 11280071066 | 044, 046, gs_461, ms_270 | v1|318099885389|0 | EBAY_DE | ja | 8 |
| 11280290500 | 044, ms_440 | v1|820314727528|0 | EBAY_DE | ja | 7 |
| 11280806500 | 034, 036, 044, 046 | v1|136475444255|0 | EBAY_DE | ja | 6 |
| 11280848302 | 044, 046, 064, 066 | v1|385126916200|0 | EBAY_NL | ja | 2 |
| 11281201602 | ms_440 | v1|297623239864|0 | EBAY_DE | ja | 4 |
| 11281201603 | ms_440 | v1|136216816727|0 | EBAY_DE | ja | 7 |
| 11281201604 | 044, ms_440 | v1|257553488007|0 | EBAY_DE | ja | 4 |
| 11281210801 | 029, 039, 044, 046 | v1|158192071345|0 | EBAY_NL | ja | 3 |
| 11281217000 | 044, 046, gs_461, ms_440 | v1|185848044779|0 | EBAY_NL | ja | 2 |
| 11281223003 | 029, 039, 044, 046 | v1|127376902218|0 | EBAY_DE | ja | 3 |
| 11281290906 | 029, 039, 044, 046 | v1|128129690643|0 | EBAY_NL | ja | 5 |
| 11281401909 | ms_440 | v1|257553487789|0 | EBAY_DE | ja | 4 |
| 11281450803 | 044, 046, gs_461, ms_440 | v1|257553487689|0 | EBAY_DE | ja | 3 |
| 11281620807 | 036, 044, 046, ms_341 | v1|127377602127|0 | EBAY_DE | ja | 6 |
| 11281623000 | 036, 044, 046, gs_461 | v1|117493530718|0 | EBAY_DE | ja | 3 |
| 11281623202 | 036, 044, 046, gs_461 | v1|157220291055|0 | EBAY_NL | ja | 4 |
| 11281625200 | 044, 046, ms_270, ms_280 | v1|236087718228|0 | EBAY_NL | ja | 1 |
| 11281628000 | 044, 046, ms_382, ms_440 | v1|257553488262|0 | EBAY_DE | ja | 5 |
| 11281803501 | 044, 046, ms_440, ms_460 | v1|235971847514|0 | EBAY_NL | ja | 4 |
| 11286401706 | ms_270, ms_280, ms_290, ms_310 | v1|227614744125|0 | EBAY_DE | ja | 6 |
| 11286402005 | 044, 046, ms_341, ms_440 | v1|136474157262|0 | EBAY_DE | ja | 4 |
| 11286409100 | 020, 021, 023, 024 | v1|158152312407|0 | EBAY_DE | ja | 6 |
| 11286472400 | 044, 046, ms_341, ms_361 | v1|298308353967|0 | EBAY_DE | ja | 6 |
| 11286474806 | 020, 024, 026, 029 | v1|800862233965|0 | EBAY_NL | ja | 4 |
| 11286641002 | 044, 046, 064, 066 | v1|306201110737|0 | EBAY_DE | ja | 6 |
| 11287909909 | 044, 046, gs_461, ms_440 | v1|136474157014|0 | EBAY_DE | ja | 5 |
| 11287917200 | 044, 046, gs_461, ms_440 | v1|136474157139|0 | EBAY_DE | ja | 5 |
| 11287918400 | 044, 046, 064, 066 | v1|233861014266|0 | EBAY_NL | ja | 5 |
| 11287918401 | 044, 046, gs_461, ms_440 | v1|233861015493|0 | EBAY_NL | ja | 5 |
| 11291620800 | 009, 010, 011, 012 | v1|257553488456|0 | EBAY_DE | ja | 7 |
| 11301215601 | bt_120, fr_350, fr_85, fs_120 | v1|267693069643|0 | EBAY_DE | ja | 5 |
| 30030029421 | 044, 046, ms_440, ms_461 | v1|800860572506|0 | EBAY_NL | ja | 1 |
| 41161214700 | 029, 039, 044, 046 | v1|186887345123|0 | EBAY_NL | ja | 5 |
| 41161214800 | 029, 039, 044, 046 | v1|185228919825|0 | EBAY_DE | ja | 3 |
| 41161215100 | 017, 019, 020, 021 | v1|278066428620|0 | EBAY_DE | ja | 4 |
| 41161290902 | 029, 039, 044, 046 | v1|264371825275|0 | EBAY_NL | ja | 1 |
| 41171210803 | bg_60, bg_61, bg_72, bg_75 | v1|187547401098|0 | EBAY_DE | ja | 3 |
| 41281218901 | br_200, br_350, br_430, br_450 | v1|136536517633|0 | EBAY_DE | ja | 6 |
| 41281621000 | bt_120, bt_121, fr_350, fr_410 | v1|257553487961|0 | EBAY_DE | ja | 5 |
| 41287904800 | bga_300_0, bga_300_1, br_350, br_430 | v1|327419158720|0 | EBAY_DE | ja | 3 |
| 41287910300 | bga_300_0, bga_300_1, br_350, br_430 | v1|307053712378|0 | EBAY_DE | ja | 4 |
| 41331210801 | bg_72, bg_75, fc_72, fr_460 | v1|267134859834|0 | EBAY_NL | ja | 1 |
| 41341210802 | bt_120, bt_121, fc_85, fh_75 | v1|267847711122|0 | EBAY_NL | ja | 2 |
| 41371218600 | bg_45, bg_55, bg_85, br_200 | v1|257483874632|0 | EBAY_NL | ja | 3 |
| 41800251100 | bt_130, bt_131, fc_100, fc_110 | v1|307250682264|0 | EBAY_DE | ja | 7 |
| 41800253000 | br_500, br_550, br_600, br_700 | v1|327419157876|0 | EBAY_DE | ja | 6 |
| 41800380801 | br_500, br_550, br_600, br_700 | v1|185847451790|0 | EBAY_NL | ja | 3 |
| 41800381300 | bt_130, fc_100, fc_110, fr_130 | v1|227527159200|0 | EBAY_DE | ja | 7 |
| 41800381700 | br_500, br_550, br_600, br_700 | v1|306330702474|0 | EBAY_NL | ja | 1 |
| 41800382000 | br_500, br_550, br_600, br_700 | v1|204521682220|0 | EBAY_NL | ja | 2 |
| 41800382700 | br_500, br_550, br_600, br_700 | v1|275631024294|0 | EBAY_NL | ja | 2 |
| 41801210801 | br_500, br_550, br_600, br_700 | v1|158007485699|0 | EBAY_NL | ja | 5 |
| 41801230600 | bt_130, fc_100, fc_110, fr_130 | v1|147653223547|0 | EBAY_DE | ja | 3 |
| 41803506501 | bt_130, fc_100, fc_110, fr_130 | v1|306129787758|0 | EBAY_NL | ja | 1 |
| 42031212700 | 026, 029, 039, 044 | v1|257553488046|0 | EBAY_DE | ja | 8 |
| 59108904500 | 029, 039, 066, br_320 | v1|296741112152|0 | EBAY_DE | ja | 4 |
| 59108936600 | 020, bg_56, bg_66, bg_86 | v1|306629338737|0 | EBAY_DE | ja | 4 |
| 90083191020 | 044, 046, fsa_120_0, fsa_80_0 | v1|336058816284|0 | EBAY_NL | ja | 2 |
| 90083450960 | 031, 032, 038, 041 | v1|305783031318|0 | EBAY_DE | ja | 3 |
| 90223130680 | 020, 024, 026, 034 | v1|296685594604|0 | EBAY_DE | ja | 3 |
| 90223410910 | 028, 034, 036, 044 | v1|137931187787|0 | EBAY_DE | ja | 6 |
| 90223410960 | 020, 024, 026, 028 | v1|860029724870|0 | EBAY_DE | ja | 8 |
| 90223411019 | 024, 026, 034, 036 | v1|298156142536|0 | EBAY_DE | ja | 3 |
| 90223411070 | 044, 046, 051, 076 | v1|126788885589|0 | EBAY_DE | ja | 4 |
| 90223411300 | 044, 064, 066, 08 | v1|136815807193|0 | EBAY_DE | ja | 8 |
| 90223711050 | 009, 010, 011, 012 | v1|117493540798|0 | EBAY_DE | ja | 1 |
| 90412160650 | 034, 036, bg_17, e_15 | v1|357653032289|0 | EBAY_NL | ja | 4 |
| 90744782970 | 064, 066, ar_2000, ar_3000 | v1|297806458622|0 | EBAY_DE | ja | 2 |
| 90744783075 | 017, 018, bga_300_0, bga_300_1 | v1|296505409812|0 | EBAY_DE | ja | 3 |
| 90744783076 | 024, 026, 034, 036 | v1|298464392617|0 | EBAY_NL | ja | 6 |
| 90744784475 | 020, 021, 023, 024 | v1|198755798278|0 | EBAY_DE | ja | 1 |
| 90744784675 | 024, 026, 034, 036 | v1|287016311381|0 | EBAY_NL | ja | 1 |
| 91040038600 | 017, 018, 023, 025 | v1|401754010552|0 | EBAY_DE | ja | 3 |
| 92102600700 | 010, 011, 012, 019 | v1|166426325769|0 | EBAY_NL | ja | 3 |
| 92143200700 | 009, 010, 011, 012 | v1|298417614852|0 | EBAY_DE | ja | 8 |
| 92162610700 | 017, 018, 020, 021 | v1|117493540933|0 | EBAY_DE | ja | 6 |
| 92162630700 | 021, 023, 025, 029 | v1|296685657197|0 | EBAY_DE | ja | 8 |
| 92910210100 | 056, 08, ab_4080, ab_4099 | v1|227466620443|0 | EBAY_NL | ja | 5 |
| 93070210120 | 031, 032, 044, 046 | v1|267790052096|0 | EBAY_NL | ja | 1 |
| 93714702610 | 009, 010, 011, 012 | v1|296684009793|0 | EBAY_DE | ja | 4 |
| 93806201090 | 020, 024, 026, 029 | v1|146856273388|0 | EBAY_NL | ja | 1 |
| 94168685630 | 024, 026, 034, 044 | v1|298484620589|0 | EBAY_NL | ja | 7 |
| 94168686530 | 010, 011, 012, 034 | v1|357656965386|0 | EBAY_NL | ja | 3 |
| 94556211520 | 046, fr_106, fr_108, fr_130 | v1|117493540863|0 | EBAY_DE | ja | 6 |
| 94606240400 | 009, 010, 011, 012 | v1|117493540934|0 | EBAY_DE | ja | 7 |
| 94636500807 | 017, 018, bg_45, bg_55 | v1|117493541025|0 | EBAY_DE | ja | 2 |
| 94636501100 | fr_410, fr_460, fs_240, fs_260 | v1|198755808992|0 | EBAY_DE | ja | 4 |
| 94686211520 | 017, 018, 019, 021 | v1|373136501483|0 | EBAY_NL | ja | 4 |
| 96368150270 | br_500, br_550, br_600, br_700 | v1|266615342451|0 | EBAY_DE | ja | 6 |
| 96459487734 | 020, 021, 023, 024 | v1|800866928898|0 | EBAY_NL | ja | 4 |
| 96459513890 | bg_45, bg_55, bg_56, bg_66 | v1|237051491353|0 | EBAY_DE | ja | 5 |
| 96469450160 | 020, 024, 026, 029 | v1|227466618740|0 | EBAY_NL | ja | 4 |
| 96469450490 | 017, 018, 024, 026 | v1|278066429826|0 | EBAY_DE | ja | 4 |
| 97710212578 | 044, 046, gs_461, ms_380 | v1|336394266451|0 | EBAY_NL | ja | 1 |

## 7. Verificatie

- `node scripts/check_affiliate_consistency.mjs`: schoon (0 contradicties, 0 GTIN-fouten,
  0 ongeautoriseerde ACTIVE-aanbiedingen).
- Per batch is na het schrijven gecontroleerd dat de publieke keten
  (`AffiliateOfferResolver` → `EbayAffiliateProvider`) elk nieuw onderdeel als
  `DIRECT_EBAY_ITEM` resolveert: 159 van
  159 onderdelen, 0 missers.
- Bestaande eBay-suites: `phase76c_high_volume_engine`, `phase76g_offer_validation`,
  `phase80_affiliate_activation`, `phase80_1_activation_pipeline`,
  `phase80_2_evidence_recovery`, `phase80_3_shipping_recovery`,
  `phase85_ebay_store_merge`, `phase86_1_affiliate_click_recovery`,
  `affiliate_quality_gate` — alle groen.
- `phase93/94/95` assertten de oude storesnapshot (1.773). Die assertie is nu
  "minstens 1.773, nooit kleiner" — de fase-artefacten zelf blijven hun eigen
  snapshot houden.
- De eBay-tag/campagne is niet aangepast; marktplaats per aanbieding blijft
  `EBAY_NL`/`EBAY_DE` zoals de engine die zette.

## 8. Waar deze batch stopt

Deze batch dekt 400 van de 18.260 onderdelen zonder eBay-aanbieding (10 batches van 40).
De queue, de runner en het aggregatiescript zijn herhaalbaar: `queue_10..` kan met
dezelfde twee commando's worden uitgevoerd. De 846 NEEDS_EVIDENCE-kandidaten en de
90 onderdelen zonder listing zijn de logische volgende werklast.

## 9. Artefacten

| Bestand | Inhoud |
|---|---|
| `output/phase96/queue.json` | gerangschikte werkvoorraad met prioriteitsscores |
| `output/phase96/batches/queue_XX.json` | 10 batches van 40 onderdelen |
| `output/phase96/batches/queue_XX_result.json` | per batch: metrics, per onderdeel decision/reason_codes/first_blocking_step |
| `output/phase96/PHASE96_EBAY_ACTIVATION.json` | alle nieuwe aanbiedingen, NEEDS_EVIDENCE, REJECTED, modeldekking |
