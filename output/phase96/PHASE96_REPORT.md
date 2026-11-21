# STIHLDecoder — Phase 96 Report: Dutch Parts Localization, Catalog Enrichment & Affiliate Growth

## 1. Nederlandse Onderdelenterminologie & Woordenlijst (`data/parts_glossary_nl.json`)
- **Centrale woordenlijst**: `data/parts_glossary_nl.json` (61+ canonieke termen met EN/DE/NL-zoekclusters en >300 technisch gecureerde termen in `phrase_map`).
- **Normalisatieregels (`src/parts/PartNameNormalizer.js`)**:
  - `part_name` (bron) blijft 100% ongewijzigd (`RAW_PART_NAMES_CHANGED = 0`).
  - `17.625 / 18.480` catalogusonderdelen zijn genormaliseerd naar consistente Nederlandse technische benamingen (o.a. `Carburateur`, `Ontstekingsspoel`, `Trekstarter`, `Koppelingstrommel`, `Krukas`, `Oliepomp`, `Brandstoffilter`, `Zuigerset`, `Luchtfilter`, `Vliegwiel`, `Wormwiel`, `Inlaatspruitstuk` / `Spruitstuk`, `Bougie`, `Starterklink`, `Kettingspanner`).
  - `244` corrupte bronnamen (`U+FFFD`) blijven fail-closed (`Onderdeel <nummer>`) zonder karaktergokken (`GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS = 0`).
  - Idempotentie gecontroleerd op alle `18.480` onderdelen: `0` afwijkingen (`non_idempotent_count = 0`).
- **SEO & UI Consistentie**:
  - `643` Engelstalige/onbewerkte `clean_name`-titels in `data/seo/part_indexation_*.json` (`56a`, `wave2`, `wave3`, `wave4`) zijn gestandaardiseerd naar Nederlands (`843` indexeerbare onderdeelpagina's).
  - `IntelligentPartsSearchEngine.js`, `ModelPartsPageTemplate.js` (`wearRules`), `PartsDiscoveryPageTemplate.js`, en `PartCatalogResolver.js` gebruiken consistente Nederlandse benamingen zonder dat externe Amazon/eBay-listingtitels de canonieke benaming overschrijven.

## 2. Meertalige Zoekpariteit (NL / EN / DE)
- `PartCatalogResolver.searchParts` en `MULTILINGUAL_TECHNICAL_SYNONYMS` zijn gekoppeld aan de centrale woordenlijst en zoeken tegelijk over rauwe (`EN`/`DE`) en genormaliseerde (`NL`) onderdeelbenamingen.
- Geverifieerde pariteit (`15 / 15` triplet-checks identiek tussen NL, EN en DE), waaronder o.a. `carburateur`/`carburetor`/`vergaser`, `ontstekingsspoel`/`ignition coil`/`zündspule`, `trekstarter`/`recoil starter`/`anwerfer`, `koppelingstrommel`/`clutch drum`/`kupplungstrommel`, `inlaatspruitstuk`/`intake manifold`/`ansaugstutzen`, `wormwiel`/`worm gear`/`schnecke`, `starterklink`/`starter pawl`/`sperrklinke`, `kettingspanner`/`chain tensioner`/`kettenspanner`.

## 3. Catalogusverrijking (`data/parts_fitments_phase96.json` & `data/fitment_model_index.json`)
- Audit van alle `41` canonieke modellen zonder directe `model_part_fitments`-regels (`output/phase96/PHASE96_CATALOG_ENRICHMENT.json`):
  - **17 `OFFICIAL_DOCUMENTED`**: aantoonbaar verrijkt vanuit exacte gedocumenteerde sub-IPL ID's (`bga_30_0`, `hsa_100_0`/`_1`, `fsa_30_0`) en exacte `variant_key`-koppelingen (`MS 201 TC-M`, `MS 200 T`, `MS 261 C-M`, `MS 251 C`, `FS 55 R`, `MSA 60 C-B`, `MSA 70 C-B`, `MSA 160 C-B`, `MSA 200 C-B`, `MSA 220 C-B`, `MSA 190 T`, `MSE 170 C-BQ`, `MSE 141 C-Q`, `HS 82 R`).
  - **5 `SECONDARY_EVIDENCED`**: aantoonbaar gekoppeld op basis van expliciete modelvermelding in `data/parts_catalog.json` (`FSA 50`, `BGE 60`, `BGE 61`, `050`, `MS 500`), streng gefilterd (zonder `.050"` zaagbladgroef-verwisseling).
  - **19 `NEEDS_EVIDENCE`**: transparant geclassificeerd zonder offline gedocumenteerde fitments (`0` gegokte compatibiliteit).
- Daarnaast zijn `22` dunne modellen (waaronder `MS 362 C-M`) verrijkt uit exacte archiefbronnen (**2.033** additieve geverifieerde fitments in `data/parts_fitments_phase96.json`).

## 4. Affiliate Groei & Conservatie (`output/phase96/PHASE96_ACTIVATION.json`)
- **Amazon ACTIVE**: `3.056` → **`3.072`** (`+16`: `1.442` NL / `1.630` DE; `5 Teile/los`-multipack geweerd en uitgesloten via aanscherping in `phase96_worker.mjs`).
- **Unieke Amazon-onderdelen**: `1.895` → **`1.911`** (`+16`).
- **Gecombineerde unieke onderdelen (Amazon + eBay)**: `1.998` → **`2.014`** (`+16`).
- **eBay ACTIVE**: alle **`1.773`** bestaande aanbiedingen (`220` onderdelen) behouden (`0` nieuwe aanbiedingen i.v.m. ontbrekende OAuth-credentials `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` en publieke HTTP 403 op eBay).
- **Modeldekking met directe kooplinks (alle fitments incl. GHS/Phase 96)**: `440 / 507` → **`459 / 507`** (`+19` modellen; `366/507` non-GHS; `345` modellen met `>= 6` koopbare/gedocumenteerde onderdelen).
