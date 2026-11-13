# Phase 81 — GSC-first affiliate scaling (live uitgevoerd)

Repository: `gel2701/stihl-decoder` · Datum: 2026-11-13 · Branch: `freebuff/270a802ba68d0ac21adbb1ad`

---

## 0. Resultaat

De eBay Browse API was in deze run beschikbaar. Daarmee is de volledige keten **live** uitgevoerd:
selectie → inventaris → queue → eBay-zoekopdracht met `deliveryCountry:NL` → productidentiteit
(`OfferEvidenceMatcher`) → verzendbewijs → activering in de canonieke store.

| Meting | Waarde |
|---|---:|
| Live batch-runs | 8 |
| Onderzochte onderdelen | 108 |
| **Nieuwe ACTIVE eBay-aanbiedingen** | **769** |
| **Nieuwe unieke onderdelen met directe eBay-kooplink** | **92** |
| Nieuwe ACTIVE Amazon-aanbiedingen | 0 |
| Automatisch aangevuld bewijs (product + NL-verzending) | 769 aanbiedingen |
| Overgebleven NEEDS_EVIDENCE (deze batch) | 584 |
| Aantoonbaar afgewezen matches | 86 |
| Zoektijd | 27,7 min |
| Bestaande ACTIVE eBay-aanbiedingen bewaard | 97 (store-merge verwijdert niets) |

Alle 769 nieuwe records: `decision=ACCEPT`, `status=ACTIVE`, `shipping_status=SHIPS_TO_NL_CONFIRMED`,
matchtype `EXACT_MPN` / `EXACT_PART_NUMBER_WITH_CORROBORATION` / `VERIFIED_REPLACEMENT`, en
`campid=5339245312` in de affiliate-URL. Steekproef (3 records)handmatig gecontroleerd op MPN,
titel, marketplace en campagne-id.

**Primaire succesmaatstaf:** de store groeit van 97 naar **866 ACTIVE eBay-aanbiedingen** en van
10 naar **102 unieke onderdelen** zodra deze resultaten in productie zijn samengevoegd (§6).

## 1. GSC-prioriteiten (25 modellen)

Bron: Google Search Console (property `sc-domain:stihldecoder.nl`, definitieve data 13 okt–9 nov
2026) via `output/phase77d/PHASE77D_LIVE_GSC_ADDENDUM.md`, aangevuld met de Phase 60-commerciële
rangorde. Formule: `55 × GSC-vertoningen + 25 × Phase 60-score + 20 × koopgat` (alles genormaliseerd).

| # | Model | Bewijsniveau | Catalogus | Direct vóór | Direct ná | Δ | Dekking ná |
|---|---|---|---:|---:|---:|---:|---:|
| 1 | MS 440 | GSC_MEASURED | 277 | 10 | 16 | +6 | 5,78% |
| 2 | MS 170 | GSC_MEASURED | 248 | 20 | 22 | +2 | 8,87% |
| 3 | MS 361 | GSC_MEASURED | 278 | 6 | 13 | +7 | 4,68% |
| 4 | BR 600 | GSC_MEASURED | 239 | 2 | 8 | +6 | 3,35% |
| 5 | MS 250 | GSC_MEASURED | 276 | 18 | 26 | +8 | 9,42% |
| 6 | BG 86 | GSC_MEASURED | 169 | 8 | 19 | +11 | 11,24% |
| 7 | MS 461 | GSC_MEASURED | 263 | 9 | 20 | +11 | 7,60% |
| 8 | MS 390 | GSC_MEASURED | 213 | 5 | 16 | +11 | 7,51% |
| 9 | HS 45 | GSC_MEASURED | 205 | 7 | 16 | +9 | 7,80% |
| 10 | MS 260 | COMMERCIAL_RANKED | 279 | 8 | 22 | +14 | 7,89% |
| 11 | FS 55 | COMMERCIAL_RANKED | 354 | 8 | 17 | +9 | 4,80% |
| 12 | TS 420 | COMMERCIAL_RANKED | 257 | 2 | 8 | +6 | 3,11% |
| 13 | FS 350 | COMMERCIAL_RANKED | 262 | 4 | 12 | +8 | 4,58% |
| 14 | FS 85 | COMMERCIAL_RANKED | 389 | 6 | 18 | +12 | 4,63% |
| 15 | MS 180 | COMMERCIAL_RANKED | 263 | 23 | 27 | +4 | 10,27% |
| 16 | 044 | COMMERCIAL_RANKED | 343 | 12 | 24 | +12 | 7,00% |
| 17 | MS 441 | COMMERCIAL_RANKED | 310 | 7 | 13 | +6 | 4,19% |
| 18 | MS 310 | COMMERCIAL_RANKED | 228 | 8 | 16 | +8 | 7,02% |
| 19 | 046 | COMMERCIAL_RANKED | 308 | 10 | 23 | +13 | 7,47% |
| 20 | FS 100 | COMMERCIAL_RANKED | 252 | 2 | 13 | +11 | 5,16% |
| 21 | MS 460 / 046 Magnum | COMMERCIAL_RANKED | 270 | 9 | 22 | +13 | 8,15% |
| 22 | MS 230 | COMMERCIAL_RANKED | 280 | 19 | 30 | +11 | 10,71% |
| 23 | FS 80 | CATALOG_ONLY | 424 | 6 | 19 | +13 | 4,48% |
| 24 | MS 362 | CATALOG_ONLY | 389 | 7 | 12 | +5 | 3,08% |
| 25 | MS 661 | CATALOG_ONLY | 271 | 6 | 8 | +2 | 2,95% |

