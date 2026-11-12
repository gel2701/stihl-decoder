# Phase 77B — Bronverificatie en catalogusgat-analyse

Datum: 2026-11-12T21:22:38.706Z
Read-only. Geen productiegegevens gewijzigd, geen publieke viewer, geen afbeelding in de repository.

## 0. Wat wel en niet kon

De vier originele Windows-archieven zijn vanuit deze Linux-checkout **niet bereikbaar** (geen `/mnt/c`,
geen Windows-pad). Ze zijn opnieuw geprobeerd en als afwezig geregistreerd. Wat wél kon: de volledige
metadata-laag analyseren, de bron-URL's **daadwerkelijk ophalen en visueel controleren**, en de koppeling
met onze database herberekenen. Draai `node scripts/phase77b_sample_source_images.mjs` en
`node scripts/phase77b_source_gap_analysis.mjs` op de host met de archieven voor het lokale deel.

## 1. Werkelijk gevonden tekeningen per bron

| Bron | Documenten | Diagram-URL's | Geverifieerd echt | Placeholders | Rechten |
| --- | --- | --- | --- | --- | --- |
| Garden Hire Spares STIHL IPL section pages (harvested metadata) | 3143 | 2376 | 19 unique in 61 pilot URLs / 14 in 30 random URLs | 68.85% | RIGHTS_UNKNOWN |
| Local STIHL archive library (batch2 + archive.org + forum metadata) | 2582 | 0 | not verifiable: files are absent from this checkout | — | RIGHTS_UNKNOWN |
| PDFs present in the repository | 3 | 0 | 0 — both extracted images are product photos (visually checked) | — | PUBLICATION_RESTRICTED |
| STIHL official Illustrated Parts Lists | 0 | 0 | 0 — no IPL artwork in the repository | — | PUBLICATION_RESTRICTED |

- Steekproef 30 willekeurige GHS-URL's: **30 opgehaald, 16 placeholder, 14 unieke echte tekeningen** (53.33% placeholder).
- Steekproef alle **61** GHS-URL's van de vijf proefmodellen: **42 placeholder, 19 echt** (68.85% placeholder).
- De placeholder is één identiek bestand van 1060768 bytes ("GHS — Image coming soon"), gevonden bij modellen als 012_aveq, ms_440_n, 045_av, 020_t.
- Visueel gecontroleerd: 2 echte tekeningen (026 chain brake, MS 261 oil pump/clutch) zijn echte STIHL-exploded views van **700x700** met zichtbare positienummers; de 2 afbeeldingen uit de lokale PDF's zijn **productfoto's** (MS 500i, USG), geen IPL's. De volledige steekproef bevat resoluties 700x554, 700x700, 560x560, 240x240, 1000x1000 — inclusief 240x240 thumbs, dus niet elke echte afbeelding is viewerwaardig.
- **Geschatte werkelijke tekeningen: ~1109 van 2376** URL's (op basis van de willekeurige steekproef).

## 2. Welke tekeningen ontbreken

- **42 van 61** proefmodel-URL's leveren geen tekening; per model: MS 170 1/14, MS 261 5/17, 026 / MS 260 13/32, FS 55 0/0, HS 81 0/0.
- **FS 55** heeft 3 secties maar 0 afbeeldingen; **HS 81** komt niet voor in de bron.
- De lokale archieven (2582 documenten, waarvan 421 parts lists) bevatten volgens hun registries de IPL-PDF's, maar de bestanden zijn hier afwezig; de page-index (6560 pagina's) bevat **geen onderdeelnummers** en grotendeels onbruikbare koppen (3073 bruikbaar).
- Er zijn **0** lokale tekeningbestanden en **0** vectorbronnen.

## 3. Hoeveel modellen volledig gekoppeld kunnen worden

- **0** modellen zijn volledig koppelbaar (alle gekoppelde secties met een geverifieerd echte tekening): geen.
- Op metadata-niveau zijn 73 modellen deels gekoppeld; 3 daarvan hebben minstens één geverifieerd echte tekening.
- De beperking is tweeledig: **beschikbaarheid** (placeholders) en **sectie-identiteit** in onze eigen catalogus.

## 4. Hoeveel positienummers overeenkomen

- Metadata-niveau (Phase 77A): **710** posities boven **512** onderdelen.
- Na verificatie: **132** posities en **112** onderdelen hangen aan een aantoonbaar echte tekening; 578 posities hangen aan een placeholder of niet-bemonsterde tekening.
- Positienummers staan **op de tekening** (zichtbaar bij visuele controle), maar wij hebben ze alleen als catalogusgetal zonder x/y-coördinaten. "Overeenkomen" betekent hier dus: hetzelfde positienummer binnen dezelfde sectie — niet een gematchte hotspot.

## 5. Hoeveel afbeeldingen technisch geschikt zijn voor een interactieve viewer

