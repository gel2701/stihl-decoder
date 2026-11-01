# STIHLDECODER — PHASE 59C
## Amazon Product Advertising API (PA-API 5.0) Feasibility & Alternative Sources Audit

- **Repository**: `gel2701/stihl-decoder`
- **Phase**: 59C — Step 1 & 6 Product Sources Feasibility
- **Date**: 2026-11-01
- **Status**: AUDIT COMPLETE — POLICY & TECHNICAL SPECIFICATION

---

## 1. Executive Summary

This feasibility study investigates the official Amazon Associates product data sources, specifically the **Amazon Product Advertising API (PA-API 5.0)**, its operational prerequisites, rate limits, European regional support, and practical viability for StihlDecoder.nl.

**Key Finding**:
The current Amazon Associates account (`srihldecoder2-21`) is operating within initial qualification. Under Amazon's strict global developer policies, PA-API credentials are **only provisioned after an associate account achieves at least 3 qualifying referred sales within 180 days**. Furthermore, live scraping of Amazon search pages is strictly prohibited by Amazon's Conditions of Use and Operating Agreement Section 4.

Consequently, StihlDecoder must adopt a resilient, compliant two-tier architecture:
1. **Tier 1 (Immediate & Resilient)**: High-converting, search-fallback direct links (`https://amazon.nl/s?k=...&tag=srihldecoder2-21`) for all 18,373 parts.
2. **Tier 2 (Curated & Verified ASINs)**: A cryptographic, human-curated override registry (`amazon_part_offers.json`) for verified wear parts backed by packaging and manufacturer cross-references.
3. **Tier 3 (Post-Qualification Automation)**: Integration with PA-API 5.0 once the 3-sale qualification milestone is unlocked.

---

## 2. Amazon Product Advertising API (PA-API 5.0) Technical Analysis

### 2.1 Access Requirements & Account Eligibility
- **Operating Policy**: Amazon Associates Operating Agreement Section 4 & PA-API License Agreement.
- **Qualification Rule**:
  - Associates Central requires **at least 3 referred qualifying sales** before API access keys (Access Key ID and Secret Access Key) can be generated.
  - Accounts without 3 sales receive an `AccountNotEligible` or `UnrecognizedClientException` error upon attempting PA-API key generation.
  - If an account generates no sales for 30 consecutive days, PA-API calls are throttled to 1 request every 8,640 seconds (or suspended).

### 2.2 Searching by STIHL Part Number
- **Operation**: `SearchItems`
  - `Keywords`: `"STIHL 1123 160 2050"` or `"STIHL 11231602050"`
  - `SearchIndex`: `ToolsAndHomeImprovement`, `LawnAndGarden`, or `All`
  - `Resources`: `ItemInfo.Title`, `ItemInfo.ByLineInfo`, `ItemInfo.Manufacture`, `Offers.Listings.Price`, `Images.Primary.Large`
- **Matching Limitation**:
  - Amazon search algorithms are keyword-probabilistic, not deterministic catalog lookups.
  - A search for `"STIHL 1123 160 2050"` frequently returns third-party replacement kits, universal chains, or adjacent parts (e.g. clutches from different models) ranked above the exact OEM part.
  - **Critical Rule**: PA-API output alone cannot be treated as `VERIFIED` without comparing `ItemInfo.Manufacture.ItemPartNumber` or checking explicit cross-reference databases.

### 2.3 Regional Endpoint Support
PA-API 5.0 provides native European regional endpoints with Signature Version 4 authentication:
| Marketplace | PA-API Host | AWS Region | Associate Tag Required |
|---|---|---|---|
| Amazon.nl | `webservices.amazon.nl` | `eu-west-1` | `srihldecoder2-21` |
| Amazon.de | `webservices.amazon.de` | `eu-west-1` | `srihldecoder-de-21` (or regional tag) |
| Amazon.com | `webservices.amazon.com` | `us-east-1` | Dedicated US tag |
| Amazon.co.uk| `webservices.amazon.co.uk`| `eu-west-1` | Dedicated UK tag |

### 2.4 Rate Limits, Quotas & Costs
- **Cost**: 100% free of charge; zero billing per request.
- **Baseline Rate Limit**: 1 transaction per second (TPS) and up to 8,640 requests/day for newly qualified accounts.
- **Dynamic Quota Adjustment**: Maximum daily requests scale proportionally with revenue generated over trailing 30 days.
- **Cache Invalidation Rule**:
  - Amazon PA-API License Agreement explicitly mandates that cached product data (prices, availability) must not be retained longer than **24 hours**.
  - Direct ASIN links and product titles may be cached longer only if price and stock indicators are refreshed or excluded.

---

## 3. Alternative Product Sources & Safety Assessment

| Source / Method | Feasibility | Policy Compliance | Operational Risk | Recommendation |
|---|---|---|---|---|
| **Amazon PA-API 5.0** | Blocked until 3 sales | 100% Authorized | Zero policy risk; rate limited | Target for post-qualification |
| **Amazon SiteStripe** | High | 100% Authorized | Manual creation; slow at scale | Use for high-priority top 30 wear parts |
| **Manufacturer Cross-Reference (Oregon, Stens, Sägenspezi)** | High | 100% Authorized | High accuracy; verifiable packaging | Primary source for `VERIFIED_AFTERMARKET` |
| **Direct Search Fallback Links** | Immediate | 100% Authorized | Always fresh; zero stale prices | **Production baseline (18,373 parts)** |
| **Automated HTML Scraping / Headless Chrome** | Blocked (HTTP 503 / Robot Check) | **STRICTLY FORBIDDEN** | Account termination, IP ban | **REJECTED (Never use)** |
| **Third-Party Product Feeds** | Unreliable / Unlicensed | High Risk | Inaccurate MPN mappings | **REJECTED** |

---

## 4. Architectural Recommendation for Phase 59D

1. **Retain Resilient Search Links as Base Layer**:
   - Maintain the Phase 59B direct search link mechanism for all 18,373 parts without interruption.
2. **Curated ASIN Staging Queue**:
   - Establish an offline staging and verification pipeline where ASINs for the top 50 wear items (Bosch/NGK spark plugs, Oregon/Stens maintenance kits) are manually verified and cryptographically checked against physical OEM packaging or manufacturer catalogs.
3. **No Dynamic Scraping**:
   - Enforce zero external scraping or CAPTCHA bypass in the codebase.
