# Phase 80.2 — Zero-Activation Root Cause & Evidence Recovery

Repository: `gel2701/stihl-decoder` · Branch: `freebuff/270a802ba68d0ac21adbb1ad` · PR #146
Date: 2026-11-13

---

## 0. Wat in deze omgeving wel en niet kon

De drie productiebestanden bestaan **alleen op Render**:

```
/var/data/phase80/phase80_batch_live_2026-11-13T01-43-37-872Z.json
/var/data/affiliate/ebay_evidence_registry.json
/var/data/affiliate/ebay_offers.json
```

Deze agentomgeving heeft geen `/var/data`, geen `RENDER_DISK_PATH`, geen Render-API-token en geen
eBay-credentials. De 169 opgeslagen getItem-antwoorden zijn hier dus **niet** aanwezig; er zijn geen
live-cijfers verzonnen. Wat hier is gedaan:

1. De **technische fouten** die nul-activatie veroorzaken zijn in de code gevonden en gerepareerd.
2. Er is een **recovery-tool** gebouwd die de bestaande productiebestanden lokaal herbeoordeelt
   **zonder enig netwerkverzoek**, de blokkades per kandidaat uitsplitst en de bewezen ACCEPT-
   aanbiedingen naar de persistente store schrijft.
3. Die tool is end-to-end getest op realistische getItem-payloads (7 tests).

Eén commando op Render levert de tien verplichte cijfers (zie §5).

## 1. De vijf gevonden oorzaken van 0 ACTIVE (met bewijs in de code)

| # | Oorzaak | Effect | Fix |
|---|---|---|---|
| 1 | `getItem` vroeg **geen** `fieldgroups=PRODUCT` en `parseItemDetail` las alleen `raw.mpn` | eBay levert de MPN meestal in `product.mpns` of in `localizedAspects` (Herstellernummer); die bleef leeg → identiteit nooit bewezen → alles NEEDS_EVIDENCE | PRODUCT-fieldgroup standaard aangevraagd; `mpn/mpns/gtin/gtins/brand` uit `product` **en** uit aspecten; `localizedAspects` + `product.aspects` + `aspectGroups` samengevoegd |
| 2 | Engine las aspecten alleen uit `detail.aspects`, niet uit `detail.localizedAspects`/`product.aspects` | reeds opgeslagen bewijs (169 records) werd genegeerd, ook als de MPN er wél in stond | alle bewijscontainers worden gelezen, ook voor records die vóór deze fix zijn opgeslagen |
| 3 | `quantity > 1` werd als `BUNDLE_OR_KIT` behandeld | `getItem.quantity` is **voorraad**, geen multipack → elke verrijkte kandidaat werd REJECTED in plaats van ACTIVE | regel verwijderd; bundel alleen nog uit de titel (`kit/set/bundle/pack`) |
| 4 | Eerder vastgelegd NL-verzendbewijs werd in sommige vormen niet herkend (`evidence.shipping.browse_delivery`, platte `browse_delivery_evidence`, `shipping_status` + tijdstempel) | bewezen NL-levering viel terug naar `SHIPPING_UNKNOWN` → REVIEW | `priorDeliveryEvidence()` leest alle vormen; een losse `ships_to_nl`-boolean zonder bevestiging/tijdstempel telt **niet** |
| 5 | `getItem`-verrijking in de batch gebruikte de detailvelden niet consistent (geen `mpns`, geen geneste shipping-opties) | verrijking leverde kosten maar geen beslissing |zelfde normalisatie in engine en batch; evidence-source en per-kandidaatdiagnose worden vastgelegd |

Bijkomend: deduplicatie van kandidaten ging niet verloren — `ReviewEvidenceBatch` houdt per listing
alle onderdeelrelaties bij (`related_part_numbers`, `item_relations`), en de store-key blijft
`part_number:marketplace:item_id`. De recovery-tool rapporteert expliciet hoeveel relaties zijn
behouden en hoeveel dubbele (part, listing)-paren zijn samengevoegd.

## 2. Wat de recovery-tool doet

`scripts/phase80_2_evidence_recovery.mjs`

```
--report   phase80_batch_live_*.json     (wat de vorige batch vond)
--input    pilot_100_results_*.json      (de oorspronkelijke aanbiedingen met URL's)
--evidence ebay_evidence_registry.json   (de 169 getItem-antwoorden)
--store    ebay_offers.json              (persistente store)
```

- **0 netwerkverzoeken**: geen OAuth, geen Browse, geen getItem.
- Herbeoordeelt elk (onderdeel, listing)-paar met de canonieke matcher en de opgeslagen evidence.
- Schrijft alleen `decision: ACCEPT` + bewezen NL-levering + geldige campagne-URL naar de store.
- Verifieert daarna met een **nieuwe** `AffiliateOfferResolver` dat elk ACTIVE-record een link oplevert.
- Rapporteert per kandidaat: MPN aanwezig? uit product-container of aspect? aantal aspecten,
  aantal verzendopties, affiliate-URL aanwezig, titel bevat onderdeelnummer, baseline- vs
  eindbeslissing, `first_blocking_step`, `evidence_gaps`, en of het bewijs is aangevuld.
