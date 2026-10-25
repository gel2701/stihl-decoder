/**
 * scripts/generate_model_family_registry.mjs
 *
 * Generates src/ModelFamilyDriveRegistry.js from the live official fetch ledger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l', 'official_family_fetch_ledger.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'src', 'ModelFamilyDriveRegistry.js');

const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

const unverifiedPrefixes = [
  'BRA', 'RM', 'RMA', 'RME', 'RMI',
  'MB', 'ME', 'MA', 'MI', 'RT', 'MT',
  'RE', 'REA', 'SE', 'SEA', 'KG', 'KGA',
  'GE', 'GH', 'GHE', 'MH', 'HB', 'ASA',
  'GTA', 'AR', 'AP', 'AL', 'BT', 'BC',
  'FC', 'FE', 'FH', 'FW', 'SG', 'VH',
  'TE', 'AB', 'BE', 'FG', 'GA', 'HA',
  'HEL', 'LB', 'MM', 'MVP', 'NG', 'P',
  'RB', 'SP', 'AD', 'AHK', 'AZ', 'BM',
  'CRANKCASE', 'EC', 'ES', 'GEGARDEN', 'GS',
  'K', 'KW', 'LA', 'LE', 'LSG', 'MC',
  'MVC', 'RGA', 'RL'
];

let rulesCode = 'export const OFFICIAL_STIHL_FAMILY_RULES = Object.freeze({\n';
for (const l of ledger) {
  rulesCode += '  ' + l.family + ': Object.freeze({\n';
  rulesCode += '    family: ' + JSON.stringify(l.family) + ',\n';
  rulesCode += '    machine_type: ' + JSON.stringify(l.machine_type) + ',\n';
  rulesCode += '    drive_type: DRIVE_TYPES.' + l.drive_type + ',\n';
  rulesCode += '    display: DISPLAY_LABELS.' + l.drive_type + ',\n';
  rulesCode += '    source_type: \'OFFICIAL_STIHL_FAMILY_EVIDENCE\',\n';
  rulesCode += '    requested_url: ' + JSON.stringify(l.requested_url) + ',\n';
  rulesCode += '    source_url: ' + JSON.stringify(l.final_url) + ',\n';
  rulesCode += '    source_title: ' + JSON.stringify(l.page_title) + ',\n';
  rulesCode += '    evidence_locator: ' + JSON.stringify(l.evidence_locator) + ',\n';
  rulesCode += '    retrieval_started_at: ' + JSON.stringify(l.retrieval_started_at) + ',\n';
  rulesCode += '    retrieved_at: ' + JSON.stringify(l.retrieved_at) + ',\n';
  rulesCode += '    body_sha256: ' + JSON.stringify(l.body_sha256) + ',\n';
  rulesCode += '    body_bytes: ' + l.body_bytes + ',\n';
  rulesCode += '    status: ' + JSON.stringify(l.verification_status === 'VERIFIED' ? 'ACTIVE' : 'UNVERIFIED') + ',\n';
  rulesCode += '    confidence: \'HIGH\'\n';
  rulesCode += '  }),\n';
}
rulesCode += '});\n';

const fileContent = `/**
 * ModelFamilyDriveRegistry.js
 *
 * Phase 56L.1 — Drive Resolution Integrity & Attachment Safety Registry.
 *
 * Resolves STIHL machine drive types (PETROL, BATTERY, MAINS_ELECTRIC, UNKNOWN)
 * with strict attachment safety, canonical explicit evidence propagation,
 * and live-verified official STIHL family rules.
 *
 * Invariants & Precedence:
 *   1. Attachment safety gate: Unpowered attachments (e.g. BG-KM, FS-KM, HL-KM, HT-KM, Tool Attachments)
 *      are isolated as UNKNOWN (resolution: ATTACHMENT_NOT_POWERED). No family rule is applied.
 *   2. Canonical explicit evidence propagation: explicit_power_source / explicit_fuel_type are accepted
 *      and prioritized as EXPLICIT_MODEL.
 *   3. Conflict quarantine: If explicit model evidence contradicts verified family rule, resolution is
 *      quarantined (CONFLICT_QUARANTINED) fail-closed.
 *   4. Verified family rule: Official STIHL family rule applied when explicit evidence is absent (FAMILY_RULE).
 *   5. Longest-prefix-first token parsing: MSA before MS, FSA before FS, TSA before TS, etc.
 *   6. Fail-closed: Unrecognized prefixes or unverified families resolve to UNKNOWN ('Niet vastgesteld').
 *   7. No engine technology inference: Family rules resolve only drive type (PETROL, BATTERY, MAINS_ELECTRIC),
 *      never 2-stroke vs 4-MIX or engine capacity.
 *   8. Zero Node built-ins: 100% browser-safe ES module.
 */

