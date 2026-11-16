# Phase 87.2 — Amazon Maximum Activation Report

Datum: 2026-11-16
Branch: `feat/phase87.2-amazon-maximum-activation` (vanaf `main` `2016ec5`, Phase 87.1)

## 1. Overzicht & Resultaat binnen bestaande limieten

- **Nieuw ACTIVE Amazon.nl:** **16** (`84 → 100`, 100/100 slots gevuld)
- **Nieuw ACTIVE Amazon.de:** **4** (`46 → 50`, 50/50 slots gevuld, alle 4 met bevestigde NL-verzending)
- **Totaal ACTIVE Amazon:** **150** (`130 → 150`, geen enkele bestaande aanbieding verloren)
- **Extra unieke onderdelen met directe Amazon-kooplink:** **+20** (`117 → 137`)
- **Onderzochte catalogusonderdelen:** **529** op Amazon.nl (29 openstaande `RESEARCH_REQUIRED` + 500 nieuwe GSC-prioriteitsonderdelen) + **250** op Amazon.de
- **Unieke ASIN's gezien in zoekresultaten:** **2.367**
- **Gerenderde productpagina-controles (`/dp/`):** **232** unieke ASIN's (`160` Amazon.nl + `100` Amazon.de)
- **Naar Nederland leverbare Duitse `/dp/`-aanbiedingen:** **96**
- **Dealercatalogus-checks (Garden Hire Spares):** **316** onderdelen (`22` met exacte nummertreffer)
- **Automatisch aangevuld bewijs:** **20** geactiveerde records voorzien van live `/dp/`-productidentiteit + NL-leveringscontrole (waarvan `9` originele STIHL OEM-vermeldingen en `1` met onafhankelijke dealercatalogus-corroboratie) plus **12** volledig geverifieerde reserve-kandidaten boven de cap (`ready_above_cap`)
- **Resterende `NEEDS_EVIDENCE` (`RESEARCH_REQUIRED` + `VERIFIED`):** **29** `RESEARCH_REQUIRED` + **3** `VERIFIED` DE (plus **10** gedocumenteerde afgewezen / multi-pack / niet-leverbaar gevallen in `PHASE87_2_ACTIVATION.json`)
- **Behouden bestaande ACTIVE-aanbiedingen:** **130 / 130** (`0` verloren)

## 2. Nieuwe geactiveerde aanbiedingen (20)

### Amazon.nl (16 nieuw ACTIVE)

| Onderdeel | ASIN | Merk | Classificatie | Beschrijving |
|---|---|---|---|---|
| `4147 710 8108` | `B08TRF8B6H` | Stihl | `GENUINE_STIHL` | Deflector 480 mm (FS 360 / FS 410 / FS 460 / FS 490) |
| `0000 930 2246` | `B01FW5336K` | Stihl | `GENUINE_STIHL` | Ronde maaidraad 2,4 mm × 253 m (vervangt `RESEARCH_REQUIRED` `B0014D86T0`) |
| `1125 640 1701` | `B007TK1BK2` | Stihl | `GENUINE_STIHL` | Kettingwielafdekking (MS 260 / MS 360 / MS 440) |
| `4140 400 1308` | `B007TK0L6W` | Stihl | `GENUINE_STIHL` | Ontstekingsmodule (FS 38 / FS 45 / FS 55 / HS 45) |
| `4140 190 0601` | `B08TRJRV2S` | Stihl | `GENUINE_STIHL` | Terugtrekveer (FS 38 / FS 45 / FS 55 / HL 45) |
| `4144 710 8117` | `B08TRJMVRK` | Stihl | `GENUINE_STIHL` | Deflector 420 mm (FS 55 / FS 70) |
| `4229 120 1800` | `B0GVRCPL89` | Qiuwanzia | `MANUFACTURER_AFTERMARKET` | Luchtfilter BG 45 / BG 55 / BG 85 (dealer-corroborated; vervangt `B079DNH51T`) |
| `4119 710 6000` | `B07HLM39J5` | Cancanle | `MANUFACTURER_AFTERMARKET` | Afsnijmes beschermkap FS 55 / FS 350 / FS 460 (vervangt `B017SBNY52`) |
| `4137 120 0636` | `B0HLBHL5DG` | C·T·S | `MANUFACTURER_AFTERMARKET` | Carburateur FS 75 / FS 80 / FS 85 (vervangt `B07V45X88Y`) |
| `1127 120 1621` | `B08K3LCV69` | ProPart | `MANUFACTURER_AFTERMARKET` | Vlies luchtfilter MS 290 / MS 310 / MS 390 (vervangt `B08K8Z994X`) |
| `1128 080 2104` | `B083NQJ7WW` | Wifehelper | `MANUFACTURER_AFTERMARKET` | Trekstarter compleet MS 440 / 044 / MS 460 |
| `1128 790 1750` | `B0749N79V2` | QHALEN | `MANUFACTURER_AFTERMARKET` | Handgreepbeugel MS 440 / 044 / MS 460 |
| `1128 160 2004` | `B0D2KM9XR6` | DLUPING | `MANUFACTURER_AFTERMARKET` | Koppeling compleet MS 440 / 044 / MS 460 / MS 461 |
| `1135 140 0650` | `B07YGQMS5W` | Hippotech | `MANUFACTURER_AFTERMARKET` | Uitlaatdemper MS 341 / MS 361 |
| `1128 020 1250` | `B09TQYZCWF` | GardenPal | `MANUFACTURER_AFTERMARKET` | Cilinder- en zuigerset MS 461 |
| `1123 791 1702` | `B0CXHYGL8W` | perfektGarten | `MANUFACTURER_AFTERMARKET` | Handgreepbeugel MS 210 / MS 230 / MS 250 |

### Amazon.de (4 nieuw ACTIVE — alle 4 NL-leverbaar bevestigd)

| Onderdeel | ASIN | Merk | Classificatie | Beschrijving |
|---|---|---|---|---|
| `3610 000 0055` | `B004U7B83M` | Stihl | `GENUINE_STIHL` | Zaagketting 40 cm 3/8" P 1,1 mm 55 TG (`B013KONKZY` blijft `VERIFIED`) |
| `1123 120 1612` | `B007TK18ZU` | Stihl | `GENUINE_STIHL` | Origineel luchtfilter MS 210 / MS 230 / MS 250 |
| `1122 190 3400` | `B006VYS29A` | Stihl | `GENUINE_STIHL` | OEM ElastoStart greep MS 460 / MS 650 / MS 660 / MS 661 |
| `1121 640 3203` | `B098BFMP68` | C·T·S | `MANUFACTURER_AFTERMARKET` | Verstelbare oliepomp MS 240 / MS 260 |

## 3. Extra dekking GSC-prioriteitsmodellen

Gemeten unieke direct koopbare onderdelen binnen de GSC-prioriteitsmodellen: **`87 → 102` (`+15`)**:
- **MS 440**: `15 → 19` (`+4`)
- **FS 460**: `9 → 11` (`+2`)
- **FS 55**: `12 → 16` (`+4`)
- **MS 260**: `14 → 16` (`+2`)
- **MS 461**: `12 → 14` (`+2`)
- **FS 85**: `12 → 14` (`+2`)
- **MS 250**: `23 → 24` (`+1`)
- **MS 361**: `15 → 16` (`+1`)
- **MS 661**: `8 → 9` (`+1`)
- **FS 350**: `5 → 6` (`+1`)
- **HS 45**: `7 → 8` (`+1`)
