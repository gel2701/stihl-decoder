# PHASE 59A — Amazon Affiliate Reliability & Conversion Audit

**Repository:** `gel2701/stihl-decoder`
**Baseline:** `b0a388756924d723f88a52c41d41cebe399be379` (`origin/main`)
**Audit branch:** `audit/phase59a-affiliate-reliability`
**Mode:** READ_ONLY. No production code, catalog, SEO registry, or affiliate data changed.
**Audit date:** 2026-10-31

---

## 1. Executive summary

The affiliate foundation is **technically clean and commercially inert**.

- Every one of the **18,373** catalog parts renders exactly one Amazon.nl **search** link.
- There are **zero** direct ASIN links, zero verified product offers, and an empty override file.
- The tag `srihldecoder2-21` is applied correctly and is environment-driven.
- Disclosure exists, but it is **not the disclosure Amazon requires**.
- Every click passes through an internal `302` redirect. Under the current Amazon Commission Income Statement, that pattern is the definition of a **Redirecting Link**, and purchases through it are **excluded from commission income**.
- Product matching cannot be verified at scale because Amazon search returned **HTTP 503** and product pages returned a **CAPTCHA**. No bypass was attempted.

**Bottom line:** the site is not at risk of publishing false product claims, because it publishes none. The primary risk is that it may be doing compliant-looking affiliate work that **cannot earn commission**, while the 18,373 search links create a poor, low-intent user experience.

| Question | Answer |
| :--- | :--- |
| Affiliate links audited | **18,373** generated links + **200**-part deep sample |
| Verified exact product matches | **0** |
| Verified compatible aftermarket matches | **0** |
| Search-only, unverified | **18,373** (199 of 200 individually sampled) |
| Incorrect matches | **0 confirmed** (cannot confirm any match) |
| Access blocked | **1** sampled part with observed candidate listings |
| Highest-severity compliance issue | Required disclosure absent + Redirecting Link commission exclusion |

---

## 2. Existing affiliate architecture

### 2.1 Link generation

`src/affiliate/AmazonAffiliateProvider.js` builds:

```
https://amazon.nl/s?k=STIHL+<part>&tag=<AMAZON_ASSOCIATE_TAG>
```

Two deterministic variants, selected by a hash of the part number:

| Variant | Query form | Count | Share |
| :--- | :--- | ---: | ---: |
| `VARIANT_A` | `STIHL 1123 160 2050` | 9,164 | 49.9% |
| `VARIANT_B` | `STIHL 11231602050` | 9,209 | 50.1% |

No randomness at request time; the same part always yields the same query and URL.

### 2.2 Tag application

- Source: `process.env.AMAZON_ASSOCIATE_TAG`, with regional override `AMAZON_ASSOCIATE_TAG_<SUFFIX>`.
- Live observation: `srihldecoder2-21` on rendered production pages and in generated URLs.
- Repository scan: **0** hardcoded tracking tags.
- `render.yaml` does **not** declare the variable; the live value comes from the Render dashboard.
- `/api/affiliate/out` rejects a destination whose `tag` does not match the configured environment tag.

### 2.3 Marketplaces

Allowlisted in `server.js`: `amazon.nl`, `www.amazon.nl`, `amazon.de`, `www.amazon.de`, `amazon.com`, `www.amazon.com`.

Actually generated: **amazon.nl only, 18,373 / 18,373**. No regional tags are configured, so international routing is currently unused surface area, not a working feature.

### 2.4 Mobile vs desktop

No difference. Rendering is server-side and identical; the same link, label, and disclosure are emitted. Layout is responsive (`flex-col` → `sm:flex-row`), but the commercial section is structurally identical on both.

### 2.5 Which parts show a purchase link

All 18,373 parts resolve an offer, because the resolver always returns a search fallback when no override exists. Practical exposure is narrower:

| Surface | Count |
| :--- | ---: |
| Canonical parts with a generated Amazon link | 18,373 |
| Part detail pages marked `index, follow` | 843 |
| Part detail pages marked `noindex, follow` | 17,530 |

The commercial CTA is therefore present on 18,373 pages, but only **843** are organically discoverable entry points.

### 2.6 Technical validity

- URL shape is valid; `https://amazon.nl/s?k=...&tag=...` returns `301` to `https://www.amazon.nl/s?k=...&tag=...` with the tag preserved.
- Amazon then returned **HTTP 503** for search and a **CAPTCHA** page for `/dp/<ASIN>`.
- Result relevance, result count, and product availability therefore **cannot be verified**.
- The links are syntactically valid and tag-correct; they are **not** verified to produce a good result page.

### 2.7 Missing or invalid product matches

There is no "no offer" state. A part with no override silently receives the same search link as every other part. The UI compensates honestly:

- Heading: `Zoek dit onderdeel online`
- Pill: `Online zoeken`
- Badge: `Amazon-zoekopdracht`
- CTA: `Zoek op Amazon.nl`
- Intro: availability and exact match are explicitly **not** confirmed.

The verified branch (`Waar te koop`, `Bekijk product op Amazon.nl`) exists but is unreachable while the override file is empty.

---

## 3. Product matching

### 3.1 Method

- Deterministic systematic sample: sort all 18,373 parts by part number, take every 91st record starting at index 45, force-include `11231602050`. Exactly **200** parts.
- Static analysis for all 200: query construction, tag, variant, fitment count, model scope, section.
- Live/public probing where access existed:
  - Amazon.nl search: **ACCESS_BLOCKED** (HTTP 503).
  - Amazon.nl product page: **ACCESS_BLOCKED** (CAPTCHA at `/errors_page/validateCaptcha`).
  - DuckDuckGo HTML index: worked briefly, then returned a bot challenge.
  - Bing HTML index: returned pages but no amazon.nl organic results even for a part that DuckDuckGo demonstrably indexed; treated as **inconclusive**, not as evidence of absence.

### 3.2 Results

| Classification | Count | Meaning |
| :--- | ---: | :--- |
| `VERIFIED_EXACT` | 0 | No OEM product match could be confirmed |
| `VERIFIED_COMPATIBLE_AFTERMARKET` | 0 | No aftermarket match could be confirmed live |
| `SEARCH_ONLY_UNVERIFIED` | 199 | Search URL only; match unknown |
| `INCORRECT_MATCH` | 0 | None confirmable |
| `UNAVAILABLE` | 0 | Not enough access to prove unavailability |
| `ACCESS_BLOCKED` | 1 | Candidate listings observed; page could not be opened |

### 3.3 What the public index did show

For `1123 160 2050` (clutch, 20 models, 44 fitments), the index surfaced amazon.nl listings whose titles reference the OEM number:

- `B0FR969PZ7`
- `B09X9QR1TX`
- `B0BR355ZQS`

The visible title pattern is an **aftermarket clutch kit** for 017/018/021/023/025/MS170/MS180-class machines. That is exactly the ambiguity that matters commercially:

- A buyer searching for an OEM STIHL clutch may land on a cheap aftermarket kit.
- The site cannot distinguish OEM from aftermarket because it sends a text query, not a product identity.
- No ASIN from this observation was written into an offer file, promoted, or presented as verified.

For `0000 007 1043` the index returned **no** amazon.nl result. That is recorded as "no indexed listing observed", **not** as `UNAVAILABLE`.

### 3.4 Matching verdict

Search-query linking cannot produce reliable product matching for an 18,373-part catalog with heavy OEM/aftermarket overlap. The query is specific enough to find *something*; it is not specific enough to guarantee the *right* thing. Direct ASIN linking is the only path to `VERIFIED_EXACT`, and it requires per-part human verification that does not exist today.

---

## 4. Compliance

Full machine-readable detail: `PHASE59A_COMPLIANCE_CHECK.json`.

