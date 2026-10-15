# STIHL Parts Technical Data Model & Integrity Architecture
**Phase 54E — Parts Technical Data Integrity & Enrichment Foundation**

This document specifies the technical data model, semantic contracts, normalization rules, and integrity invariants governing the STIHL parts catalog within StihlDecoder.

---

## 1. Core Principles

1. **Evidence-First**: Technical attributes (fitments, positions, sections, supersessions) are strictly grounded in canonical repository evidence. Speculation, model-family heuristics, AI hallucination, and synthetic position generation are strictly prohibited (`FAIL-CLOSED`).
2. **Provenance Preservation**: Normalization transformations must always preserve original raw attributes (`part_name_raw`, `section_name_raw`, `diagram_position_raw`) alongside canonical normalized representations.
3. **No Fake Coverage**: Placeholders (`-1`, `0`, `POS_UNSPECIFIED`, `OFFICIAL_REF`) must never be counted as valid technical coverage or exposed in consumer interfaces.
4. **DAG Invariants**: Part supersession relationships must form a strict Directed Acyclic Graph (DAG) with zero self-loops, zero cycles, and zero conflicting divergent targets.
5. **Backwards Compatibility**: Technical enrichment layers (`technical_profile`, canonical fitment attributes) are strictly additive, preserving all existing consumer and public contracts.

---

## 2. Entity Specifications

### 2.1 Part Identity
- **Canonical Key**: `part_number` — exact 11-digit normalized numeric string (e.g. `"11231602050"`).
- **Display Formats**:
  - Compact: `11231602050` (database primary key, routing slug, API identifier)
  - Grouped: `1123 160 2050` (standard STIHL 4-3-4 technical format)
- **Names**:
  - `part_name_raw`: Original unedited name from source evidence (e.g. `"Stihl 1123 160 2050 Genuine Clutch for MS 170 MS 180..."`)
  - `display_name`: Normalized safe technical name in Dutch / international technical standard (e.g. `"Koppeling"`). Free of retailer spam, duplicate part numbers, and encoding artifacts.

### 2.2 Model & Configuration Scoping
- **Model Identity**: Normalized STIHL model identifier (e.g. `"ms_170"` for MS 170).
- **Configuration Context**: Explicit equipment configuration key (e.g. `"COMFORT"`, `"D"`, `"CATALYTIC_CONVERTER"`, or `null` for baseline model).
- **Scoping Rule**: Diagram positions and sections are scoped per `(model_id, configuration_id)`. A part may occupy different positions or sections across different machines (e.g. a standard fastener used in both the crankcase and the rewind starter).

### 2.3 Diagram Position Semantics
- **Meaningful Position**: An alphanumeric identifier indexing a component in a STIHL exploded parts diagram (e.g. `"1"`, `"12"`, `"1A"`, `"0.1"`).
- **Placeholder Values**: Values representing absent or unmapped positions:
  - `-1`, `0`
  - `POS_UNSPECIFIED`
  - `OFFICIAL_REF`
  - `UNKNOWN`, `UNSPECIFIED`, `N/A`, `-`, `—`
  - Misplaced section strings (e.g. `"C - Chassis"`)
- **Helper Guard**: Evaluated centrally via `PartNormalizer.isMeaningfulDiagramPosition(val)`.
- **Public Rendering**: When position is not meaningful, consumer templates render `'—'` rather than leaking placeholder strings.

### 2.4 Section Normalization
- **Raw Section**: Extracted diagram section title (124 observed casing/format variations).
- **Canonical Section**: Title Case normalized semantic heading (91 canonical sections + 1 unresolved fallback).
- **Alias Registry**: Maintained deterministically in `data/parts_section_aliases.json`.
- **Unresolved Handling**: Placeholders such as `"Unresolved Diagram Section"` are treated as unmapped (`isMeaningfulSection(s) === false`), suppressed from UI section headers, and prioritized for reharvesting.

### 2.5 Supersessions (Replacement Parts)
- **Model**: Directed relation `source_part_number -> replacement_part_number`.
- **Corpus**: Extracted exclusively from authenticated STIHL Technical Information (TI) service bulletins (`data/parts_supersessions.json`).
- **Graph Constraints**:
  - **Zero Self-Loops**: `source !== target`.
  - **Zero Conflicts**: A single source part maps to exactly one replacement part within the explicit corpus.
  - **Zero Cycles**: Verified via cycle-detection traversal; graph is strictly acyclic.
