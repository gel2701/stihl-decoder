# Phase 77F — Affiliate recovery & activation

Datum: 2026-11-13T00:02:41.200Z
Modus: APPLY · nieuwe ACTIVE-offers: 2

## 1. Meetbare resultaten

| Metric | Waarde |
|---|---|
| Nieuwe ACTIVE-links | 2 |
| Nieuwe onderdelen met directe koopknop | 2 |
| Kandidaten met automatisch aangevuld bewijs | 2 |
| Kandidaten dat NEEDS_EVIDENCE blijft | 1 |
| Afgekeurd (tegenstrijdig product/GTIN) | 2 |
| Geen kandidaat (werkvoorraad) | 20 |
| Al ACTIVE | 1 |
| Nieuwe ACTIVE-total | 101 / 110 |

Geactiveerd:
- `42821410300` — amazon.nl — ASIN B079DM989K — tag srihldecoder2-21
- `11281903400` — amazon.nl — ASIN B079DNL88M — tag srihldecoder2-21

## 2. Dekking per GSC-prioriteitsmodel

| Model | Onderdelen | Direct vóór | Direct na | Winst | Dekking |
|---|---|---|---|---|---|
| MS 440 | 277 | 10 | 11 | +1 | 3.97% |
| MS 170 | 248 | 17 | 17 | +0 | 6.85% |
| BG 86 | 169 | 8 | 8 | +0 | 4.73% |
| MS 461 | 263 | 8 | 9 | +1 | 3.42% |
| BR 600 | 239 | 2 | 3 | +1 | 1.26% |
| MS 390 | 213 | 5 | 6 | +1 | 2.82% |
| MS 361 | 278 | 6 | 7 | +1 | 2.52% |
| HS 45 | 205 | 6 | 6 | +0 | 2.93% |
| MS 250 | 276 | 14 | 14 | +0 | 5.07% |

## 3. Bewijsaanvulling en bronzoektocht

- Bronnen die automatisch zijn doorzocht: registry (157 records), phase73/66/69-kandidaten, opgeslagen typed listing-bronnen, catalogus en fitments.
- Amazon.nl/.de rechtstreeks: **HTTP 503**; via reader-proxy: **HTTP 503**. Creators API: **niet geconfigureerd** (niet gesimuleerd).
- Daarom zijn **geen nieuwe ASINs** gevonden; de twee herstelde kandidaten gebruiken het al opgeslagen bewijs van het type `AMAZON_LISTING_COMPATIBLE` (typed listing-URL voor dezelfde ASIN + compatibiliteitsbewijs dat model en onderdeelnummer noemt).
- Resterende blokkade: voor 20 onderdelen bestaat geen aanduiding van een product, en zonder leesbare marketplace of API is een ASIN niet te onderbouwen.

## 4. Afgekeurde kandidaten

De twee eerdere matches met verdachte GTIN blijven afgekeurd; de bijbehorende STIHL-onderdelen (`11281201602`, `11280292301`) staan in de werkvoorraad voor nieuwe ASINs.

## 5. Zichtbaarheid van de nieuwe links

- `42821410300`: centrale zoeker gevonden met DIRECT_ASIN; resolver DIRECT_ASIN (amazon.nl, tag undefined); onderdeelpagina directe knop=true, directe link=true; modelpagina's: br_600 ✓.
- `11281903400`: centrale zoeker gevonden met DIRECT_ASIN; resolver DIRECT_ASIN (amazon.nl, tag undefined); onderdeelpagina directe knop=true, directe link=true; modelpagina's: ms_440 ✓, ms_461 ✓, ms_390 ✓, ms_361 ✓.

## 6. Capaciteit

- Totaal/NL: 100 → **110**; DE blijft **50**. De DE-limiet is expliciet vastgelegd in `MAX_ACTIVE_OFFERS_PER_MARKETPLACE` zodat de globale verhoging DE niet verruimt.
- Veiligheidsvoorwaarden ongewijzigd: Two-Gate, NL-shipping voor DE, kill-switches, per-marketplace caps en affiliate-disclosures.
- De oude limiettests zijn bijgewerkt naar de constante; de guard-logica en alle overige asserties zijn niet verzwakt.
