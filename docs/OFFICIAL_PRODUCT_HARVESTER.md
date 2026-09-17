# Official Product Harvester (STIHL BR)

First-party harvester for official STIHL manufacturer product data.
Market: **BR** (`loja.stihl.com.br`, `pt-BR`). No browser automation.

## Architecture

```
lib/officialHarvester/
  discovery.js     sitemap-first catalog discovery (deterministic)
  productPage.js   JSON-LD + VTEX spec/manual/image parsing (no deps)
  normalize.js     pt-BR labels -> canonical fields, decimal comma, units
  evidence.js      CANDIDATE evidence + deterministic SHA-256 (excl. retrieved_at)
  matching.js      EXACT/MODEL/NEW/AMBIGUOUS matching + field verdicts
scripts/harvest_stihl_official_products.js   runner (concurrency, retries, reports)
```

## Data sources (in preference order)

1. **Sitemap feed** `https://loja.stihl.com.br/sitemap/product-0.xml` (~200 product URLs).
   Official catalog feed; deterministic; preferred over DOM scraping.
2. **Product pages** (`/slug/p`): JSON-LD Product (`name`, `mpn` = STIHL article
   number, `image`, `description`), `TechnicalSpecificationName/Value` pairs,
   `linkManual` PDF anchors, `/arquivos/ids/` product media.
3. **Fallback**: `todos-os-produtos` HTML only renders a paginated subset
   (~10 links), so it is a fallback, never the primary source.

Why no Selenium/Puppeteer/Playwright: the full catalog is discoverable via the
official sitemap and every product page is server-rendered HTML (specs, JSON-LD
and manual links present in the first response). A browser would add nothing but
flakiness.

## Commands

```bash
# smoke (3 products)
npm run harvest:official:smoke
# full BR catalog
npm run harvest:official:br
# custom
node scripts/harvest_stihl_official_products.js --limit 20 --concurrency 4
node scripts/harvest_stihl_official_products.js --urls "https://loja.stihl.com.br/motosserra-ms-162/p"
```

Output (gitignored): `data/generated/official_products/BR/`

- `<slug>.candidate.json` — one candidate per product
- `latest_summary.json` — machine-readable totals
- `latest_report.md` — human review report

## Evidence model

```json
{
  "schema_version": 1,
  "source_class": "OFFICIAL_MANUFACTURER_PRODUCT_PAGE",
  "source_name": "STIHL_BR_OFFICIAL_STORE",
  "market": "BR",
  "language": "pt-BR",
  "promotion_status": "CANDIDATE",
  "automatic_promotion_allowed": false,
  "source_url": "...",
  "retrieved_at": "...",
  "model_name": "MS 162",
  "product_reference": "1148-200-0249",
  "specs": {},
  "raw_specs": {},
  "manuals": [],
  "images": [],
  "evidence_hash": "..."
}
```

`evidence_hash` is SHA-256 over content only — `retrieved_at` is excluded, so
re-harvests of identical content hash identically. `raw_specs` always preserves
the original STIHL text; `manuals` is an array (products can have several
documents); images exclude SVG/login/icons and are `&amp;`-normalized +
deduped.

## Safety rules

- `automatic_promotion_allowed = false`, always.
- The harvester NEVER writes `data/stihl_database.json` or
  `data/public_evidence_facts.json` (hash-verified before/after every run;
  `tests/official_harvester_safety.test.js` enforces this statically and
  dynamically).
- Promotion is a separate, manual review step (not implemented here by design).

## Market differences

A BR value conflicting with an existing (EU/NL/DE/US) value is classified
`POSSIBLE_MARKET_VARIANT`, never silently treated as a database error.
Numeric comparison is strict — real differences are `CONFLICT_REVIEW_REQUIRED`,
never hidden behind tolerances. Only explicit conversions (ml↔l, decimal
comma) are normalized.

## Matching

1. exact STIHL product/reference number (when the DB holds one),
2. exact normalized model name,
3. controlled alias list (explicit, in `matching.js`),
4. otherwise `NEW_MODEL`; duplicates/unclear → `AMBIGUOUS_MODEL` (+
   `review_required: true`). No fuzzy auto-linking.

## Field verdicts

`MATCH` · `DATABASE_MISSING` · `SOURCE_MISSING` · `CONFLICT_REVIEW_REQUIRED` ·
`POSSIBLE_MARKET_VARIANT`

`HIGH_VALUE_DATABASE_CANDIDATES` = official + missing in DB + exact model
match + unambiguous scalar + no market conflict. Reported only, never promoted.

## Review / promotion flow

1. Run harvest → inspect `latest_report.md`.
2. Review `conflicts`, `database_gaps`, `high_value_database_candidates`.
3. Human decides per field; promotion happens through the existing canonical
   processes, never from this harvester.

## Troubleshooting

- `fetch failed 403/429`: lower `--concurrency`, retry later ( exponential
  backoff is built in, 3 tries per product; one product failure never aborts
  the run).
- `products_failed` in summary lists per-URL errors.
- Manual `UNREACHABLE`: PDF link found but HEAD/GET failed — check manually;
  use `--skip-manual-check` for offline/air-gapped runs.
- `AMBIGUOUS_MODEL`: duplicate model names in DB — resolve by reference number.

## Note on `fetch-stihl-products@2.0.5`

Dev-only dependency, unused by any repository code (only referenced in
`package.json`/`package-lock.json`). Redundant since this first-party
harvester; kept installed per policy — removal is a one-line follow-up once
confirmed nothing else needs it.
