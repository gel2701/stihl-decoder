# PHASE 56J — HIGH-VALUE SINGLE-SECTION EVIDENCE RECOVERY REPORT

## 1. Routing
- **9Router gevonden in omgeving**: **JA**
  - Geïnstalleerd onder `C:\Users\GelliusSnippe\AppData\Roaming\npm\9router.ps1` (`9router.cmd`), configuratie in `C:\Users\GelliusSnippe\AppData\Roaming\9router`, actieve lokale server op `http://127.0.0.1:20128/v1` (geconfigureerd voor OpenAI Codex CLI en OpenCode).
- **9Router gebruikt**: **NEE**
- **Reden van fallback indien niet gebruikt**:
  - 9Router draait als een lokale OpenAI-compatibele HTTP proxy voor externe CLI-clients (zoals Codex CLI en OpenCode), maar is niet gekoppeld als een Antigravity MCP-server of native subagent-provider in deze sessie, en het aanroepen van Codex is expliciet uitgesloten (`Geen Codex-review uitvoeren of aanvragen`). Conform de instructies is zonder herinstallatie of ingrijpende omgevingswijziging teruggevallen op directe uitvoering.

---

## 2. Baseline Verification & Freeze Invariants
- **Repository**: `gel2701/stihl-decoder`
- **Baseline Commit**: `119853c6b13f10c8a816b0f0c747ef47909101da` (`HEAD == origin/main` verified)
- **Canonical Database Invariants (100% Frozen & Intact)**:
  - `parts`: **17,082**
  - `model_part_fitments`: **175,106**
  - `parts_model_configurations`: **766**
  - `part_fitment_evidence`: **208,412**
  - `model_part_fitment_section_contexts`: **814**
  - Published STIHL Models: **85**
- **SEO & Sitemap Freeze Verified (No Wave 5 Activation in Phase 56J)**:
  - Indexable Individual Part Pages: **843** (50 Pilot + 350 Wave 1 + 400 Wave 2 + 4 Wave 3 + 39 Wave 4)
  - Noindex Individual Part Pages: **16,239**
  - Total Sitemap URLs: **1,024**

---

## 3. Target Cohort Reconstruction (110 High-Value Single-Section Parts)
Uit `output/phase56i/WAVE5_PREFLIGHT.json` zijn exact de **110** `COMMERCIAL_HIGH` slijtage-/serviceonderdelen gereconstrueerd die reeds voldoen aan alle strenge kwaliteitscriteria behalve `H3` (ze hebben momenteel exact **1** bewezen diagramsectie op gepubliceerde modellen):
- **100% `COMMERCIAL_HIGH`**: **110 / 110**
- **Exact 1 resolved section op gepubliceerde modellen**: **110 / 110**
- **Meaningful diagram position (`H4`)**: **110 / 110**
- **Schone genormaliseerde technische naam (`H5`)**: **110 / 110**
- **Geen generieke bevestigingshardware (`H6`)**: **110 / 110**
- **Exacte match met de 25-delige steekproef in `WAVE5_PREFLIGHT.json`**: **JA (25 / 25 identiek)**

---

## 4. Repository-Wide Evidence Audit & Classification (Rules S1–S4)

Alle **110** targets zijn gecontroleerd tegen alle aanwezige bronnen in de repository (`model_part_fitments`, `part_fitment_evidence`, `model_part_fitment_section_contexts`, `data/parts_section_resolutions_56h.json`, `data/parts_section_enrichment.json`, `data/parts_conflicts.json`, `data/parts_technical_conflicts.json`, `data/part_fitment_scope_resolutions.json` en alle Phase 54F harvest-ledgers onder `data/harvest/phase54f/`).

