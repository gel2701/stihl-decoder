# Amazon Affiliate Setup & Render Deployment Gids (Phase 54A)

Deze gids beschrijft de veilige configuratie van de Amazon Affiliate integratie voor STIHLDecoder.nl op Render.

---

## 1. Principes & Veiligheid

- **Decoupled Architecture:** De commerciële affiliate-laag is volledig gescheiden van de canonieke onderdelen- en serienummerdatabase.
- **Fail-Closed Default:** Zonder expliciete configuratie in de productieomgeving zijn alle commerciële links en buttons standaard uitgeschakeld (`AMAZON_AFFILIATE_ENABLED=false`).
- **Geen Credentials in Git:** Er worden nooit API-sleutels, geheimen of live tracking-tags opgeslagen in het Git-repository.
- **Geen Runtime Scraping:** De integratie gebruikt veilige, deterministische zoeklinks (`STIHL <part_number>`) of geverifieerde handmatige ASIN-koppelingen, zonder afhankelijkheid van externe HTML-scraping of runtime Amazon API-verzoeken.

---

## 2. Benodigde Environment Variables op Render

In het Render Dashboard onder **Environment Variables**:

| Variabele | Waarde (Voorbeeld) | Beschrijving |
| :--- | :--- | :--- |
| `AMAZON_AFFILIATE_ENABLED` | `true` | Feature flag om de affiliate-sectie te activeren op onderdeelpagina's. |
| `AMAZON_ASSOCIATE_TAG` | `srihldecoder2-21` | Bevestigde productie Amazon PartnerNet tracking-ID (Associate Tag) voor Amazon.nl. |
| `AMAZON_ASSOCIATE_TAG_DE` | `stihldecoder-de-21` | *(Optioneel)* Regionale Associate Tag voor Amazon.de. |
| `AMAZON_ASSOCIATE_TAG_COM`| `stihldecoder-com-20`| *(Optioneel)* Regionale Associate Tag voor Amazon.com. |

> [!NOTE]
> Als `AMAZON_AFFILIATE_ENABLED` ontbreekt of op `false` staat, of als `AMAZON_ASSOCIATE_TAG` leeg is, blijft de site 100% operationeel zonder enige layout-shift, console-fouten of gebroken knoppen. Handmatige overrides voor niet-NL marktplaatsen (zoals Amazon.de) vereisen een bijbehorende regionale tag (via env var of direct in de override JSON via het veld `"tag"`). Zonder geldige regionale tag worden niet-NL overrides afgewezen en valt het systeem veilig terug op de primaire Amazon.nl zoeklink.

---

## 3. Stappenplan Configuratie op Render

### Stap 1: Amazon PartnerNet Tracking-ID achterhalen
1. Log in op uw account bij [Amazon PartnerNet](https://affiliate-program.amazon.nl/).
2. Zoek uw actieve tracking-ID op (bijvoorbeeld `jouwtag-21`).

### Stap 2: Environment Variables toevoegen in Render
1. Ga naar het [Render Dashboard](https://dashboard.render.com).
2. Selecteer de Web Service van `stihl-decoder`.
3. Ga naar het tabblad **Environment**.
4. Voeg de volgende variabelen toe:
   - Key: `AMAZON_AFFILIATE_ENABLED`, Value: `true`
   - Key: `AMAZON_ASSOCIATE_TAG`, Value: `<uw-partnernet-tag>`
5. Klik op **Save Changes**.

### Stap 3: Deployment verifiëren
1. Render voert automatisch een deployment uit van de nieuwe omgevingsvariabelen.
2. Bezoek een willekeurige onderdeelpagina, bijvoorbeeld:
   `https://www.stihldecoder.nl/onderdeelnummer/11231602050/`
3. Controleer:
   - De sectie **"Waar te koop"** verschijnt onder de montagelocatie en diagramsecties.
   - De knop **"Bekijk op Amazon.nl"** bevat `rel="sponsored nofollow noopener"` en `target="_blank"`.
   - De URL verwijst naar Amazon.nl met de geconfigureerde `tag` parameter.
   - De transparante affiliate-mededeling is duidelijk zichtbaar.

---

## 4. Handmatige ASIN Overrides (Optioneel)

Voor veelgezochte slijtageonderdelen waarvoor een exact geverifieerd product op Amazon.nl bekend is, kan een directe ASIN worden geconfigureerd in:
`data/affiliate/amazon_part_offers.json`

Voorbeeld structuur:
```json
{
  "schema_version": "1.0.0",
  "description": "STIHLDecoder manual Amazon ASIN overrides. Only verified exact product ASINs.",
  "offers": [
    {
      "part_number": "11231602050",
      "asin": "B0XXXXXXXX",
      "marketplace": "amazon.nl",
      "tag": "optionele-specifieke-tag-21",
      "source": "manual_verification",
      "verified_at": "2026-10-14T00:00:00Z",
      "enabled": true
    }
  ]
}
```

Als een onderdeel niet in deze lijst staat (of `enabled: false`), valt het systeem automatisch terug op de veilige zoeklink: `https://www.amazon.nl/s?k=STIHL+<part_number>&tag=<tag>`. Niet-NL overrides zonder geldige tag vallen eveneens veilig terug op de standaard Amazon.nl zoeklink.

---

## 5. Beveiliging en Monitoring

- Alle uitgaande links naar Amazon bevatten `rel="sponsored nofollow noopener"`.
- Klikken worden intern geregistreerd onder het event `affiliate_click` in de SQLite analytics-database (zonder PII of tracking van persoonlijke gegevens).
- Het endpoint `/api/affiliate/out` blokkeert alle niet-toegestane externe domeinen (open redirect protectie).
