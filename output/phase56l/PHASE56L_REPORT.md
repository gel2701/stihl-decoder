# STIHLDECODER — PHASE 56L.1 DRIVE RESOLUTION INTEGRITY & ATTACHMENT SAFETY REPORT

**Status:** PASS
**Baseline commit:** `f7c9231ddec6599b0afe690bd873cc5186b2bda1`
**Datum:** 2026-10-25T13:59:09.570Z
**Repository:** `gel2701/stihl-decoder`

---

## 1. Doel & Probleemstelling (Phase 56L.1)

In Phase 56L.1 zijn drie concrete defecten opgelost die aanwezig waren in de initiële Phase 56L oplevering:
1. **Defect A — Attachments werden ten onrechte als aangedreven machine gezien:**
   Tool- en accessoire-aanduidingen zoals `BG-KM`, `FS-KM`, `HL-KM`, `HT-KM` en `FS Power Tool Attachments` werden door de prefix-parser gematcht op `BG`, `FS`, `HL`, `HT` en ten onrechte geclassificeerd als benzine-aandrijving.
2. **Defect B — Expliciet bewijs werd niet canoniek doorgegeven aan de resolver:**
   In de dry-run werden `explicit_power_source` en `explicit_fuel_type` niet als canonieke input gelezen door `resolveDriveType()`, waardoor historische numerieke modellen (zoals `026`) op `UNKNOWN` uitkwamen en expliciete modellen ten onrechte als `FAMILY_RULE` werden geteld.
3. **Defect C — Familie-provenance was niet live geverifieerd:**
   Statische placeholders met `00:00:00.000Z` voldeden niet aan de herkomst-eis. Alle 28 actieve familieregels zijn live opgehaald tegen officiële STIHL-bronnen en voorzien van echte HTTP-statussen, headers, body SHA-256 hashes en timestamp-audits.

---

## 2. Attachment Safety Gate (Defect A)

Er is een centrale veiligheidspoort `isAttachmentDesignation()` / `isPoweredModelDesignation()` toegevoegd in [`src/ModelFamilyDriveRegistry.js`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/src/ModelFamilyDriveRegistry.js) en geïntegreerd in de machinemodelclassificatie.

- **Geïsoleerde unpowered attachments:** **25** catalogusitems (o.a. KombiTools `-KM`, MultiTools `-MM` en tool attachments).
- **Resultaat voor attachments:** `drive_type = UNKNOWN`, `resolution = ATTACHMENT_NOT_POWERED`, `display = Niet vastgesteld`.
- **Harde gate:** `POWERED_ATTACHMENT_MISCLASSIFICATIONS = 0` (**PASS**).

### Verplichte attachment tests:
- `BG-KM` -> `ATTACHMENT_NOT_POWERED` (**PASS**)
- `FS-KM` -> `ATTACHMENT_NOT_POWERED` (**PASS**)
- `HL-KM` -> `ATTACHMENT_NOT_POWERED` (**PASS**)
- `HT-KM` -> `ATTACHMENT_NOT_POWERED` (**PASS**)
- `FS Power Tool Attachments` -> `ATTACHMENT_NOT_POWERED` (**PASS**)

Gewone aangedreven machines blijven ongewijzigd correct functioneren:
- `BG 86` -> `PETROL` (`FAMILY_RULE`)
- `FS 55` -> `PETROL` (`FAMILY_RULE`)
- `HT 131` -> `PETROL` (`FAMILY_RULE`)
- `MS 211` -> `PETROL` (`FAMILY_RULE`)
- `MSA 300` -> `BATTERY` (`FAMILY_RULE`)
- `MSE 210` -> `MAINS_ELECTRIC` (`FAMILY_RULE`)

---

## 3. Expliciet Bewijs & Canoniek Input Contract (Defect B)

Het inputcontract van `resolveDriveType()` ondersteunt nu officieel en uniform:
- `modelInput.explicit_power_source || modelInput.power_source || modelInput.basic_classification?.power_source`
- `modelInput.explicit_fuel_type || modelInput.fuel_type || modelInput.basic_classification?.fuel_type`

### Strikte precedentievolgorde:
1. **Attachment safety:** Niet-aangedreven attachments -> `ATTACHMENT_NOT_POWERED`.
2. **Expliciet modelbewijs:** Indien aanwezig en geen conflict -> `EXPLICIT_MODEL`.
3. **Conflictdetectie:** Indien expliciet bewijs strijdt met actieve familieregel -> `CONFLICT_QUARANTINED`.
4. **Geverifieerde familieregel:** Indien expliciet ontbreekt en familieregel actief -> `FAMILY_RULE`.
5. **Fail-closed:** Onbekend of ongeverifieerde prefix -> `UNVERIFIED_FAMILY` / `UNKNOWN`.

