# FASE 48 — AFFILIATE PROVIDER RESEARCH NEDERLAND
## PUBLIEK ONDERZOEK AFFILIATE MOGELIJKHEDEN TUIN & GEREEDSCHAP

*Documentversie: 1.0.0 — Fase 48 Pre-Implementation Analysis*  
*Doelgebied: Nederland (NL / BE)*  
*Naleving: GEEN accounts aangemaakt, GEEN voorwaarden geaccepteerd, GEEN credentials opgeslagen.*

---

### 1. Samenvatting & Uitgangspunten

Voor het onafhankelijke platform **STIHLDecoder.nl** is onderzocht welke affiliate platforms, netwerken en merchantprogramma's beschikbaar zijn voor het doorverwijzen van gebruikers naar echte, betrouwbare leveranciers van STIHL-compatibele onderdelen en gereedschap in Nederland.

**Commerciële grondwet:**
1. **Technische scheiding:** Een affiliate-relatie of commissiepercentage mag *nooit* invloed hebben op de technische compatibiliteitsbeoordeling of ranking van onderdelen.
2. **Geen cloaking / geen redirects:** Alle affiliate-links moeten transparant en rechtstreeks verwijzen naar geregistreerde merchants.
3. **Geen fictieve data:** Zolang een officiële affiliate-overeenkomst of tracking ID niet live en geactiveerd is, blijft de status van alle commerciële offers `UNMONETIZED` met `affiliate_url = null`.

---

### 2. Overzicht van Onderzochte Providers

| Provider / Netwerk | Type | Beschikbaar voor NL | Deeplinking | Productfeed / API | Status voor STIHLDecoder |
|---|---|---|---|---|---|
| **Bol.com Partnerplatform** | Marketplace | **YES** | **YES** | **YES** (FTP / Open API) | Primaire kandidaat marketplace |
| **Amazon.nl Associates** | Marketplace | **YES** | **YES** | **YES** (PA API v5) | Beschikbaar, API vereist eerdere verkopen |
| **Awin Nederland** | Affiliate Netwerk | **YES** | **YES** | **YES** (Publisher API & Feeds) | Breed aanbod tuingereedschap adverteerders |
| **TradeTracker Nederland** | Affiliate Netwerk | **YES** | **YES** | **YES** (Webservices API & Feeds) | Aanwezig (o.a. Mastertools.nl, Toolmax) |
| **Daisycon** | Affiliate Netwerk | **YES** | **YES** | **YES** (Daisycon API & Feeds) | Aanwezig in categorie Huis & Tuin |

---

### 3. Gedetailleerde Provider Profiles

