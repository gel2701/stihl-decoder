/**
 * ModelFamilyDriveRegistry.js
 *
 * Phase 56L.2 — Semantic STIHL Model Family Evidence Registry.
 *
 * Resolves STIHL machine drive types (PETROL, BATTERY, MAINS_ELECTRIC, UNKNOWN)
 * with strict attachment safety, canonical explicit evidence propagation,
 * and semantically verified official STIHL family rules.
 *
 * Invariants & Precedence:
 *   1. Attachment safety gate: Unpowered attachments (e.g. BG-KM, FS-KM, HL-KM, HT-KM, Tool Attachments)
 *      are isolated as UNKNOWN (resolution: ATTACHMENT_NOT_POWERED). No family rule is applied.
 *   2. Canonical explicit evidence propagation: explicit_power_source / explicit_fuel_type are accepted
 *      and prioritized as EXPLICIT_MODEL.
 *   3. Conflict quarantine: If explicit model evidence contradicts verified family rule, resolution is
 *      quarantined (CONFLICT_QUARANTINED) fail-closed.
 *   4. Semantically verified family rule: Official STIHL family rule applied when explicit evidence is absent (FAMILY_RULE).
 *   5. Longest-prefix-first token parsing: MSA before MS, FSA before FS, TSA before TS, etc.
 *   6. Fail-closed: Unrecognized prefixes or unverified/disabled families resolve to UNKNOWN ('Niet vastgesteld').
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
    fetch_id: "fetch_stihl_family_001",
    requested_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-ms-151-102583",
    source_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-ms-151-102583",
    source_title: "MS 151 C-E en MS 151 TC-E benzinekettingzaag kopen",
    evidence_locator: "Official STIHL verification: \"MS 151 C-E en MS 151 TC-E benzinekettingzaag kopen\" matches family [MS], models [MS 151], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MS"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["MS 151"],
    retrieval_started_at: "2026-10-25T15:53:58.047Z",
    retrieved_at: "2026-10-25T15:54:03.658Z",
    body_sha256: "a46b9fac6f9ce6c5b5080ed9939a0b295451b591535c517a041b4a714c8f1a65",
    body_bytes: 191790,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  MSA: Object.freeze({
    family: "MSA",
    machine_type: "CHAINSAW",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_002",
    requested_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-msa-60-ak-systeem-164117",
    source_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-msa-60-ak-systeem-164117",
    source_title: "MSA 60 C accukettingzaag kopen",
    evidence_locator: "Official STIHL verification: \"MSA 60 C accukettingzaag kopen\" matches family [MSA], models [MSA 60], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MSA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem","as-systeem"],
    matched_models: ["MSA 60"],
    retrieval_started_at: "2026-10-25T15:54:03.686Z",
    retrieved_at: "2026-10-25T15:54:03.748Z",
    body_sha256: "e3208e68d3385efdcb0e4e36eb152c9d96d90532b16595fc68abfed61380e85c",
    body_bytes: 203414,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  MSE: Object.freeze({
    family: "MSE",
    machine_type: "CHAINSAW",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_003",
    requested_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-mse-141-76267",
    source_url: "https://www.stihl.nl/nl/p/kettingzagen-motorzagen-mse-141-76267",
    source_title: "MSE 141 elektrische kettingzaag kopen",
    evidence_locator: "Official STIHL verification: \"MSE 141 elektrische kettingzaag kopen\" matches family [MSE], models [MSE 141], and drive terms [elektrische, 230 v].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MSE"],
    matched_drive_terms: ["elektrische","230 v"],
    matched_models: ["MSE 141"],
    retrieval_started_at: "2026-10-25T15:54:03.775Z",
    retrieved_at: "2026-10-25T15:54:03.804Z",
    body_sha256: "c34c48b6091e232eb0d059d1c8716b88b4d5943934b09910fd4f57a2128a41b9",
    body_bytes: 183488,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  FS: Object.freeze({
    family: "FS",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_004",
    requested_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fs-38-628",
    source_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fs-38-628",
    source_title: "FS 38 benzinegrastrimmer kopen",
    evidence_locator: "Official STIHL verification: \"FS 38 benzinegrastrimmer kopen\" matches family [FS], models [FS 38], and drive terms [benzine, brandstof].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FS"],
    matched_drive_terms: ["benzine","brandstof"],
    matched_models: ["FS 38"],
    retrieval_started_at: "2026-10-25T15:54:03.816Z",
    retrieved_at: "2026-10-25T15:54:08.679Z",
    body_sha256: "c1bd07b516c2e817f2beb95456b9b26ae2bee6314033f578094b4ef570fa7239",
    body_bytes: 173921,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  FSA: Object.freeze({
    family: "FSA",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_005",
    requested_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fsa-30-as-systeem-186896",
    source_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fsa-30-as-systeem-186896",
    source_title: "FSA 30 accukantenmaaier set kopen",
    evidence_locator: "Official STIHL verification: \"FSA 30 accukantenmaaier set kopen\" matches family [FSA], models [FSA 30], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FSA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem","as-systeem"],
    matched_models: ["FSA 30"],
    retrieval_started_at: "2026-10-25T15:54:08.697Z",
    retrieved_at: "2026-10-25T15:54:13.566Z",
    body_sha256: "24b45553a131d5292be10b879b3d8ab8ff56314513173d23522448225dc1affc",
    body_bytes: 225898,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  FSE: Object.freeze({
    family: "FSE",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_006",
    requested_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fse-52-2624",
    source_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fse-52-2624",
    source_title: "FSE 52 elektrische grastrimmer kopen",
    evidence_locator: "Official STIHL verification: \"FSE 52 elektrische grastrimmer kopen\" matches family [FSE], models [FSE 52], and drive terms [elektrische].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FSE"],
    matched_drive_terms: ["elektrische"],
    matched_models: ["FSE 52"],
    retrieval_started_at: "2026-10-25T15:54:13.588Z",
    retrieved_at: "2026-10-25T15:54:18.260Z",
    body_sha256: "4946c40f73382ea9a2cb80c7f3e388fefe56bdaf21a0b35ab1479ef74988d268",
    body_bytes: 176522,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  FR: Object.freeze({
    family: "FR",
    machine_type: "BRUSHCUTTER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_007",
    requested_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fr-410-1022177",
    source_url: "https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fr-410-1022177",
    source_title: "FR 410 C-E ruggedragen benzinebosmaaier kopen",
    evidence_locator: "Official STIHL verification: \"FR 410 C-E ruggedragen benzinebosmaaier kopen\" matches family [FR], models [FR 410], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FR"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["FR 410"],
    retrieval_started_at: "2026-10-25T15:54:18.277Z",
    retrieved_at: "2026-10-25T15:54:23.736Z",
    body_sha256: "cf34d88c9c7a6eafc2d79ddce7300b2a6fa2f9e8c9e66dcbc658d845a78e12a0",
    body_bytes: 201506,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  TS: Object.freeze({
    family: "TS",
    machine_type: "CUT_OFF_MACHINE",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_008",
    requested_url: "https://www.stihlusa.com/products/cut-off-machines/professional-cut-off-machines/ts420/",
    source_url: "https://www.stihlusa.com/en/p/cut-off-machines-ts-420-gasoline-cut-off-machine-1027324",
    source_title: "TS 420 Gasoline Cut-off Machine",
    evidence_locator: "Official STIHL verification: \"TS 420 Gasoline Cut-off Machine\" matches family [TS], models [TS 420], and drive terms [gasoline].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["TS"],
    matched_drive_terms: ["gasoline"],
    matched_models: ["TS 420"],
    retrieval_started_at: "2026-10-25T15:54:23.752Z",
    retrieved_at: "2026-10-25T15:54:27.417Z",
    body_sha256: "20616c0522b7556e118f6aa12329ebdf89289a81c4dc394e0246b58a62230d03",
    body_bytes: 188842,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  TSA: Object.freeze({
    family: "TSA",
    machine_type: "CUT_OFF_MACHINE",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_009",
    requested_url: "https://www.stihl.nl/nl/p/doorslijpers-bandenzagen-tsa-230-ap-systeem-209755",
    source_url: "https://www.stihl.nl/nl/p/doorslijpers-bandenzagen-tsa-230-ap-systeem-209755",
    source_title: "TSA 230 accudoorslijper kopen",
    evidence_locator: "Official STIHL verification: \"TSA 230 accudoorslijper kopen\" matches family [TSA], models [TSA 230], and drive terms [accu, battery, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["TSA"],
    matched_drive_terms: ["accu","battery","ap-systeem"],
    matched_models: ["TSA 230"],
    retrieval_started_at: "2026-10-25T15:54:27.433Z",
    retrieved_at: "2026-10-25T15:54:31.091Z",
    body_sha256: "710660d649ac8891eef8463c6249e699cbea92b1cc69a0b832d69a415f715cb9",
    body_bytes: 208130,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HS: Object.freeze({
    family: "HS",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_010",
    requested_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hs-45-12832",
    source_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hs-45-12832",
    source_title: "HS 45 benzineheggenschaar kopen",
    evidence_locator: "Official STIHL verification: \"HS 45 benzineheggenschaar kopen\" matches family [HS], models [HS 45], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HS"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["HS 45"],
    retrieval_started_at: "2026-10-25T15:54:31.107Z",
    retrieved_at: "2026-10-25T15:54:35.970Z",
    body_sha256: "c6b24cace5a90129a73240ee58787390c11a35dd63da5c2833d5a48a5b0b66ff",
    body_bytes: 183922,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HSA: Object.freeze({
    family: "HSA",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_011",
    requested_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hsa-50-ak-systeem-183477",
    source_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hsa-50-ak-systeem-183477",
    source_title: "HSA 50 accuheggenschaar kopen",
    evidence_locator: "Official STIHL verification: \"HSA 50 accuheggenschaar kopen\" matches family [HSA], models [HSA 50], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HSA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem","as-systeem"],
    matched_models: ["HSA 50"],
    retrieval_started_at: "2026-10-25T15:54:35.990Z",
    retrieved_at: "2026-10-25T15:54:40.857Z",
    body_sha256: "4415945e8834e22939d39b66bdd3edfae885c85f1e57516fac6828e1308346d2",
    body_bytes: 201361,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HSE: Object.freeze({
    family: "HSE",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_012",
    requested_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hse-42-2508",
    source_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hse-42-2508",
    source_title: "HSE 42 elektrische heggenschaar kopen",
    evidence_locator: "Official STIHL verification: \"HSE 42 elektrische heggenschaar kopen\" matches family [HSE], models [HSE 42, HSE 52], and drive terms [elektrische].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HSE"],
    matched_drive_terms: ["elektrische"],
    matched_models: ["HSE 42","HSE 52"],
    retrieval_started_at: "2026-10-25T15:54:40.876Z",
    retrieved_at: "2026-10-25T15:54:46.551Z",
    body_sha256: "401e5fb6da14f0feae9c107ff3ebb6b812b8054ef25ca870767a8cfef12dea03",
    body_bytes: 177849,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HL: Object.freeze({
    family: "HL",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_013",
    requested_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hl-94-74075",
    source_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hl-94-74075",
    source_title: "HL 94 benzineheggenschaar op steel kopen",
    evidence_locator: "Official STIHL verification: \"HL 94 benzineheggenschaar op steel kopen\" matches family [HL], models [HL 94], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HL"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["HL 94"],
    retrieval_started_at: "2026-10-25T15:54:46.568Z",
    retrieved_at: "2026-10-25T15:54:51.636Z",
    body_sha256: "9e1601b9a8babcff0f9cbcd28acbfcaa33c768b85180b6bbf5662ede25aeed9c",
    body_bytes: 201551,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HLA: Object.freeze({
    family: "HLA",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_014",
    requested_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hla-56-ak-systeem-93677",
    source_url: "https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hla-56-ak-systeem-93677",
    source_title: "HLA 56 accuheggenschaar op steel kopen",
    evidence_locator: "Official STIHL verification: \"HLA 56 accuheggenschaar op steel kopen\" matches family [HLA], models [HLA 56], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HLA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem","as-systeem"],
    matched_models: ["HLA 56"],
    retrieval_started_at: "2026-10-25T15:54:51.650Z",
    retrieved_at: "2026-10-25T15:54:56.718Z",
    body_sha256: "06ec429f9a755daa525bd3abd7fbd5c88c443d63f6d33b5b8f59d207937e8c7d",
    body_bytes: 200600,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HLE: Object.freeze({
    family: "HLE",
    machine_type: "HEDGE_TRIMMER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_015",
    requested_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-277-9821-B_ZBA_02_01.pdf",
    source_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-277-9821-B_ZBA_02_01.pdf",
    source_title: "STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-277-9821-B_ZBA_02_01.pdf)",
    evidence_locator: "Official STIHL verification: \"STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-277-9821-B_ZBA_02_01.pdf)\" matches family [HLE], models [HLE 71], and drive terms [elektrisch, elektrische].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HLE"],
    matched_drive_terms: ["elektrisch","elektrische"],
    matched_models: ["HLE 71"],
    retrieval_started_at: "2026-10-25T15:54:56.728Z",
    retrieved_at: "2026-10-25T15:54:56.852Z",
    body_sha256: "1fbaae2ee52c2efa78da6110f75da5f80153dc45f94ad1ad7aaea4d0196ac471",
    body_bytes: 12492864,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HT: Object.freeze({
    family: "HT",
    machine_type: "POLE_PRUNER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_016",
    requested_url: "https://www.stihl.nl/nl/p/hoogsnoeiers-ht-135-137521",
    source_url: "https://www.stihl.nl/nl/p/hoogsnoeiers-ht-135-137521",
    source_title: "HT 135 benzinehoogsnoeier kopen",
    evidence_locator: "Official STIHL verification: \"HT 135 benzinehoogsnoeier kopen\" matches family [HT], models [HT 135], and drive terms [benzine, brandstof, 4-mix].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HT"],
    matched_drive_terms: ["benzine","brandstof","4-mix"],
    matched_models: ["HT 135"],
    retrieval_started_at: "2026-10-25T15:54:58.079Z",
    retrieved_at: "2026-10-25T15:55:02.939Z",
    body_sha256: "3a11920e9fe3613a2228edf72167b5a7ecc915b1cba2d6d6a0bdce2f0e882444",
    body_bytes: 184654,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  HTA: Object.freeze({
    family: "HTA",
    machine_type: "POLE_PRUNER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_017",
    requested_url: "https://www.stihl.nl/nl/p/hoogsnoeiers-hta-50-ak-systeem-144350",
    source_url: "https://www.stihl.nl/nl/p/hoogsnoeiers-hta-50-ak-systeem-144350",
    source_title: "HTA 50 accuhoogsnoeier kopen",
    evidence_locator: "Official STIHL verification: \"HTA 50 accuhoogsnoeier kopen\" matches family [HTA], models [HTA 50], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HTA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem"],
    matched_models: ["HTA 50"],
    retrieval_started_at: "2026-10-25T15:55:02.963Z",
    retrieved_at: "2026-10-25T15:55:06.422Z",
    body_sha256: "0059d55841d763db3be0d6c55633b3bf499e0afc28be44069dc094b87f2590f3",
    body_bytes: 194739,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  KM: Object.freeze({
    family: "KM",
    machine_type: "KOMBI",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_019",
    requested_url: "https://www.stihl.nl/nl/p/combisysteem-multisysteem-km-56-rc-e-1559",
    source_url: "https://www.stihl.nl/nl/p/combisysteem-multisysteem-km-56-rc-e-1559",
    source_title: "KM 56 RC-E benzinecombimotor kopen",
    evidence_locator: "Official STIHL verification: \"KM 56 RC-E benzinecombimotor kopen\" matches family [KM], models [KM 56], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["KM"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["KM 56"],
    retrieval_started_at: "2026-10-25T15:55:09.902Z",
    retrieved_at: "2026-10-25T15:55:15.365Z",
    body_sha256: "291e8398ecf2a11ff3c395a4cdc441d0cd980003ace5240118606edb0da8556f",
    body_bytes: 191887,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  KMA: Object.freeze({
    family: "KMA",
    machine_type: "KOMBI",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_020",
    requested_url: "https://www.stihl.nl/nl/p/combisysteem-multisysteem-kma-80-r-ak-systeem-179890",
    source_url: "https://www.stihl.nl/nl/p/combisysteem-multisysteem-kma-80-r-ak-systeem-179890",
    source_title: "Accucombimotor KMA 80 R kopen",
    evidence_locator: "Official STIHL verification: \"Accucombimotor KMA 80 R kopen\" matches family [KMA], models [KMA 80], and drive terms [accu, batterij, ak-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["KMA"],
    matched_drive_terms: ["accu","batterij","ak-systeem","ap-systeem"],
    matched_models: ["KMA 80"],
    retrieval_started_at: "2026-10-25T15:55:15.378Z",
    retrieved_at: "2026-10-25T15:55:21.654Z",
    body_sha256: "8ce7e8261f8b80ba40b5230c306e13cb0476f6bd7bcb5c91c5d28f62a245e373",
    body_bytes: 190479,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  BG: Object.freeze({
    family: "BG",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_021",
    requested_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bg-56-2907",
    source_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bg-56-2907",
    source_title: "BG 56 benzinebladblazer kopen",
    evidence_locator: "Official STIHL verification: \"BG 56 benzinebladblazer kopen\" matches family [BG], models [BG 56], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BG"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["BG 56"],
    retrieval_started_at: "2026-10-25T15:55:21.669Z",
    retrieved_at: "2026-10-25T15:55:25.325Z",
    body_sha256: "d2473e51cf37ac1104f78cc35ca60efa06d6c11f2d4de2b8fe623bf9bfb8c58c",
    body_bytes: 178201,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  BGA: Object.freeze({
    family: "BGA",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_022",
    requested_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bga-60-ak-systeem-145802",
    source_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bga-60-ak-systeem-145802",
    source_title: "BGA 60 accubladblazer kopen",
    evidence_locator: "Official STIHL verification: \"BGA 60 accubladblazer kopen\" matches family [BGA], models [BGA 60], and drive terms [accu, ak-systeem, ap-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BGA"],
    matched_drive_terms: ["accu","ak-systeem","ap-systeem","as-systeem"],
    matched_models: ["BGA 60"],
    retrieval_started_at: "2026-10-25T15:55:25.335Z",
    retrieved_at: "2026-10-25T15:55:31.635Z",
    body_sha256: "8f578c6d7b846f162f59bfb3c4eae0039ce7d1cda1561225212aa08cfdb39a2b",
    body_bytes: 203574,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  BGE: Object.freeze({
    family: "BGE",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_023",
    requested_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf",
    source_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf",
    source_title: "STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf)",
    evidence_locator: "Official STIHL verification: \"STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf)\" matches family [BGE], models [BGE 61, BGE 71, BGE 81], and drive terms [elektrisch, elektrische, electric].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BGE"],
    matched_drive_terms: ["elektrisch","elektrische","electric"],
    matched_models: ["BGE 61","BGE 71","BGE 81"],
    retrieval_started_at: "2026-10-25T15:55:31.651Z",
    retrieved_at: "2026-10-25T15:55:31.773Z",
    body_sha256: "ffb8176790386bb71b8f0aff3f906274de77a2832bc4f8d544ef8ed20a185e42",
    body_bytes: 8482483,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  BR: Object.freeze({
    family: "BR",
    machine_type: "BLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_024",
    requested_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-br-200-2661",
    source_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-br-200-2661",
    source_title: "BR 200 benzinebladblazer kopen",
    evidence_locator: "Official STIHL verification: \"BR 200 benzinebladblazer kopen\" matches family [BR], models [BR 200], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BR"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["BR 200"],
    retrieval_started_at: "2026-10-25T15:55:32.665Z",
    retrieved_at: "2026-10-25T15:55:37.733Z",
    body_sha256: "54466f506d7664a6c6cef2d2c9e3c76dbe4bd8a8d102d3307ac5c3411b0d6247",
    body_bytes: 175286,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  SH: Object.freeze({
    family: "SH",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_025",
    requested_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sh-56-2895",
    source_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sh-56-2895",
    source_title: "SH 56 benzinebladzuiger kopen",
    evidence_locator: "Official STIHL verification: \"SH 56 benzinebladzuiger kopen\" matches family [SH], models [SH 56], and drive terms [benzine, brandstof, 2-takt].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SH"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["SH 56"],
    retrieval_started_at: "2026-10-25T15:55:37.741Z",
    retrieved_at: "2026-10-25T15:55:41.404Z",
    body_sha256: "4be3c0418cf4674dc3aebaf51131dda1c268d77194706613d97cbcf738d74df7",
    body_bytes: 182409,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  SHA: Object.freeze({
    family: "SHA",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_026",
    requested_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sha-56-ak-systeem-137684",
    source_url: "https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sha-56-ak-systeem-137684",
    source_title: "SHA 56 accubladzuiger kopen",
    evidence_locator: "Official STIHL verification: \"SHA 56 accubladzuiger kopen\" matches family [SHA], models [SHA 56], and drive terms [accu, batterij, ak-systeem].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SHA"],
    matched_drive_terms: ["accu","batterij","ak-systeem"],
    matched_models: ["SHA 56"],
    retrieval_started_at: "2026-10-25T15:55:41.410Z",
    retrieved_at: "2026-10-25T15:55:47.280Z",
    body_sha256: "d6267657eddda3e5501b0ab965d3489447588534d7c4f03f83913536a9a43c76",
    body_bytes: 217533,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  SHE: Object.freeze({
    family: "SHE",
    machine_type: "SHREDDER_VAC",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_023",
    requested_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf",
    source_url: "https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf",
    source_title: "STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf)",
    evidence_locator: "Official STIHL verification: \"STIHL Official PDF Manual / Catalog (DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf)\" matches family [SHE], models [SHE 71, SHE 81], and drive terms [elektrisch, elektrische, electric].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SHE"],
    matched_drive_terms: ["elektrisch","elektrische","electric"],
    matched_models: ["SHE 71","SHE 81"],
    retrieval_started_at: "2026-10-25T15:55:31.651Z",
    retrieved_at: "2026-10-25T15:55:31.773Z",
    body_sha256: "ffb8176790386bb71b8f0aff3f906274de77a2832bc4f8d544ef8ed20a185e42",
    body_bytes: 8482483,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  SR: Object.freeze({
    family: "SR",
    machine_type: "MISTBLOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_027",
    requested_url: "https://www.stihlusa.com/products/sprayers/backpack-sprayers/sr450/",
    source_url: "https://www.stihlusa.com/en/p/mistblowers-sprayers-sr-450-gasoline-backpack-sprayer-1027378",
    source_title: "SR 450 Gasoline Backpack Sprayer",
    evidence_locator: "Official STIHL verification: \"SR 450 Gasoline Backpack Sprayer\" matches family [SR], models [SR 450], and drive terms [gasoline].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SR"],
    matched_drive_terms: ["gasoline"],
    matched_models: ["SR 450"],
    retrieval_started_at: "2026-10-25T15:55:47.346Z",
    retrieved_at: "2026-10-25T15:55:51.792Z",
    body_sha256: "19a2447b50cba6fa5ce79542c30fd8e03ad021edb733c4078052961da5a14513",
    body_bytes: 159651,
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
});


export const DISABLED_FAMILY_RULES = Object.freeze({
  HTE: Object.freeze({
    family: "HTE",
    machine_type: "POLE_PRUNER",
    intended_drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    status: 'DISABLED',
    verification_status: "UNVERIFIED_WRONG_CONTENT",
    reason: "Wrong content detected for target HTE: source page \"Snoeischaar Bypass PG 20 kopen\" does not contain expected models and matched negative content patterns.",
    requested_url: "https://www.stihl.nl/nl/p/hoogsnoeiers-elektrische-hoogsnoeier-hte-60-1089"
  }),
});

export const UNVERIFIED_FAMILY_PREFIXES = Object.freeze([
  "AB",
  "AD",
  "AHK",
  "AL",
  "AP",
  "AR",
  "ASA",
  "AZ",
  "BC",
  "BE",
  "BM",
  "BRA",
  "BT",
  "CRANKCASE",
  "EC",
  "ES",
  "FC",
  "FE",
  "FG",
  "FH",
  "FW",
  "GA",
  "GE",
  "GEGARDEN",
  "GH",
  "GHE",
  "GS",
  "GTA",
  "HA",
  "HB",
  "HEL",
  "HTE",
  "K",
  "KG",
  "KGA",
  "KW",
  "LA",
  "LB",
  "LE",
  "LSG",
  "MA",
  "MB",
  "MC",
  "ME",
  "MH",
  "MI",
  "MM",
  "MT",
  "MVC",
  "MVP",
  "NG",
  "P",
  "RB",
  "RE",
  "REA",
  "RGA",
  "RL",
  "RM",
  "RMA",
  "RME",
  "RMI",
  "RT",
  "SE",
  "SEA",
  "SG",
  "SP",
  "TE",
  "VH"
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
 *   5. Official semantically verified STIHL family rule (FAMILY_RULE)
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

  // Precedence 5: Official semantically verified STIHL family rule
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
    disabled_families: Object.keys(DISABLED_FAMILY_RULES),
    unverified_families: [...UNVERIFIED_FAMILY_PREFIXES]
  };
}

export const ModelFamilyDriveRegistry = Object.freeze({
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  DISABLED_FAMILY_RULES,
  UNVERIFIED_FAMILY_PREFIXES,
  isAttachmentDesignation,
  isPoweredModelDesignation,
  parseModelFamily,
  getFamilyRule,
  resolveDriveType,
  getDriveResolutionMetadata,
  getRegistryStats
});
