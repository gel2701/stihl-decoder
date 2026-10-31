# PHASE 59A — Conversion Opportunities

**Scope:** current route only. READ_ONLY audit; no changes implemented.
**Baseline:** `b0a388756924d723f88a52c41d41cebe399be379`

---

## 1. Current funnel

```
Home / model search
  → model page (/stihl-<model>/)
    → part detail page (/onderdeelnummer/<11 digits>/)
      → commercial section ("Zoek dit onderdeel online")
        → CTA "Zoek op Amazon.nl"
          → /api/affiliate/out?...
            → HTTP 302
              → amazon.nl search results
```

Observed funnel facts:

| Stage | Count / behavior |
| :--- | :--- |
| Canonical parts with an Amazon CTA | 18,373 |
| Part pages indexable (`index, follow`) | 843 |
| Part pages noindex | 17,530 |
| Model pages with a direct Amazon CTA | 0 |
| Verified product offers | 0 |
| Click destination | Amazon **search results**, never a product page |
| Click path | Internal redirect, no intermediate affirmative action |

The commercial moment exists only on part pages, only after model → part navigation, and always terminates in a search result list.

---

## 2. Where conversion is lost

### 2.1 Eligibility loss before the click counts

**What happens:** the CTA points to `/api/affiliate/out`, which immediately `302`s to Amazon.

**Why it matters:** under the current Amazon Commission Income Statement, a link that sends users indirectly to Amazon via an intermediate site without an affirmative action on that site is a *Redirecting Link*, and resulting purchases are excluded from commission income. Every optimization below is secondary until this is fixed.

**Evidence:** `server.js` 490–700; `src/components/PartDetailPageTemplate.js` 415–454.

**Fix direction:** put the Amazon URL directly in `href`. Keep measurement with `navigator.sendBeacon` to a same-origin endpoint that returns `202` and never redirects.

---

### 2.2 Intent mismatch at the destination

**What happens:** the user asks for a specific STIHL part number and lands on a generic Amazon search page with mixed OEM and aftermarket results.

**Why it matters:** the user must re-identify the part inside Amazon's UI, and is actively exposed to cheaper aftermarket substitutes. For `1123 160 2050`, public index evidence shows aftermarket clutch kits ranking on the OEM number. That converts poorly and increases wrong-part purchases.

**Evidence:** `PHASE59A_PRODUCT_MATCH_SAMPLE.json`; observed ASINs `B0FR969PZ7`, `B09X9QR1TX`, `B0BR355ZQS` for `1123 160 2050` (indexed snippets only, Amazon pages blocked).

**Fix direction:** verified ASINs for a small, high-fitment subset. No automatic promotion. The search fallback stays for everything else.

---

### 2.3 CTA is structurally late and visually quiet

**What happens:** the commercial section is rendered after the model, fitment, and diagram content. On mobile it sits below a long page. The CTA is one orange button inside a card; the disclosure is `text-2xs` gray at the bottom of the same card.

**Why it matters:** users who already know the part number must scroll through content they do not need, and users who do not know it may not reach a buying option at all. The disclosure is present but not prominent.

**Evidence:** `PartDetailPageTemplate.js` 384–460; section order in the template.

**Fix direction:** a compact sticky or above-the-fold purchase strip on mobile when an offer exists; move the Amazon statement above the CTA; raise contrast to WCAG AA for small text.

**Guardrail:** do not add a CTA to pages that have no offer state; do not imply stock or price.

---

### 2.4 No offer state on model pages

**What happens:** model pages list parts and link to part pages. There is no "buy this part" affordance at the model level.

**Why it matters:** the model page is where the user confirms "this is my machine". That is the highest-context moment, and it is monetized zero times.

**Fix direction:** only after verified offers exist, show a compact "Beschikbaar" indicator or direct CTA for parts with a verified ASIN. Never for search-only links.

---

### 2.5 Most affiliate pages have no organic entry

**What happens:** 843 of 18,373 part pages are indexable. The remaining 17,530 are `noindex`.

**Why it matters:** the affiliate layer is technically present on 18,373 pages but commercially reachable on 843. Adding ASINs without traffic changes nothing.

**Fix direction:** out of scope for Phase 59B unless paired with an SEO decision; Phase 59A explicitly forbids new indexable pages.

