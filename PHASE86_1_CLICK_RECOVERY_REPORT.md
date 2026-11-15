# PHASE 86.1 — Affiliate Click Recovery & Conversion Audit

Branch: `fix/phase86-1-affiliate-click-recovery` · basis: `main` @ `25a224e7`

Doel: herstellen wat aantoonbaar verkeerd werkt, geen kunstmatige Amazon-kliks.
Alle onderstaande getallen zijn gemeten; bronnen zonder toegang zijn als
NIET BESCHIKBAAR gemarkeerd.

---

## 1. Conclusie: de klikdaling komt niet door de koopknoppen

De klikpieken van 10 en 11 november zijn voor het overgrote deel **lokaal
testverkeer (hostname `localhost`)**, niet productiebezoek. Toen dat testverkeer
op 12/13 november stopte, verdwenen ook de bijbehorende kliks.

GA4 `Stihl` (`properties/551280812`, tijdzone Europe/Amsterdam), sessies per dag:

| Datum | Sessies totaal | waarvan `localhost` | waarvan `www.stihldecoder.nl` | Organic Search |
| --- | ---: | ---: | ---: | ---: |
| 8 nov | 52 | 43 | 9 | 9 |
| 9 nov | 88 | 84 | 4 | 3 |
| 10 nov | 110 | 105 | 5 | 4 |
| 11 nov | 124 | 117 | 7 | 5 |
| 12 nov | 42 | 39 | 3 | 1 |
| 13 nov | 3 | 0 | 3 | 1 |
| 14 nov | 4 | 0 | 4 | 1 |
| 15 nov | 4 | 0 | 4 | 1 |

- De productiesite had de hele week **3–9 sessies per dag**. Er is dus geen
  verkeersinstorting op 12 november; er is een *testverkeerspiek* die eindigde.
- Apparaten op de piekdagen: 105–118 desktop-sessies (localhost) tegen 3–7
  mobiel per dag. Mobiel verkeer op productie bleef vlak.
- De gemeten sitebezoekers verklaren geen 470 PartnerNet-kliks in één maand.
  Een deel van die kliks komt dus van buiten GA4 (bots, link-previews,
  linkvalidatie) of van buiten deze property. Zonder PartnerNet-klikrapport op
  klikniveau is dat niet verder te herleiden.

**Onzekerheid:** Amazon PartnerNet is niet programmatisch toegankelijk vanuit
deze omgeving en Render-logs/deploys geven `Unauthorized`. De PartnerNet- en
Render-cijfers in dit rapport zijn daarom overgenomen zoals gerapporteerd, niet
zelf gemeten.

## 2. Tijdlijn van de onderzochte wijzigingen

| Commit | Tijdstip (committer) | Wat | Effect op klikken |
| --- | --- | --- | --- |
| `cc5ea82e` | 2026-11-12 21:12 +01:00 | 99 ACTIVE Amazon-koopopties hersteld, koopknoppen boven de modellenlijst | Meer koopknoppen, geen verklaring voor daling |
| `be8b70d2` | 2026-11-13 08:09 +01:00 | eBay-uitbreiding (769 nieuwe aanbiedingen, 92 onderdelen) | Meer eBay-aanbod |
| `85cd989d` | 2026-11-14 22:05 UTC (23:05 CET) | Multi-marketplace-knoppen; **alle** directe én zoekknoppen zichtbaar | Amazon en eBay beide zichtbaar |
| `b8a6068a` | 2026-11-15 00:47 UTC (01:47 CET) | 1 primaire CTA + `<details>Meer koopopties</details>` | **Tweede en volgende directe aanbieding wordt verborgen** |
| `25a224e7` | 2026-11-15 22:26 +01:00 | Phase 86: 24 Amazon-aanbiedingen gesuspendeerd na 404-audit | Minder Amazon-directlinks |

Deploymenttijdstippen zijn **NIET BESCHIKBAAR** (Render API `Unauthorized`). De
geleverde HTML op 15 november bevatte de `<details>`-markup van `b8a6068a`, dus
die build stond live tijdens de meting.

Een wijziging van 15 november kan de daling vanaf 12 november niet verklaren;
de gemeten sessiecijfers laten zien dat er op 12 november niets aan het
productieverkeer veranderde.

## 3. Hoeveel koopknoppen waren verborgen (gemeten in productie-HTML)