- **33** bemonsterde, echte afbeeldingen zijn bruikbaar als viewer-achtergrond; resolutie **700x554, 700x700, 560x560, 240x240, 1000x1000**, GHS-watermerk, zichtbare positienummers.
- Verdict: **SUITABLE_WITH_LIMITATIONS** — bruikbaar voor een referentieviewer, beperkt voor diepe zoom; hotspots vereisen een aparte coördinaten-mapping.
- **0** afbeeldingen zijn publiceerbaar (rechten).

## 6. Wat nodig is om rechtmatig te publiceren

| Vereiste |
| --- |
| Schriftelijke licentie/toestemming STIHL voor IPL-artwork |
| Vendor-/resellerovereenkomst die sublicensing van diagrammen toestaat (GHS-terms bevatten die niet) |
| Provenance per tekening: model, variant, revisie, bronpagina |
| First-party hosting met attributie/takedownbeleid — geen hotlinks |
| Juridische review van de viewer-interactie op andermans artwork |

## 7. Waarom 94% van de fitments general_unresolved is

| Bron | Fitments | Unresolved | % | Met configuratiekey | Modellen |
| --- | --- | --- | --- | --- | --- |
| sparepartsworld | 175054 | 170494 | 97.4 | 90171 | 901 |
| ghs | 6288 | 0 | 0 | 0 | 608 |
| official_stihl | 52 | 9 | 17.31 | 0 | 28 |

- **Hoofdoorzaak**: sparepartsworld levert 97.4% van alle fitments en publiceert geen diagramsectie. De configuratiekeys zijn machinevarianten (LOOP_HANDLE, RIDE_ON_MOWER_RT, ELECTRIC, D, GARDEN), geen secties.
- **Versterkend**: 81.565 fitments hebben zelfs geen configuratiekey; dat zijn modelbrede onderdelenlijsten.
- **Correct fail-closed**: de importeur verzint geen sectie. Er zijn 814 section-contextrijen en 0 scope-resoluties — er is dus geen verborgen voorraad "bijna opgeloste" secties.
- **Page-index**: 6560 pagina's, 3073 met bruikbare kop, 1397 met modelmetadata, 0 met onderdeelnummers.

## 8. Concrete verbeteringen, gerangschikt naar dekking

| # | Actie | Gemeten effect | Dekkingswinst | Inspanning | Risico |
| --- | --- | --- | --- | --- | --- |
| 1 | Treat missing artwork as a data quality problem: replace placeholder URLs per model before counting coverage | 42 of 61 pilot URLs are placeholders (68.85%); the real sheet count is ~1109 of 2376 | 0 onderdelen (kwaliteitscorrectie, geen dekkingwinst) | LOW | NONE (verification only) |
| 2 | Reuse resolved GHS section identity for sparepartsworld rows with the same model + part number | 1993 fitments, 775 parts, 223 models can move out of general_unresolved | 766 onderdelen (2.79% → 6.95%) | MEDIUM | MEDIUM — must be stored as DERIVED_FROM_SECTION_EVIDENCE, never as verified |
| 3 | Resolve section identity at the source: harvest GHS section pages including their position tables | Would bind every GHS section (2,376 URLs) to positions instead of the current 235 | niet te kwantificeren zonder nieuwe bron | HIGH | HIGH — new acquisition + rights still unresolved |
| 4 | Recover sections from the local archive PDFs (78 documents) once the files are available | 6560 indexed pages, but only 3073 have a usable heading and 1397 carry model metadata, and 0 carry part numbers | niet te kwantificeren zonder nieuwe bron | HIGH | MEDIUM — needs OCR plus the actual PDF files |

- Toegepast levert levers 1+2 een dekking van **2.79% → 6.95%** (512 → 1278 distincte onderdelen) — zonder één nieuwe download.
- Lever 2 moet als **DERIVED_FROM_SECTION_EVIDENCE** worden opgeslagen, nooit als VERIFIED; anders ontstaat precies de schijnzekerheid die de quality gate verbiedt.

## 9. Conclusie

1. De eerdere 2376 "tekeningen" zijn een **metadatabovengrens**; ongeveer **1109** zijn naar schatting echt, en voor de proefmodellen is 31.15% aantoonbaar echt.
2. De technische keten werkt, maar op veel kleinere schaal dan 77A suggereerde: **132** geverifieerde posities in plaats van 710.
3. Publicatie is en blijft geblokkeerd op rechten (0 afbeeldingen).
4. De grootste dekkingwinst zit niet in meer afbeeldingen maar in **sectie-identiteit**: 1993 fitments kunnen met bestaande evidence uit `general_unresolved` komen.
5. Voor het lokale deel (PDF's, Scribd, USA Parts) is de host met de archieven nodig; de scripts zijn daar klaar voor.