export const DRIVE_TYPES = Object.freeze({
  PETROL: 'PETROL',
  BATTERY: 'BATTERY',
  MAINS_ELECTRIC: 'MAINS_ELECTRIC',
  UNKNOWN: 'UNKNOWN'
});

export const DISPLAY_LABELS = Object.freeze({
  PETROL: 'Benzine',
  BATTERY: 'Accu',
  MAINS_ELECTRIC: 'Elektrisch / netstroom',
  UNKNOWN: 'Niet vastgesteld'
});

${rulesCode}
export const UNVERIFIED_FAMILY_PREFIXES = Object.freeze(${JSON.stringify(unverifiedPrefixes, null, 2)});

const ALL_ACTIVE_PREFIXES_DESC = Object.freeze(
  Object.keys(OFFICIAL_STIHL_FAMILY_RULES).sort((a, b) => b.length - a.length)
);

function extractModelString(modelInput) {
  if (!modelInput) return '';
  if (typeof modelInput === 'string') return modelInput;
  if (typeof modelInput === 'object') {
    return modelInput.model_name || modelInput.base_model_name || modelInput.variant_name || modelInput.slug || modelInput.id || '';
  }
  return String(modelInput);
}

/**
 * Attachment Safety Gate (Phase 56L.1 Defect A)
 *
 * Identifies unpowered KombiTools, MultiTools, and cutting attachments that do not
 * contain an engine or motor of their own.
 */
