# Fase 98 — meer STIHL-onderdelen met een eerste directe eBay-kooplink

Alleen de eBay-kant is gewijzigd. De Amazon-registry en de Amazon-route zijn niet
aangeraakt; Amazon-dekking is uitsluitend gebruikt om te prioriteren en om de
gecombineerde dekking te meten.

## 1. Dekking voor en na (identieke sleutels)

| Metric | Voor | Na |
|---|---:|---:|
| ACTIVE eBay-aanbiedingen | 4.218 | 4.813 |
| Unieke onderdelen met een eBay-link | 819 | 996 |
| eBay.de / eBay.nl | 1.522 / 2.696 | 1.729 / 3.084 |
| Amazon-onderdelen met directe link | 1.895 | 1.895 |
| **Unieke onderdelen met een directe kooplink (eBay of Amazon)** | **2.597** | **2.774** |

De nulmeting leest de store zoals die op main staat (commit `75210f29e36600f09fb53e18e2ade331a5c47e4b`),
niet de werkmap: een lopende batch schrijft al aanbiedingen weg en die mogen niet
als "voor" worden geteld. De eindmeting leest de live store plus de Amazon-registry
opnieuw, met dezelfde sleutels (`parts_ebay`, `parts_amazon`, `parts_combined`).

## 2. Resultaat van deze batch

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **595** |
| Nieuwe unieke onderdelen met hun **eerste directe eBay-kooplink** | **177** |
| Nieuwe unieke onderdelen met hun **eerste directe kooplink over alle platformen** | **177** |
| Waarvan zonder Amazon-link vóór deze batch | 177 |
| Waarvan met alleen een Amazon-link vóór deze batch | 0 |
| Nieuwe onderdelen op een GSC-prioriteitsmodel | 177 |
| Onderzochte onderdelen (exacte nummerpass) | 400 |
| Onderzochte onderdelen (aanvullende zoektermen) | 109 |
| Onderzochte onderdelen totaal | 509 |
| Onderdelen zonder enige listing op eBay.de/nl | 199 |
| Onderdelen dat na beide passes nog geen eBay-link heeft | 223 |
| Onafgeronde onderdelen (marktplaats gaf een fout) | 0 |
| NEEDS_EVIDENCE-kandidaten | 788 |
| REJECTED-kandidaten | 33 |
| Onderdelen met aangevuld bewijs via getItem | 177 |
| Onderdelen met hergebruikt bewijs | 80 |
| Dubbel getelde geaccepteerde records | 0 |
| Nieuwe onderdelen buiten deze queue | 0 |

Marktplaatsverdeling van de nieuwe aanbiedingen: **eBay.de 207**,
**eBay.nl 388**.
595 van 595 aanbiedingen
hebben `ships_to_nl: true`; statusverdeling:
`SHIPS_TO_NL_CONFIRMED` 595.

## 3. Queue en prioritering

- Queue: 400 onderdelen in batches van 40
  (`queue_20`, `queue_21`, `queue_22`, `queue_23`, `queue_24`, `queue_25`, `queue_26`, `queue_27`, `queue_28`, `queue_29`), direct na `queue_19` van fase 97.
- Alle 400 queueonderdelen hadden
  **geen directe kooplink op eBay én Amazon**; alle
  400 staan op een GSC-prioriteitsmodel
  (24 modellen).
- Uitgesloten: 800 onderdelen die fase 96 en
  fase 97 al onderzochten (373 fase 96,
  400 fase 97, 27 in beide).
- Resterend na deze queue: 17.060 kandidaten,
  waarvan 15.282 zonder enige kooplink en
  1.724 op een GSC-prioriteitsmodel.

## 4. Extra dekking per GSC-prioriteitsmodel

