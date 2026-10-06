# PHASE 51A — OFFICIAL SERIAL EVIDENCE IMPORT REPORT (ROUND 1 & ROUND 2)

## 1. EXECUTIVE SUMMARY
- **Last Import Date:** 2026-10-06
- **Evidence Source:** MY STIHL authenticated lookups
- **Source Verification Batches:**
  - Batch 1 (2026-09-26): 727 exact official anchors
  - Batch 2 (2026-10-06 Delta): 2118 new exact official anchors (2138 observations, 20 reconfirmed)
- **Pre-Round 2 Production Anchors:** 727
- **New Anchors Added in Round 2:** 2118
- **Post-Round 2 Total Production Anchors:** 2845
- **Identical Existing Anchors Reconfirmed:** 20
- **Conflicts Detected:** 0
- **Anchors with Canonical Model ID:** 365
- **Anchors with Canonical Model ID (null):** 2480
- **Range Rules Added:** 0 (No range inference created)
- **Negative Evidence Records Added:** 0 (0 unresolved/timeouts treated as negative evidence)
- **Generic 8→9 Prefix Logic Added:** 0 (No generic leading zero rules added)
- **Runtime Alias Activation:** 0 (Deferred to Phase 51B)
- **JSON / SQLite Parity:** 100% (2845 / 2845 records synchronized)

---

## 2. CUMULATIVE CATEGORY BREAKDOWN (2845 ANCHORS)
| Categorie | Aantal Anchors |
| :--- | :--- |
| Kettingzaag | 1786 |
| Bosmaaier | 364 |
| Algemeen gemotoriseerd | 260 |
| Heggenschaar | 236 |
| Grondboren | 98 |
| Doorslijper | 52 |
| Zuighakselaar | 16 |
| Bladblazer | 13 |
| Onbekend | 8 |
| Toebehoren | 5 |
| Combimotor | 5 |
| Hoogsnoeier | 2 |
| **Totaal** | **2845** |

---

## 3. CUMULATIVE DRIVE TYPE BREAKDOWN (2845 ANCHORS)
| Aandrijving (Drive Type) | Aantal Anchors |
| :--- | :--- |
| Benzine | 2821 |
| Elektrisch | 16 |
| Onbekend | 8 |
| **Totaal** | **2845** |

---

## 4. DENSE SEQUENCE & INFERENCE AUDIT
- **MS 440 Sequences:** Preserved as distinct individual 9-digit official anchors without range compaction.
- **Range Inference Status:** Zero range rules created; all evidence remains strictly anchor-based.
- **Technical Unresolved / Timeouts:** 867 delta items retained in batch audit queue (`serial_recheck_queue_2026-10-06.csv`), zero entered runtime database.

---

## 5. REPRODUCIBILITY & ARTIFACT RECOVERY
- **Round 1 Package (2026-09-26):**
  - Path: `stihl_decoder_importpakket_2026-09-26.zip`
  - SHA-256: `c1a411e0fd97661cb355bf39fd15af4f2483e93d0b611fd542dcefebac9950bd`
  - Batch Directory: `data/import_batches/serials_2026-09-26/`
- **Round 2 Package (2026-10-06):**
  - Path: `D:\Downloads\stihl_decoder_delta_importpakket_2026-10-06.zip`
  - SHA-256: `adc764dd532638b5bf805539cac4c034dc24384c7eb88b9bc9a85284c4926b72`
  - Batch Directory: `data/import_batches/serials_2026-10-06/`
  - Batch Manifest: `data/import_batches/serials_2026-10-06/batch_manifest.json`

---

## 6. FAILURE INJECTION AUDIT
- `IDENTITY_CONFLICT_INJECTION`: **DETECTED**
- `DUPLICATE_SERIAL_INJECTION`: **DETECTED**
- `EIGHT_DIGIT_ANCHOR_INJECTION`: **DETECTED**
- `UNRESOLVED_AS_ANCHOR_INJECTION`: **DETECTED**
- `RANGE_INFERENCE_INJECTION`: **DETECTED**
- `PARITY_MISMATCH_INJECTION`: **DETECTED**
