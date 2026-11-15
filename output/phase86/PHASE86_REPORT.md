# PHASE 86 — Catalog Coverage, Amazon-activatie & eBay-uitbreiding

Branch: `phase86/coverage-amazon-ebay` · basis: `main` @ `cd481e2` (Phase 85)

Werkelijk uitgevoerd, met bewijs per stap. Niets geactiveerd of toegevoegd zonder
bron; niets bestaands weggegooid.

---

## 1. Productiebaseline gecontroleerd

| Metric | Opgegeven | Gemeten in deze omgeving | Bron |
| --- | ---: | ---: | --- |
| Catalogusonderdelen | 18.480 | **18.480** | `data/parts_catalog.json`, SQLite 18.480 |
| Model-fitmentrelaties | 181.394 | **181.394** | `data/model_part_fitments.json` (8 shards) |
| ACTIVE Amazon-aanbiedingen | 99 | **99** vóór audit (53 NL / 46 DE) | `data/affiliate/verified_amazon_registry.json` |
| Onderdelen met Amazon-aanbod | 86 | **86** vóór audit | idem |
| ACTIVE eBay-aanbiedingen | 1.734 | **1.637** in de payloads van Phase 81-85 (1.076 NL / 561 DE) | `output/phase8*/ebay_offers_phase*.json` |
| Onderdelen met eBay-aanbod | 229 | **219** in dezelfde payloads | idem |
| Walbro NEEDS_EVIDENCE | 47 | **47** | `output/phase85/PHASE85_CARB_CANDIDATES.json` |
| Niet onderzochte eBay-onderdelen | 104 | **104** | `output/phase86/PHASE86_EBAY_QUEUE.json` |

De productie-store op `/var/data` is vanuit deze omgeving niet leesbaar (Render
Shell geeft 401), dus de eBay-totalen zijn gereconstrueerd uit de payloads die
elke vorige fase heeft gepubliceerd. De 1.734 uit de opdracht is de stand van de
productie-store; het verschil van 97 aanbiedingen zit in oudere fasen (Phase 76/80)
waarvan de payload niet in `output/` staat.

---

## 2. Amazon — live beschikbaarheidsaudit (prioriteit)

Geen PA-API, dus de enige toegestane weg is de publieke productpagina. Die geeft
HTTP 503 aan een gewone HTTP-client, maar werkt in een echte browser. Daarom is
**elk** ASIN in de registry (157) in een browser geopend, met twee controles in
dezelfde sessie: een bekend levend ASIN (`B0068M5NAG` → 200) en een verzonnen
ASIN (`B000000000` → 404). De 404's zijn dus delistings, geen bot-blokkade.

### Uitkomst

| Marketplace | Gecontroleerd | Leeft (200) | Weg (404) |
| --- | ---: | ---: | ---: |
| amazon.nl | 107 | 30 | **77** |
| amazon.de | 50 | 50 | 0 |

- **24 van de 99 ACTIVE aanbiedingen** wezen naar een amazon.nl-pagina die niet
  meer bestaat. Die zijn **gesuspendeerd** (`status: SUSPENDED`,
  `suspension_reason: LISTING_NOT_AVAILABLE_404`, met `previous_status: ACTIVE`
  en de live audit als bewijs). De site stuurt bezoekers daarmee niet langer naar
  een dode affiliate-link. Er is niets verwijderd en niets ongeverifieerd
  geactiveerd.
- **53 van de 54 RESEARCH_REQUIRED-kandidaten op amazon.nl** bestaan evenmin nog.
  Dat verklaart waarom drie fasen lang geen enkele amazon.nl-activatie mogelijk
  was: het aanbod was weg, niet alleen het bewijs.
- Alle **46 ACTIVE amazon.de**-aanbiedingen leven; de 3 VERIFIED-kandidaten op
  amazon.de leven ook, maar missen nog steeds de onafhankelijke ASIN-identiteit
  en bevestigde NL-levering.
- Van de 24 levende amazon.nl-aanbiedingen tonen er 24 een winkelwagen; de
  overige 5 levende pagina's (waarvan 1 kandidaat) hebben geen buybox.

### Waarom er niets geactiveerd is (exacte blokkade)