| Classificatie | Aantal Targets | Toelichting |
|---|---|---|
| `SECOND_SECTION_SAFE` | **0** | Geen enkel target heeft een tweede onafhankelijke sectie die op exacte scope voor een gepubliceerd model bewezen is. |
| `MULTI_SECTION_SAFE` | **0** | Alle bestaande multi-sectie contexten (814 rijen) waren al geactiveerd in Phase 56H/56I. |
| `CROSS_SCOPE_BLOCKED` | **57** | Onderdelen met 1 resolved sectie op één scope (bijv. `base::base`) en onopgeloste fitments op andere variant-/configuratiescopes van hetzelfde model, of Phase 54F scope-geblokkeerde observaties (`95030030242`, `96400031195`). |
| `ONLY_SAME_SECTION_DUPLICATES` | **42** | Meerdere evidence-rijen (`sparepartsworld` + `diyspareparts` of meerdere fitments) bevestigen uitsluitend exact dezelfde enkele sectie. |
| `CONFLICTING_EVIDENCE` | **0** | 0 semantische sectieconflicten (1 onderdeel `11250201215` heeft 2 posities `["1", "2"]` binnen dezelfde sectie `Cylinder` op `ms_360`). |
| `INSUFFICIENT_EVIDENCE` | **11** | Slechts 1 resolved evidence-rij op 1 fitment; overige fitments hebben enkel `Unresolved Diagram Section` zonder aanvullende bron-attributie. |
| **Totaal** | **110** | **100% deterministisch geclassificeerd (0 guessed sections, 0 scope leakage)** |

### Deep-Dive op de enige 2 targets met een tweede sectiestring in ruwe repository-data
1. **`95030030242` (`Grooved Ball Bearing Din625-6201`)**:
   - Gepubliceerd model `fs_85` (`base::base`) heeft resolved sectie `A-Crankcase, Cylinder`.
   - Andere `fs_85` fitments (`r::loop_handle`, `t::split_drive_tube`) zijn `EXACT_CONFIGURATION` scopes met alleen `Unresolved Diagram Section` (cross-scope overdracht verboden).
   - Fitment op `fs_400` heeft sectiestring `"FS 400"` — `fs_400` is geen gepubliceerd model in `stihl_database.json` en `"FS 400"` is een modelnaam-fallback, geen technische diagramsectie.
   - Phase 54F observaties op `fs_55` en `hs_45` (`Crankcase - Cylinder`, `diyspareparts`) zijn in `staging_adjudication.json` geclassificeerd als `NEW_FITMENT_CANDIDATE` (`existing_fitments_count: 0`) en destijds afgewezen omdat single-source fitment-creatie zonder bestaande canonieke fitment verboden is.
2. **`96400031195` (`Oil Seal Din3760-Bs12X22X5`)**:
   - Gepubliceerd model `fs_85` (`base::base`) heeft resolved sectie `A-Crankcase, Cylinder`.
   - Fitment op `fs_400` heeft modelnaam-fallback `"FS 400"` (niet-gepubliceerd model).
   - Phase 54F observatie op `hs_81` (`Crankcase`, `source_scope: MODEL_LEVEL_ONLY`) is in `scope_resolution.json` geblokkeerd als `VARIANT_SCOPE_UNRESOLVED` over 4 `EXACT_VARIANT` fitments (`r`, `rc_e`, `t`, `tc_e`), en `hs_81` is bovendien geen gepubliceerd model.

---

## 5. Wave 5 Readiness Re-Evaluation (Read-Only)
- **Targets vóór Phase 56J met 1 sectie**: **110**
- **Targets ná Phase 56J met >= 2 bewezen secties**: **0**
- **Nieuw H3-eligible**: **0**
- **Nieuw volledig H1–H7 eligible (Wave 5-ready)**: **0**
- **Phase 56H resoluties behouden**: **344 / 344 (100%)**
- **Canoniek multi-sectie contexten behouden**: **814 / 814 (100%)**

---

## 6. Model Impact (Top 20 Modellen met High-Value Single-Section Targets)

