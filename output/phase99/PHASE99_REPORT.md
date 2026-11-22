# Fase 99 — meer STIHL-onderdelen met een eerste directe eBay-kooplink

Alleen de eBay-kant is gewijzigd. De Amazon-registry en de Amazon-route zijn niet
aangeraakt; Amazon-dekking is uitsluitend gebruikt om te prioriteren en om de
gecombineerde dekking te meten.

## 1. Dekking voor en na (identieke sleutels)

| Metric | Voor | Na |
|---|---:|---:|
| ACTIVE eBay-aanbiedingen | 4.813 | 5.769 |
| Unieke onderdelen met een eBay-link | 996 | 1.258 |
| eBay.de / eBay.nl | 1.729 / 3.084 | 2.096 / 3.673 |
| Amazon-onderdelen met directe link | 1.895 | 1.895 |
| **Unieke onderdelen met een directe kooplink (eBay of Amazon)** | **2.774** | **3.036** |

De nulmeting leest de store zoals die op main staat (commit `9fafc7b5b99479b0d212db9a9a07297b32e6ef81`),
niet de werkmap: een lopende batch schrijft al aanbiedingen weg en die mogen niet
als "voor" worden geteld. De eindmeting leest de live store plus de Amazon-registry
opnieuw, met dezelfde sleutels (`parts_ebay`, `parts_amazon`, `parts_combined`).

## 2. Resultaat van deze batch

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **956** |
| Nieuwe unieke onderdelen met hun **eerste directe eBay-kooplink** | **262** |
| Nieuwe unieke onderdelen met hun **eerste directe kooplink over alle platformen** | **262** |
| Waarvan zonder Amazon-link vóór deze batch | 262 |
| Waarvan met alleen een Amazon-link vóór deze batch | 0 |
| Nieuwe onderdelen op een GSC-prioriteitsmodel | 262 |
| Onderzochte onderdelen (exacte nummerpass) | 400 |
| Onderzochte onderdelen (aanvullende zoektermen) | 134 |
| Onderzochte onderdelen totaal | 534 |
| Onderdelen zonder enige listing op eBay.de/nl | 101 |
| Onderdelen dat na beide passes nog geen eBay-link heeft | 138 |
| Onafgeronde onderdelen (marktplaats gaf een fout) | 0 |
| NEEDS_EVIDENCE-kandidaten | 1.306 |
| REJECTED-kandidaten | 38 |
| Onderdelen met aangevuld bewijs via getItem | 262 |
| Onderdelen met hergebruikt bewijs | 166 |
| Dubbel getelde geaccepteerde records | 0 |
| Nieuwe onderdelen buiten deze queue | 0 |
| **Eerste kooplinks per 100 afgeronde onderdelen (beide platformen)** | **65,5** |
| Eerste eBay-kooplinks per 100 afgeronde onderdelen | 65,5 |
| Afgeronde unieke onderdelen (noemer van die twee cijfers) | 400 |
| Geldige matches uit de alternatieve zoektermen (nieuwe onderdelen) | 0 |
| Nieuwe aanbiedingen uit de alternatieve zoektermen | 0 |

Marktplaatsverdeling van de nieuwe aanbiedingen: **eBay.de 367**,
**eBay.nl 589**.
956 van 956 aanbiedingen
hebben `ships_to_nl: true`; statusverdeling:
`SHIPS_TO_NL_CONFIRMED` 956.

## 3. Queue en prioritering

- Queue: 400 onderdelen in batches van 40
  (`queue_30`, `queue_31`, `queue_32`, `queue_33`, `queue_34`, `queue_35`, `queue_36`, `queue_37`, `queue_38`, `queue_39`), direct na `queue_29` van fase 98.
- Alle 400 queueonderdelen hadden
  **geen directe kooplink op eBay én Amazon**; alle
  400 staan op een GSC-prioriteitsmodel
  (23 modellen).
- Uitgesloten: 1.200 onderdelen die fase 96, 97 en 98 al onderzochten (373 fase 96,
  400 fase 97, 400 fase 98,
  27 in meerdere fasen).
