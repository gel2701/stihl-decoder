# Phase 81 — GSC-first affiliate scaling

Datum: 2026-11-13T06:55:27.551Z
Modus: **ANALYSIS**

## Uitgangspunten

- GSC-bron: `output/phase77d/PHASE77D_LIVE_GSC_ADDENDUM.md` (11 gemeten modelpagina's, definitieve data 13 okt–9 nov 2026).
- Commerciële catalogus: `PHASE60_COMMERCIAL_OPPORTUNITIES.json` (20 modellen).
- Hergebruik: 99 ACTIVE Amazon-aanbiedingen op 86 onderdelen, 769 ACTIVE eBay-records in de store, 10 publiek bevestigde eBay-onderdelen; geen enkel bestaand bewijs is opnieuw bevraagd.

## Prioriteitsmodellen (25)

| # | Model | Bewijsniveau | GSC-vertoningen | Catalogusonderdelen | Directe link | Dekking | Score |
|---|---|---|---:|---:|---:|---:|---:|
| 1 | MS 440 | GSC_MEASURED | 446 | 277 | 16 | 5.78% | 93.4 |
| 2 | MS 170 | GSC_MEASURED | 201 | 248 | 22 | 8.87% | 67 |
| 3 | MS 361 | GSC_MEASURED | 101 | 278 | 13 | 4.68% | 52.7 |
| 4 | BR 600 | GSC_MEASURED | 113 | 239 | 8 | 3.35% | 52.6 |
| 5 | MS 250 | GSC_MEASURED | 39 | 276 | 26 | 9.42% | 47.4 |
| 6 | BG 86 | GSC_MEASURED | 177 | 169 | 19 | 11.24% | 39.6 |
| 7 | MS 461 | GSC_MEASURED | 166 | 263 | 20 | 7.6% | 38.9 |
| 8 | MS 390 | GSC_MEASURED | 125 | 213 | 16 | 7.51% | 33.9 |
| 9 | HS 45 | GSC_MEASURED | 52 | 205 | 16 | 7.8% | 24.9 |
| 10 | MS 260 | COMMERCIAL_RANKED | — | 279 | 22 | 7.89% | 43.4 |
| 11 | FS 55 | COMMERCIAL_RANKED | — | 354 | 17 | 4.8% | 41.7 |
| 12 | TS 420 | COMMERCIAL_RANKED | — | 257 | 8 | 3.11% | 39 |
| 13 | FS 350 | COMMERCIAL_RANKED | — | 262 | 12 | 4.58% | 38.7 |
| 14 | FS 85 | COMMERCIAL_RANKED | — | 389 | 18 | 4.63% | 38.4 |
| 15 | MS 180 | COMMERCIAL_RANKED | — | 263 | 27 | 10.27% | 38.3 |
| 16 | 044 | COMMERCIAL_RANKED | — | 343 | 24 | 7% | 37.9 |
| 17 | MS 441 | COMMERCIAL_RANKED | — | 310 | 13 | 4.19% | 37.7 |
| 18 | MS 310 | COMMERCIAL_RANKED | — | 228 | 16 | 7.02% | 37.7 |
| 19 | 046 | COMMERCIAL_RANKED | — | 308 | 23 | 7.47% | 37.3 |
| 20 | FS 100 | COMMERCIAL_RANKED | — | 252 | 13 | 5.16% | 37.3 |
| 21 | MS 460 / 046 Magnum | COMMERCIAL_RANKED | — | 270 | 22 | 8.15% | 36.7 |
| 22 | MS 230 | COMMERCIAL_RANKED | — | 280 | 30 | 10.71% | 36.2 |
| 23 | FS 80 | CATALOG_ONLY | — | 424 | 19 | 4.48% | 19.1 |
| 24 | MS 362 | CATALOG_ONLY | — | 389 | 12 | 3.08% | 19.4 |
| 25 | MS 661 | CATALOG_ONLY | — | 271 | 8 | 2.95% | 19.4 |

Bewijsniveau: GSC_MEASURED 9, COMMERCIAL_RANKED 13, CATALOG_ONLY 3. Alleen `GSC_MEASURED` modellen hebben gemeten Search Console-vertoningen; `COMMERCIAL_RANKED` komt uit de Phase 60-commerciële rangorde en `CATALOG_ONLY` is een catalogusaanvulling zonder vraagbewijs.

## Queue

- 120 ontbrekende serviceonderdelen (61 indexeerbaar), klaar voor de Phase 80.1/80.3-batch.
- Verdeling naar commerciële tier: COMMERCIAL_HIGH 100, COMMERCIAL_UNKNOWN 20.
- Bevestigingsmateriaal (bouten, moeren, ringen) is niet in de queue opgenomen.

## Live-activering

Credentials aanwezig; live batches zijn uitgevoerd via `scripts/phase80_evidence_batch.mjs` (resultaten: `PHASE81_LIVE_RESULTS.json` en het Phase 81-rapport in de repositoryroot).

Uitvoeren op Render (aanbevolen, gebruikt de bewezen Phase 80.1/80.3-keten):

```bash
cd /opt/render/project/src
node scripts/phase81_gsc_first_scaling.mjs --live --queue-size 120
```

Het script zoekt uitsluitend de onderdelen uit de queue (Browse met `deliveryCountry:NL`), verrijkt ontbrekend bewijs via `getItem`, adjudiceert met de bestaande matcher, schrijft alleen `ACCEPT` naar `/var/data/affiliate/ebay_offers.json` en laat NEEDS_EVIDENCE staan.