| Model | Onderdelen | Gedekt vóór | Gedekt ná | Nieuw | Nog zonder link |
|---|---:|---:|---:|---:|---:|
| 044 | 343 | 270 | 273 | +3 | 70 |
| 046 | 308 | 237 | 242 | +5 | 66 |
| bg_86 | 169 | 93 | 101 | +8 | 68 |
| br_600 | 239 | 114 | 130 | +16 | 109 |
| fs_100 | 252 | 195 | 204 | +9 | 48 |
| fs_350 | 262 | 175 | 190 | +15 | 72 |
| fs_55 | 354 | 231 | 243 | +12 | 111 |
| fs_80 | 424 | 332 | 343 | +11 | 81 |
| fs_85 | 389 | 311 | 322 | +11 | 67 |
| hs_45 | 205 | 120 | 124 | +4 | 81 |
| ms_170 | 248 | 168 | 200 | +32 | 48 |
| ms_180 | 263 | 174 | 202 | +28 | 61 |
| ms_230 | 280 | 212 | 222 | +10 | 58 |
| ms_250 | 276 | 207 | 216 | +9 | 60 |
| ms_260 | 279 | 188 | 199 | +11 | 80 |
| ms_310 | 228 | 175 | 182 | +7 | 46 |
| ms_361 | 278 | 181 | 196 | +15 | 82 |
| ms_362 | 389 | 165 | 180 | +15 | 209 |
| ms_390 | 213 | 164 | 171 | +7 | 42 |
| ms_440 | 277 | 237 | 237 | +0 | 40 |
| ms_441 | 310 | 136 | 150 | +14 | 160 |
| ms_460 | 270 | 221 | 224 | +3 | 46 |
| ms_461 | 263 | 196 | 200 | +4 | 63 |
| ms_661 | 271 | 109 | 116 | +7 | 155 |
| ts_420 | 257 | 105 | 124 | +19 | 133 |

## 5. LISTING_MPN-voorraad uit fase 97, opnieuw gemeten

| | Aantal |
|---|---:|
| Unieke onderdelen in de fase 97 LISTING_MPN-backlog | 146 |
| Met een geldige eBay-link vóór fase 98 | 119 |
| Met een geldige eBay-link ná fase 98 | 119 |
| Nog zonder eBay-link (open) | 27 |

Geen van deze onderdelen is zonder nieuwe listing of nieuwe, door de engine
geaccepteerde bewijsbron opnieuw geopend; titel-only matches blijven
`NEEDS_EVIDENCE` en tegenstrijdige nummers blijven `REJECTED`.