- Resterend na deze queue: 16.660 kandidaten,
  waarvan 14.882 zonder enige kooplink en
  1.324 op een GSC-prioriteitsmodel.

## 4. Aansluiting van de fase 98-tellingen

De fase 98-checkpoints zijn per onderdeel gereconstrueerd voordat deze batch werd
gebouwd, zodat geen onderdeel opnieuw werd bevraagd en elk eerder resultaat één
duidelijke betekenis heeft:

| Uitkomst in fase 98 | Onderdelen | Betekenis |
|---|---:|---|
| Eerste eBay-kooplink | 177 | exacte pass afgerond en nu een ACTIVE aanbieding |
| Geen exacte treffer | 114 | beide marktplaatsen gaven nul listings op het exacte nummer; niets om identiteit tegen te bewijzen |
| Wel listings, geen ACCEPT | 85 | listings gevonden, maar geen aanbod door de poorten |
| Alleen NEEDS_EVIDENCE | 20 | titel-only of onbewezen nummer |
| Alleen REJECTED | 4 | tegenstrijdig nummer |
| Onafgerond | 0 | marktplaats gaf een fout |

Aansluiting: 400 queueonderdelen =
400 in de tabel; daarvan
177 met en
223 zonder eBay-link. Die
223 splitsen in
114 zonder enige exacte listing
(niet opnieuw bevraagd: geen bron voor een identiteitsbewijs) en
109 met listings, waarvan
er 109 met alternatieve zoektermen
zijn hervat; die pass leverde 0 extra
matches. Alle onderdelen met een eerdere uitkomst zijn uitgesloten van deze queue.

## 5. Extra dekking per GSC-prioriteitsmodel

| Model | Onderdelen | Gedekt vóór | Gedekt ná | Nieuw | Nog zonder link |
|---|---:|---:|---:|---:|---:|
| 044 | 343 | 273 | 281 | +8 | 62 |
| 046 | 308 | 242 | 250 | +8 | 58 |
| bg_86 | 169 | 101 | 127 | +26 | 42 |
| br_600 | 239 | 130 | 138 | +8 | 101 |
| fs_100 | 252 | 204 | 205 | +1 | 47 |
| fs_350 | 262 | 190 | 197 | +7 | 65 |
| fs_55 | 354 | 243 | 268 | +25 | 86 |
| fs_80 | 424 | 343 | 350 | +7 | 74 |
| fs_85 | 389 | 322 | 322 | +0 | 67 |
| hs_45 | 205 | 124 | 134 | +10 | 71 |
| ms_170 | 248 | 200 | 200 | +0 | 48 |
| ms_180 | 263 | 202 | 203 | +1 | 60 |
| ms_230 | 280 | 222 | 242 | +20 | 38 |
| ms_250 | 276 | 216 | 237 | +21 | 39 |
| ms_260 | 279 | 199 | 231 | +32 | 48 |
| ms_310 | 228 | 182 | 195 | +13 | 33 |
| ms_361 | 278 | 196 | 227 | +31 | 51 |
| ms_362 | 389 | 180 | 193 | +13 | 196 |
| ms_390 | 213 | 171 | 184 | +13 | 29 |
| ms_440 | 277 | 237 | 237 | +0 | 40 |
| ms_441 | 310 | 150 | 155 | +5 | 155 |
| ms_460 | 270 | 224 | 228 | +4 | 42 |
| ms_461 | 263 | 200 | 205 | +5 | 58 |
| ms_661 | 271 | 116 | 122 | +6 | 149 |
| ts_420 | 257 | 124 | 178 | +54 | 79 |

## 6. LISTING_MPN-voorraad uit fase 98, opnieuw gemeten

| | Aantal |
|---|---:|
| Unieke onderdelen in de fase 97 LISTING_MPN-backlog | 135 |
| Met een geldige eBay-link vóór fase 99 | 115 |
| Met een geldige eBay-link ná fase 99 | 115 |
| Nog zonder eBay-link (open) | 20 |