1. **Amazon PA-API / Creators API is niet geconfigureerd.** In de omgeving staan
   alleen de associate-tags (`AMAZON_ASSOCIATE_TAG_NL`, `…_DE`); access key,
   secret key en partner tag ontbreken. Zonder die autorisatie is er geen
   geauthenticeerde offer-, buybox- of leveringsdata.
2. **Repo-beleid (AGENTS.md richtlijn 4 + TwoGateVerifier Gate 2)** eist
   onafhankelijke externe corroboratie die *dat specifieke ASIN* aan fabrikant en
   MPN koppelt. Een Amazon-productpagina — levend of niet — kan dat per definitie
   niet alleen leveren. Alle 55 kandidaten leunen nu uitsluitend op de
   Amazon-vermelding zelf.
3. Een publieke HTTP-fetch van `amazon.nl/dp/<asin>` geeft 503; alleen een browser
   rendert de pagina. Bewijs per ASIN is dus niet programmeerbaar massaal te
   verzamelen.

### Wel opgeleverd

- `output/phase86/amazon_alternative_search.json`: voor de 24 gesuspendeerde
  onderdelen is op amazon.nl gezocht naar vervangende, **levende** ASIN's.
  Resultaat: **15 onderdelen met 58 listings** waarvan de titel het exacte
  STIHL-onderdeelnummer noemt (o.a. `0781 120 1110` → `B007TK0T00`,
  `1129 190 0601` → `B007TK13CI`, `1123 640 2073` → `B006WVO0QQ`). Deze zijn
  bewust **niet** in de registry gezet: een Amazon-titel is geen onafhankelijk
  identiteitsbewijs, en een verkeerd ASIN in de registry is erger dan geen.
- `output/phase86/PHASE86_AMAZON_ACTIVATION.json` met de volledige audit,
  suspenderingen, resterende blokkades per kandidaat en de alternatieven.

Zodra PA-API/ Creators-credentials beschikbaar zijn, is de activatie een kwestie
van `node scripts/import_verified_amazon_offers.mjs` op de bestaande provider —
geen nieuwe architectuur nodig.

---

## 3. eBay — 104 openstaande onderdelen verwerkt

`scripts/build_phase86_ebay_queue.mjs` reconstrueert de open werkvoorraad uit
`PHASE82_REMAINING_QUEUE.json` minus de 5 onderdelen die Phase 84 al had gedaan:
**104 onderdelen**, alle met een GSC-prioriteitsrang.

Daarna 11 live Browse-batches (EBAY_NL + EBAY_DE, `deliveryCountry:NL`,
campagne `5339245312`) en 6 verrijkingsruns. Geen HTTP 429.

| Resultaat | Aantal |
| --- | ---: |
| Onderdelen gezocht | 104 |
| Geaccepteerde relaties | 840 |
| Unieke geaccepteerde listings | 838 |
| **Werkelijk nieuwe listings** | **136** (70 EBAY_NL / 66 EBAY_DE) |
| Her-imports van al gepubliceerde listings | 702 |
| Onderdelen met nieuwe listings | 28 |
| **Nieuw onderdeel met directe kooplink** | **1** (`1130 020 3034`) |
| NEEDS_EVIDENCE (titel-only) | 586 distinct listings |
| Afgewezen | 51 distinct listings, alle `CONFLICTING_MPN` |

Iedere geaccepteerde listing heeft `SHIPS_TO_NL_CONFIRMED` **en** een gevulde
`shipping_evidence` (838/838); 611 zijn `EXACT_MPN`, 227
`EXACT_PART_NUMBER_WITH_CORROBORATION`.

Het onderscheid nieuw / her-import is gemeten tegen de Phase 81-85-payloads, niet
tegen een lege store: van de 838 geaccepteerde listings bestonden er 702 al.

### §6 — bestaande NEEDS_EVIDENCE verrijkt

De 586 titel-only kandidaten zijn niet afgeschreven maar verrijkt: als de
opgeslagen Browse-detail geen MPN bevat, vraagt de batch nu één keer
`getItem` op met de PRODUCT-fieldgroup (koperspecifieke MPN /
"Herstellernummer"-aspect). Daarvoor is `ReviewEvidenceBatch.js` uitgebreid —
bestaande caches, budget en evidence-registry blijven leidend.

