/**
 * ModelFamilyDriveRegistry.js
 *
 * Phase 56L — Verified Model-Family Drive-Type Resolution Registry.
 *
 * Resolves STIHL machine drive types (PETROL, BATTERY, MAINS_ELECTRIC, UNKNOWN)
 * from officially verified STIHL model family series rules when explicit model
 * evidence is absent.
 *
 * Invariants:
 *   1. Longest-prefix-first token parsing (e.g. MSA before MS, FSA before FS, TSA before TS).
 *   2. Strict evidence precedence: Explicit model evidence > Family rule > Unknown.
 *   3. Fail-closed: Unrecognized prefixes or unverified families resolve to UNKNOWN ('Niet vastgesteld').
 *   4. No engine technology inference: MS -> PETROL, but never infers 2-stroke vs 4-MIX without model evidence.
 *   5. Traceable provenance: every resolution records family, rule status, confidence, and official source metadata.
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

export const OFFICIAL_STIHL_FAMILY_RULES = Object.freeze({
  // --- Chainsaws (Motorsägen) ---
  MS: {
    family: 'MS',
    machine_type: 'CHAINSAW',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/kettingzagen-98188',
    source_title: 'STIHL Motorsägen (MS) - Benzinekettingzagen',
    evidence_locator: 'STIHL Nederland Officiële Catalogus & Handleidingen (MS-serie benzinekettingzagen)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  MSA: {
    family: 'MSA',
    machine_type: 'CHAINSAW',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-kettingzagen-98197',
    source_title: 'STIHL Accukettingzagen (MSA) - Lithium-Ion accusysteem',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (MSA-serie accukettingzagen AK/AP)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  MSE: {
    family: 'MSE',
    machine_type: 'CHAINSAW',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/elektrische-kettingzagen-98198',
    source_title: 'STIHL Elektrische kettingzagen (MSE) - 230V netstroom',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (MSE-serie elektrische kettingzagen)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Brushcutters & Clearing Saws (Freischneider) ---
  FS: {
    family: 'FS',
    machine_type: 'BRUSHCUTTER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bosmaaiers-98200',
    source_title: 'STIHL Benzinebosmaaiers en kantenmaaiers (FS)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FS-serie benzine bosmaaiers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  FSA: {
    family: 'FSA',
    machine_type: 'BRUSHCUTTER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-bosmaaiers-98206',
    source_title: 'STIHL Accubosmaaiers (FSA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FSA-serie accubosmaaiers AS/AK/AP)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  FSE: {
    family: 'FSE',
    machine_type: 'BRUSHCUTTER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/elektrische-kantensnijders-98207',
    source_title: 'STIHL Elektrische kantenmaaiers (FSE)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FSE-serie 230V elektrische kantenmaaiers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  FR: {
    family: 'FR',
    machine_type: 'BRUSHCUTTER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bosmaaiers-98200',
    source_title: 'STIHL Ruggedragen benzinebosmaaiers (FR)',
    evidence_locator: 'STIHL Officiële Handleidingen & Onderdelencatalogus (FR 410 / FR 460 benzine)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Cut-off Machines (Trennschleifer) ---
  TS: {
    family: 'TS',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/doorslijpers-98246',
    source_title: 'STIHL Benzinedoorslijpers (TS)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (TS-serie benzine doorslijpmachines)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  TSA: {
    family: 'TSA',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-doorslijpers-98248',
    source_title: 'STIHL Accudoorslijpers (TSA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (TSA-serie accu doorslijpers AP accusysteem)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Hedge Trimmers (Heckenscheren & Heckenschneider) ---
  HS: {
    family: 'HS',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/heggenscharen-98224',
    source_title: 'STIHL Benzineheggenscharen (HS)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HS-serie benzine heggenscharen)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HSA: {
    family: 'HSA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-heggenscharen-98227',
    source_title: 'STIHL Accuheggenscharen (HSA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HSA-serie accu heggenscharen AS/AK/AP)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HSE: {
    family: 'HSE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/heggenscharen-98224',
    source_title: 'STIHL Elektrische heggenscharen (HSE)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HSE-serie 230V elektrische heggenscharen)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HL: {
    family: 'HL',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/heggensnoeiers-98228',
    source_title: 'STIHL Benzine heggensnoeiers op steel (HL)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HL-serie benzine stokheggenscharen)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HLA: {
    family: 'HLA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-heggensnoeiers-98230',
    source_title: 'STIHL Accuheggensnoeiers op steel (HLA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HLA-serie accu stokheggenscharen AP accusysteem)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HLE: {
    family: 'HLE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/heggensnoeiers-98228',
    source_title: 'STIHL Elektrische heggensnoeiers op steel (HLE)',
    evidence_locator: 'STIHL Handleidingen (HLE 71 230V netstroom stokheggenschaar)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Pole Pruners (Hoch-Entaster) ---
  HT: {
    family: 'HT',
    machine_type: 'POLE_PRUNER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/hoogsnoeiers-98231',
    source_title: 'STIHL Benzine hoogsnoeiers (HT)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HT-serie benzine telescopische hoogsnoeiers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HTA: {
    family: 'HTA',
    machine_type: 'POLE_PRUNER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-hoogsnoeiers-98233',
    source_title: 'STIHL Accuhoogsnoeiers (HTA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HTA-serie accu hoogsnoeiers AK/AP)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  HTE: {
    family: 'HTE',
    machine_type: 'POLE_PRUNER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/hoogsnoeiers-98231',
    source_title: 'STIHL Elektrische hoogsnoeiers (HTE)',
    evidence_locator: 'STIHL Handleidingen (HTE 60 230V elektrische hoogsnoeier)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- KombiEngines (KombiMotoren) ---
  KM: {
    family: 'KM',
    machine_type: 'KOMBI',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/kombisysteem-98217',
    source_title: 'STIHL Benzine KombiMotoren (KM)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (KM 56 / KM 94 / KM 131 benzine)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  KMA: {
    family: 'KMA',
    machine_type: 'KOMBI',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-kombimotoren-98221',
    source_title: 'STIHL Accu KombiMotoren (KMA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (KMA 130 / KMA 135 accu AP systeem)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Blowers (Blasgeräte) ---
  BG: {
    family: 'BG',
    machine_type: 'BLOWER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    source_title: 'STIHL Handgedragen benzinebladblazers (BG)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BG 56 / BG 86 benzine bladblazers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  BGA: {
    family: 'BGA',
    machine_type: 'BLOWER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-bladblazers-98238',
    source_title: 'STIHL Accubladblazers (BGA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BGA 57 / BGA 86 accu bladblazers AS/AK/AP)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  BGE: {
    family: 'BGE',
    machine_type: 'BLOWER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    source_title: 'STIHL Elektrische bladblazers (BGE)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BGE 71 / BGE 81 230V elektrische bladblazers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  BR: {
    family: 'BR',
    machine_type: 'BLOWER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    source_title: 'STIHL Ruggedragen benzinebladblazers (BR)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BR 420 / BR 600 / BR 700 / BR 800 rugblazers)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Vacuum Shredders (Saughäcksler) ---
  SH: {
    family: 'SH',
    machine_type: 'VACUUM_SHREDDER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bladzuigers-98241',
    source_title: 'STIHL Benzine bladzuigers / zuighakselaars (SH)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SH 56 / SH 86 benzine zuighakselaars)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  SHA: {
    family: 'SHA',
    machine_type: 'VACUUM_SHREDDER',
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/accu-bladzuigers-98243',
    source_title: 'STIHL Accubladzuigers / zuighakselaars (SHA)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SHA 56 accu zuighakselaar AK systeem)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },
  SHE: {
    family: 'SHE',
    machine_type: 'VACUUM_SHREDDER',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/bladzuigers-98241',
    source_title: 'STIHL Elektrische bladzuigers (SHE)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SHE 71 / SHE 81 230V elektrische zuighakselaars)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  },

  // --- Mistblowers & Sprayers (Sprühgeräte) ---
  SR: {
    family: 'SR',
    machine_type: 'MISTBLOWER',
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    source_url: 'https://www.stihl.nl/nl/c/spuitapparaten-en-sproei-apparaten-98254',
    source_title: 'STIHL Ruggedragen benzinesproeiers / nevelspuiten (SR)',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SR 430 / SR 450 benzine nevelspuiten)',
    retrieved_at: '2026-10-25T00:00:00.000Z',
    status: 'ACTIVE',
    confidence: 'HIGH'
  }
});

// Explicitly unverified / out-of-scope prefixes kept in registry for auditability
export const UNVERIFIED_FAMILY_PREFIXES = Object.freeze([
  'BRA', 'RM', 'RMA', 'RME', 'RMI', 'MB', 'ME', 'MA', 'MI', 'RT', 'MT',
  'RE', 'REA', 'SE', 'SEA', 'KG', 'KGA', 'GE', 'GH', 'GHE', 'MH', 'HB',
  'ASA', 'GTA', 'AR', 'AP', 'AL', 'BT', 'BC', 'FC', 'FE', 'FH', 'FW', 'SG',
  'VH', 'TE', 'AB', 'BE', 'FG', 'GA', 'HA', 'HEL', 'LB', 'MM', 'MVP', 'NG',
  'P', 'RB', 'SP', 'AD', 'AHK', 'AZ', 'BM', 'CRANKCASE', 'EC', 'ES',
  'GEGARDEN', 'GS', 'K', 'KW', 'LA', 'LE', 'LSG', 'MC', 'MVC', 'RGA', 'RL'
]);

// Sorted prefixes for longest-prefix-first matching
const ALL_ACTIVE_PREFIXES_DESC = Object.keys(OFFICIAL_STIHL_FAMILY_RULES).sort(
  (a, b) => b.length - a.length
);

/**
 * Extracts a candidate model string from string or model object.
 */