#### 3.1 Bol.com Partnerprogramma
- **Officiële partnerpagina:** [https://partnerplatform.bol.com](https://partnerplatform.bol.com)
- **Beschikbaar voor Nederland:** **YES** (ook België).
- **Deeplinking mogelijk:** **YES**
  - Via de *Sitebar* extensie of programmatisch via partner-URL structuur met `subid` / `referrer` parameter.
- **Productfeed / API mogelijk:** **YES**
  - Dagelijks geüpdatete FTP productfeeds (vereist IP-whitelisting in partnerdashboard).
  - Open API beschikbaar voor partners. Bevat prijzen, EAN, voorraadindicaties en afbeeldingen.
- **Publiek gevonden voorwaarden:**
  - Inschrijving bij KVK / BTW-nummer of particuliere registratie.
  - Website moet live zijn en relevante, kwalitatieve content bevatten.
  - Verbod op misleidende links, cloaking en automatisch openende tabs.
- **Benodigde account / goedkeuring:**
  - Aanmelding via partnerplatform.bol.com met handmatige keuring van de website.
- **Technische integratiemogelijkheid:**
  - Eenvoudig te integreren via directe deeplinks met `partner_id` parameter.
  - Geschikt voor match op EAN of OEM artikelnummer.

#### 3.2 Amazon.nl Associates (Partnernet)
- **Officiële partnerpagina:** [https://affiliate-program.amazon.nl/](https://affiliate-program.amazon.nl/)
- **Beschikbaar voor Nederland:** **YES**
- **Deeplinking mogelijk:** **YES**
  - Via *SiteStripe* of directe URL-opbouw met tracking-tag: `https://www.amazon.nl/dp/<ASIN>?tag=<tracking-id>`.
- **Productfeed / API mogelijk:** **YES**
  - *Product Advertising API (PA API v5)*.
  - *Let op:* API-toegang wordt pas vrijgegeven nadat een account minimaal 3 gekwalificeerde verkopen heeft gerealiseerd binnen 180 dagen na aanmelding.
- **Publiek gevonden voorwaarden:**
  - Verplichte affiliate disclosure op elke pagina met partnerlinks.
  - Prijzen mogen alleen getoond worden indien ze realtime via de PA API worden opgehaald (niet ouder dan 24 uur).
- **Benodigde account / goedkeuring:**
  - Aanmelding via Associates Central; definitieve goedkeuring na de eerste 3 verkopen.
- **Technische integratiemogelijkheid:**
  - ASIN-koppeling of gerichte zoek-deeplinks.

#### 3.3 Awin (Nederland)
- **Officiële partnerpagina:** [https://www.awin.com/nl](https://www.awin.com/nl)
- **Beschikbaar voor Nederland:** **YES**
- **Deeplinking mogelijk:** **YES**
  - Via *Link Builder* of URL-structuur: `https://www.awin1.com/cread.php?awinmid=<mid>&awinaffid=<affid>&p=<destination_url>`.
- **Productfeed / API mogelijk:** **YES**
  - *Create-a-feed* export in CSV/XML en GraphQL/REST Publisher API.
- **Relevante aangesloten adverteerders:**
  - Diverse speciaalzaken in gereedschap, tuinmachines en ijzerwaren (o.a. Tooltopper, iGarden, Tuinmeubelshop).
- **Benodigde account / goedkeuring:**
  - Registratie als Publisher, verificatieborg van € 1 (wordt teruggestort) en toelating per individuele adverteerderscampagne.
- **Technische integratiemogelijkheid:**
  - Zeer robuuste deeplinking met click-referenties per product.

#### 3.4 TradeTracker (Nederland)
- **Officiële partnerpagina:** [https://tradetracker.com/nl/](https://tradetracker.com/nl/)
- **Beschikbaar voor Nederland:** **YES**
- **Deeplinking mogelijk:** **YES**
  - Via tracking redirect URLs (`https://tc.tradetracker.net/?c=...&m=...&a=...&r=...&u=...`).
- **Productfeed / API mogelijk:** **YES**
  - Dagelijkse productfeeds en Webservices API.
- **Relevante aangesloten adverteerders:**
  - *Mastertools.nl* (speciaalzaak in gereedschappen), *VEVOR.nl*, *Toppy.nl*.
- **Benodigde account / goedkeuring:**
  - Aanmelding als affiliate en goedkeuring per merchantcampagne.
- **Technische integratiemogelijkheid:**
  - Hoge betrouwbaarheid voor Nederlandse webwinkels in klus- en tuinsegment.

#### 3.5 Daisycon
- **Officiële partnerpagina:** [https://daisycon.com/nl/](https://daisycon.com/nl/)
- **Beschikbaar voor Nederland:** **YES**
- **Deeplinking mogelijk:** **YES**
- **Productfeed / API mogelijk:** **YES** (Daisycon REST API).
- **Benodigde account / goedkeuring:**
  - Publisher account en campagnetoelating.

---

### 4. Architectuuraanbevelingen voor STIHLDecoder Commercial Pilot

1. **Provider-Onafhankelijk Offer Schema:**
   - De data-architectuur moet neutraal zijn ten opzichte van het gekozen netwerk.
   - Elk offer specificeert: `offer_id`, `recommendation_id`, `merchant_id`, `merchant_product_id`, `title`, `product_url`, `affiliate_url`, `price`, `currency`, `observed_at`, `status`.
2. **Domain Allowlist:**
   - Om phishing, open redirects en malafide URLs uit te sluiten, worden uitsluitend domeinen toegestaan van geregistreerde merchants in [`data/affiliate_merchants.json`](../data/affiliate_merchants.json) (bv. `bol.com`, `amazon.nl`, `stihl.nl`).
3. **Strikte Stale Price Policy:**
   - Geen prijs tonen als er geen actuele `observed_at` timestamp is (< 7 dagen oud).
4. **Huidige Status in Fase 48:**
   - Geen live affiliate accounts zijn nu gekoppeld in git.
   - Alle commerciële offers in de repository starten in status `UNMONETIZED` of `DISCOVERY_ONLY` met `affiliate_url: null`.
   - Zodra contracten worden gesloten, kan via environment variabelen (`AFFILIATE_BOL_ID`, etc.) monetisatie veilig worden geactiveerd zonder technische compatibiliteitswijzigingen.
