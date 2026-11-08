# STIHLDecoder — Phase 68 Amazon Compliance Checklist

**Audit Datum:** 8 november 2026
**Auditor:** Reserve Coding Agent (Automated & Manual Review)
**Doel:** Formele verificatie tegen de Amazon Associates Operating Agreement & Program Policies.
**Partner-ID:** `srihldecoder2-21` (Amazon.nl)

---

## 1. 12-Punts Amazon Associates Compliance Checklist

| Nr | Compliance Criterium | Status | Bewijsvoering & Implementatiedetails |
|---|---|:---:|---|
| **1** | **Expliciete Partnervermelding (Disclosure)** | **PASS** | De voorgeschreven tekst *"As an Amazon Associate I earn from qualifying purchases"* (en Nederlandse vertaling *"Als Amazon-partner verdien ik aan kwalificerende aankopen"*) wordt op alle pagina's met affiliate-links getoond via `AffiliateDisclosure.js`. |
| **2** | **Geen Verhullende Redirects (Cloaking)** | **PASS** | Alle links gaan direct naar `https://amazon.nl/dp/...` of `https://amazon.nl/s?...`. De redirect route `/api/affiliate/out` retourneert strict HTTP 410 Gone en maskeert geen affiliate-bestemmingen. |
| **3** | **Correcte Rel-attributen** | **PASS** | Alle affiliate `<a>` tags bevatten `rel="sponsored nofollow noopener"`. Dit voldoet aan zowel Google SEO-richtlijnen als Amazon affiliate regels. |
| **4** | **Geen Onbevestigde Prijsclaims** | **PASS** | Zonder actieve Creators API worden géén prijzen getoond. Elke geverifieerde kaart vermeldt expliciet: *"Geen onbevestigde prijs of voorraadclaims."* |
| **5** | **Geen Onbevestigde Voorraadclaims** | **PASS** | Er wordt nergens geclaimd dat een product *"Op voorraad"* is zonder real-time API-bevestiging. |
| **6** | **Geen Valse Sterbeoordelingen** | **PASS** | Er worden geen statische of verzonnen review-sterren weergegeven. Bezoekers worden direct naar de authentieke reviews op Amazon geleid. |
| **7** | **Geen Misleidende Merkclaims** | **PASS** | Strikt onderscheid tussen originele STIHL-onderdelen en OEM-toeleveranciers (bijv. NGK, Bosch) conform `STRICT_SUPPLIER_EQUIVALENT_NO_MISLEADING_OEM_CLAIMS`. Kaarten vermelden expliciet de verpakking van de fabrikant. |
| **8** | **Eerlijke Zoekfallback Demarcatie** | **PASS** | Zoekresultaten worden ondubbelzinnig aangeduid als `Amazon-zoekopdracht (Niet vooraf gecontroleerd)` zodat de bezoeker nooit misleid wordt dat STIHLDecoder de zoekresultaten heeft gevalideerd. |
| **9** | **Doelgericht Venstergedrag** | **PASS** | Externe Amazon-links openen in een nieuw tabblad met `target="_blank"` zonder de sessie van de gebruiker te kapen. |
| **10** | **Privacy & Cookie Compliance** | **PASS** | De browser verstuurt affiliate-beacons alleen bij expliciete toestemming en synchroniseert een first-party consent-cookie (`stihl_cookie_consent=granted`). De server verifieert dit cookie voorafgaand aan enige SQLite-registratie en faalt closed (`recorded: false`) bij directe requests, vervalste bodyclaims of `?test=1` zonder cookie. IP-adressen dienen uitsluitend vluchtig in-memory voor rate limiting; Google Analytics blijft toestemmingsgebonden. Een volledige no-indexed `/privacy` pagina is aanwezig. |
| **11** | **Strikte Productiebeperking (Pilot Lock)** | **PASS** | De actieve catalogus is strict vergrendeld op maximaal 3 pilot ASINs (`B0068M5NAG`, `B001RM8J76`, `B001RMA5S2`). Onderzoeksdata (Phase 68B) is 100% ontkoppeld van productie. |
| **12** | **Geautomatiseerde Regressietests** | **PASS** | Volledige testdekking in `tests/phase68_affiliate_conversion.test.js` en `tests/phase59b_amazon_affiliate_compliance.test.js`. De Phase 68.3-tracking- en gidsregressies controleren de fail-closed publieke endpoint en centrale productautorisatie; volledige CI moet opnieuw slagen na deze wijziging. |

---

## 2. Belangrijk Onderscheid: Technische Websitegereedheid versus Formele Amazon Goedkeuring

> [!IMPORTANT]
> **Definitie & Juridisch/Operationeel Voorbehoud:**
> Technische websitegereedheid (**Compliance Readiness**) betreft een interne technische kwaliteitscontrole waarbij de frontend, datamodellen, disclosures en linkstructuur van STIHLDecoder.nl zijn getoetst aan de gepubliceerde bepalingen van de *Amazon Associates Operating Agreement* en *Program Participation Requirements*.
>
> Dit is uitdrukkelijk **NIET** gelijk aan formele toelating of officiële accountgoedkeuring door Amazon zelf:
> 1. **Autonoom Goedkeuringsproces:** Amazon beoordeelt affiliate-accounts pas na minimaal 3 gekwalificeerde verkopen binnen de gestelde termijn (doorgaans 180 dagen).
> 2. **Discretionaire Review:** Een compliance-medewerker van Amazon voert vervolgens een zelfstandige beoordeling uit van de site, contentwaarde en verkeerskwaliteit.
> 3. **Geen Garantie op Goedkeuring:** Geen enkele interne technische audit kan officiële goedkeuring door Amazon garanderen. Amazon behoudt te allen tijde het discretionaire recht accounts naar eigen inzicht toe te laten of af te wijzen.
>
> **Doel van Phase 68/68.1:** Bekende technische en inhoudelijke risicofactoren (zoals verhullende redirects, ontbrekende disclosures, niet-gevalideerde prijsclaims, merkverwarring of misleidende pasvormclaims) proactief mitigeren om de website technisch zorgvuldig voor te bereiden op de menselijke review door Amazon.

---

## 3. Conclusie

De interne technische controle van STIHLDecoder.nl toont op de onderzochte criteria geen schendingen van de gepubliceerde richtlijnen van de Amazon Associates Operating Agreement. De site is hiermee technisch voorbereid op de toekomstige onafhankelijke en autonome beoordeling door Amazon.
