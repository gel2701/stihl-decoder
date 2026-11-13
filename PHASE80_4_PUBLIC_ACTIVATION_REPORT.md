# Phase 80.4 — Public eBay Activation (verificatie)

Repository: `gel2701/stihl-decoder` · Datum: 2026-11-13

---

## 0. Render draait de juiste commit (bewezen)

`GET https://www.stihldecoder.nl/api/version`:

```json
{"commit":"9df62b94f3f46d9185c8352ea72ec5a25af348bf","branch":"main",
 "environment":"production","deployed_at":"2026-11-13T03:59:30.256Z",
 "database":{"connected":true,"persistent":true,"path_type":"persistent_disk","schema_version":3}}
```

De mergecommit van PR #149 (`9df62b9`) staat dus live in productie, met persistente schijf. De
Render-API-koppeling geeft nog steeds `401`, maar de deployment zelf is hiermee aantoonbaar.

## 1. Gebruiken de publieke productkaarten de persistente store?

Code-pad (gecontroleerd):

```
PartDetailPageTemplate / GuidePageTemplate
  → AffiliateOfferResolver.resolveOffers()
      → EbayAffiliateProvider (alleen geregistreerd als EBAY_ENABLED === 'true')
          → loadEbayCachedOffers(getEbayOfferStorePath())
              → /var/data/affiliate/ebay_offers.json  (Render, persistent)
```

Publicatiepoorten in `EbayAffiliateProvider.getOffers()` — elk daarvan faalt gesloten:
`EBAY_ENABLED`, `EBAY_AFFILIATE_ENABLED !== 'false'`, campagne **exact** `5339245312`,
`decision === 'ACCEPT'`, `status === 'ACTIVE'`, publishbaar `match_type`,
`shipping_status === 'SHIPS_TO_NL_CONFIRMED'`, geldige eBay-URL met exact één `campid`,
en `part_number` (of geregistreerde vervanging) gelijk aan het gevraagde onderdeel.

**Bevinding (operationeel, geen defect):** de resolver is een module-singleton die de store bij
**boot** inleest. Nieuwe ACTIVE-records worden pas zichtbaar na een herstart. In de praktijk is dat
geen probleem bij de pilot, omdat het omzetten van `EBAY_ENABLED` de service toch herstart. Na elke
toekomstige activeringsbatch: service herstarten (of flag-toggle) zodat de kaarten de nieuwe store
lezen.

## 2. Live meting op STIHLDecoder.nl (nu)

Pagina: `https://www.stihldecoder.nl/onderdeelnummer/11256401701/`

| Meting | Waarde |
|---|---|
| eBay-links in de DOM | **0** (kill-switch staat uit) |
| Amazon-CTA's | 2, beide `https://amazon.nl/s?k=…&tag=srihldecoder2-21` |
| `rel` / `target` | `sponsored nofollow noopener` / `_blank` |
| Body vermeldt "eBay" | nee |

Dus: **0 van de 97 ACTIVE-aanbiedingen zijn nu publiek zichtbaar** — precies zoals bedoeld met
`EBAY_ENABLED=false`. De 97 records staan in de persistente store en de resolver levert ze
(97 links, volgens de Phase 80.3-run); ze worden alleen niet gerenderd zolang de kill-switch uit is.

## 3. Uitgaande links en redirects

