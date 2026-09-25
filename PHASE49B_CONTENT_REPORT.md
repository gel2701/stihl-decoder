# Phase 49B — Knowledge Base Content Rebuild: Content Report

**Datum:** 2026-09-25  
**Repository:** `gel2701/stihl-decoder`  
**Feature Branch:** `feat/phase49b-knowledge-base-rebuild`  
**Baseline Commit:** `7ac1a6b6fc9aebd971b952787b5e2bb95bba018c` (origin/main)  
**Parked Branch Phase 48:** `5b39ff9440c99f5be6570b3a1a930b2d9a2fc725` (onaangetast)  
**Status:** Inhoudelijk & Technisch Voltooid (Klaar voor Review)

---

## 1. Executive Summary

In Fase 49B zijn de vijf dunne en misleidende kennisbankpagina's die in Fase 49A op `HOLD` stonden, structureel herbouwd. In plaats van generieke SEO-hulsen te publiceren, is een modulaire contentarchitectuur gerealiseerd (`src/content/guides/`) met strikte scheiding tussen veilige gebruikershandelingen, ervaren gebruikersdiagnoses en officiële serviceprocedures.

Iedere gids doorloopt een **individuele publicatiegate** (`HOLD`, `READY_FOR_REVIEW`, `PUBLISHED`). In deze fase is conform de opdracht uitsluitend de gids `stihl-kettingzaag-start-niet` gepromoveerd naar **`PUBLISHED`**. De overige vier gidsen hebben een substantieel technisch en bronmatig datamodel gekregen en staan veilig achter de gate op **`READY_FOR_REVIEW`** (HTTP 404, niet in sitemap).

---

## 2. Overzicht per Gids

| Gids (Slug) | Publicatiestatus | Woorden | Secties | Bronnen | FAQs | Publicatiebesluit | Resterende Blokkers / Vereisten voor Volgende Fase |
|---|---|---|---|---|---|---|---|
| `stihl-kettingzaag-start-niet` | **PUBLISHED** | 3.166 | 12 | 5 | 5 | **PUBLISHED** | Geen. Voldoet aan alle 10 criteria van de Phase 49B gate. |
| `stihl-carburateur-afstellen` | **READY_FOR_REVIEW** | 768 | 6 | 2 | 3 | **HOLD / REVIEW** | Modelspecifieke H/L/LA tabellen per carburateurfamilie (Walbro/Zama/Tillotson) vereisen officiële per-model verificatie. |
| `stihl-m-tronic-resetten` | **READY_FOR_REVIEW** | 490 | 5 | 2 | 2 | **HOLD / REVIEW** | Volledige model-naar-generatie matrix (Gen 1 vs 2 vs 3) moet worden gekoppeld aan de database alvorens livegang. |
| `stihl-gietklok-aflezen` | **READY_FOR_REVIEW** | 501 | 5 | 1 | 2 | **HOLD / REVIEW** | Visuele illustraties en matrijsconventies per decennium moeten worden aangevuld. |
| `namaak-stihl-herkennen` | **READY_FOR_REVIEW** | 464 | 5 | 1 | 2 | **HOLD / REVIEW** | Fotoverificatie van actuele imitaties en dealer-inspectieprotocol vereist validatie met officiële brand protection. |

*Opmerking over woordental:* Het aantal woorden is een indicatieve metriek en geen kwaliteitsnorm. De prioriteit ligt te allen tijde bij directheid, veiligheid en bronbetrouwbaarheid.

---

## 3. Inhoudelijke Verantwoording: `stihl-kettingzaag-start-niet`

De gids `/gidsen/stihl-kettingzaag-start-niet/` is vanaf de grond opnieuw opgebouwd:
1. **Direct antwoord eerst:** Een prominente callout-kaart bovenaan beantwoordt direct wat de gebruiker veilig kan controleren (koude start met choke vs. warme start zonder choke, combihendel, verse brandstof, bougie, luchtfilter, verzopen motor).
2. **Veiligheid voorop:** Strikte waarschuwingen voor kettingremvergrendeling vóór starten, stabiele grondpositie met voet in de handgreep (nooit vliegende start!), brandstof- en brandgevaar, en risico op vastlopers bij carburateurafstelling.
3. **Veilige Diagnoseniveaus:**
   - *Level 1 (User Safe Check):* Startprocedure, stophendel, brandstofpeil, brandstofveroudering, visuele bougie/filtercheck.
   - *Level 2 (Experienced User / Manual Required):* Bougie vervangen door voorgeschreven type volgens handleiding, cilinder ventileren bij verzopen motor, luchtfilter reinigen, tankfilter controleren.
   - *Level 3 (Service Procedure):* Interne carburateurmembranen, carter vacuüm/druktest, compressiemeting, ontstekingstest onder belasting, M-Tronic MDG 1 diagnose. Geen doe-het-zelf improvisatie; verwijzing naar erkende dealer.
4. **Onderscheid Koud vs. Warm Starten:**
   - Koud: Volle choke (`/\|/`) tot de eerste plof/ontsteking (binnen 2-5 trekken); direct stoppen met trekken en omschakelen naar startstand/halfgas (`/n/`).
   - Warm: Strikt GEEN choke gebruiken (direct verzopen toestand bij warm); starten in stand `/n/` of `I` conform handleiding.