Geen van deze onderdelen is zonder nieuwe listing of nieuwe, door de engine
geaccepteerde bewijsbron opnieuw geopend; titel-only matches blijven
`NEEDS_EVIDENCE` en tegenstrijdige nummers blijven `REJECTED`.

## 7. Per nieuw onderdeel (eerste bewezen aanbieding)

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Verzendkosten | Amazon-link vóór | Aanbiedingen |
|---|---|---|---|---|---:|---|---:|
| 00006700206 | ts_410, ts_420, ts_700 | v1|136307141368|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 00007906103 | 044, 046, ms_340 | v1|257524732308|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 00009031506 | ms_341, ms_361 | v1|235709433418|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 00009580407 | mc_200, ms_200, ms_201 | v1|126763233617|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 00009580514 | 044, ms_240, ms_260 | v1|334279839833|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 00009581234 | ms_240, ms_260 | v1|158233313925|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 00009671593 | 044, 046, 066 | v1|296962007542|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 00009890815 | ms_290, ms_310, ms_360 | v1|333681219630|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 00009926302 | 042, 044, 064 | v1|298273739196|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 00009930508 | ms_240, ms_260 | v1|117493535884|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 08110121152 | 056, 070, 075 | v1|198678108345|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11210071063 | ms_240, ms_260 | v1|305776741471|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11210202125 | ms_240, ms_260 | v1|305776962061|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11210341505 | 026, ms_260 | v1|305776743838|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11210361600 | 024, 026, ms_240 | v1|295634986905|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11210801812 | 024, 026, ms_240 | v1|388497537564|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11210841700 | 024, 026, ms_240 | v1|157605659687|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11211202900 | 024, 026, ms_240 | v1|158133280805|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11211214700 | ms_240, ms_260, ms_311 | v1|206240710796|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11211227000 | 024, 026, ms_240 | v1|336394266297|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11211237501 | 024, 026, ms_240 | v1|235913333192|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11211237503 | ms_240, ms_260 | v1|168830180770|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11211243000 | 024, 026, ms_240 | v1|307165791612|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11211412200 | 024, 026, ms_240 | v1|227179434698|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11211450802 | 024, 026, ms_240 | v1|306168077545|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11213582500 | 024, 026, 034 | v1|117493530783|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11214001207 | 024, 026, ms_260 | v1|305776744176|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11214403002 | 024, 026, ms_240 | v1|296036793085|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11216407110 | 024, 026, ms_240 | v1|278066430044|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11216470601 | 024, 026, ms_240 | v1|136286880194|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11216470603 | 024, 026, ms_240 | v1|267693069112|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11216473100 | 024, 026, ms_240 | v1|298308384377|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11216477002 | 024, 026, 064 | v1|123292431094|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11217901714 | 024, 026, ms_260 | v1|377578382124|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11217909903 | 024, 026, ms_240 | v1|298353971020|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11217917202 | 024, 026, ms_240 | v1|257553488464|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11217929101 | 024, 026, ms_240 | v1|333925257258|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11221950400 | 064, 066, 08 | v1|178171883719|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11230203033 | ms_210, ms_230, ms_250 | v1|306190873411|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11230203034 | ms_210, ms_230, ms_250 | v1|306190922141|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11230302016 | ms_230, ms_250 | v1|297238739668|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11230801813 | ms_210, ms_230, ms_250 | v1|256756205505|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11230801815 | ms_210, ms_230, ms_250 | v1|168830182746|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11230846501 | ms_210, ms_230, ms_250 | v1|296685652328|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11231200606 | ms_230, ms_250 | v1|257553488687|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11231200632 | ms_230, ms_250 | v1|206553840585|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11231207103 | ms_210, ms_230, ms_250 | v1|142255476828|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11231215401 | ms_210, ms_230, ms_250 | v1|358897578154|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11231226701 | ms_210, ms_230, ms_250 | v1|333578799365|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11231237504 | ms_210, ms_230, ms_250 | v1|372959216416|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11231400611 | ms_210, ms_230, ms_250 | v1|293645527487|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11231413200 | 023, 025, ms_230 | v1|257553488620|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11231414001 | ms_210, ms_230, ms_250 | v1|164247916432|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11231900700 | ms_210, ms_230, ms_250 | v1|365454469025|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11231952000 | ms_210, ms_230, ms_250 | v1|198755798133|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11231957201 | ms_210, ms_230, ms_250 | v1|235823971974|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11231957202 | ms_210, ms_230, ms_250 | v1|278066429898|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11237901017 | ms_210, ms_230, ms_250 | v1|206694980298|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11239671515 | 021, 023, 025 | v1|366775464189|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11241953500 | 064, 066, 08 | v1|278066426737|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11251229003 | 034, 036, ms_340 | v1|355995178670|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11251623000 | 029, 034, 039 | v1|127255442810|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11251623202 | 036, ms_360, ts_410 | v1|167334724284|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11270840900 | 029, 039, ms_290 | v1|267693068817|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11270844100 | 029, 039, ms_290 | v1|195362320809|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11271217000 | 029, 038, 039 | v1|185793984943|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11271226800 | 029, 039, fs_500 | v1|137928050498|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11271241500 | 029, 039, ms_290 | v1|820286644976|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11271625800 | 029, 039, ms_290 | v1|373489368095|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11274403001 | 029, 039, ms_290 | v1|267693068872|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11276403800 | 029, 039, ms_290 | v1|198755895663|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11276470601 | 029, 039, ms_290 | v1|226864856634|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11276470602 | 029, 039, ms_290 | v1|278066428404|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11280071065 | 034, 036, 044 | v1|296685642724|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11281226603 | 046, gs_461, ms_460 | v1|336394266313|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11281414001 | 044, 046, 088 | v1|127376902537|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11286561500 | 046, ms_460, ms_461 | v1|235773758843|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11320341501 | 018, ms_180, ms_182 | v1|267693068975|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11350071003 | ms_341, ms_361 | v1|920025925161|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11350202606 | ms_341, ms_361 | v1|820287160486|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11350202913 | ms_341, ms_361 | v1|860051173256|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11350844100 | ms_341, ms_361 | v1|336394265080|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11350847800 | ms_341, ms_361 | v1|168825656828|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11351204100 | ms_341, ms_361 | v1|136474158259|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11351215401 | ms_341, ms_361 | v1|397503387322|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11351218600 | ms_341, ms_361 | v1|336394266372|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11351237501 | ms_341, ms_361 | v1|373256394185|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11351416300 | ms_341, ms_361 | v1|336394265082|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11351821500 | ms_341, ms_361 | v1|127377511887|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11353507600 | ms_341, ms_361 | v1|316961078935|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11354403000 | ms_341, ms_361 | v1|127376902058|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11356507750 | ms_341, ms_361 | v1|236915484202|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11356640500 | ms_341, ms_361 | v1|284103775848|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11356640501 | ms_341, ms_361 | v1|353495661441|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11357908301 | ms_361 | v1|227256183586|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11357909100 | ms_341, ms_361 | v1|137897232729|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11357909900 | ms_341, ms_361 | v1|187681804880|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11357909902 | ms_341, ms_361 | v1|960196768172|459504724020 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11357910601 | ms_361 | v1|235833908925|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11357913100 | ms_341, ms_361 | v1|195908912302|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11357916100 | ms_341, ms_361 | v1|127347394478|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11357917200 | ms_341, ms_361 | v1|194945081264|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11357922900 | ms_341, ms_361 | v1|187596975406|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11359671500 | ms_361 | v1|235355855041|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11359671501 | ms_361 | v1|257354610019|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11381605000 | ms_231, ms_241, ms_251 | v1|257553487780|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11381820800 | ms_311, ms_362, ms_391 | v1|198755798072|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11386561500 | ms_361 | v1|136216827307|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11400071002 | ms_362, ms_400 | v1|267693068803|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11400072501 | ms_362, ms_400 | v1|278066428566|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11400211105 | ms_362, ms_400 | v1|136203551659|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11401243500 | ms_311, ms_362, ms_391 | v1|267693069152|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11401402802 | ms362c_m, ms400c_m, ms_362 | v1|278066428581|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11401404402 | ms_311, ms_362, ms_391 | v1|136475478042|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11401490600 | ms_311, ms_362, ms_391 | v1|385338614805|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11401800903 | ms_362, ms_400 | v1|117493530725|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11401820900 | ms_311, ms_362, ms_391 | v1|188009282336|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11411201602 | ms_261, ms_362, ms_400 | v1|257553485051|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11441290900 | ms_193, ms_194, ms_500i | v1|257553487985|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 41121628903 | fs_50, fs_51, fs_60 | v1|920071652913|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 41121950400 | bg_60, bg_61, fs_60 | v1|267693067388|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41123588100 | fr_106, fr_108, fs_106 | v1|333332849853|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41143591200 | bg_60, bg_61, fs_50 | v1|182780144381|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41190343002 | fr_350, fs_180, fs_200 | v1|136203577818|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41287900950 | fs_300, fs_350, fs_400 | v1|117493455612|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41287929300 | fs_300, fs_310, fs_350 | v1|358569016084|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41341207100 | bt_120, fr_350, fs_120 | v1|116947099878|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41341419000 | fr_350, fs_120, fs_200 | v1|167848798093|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41344401100 | bt_120, fr_350, fs_120 | v1|124551131992|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41344481200 | bt_120, fr_350, fs_120 | v1|236504756391|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41371215600 | fc_55, fs_38, fs_45 | v1|376796769960|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41400071061 | fs_38, fs_55, hs_45 | v1|267346742888|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41400203000 | fc_55, fs_38, fs_45 | v1|267693069744|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 41400203002 | fs_55, km_55 | v1|358802875972|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41400302004 | fc_55, fs_38, fs_45 | v1|389694784221|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41400302009 | fs_38, fs_55, hs_45 | v1|306388360573|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41400801602 | fc_55, fs_38, fs_45 | v1|900011411560|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 41401202204 | fs_38, fs_55, hs_45 | v1|336345099658|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41401202300 | fs_38, fs_55, hs_45 | v1|326336986091|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41401207101 | fc_55, fs_38, fs_45 | v1|224971898392|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41401400617 | fc_55, fs_38, fs_45 | v1|146837544314|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 41401801750 | fs_38, fs_45, fs_55 | v1|920045235806|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41401824500 | fc_55, fs_38, fs_45 | v1|187457349005|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 41401827601 | fc_55, fs_38, fs_45 | v1|377450592317|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41401900710 | fs_45, fs_55, km_55 | v1|296685655274|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41401950410 | fs_45, fs_55, km_55 | v1|298696552556|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 41401952010 | fs_45, fs_55, km_55 | v1|278066426283|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41403532400 | fc_55, fs_38, fs_45 | v1|227115253425|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41404001314 | fs_38, fs_55, hl_45 | v1|317082165079|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41404401900 | fc_55, fs_38, fs_45 | v1|293949640358|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41404401903 | fs_55, km_55, mm_55 | v1|235709460737|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41407113203 | fs_55, km_55, km_56 | v1|187376761723|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 41407915400 | fc_55, fs_38, fs_45 | v1|146837548934|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 41446407300 | fs_55, fs_56, fs_mm | v1|117493455631|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41447108116 | fs_55, fs_56, fs_70 | v1|278122102892|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41800801605 | fc_100, fc_110, fs_100 | v1|297448630591|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42240071014 | ts_410, ts_420, ts_440 | v1|257553488281|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42240341500 | ms_441, ts_700, ts_710 | v1|306821622609|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42247002901 | ts_420, ts_500i, ts_700 | v1|395034841576|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42247008108 | ts_420, ts_500i, ts_700 | v1|234735588861|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42247040502 | ts_410, ts_420, ts_440 | v1|117530377356|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42281290905 | hs_45 | v1|306766275444|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42281410500 | hs_45 | v1|257553484958|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42281410502 | hs_45 | v1|298478987832|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42286490301 | hs_45, hs_52 | v1|158188936396|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42286490302 | hs_45 | v1|257617339853|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42380071060 | ts_410, ts_420, ts_440 | v1|135201867861|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42380071600 | ts_410, ts_420, ts_440 | v1|298569373446|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42380209400 | ts_410, ts_420, ts_440 | v1|117530378074|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42380341500 | ts_410, ts_420, ts_440 | v1|227552927178|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42380800900 | ts_410, ts_420, ts_440 | v1|276509366546|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42380801602 | ts_410, ts_420, ts_440 | v1|820375860257|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42380801604 | ts_410, ts_420, ts_440 | v1|178354679447|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42380802200 | ts_410, ts_420, ts_440 | v1|253160744728|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42380847400 | ts_410, ts_420, ts_440 | v1|198367892568|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42381207100 | ts_410, ts_420, ts_440 | v1|278066433124|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42381212400 | ts_400, ts_410, ts_420 | v1|187476591288|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42381216100 | ts_410, ts_420, ts_440 | v1|257553488543|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42381237500 | ts_410, ts_420, ts_440 | v1|404313470293|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42381402200 | ts_410, ts_420, ts_440 | v1|306353156724|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42381411800 | ts_410, ts_420, ts_440 | v1|267848201564|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42381412202 | ts_410, ts_420, ts_440 | v1|404774564303|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42381412203 | ts_410, ts_420, ts_440 | v1|267693068973|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42381415400 | ts_410, ts_420, ts_440 | v1|278066426240|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42381820800 | ts_410, ts_420, ts_440 | v1|332950689281|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42381821500 | ts_410, ts_420, ts_440 | v1|358741096334|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42381824500 | ts_410, ts_420, ts_440 | v1|127281216146|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42381824700 | ts_410, ts_420, ts_440 | v1|198755798157|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42381851500 | ts_410, ts_420, ts_440 | v1|287617714556|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42381901001 | ts_410, ts_420, ts_440 | v1|136475640617|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42381959000 | ts_410, ts_420, ts_440 | v1|278066427353|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42383528201 | ts_410, ts_420, ts_440 | v1|297413636332|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42383540100 | ts_410, ts_420, ts_440 | v1|306353148787|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42383587700 | ts_410, ts_420, ts_440 | v1|404313452900|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42384312100 | ts_410, ts_420, ts_440 | v1|187190106498|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42384356001 | ts_410, ts_420, ts_440 | v1|394653989275|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42386910200 | ts_410, ts_420, ts_480i | v1|306147595465|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42387007300 | ts_410, ts_420, ts_440 | v1|267524255248|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42387907600 | ts_410, ts_420, ts_480i | v1|257553488761|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42387907605 | ts_410, ts_420, ts_480i | v1|127391862238|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42387908300 | ts_410, ts_420, ts_440 | v1|283556559774|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42387908301 | ts_410, ts_420, ts_440 | v1|404774565045|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42387908302 | ts_410, ts_420, ts_440 | v1|358733436697|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42387910600 | ts_410, ts_420, ts_440 | v1|394653984248|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42387910900 | ts_410, ts_420, ts_440 | v1|187457348525|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42387910905 | ts_410, ts_420, ts_440 | v1|306353127319|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42387910910 | ts_410, ts_420, ts_440 | v1|398102617742|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42387911700 | ts_410, ts_420, ts_440 | v1|395174381203|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42387911900 | ts_410, ts_420, ts_440 | v1|267693069830|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42387917601 | ts_410, ts_420, ts_480i | v1|394654047094|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42410201200 | bg_86, br_200, sh_56 | v1|185891048832|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42410210302 | bg_56, bg_86, br_200 | v1|187458062129|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42410300401 | bg_56, bg_66, bg_86 | v1|302169986168|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42410801804 | bg_56, bg_66, bg_86 | v1|257837651591|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42411216900 | bg_56, bg_66, bg_86 | v1|358251031362|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42411411100 | bg_56, bg_66, bg_86 | v1|117374396084|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42411821001 | bg_66, bg_86, sh_86 | v1|266717628163|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42411821501 | bg_56, bg_66, bg_86 | v1|257553488502|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42411822900 | bg_66, bg_86, sh_86 | v1|237051393765|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42411824204 | bg_66, bg_86, sh_86 | v1|256826956926|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42411824300 | bg_66, bg_86, sh_86 | v1|278066429819|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42411950403 | bg_56, bg_66, bg_86 | v1|306337327311|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42413532700 | bg_56, bg_66, bg_86 | v1|117493530689|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42414312100 | bg_56, bg_66, bg_86 | v1|188342771981|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42414403000 | bg_66, bg_86, sh_86 | v1|168622628785|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42417002200 | bg_56, bg_86, sh_56 | v1|147627718393|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42417004100 | bg_66, bg_86, sh_86 | v1|188342857890|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42417006900 | bg_56, bg_86, sh_56 | v1|198755798269|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42417068000 | bg_56, bg_66, bg_86 | v1|278066468706|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42417083100 | bg_56, bg_86, sh_56 | v1|157641418980|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42417603501 | bg_56, bg_86, sh_56 | v1|371797807370|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42417608200 | bg_56, bg_86, sh_56 | v1|198625106872|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42417905605 | bg_66, bg_86, sh_86 | v1|278050836751|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42417910605 | bg_66, bg_86, sh_86 | v1|188342934006|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42417913100 | bg_66, bg_86, br_200 | v1|266050092139|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42417922901 | bg_66, bg_86, br_200 | v1|327454333893|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42827003406 | br_450, br_600 | v1|147614571113|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42827004106 | br_600 | v1|307236388399|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42827004108 | br_600 | v1|158066575015|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42827010701 | br_600 | v1|177373547586|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42827083400 | br_550, br_600 | v1|257553485030|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42827086355 | br_600 | v1|257553487881|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42827982200 | br_600, br_700 | v1|298242894783|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42829671501 | br_600 | v1|257553488039|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 90223410961 | fh_135, fh_75, fh_km | v1|306840270474|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 90223411018 | ms_341, ms_361 | v1|135348837678|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 90223711350 | 046, 066, ms_441 | v1|304667301844|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 90412160320 | 075, fs_80, re_400 | v1|203816333924|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 90744774438 | ms_231, ms_241, ms_251 | v1|187724595851|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 90744784655 | fw_20, ms_241, ms_261 | v1|235070519127|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 90744784706 | ts_410, ts_420, ts_440 | v1|275393050141|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 90754784735 | 029, 039, ms_290 | v1|117493530867|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 91040033002 | 019, fs_400, fs_450 | v1|147053669903|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 94438257131 | ts_410, ts_420, ts_440 | v1|126361571045|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 94566212960 | fr_106, fr_108, fr_145 | v1|116947099896|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 95030030320 | 024, 026, ms_240 | v1|304344149325|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 95030030360 | ts_410, ts_420, ts_440 | v1|137096955646|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 95120032252 | ms_240, ms_260 | v1|267693069785|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 95120032348 | ms_341, ms_361 | v1|194941485859|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 96400031355 | 046, 064, 066 | v1|396788771684|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 96459457485 | 024, 026, ms_240 | v1|306193028195|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 96469510150 | 009, 010, 011 | v1|335698569071|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |

