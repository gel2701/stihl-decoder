# Phase 80 — Affiliate Engine Recovery & Activation

Repository: `gel2701/stihl-decoder` · Branch: `freebuff/270a802ba68d0ac21adbb1ad`
Date: 2026-11-13

Scope: rebuild the eBay/Amazon activation chain on the existing code, fix the broken evidence
pass-through, add real `getItem` enrichment, and keep every existing Two-Gate safety condition.

---

## 1. Technisch gevonden (concrete defects in the existing chain)

| # | Defect | Impact | Fix |
|---|--------|--------|-----|
| 1 | `EbayHighVolumeEngine.buildOffer()` emitted only `affiliate_url`; `EbayAffiliateProvider` read only `itemAffiliateWebUrl` | Every ACCEPT offer was dropped by the public provider — the chain was dead even with credentials | Canonical offer now carries `affiliate_url` **and** `itemAffiliateWebUrl` + `item_url`; provider validates the same field it publishes |
| 2 | `EbaySyncEngine` pushed every client-passed NL-shipping item into `active_offers` without any decision | A REVIEW/title-only item could be treated as active (REVIEW-as-ACCEPT leak) | Each entry now carries `decision`/`status`/`match_type`; ACCEPT→`ACTIVE`, REVIEW→`NEEDS_EVIDENCE`, REJECT excluded |
| 3 | `EbaySyncEngine` hardcoded `marketplace: 'ebay.de'` | EBAY_NL items were published as ebay.de links | Marketplace derived from the response (`EBAY_NL`/`EBAY_DE`) |
| 4 | Browse client discarded `brand`, `manufacturer`, `gtin`, `localizedAspects`, `quantity`, `itemWebUrl` | Downstream matching had only title+MPN, so corroboration was impossible | All identity fields are parsed and passed through |
| 5 | `filter=deliveryCountry:NL` was sent but its successful result was never recorded; items without per-item `shippingOptions` stayed REVIEW forever | Most calculated-shipping items could never activate | `EbayShippingEvidence` records the applied filter (filter string, marketplace, HTTP status, timestamp) and reuses it as NL evidence |
| 6 | `X-EBAY-C-ENDUSERCTX` carried only `country%3DNL` | eBay omits `shippingOptions` for calculated-shipping items in countries that use postal codes (NL) — indistinguishable from "does not ship" | Optional `EBAY_CONTEXTUAL_ZIP` adds `%2Czip%3D<postcode>`; header encoding confirmed against the official Browse API docs |
| 7 | Shipping/identity validation duplicated in client *and* engine with slightly different regexes (bundle detection, part-number matching) | Two verdicts for the same item; divergence risk | One decision: `OfferEvidenceMatcher` (identity) + `EbayShippingEvidence` (NL delivery), used by client, engine, sync engine, store and provider |
| 8 | No `getItem` step | REVIEW candidates were a dead end: no MPN/aspects/shipping could ever be added | `EbayBrowseApiClient.getItem()` + engine enrichment loop (only for candidates whose blocker is missing evidence) |
| 9 | No shared evidence cache | Every batch would re-buy the same evidence | `EbayEvidenceRegistry` (persisted, 7-day freshness) + in-memory getItem cache; reuse is measured |
| 10 | No eBay offer store; the resolver only registered the provider with an empty `cachedOffers` | ACCEPT offers had no path to the product card | `EbayOfferStore` (canonical, fail-closed) + resolver loads it when `EBAY_ENABLED=true` |
| 11 | Public provider re-ran title/name matching on stored offers | A valid ACTIVE record could be dropped by a weaker check | Provider trusts stored `decision`/`status`/`match_type`; legacy records without a decision keep the historical strict checks |

Field inconsistencies repaired: `affiliate_url` / `itemAffiliateWebUrl` / `item_url`,
`marketplace` / `marketplaceId`, `part_number`, `decision`, `status`, `shipping_status`
(`SHIPS_TO_NL_CONFIRMED` / `SHIPPING_UNKNOWN` / `DOES_NOT_SHIP_TO_NL`).

