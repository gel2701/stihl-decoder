# PHASE 56K — TARGETED EXTERNAL EVIDENCE ACQUISITION PILOT REPORT

## 1. Routing
- **9Router endpoint reachable (`http://127.0.0.1:20128/v1`)**: **JA** (`HTTP 200 OK` op `/v1/models`)
- **9Router gebruikt**: **NEE**
- **Methode**: Directe uitvoering via native workspace-tools en gerichte fetch scripts
- **Fallback reden**: De lokale 9Router HTTP-proxy (`http://127.0.0.1:20128/v1`) is bereikbaar, maar de Antigravity agent/subagent-runtime ondersteunt geen custom OpenAI base-URL routing en het starten van Codex CLI is conform prompt-instructies strikt verboden.

---

## 2. Baseline & Freeze Invariants
- **Repository**: `gel2701/stihl-decoder`
- **Baseline SHA**: `6cb400b53719142aae371cf51c50da9dda5dccf4` (`HEAD == origin/main` geverifieerd)
- **Canonieke Database Invarianten (100% Intact)**:
  - `parts`: **17.082**
  - `model_part_fitments`: **175.106**
  - `parts_model_configurations`: **766**
  - `part_fitment_evidence`: **208.412**
  - `model_part_fitment_section_contexts`: **814**
  - Phase 56H resoluties intact: **344 / 344**
  - Phase 56J classificaties intact: **110 / 110**
- **SEO & Affiliate Freeze**:
  - Indexeerbare onderdeelpagina's: **843**
  - Sitemap URLs: **1.024**
  - Amazon Search Fallbacks: **17.082 / 17.082** (tag: `srihldecoder2-21`, Verified ASINs: **0**)
  - GSC Status: `NOT_CONFIGURED`

---

## 3. Pilot Cohort Selectie (40 Targets uit de 110 Phase 56J Targets)
Deterministisch geselecteerd op basis van:
1. Aanwezigheid van onopgeloste fitments op gepubliceerde modellen;
2. Aantal gepubliceerde modellen (`published_model_count` DESC — alle **35** multi-model targets met onopgeloste gepubliceerde fitments zijn opgenomen);
3. Dekking op prioritaire modellen (`BR 600`, `MS 261`, `BR 700`, `HS 45`, `MS 260`, `BG 86`, `MS 170`, `MS 180`, `SH 86`, `BR 800`, `FS 55`, `FS 85`, inclusief de top **5** `MS 261` single-model targets);
4. Huidige SEO-score DESC en `part_number` ASC.

---

## 4. Bronkwaliteit & Lineage Audit (12 Geauditeerde Domeinen)

