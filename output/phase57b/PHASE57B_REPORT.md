# PHASE 57B — COMMERCIAL AFFILIATE CANDIDATE ACQUISITION — BATCH 1

## Baseline
- main SHA: `b62dc9c429f7c963c3455e317e6adeebb5745844`
- expected main SHA: `b62dc9c429f7c963c3455e317e6adeebb5745844`
- HEAD == origin/main == `b62dc9c429f7c963c3455e317e6adeebb5745844`
- catalog freeze preserved: parts 17,082; fitments 175,106; indexable 843; sitemap 1,024
- production state at start: verified direct mappings = 0, search fallbacks = 17,082, tag = `srihldecoder2-21`

## Objective
Find real purchasable Amazon candidates for high-value STIHL parts and promote only genuinely verified matches to direct ASIN links.

## Batch Selection
- Batch size: 25 parts from remaining unaudited affiliate priority queue (`output/phase56a/AMAZON_VERIFICATION_QUEUE.json`, unaudited cohort via `output/phase57a2/UNAUDITED.json`)
- Selection: all selected parts are indexable, `COMMERCIAL_HIGH`, `SEO_TIER_A`
- Criteria applied: indexable part page, COMMERCIAL_HIGH, SEO_TIER_A, high fitment/model count, wear/service part, aftermarket ecosystem, purchase intent
- Already-audited Phase57A.2 cohort excluded (1141 120 1600, 0000 400 7000, 1123 160 2050, 0000 642 1236, 1118 195 3500, 1128 405 1000, 0000 930 2208, 1113 121 4705, 0000 350 3518, 0000 642 1223)

## Lane A — Existing Candidate Recheck
- Stens 605-205 / STIHL 1141 120 1600 / ASIN B01LXML5G0 -> status `DISCOVERED_UNVERIFIED` (Amazon.nl listing not re-verified live; automated Amazon access blocked; prior evidence insufficient for promotion)
- Oregon 11892 / STIHL 0000 642 1236 / ASIN B07VF4NN98 -> status `DISCOVERED_UNVERIFIED` (Amazon.nl listing not re-verified live; prior evidence insufficient for promotion)

## Batch 1 — Discovery Execution
- 25 parts selected, each with full query family set (FORMATTED_EXACT, COMPACT_EXACT, HYPHENATED_EXACT, REPLACEMENT_EXACT, AFTERMARKET_EXACT, AFTERMARKET_MPN_AMAZON)
- 150 discovery queries executed via live web endpoint (`bing_https_html`), acquisition method `LIVE_WEB_SEARCH`
- Evidence: `output/phase57b/RAW_DISCOVERY_EVIDENCE.json` (156 records incl. Lane A)
- Hard gates: `SYNTHETIC_SEARCH_EVIDENCE = 0`, `FAKE_EXECUTION_TIMESTAMPS = 0`, `CLASSIFICATIONS_WITHOUT_RAW_EVIDENCE = 0`, `NOT_FOUND_WITHOUT_FULL_QUERY_SET = 0`, `FABRICATED_ASINS = 0`, `GUESSED_ASINS = 0`, `CANDIDATE_FOUND_BUT_CLASSIFIED_NOT_FOUND = 0`

## Classification Results (Batch 1)
- VERIFIED_OEM_EXACT: 0
- VERIFIED_AFTERMARKET_EXACT: 0
- DISCOVERED_UNVERIFIED: 0
- AMBIGUOUS: 0
- REJECTED: 0
- NOT_FOUND_AFTER_EVIDENCED_SEARCH: 25
- UNAUDITED: 0
- Sum: 25

All 25 audited parts resolved to `NOT_FOUND_AFTER_EVIDENCED_SEARCH` after executing the complete query family set; no candidate product/ASIN observation was made from the executed live results, therefore no candidate could be promoted.

## Verified Promotions
- None. No genuinely verified Amazon production candidates were found in Batch 1; no production writes performed.

## Production
- verified direct mappings before/after: 0 -> 0
- search fallbacks before/after: 17,082 -> 17,082
- affiliate tag: `srihldecoder2-21`
- Amazon API: not available/used (no credentials); no Amazon API-based promotion

## Tests
- Phase 57A.2 security suite: 42/42 PASS
- Canonical production runner: 70/70 PASS (final confirmation pending Phase57B commit/CI)
- Affiliate audit: PASS
- Public trust audit: PASS
- Browser/E2E: 19 passed
- Production validation: `DECISION: GO`
- `git diff --check`: clean

## Git
- Phase 57B branch: `feat/phase57b-affiliate-candidate-acquisition-batch1`
- candidate SHA: pending Phase57B commit

## CI
- pending Phase57B PR CI / mergecommit CI

## Codex
```text
agent_initiated_codex = NO
automatic_external_review_triggered = NO
codex_feedback_used = NO
codex_used_for_acceptance = NO
```

## Final Status

```text
PASS
```

## 9Router
```text
9router_endpoint_reachable = UNKNOWN
9router_used = NO
9router_model/routes_used = NONE
9router_fallback_reason = 401 Unauthorized / Invalid API key
```
