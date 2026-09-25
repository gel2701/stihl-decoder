# Phase 49B — Knowledge Base Content Rebuild: Discovery Report

**Datum:** 2026-09-25  
**Repository:** `gel2701/stihl-decoder`  
**Feature Branch:** `feat/phase49b-knowledge-base-rebuild`  
**Baseline Commit:** `7ac1a6b6fc9aebd971b952787b5e2bb95bba018c` (origin/main)  
**Status:** In Progress (Discovery & Architecture Phase)

---

## 1. Executive Summary & Audit Baseline

In Fase 49A werden vijf dunne gidsen terecht op `HOLD` geplaatst om te voorkomen dat bezoekers werden geconfronteerd met holle SEO-teksten zonder substantiële technische of praktische waarde. 

Fase 49B herbouwt de kennisbank van STIHLDecoder volgens strikte inhoudelijke, praktische, veiligheidstechnische en bronmatige standaarden. Geen enkele pagina mag worden gepubliceerd louter voor SEO-verkeer; iedere gids moet een concrete vraag direct, betrouwbaar en contextbewust beantwoorden.

Tevens wordt een **individuele publicatiegate** ingevoerd met drie statussen:
1. `HOLD` — Inhoud onvoldoende onderbouwd of te summier; geen publieke routering (HTTP 404).
2. `READY_FOR_REVIEW` — Substantieel model en inhoud aanwezig, gereed voor inhoudelijke verificatie; nog niet publiek geïndexeerd (HTTP 404).
3. `PUBLISHED` — Voldoet aan alle 10 criteria van de Phase 49B Publicatiegate; publiek toegankelijk (HTTP 200), opgenomen in de sitemap en voorzien van gevalideerde structured data.

---

## 2. Inventarisatie van de 5 Beoordeelde Kennisbankgidsen

### Gids 1: `stihl-kettingzaag-start-niet`
- **Huidige Title:** `STIHL Kettingzaag Start Niet? Oorzaken & Stappenplan voor Diagnose`
- **Huidige Description:** `Wat te doen als uw STIHL kettingzaag verzopen is of niet aanslaat? Bekijk het stappenplan voor brandstof, bougie vonk, carter impuls en M-Tronic reset.`
- **Zoekintentie:** Gebruiker staat bij de zaag die niet start (koud of warm). Zoekt directe, veilige en praktische stappen: wat kan ik zelf controleren zonder de motor te beschadigen en zonder gevaar voor eigen veiligheid?
- **Bestaande Repository Evidence:**
  - Instructiehandleidingen in database/registry (o.a. STIHL 026 / MS 260 Doc `0458-133-3021`, MS 170 / MS 180, MS 241 C-M Doc `292074624`, MS 290/310/390 Doc `1075196729`).
  - Geverifieerde startprocedures: Master Control combihendel standen (Choke `/\|/`, Halfgas `/n/`, Bedrijf `I`, Stop `0`).
  - Veiligheidsinvariants uit Phase 49A/B: Geen universele brandstofverhouding (1:50) zonder handleidingverwijzing; geen universele bougie/elektrodenafstand.
- **Officiële Bronnen (Phase 49B-R1 Canonical Audit):**
  - Canonical documenten geverifieerd via `src/guideSourceResolver.js`:
    * `0458-133-3021` — STIHL 026 Instruction Manual (strikt gescoped op 026, p. 38, 42).
    * `0458-573-8621-D` — STIHL MS 261 / MS 261 C-M Instruction Manual (strikt gescoped op MS 261 / MS 261 C-M, p. 34).
    * `0458-207-8321-B` — STIHL MS 170, MS 170 C, MS 180, MS 180 C Instruction Manual (strikt gescoped op MS 170 / MS 180, p. 22).
  - Afgewezen / gesaneerde bronnen uit eerdere draft:
    * `0458-017-0121` — Niet-canoniek publicatienummer; vervangen door canoniek `0458-207-8321-B`.
    * `0458-545-0121` — Niet-canoniek publicatienummer; vervangen door canoniek `0458-573-8621-D`.
    * `STIHL Veiligheidsrichtlijn` — Vrije tekst zonder canoniek publicatie-ID; verwijderd als pseudo-publicatie.
    * `TI Brandstofvoorschriften` — Vrije tekst zonder canoniek publicatie-ID; verwijderd als pseudo-publicatie.
    * Bereik `0458-133-3021` verbreed naar `MS 260` — Verworpen wegens strikte documentgrenzen (document dekt alleen 026).
- **Veiligheidsrisico:**
  - Snijletsel door draaiende ketting tijdens startpogingen (kettingrem moet ingeschakeld zijn, veilige stabiele grondpositie).
  - Brand- en explosiegevaar bij ontsnappende brandstofdampen of vonktesters bij open bougiegat.
  - Motorschade (oververhitting/vastloper) door blind draaien aan carburateurschroeven of verouderde brandstof.
  - Brandwonden door aanraken hete uitlaatdemper bij warmstartproblemen.
