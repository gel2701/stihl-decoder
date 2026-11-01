# PHASE 59C.1 — ACTIVE EVIDENCE RECOVERY & AMAZON PRODUCT MATCH REPORT

**Repository**: `gel2701/stihl-decoder`
**Phase**: 59C.1 — Active Evidence Recovery & Amazon Product Match Verification
**Baseline Main**: `388bee72cfc25d7e4471c6915424634fd1b8d8f1`
**Pull Request**: #85
**Authoritative Date**: 2026-11-01
**Affiliate Associate Tag**: `srihldecoder2-21`

---

## 1. Executive Summary: Active Evidence Recovery Outcomes

In Phase 59C.1, active multi-round evidence recovery was conducted across all 19 original candidate product matches. Rather than passively discarding records, evidence was systematically gathered across three distinct investigation rounds:
- **Round A — Manufacturer Evidence**: OEM MPN, manufacturer catalogs, STIHL Quick Reference Guide, model fitment.
- **Round B — Product Identity**: GTIN/EAN barcodes, brand ownership, packaging verification.
- **Round C — Amazon ASIN Verification**: Verifying whether the candidate ASIN represents the intended product on Amazon.nl / Amazon.de, and identifying correct replacements for flawed pairings.

### Summary Metrics:
- **Total Candidate Matches Investigated**: **19**
- **Volledig Bewezen (`VERIFIED_COMPLETE`)**: **3** (15.8%)
  - All 3 spark plugs have complete manufacturer proof, universal GTINs, and verified matching Amazon ASINs.
- **Gedeeltelijk Bewezen (`PART_COMPATIBILITY_VERIFIED`)**: **13** (68.4%)
  - Manufacturer numbers, genuine STIHL GTIN barcodes, and machine fitments 100% established, but lacking stable standalone OEM ASINs on Amazon.nl.
- **Aantoonbaar Onjuiste Koppelingen Gecorrigeerd (`INCORRECT_MATCH_CONFIRMED`)**: **3** (15.8%)
  - Critical technical mismatches identified and eliminated (Kohler coil mistaken for STIHL filter, Husqvarna sprocket mistaken for STIHL sprocket, MS 260 filter mistaken for TS 410 pre-filter).
- **Correcte Vervanger Gevonden**: **4** (21.1%)
  - 3 correct replacement ASINs found for spark plugs (`B0068M5NAG`, `B001RM8J76`, `B001RMA5S2`), plus 1 correct replacement MPN found for fuel filter (`Stens 610-254`).

---

## 2. Multi-Round Forensic Investigation of All 19 Matches

