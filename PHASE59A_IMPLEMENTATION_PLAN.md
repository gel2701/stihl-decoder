# PHASE 59A — Implementation Plan (for Phase 59B)

**Status:** proposal only. Phase 59A is READ_ONLY and this plan was not executed.
**Baseline:** `b0a388756924d723f88a52c41d41cebe399be379`
**Prerequisite:** merge the Phase 59A report PR (no code changes), then start 59B from a fresh branch off `main`.

---

## 1. Objective

Make affiliate clicks (a) eligible for commission, (b) verifiably on the right product where possible, (c) measurable without a redirect, and (d) compliant with the Amazon Associates agreement — without touching the parts catalog, fitments, or SEO indexation.

**Success definition**

| Metric | Baseline | Phase 59B target |
| :--- | :--- | :--- |
| Affiliate CTA href through same-site redirect | 18,373 / 18,373 | 0 |
| Pages with required Amazon Associate disclosure | 0 | All pages with an Amazon CTA |
| Privacy/cookie policy page | none | published and linked |
| Verified exact ASIN offers | 0 | pilot set, human-approved, evidence-stored |
| Verified click vs fallback click distinguishable | yes (events exist) | unchanged, plus beacon delivery rate |
| Catalog / fitment / SEO registry changes | — | 0 |

---

## 2. Workstreams

### WS1 — Remove the Redirecting Link (P0)

**Problem:** `/api/affiliate/out` returns `302` with no intermediate affirmative action; this matches the Amazon *Redirecting Link* definition, so purchases may be excluded from commission.

**Changes**

1. `src/components/PartDetailPageTemplate.js`
   - Render `offer.url` directly in the anchor `href`.
   - Keep `target="_blank"`, `rel="sponsored nofollow noopener"`.
   - Replace the inline `onclick` server-logging assumption with a beacon call.
2. New same-origin endpoint, e.g. `POST /api/affiliate/click`
   - Accepts only whitelisted fields (provider, marketplace, offer_type, match_type, asin_if_known, product_verified, part_number, query_variant, section_context, page_path).
   - Extracts `page_path` from the request, not from the body, to avoid spoofed attribution.
   - Returns `202` with no `Location` header.
   - Rate-limited with the existing affiliate limiter.
   - Fail-open: a logging failure must never block the Amazon navigation.
3. Delete or hard-disable `/api/affiliate/out` for affiliate navigation.
   - If kept for backward compatibility, keep the allowlist and tag validation, but no CTA may use it.
4. `scripts/audit_amazon_affiliate_links.mjs`
   - Add assertion: zero rendered CTA hrefs start with `/api/affiliate/out`.
   - Add assertion: every rendered CTA href host is in the marketplace allowlist and carries the configured tag.

**Acceptance**

- Rendered part page HTML contains `href="https://www.amazon.nl/s?k=...&tag=..."`.
- No same-site redirect between click and Amazon.
- Beacon events still appear in the analytics store with the same dimensions as before.
- Existing test suite passes.

**Risk:** losing click data. Mitigation: ship beacon endpoint first, verify delivery on staging, then switch the href.

---

### WS2 — Required disclosure (P0)

**Changes**

1. `src/affiliate/AffiliateDisclosure.js`
   - Add the Dutch equivalent of the required statement: `Als Amazon Associate verdien ik aan kwalificerende aankopen.`
   - Keep the existing explanation as a second sentence.
2. `src/components/PartDetailPageTemplate.js`
   - Move the disclosure **above** the CTA row or directly adjacent to the first CTA.
   - Raise contrast to WCAG AA for small text; do not rely on `text-2xs` gray-on-gray alone.
3. Add the same statement to the footer of any page carrying Amazon links, so it is present site-wide.

**Acceptance**

- Statement visible without interaction on desktop and mobile.
- Statement is present on every page that contains an Amazon CTA.
- No page claims an Amazon endorsement or sponsorship.

---

### WS3 — Privacy and cookie policy (P1)

**Changes**

1. Add a static route `/privacy` (and optionally `/cookiebeleid`) rendered by the existing SSR shell. No new indexable commercial pages; this is a legal page.
2. Content must cover:
   - Google Analytics 4, consent mode, and what is stored.
   - Amazon Associates: click cookies set by Amazon after a click, purpose, and that StihlDecoder does not control them.
   - Local storage used for consent and machine dossiers.
   - Contact and withdrawal of consent.
3. Link from the cookie banner and footer.

**Acceptance**

- Policy page reachable and linked.
- Banner text no longer implies Google is the only third party.
- No claim that the site sets no third-party cookies.

---

### WS4 — Verified-ASIN pilot (P1, gated)

**Scope:** 50–100 parts, chosen by fitment count and commercial relevance, not by catalog-wide automation.

**Hard rules**

