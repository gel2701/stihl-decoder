# Phase 87.3 — Unlimited Amazon Affiliate Activation Report

Datum: 2026-11-16
Branch: `feat/phase87.3-unlimited-amazon-activation`

## 1. Overzicht & Verwijdering vaste activatielimieten

Vaste commerciële plafonds zijn uitgeschakeld (`MAX_PILOT_ACTIVE_OFFERS = null`, `max_active_offers_allowed = null`, `max_active_offers_per_marketplace = { "amazon.nl": null, "amazon.de": null }`), met volledig behoud van Two-Gate-verificatie, productidentiteit, NL-leveringsbewijs voor Amazon.de, kill-switches en historische `SUSPENDED` / `RESEARCH_REQUIRED` bewijsregistratie.

| Metric | Resultaat |
|---|---|
| ACTIVE Amazon.nl vóór → na | **100 → 216** (`+116`) |
| ACTIVE Amazon.de vóór → na | **50 → 128** (`+78`, alle met bevestigde NL-levering) |
| Totaal ACTIVE Amazon | **344** (`150 → 344`, **+194** nieuw geactiveerd) |
| Unieke onderdelen met directe kooplink vóór → na | **137 → 270** (**+133** nieuwe unieke onderdelen; daarnaast **61** cross-marketplace DE/NL-aanbiedingen) |
| Geactiveerde `ready_above_cap`-kandidaten | **12 / 12** (100%) |
| Nieuwe kandidaten met aangevuld / gecontroleerd bewijs | **640** live `/dp/`-productchecks (`432` NL + `208` DE), waaruit **194** Two-Gate-gevalideerde aanbiedingen geactiveerd (`6` historische `RESEARCH_REQUIRED`-onderdelen opgelost + `188` overige kandidaten uit Phase 87.1/87.2/87.3) |
| Bestaande ACTIVE behouden | **150 / 150** (`0` verloren) |
| Overgebleven NEEDS_EVIDENCE | **26** (`23` `RESEARCH_REQUIRED` + `3` `VERIFIED` DE) |
| Historische SUSPENDED behouden | **34** |

## 2. Geactiveerde `ready_above_cap`-kandidaten (12 / 12)

1. `4134 141 0300` — `B005HDPX02` (Rotary, `amazon.nl`)
2. `1118 190 0600` — `B00IMD4CYM` (Ratioparts, `amazon.de`)
3. `1121 030 0405` — `B07YGXG7J1` (Hippotech, `amazon.nl`)
4. `1123 080 2115` — `B0F23X6C8V` (VORIPO, `amazon.nl`)
5. `1128 020 1221` — `B0CNSGPZ2R` (Luxuypon, `amazon.nl`)
6. `1128 030 0406` — `B0H2J15NST` (PEGGYLIN, `amazon.nl`)
7. `1128 400 1214` — `B086H1W869` (HUYUR, `amazon.nl`)
8. `1128 640 3206` — `B0FQSTWS2Z` (YCSOZMM, `amazon.nl`)
9. `4137 120 0628` — `B0GBVVD67Y` (CCXOZSR, `amazon.nl`)
10. `4238 140 4401` — `B01K57TYPO` (ISE, `amazon.nl`)
11. `0000 930 2246` — `B007TJKHYE` (Stihl `GENUINE_STIHL`, `amazon.de`)
12. `4229 120 1800` — `B07CBNR4LL` (C·T·S, `amazon.de`)

## 3. Extra GSC-dekking per model

Unieke direct koopbare onderdelen binnen alle GSC-prioriteitsmodellen: **`109 → 227` (`+118`)**:

| Model | Vóór | Na | Delta |
|---|---|---|---|
| MS 250 | 24 | 47 | +23 |
| MS 230 | 24 | 46 | +22 |
| MS 260 | 16 | 37 | +21 |
| MS 170 | 19 | 37 | +18 |
| MS 361 | 16 | 33 | +17 |
| 044 | 20 | 36 | +16 |
| MS 440 | 19 | 34 | +15 |
| MS 180 | 23 | 38 | +15 |
| MS 661 | 9 | 23 | +14 |
| 046 | 17 | 31 | +14 |
| MS 461 | 14 | 27 | +13 |
| MS 460 / 046 Magnum | 16 | 28 | +12 |
| FS 85 | 14 | 25 | +11 |
| FS 80 | 14 | 25 | +11 |
| MS 441 | 9 | 20 | +11 |
| FS 55 | 16 | 26 | +10 |
| FS 350 | 6 | 16 | +10 |
| MS 362 | 11 | 21 | +10 |
| TS 420 | 2 | 8 | +6 |
| FS 100 | 5 | 12 | +7 |
| MS 390 | 14 | 19 | +5 |
| MS 310 | 18 | 23 | +5 |
| BR 600 | 2 | 6 | +4 |
| HS 45 | 8 | 12 | +4 |
