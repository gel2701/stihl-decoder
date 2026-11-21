# Fase 97 — meer live eBay-dekking voor GSC-prioriteitsonderdelen

Alleen de eBay-kant is gewijzigd. De Amazon-registry en de Amazon-route zijn niet
aangeraakt.

## 1. Nulmeting en reconciliatie van fase 96

Productie draaide bij de start op `4c7e0db` (main, gedeployed 2026-11-21T06:59Z).
De eBay-store bevatte **2.968 ACTIVE aanbiedingen op
503 unieke onderdelen** (1931 eBay.nl,
1037 eBay.de); de Amazon-registry 1895 actieve onderdelen;
samen 2338 unieke onderdelen met een directe kooplink.

Het fase 96-rapport meldde 695 nieuwe aanbiedingen op 159 onderdelen, maar de store
groeide met 1195 aanbiedingen en 283 onderdelen. Het verschil —
**500 aanbiedingen op 124 onderdelen** — is nu
volledig te verklaren en te controleren:

- 124 onderdelen staan in de resultaatbestanden als `ALREADY_ACTIVE`.
  Dat zijn onderdelen die een eerdere, onderbroken run al had geactiveerd; de hervatte
  run sloeg ze over en telde ze daarom niet mee.
- Alle 500 aanbiedingen van die 124 onderdelen staan in de
  store en zijn met dezelfde campagne en hetzelfde bewijs geschreven; geen enkel
  onderdeel is zonder aanbieding achtergebleven
  (0 zonder store-record).
- De werkelijke fase 96-oogst is dus 1195 aanbiedingen op 283 onderdelen,
  niet 695/159. Het rapport van fase 96 is op dit punt te laag en is hierbij
  gecorrigeerd.

### Campagnecontrole

| Bron | Campagne-ID |
|---|---|
| Aanbodarchief (`data/affiliate/ebay_offers.json`) | 5339245312 |
| Beheerdersconfiguratie `EBAY_EPN_CAMPAIGN_ID` | gezet, gelijk aan het archief |
| Productie-bootstrap (`EbayStoreBootstrap`) | gebruikt `archive.campaign_id` wanneer de omgeving geen ID heeft |

De Browse API antwoordt met `itemAffiliateWebUrl` waarin `campid` gelijk is aan
`EBAY_EPN_CAMPAIGN_ID`; de engine keurt elke afwijking af als
`CAMPAIGN_ID_MISMATCH`. Een onafhankelijke controle in het eBay Partner
Network-dashboard was niet mogelijk: daarvoor zijn geen inloggegevens beschikbaar.
De campagne is daarom bevestigd via de beheerdersconfiguratie en de door eBay
geleverde affiliate-URL's, niet via het EPN-dashboard.

## 2. Werkwijze

1. `scripts/phase97_build_ebay_queue.mjs` hergebruikt de fase 96-queue en sluit de
   400 daar onderzochte onderdelen uit. De volgende 400 prioriteitsonderdelen staan
   in `queue_10` t/m `queue_19`, met dezelfde weging (eerst geen enkele kooplink,
   dan GSC-prioriteitsmodel, dan aantal machines, dan onderhoudsonderdeel).
2. De 846 LISTING_MPN-kandidaten zijn per uniek onderdeel gegroepeerd
   (146 onderdelen); 27 daarvan hadden nog geen
   eBay-link en vormen de retry-batch met alternatieve zoektermen (model + onderdeelnaam).
3. De runner (`scripts/phase97_ebay_activation.mjs`) gebruikt ongewijzigd
   `EbayBrowseApiClient`, `EbayHighVolumeEngine.evaluateOffer()`,
   `EbayEvidenceRegistry` en `saveEbayOfferStore`: eBay.de eerst, dan eBay.nl,
   `deliveryCountry:NL`, alle verkopers, ACCEPT/REVIEW/REJECT met
   `reason_codes` en `first_blocking_step`. Alleen ACCEPT wordt ACTIVE.
4. De runner checkpoint na elk onderdeel. Een API-quotumstop (`HTTP 429`) laat het
   onderdeel ongemoeid in plaats van het als "geen listing" op te slaan.

## 3. Resultaat

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **213** |
| Nieuwe unieke onderdelen met een eerste directe eBay-kooplink | **57** |
| Waarvan zonder enige andere directe kooplink (eerste kooplink over alle platformen) | 57 |
| Waarvan op een GSC-prioriteitsmodel | 57 |
| Unieke onderdelen met een directe kooplink na deze batch | 2338 |
| Onderzochte onderdelen | 68 |
| Onderdelen zonder enige listing op eBay.de/nl | 10 |
| NEEDS_EVIDENCE-kandidaten | 206 |
| REJECTED-kandidaten | 10 |
| Onderdelen met aangevuld bewijs via getItem | 57 |