- **Catalog Status**:
  - `ACTIVE_IN_CATALOG`: Both source and target exist in the 17,082 parts catalog (populated in `model_part_fitments.superseded_by`).
  - `SOURCE_NOT_IN_CATALOG` / `TARGET_NOT_IN_CATALOG`: Validated historical citations where one or both parts belong to non-indexed or legacy assemblies.
- **Public UI**: Rendered as an informational banner: `"Let op: dit onderdeelnummer (...) is volgens officiële STIHL documentatie vervangen door (...) met onderdeelnummer (...)"`.

### 2.6 Part Name Normalization
- **Normalizer**: `src/parts/PartNameNormalizer.js`.
- **Priority Pipeline**:
  1. Explicit approved overrides (`data/parts_name_overrides.json`) for complex assemblies and ambiguous multi-word designations.
  2. Entity and character encoding cleanup (resolving `&#8209;`, `&amp;`, `µF`, `Ø`, `ø`, `ä`, `ü`, `ö`).
  3. Iterative vendor/retailer prefix stripping (`"Genuine"`, `"Stihl"`, `"Genuine STIHL"`).
  4. Embedded duplicate part number stripping (e.g. `"1123 160 2050"`, `"11231602050"`).
  5. Trailing retailer compatibility lists stripping (e.g. `"for MS 170 MS 180"`, `"- OEM No. 1123..."`, `"(pack of 10)"`).
  6. Deterministic Dutch technical dictionary substitution (e.g. `"clutch"` -> `"Koppeling"`, `"oil pump"` -> `"Oliepomp"`, `"spark plug"` -> `"Bougie"`).
- **Public Encoding Target**: `PUBLIC_BROKEN_ENCODING_NAMES = 0`.
- **Retailer Spam Target**: `PUBLIC_RETAILER_SPAM_NAMES = 0`.

---

## 3. Resolver Contract (`technical_profile`)

Calling `PartCatalogResolver.resolvePartNumber(partNo)` returns an additive `technical_profile` object:

```typescript
interface PartTechnicalProfile {
  canonical_part_number: string;
  display_name: string;
  part_name_raw: string;
  model_count: number;
  fitment_count: number;
  configuration_count: number;
  sections: string[];
  canonical_sections: string[];
  has_meaningful_position: boolean;
  diagram_contexts: Array<{
    canonical_model_id: string;
    configuration_key: string | null;
    configuration_name: string | null;
    section_name: string;
    diagram_position: string;
  }>;
  supersession: {
    replaced_by: string;
    relation: string;
    evidence_status: string;
    source_id: string;
    source_document: string;
    target_in_catalog: boolean;
    active_in_catalog: boolean;
  } | null;
  evidence_summary: {
    sources: string[];
    has_real_positions: boolean;
    has_canonical_section: boolean;
  };
}
```

Fitment objects are similarly enriched with additive properties:
- `section_name_raw`: string
- `section_name_canonical`: string
- `diagram_position_raw`: string
- `has_meaningful_position`: boolean
- `superseded_by`: string | null

---

## 4. Conflict Resolution Policy

All observed conflicts are tracked in `data/parts_technical_conflicts.json`.
- **Section Casing Variations**: 13 historical variations (e.g. `"Oil Pump"` vs `"Oil pump"`) resolved deterministically to canonical Title Case.
- **Multi-Position Assembly Placements**: 17 components (e.g. collar screws, nuts, gaskets) appearing at multiple diagram positions across configurations are preserved as valid configuration-scoped records.
- **Active Conflicts**: `semantic_section_conflicts = 0`, `position_conflicts = 0`, `supersession_conflicts = 0`.

---

## 5. Freezes & Protections

- **Phase 54D SEO Pilot**: Frozen at exactly 50 allowlisted parts (`INDEXABLE_INDIVIDUAL_PARTS = 50`, `NOINDEX_INDIVIDUAL_PARTS = 17032`).
- **Amazon Affiliate**: Frozen at 0 direct ASIN links, 17,082 search fallbacks, 0 unverified claims.
- **Runtime Integrity**: `RUNTIME_TECHNICAL_SCRAPING = 0`. No live HTTP requests during runtime catalog resolution.