## 6. Per nieuw onderdeel (eerste bewezen aanbieding)

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Verzendkosten | Amazon-link vóór | Aanbiedingen |
|---|---|---|---|---|---:|---|---:|
| 00001205111 | fr_460, fs_460, fs_461 | v1|117493455592|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 00001240800 | 044, 064, 066 | v1|296685657085|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 00003591220 | 039, 044, 046 | v1|306061976149|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 00003591241 | 018, ms_170, ms_180 | v1|274958000943|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 00006642405 | ms_260, ms_261, ms_270 | v1|387913339478|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 00009630809 | ts_410, ts_420 | v1|227482793926|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 00009890507 | 042, 048, ms_150 | v1|127408293096|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 00009890812 | 044, 046, 064 | v1|233897952383|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11131828901 | 009, 010, 011 | v1|357635660906|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11171215000 | 042, 048, 051 | v1|127347447497|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11190848300 | 024, 026, 034 | v1|336814356784|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11211218600 | 024, 026, 028 | v1|154978320023|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11211628000 | 024, 026, ms_240 | v1|256800661775|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11216482200 | 026, ms_260, ms_261 | v1|136475453270|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11216641000 | 026, ms_260, ms_270 | v1|187596919577|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11216647301 | 026, ms_260, ms_261 | v1|157930016730|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11220343000 | 046, 064, gs_461 | v1|330753137692|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11221226602 | 029, 039, 064 | v1|366775459757|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11230209400 | 017, 018, 021 | v1|267693070206|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11230343005 | 021, 023, fr_350 | v1|205560541043|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11230847800 | 021, 023, 025 | v1|372959305981|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11231207201 | 017, 021, 023 | v1|192893320399|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11231226201 | 021, 023, 025 | v1|275512049264|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11231412000 | 021, 023, 025 | v1|385689936467|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11231415600 | 021, 023, 025 | v1|147689931318|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11234403001 | 021, 023, 025 | v1|960205451449|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11251801405 | 036, ms_280, ms_360 | v1|136474154635|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11251801703 | 036, ms_261, ms_280 | v1|800862240681|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11251824502 | 036, ms_261, ms_280 | v1|127376845396|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11251824505 | 036, ms_280, ms_360 | v1|227472353930|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11254421601 | 024, 026, 034 | v1|198755891773|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11256472400 | 029, 034, 036 | v1|126762768274|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11271215602 | 009, 029, 039 | v1|336394266414|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11271451601 | 029, 039, ms_290 | v1|174088542131|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11271490600 | 029, 039, ms_290 | v1|185572297095|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11271605550 | 029, 039, ms_290 | v1|136203537066|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11281203404 | 046, ms_460 | v1|318837471814|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11281226601 | bt_45, ms_270, ms_280 | v1|374512528145|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11281401001 | 046, ms_460 | v1|377656622203|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11281401009 | ms_461 | v1|257553487727|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11281800912 | ms_461 | v1|185790493695|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11300212502 | ms_170, ms_170_2_mix | v1|307196419430|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11300302014 | ms_170, ms_170_2_mix | v1|136203537568|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11300343007 | ms_170, ms_170_2_mix, ms_193 | v1|257553488609|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11300801807 | ms_170, ms_180 | v1|278066428682|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11300847801 | ms_170, ms_180 | v1|267328988793|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11300848303 | 018, ms_170, ms_180 | v1|117493530802|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11301214800 | 017, 018, ms_170 | v1|225905380691|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301223001 | 017, 018, ms_170 | v1|157603707651|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301226601 | 017, 018, ms_170 | v1|157058517825|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301243200 | 018, ms_170, ms_180 | v1|305874404833|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11301243203 | ms_170, ms_180, ms_180_2_mix | v1|306175274633|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301247100 | 017, 018, ms_170 | v1|198532316177|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11301402500 | ms_170, ms_180, ms_180_2_mix | v1|187098805715|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 11301404714 | ms_170, ms_180 | v1|267688530382|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11301411800 | 017, 018, ms_170 | v1|136405144808|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11301411801 | 017, 018, ms_170 | v1|373099598215|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301412306 | 018, ms_170, ms_180 | v1|198755798208|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11301413205 | ms_170, ms_180, ms_180_2_mix | v1|226764517677|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301419003 | 017, 018, ms_170 | v1|298309095885|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301453400 | 018, ms_170, ms_180 | v1|306910526877|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 11301821002 | 017, 018, ms_170 | v1|257544150846|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11301900700 | ms_170, ms_180 | v1|327432632128|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11301952000 | ms_170, ms_180 | v1|267103764329|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11301952001 | ms_170, ms_180 | v1|298378168328|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11304401101 | 017, 018, ms_170 | v1|257553487937|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11304402201 | 017, 018, ms_170 | v1|257544204126|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11307910601 | 017, 018, ms_170 | v1|137834297899|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11307914903 | ms_170, ms_180 | v1|267693068769|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11307915900 | 017, 018, ms_170 | v1|127347394443|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 11308932601 | ms_170, ms_193 | v1|267693069765|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11309671504 | ms_170 | v1|305776745816|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11331605000 | ms_261, ms_280, ms_291 | v1|187342470734|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11356470600 | ms_341, ms_361, ms_362 | v1|278066428474|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11356603000 | ms_260, ms_261, ms_270 | v1|117493530805|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11380211100 | ms_441 | v1|257553488504|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 11380211101 | ms_441 | v1|186337488362|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11381411001 | ms_441 | v1|407376406165|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 11381820900 | ms_441 | v1|187457347078|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 11381820904 | ms_441 | v1|147650889153|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11381824500 | ms_261, ms_271, ms_271p | v1|204065588839|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 11384300502 | ms_241, ms_261, ms_362 | v1|127376905814|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 11391209702 | ms_171, ms_181, ms_210 | v1|117493530695|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 30030009731 | 041, 045, 056 | v1|860157917965|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41197172806 | fs_160, fs_180, fs_220 | v1|167029788335|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41280071060 | bt_120, bt_121, fr_350 | v1|374931093924|644032773651 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41281226300 | bt_120, fr_350, fr_450 | v1|335220158365|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41286407301 | fs_160, fs_180, fs_220 | v1|136203577840|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41286410351 | fs_160, fs_180, fs_220 | v1|236902284992|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41287172707 | fs_160, fs_180, fs_220 | v1|206162076144|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41287901300 | fs_120, fs_200, fs_25 | v1|187902665096|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41287917500 | fs_300, fs_350, fs_400 | v1|117493530824|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41287922400 | fr_410, fr_460, fs_240 | v1|198755798232|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41331208701 | fc_72, fs_72, fs_74 | v1|233869558525|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41341213000 | bt_120, bt_121, fr_350 | v1|237099857547|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41341237300 | bt_120, bt_121, fr_350 | v1|196965521097|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41341822104 | bt_120, bt_121, fr_350 | v1|136203578509|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41341822105 | bt_120, fr_350, fr_450 | v1|136203578524|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41341900600 | bt_120, fr_350, fr_450 | v1|287573494099|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41370842200 | fc_85, fh_75, fr_85 | v1|204522720422|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41371200602 | fh_75, fr_85, fs_75 | v1|158273637631|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41371211600 | bg_75, fh_75, fr_85 | v1|257553488431|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41371413800 | bg_75, fh_75, fr_85 | v1|186711247083|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41371419000 | bg_75, fc_85, fh_75 | v1|256396148359|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41371824503 | fc_85, fh_75, fs_75 | v1|267156997969|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41374401101 | fc_85, fh_75, fs_75 | v1|820036046823|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41400071006 | fs_25, fs_44, fs_55 | v1|198755798243|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41400292302 | fs_38, fs_55, hs_45 | v1|205539561304|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41401413801 | fc_55, fs_38, fs_45 | v1|296368483699|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 41401451200 | bg_45, bg_55, bg_85 | v1|235294911126|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41401820800 | fc_55, fs_38, fs_45 | v1|377614626632|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 41401824505 | fc_55, fs_38, fs_45 | v1|198755798244|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41401827602 | fc_55, fs_38, fs_45 | v1|287740100459|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41401900410 | fs_45, fs_55, km_55 | v1|168450223225|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41401904010 | fs_45, fs_55, km_55 | v1|147679730875|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 41403528100 | fc_55, fs_38, fs_45 | v1|198755798060|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41403532402 | fc_55, fs_38, fs_45 | v1|307129656470|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41407900301 | fs_160, fs_180, fs_220 | v1|137884372862|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41440212500 | bg_56, bg_66, bg_86 | v1|357444071589|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41441202301 | bg_56, bg_66, bg_86 | v1|198805869955|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 41800252002 | fc_100, fc_110, fs_100 | v1|278066428445|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41800302001 | fc_100, fc_110, fs_100 | v1|316927459010|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41800343000 | fc_100, fc_110, fs_100 | v1|227537387320|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41801202207 | fc_100, fc_110, fs_100 | v1|198755680594|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 41801202303 | fc_100, fc_110, fs_100 | v1|257553487843|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41801207102 | fc_100, fc_110, fs_100 | v1|267844360098|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41801214701 | br_350, br_430, br_450 | v1|317848148300|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 41801215803 | fc_100, fc_110, fs_100 | v1|335691793355|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 41801402800 | fc_100, fc_110, fs_100 | v1|307130219376|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 41801829500 | fc_100, fc_110, fs_100 | v1|266309008090|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42017004500 | bt_45, gs_461, ts_350 | v1|198755798080|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42236705000 | bt_45, ts_350, ts_360 | v1|285764940790|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 42236706600 | bt_45, ts_350, ts_360 | v1|187547399697|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42236707700 | bt_45, ts_350, ts_360 | v1|800829244086|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42236708200 | bt_45, ts_350, ts_360 | v1|205241402477|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42236708600 | bt_45, ts_350, ts_360 | v1|187547401095|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42236782600 | bt_45, ts_350, ts_360 | v1|800844121499|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42237913600 | ts_400, ts_410, ts_420 | v1|227518880377|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42247088300 | ts_410, ts_420, ts_440 | v1|127347396263|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42297086300 | bg_45, bg_55, bg_56 | v1|127511212026|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42370343001 | bg_56, bg_86, br_200 | v1|820019021451|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42380074102 | ts_410, ts_420, ts_440 | v1|206588188908|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42380803102 | ts_410, ts_420, ts_440 | v1|234594557152|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42381602002 | ts_410, ts_420, ts_440 | v1|317484262559|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42381820900 | ts_410, ts_420, ts_440 | v1|362106974610|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 8 |
| 42386778202 | ts_410, ts_420, ts_480i | v1|198755798155|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42387060400 | ts_410, ts_420, ts_440 | v1|187547399613|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42411401002 | bg_86, sh_86 | v1|278066426053|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42411402803 | bg_86, sh_86 | v1|227351457759|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42417035600 | bg_45, bg_55, bg_56 | v1|306352042793|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42417917500 | bg_66, bg_86, sh_86 | v1|327454154536|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42820251600 | br_500, br_550, br_600 | v1|185839878126|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42821202200 | br_500, br_550, br_600 | v1|364323882224|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42821801500 | br_200, br_350, br_430 | v1|257553491031|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42821820800 | br_200, br_350, br_430 | v1|157138260525|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 42821822900 | br_200, br_350, br_430 | v1|960100479336|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42821822901 | br_430, br_450, br_500 | v1|186121496141|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42821824500 | br_200, br_350, br_430 | v1|136203555221|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42821824520 | br_200, br_350, br_430 | v1|276813401246|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 42824421603 | br_200, br_350, br_430 | v1|168705498721|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 42827001800 | br_430, br_550, br_600 | v1|307213495714|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 42827006900 | br_430, br_500, br_550 | v1|206707268082|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 7 |
| 42827088705 | br_430, br_500, br_550 | v1|298667478150|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 5 |
| 42830343006 | br_500, br_550, br_600 | v1|186169488469|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 90073191137 | bg_45, bg_55, bg_75 | v1|366139095075|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 90223991020 | ms_362, ms_400, ms_500i | v1|147053754450|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 90473190340 | 041, 045, 08 | v1|147053669872|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 4 |
| 90744784547 | br_200, br_350, br_430 | v1|307209011958|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 93714701060 | br_200, br_350, br_430 | v1|286259691396|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 1 |
| 94556211800 | fs_160, fs_180, fs_220 | v1|136404684928|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 95170030650 | 036, ms_261, ms_280 | v1|354270936429|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 96459457444 | 029, 039, ms_150 | v1|117493530870|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 96459457958 | bt_45, ts_350, ts_360 | v1|187457347053|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 96459458240 | bt_45, ts_350, ts_360 | v1|187457347055|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |
| 96469450355 | 021, 023, 025 | v1|187567693249|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 3 |
| 97710212550 | 024, 026, fs_160 | v1|305831334102|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | nee | 6 |
| 97710212572 | ms_271, ms_271p, ms_291 | v1|226522042938|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | nee | 2 |

