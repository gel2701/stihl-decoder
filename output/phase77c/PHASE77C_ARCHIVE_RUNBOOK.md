# Phase 77C — Runbook: lokale Windows-archieven inventariseren

De vier originele archieven zijn vanuit deze cloudomgeving **niet bereikbaar** (geen Windows-mount).
Er is niets gesimuleerd: de rapporten scheiden metadata, steekproefschattingen, individueel geverifieerde
afbeeldingen en afgeleide koppelingen.

## Configuratie op de Windows-host

Vereist: Node.js 22+ (vanwege `node:sqlite`), de repository-checkout en leesrechten op de archieven.

```powershell
# 1. Zet de vier archiefwortels (puntkomma-gescheiden; mappen zonder resultaat mogen ontbreken)
$env:PHASE77A_ARCHIVE_ROOTS = @(
  "$env:USERPROFILE\.agents\stihl_scribd_documents_output",
  "D:\stihl_archive_downloads",
  "D:\stihl_gardenhirespares_output",
  "D:\stihl_models_full_documentation_archive"
) -join ';'

# 2. Inventariseer alle bestanden, afbeeldingen, PDF's en metadataverwijzingen
node scripts\phase77a_inventory_diagrams.mjs

# 3. Optioneel: begrensde beeldverificatie (schrijft alleen hashes, geen afbeeldingen)
node scripts\phase77b_sample_source_images.mjs --limit=30

# 4. Herbereken de koppelingen en het gat
node scripts\phase77b_source_gap_analysis.mjs
node scripts\phase77c_section_evidence.mjs
```

## Wat het script doet en niet doet

- Leest alleen; schrijft uitsluitend naar `output/phase77a`, `output/phase77b` en `output/phase77c`.
- Downloadt geen archiefbestanden en publiceert niets.
- De beeldsteekproef haalt alleen de reeds in metadata bekende URL's op, hasht ze en verwijdert het
  tijdelijke bestand direct; er komt geen afbeelding in de repository.
- Padvalidatie: paden buiten de opgegeven wortels worden niet gelezen.

## Verwachte uitkomsten op de host

- Aantal gescande bestanden per archiefwortel (`source_roots[].files_scanned`).
- Aantal lokale PDF's en per PDF het aantal ingebedde afbeeldings-objecten.
- Aantal lokale afbeeldingsbestanden, gehasht en geclassificeerd.
- Of de lokale IPL-PDF's daadwerkelijk tekeningen bevatten (nu: onbekend, want de bestanden ontbreken hier).

Zonder deze stap blijven alle uitspraken over de lokale archieven **metadata-only**.
