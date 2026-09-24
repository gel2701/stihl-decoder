# Root Cause Analysis & Architecture Remediation Report
**Betreft:** Oplossing van de officiële MY STIHL serienummer-contradictie (Serienummer `163118080`)
**Datum:** 22–23 september 2026
**Status:** Volledig opgelost en geverifieerd (100% test passing)

---

## 1. Executive Summary & Feitelijke Testcase

Tijdens een officiële productlookup via het MY STIHL platform (`app.stihl.com`) is een directe, onweerlegbare tegenstrijdigheid aan het licht gekomen tussen de historische serienummerranges van STIHL en de database-classificatie van de Stihldecoder:

- **Onderzocht serienummer:** `163118080`
- **Officiële MY STIHL identificatie:**
  - Productnaam: `MS 440-Z 3/8" RIM Magnum Motorsäge`
  - Productcategorie: `Motorsäge` / `Kettingzaag` (`productCategory.id: 2049`)
  - Aandrijving: `Benzine` (`productDriveType.name: Benzin`, `id: 2000`)
- **Vorige Stihldecoder classificatie:**
  - Geclassificeerd als: `STIHL MS 260 Reeks (Laat)`
  - Status: `PROBABLE_MODEL_SERIES`
  - Bron: Historische range `160000000–169999999` (`range_1121_ms260_late`)

### De Conclusie:
Een 9-cijferig serienummer binnen het blok `160000000–169999999` (fabriek 1 Waiblingen, circa 2002–2011) werd in de oude architectuur monolitisch en exclusief toegewezen aan één enkel model (`MS 260`). In werkelijkheid produceerde STIHL in dezelfde periode in Fabriek 1 ook andere modellen — zoals de **MS 440 Magnum** — binnen ditzelfde numerieke fabrieksblok.

---

## 2. Fase 1: Root Cause Analysis

Een trace van de beslissingsboom via `src/decoder.js` en `src/StihlRangeResolver.js` bracht de exacte oorzaken aan het licht:

1. **Monolitische toewijzing in `StihlRangeResolver.resolve`:**
   - In `StihlRangeResolver.js` werd `range_1121_ms260_late` gedefinieerd met `model_id: "stihl_ms_260"`, `range_display_name: "MS 260"`, en `range_semantic_level: "PROBABLE_MODEL_SERIES_RANGE"`.
   - In `Case 1 (matches.length === 1)` projecteerde de resolver automatisch:
     ```javascript
     model_id: match.model_id,
     model_name: match.model_name,
     range_display_name: match.range_display_name,
     candidate_model_ids: match.candidate_model_ids || [match.model_id]
     ```
   - Omdat er slechts één range gematcht werd voor `163118080`, werd het resultaat geforceerd naar `model_id: "stihl_ms_260"`.

2. **Automatische promotie in `src/decoder.js`:**
   - `analyzeSerialNumber` nam `rangeMatch.range_display_name` over als `rawProbableSeries = "MS 260"`.
   - `rawIdentityStatus` werd `PROBABLE_MODEL_SERIES`.
   - `modelName` werd `"MS 260"`.
   - `rangeDirectModel` kende de categorie `"Kettingzaag"` toe op basis van `stihl_ms_260`.
   - Dit resulteerde in een harde projectie van MS 260 voor een machine die aantoonbaar een MS 440 Magnum is.

3. **Ontbreken van een officiële lookup-laag:**
   - De decoder beschikte uitsluitend over fabriekscodes en historische bereiken. Er was geen voorrangsmechanisme voor empirisch bevestigde, officiële fabrieksregistraties per individueel serienummer.

---

## 3. Fase 2 & 3: Architectuur van de Officiële Anchor-laag & Prioriteitsmatrix

Om officiële fabrieksgegevens van STIHL leidend te maken zónder credential-lekkage of ongefundeerde aannames voor andere serienummers, is een nieuwe anchor-laag geïmplementeerd.

### Resolutievolgorde (Prioriteitsmatrix):
1. **Prioriteit 1: `OFFICIAL_STIHL_LOOKUP` (Officieel Serienummer-anker)**
   - Wordt als allereerste geëvalueerd in `analyzeSerialNumber`.
   - Indien aanwezig:
     - `identityStatus`: `"EXACT_MODEL_IDENTIFIED"`
     - `identitySource`: `"OFFICIAL_STIHL_LOOKUP"`
     - `modelIdentityStatus`: `"EXACT_MODEL_IDENTIFIED"`
     - `modelIdentitySource`: `"OFFICIAL_STIHL_LOOKUP"`
     - `exactModel`: `"MS 440-Z 3/8\" RIM Magnum Motorsäge"`
     - `model`: `"MS 440-Z 3/8\" RIM Magnum Motorsäge"`
     - `resolvedModel`: `"MS 440-Z 3/8\" RIM Magnum Motorsäge"`
     - `probableModelSeries`: `null` (**Nooit MS 260!**)
     - `identityLabel`: `"Door STIHL geïdentificeerd model"`
     - `modelAssistAvailable`: `false`
     - `modelAssist.candidates`: `[]`
2. **Prioriteit 2: `USER_CONFIRMED_MODEL` (Expliciete gebruikersbevestiging)**
   - Gebruiker selecteert expliciet een model vanaf het typeplaatje.