| Domein | Bron-type | Lineage | Bruikbaar voor Evidence | Toelichting |
|---|---|---|---|---|
| `stihl.nl` | `OFFICIAL_STIHL` | `INDEPENDENT_SOURCE` | JA | Official STIHL manufacturer service kit compatibility pages; already ingested in canonical database for service kits. |
| `diyspareparts.com` | `INDEPENDENT_PARTS_CATALOG` | `SAME_SOURCE_LINEAGE` | JA | Already harvested in Phase 54F from identical underlying dataset; 403 on automated search queries. |
| `lsengineers.co.uk` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | UK technical parts specialist; returns HTTP 403 to programmatic fetch, no bypass attempted. |
| `ersatzteil-service.de` | `INDEPENDENT_PARTS_CATALOG` | `UNKNOWN_LINEAGE` | JA | German technical exploded-view parts catalog portal; no accessible public pages found without security bypass. |
| `motoruf.de` | `INDEPENDENT_PARTS_CATALOG` | `UNKNOWN_LINEAGE` | JA | European technical parts diagram portal; no accessible public pages found without security bypass. |
| `alldadelawnmowers.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | Outdoor power equipment dealer listing exact STIHL OEM part numbers and model fitments without diagram section breakdown. |
| `shop.johnsonshg.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | Hardware & garden retailer listing exact STIHL OEM part numbers and machine fitments without diagram section breakdown. |
| `mowpart.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | Commercial mower & outdoor power parts retailer listing OEM part numbers and models without diagram section headers. |
| `cutlers.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | Power equipment dealer confirming exact OEM STIHL part number and model fitments without exploded diagram section breakdown. |
| `americanforestry.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | JA | Forestry supply dealer listing OEM STIHL part numbers without model-specific diagram section tables. |
| `profarmparts.com` | `RETAILER_EXACT_TECHNICAL_REFERENCE` | `UNKNOWN_LINEAGE` | NEE | Agricultural parts supplier; returned HTTP 520 server error during pilot fetch. |
| `ebay.com` | `UNUSABLE` | `UNKNOWN_LINEAGE` | NEE | Excluded consumer marketplace listing; not a verifiable technical parts catalog or authorized manufacturer reference. |

---

## 5. Classificatie van de 40 Pilot Targets (Read-Only Dry Run)

| Classificatie | Aantal Targets (uit 40) | Verklaring |
|---|---|---|
| `EXTERNAL_SECOND_SECTION_SAFE` | **0** | Geen enkel target heeft een onafhankelijke tweede diagramsectie op exacte scope. |
| `PART_NUMBER_ONLY` | **3** | 3 targets (`42824001308`, `42417010700`, `41371801100`) hebben publiek opgehaalde dealer/retailer-productpagina's (`alldadelawnmowers.com`, `mowpart.com`, `shop.johnsonshg.com`, `cutlers.com`, `americanforestry.com`) die het onderdeelnummer en model specificeren, maar geen exploded diagramsectiekop bevatten. |
| `NOT_FOUND` | **37** | 37 targets: publieke zoekmachines/catalogi leveren anti-bot challenges (HTTP 202) of 0 publiek toegankelijke pagina's zonder login/CAPTCHA/paywall/bypass. Eerlijke Option 1 fallback toegepast zonder synthetische provenance. |
| `SAME_SECTION_ONLY` | **0** | 0 |
| `CROSS_SCOPE` | **0** | 0 |
| `AMBIGUOUS` | **0** | 0 |
| `MIRROR_ONLY` | **0** | 0 |
| `MODEL_ONLY` | **0** | 0 |
| **Totaal** | **40** | **Uitkomst: `ZERO_SAFE_EXTERNAL_SECOND_SECTIONS`** |

---

## 6. Provenance Integrity Audit & Discovery Leads (Phase 56K.1 / Phase 56K.2)
- **Provenance Integrity Status**: `PASS` (`FABRICATED_PROVENANCE_RECORDS = 0`, `SAVED_ARTIFACTS_MATCH_REGENERATED = true`).
- **Geverifieerde Observations**: Alle 6 observaties in `EXTERNAL_EVIDENCE_LEDGER.json` zijn 1:1 herleidbaar tot een `FETCHED` record in `fetch_ledger.json`.
- **Per-Page Retrieval Timestamps**: Iedere observatie heeft een unieke, live `retrieved_at` timestamp geregistreerd op het moment van HTTP response verwerking.
- **Body Hashes & Locators**: Alle observaties hebben geverifieerde 64-teken SHA-256 hashes (`source_body_sha256`) en inhoudelijk getoetste locators afgeleid van echte `text_extract` data.
- **Discovery Leads Isolatie**: 64 leads gecatalogiseerd in `DISCOVERY_LEADS.json` met `eligible_for_resolution = false`.

---

## 7. Strategische Conclusie & Wave 5 Preview
- **Waarom `EXTERNAL_SECOND_SECTION_SAFE = 0` technisch verklaarbaar en correct is**:
  - In tegenstelling tot generieke bevestigingshardware (schroeven, ringen, veren) die op 3 tot 6 verschillende diagrambladen van dezelfde machine terugkomen, hoort een specifiek slijtage-/serviceonderdeel (een uitlaat, cilinderkit, luchtfilterdeksel, handstarter, ontstekingsmodule of keerring) fysiek thuis in **één enkele functionele hoofdgroep**.
  - Er zijn geen legitieme tweede secties op exacte scope ontdekt op het publieke web zonder login, CAPTCHA of security bypass.
  - Conform opdracht geldt `ZERO_SAFE_EXTERNAL_SECOND_SECTIONS` als een volwaardige en veilige `PASS`-uitkomst.
- **Wave 5 Preview**:
  - Newly H3 eligible: **0**
  - Newly H1–H7 eligible: **0**
  - Wave 5 geactiveerd in Phase 56K: **NEE**
