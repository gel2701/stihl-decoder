# STIHLDecoder Implementation Plan

This plan tracks future product and architecture work that builds on the immutable foundation defined in `FOUNDATION.md`.

## Planning rules

- Existing foundation behavior remains intact unless a later migration explicitly supersedes it.
- Canonical STIHL technical data remains separated from user/private machine data.
- New ideas enter here as planned work before becoming active implementation scope.
- External repositories may be used as inspiration only when licensing and security allow it; unlicensed source code is not copied into STIHLDecoder.

---

## Planned — STIHL Paspoort 2.0: Warranty & Service History

**Status:** PLANNED / NOT YET ACTIVE  
**Origin:** Functional concept observed in `HaydenJa27/Warranty-Management-System` (STIHL Shop Dandenong). Use the concept only; do not copy source code or assets because the repository has no stated license.

### Goal

Expand the current STIHL Paspoort from a machine/result export into a persistent digital machine passport that combines machine identity with ownership, purchase, warranty, maintenance and repair history.

### Proposed functional scope

1. **Machine identity**
   - internal `machine_id`
   - serial number
   - linked canonical `model_id`
   - STIHL article/reference number where available
   - manufacture/production evidence already provided by STIHLDecoder
   - QR passport identifier

2. **Purchase & warranty**
   - purchase date
   - dealer / seller
   - purchase document reference
   - warranty start date
   - warranty end date
   - warranty status
   - optional proof-of-purchase upload

3. **Service history**
   - service date
   - maintenance type
   - repairs performed
   - replaced parts / part numbers
   - operating hours where applicable
   - costs
   - technician/workshop or self-service indicator
   - free-text notes
   - optional photos/documents

4. **Machine timeline**
   - chronological purchase, warranty, service and repair events
   - clear audit trail per machine
   - future support for ownership transfer without losing technical/service history

5. **Search & management**
   - search by serial number, model, machine ID and QR passport
   - sort/filter by model, warranty state and service date
   - private owner dashboard / "Mijn machines"
   - admin/review tools only where necessary

### Data architecture

Keep these domains strictly separated:

```text
CANONICAL STIHL DATA
  model / serial interpretation / technical specs / evidence

MACHINE PASSPORT
  machine_id / serial_number / model_id / purchase / warranty

PRIVATE OWNER DATA
  authenticated account / owner profile / contact data

SERVICE HISTORY
  service events / repairs / parts / costs / notes / documents
```

**Hard rule:** private owner, warranty or service information must never be written to:

- `data/stihl_database.json`
- `data/public_evidence_facts.json`

Use a separate private datastore with explicit authorization and access control.

### Privacy & security requirements

Before implementation:

- define authentication and authorization model;
- define data ownership and deletion/export behavior;
- minimize stored personal data;
- encrypt/secure sensitive document storage;
- keep public QR views separate from authenticated private detail views;
- do not expose owner contact information through a public serial-number lookup;
- add audit logging for privileged/admin changes.

### Suggested delivery phases

**P2.0-A — Data model & privacy design**  
Define schema, ownership rules, public/private boundaries and migration strategy.

**P2.0-B — Persistent machine passport**  
Create authenticated machine records linked to canonical STIHL model/serial data and existing QR passport functionality.

**P2.0-C — Warranty module**  
Purchase date, dealer, warranty dates/status and document references.

**P2.0-D — Service & repair timeline**  
Maintenance events, repairs, parts, costs, notes and attachments.

**P2.0-E — My Machines UX**  
Search, filters, timeline, machine detail and mobile/QR flow.

**P2.0-F — Transfer / workshop workflow**  
Optional ownership transfer, workshop entries and controlled third-party service updates.

### Future value

This turns STIHLDecoder from primarily a decoding/reference tool into a long-lived machine record: decode -> identify -> passport -> maintain -> repair -> document -> transfer.

### Explicit non-goals for first implementation

- no automatic warranty claims;
- no assumption of official STIHL warranty-system integration;
- no public exposure of personal data;
- no copying of the VB Warranty Management System code or STIHL logo/assets from that repository;
- no modification of canonical technical evidence as a side effect of passport/service activity.

---

## Backlog note

Keep this feature planned until current official product/evidence harvesting and canonical-data work is stable. Re-evaluate scope before activation so the private account/data architecture is designed deliberately rather than added onto the public evidence store.