Verified against:

- Amazon Associates Program Operating Agreement, **updated October 15, 2025**
- Amazon Associates Program Policies, **updated April 14, 2026**
- Amazon.nl and Amazon.co.uk regional agreement landing pages

### 4.1 Failures

**COMPLIANCE-01 — Required disclosure absent (HIGH).**

The agreement requires the sentence *"As an Amazon Associate I earn from qualifying purchases."* or a substantially similar previously allowed statement, clearly and prominently. The site says:

> "Sommige links op deze pagina zijn affiliatelinks. Als je via zo'n link iets koopt, kan StihlDecoder een commissie ontvangen. Dit kost jou niets extra."

That is an honest generic disclosure, but it is not the Amazon statement and there is no evidence it was ever an approved equivalent.

**COMPLIANCE-02 — Redirecting Link pattern (HIGH).**

Every CTA href is `/api/affiliate/out?...`, which answers `302` to Amazon with no intermediate page and no affirmative action. The Commission Income Statement defines a *Redirecting Link* as a link that sends users indirectly to Amazon via an intermediate site **without requiring an affirmative action on that intermediate site**, and excludes resulting purchases from commission income. The pattern matches. This is the single highest commercial risk in the audit: the site may be generating clicks that can never earn.

It also sits close to Participation Requirement 6(v), which prohibits obscuring the URL of the site containing Special Links, including by use of Redirecting Links.

**COMPLIANCE-03 — Privacy/cookie disclosure incomplete (HIGH).**

No dedicated privacy or cookie policy page was found. The cookie banner discloses the Google tag and consent mode only. It does not disclose that Amazon may set cookies after an affiliate click. The agreement makes this the associate's explicit responsibility, and GDPR/ePrivacy transparency applies independently.

### 4.2 Passes

- No prices, stock, ratings, reviews, or delivery claims.
- No misleading product claims; search-only UI is honest.
- One environment-driven tag; no hardcoded tags; tag validated server-side.
- CTA text clearly identifies Amazon.
- No Amazon logos or Program Content.
- No click incentives.
- No Amazon scraping or CAPTCHA circumvention at runtime or during this audit.

### 4.3 Not applicable today

- PA API/Creators API caching and image rules.
- Price timestamp and price-change disclaimers.
- Paid-search trademark restrictions.

These become applicable the moment Phase 59B adds product data or paid acquisition.

---

## 5. Conversion analysis

Full detail: `PHASE59A_CONVERSION_OPPORTUNITIES.md`.

### 5.1 Current route

`Model search → model page → part page → commercial section → /api/affiliate/out → Amazon.nl search results`

Friction points, in order of commercial impact:

1. **The click cannot reliably earn.** The redirect pattern is the dominant problem; conversion optimization on top of it optimizes the wrong metric.
2. **Search results are not a product page.** The user lands on a list, must re-identify the part, and is exposed to aftermarket substitutes.
3. **Only 843 of 18,373 part pages are indexable.** Most affiliate-capable pages have no organic entry.
4. **No offer state on model pages.** The buying moment is on the part page only, after the user has already done model → part navigation.
5. **Zero verified offers.** The strongest CTA (`Bekijk product op Amazon.nl`) never renders.
6. **Disclosure is low-contrast 2xs text at the bottom of the section.** Honest, but easy to miss.
7. **Measurement is coupled to the redirect.** Fixing the link breaks click logging unless logging is redesigned at the same time.

### 5.2 Impact framing

No traffic, click, or revenue data was available in this audit, so no revenue number is asserted. Directionally:

- Fixing the redirect affects **100%** of affiliate clicks and is the only change that can move commission eligibility from "likely excluded" to "eligible".
- Adding verified ASINs affects only the parts where a human confirms a match; the ceiling is unknown until a pilot proves hit rate.
- Improving CTA placement and offer states affects click-through, but cannot compensate for an ineligible click.

---

## 6. Risks