- **Geschikte Scope & Architectuur (Layer A + Layer B):**
  - Geen valse universele procedures. Startprocedures en ontzopingsprocedures zijn gestructureerd in:
    * *Layer A: Generic Safe Principle* — Algemene veiligheidsgrondbeginselen (combihendel, stabiele ondergrond, kettingrem, nooit blind choke blijven doortrekken).
    * *Layer B: Documented Examples* — Expliciet per exact model en bron (STIHL 026 conform 0458-133-3021 p. 38/42, MS 261 conform 0458-573-8621-D p. 34).
  - Diagnose ingedeeld in duidelijke veiligheidsniveaus (Level 1: Veilige gebruikerscontrole; Level 2: Ervaren gebruiker / handleiding vereist; Level 3: Vakhandelaar / Serviceprocedure).
- **Publicatiebesluit:** **`PUBLISHED`** (Voldoet aan alle criteria na volledige herbouw).

---

### Gids 2: `stihl-carburateur-afstellen`
- **Huidige Title:** `STIHL Carburateur Afstellen: L, H & LA Schroeven Instellen`
- **Huidige Description:** `Standaard basisafstelling voor STIHL carburateurs. Zo stelt u de L (laag), H (hoog) en LA (stationair) schroef in voor een stabiel toerental.`
- **Zoekintentie:** Gebruiker zoekt afstelinstructies voor de H, L en LA schroeven van een STIHL carburateur, vaak zoekend naar een universeel "aantal slagen open".
- **Bestaande Repository Evidence:**
  - Documenten: `1068494421 : Service Manual Carburetor Stihl`, `1008738745 : STIHL 028 038 Service Manual`.
  - Invariant: Er bestaat GEEN universele basisafstelling ("H 1 slag, L 1 slag" is niet universeel geldig). Veel carburateurs hebben limiter caps of vaste sproeiers. M-Tronic machines hebben helemaal geen H/L schroeven. Te arm afstellen leidt onmiddellijk tot motorschade (lean seizure).
- **Officiële Bronnen:**
  - STIHL Carburateur Service Manual.
  - Modespecifieke instructiehandleidingen met tabellen voor standaardafstellingen per carburateurtype (Walbro, Zama, Tillotson).
- **Veiligheidsrisico:**
  - Extreem hoog risico op onherstelbare motorschade (zuigervreter door arm mengsel).
  - Ongecontroleerd meedraaien van zaagketting bij verkeerde LA-afstelling.
  - Schending van emissievoorschriften bij forceren van limiter caps.
- **Geschikte Scope:**
  - Uitleg over de functie van de sproeiers; limiter caps; waarom een toerenteller verplicht is; het verschil met M-Tronic.
  - Geen universele slagen claimen; verwijzing naar de handleiding van het exacte model.
- **Publicatiebesluit:** **`READY_FOR_REVIEW`** (Behouden achter gate; vereist modelspecifieke carburateurtabellen alvorens publiek te gaan).

---

### Gids 3: `stihl-m-tronic-resetten`
- **Huidige Title:** `STIHL M-Tronic Resetten & Kalibreren: Stappenplan per Generatie`
- **Huidige Description:** `Officiële reset- en kalibratieprocedure voor STIHL M-Tronic motoren (Gen 1, Gen 2 en Gen 3). Herstel een slecht lopende M-Tronic zaag.`
- **Zoekintentie:** Bezitter van een moderne STIHL machine met elektronisch motormanagement (M-Tronic) zoekt een herstel- of inleerprocedure na brandstofwissel, filterwissel of prestatieverlies.
- **Bestaande Repository Evidence:**
  - MS 241 C-M handleiding (`292074624`), MS 261 C-M documentatie.
  - Invariant: M-Tronic kalibratieprocedures zijn generatie- en modelafhankelijk. Gen 1 heeft geen kalibratiestand op de combihendel (vereist warmdraaien en zaagsneden). Gen 2 en 3 hebben een kalibratiestand (driehoekje `▲` op hendel, 90 seconden stationair draaien zonder gas te geven).
- **Officiële Bronnen:**
  - STIHL Technische Informatie m.b.t. M-Tronic (TI 26.2015, TI 41.2017).
  - Modespecifieke handleidingen MS 241 C-M, MS 261 C-M, MS 362 C-M.
- **Veiligheidsrisico:**
  - Brandgevaar en smeltschade: te lang stationair draaien met ingeschakelde kettingrem leidt tot oververhitting van de koppeling.
  - Verwarring met STIHL Injection (MS 500i), dat geen M-Tronic carburateur gebruikt maar directe injectie.
