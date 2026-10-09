import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

import { PartNormalizer, FITMENT_SCOPES } from './PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPartsPath = path.resolve(__dirname, '..', '..', 'data', 'parts_catalog.json');
const defaultFitmentsPath = path.resolve(__dirname, '..', '..', 'data', 'model_part_fitments.json');

let cachedPartsCatalog = null;
let cachedPartsMap = null;
let cachedFitments = null;
let cachedFitmentsByPartMap = null;
let cachedFitmentsByModelMap = null;

function readShardFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  if (filePath.endsWith('.gz')) {
    const raw = fs.readFileSync(filePath);
    const unzipped = zlib.gunzipSync(raw).toString('utf8');
    if (filePath.includes('.jsonl')) {
      const items = [];
      const lines = unzipped.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();
        if (trimmed) {
          try {
            items.push(JSON.parse(trimmed));
          } catch (err) {
            throw new Error(`Failed to parse JSONL in ${filePath} at line ${lineNum}: ${err.message}`);
          }
        }
      }
      return items;
    } else {
      const parsed = JSON.parse(unzipped);
      return Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.fitments) ? parsed.fitments : (Array.isArray(parsed.observations) ? parsed.observations : []));
    }
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.jsonl')) {
      const items = [];
      const lines = content.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();
        if (trimmed) {
          try {
            items.push(JSON.parse(trimmed));
          } catch (err) {
            throw new Error(`Failed to parse JSONL in ${filePath} at line ${lineNum}: ${err.message}`);
          }
        }
      }
      return items;
    }
    const doc = JSON.parse(content);
    return Array.isArray(doc.items) ? doc.items : (Array.isArray(doc.fitments) ? doc.fitments : (Array.isArray(doc.observations) ? doc.observations : []));
  }
}

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
    cachedPartsMap = new Map();
    for (const p of cachedPartsCatalog) {
      cachedPartsMap.set(p.part_number, p);
    }
  }

  if (cachedFitments === null) {
    try {
      if (fs.existsSync(defaultFitmentsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultFitmentsPath, 'utf8'));
        if (Array.isArray(doc.fitments)) {
          cachedFitments = doc.fitments;
        } else if (Array.isArray(doc.shard_files)) {
          const dir = path.dirname(defaultFitmentsPath);
          const all = [];
          for (const sFile of doc.shard_files) {
            const sPath = path.join(dir, sFile);
            all.push(...readShardFile(sPath));
          }
          cachedFitments = all;
        } else {
          cachedFitments = [];
        }
      } else {
        cachedFitments = [];
      }
    } catch (e) {
      cachedFitments = [];
    }
    cachedFitmentsByPartMap = new Map();
    cachedFitmentsByModelMap = new Map();
    for (const f of cachedFitments) {
      if (!cachedFitmentsByPartMap.has(f.part_number)) {
        cachedFitmentsByPartMap.set(f.part_number, []);
      }
      cachedFitmentsByPartMap.get(f.part_number).push(f);

      const mKey = f.canonical_model_id;
      if (!cachedFitmentsByModelMap.has(mKey)) {
        cachedFitmentsByModelMap.set(mKey, []);
      }
      cachedFitmentsByModelMap.get(mKey).push(f);
    }
  }
}

function filterFitmentsForModel(allModelFitments, variantKey, configurationKey) {
  const cleanVar = variantKey && variantKey !== 'base' ? variantKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;
  const cleanCfg = configurationKey && configurationKey !== 'base' ? configurationKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;

  return allModelFitments.filter(f => {
    const fVar = (f.variant_key || 'base').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fCfg = f.configuration_key ? f.configuration_key.toLowerCase().replace(/[^a-z0-9]+/g, '_') : null;

    if (cleanCfg) {
      // Configuration query: must match EXACT_CONFIGURATION and matching configuration_key
      if (f.fitment_scope !== FITMENT_SCOPES.EXACT_CONFIGURATION) return false;
      if (!fCfg) return false;
      const matchCfg = fCfg === cleanCfg || fCfg.startsWith(cleanCfg + '_') || cleanCfg.startsWith(fCfg);
      if (!matchCfg) return false;
      if (cleanVar && fVar !== cleanVar && fVar !== 'base') return false;
      return true;
    }

    if (cleanVar) {
      // Variant query: must match variant and not be restricted to a specific configuration
      if (fVar !== cleanVar) return false;
      if (fCfg && fCfg !== 'base') return false;
      return f.fitment_scope === FITMENT_SCOPES.EXACT_VARIANT || f.fitment_scope === FITMENT_SCOPES.MULTI_VARIANT_EXPLICIT;
    }

    // Base model query: only BASE_MODEL_CONFIRMED with no variant and no configuration
    if (fVar !== 'base') return false;
    if (fCfg && fCfg !== 'base') return false;
    return f.fitment_scope === FITMENT_SCOPES.BASE_MODEL_CONFIRMED;
  });
}

