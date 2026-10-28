# STIHLDECODER — PHASE 57A.1 CLOSURE REPORT
## EVIDENCE-BACKED AMAZON CANDIDATE DISCOVERY & FIRST REAL ASIN CONVERSION AUDIT

**Completed At**: 2026-10-28T09:55:00.000Z  
**Phase Status**: **PASS_WITH_LIMITATION**  
**Repository**: `gel2701/stihl-decoder`  

---

### 1. Executive Summary & Objective Realization
Phase 57A.1 replaces the provisional blanket `100 / 100 NOT_FOUND` ledger from Phase 57A with an authoritative, evidence-backed discovery audit across a high-yield cohort of 25 wear and service parts.

Key breakthroughs in Phase 57A.1:
1. **First Proven Aftermarket Counterexample**: Part **`1141 120 1600`** (HD2 air filter) was thoroughly investigated. External discovery confirmed **Stens 605-205** (GTIN/UPC `023899451128`, Amazon ASIN `B01LXML5G0`) as an exact aftermarket replacement. This disproved the blanket unproven absence and established the first `DISCOVERED_UNVERIFIED` record.
2. **Additional Candidates Discovered**: Discovered 3 further candidates across spark plugs (`0000 400 7000` -> NGK CMR6H / ASIN `B001RMA5S2`), clutches (`1123 160 2050` -> Stens 646-170), and rim sprockets (`0000 642 1236` -> Oregon 11892 / ASIN `B07VF4NN98`).
3. **Fail-Closed Marketplace Isolation**: Because direct active listings with canonical 11-digit STIHL proof are unconfirmed on `amazon.nl`, zero unverified ASINs were prematurely written to production.
4. **Search Fallback Integrity**: 100.0% of all 17,082 canonical parts retain safe, functioning search fallback affiliate links with tag `srihldecoder2-21`.

---

### 2. High-Yield Discovery Cohort (25 Parts)
The cohort was selected from the highest priority categories specified in Section 20:
- **Luchtfilters**: `1141 120 1600` (Mandatory start item), `0000 140 4407`, `1141 140 4400`
- **Bougies**: `0000 400 7000`, `1128 405 1000`, `0000 400 7025`, `4180 405 1000`
- **Brandstoffilters**: `0000 350 3518`, `0000 350 3502`, `1117 640 3800`
- **Koppelingen**: `1123 160 2050`, `1129 162 0800`
- **Kettingwielen**: `0000 642 1223`, `0000 642 1234`, `0000 642 1236`, `0000 642 1240`
- **Antivibratie**: `1125 790 9906`
- **Carburateurdelen**: `1113 121 4705`, `4129 121 4700`, `1141 121 4730`
- **Starterdelen**: `1118 195 3500`, `0000 930 2208`, `1128 190 3400`, `0000 190 3400`, `4147 190 4012`

---

### 3. Classification Audit Results
| Classification | Count | Description |
|---|---|---|
| **VERIFIED_OEM_EXACT** | 0 | Genuine OEM listing with authorized distribution authentication |
| **VERIFIED_AFTERMARKET_EXACT** | 0 | Proven aftermarket listing confirmed on amazon.nl |
| **DISCOVERED_UNVERIFIED** | 4 | Real candidate product / ASIN discovered, marketplace unconfirmed |
| **AMBIGUOUS** | 0 | Conflicting or partial identity records |
| **REJECTED** | 0 | Explicitly incompatible or misleading claims |
| **NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH** | 21 | Multi-route query search returned zero candidates |
| **TOTAL AUDITED** | **25** | **100% accounted, 0 unevidenced classifications** |

---

### 4. Corrected STIHL Distribution Claim
> *"STIHL's authorised distribution model reduces the likelihood that genuine OEM parts on open marketplaces can be safely authenticated. However, high-quality third-party aftermarket replacements (e.g. Stens, Oregon, NGK) exist and are tracked in the discovery ledger."*

---

### 5. Production Before / After Summary
- **Direct ASIN Affiliate Links**: 0 (Before: 0 | After: 0)
- **Search Fallback Affiliate Links**: 17,082 (Before: 17,082 | After: 17,082)
- **Search Fallback Coverage**: 100.00%
- **Active Associate Tag**: `srihldecoder2-21`

---

### 6. Codex Governance
- `agent_initiated_codex`: **NO**
- `codex_feedback_used`: **NO**
- `codex_used_for_acceptance`: **NO**
