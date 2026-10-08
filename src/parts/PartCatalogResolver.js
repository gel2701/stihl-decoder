import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from './PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPartsPath = path.resolve(__dirname, '..', '..', 'data', 'parts_catalog.json');
const defaultFitmentsPath = path.resolve(__dirname, '..', '..', 'data', 'model_part_fitments.json');

let cachedPartsCatalog = null;
let cachedFitments = null;

function loadDefaultPartsData() {
  if (cachedPartsCatalog === null) {
    try {
      if (fs.existsSync(defaultPartsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultPartsPath, 'utf8'));
        cachedPartsCatalog = Array.isArray(doc.parts) ? doc.parts : [];
      } else {
        cachedPartsCatalog = [];
      }
    } catch (e) {
      cachedPartsCatalog = [];
    }
  }

  if (cachedFitments === null) {
    try {
      if (fs.existsSync(defaultFitmentsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultFitmentsPath, 'utf8'));
        cachedFitments = Array.isArray(doc.fitments) ? doc.fitments : [];
      } else {
        cachedFitments = [];
      }
    } catch (e) {
      cachedFitments = [];
    }
  }
}

export class PartCatalogResolver {
  constructor(partsCatalog = null, fitments = null) {
    this.partsCatalog = Array.isArray(partsCatalog?.parts) ? partsCatalog.parts : (Array.isArray(partsCatalog) ? partsCatalog : null);
    this.fitments = Array.isArray(fitments?.fitments) ? fitments.fitments : (Array.isArray(fitments) ? fitments : null);
  }

  resolvePartNumber(rawPartNumber, database = null) {
    const db = database || { parts: this.partsCatalog, model_part_fitments: this.fitments };
    const res = PartCatalogResolver.resolvePartNumber(rawPartNumber, db);
    if (!res) return { found: false, part_number: null, fitments: [] };
    return { found: true, ...res };
  }

  getPartsForModel(modelName, variantKey = null, database = null) {
    const db = database || { parts: this.partsCatalog, model_part_fitments: this.fitments };
    return PartCatalogResolver.getPartsForModel(modelName, variantKey, db);
  }

  /**
   * Resolves an 11-digit STIHL part number against the harvested catalog and fitment relationships.
   */
  static resolvePartNumber(rawPartNumber, database = null, options = {}) {
    const canonicalPartNo = PartNormalizer.normalizePartNumber(rawPartNumber);
    if (!canonicalPartNo) return null;

    loadDefaultPartsData();
    const partsList = (database && Array.isArray(database.parts)) ? database.parts : cachedPartsCatalog;
    const fitmentsList = (database && Array.isArray(database.model_part_fitments)) ? database.model_part_fitments : cachedFitments;

    const part = partsList.find(p => p.part_number === canonicalPartNo);
    if (!part) return null;

    const fitments = fitmentsList.filter(f => f.part_number === canonicalPartNo);

    return {
      part_number: part.part_number,
      part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part.part_number),
      part_name: part.part_name,
      part_name_normalized: part.part_name_normalized,
      source_count: part.source_count,
      fitment_count: fitments.length,
      fitments: fitments.map(f => ({
        canonical_model_id: f.canonical_model_id,
        variant_key: f.variant_key,
        section_key: f.section_key,
        section_name: f.section_name,
        diagram_position: f.diagram_position,
        quantity: f.quantity,
        source_evidence_status: f.source_evidence_status,
        superseded_by: f.superseded_by || null
      }))
    };
  }

  /**
   * Retrieves all verified parts and diagram sections for a specific model ID and optional variant.
   */
  static getPartsForModel(modelId, variantKey = null, database = null) {
    if (!modelId) return [];

    const normId = modelId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    loadDefaultPartsData();

    const fitmentsList = (database && Array.isArray(database.model_part_fitments)) ? database.model_part_fitments : cachedFitments;
    const partsList = (database && Array.isArray(database.parts)) ? database.parts : cachedPartsCatalog;
    const partsMap = new Map(partsList.map(p => [p.part_number, p]));

    const matchingFitments = fitmentsList.filter(f => {
      if (f.canonical_model_id !== normId) return false;
      if (variantKey && f.variant_key !== variantKey && f.variant_key !== 'base') return false;
      return true;
    });

    return matchingFitments.map(f => {
      const part = partsMap.get(f.part_number);
      return {
        part_number: f.part_number,
        part_number_display: PartNormalizer.formatPartNumber(f.part_number),
        part_name: part?.part_name || f.section_name,
        section_key: f.section_key,
        section_name: f.section_name,
        diagram_position: f.diagram_position,
        quantity: f.quantity,
        variant_key: f.variant_key,
        source_evidence_status: f.source_evidence_status
      };
    });
  }
}