De volledige lijst met alle 956 aanbiedingen staat in
`output/phase99/PHASE99_EBAY_ACTIVATION.json` onder `accepted_offers`.

## 8. Resterende blokkades

NEEDS_EVIDENCE (1.306 kandidaten op
212 onderdelen):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
| `LISTING_MPN` | 1.306 |

REJECTED (38 kandidaten op
23 onderdelen):

| Reden | Kandidaten |
|---|---:|
| `CONFLICTING_MPN` | 38 |

Onafgeronde onderdelen (0): een marktplaats gaf een
fout, dus de geplande zoekopdrachten op beide marktplaatsen zijn niet voltooid. Deze
staan als onafgerond in het checkpoint en zijn niet als "geen listing" geteld.

| Onderdeel | Batch | API-fouten |
|---|---|---|
| — | — | — |

## 9. Batchbereik en checkpoint

| Batch | Verwerkt | Compleet | 429-stop | Laatste checkpoint |
|---|---:|---|---|---|
| `queue_30` | 40 | ja | nee | 2026-11-22T08:15:31.271Z |
| `queue_31` | 40 | ja | nee | 2026-11-22T08:20:11.212Z |
| `queue_32` | 40 | ja | nee | 2026-11-22T08:25:29.770Z |
| `queue_33` | 40 | ja | nee | 2026-11-22T08:30:13.891Z |
| `queue_34` | 40 | ja | nee | 2026-11-22T08:35:32.965Z |
| `queue_35` | 40 | ja | nee | 2026-11-22T08:40:53.871Z |
| `queue_36` | 40 | ja | nee | 2026-11-22T08:46:22.326Z |
| `queue_37` | 40 | ja | nee | 2026-11-22T08:51:13.599Z |
| `queue_38` | 40 | ja | nee | 2026-11-22T08:56:22.365Z |
| `queue_39` | 40 | ja | nee | 2026-11-22T09:01:00.975Z |
| `retry_00` | 40 | ja | nee | 2026-11-22T09:09:32.902Z |
| `retry_01` | 40 | ja | nee | 2026-11-22T09:17:42.688Z |
| `retry_02` | 40 | ja | nee | 2026-11-22T09:25:54.499Z |
| `retry_03` | 14 | ja | nee | 2026-11-22T09:28:50.524Z |