| Pagina | Kaarten | Amazon direct zichtbaar | eBay direct zichtbaar | Verborgen Amazon | Verborgen eBay |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/bosmaaiers/fs-460/onderdelen/` | 254 | 6 | 5 | **0** | **2** |
| `/onderdelen/?q=kettingwiel` | 60 | 6 | 10 | **0** | **14** |

De veronderstelling "eBay staat primair en Amazon verdwijnt achter het
uitklapmenu" is **niet** wat productie deed: de sortering is deterministisch
(`amazon.nl` → `amazon.de` → `ebay.nl` → `ebay.de`), dus Amazon kreeg altijd de
primaire plek. Het werkelijke defect is dezelfde fout in spiegelbeeld: **elke
tweede geverifieerde directe aanbieding verdween achter "Meer koopopties"** —
in de steekproef 16 eBay-koopknoppen. Op onderdeelpagina's
(`/onderdeelnummer/…`) stonden alle aanbiedingen al zichtbaar.

Na de correctie: 0 verborgen directe aanbiedingen; alle geverifieerde
Amazon- én eBay-koopknoppen staan naast elkaar onder "Direct bestellen", en
alleen zoekfallbacks blijven inklapbaar.

## 4. Affiliate-keten, tags en redirects

- Koopknoppen linken **direct** naar de marketplace (`<a href="https://www.amazon.nl/dp/ASIN?tag=…">`).
  `/api/affiliate/out` bestaat bewust niet meer en antwoordt `410 REDIRECT_DISABLED`
  (Amazon Associates-compliance). Er is dus geen tussenliggende redirect die
  kliks kan breken.
- Amazon-tags: 157 registry-records gecontroleerd — `amazon.nl` gebruikt
  `srihldecoder2-21`, `amazon.de` gebruikt `srihldecode00-21`, zonder kruising.
- eBay: alle 838 aanbiedingen in de Phase 86-payload dragen campagne
  `5339245312` en slagen `validateEbayAffiliateUrl`.
- `handleAffiliateClick` blokkeert alleen *tracking* zonder consent; de
  navigatie naar de marketplace blijft werken (fail-open).
- **Gevonden en hersteld:** de track-route accepteerde alleen Amazon-hosts als
  bestemming, waardoor elke eBay-klik als `amazon.nl` werd opgeslagen en als
  `amazon_verified_product_click` werd geteld. De eigen Amazon-klikcijfers waren
  daardoor opgeblazen met eBay-kliks. eBay heeft nu eigen hosts en eigen
  eventtypes.

## 5. Testverkeer

- De Playwright-gates (`tests/e2e/e2e-gates.js`) blokkeerden Amazon al
  (route-abort + `preventDefault`), maar **niet eBay**. Een test die een
  eBay-koopknop aanklikte, kon dus een echte EPN-klik genereren. Nu geblokkeerd
  voor `ebay.nl/.de/.com/.co.uk`.
- De 10/11 november-piek valt samen met de fasen 80–85 die lokaal met echte
  affiliate-links en browsers werkten. Dat is de meest waarschijnlijke bron van
  de kunstmatige kliks.
- De Phase 86-browser-audit opende 157 productpagina's; op 14 en 15 november
  registreerde PartnerNet volgens de rapportage vrijwel geen kliks. Er is dus
  geen bewijs dat die audit kliks heeft veroorzaakt (waarschijnlijk geopend
  zonder `tag`), maar het audit-script legt de bezochte URL's niet vast — dat
  blijft een openstaand bewijsgaatje.

## 6. Phase 86-suspensies

24 van de 99 ACTIVE Amazon-aanbiedingen zijn gesuspendeerd na een live
browser-audit met controle-ASIN's (`B0068M5NAG` → 200, `B000000000` → 404).
Steekproef op 15 november opnieuw uitgevoerd in een echte browser, zonder
affiliate-tag:

| ASIN | Status nu | Conclusie |
| --- | --- | --- |
| `B09R1T6X4D` (Service Kit 41) | "Page Not Found" | terecht gesuspendeerd |
| `B08F9K47R9` | "Page Not Found" | terecht gesuspendeerd |
| `B0068M5NAG` (controle, live) | productpagina | browser niet geblokkeerd |

Geen aanbieding is geheractiveerd: de volledige verificatie is niet opnieuw
uitgevoerd, dus heractivatie zou ongeverifieerd publiceren. De 58 alternatieve
kandidaten blijven voor Phase 87.

## 7. Uitgevoerde correcties

1. `src/components/MarketplaceButtons.js` + `index.html`: alle geverifieerde
   directe aanbiedingen staan zichtbaar naast elkaar; alleen zoekfallbacks zijn
   inklapbaar ("Meer zoekopties").
2. `server.js`: eBay-hosts toegestaan als trackbestemming, eBay-kliks krijgen
   `ebay_verified_product_click` / `ebay_search_fallback_click` in plaats van
   Amazon-eventtypes.
3. `tests/e2e/e2e-gates.js`: eBay-navigatie geblokkeerd in geautomatiseerde tests.
4. Tests: test 17 bijgewerkt naar de nieuwe hiërarchie, tests 18–19 toegevoegd en
   nieuwe suite `tests/phase86_1_affiliate_click_recovery.test.js` (tags,
   campagne, suspensies, zichtbaarheid, testisolatie, tracking) opgenomen in
   `tests/run_current_production_tests.js`.

Ongewijzigd gebleven: registry en ACTIVE-set, 24 suspensies, eBay-aanbiedingen,
Two-Gate, marketplacevoorwaarden, disclosures, consent, SEO/robots.

## 8. Metingen die niet beschikbaar zijn

| Bron | Status |
| --- | --- |
| Amazon PartnerNet (klikken/omzet per dag) | NIET BESCHIKBAAR — alleen de gerapporteerde totalen |
| eBay EPN-rapportage | NIET BESCHIKBAAR |
| Render deploys/logs | NIET BESCHIKBAAR — API geeft `Unauthorized` |
| Microsoft Clarity 10–14 nov | NIET BESCHIKBAAR — export beperkt tot 1–3 dagen |
| SQLite-klikevents productie (`/var/data`) | NIET BESCHIKBAAR — geen toegang vanaf deze omgeving |