Marktplaatsverdeling: **eBay.de 63**,
**eBay.nl 150**. Alle nieuwe aanbiedingen
hebben `shipping_status: SHIPS_TO_NL_CONFIRMED` uit de Browse API met
`deliveryCountry:NL`, en een affiliate-URL met de bevestigde campagne.

## 4. Dekking per GSC-prioriteitsmodel (top 30)

| Model | Nieuwe onderdelen |
|---|---:|
| fs_300 | 22 |
| fs_350 | 22 |
| fs_400 | 20 |
| fs_450 | 20 |
| fs_480 | 20 |
| fs_80 | 20 |
| fs_85 | 19 |
| fs_120 | 18 |
| fs_200 | 18 |
| fs_250 | 18 |
| fs_94 | 18 |
| fr_85 | 17 |
| fs_100 | 16 |
| fs_240 | 16 |
| fs_360 | 16 |
| fs_90 | 16 |
| fr_350 | 15 |
| fs_130 | 15 |
| fs_260 | 15 |
| hl_75 | 15 |
| fr_460 | 14 |
| fs_310 | 14 |
| fs_56 | 14 |
| fs_87 | 14 |
| hl_100 | 14 |
| fh_75 | 13 |
| fr_450 | 13 |
| fs_111 | 13 |
| fs_160 | 13 |
| fs_180 | 13 |

## 5. LISTING_MPN-voorraad

| | Aantal |
|---|---:|
| Kandidaten in fase 96 | 846 |
| Unieke onderdelen | 146 |
| Met een geldige eBay-link vóór deze batch | 119 |
| Met een geldige eBay-link ná deze batch | 119 |
| Nieuw gekoppeld via de retry-batch | 0 |
| Nog zonder eBay-link (open, met blokkade) | 27 |

| Onderdeel | Kandidaten | eBay-link | Alternatieve zoekterm |
|---|---:|---|---|
| 00004481250 | 1 | nee | STIHL 00004481250 Stihl 00004481250 Lead Retainer |
| 00009302242 | 1 | nee | STIHL 00009302242 Stihl Webbing |
| 00009741200 | 2 | nee | STIHL 00009741200 Stihl Notched Pin 2,6X8 |
| 00009890814 | 2 | nee | STIHL 00009890814 Stihl Grommet |
| 11061227400 | 1 | nee | STIHL 11061227400 Stihl Screw And Lock Washer |
| 11131210800 | 1 | nee | STIHL 11131210800 Stihl Fuel Strainer Cover |
| 11141227400 | 1 | nee | STIHL 11141227400 Stihl Screw |
| 11211625010 | 24 | nee | STIHL 11211625010 Stihl Lever |
| 11214420402 | 1 | nee | STIHL 11214420402 Stihl Insulating Hose 35Mm / 1.4" |
| 11271226701 | 1 | nee | STIHL 11271226701 Stihl High Speed Screw |
| 11280807500 | 1 | nee | STIHL 11280807500 Stihl Cover Plate |
| 11281226703 | 1 | nee | STIHL 11281226703 Stihl High Speed Screw |
| 11281621000 | 1 | nee | STIHL 11281621000 Stihl Cover Washer 43Mm / 1 3/4" |
| 11286642200 | 1 | nee | STIHL 11286642200 Stihl Cover |
| 30036559200 | 1 | nee | STIHL 30036559200 Stihl Spacer Washer |
| 41197924305 | 1 | nee | STIHL 41197924305 Stihl Clamping Wire |
| 41241223600 | 2 | nee | STIHL 41241223600 Stihl Sealing Ring |
| 41281824504 | 2 | nee | STIHL 41281824504 Stihl Torsion Spring |
| 41371958200 | 2 | nee | STIHL 41371958200 Stihl Starter Rope � 2.7x910 mm for MS180, MS181 Chainsaws - 4137 195 8200 |
| 41401223600 | 1 | nee | STIHL 41401223600 Stihl Sealing Ring |
| 41401226200 | 1 | nee | STIHL 41401226200 Stihl Idle Speed Screw |
| 41801223001 | 1 | nee | STIHL 41801223001 Stihl Spring |
| 41801223002 | 2 | nee | STIHL 41801223002 Stihl Spring |
| 90223461070 | 1 | nee | STIHL 90223461070 Stihl Spline Screw Is-M5X30X22 |
| 90754783012 | 1 | nee | STIHL 90754783012 Stihl Pan Head Self-Tapping Screw Is D4X12 |
| 90764782996 | 2 | nee | STIHL 90764782996 Stihl Pan Head Self-Tapping Screw P4X12 |
| 90990211760 | 2 | nee | STIHL 90990211760 Stihl Self-Tapping Screw Din7971-2.9X9.5 |
| 00001410601 | 7 | ja | STIHL 00001410601 Stihl Prefilter |
| 00001957001 | 3 | ja | STIHL 00001957001 Stihl Cap |
| 00006600850 | 6 | ja | STIHL 00006600850 Stihl 00006600850 Bumper Spike |
| 00006640700 | 3 | ja | STIHL 00006640700 Stihl 00006640700 Plain Bumper |
| 00007912009 | 2 | ja | STIHL 00007912009 Stihl Handle Hose 19Mm X 5M / 3/4X197" |
| 00009302251 | 3 | ja | STIHL 00009302251 Stihl Ignition Lead 10M |
| 00009302267 | 8 | ja | STIHL 00009302267 Stihl Elastostart Cord 3.5Mm X 28M |
| 00009580806 | 4 | ja | STIHL 00009580806 Stihl Washer |
| 00009630808 | 1 | ja | STIHL 00009630808 Stihl Bushing |
| 00009672035 | 7 | ja | STIHL 00009672035 Stihl Trade Mark |
| 00009677247 | 1 | ja | STIHL 00009677247 Stihl Warning Pictogram Ms |
| 00009885211 | 4 | ja | STIHL 00009885211 Stihl Connector |
| 00009888600 | 3 | ja | STIHL 00009888600 Stihl Crankcase 00009888600 Sleeve Disc Cutter Parts TS400 TS410 TS420 MS361 / MS361C Chainsaw Parts   |