Alle 25 modellen kregen er directe kooplinks bij. Unie over deze modellen: **3.109 onderdelen**,
directe dekking **62 → 148** (1,99% → 4,76%). Negen modellen hebben gemeten GSC-vertoningen, dertien
komen uit de Phase 60-rangorde, drie zijn expliciet als catalogusaanvulling gelabeld.

## 2. Onderdeleninventaris en hergebruik

- Inventaris uit `model_part_fitments` (181.394 fitment-relaties, 110 modellen).
- Hergebruikt zonder nieuwe API-aanroep: **99 ACTIVE Amazon-aanbiedingen op 86 onderdelen**,
  3 VERIFIED (staging) en 55 RESEARCH_REQUIRED — alle drie ongewijzigd.
- De 10 bestaande publieke eBay-onderdelen (97 aanbiedingen) zijn als dekking meegeteld en niet
  opnieuw gezocht.
- Queue: 120 ontbrekende serviceonderdelen, round-robin over de 25 modellen, bevestigingsmateriaal
  uitgesloten via de bestaande `GENERIC_HARDWARE_REGEX`.

## 3. Uitgevoerde live batches

Per chunk van 12–15 onderdelen (de cloud-runner limiete op 5 minuten per commando), steeds met
dezelfde bevroren queue:

```
phase81 selectie → scripts/phase80_evidence_batch.mjs --live --input <queue-slice>
  → Browse search per onderdeel op EBAY_NL + EBAY_DE met filter deliveryCountry:NL
  → getItem-verrijking alleen waar bewijs ontbrak (1× per listing, gecachet)
  → OfferEvidenceMatcher + EbayShippingEvidence
  → ACCEPT → store (merge, bestaande ACTIVE blijft behouden)
```

- 108 onderdelen onderzocht; 92 daarvan leverden minimaal één bewezen aanbieding op.
- 16 onderdelen leverden geen ACCEPT op (geen aanbod of uitsluitend bewijs-loze listings); die
  staan als NEEDS_EVIDENCE in het batchrapport en zijn **niet** geactiveerd.
- 86 listings zijn afgewezen op productidentiteit (verkeerd onderdeelnummer, bundel, conflict).
- Na 108 onderdelen gaf eBay **HTTP 429** (rate limit); de resterende 28 queue-onderdelen zijn
  daarom niet gezocht. Die zijn geen afwijzing: ze staan klaar voor een volgende run.

## 4. Verplichte resultaten

