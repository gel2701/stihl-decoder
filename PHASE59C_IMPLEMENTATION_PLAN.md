# STIHLDECODER — PHASE 59C
## Phase 59D Implementation Plan: Two-Tier Verified ASIN Promotion Architecture

- **Repository**: `gel2701/stihl-decoder`
- **Phase**: 59C — Step 4 & 6 Strategic Proposal for Phase 59D
- **Date**: 2026-11-01
- **Status**: READY FOR PROMOTION REVIEW

---

## 1. Overview & Objective

Phase 59D will introduce a **zero-risk, two-tier promotion architecture** that allows StihlDecoder to safely publish verified direct ASIN product links for high-demand maintenance parts without risking commission loss, policy non-compliance, or wrong-fitment returns.

**Core Principles**:
1. **Never guess or scrape ASINs dynamically**.
2. **Two-gate verification requirement** before any ASIN is loaded into `data/affiliate/amazon_part_offers.json`.
3. **Fail-closed search fallback**: Any unverified, ambiguous, or discontinued part immediately defaults to the verified search fallback URL.
4. **Full transparency**: Clear visual distinction between OEM and aftermarket on product cards.

---

## 2. Two-Gate Verification Protocol

Before an ASIN is promoted from `CANDIDATE_UNVERIFIED` to `VERIFIED_OEM_EXACT` or `VERIFIED_AFTERMARKET_COMPATIBLE`:

```
┌─────────────────────────────────┐
│     Part Selection (Step 2)     │
│   Top 50 High-Wear Maintenance  │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      Gate 1: Schema & MPN       │
│  - Exact 10-char ASIN format    │
│  - Valid manufacturer MPN       │
│  - Amazon.nl or Amazon.de link  │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     Gate 2: Physical Evidence   │
│  - OEM packaging proof OR       │
│  - Certified cross-ref catalog  │
│  - Explicit model compatibility │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Cryptographic Staging Entry   │
│ amazon_part_offers.json commit  │
└─────────────────────────────────┘
```

### Gate 1: Technical & Schema Validation
- `part_number` matches normalized 11-digit STIHL format.
- `asin` passes `^[A-Z0-9]{10}$` regex.
- `marketplace` belongs to `ALLOWED_AMAZON_MARKETPLACES` (`amazon.nl`, `amazon.de`).
- Valid associate tag dynamically attached.

### Gate 2: Evidence & Compatibility Validation
- **For OEM**: Documented packaging showing STIHL, Bosch, or NGK factory label with matching MPN.
- **For Aftermarket**: Certified compatibility guide from recognized manufacturer (Oregon, Stens, Sägenspezi, Raisman).
- Written evidence summary stored in audit records.

---

## 3. Implementation Milestones for Phase 59D

| Milestone | Deliverable | Description | Safety Gate |
|---|---|---|---|
| **59D.1** | `scripts/verify_manual_asin_batch.mjs` | Automated offline validation tool for manual offer entries | Rejects any offer missing Gate 1/2 criteria |
| **59D.2** | Staging of Initial 30 Verified ASINs | Populate `data/affiliate/amazon_part_offers.json` with audited Top 30 | 100% verified; zero candidates |
| **59D.3** | UI Badge & Transparency Enhancement | Render "Geverifieerd Origineel" or "Geverifieerd Compatibel" | Distinguishes OEM from aftermarket |
| **59D.4** | Telemetry & Conversion Attribution | Track CTR per match type via `/api/affiliate/track` | Monitors performance vs fallback |
| **59D.5** | Emergency Rollback Protocol | Instant single-switch toggle to revert to 100% search links | Zero downtime risk |

---

## 4. Preserved Invariants & Boundary Constraints

- Canonical parts catalog (`data/parts_catalog.json`) remains **strictly read-only** (18,373 parts).
- Sitemap URL count remains **exactly 1,024 URLs** (zero inflation).
- SEO indexable parts count remains **exactly 843 parts**.
- Amazon Associates Tag remains `srihldecoder2-21`.
- All required disclaimers and `/privacy` routing remain fully active.
