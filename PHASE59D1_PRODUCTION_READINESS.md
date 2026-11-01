# STIHLDECODER — PHASE 59D.1 RAPPORT
## Production Readiness & Evidence Consistency

**Repository**: `gel2701/stihl-decoder`  
**Baseline Commit**: `284febe4ac671d3d73fa1327a7ebc35a29b6a175`  
**Branch**: `feat/phase59d1-production-readiness-consistency`  
**Datum**: 2026-11-01  
**Affiliate-tag**: `srihldecoder2-21`  
**Status**: READ-ONLY GEREED — GEEN PRODUCTIE-ACTIVATIE UITGEVOERD

---

## 1. Documentatiecontrole & Status van alle 19 Onderzochte Onderdelen

Tijdens Phase 59D.1 is een volledige pariteitscontrole uitgevoerd tussen:
- `PHASE59C_VERIFIED_MATCHES.json`
- `PHASE59D_VERIFIED_OFFERS.json`
- `PHASE59D_EVIDENCE_VALIDATION.json`
- `PHASE59D_REPORT.md`

### Pariteitsbevindingen
Er is 100% consistentie vastgesteld over alle 19 onderzochte kandidaatkoppelingen. Een schijnbare discrepantie in eerdere verslaglegging (waarbij abusievelijk `1121 007 1062` en `1125 007 1021` in plaats van de werkelijke afgekeurde items werden genoemd) is definitief gecorrigeerd in overeenstemming met de daadwerkelijk vastgelegde bewijsbestanden:

| Categorie | Aantal | Onderdeelnummers | Fase 59C Status | Fase 59D Status | Two-Gate Verificatie |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **Volledig Geverifieerd (Tier-1)** | **3** | `1110 400 7005`, `0000 400 7000`, `0000 400 7011` | `VERIFIED_COMPLETE` | `VERIFIED` | **GATE 1: PASS, GATE 2: PASS** (Gereed voor staging) |
| **Gedeeltelijk Bewezen (Compatibiliteit)** | **13** | `0000 350 3502`, `1117 640 3800`, `0000 642 1234`, `0000 642 1236`, `1118 195 3500`, `0000 195 8200`, `4282 141 0300`, `1123 640 7102`, `1123 120 1613`, `1130 124 0800`, `1123 640 3200`, `1141 120 1600`, `0000 400 7025` | `PART_COMPATIBILITY_VERIFIED` | `STAGED` | **GATE 1: PASS, GATE 2: FAIL** (Ontbreekt stabiele Amazon.nl ASIN-identiteit) |
| **Incompatibel / Afgekeurd** | **3** | `0000 350 3518`, `1123 640 2074`, `4238 140 1800` | `INCORRECT_MATCH_CONFIRMED` | `SUSPENDED` | **GATE 2: REJECT** (Fysieke/technische mismatch bevestigd) |

### Detail van de 3 Afgekeurde Matches (`SUSPENDED`):
1. **`0000 350 3518` (Brandstoftankdop)**:
   - *Oorspronkelijke kandidaat*: Oregon 33-518 / niet-passende brandstofdop.
   - *Feitelijke afwijking*: Draadspoed en bajonetsluiting incompatibel met MS 260/026; past uitsluitend op geselecteerde FS-bosmaaiers.
   - *Status*: `SUSPENDED` / `STAGE_REJECTED_REPLACED`.
