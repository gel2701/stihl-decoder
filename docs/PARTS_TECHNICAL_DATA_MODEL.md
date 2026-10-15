# STIHL Parts Technical Data Model & Integrity Architecture
**Phase 54E / Phase 54E-R1 — Parts Technical Data Integrity & Enrichment Hardening**

This document specifies the technical data model, semantic contracts, normalization rules, and integrity invariants governing the STIHL parts catalog within StihlDecoder.

---

## 1. Core Principles

1. **Evidence-First**: Technical attributes (fitments, positions, sections, supersessions) are strictly grounded in canonical repository evidence. Speculation, model-family heuristics, AI hallucination, and synthetic position generation are strictly prohibited (`FAIL-CLOSED`).
2. **Provenance Preservation**: Normalization transformations must always preserve original raw attributes (`part_name_raw`, `section_name_raw`, `diagram_position_raw`) alongside canonical normalized representations (`RAW_PART_NAMES_CHANGED = 0`, `RAW_BROKEN_ENCODING_NAMES_PRESERVED = 246`).
3. **No Fake Coverage**: Placeholders (`-1`, `0`, `POS_UNSPECIFIED`, `OFFICIAL_REF`) must never be counted as valid technical coverage or exposed in consumer interfaces.
4. **DAG & Scoping Invariants**: Part supersession relationships must form a strict Directed Acyclic Graph (DAG) with zero self-loops, zero cycles, zero conflicts, and strict applicability scoping (`SERIAL_SCOPED_GLOBALIZATION = 0`, `MODEL_SCOPED_GLOBALIZATION = 0`).
5. **Encoding Fail-Closed Policy**: Unicode replacement character (`\uFFFD`) denotes an unknown character and must never be guessed as `Ø` or any arbitrary character (`GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS = 0`). Corrupt technical names fail closed to neutral public display names (`Onderdeel <formatted part number>` or `STIHL onderdeel`).
6. **Backwards Compatibility**: Technical enrichment layers (`technical_profile`, canonical fitment attributes) are strictly additive, preserving all existing consumer and public contracts.

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
  - `name_quality_status` / `quality_status`: Deterministic quality classification:
    - `CLEAN`: Raw name was already clean and required no normalization.
    - `NORMALIZED_SAFE`: Name safely cleaned of vendor prefixes, duplicate numbers, or trailing retailer lists.
    - `EXPLICIT_OVERRIDE`: Name sourced from evidence-backed override (`data/parts_name_overrides.json`).
    - `ENCODING_UNRESOLVED`: Name contains unresolved `\uFFFD`; display name safely suppressed behind neutral fallback.
    - `RETAILER_STYLE_UNRESOLVED`: Residual retailer text that could not be mapped to a clean technical noun.
    - `MISSING`: Part name was null, empty, or whitespace.

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

### 2.5 Supersessions (Replacement Parts & Applicability Scoping)
- **Principle**: `EVIDENCE EXISTS` does not mean `RELATION APPLIES TO THIS MACHINE / FITMENT`.
- **Model**: Directed relation `from_part -> to_part` carrying structured applicability scope.
- **Corpus**: Grounded in authenticated STIHL Technical Information (TI) service bulletins (`data/parts_supersessions.json`) and independently verified against `data/phase35c31_authenticity_audit.json`:
  - `PROVENANCE_RECONFIRMED` (11 relations): Authenticated against official TI bulletins with explicit replacement semantics.
  - `PROVENANCE_NOT_RECONFIRMED` (11 relations): Unconfirmed provenance; classified as `EVIDENCE_ONLY_SCOPE_UNRESOLVED` with `public_active = false`.
- **Applicability Types**:
  - `GLOBAL_EXPLICIT`: Truly unconditional replacement across every machine (0 relations currently qualify).
  - `SCOPED_EXPLICIT`: Replacement qualified by model, configuration, or serial threshold (11 relations).
  - `EVIDENCE_ONLY_SCOPE_UNRESOLVED`: Authentic text exists but applicability cannot be safely confirmed; suppressed from public claims.
- **Serial Thresholds**:
  - If a relation requires `serial >= X` (e.g. `42034001301 -> 42034001302` from serial `249904357`), it must **never** be populated as unconditional `superseded_by` on database fitment rows (`SERIAL_SCOPED_GLOBALIZATION = 0`).