- Human verification per ASIN: product page must show the STIHL part number, or the listing must be explicitly identified as compatible aftermarket with the correct machine scope.
- Record evidence per offer: ASIN, marketplace, verified URL, verification date, verifier, evidence type, OEM vs aftermarket, compatible model IDs.
- No title-only or search-snippet-only promotion.
- No bulk import from scraping.
- No price or availability stored.
- `match_type` must remain `MANUAL_ASIN` and `is_verified` must be true only with stored evidence.

**Data contract**

`data/affiliate/amazon_part_offers.json` gains entries only after all fields validate:

```
part_number, marketplace, asin, tag, match_type, is_verified,
verified_at, verified_by, evidence_url, evidence_type,
product_kind (OEM | AFTERMARKET), compatible_model_ids
```

**Acceptance**

- Pilot offers render the verified branch (`Waar te koop`, `Bekijk product op Amazon.nl`).
- Non-pilot parts still render the honest search fallback.
- Product-match sample re-run shows the pilot set as `VERIFIED_EXACT` or `VERIFIED_COMPATIBLE_AFTERMARKET`, with evidence links.
- Zero unverified offers in production.

**Kill criterion:** if fewer than ~30% of attempted parts yield a verifiable ASIN, stop and reconsider the model; do not lower the evidence bar.

---

### WS5 — UX and measurement (P2)

**Changes**

1. Mobile purchase strip for pages with a verified offer only.
2. Model-page availability indicator for verified offers only; no CTA for search-only parts.
3. Report fallback vs verified clicks separately; add beacon delivery rate.
4. Do not show prices/availability unless Amazon serves them.

**Acceptance**

- No verified styling leaks onto search links.
- Reporting separates the two offer types.
- Mobile CTA reachable without excessive scrolling on a representative part page.

---

## 3. Sequence

| Step | Work | Depends on | Gate |
| :--- | :--- | :--- | :--- |
| 1 | Beacon endpoint + tests | — | Events recorded, `202`, no redirect |
| 2 | Direct href switch | 1 | No `/api/affiliate/out` in rendered HTML |
| 3 | Audit script assertions | 2 | Script passes with new assertions |
| 4 | Disclosure rewrite + placement | — | Statement visible on all CTA pages |
| 5 | Privacy policy page + banner/footer links | 4 | Page live and linked |
| 6 | ASIN pilot data + verification workflow | 2 | 100% evidence-backed offers |
| 7 | Mobile strip + model-page indicator | 6 | Verified-only rendering |
| 8 | Reporting update | 1, 6 | Verified vs fallback visible |

Steps 3–5 can run in parallel with 1–2. Step 6 must not start before step 2, otherwise the pilot measures ineligible clicks.

---

## 4. Guardrails

- No catalog, fitment, supersession, or serial-evidence changes.
- No SEO registry changes and no new indexable pages.
- No automatic ASIN promotion, no LLM-inferred ASINs, no title-only matching.
- No price/availability display without Amazon-served data.
- No scraping, CAPTCHA solving, or access-control bypass.
- No second redirect, link shortener, or cloaking layer.
- No cross-site tracking or new analytics vendor without a separate privacy review.
- Fail closed on tag mismatch; fail open on click logging.

---

## 5. Verification plan

**Automated**

- `npm test`
- `node scripts/audit_amazon_affiliate_links.mjs`
- New assertions:
  - 0 CTA hrefs starting with `/api/affiliate/out`
  - 100% of CTA hrefs on allowlisted hosts with configured tag
  - 0 verified offers without evidence fields
- Rendered-HTML snapshot check for the disclosure sentence.

**Manual**

- One desktop and one mobile click-through per offer type, confirming the Amazon landing page and tag.
- Confirm no intermediate page.
- Confirm the disclosure is visible before the CTA.
- Re-run the 200-part product-match sample and record classifications with evidence.

**Rollback**

- Href switch: revert template commit; beacon endpoint is additive and harmless.
- Pilot offers: remove entries from `amazon_part_offers.json`; resolver falls back to search automatically.

---

## 6. Explicitly out of scope

- Phase 59B implementation itself (this document is the plan, not the execution).
- SEO indexation expansion for the 17,530 noindex part pages.
- Dropshipping, inventory, pricing feeds, or marketplace expansion.
- Paid acquisition and trademark bidding review.
- Any Codex Review or 9router workflow.
- Any change to the parts database.

---

## 7. Open decisions for the owner

1. Approve removing the intermediate redirect (required for commission eligibility).
2. Approve the Dutch wording of the required Amazon statement.
3. Approve a 50–100 part ASIN pilot scope and who performs human verification.
4. Decide whether the existing `/api/affiliate/out` endpoint is deleted or retained only for legacy/manual use.
5. Decide whether the privacy page ships as a new static route or as part of an existing legal section.
