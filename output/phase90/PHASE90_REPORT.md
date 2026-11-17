# Phase 90 — Amazon Growth & Conversion Optimization Report

Datum: 2026-11-17
Branch: `feat/phase90-amazon-growth-optimization`

## 1. Kernresultaten

| Metriek | Voor (Phase 89) | Na (Phase 90) | Nieuw / Delta |
|---|---:|---:|---:|
| Amazon.nl ACTIVE | 814 | **1098** | **+284** |
| Amazon.de ACTIVE | 764 | **1098** | **+334** |
| Totaal ACTIVE Amazon | 1578 | **2196** | **+618** |
| Unieke onderdelen met directe kooplink | 1030 | **1351** | **+321** |
| GSC-prioriteitsdekking (unieke onderdelen) | 594 | **667** | **+73** |
| Bestaande ACTIVE behouden | 1578 | **1578** | 0 verloren |
| Historische SUSPENDED behouden | 34 | **34** | Intact |

## 2. Onderzoeks- & Bewijsvolume

- **Onderzochte nieuwe onderdelen (queue P1–P5):** **2100** onderdelen in 15 batches van 140 (+ **378** onderdelen uit bestaand Phase 87–89 bewijs -> **153** nieuw geactiveerd in `batch_0`).
- **Onderzochte ASIN's (live `/dp/` + NL-verzendcheck):** **2913** (**1218** NL + **1695** DE); **2009** NL + **2078** DE zoekrondes.
- **Taxonomie nieuwe activaties:** **56** `GENUINE_STIHL`, **0** `OEM_SUPPLIER_EQUIVALENT`, **562** `MANUFACTURER_AFTERMARKET` (203 unieke merken, `0` ASIN-SKU-conflicten).
- **Duitse aanbiedingen met bewezen NL-levering:** **1098** (alle `ACTIVE` Amazon.de-aanbiedingen dragen `SHIPS_TO_NL_CONFIRMED`).
- **Resterende NEEDS_EVIDENCE:** **22** in registry (`19` `RESEARCH_REQUIRED` + `3` `VERIFIED`), plus **108** nieuw gelogde `NEEDS_EVIDENCE`-gevallen uit batches 0–15.
- **Afgewezen kandidaten (REJECTED):** **6846** in batches 0–15 (waarvan ontbrekend onderdeelnummer, misfit op type/multipack, slecht/leeg merk, ASIN-conflict of Two-Gate-afwijzing).
- **Reconciliatie alle 16 batches (`batch_0` t/m `batch_15`):** **16/16** compleet, **0** duplicaten op `(part_number, marketplace, asin)`, **2** extra aanbiedingen hersteld uit opgeslagen bewijs.

## 3. Conversie-, Label- & Telemetrieoptimalisaties (Sectie 7)

- **Aanbiedingsvolgorde:** leverbare aanbiedingen eerst (`isOfferDeliverable`), vervolgens `GENUINE_STIHL` -> `OEM_SUPPLIER_EQUIVALENT` -> `MANUFACTURER_AFTERMARKET`, gevolgd door `amazon.nl` -> `amazon.de` -> `ebay.*`.
- **Duidelijke NL/DE/eBay-labels:** onjuiste `Sägenspezi`-fallback op niet-Sägenspezi Amazon.de-kaarten verwijderd; behoud van bestaande `Koop bij Amazon.nl/de`- en `Koop bij eBay.*`-contracten.
- **Affiliate kliktelemetrie (`offer_position`):** non-PII 1-gebaseerde `offer_position` (`1..50`) toegevoegd aan `data-offer-position` en `/api/affiliate/track` naast click-intent zonder aankopen/conversies uit SiteAssociates te verzinnen.

## 4. Extra GSC-dekking per prioriteitsmodel

| Model | Vóór | Na | Delta |
|---|---:|---:|---:|
| FS 55 | 63 | 74 | +11 |
| MS 260 | 78 | 88 | +10 |
| MS 250 | 95 | 104 | +9 |
| MS 230 | 98 | 107 | +9 |
| MS 661 | 48 | 56 | +8 |
| TS 420 | 25 | 32 | +7 |
| MS 361 | 86 | 92 | +6 |
| FS 80 | 76 | 81 | +5 |
| BR 600 | 36 | 40 | +4 |
| FS 350 | 43 | 47 | +4 |
| 046 | 101 | 105 | +4 |
| FS 100 | 47 | 51 | +4 |
| MS 460 / 046 Magnum | 98 | 102 | +4 |
| MS 390 | 88 | 91 | +3 |
| HS 45 | 37 | 40 | +3 |
| FS 85 | 73 | 76 | +3 |
| MS 310 | 93 | 96 | +3 |
| MS 362 | 72 | 75 | +3 |
| BG 86 | 44 | 46 | +2 |
| MS 461 | 91 | 93 | +2 |
| MS 180 | 87 | 89 | +2 |
| MS 441 | 62 | 64 | +2 |
| MS 440 | 103 | 104 | +1 |
| 044 | 110 | 111 | +1 |
