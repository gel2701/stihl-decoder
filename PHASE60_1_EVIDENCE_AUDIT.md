# STIHLDECODER — PHASE 60.1 REPORT
## Amazon Evidence Recovery & Revenue Acceleration

**Repository:** `gel2701/stihl-decoder`  
**Datum:** 3 november 2026  
**Baseline commit:** `cff1348c88e6419e86cd756ef5fcb72743379422`  
**Branch:** `feat/phase60-1-evidence-recovery`  
**Status:** FORENSIC EVIDENCE RECOVERY COMPLETE | DUAL-GATE INTEGRITY ENFORCED | 3 LIVE PILOTS LOCKED | PRODUCTION HARDENED

---

## 1. Doel & Aanleiding Phase 60.1

In Phase 60 werd een aanzienlijke commerciële en UX-slag geslagen:
- De **FS 460 C-EM** bosmaaiercatalogus werd gemoderniseerd (Overig-dump gehalveerd van 133 naar 62 onderdelen, maaigarnituur hersteld naar 14 authentieke maaikoppen en messen, kwaliteitsscore 100/100).
- Gebruikers kunnen binnen maximaal 2 clicks vanaf een modelpagina een externe Amazon-aankoopmogelijkheid bereiken.
- Conversie- en affiliate-tracking werd geïntroduceerd.

Echter, bij de batch-evaluatie van 50 kandidaat-ASINs in Phase 60 trad een methodologische verificatiefout op:
1. **Verificatiefout Gate 2:** Een officiële STIHL onderdelenhandleiding of onderdelenboek (IPL) bewijst technische compatibiliteit (Gate 1), maar bewijst **niet** dat een willekeurige Amazon ASIN daadwerkelijk dat fysieke fabrieksonderdeel vertegenwoordigt (Gate 2).
2. **EAN Check Digit Fout:** Voor `0000 400 7011` (NGK CMR6H) werd in het Phase 60 manifest de foutieve barcode `0087295133652` gehanteerd.
3. **Productidentiteitsfout Catalogus:** Voor `0000 400 7000` stond in `data/parts_catalog.json` abusievelijk `Spark plug NGK CMR6H` (afkomstig uit een oude scrape van sparepartsworld), terwijl dit onderdeelnummer in werkelijkheid toebehoort aan de **NGK BPMR7A** (Stock No. 6703).
4. **Verbod op kunstmatige 100% passes:** Er mag nooit een hypothetische match als "geverifieerd" worden bestempeld zonder onafhankelijk controleerbaar extern bewijs.

In Phase 60.1 zijn deze fouten integraal onderzocht, wiskundig en catalogustechnisch hersteld, en zijn alle kandidaten onderworpen aan een onverbiddelijke **Dual-Gate Audit**.

---

## 2. Herstel van Bekende Fouten

### A. Wiskundig Herstel EAN `0000 400 7011` (NGK CMR6H / 3365)
- **Foutieve waarde:** `0087295133652`
- **Wiskundige verificatie van het controlecijfer (Modulus 10):**
  - EAN-13 cijfers 1 t/m 12: `0, 0, 8, 7, 2, 9, 5, 1, 3, 3, 6, 5`
  - Gewichten: oneven posities $\times 1$, even posities $\times 3$:
    $$\text{Oneven som} = 0 + 8 + 2 + 5 + 3 + 6 = 24$$
    $$\text{Even som} = (0 + 7 + 9 + 1 + 3 + 5) \times 3 = 25 \times 3 = 75$$
    $$\text{Totaal} = 24 + 75 = 99$$
    $$\text{Controlecijfer} = (10 - (99 \pmod{10})) \pmod{10} = (10 - 9) \pmod{10} = 1$$
- **Herstelde, geverifieerde GTIN/EAN:** `0087295133651` (NGK Stock No. 3365, Type CMR6H).
- **Toegepast in:** `scripts/build_phase60_candidates.mjs`, `PHASE60_1_VERIFIED_OFFERS.json`, `tests/phase60_1_evidence_recovery.test.js`.