De volledige lijst met alle 595 aanbiedingen staat in
`output/phase98/PHASE98_EBAY_ACTIVATION.json` onder `accepted_offers`.

## 7. Resterende blokkades

NEEDS_EVIDENCE (788 kandidaten op
135 onderdelen):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
| `LISTING_MPN` | 788 |

REJECTED (33 kandidaten op
19 onderdelen):

| Reden | Kandidaten |
|---|---:|
| `CONFLICTING_MPN` | 33 |

Onafgeronde onderdelen (0): een marktplaats gaf een
fout, dus de geplande zoekopdrachten op beide marktplaatsen zijn niet voltooid. Deze
staan als onafgerond in het checkpoint en zijn niet als "geen listing" geteld.

| Onderdeel | Batch | API-fouten |
|---|---|---|
| — | — | — |

## 8. Batchbereik en checkpoint

| Batch | Verwerkt | Compleet | 429-stop | Laatste checkpoint |
|---|---:|---|---|---|
| `queue_20` | 40 | ja | nee | 2026-11-21T22:33:37.810Z |
| `queue_21` | 40 | ja | nee | 2026-11-21T22:38:32.408Z |
| `queue_22` | 40 | ja | nee | 2026-11-21T22:43:13.296Z |
| `queue_23` | 40 | ja | nee | 2026-11-21T22:47:53.868Z |
| `queue_24` | 40 | ja | nee | 2026-11-21T22:52:53.394Z |
| `queue_25` | 40 | ja | nee | 2026-11-21T22:57:44.805Z |
| `queue_26` | 40 | ja | nee | 2026-11-21T23:02:31.774Z |
| `queue_27` | 40 | ja | nee | 2026-11-21T23:20:03.780Z |
| `queue_28` | 40 | ja | nee | 2026-11-21T23:40:04.491Z |
| `queue_29` | 40 | ja | nee | 2026-11-22T00:00:06.855Z |
| `retry_00` | 40 | ja | nee | 2026-11-22T00:21:27.528Z |
| `retry_01` | 40 | ja | nee | 2026-11-22T00:41:55.873Z |
| `retry_02` | 29 | ja | nee | 2026-11-22T00:56:27.787Z |