| ID | Risk | Severity | Evidence | Commercial effect |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Redirecting Link excludes purchases from commission | HIGH | `server.js` 302 path; Commission Income Statement definition | Clicks may earn nothing |
| R2 | Required Amazon disclosure absent | HIGH | `AffiliateDisclosure.js` | Compliance/account risk |
| R3 | No privacy/cookie policy naming Amazon | HIGH | No route; banner text | Contractual + GDPR risk |
| R4 | Search results produce OEM/aftermarket mismatch | HIGH | 1123 160 2050 index evidence | Wrong-part purchases, returns, trust loss |
| R5 | 17,530 affiliate pages are `noindex` | MEDIUM | 843 indexable / 18,373 total | Most links have no organic path |
| R6 | Zero verified offers | MEDIUM | `offers: []` | Weakest possible affiliate conversion |
| R7 | Measurement depends on redirect | MEDIUM | Logging inside `/api/affiliate/out` | Fixing R1 breaks analytics unless redesigned |
| R8 | Regional tags unconfigured while hosts allowlisted | LOW | 6 hosts, NL only | Future international clicks could fail closed |

---

## 7. Priority

1. **P0 — Remove the intermediate redirect** and move click measurement to a non-blocking same-origin beacon. Without this, nothing else can pay.
2. **P0 — Add the required Amazon Associate statement** in Dutch, clearly and prominently, next to the CTA.
3. **P1 — Publish a privacy/cookie policy** that names Google Analytics and Amazon Associates cookies.
4. **P1 — Run a small verified-ASIN pilot** on high-fitment parts, human-verified, no automatic promotion.
5. **P2 — Improve the offer state**: distinguish "verified product" from "search only" at the model-page level, not only on the part page.
6. **P3 — Expand indexable commercial pages** only after the economics are proven; this is SEO work, outside Phase 59A.

---

## 8. Evidence and limits

**Verified directly**

- Repository code paths, rendering, link construction, tag resolution, redirect behavior, UI copy, disclosure text, analytics wiring.
- `node scripts/audit_amazon_affiliate_links.mjs` → PASS: 18,373 fallback links, 0 direct ASINs, 0 uncontrolled `/dp/` links, 0 unverified product claims.
- Live production page render for `11231602050`.
- Amazon.nl search `301` to `www`, tag preserved; then `503`.
- Amazon.nl product page CAPTCHA.
- Official Amazon agreement and policy text, including exact disclosure sentence and Redirecting Link definition.
- Public index snippets for two part numbers.

**Not verified**

- Actual Amazon result sets, product relevance, prices, availability, seller identity.
- Associates account status, traffic approval, click/commission ledger.
- Mobile visual rendering by screenshot; assessment is structural, from SSR markup and CSS classes.

**Deliberate non-actions**

- No CAPTCHA solving, no header spoofing to defeat bot checks, no proxy rotation, no Cloudflare bypass.
- No ASIN invented, promoted, or inserted.
- No production change, no SEO change, no new indexable page.
- No Phase 59B work started.

---

## 9. Deliverables

| File | Contents |
| :--- | :--- |
| `PHASE59A_AFFILIATE_AUDIT.md` | This report |
| `PHASE59A_LINK_INVENTORY.json` | Full inventory of 18,373 generated links + construction metadata |
| `PHASE59A_PRODUCT_MATCH_SAMPLE.json` | 200-part deterministic sample with classifications and evidence |
| `PHASE59A_INDEX_PROBES.json` | Raw public-index probe log, including failed/inconclusive probes |
| `PHASE59A_COMPLIANCE_CHECK.json` | 12 verified requirements + 2 recommendations, with quotes and status |
| `PHASE59A_CONVERSION_OPPORTUNITIES.md` | Funnel analysis and prioritized opportunities |
| `PHASE59A_IMPLEMENTATION_PLAN.md` | Phase 59B plan, acceptance criteria, guardrails |
