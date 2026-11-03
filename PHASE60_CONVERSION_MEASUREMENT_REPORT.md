# STIHLDecoder — Phase 60: Conversion Measurement & Revenue Analysis Report

**Datum:** 3 november 2026  
**Repository:** `gel2701/stihl-decoder`  
**Branch:** `feat/phase60-commercial-growth-fs460`  
**Status:** VOLTOOID & GEVERIFIEERD

---

## 1. Forensisch Onderzoek: Waarom SQLite 0 Affiliate Clicks Rapporteerde

Tijdens de data-inspectie in Phase 60 van de tabel `analytics_events` in `data/stihl_database.db` werden de volgende reële verkeersaantallen vastgesteld:

| Event Type | Aantal Events | Status |
| :--- | :--- | :--- |
| `part_search` | 117.474 | ✅ Actief geregistreerd |
| `part_page_view` | 114.667 | ✅ Actief geregistreerd |
| `parts_search_results` | 8.314 | ✅ Actief geregistreerd |
| `model_page_view` | 2.860 | ✅ Actief geregistreerd |
| `model_identified` | 2.834 | ✅ Actief geregistreerd |
| `parts_search_no_results` | 425 | ✅ Actief geregistreerd |
| `comparison_viewed` | 78 | ✅ Actief geregistreerd |
| **`affiliate_click`** | **0** | ⚠️ **Vaste nulmeting** |

### Oorzaken van de 0-meting
1. **Ontbrekende tracking-handlers op `/onderdelen/`:**  
   In Fase 5 werd de interactieve onderdelenzoekmachine geïntroduceerd. De Amazon-aankoopknoppen in zowel de mobiele kaartweergave als de desktop tabelweergave bevatten weliswaar valide affiliate links (`href` met tag `srihldecoder2-21`), maar hadden **geen `onclick`-beacon** naar `/api/affiliate/track`.
2. **Ontbreken van aankoopknoppen op `ModelPartsPageTemplate`:**  
   Bezoekers die via Google of interne links landden op bijv. `/bosmaaiers/fs-460/onderdelen/` zagen een tabel met posities, onderdeelnummers en omschrijvingen, maar er was **geen aankoopkolom** aanwezig. Bezoekers moesten eerst doorklikken naar de specifieke onderdeelpagina (`/onderdeelnummer/:id/`).
3. **Client-side Cookie & AdBlock Barrière:**  
   De oude Google Analytics (GA4) implementatie is onderhevig aan consent-banners en browser-adblockers (uBlock Origin, Brave Shields), waardoor traditionele affiliate-events verloren gaan.

---

## 2. Geïmplementeerde Oplossing: Privacy-Vriendelijke Server-Side Click Tracking

Om dit lek structureel te dichten zonder inbreuk te maken op de privacy van de gebruiker (geen trackingcookies, geen fingerprinting, geen IP-opslag conform het privacybeleid), is de fail-open beacon-architectuur uitgebreid:

### A. Non-blocking Beacon Handler
In zowel `src/components/ModelPartsPageTemplate.js` als `src/components/PartsDiscoveryPageTemplate.js` is de universele beacon geïmplementeerd:

```javascript
window.handleAffiliateClick = function(el, ev, data) {
  try {
    var payload = JSON.stringify({
      provider: data.provider || 'amazon',
      marketplace: data.marketplace || 'amazon.nl',
      part_number: data.part_number,
      offer_type: data.offer_type || 'SEARCH_LINK',
      match_type: data.offer_type || 'SEARCH_LINK',
      asin_if_known: data.asin_if_known || null,
      product_verified: Boolean(data.product_verified),
      destination_url: el.href,
      query_variant: data.query_variant || null,
      section_context: data.section_context || null,
      page_path: window.location.pathname
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/affiliate/track', new Blob([payload], { type: 'application/json' }));
    } else if (window.fetch) {
      window.fetch('/api/affiliate/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }
  } catch (err) {
    // Fail-open: navigatie mag nooit worden geblokkeerd
  }
};
```

### B. Dekking op alle Commerciële Touchpoints
- **`/onderdelen/`:** Beide CTA's (mobiele kaart + desktop tabel) roepen nu direct `window.handleAffiliateClick` aan.
- **`/bosmaaiers/fs-460/onderdelen/` & alle modelpagina's:** Nieuwe `Aankoop`-kolom en onderhoudskaarten hebben nu directe koopknoppen met `handleAffiliateClick`.
- **`/onderdeelnummer/:id/`:** Bestaande gecontroleerde tracking gehandhaafd.

---

## 3. Reële Verkeers- en Conversie-Potentie

Op basis van 114.667 onderdeelweergaven en 117.474 zoekopdrachten:

1. **Direct Doorklikpotentieel:**
   - 114.667 bezoeken per meetperiode.
   - Bij een conservatieve doorklikratio (CTR) van **2,5%** naar Amazon via de nieuwe prominente 2-click aankoopknoppen:  
     $$\approx 2.866 \text{ gekwalificeerde affiliate-klikken per meetperiode}$$
2. **Hoge Zoekintentie Modellen (Top 5):**
   - **MS 260:** 261 onderdelen, 8 geverifieerde aankoopkandidaten (bougie, luchtfilter, membraan, ringkettingwiel).
   - **FS 460 C-EM:** 246 onderdelen, 16 geverifieerde aankoopkandidaten (bougie, luchtfilter, maaimes, draadspoel, tandwielvet, starterveer).
   - **MS 250:** 236 onderdelen, 10 geverifieerde aankoopkandidaten.
   - **MS 170:** 200 onderdelen, 7 geverifieerde aankoopkandidaten.
   - **FS 55:** 263 onderdelen, 4 geverifieerde aankoopkandidaten.
3. **Gemiddelde Bestelwaarde & Conversie:**
   - Typische slijtagedelen (bougies, filters, maaikoppen, kettingwielen): €15 – €45.
   - Amazon 24-uurs cookie attributie: elke aankoop die een bezoeker binnen 24 uur na doorklikken doet telt mee.

---

## 4. Kwaliteitswaarborg & Privacy-Integriteit

- **Geen cookies geplaatst:** Werkt uitsluitend via server-side SQLite event logging.
- **Fail-open:** Als de client offline is of `sendBeacon` blokkeert, opent de Amazon-pagina direct zonder vertraging.
- **Tag srihldecoder2-21:** Strikt gehandhaafd in alle links en fallbacks.
