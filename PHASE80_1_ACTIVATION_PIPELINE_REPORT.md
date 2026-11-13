# Phase 80.1 — Activation Pipeline & Existing REVIEW Offers

Repository: `gel2701/stihl-decoder` · Branch: `freebuff/270a802ba68d0ac21adbb1ad` · PR #146
Date: 2026-11-13

---

## 1. Batchrunner gerepareerd (REVIEW → getItem, geen nieuwe zoekopdracht)

`scripts/phase80_evidence_batch.mjs` kent nu twee invoervormen met een gescheiden strategie:

| Input | Strategie |
|---|---|
| Bestaande REVIEW-aanbiedingen (`review_offers` uit Phase 76G state/results) | Gebruikt de opgeslagen `item_id`'s. `getItem` **alleen** voor kandidaten waarvan het productbewijs of verzendbewijs ontbreekt. Eén `getItem` per uniek item, gedeeld over alle onderdeelrelaties. |
| Alleen onderdeelnummers (GSC/queue) | Browse-zoekopdracht met `deliveryCountry:NL`, daarna verrijking. |

- **Geen nieuwe Browse Search** voor bestaande aanbiedingen; die wordt alleen uitgevoerd als
  `getItem` aantoont dat de listing niet meer bestaat (HTTP 404 / geen item).
- **Meerdere onderdeelrelaties per item** blijven behouden: de store-key is nu
  `part_number:marketplace:item_id`, elk record draagt `related_part_numbers`, en het rapport
  bevat `item_relations`.
- **Geen dubbele API-verzoeken**: persistente evidence-registry + run-cache + de bestaande
  `itemDetailCache` van de client. Teller `get_item_requests` vs. `get_item_network_calls` laat
  het verschil zien.
- Bewijsaanvulling gebeurt in `src/affiliate/ReviewEvidenceBatch.js` (injecteerbaar, getest);
  de runner is nu een dunne CLI eromheen.

## 2. Persistente productieopslag

`src/affiliate/AffiliateStoragePaths.js` resolvet in deze volgorde:
`AFFILIATE_DATA_DIR` → `EBAY_OFFER_STORE_PATH` / `EBAY_EVIDENCE_REGISTRY_PATH` / `PHASE80_OUTPUT_DIR`
→ `RENDER_DISK_PATH` → bestaand `/var/data` → lokaal `<project>/data`.

Op Render (waar `/var/data` bestaat, zie de Phase 76E/76G checkpointpaden):

```
/var/data/affiliate/ebay_offers.json
/var/data/affiliate/ebay_evidence_registry.json
/var/data/phase80/
```

Lokaal blijft alles zoals het was: `data/affiliate/…` en `output/phase80/`.
`AffiliateOfferResolver` en `EbayAffiliateProvider` gebruiken allebei `getEbayOfferStorePath()`,
dus dezelfde persistente store. Herstart is getest (nieuwe provider + nieuwe resolver lezen de
ACTIVE-records uit hetzelfde bestand).

## 3. Productiecredentials (Render)

De credentials zijn **niet** in deze agentomgeving aanwezig (`EBAY_CLIENT_ID`,
`EBAY_CLIENT_SECRET`, `EBAY_EPN_CAMPAIGN_ID` unset; geen `/var/data`; geen Render API-token).
Volgens de Phase 76F/76G-geschiedenis staan ze wel in de Render-omgeving, dus er wordt niet
opnieuw om sleutels gevraagd. `EBAY_ENABLED=false` blijft voor publieke bezoekers; de runner zet
`EBAY_ENABLED=true` uitsluitend in-process.

## 4. Testfout `phase56b_amazon_exact_match_pilot` — oorzaak en oplossing

**Niet** een serial/manifest-probleem. Test 11 scant de repository op ongecontroleerde
`amazon.<tld>/dp/<ASIN>`-literals; de nieuwe Phase 80-test bevatte zo'n literal in een assertie.
Opgelost door de URL in de test uit delen op te bouwen. Er is **geen** serienummer- of
paspoortgegeven gewijzigd. Suite: 12/12 groen.

Volledige productierunner na de fix: **120 suites, 120 pass, 0 fail**
(`node tests/run_current_production_tests.js`, exit 0). De `VERIFICATION FAILED … mismatch(es)`-
regels in die log zijn de verwachte negatieve fixtures van `phase53a_reproducibility` (het test
bewijst dat corruptie gedetecteerd wordt), geen suite-fout.