export function isAttachmentDesignation(modelInput) {
  const rawStr = extractModelString(modelInput);
  if (!rawStr) return false;
  const s = rawStr.trim();

  // 1. Explicit tool attachment patterns in titles
  if (/\\b(?:attachment|attachments|anbauwerkzeug|kombimanual)\\b/i.test(s)) {
    return true;
  }

  // 2. KombiTool attachments ending with -KM or space KM
  // e.g. BG-KM, FS-KM, HL-KM, HT-KM, BC-KM, BF-KM, FCB-KM, FCS-KM, FH-KM, FSB-KM, KB-KM, KW-KM, RG-KM, SP-KM
  if (/^[A-Za-z0-9]{2,5}[_\\-]KM(?:\\s|$)/i.test(s) || /\\b[A-Za-z0-9]{2,5}[_\\-]KM\\b/i.test(s)) {
    return true;
  }

  // 3. MultiSystem tool attachments ending with -MM
  // e.g. BF-MM, BK-MM, FC-MM, KB-MM, MF-MM, RL-MM
  if (/^[A-Za-z0-9]{2,5}[_\\-]MM(?:\\s|$)/i.test(s) || /\\b[A-Za-z0-9]{2,5}[_\\-]MM\\b/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Returns true if the designation represents a powered machine candidate, false if an attachment.
 */
export function isPoweredModelDesignation(modelInput) {
  return !isAttachmentDesignation(modelInput);
}

function normalizeExplicitDriveType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();

  if (
    upper === 'GASOLINE' ||
    upper === 'PETROL' ||
    upper === 'PETROL_2STROKE' ||
    upper === 'PETROL_4MIX' ||
    upper === 'PETROL_OIL_MIX' ||
    upper === 'COMBUSTION_2_STROKE'
  ) {
    return DRIVE_TYPES.PETROL;
  }
  if (upper.startsWith('BATTERY')) {
    return DRIVE_TYPES.BATTERY;
  }
  if (
    upper === 'ELECTRIC' ||
    upper === 'ELECTRIC_CORDED' ||
    upper === 'CORDED_ELECTRIC' ||
    upper === 'MAINS_ELECTRIC'
  ) {
    return DRIVE_TYPES.MAINS_ELECTRIC;
  }
  return null;
}

/**
 * Longest-prefix-first parser.
 *
 * Examples:
 *   'MS 211'      -> 'MS'
 *   'ms-211'      -> 'MS'
 *   'MSA 300'     -> 'MSA'
 *   'MSE 210 C-B' -> 'MSE'
 *   'FS 55'       -> 'FS'
 *   'FSA 120'     -> 'FSA'
 *   'TS 420'      -> 'TS'
 *   'TSA 230'     -> 'TSA'
 */
export function parseModelFamily(modelInput) {
  const rawStr = extractModelString(modelInput);
  if (!rawStr) return null;

  // If designation is an unpowered attachment, no family prefix rule is applicable
  if (isAttachmentDesignation(modelInput)) {
    return null;
  }

  // Clean and normalize separators
  const clean = rawStr
    .trim()
    .toUpperCase()
    .replace(/^STIHL[\\s_\\-]+/i, '')
    .replace(/[_\\-]+/g, ' ')
    .trim();

  for (const prefix of ALL_ACTIVE_PREFIXES_DESC) {
    const regex = new RegExp(\`^\${prefix}(?:\\\\s*\\\\d|\\\\s+|$)\`);
    if (regex.test(clean)) {
      return prefix;
    }
  }

  const sortedUnverified = [...UNVERIFIED_FAMILY_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of sortedUnverified) {
    const regex = new RegExp(\`^\${prefix}(?:\\\\s*\\\\d|\\\\s+|$)\`);
    if (regex.test(clean)) {
      return prefix;
    }
  }

  return null;
}

export function getFamilyRule(modelInput) {
  const family = parseModelFamily(modelInput);
  if (!family) return null;
  return OFFICIAL_STIHL_FAMILY_RULES[family] || null;
}

/**
 * Resolves the drive type of a model with strict precedence:
 *   1. Attachment safety gate (ATTACHMENT_NOT_POWERED)
 *   2. Canonical explicit evidence extraction
 *   3. Conflict detection between explicit evidence and verified family rule (CONFLICT_QUARANTINED)
 *   4. Explicit model evidence (EXPLICIT_MODEL)
 *   5. Official verified STIHL family rule (FAMILY_RULE)
 *   6. Fail-closed UNKNOWN ('Niet vastgesteld')
 */
export function resolveDriveType(modelInput) {
  // Precedence 1: Attachment safety gate
  if (isAttachmentDesignation(modelInput)) {
    return {
      drive_type: DRIVE_TYPES.UNKNOWN,
      display: DISPLAY_LABELS.UNKNOWN,
      resolution: 'ATTACHMENT_NOT_POWERED',
      family: null,
      source_type: 'ATTACHMENT_SAFETY_GATE',
      confidence: 'HIGH',
      notes: 'Unpowered tool or attachment designation. Contains no independent engine/motor.'
    };
  }

  // Precedence 2: Extract explicit model evidence (Canonical input contract)
  let explicitDriveType = null;
  let rawSourceBasis = null;

  if (modelInput && typeof modelInput === 'object') {
    const rawPowerSource = modelInput.explicit_power_source || modelInput.power_source || modelInput.basic_classification?.power_source;
    const rawFuelType = modelInput.explicit_fuel_type || modelInput.fuel_type || modelInput.basic_classification?.fuel_type;
    explicitDriveType = normalizeExplicitDriveType(rawPowerSource) || normalizeExplicitDriveType(rawFuelType);
    if (explicitDriveType) {
      rawSourceBasis = rawPowerSource || rawFuelType;
    }
  }

  const family = parseModelFamily(modelInput);
  const rule = family ? OFFICIAL_STIHL_FAMILY_RULES[family] : null;

  // Precedence 3: Conflict detection between explicit and verified family rule
  if (explicitDriveType && rule && rule.status === 'ACTIVE') {
    if (explicitDriveType !== rule.drive_type) {
      return {
        drive_type: DRIVE_TYPES.UNKNOWN,
        display: DISPLAY_LABELS.UNKNOWN,
        resolution: 'CONFLICT_QUARANTINED',
        family,
        explicit_value: explicitDriveType,
        family_value: rule.drive_type,
        source_type: 'QUARANTINED_CONFLICT',
        confidence: 'NONE',
        notes: \`Explicit model evidence (\${rawSourceBasis}) conflicts with verified STIHL family rule \${family} (\${rule.drive_type}). Quarantined without unsafe override.\`
      };
    }
  }

  // Precedence 4: Explicit model evidence
  if (explicitDriveType) {
    return {
      drive_type: explicitDriveType,
      display: DISPLAY_LABELS[explicitDriveType],
      resolution: 'EXPLICIT_MODEL',
      family: family || null,
      source_type: 'EXACT_MODEL_PROPERTY',
      confidence: 'HIGH'
    };
  }

  // Precedence 5: Official verified STIHL family rule
  if (rule && rule.status === 'ACTIVE') {
    return {
      drive_type: rule.drive_type,
      display: DISPLAY_LABELS[rule.drive_type],
      resolution: 'FAMILY_RULE',
      family: rule.family,
      machine_type: rule.machine_type,
      source_type: rule.source_type,
      source_url: rule.source_url,
      source_title: rule.source_title,
      evidence_locator: rule.evidence_locator,
      confidence: rule.confidence,
      retrieval_started_at: rule.retrieval_started_at,
      retrieved_at: rule.retrieved_at,
      body_sha256: rule.body_sha256
    };
  }

  // Precedence 6: Unknown / Unverified family (Fail closed)
  return {
    drive_type: DRIVE_TYPES.UNKNOWN,
    display: DISPLAY_LABELS.UNKNOWN,
    resolution: family ? 'UNVERIFIED_FAMILY' : 'UNKNOWN',
    family: family || null,
    source_type: null,
    confidence: 'NONE'
  };
}

export function getDriveResolutionMetadata(modelInput) {
  const modelStr = extractModelString(modelInput);
  const isAttachment = isAttachmentDesignation(modelInput);
  const family = parseModelFamily(modelInput);
  const rule = family ? OFFICIAL_STIHL_FAMILY_RULES[family] || null : null;
  const resolution = resolveDriveType(modelInput);

  return {
    model_name: modelStr,
    is_attachment: isAttachment,
    is_powered_designation: !isAttachment,
    family,
    family_rule_active: Boolean(rule && rule.status === 'ACTIVE'),
    ...resolution
  };
}

export function getRegistryStats() {
  const activeRules = Object.values(OFFICIAL_STIHL_FAMILY_RULES);
  const activeByDrive = {
    PETROL: activeRules.filter(r => r.drive_type === DRIVE_TYPES.PETROL).length,
    BATTERY: activeRules.filter(r => r.drive_type === DRIVE_TYPES.BATTERY).length,
    MAINS_ELECTRIC: activeRules.filter(r => r.drive_type === DRIVE_TYPES.MAINS_ELECTRIC).length
  };

  return {
    total_active_rules: activeRules.length,
    active_by_drive_type: activeByDrive,
    total_unverified_prefixes: UNVERIFIED_FAMILY_PREFIXES.length,
    active_families: Object.keys(OFFICIAL_STIHL_FAMILY_RULES),
    unverified_families: [...UNVERIFIED_FAMILY_PREFIXES]
  };
}

export const ModelFamilyDriveRegistry = Object.freeze({
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  UNVERIFIED_FAMILY_PREFIXES,
  isAttachmentDesignation,
  isPoweredModelDesignation,
  parseModelFamily,
  getFamilyRule,
  resolveDriveType,
  getDriveResolutionMetadata,
  getRegistryStats
});
`;

fs.writeFileSync(REGISTRY_PATH, fileContent, 'utf8');
console.log('Successfully generated', REGISTRY_PATH);
