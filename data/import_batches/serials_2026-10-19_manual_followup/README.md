# STIHL Serial Evidence Import Batch — 2026-10-19 Manual Follow-Up (Batch B)

## Batch Identity
- **Batch ID**: `MY_STIHL_2026-10-19_MANUAL_FOLLOWUP`
- **Import Execution Date**: 2026-10-19
- **Verification Date Range**: 2026-10-17 to 2026-10-19 (`per-row controle_datum`)
- **Source File**: `source/stihl_resultaten_3.csv`
- **Source SHA256**: `523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c`
- **Source Size**: 8994337 bytes
- **Populated Source Rows**: 7103
- **Unique Input Serials**: 6618

## Accounting & Disposition
- **New Official Anchors Added**: 5243
- **Reconfirmed Existing Anchors**: 1243 (Pre-55A: 1126, Batch A: 117)
- **Previously Unresolved -> Now Positive**: 33
- **No-Match / Timeouts**: 122 (121 timeouts + 1 onbekend)
- **Found Without Usable Identity**: 10
- **Technical Errors (Unresolved)**: 0 (479 raw fout rows retried and resolved in duplicate rows)
- **Duplicate Source Rows**: 485 (478 error->positive retries, 1 timeout->positive retry, 5 same-result retries, 1 extra retry in 3-row group)
- **Identity Conflicts**: 0
- **Invalid Serials**: 0

## Cross-Batch Overlap (Batch A ∩ Batch B)
- **Overlapping Serials**: 120
- **Identical Positive Observations**: 117
- **Timeout in B for Pre-existing Anchor**: 3 (timeouts do not mutate pre-existing canonical anchors)
- **Conflicting Positives**: 0

## Integrity Guarantees
- Zero inferred ranges created (`RANGES_CREATED = 0`).
- Zero generic 8-to-9 prefix rules created (`GENERIC_PREFIX_RULES_CREATED = 0`).
- Zero negative runtime evidence introduced. Timeouts and no-matches remain strictly audit/provenance evidence.
- Canonical production anchors increased from 10417 to 15660.
