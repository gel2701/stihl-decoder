# STIHLDECODER — PHASE 59E
## Amazon Direct ASIN Pilot — Incident Response & Rollback Plan

**Document ID:** `PHASE59E_ROLLBACK_PLAN.md`  
**Datum:** 1 november 2026  
**Status:** ACTIEF (Pilot Staged — Standaard Uitgeschakeld)  
**Doel:** Directe, verliesvrije en onmiddellijke terugval naar de universele Amazon-zoekfallback voor alle onderdelen bij onregelmatigheden.

---

### 1. Inleiding & Filosofie

StihlDecoder hanteert een **Fail-Closed by Design** architectuur voor alle affiliate-koppelingen.
In de baseline en tijdens de gehele Phase 59E pilot geldt:
- Standaard status: **UITGESCHAKELD** (`production_activation_allowed: false`, `pilot_active: false`).
- Geen enkele directe ASIN-link wordt getoond tenzij aan álle poorten en voorwaarden expliciet is voldaan.
- Bij de geringste twijfel, ontbrekend bewijs, veroudering (>180 dagen) of technische storing valt het systeem onmiddellijk terug op de 100% compliant zoeklink: `https://www.amazon.nl/s?k=STIHL+<ONDERDEEL>&tag=srihldecoder2-21`.

---

### 2. Multi-Layer Kill-Switch Architectuur

Er zijn vier onafhankelijke niveaus beschikbaar om een pilot-aanbieding of de gehele pilot direct te deactiveren:

```
┌────────────────────────────────────────────────────────┐
│ LEVEL 0: Instant Runtime Deactivatie (0 latency)      │
│ registry.deactivateOffer(partNo) / suspendOffer()      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ LEVEL 1: Granulaire Whitelist Uitschakeling            │
│ Verwijder onderdeel uit AMAZON_PILOT_ACTIVE_PARTS      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ LEVEL 2: Globale Noodschakelaar (Disarm)               │
│ AMAZON_DIRECT_ASIN_ENABLED=false                       │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ LEVEL 3: Configuratiefile & Git Revert                 │
│ Zet status="VERIFIED" in PHASE59E_ACTIVATION_CANDIDATES│
└────────────────────────────────────────────────────────┘
```

#### Niveau 0: Instant Runtime Deactivatie (Applicatieniveau)
- **Mechanisme:** Directe methode op `VerifiedOfferRegistry`:
  ```javascript
  // Individuele herroeping naar VERIFIED (staged)
  registry.deactivateOffer('11104007005', 'Kwaliteitscontrole: tijdelijke deactivatie');

  // Directe noodstop naar SUSPENDED
  registry.suspendOffer('11104007005', 'Melding discrepantie verpakkingseenheid');
  ```
- **Latentie:** 0 milliseconden (in-memory `Map` update).
- **Gevolg:** Vanaf de eerstvolgende paginaberekening retourneert `getActiveOffer()` direct `null`. De resolver levert automatisch de zoekfallback.

#### Niveau 1: Granulaire Whitelist via Omgevingsvariabelen
- **Mechanisme:** De omgevingsvariabele `AMAZON_PILOT_ACTIVE_PARTS` bevat een komma-gescheiden lijst van maximaal 3 geactiveerde 11-cijferige onderdeelnummers:
  ```bash
  # Activeer uitsluitend Bosch WSR6F:
  export AMAZON_PILOT_ACTIVE_PARTS="11104007005"

  # Direct uitschakelen van alle onderdelen:
  export AMAZON_PILOT_ACTIVE_PARTS=""
  ```
- **Gevolg:** Alle onderdelen die niet expliciet in de lijst staan, worden door `VerifiedOfferRegistry.getActiveOffer()` direct genegeerd en vallen terug op zoekfallback.

