# Phase 83 — Catalog Expansion, Supersession Migration & Affiliate Recovery

Datum: 2026-11-14 · Repository: `gel2701/stihl-decoder` · Start: `main` na Phase 82 (`bbd4fcd`)

## 0. Productiebaseline gecontroleerd

- `/api/version` → `commit bbd4fcd`, `deployed_at 2026-11-14T22:26:37Z`, persistente database.
- De Phase 82-store-merge is uitgevoerd: `/onderdeelnummer/11280292301/` toont 144 eBay-kooplinks, `/onderdeelnummer/11301214702/` toont er 0 (daar is niets geaccepteerd). Baseline 1.646 ACTIVE / 200 onderdelen is daarmee plausibel en ongewijzigd.
- Amazon-registry: 99 ACTIVE op 86 onderdelen. eBay-kandidaten: 1.196. Supersession-doelen buiten de catalogus: 8. Catalogus: 18.377.

## 1. Catalogustelling verklaard (18.373 → 18.377)

| Commit | Fase | Records |
|---|---|---|
| 6023dc3 | 58a GHS-import | 17.837 |
| 4d72110 | 58a1 GHS-recovery | **18.373** |
| d34b786 | 60.1 | 18.373 |
| 521fac9 | 75b | 18.374 |
| 5ffef05 | 75e | 18.376 |
| 0a7e0cb | 75f | **18.377** |

De vier extra records zijn gedocumenteerde zaagketting-SKU's: `36100000050`, `36360000055`, `36100000055`, `36360000044`. Er zijn **geen duplicaten** (18.377 unieke nummers), **geen niet-11-cijferige records** en **nooit records verwijderd**. De testasserties stonden al op 18.377; alleen comments, `AGENTS.md` en de skill noemden nog 18.373. Die zijn gecorrigeerd naar de nieuwe baseline **18.397**.

Regressiebescherming: `data/parts_catalog_baseline_phase83.json` (elk canoniek nummer) + `tests/phase83_catalog_supersession_integrity.test.js` (83.1–83.5). De test faalt zodra een bestaand nummer verdwijnt, een duplicaat ontstaat, een nummer niet 11-cijferig is, of de supersession-graaf een self-loop/cyclus/dubbel paar krijgt.

## 2. Supersession-migratie (8 ontbrekende doelen)

Bron: `data/parts_supersessions.json`, 22 relaties met `evidence_status: EXPLICIT_SOURCE_TEXT` uit officiële STIHL technical information-documenten. Script: `scripts/apply_phase83_supersession_catalog.mjs` (idempotent, verwijdert nooit, schrijft audit).

| Nummer | Component | Van | TI-document | Resultaat |
|---|---|---|---|---|
| 42037006310 | Standard nozzle | 4203 700 6306 | TI_13_1999_30 | toegevoegd |
| 42031402803 | Filter housing | 4203 140 2800 | TI_23_1999_30 | toegevoegd |
| 41166400106 | Gearhead | 4116 640 0104 | TI_02_2001_02_01_01 | toegevoegd |
| 11283531600 | Housing | 1128 350 0806 | TI_25_1996_30 | toegevoegd |
| 11230300409 | Crankshaft | 1123 031 0500 | TI_13_1997_30 | toegevoegd |
| 42277006900 | Elbow | 4227 708 6900 | TI_10_1998_30 | toegevoegd |
| 48040071002 | — | 4804 007 1000 | TI_09_1998_30 | NEEDS_EVIDENCE |
| 42033500502 | — | 4203 350 0501 | TI_40_1998_30 | NEEDS_EVIDENCE |

De laatste twee blijven `NEEDS_EVIDENCE`: het officiële document noemt alleen "the version" zonder componentnaam, dus er is geen verdedigbare onderdeelnaam en geen lokale bron die die levert.

Omdat een relatie alleen iets zegt over vervanging en niet over toepasbaarheid, is de **relatie doorzoekbaar vanaf beide nummers**: naast de 6 doelen zijn ook de 14 ontbrekende bronnummers toegevoegd (`11231602001 clutch`, `42267922700 cover`, `11280300404 crankshaft`, `11291201606 air filter`, `11220211101 cover`, `11146567705 chain catcher`, `11231903400 elastostart grip`, `42037006306`, `42031402800`, `41166400104`, `11283500806`, `11230310500`, `42277086900`, `11231215640 fixed jet`). Daarmee is het aantal relaties dat in beide richtingen in de catalogus actief is gegaan van **4 naar 11**.

**Totaal toegevoegd: 20 records → 18.397.** Geen fitment-relaties geschreven: de fitment-shards en de 181.394-telling zijn onaangeroerd, en er is geen compatibiliteit geclaimd die niet zelfstandig is onderbouwd.

## 3. eBay

De nieuwe catalogusonderdelen zijn direct gezocht met de bestaande batch (`deliveryCountry:NL`, EBAY_NL/EBAY_DE):

| Onderdeel | Nieuwe ACTIVE | Marketplace | Campagne | Verzending | Match |
|---|---|---|---|---|---|
| 42031402803 (filter housing) | **2** | EBAY_NL | 5339245312 | SHIPS_TO_NL_CONFIRMED | EXACT_MPN |

De overige vijf nieuwe nummers leverden geen aanbieding met volledig bewijs op (0 actief, geen afwijzingen).

