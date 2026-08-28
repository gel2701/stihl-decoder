# STIHL Decoder

Onafhankelijke Node.js-webapp voor STIHL-serienummers, modelgidsen en bronstatus. De app toont formaat- en herkomstsignalen uit een 9-cijferig serienummer, maar claimt geen exact model of bouwjaar zonder aanvullend typeplaatje of primaire documentatie.

## Databeleid

- Canonieke databron: `data/stihl_database.json`
- Canonieke manifest: `data/canonical_manifest.json`
- Afgeleide opslag: `data/stihl_database.db`
- Homepage decodebron: `/api/decode`

De JSON-file is de enige bron van waarheid. SQLite is afgeleid en mag opnieuw worden opgebouwd, maar niet handmatig worden gebruikt als autoritatieve bron voor modelclaims of bronstatus.

Per `2026-08-28` hanteert de repository deze regels:

- Een serienummerdecode levert alleen formaat- en herkomstsignalen op.
- Model-, generatie- en bouwjaarclaims vereisen aanvullende machine-identificatie.
- `PRIMARY_SOURCE_LINKED` betekent dat er een gelinkte primaire STIHL-bron is geregistreerd.
- `PRIMARY_SOURCE_PENDING` betekent dat modeldata nog niet veld-voor-veld aan een primaire bron is gekoppeld.

## Scripts

```bash
npm install
npm test
node scripts/rebuild_canonical_data.js
node data/seed.cjs
node scripts/phase33e_source_integrity_audit.js
```

Wat deze scripts doen:

- `scripts/rebuild_canonical_data.js` normaliseert de canonieke JSON en schrijft het manifest opnieuw weg.
- `data/seed.cjs` bouwt de SQLite-database opnieuw op vanaf de canonieke JSON.
- `scripts/phase33e_source_integrity_audit.js` is report-only en schrijft een auditrapport naar `data/phase33e_source_integrity_report.json`.

## Lokaal draaien

```bash
npm install
npm test
npm start
```

De app draait standaard op `http://localhost:3000`.

## Belangrijke beperkingen

- Deze repository is niet gelieerd aan ANDREAS STIHL AG & Co. KG.
- StopHeling-resultaten worden fail-closed behandeld; netwerkfouten leveren geen “clear” status op.
- Oude scripts en UI-copy zijn aangepast om ongefundeerde claims over “geverifieerde” specificaties, officieel paspoortgebruik en exacte bouwjaarbepaling te voorkomen.