5. **Verzopen Motor Herstelprocedure:**
   - Gestructureerd stappenplan conform officiële fabrieksinstructies: combihendel op 0 (geen ontsteking), bougie uitbouwen met combinatiesleutel, afdrogen en reinigen, doek over bougiegat leggen en 6-10 keer doortrekken om cilinder te ventileren, handvast indraaien en vastzetten met sleutel, herstarten in startstand ZONDER choke.
6. **Brandstofkwaliteit & Ethanol-veroudering:**
   - Geen universele mengverhouding zonder modelspecificatie ("Gebruik de brandstof en mengverhouding die in de handleiding van uw specifieke model wordt voorgeschreven").
   - Uitleg van hygroscopische werking van Euro 95 (E10) ethanolbenzine: fase-scheiding na ~30 dagen, gomvorming in sproeiers. Aanbeveling voor alkylaatbenzine (STIHL MotoMix met 5 jaar houdbaarheid) of verse mengsmering.
7. **Bougie & Elektrodenkleur:**
   - Geen universele bougie ("Er bestaat geen universele bougie die in iedere STIHL kettingzaag past").
   - Visuele beoordeling van de elektrode (koffiebruin = optimaal, roet/zwart = rijk/filter verstopt, nat = verzopen, asgrijs/wit = gevaarlijk arm mengsel). Elektrodenafstand controleren conform fabriekshandleiding (veelal ~0,5 mm).
8. **Carburateur vs. M-Tronic Onderscheid:**
   - Klassieke carburateurs met H/L/LA schroeven vs. M-Tronic (C-M modellen) met microprocessor en magneetventiel (geen handmatige schroeven). Waarschuwing tegen blind draaien aan schroeven.
9. **Probleem- & Oorzaakmatrix:**
   - Overzichtelijke tabel met symptomen, mogelijke oorzaken, veilige eerste controle en vervolgstappen.
10. **Aansprakelijkheid & Terminologie:**
    - Geen loze beloftes zoals "dit lost uw probleem op". Consequent gebruik van "kan wijzen op", "mogelijke oorzaak", "controleer".

---

## 4. Bronvermelding & Technische Attributie

De gepubliceerde gids bevat een expliciete bronsectie ("Bronnen en Beperkingen"):
- **STIHL 026 / MS 260 Instructiehandleiding** — Publicatie-ID `0458-133-3021` (Master Control, startprocedure, veiligheid).
- **STIHL MS 170 / MS 180 Instructiehandleiding** — Publicatie-ID `0458-017-0121` (Basisstartprocedures, bougie-inspectie).
- **STIHL MS 261 C-M Instructiehandleiding** — Publicatie-ID `0458-545-0121` (M-Tronic bediening, startpositie).
- **STIHL Veiligheidsbrochure: Veilig werken met de motorkettingzaag** (Veilige startpositie, kettingremvergrendeling).
- **STIHL Technische Informatie: Brandstofkwaliteit & Houdbaarheid van Mengsmering** (Fasescheiding ethanol, alkylaatbenzine).

Geen resellerblogs, geen lokale Windows-bestandspaden en geen interne repository-termen worden getoond aan de bezoeker.

---

## 5. Structured Data & SEO-Integriteit

1. **TechArticle:** Aanwezig op alle gepubliceerde gidsen met canonieke URL en synchrone beschrijving.
2. **FAQPage:** Alleen gegenereerd op basis van de 5 daadwerkelijk zichtbare FAQs op de pagina.
3. **HowTo:** Uitsluitend toegevoegd aan `stihl-kettingzaag-start-niet` voor de veilige herstelprocedure bij een verzopen motor. Strikt geweerd van niet-geünificeerde procedures zoals M-Tronic reset.
4. **Sitemap:** Bevat exact 2 gepubliceerde gidsen (`/gidsen/serienummer-locaties/` en `/gidsen/stihl-kettingzaag-start-niet/`). Alle 4 unreviewed gidsen zijn 100% uitgesloten van de sitemap.
5. **Machine Context Links:** Alleen benzinekettingzagen (zoals MS 261, MS 170, 026) linken contextueel naar de startgids. Accu-machines (MSA 60 C-B) en niet-zaagmachines (FS 350, BR 600, HS 45) tonen de link niet.

---

## 6. Verificatie & Testresultaten

- **Productie Testrunner (`tests/run_current_production_tests.js`):**
  - Totaal 21 suites uitgevoerd.
  - 21 suites geslaagd (100% PASS, 0 failures).
- **End-to-End Trust & Public Route Crawler (`scripts/audit_public_trust_claims.mjs`):**
  - 258 publieke pagina's gerenderd.
  - 4.278 interne links gecontroleerd (0 broken links).
  - 597 fragment targets gecontroleerd (0 broken fragment targets).
  - 0 ongeoorloofde claims.
  - 0 HOLD / UNPUBLISHED link leaks.
  - 0 semantic CTA mismatches.
  - 0 drive context fouten.
- **Git diff check:** Schoon (0 trailing whitespace of formatting errors).