## 6. Per nieuw actief onderdeel

Eerste bewezen aanbieding per onderdeel; de volledige lijst met alle
213 aanbiedingen staat in
`output/phase97/PHASE97_EBAY_ACTIVATION.json` onder `accepted_offers`.

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Verzendkosten | Aanbiedingen |
|---|---|---|---|---|---:|---:|
| 00007109000 | fs_111, fs_131, fs_240, fs_361 | v1|276426661513|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 3 |
| 00009375004 | 064, 066, 084, 088 | v1|236105930388|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 07819579000 | bg_86, fs_411_0, fs_90, ht_101 | v1|278066429499|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 11201223005 | 009, 010, 011, 012 | v1|126762764654|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 11231290901 | 019, 020, 021, 023 | v1|116382773410|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 3 |
| 11281226606 | 044, ms_440 | v1|157908646753|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 11281400600 | 044, ms_440 | v1|267693068423|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 11281413201 | 044, ms_440 | v1|383929281275|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 11286470605 | 044, ms_440 | v1|277774358347|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 2 |
| 11286477000 | 044, ms_440 | v1|386179133671|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41167172702 | fs_160, fs_180, fs_220, fs_260 | v1|178518306487|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 41167903901 | fr_106, fr_108, fr_130, fr_350 | v1|137667449988|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41177108200 | fr_106, fr_108, fs_100, fs_106 | v1|237184283526|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 2 |
| 41287900304 | fs_100, fs_120, fs_130, fs_200 | v1|136770644086|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 41287913100 | bt_120, bt_121, bt_130, fc_100 | v1|298420037973|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41287919800 | bga_300_0, bga_300_1, br_350, br_430 | v1|136203577839|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41287933000 | bt_120, bt_121, bt_130, fc_100 | v1|226012019165|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41341210801 | bt_120, bt_121, fr_350, fr_450 | v1|223996645669|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 2 |
| 41341225000 | bg_45, bg_55, bg_85, br_45 | v1|233590365809|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 41371401001 | fc_85, fh_75, fr_85, fs_75 | v1|206183280915|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 2 |
| 41374420400 | bt_120, bt_121, fc_85, fh_75 | v1|267768530883|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 2 |
| 41377910900 | fs_100, fs_120, fs_160, fs_180 | v1|406132412837|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 41401202200 | fc_55, fc_85, fh_75, fr_85 | v1|397962897923|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 41477109002 | fs_240, fs_260, fs_261, fs_300 | v1|306839106447|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 41477109014 | fs_240, fs_260, fs_261, fs_300 | v1|306839319897|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 42233539201 | bg_45, bg_55, bg_85, br_340 | v1|117493530682|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 8 |
| 42261202200 | fc_55, fc_85, fh_75, fr_85 | v1|168106738489|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 90223130930 | fr_145, fs_160, fs_180, fs_220 | v1|135348837355|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 90744772995 | br_800, fs_50, fs_56, fs_70 | v1|860045124529|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 90744774130 | al_301, fbd_km, fs_94, fsa_120_0 | v1|366775472687|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 3 |
| 90744784143 | bg_45, bg_55, bg_85, bga_300_0 | v1|186338271212|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 3 |
| 90744784425 | 024, 028, 038, be_55 | v1|407002143118|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 90754783018 | bg_56, bg_66, bg_86, br_200 | v1|236910370915|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 90754784175 | bt_120, bt_121, bt_131, fr_131 | v1|297806264402|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 91040030410 | bt_120, bt_121, fr_350, fr_410 | v1|198755798279|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 92112601150 | 015, 020, bg_45, bg_55 | v1|126788897687|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 92143200600 | fs_08, fs_150, fs_151, fs_202 | v1|187457348516|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 92143200900 | 042, 045, 048, 051 | v1|116382773436|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 92202600900 | 070, 08, 090, bt_360 | v1|317670012929|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 92220680900 | ahk_110, ec_70, fc_100, fc_110 | v1|366775476510|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 92910210140 | 031, 070, 075, 076 | v1|126762654983|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 92910210200 | az_4000, bt_308, bt_360, ec_70 | v1|236889115345|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 94090214420 | bg_60, bg_61, bga_160_0, bga_250 | v1|334020670595|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 94168686650 | bg_45, bg_55, bg_56, bg_66 | v1|198755798167|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 94438257130 | 023, 064, 08, 084 | v1|158133568675|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 94556210750 | bf, bf_km, bf_power_tool_attachments, ec_70 | v1|127281486728|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 94556210850 | 070, 090, bg_17, bg_km | v1|198755809053|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 94566212660 | e_20, e_220, ec_70, fc_100 | v1|117493541026|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 94566213100 | fh_0, fh_75, fh_km, fr_106 | v1|198755808990|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 94566213600 | bt_120, bt_121, bt_130, bt_131 | v1|198755809055|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 6 |
| 94636500805 | 019, bg_56, bg_66, bg_72 | v1|117493530742|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 5 |
| 95030039853 | ec_70, fc_100, fc_110, fc_44 | v1|198755892644|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 7 |
| 96409511972 | 044, ms_440 | v1|302413335984|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 96459457494 | bt_45, rb_220, re_101, re_102 | v1|318542560012|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 3 |
| 96459457506 | fw_20, gs_461, ts_350, ts_360 | v1|187678964753|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 4 |
| 96459457560 | bt_45, re_109, re_119, re_129 | v1|800866928921|0 | EBAY_NL | SHIPS_TO_NL_CONFIRMED | - | 1 |
| 96469510155 | 044, ms_440 | v1|187547401075|0 | EBAY_DE | SHIPS_TO_NL_CONFIRMED | - | 3 |