### B. Catalogusidentiteit Herstel `0000 400 7000` (NGK BPMR7A / 6703)
- **Oude cataloguswaarde:** `Spark plug NGK CMR6H`
- **Forensisch bewijs:**
  - Officiële STIHL Quick Reference Guides, onderdelenshards en de live pilot (`verified_amazon_registry.json`) tonen aan dat `0000 400 7000` de standaardfabrieksbougie van NGK is voor STIHL TS 400, TS 410, TS 420 doorslijpers en MS 290, MS 310, MS 390 kettingzagen.
  - De specificatie is **NGK BPMR7A** (Stock No. 6703, EAN `0087295167038`), schroefdraad M14x1.25.
  - CMR6H is een compactbougie met schroefdraad M10x1.0 en behoort bij onderdeelnummer `0000 400 7011`.
- **Doorgevoerde correctie:**
  - `data/parts_catalog.json`: `part_name` en `part_name_normalized` voor `00004007000` gewijzigd naar `Spark plug NGK BPMR7A`. De canonieke catalogusomvang blijft exact **18.373 onderdelen**.
  - `PHASE60_COMMERCIAL_OPPORTUNITIES.json`: onderdeelnaam en categorie gerangschikt als NGK BPMR7A.
  - `scripts/build_phase60_candidates.mjs`: kandidaat gecorrigeerd naar Niterra Co., Ltd. (NGK Spark Plugs), MPN BPMR7A / 6703.

### C. Handhaving Verboden Koppelingen (Phase 59F.1 Mismatches)
De volgende ongeldige matches blijven contractueel en programmatisch geblokkeerd (`INCORRECT_MATCH_CONFIRMED`):
1. `0000 400 7025` + NGK CMR7H (`B07RHQ5FR4`):
   - Fout: `0000 400 7025` is de werkplaatsverpakking van 10 stuks (ZK C 10, warmtegraad 6). ASIN `B07RHQ5FR4` is 1 losse bougie warmtegraad 7.
2. `0000 642 1223` + Oregon 18720 (`B000IBWVWG`):
   - Fout: `0000 642 1223` vereist Standard 7-Spline (SD7). Oregon 18720 is Small 7-Spline (SM7).
3. `0000 642 1223` + Oregon 68210 (`B00004RA6N`):
   - Fout: ASIN `B00004RA6N` behoort tot een Oregon geleiderblad/zaagketting combinatieset, niet tot een rim sprocket.

---

## 3. Dual-Gate Audit & Classificatieresultaten

Alle 50 kandidaten uit Phase 60 plus de disproven Phase 59F.1 kandidaten zijn geaudit volgens de strikte tweeledige toets:

- **Gate 1 (Technisch & Catalogus):**
  - Is het onderdeelnummer canoniek (11 cijfers)?
  - Is de fitment met STIHL-modellen en configuraties bewezen via officiële documentatie?
  - Zijn fabrikant, MPN, OEM-classificatie en verpakkingsgrootte expliciet vastgelegd?
- **Gate 2 (Productidentiteit & Externe Corroboratie):**
  - Is er een onafhankelijk controleerbare koppeling tussen de Amazon ASIN en het werkelijke fysieke product (via GTIN/EAN, fabrikantcatalogus of geverifieerde product intelligence)?
  - Klopt de verpakkingseenheid en marktplaats (`amazon.nl`)?
  - Is uitgesloten dat een STIHL-handleiding als bewijs voor een Amazon ASIN wordt gebruikt?

### Samenvatting Classificaties

| Classificatie | Aantal | Betekenis & Behandeling |
|---|---|---|
| **`VERIFIED_ACTIVATION_READY`** | **5** | Zowel Gate 1 (STIHL fitment) als Gate 2 (ASIN productidentiteit) zijn 100% onafhankelijk bewezen. 3 actief in live pilot, 2 staged gereed voor operator-activatie. |
| **`PART_COMPATIBILITY_VERIFIED`** | **44** | Gate 1 is bewezen (officiële STIHL fitment), maar Gate 2 ontbeert nog extern GTIN/ASIN catalogusbewijs. Strikte staging met fail-closed Amazon zoekfallback. |
| **`INCORRECT_MATCH_CONFIRMED`** | **3** | Aantoonbaar onjuiste koppeling (aantalsfout, spline-mismatch of verkeerde productlijn). Permanent geblokkeerd. |
| **Totaal Geëvalueerd** | **52** | 100% transparante toewijzing, 0 kunstmatige passes. |

### Gedetailleerd Overzicht van de 5 Verified Offers