#### Niveau 2: Globale Noodschakelaar (Global Disarm)
- **Mechanisme:** De master-toggle voor directe productkoppelingen:
  ```bash
  export AMAZON_DIRECT_ASIN_ENABLED="false"
  # of unset AMAZON_DIRECT_ASIN_ENABLED
  ```
- **Gevolg:** `productionActivationAllowed` evalueert direct naar `false`. Het register weigert principieel álle ASIN-resoluties sitewide.

#### Niveau 3: Configuratiefile & Git Revert
- **Mechanisme:** In `PHASE59E_ACTIVATION_CANDIDATES.json`:
  ```json
  "policy": {
    "production_activation_allowed": false,
    "pilot_activated_parts": []
  }
  ```
  Zet voor het betreffende onderdeel:
  ```json
  "pilot_active": false,
  "status": "VERIFIED"
  ```
- **Gevolg:** Permanente, reproduceerbare uitschakeling in versiebeheer.

---

### 3. Incident Classificatie & Actiedraaiboek

| Ernstniveau | Scenario | Directe Maatregel | Verificatie |
| :--- | :--- | :--- | :--- |
| **P1 — Kritiek** | Amazon levert een incorrect product, verkeerd merk of incompatibel aftermarket onderdeel (bijv. Husqvarna fitting). | 1. Voer direct Niveau 0 (`suspendOffer`) uit.<br>2. Verwijder part uit Niveau 1 whitelist.<br>3. Commit en deploy Niveau 3. | Voer `scripts/audit_amazon_affiliate_links.mjs` uit; controleer live URL op `/s?k=STIHL...`. |
| **P2 — Hoog** | Amazon toont tijdelijk "Niet leverbaar" of ASIN is samengevoegd/veranderd naar multipack. | Voer direct Niveau 0 (`deactivateOffer`) uit; onderdeel blijft in `VERIFIED` status in afwachting van nieuw onderzoek. | Detailpagina toont direct "Zoek op Amazon.nl". |
| **P3 — Matig** | Twijfel over producttitel of specificatiewijziging bij leverancier. | Pas Niveau 1 aan (haal onderdeel uit whitelist); evalueer Two-Gate bewijs opnieuw. | Geen downtime; zoekfallback blijft actief. |

---

### 4. Verificatie van Geslaagde Terugval

Na het activeren van een kill-switch moet de operator de volgende controles uitvoeren:

1. **Lokale / CI Audit:**
   ```bash
   node scripts/audit_amazon_affiliate_links.mjs
   ```
   *Resultaat moet tonen: `CONFIGURED_DIRECT_ASIN_LINKS = 0` (of het gereduceerde aantal) en `SEARCH_FALLBACK_LINKS = 18373`.*

2. **SSR Paginacontrole:**
   Voer een GET-verzoek uit op de specifieke onderdeelpagina (bijv. `/onderdeelnummer/11104007005/`):
   - Titelsectie moet luiden: `Zoek dit onderdeel online` (i.p.v. `Waar te koop`).
   - Knoptekst moet luiden: `Zoek op Amazon.nl`.
   - Bestemming moet zijn: `https://www.amazon.nl/s?k=STIHL+1110+400+7005&tag=srihldecoder2-21`.
   - Er mag géén `/dp/` URL aanwezig zijn.

3. **Telemetry & Beacon:**
   Controleer serverlogging op `/api/affiliate/track`:
   - `link_type` moet `SEARCH_FALLBACK` zijn.
   - Event moet `AMAZON_SEARCH_FALLBACK_CLICK` registreren.

---

### 5. Samenvatting van Noodcontacten & SLA

- **Maximale reactietijd (SLA) bij incident:** < 60 seconden via Niveau 0 of Niveau 1.
- **Geen dataverlies:** Canonieke catalogus (18.373) en SEO-index (843) worden nimmer gewijzigd door affiliate-statuswijzigingen.
- **Zero side-effects:** Uitschakeling van één kandidaat heeft 0 impact op andere onderdelen.
