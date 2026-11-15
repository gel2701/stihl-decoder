# PHASE 85 — Walbro/STIHL Catalog Expansion & Evidence-Safe Import

Branch: `phase85/carb-catalog` · basis: `main` @ `de2dd7e`

## Wat er is gedaan

De Walbro/STIHL-cross-referentie uit de gedeelde bronmap (Scribd-export
`392091827`, 247 tabelrijen over 12 pagina's) is rij voor rij opnieuw uitgelezen
en vergeleken met de canonieke catalogus. Elke kandidaat kreeg een
bewijsregistratie met paginanummers, oorspronkelijke rijtekst en de
(tussen)uitkomst. Alleen bewezen kandidaten zijn geïmporteerd.

Daarnaast is de eBay-bewijsopslag structureel gerepareerd en zijn de nieuw
bewezen carburateurs live bij eBay gezocht.

## 1. Nieuwe catalogusonderdelen — 83

| Groep | Aantal | Bewijs |
| --- | --- | --- |
| Carburateurs uit de cross-referentie (VERIFIED) | 79 | STIHL-groepcode `120`, carburateurcode ankerend aan dezelfde rij, identiek bij alle voorkomens, buurnummer binnen dezelfde serie (≤ 10) |
| Gedocumenteerde technische wijzigingen (beide zijden) | 4 | `TI_13_1995` (Rollomatic E Super) en `TI_44_1995_30` (testing tool kit) |

Catalogus: **18.397 → 18.480** (`data/parts_catalog.json`), SQLite opnieuw
geseed: 18.480 `parts`. Geen bestaand record is verwijderd of herschreven.

Naamgeving volgt de bestaande stijl `Stihl Carburettor <code>`; de vier
wijzigingsonderdelen heten `Stihl Rollomatic E Super Guide Bar` en
`Stihl Testing Tool Kit`, met bron `stihl_local_library` / `official_stihl`.

## 2. Nieuwe fitmentrelaties — 0 (bewust)

De tabel noemt **modelseries** ("009", "010", "MS 250", "FS 75/80/85"), geen
exacte uitvoering. De fitment-shards eisen een `variant_key` en
`configuration_key` (`EXACT_VARIANT` / `EXACT_CONFIGURATION`); een serie-naam
levert die niet. De twee supersessies noemen evenmin een model- of
seriebereik. Daarom zijn er **geen** fitments geschreven in plaats van
onbewezen relaties: liever 0 bewezen dan 100+ gegokte koppelingen.

## 3. Herstelde OCR-fouten — 163

Alleen letterspatiëring is hersteld ("W T 194" → "WT 194", "C hain Saw" →
"Chain Saw"); cijfers zijn nooit aangepast. 163 reparaties over 623
geëxtraheerde rijen, allemaal vastgelegd in
`output/phase85/PHASE85_CARB_CANDIDATES.json → parsing`.

Verdeling van de 127 ontbrekende nummers:

| Uitkomst | Aantal |
| --- | --- |
| VERIFIED (geïmporteerd) | 79 |
| NEEDS_EVIDENCE | 47 |
| REJECTED | 1 |

## 4. Nieuwe ACTIVE eBay- en Amazon-aanbiedingen — 85 eBay, 0 Amazon

Live Browse API-batches over alle 79 nieuwe onderdelen (geen HTTP 429 deze keer):

- **85 nieuwe ACTIVE eBay-aanbiedingen** op **28 onderdelen**, alle
  `EXACT_MPN` + `SHIPS_TO_NL_CONFIRMED`, campagne `5339245312`.
- 154 listings bleven NEEDS_EVIDENCE, 29 zijn afgewezen (verkeerde MPN,
  verkeerde levering, of geen bewijs).
- Amazon: **0** — geen PA-API-credentials in deze omgeving, dus geen enkele
  ASIN kon bewezen worden.

Payload: `output/phase85/ebay_offers_phase85.json`;
audit: `output/phase85/PHASE85_AFFILIATE_AUDIT.json`.

## 5. Extra unieke onderdelen met koopmogelijkheid — +28

201 → **229** onderdelen met een bewezen directe kooplink.

## 6. Resterende NEEDS_EVIDENCE — 47

| Reden | Aantal |
| --- | --- |
| Geen carburateurcode in de rij overgebleven | 27 |
| Carburateurcode niet aan déze rij verankerd (kolomverschuiving) | 12 |
| Twee verschillende carburateurcodes claimen hetzelfde nummer | 6 |
| Geen buurnummer in dezelfde reeks om de cijfers te bevestigen | 2 |

Alle 47 staan met brontekst, pagina's en reden in het candidates-bestand en in
`PHASE85_CATALOG_MIGRATION.json → parked`; niets is weggegooid.

De ene REJECTED (`1122 020 0616`) heeft STIHL-groepcode `020`, dus het is geen
carburateur; die valt niet te herstellen.

## 7. Behoud van alle bestaande ACTIVE-aanbiedingen

De opslag (`src/affiliate/EbayOfferStore.js`) verving bij elke import het hele
record. Nu:

- veldsgewijze merge (`mergeEbayOfferRecord`): lege inkomende velden overschrijven
  nooit bestaand product- of verzendbewijs;
- conflicterende identiteit (titel/MPN/GTIN/matchtype) wordt **niet** stilzwijgend
  samengevoegd: de opgeslagen waarde wint en het conflict wordt in
  `evidence_conflicts` vastgelegd;
- `related_part_numbers` worden verenigd, `first_seen_at` blijft behouden;
- resultaat onderscheidt `added`, `updated`, `preserved`, `rejected`, `conflicts`;
- records die een batch niet noemt blijven onaangeroerd; imports zijn idempotent.

Regressietest met de echte Phase 82/84-situatie
(`tests/phase85_ebay_store_merge.test.js`): 41 bijgewerkte records + 1 nieuw
record, 0 verlies, bewijs blijft staan. De live batches van deze fase meldden
`active_preserved_in_store` 9 → 36 → 65 → 78 → 83: de store groeide alleen.

### Correctie op Phase 84

41 van de 42 Phase 84-aanbiedingen bleken her-imports van Phase 82-listings
(zelfde onderdeel, marketplace en `item_id`); slechts **1** was echt nieuw.
Phase 84 rapporteerde "42 nieuwe aanbiedingen". Dat is nu gecorrigeerd in
`PHASE84_AFFILIATE_AUDIT.json`, `PHASE84_SUMMARY.json`,
`PHASE84_GSC_MODEL_COVERAGE.json` en de Phase 84-test
(`new_active_offers: 1`, `reimported_active_offers: 41`, `offers_in_payload: 42`).

## 8. Productieverificatie

- 4 CI-checks (gate, volledige suite, trust-claims + `git diff --check`, e2e).
- PR + merge bij groen; daarna `/api/version` op de Render-deployment.
- Store-import in productie (idempotent, dezelfde merge):

```bash
node scripts/phase80_evidence_batch.mjs --offline \
  --input output/phase85/ebay_offers_phase85.json \
  --store /var/data/affiliate/ebay_offers.json \
  --evidence /var/data/affiliate/ebay_evidence_registry.json \
  --out-dir /var/data/phase80
```

Lokaal geverifieerd: 28 onderdelen, 85 ACTIVE, 0 door de guard afgewezen.
Catalogus/fitments in productie: `node data/seed.cjs` na de deploy, of
`npm run build` (die seedt mee).

## Artefacten

- `output/phase85/PHASE85_CARB_CANDIDATES.json` — 623 rijen, 174 nummers,
  127 ontbrekend, classificatie + OCR-reparaties
- `output/phase85/PHASE85_CATALOG_MIGRATION.json` — wat is toegevoegd, wat is
  geparkeerd, welke supersessies
- `output/phase85/ebay_offers_phase85.json` + `PHASE85_AFFILIATE_AUDIT.json`
- `output/phase85/PHASE85_EBAY_QUEUE.json` — de 79 onderdelen die bij eBay zijn
  gezocht
- scripts: `build_phase85_candidate_queue.mjs`, `apply_phase85_catalog.mjs`,
  `build_phase85_affiliate_artifacts.mjs`

## Wat níet is gelukt (eerlijk)

- **Amazon**: 0 aanbiedingen, credentials ontbreken.
- **Fitments**: 0, omdat de bron alleen modelseries noemt.
- **47 kandidaten** blijven NEEDS_EVIDENCE; de bron is te beschadigd om ze te
  bewijzen zonder aanvullend document.
- **Productie-import**: de Render Shell is vanuit deze omgeving niet bereikbaar
  (401); het commando hierboven is klaar om te draaien.