1. **`0000 400 7011` — NGK CMR6H / 3365**
   - **ASIN:** `B001RMA5S2`
   - **EAN/GTIN:** `0087295133651`
   - **Status:** `ACTIVE_LIVE_PILOT` (1 van 3)
   - **Externe bron:** Motointegrator catalogusrecord `https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck`.
   - **Fitment:** FS 460 C-EM, FS 410, FS 360, BR 500, BR 600, MS 261.

2. **`1110 400 7005` — Bosch WSR6F / 0242240506**
   - **ASIN:** `B0068M5NAG`
   - **EAN/GTIN:** `3165141051063`
   - **Status:** `ACTIVE_LIVE_PILOT` (2 van 3)
   - **Externe bron:** Motointegrator catalogusrecord `https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck`.
   - **Fitment:** 017, 018, 021, 023, 025, 026, MS 170, MS 180, MS 210, MS 230, MS 250, MS 260.

3. **`0000 400 7000` — NGK BPMR7A / 6703**
   - **ASIN:** `B001RM8J76`
   - **EAN/GTIN:** `0087295167038`
   - **Status:** `ACTIVE_LIVE_PILOT` (3 van 3)
   - **Externe bron:** AmzChart product intelligence record `https://amzchart.com/product-research/spark-plugs-15716421`.
   - **Fitment:** TS 400, TS 410, TS 420 doorslijpers en MS 290, MS 310, MS 390 kettingzagen.

4. **`0000 400 7009` — Bosch USR7AC / 0242035503**
   - **ASIN:** `B09QH68W83`
   - **EAN/GTIN:** `4047023059468`
   - **Status:** `VERIFIED_STAGED_READY` (Niet geactiveerd; wacht op expliciete operator command)
   - **Externe bron:** Motointegrator catalogusrecord `https://www.motointegrator.de/artikel/1118672-zuendkerze-bosch-0-242-035-503-1-stueck`.
   - **Fitment:** FS 38, FS 45, FS 55, HS 45, HS 81, HS 86.

5. **`0000 642 1240` — Oregon 18720 Power Mate Rim Sprocket**
   - **ASIN:** `B000IBWVWG`
   - **MPN:** Oregon 18720 (Small 7-Spline SM7, 3/8" 7T)
   - **Status:** `VERIFIED_STAGED_READY` (Niet geactiveerd; wacht op expliciete operator command)
   - **Externe bron:** Oregon Products officiële fitment catalogus & Amazon catalogusrecord.
   - **Fitment:** STIHL 0000 642 1240 kleine spline aandrijving voor MS 170, MS 180, MS 210, MS 230, MS 250.

---

## 4. Strikte Productielock & Veiligheidsnet

Ter bescherming van de betrouwbaarheid van STIHLDecoder.nl:
- **Productielock:** Maximaal **3 actieve live pilot-ASINs** in productie (`11104007005`, `00004007000`, `00004007011`).
- **Geen automatische activatie:** Geen enkele nieuwe ASIN-link is live geactiveerd in productie.
- **Fail-closed zoekfallback:** Alle 44 gestagete onderdelen en de 3 permanent geblokkeerde combinaties vallen direct terug op de betrouwbare Amazon-zoekfallback met affiliate tag `srihldecoder2-21`.
- **Formulering:** `Bevestigde compatibiliteit` is overal gehandhaafd; de verboden garantieclaim `Gegarandeerd passend op` komt 0x voor.

---

## 5. Invariantenoverzicht

| Invariant | Doel | Gerealiseerd | Status |
|---|---|---|---|
| Canonieke onderdelencatalogus | Exact 18.373 | 18.373 | ✅ BEHOUDEN |
| SEO allowlist onderdelen | Exact 843 | 843 | ✅ BEHOUDEN |
| Sitemap URLs | Exact 1.024 | 1.024 | ✅ BEHOUDEN |
| Actieve live pilot ASINs | Exact 3 | 3 | ✅ VERGRENDELD |
| Amazon Associate Tag | `srihldecoder2-21` | `srihldecoder2-21` | ✅ ACTIEF |
| Gegarandeerd passend op | 0 voorkomens | 0 | ✅ CONFORM |
| Bevestigde compatibiliteit | Verplichte formulering | 100% | ✅ CONFORM |
| Playwright E2E browser tests | Alle journeys geslaagd | 34/34 (100%) | ✅ GROEN |
| Canonieke productietestsuites | Alle suites geslaagd | 87/87 (100%) | ✅ GROEN |