| Gevraagd | Resultaat |
|---|---|
| Nieuwe ACTIVE eBay-links | **769** (92 onderdelen, beide marktplaatsen) |
| Nieuwe ACTIVE Amazon-links | **0** — geen nieuwe ASIN-identiteit onderzocht; 99 bestaande ACTIVE hergebruikt |
| Nieuwe unieke onderdelen met koopmogelijkheden | **92** |
| Extra GSC-modellen met directe koopdekking | **9 van 9 gemeten GSC-modellen** (en 13 commerciële modellen) kregen extra directe links; 25/25 modellen groeiden |
| Automatisch aangevuld bewijs | **769** aanbiedingen met productidentiteit + bevestigde NL-levering |
| Overgebleven NEEDS_EVIDENCE | **584** listings uit deze batch (bewaard, niet geactiveerd) + 68 bestaande eBay- en 55 Amazon-kandidaten ongewijzigd |
| Werkelijke publieke kooplinks | **97 eBay + 2 Amazon per productpagina** — productie is nog niet bijgewerkt (zie §6) |

## 5. Kwaliteitscontrole van de nieuwe records

| Controle | Uitkomst |
|---|---|
| `campid=5339245312` in affiliate-URL | 769/769 |
| `shipping_status = SHIPS_TO_NL_CONFIRMED` | 769/769 |
| Marketplace uitsluitend EBAY_NL/EBAY_DE | 769/769 |
| Matchtype in de publishbare set | 769/769 |
| Resolver leest de store en levert de offers | 769/769 (per chunk `resolver_status: VERIFIED`) |

Verdeling per onderdeel: 4 onderdelen met 20+ aanbiedingen, 28 met 10–19, 32 met 5–9, 28 met 1–4.

## 6. Publiceren naar productie (één stap, bestaande code)

De store op Render staat op `/var/data/affiliate/ebay_offers.json`. De geoogste, gevalideerde set
staat in `output/phase81/ebay_offers_phase81.json` (2,5 MB). Samenvoegen met de bestaande 97
aanbiedingen gebeurt met de bestaande, falende-open store-API (die elke record opnieuw valideert en
niets verwijdert):

```bash
# Render → service stihl-decoder → Shell
cd /opt/render/project/src

node --input-type=module -e "
import fs from 'fs';
import { saveEbayOfferStore } from './src/affiliate/EbayOfferStore.js';
const incoming = JSON.parse(fs.readFileSync('output/phase81/ebay_offers_phase81.json','utf8')).offers;
const r = saveEbayOfferStore(undefined, incoming, { campaignId: process.env.EBAY_EPN_CAMPAIGN_ID });
console.log({ written: r.written, preserved: r.preserved, rejected: r.rejected, total: r.doc.offers.length });
"

# daarna: service herstarten (env-toggle of handmatige restart)
# AffiliateOfferResolver leest de store bij boot; zonder herstart blijven de nieuwe links onzichtbaar.
```

Verwacht: `written: 769`, `preserved: 97`, `rejected: 0`, `total: 866`. Daarna zijn 102 unieke
onderdelen publiek gedekt. `EBAY_ENABLED=false` blijft de kill-switch.

## 7. Checks

- Stage A `node scripts/check_affiliate_consistency.mjs` → exit 0.
- Stage B `node tests/affiliate_quality_gate.test.js` → 7/7.
- `node tests/phase81_gsc_first_scaling.test.js` → 5/5.
- Volledige suite: zie CI (`node-contract-tests`), 124 suites.
- Geen bewijsstatus, geen bestaande ACTIVE-aanbieding, geen kill-switch en geen veiligheidscontrole
  gewijzigd of verwijderd.

## 8. Artefacten

| Bestand | Inhoud |
|---|---|
| `scripts/phase81_gsc_first_scaling.mjs` | selectie, inventaris, queue, live-delegatie met `--queue-start/--queue-file` |
| `output/phase81/PHASE81_PRIORITY_MODELS.json` | 25 modellen + formule |
| `output/phase81/PHASE81_MODEL_COVERAGE.json` | dekking per model na de run |
| `output/phase81/PHASE81_MISSING_QUEUE.json` | 120 onderdelen (queue) |
| `output/phase81/PHASE81_LIVE_RESULTS.json` | voor/na per model, 92 gewonnen onderdelen, batchtotalen |
| `output/phase81/ebay_offers_phase81.json` | 769 gevalideerde ACTIVE-records (publicatiepayload) |
| `output/phase81/PHASE81_SUMMARY.json` | hergebruik, queue, blockerstatus |
