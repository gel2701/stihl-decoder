# Phase 94 — Evidence Recovery & Model Coverage Report

- Generated at: 2026-11-19T02:03:24.423Z
- Canonical models evaluated: 507
- GSC limitation: Live GSC API credentials not configured locally; prioritized using stored `PHASE81_PRIORITY_MODELS.json` & `PHASE77D_GSC_INVENTORY.json`.
- eBay status: Local `data/affiliate/ebay_offers.json` preserves all **1,773** canonical ACTIVE offers (**220** parts). Live eBay Browse API credentials are missing locally and public `ebay.nl` returns HTTP 403; **586** `TITLE_ONLY_NEEDS_EVIDENCE` candidates remain preserved in backlog without unauthorized scraping.

## KPI Summary

| KPI | Before (Phase 93) | After (Phase 94) | Growth |
|---|---:|---:|---:|
| ACTIVE Amazon.nl | 1325 | 1362 | +37 |
| ACTIVE Amazon.de | 1398 | 1422 | +24 |
| ACTIVE Amazon Total | 2723 | 2784 | +61 |
| Unieke onderdelen direct koopbaar (Amazon) | 1691 | 1743 | +52 |
| Totaal unieke koopbare onderdelen (Amazon + eBay) | 1802 | 1854 | +52 |
| Modellen met koopdekking (non-GHS / incl. GHS, van 507) | 365 / 430 | 365 / 430 | +0 / +0 |
| Modellen met >= 6 directe onderdelen | 317 | 317 | +0 |
| Verrijkte NEEDS_EVIDENCE-dossiers | - | 490 | - |
| NEEDS_EVIDENCE -> ACTIVE geactiveerd | - | 0 | - |

All 2723 baseline ACTIVE offers, 34 SUSPENDED records, 3 VERIFIED fixtures, and 19 RESEARCH_REQUIRED records remain preserved with zero consistency violations.