- Splitst blokkades in **identiteit** vs **verzending** en telt "REJECT met uitsluitend ontbrekend
  bewijs" apart van aantoonbaar foute kandidaten.

Uitvoer: `phase80_2_recovery_<stamp>.json` + `.md` met de tien verplichte cijfers en de top-5
blokkades.

## 3. Bewijs dat de reparaties werken (offline, deterministisch)

`tests/phase80_2_evidence_recovery.test.js` (7/7):

1. `getItem` vraagt `fieldgroups=PRODUCT` en leest MPN/GTIN/brand/aspecten uit `product`.
2. MPN die **alleen** in `localizedAspects` staat is nog steeds het identiteitsbewijs.
3. Voorraad 40 is geen bundel → ACCEPT (was REJECT).
4. NL-bewijs wordt in alle vier opgeslagen vormen hergebruikt; een losse boolean niet.
5. Recovery-run met alleen registry-bewijs → ACTIVE, 0 getItem-calls, bewijs aangevuld.
6. CLI end-to-end: rapport + input + registry → 1 ACTIVE, 1 uniek onderdeel, 1 record op disk,
   1 resolver-link, 1 dubbel paar samengevoegd.
7. Eén listing bewezen voor twee onderdelen: beide relaties behouden, alleen het bewezen onderdeel
   ACTIVE, het andere aantoonbaar REJECTED (conflict), niets stilzwijgend weggegooid.

De bestaande test `phase76c` (76C.13) codeerde de fout zelf: die eiste dat `quantity: 4` een
bundel was. Die assertie is gecorrigeerd naar de werkelijke eBay-betekenis (voorraad), met een
expliciete multipack-titel als bundelgeval; de bundelbescherming zelf is ongewijzigd.

Volledige suite: zie §6.

## 4. Wat de cijfers op Render moeten worden

De tool berekent exact de gevraagde tien getallen. Zonder de bestanden zijn ze hier niet te geven;
ze zijn niet geschat of verzonnen. De verwachting op basis van de reparaties:

- lijsten waarvan de MPN in `product.mpns` of in `localizedAspects` staat kunnen nu **EXACT_MPN**
  halen (voorheen onmogelijk);
- lijsten met `quantity > 1` kunnen nu ACTIVE worden (voorheen REJECT);
- lijsten met eerder vastgelegd NL-verzendbewijs in een andere nestvorm kunnen nu ACTIVE worden;
- de rest blijft NEEDS_EVIDENCE met een concrete `evidence_gap` per kandidaat.

## 5. Uitvoeren op Render (één commando, 0 API-calls)

```bash
cd /opt/render/project/src
node scripts/phase80_2_evidence_recovery.mjs \
  --report /var/data/phase80/phase80_batch_live_2026-11-13T01-43-37-872Z.json \
  --input  /var/data/phase76e/pilot_100_results_phase76g1-live10_2026-11-13T00-40-11-612Z.json \
  --evidence /var/data/affiliate/ebay_evidence_registry.json \
  --store /var/data/affiliate/ebay_offers.json
```

Daarna (controle, zonder secrets):

```bash
node -e "const fs=require('fs');const d='/var/data/phase80';const p=fs.readdirSync(d).filter(f=>f.endsWith('.json')&&f.includes('recovery')).sort().pop();const r=JSON.parse(fs.readFileSync(d+'/'+p));console.log(JSON.stringify({required:r.required_report,coverage:r.coverage,chain:r.chain,blockers:r.blockers},null,2))"
```

Publicatie blijft uit: `EBAY_ENABLED=false` voor bezoekers. De resolver leest de store zodra die
flag aan staat (na herstart).

## 6. Status van de checks in deze omgeving

| Check | Resultaat |
|---|---|
| `tests/phase80_2_evidence_recovery.test.js` | 7/7 |
| `tests/phase80_affiliate_activation.test.js` | 12/12 |
| `tests/phase80_1_activation_pipeline.test.js` | 8/8 |
| `npm run test:gate` | exit 0 |
| Volledige suite `node tests/run_current_production_tests.js` | **121 suites, 121 pass, 0 fail** (exit 0) |
| Live ACTIVE-aanbiedingen op Render | **niet uitgevoerd** (geen toegang tot `/var/data`) |
| Merge PR #146 | niet uitgevoerd (geen merge-tool); branch is groen gepusht |

## 7. Eerlijkheid over het succes criterium

Het succes criterium is "nieuwe correcte ACTIVE-links uit bestaande gegevens". De code die dat doet
staat er, is getest en heeft één commando nodig op de machine waar de gegevens staan. In deze
omgeving zijn die gegevens niet aanwezig, dus zijn er hier geen nieuwe live-links geactiveerd en
wordt dat ook niet geclaimd.
