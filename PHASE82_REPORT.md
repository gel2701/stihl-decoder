# Phase 82 — STIHL Catalog Expansion & Affiliate Activation

Datum: 2026-11-14 · Repository: `gel2701/stihl-decoder` · Start: schone `main` (`be8b70d`)

## Samenvatting

Phase 82 heeft de openstaande eBay-werkvoorraad uit Phase 81 volledig afgewerkt. Van de 120 onderdelen in de frozen queue waren er 11 al gezocht; de overige **109 zijn in 7 live chunks gezocht** en leverden **780 nieuwe ACTIVE eBay-aanbiedingen op 98 unieke onderdelen**, alle met bevestigde levering naar Nederland en campagne `5339245312`. Geen enkel onderdeel overlapt met de 92 onderdelen uit Phase 81.

Catalogusuitbreiding en Amazon-uitbreiding zijn onderzocht en **niet** uitgevoerd, omdat de bewijsbasis ontbreekt. Dat is hieronder per punt onderbouwd; er zijn geen onbewezen records of links toegevoegd.

| | Voor | Na publicatie store-merge |
|---|---|---|
| ACTIVE eBay-aanbiedingen | 866 | **1.646** |
| Onderdelen met directe eBay-kooplink | 102 | **200** |
| ACTIVE Amazon-aanbiedingen | 99 (86 onderdelen) | 99 (86 onderdelen) |
| Catalogusonderdelen | 18.377 | 18.377 |
| NEEDS_EVIDENCE eBay-kandidaten | 584 | 1.196 (612 nieuw, titel-only) |

## 1. Baseline gecontroleerd

- Phase 81-payload bleek daadwerkelijk gepubliceerd: `/onderdeelnummer/00001201653/`, `/11131958200/` en `/11236403200/` tonen live eBay-koopknoppen met correcte affiliate-URL's, dus de store-merge op Render is uitgevoerd.
- `/api/version`: `commit be8b70d…`, `deployed_at 2026-11-13T07:13:26Z`, database persistent.
- Amazon-registry: 99 ACTIVE / 86 onderdelen, 3 VERIFIED (geblokkeerd), 55 RESEARCH_REQUIRED.
- Queue-audit: de 8 Phase 81-batchrapporten dekten 106 unieke onderdelen van de 120-item queue; **109 queue-items waren nooit gezocht** (de eerdere runs gebruikten andere queueslices). Die 109 zijn de werkvoorraad van deze fase — niet 28.

## 2. Uitgevoerde live batches (sectie 3 van de opdracht)

`scripts/phase81_gsc_first_scaling.mjs --live --queue-file output/phase82/PHASE82_REMAINING_QUEUE.json`

| Chunk | Queue-start | Onderdelen | Nieuwe ACTIVE | Nieuwe onderdelen | Needs evidence | Afgewezen |
|---|---|---|---|---|---|---|
| 1 | 0 | 15 | 127 | 15 | 88 | 24 |
| 2 | 15 | 15 | 104 | 13 | 109 | 8 |
| 3 | 30 | 15 | 96 | 12 | 72 | 22 |
| 4 | 45 | 15 | 116 | 14 | 116 | 16 |
| 5 | 60 | 15 | 147 | 13 | 68 | 16 |
| 6 | 75 | 15 | 62 | 13 | 58 | 12 |
| 7 | 90 | 19 | 128 | 18 | 101 | 18 |
| **Totaal** | | **109** | **780** | **98** | **612** | **116** |

Kwaliteitscontrole op de 780 records (machinecontrole, `output/phase82/ebay_offers_phase82.json`):

- campagne `5339245312`: 780/780
- `shipping_status = SHIPS_TO_NL_CONFIRMED`: 780/780
- `status = ACTIVE`, `decision = ACCEPT`: 780/780
- affiliate-URL met `campid=5339245312`: 780/780
- resolver per chunk: `VERIFIED`; `store_rejected_by_guard`: 0
- verdeling: EBAY_NL 512 · EBAY_DE 268; per onderdeel 3× 20+, 31× 10-19, 28× 5-9, 36× 1-4
- geen HTTP 429 in deze fase (checkpoint per chunk, steeds ruim onder de limiet gebleven)

## 3. Catalogus (sectie 2) — geen onbewezen groei

Gemeten met `output/phase82/PHASE82_CATALOG_AUDIT.json`:

- `data/parts_catalog.json`: 18.377 records (canonieke invariant 18.373).
- Alle **1.420** onderdeelnummers uit geaccepteerde officiële harvest-observaties (`data/harvest/phase54f/accepted_evidence.jsonl`) staan al in de catalogus — 0 ontbrekend.
- Supersessions (`data/parts_supersessions.json`): 22 relaties, waarvan **8 doel-onderdelen** niet in de catalogus staan. Dat zijn de enige gedocumenteerde, ontbrekende nummers. Toevoegen verandert de canonieke telling (18.373 → 18.381) en daarmee ~15 suites die die invariant bewaken; dat hoort in een aparte catalogusmigratie met eigen bewijsregistratie, niet in een affiliate-batch.
- Er zijn in deze omgeving geen nieuwe officiële IPL-documenten of onderdelenlijsten beschikbaar; de harvester (`scripts/harvest_stihl_parts.mjs`) zou live scraping vereisen die niet is uitgevoerd.
- Daarom: **0 nieuwe catalogusrecords**, en geen onbewezen compatibiliteitsclaims.

Wat wél is gegroeid: 98 bestaande catalogusonderdelen zijn nu daadwerkelijk koopbaar. Hun bestaande (gedocumenteerde) fitments raken **290 modellen**, waaronder alle 17 gevraagde prioriteitsmodellen (sectie 6).

## 4. Amazon (sectie 5) — niets ongeverifieerd geactiveerd

`output/phase82/PHASE82_AMAZON_AUDIT.json`:

- 99 ACTIVE aanbiedingen op 86 onderdelen blijven ongewijzigd.

## 5. Kandidaten met ontbrekend bewijs (sectie 4)

`output/phase82/PHASE82_NEEDS_EVIDENCE_GROUPS.json`: 612 nieuwe kandidaten, 90 onderdelen, **alle** in één groep: `MATCH_TITLE_ONLY_NEEDS_EVIDENCE` — titel matcht, maar de listing bevat geen onderdeelnummer/MPN of EAN, dus geen identiteitsbewijs. Deze zijn niet afgewezen maar blijven NEEDS_EVIDENCE. 116 listings zijn wél afgewezen op tegenstrijdige identiteit (verkeerd onderdeelnummer in titel/MPN).

## 6. Publicatie (sectie 6)

Catalogus en code zijn via deploy gepubliceerd (geen cataloguswijzigingen in deze fase). De 780 eBay-aanbiedingen staan in `output/phase82/ebay_offers_phase82.json` en moeten in de persistente store op Render worden gemerged, anders telt de groei niet als gepubliceerd:

```bash
cd /opt/render/project/src && node --input-type=module -e "import fs from 'node:fs'; const { saveEbayOfferStore } = await import('file://' + process.cwd() + '/src/affiliate/EbayOfferStore.js'); const incoming = JSON.parse(fs.readFileSync('output/phase82/ebay_offers_phase82.json','utf8')).offers; const r = saveEbayOfferStore(undefined, incoming, { campaignId: process.env.EBAY_EPN_CAMPAIGN_ID }); console.log({ written: r.written, preserved: r.preserved, rejected: r.rejected, total: r.doc.offers.length });"
```

Verwacht: `written: 780, preserved: 866, total: 1646`. Daarna de service herstarten; de resolver leest de store bij boot.

## 7. Checks

- Stage A: `node scripts/check_affiliate_consistency.mjs` → exit 0
- Stage B: `node tests/affiliate_quality_gate.test.js` → 7/7
- Volledige suite en CI: zie PR

## Artefacten

| Bestand | Inhoud |
|---|---|
| `output/phase82/PHASE82_REMAINING_QUEUE.json` | de 109 resterende queue-items + de 11 al gezochte |
| `output/phase82/ebay_offers_phase82.json` | 780 nieuwe ACTIVE aanbiedingen (publicatiepayload) |
| `output/phase82/PHASE82_EBAY_PARTS.json` | 98 onderdelen + aanbiedingen per onderdeel |
| `output/phase82/PHASE82_LIVE_RESULTS.json` | chunktotalen, marktplaatsverdeling, overlap met Phase 81 |
| `output/phase82/PHASE82_MODEL_COVERAGE.json` | modellen per nieuw onderdeel, 17 prioriteitsmodellen |
| `output/phase82/PHASE82_NEEDS_EVIDENCE_GROUPS.json` | 612 kandidaten gegroepeerd naar ontbrekend bewijs |
| `output/phase82/PHASE82_CATALOG_AUDIT.json` | catalogus-/harvest-/supersession-analyse |
| `output/phase82/PHASE82_AMAZON_AUDIT.json` | Amazon-status en blokkades |
| `output/phase82/PHASE82_SUMMARY.json` | de negen verplichte rapportnummers |
