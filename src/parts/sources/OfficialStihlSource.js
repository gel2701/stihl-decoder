import fs from 'node:fs';
import path from 'node:path';
import { PartNormalizer, FITMENT_SCOPES } from '../PartNormalizer.js';

export class OfficialStihlSource {
  constructor(options = {}) {
    this.sourceId = 'official_stihl';
    this.sourceName = 'Official STIHL Service Documentation';
    this.sourceType = 'OFFICIAL_MANUFACTURER_DOCUMENTATION';
    this.authorityLevel = 'OFFICIAL_STIHL';

    // Load verified evidence records from disk
    const evidencePath = options.evidencePath || path.resolve('data/verified_official_parts_evidence.json');
    if (fs.existsSync(evidencePath)) {
      try {
        this.evidenceRecords = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      } catch (err) {
        this.evidenceRecords = [];
      }
    } else {
      this.evidenceRecords = [];
    }
  }

  /**
   * Validate that a record satisfies the strict official evidence contract
   */
  isValidOfficialRecord(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.verification_status !== 'OFFICIAL_SOURCE_VERIFIED') return false;
    if (!item.part_number || !PartNormalizer.normalizePartNumber(item.part_number)) return false;
    if (!item.source_url || typeof item.source_url !== 'string') return false;
    if (!item.source_url.startsWith('https://www.stihl.')) return false;
    if (!item.response_sha256 || typeof item.response_sha256 !== 'string' || item.response_sha256.length !== 64) return false;
    if (!item.models || !Array.isArray(item.models) || item.models.length === 0) return false;
    return true;
  }

  /**
   * Retrieve validated official service parts for a given model
   */
  async getOfficialPartsForModel(modelName) {
    const cleanModel = modelName.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const parts = [];

    for (const item of this.evidenceRecords) {
      if (!this.isValidOfficialRecord(item)) continue;

      const modelMatches = item.models.some(m => m.toUpperCase().replace(/^STIHL\s+/i, '').trim() === cleanModel);
      if (!modelMatches) continue;

      const canonicalPartNo = PartNormalizer.normalizePartNumber(item.part_number);
      const scope = item.fitment_scope && Object.values(FITMENT_SCOPES).includes(item.fitment_scope)
        ? item.fitment_scope
        : (item.variant_condition ? FITMENT_SCOPES.APPLICATION_SPECIFIC : FITMENT_SCOPES.BASE_MODEL_CONFIRMED);

      parts.push({
        part_number: canonicalPartNo,
        part_number_display: PartNormalizer.formatPartNumber(canonicalPartNo),
        part_name_raw: item.part_name,
        part_name_normalized: PartNormalizer.normalizePartName(item.part_name),
        diagram_position: 'OFFICIAL_REF',
        quantity: 1,
        notes: item.fitment_notes || item.doc_ref || 'Official STIHL Service Documentation',
        variant_condition: item.variant_condition || null,
        serial_condition: item.serial_condition || null,
        section_key: PartNormalizer.normalizeSectionKey(item.section_name || 'Service Kits'),
        section_name: item.section_name || 'Service Kits',
        source_id: this.sourceId,
        source_url: item.source_url,
        source_evidence_status: 'OFFICIAL_STIHL',
        fitment_scope: scope,
        model: cleanModel
      });
    }

    return parts;
  }
}