2. **`1123 640 2074` (Kettingtandwiel .325" 7T)**:
   - *Oorspronkelijke kandidaat*: Oregon 106114.
   - *Feitelijke afwijking*: Koppelingstrommel heeft een 6-tands 3/8"P configuratie, in strijd met het OEM 7-tands .325" profiel.
   - *Status*: `SUSPENDED` / `STAGE_REJECTED_REPLACED`.
3. **`4238 140 1800` (Luchtfilter voorfilter)**:
   - *Oorspronkelijke kandidaat*: Stens 605-385.
   - *Feitelijke afwijking*: Geschikt voor BR 500/600 bladblazers, maar fysiek niet passend in TS 410/420 doorslijpers.
   - *Status*: `SUSPENDED` / `STAGE_REJECTED_REPLACED`.

Geen enkel onderdeel is geforceerd gewijzigd om pariteit af te dwingen; de documentatie weerspiegelt 1:1 het forensische bewijs.

---

## 2. Technische Re-evaluatie van de Drie Top-Bougies

Voor de drie volledig geverifieerde kandidaten is een diepgaande technische controle uitgevoerd op verpakking, fabrikant MPN, merkindeling, fysieke specificaties en marketplace-eigenschappen:

### A. Bosch WSR6F (`1110 400 7005`) → ASIN `B0068M5NAG`
- **Fabrikant & MPN**: Bosch Automotive Aftermarket, MPN `0242240506` (Bestelnummer `7547` / type `WSR6F`), EAN `3165141051063`.
- **Fysieke Specificaties**: Schroefdraad M14 x 1,25, schroefdraadlengte 9,5 mm, sleutelwijdte 19 mm, elektrodeafstand 0,5 mm, 1-polig, ontstoord (5 kΩ).
- **Verpakkingseenheid**: Enkelstuks blisterverpakking (1-pack). Geen multipack- of bulkverwarring.
- **STIHL Geschiktheid**: Originele fabrieksspecificatie voor klassieke 2-takt kettingzagen: STIHL 017, 018, 021, 023, 025, 026, MS 170, MS 180, MS 210, MS 230, MS 250, MS 260.
- **Amazon.nl Status**: Actief leverbaar, directe productpagina geverifieerd via Motointegrator Artikel 468993.
- **Classificatie**: `OEM_SUPPLIER_EQUIVALENT` (Tier-1 OEM toeleverancier van STIHL).

### B. NGK BPMR7A (`0000 400 7000`) → ASIN `B001RM8J76`
- **Fabrikant & MPN**: Niterra Co., Ltd. (NGK Spark Plugs), MPN `BPMR7A` / Stocknr. `6703`, UPC `0087295167038`.
- **Fysieke Specificaties**: Schroefdraad M14 x 1,25, schroefdraadlengte 9,5 mm, sleutelwijdte 19 mm, ontstoord (5 kΩ), vaste SAE-aansluitmoer (solid terminal).
- **Verpakkingseenheid**: Individuele NGK gele doos (1-pack).
- **STIHL Geschiktheid**: Conform STIHL Quick Reference Guide de standaard bougie voor doorslijpers (TS 400, TS 410, TS 420) en middelzware zagen (MS 290, MS 310, MS 390, 029, 039).
- **Amazon.nl Status**: Actief leverbaar, geverifieerd via AmzChart product intelligence.
- **Onderscheid met CMR6H**: M14-draad; fysiek onmogelijk te monteren in M10-cilinderkoppen.

### C. NGK CMR6H (`0000 400 7011`) → ASIN `B001RMA5S2`
- **Fabrikant & MPN**: Niterra Co., Ltd. (NGK Spark Plugs), MPN `CMR6H` / Stocknr. `3365`, UPC `0087295133651`.
- **Fysieke Specificaties**: Compacte schroefdraad M10 x 1,0, schroefdraadlengte 12,7 mm, sleutelwijdte 16 mm, ontstoord (5 kΩ).
- **Verpakkingseenheid**: Individuele verpakking (1-pack).
- **STIHL Geschiktheid**: Specifiek ontworpen voor STIHL 4-MIX® en moderne 2-MIX motoren met beperkte inbouwruimte (o.a. FS 90, FS 100, FS 130, BR 500, BR 600, MS 261, MS 271).
- **Amazon.nl Status**: Actief leverbaar, geverifieerd via Motointegrator Artikel 842061.
- **Cruciaal Onderscheid**: Heeft een M10-schroefdraad en 16 mm zeskant. Kan niet verwisseld worden met een standaard M14 WSR6F of BPMR7A zonder directe motorschade te voorkomen.

---

## 3. Two-Gate Verifier, VerifiedOfferRegistry & Fail-Closed Beveiliging

### Two-Gate Verifier Architectuur
De `TwoGateVerifier` fungeert als de centrale kwaliteitsbewaker:
- **Gate 1 (Technisch & Formaat)**:
  - ASIN-syntaxiscontrole (exact 10 alfanumerieke hoofdletters/cijfers).
  - Marktplaatsvalidatie (uitsluitend goedgekeurde domeinen zoals `amazon.nl`).
  - Affiliate-tag matching (strikt `srihldecoder2-21`).
  - Catalogusgronding (onderdeelnummer moet bestaan in de 18.373 canonical catalogus).
  - Verplichte herkomstvelden (fabrikant, merk, MPN, classificatie).
  - **Bewijsversheid (Phase 59D.1 Nieuw)**: Afwijzing van records met een `verification_date` ouder dan 180 dagen (`maxEvidenceAgeDays: 180`).
- **Gate 2 (Product & Compatibiliteit)**:
  - OEM-taxonomievalidatie (`GENUINE_STIHL`, `OEM_SUPPLIER_EQUIVALENT`, `AFTERMARKET_REPLACEMENT`).
  - Onafhankelijk bewijs van fabrikant-MPN en STIHL-geschiktheid.
  - Afwezigheid van bekende mismatches (zoals afgekeurde onderdelen).
  - **Strikte afwezigheid van vluchtige prijs- en voorraadclaims** (verbod op hardcoded prijzen/voorraden).

### Fail-Closed Runtime Guard in `VerifiedOfferRegistry`
In `src/affiliate/VerifiedOfferRegistry.js` is `getActiveOffer(partNumber)` voorzien van een runtime controle:
1. `this.productionActivationAllowed === true` is verplicht. Zo niet, retourneert de methode direct `null`.
2. De status van de offer moet strikt `'ACTIVE'` zijn.
3. **Runtime Re-verificatie**: Zelfs als een record als `'ACTIVE'` staat gemarkeerd, voert `getActiveOffer()` een live `TwoGateVerifier.verifyOffer()` uit. Indien de datum verlopen is (>180 dagen), een veld ontbreekt, of de ASIN corrupt is, faalt de aanroep 'closed' (retourneert `null`) en schakelt de provider geruisloos terug naar een veilige zoeklink.

```mermaid
flowchart TD
    Req["Resolver: Vraag aanbieding op"] --> LockCheck{"Is productie-lock opgeheven?<br>(productionActivationAllowed == true)"}
    LockCheck -- "Nee (Standaard)" --> SafeSearch["Fallback: Zoeklink<br>(amazon.nl/s?k=STIHL...)"]
    LockCheck -- "Ja" --> StateCheck{"Status in Registry"}
    StateCheck -- "Niet gevonden / STAGED / SUSPENDED" --> SafeSearch
    StateCheck -- "ACTIVE" --> ReVerify{"Runtime Two-Gate Check<br>(Format, ASIN, Freshness <180d, Geen Prijzen)"}
    ReVerify -- "FAIL" --> SafeSearch
    ReVerify -- "PASS" --> ServeDirect["Directe ASIN-link<br>(amazon.nl/dp/ASIN...)"]
```

---

## 4. Activeringssimulatie & Randgevallen (8 Scenario's)

In de geïsoleerde testsuite `tests/phase59d1_production_readiness_consistency.test.js` zijn alle 8 activeringsscenario's succesvol gesimuleerd:

1. **Geldige ACTIVE Aanbieding (met actieve lock)**:
   - *Input*: `1110 400 7005` (Bosch WSR6F), status `ACTIVE`, `productionActivationAllowed: true`.
   - *Resultaat*: Retourneert directe ASIN-link `https://amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21`, `link_type: 'DIRECT_ASIN'`.
2. **Ontbrekend Onderdeel**:
   - *Input*: Onbekend onderdeel `9999 999 9999`.
   - *Resultaat*: Veilige zoeklink `https://amazon.nl/s?k=STIHL+99999999999&tag=srihldecoder2-21`, `link_type: 'SEARCH_FALLBACK'`.
3. **Geschorst Onderdeel (`SUSPENDED`)**:
   - *Input*: `0000 350 3518` (afgekeurde tankdop).
   - *Resultaat*: Veilige zoeklink, directe link geblokkeerd.
4. **Verouderd Bewijsrecord (> 180 dagen)**:
   - *Input*: `1123 640 7102`, status `ACTIVE`, maar `verification_date` van 190 dagen geleden.
   - *Resultaat*: Two-Gate keurt af op versheid; registry retourneert `null`; provider schakelt direct over naar zoeklink.
5. **Ongeldige ASIN-syntaxis**:
   - *Input*: ASIN met afwijkende lengte (`INVALID_ASIN_TOO_LONG`).
   - *Resultaat*: Gate 1 syntaxisvalidatie faalt; resolver schakelt over naar zoeklink.
6. **Marketplace- of Tag-mismatch**:
   - *Input*: Aanbieding met afwijkende affiliate-tag (`malicious-or-wrong-tag-20`).
   - *Resultaat*: Gate 1 afgewezen; resolver garandeert uitsluitend de geconfigureerde tag `srihldecoder2-21`.
7. **Productie-lock Ingeschakeld (`productionActivationAllowed: false`)**:
   - *Input*: `1110 400 7005`, gemarkeerd als `ACTIVE`, maar lock actief.
   - *Resultaat*: Zelfs met status `ACTIVE` retourneert het systeem 100% zoeklinks. De productie-lock kan niet worden omzeild.
8. **Universele Veilige Fallback (Extreme Inputs)**:
   - *Input*: `null`, `undefined`, lege strings, vreemde tekensets (`1123@@##$$%`).
   - *Resultaat*: Zero exceptions; resolver vangt alle inputs veilig af en produceert geldige zoek-URL's met `srihldecoder2-21`.

---

## 5. Definitieve Conclusie over Productiegeschiktheid & Aanbevelingen voor Phase 59E

### Conclusie
Het affiliate subsysteem van StihlDecoder is **volledig technisch voorbereid en veilig bevonden voor een gecontroleerde productie-activering**. 

- **Geen Regressie**: De 18.373 onderdelen, 843 SEO-pagina's en 1.024 sitemap URL's zijn 100% behouden.
- **Zero Exposure**: In de huidige productiestand (`data/affiliate/amazon_part_offers.json`) staan exact 0 ASIN's gepubliceerd.
- **Fail-Closed Bescherming**: Verouderde of onvolledige data leidt te allen tijde tot een correcte zoeklink, zonder foutmeldingen of gebroken gebruikerservaringen.

### Aanbevelingen voor Phase 59E (Eerste Gecontroleerde Productie-Activering)
Wanneer de gebruiker besluit Phase 59E te starten, wordt de volgende aanpak aanbevolen:
1. **Beperkte Pilot**: Activeer in eerste instantie uitsluitend de 3 getoetste bougies (`1110 400 7005`, `0000 400 7000`, `0000 400 7011`).
2. **Monitoring van Clicks & Conversies**: Volg de via `/api/affiliate/track` gelogde directe ASIN-klikken versus zoekklikken in de privacy-veilige eventlog.
3. **Periodieke Her-validatie**: Handhaaf de 180-dagen versheidscyclus via geautomatiseerde CI/CD-controles.
4. **Enrichment Backlog**: Verwerk de 13 staged kandidaten pas naar `VERIFIED` zodra onafhankelijke verificatie van stabiele enkelstuks-ASIN's op Amazon.nl is verkregen.

---
*Gevalideerd en vastgelegd conform STIHLDecoder Architecture & Quality Guidelines.*
