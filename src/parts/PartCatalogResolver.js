import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

import { PartNormalizer, FITMENT_SCOPES } from './PartNormalizer.js';
import { SectionNormalizer } from './SectionNormalizer.js';
import { PartNameNormalizer } from './PartNameNormalizer.js';
import { normalizeModelQuery } from '../modelNormalizer.js';

/**
 * Lightweight precomputed index of canonical model IDs with verified renderable catalog parts or configurations.
 * Prevents synchronous decompression of 110MB+ fitment shards during cold homepage and serial decodes.
 */
export const RENDERABLE_CATALOG_MODELS = new Set([
  "009", "017", "018", "026", "036", "044", "046", "088",
  "bg_56", "bg_66", "bg_86", "bge_71",
  "br_420", "br_500", "br_550", "br_600", "br_700",
  "fr_410",
  "fs_100", "fs_120", "fs_131", "fs_200", "fs_350", "fs_38", "fs_410", "fs_460", "fs_490", "fs_55", "fs_80", "fs_85",
  "fsa_135", "fsa_45", "fse_60",
  "hla_56", "hla_66", "hs_45", "hse_52",
  "ms_162", "ms_170", "ms_172", "ms_180", "ms_182", "ms_200", "ms_201", "ms_210", "ms_212", "ms_230", "ms_250", "ms_251", "ms_260", "ms_261", "ms_270", "ms_280", "ms_290", "ms_310", "ms_311", "ms_340", "ms_341", "ms_360", "ms_361", "ms_362", "ms_390", "ms_440", "ms_441", "ms_460", "ms_461", "ms_462", "ms_661", "msa_190",
  "sh_56", "sh_86", "sha_56",
  "sr_430", "sr_450",
  "ts_410", "ts_420", "tsa_230"
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPartsPath = path.resolve(__dirname, '..', '..', 'data', 'parts_catalog.json');
const defaultFitmentsPath = path.resolve(__dirname, '..', '..', 'data', 'model_part_fitments.json');
const defaultConfigurationsPath = path.resolve(__dirname, '..', '..', 'data', 'parts_model_configurations.json');
const defaultSupersessionsPath = path.resolve(__dirname, '..', '..', 'data', 'parts_supersessions.json');

let cachedPartsCatalog = null;
let cachedPartsMap = null;
let cachedFitments = null;
let cachedFitmentsByPartMap = null;
let cachedFitmentsByModelMap = null;
let cachedConfigurations = null;
let cachedSupersessionsMap = null;

function loadDefaultSupersessionsData() {
  if (cachedSupersessionsMap === null) {
    cachedSupersessionsMap = new Map();
    try {
      if (fs.existsSync(defaultSupersessionsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultSupersessionsPath, 'utf8'));
        if (Array.isArray(doc.relations)) {
          for (const rel of doc.relations) {
            cachedSupersessionsMap.set(rel.from_part, rel);
          }
        }
      }
    } catch (e) {
      cachedSupersessionsMap = new Map();
    }
  }
}

function buildTechnicalProfile(part, fitments, compatibleModels) {
  loadDefaultSupersessionsData();
  const canonicalPartNo = part.part_number;
  const partNameRaw = part.part_name || '';
  const displayName = PartNameNormalizer.normalizeDisplayName(partNameRaw, canonicalPartNo);

  const qualityStatus = PartNameNormalizer.assessQuality(partNameRaw, canonicalPartNo);

  const meaningfulSections = new Set();
  const diagramContexts = [];
  const configs = new Set();

  for (const f of fitments) {
    const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
    if (canonSec) {
      meaningfulSections.add(canonSec);
    }
    if (f.configuration_key) {
      configs.add(f.configuration_key);
    }
    const pos = PartNormalizer.normalizeDiagramPosition(f.diagram_position);
    if (pos) {
      diagramContexts.push({
        canonical_model_id: f.canonical_model_id,
        configuration_key: f.configuration_key || null,
        configuration_name: f.configuration_name || null,
        section_name: canonSec || f.section_name,
        diagram_position: pos
      });
    }
  }

  const supersessionRel = cachedSupersessionsMap?.get(canonicalPartNo) || null;

  return {
    canonical_part_number: canonicalPartNo,
    display_name: displayName,
    part_name_raw: partNameRaw,
    name_quality_status: qualityStatus,
    quality_status: qualityStatus,
    model_count: compatibleModels.length,
    fitment_count: fitments.length,
    configuration_count: configs.size,
    sections: Array.from(meaningfulSections),
    canonical_sections: Array.from(meaningfulSections),
    has_meaningful_position: diagramContexts.length > 0,
    diagram_contexts: diagramContexts,
    supersession: supersessionRel ? {
      replaced_by: supersessionRel.to_part,
      relation: supersessionRel.relation,
      evidence_status: supersessionRel.evidence_status,
      source_id: supersessionRel.source_id,
      source_document: supersessionRel.source_document,
      provenance_status: supersessionRel.provenance_status || 'PROVENANCE_NOT_RECONFIRMED',
      applicability: supersessionRel.applicability || 'EVIDENCE_ONLY_SCOPE_UNRESOLVED',
      public_active: Boolean(supersessionRel.public_active),
      scope: supersessionRel.scope || {
        model_ids: [],
        variant_keys: [],
        configuration_keys: [],
        serial_condition: null
      },
      target_in_catalog: supersessionRel.target_in_catalog,
      active_in_catalog: supersessionRel.active_in_catalog
    } : null,
    evidence_summary: {
      sources: part.sources || ['sparepartsworld'],
      has_real_positions: diagramContexts.length > 0,
      has_canonical_section: meaningfulSections.size > 0
    }
  };
}

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

function loadDefaultConfigurationsData() {
  if (cachedConfigurations === null) {
    try {
      if (fs.existsSync(defaultConfigurationsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultConfigurationsPath, 'utf8'));
        cachedConfigurations = Array.isArray(doc.configurations) ? doc.configurations : [];
      } else {
        cachedConfigurations = [];
      }
    } catch (e) {
      cachedConfigurations = [];
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
      // Configuration query: must match EXACT_CONFIGURATION and exact normalized configuration_key
      if (f.fitment_scope !== FITMENT_SCOPES.EXACT_CONFIGURATION) return false;
      if (!fCfg) return false;
      if (fCfg !== cleanCfg) return false;
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



export const MULTILINGUAL_TECHNICAL_SYNONYMS = {
  // Dutch -> English
  'carburateur': 'carburetor',
  'carburateurs': 'carburetor',
  'koppeling': 'clutch',
  'koppelingen': 'clutch',
  'bougie': 'spark plug',
  'bougies': 'spark plug',
  'luchtfilter': 'air filter',
  'luchtfilters': 'air filter',
  'brandstoffilter': 'fuel filter',
  'brandstoffilters': 'fuel filter',
  'benzinefilter': 'fuel filter',
  'benzinefilters': 'fuel filter',
  'oliefilter': 'oil filter',
  'oliefilters': 'oil filter',
  'oliepomp': 'oil pump',
  'oliepompen': 'oil pump',
  'zaagblad': 'guide bar',
  'zaagbladen': 'guide bar',
  'zwaard': 'guide bar',
  'zwaarden': 'guide bar',
  'zaagketting': 'chain',
  'zaagkettingen': 'chain',
  'ketting': 'chain',
  'kettingen': 'chain',
  'kettingwiel': 'sprocket',
  'kettingwielen': 'sprocket',
  'tandwiel': 'sprocket',
  'tandwielen': 'sprocket',
  'rondsel': 'sprocket',
  'startkoord': 'rope',
  'startkoorden': 'rope',
  'trekkoord': 'rope',
  'trekkoorden': 'rope',
  'starter': 'starter',
  'starters': 'starter',
  'trekstarter': 'starter',
  'handstarter': 'starter',
  'pakking': 'gasket',
  'pakkingen': 'gasket',
  'pakkingset': 'gasket set',
  'membraan': 'diaphragm',
  'membranen': 'diaphragm',
  'membraanset': 'diaphragm',
  'veer': 'spring',
  'veren': 'spring',
  'trekveer': 'spring',
  'cilinder': 'cylinder',
  'cilinders': 'cylinder',
  'cilinderset': 'cylinder',
  'zuiger': 'piston',
  'zuigers': 'piston',
  'zuigerveer': 'piston ring',
  'zuigerveren': 'piston ring',
  'uitlaat': 'muffler',
  'uitlaten': 'muffler',
  'demper': 'muffler',
  'dempers': 'muffler',
  'krukas': 'crankshaft',
  'krukassen': 'crankshaft',
  'kettingrem': 'chain brake',
  'remband': 'brake band',
  'ontsteking': 'ignition',
  'ontstekingsmodule': 'ignition module',
  'bobine': 'ignition module',
  'vliegwiel': 'flywheel',
  'kettingdeksel': 'clutch cover',
  'koppelingsdeksel': 'clutch cover',
  'handgreep': 'handle',
  'beugelgreep': 'handlebar',
  'handbeschermer': 'hand guard',
  'schakelaar': 'switch',
  'stopschakelaar': 'switch',
  'gashendel': 'throttle trigger',
  'gastrekker': 'throttle trigger',
  'tankdop': 'filler cap',
  'oliedop': 'oil cap',
  'benzinedop': 'fuel cap',
  'slang': 'hose',
  'brandstofslang': 'fuel hose',
  'olieslang': 'oil hose',
  'aanzuigslang': 'intake hose',
  'spruitstuk': 'manifold',
  'keerring': 'oil seal',
  'keerringen': 'oil seal',
  'oliekering': 'oil seal',
  'lager': 'bearing',
  'lagers': 'bearing',
  'kogellager': 'ball bearing',
  'naaldlager': 'needle bearing',

  // German -> English
  'vergaser': 'carburetor',
  'kupplung': 'clutch',
  'kupplungen': 'clutch',
  'fliehkraftkupplung': 'clutch',
  'zündkerze': 'spark plug',
  'zündkerzen': 'spark plug',
  'kerze': 'spark plug',
  'luftfilter': 'air filter',
  'kraftstofffilter': 'fuel filter',
  'benzinfilter': 'fuel filter',
  'kraftstoffschlauch': 'fuel hose',
  'benzinschlauch': 'fuel hose',
  'ölfilter': 'oil filter',
  'ölpumpe': 'oil pump',
  'ölpumpen': 'oil pump',
  'führungsschiene': 'guide bar',
  'führungsschienen': 'guide bar',
  'schwert': 'guide bar',
  'schwerter': 'guide bar',
  'sägekette': 'chain',
  'sägeketten': 'chain',
  'kette': 'chain',
  'ketten': 'chain',
  'kettenrad': 'sprocket',
  'ritzel': 'sprocket',
  'anwerfseil': 'rope',
  'starterseil': 'rope',
  'anwerfer': 'starter',
  'seilzugstarter': 'starter',
  'rückholfeder': 'rewind spring',
  'dichtung': 'gasket',
  'dichtungen': 'gasket',
  'dichtsatz': 'gasket set',
  'membran': 'diaphragm',
  'membrane': 'diaphragm',
  'membransatz': 'diaphragm',
  'feder': 'spring',
  'federn': 'spring',
  'zylinder': 'cylinder',
  'kolben': 'piston',
  'kolbenring': 'piston ring',
  'kolbenringe': 'piston ring',
  'auspuff': 'muffler',
  'schalldämpfer': 'muffler',
  'kurbelwelle': 'crankshaft',
  'kettenbremse': 'chain brake',
  'bremsband': 'brake band',
  'zündung': 'ignition',
  'zündspule': 'ignition module',
  'zündmodul': 'ignition module',
  'polrad': 'flywheel',
  'schwungrad': 'flywheel',
  'kettenraddeckel': 'clutch cover',
  'kupplungsdeckel': 'clutch cover',
  'griffrahmen': 'handle',
  'rohrgriff': 'handlebar',
  'handschutz': 'hand guard',
  'schalter': 'switch',
  'stoppschalter': 'switch',
  'gashebel': 'throttle trigger',
  'gasbetätigung': 'throttle trigger',
  'tankverschluss': 'filler cap',
  'tankdeckel': 'filler cap',
  'öldeckel': 'oil cap',
  'kraftstoffdeckel': 'fuel cap',
  'schlauch': 'hose',
  'ansaugstutzen': 'manifold',
  'krümmer': 'manifold',
  'wellendichtring': 'oil seal',
  'simmerring': 'oil seal',
  'wellendichtringe': 'oil seal',
  'kugellager': 'ball bearing',
  'nadellager': 'needle bearing'
};

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
      const modelMap = new Map();
      for (const f of fitments) {
        const mId = f.canonical_model_id;
        if (!modelMap.has(mId)) {
          modelMap.set(mId, {
            model_id: mId,
            model_name: mId.replace(/_/g, ' ').toUpperCase(),
            variants: new Set(),
            configurations: new Set(),
            sections: new Set(),
            fitment_count: 0
          });
        }
        const mEntry = modelMap.get(mId);
        mEntry.fitment_count++;
        if (f.variant_key && f.variant_key !== 'base') mEntry.variants.add(f.variant_key);
        if (f.configuration_name) mEntry.configurations.add(f.configuration_name);
        const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
        if (canonSec) mEntry.sections.add(canonSec);
      }

      const compatibleModels = Array.from(modelMap.values()).map(m => ({
        model_id: m.model_id,
        model_name: m.model_name,
        variants: Array.from(m.variants),
        configurations: Array.from(m.configurations),
        sections: Array.from(m.sections),
        fitment_count: m.fitment_count
      }));

      const techProfile = buildTechnicalProfile(part, fitments, compatibleModels);

      return {
        found: true,
        part_number: part.part_number,
        part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part.part_number),
        part_name: part.part_name,
        part_name_normalized: part.part_name_normalized,
        source_count: part.source_count,
        fitment_count: fitments.length,
        compatible_models: compatibleModels,
        technical_profile: techProfile,
        fitments: fitments.map(f => {
          const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
          const isRealPos = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);
          return {
            canonical_model_id: f.canonical_model_id,
            variant_key: f.variant_key,
            configuration_key: f.configuration_key || null,
            configuration_name: f.configuration_name || null,
            fitment_scope: f.fitment_scope,
            section_key: SectionNormalizer.normalizeSectionKey(f.section_key),
            section_name: canonSec || f.section_name,
            section_name_raw: f.section_name,
            section_name_canonical: canonSec,
            diagram_position: isRealPos ? f.diagram_position : null,
            diagram_position_raw: f.diagram_position,
            has_meaningful_position: isRealPos,
            quantity: f.quantity,
            source_evidence_status: f.source_evidence_status,
            superseded_by: f.superseded_by || techProfile.supersession?.replaced_by || null
          };
        })
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
      const normId = PartCatalogResolver.resolveCanonicalModelId(modelName);
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
      const modelMap = new Map();
      for (const f of fitments) {
        const mId = f.canonical_model_id;
        if (!modelMap.has(mId)) {
          modelMap.set(mId, {
            model_id: mId,
            model_name: mId.replace(/_/g, ' ').toUpperCase(),
            variants: new Set(),
            configurations: new Set(),
            sections: new Set(),
            fitment_count: 0
          });
        }
        const mEntry = modelMap.get(mId);
        mEntry.fitment_count++;
        if (f.variant_key && f.variant_key !== 'base') mEntry.variants.add(f.variant_key);
        if (f.configuration_name) mEntry.configurations.add(f.configuration_name);
        if (f.section_name) mEntry.sections.add(f.section_name);
      }

      const compatibleModels = Array.from(modelMap.values()).map(m => ({
        model_id: m.model_id,
        model_name: m.model_name,
        variants: Array.from(m.variants),
        configurations: Array.from(m.configurations),
        sections: Array.from(m.sections),
        fitment_count: m.fitment_count
      }));

      const techProfile = buildTechnicalProfile(part, fitments, compatibleModels);

      return {
        part_number: part.part_number,
        part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part.part_number),
        part_name: part.part_name,
        part_name_normalized: part.part_name_normalized,
        source_count: part.source_count,
        fitment_count: fitments.length,
        compatible_models: compatibleModels,
        technical_profile: techProfile,
        fitments: fitments.map(f => {
          const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
          const isRealPos = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);
          return {
            canonical_model_id: f.canonical_model_id,
            variant_key: f.variant_key,
            configuration_key: f.configuration_key || null,
            configuration_name: f.configuration_name || null,
            fitment_scope: f.fitment_scope,
            section_key: SectionNormalizer.normalizeSectionKey(f.section_key),
            section_name: canonSec || f.section_name,
            section_name_raw: f.section_name,
            section_name_canonical: canonSec,
            diagram_position: isRealPos ? f.diagram_position : null,
            diagram_position_raw: f.diagram_position,
            has_meaningful_position: isRealPos,
            quantity: f.quantity,
            source_evidence_status: f.source_evidence_status,
            superseded_by: f.superseded_by || techProfile.supersession?.replaced_by || null
          };
        })
      };
    }

    loadDefaultPartsData();
    const part = cachedPartsMap?.get(canonicalPartNo);
    if (!part) return null;

    const fitments = cachedFitmentsByPartMap?.get(canonicalPartNo) || [];

    const modelMap = new Map();
    for (const f of fitments) {
      const mId = f.canonical_model_id;
      if (!modelMap.has(mId)) {
        modelMap.set(mId, {
          model_id: mId,
          model_name: mId.replace(/_/g, ' ').toUpperCase(),
          variants: new Set(),
          configurations: new Set(),
          sections: new Set(),
          fitment_count: 0
        });
      }
      const mEntry = modelMap.get(mId);
      mEntry.fitment_count++;
      if (f.variant_key && f.variant_key !== 'base') mEntry.variants.add(f.variant_key);
      if (f.configuration_name) mEntry.configurations.add(f.configuration_name);
      const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
      if (canonSec) mEntry.sections.add(canonSec);
    }

    const compatibleModels = Array.from(modelMap.values()).map(m => ({
      model_id: m.model_id,
      model_name: m.model_name,
      variants: Array.from(m.variants),
      configurations: Array.from(m.configurations),
      sections: Array.from(m.sections),
      fitment_count: m.fitment_count
    }));

    const techProfile = buildTechnicalProfile(part, fitments, compatibleModels);

    return {
      part_number: part.part_number,
      part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part.part_number),
      part_name: part.part_name,
      part_name_normalized: part.part_name_normalized,
      source_count: part.source_count,
      fitment_count: fitments.length,
      compatible_models: compatibleModels,
      technical_profile: techProfile,
      fitments: fitments.map(f => {
        const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
        const isRealPos = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);
        return {
          canonical_model_id: f.canonical_model_id,
          variant_key: f.variant_key,
          configuration_key: f.configuration_key || null,
          configuration_name: f.configuration_name || null,
          fitment_scope: f.fitment_scope,
          section_key: SectionNormalizer.normalizeSectionKey(f.section_key),
          section_name: canonSec || f.section_name,
          section_name_raw: f.section_name,
          section_name_canonical: canonSec,
          diagram_position: isRealPos ? f.diagram_position : null,
          diagram_position_raw: f.diagram_position,
          has_meaningful_position: isRealPos,
          quantity: f.quantity,
          source_evidence_status: f.source_evidence_status,
          superseded_by: f.superseded_by || techProfile.supersession?.replaced_by || null
        };
      })
    };
  }

  /**
   * Resolves a model name, slug, ID or model object to its canonical catalog fitment model ID (e.g. 'ms_200').
   */
  static resolveCanonicalModelId(modelInput, database = null) {
    if (!modelInput) return '';

    const hasFitments = (key) => {
      if (!key) return false;
      if (database && Array.isArray(database.model_part_fitments)) {
        return database.model_part_fitments.some(f => f.canonical_model_id === key);
      }
      if (cachedFitmentsByModelMap) {
        return cachedFitmentsByModelMap.has(key);
      }
      return RENDERABLE_CATALOG_MODELS.has(key);
    };

    if (typeof modelInput === 'object') {
      const candidates = [
        modelInput.slug,
        modelInput.canonical_model_id,
        modelInput.model_name,
        modelInput.model_name && modelInput.model_name.includes('/') ? modelInput.model_name.split('/')[0].trim() : null,
        modelInput.model_name ? normalizeModelQuery(modelInput.model_name).baseModel : null,
        modelInput.id
      ].filter(Boolean);

      for (const cand of candidates) {
        const norm = String(cand).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (hasFitments(norm)) return norm;
      }
      return String(modelInput.slug || modelInput.model_name || modelInput.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    const directNorm = String(modelInput).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (hasFitments(directNorm)) return directNorm;

    // Check composite names with slash, e.g. "MS 200 / 020 T" -> "MS 200"
    if (String(modelInput).includes('/')) {
      const parts = String(modelInput).split('/');
      for (const p of parts) {
        const pNorm = p.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (hasFitments(pNorm)) return pNorm;
      }
    }

    // Check base model via normalizeModelQuery (e.g. "MS 261 C-M" -> "MS 261")
    const baseModel = normalizeModelQuery(String(modelInput)).baseModel;
    if (baseModel && baseModel !== modelInput) {
      const baseNorm = baseModel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (hasFitments(baseNorm)) return baseNorm;
    }

    // Check models registry if available
    const modelsRegistry = (database && Array.isArray(database.models)) ? database.models : null;
    if (modelsRegistry) {
      const inputStr = String(modelInput).toLowerCase();
      const match = modelsRegistry.find(m =>
        (m.model_name && m.model_name.toLowerCase() === inputStr) ||
        (m.slug && m.slug.toLowerCase() === inputStr) ||
        (m.id && m.id.toLowerCase() === inputStr) ||
        (m.model_name && m.model_name.toLowerCase().includes(inputStr))
      );
      if (match) {
        const cand = [
          match.slug,
          match.canonical_model_id,
          match.model_name && match.model_name.includes('/') ? match.model_name.split('/')[0].trim() : null,
          match.model_name ? normalizeModelQuery(match.model_name).baseModel : null,
          match.id
        ].filter(Boolean);
        for (const c of cand) {
          const norm = String(c).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (hasFitments(norm)) return norm;
        }
      }
    }

    return directNorm;
  }

  /**
   * Checks whether the catalog contains verified parts/fitments for a model that can be rendered on its parts page.
   * Avoids loading or decompressing the full fitment corpus during cold decodes.
   */
  static hasPartsForModel(modelInput, database = null) {
    if (!modelInput) return false;

    // If an in-memory database with fitments or configurations is provided, verify against it directly
    if (database && (Array.isArray(database.model_part_fitments) || Array.isArray(database.parts_model_configurations))) {
      const sections = PartCatalogResolver.getSectionsForModel(modelInput, null, null, database);
      if (sections && sections.length > 0) return true;
      const configs = PartCatalogResolver.getConfigurationsForModel(modelInput, database);
      return Boolean(configs && configs.length > 0);
    }

    // If full catalog is already cached in memory, use it
    if (cachedFitmentsByModelMap) {
      const sections = PartCatalogResolver.getSectionsForModel(modelInput, null, null, database);
      if (sections && sections.length > 0) return true;
      const configs = PartCatalogResolver.getConfigurationsForModel(modelInput, database);
      return Boolean(configs && configs.length > 0);
    }

    // Otherwise use lightweight precomputed availability index without blocking event loop
    const normId = PartCatalogResolver.resolveCanonicalModelId(modelInput, database);
    return RENDERABLE_CATALOG_MODELS.has(normId);
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

    const normId = PartCatalogResolver.resolveCanonicalModelId(modelId, database);

    if (database && Array.isArray(database.parts) && Array.isArray(database.model_part_fitments)) {
      const partsMap = new Map(database.parts.map(p => [p.part_number, p]));
      const allModelFitments = database.model_part_fitments.filter(f => f.canonical_model_id === normId);
      const matchingFitments = filterFitmentsForModel(allModelFitments, variantKey, configurationKey);

      return matchingFitments.map(f => {
        const part = partsMap.get(f.part_number);
        const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
        const isRealPos = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);
        return {
          part_number: f.part_number,
          part_number_display: PartNormalizer.formatPartNumber(f.part_number),
          part_name: part ? PartNameNormalizer.normalizeDisplayName(part.part_name, f.part_number) : (canonSec || f.section_name),
          part_name_raw: part?.part_name || f.section_name,
          section_key: SectionNormalizer.normalizeSectionKey(f.section_key),
          section_name: canonSec || f.section_name,
          section_name_raw: f.section_name,
          diagram_position: isRealPos ? f.diagram_position : null,
          diagram_position_raw: f.diagram_position,
          has_meaningful_position: isRealPos,
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
      const canonSec = SectionNormalizer.normalizeSectionName(f.section_name);
      const isRealPos = PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position);
      return {
        part_number: f.part_number,
        part_number_display: PartNormalizer.formatPartNumber(f.part_number),
        part_name: part ? PartNameNormalizer.normalizeDisplayName(part.part_name, f.part_number) : (canonSec || f.section_name),
        part_name_raw: part?.part_name || f.section_name,
        section_key: SectionNormalizer.normalizeSectionKey(f.section_key),
        section_name: canonSec || f.section_name,
        section_name_raw: f.section_name,
        diagram_position: isRealPos ? f.diagram_position : null,
        diagram_position_raw: f.diagram_position,
        has_meaningful_position: isRealPos,
        quantity: f.quantity,
        variant_key: f.variant_key,
        configuration_key: f.configuration_key || null,
        configuration_name: f.configuration_name || null,
        fitment_scope: f.fitment_scope,
        source_evidence_status: f.source_evidence_status
      };
    });
  }

  /**
   * Retrieves all available physical configurations for a model with Dutch display labels and part counts.
   */
  static getConfigurationsForModel(modelId, database = null) {
    if (!modelId) return [];
    const normId = PartCatalogResolver.resolveCanonicalModelId(modelId, database);

    let modelConfigs = [];
    if (database && Array.isArray(database.parts_model_configurations)) {
      modelConfigs = database.parts_model_configurations.filter(c => (c.canonical_model_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') === normId);
    } else {
      loadDefaultConfigurationsData();
      if (cachedConfigurations) {
        modelConfigs = cachedConfigurations.filter(c => (c.canonical_model_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') === normId);
      }
    }

    loadDefaultPartsData();
    const fitments = (database && Array.isArray(database.model_part_fitments))
      ? database.model_part_fitments.filter(f => f.canonical_model_id === normId)
      : (cachedFitmentsByModelMap?.get(normId) || []);

    const configMap = new Map();
    for (const f of fitments) {
      if (f.configuration_key && f.configuration_key !== 'base') {
        const key = f.configuration_key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (!configMap.has(key)) {
          const registered = modelConfigs.find(c => (c.configuration_key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_') === key);
          const rawName = registered?.configuration_name || f.configuration_name || key.replace(/_/g, ' ');
          configMap.set(key, {
            configuration_key: key,
            configuration_name: rawName,
            display_label: PartCatalogResolver.formatConfigurationLabel(rawName, key),
            variant_key: f.variant_key || 'base',
            part_count: 0
          });
        }
        configMap.get(key).part_count++;
      }
    }

    return Array.from(configMap.values());
  }

  /**
   * Converts a configuration identifier/name into a user-friendly Dutch label.
   */
  static formatConfigurationLabel(rawName, key) {
    if (!rawName) return key || 'Standaard uitvoering';
    const clean = rawName.replace(/_/g, ' ').trim();
    if (clean.toLowerCase() === 'cordless') return 'Accu uitvoering (Basis)';
    if (clean.toLowerCase() === 'cordless hedge cutters') return 'Accu Stokheggenschaar';
    if (clean.toLowerCase() === 'pc') return 'iMOW PC uitvoering (Standaard)';
    if (clean.toLowerCase() === 'pc l') return 'iMOW PC-L uitvoering (Groot)';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  /**
   * Groups parts for a model by diagram section.
   */
  static getSectionsForModel(modelId, variantKey = null, configurationKey = null, database = null) {
    const parts = PartCatalogResolver.getPartsForModel(modelId, variantKey, configurationKey, database);
    const sectionMap = new Map();

    for (const part of parts) {
      const sKey = part.section_key || 'algemeen';
      const sName = part.section_name || 'Algemene Onderdelen';
      if (!sectionMap.has(sKey)) {
        sectionMap.set(sKey, {
          section_key: sKey,
          section_name: sName,
          parts: []
        });
      }
      sectionMap.get(sKey).parts.push(part);
    }

    return Array.from(sectionMap.values());
  }

  /**
   * Resolves a user input or descriptive string into a single exact canonical configuration key.
   */
  static resolveConfigurationKey(canonicalModelId, variantKey, rawInput, database = null) {
    if (!rawInput) return null;
    const cleanInput = rawInput.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!cleanInput || cleanInput === 'base') return null;

    const normModelId = (canonicalModelId || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const normVarKey = variantKey && variantKey !== 'base' ? variantKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') : 'base';

    if (database && Array.isArray(database.parts_model_configurations)) {
      const match = database.parts_model_configurations.find(c => {
        const cModel = (c.canonical_model_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cVar = (c.variant_key || 'base').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (normModelId && cModel !== normModelId) return false;
        if (normVarKey && normVarKey !== 'base' && cVar !== normVarKey && cVar !== 'base') return false;

        const cCfgKey = (c.configuration_key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cCfgName = (c.configuration_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return cCfgKey === cleanInput || cCfgName === cleanInput;
      });
      if (match) {
        return match.configuration_key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      }
    }

    loadDefaultConfigurationsData();
    if (cachedConfigurations) {
      const match = cachedConfigurations.find(c => {
        const cModel = (c.canonical_model_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cVar = (c.variant_key || 'base').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (normModelId && cModel !== normModelId) return false;
        if (normVarKey && normVarKey !== 'base' && cVar !== normVarKey && cVar !== 'base') return false;

        const cCfgKey = (c.configuration_key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cCfgName = (c.configuration_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return cCfgKey === cleanInput || cCfgName === cleanInput;
      });
      if (match) {
        return match.configuration_key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      }
    }

    return cleanInput;
  }

  resolveConfigurationKey(canonicalModelId, variantKey, rawInput, database = null) {
    return PartCatalogResolver.resolveConfigurationKey(canonicalModelId, variantKey, rawInput, database);
  }

  getConfigurationsForModel(modelId, database = null) {
    return PartCatalogResolver.getConfigurationsForModel(modelId, database);
  }

  getSectionsForModel(modelId, variantKey = null, configurationKey = null, database = null) {
    return PartCatalogResolver.getSectionsForModel(modelId, variantKey, configurationKey, database);
  }

  hasPartsForModel(modelInput, database = null) {
    return PartCatalogResolver.hasPartsForModel(modelInput, database);
  }

  resolveCanonicalModelId(modelInput, database = null) {
    return PartCatalogResolver.resolveCanonicalModelId(modelInput, database);
  }

  /**
   * Fast text-based search across canonical parts catalog.
   * Segregates exact part number matches from substring name matches.
   *
   * @param {string} query
   * @param {number} [limit=30]
   * @returns {Array<Object>}
   */


  /**
   * Extracts model tokens and component keywords from a composite query.
   * E.g. "MS 261 carburateur" -> { raw_model: "MS 261", canonical_model_id: "ms_261", component_query: "carburateur" }
   */
  static extractModelAndComponent(query) {
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim();
    const modelRegex = /\b((?:ms|fs|bg|br|ts|hs|sh|hl|ht|km|mm|bt|fr|re|se|gs|fsa|msa|hsa|bga|hla|tsa|sha|mse|hse|fse)\s*[0-9]{2,3}(?:\s+(?:c-m|c-be|c-b|c|t|tc-m|magnum|pro|r|rx|tx))?|0[0-9]{2})\b/i;
    const match = clean.match(modelRegex);
    if (!match) return null;

    const rawModelStr = match[1].trim();
    const componentStr = clean.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
    let canonicalModelId = rawModelStr.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const legacyAliases = {
      '026': 'ms_260',
      '020': 'ms_200',
      '020_t': 'ms_200_t',
      '021': 'ms_210',
      '023': 'ms_230',
      '025': 'ms_250',
      '036': 'ms_360',
      '044': 'ms_440',
      '046': 'ms_460',
      '066': 'ms_660',
      '088': 'ms_880',
      '029': 'ms_290',
      '034': 'ms_340',
      '038': 'ms_380',
      '039': 'ms_390'
    };
    if (legacyAliases[canonicalModelId]) {
      canonicalModelId = legacyAliases[canonicalModelId];
    }

    return {
      raw_model: rawModelStr,
      canonical_model_id: canonicalModelId,
      component_query: componentStr
    };
  }

  /**
   * Searches canonical parts by query with exact part number, component keywords,
   * multilingual Dutch and German synonyms, and model-specific scoping.
   *
   * @param {string} query
   * @param {number} [limit=30]
   * @param {Object} [options={}]
   * @param {string} [options.modelId]
   * @param {Object} [options.database]
   * @returns {Array<Object>}
   */
  static searchParts(query, limit = 30, options = {}) {
    loadDefaultPartsData();
    if (!query || typeof query !== 'string') return [];
    const qClean = query.trim().toLowerCase();
    if (qClean.length < 2) return [];

    const norm = PartNormalizer.normalizePartNumber(qClean);
    const results = [];
    const seen = new Set();

    // 1. Exact match priority
    if (norm && cachedPartsMap?.has(norm)) {
      const exact = cachedPartsMap.get(norm);
      results.push({ ...exact, is_exact: true });
      seen.add(norm);
    }

    // 2. Check for joint model + component query or options.modelId
    const modelExtraction = PartCatalogResolver.extractModelAndComponent(qClean);
    const targetModelId = options.modelId
      ? options.modelId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      : (modelExtraction && modelExtraction.component_query ? modelExtraction.canonical_model_id : null);
    const componentTerm = options.modelId
      ? qClean
      : (modelExtraction && modelExtraction.component_query ? modelExtraction.component_query.toLowerCase() : qClean);

    // Resolve synonym
    const translated = MULTILINGUAL_TECHNICAL_SYNONYMS[componentTerm] ||
      (componentTerm.split(/\s+/).map(t => MULTILINGUAL_TECHNICAL_SYNONYMS[t]).filter(Boolean)[0]) ||
      null;

    if (targetModelId) {
      // Search parts specifically for this model
      const modelFitments = cachedFitmentsByModelMap?.get(targetModelId) || [];
      const modelPartNumbers = new Set(modelFitments.map(f => f.part_number));

      for (const pNo of modelPartNumbers) {
        if (seen.has(pNo)) continue;
        const p = cachedPartsMap?.get(pNo);
        if (!p) continue;
        const name = (p.part_name || '').toLowerCase();
        if (name.includes(componentTerm) || (translated && name.includes(translated))) {
          results.push({
            ...p,
            is_exact: false,
            matched_model: targetModelId
          });
          seen.add(pNo);
          if (results.length >= limit) break;
        }
      }

      if (results.length > 0) {
        return results;
      }
    }

    // 3. Global text search across parts catalog
    for (const p of cachedPartsCatalog || []) {
      if (seen.has(p.part_number)) continue;
      const name = (p.part_name || '').toLowerCase();
      if (name.includes(componentTerm) || (translated && name.includes(translated))) {
        results.push({ ...p, is_exact: false });
        seen.add(p.part_number);
        if (results.length >= limit) break;
      }
    }

    return results;
  }
}
