/**
 * src/ModelMachineEligibilityRegistry.js
 *
 * Phase 56N — Catalog Noise & Powered-Machine Boundary Closure
 *
 * Canonical eligibility classification separating powered machinery from:
 *   - unpowered tool attachments (KombiTools / MultiTools)
 *   - non-machine accessories (mowing heads, carrying harnesses, adapters)
 *   - replacement parts erroneously cataloged as base models (gaskets, starter cords, skirts)
 *
 * Browser-compatible ES module (no Node built-ins).
 */

export const MACHINE_ELIGIBILITY = Object.freeze({
  POWERED_MACHINE: 'POWERED_MACHINE',
  UNPOWERED_ATTACHMENT: 'UNPOWERED_ATTACHMENT',
  NON_MACHINE_ACCESSORY: 'NON_MACHINE_ACCESSORY',
  REPLACEMENT_PART_AS_MODEL: 'REPLACEMENT_PART_AS_MODEL',
  UNKNOWN_ELIGIBILITY: 'UNKNOWN_ELIGIBILITY'
});

function extractModelString(modelInput) {
  if (!modelInput) return '';
  if (typeof modelInput === 'string') return modelInput;
  if (typeof modelInput === 'object') {
    return modelInput.model_name || modelInput.base_model_name || modelInput.variant_name || modelInput.slug || modelInput.id || '';
  }
  return String(modelInput);
}

/**
 * Attachment Safety Gate
 *
 * Identifies unpowered KombiTools, MultiTools, and cutting attachments that do not
 * contain an engine or motor of their own.
 */
