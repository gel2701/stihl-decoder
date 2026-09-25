# PHASE 49A — USER TRUST & FUNCTIONAL INTEGRITY AUDIT

**Repository:** `gel2701/stihl-decoder`  
**Base Commit:** `4e16a0dee53639a76caee93a69fd02f8357444de` (`origin/main`)  
**Feature Branch:** `fix/phase49a-user-trust-integrity`  
**Audit Date:** 2026-09-25  

---

## 1. Executive Summary & Core Principle

This audit inventories every publicly visible element, route class, CTA, form, guide, FAQ, and technical claim across STIHLDecoder.nl.

### Guiding Principles:
1. **IF WE SHOW IT → IT MUST WORK.**
2. **IF WE CLAIM IT → WE MUST BE ABLE TO PROVE IT.**
3. **IF WE CANNOT SUPPORT IT → DO NOT PUBLISH IT.**

---

## 2. Public Surface Inventory & Classification

| Route Class | Routes | Component / Template | Visible Claims | CTAs / Forms | Backend Functionality | Completeness | Relevance | Pre-Fix Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Homepage** | `/` | `index.html` | Serienummer Decoder, Herkomst, Model/Specs check, StopHeling external search | Form input + Analyseer button, StopHeling copy button, Mijn STIHL link | `GET /api/decode`, `GET /api/models` | COMPLETE | ALL | `WORKING` |
| **Category Pages** | `/<cat>/` (5 categories) | `CategoryPageTemplate.js` | Gepubliceerde modellen, Serienummercontrole | Secondary form `<form action="/" method="GET"><input name="q">` | SSR HTML, database filtering | COMPLETE | Category-scoped | `MISLEADING` (broken secondary form) |
| **Model Pages** | `/<cat>/<slug>/` | `ModelPageTemplate.js` | Specificaties, Bronstatus, Serienummer Rapport Pro (€4.99), Reparatie Service (24u), Inkoopbod | Pro card modal, Repair form, Sell form, `<form action="/" method="GET"><input name="q">`, Passport add CTA, Parts link | SSR HTML with evidence facts; Fake endpoints for leads; No checkout for Pro | INCOMPLETE / MISLEADING | Model-specific | `MISLEADING` (fake paid product & fake leads) |
| **Model Parts Pages** | `/<cat>/<slug>/onderdelen/` | `ModelPartsPageTemplate.js` | Onderdelenoverzicht, Carburateur/Membraan (all models), Bougie, Zoek bougie/ketting buttons | Fake search CTAs (`renderAffiliateLink` to `/onderdeelnummer/`) | SSR HTML | PARTIAL | IRRELEVANT ON ACCU/ELEC | `IRRELEVANT` (petrol copy on battery tools) |
| **Comparison Pages** | `/vergelijk/<slug>/` | `ComparisonPageTemplate.js` | Modelvergelijking op basis van evidence | Secondary form `<form action="/" method="GET"><input name="q">` | SSR HTML with registered pairs | COMPLETE | Chainsaw-only | `WORKING` (form needs cleanup) |
| **Valuation Preview** | `/waarde/<slug>/` | `server.js` (`renderValuationHtml`) | "Nog onvoldoende modelspecifieke marktdata", `noindex, follow` | Link to model page | SSR HTML, truthful no-data | COMPLETE | Model-specific | `SAFE` |
| **Valuation Landing** | `/stihl-waarde/` | `IntentPageTemplate.js` | "Taxatie inschatting", "Waardebepaling" | `<form action="/" method="GET"><input name="q">` | None (thin 27-char stub) | THIN_CONTENT | Generic | `THIN_CONTENT` |
| **Theft Check Landing** | `/stihl-diefstalcheck/` | `IntentPageTemplate.js` | "StopHeling politiedatabase check" | `<form action="/" method="GET"><input name="q">` | None (thin 26-char stub) | THIN_CONTENT | Generic | `THIN_CONTENT` |
| **Passport Hub** | `/stihl-paspoort/` | `IntentPageTemplate.js` (`renderPassportHubHtml`) | "Mijn STIHL Machinepaspoort", dossier beheer, onderhoud | Add machine, Add maintenance, Export JSON, Print | Client-side dossier manager | COMPLETE | ALL | `WORKING` |
| **Other Intent Pages** | 11 intent routes | `IntentPageTemplate.js` | SEO Titles with 20-35 character stubs | `<form action="/" method="GET"><input name="q">` | None | THIN_CONTENT | Generic | `THIN_CONTENT` |
| **Serial Location Guide**| `/gidsen/serienummer-locaties/`| `server.js` | "Waar staat het serienummer?" (previously title + description only) | Back to home link | SSR HTML | THIN (pre-audit) | Multi-category | `THIN_CONTENT` (pre-audit) |
| **Other Guides** | 5 guide routes | `server.js` (`renderGuidePageHtml`) | Title + description only (no body, no steps) | Back to home link | None | THIN_CONTENT | Various | `THIN_CONTENT` |
| **Part Series Hub** | `/onderdeelnummer/` | `server.js` (`renderPartNumberHubHtml`) | Onderdeelnummers & Reeksen | Links to prefixes 1121, 1130, 1141 | SSR HTML | COMPLETE | Parts-series | `WORKING` |
| **Part Series Routes** | `/onderdeelnummer/stihl-:series/` | `server.js` (`renderPartNumberSeriesHtml`) | Gekoppelde STIHL Modellen: `MS 261 C-M, MS 260, MS 271, MS 291` (hardcoded for all prefixes) | Link to part hub | Hardcoded string | BROKEN MAPPING | Series-specific | `MISLEADING` (hardcoded mapping) |
| **Lead API Endpoints** | `/api/v1/leads/repair`, `/api/v1/leads/sell` | `server.js` | "Reparatie/Verkoop Aanvraag Ontvangen! Wij nemen binnen 24 uur contact met u op / overnamebod" | Direct POST | Returns fake 200 without saving or processing | UNSUPPORTED | ALL | `BROKEN` |