export class PartCatalogResolver {
  constructor(partsCatalog = null, fitments = null) {
    this.partsCatalog = Array.isArray(partsCatalog?.parts) ? partsCatalog.parts : (Array.isArray(partsCatalog) ? partsCatalog : null);
    if (Array.isArray(fitments?.fitments)) {
      this.fitments = fitments.fitments;
    } else if (Array.isArray(fitments?.items)) {
      this.fitments = fitments.items;
    } else if (Array.isArray(fitments)) {
      this.fitments = fitments;
    } else if (Array.isArray(fitments?.shard_files)) {
      const dir = path.dirname(defaultFitmentsPath);
      const all = [];
      for (const sFile of fitments.shard_files) {
        const sPath = path.join(dir, sFile);
        all.push(...readShardFile(sPath));
      }
      this.fitments = all;
    } else {
      this.fitments = null;
    }

    this._indexedPartsMap = null;
    this._indexedFitmentsByPart = null;
    this._indexedFitmentsByModel = null;
  }

  _ensureIndexed() {
    if (!this._indexedPartsMap && this.partsCatalog) {
      this._indexedPartsMap = new Map();
      for (const p of this.partsCatalog) {
        this._indexedPartsMap.set(p.part_number, p);
      }
    }
    if (!this._indexedFitmentsByPart && this.fitments) {
      this._indexedFitmentsByPart = new Map();
      this._indexedFitmentsByModel = new Map();
      for (const f of this.fitments) {
        if (!this._indexedFitmentsByPart.has(f.part_number)) {
          this._indexedFitmentsByPart.set(f.part_number, []);
        }
        this._indexedFitmentsByPart.get(f.part_number).push(f);

        const mKey = f.canonical_model_id;
        if (!this._indexedFitmentsByModel.has(mKey)) {
          this._indexedFitmentsByModel.set(mKey, []);
        }
        this._indexedFitmentsByModel.get(mKey).push(f);
      }
    }
  }

  resolvePartNumber(rawPartNumber, database = null) {
    if (database) {
      return PartCatalogResolver.resolvePartNumber(rawPartNumber, database);
    }
    const canonicalPartNo = PartNormalizer.normalizePartNumber(rawPartNumber);
    if (!canonicalPartNo) return { found: false, part_number: null, fitments: [] };

    if (this.partsCatalog && this.fitments) {
      this._ensureIndexed();
      const part = this._indexedPartsMap.get(canonicalPartNo);
      if (!part) return { found: false, part_number: null, fitments: [] };

      const fitments = this._indexedFitmentsByPart.get(canonicalPartNo) || [];
      return {
        found: true,
        part_number: part.part_number,
        part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part.part_number),
        part_name: part.part_name,
        part_name_normalized: part.part_name_normalized,
        source_count: part.source_count,
        fitment_count: fitments.length,
        fitments: fitments.map(f => ({
          canonical_model_id: f.canonical_model_id,
          variant_key: f.variant_key,
          configuration_key: f.configuration_key || null,
          configuration_name: f.configuration_name || null,
          fitment_scope: f.fitment_scope,
          section_key: f.section_key,
          section_name: f.section_name,
          diagram_position: f.diagram_position,
          quantity: f.quantity,
          source_evidence_status: f.source_evidence_status,
          superseded_by: f.superseded_by || null
        }))
      };
    }

