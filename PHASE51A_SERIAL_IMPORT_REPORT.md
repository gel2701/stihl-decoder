# PHASE 51A — OFFICIAL SERIAL EVIDENCE IMPORT REPORT

## 1. EXECUTIVE SUMMARY
- **Import Date:** 2026-10-06
- **Evidence Source:** MY STIHL authenticated lookups
- **Source Verification Date:** 2026-09-26
- **Pre-import Production Anchors:** 1
- **Batch Exact Anchors:** 727
- **Newly Added Anchors:** 726
- **Identical Existing Anchors:** 1 (Serial 163118080)
- **Conflicts Detected:** 0
- **Post-import Production Anchors:** 727
- **Anchors with Canonical Model ID:** 1 (stihl_ms_440 on 163118080)
- **Anchors with Canonical Model ID (null):** 726
- **Range Rules Added:** 0 (No range inference created)
- **Negative Evidence Records Added:** 0 (0 unresolved/timeouts treated as negative evidence)
- **Generic 8→9 Prefix Logic Added:** 0 (No generic leading zero rules added)
- **Runtime Alias Activation:** 0 (Deferred to Phase 51B)
- **JSON / SQLite Parity:** 100% (727 / 727 records synchronized)

---

## 2. CATEGORY BREAKDOWN
| Categorie | Aantal Anchors |
| :--- | :--- |
| Kettingzaag | 502 |
| Bosmaaier | 85 |
| Doorslijper | 52 |
| Heggenschaar | 29 |
| Zuighakselaar | 16 |
| Bladblazer | 13 |
| Algemeen gemotoriseerd | 8 |
| Onbekend | 8 |
| Toebehoren | 5 |
| Combimotor | 5 |
| Hoogsnoeier | 2 |
| Grondboren | 2 |
| **Totaal** | **727** |

---

## 3. DRIVE TYPE BREAKDOWN
| Aandrijving (Drive Type) | Aantal Anchors |
| :--- | :--- |
| Benzine | 703 |
| Elektrisch | 16 |
| Onbekend | 8 |
| **Totaal** | **727** |

---

## 4. DENSE SEQUENCE AUDIT
- **Range:** 163118080 t/m 163118179
- **Exact Observed Anchors:** 100
- **Model Identity:** `MS 440-Z 3/8" RIM Magnum Motorsäge` (100/100)
- **Range Inference Status:** Zero range rules created; preserved as 100 distinct official anchors.

---

## 5. REPRODUCIBILITY & ARTIFACT RECOVERY
- **Source Package:** `stihl_decoder_importpakket_2026-09-26.zip`
- **Package SHA-256:** `c1a411e0fd97661cb355bf39fd15af4f2483e93d0b611fd542dcefebac9950bd`
- **Batch Directory:** `data/import_batches/serials_2026-09-26/`
- **Batch Manifest:** `data/import_batches/serials_2026-09-26/batch_manifest.json`

---

## 6. FAILURE INJECTION AUDIT
- `IDENTITY_CONFLICT_INJECTION`: **DETECTED**
- `DUPLICATE_SERIAL_INJECTION`: **DETECTED**
- `EIGHT_DIGIT_ANCHOR_INJECTION`: **DETECTED**
- `UNRESOLVED_AS_ANCHOR_INJECTION`: **DETECTED**
- `RANGE_INFERENCE_INJECTION`: **DETECTED**