### Historische modellen:
Modellen zoals **`026`**, **`009`**, **`017`**, **`044`** met expliciete brandstofclassificatie (`GASOLINE`) worden nu correct via `EXPLICIT_MODEL` geclassificeerd als `PETROL` (`Benzine`), en vallen niet meer ten onrechte terug naar `UNKNOWN`.

- **Harde gate:** `EXPLICIT_EVIDENCE_PROPAGATION_VALID = true` (**PASS**).

---

## 4. Live Officiële Familie-Acquisitie & Provenance (Defect C)

Alle 28 actieve STIHL-families zijn live opgehaald en geverifieerd via [`scripts/fetch_official_family_evidence.mjs`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/scripts/fetch_official_family_evidence.mjs).
Het fetch-ledger is opgeslagen in [`data/harvest/phase56l/official_family_fetch_ledger.json`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/data/harvest/phase56l/official_family_fetch_ledger.json).

- **Actieve regels:** 28 / 28 geverifieerd
- **HTTP status:** 28 / 28 HTTP 200 OK
- **Echte per-request timestamps:** 28 / 28 aanwezig
- **Echte SHA-256 body hashes:** 28 / 28 berekend en gevalideerd
- **Fabricated records:** **0**
- **Harde gates:**
  - `FABRICATED_FAMILY_PROVENANCE = 0` (**PASS**)
  - `FAMILY_PROVENANCE_VERIFIED = true` (**PASS**)

---

## 5. Hernieuwde Sitewide Dekking & Statistieken

### A. Totale Catalogus (Alle 956 catalogusitems)
- **Totale entries:** 956
- **Expliciet opgelost (`EXPLICIT_MODEL`):** 110
- **Familieregel opgelost (`FAMILY_RULE`):** 292
- **Niet-aangedreven attachments (`ATTACHMENT_NOT_POWERED`):** 25
- **Ongeverifieerde families (`UNVERIFIED_FAMILY`):** 403
- **Onbekend (`UNKNOWN`):** 126
- **Conflicten in quarantaine (`CONFLICT_QUARANTINED`):** 0

### B. Aangedreven Machinekandidaten (931 machines, exclusief 25 attachments)
- **Gedefinieerde aandrijving:** 402 (43.18%)
- **Onbekend / Ongeverifieerd:** 529 (56.82%)

---

## 6. Catalogus- en SEO Freeze Invarianten

Alle strikte freeze-invarianten blijven 100% gehandhaafd:
- **Canonical parts:** 17.082 (intact)
- **Canonical fitments:** 175.106 (intact)
- **Diagram configuraties:** 766 (intact)
- **Evidence ledger records:** 208.412 (intact)
- **Diagram contexten:** 814 (intact)
- **Phase 56H diagram resoluties:** 344 (intact)
- **Phase 56J classificaties:** 110 (intact)
- **Indexable part pages:** 843 (exact intact)
- **Sitemap URLs:** 1.024 (exact intact)
- **Amazon search fallback URLs:** 17.082 met production Associate Tag `srihldecoder2-21`
- **Verified ASIN mappings:** 0 (geen speculatieve ASINs)

---

## 7. Overzicht van de 12 Oplever-Artifacts

Alle 12 verplichte artifacts zijn aanwezig in [`output/phase56l/`](file:///C:/Users/GelliusSnippe/.agents/stihl-decoder/output/phase56l/):
1. `MODEL_FAMILY_INVENTORY.json`
2. `OFFICIAL_FAMILY_EVIDENCE.json`
3. `DRIVE_TYPE_DRY_RUN.json`
4. `DRIVE_TYPE_CONFLICTS.json`
5. `DRIVE_TYPE_ACTIVATION.json`
6. `MODEL_COVERAGE_BEFORE_AFTER.json`
7. `ATTACHMENT_CLASSIFICATION_AUDIT.json` (NIEUW)
8. `FAMILY_PROVENANCE_INTEGRITY.json` (NIEUW)
9. `SEO_INTEGRITY.json`
10. `CATALOG_INTEGRITY.json`
11. `PHASE56L_SUMMARY.json`
12. `PHASE56L_REPORT.md`

---

## 8. Agent Routing & Compliance

- **9Router:** Bereikbaar (`http://127.0.0.1:20128/v1`), directe workspace-uitvoering gebruikt conform instructies.
- **Codex:** Niet gebruikt, geen review aangevraagd.
- **Acceptatie-invoer:** Zuiver gebaseerd op geautomatiseerde tests, audits en project-CI.