    const res = PartCatalogResolver.resolvePartNumber(rawPartNumber);
    if (!res) return { found: false, part_number: null, fitments: [] };
    return { found: true, ...res };
  }

  getPartsForModel(modelName, variantKey = null, configurationKey = null, database = null) {
    if (configurationKey && typeof configurationKey === 'object' && (configurationKey.parts || configurationKey.model_part_fitments)) {
      database = configurationKey;
      configurationKey = null;
    }
    if (database) {
      return PartCatalogResolver.getPartsForModel(modelName, variantKey, configurationKey, database);
    }
    if (this.partsCatalog && this.fitments) {
      if (!modelName) return [];
      const normId = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      this._ensureIndexed();
      const allModelFitments = this._indexedFitmentsByModel?.get(normId) || [];
      const matchingFitments = filterFitmentsForModel(allModelFitments, variantKey, configurationKey);
      return matchingFitments.map(f => {
        const part = this._indexedPartsMap?.get(f.part_number);
        return {
          part_number: f.part_number,
          part_number_display: PartNormalizer.formatPartNumber(f.part_number),
          part_name: part?.part_name || f.section_name,
          section_key: f.section_key,
          section_name: f.section_name,
          diagram_position: f.diagram_position,
          quantity: f.quantity,
          variant_key: f.variant_key,
          configuration_key: f.configuration_key || null,
          configuration_name: f.configuration_name || null,
          fitment_scope: f.fitment_scope,
          source_evidence_status: f.source_evidence_status
        };
      });
    }
    return PartCatalogResolver.getPartsForModel(modelName, variantKey, configurationKey);
  }

  /**
   * Resolves an 11-digit STIHL part number against the harvested catalog and fitment relationships.
   */
  static resolvePartNumber(rawPartNumber, database = null, options = {}) {
    const canonicalPartNo = PartNormalizer.normalizePartNumber(rawPartNumber);
    if (!canonicalPartNo) return null;

    if (database && Array.isArray(database.parts) && Array.isArray(database.model_part_fitments)) {
      const part = database.parts.find(p => p.part_number === canonicalPartNo);
      if (!part) return null;
      const fitments = database.model_part_fitments.filter(f => f.part_number === canonicalPartNo);
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
          configuration_key: f.configuration_key || null,
          configuration_name: f.configuration_name || null,
          fitment_scope: f.fitment_scope,
          section_key: f.section_key,
          section_name: f.section_name,
          diagram_position: f.diagram_position,
          quantity: f.quantity,
          source_evidence_status: f.source_evidence_status,
          superseded_by: f.superseded_by || null
        }))
      };
    }

    loadDefaultPartsData();
    const part = cachedPartsMap?.get(canonicalPartNo);
    if (!part) return null;

    const fitments = cachedFitmentsByPartMap?.get(canonicalPartNo) || [];

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
        configuration_key: f.configuration_key || null,
        configuration_name: f.configuration_name || null,
        fitment_scope: f.fitment_scope,
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
   * Retrieves all verified parts and diagram sections for a specific model ID and optional variant/configuration.
   */
  static getPartsForModel(modelId, variantKey = null, configurationKey = null, database = null) {
    if (!modelId) return [];

    if (configurationKey && typeof configurationKey === 'object' && (configurationKey.parts || configurationKey.model_part_fitments)) {
      database = configurationKey;
      configurationKey = null;
    }

    const normId = modelId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    if (database && Array.isArray(database.parts) && Array.isArray(database.model_part_fitments)) {
      const partsMap = new Map(database.parts.map(p => [p.part_number, p]));
      const allModelFitments = database.model_part_fitments.filter(f => f.canonical_model_id === normId);
      const matchingFitments = filterFitmentsForModel(allModelFitments, variantKey, configurationKey);

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
          configuration_key: f.configuration_key || null,
          configuration_name: f.configuration_name || null,
          fitment_scope: f.fitment_scope,
          source_evidence_status: f.source_evidence_status
        };
      });
    }

    loadDefaultPartsData();
    const allModelFitments = cachedFitmentsByModelMap?.get(normId) || [];
    const matchingFitments = filterFitmentsForModel(allModelFitments, variantKey, configurationKey);

    return matchingFitments.map(f => {
      const part = cachedPartsMap?.get(f.part_number);
      return {
        part_number: f.part_number,
        part_number_display: PartNormalizer.formatPartNumber(f.part_number),
        part_name: part?.part_name || f.section_name,
        section_key: f.section_key,
        section_name: f.section_name,
        diagram_position: f.diagram_position,
        quantity: f.quantity,
        variant_key: f.variant_key,
        configuration_key: f.configuration_key || null,
        configuration_name: f.configuration_name || null,
        fitment_scope: f.fitment_scope,
        source_evidence_status: f.source_evidence_status
      };
    });
  }
}