De 1.196 bestaande kandidaten zijn geanalyseerd op ontbrekend bewijs: **alle** hebben dezelfde twee gaten — `LISTING_MPN` en `MODEL_COMPATIBILITY_CORROBORATION`. De titel bevat steeds het juiste STIHL-nummer, maar de listing-MPN is van een aftermarket-maker (bijv. Stens `623-370`) en er is geen lokale of openbare bron die die MPN aantoonbaar aan het STIHL-nummer koppelt. Er is daarom **niets** geactiveerd en niets afgewezen; de engine blijft fail-closed.

## 4. Amazon

Niets geactiveerd, en dat is aantoonbaar en niet uit gemak:

- De 3 VERIFIED-kandidaten (B00LAHKSDQ, B00SVDWDRG, B013KONKZY) hebben geen actieve buybox en geen bevestigde NL-levering; B00SVDWDRG is bovendien een combinatieset, geen 1:1 vervanger.
- De 55 RESEARCH_REQUIRED missen onafhankelijk ASIN-identiteitsbewijs.
- Amazon PA-API is hier niet beschikbaar en een publieke fetch van `amazon.de/dp/B013KONKZY` levert 3.817 bytes zonder buybox- of verzendinformatie (bot-blokkade). Zonder die controle is activeren niet toegestaan.

Registry ongewijzigd: **99 ACTIVE op 86 onderdelen**.

## 5. GSC-prioriteiten

`output/phase83/PHASE83_GSC_MODEL_COVERAGE.json`: 17 prioriteitsmodellen, 4.601 catalogusonderdelen, 252 onderdelen met een bewezen directe eBay-link vóór en na deze fase. Het nieuwe onderdeel hoort bij BR 320/400 en SR 320/400, die niet in de GSC-prioriteitenlijst staan, dus de dekking in de 17 gemeten modellen is gelijk gebleven.

## 6. Publicatie

- **Catalogus**: `data/parts_catalog.json` gaat mee in de deploy; nieuwe onderdeelpagina's en de supersession-verwijzingen komen daarmee live (geen store-merge nodig).
- **eBay**: de 2 nieuwe aanbiedingen staan in `output/phase83/ebay_offers_phase83.json` en moeten in de persistente store op Render worden gemerged:

```bash
cd /opt/render/project/src && node --input-type=module -e "import fs from 'node:fs'; const { saveEbayOfferStore } = await import('file://' + process.cwd() + '/src/affiliate/EbayOfferStore.js'); const incoming = JSON.parse(fs.readFileSync('output/phase83/ebay_offers_phase83.json','utf8')).offers; const r = saveEbayOfferStore(undefined, incoming, { campaignId: process.env.EBAY_EPN_CAMPAIGN_ID }); console.log({ written: r.written, preserved: r.preserved, rejected: r.rejected, total: r.doc.offers.length });"
```

Verwacht: `written: 2, preserved: 1646, total: 1648`. Daarna de service herstarten.

## 7. Kwaliteitscontroles

- Stage A `check_affiliate_consistency.mjs`: exit 0
- Stage B `affiliate_quality_gate.test.js`: 7/7
- Nieuw: `tests/phase83_catalog_supersession_integrity.test.js`: 5/5
- Geraakte suites: `phase52b_full_parts_catalog`, `phase54c_parts_seo`, `phase54e_parts_technical_enrichment`, `phase58a_ghs_catalog_harvest`, `phase5_intelligent_parts_search`, `phase59d1_production_readiness_consistency`, `phase61_verified_affiliate_activation`, `phase6_catalog_coverage_quality` — alle groen
- Lokale SQLite is opnieuw geseed (`node data/seed.cjs`) zodat de JSON↔SQLite-pariteit klopt; de DB is gegenereerd en niet in git.
- Volledige suite + 4 CI-checks: zie PR

## 8. Eindcijfers

| Onderdeel | Resultaat |
|---|---|
| Catalogustelling | Verklaard: 18.373 + 4 (Phase 75b/e/f) + 20 (Phase 83) = **18.397** |
| Nieuwe catalogusonderdelen | **20** (6 supersession-doelen + 14 bronnummers), officiële TI-bron per record |
| Nieuwe supersession-records | 20 nummers, 11 relaties nu in beide richtingen actief (was 4); 4 nummers NEEDS_EVIDENCE |
| Nieuwe modelcompatibiliteitsrelaties | 0 (geen fitment zonder zelfstandig bewijs) |
| Nieuwe ACTIVE eBay-aanbiedingen | **2** op 1 nieuw onderdeel |
| Nieuwe ACTIVE Amazon-aanbiedingen | 0 (API noch publieke verificatie beschikbaar) |
| Nieuwe onderdelen met directe koopmogelijkheid | **1** (42031402803) |
| Automatisch aangevuld bewijs | 0 van 1.196 kandidaten (uniform: listing-MPN + model-corroboratie ontbreken) |
| Resterende NEEDS_EVIDENCE | 1.196 eBay-kandidaten + 4 supersession-nummers |
| Productiepublicatie | catalogus via deploy; 2 eBay-aanbiedingen wachten op de store-merge hierboven |

Groei t.o.v. Phase 82: catalogus **+20 onderdelen**, supersession-relaties actief **4 → 11**, eBay **+2 ACTIVE aanbiedingen** (1.646 → 1.648 na merge), onderdelen met directe kooplink **200 → 201**.
