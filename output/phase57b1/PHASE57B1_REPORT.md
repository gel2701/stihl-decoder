# STIHLDECODER — PHASE 57 B.1 — BATCH 1 DISCOVERY QUALITY CORRECTION & CANDIDATE RECOVERY

## Baseline
- main SHA: `5f49f977cab4500611337c792b12c49f87fa4076`
- expected main SHA: `5f49f977cab4500611337c792b12c49f87fa4076`
- HEAD == origin/main at phase start: `5f49f977cab4500611337c792b12c49f87fa4076`
- branch under correction: `fix/phase57b1-batch1-discovery-quality`

## Original Batch-1 Problems
- Missing query family: `HYPHENATED_EXACT` not executed for batch parts.
- Duplicate query family: `COMPACT_EXACT` executed twice, second result set treated as covering hyphenated slot.
- Fake stage-2 semantics: `AFTERMARKET_MPN_AMAZON` executed as `STIL <part> amazon` instead of post-stage-1 brand/MPN.
- Search quality: irrelevant results (homepages, YouTube, ChatGPT, retailer-index pages) accepted as product evidence.

## Corrected Discovery
- Same 25 batch parts re-derived from `output/phase57b/BATCH_SELECTION.json` (selection unchanged).
- Corrected live query families executed per part: `FORMATTED_EXACT`, `COMPACT_EXACT`, `HYPHENATED_EXACT`, `REPLACEMENT_EXACT`, `AFTERMARKET_EXACT`.
- `AFTERMARKET_MPN_AMAZON` stage-2 executed only after stage-1 aftermarket brand/MPN identification (stage-2 did not trigger in corrected run).
- Live acquisition: `BING_HTTPS_HTML_LIVE`, `queries_executed=125`, `evidence_records=125`, `fetch_errors=0`.

## Classification (sum = 25)
- `DISCOVERED_UNVERIFIED`: 3
- `SEARCH_QUALITY_INSUFFICIENT`: 22
- `NOT_FOUND_AFTER_EVIDENCED_SEARCH`: 0
- `VERIFIED_*`: 0, `AMBIGUOUS: 0`, `REJECTED: 0`

## Lane A
- Stens 605-205 / STIL 1141 120 1600 / ASIN B01LXML5G0 -> `DISCOVERED_UNVERIFIED`
- Oregon 11892 / STIL 0000 642 1236 / ASIN B07VF4NN98 -> `DISCOVERED_UNVERIFIED`

## Promotions
- None. No production-safe Amazon.nl verified ASIN promoted.

## Affiliate Before/After
- before: verified direct mappings = 0, fallbacks = 17082
- after: verified direct mappings = 0, fallbacks = 17082

## Tests / CI / Git
- Pending Phase57B.1 PR CI / mergecommit CI.

## Codex
```
agent_initiated_codex = NO
automatic_external_review_triggered = NO
codex_feedback_used = NO
codex_used_for_acceptance = NO
```

## Final Status

```
PASS_WITH_LIMITATION
```