Safety conditions unchanged: `TwoGateVerifier.js`, `AmazonProductionOfferContract.js`,
`AmazonExactMatchVerifier.js`, `HistoricalMismatches.js` and `VerifiedOfferRegistry` were not
modified. eBay activation still requires **exact MPN or structured corroboration**, **confirmed
NL delivery**, **campaign-bound affiliate URL** and **no contradictory evidence**. Amazon offers
are still governed by the existing ACTIVE registry and its runtime gates.

### External patterns used
- Official eBay Browse API docs (`developer.ebay.com`): `deliveryCountry` field filter,
  `X-EBAY-C-ENDUSERCTX` encoding (`country%3DNL`, `zip` required when the country uses postal
  codes), `getItem` for full item/product aspects and affiliate URL.
- `hendt/ebay-api` and `krisk/Fuse` (both MIT): only implementation *patterns* were applied
  (typed API client with per-item detail cache; threshold-based fuzzy scoring). No source code
  was copied and no dependency was added — a small deterministic token-overlap scorer is
  sufficient and avoids pulling a JS dependency into a Node server bundle.

## 2. Bewijs aangevuld (evidence completion, automatic)

Per candidate the engine now:
1. uses the `deliveryCountry:NL` result as recorded shipping evidence (only when the filter was
   actually applied and eBay answered 200);
2. asks `getItem` **only** when product identity, model corroboration or shipping proof is the
   blocker (never for contradictory matches, never for all search results);
3. merges MPN, GTIN, brand, aspects (`Herstellernummer`, `Modellkompatibilität`, …), shipping
   options and the affiliate URL, then re-adjudicates with the same canonical rules;
4. caches that evidence in `EbayEvidenceRegistry`, so a second batch reuses it instead of
   calling eBay again (measured: `getItem` called once for the same item; second batch reuses).

Match taxonomy (used for the decision, not as a label only):

| Match type | Status |
|---|---|
| `EXACT_MPN` | ACTIVE |
| `EXACT_PART_NUMBER_WITH_CORROBORATION` (title part number + aspect MPN or aspect model intersecting the STIHL catalog model relations) | ACTIVE |
| `VERIFIED_REPLACEMENT` (registered verified replacement) | ACTIVE |
| `TITLE_ONLY_NEEDS_EVIDENCE` | NEEDS_EVIDENCE (never published) |
| `CONTRADICTORY_MATCH` (no reference, or a conflicting part number) | REJECTED |

Fuzzy similarity is used only to rank candidates / name missing evidence. It can never produce
an ACTIVE status.

## 3. Klaar voor activering (code + chain, verified offline)

Verified by `tests/phase80_affiliate_activation.test.js` (12/12):
deliveryCountry evidence → ACCEPT; contradiction → REJECT; stale evidence → NEEDS_EVIDENCE;
filter-not-applied → not trusted; `getItem` enrichment (one call, then registry reuse);
full match taxonomy; fuzzy never approves; REVIEW cannot be stored or published as ACTIVE;
store → provider → resolver → direct link with `campid`; kill switch stops the provider;
existing Amazon ACTIVE offers still resolve to `DIRECT_ASIN`.

Publication chain exercised end-to-end (offline, deterministic):
`eBay item → matcher/shipping decision → ACTIVE record → EbayOfferStore → EbayAffiliateProvider
→ AffiliateOfferResolver → product-card offer descriptor`.

## 4. Daadwerkelijk ACTIVE

| Provider | ACTIVE before | ACTIVE after this phase | Notes |
|---|---|---|---|
| Amazon | 99 ACTIVE records / 86 unique parts (`data/affiliate/verified_amazon_registry.json`) | **99 unchanged** (86 parts resolve to `DIRECT_ASIN` when `AMAZON_DIRECT_ASIN_ENABLED=true`; 0 when the flag is off → search fallback) | Nothing removed or re-verified |
| eBay | 0 | **0** | No production credentials in this environment; no live activation was possible or claimed |

