# Phase 77C — Research cleanup & section evidence

Datum: 2026-11-12T21:32:25.102Z
Read-only. Geen productiecode, geen databasewijziging, geen afbeelding in de repository, geen publieke viewer.

## 1. PR-conflicten opgelost

PR #140 was gebaseerd op een oude main (`060ba0a`), waardoor de paspoort-, homepage-, CSS- en
testwijzigingen uit de tussentijdse main-merge in de PR-diff verschenen. Deze branch
(`research/phase77c-section-evidence`) is vanaf de **actuele main** gemaakt en bevat uitsluitend
researchbestanden: `output/phase77a/`, `output/phase77b/`, `output/phase77c/` en de drie
inventarisatiescripts. Er is geen regel productiecode overgenomen.

## 2. Exacte onderzoeksbestanden

| Pad | Type |
| --- | --- |
| output/phase77a/PHASE77A_DIAGRAM_INVENTORY.json | metadata-inventarisatie |
| output/phase77a/PHASE77A_MODEL_MATCHES.json | koppelingen |
| output/phase77a/PHASE77A_RIGHTS_AUDIT.json | rechten |
| output/phase77a/PHASE77A_REPORT.md | rapport |
| output/phase77b/PHASE77B_VISUAL_SAMPLE.json | steekproef 30 URLs |
| output/phase77b/PHASE77B_VISUAL_SAMPLE_PILOTS.json | steekproef 61 proef-URLs |
| output/phase77b/PHASE77B_SOURCE_INVENTORY.json | broninventarisatie |
| output/phase77b/PHASE77B_DATABASE_MATCH.json | koppeling na verificatie |
| output/phase77b/PHASE77B_UNRESOLVED_ANALYSIS.json | 94%-analyse |
| output/phase77b/PHASE77B_PUBLICATION_READINESS.json | publicatievereisten |
| output/phase77b/PHASE77B_REPORT.md | rapport |
| output/phase77c/PHASE77C_NUMBER_AUDIT.json | getalcontrole |
| output/phase77c/PHASE77C_SECTION_CANDIDATES.json | kandidatenpreview |
| output/phase77c/PHASE77C_SECTION_CANDIDATES.csv | compacte reviewlijst |
| output/phase77c/PHASE77C_ARCHIVE_RUNBOOK.md | Windows-uitvoering |
| scripts/phase77a_inventory_diagrams.mjs | script |
| scripts/phase77b_sample_source_images.mjs | script |
| scripts/phase77b_source_gap_analysis.mjs | script |
| scripts/phase77c_section_evidence.mjs | script |

## 3. Bevestigde en geschatte tekeningen

| Claim | Gerapporteerd | Herberekend | Niveau | Oordeel |
| --- | --- | --- | --- | --- |
| 2,376 unique GHS diagram URLs | 2376 | 2376 | metadata | CONFIRMED |
| 42 of 61 pilot URLs are placeholders | 42/61 | 42/61 | individually_verified | CONFIRMED |
| 1,993 potentially linkable fitments | 1993 | 1993 | metadata (ungated upper bound) | CONFIRMED_AS_UPPER_BOUND |
| 775 involved parts | 775 | 775 | metadata (ungated upper bound) | CONFIRMED_AS_UPPER_BOUND |
| 223 involved models | 223 | 223 | metadata (ungated upper bound) | CONFIRMED_AS_UPPER_BOUND |

- Individueel geverifieerd: 19 unieke echte afbeeldingen in 61 proef-URL's, waarvan 2 visueel geïnspecteerd (700x700, STIHL-exploded views).
- Steekproefschatting: ~1109 van 2376 URL's zijn echt (14/30 in de willekeurige steekproef).
- 42 van 61 proef-URL's zijn placeholders (68.85%).

## 4. Veilige sectiekandidaten

- Ongated potentieel (77B): 1993 fitments / 775 onderdelen / 223 modellen — **bovengrens**.
- Na de vijf poorten: **214 kandidaten**, **258 fitments**, **72 onderdelen**, **8 modellen**.
- Alle kandidaten hebben status `DERIVED_FROM_SECTION_EVIDENCE`, `preview_only: true`, `applied_to_database: false`.
- Dekking: 2.79% → **3.18%** (512 → 584 onderdelen).

## 5. Ambigue en afgekeurde koppelingen

| Reden | Aantal paren |
| --- | --- |
| ONLY_CATCH_ALL_SECTION_MODEL_PARTS_BREAKDOWN | 1108 |

- Totaal afgekeurd: **1108** van 1322 paren. De details staan per paar in `PHASE77C_SECTION_CANDIDATES.json` (`rejections`).
- 0 paren zijn afgekeurd omdat de machinevarianten elkaar uitsluiten; die worden **niet** willekeurig aan één sectie toegewezen.
- 0 paren verwijzen naar meerdere GHS-secties en zijn daarom afgekeurd.

## 6. Controles

Zie `PHASE77C_REGRESSION_CHECKS.json` voor de invariantcontroles (99 actieve aanbiedingen, resolver,
koopknoppen, paspoort, decoder, bewijsdata, sitemap).

## 7. Rechten en archieven

- Alle GHS-/STIHL-tekeningen blijven `REFERENCE_ONLY`; geen hotlinks, geen viewer, geen reproductie.
- De vier Windows-archieven zijn niet bereikbaar; `PHASE77C_ARCHIVE_RUNBOOK.md` bevat de exacte
  configuratie en commando's om ze op de host te inventariseren. Er is niets gesimuleerd.
