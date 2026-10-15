# Phase 54F — Technical Reharvesting & Diagram Resolution Plan
**Status: UNEXECUTED PLANNING SPECIFICATION ONLY — NO SCRAPING EXECUTED**

---

## 1. Executive Summary & Objective

In Phase 54E, StihlDecoder established strict technical integrity invariants across 17,082 parts, 175,106 fitments, and 206,607 evidence observations:
- Fixed placeholder diagram positions (`-1`, `0`, `POS_UNSPECIFIED`, `OFFICIAL_REF`), revealing that 16,600 parts (97.18%) and 169,990 fitments (97.08%) possess genuine, verified diagram positions.
- Corrected 5,116 placeholder fitment records and 482 parts without real positions.
- Established canonical Title Case normalization for 91 diagram sections while safely handling 16,225 parts currently scoped to `"Unresolved Diagram Section"`.

Phase 54F defines the formal plan to systematically reharvest diagram sections and missing positions without violating rate limits, robots.txt, or data provenance.

---

## 2. Identified Coverage Gaps

1. **Unresolved Diagram Sections**:
   - 16,225 parts and 172,308 fitments are associated with `"Unresolved Diagram Section"` (harvested without explicit section breakdown).
   - 857 parts currently possess canonical diagram sections (e.g., `Crankcase, Cylinder`, `Oil Pump`, `Rewind Starter`, `Clutch`).
2. **Missing Real Diagram Positions**:
   - 482 parts (2.82% of catalog) and 5,116 fitments (2.92%) lack valid diagram positions (previously masked by placeholder strings like `-1`, `0`, and `POS_UNSPECIFIED`).
3. **Model Clusters with Greatest Section Ambiguity**:
   - High-volume legacy chainsaws: `017`, `018`, `021`, `023`, `025`, `MS 170`, `MS 180`, `MS 210`, `MS 250`.
   - Brushcutter series: `FS 38`, `FS 45`, `FS 55`, `FS 120`.
   - Cut-off saws: `TS 400`, `TS 410`, `TS 420`.

---

## 3. Candidate Ingestion Sources & Precedence

1. **Tier 1 — Official STIHL Technical Information (TI) & Service Bulletins**:
   - Primary authority for part numbers, technical revisions, and supersession links.
   - Authority Level: 1.0 (Maximum).
2. **Tier 2 — Authorized STIHL Exploded View Assemblies**:
   - Sources: Structured parts lists and assembly diagrams with explicit section taxonomy (`Kurbelgehäuse`, `Zylinder`, `Zündung`, `Vergaser`, `Anwerfvorrichtung`).
   - Authority Level: 0.9.
3. **Tier 3 — Structured Technical Replacement Registries**:
   - Secondary cross-referencing for configuration-specific fitments.
   - Authority Level: 0.75.

---

## 4. Execution Parameters & Safety Guardrails

- **Estimated Request Count**:
  - Model Queue: 1,429 target models/configurations.
  - Estimated HTTP Requests: ~2,800 (including index and section breakdown pages).
- **Rate Limiting Proposal**:
  - Minimum Delay: 2,500 ms between sequential requests.
  - Jitter: Uniform random delay of ±500 ms.
  - Concurrency: Exactly 1 (strictly serial execution).
  - Backoff: Exponential backoff on HTTP 429/503 (initial 30s, multiplying by 2 up to 300s).
- **Robots & Legal Constraints**:
  - Strict compliance with `robots.txt` disallow directives.
  - Identify with user-agent identifying StihlDecoder Research Harvester (`StihlDecoder-Bot/1.0 (+https://www.stihldecoder.nl/bot)`).
  - No scraping of pricing, vendor inventory, cart URLs, or non-technical user data.
- **Checkpointing Architecture**:
  - State file: `data/harvest/phase54f_checkpoint.json`.
  - Checkpoint interval: atomic save after every 10 successfully resolved models.
  - Resumability: Idempotent restart from last completed queue index upon interruption.
- **Expected Data Fields**:
  ```json
  {
    "model_id": "ms_170",
    "configuration_id": null,
    "section_name_raw": "Kurbelgehäuse",
    "section_name_canonical": "Crankcase",
    "diagram_position": "12",
    "part_number": "11230202112",
    "part_name_raw": "Crankcase",
    "source_id": "authorized_diagram_v1",
    "source_url": "https://...",
    "harvested_at": "ISO-8601"
  }
  ```
- **Failure & Quarantine Handling**:
  - Invalid part numbers (non-11 digits) routed to quarantine (`phase54f_quarantine.jsonl`).
  - Parsing errors captured with full page snapshot in `data/harvest/errors/`.
  - Zero modification to existing validated fitments until new data passes 100% schema audit.

---

## 5. Transition Criteria

Execution of Phase 54F reharvesting may begin only after:
1. Phase 54E PR is approved and merged into `main`.
2. Dedicated issue and tracking branch `feat/phase54f-technical-reharvest` are established.
3. Network sandbox and offline rate limiter tests are verified.