`data/affiliate/ebay_offers.json` is the new canonical store and currently contains **0 offers**.

## 5. Daadwerkelijk zichtbaar op de publieke website

- **eBay: 0.** `EBAY_ENABLED` is still `false` for visitors; the provider is not registered and the
  store is empty. This is intentional until the integration is verified against live API responses.
- **Amazon: unchanged** (existing disclosures, `sponsored nofollow noopener`, consent/click
  tracking untouched). Not visually inspected in a browser in this run.

## 6. Concreet ontbrekend bewijs dat verdere activering verhindert

1. **eBay production credentials** — `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
   `EBAY_EPN_CAMPAIGN_ID` (`5339245312`). Without them no Browse search and no `getItem` call can
   be made, so no candidate can gain evidence. This is the single hard blocker.
2. **`EBAY_CONTEXTUAL_ZIP`** (e.g. `1012AB`) — recommended so calculated-shipping listings return
   `shippingOptions` for NL in addition to the `deliveryCountry:NL` evidence.
3. **The Phase 76G REVIEW dataset (184 unique offers)** is not in this repository; it lived on the
   Render persistent disk (`/var/data/phase76e/pilot_100_state*.json`). The new batch runner
   consumes exactly that file — run it there (or copy the JSON into the repo) to re-adjudicate
   those candidates.
4. `EBAY_ENABLED=false` must stay until a live batch shows correct ACTIVE results.

## 7. Uitgevoerde controles

- `npm run test:gate` (Stage A consistency + Stage B quality gate): **pass**, 0 contradictions,
  0 GTIN failures, 0 unverified ACTIVE leaks.
- Full production runner `node tests/run_current_production_tests.js`: **119 suites, 118 pass,
  1 fail**. The failing suite is `tests/phase56b_amazon_exact_match_pilot.test.js` (serial-anchor
  manifest byte/SHA mismatches on committed `data/new_official_serial_anchors_only_2026-10-09.json`
  and `data/official_serial_anchors_batch_2026-10-09.json`). It **also fails with this phase's
  changes stashed**, so it is pre-existing and unrelated; serial/passport functionality was not
  touched (explicit Phase 80 constraint). CI will stay red until that serial artifact mismatch is
  repaired in a separate change.
- New/updated eBay suites added to the production runner (they were previously outside it):
  `phase71`, `phase76a` (browse + provider), `phase76c` (engine + live validation), `phase76e`,
  `phase76g`, `phase80`.
- `node scripts/phase80_evidence_batch.mjs --input output/phase56a/AMAZON_VERIFICATION_QUEUE.json
  --limit 100 --offline` → 100 parts scanned, `activation_blocker: EBAY_CREDENTIALS_MISSING`,
  0 fabricated activations. Report: `output/phase80/phase80_batch_offline_*.json`.

## 8. Reproduce a live batch (with credentials)

```bash
# 1) Phase 76G REVIEW batch re-adjudication (no new large-scale search):
node scripts/phase80_evidence_batch.mjs \
  --input output/phase76e/pilot_100_state.json --limit 100

# 2) GSC priority batch of 100 parts:
node scripts/phase80_evidence_batch.mjs \
  --input output/phase56a/AMAZON_VERIFICATION_QUEUE.json --limit 100

# 3) Inspect results, then (only when correct) activate publicly:
cat output/phase80/phase80_batch_live_*.json
```

The runner sets `EBAY_ENABLED=true` in-process only; the deployed environment stays
`EBAY_ENABLED=false` for visitors. Only `decision: ACCEPT` offers are written to
`data/affiliate/ebay_offers.json`; a later batch never deletes an untouched ACTIVE record.
