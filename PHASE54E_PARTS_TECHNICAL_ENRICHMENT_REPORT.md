# Phase 54E / Phase 54E-R1 — Parts Technical Data Integrity & Enrichment Report

**Repository**: `gel2701/stihl-decoder`  
**Production**: `https://www.stihldecoder.nl`  
**Baseline SHA**: `048ec27d803219d78708c27875781f2b7ec6c8be`
**Branch**: `feat/phase54e-parts-technical-enrichment`  
**Review Policy**: `CODEX_REVIEW_REQUIRED = NO`  
**PR Policy**: `PR_OPEN = YES`, `PR_MERGED = NO`  

---

## 1. Executive Summary

Phase 54E and Phase 54E-R1 establish an authoritative, fail-closed technical data integrity layer for the STIHL parts catalog. Rather than expanding SEO indexing, affiliate links, or performing web harvesting, this phase systematically resolves technical data quality issues across diagram positions, section taxonomies, replacement supersessions, and part name encodings, while strictly preserving core invariants and historical provenance.

### Core Achievements:
1. **Semantic Diagram Position Correction**:
   Eliminated placeholder values (`-1`, `0`, `POS_UNSPECIFIED`, `OFFICIAL_REF`, and misplaced section strings) from being counted as valid diagram positions. Centralized validation in `PartNormalizer.isMeaningfulDiagramPosition(val)`.
   - Measured real coverage: 16,600 parts (97.18%) and 169,990 fitments (97.08%) possess genuine diagram positions.
   - Identified and excluded 5,116 placeholder fitments (2.92%) and 482 parts without real positions (2.82%).
   - Reclassified metrics to clearly distinguish raw string presence from meaningful values.
2. **Deterministic Section Normalization**:
   Mapped 41 raw casing and whitespace variations to 91 canonical Title Case sections via `src/parts/SectionNormalizer.js` and `data/parts_section_aliases.json`. Resolved 13 apparent conflicts to 0 semantic conflicts. Safely isolated unmapped sections as `"Unresolved Diagram Section"`.
3. **Explicit Supersessions DAG & Independent Provenance Scoping (Phase 54E-R1 Hardening)**:
   Grounding 22 explicit replacement relations in repository evidence independently verified against `data/phase35c31_authenticity_audit.json`:
   - 11 relations reconfirmed against authenticated official STIHL Technical Information (TI) service bulletins.
   - 11 relations with unconfirmed provenance safely downgraded to `EVIDENCE_ONLY_SCOPE_UNRESOLVED` with `public_active = false`.
   - Serial-scoped relations (`42034001301`, `11320300401`, `00003503500`, `11280300404`) carry explicit serial thresholds (`operator: GTE`, `serial: 249904357`, `246534711`, etc.) and are **never** propagated unconditionally to fitments (`SERIAL_SCOPED_GLOBALIZATION = 0`).
   - Model-scoped relation `11281621000 -> 11281621001` is strictly confined to its documented machine scope (`ms_440` and `ms_460`, exactly 6 fitments).
   - Zero self-loops, zero cycles, zero conflicts.
4. **Safe Technical Display Name Normalization & Fail-Closed Encoding**:
   Engineered `src/parts/PartNameNormalizer.js` with multi-tier sanitization: explicit overrides (`data/parts_name_overrides.json`), HTML entity cleanup (`&#8209;`, `&amp;`), vendor prefix stripping, duplicate number removal, and Dutch technical dictionary translation.
   - Completely removed generic `\uFFFD -> Ø` character guessing.
   - Unresolved Unicode replacement characters fail closed to neutral public display names (`Onderdeel <formatted part number>` or `STIHL onderdeel`).
   - Verified 100% idempotence (`normalize(normalize(raw)) === normalize(raw)`) across all 17,082 parts.
   - `RAW_BROKEN_ENCODING_NAMES_PRESERVED = 246` in the database.
   - `PUBLIC_BROKEN_ENCODING_NAMES = 0`, `PUBLIC_RETAILER_SPAM_NAMES = 0`.
5. **Backwards-Compatible Resolver Contract**:
   Added `technical_profile` object to `PartCatalogResolver.resolvePartNumber()` exposing `name_quality_status`, `quality_status`, `part_name_raw`, `display_name`, `canonical_sections`, `diagram_contexts`, and structured `supersession.scope`.
6. **Strict Multi-Phase Freezes Preserved**:
   The 50-part Phase 54D SEO pilot, sitemap (231 URLs), robots tags, Amazon affiliate (0 ASINs, 17,082 search fallbacks), serial decoder, homepage UX, and passport were 100% frozen and verified intact.

---

## 2. Technical Metrics Matrix

