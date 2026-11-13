# Phase 80.3 — eBay Shipping Evidence Recovery & Direct Activation

Repository: `gel2701/stihl-decoder` · Branch: `freebuff/270a802ba68d0ac21adbb1ad`
Date: 2026-11-13

---

## 1. Wat de productie-recovery aantoonde

Uit de Phase 80.2-run op Render: 184 marketplace-specifieke onderdeel-listingcombinaties,
133 met MPN-informatie, **165 NEEDS_EVIDENCE wegens `SHIPPING_NOT_CONFIRMED`**, 19 afwijzingen
wegens `CONFLICTING_MPN`, 0 ACTIVE.

De 165 zijn één blokkade, niet 165 onbekenden: de opgeslagen getItem-details bevatten geen
`shippingOptions` (eBay levert die alleen bij een contextuele locatie), en de oorspronkelijke
76G-records hadden soms geen vastgelegd `deliveryCountry`-bewijs. Zonder nieuwe zoekactie was er
dus geen NL-leveringsbewijs — en zonder dat bewijs mag niets ACTIVE worden.

## 2. Gerichte NL-verzendverificatie (geen discovery)

Nieuw: `src/affiliate/ShippingRecovery.js` + `src/affiliate/EbayShippingEvidenceRegistry.js`
(persistent: `<affiliate>/ebay_shipping_evidence.json`, op Render
`/var/data/affiliate/ebay_shipping_evidence.json`).

- Er wordt **uitsluitend** gezocht voor de reeds bekende (onderdeel, marketplace)-paren, met
  `filter=deliveryCountry:NL`, seller `ALL`, max. `--max-parts` (standaard 10) onderdelen.
- Bevestiging geldt alleen als de **exacte** `item_id` in de respons terugkomt én de respons
  aantoonbaar met het filter en HTTP 200 is beantwoord. Niet teruggekomen = geen bewijs.
- Bewijs wordt vastgelegd per `marketplace + item_id`, met: exact item-ID, marketplace, toegepast
  filter, HTTP-status, controletijdstip, zoekquery's, expliciete bestemmingen en verzendkosten.
- Een expliciete bestemmingslijst zonder NL is een **restrictie** (geen bevestiging).
- Bewijs verloopt (30 dagen) en wordt nooit tussen marketplaces hergebruikt.

## 3. Herbeoordeling zonder dubbel werk

Na de verificatie worden de records aan de bestaande kandidaten gehangen (alleen bij exact
dezelfde marketplace + item-ID) en herbeoordeelt de bestaande `ReviewEvidenceBatch` alles
**offline**: geen getItem, geen Browse. De 169 opgeslagen getItem-records blijven de
productidentiteit leveren; alleen het ontbrekende verzendbewijs is nieuw.

Aangeroepen via de bestaande recovery-tool met één extra flag:

```bash
cd /opt/render/project/src
node scripts/phase80_2_evidence_recovery.mjs \
  --report /var/data/phase80/phase80_batch_live_2026-11-13T01-43-37-872Z.json \
  --input /var/data/phase76e/pilot_100_results_phase76g1-live10_2026-11-13T00-40-11-612Z.json \
  --evidence /var/data/affiliate/ebay_evidence_registry.json \
  --shipping-evidence /var/data/affiliate/ebay_shipping_evidence.json \
  --store /var/data/affiliate/ebay_offers.json \
  --verify-shipping --max-parts 10
```

Zonder credentials stopt de tool met `ABORT: --verify-shipping requires …` (geen stille
schijnactivering).

## 4. De 19 MPN-conflicten

Het rapport analyseert elke afwijzing met `CONFLICTING_MPN` / `CONFLICTING_TITLE_PART_NUMBER`:
welke nummers de listing noemt, of het doelonderdeel in de catalogus bestaat, en of een genoemd
nummer een **door de catalogus vastgelegde supersessie** is (`model_part_fitments.superseded_by`).
Alleen zulke referenties gelden als gelegitimeerd equivalent; de repository bevat er momenteel 6
(één paar). Verkoperstekst alleen keurt niets goed, dus multi-nummer-aanbiedingen zonder
catalogusbewijs blijven `CONFLICTING_MPN`.

## 5. Keten en publicatie

`ACTIVE-record → persistente store → AffiliateOfferResolver → directe eBay-link (campid
5339245312)` wordt na elke run geverifieerd met een **nieuwe** resolver. `EBAY_ENABLED` blijft
`false` voor publieke bezoekers; de resolver leest de store pas als die flag aan staat.

## 6. Verplichte cijfers (mapping)

Het rapport (`required_report` in de JSON/Markdown) bevat:

| Gevraagd | Veld |
|---|---|
| marketplace/item-ID's opnieuw met NL-filter gecontroleerd | `2_listings_rechecked_with_nl_filter` (+ `shipping_verification.searched_groups/parts`) |
| bevestigd NL-verzendbewijs | `2_listings_confirmed_nl_shipping_now` (+ `restricted_pairs`, `not_returned_pairs`) |
| bestaande bewijsrecords hergebruikt | `3_evidence_records_reused` |
| nieuwe ACTIVE-aanbiedingen | `5_new_active_offers` (**primaire succesmaatstaf**) |
| unieke STIHL-onderdelen met kooplinks | `6_unique_parts_buyable` |
| werkende links via de resolver | `10_resolver_links` |
| resterende NEEDS_EVIDENCE | `7_remaining_needs_evidence` |
| aantoonbaar verkeerde aanbiedingen | `8_provably_wrong` (+ `mpn_conflicts.analysed`) |
| ACTIVE-records op persistente disk | `9_active_records_on_disk` |

## 7. Checks in deze omgeving

| Check | Resultaat |
|---|---|
| `tests/phase80_3_shipping_recovery.test.js` | 6/6 |
| `tests/phase80_2_evidence_recovery.test.js` | 9/9 |
| `tests/phase80_affiliate_activation.test.js` / `phase80_1` | 12/12 · 8/8 |
| `tests/phase76c_high_volume_engine.test.js` | 13/13 |
| Stage A `check_affiliate_consistency.mjs` / Stage B `affiliate_quality_gate.test.js` | exit 0 · 7/7 |
| Volledige suite `node tests/run_current_production_tests.js` | **122 suites, 122 pass, 0 fail** (exit 0) |

## 8. Wat hier niet kon

Deze omgeving heeft geen `/var/data`, geen Render-toegang en geen eBay-credentials. De gerichte
verificatie en de productie-activering zijn daarom **niet uitgevoerd** en er worden geen
live-cijfers geclaimd. `gh` is niet ingelogd, dus PR undraften/mergen en Actions-status zijn hier
evenmin mogelijk.