- **Model-Scoped Relations**:
  - If a relation is scoped to specific models (e.g. `11281621000 -> 11281621001` scoped to `ms_440` and `ms_460`), it applies **only** to fitment rows matching those exact models (exactly 6 fitments). It is never globalized to other models (`MODEL_SCOPED_GLOBALIZATION = 0`).
- **Graph Constraints**:
  - `SUPERSESSION_SELF_LOOPS = 0`
  - `SUPERSESSION_CONFLICTS = 0`
  - `SUPERSESSION_CYCLES = 0`
- **Public Rendering Rules**:
  - Serial-scoped relations must display qualified language: `"STIHL technische documentatie (...) vermeldt voor deze toepassing een wijziging vanaf serienummer <serial> naar onderdeel <target>."`
  - Unresolved or unconfirmed relations must suppress the replacement banner entirely (`PUBLIC_UNQUALIFIED_SCOPED_SUPERSEDED = 0`).
  - Target part number is clickable only when `target_in_catalog === true`. If target is not in the catalog, it is rendered as plain text to prevent broken internal links.

### 2.6 Part Name Normalization & Encoding Hardening
- **Normalizer**: `src/parts/PartNameNormalizer.js`.
- **Priority Pipeline**:
  1. Explicit approved overrides (`data/parts_name_overrides.json`) for complex technical assemblies and verified capacitor ratings.
  2. Fail-closed on unresolved Unicode replacement characters (`\uFFFD`) -> neutral fallback (`Onderdeel <formatted part number>` or `STIHL onderdeel`). Never guess `Ø`.
  3. Deterministic HTML entity and unambiguous mojibake cleanup (`&#8209;`, `&amp;`, `&quot;`, `Ã¸`, `Ã¤`, `Ã¼`, `Ã¶`).
  4. Iterative vendor/retailer prefix stripping (`"Genuine"`, `"Stihl"`, `"Genuine STIHL"`).
  5. Embedded duplicate part number stripping (e.g. `"1123 160 2050"`, `"11231602050"`).
  6. Trailing retailer compatibility lists stripping (e.g. `"for MS 170 MS 180"`, `"- OEM No. 1123..."`, `"(pack of 10)"`).
  7. Deterministic Dutch technical dictionary substitution (e.g. `"clutch"` -> `"Koppeling"`, `"oil pump"` -> `"Oliepomp"`, `"spark plug"` -> `"Bougie"`).
- **Invariants**:
  - `GENERIC_UFFFD_TO_CHARACTER_REPLACEMENTS = 0`
  - `NAME_NORMALIZATION_NON_IDEMPOTENT = 0` across all 17,082 parts.
  - `PUBLIC_BROKEN_ENCODING_NAMES = 0`
  - `PUBLIC_RETAILER_SPAM_NAMES = 0`

---

## 3. Resolver Contract (`technical_profile`)

Calling `PartCatalogResolver.resolvePartNumber(partNo)` returns an additive `technical_profile` object:

```typescript
interface PartTechnicalProfile {
  canonical_part_number: string;
  display_name: string;
  part_name_raw: string;
  name_quality_status: 'CLEAN' | 'NORMALIZED_SAFE' | 'EXPLICIT_OVERRIDE' | 'ENCODING_UNRESOLVED' | 'RETAILER_STYLE_UNRESOLVED' | 'MISSING';
  quality_status: string;
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
    relation: 'SUPERSEDED_BY';
    evidence_status: string;
    source_id: string;
    source_document: string;
    provenance_status: 'PROVENANCE_RECONFIRMED' | 'PROVENANCE_NOT_RECONFIRMED';
    applicability: 'GLOBAL_EXPLICIT' | 'SCOPED_EXPLICIT' | 'EVIDENCE_ONLY_SCOPE_UNRESOLVED';
    public_active: boolean;
    scope: {
      model_ids: string[];
      variant_keys: string[];
      configuration_keys: string[];
      serial_condition: {
        operator: 'GTE';
        serial: string;
        raw_text: string;
      } | null;
    };
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
- `superseded_by`: string | null (populated strictly when scope is applicable to that exact fitment)

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
- **Runtime Integrity**: `RUNTIME_TECHNICAL_SCRAPING = 0`, `RUNTIME_TI_DOCUMENT_PARSING = 0`. No live HTTP requests during runtime catalog resolution.
