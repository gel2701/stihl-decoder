# PHASE 50 — GITHUB BRANCH PROTECTION & RULESET SPECIFICATIE

## Status Overzicht

```text
BRANCH_PROTECTION_CONFIGURED = NO
MANUAL_ACTION_REQUIRED = YES
```

Omdat lokale tooling geen directe GitHub Administrative API tokens bezit, moeten de vereiste branch protection regels eenmalig via de GitHub webinterface worden ingeschakeld door de repository owner.

---

## 1. Vereiste Status Checks (Required Checks)

De nieuwe CI-workflow (`.github/workflows/ci.yml`) definieert drie onafhankelijke jobs die allen moeten slagen voordat een merge naar `main` is toegestaan:

1. **`node-contract-tests`**
   - Voert `npm ci` en `npm test` uit.
   - Bewaakt 19 canonieke productie test suites inclusief de nieuwe `critical_api_contracts.test.js`.

2. **`trust-audit`**
   - Voert `node scripts/audit_public_trust_claims.mjs` en `git diff --check` uit.
   - Bewaakt 257 publieke routes, sitemaps, technische claims, motor context en fragment-integriteit.

3. **`browser-e2e`**
   - Installeert Chromium via Playwright (`npx playwright install --with-deps chromium`).
   - Start de lokale testserver op en voert alle kritieke user journeys uit (`tests/e2e/critical-homepage.spec.js`, `tests/e2e/critical-routes.spec.js`).
   - Bewaakt zero unhandled page errors en zero failed network requests.

---

## 2. Exacte GitHub UI Stappen voor Repository Owner

Volg onderstaande stappen om de bescherming in te stellen op `main`:

1. Open de repository settings:
   `https://github.com/gel2701/stihl-decoder/settings/branches`
2. Klik op **"Add classic branch protection rule"** (of **"Add branch ruleset"** onder Rulesets).
3. Vul bij **Branch name pattern** in: `main`.
4. Vink de volgende opties aan:
   - ✅ **Require a pull request before merging** (optioneel: vereis minstens 1 review of self-review).
   - ✅ **Require status checks to pass before merging**.
   - ✅ **Require branches to be up to date before merging**.
5. Zoek en selecteer in de lijst met checks de drie exacte CI jobs:
   - `node-contract-tests`
   - `trust-audit`
   - `browser-e2e`
6. Vink de veiligheidsblokkades aan:
   - ✅ **Do not allow bypassing the above settings** (geldt ook voor administrators).
   - ✅ **Block force pushes** (voorkomt onbedoelde `git push --force`).
   - ✅ **Block deletions** (voorkomt verwijdering van de `main` branch).
7. Klik onderaan op **"Create"** (of **"Save changes"**).

Hiermee is gegarandeerd dat geen enkele commit of pull request naar `main` kan worden samengevoegd als de browser E2E, contract-tests of trust-crawler faalt.