`GET /api/affiliate/out` antwoordt **410 `REDIRECT_DISABLED`** ("Outbound affiliate navigation must
use direct links"). Er is dus geen tussenliggende redirect om te testen: alle koopknoppen zijn
directe links, met `rel="sponsored nofollow noopener"` en `target="_blank"` (geverifieerd in de DOM).
Voor eBay-kaarten zet de provider dezelfde attributen en `label: "Bekijk op ebay.nl|ebay.de"`, met
`url` = gevalideerde `itemAffiliateWebUrl` inclusief `campid=5339245312`.

## 4. Amazon en zoeken: geen regressie

- Amazon-CTA's renderen op de productkaart met de juiste NL-tag `srihldecoder2-21`; DE-tag
  `srihldecode00-21` blijft gescheiden in `AmazonAffiliateProvider`.
- `GET /api/parts-search?q=0000 400 7000` → HTTP 200 met resultaat (searchpad intact).

## 5. Waarom 176 verzendbevestigingen en 157 bij de eindbeoordeling?

De verzendverificatie loopt over **alle** bekende (onderdeel, marketplace, item)-paren, inclusief
paren die op productidentiteit worden afgekeurd. Een listing kan dus aantoonbaar naar NL leveren en
tóch geen ACTIVE worden. In de productiecijfers:

```
184 combinaties
 −  19 CONFLICTING_MPN (identiteit faalt)
 = 165 NEEDS_EVIDENCE wegens SHIPPING_NOT_CONFIRMED
 + verzendbewijs → 176 paren met bevestigde NL-levering
 −  19 die op identiteit blijven afgekeurd
 = 157 combinaties die óók de eindbeoordeling halen
```

Dat is exact de gerapporteerde 176 vs 157 (verschil 19 = de 19 MPN-conflicten). Bewijsstatus is
**niet** aangepast: de 19 houden hun verzendbewijs, maar blijven afgekeurd op identiteit.

Nieuw in het rapport (`required_report`):

- `4_shipping_confirmed_but_not_active` — aantal paren met bevestigde levering dat niet ACTIVE is;
- `4_shipping_confirmed_but_not_active_by_reason` — uitgesplitst per blokkerende regel.

Regressietest `83.6` bewijst het mechanisme: verzeendbewijs wordt vastgelegd, de kandidaat blijft
`CONFLICTING_MPN` en komt niet in de store.

## 6. Wat hier niet kon (en waarom)

De Render-koppeling geeft `401 Unauthorized`, dus ik kan **niet**:

- de persistente store uitlezen → de steekproef van 10 ACTIVE-aanbiedingen op identiteit,
  marketplace, NL-verzending en campid is niet uitgevoerd;
- `EBAY_ENABLED` omzetten → de publieke pilot is niet gestart;
- dus ook niet meten hoeveel van de 97 kaarten aanklikbaar zijn (nu 0, zie §2).

Er zijn **geen** bewijsstatussen, ACTIVE-records of veiligheidscontroles gewijzigd; de 68
NEEDS_EVIDENCE-kandidaten en alle bestaande ACTIVE-records blijven staan (de store verwijdert nooit
wat een batch niet onderzocht heeft).

## 7. Pilot uitvoeren (zodra Render-toegang werkt)

1. Steekproef (read-only, 10 records):

```bash
cd /opt/render/project/src
node -e "
const fs=require('fs');const d=JSON.parse(fs.readFileSync('/var/data/affiliate/ebay_offers.json','utf8'));
const a=d.offers.filter(o=>o.status==='ACTIVE');
console.log('ACTIVE',a.length,'parts',new Set(a.map(o=>o.part_number)).size);
for(const o of a.slice(0,10)) console.log([o.part_number,o.marketplace,o.status,o.shipping_status,o.match_type,/campid=5339245312/.test(o.affiliate_url||''),o.item_id].join(' | '));
"
```

2. Pilot aan (kill-switch): Render → service `stihl-decoder` → Environment →
`EBAY_ENABLED=true` (laat `EBAY_AFFILIATE_ENABLED` ongemoeid of `true`) → opslaan = herstart.
3. Controleer de 10 onderdeelpagina's: elke eBay-CTA moet `campid=5339245312`,
   `rel="sponsored nofollow noopener"`, `target="_blank"` hebben en naar `ebay.nl`/`ebay.de` wijzen.
4. Noodstop: `EBAY_ENABLED=false` → herstart; de store en alle bewijsbestanden blijven intact.