---

## 3. Systematic Remediation Plan

### 3.1 Fake Paid Report Unmounting
- Remove `PassportProMvp` rendering from `ModelPageTemplate.js` and all other public templates.
- Remove all references to `€4.99`, `Directe download`, `Serienummer Rapport Pro`, and `Professioneel Verkooprapport` from public user-facing templates.
- Keep the free, local "STIHL Machinepaspoort" / "Mijn STIHL".

### 3.2 Fake Lead Flows Deactivation
- Remove repair lead card and sell lead card from `ModelPageTemplate.js`.
- In `server.js`, convert `/api/v1/leads/repair` and `/api/v1/leads/sell` from returning fake 200 OK HTML to returning `410 Gone` with `{ success: false, error: 'SERVICE_NOT_AVAILABLE' }`.
- Public HTML must never claim "Aanvraag ontvangen" or "binnen 24 uur contact".

### 3.3 Model Page Conversion Funnel
- Replace old funnel items ("Maak Serienummer Rapport", "Waardestatus bekijken", "Download verkooprapport", "marktwaarde") with real, functioning actions:
  1. `Voeg toe aan Mijn STIHL` (`/stihl-paspoort/#add=${slug}`)
  2. `Bekijk technische specificaties` (`#technische-gegevens`)
  3. `Bekijk onderdeleninformatie` (`${safePartsPath}`) — only when `safePartsPath` exists.

### 3.4 Broken `?q=` Forms Elimination
- In `CategoryPageTemplate.js`, `ComparisonPageTemplate.js`, `IntentPageTemplate.js`, and `ModelPageTemplate.js`:
  Remove `<form action="/" method="GET"><input name="q">` and replace with a direct, functional CTA link to `/#decoder` ("Serienummer controleren").
- In `index.html`:
  Add `#decoder` anchor target and implement URL search parameter ingestion (`?q=` / `?s=` / `?code=`) so any deep-link or direct query automatically executes the decoder on load.