Alternatieve zoektermen (model + onderdeeltype) zijn in een tweede pass gedraaid over
de 134 onderdelen die de exacte nummerpass zonder ACCEPT afrondden;
de exacte nummerladder staat altijd vooraan in de zoekopdracht. Die pass leverde
0 extra onderdelen en
0 extra aanbiedingen op.

### Afgebroken eerste poging (API-quotum)

De eerste doorloop van `queue_30` en `queue_31` (65 onderdelen, 06:49–07:20 UTC) is
verworpen: eBay's Browse API gaf toen op elke zoekopdracht HTTP 429 (errorId 2001,
het dagquotum van 5.000 calls was door fase 96–98 uitgeput). De engine probeert een
429 een paar keer opnieuw en liet die onderdelen daarna als `NO_LISTING_FOUND`
achter, terwijl er niets gezocht was. Die checkpoints staan apart in
`output/phase99/invalid_quota/` en tellen nergens mee. De runner is aangepast: een
onderdeel zonder enkele geslaagde API-call (`api_calls === 0`) is nu onafgerond en
stopt de run met `EBAY_NO_API_RESPONSE`, zodat een leeg quotum nooit meer als
"geen listing" wordt opgeslagen. Na het quotumvenster (08:10 UTC) is de batch
opnieuw vanaf `queue_30` gedraaid; alle 400 onderdelen zijn met een werkende API
onderzocht en geen enkel onderdeel is onafgerond gebleven.