| Part Number | Part Name | Manufacturer / Brand | OEM Classification | Investigation Status | Discrepancy Found / Resolution | Verified Replacement ASIN / MPN |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `1110 400 7005` | Spark plug Bosch WSR6F | Bosch | `OEM_SUPPLIER_EQUIVALENT` | **`VERIFIED_COMPLETE`** | Candidate ASIN B000CF147O unresolved on Amazon.nl. Replaced with active verified Bosch ASIN. | **`B0068M5NAG`** (EAN 3165141051063) |
| `0000 400 7000` | Spark plug NGK BPMR7A | NGK | `OEM_SUPPLIER_EQUIVALENT` | **`VERIFIED_COMPLETE`** | **Critical mismatch corrected**: 0000 400 7000 was mistakenly labeled CMR6H; confirmed as NGK BPMR7A (Stock 6703). | **`B001RM8J76`** (GTIN 0087295167038) |
| `0000 400 7011` | Spark plug NGK CMR6H | NGK | `OEM_SUPPLIER_EQUIVALENT` | **`VERIFIED_COMPLETE`** | Previous ASIN B003CJER2W unverified. Replaced with active verified NGK CMR6H ASIN. | **`B001RMA5S2`** (Stock 3365) |
| `0000 400 7025` | Spark plug STIHL ZK C 10pk | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Dealer commercial 10-pack lacks stable single ASIN on Amazon.nl. GTIN 795711718046 verified. | Retained in research data; search fallback active. |
| `0000 350 3502` | Fuel Pickup Body | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN B007RO0I2Q was snowboard apparel. OEM GTIN 0795711285227 verified; Amazon offers are rotating multi-packs. | Retained in research data; search fallback active. |
| `1117 640 3800` | Oil Pickup Body | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN B009T2V0MY unverified. OEM part compatibility confirmed across 12 STIHL models. | Retained in research data; search fallback active. |
| `0000 642 1234` | Rim Sprocket .325" 8T | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN unverified. Genuine GTIN 795711000141 verified for MS 250, MS 260, MS 261. | Retained in research data; search fallback active. |
| `0000 642 1236` | Rim Sprocket .325" 7T | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN unverified. Genuine GTIN 795711000165 verified for MS 210, MS 230, MS 250. | Retained in research data; search fallback active. |
| `1118 195 3500` | Starter Pawl Clip Spring | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Small internal spring; dealer network part without permanent Amazon ASIN. Compatibility confirmed. | Retained in research data; search fallback active. |
| `0000 195 8200` | Starter Rope 3.0mm | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Genuine GTIN 795711479220 verified; sold as bulk cordage, no stable standalone OEM ASIN. | Retained in research data; search fallback active. |
| `4282 141 0300` | Air Filter BR 500-700 | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN B007RO0M0Y was apparel. Genuine GTIN 0795711610753 verified for BR blowers. | Retained in research data; search fallback active. |
| `1123 640 7102` | Oil Pump Assembly | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN unverified. Fitment verified for 021, 023, 025, MS 210, MS 230, MS 250. | Retained in research data; search fallback active. |
| `1123 120 1613` | Air Filter Flocked | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN unverified. Genuine GTIN 795711515218 verified. | Retained in research data; search fallback active. |
| `1130 124 0800` | Air Filter Fleece MS 170 | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Candidate ASIN B007RO10MC was apparel. OEM fitment verified; Amazon offers are multi-packs. | Retained in research data; search fallback active. |
| `0000 350 3518` | Fuel Pickup Body | STIHL | `GENUINE_STIHL` | **`INCORRECT_MATCH_CONFIRMED`** | **Critical mismatch corrected**: "Oregon 33-518" is a Kohler ignition coil, NOT a STIHL fuel filter. | **`Stens 610-254`** (GTIN 023899120610) |
| `1123 640 3200` | Oil Pump 0.55mm | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Genuine GTIN 795711515188 and Sägenspezi GTIN 4069584009157 verified. ASIN unverified. | Retained in research data; search fallback active. |
| `1141 120 1600` | HD2 Air Filter | STIHL | `GENUINE_STIHL` | **`PART_COMPATIBILITY_VERIFIED`** | Genuine GTIN 0795711520151 verified for MS 261, MS 271, MS 291. ASIN unverified. | Retained in research data; search fallback active. |
| `1123 640 2074` | Chain Sprocket .325" 7T | STIHL | `GENUINE_STIHL` | **`INCORRECT_MATCH_CONFIRMED`** | **Critical mismatch corrected**: Oregon 106114 fits Husqvarna/Poulan saws, NOT STIHL. | Original pairing rejected. |
| `4238 140 1800` | Main Air Filter | STIHL | `GENUINE_STIHL` | **`INCORRECT_MATCH_CONFIRMED`** | **Critical mismatch corrected**: Stens 605-385 replaces 1121 120 1618 (MS 260), NOT 4238 140 1800 (TS 410). | Original pairing rejected. |

---

## 3. Detailed Evidence Dossier for the 3 Verified Complete Matches

### A. Bosch WSR6F (`1110 400 7005`)
- **STIHL Part Reference**: `1110 400 7005`
- **Brand / Manufacturer**: Bosch (Bosch Automotive Aftermarket)
- **OEM Classification**: `OEM_SUPPLIER_EQUIVALENT`
- **Manufacturer MPN**: `0242240506` (Order code: 7547 / WSR6F)
- **Universal EAN / GTIN**: `3165141051063`
- **Verified Active ASIN**: **`B0068M5NAG`** (Title: *"Bosch 0242240506 Spark Plug WSR6F"*)
- **Status**: **`VERIFIED_COMPLETE`**
- **Onafhankelijke Externe Bron**: [Motointegrator Artikel 468993](https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck)
- **Bewezen Productidentiteit**: Bosch Zündkerze WSR6F (Herstellernummer: `0 242 240 506` / `0242240506`, Kurznummer: `WSR6F`, Bestellnummer: `7547`, EAN: `3165141051063`). Technische specificaties: M14x1.25 schroefdraad, 9.5 mm schroefdraadlengte, 19 mm sleutelwijdte, 0.5 mm elektrodenafstand, 1-polig, ontstoord (5 kOhm). Bevestigt 1-op-1 ASIN `B0068M5NAG` als authentieke Bosch fabriekseenheid.
- **STIHL-Compatibiliteit**: Directe fabrieksspecificatie en officiële kruisreferentie voor STIHL `1110 400 7005` (en `0000 400 7000` interchange) voor STIHL 017, 018, 021, 023, 025, 026, MS 170, MS 180, MS 210, MS 230, MS 250, MS 260.
- **Amazon Marktplaatsbeschikbaarheid**: ASIN `B0068M5NAG` is actief en verifieerbaar geregistreerd op amazon.nl en amazon.de onder Bosch Automotive Aftermarket.
- **Verificatiedatum**: 2026-11-01
- **Beperkingen & Beleid**: OEM-supplier branded equivalent (Bosch blister/doosje), geen originele STIHL fabrieksverpakking. Directe affiliatelinks blijven in runtime op veilige zoekfallback totdat de Creators API live is.

