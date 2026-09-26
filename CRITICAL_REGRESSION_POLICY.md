# CRITICAL REGRESSION POLICY & PRODUCTION SAFETY NET

## 1. Onveranderlijke Regels voor Ontwikkeling & Kwaliteitsborging

1. **Elke productiebug krijgt een permanente regressietest**
   Zodra een defect in productie of staging optreedt, wordt eerst een test geschreven die reproduceert en permanent vastlegt dat dit gedrag nooit meer onopgemerkt kan falen.

2. **Critical contract tests worden niet verwijderd of verzwakt**
   Het verwijderen, uitcommentariëren of afzwakken van critical contracts (`tests/criticalContracts.js`, `tests/e2e/`, `tests/homepage_browser_module_graph.test.js`) om een pull request of feature kunstmatig 'groen' te maken is ten strengste verboden. Falende tests wijzen op een defect in de feature, niet in het veiligheidsnet.

3. **Bewuste gedragswijzigingen vereisen expliciete architecturale motivatie**
   Indien een specificatie of UI-interactie bewust verandert, moet dit expliciet in een document of audit-log worden gemotiveerd en goedgekeurd vóórdat een test mag worden aangepast.

4. **Elke nieuwe browsermodule vereist automatische dependency-graph validatie**
   Elke module die in de browser wordt ingeladen (`<script type="module">`) moet:
   - Publiek geserveerd worden met status HTTP 200 en `Content-Type: text/javascript; charset=utf-8`;
   - Nul Node.js built-ins (`fs`, `path`, `crypto`, `url`, etc.) bevatten;
   - Nul server-only backend modules (`src/decoder.js`, database drivers) importeren.

5. **Nieuwe interactieve functies vereisen minimaal één Playwright E2E-test**
   Elke nieuwe interactieve user journey (knoppen, formulieren, modals, zoekfuncties) moet worden afgedekt door een end-to-end browser test in een echte Chromium browser.

6. **`npm test` alleen is nooit voldoende voor browserfunctionaliteit**
   Unit tests en API contract tests draaien in Node.js en vangen geen browser module-laadfouten, syntax-incompatibiliteiten of DOM binding-problemen op. Browser functionaliteit is pas gevalideerd wanneer `npm run test:e2e` groen is.

7. **Productie is pas VERIFIED na live smoke test**
   Een deployment op productie (Render) wordt pas als operationeel beschouwd na het succesvol uitvoeren van `npm run test:live-smoke` (`scripts/live_browser_smoke_test.mjs`).

---

## 2. Documentatie Incident: Homepage Analyseer-Knop (Hotfix Homepage Decoder Browser Modules)

- **Incident:**
  Invoer van serienummers in de decoder op de homepage en klikken op "Analyseer" (of Enter) voerde geen enkele actie uit; de pagina reageerde niet.

- **Root Cause:**
  De browser ES-module dependency graph in `index.html` bevatte via componenten transitive imports naar `src/decoder.js` en `src/publicEvidence.js`. Omdat `decoder.js` server-only is en Node built-ins bevat, diende `server.js` dit bestand terecht niet uit (HTTP 404). Hierdoor faalde de ES-module parsing in de browser client runtime *vóór* het `DOMContentLoaded` event, waardoor de click listener en Enter key listener op `#search-btn` en `#code-input` nooit werden geregistreerd.

- **Permanente Borging:**
  1. `src/plantResolver.js` afgesplitst als pure browser-safe module.
  2. `src/publicEvidence.js` en `src/plantResolver.js` opgenomen in `PUBLIC_EXACT_FILES`.
  3. `tests/homepage_browser_module_graph.test.js` bewaakt recursief alle 9 browser modules en eist HTTP 404 voor `src/decoder.js`.
  4. `tests/e2e/critical-homepage.spec.js` test klik en Enter in echte Chromium.
  5. `tests/critical_api_contracts.test.js` valideert API contracts voor serials, parts en modellen.
  6. `scripts/live_browser_smoke_test.mjs` test live productie end-to-end.

**REGRESSION_LOCKED = true**