| Metric | Measured Value | Semantic Definition / Accounting |
| :--- | :--- | :--- |
| **PARTS** | 17,082 | Canonical parts count in database |
| **FITMENTS** | 175,106 | Total canonical machine-part fitment records |
| **EVIDENCE** | 206,607 | Total structural observation evidence items |
| **CONFIGURATIONS** | 766 | Distinct machine configurations recorded |
| **PARTS_WITH_RAW_SECTION_STRING** | 17,082 | Parts with non-empty section string in raw fitments |
| **PARTS_WITH_MEANINGFUL_SECTION** | 857 | Parts with canonical, meaningful diagram section |
| **FITMENTS_WITH_RAW_SECTION_STRING** | 175,106 | Fitments with non-empty section string |
| **FITMENTS_WITH_MEANINGFUL_SECTION** | 2,798 | Fitments with canonical, meaningful diagram section |
| **PARTS_WITH_RAW_POSITION_VALUE** | 17,082 | Parts with non-empty position field in raw fitments |
| **PARTS_WITH_MEANINGFUL_POSITION** | 16,600 (97.18%) | Parts with genuine alphanumeric diagram positions |
| **PARTS_WITHOUT_MEANINGFUL_POSITION** | 482 (2.82%) | Parts lacking meaningful diagram positions |
| **FITMENTS_WITH_RAW_POSITION_VALUE** | 175,106 | Fitments with non-empty position string |
| **FITMENTS_WITH_MEANINGFUL_POSITION** | 169,990 (97.08%) | Fitments with genuine alphanumeric diagram positions |
| **PLACEHOLDER_POSITIONS_EXCLUDED** | 5,116 (2.92%) | Placeholders excluded (`-1`, `0`, `POS_UNSPECIFIED`, etc.) |
| **RAW_SECTION_NAMES** | 124 | Distinct raw section strings observed across fitments |
| **CANONICAL_SECTION_NAMES** | 91 (+ 1 fallback) | Distinct standardized Title Case sections |
| **SECTION_CONFLICTS** | 0 | Active semantic section conflicts |
| **POSITION_CONFLICTS** | 0 | Active diagram position conflicts |
| **TOTAL_SUPERSESSION_EVIDENCE_RELATIONS** | 22 | Total documented replacement relations |
| **PROVENANCE_RECONFIRMED** | 11 | Independently authenticated against official TI corpus |
| **PROVENANCE_NOT_RECONFIRMED** | 11 | Unconfirmed provenance (downgraded to inactive evidence) |
| **SCOPED_EXPLICIT_RELATIONS** | 11 | Relations with explicit model or serial qualification |
| **SCOPE_UNRESOLVED_RELATIONS** | 11 | Downgraded relations with unresolved scope |
| **GLOBAL_EXPLICIT_RELATIONS** | 0 | Truly unconditional replacements |
| **SUPERSESSION_SELF_LOOPS** | 0 | Self-loop relations detected |
| **SUPERSESSION_CYCLES** | 0 | Cycles in supersession DAG |
| **SUPERSESSION_CONFLICTS** | 0 | Conflicting divergent targets for same source part |
| **SERIAL_SCOPED_GLOBALIZATION** | 0 | Serial-scoped relations leaked unconditionally to fitments |
| **MODEL_SCOPED_GLOBALIZATION** | 0 | Model-scoped relations leaked outside documented models |
| **PUBLIC_UNQUALIFIED_SCOPED_SUPERSEDED**| 0 | Unqualified public replacement claims rendered |
| **DB FITMENTS WITH SUPERSEDED_BY** | 6 | Strictly populated for `11281621000` on `ms_440` and `ms_460` |
| **GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS**| 0 | Generic replacement guessing logic in codebase |
| **NAME_NORMALIZATION_NON_IDEMPOTENT** | 0 | Parts failing `normalize(normalize(raw)) === normalize(raw)` |
| **PUBLIC_BROKEN_ENCODING_NAMES** | 0 | Broken encoding characters rendered in public display names |
| **PUBLIC_RETAILER_SPAM_NAMES** | 0 | Residual retailer strings in public display names |
| **RAW_BROKEN_ENCODING_NAMES_PRESERVED** | 246 | Raw names with `\uFFFD` preserved in database |
| **CLEAN_RESEED_REPRODUCIBLE** | YES | Database seed verification cleanly reproducible |
| **PHASE54D_PILOT_SIZE** | 50 | Strictly frozen allowlist size |
| **INDEXABLE_INDIVIDUAL_PARTS** | 50 | Exact pilot parts indexable |
| **NOINDEX_INDIVIDUAL_PARTS** | 17,032 | Fail-closed noindex guard |
| **TOTAL_SITEMAP_URLS** | 231 | 58 model parts, 24 series, 1 hub, 50 pilot parts, core pages |
| **VERIFIED_DIRECT_ASIN_LINKS** | 0 | Commercial freeze |
| **SEARCH_FALLBACK_LINKS** | 17,082 | Universal commercial search fallback |
| **RUNTIME_TECHNICAL_SCRAPING** | 0 | Offline catalog operation |
| **RUNTIME_TI_DOCUMENT_PARSING** | 0 | Build/seed time precomputed scope only |

---