3. **Prioriteit 3: `SERIAL_RANGE` (Gekalibreerde historische reeks)**
   - Indien een serienummer in een historische reeks valt zónder officieel anker:
     - Dient uitsluitend als chronologische indicatie van de productieperiode.
     - `exactModel`: `null`.
     - `probableModelSeries`: Generieke reekstitel (bijv. `"Historische serienummerreeks"`).
      - `modelAssistAvailable`: `true` (voor handmatige typeplaatje-invoer of globale modelzoekfunctie).
      - `modelAssist.candidates`: `[]` (Geen onbewezen modelsuggesties; één MS 440-hit mag niet worden geëxtrapoleerd als volledige kandidaatset voor 10M serienummers).
4. **Prioriteit 4: `SERIAL_FORMAT` (Alleen fabriekscode)**
   - Fallback op herkomstland / fabriekscode.

---

## 4. Fase 4 & 5: Correctie van Range-Semantiek en Database Pariteit

### Correctie van `range_1121_ms260_late` (`160000000–169999999`):
De range is gedegradeerd van een exclusieve modelreeks naar een algemene historische fabrieksreeks:
- `model_id`: `null` (voorheen `stihl_ms_260`)
- `range_semantic_level`: `"HISTORICAL_PRODUCTION_RANGE"` (voorheen `PROBABLE_MODEL_SERIES_RANGE`)
- `range_display_name`: `"Historische serienummerreeks"` (voorheen `MS 260`)
- `model_name`: `"Historische productieperiode fabriek 1"`
- `generation_name`: `"Historische productieperiode (2002–2011)"`
- `candidate_model_ids`: `[]` (voorheen `stihl_ms_260`; bewust leeggemaakt omdat één hit geen bewijs levert voor een gesloten kandidaatset)
- `confidence_reason`: Geeft expliciet aan dat door officiële MY STIHL lookup `163118080` (MS 440) is bewezen dat de reeks niet-exclusief is voor MS 260 en uitsluitend als chronologische productieperiode-indicatie dient.

### Database Pariteit (JSON & SQLite):
- Dedicated canonieke bron: `data/official_serial_anchors.json`.
- JSON dataset: `data/stihl_database.json` gesynchroniseerd vanuit de canonieke bron.
- SQLite database: `data/stihl_database.db` geregenereerd via `data/seed.cjs` vanuit `data/official_serial_anchors.json`. Pariteit is 100% gevalideerd met `better-sqlite3`.

---

## 5. Fase 6: UI & Presentatielaag Updates

In `index.html` zijn de weergavelabels en badges aangepast:
- Als `modelIdentitySource === 'OFFICIAL_STIHL_LOOKUP'`:
  - Label: `Door STIHL geïdentificeerd model:`
  - Badge: `Officieel via STIHL geverifieerd`
  - Model Assist widget wordt verborgen.
- Als `rangeSemanticLevel === 'HISTORICAL_PRODUCTION_RANGE'`:
  - Label: `Historische serienummerreeks:`
  - Geen voorbarige suggestieknoppen getoond; gebruiker wordt uitgenodigd model van typeplaatje op te zoeken indien gewenst.

---

## 6. Fase 7: Regressietestsuite & Verificatie

In `tests/official_serial_anchor_and_range_semantics.test.js` zijn 9 geautomatiseerde regressietests geïmplementeerd:
- **Test A:** Serienummer `163118080` decodeert direct naar `MS 440-Z 3/8" RIM Magnum Motorsäge`, status `EXACT_MODEL_IDENTIFIED`, bron `OFFICIAL_STIHL_LOOKUP`, `verifiedAt: "2026-09-22"`. Bevat onder geen enkele property `MS 260` of `026`.
- **Test B:** Onverankerd serienummer `160500000` binnen `160000000–169999999` claimt géén exact model (`exactModel: null`), geen waarschijnlijke reeks (`probableModelSeries: null`), status `MODEL_NOT_IDENTIFIED`, bron `SERIAL_RANGE`, informatielabel `Historische serienummerreeks`, en geen modelsuggesties (`candidateModelIds: []`, `modelAssist.candidates: []`).
- **Test C:** Fabriekscode 1 (Waiblingen / Duitsland) en chronologieformaat blijven intact.
- **Test D:** 11-cijferige onderdeelnummerdecoder (Teilenummer) blijft stabiel.
- **Test E:** Global model search vindt zowel `MS 440` als `MS 260`.
- **Test F:** StopHeling URL-integratie blijft behouden.
- **Test G:** SQLite parity tussen JSON en DB tabel `official_serial_anchors` en `model_serial_ranges`.
- **Test H:** Public facts integriteit behouden op 761 facts.
- **Test I:** Canonical Model Isolation (het canonieke model `stihl_ms_440` overschrijft nooit de officiële variantnaam).

**Testresultaat:**
`9 passed, 0 failed` (100% clean).

---

## 7. Deliverables Overzicht

| Bestand | Doel |
|---|---|
| `ROOT_CAUSE_REPORT.md` | Volledige technische documentatie van oorzaak, herstel en architectuur |
| `OFFICIAL_SERIAL_ANCHOR_AUDIT.json` | Gestructureerde audit van het officiële anker voor 163118080 |
| `SERIAL_RANGE_SEMANTICS_AUDIT.json` | Volledige audit van alle 8 serienummerreeksen in de database |
| `src/OfficialSerialAnchorResolver.js` / `.ts` | Authoritative runtime resolver voor officiële serienummer-ankers |
| `data/official_serial_anchors.json` | Dedicated storage voor officiële STIHL-verificaties |
| `tests/official_serial_anchor_and_range_semantics.test.js` | Geautomatiseerde regressietestsuite |