## 7. Resterende blokkades

NEEDS_EVIDENCE (206 kandidaten):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
| `LISTING_MPN` | 206 |

REJECTED (10 kandidaten):

| Reden | Kandidaten |
|---|---:|
| `CONFLICTING_MPN` | 10 |

## 8. Batchbereik en verificatie

- Batches: queue_10: 39 onderdelen; queue_11: 29 onderdelen; queue_12: 0 onderdelen.
- Queue: 0 complete batches; nog open: 3.
- `node scripts/check_affiliate_consistency.mjs`: schoon.
- Publieke keten (`AffiliateOfferResolver` → `EbayAffiliateProvider`): elk nieuw
  onderdeel resolveert als `DIRECT_EBAY_ITEM` (0 missers in de laatste run).
- Bestaande eBay-suites en de fase 96-suites zijn groen, plus de nieuwe
  fase 97-suite voor alternatieve zoektermen.
- De eBay-campagne en de marktplaats per aanbieding zijn niet aangepast.

## 9. Artefacten

| Bestand | Inhoud |
|---|---|
| `output/phase97/queue.json` | volgende 400 prioriteitsonderdelen |
| `output/phase97/batches/queue_XX.json` | batches van 40 onderdelen |
| `output/phase97/batches/queue_XX_progress.json` | hervatbare voortgang per onderdeel |
| `output/phase97/batches/queue_XX_result.json` | metrics en per onderdeel decision/reason_codes |
| `output/phase97/listing_mpn_groups.json` | de 846 LISTING_MPN-kandidaten per onderdeel |
| `output/phase97/PHASE97_BASELINE.json` | nulmeting en reconciliatie van fase 96 |
| `output/phase97/PHASE97_EBAY_ACTIVATION.json` | alle nieuwe aanbiedingen, blokkades en modeldekking |