function extractModelString(modelInput) {
  if (!modelInput) return '';
  if (typeof modelInput === 'string') return modelInput.trim();
  if (typeof modelInput === 'object') {
    return (
      modelInput.model_name ||
      modelInput.model_title_clean ||
      modelInput.base_model_name ||
      modelInput.slug ||
      modelInput.canonical_model_id ||
      modelInput.id ||
      ''
    ).trim();
  }
  return '';
}

/**
 * Normalizes an explicit drive type string from database/model object.
 */
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
 *   'ms_211'      -> 'MS'
 *   'MS211'       -> 'MS'
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

  // Clean and normalize separators
  const clean = rawStr
    .trim()
    .toUpperCase()
    .replace(/^STIHL[\s_\-]+/i, '')
    .replace(/[_\-]+/g, ' ')
    .trim();

  for (const prefix of ALL_ACTIVE_PREFIXES_DESC) {
    // Matches prefix followed by optional whitespace + digit, or whitespace, or end of string
    const regex = new RegExp(`^${prefix}(?:\\s*\\d|\\s+|$)`);
    if (regex.test(clean)) {
      return prefix;
    }
  }

  // Also check unverified prefixes to explicitly recognize them (longest first)
  const sortedUnverified = [...UNVERIFIED_FAMILY_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of sortedUnverified) {
    const regex = new RegExp(`^${prefix}(?:\\s*\\d|\\s+|$)`);
    if (regex.test(clean)) {
      return prefix;
    }
  }

  return null;
}

