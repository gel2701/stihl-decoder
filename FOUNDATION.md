# 🏛️ Solid Foundation Baseline Document — STIHL Decoder v2.8.0-foundation

This document formally establishes version **`v2.8.0-foundation`** (Git Tag: `v2.8.0-foundation`) as the **immutable baseline foundation** for `stihldecoder.nl`. 

---

## 📜 Core Guiding Principles & Invariant Rules

### 1. Strict Search Type Routing & Display Contracts
The application enforces strict separation between search input types:

1. **9-Digit Serial Number Search (e.g. `178456789`)**
   - **Type:** `SERIAL_NUMBER`
   - **Renders:** `result-card`
   - **Features Enabled:**
     - Verified Fabriek & Herkomst (`Waiblingen`, `Virginia Beach`, etc.)
     - Geschatte Bouwperiode (`2016 - 2021`)
     - Complete Motor- & Service Specificaties (Cilinderinhoud, Vermogen, Bougie, Elektrodenafstand, Carburateur H/L/LA, Kettingsteek, Mengsmering)
     - **StopHeling® 1-Click Clipboard Auto-Copy & Direct Link**
     - **Stihl Paspoort Download Button** (1200x900px 4:3 PNG image exporter)

2. **11-Digit Part Number / Gietnummer Search (e.g. `1121 021 0800`)**
   - **Type:** `PART_NUMBER`
   - **Renders:** `warning-card` (Amber Warning Card)
   - **Strict Rules:**
     - ❌ NO "✓ GEVERIFIEERD" badge
     - ❌ NO Stihl Paspoort Download Button
     - ❌ NO StopHeling Police Check
     - ✅ Displays Model Group (`024 / 026 / MS 260`), machine specs, and advice on locating the true 9-digit serial on the metal crankcase.

3. **Model Name Search (e.g. `MS 261 C-M`, `MS 170`)**
   - **Type:** `MODEL_DECODE`
   - **Renders:** `model-card` (Blue Model Datablad Card)
   - **Strict Rules:**
     - ❌ NO "GEVALIDEERD SERIENUMMER" header
     - ❌ NO "✓ GEVERIFIEERD" badge (shows `📋 Model Datablad (Geen Serienummer Ingevoerd)`)
     - ❌ NO Stihl Paspoort Download Button
     - ❌ NO StopHeling Police Check
     - ✅ Displays clean technical specs & carburetor tuning guidance for the model family.

4. **Counterfeit / Fake Serial Number Search (e.g. starting with `0`, `999999999`)**
   - **Type:** `COUNTERFEIT`
   - **Renders:** `counterfeit-card` (Red Alert Banner)
   - **Features:** Identifies known clone patterns and gives educational tips on spotting fake STIHL chainsaws.

---

## 🛠️ Complete Feature Matrix Baseline (`v2.8.0-foundation`)

- **Interactive Gietklok (Casting Date Dial) Visualizer:** SVG dial with Dots/Arrow styles, quick year selection, assembly month estimator (+1-4 months), and physical locator guide.
- **StopHeling Police Integration:** Server-side `StopHelingService` with theft status verification & passport guard, plus client-side 1-click clipboard auto-copy.
- **Marktplaats Paspoort Generator:** 1200x900px PNG card canvas renderer with date stamp and theft verification status.
- **Programmatic SEO & Metadata:** Google Tag Manager (`G-P2V0J69LDX`), Schema.org JSON-LD graph, `/sitemap.xml`, and `/robots.txt`.
- **Database & Architecture:** Dual SQLite (`stihl_database.db`) & JSON (`stihl_database.json`) backend with seed script (`data/seed.cjs`).

---

## 🔒 Expansion Pledge
**No existing features, search routes, or technical specification displays will be dropped in future releases. All future work must build upon, extend, or optimize this foundation.**