### B. NGK BPMR7A (`0000 400 7000`)
- **STIHL Part Reference**: `0000 400 7000` (corrected from CMR6H)
- **Brand / Manufacturer**: NGK (Niterra Co., Ltd.)
- **OEM Classification**: `OEM_SUPPLIER_EQUIVALENT`
- **Manufacturer MPN**: `BPMR7A` / Stock No. `6703`
- **Universal UPC / GTIN**: `0087295167038` (NGK Box) / `795711072025` (STIHL OEM)
- **Verified Active ASIN**: **`B001RM8J76`** (Title: *"NGK 6703 BPMR7A Standard Spark Plug"*)
- **Status**: **`VERIFIED_COMPLETE`**
- **Onafhankelijke Externe Bron**: [AmzChart Product Research](https://amzchart.com/product-research/spark-plugs-15716421)
- **Bewezen Productidentiteit**: AmzChart product intelligence catalogusrecord bevestigt Amazon ASIN `B001RM8J76` als authentieke NGK BPMR7A (Stock No. 6703, UPC/GTIN: `0087295167038` / `087295167038`) in categorie Small Engine / Automotive Replacement Spark Plugs.
- **STIHL-Compatibiliteit**: Bevestigt STIHL primaire Quick Reference Guide specificatie: `0000 400 7000` is de standaardfabrieksbougie van NGK voor STIHL TS 400, TS 410, TS 420 doorslijpers en MS 290, MS 310, MS 390, 029, 039 kettingzagen.
- **Amazon Marktplaatsbeschikbaarheid**: ASIN `B001RM8J76` is actief en continu verifieerbaar op amazon.nl en amazon.de met hoge catalogusstabiliteit.
- **Verificatiedatum**: 2026-11-01
- **Beperkingen & Beleid**: OEM-supplier branded equivalent. Vaste SAE aansluitmoer (solid terminal). Runtime links blijven zoekfallback.

### C. NGK CMR6H (`0000 400 7011`)
- **STIHL Part Reference**: `0000 400 7011`
- **Brand / Manufacturer**: NGK (Niterra Co., Ltd.)
- **OEM Classification**: `OEM_SUPPLIER_EQUIVALENT`
- **Manufacturer MPN**: `CMR6H` / Stock No. `3365` (M10x1.0 thread, solid terminal)
- **Universal UPC / GTIN**: `0087295133651`
- **Verified Active ASIN**: **`B001RMA5S2`** (Title: *"NGK (3365) CMR6H Standard Spark Plug"*)
- **Status**: **`VERIFIED_COMPLETE`**
- **Onafhankelijke Externe Bron**: [Motointegrator Artikel 842061](https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck)
- **Bewezen Productidentiteit**: NGK Zündkerze CMR6H (Herstellernummer / MPN: `CMR6H`, Bestellnummer / Stock No.: `3365`, EAN: `0087295133651` / `87295133651`). Technische specificaties: M10x1.0 schroefdraad, 12.7 mm schroefdraadlengte, 16 mm sleutelwijdte, ontstoord (10 kOhm). Bevestigt 1-op-1 ASIN `B001RMA5S2` als officiële NGK compactbougie.
- **STIHL-Compatibiliteit**: Directe fabrieksspecificatie en officiële kruisreferentie voor STIHL `0000 400 7011` (`00004007011`) voor STIHL 4-MIX & 2-MIX motoren (o.a. MS 261, MS 271, MS 362, BR 500, BR 600, FS 90, FS 100, FS 130).
- **Amazon Marktplaatsbeschikbaarheid**: ASIN `B001RMA5S2` is actief geregistreerd en continu leverbaar op amazon.nl en amazon.de.
- **Verificatiedatum**: 2026-11-01
- **Beperkingen & Beleid**: OEM-supplier branded equivalent. Vereist compacte 16 mm bougiesleutel (M10 schroefdraad). Runtime links blijven zoekfallback.

---

## 4. Production Safety Policy & Affiliate Publication Gate

Conform our core safety commitments:
1. **Zero Runtime ASIN Publication**: The runtime offers file `data/affiliate/amazon_part_offers.json` remains strictly empty (`[]`).
2. **Search Fallback Retention**: All 18,373 parts (including all 200 pilot parts) continue serving 100% compliant, direct keyword search links (`https://www.amazon.nl/s?k=...&tag=srihldecoder2-21`).
3. **Research Dataset Preservation**: The reconstructed evidence dossiers and corrected replacement ASINs are fully preserved in `PHASE59C_VERIFIED_MATCHES.json` for activation in Phase 59D once the Two-Gate Verification Mechanism and Creators API credentials are in place.
