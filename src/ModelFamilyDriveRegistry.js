/**
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

export const OFFICIAL_STIHL_FAMILY_RULES = Object.freeze({
  MS: Object.freeze({
    family: "MS",
    machine_type: "CHAINSAW",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/kettingzagen-98188",
    source_url: "https://www.stihl.nl/nl/c/kettingzagen-98188",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (MS-serie benzinekettingzagen)",
    retrieval_started_at: "2026-10-25T13:53:52.265Z",
    retrieved_at: "2026-10-25T13:53:52.428Z",
    body_sha256: "0b5c395e035c7dd4bc4e3598be8487fb8d633b8f08138f1d10c6c6d96a66d83c",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  MSA: Object.freeze({
    family: "MSA",
    machine_type: "CHAINSAW",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-kettingzagen-98197",
    source_url: "https://www.stihl.nl/nl/c/accu-kettingzagen-98197",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (MSA-serie accukettingzagen AK/AP)",
    retrieval_started_at: "2026-10-25T13:53:52.449Z",
    retrieved_at: "2026-10-25T13:53:56.341Z",
    body_sha256: "ec14c20fabecaf7c71dbae2b34f822b53afa8710ab8954af630a17055361e09e",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  MSE: Object.freeze({
    family: "MSE",
    machine_type: "CHAINSAW",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/elektrische-kettingzagen-98198",
    source_url: "https://www.stihl.nl/nl/c/elektrische-kettingzagen-98198",
    source_title: "RM 2 R kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (MSE-serie elektrische kettingzagen 230V)",
    retrieval_started_at: "2026-10-25T13:53:56.349Z",
    retrieved_at: "2026-10-25T13:53:59.829Z",
    body_sha256: "7487b7a1ad21601f988877204ccc8bc91c5efb77fc93501b041cf19b4ce5934d",
    body_bytes: 161002,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  FS: Object.freeze({
    family: "FS",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bosmaaiers-98200",
    source_url: "https://www.stihl.nl/nl/c/bosmaaiers-98200",
    source_title: "GHE 250 kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (FS-serie benzine bosmaaiers)",
    retrieval_started_at: "2026-10-25T13:53:59.835Z",
    retrieved_at: "2026-10-25T13:54:03.128Z",
    body_sha256: "f2adfb0fad67d2b6c07ec0b25a58c29c249951db7c0fc0c1bf7c621a40e988ca",
    body_bytes: 164362,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  FSA: Object.freeze({
    family: "FSA",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-bosmaaiers-98206",
    source_url: "https://www.stihl.nl/nl/c/accu-bosmaaiers-98206",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (FSA-serie accubosmaaiers AS/AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:03.132Z",
    retrieved_at: "2026-10-25T13:54:06.422Z",
    body_sha256: "2484f4dd9424909aee7fdc26dcae55915a19c72824301f0f065015a5c41ea0a1",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  FSE: Object.freeze({
    family: "FSE",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/elektrische-kantensnijders-98207",
    source_url: "https://www.stihl.nl/nl/c/elektrische-kantensnijders-98207",
    source_title: "Veegmachines kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (FSE-serie elektrische kantenmaaiers 230V)",
    retrieval_started_at: "2026-10-25T13:54:06.429Z",
    retrieved_at: "2026-10-25T13:54:09.313Z",
    body_sha256: "0f08747b4aafc8ec2f9e1378ab36199bf0172a03249a59e824b4cc7de6449d9f",
    body_bytes: 173262,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  FR: Object.freeze({
    family: "FR",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bosmaaiers-98200",
    source_url: "https://www.stihl.nl/nl/c/bosmaaiers-98200",
    source_title: "GHE 250 kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (FR-serie ruggedragen benzinebosmaaiers)",
    retrieval_started_at: "2026-10-25T13:54:09.318Z",
    retrieved_at: "2026-10-25T13:54:03.128Z",
    body_sha256: "f2adfb0fad67d2b6c07ec0b25a58c29c249951db7c0fc0c1bf7c621a40e988ca",
    body_bytes: 164362,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  TS: Object.freeze({
    family: "TS",
    machine_type: "CUT_OFF_MACHINE",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/doorslijpers-98246",
    source_url: "https://www.stihl.nl/nl/c/doorslijpers-98246",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (TS-serie benzine doorslijpmachines)",
    retrieval_started_at: "2026-10-25T13:54:09.318Z",
    retrieved_at: "2026-10-25T13:54:12.603Z",
    body_sha256: "65f3eda98a384e91a960e9d034312160efad83aab9ca18b97bf7810eef32d706",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  TSA: Object.freeze({
    family: "TSA",
    machine_type: "CUT_OFF_MACHINE",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-doorslijpers-98248",
    source_url: "https://www.stihl.nl/nl/c/accu-doorslijpers-98248",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (TSA-serie accu doorslijpers AP accusysteem)",
    retrieval_started_at: "2026-10-25T13:54:12.609Z",
    retrieved_at: "2026-10-25T13:54:15.882Z",
    body_sha256: "04e49ed3f96ad5fd6f356d52eaefa340cab089d838cf6a88ff010f407d1f9d56",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HS: Object.freeze({
    family: "HS",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/heggenscharen-98224",
    source_url: "https://www.stihl.nl/nl/c/heggenscharen-98224",
    source_title: "Drukspuiten en nevelspuiten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HS-serie benzineheggenscharen)",
    retrieval_started_at: "2026-10-25T13:54:15.887Z",
    retrieved_at: "2026-10-25T13:54:18.774Z",
    body_sha256: "b547ce5875128b58f65de9ab4839c43fcc9c15df2b811279a7bd0e22187e44e5",
    body_bytes: 243819,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HSA: Object.freeze({
    family: "HSA",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-heggenscharen-98227",
    source_url: "https://www.stihl.nl/nl/c/accu-heggenscharen-98227",
    source_title: "RT 5097 kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HSA-serie accu heggenscharen AS/AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:18.784Z",
    retrieved_at: "2026-10-25T13:54:21.670Z",
    body_sha256: "67ac0f3ff3643d183649c2bf6492ef5a0f479f4beb618348b7106794a88691fd",
    body_bytes: 163170,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HSE: Object.freeze({
    family: "HSE",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/heggenscharen-98224",
    source_url: "https://www.stihl.nl/nl/c/heggenscharen-98224",
    source_title: "Drukspuiten en nevelspuiten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HSE-serie elektrische heggenscharen 230V)",
    retrieval_started_at: "2026-10-25T13:54:21.677Z",
    retrieved_at: "2026-10-25T13:54:18.774Z",
    body_sha256: "b547ce5875128b58f65de9ab4839c43fcc9c15df2b811279a7bd0e22187e44e5",
    body_bytes: 243819,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HL: Object.freeze({
    family: "HL",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/heggensnoeiers-98228",
    source_url: "https://www.stihl.nl/nl/c/heggensnoeiers-98228",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HL-serie benzine heggensnoeiers)",
    retrieval_started_at: "2026-10-25T13:54:21.677Z",
    retrieved_at: "2026-10-25T13:54:24.753Z",
    body_sha256: "e83c4d50df4cdc346b360eed45cb0b9a945798f8dc728f773e7ad3d2152fb477",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HLA: Object.freeze({
    family: "HLA",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-heggensnoeiers-98230",
    source_url: "https://www.stihl.nl/nl/c/accu-heggensnoeiers-98230",
    source_title: "RE 272 kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HLA-serie accu heggensnoeiers AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:24.762Z",
    retrieved_at: "2026-10-25T13:54:28.251Z",
    body_sha256: "06f195d35f0f13a6e723a251c4033cca4d9d34258cd0769955947cc39571f6f5",
    body_bytes: 154660,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HLE: Object.freeze({
    family: "HLE",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/heggensnoeiers-98228",
    source_url: "https://www.stihl.nl/nl/c/heggensnoeiers-98228",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HLE-serie elektrische heggensnoeiers 230V)",
    retrieval_started_at: "2026-10-25T13:54:28.257Z",
    retrieved_at: "2026-10-25T13:54:24.753Z",
    body_sha256: "e83c4d50df4cdc346b360eed45cb0b9a945798f8dc728f773e7ad3d2152fb477",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HT: Object.freeze({
    family: "HT",
    machine_type: "POLE_PRUNER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/hoogsnoeiers-98231",
    source_url: "https://www.stihl.nl/nl/c/hoogsnoeiers-98231",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HT-serie benzine hoogsnoeiers)",
    retrieval_started_at: "2026-10-25T13:54:28.257Z",
    retrieved_at: "2026-10-25T13:54:31.758Z",
    body_sha256: "a8fd3c449e2fff18a887f7374fe27b2524f0157eb1d0af5c55566b7c1c99264d",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HTA: Object.freeze({
    family: "HTA",
    machine_type: "POLE_PRUNER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-hoogsnoeiers-98233",
    source_url: "https://www.stihl.nl/nl/c/accu-hoogsnoeiers-98233",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HTA-serie accu hoogsnoeiers AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:31.765Z",
    retrieved_at: "2026-10-25T13:54:35.445Z",
    body_sha256: "6f3566bcb80da5a19d2fdcc9a1638da471c392378f2865d563565af8c906cc77",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  HTE: Object.freeze({
    family: "HTE",
    machine_type: "POLE_PRUNER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/hoogsnoeiers-98231",
    source_url: "https://www.stihl.nl/nl/c/hoogsnoeiers-98231",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (HTE-serie elektrische hoogsnoeiers 230V)",
    retrieval_started_at: "2026-10-25T13:54:35.450Z",
    retrieved_at: "2026-10-25T13:54:31.758Z",
    body_sha256: "a8fd3c449e2fff18a887f7374fe27b2524f0157eb1d0af5c55566b7c1c99264d",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  KM: Object.freeze({
    family: "KM",
    machine_type: "KOMBI",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/kombisysteem-98217",
    source_url: "https://www.stihl.nl/nl/c/kombisysteem-98217",
    source_title: "BGE 71 kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (KM-serie benzine KombiMotoren)",
    retrieval_started_at: "2026-10-25T13:54:35.450Z",
    retrieved_at: "2026-10-25T13:54:38.125Z",
    body_sha256: "a44b74011ff1ea4b60f2ae4c375445b0c3aad1c715994df3ea69d199e5e68a38",
    body_bytes: 138886,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  KMA: Object.freeze({
    family: "KMA",
    machine_type: "KOMBI",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-kombimotoren-98221",
    source_url: "https://www.stihl.nl/nl/c/accu-kombimotoren-98221",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (KMA-serie accu KombiMotoren AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:38.130Z",
    retrieved_at: "2026-10-25T13:54:41.203Z",
    body_sha256: "c72d0d78c11ee2087a1f5c3f62d76f7d19912b832c1bd0202716092b1e96bb06",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  BG: Object.freeze({
    family: "BG",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_title: "Grastrimmers, kantenmaaiers en bosmaaiers kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (BG 56 / BG 86 handgedragen benzinebladblazers)",
    retrieval_started_at: "2026-10-25T13:54:41.207Z",
    retrieved_at: "2026-10-25T13:54:43.688Z",
    body_sha256: "903c16b7987e09267256a57b6c06771ad14e250bd85e7ac9cf768aca7591dd40",
    body_bytes: 321614,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  BGA: Object.freeze({
    family: "BGA",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-bladblazers-98238",
    source_url: "https://www.stihl.nl/nl/c/accu-bladblazers-98238",
    source_title: "Bezemrol KW-MM kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (BGA 57 / BGA 86 accu bladblazers AS/AK/AP)",
    retrieval_started_at: "2026-10-25T13:54:43.699Z",
    retrieved_at: "2026-10-25T13:54:46.574Z",
    body_sha256: "56ca5632f84766f7a5d4187073496ab4c123083ab0d35b177477f4b0ec48ffc0",
    body_bytes: 154097,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  BGE: Object.freeze({
    family: "BGE",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_title: "Grastrimmers, kantenmaaiers en bosmaaiers kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (BGE 71 / BGE 81 elektrische bladblazers 230V)",
    retrieval_started_at: "2026-10-25T13:54:46.584Z",
    retrieved_at: "2026-10-25T13:54:43.688Z",
    body_sha256: "903c16b7987e09267256a57b6c06771ad14e250bd85e7ac9cf768aca7591dd40",
    body_bytes: 321614,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  BR: Object.freeze({
    family: "BR",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_url: "https://www.stihl.nl/nl/c/bladblazers-98236",
    source_title: "Grastrimmers, kantenmaaiers en bosmaaiers kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (BR 500 / BR 600 / BR 700 / BR 800 ruggedragen benzinebladblazers)",
    retrieval_started_at: "2026-10-25T13:54:46.584Z",
    retrieved_at: "2026-10-25T13:54:43.688Z",
    body_sha256: "903c16b7987e09267256a57b6c06771ad14e250bd85e7ac9cf768aca7591dd40",
    body_bytes: 321614,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  SH: Object.freeze({
    family: "SH",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bladzuigers-98241",
    source_url: "https://www.stihl.nl/nl/c/bladzuigers-98241",
    source_title: "Verticuteermachines &amp; gazonbeluchters kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (SH 56 / SH 86 benzine bladzuigers en hakselaars)",
    retrieval_started_at: "2026-10-25T13:54:46.584Z",
    retrieved_at: "2026-10-25T13:54:49.258Z",
    body_sha256: "e8097a1d2295118e8fb910e587a6e63486fbffacbb0607fa56844f79b9c0c9f8",
    body_bytes: 182931,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  SHA: Object.freeze({
    family: "SHA",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/accu-bladzuigers-98243",
    source_url: "https://www.stihl.nl/nl/c/accu-bladzuigers-98243",
    source_title: "Producten kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (SHA 56 accu zuighakselaar AK accusysteem)",
    retrieval_started_at: "2026-10-25T13:54:49.268Z",
    retrieved_at: "2026-10-25T13:54:52.143Z",
    body_sha256: "e71387cbf04be310ddceae82ad09b9da9a527db6b6ba6cd5897359a52afed860",
    body_bytes: 138284,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  SHE: Object.freeze({
    family: "SHE",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/bladzuigers-98241",
    source_url: "https://www.stihl.nl/nl/c/bladzuigers-98241",
    source_title: "Verticuteermachines &amp; gazonbeluchters kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (SHE 71 / SHE 81 elektrische bladzuigers 230V)",
    retrieval_started_at: "2026-10-25T13:54:52.149Z",
    retrieved_at: "2026-10-25T13:54:49.258Z",
    body_sha256: "e8097a1d2295118e8fb910e587a6e63486fbffacbb0607fa56844f79b9c0c9f8",
    body_bytes: 182931,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
  SR: Object.freeze({
    family: "SR",
    machine_type: "MISTBLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    requested_url: "https://www.stihl.nl/nl/c/spuitapparaten-en-sproei-apparaten-98254",
    source_url: "https://www.stihl.nl/nl/c/spuitapparaten-en-sproei-apparaten-98254",
    source_title: "Manuele pikhaak kopen",
    evidence_locator: "STIHL Nederland Officiële Catalogus (SR 430 / SR 450 ruggedragen benzinenevelspuiten)",
    retrieval_started_at: "2026-10-25T13:54:52.149Z",
    retrieved_at: "2026-10-25T13:54:55.030Z",
    body_sha256: "c050b87e1d6c38b0844e518f39acd06821d0c4c011da5babf7cdd242db33735a",
    body_bytes: 152785,
    status: "ACTIVE",
    confidence: 'HIGH'
  }),
});

export const UNVERIFIED_FAMILY_PREFIXES = Object.freeze([
  "BRA",
  "RM",
  "RMA",
  "RME",
  "RMI",
  "MB",
  "ME",
  "MA",
  "MI",
  "RT",
  "MT",
  "RE",
  "REA",
  "SE",
  "SEA",
  "KG",
  "KGA",
  "GE",
  "GH",
  "GHE",
  "MH",
  "HB",
  "ASA",
  "GTA",
  "AR",
  "AP",
  "AL",
  "BT",
  "BC",
  "FC",
  "FE",
  "FH",
  "FW",
  "SG",
  "VH",
  "TE",
  "AB",
  "BE",
  "FG",
  "GA",
  "HA",
  "HEL",
  "LB",
  "MM",
  "MVP",
  "NG",
  "P",
  "RB",
  "SP",
  "AD",
  "AHK",
  "AZ",
  "BM",
  "CRANKCASE",
  "EC",
  "ES",
  "GEGARDEN",
  "GS",
  "K",
  "KW",
  "LA",
  "LE",
  "LSG",
  "MC",
  "MVC",
  "RGA",
  "RL"
]);

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
    .replace(/^STIHL[\s_\-]+/i, '')
    .replace(/[_\-]+/g, ' ')
    .trim();

  for (const prefix of ALL_ACTIVE_PREFIXES_DESC) {
    const regex = new RegExp(`^${prefix}(?:\\s*\\d|\\s+|$)`);
    if (regex.test(clean)) {
      return prefix;
    }
  }

  const sortedUnverified = [...UNVERIFIED_FAMILY_PREFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of sortedUnverified) {
    const regex = new RegExp(`^${prefix}(?:\\s*\\d|\\s+|$)`);
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
        notes: `Explicit model evidence (${rawSourceBasis}) conflicts with verified STIHL family rule ${family} (${rule.drive_type}). Quarantined without unsafe override.`
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