Alternatieve zoektermen (model + onderdeeltype) zijn in een tweede pass gedraaid over
de 40 onderdelen die de exacte nummerpass zonder ACCEPT afrondden;
de exacte nummerladder staat altijd vooraan in de zoekopdracht.

## 9. Publicatie en verificatie

- PR: (open)
- Geverifieerde productiecommit: `(na deploy)`
- Gedeployed: -
- `/api/version`: -
- Store geschreven via de bestaande `EbayStoreBootstrap` + `saveEbayOfferStore`;
  bestaande ACTIVE-aanbiedingen zijn niet verwijderd of gewijzigd.
- Campagne: archief en `EBAY_EPN_CAMPAIGN_ID` geven beide
  `5339245312`; 595 van
  595 nieuwe aanbiedingen dragen die campagne in de affiliate-URL.
  Technische campagnevalidatie is daarmee aangetoond; een registratie in het
  EPN-dashboard is niet bevestigd (geen inloggegevens beschikbaar).

## 10. Artefacten

| Bestand | Inhoud |
|---|---|
| `output/phase98/PHASE98_BASELINE.json` | nulmeting met de deelverzamelingen per platform |
| `output/phase98/queue.json` | de volgende 400 prioriteitsonderdelen |
| `output/phase98/batches/queue_XX.json` | batches van 40 onderdelen |
| `output/phase98/batches/queue_XX_progress.json` | hervatbaar checkpoint per onderdeel |
| `output/phase98/batches/retry_00.json` | onderdelen voor de alternatieve zoekpass |
| `output/phase98/PHASE98_EBAY_ACTIVATION.json` | alle nieuwe aanbiedingen, blokkades en modeldekking |