| Verrijking | Aantal |
| --- | ---: |
| Kandidaten verwerkt | 686 |
| `getItem`-verzoeken | 423 |
| Bewijs aangevuld → ACTIVE | **108** |
| Nog steeds NEEDS_EVIDENCE | 578 (waarvan 586 distinct vóór de run) |

---

## 4. Walbro — modelcompatibiliteit en de 47 resterende kandidaten

De bron (`PHASE85_CARB_CANDIDATES.json`) noemt modelseries, geen uitvoering. Om
alsnog exacte compatibiliteit te bewijzen is de catalogue geprobeerd die het
project al als configuratiebron gebruikt (gardenhirespares, dezelfde bron als
`parts_model_configurations.json`).

- **79/79 VERIFIED carburateurs**: 0 treffers. De catalogus verkoopt deze
  Walbro/STIHL-nummers niet en noemt dus ook geen model.
- **47/47 NEEDS_EVIDENCE-nummers**: 0 treffers. Er is dus geen enkele bron die de
  onzekere cijfers bevestigt of weerlegt.
- Officiële IPL-documenten en de vijftien archieven uit Phase 84 zijn in deze
  omgeving afwezig (`PHASE84_DRIVE_SOURCES.json → archives_missing`), en de
  Google Drive-integratie geeft 403 insufficient scopes.

Daarom: **0 nieuwe fitmentrelaties** en **0 promoties**. Niet omdat het te veel
werk was, maar omdat er geen bron is die een `variant_key`/`configuration_key`
onderbouwt. Alle 47 blijven met brontekst, paginanummers en reden bewaard.

---

## 5. GSC-first prioritering

De eBay-queue is gesorteerd op GSC-rang (104/104 hebben een rang). De nieuwe
listings raken **14 van de 16 gevraagde modellen**:

FS 55 (41), FS 85 (26), MS 260 (24), MS 390 (10), MS 361 (8), HS 45 (8),
TS 420 (7), MS 440 (5), MS 461 (4), MS 180 (3), MS 250 (3), MS 661 (3),
BR 600 (3), MS 170 (2), FS 350 (2). Geen nieuwe listings voor MS 261 en BG 86.

---

## 6. Zichtbaarheid op STIHLDecoder.nl

- Productie `/onderdeelnummer/00004007000/` toont zowel een directe Amazon-link
  (`amazon.nl/dp/B001RM8J76`, tag `srihldecoder2-21`) als directe eBay-itemlinks
  (`ebay.nl/itm/…`), naast de affiliate-disclosure — beide marketplaces zijn dus
  zichtbaar en te onderscheiden op één onderdeelpagina.
- Gesuspendeerde Amazon-aanbiedingen resolven niet meer als actief: getest via
  `VerifiedOfferRegistry.getActiveOffer` (null) en `listOffers({status:'ACTIVE'})`
  (afwezig). Bezoekers vallen daar terug op de zoekfallback.
- Nieuwe eBay-aanbiedingen verschijnen pas op de site nadat de store-import is
  uitgevoerd (zie §8).

---

## 7. Import en veiligheid (§9)

- De gebruikte import is de in Phase 85 gerepareerde `EbayOfferStore.js`
  (veldsgewijze merge, bewijs nooit overschreven, conflicten vastgelegd,
  idempotent). De 11 + 6 batches meldden `store_rejected_by_guard: 0`.
- Lokaal is de store eerst gevuld met de 1.637 al gepubliceerde aanbiedingen
  (`scripts/seed_phase86_ebay_store.mjs`), daarna zijn de batches eroverheen
  gemerged: 1.637 → **1.773** aanbiedingen op 220 onderdelen, zonder verlies.
- Overlapcontrole vóór elke import: `(part_number, marketplace, item_id)` —
  vandaar de 702 her-imports die als `updated` en niet als `added` tellen.
- Amazon: 24 records kregen een nieuwe lifecycle-status met bewijs; 0 records
  verwijderd; 0 records geactiveerd.

---

## 8. Publicatie

| Onderdeel | Status |
| --- | --- |
| Catalogus / fitments | ongewijzigd (18.480 / 181.394) — deploy nodig na merge |
| Amazon-registry | gewijzigd in de repo; deploy nodig na merge |
| eBay-aanbiedingen | payload klaar; **store-import op `/var/data` moet nog** |