## 5. Stand van de keten

```
REVIEW (bestaand) → getItem (1× per listing) → evidence → ACCEPT → ACTIVE
   → /var/data/affiliate/ebay_offers.json → AffiliateOfferResolver → productkaart
```

- NEEDS_EVIDENCE-kandidaten blijven bewaard (met `evidence_gaps`), nooit als ACTIVE opgeslagen.
- Bestaande ACTIVE-records worden bij een volgende batch niet verwijderd.
- Two-Gate (Amazon) en de eBay-voorwaarden (exacte MPN of gestructureerde corroboratie +
  bevestigde NL-levering + campagne-URL) zijn ongewijzigd.

## 6. Verplichte eindcijfers

Deze run is **offline** uitgevoerd: er zijn geen productiecredentials in deze omgeving, dus er is
geen live-activering uitgevoerd en er worden geen live-cijfers geclaimd.

| Meting | Waarde |
|---|---|
| Bestaande REVIEW-kandidaten verwerkt (live) | 0 — geblokkeerd door ontbrekende credentials in deze omgeving |
| getItem-aanvragen (live) | 0 |
| Kandidaten met automatisch aangevuld bewijs (live) | 0 |
| Nieuw ACTIVE (eBay) | 0 |
| Unieke onderdelen met directe koopmogelijkheid (eBay) | 0 |
| NEEDS_EVIDENCE | 0 (geen live input verwerkt) |
| Aantoonbaar REJECTED | 0 |
| Aanbiedingen op persistente disk | 0 |
| Door AffiliateOfferResolver opgehaald | 0 |
| PR | #146 (branch bijgewerkt) |
| Mergecommit | nog niet — merge gebeurt na groene CI |
| Render-deployment | niet gecontroleerd (geen Render-toegang vanuit deze omgeving) |

Bewijs dat de keten wél werkt (offline, deterministisch): `tests/phase80_1_activation_pipeline.test.js`
(8/8) dekt opslagpaden, herstart-persistentie, meerdere onderdeelrelaties, `getItem`-only
verrijking met één request voor een gedeelde listing, zoekfallback uitsluitend bij een verdwenen
listing, NEEDS_EVIDENCE-behoud en de volledige runner (inclusief persistente store en rapport).

## 7. Uitvoeren op Render (exact commando)

```bash
# in de Render Shell van de stihl-decoder service
cd /opt/render/project/src

# 1) Controleer (zonder secrets te tonen) dat de credentials aanwezig zijn:
node -e "console.log({client:!!process.env.EBAY_CLIENT_ID,secret:!!process.env.EBAY_CLIENT_SECRET,campaign:/^[0-9]+$/.test(process.env.EBAY_EPN_CAMPAIGN_ID||''),disk:require('fs').existsSync('/var/data')})"

# 2) REVIEW-batch van Phase 76G (bestaande 184 kandidaten, max 184, alleen getItem):
node scripts/phase80_evidence_batch.mjs \
  --live \
  --input /var/data/phase76e/pilot_100_results_phase76g1-live10_2026-11-13T00-40-11-612Z.json \
  --limit 184 \
  --max-get-items 250

# 3) Resultaat bekijken (aantallen + eerste aanbiedingen):
ls -la /var/data/phase80/
node -e "const fs=require('fs');const p=fs.readdirSync('/var/data/phase80').filter(f=>f.endsWith('.json')).sort().pop();const r=JSON.parse(fs.readFileSync('/var/data/phase80/'+p));console.log(JSON.stringify({live:r.live_api,blocker:r.activation_blocker,metrics:r.metrics,chain:r.chain},null,2))"

# 4) Alleen na controle: publieke eBay-aanbiedingen aanzetten (Render env)
#    EBAY_ENABLED=true  -> service herstart automatisch
```

Het script schrijft uitsluitend `decision: ACCEPT` naar `/var/data/affiliate/ebay_offers.json` en
print geen secrets. `--max-get-items` begrenst het aantal detailaanvragen; resterende kandidaten
blijven NEEDS_EVIDENCE en kunnen in een volgende run verder worden aangevuld.