export function isAttachmentDesignation(modelInput) {
  const rawStr = extractModelString(modelInput);
  if (!rawStr) return false;
  const s = rawStr.trim();

  // 1. Explicit tool attachment patterns in titles
  if (/\b(?:attachment|attachments|anbauwerkzeug|kombimanual)\b/i.test(s)) {
    return true;
  }

  // 2. KombiTool attachments ending with -KM or space KM
  // e.g. BG-KM, FS-KM, HL-KM, HT-KM, BC-KM, BF-KM, FCB-KM, FCS-KM, FH-KM, FSB-KM, KB-KM, KW-KM, RG-KM, SP-KM
  if (/^[A-Za-z0-9]{2,5}[_\-]KM(?:\s|$)/i.test(s) || /\b[A-Za-z0-9]{2,5}[_\-]KM\b/i.test(s)) {
    return true;
  }

  // 3. MultiSystem tool attachments ending with -MM
  // e.g. BF-MM, BK-MM, FC-MM, KB-MM, MF-MM, RL-MM
  if (/^[A-Za-z0-9]{2,5}[_\-]MM(?:\s|$)/i.test(s) || /\b[A-Za-z0-9]{2,5}[_\-]MM\b/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Exact registry of known non-machine accessories cataloged in the parts hierarchy.
 */
export const EXACT_NON_MACHINE_ACCESSORIES = Object.freeze({
  'BATTERY BELT Battery Belt': Object.freeze({
    model_name: 'BATTERY BELT Battery Belt',
    normalized_name: 'BATTERY BELT BATTERY BELT',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'BATTERY_HARNESS',
    reason_flagged: 'Wearable battery belt and harness system, not a powered tool',
    confidence: 'HIGH',
    evidence: 'STIHL AP system wearable carrying belt documentation'
  }),
  'CARRYING SYSTEM CARRYING SYSTEM': Object.freeze({
    model_name: 'CARRYING SYSTEM CARRYING SYSTEM',
    normalized_name: 'CARRYING SYSTEM CARRYING SYSTEM',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'CARRYING_HARNESS',
    reason_flagged: 'Shoulder harness carrying system accessory for backpack tools',
    confidence: 'HIGH',
    evidence: 'STIHL ergonomic carrying harness accessory catalog'
  }),
  'DOUBLE BATTERY SLOT ADAPTER ADA 1000 DOUBLE BATTERY SLOT ADAPTER ADA 1000': Object.freeze({
    model_name: 'DOUBLE BATTERY SLOT ADAPTER ADA 1000 DOUBLE BATTERY SLOT ADAPTER ADA 1000',
    normalized_name: 'DOUBLE BATTERY SLOT ADAPTER ADA 1000 DOUBLE BATTERY SLOT ADAPTER ADA 1000',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'BATTERY_ADAPTER',
    reason_flagged: 'Dual battery slot adapter ADA 1000 for RMA mowers, not a standalone machine',
    confidence: 'HIGH',
    evidence: 'STIHL ADA 1000 cordless mower accessory documentation'
  }),
  'TELESCOPIC SHAFT 456 CM Hand Tool': Object.freeze({
    model_name: 'TELESCOPIC SHAFT 456 CM Hand Tool',
    normalized_name: 'TELESCOPIC SHAFT 456 CM HAND TOOL',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'MANUAL_POLE',
    reason_flagged: 'Manual unpowered telescopic extension shaft (4.56 m) for hand saws/loppers',
    confidence: 'HIGH',
    evidence: 'STIHL manual pole pruner extension accessory catalog'
  }),
  'HOS Sharpeners': Object.freeze({
    model_name: 'HOS Sharpeners',
    normalized_name: 'HOS SHARPENERS',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'SHARPENING_TOOL',
    reason_flagged: 'Manual sharpening stone accessory for hedge trimmer blades',
    confidence: 'HIGH',
    evidence: 'STIHL HOS whetstone maintenance accessory documentation'
  }),
  'USG Sharpeners': Object.freeze({
    model_name: 'USG Sharpeners',
    normalized_name: 'USG SHARPENERS',
    category: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
    accessory_type: 'WORKSHOP_EQUIPMENT',
    reason_flagged: 'Universal sharpening apparatus (USG) workshop accessory/attachment catalog record',
    confidence: 'HIGH',
    evidence: 'STIHL USG universal sharpener workshop equipment catalog'
  })
});

/**
 * Exact registry of replacement/consumable parts erroneously captured as models in parts diagrams.
 */
export const EXACT_REPLACEMENT_PARTS = Object.freeze({
  'Blade for FS 111, FS 120': Object.freeze({
    model_name: 'Blade for FS 111, FS 120',
    normalized_name: 'BLADE FOR FS 111, FS 120',
    category: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
    part_type: 'CUTTING_BLADE',
    reason_flagged: 'Grass cutting metal blade replacement part for FS trimmers',
    confidence: 'HIGH',
    evidence: 'STIHL 230 mm / 250 mm grass cutting blade replacement spare part'
  }),
  'Grey Plastic Sleeve/Insert for FS55, FS75, FS85': Object.freeze({
    model_name: 'Grey Plastic Sleeve/Insert for FS55, FS75, FS85',
    normalized_name: 'GREY PLASTIC SLEEVE/INSERT FOR FS55, FS75, FS85',
    category: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
    part_type: 'DRIVE_SHAFT_SLEEVE',
    reason_flagged: 'Plastic sleeve bushing replacement component for FS drive shafts',
    confidence: 'HIGH',
    evidence: 'STIHL drive tube liner / protective insert replacement part'
  }),
  'Muffler Exhaust Gasket for HS45, HS81, HS86': Object.freeze({
    model_name: 'Muffler Exhaust Gasket for HS45, HS81, HS86',
    normalized_name: 'MUFFLER EXHAUST GASKET FOR HS45, HS81, HS86',
    category: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
    part_type: 'EXHAUST_GASKET',
    reason_flagged: 'Exhaust silencer gasket sealing ring replacement part for HS hedge trimmers',
    confidence: 'HIGH',
    evidence: 'STIHL HS 45/81/86 cylinder-to-muffler exhaust gasket replacement part'
  }),
  'Skirt for FS90, FS100, FS100R': Object.freeze({
    model_name: 'Skirt for FS90, FS100, FS100R',
    normalized_name: 'SKIRT FOR FS90, FS100, FS100R',
    category: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
    part_type: 'DEFLECTOR_SKIRT',
    reason_flagged: 'Deflector skirt trim strip replacement part for FS line heads',
    confidence: 'HIGH',
    evidence: 'STIHL mowing head deflector guard apron / skirt replacement part'
  }),
  'Starter Rope  2.7x910 mm for MS180, MS181': Object.freeze({
    model_name: 'Starter Rope  2.7x910 mm for MS180, MS181',
    normalized_name: 'STARTER ROPE 2.7X910 MM FOR MS180, MS181',
    category: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
    part_type: 'STARTER_ROPE',
    reason_flagged: 'Rewind starter pull cord consumable replacement part',
    confidence: 'HIGH',
    evidence: 'STIHL 2.7 mm x 910 mm braided starter cord replacement part'
  })
});

/**
 * Strict, narrow patterns matching catalog non-machine noise without touching real machinery.
 */
const SPECIFIC_MOWING_HEAD_PATTERN = /^mowing\s*head\b/i;
const SPECIFIC_ACCESSORY_PATTERNS = [
  /^battery\s+belt\b/i,
  /^carrying\s+system\b/i,
  /^double\s+battery\s+slot\s+adapter\b/i,
  /^telescopic\s+shaft\b/i,
  /^(?:hos|usg)\s+sharpeners\b/i
];
const SPECIFIC_REPLACEMENT_PART_PATTERNS = [
  /^blade\s+for\s+fs\b/i,
  /^grey\s+plastic\s+sleeve\/insert\b/i,
  /^muffler\s+exhaust\s+gasket\b/i,
  /^skirt\s+for\s+fs\b/i,
  /^starter\s+rope\b/i
];

function extractModelName(modelInput) {
  if (!modelInput) return '';
  if (typeof modelInput === 'string') return modelInput.trim();
  if (typeof modelInput === 'object') {
    return (modelInput.model_name || modelInput.base_model_name || modelInput.variant_name || modelInput.id || '').trim();
  }
  return String(modelInput).trim();
}

/**
 * Resolves the machine eligibility classification of any catalog entry.
 *
 * @param {string|object} modelInput
 * @returns {{
 *   eligibility: string,
 *   reason: string,
 *   confidence: string,
 *   category_type: string,
 *   model_name: string
 * }}
 */
export function resolveMachineEligibility(modelInput) {
  const name = extractModelName(modelInput);
  if (!name) {
    return {
      eligibility: MACHINE_ELIGIBILITY.UNKNOWN_ELIGIBILITY,
      reason: 'Empty model input provided',
      confidence: 'LOW',
      category_type: 'UNKNOWN',
      model_name: ''
    };
  }

  // 1. Check unpowered Kombi/MultiSystem tool attachments (e.g. BG-KM, FS-KM, BF-MM, tool attachments)
  if (isAttachmentDesignation(modelInput)) {
    return {
      eligibility: MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT,
      reason: 'Unpowered KombiTool or MultiSystem tool attachment head requiring a separate powerhead (KombiEngine).',
      confidence: 'HIGH',
      category_type: 'KOMBI_ATTACHMENT',
      model_name: name
    };
  }

  // 2. Check exact replacement part map
  if (EXACT_REPLACEMENT_PARTS[name]) {
    const r = EXACT_REPLACEMENT_PARTS[name];
    return {
      eligibility: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
      reason: r.reason_flagged,
      confidence: r.confidence,
      category_type: r.part_type,
      model_name: name
    };
  }

  // 3. Check exact non-machine accessory map
  if (EXACT_NON_MACHINE_ACCESSORIES[name]) {
    const a = EXACT_NON_MACHINE_ACCESSORIES[name];
    return {
      eligibility: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
      reason: a.reason_flagged,
      confidence: a.confidence,
      category_type: a.accessory_type,
      model_name: name
    };
  }

  // 4. Check specific pattern for mowing heads (43 records)
  if (SPECIFIC_MOWING_HEAD_PATTERN.test(name)) {
    return {
      eligibility: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
      reason: 'Mowing head cutting attachment accessory for brushcutters/trimmers. Not a standalone machine.',
      confidence: 'HIGH',
      category_type: 'MOWING_HEAD',
      model_name: name
    };
  }

  // 5. Check specific patterns for accessories
  for (const p of SPECIFIC_ACCESSORY_PATTERNS) {
    if (p.test(name)) {
      return {
        eligibility: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
        reason: 'Catalog non-machine accessory entry matching strict structural pattern.',
        confidence: 'HIGH',
        category_type: 'CATALOG_ACCESSORY',
        model_name: name
      };
    }
  }

  // 6. Check specific patterns for replacement parts
  for (const p of SPECIFIC_REPLACEMENT_PART_PATTERNS) {
    if (p.test(name)) {
      return {
        eligibility: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
        reason: 'Consumable or replacement component entry matching strict structural pattern.',
        confidence: 'HIGH',
        category_type: 'REPLACEMENT_COMPONENT',
        model_name: name
      };
    }
  }

  // 7. Otherwise: candidate powered machine
  return {
    eligibility: MACHINE_ELIGIBILITY.POWERED_MACHINE,
    reason: 'Standalone engine/motor machine designation eligible for power source and drive resolution.',
    confidence: 'HIGH',
    category_type: 'POWERED_MACHINE',
    model_name: name
  };
}

/**
 * Returns true if the entry is an eligible powered machine candidate.
 */
export function isPoweredMachine(modelInput) {
  return resolveMachineEligibility(modelInput).eligibility === MACHINE_ELIGIBILITY.POWERED_MACHINE;
}

/**
 * Returns true if the entry is an unpowered tool attachment (KombiTool/MultiTool).
 */
export function isUnpoweredAttachment(modelInput) {
  return resolveMachineEligibility(modelInput).eligibility === MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT;
}

/**
 * Returns true if the entry is a non-machine accessory or replacement part noise.
 */
export function isNonMachineNoise(modelInput) {
  const e = resolveMachineEligibility(modelInput).eligibility;
  return e === MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY || e === MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL;
}
