# Phase 93 — Affiliate Recovery & Expansion Report

- Generated at: 2026-11-18T21:54:37.318Z
- Canonical models evaluated: 507
- GSC limitation: Live GSC credentials not configured locally; prioritized using stored GSC datasets (`PHASE81_PRIORITY_MODELS.json`, `PHASE77D_GSC_INVENTORY.json`) + all 507 models.
- eBay reconciliation: Local `data/affiliate/ebay_offers.json` reconciled from 0 -> **1773** canonical ACTIVE offers (**220** unique parts: 1146 EBAY_NL / 627 EBAY_DE) using `output/phase81..86/ebay_offers_phase8*.json`. Production persistent disk (`/var/data`) already holds the 1,773 offers. Live eBay Browse API credentials are missing locally and public `ebay.nl` returns HTTP 403; 586 `TITLE_ONLY_NEEDS_EVIDENCE` candidates remain in backlog.

## KPI Summary

| KPI | Before (Phase 92) | After (Phase 93) | Growth |
|---|---:|---:|---:|
| ACTIVE Amazon.nl | 1176 | 1325 | +149 |
| ACTIVE Amazon.de | 1252 | 1398 | +146 |
| ACTIVE Amazon Total | 2428 | 2723 | +295 |
| Unieke onderdelen direct koopbaar (Amazon) | 1486 | 1691 | +205 |
| Canonieke modellen gedekt (non-GHS / incl. GHS, van 507) | 365 / 422 | 365 / 430 | +0 / +8 |
| ACTIVE eBay (lokaal hersteld uit Phase 81–86) | 0 | 1773 | +1773 (220 delen) |
| Totaal unieke koopbare onderdelen (Amazon + eBay) | 1486 | 1802 | - |

## REJECTED Recovery Audit (2.689 afgewezen kandidaten)

- Aantoonbaar verkeerde productmatch (`WRONG_PRODUCT_MATCH`): 201
- Tegenstrijdig onderdeelnummer of producttype (`CONFLICTING_PART_OR_TYPE`): 1642
- Onjuiste bundel / verpakkingseenheid (`INVALID_BUNDLE_OR_UNIT`): 112
- Teruggebracht naar `NEEDS_EVIDENCE`: **734** (683 ontbrekend onafhankelijk bewijs, 47 tijdelijke fout, 4 marketplace/verzendbeperking)
- Live `/dp/` productverificaties in Phase 93: 863 NL / 911 DE (212 dealerchecks, 19 geactiveerd met `#productDetails` bewijsaanvulling)

All 2428 baseline ACTIVE offers, 34 historical SUSPENDED records, 3 protected VERIFIED fixtures, and 19 RESEARCH_REQUIRED records are 100% preserved with zero consistency violations.
