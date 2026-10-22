# Interactive Exploded View Pilot Report — Phase 56G

## 1. Doel en Scope
Onderzoek naar de haalbaarheid van interactieve onderdelentekeningen op STIHLDecoder.nl waarbij bezoekers op een genummerde positie kunnen klikken om direct het bijbehorende STIHL onderdeelnummer en de compatibiliteitsinformatie te zien.

De pilot is uitgevoerd op exact **3 gepubliceerde modellen**:
1. **STIHL MS 261** — sectie `Rewind Starter`
2. **STIHL MS 170** — sectie `Muffler`
3. **STIHL FS 55** — sectie `Air Filter - Fuel Tank`

---

## 2. Juridische, IP- en Databevindingen

1. **Auteursrecht op originele OEM-tekeningen**:
   - Originele STIHL CAD-/explosietekeningen zijn auteursrechtelijk beschermd door ANDREAS STIHL AG & Co. KG.
   - Zonder expliciete licentie mogen OEM-rastertekeningen niet worden gehost of hergepubliceerd.
2. **Beschikbaarheid van coördinaten in de database**:
   - `data/stihl_database.db` bevat per fitment het geverifieerde positienummer (`diagram_position`, bijv. `1`, `2`, `6`, `11`), maar **geen** $(x, y)$-pixelcoördinaten op een OEM-afbeelding.
   - Sommige fitments hebben een placeholderpositie (`-1`) wanneer het onderdeel een bovenliggende kit of ongespecificeerde positie betreft.
3. **Geen Computer Vision of gokwerk**:
   - Conform de strikte betrouwbaarheidseisen wordt **geen** OCR of automatische beeldherkenning gebruikt om posities te raden.
   - Onderdelen zonder betekenisvol positienummer (`-1` of leeg) krijgen **nooit** een gegokte hotspot en worden uitsluitend in de tabel getoond met positie `—`.

---

## 3. Technische Architectuur van het Prototype (`src/components/InteractiveDiagramViewer.js`)

Omdat echte $(x, y)$-coördinaten op gelicentieerde OEM-tekeningen ontbreken, is gekozen voor een **eerste-partij schematisch SVG-referentieprototype zonder publieke uitrol op de live modelpagina's**:

- **100% originele SVG-vectoropbouw**: Geen inbreuk op auteursrechten van derden.
- **Deterministische schemaposities (`buildSchematicHotspots`)**: Plaatst uitsluitend onderdelen die slagen voor `PartNormalizer.isMeaningfulDiagramPosition(diagram_position)`.
- **Desktop & Mobiel**: Responsieve `viewBox="0 0 720 360"` met een aanraakdoel van `r="22"` (diameter 44px) per positie en volledige toetsenbordfocus (`<a class="diagram-hotspot-node">`).
- **Volledige toegankelijke fallback zonder JavaScript**: Bevat zowel een `<noscript>`-melding als een volledige semantische HTML-`<table>` waarin alle onderdeelnummers direct klikbaar zijn naar `/onderdeelnummer/<11-cijfers>/`.

---

## 4. Resultaten per Pilotmodel

| Model | Sectie | Fitments in sectie | Geverifieerde Hotspots | Zonder positienummer (`-1`) | Voorbeeldposities |
| :--- | :--- | ---: | ---: | ---: | :--- |
| **STIHL MS 261** (`ms_261`) | `Rewind Starter` | 19 | 18 | 1 | #1: 1141 080 1806 (Fan Housing); #2: 1110 084 9102 (Bushing); #3: 0000 958 0607 (Washer) |
| **STIHL MS 170** (`ms_170`) | `Muffler` | 6 | 4 | 0 | #7: 1130 140 0614 (Uitlaat); #10: 1130 149 0601 (Muffler Gasket); #11: 1130 140 0613 (Uitlaat) |
| **STIHL FS 55** (`fs_55`) | `Air Filter - Fuel Tank` | 25 | 25 | 0 | #1: 4140 124 2800 (Air filter felt); #1: 4232 350 0411 (Brandstoftank); #2: 1125 084 8900 (Grommet) |

---

## 5. Conclusie en Besluit Publieke Uitrol

- **Besluit**: Het interactieve diagram is opgeleverd als een **volledig getest technisch prototype** (`src/components/InteractiveDiagramViewer.js`), maar wordt **niet** als zogenaamde OEM-explosietekening op de publieke modelpagina's geplaatst zolang gelicentieerde vector-explosietekeningen met geverifieerde $(x, y)$-coördinaten ontbreken.
- De bestaande publieke model-onderdelenpagina's behouden hun betrouwbare sectietabellen met exacte `diagram_position`-kolom.