- **Geschikte Scope:**
  - Benadrukken dat kalibratie generatieafhankelijk is.
  - Alleen geautoriseerde generatiematrix tonen; bij twijfel doorverwijzen naar dealer met MDG 1 diagnoseapparaat.
- **Publicatiebesluit:** **`READY_FOR_REVIEW`** (Behouden achter gate; vereist generatiedatamodel per specifiek model).

---

### Gids 4: `stihl-gietklok-aflezen`
- **Huidige Title:** `STIHL Gietklok & Datumstempel Aflezen: maand- en jaarindicatie van het onderdeel`
- **Huidige Description:** `Stapsgewijze handleiding voor het aflezen van de gietklok (Gussuhr) op het carter of de cilinderkap van uw STIHL machine voor een maand- en jaarindicatie van het onderdeel.`
- **Zoekintentie:** Eigenaar ziet een ronde datummarkering met pijl en cijfers op een kunststof kap of magnesium carterdeel en wil weten wat dit zegt over de leeftijd van de zaag.
- **Bestaande Repository Evidence:**
  - Kennis over gietklokken (Gussuhr) op persgiet- en spuitgietonderdelen.
  - Invariant: Een gietklok geeft uitsluitend de gietdatum van het specifieke ONDERDEEL aan. Dit bewijst NIET het machine-assemblagejaar, de verkoopdatum of het serienummerjaar.
- **Officiële Bronnen:**
  - Matrijs- en onderdeelmarkeringsstandaarden (DIN EN ISO matrijsdatumcoderingen).
  - STIHL onderdelendocumentatie.
- **Veiligheidsrisico:**
  - Foutieve juridische aannames of teleurstelling bij tweedehands transacties door verwarring tussen gietdatum en machinebouwjaar.
- **Geschikte Scope:**
  - Uitleg van de pijl (maand 1-12) en het jaartal in het centrum; waarschuwing voor vervangen onderdelen (bijv. nieuw starterdeksel op oude zaag).
- **Publicatiebesluit:** **`READY_FOR_REVIEW`** (Behouden achter gate).

---

### Gids 5: `namaak-stihl-herkennen`
- **Huidige Title:** `Namaak STIHL Herkennen: 5 Belangrijke Kenmerken van Replica & Kloon Zagen`
- **Huidige Description:** `Hoe herkent u een imitatie STIHL zaag? Controleer het serienummer, het carter en de typeplaatjes tegen Chinese namaak.`
- **Zoekintentie:** Koper van een tweedehands STIHL wil nagaan of de machine authentiek is of een illegale Chinese kloon/imitatie.
- **Bestaande Repository Evidence:**
  - StopHeling integratie (waarschuwing: StopHeling is diefstalcontrole, geen authenticiteitscertificering).
  - Serienummerinconsistenties (namaakmachines gebruiken vaak gerecyclede of ontbrekende serienummers).
  - Invariant: Geen absolute binaire claims ("dit kenmerk = direct namaak") op afstand. Categorieën: `NO_OBVIOUS_ISSUE`, `INCONSISTENCY_FOUND`, `MANUAL_REVIEW_RECOMMENDED`.
- **Officiële Bronnen:**
  - STIHL Brand Protection / Merkvervalsing voorlichting.
  - Officiële STIHL typeplaat- en logorichtlijnen.
- **Veiligheidsrisico:**
  - Zeer hoog veiligheidsrisico bij gebruik van namaakmachines: ondeugdelijke of ontbrekende kettingrem, gevaar voor kettingbreuk, falende terugslagbeveiliging.
- **Geschikte Scope:**
  - Systematische inspectielijst (serienummer, typeplaatje, cartermateriaal, schroeven, kettingrem, logo, aankoopkanaal).
  - Duidelijke nuance dat online beoordeling nooit 100% sluitend is zonder fysieke dealerinspectie.
- **Publicatiebesluit:** **`READY_FOR_REVIEW`** (Behouden achter gate).

---

## 3. Conclusie & Publicatiestrategie Fase 49B

Conform de opdrachtvereisten (Sectie 2 & 23) publiceren we in Fase 49B **uitsluitend** de gids `stihl-kettingzaag-start-niet` nadat deze volledig is opgebouwd volgens alle eisen van substantie, veiligheid en bronvermelding.

De overige vier gidsen (`stihl-carburateur-afstellen`, `stihl-m-tronic-resetten`, `stihl-gietklok-aflezen`, `namaak-stihl-herkennen`) krijgen een gestructureerd inhoudsmodel en worden op `READY_FOR_REVIEW` gezet. Zij blijven voor het publiek op HTTP 404 en buiten de sitemap totdat zij in een volgende fase hun individuele reviewgate doorlopen.