### 3.5 Publication Status Architecture (`PUBLISHED` vs `HOLD`)
- Introduce central publication status definitions in `src/publicationRules.js`:
  - `GUIDE_PUBLICATION_STATUS`: Only `serienummer-locaties` is `PUBLISHED`. The other 5 guides are `HOLD`.
  - `INTENT_PUBLICATION_STATUS`: Only `stihl-paspoort` is `PUBLISHED`. The remaining 13 intent pages are `HOLD`.
- Routes on `HOLD` return HTTP 404 with a branded, helpful 404 page (linking to Home, Search, Mijn STIHL, and Decoder).
- `SitemapGenerator.js` filters out `HOLD` routes.
- Internal link hubs (`getRelevantPublicLinks`) only link to `PUBLISHED` pages.

### 3.6 Substantive Serial Location Guide (`/gidsen/serienummer-locaties/`)
- Rewrite with evidence-backed, practical advice:
  - 9-digit serial number vs 11-digit part number (Teilenummer).
  - Cleaning instructions (carefully remove sawdust and chain oil).
  - Pre-inspection safety (turn off machine, remove battery).
  - Category-by-category breakdown (chainsaws, brushcutters, blowers, hedge trimmers, cut-off saws, battery tools).
  - Stamped number in crankcase metal vs barcode sticker/type plate.
  - Clear disclaimer that exact position varies by generation/revision.
  - Direct links to homepage decoder.

### 3.7 Dynamic Part Series Mapping
- In `server.js`, remove hardcoded `MS 261 C-M, MS 260, MS 271, MS 291` from `renderPartNumberSeriesHtml()`.
- Dynamically filter `database.models` where `model.series_code === seriesCode`.
- Render real model links if models exist; if none exist, display truthful notice: *"Voor deze serie is nog geen betrouwbare modelkoppeling beschikbaar."*

### 3.8 Drive-Context Safety on Model Parts Pages
- In `ModelPartsPageTemplate.js`:
  - Battery/electric machines: suppress carburetor, membrane, 2-stroke oil, fuel filter, spark plug, and M-Tronic mentions.
  - Non-chainsaw tools: suppress chainsaw-specific chain/guide bar sections.
  - Update warnings: do not mention M-Tronic or crankcase flywheel revisions on battery tools.

### 3.9 Fake Part Search CTA Cleanup
- In `AffiliateLink.js`, update link label from misleading `Zoek <part>...` (which didn't search) to `Bekijk onderdeelnummers →`.
- Remove misleading `affiliate_click` analytics event for internal navigation links.

### 3.10 Related Models Relevance
- In `RelatedModels.js`, heavily penalize power source / fuel type mismatches (-50 pts).
- For battery tools, prioritize battery tools. For petrol, prioritize petrol.
- Filter out low-score irrelevancies.

### 3.11 FAQ Quality Gate
- In `ModelPageTemplate.js` and `StructuredData.js`:
  - Suppress "Hoe oud is mijn STIHL X?" unless verified production years or period exist on the model.
  - When present, provide the known production period and explain how to confirm with type plate or Gussuhr.
  - Provide practical, category-specific advice for "Waar vind ik het serienummer?" using `getSerialLocationAnswer()`.

---

## 4. Status Definitions

- **`WORKING`**: Feature is completely implemented, functional, and performs what it advertises.
- **`MISLEADING`**: Visible presentation makes claims or promises not supported by underlying code/data.
- **`BROKEN`**: UI element or endpoint fails to execute or returns incorrect responses.
- **`THIN_CONTENT`**: Page lacks substantive body content or answers to user search intent.
- **`IRRELEVANT`**: Content displayed is technically inapplicable to the machine's drive type or category.
- **`UNSUPPORTED`**: Claims or promises made cannot be verified or fulfilled.
- **`SAFE`**: Honest, accurate representation with appropriate disclaimers and indexing directives.