| Rank | Model ID | Model Naam | Target Parts (uit 110) | Huidige Resolved Sections | Extra Sections in 56J | Resterend Single-Section |
|---|---|---|---|---|---|---|
| 1 | `br_600` | BR 600 | **21** | 11 | 0 | 21 |
| 2 | `ms_261` | MS 261 | **17** | 11 | 0 | 17 |
| 3 | `br_700` | BR 700 | **17** | 4 | 0 | 17 |
| 4 | `hs_45` | HS 45 | **16** | 9 | 0 | 16 |
| 5 | `ms_260` | MS 260 | **11** | 9 | 0 | 11 |
| 6 | `bg_86` | BG 86 | **7** | 12 | 0 | 7 |
| 7 | `ms_170` | MS 170 | **7** | 3 | 0 | 7 |
| 8 | `ms_180` | MS 180 | **6** | 6 | 0 | 6 |
| 9 | `sh_86` | SH 86 | **5** | 3 | 0 | 5 |
| 10 | `br_800` | BR 800 | **5** | 0 | 0 | 5 |
| 11 | `fs_55` | FS 55 | **4** | 18 | 0 | 4 |
| 12 | `fs_85` | FS 85 | **4** | 15 | 0 | 4 |
| 13 | `ms_230` | MS 230 | **4** | 6 | 0 | 4 |
| 14 | `fs_460` | FS 460 C-EM | **4** | 5 | 0 | 4 |
| 15 | `ms_460` | MS 460 / 046 Magnum | **4** | 5 | 0 | 4 |
| 16 | `ms_280` | MS 280 | **4** | 4 | 0 | 4 |
| 17 | `fr_410` | FR 410 | **4** | 0 | 0 | 4 |
| 18 | `fs_80` | FS 80 | **4** | 0 | 0 | 4 |
| 19 | `ms_210` | MS 210 | **3** | 6 | 0 | 3 |
| 20 | `ms_250` | MS 250 | **3** | 6 | 0 | 3 |

---

## 7. Onderdeelcategorie-analyse (110 High-Value Targets)

| Categorie | Targets | 2e Sectie Bewezen (56J) | Wave 5-Ready | Resterend Geblokkeerd | Dominante Blocker |
|---|---|---|---|---|---|
| `cilinder & zuiger` | **24** | 0 | 0 | 24 | CROSS_SCOPE_BLOCKED (12/24) |
| `carburateurdelen` | **19** | 0 | 0 | 19 | ONLY_SAME_SECTION_DUPLICATES (9/19) |
| `starterdelen` | **10** | 0 | 0 | 10 | CROSS_SCOPE_BLOCKED (5/10) |
| `koppelingen` | **2** | 0 | 0 | 2 | CROSS_SCOPE_BLOCKED (2/2) |
| `brandstofcomponenten` | **1** | 0 | 0 | 1 | ONLY_SAME_SECTION_DUPLICATES (1/1) |
| `ontsteking` | **5** | 0 | 0 | 5 | CROSS_SCOPE_BLOCKED (3/5) |
| `uitlaten` | **11** | 0 | 0 | 11 | ONLY_SAME_SECTION_DUPLICATES (7/11) |
| `AV-elementen` | **0** | 0 | 0 | 0 | NONE_IN_COHORT |
| `oliepompen` | **1** | 0 | 0 | 1 | CROSS_SCOPE_BLOCKED (1/1) |
| `filters` | **10** | 0 | 0 | 10 | CROSS_SCOPE_BLOCKED (6/10) |
| `maaikopcomponenten` | **3** | 0 | 0 | 3 | CROSS_SCOPE_BLOCKED (1/3) |
| `lagers & keerringen` | **16** | 0 | 0 | 16 | CROSS_SCOPE_BLOCKED (12/16) |
| `rem & kettingspanner` | **1** | 0 | 0 | 1 | ONLY_SAME_SECTION_DUPLICATES (1/1) |
| `kettingwielen` | **7** | 0 | 0 | 7 | CROSS_SCOPE_BLOCKED (4/7) |
| `bougies` | **0** | 0 | 0 | 0 | NONE_IN_COHORT |

---

## 8. Interactive Diagram, GSC & Amazon Status
- **Interactive Diagram Prototype (Max 3 Modellen gehandhaafd)**:
  - `ms_261` (`Rewind Starter`: 18 hotspots), `ms_170` (`Muffler`: 4 hotspots), `fs_55` (`Air Filter - Fuel Tank`: 29 hotspots) blijven 100% intact met 0 gegokte coördinaten.
- **Google Search Console (`GSC_STATUS.json`)**:
  - Status: `NOT_CONFIGURED` (ontbrekende credentials: `GSC_ACCESS_TOKEN, GSC_SITE_URL`; fail-closed zonder gefabriceerde data).
- **Amazon Affiliate Funnel (`AMAZON_STATUS.json`)**:
  - Production Tag: `srihldecoder2-21`
  - Getagde Amazon Search Fallbacks: **17,082 / 17,082** (waaronder **110 / 110** targets: **54** Variant A / **56** Variant B; en **843 / 843** indexeerbare pagina's: **433** Variant A / **410** Variant B)
  - Verified ASINs: **0** (geen ongeverifieerde productclaims of prijzen).