---

### 2.6 Missing-offer handling is invisible

**What happens:** there is no "no offer found" state. Every part gets the same fallback, so a part with genuinely no Amazon supply looks identical to a part with abundant supply.

**Why it matters:** the user cannot tell whether the search is likely to succeed, and the site cannot measure fallback quality.

**Fix direction:** add an explicit fallback label (already partly present) and track fallback click-through separately from verified-product click-through. Both events already exist: `amazon_search_fallback_click` and `amazon_verified_product_click`.

---

### 2.7 Measurement depends on the thing that must be removed

**What happens:** server-side click logging runs inside `/api/affiliate/out`.

**Why it matters:** removing the redirect removes the logging trigger unless measurement is redesigned first. That coupling is why the redirect has survived.

**Fix direction:** same-origin beacon endpoint, `POST`, `202`, whitelisted metadata, rate-limited, no redirect on that route.

---

## 3. Opportunities, ranked

Scores are qualitative and explicitly not revenue forecasts. No traffic or commission data was available.

| # | Opportunity | Impact | Effort | Confidence | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| C1 | Direct Amazon href, remove intermediate 302 | Very high — restores commission eligibility | M | High | P0 |
| C2 | Required Amazon Associate disclosure, prominent | High — compliance/account protection | S | High | P0 |
| C3 | Privacy/cookie policy naming Amazon and GA4 | High — contractual + legal | S | High | P1 |
| C4 | Verified-ASIN pilot on top ~50–100 parts | High — real product pages instead of search | L | Medium until pilot data | P1 |
| C5 | Mobile purchase strip + disclosure placement | Medium — click-through | S | Medium | P2 |
| C6 | Model-page availability signal for verified parts | Medium — contextual buying moment | M | Medium | P2 |
| C7 | Fallback vs verified click reporting | Medium — decision quality | S | High | P2 |
| C8 | Expand indexable commercial pages | High long-term, but out of scope | XL | Low until C1–C4 proven | P3 |

---

## 4. Measurement plan (no new tracking vendor)

Existing events are sufficient:

- `affiliate_click` — general click.
- `amazon_search_fallback_click` — search-only offer.
- `amazon_verified_product_click` — verified offer.

Add only what is needed for the redirect fix:

| Metric | Definition | Why |
| :--- | :--- | :--- |
| `affiliate_click_total` | All affiliate CTA clicks | Baseline demand |
| `affiliate_click_verified_share` | Verified clicks / total | Measures ASIN coverage effect |
| `affiliate_beacon_delivery_rate` | Beacon accepted / CTA clicks | Ensures measurement survives redirect removal |
| `part_page_to_click_rate` | Clicks / part page views | CTA placement effect |
| `fallback_zero_result_rate` | Manual sample of fallback destinations with no relevant result | Search quality, sampled not scraped |

Constraints:

- No cross-site cookies, no fingerprinting, no hidden redirect.
- GA4 stays consent-gated (`analytics_storage` denied until opt-in; ad signals denied).
- Server logs keep the existing whitelist; no free-text or PII.

---

## 5. What not to do

- Do not add ASINs by scraping Amazon or by guessing from titles.
- Do not label a search link as a verified product.
- Do not show prices or availability without Amazon-served data.
- Do not add a second redirect hop to "fix" tracking.
- Do not optimize CTA color/copy before C1 ships; it would optimize clicks that may not pay.
- Do not add new indexable pages in Phase 59B without an explicit SEO decision.

---

## 6. Acceptance criteria for the conversion work

Phase 59B conversion work is done when:

1. Rendered CTA `href` is an `https://www.amazon.nl/...` URL with the configured tag, on every part page.
2. No affiliate CTA click passes through a same-site redirect.
3. Click measurement still records provider, part number, offer type, page path, and verified flag, with a measured beacon delivery rate.
4. The required Amazon Associate statement is visible next to the first CTA on desktop and mobile.
5. A privacy/cookie policy page exists and is linked from the banner and footer.
6. Verified offers, if any, are human-approved, stored with evidence, and visually distinct from search fallbacks.
7. `scripts/audit_amazon_affiliate_links.mjs` still passes, plus a new assertion that no CTA href starts with `/api/affiliate/out`.