## 10. Publicatie en verificatie

- PR: (open)
- Geverifieerde productiecommit: `(na deploy)`
- Gedeployed: -
- `/api/version`: -
- Store geschreven via de bestaande `EbayStoreBootstrap` + `saveEbayOfferStore`;
  bestaande ACTIVE-aanbiedingen zijn niet verwijderd of gewijzigd.
- Campagne: archief en `EBAY_EPN_CAMPAIGN_ID` geven beide
  `5339245312`; 956 van
  956 nieuwe aanbiedingen dragen die campagne in de affiliate-URL.
  Technische campagnevalidatie is daarmee aangetoond; een registratie in het
  EPN-dashboard is niet bevestigd (geen inloggegevens beschikbaar).



## 11. Artefacten

| Bestand | Inhoud |
|---|---|
| `output/phase99/PHASE99_BASELINE.json` | nulmeting met de deelverzamelingen per platform |
| `output/phase99/queue.json` | de volgende 400 prioriteitsonderdelen |
| `output/phase99/batches/queue_XX.json` | batches van 40 onderdelen |
| `output/phase99/batches/queue_XX_progress.json` | hervatbaar checkpoint per onderdeel |
| `output/phase99/batches/retry_00.json` | onderdelen voor de alternatieve zoekpass |
| `output/phase99/PHASE99_EBAY_ACTIVATION.json` | alle nieuwe aanbiedingen, blokkades en modeldekking |