/**
 * Retrieves the family rule object for a model.
 */
export function getFamilyRule(modelInput) {
  const family = parseModelFamily(modelInput);
  if (!family) return null;
  return OFFICIAL_STIHL_FAMILY_RULES[family] || null;
}

/**
 * Resolves the drive type of a model with strict precedence:
 *   1. Explicit model-specific evidence (if reliable)
 *   2. Official verified STIHL family rule
 *   3. Fail-closed: UNKNOWN ('Niet vastgesteld')
 *
 * Conflict handling:
 *   If explicit evidence contradicts the verified family rule, returns CONFLICT_QUARANTINED.
 */
export function resolveDriveType(modelInput) {
  let explicitDriveType = null;
  let rawSourceBasis = null;

  if (modelInput && typeof modelInput === 'object') {
    const rawPowerSource = modelInput.power_source || modelInput.basic_classification?.power_source;
    const rawFuelType = modelInput.fuel_type || modelInput.basic_classification?.fuel_type;
    explicitDriveType = normalizeExplicitDriveType(rawPowerSource) || normalizeExplicitDriveType(rawFuelType);
    if (explicitDriveType) {
      rawSourceBasis = rawPowerSource || rawFuelType;
    }
  }

  const family = parseModelFamily(modelInput);
  const rule = family ? OFFICIAL_STIHL_FAMILY_RULES[family] : null;

  // Conflict check: explicit contradictory to family rule
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
        notes: `Explicit model evidence (${rawSourceBasis}) conflicts with verified STIHL family rule ${family} (${rule.drive_type}). Quarantined without unsafe override.`
      };
    }
  }

  // Precedence 1: Explicit model evidence
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

  // Precedence 2: Official STIHL family rule
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
      confidence: rule.confidence
    };
  }

  // Precedence 3: Unknown / Unverified family (Fail closed)
  return {
    drive_type: DRIVE_TYPES.UNKNOWN,
    display: DISPLAY_LABELS.UNKNOWN,
    resolution: family ? 'UNVERIFIED_FAMILY' : 'UNKNOWN',
    family: family || null,
    source_type: null,
    confidence: 'NONE'
  };
}

/**
 * Returns full drive resolution metadata for auditing and reporting.
 */
export function getDriveResolutionMetadata(modelInput) {
  const modelStr = extractModelString(modelInput);
  const family = parseModelFamily(modelInput);
  const rule = family ? OFFICIAL_STIHL_FAMILY_RULES[family] || null : null;
  const resolution = resolveDriveType(modelInput);

  return {
    model_name: modelStr,
    family,
    family_rule_active: Boolean(rule && rule.status === 'ACTIVE'),
    ...resolution
  };
}

/**
 * Returns registry statistics.
 */
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
  parseModelFamily,
  getFamilyRule,
  resolveDriveType,
  getDriveResolutionMetadata,
  getRegistryStats
});