De store-import kan niet vanuit deze omgeving (Render Shell 401):

```bash
node scripts/phase80_evidence_batch.mjs --offline \
  --input output/phase86/ebay_offers_phase86.json \
  --store /var/data/affiliate/ebay_offers.json \
  --evidence /var/data/affiliate/ebay_evidence_registry.json \
  --out-dir /var/data/phase80
```

Verwacht: 838 relaties verwerkt, 136 nieuw, 702 bijgewerkt, 0 verlies; productie
gaat dan van 1.734 naar **1.870 ACTIVE aanbiedingen** op **230 onderdelen**.

---

## 9. Eindrapport

| Metric | Voor | Nieuw | Na |
| --- | ---: | ---: | ---: |
| Catalogusonderdelen | 18.480 | 0 | 18.480 |
| Fitmentrelaties | 181.394 | 0 | 181.394 |
| ACTIVE Amazon.nl | 53 | −24 (dode listings) | **29** |
| ACTIVE Amazon.de | 46 | 0 | **46** |
| ACTIVE eBay.nl | 1.076 (payload) | +70 | **1.146** |
| ACTIVE eBay.de | 561 (payload) | +66 | **627** |
| Unieke onderdelen met Amazon-aanbod | 86 | −23 | **63** |
| Unieke onderdelen met eBay-aanbod | 219 (payload) | +1 | **220** |
| Unieke onderdelen met ≥1 directe kooplink | 229 (productie) | +1 | **230** na import |
| Walbro-kandidaten verwerkt | 47 | 0 gepromoveerd | **47** |
| NEEDS_EVIDENCE aangevuld | — | **108** eBay-listings op 28 onderdelen + 1 nieuw onderdeel | 108 |
| Resterende onbewezen kandidaten | 47 Walbro + 586 eBay + 55 Amazon | −108 | **47 + 478 + 55** |
| Productiepublicatie | — | commit + deploy | **gedeeltelijk**: code/registry na merge, eBay-store-import open |

Nieuw vs. werkelijk nieuw: 136 nieuwe eBay-listings leverden **28 onderdelen met
méér koopopties** en **1 werkelijk nieuw koopbaar onderdeel** op.

---

## 10. Wat niet is gelukt (eerlijk)

- **Amazon-activatie: 0.** Niet door ontbrekend onderzoek, maar door ontbrekende
  autorisatie (PA-API/Creators) plus een beleidsregel die een Amazon-pagina niet
  als identiteitsbewijs accepteert. 53 amazon.nl-kandidaten blijken bovendien
  delisted; de 24 dode ACTIVE-links zijn gestopt in plaats van getoond.
- **Nieuwe fitments: 0.** Geen enkele bron in deze omgeving koppelt de 79
  carburateurs aan een uitvoering; de dealer-catalogus kent geen van de 126
  nummers.
- **Nieuwe catalogusonderdelen: 0.** De 47 Walbro-kandidaten zijn niet te
  bewijzen zonder de originele documentpagina's of de Drive-archieven.
- **Productie-store-import** vereist nog de Render Shell-stap hierboven.

## Artefacten

- `output/phase86/PHASE86_EBAY_QUEUE.json` — 104 onderdelen, GSC-gesorteerd
- `output/phase86/ebay_offers_phase86.json` — 838 geaccepteerde listings met bewijs
- `output/phase86/PHASE86_AFFILIATE_AUDIT.json` — nieuw/her-import, redenen, modellen
- `output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json`
- `output/phase86/PHASE86_AMAZON_ACTIVATION.json` — audit, suspenderingen, blokkades
- `output/phase86/amazon_audit_batch_a.json`, `amazon_audit_de_status.json`,
  `amazon_audit_rr_nl_status.json`, `amazon_alternative_search.json`
- `output/phase86/ghs_carb_probe_a.json`, `ghs_carb_probe_b.json`,
  `ghs_needs_evidence_probe.json` — 0 treffers op 79 + 47 nummers
- scripts: `build_phase86_ebay_queue.mjs`, `seed_phase86_ebay_store.mjs`,
  `apply_phase86_amazon_availability.mjs`, `build_phase86_affiliate_artifacts.mjs`
- tests: `tests/phase86_coverage_and_amazon_availability.test.js`