## 3. Historical Section Signals

Audited from `data/parts_harvest_manifest.json`:
- `CURRENT_SECTIONS_DISCOVERED = 7308`
- `CURRENT_SECTIONS_PARSED = 962`
- `CURRENT_SECTIONS_WITH_MAPPED_PARTS = 962`
- `CURRENT_SECTIONS_WITHOUT_MAPPED_PARTS = 6346`
- `CURRENT_SECTION_MAPPING_RATE = 0.014`

---

## 4. Phase 54E-R1 Independent Hardening

Phase 54E-R1 specifically corrected two critical data integrity blockers identified during independent review:

### Blocker 1: Supersession Scope Safety & Provenance Hardening
- **Root Cause**: Phase 54E previously treated `from_part -> to_part` as an unconditional global relationship and applied it to all fitments of `from_part` (resulting in an inflated count of 103 fitments).
- **Remediation**:
  1. Conducted an independent provenance audit of all 22 relations against `data/phase35c31_authenticity_audit.json`.
  2. Exactly 11 relations reconfirmed as `AUTHENTICATED_OFFICIAL`. The remaining 11 relations were classified as `PROVENANCE_NOT_RECONFIRMED`, `applicability = 'EVIDENCE_ONLY_SCOPE_UNRESOLVED'`, and `public_active = false`.
  3. Identified serial conditions in official TI documents:
     - `42034001301 -> 42034001302` (TI_19_2001_02_01_01): from serial number 2 49 904 357 (`GTE 249904357`)
     - `11320300401 -> 11320300402` (TI_06_2000_30): from serial number 2 46 534 711 (`GTE 246534711`)
     - `00003503500 -> 00003503504` (TI_36_2000_30_01): on machines from serial number 1 48 379 189 (`GTE 148379189`)
     - `11280300404 -> 11280300402` (TI_16_2002_02_01_01): from serial number 1 54 517 175 (`GTE 154517175`)
  4. Removed unconditional propagation in `data/seed.cjs`. Fitments for serial-scoped parts receive `superseded_by = null` (`SERIAL_SCOPED_GLOBALIZATION = 0`).
  5. Model-scoped relations (such as `11281621000 -> 11281621001` on MS 440 and MS 460) populate `superseded_by` only on fitment rows matching those exact model IDs (exactly 6 fitments).
  6. Public SSR templates now render qualified language referencing the specific serial threshold and never claim unconditional replacement. If the replacement target is not in the catalog, it is rendered as plain text rather than a broken internal link.

### Blocker 2: Encoding Fail-Closed Hardening & Idempotence
- **Root Cause**: `PartNameNormalizer.js` previously contained an unsafe heuristic `.replace(/\uFFFD/g, 'Ø')`.
- **Remediation**:
  1. Removed the generic character replacement entirely (`GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS = 0`).
  2. Enforced fail-closed handling: when a raw name contains unresolved `\uFFFD` and lacks an explicit verified override, it falls back to a neutral technical display name (`Onderdeel <formatted part number>` or `STIHL onderdeel`).
  3. Preserved all 246 raw names with `\uFFFD` intact in the database for full historical traceability (`RAW_BROKEN_ENCODING_NAMES_PRESERVED = 246`).
  4. Added explicit override for `00006051020` (`Condensator 30 µF`) based on verified electrical unit data.
  5. Tested and verified idempotence across all 17,082 parts: `normalize(normalize(raw)) === normalize(raw)` (`NAME_NORMALIZATION_NON_IDEMPOTENT = 0`).

---

## 5. Verification Suite Results

### 5.1 Unit & Contract Tests (`npm test`)
- Total Suites: 36
- Passed: 36 (100%)
- Failed: 0
- Suite `tests/phase54e_parts_technical_enrichment.test.js`: 11/11 tests passed cleanly including dedicated R1 regression tests.

### 5.2 Browser End-to-End Tests (`npm run test:e2e`)
- Framework: Playwright (Chromium)
- Tests: 19 user journeys across homepage, routes, and parts integration
- Passed: 19 (100%)
- Failed: 0

### 5.3 Production Audits
- `npm run audit:parts-catalog`: 1,429 valid entities, 104 non-machines rejected cleanly
- `node scripts/audit_public_trust_claims.mjs`: 258 pages rendered, 18,393 links, 0 broken links, 0 unsupported claims
- `node scripts/audit_parts_seo.mjs`: 88 indexable URLs audited, 37 noindexed URLs audited, 0 orphan pages
- `node scripts/audit_amazon_affiliate_links.mjs`: 0 ASINs, 17,082 search fallbacks, 0 unverified claims
- `node scripts/audit_part_indexation_pilot.mjs`: 50 pilot parts confirmed, negative controls strictly noindex, 0 metadata duplicates
- `node scripts/audit_parts_technical_enrichment.mjs`: All Phase 54E-R1 invariants verified cleanly (0 errors)
- `git diff --check`: 0 syntax or whitespace errors
