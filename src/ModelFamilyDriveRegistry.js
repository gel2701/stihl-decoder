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
    evidence_locator: "Official STIHL verification: \"MS 151 C-E en MS 151 TC-E benzinekettingzaag kopen\" matches family [MS], models [MS 151], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MS"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["MS 151"],
    retrieval_started_at: "2026-10-25T17:19:34.010Z",
    retrieved_at: "2026-10-25T17:19:39.415Z",
    body_sha256: "a46b9fac6f9ce6c5b5080ed9939a0b295451b591535c517a041b4a714c8f1a65",
    body_bytes: 191790,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"MS","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["MS 151"],"source_excerpt":"MS 151 C-E en MS 151 TC-E benzinekettingzaag kopen MS 151 MS 151 C-E en MS 151 TC-E benzineke","source_excerpt_hash":"e0ba66932ecb955d52dd2e6c8b936b8b4949d3ad6491b6d2096de197139cec26","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"MS 151","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"MSA 60 C accukettingzaag kopen\" matches family [MSA], models [MSA 60], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MSA"],
    matched_drive_terms: ["accu"],
    matched_models: ["MSA 60"],
    retrieval_started_at: "2026-10-25T17:19:39.506Z",
    retrieved_at: "2026-10-25T17:19:45.005Z",
    body_sha256: "e3208e68d3385efdcb0e4e36eb152c9d96d90532b16595fc68abfed61380e85c",
    body_bytes: 203414,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"MSA","matched_drive_text":"accu","matched_models":["MSA 60"],"source_excerpt":"MSA 60 C accukettingzaag kopen MSA 60 - AK systeem MSA 60 C accukettingza","source_excerpt_hash":"a84a5403085ef4a9b6a82c782476e36c770b68654f13dd217e662d10cb0d8f55","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"MSA 60 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"MSE 141 elektrische kettingzaag kopen\" matches family [MSE], models [MSE 141], and drive terms [elektrische, 230 v] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["MSE"],
    matched_drive_terms: ["elektrische","230 v"],
    matched_models: ["MSE 141"],
    retrieval_started_at: "2026-10-25T17:19:45.080Z",
    retrieved_at: "2026-10-25T17:19:50.595Z",
    body_sha256: "c34c48b6091e232eb0d059d1c8716b88b4d5943934b09910fd4f57a2128a41b9",
    body_bytes: 183488,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"MSE","matched_drive_text":"elektrische, 230 v","matched_models":["MSE 141"],"source_excerpt":"MSE 141 elektrische kettingzaag kopen MSE 141 MSE 141 elektrische kettingzaag k","source_excerpt_hash":"c87345b52d6eaf28df246cea18cd54ccfd7312e90f0ec1d527f8c39671d6ee54","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"MSE 141","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"FS 38 benzinegrastrimmer kopen\" matches family [FS], models [FS 38], and drive terms [benzine, brandstof] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FS"],
    matched_drive_terms: ["benzine","brandstof"],
    matched_models: ["FS 38"],
    retrieval_started_at: "2026-10-25T17:19:50.646Z",
    retrieved_at: "2026-10-25T17:19:55.539Z",
    body_sha256: "c1bd07b516c2e817f2beb95456b9b26ae2bee6314033f578094b4ef570fa7239",
    body_bytes: 173921,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"FS","matched_drive_text":"benzine, brandstof","matched_models":["FS 38"],"source_excerpt":"FS 38 benzinegrastrimmer kopen FS 38 FS 38 benzinegrastrimmer kopen Blijf","source_excerpt_hash":"93d91f070977152660ff0a3ac493f1947fa2a7ea92fdd97fbd10c1bc141444e2","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"FS 38","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"FSA 30 accukantenmaaier set kopen\" matches family [FSA], models [FSA 30], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FSA"],
    matched_drive_terms: ["accu"],
    matched_models: ["FSA 30"],
    retrieval_started_at: "2026-10-25T17:19:55.575Z",
    retrieved_at: "2026-10-25T17:19:55.597Z",
    body_sha256: "24b45553a131d5292be10b879b3d8ab8ff56314513173d23522448225dc1affc",
    body_bytes: 225898,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"FSA","matched_drive_text":"accu","matched_models":["FSA 30"],"source_excerpt":"FSA 30 accukantenmaaier set kopen FSA 30 - AS systeem FSA 30 accukanten","source_excerpt_hash":"c61ae7e4b3d59a3930ab5a0ea9d74ba9db5cfa18e1730d35e142af933fbdbe4e","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"FSA 30 - AS systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"FSE 52 elektrische grastrimmer kopen\" matches family [FSE], models [FSE 52], and drive terms [elektrische] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FSE"],
    matched_drive_terms: ["elektrische"],
    matched_models: ["FSE 52"],
    retrieval_started_at: "2026-10-25T17:19:55.640Z",
    retrieved_at: "2026-10-25T17:20:01.123Z",
    body_sha256: "4946c40f73382ea9a2cb80c7f3e388fefe56bdaf21a0b35ab1479ef74988d268",
    body_bytes: 176522,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"FSE","matched_drive_text":"elektrische","matched_models":["FSE 52"],"source_excerpt":"FSE 52 elektrische grastrimmer kopen FSE 52 FSE 52 elektrische grastrimmer kop","source_excerpt_hash":"50d88dda1a48cfd394bb2937d089244796844f737f209bbcad7c4f6e460aba80","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"FSE 52","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"FR 410 C-E ruggedragen benzinebosmaaier kopen\" matches family [FR], models [FR 410], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["FR"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["FR 410"],
    retrieval_started_at: "2026-10-25T17:20:01.155Z",
    retrieved_at: "2026-10-25T17:20:06.486Z",
    body_sha256: "cf34d88c9c7a6eafc2d79ddce7300b2a6fa2f9e8c9e66dcbc658d845a78e12a0",
    body_bytes: 201506,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"FR","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["FR 410"],"source_excerpt":"FR 410 C-E ruggedragen benzinebosmaaier kopen FR 410 FR 410 C-E ruggedragen benzinebosmaai","source_excerpt_hash":"c86b0e331b3906908382c2ecceda6a6f65aa5991431eca0d7182e4bd5cd8ef36","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"FR 410","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"TS 420 Gasoline Cut-off Machine\" matches family [TS], models [TS 420], and drive terms [gasoline] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["TS"],
    matched_drive_terms: ["gasoline"],
    matched_models: ["TS 420"],
    retrieval_started_at: "2026-10-25T17:20:06.528Z",
    retrieved_at: "2026-10-25T17:20:10.462Z",
    body_sha256: "20616c0522b7556e118f6aa12329ebdf89289a81c4dc394e0246b58a62230d03",
    body_bytes: 188842,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"TS","matched_drive_text":"gasoline","matched_models":["TS 420"],"source_excerpt":"TS 420 Gasoline Cut-off Machine TS 420 Gasoline Cut-off Machine TS 420 Gaso","source_excerpt_hash":"aba03dc6b49f14c0cb30b7b5813b64bb44dbee81e83b1fff859fd5963981dc18","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"TS 420 Gasoline Cut-off Machine","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":7},
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
    evidence_locator: "Official STIHL verification: \"TSA 230 accudoorslijper kopen\" matches family [TSA], models [TSA 230], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["TSA"],
    matched_drive_terms: ["accu"],
    matched_models: ["TSA 230"],
    retrieval_started_at: "2026-10-25T17:20:10.499Z",
    retrieved_at: "2026-10-25T17:20:18.210Z",
    body_sha256: "710660d649ac8891eef8463c6249e699cbea92b1cc69a0b832d69a415f715cb9",
    body_bytes: 208130,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"TSA","matched_drive_text":"accu","matched_models":["TSA 230"],"source_excerpt":"TSA 230 accudoorslijper kopen TSA 230 - ALLPRO systeem TSA 230 accudoors","source_excerpt_hash":"5fb4907aacccb624be3e2f462a4fc91a3ca1888dea0a31d4374f815600a850e1","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"TSA 230 - ALLPRO systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HS 45 benzineheggenschaar kopen\" matches family [HS], models [HS 45], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HS"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["HS 45"],
    retrieval_started_at: "2026-10-25T17:20:18.251Z",
    retrieved_at: "2026-10-25T17:20:25.544Z",
    body_sha256: "c6b24cace5a90129a73240ee58787390c11a35dd63da5c2833d5a48a5b0b66ff",
    body_bytes: 183922,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HS","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["HS 45"],"source_excerpt":"HS 45 benzineheggenschaar kopen HS 45 HS 45 benzineheggenschaar kopen Bli","source_excerpt_hash":"e36398027a0e8d1d54c3edc27ea78186b1822cef2af911c17d2209a9884b2165","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HS 45","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HSA 50 accuheggenschaar kopen\" matches family [HSA], models [HSA 50], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HSA"],
    matched_drive_terms: ["accu"],
    matched_models: ["HSA 50"],
    retrieval_started_at: "2026-10-25T17:20:25.571Z",
    retrieved_at: "2026-10-25T17:20:25.585Z",
    body_sha256: "4415945e8834e22939d39b66bdd3edfae885c85f1e57516fac6828e1308346d2",
    body_bytes: 201361,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HSA","matched_drive_text":"accu","matched_models":["HSA 50"],"source_excerpt":"HSA 50 accuheggenschaar kopen HSA 50 - AK systeem HSA 50 accuheggenscha","source_excerpt_hash":"88002ea9ed9aadcc6f749d2af35afbfcc9b7a087575e45c61e4a458f9b55f495","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HSA 50 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HSE 42 elektrische heggenschaar kopen\" matches family [HSE], models [HSE 42, HSE 52], and drive terms [elektrische] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HSE"],
    matched_drive_terms: ["elektrische"],
    matched_models: ["HSE 42","HSE 52"],
    retrieval_started_at: "2026-10-25T17:20:25.622Z",
    retrieved_at: "2026-10-25T17:20:29.287Z",
    body_sha256: "401e5fb6da14f0feae9c107ff3ebb6b812b8054ef25ca870767a8cfef12dea03",
    body_bytes: 177849,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HSE","matched_drive_text":"elektrische","matched_models":["HSE 42","HSE 52"],"source_excerpt":"HSE 42 elektrische heggenschaar kopen HSE 42 HSE 42 elektrische heggenschaar k","source_excerpt_hash":"ce13e82ab6e56cbeb06acf0e6c9972154ddb6648d580ff8af0b055ff2c1c58b8","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HSE 42","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HL 94 benzineheggenschaar op steel kopen\" matches family [HL], models [HL 94], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HL"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["HL 94"],
    retrieval_started_at: "2026-10-25T17:20:29.312Z",
    retrieved_at: "2026-10-25T17:20:35.618Z",
    body_sha256: "9e1601b9a8babcff0f9cbcd28acbfcaa33c768b85180b6bbf5662ede25aeed9c",
    body_bytes: 201551,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HL","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["HL 94"],"source_excerpt":"HL 94 benzineheggenschaar op steel kopen HL 94 HL 94 benzineheggenschaar","source_excerpt_hash":"f2b657c21e98a97e1fea78c78c98c419bc24401427a7190a489094cd2412d174","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HL 94","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HLA 56 accuheggenschaar op steel kopen\" matches family [HLA], models [HLA 56], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HLA"],
    matched_drive_terms: ["accu"],
    matched_models: ["HLA 56"],
    retrieval_started_at: "2026-10-25T17:20:35.676Z",
    retrieved_at: "2026-10-25T17:20:41.794Z",
    body_sha256: "06ec429f9a755daa525bd3abd7fbd5c88c443d63f6d33b5b8f59d207937e8c7d",
    body_bytes: 200600,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HLA","matched_drive_text":"accu","matched_models":["HLA 56"],"source_excerpt":"HLA 56 accuheggenschaar op steel kopen HLA 56 - AK systeem HLA 56 accuh","source_excerpt_hash":"577bd1c2aed47901d80b2b6e5512bcefeed273f0869e6cc22bf9eddb4e47f901","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HLA 56 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL PDF manual/catalog page 34: matches family [HLE], models [HLE 71, HLE 71 K], and drive terms [electric].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HLE"],
    matched_drive_terms: ["electric"],
    matched_models: ["HLE 71","HLE 71 K"],
    retrieval_started_at: "2026-10-25T17:20:41.824Z",
    retrieved_at: "2026-10-25T17:20:41.925Z",
    body_sha256: "1fbaae2ee52c2efa78da6110f75da5f80153dc45f94ad1ad7aaea4d0196ac471",
    body_bytes: 12492864,
    pdf_parser: "pdfjs-dist/legacy",
    pdf_text_extracted: true,
    pdf_page_count: 268,
    pdf_text_length: 705599,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PDF_DOCUMENT_PAGE_CONTEXT",
    page_number: 34,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"page_number":34,"matched_family_text":"HLE","matched_drive_text":"electric","matched_models":["HLE 71","HLE 71 K"],"source_excerpt":"pro‐ cedure and may be used to compare electric power tools. Depending on the type of usage, the vibrations","source_excerpt_hash":"4df0c6940b2287f1ceb08ec4cf386c2b11296e50e72e7da1f14e43f6768c35ae","evidence_context_id":"PDF_DOCUMENT_PAGE_CONTEXT","pdf_parser":"pdfjs-dist/legacy"},
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
    evidence_locator: "Official STIHL verification: \"HT 135 benzinehoogsnoeier kopen\" matches family [HT], models [HT 135], and drive terms [benzine, brandstof, 4-mix] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HT"],
    matched_drive_terms: ["benzine","brandstof","4-mix"],
    matched_models: ["HT 135"],
    retrieval_started_at: "2026-10-25T17:20:47.847Z",
    retrieved_at: "2026-10-25T17:20:53.606Z",
    body_sha256: "3a11920e9fe3613a2228edf72167b5a7ecc915b1cba2d6d6a0bdce2f0e882444",
    body_bytes: 184654,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HT","matched_drive_text":"benzine, brandstof, 4-mix","matched_models":["HT 135"],"source_excerpt":"HT 135 benzinehoogsnoeier kopen HT 135 HT 135 benzinehoogsnoeier kopen Bli","source_excerpt_hash":"fd22b7e536e7b82221d2e4bda1cd71bc4b4f8753b49806562b449bfab4360cdf","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HT 135","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"HTA 50 accuhoogsnoeier kopen\" matches family [HTA], models [HTA 50], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["HTA"],
    matched_drive_terms: ["accu"],
    matched_models: ["HTA 50"],
    retrieval_started_at: "2026-10-25T17:20:53.637Z",
    retrieved_at: "2026-10-25T17:21:00.539Z",
    body_sha256: "0059d55841d763db3be0d6c55633b3bf499e0afc28be44069dc094b87f2590f3",
    body_bytes: 194739,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"HTA","matched_drive_text":"accu","matched_models":["HTA 50"],"source_excerpt":"HTA 50 accuhoogsnoeier kopen HTA 50 - AK systeem HTA 50 accuhoogsnoeier","source_excerpt_hash":"9a627110432b31db641018bdc1484913bad92fbe50152bbe391d5e931b72c472","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"HTA 50 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"KM 56 RC-E benzinecombimotor kopen\" matches family [KM], models [KM 56], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["KM"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["KM 56"],
    retrieval_started_at: "2026-10-25T17:21:12.041Z",
    retrieved_at: "2026-10-25T17:21:18.363Z",
    body_sha256: "291e8398ecf2a11ff3c395a4cdc441d0cd980003ace5240118606edb0da8556f",
    body_bytes: 191887,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"KM","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["KM 56"],"source_excerpt":"KM 56 RC-E benzinecombimotor kopen KM 56 RC-E KM 56 RC-E benzinecombimotor kop","source_excerpt_hash":"96faa020a55955136deb13c3b998785427a0f635fe2bd2dd1a4b0a7424f9171e","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"KM 56 RC-E","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"Accucombimotor KMA 80 R kopen\" matches family [KMA], models [KMA 80], and drive terms [accu, batterij] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["KMA"],
    matched_drive_terms: ["accu","batterij"],
    matched_models: ["KMA 80"],
    retrieval_started_at: "2026-10-25T17:21:18.408Z",
    retrieved_at: "2026-10-25T17:21:24.525Z",
    body_sha256: "8ce7e8261f8b80ba40b5230c306e13cb0476f6bd7bcb5c91c5d28f62a245e373",
    body_bytes: 190479,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"KMA","matched_drive_text":"accu, batterij","matched_models":["KMA 80"],"source_excerpt":"Accucombimotor KMA 80 R kopen KMA 80 R - AK systeem Accucombimot","source_excerpt_hash":"394f1d5fa42c52786e0c7040fcbc5a667fc26f047819378f07232bf7fb3dca1b","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"KMA 80 R - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"BG 56 benzinebladblazer kopen\" matches family [BG], models [BG 56], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BG"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["BG 56"],
    retrieval_started_at: "2026-10-25T17:21:24.558Z",
    retrieved_at: "2026-10-25T17:21:27.850Z",
    body_sha256: "d2473e51cf37ac1104f78cc35ca60efa06d6c11f2d4de2b8fe623bf9bfb8c58c",
    body_bytes: 178201,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"BG","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["BG 56"],"source_excerpt":"BG 56 benzinebladblazer kopen BG 56 BG 56 benzinebladblazer kopen Blijf a","source_excerpt_hash":"f49f8b46677f0a0b86a93b06a54e5ca91b8a0dd9ca61c8e34d24d78d1700b66b","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"BG 56","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"BGA 60 accubladblazer kopen\" matches family [BGA], models [BGA 60], and drive terms [accu] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BGA"],
    matched_drive_terms: ["accu"],
    matched_models: ["BGA 60"],
    retrieval_started_at: "2026-10-25T17:21:27.892Z",
    retrieved_at: "2026-10-25T17:21:31.181Z",
    body_sha256: "8f578c6d7b846f162f59bfb3c4eae0039ce7d1cda1561225212aa08cfdb39a2b",
    body_bytes: 203574,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"BGA","matched_drive_text":"accu","matched_models":["BGA 60"],"source_excerpt":"BGA 60 accubladblazer kopen BGA 60 - AK systeem BGA 60 accubladblazer k","source_excerpt_hash":"04a0d2efcd2e2fbde003e10590aacc793fffa4db178d9737ca20db8d5cc826c8","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"BGA 60 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL PDF manual/catalog page 7: matches family [BGE], models [BGE 71, BGE 81], and drive terms [elektro].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BGE"],
    matched_drive_terms: ["elektro"],
    matched_models: ["BGE 71","BGE 81"],
    retrieval_started_at: "2026-10-25T17:21:31.242Z",
    retrieved_at: "2026-10-25T17:21:31.336Z",
    body_sha256: "ffb8176790386bb71b8f0aff3f906274de77a2832bc4f8d544ef8ed20a185e42",
    body_bytes: 8482483,
    pdf_parser: "pdfjs-dist/legacy",
    pdf_text_extracted: true,
    pdf_page_count: 248,
    pdf_text_length: 686066,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PDF_DOCUMENT_PAGE_CONTEXT",
    page_number: 7,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"page_number":7,"matched_family_text":"BGE","matched_drive_text":"elektro","matched_models":["BGE 71","BGE 81"],"source_excerpt":"rten Fachhändlern oder qualifi‐ zierten Elektro-Fachkräften ausgeführt wer‐ den, um Gefährdungen zu vermeid","source_excerpt_hash":"c62f191596ef838f772be24eccd363d2486f668fb8d8fbb6066c9e244abb56e9","evidence_context_id":"PDF_DOCUMENT_PAGE_CONTEXT","pdf_parser":"pdfjs-dist/legacy"},
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
    evidence_locator: "Official STIHL verification: \"BR 200 benzinebladblazer kopen\" matches family [BR], models [BR 200], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["BR"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["BR 200"],
    retrieval_started_at: "2026-10-25T17:21:35.914Z",
    retrieved_at: "2026-10-25T17:21:40.836Z",
    body_sha256: "54466f506d7664a6c6cef2d2c9e3c76dbe4bd8a8d102d3307ac5c3411b0d6247",
    body_bytes: 175286,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"BR","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["BR 200"],"source_excerpt":"BR 200 benzinebladblazer kopen BR 200 BR 200 benzinebladblazer kopen Blijf","source_excerpt_hash":"aab033d60cce70e0a3576bbf846968f02d5250457469935de9478bd2d19e38c2","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"BR 200","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"SH 56 benzinebladzuiger kopen\" matches family [SH], models [SH 56], and drive terms [benzine, brandstof, 2-takt] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SH"],
    matched_drive_terms: ["benzine","brandstof","2-takt","2-mix"],
    matched_models: ["SH 56"],
    retrieval_started_at: "2026-10-25T17:21:40.864Z",
    retrieved_at: "2026-10-25T17:21:46.729Z",
    body_sha256: "4be3c0418cf4674dc3aebaf51131dda1c268d77194706613d97cbcf738d74df7",
    body_bytes: 182409,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"SH","matched_drive_text":"benzine, brandstof, 2-takt, 2-mix","matched_models":["SH 56"],"source_excerpt":"SH 56 benzinebladzuiger kopen SH 56 SH 56 benzinebladzuiger kopen Blijf a","source_excerpt_hash":"fb1d700719e741ccbf17e0d9c982d131c407016e100e9495cf6e198220cb1201","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"SH 56","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL verification: \"SHA 56 accubladzuiger kopen\" matches family [SHA], models [SHA 56], and drive terms [accu, batterij] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SHA"],
    matched_drive_terms: ["accu","batterij"],
    matched_models: ["SHA 56"],
    retrieval_started_at: "2026-10-25T17:21:46.753Z",
    retrieved_at: "2026-10-25T17:21:50.612Z",
    body_sha256: "d6267657eddda3e5501b0ab965d3489447588534d7c4f03f83913536a9a43c76",
    body_bytes: 217533,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"SHA","matched_drive_text":"accu, batterij","matched_models":["SHA 56"],"source_excerpt":"SHA 56 accubladzuiger kopen SHA 56 - AK systeem SHA 56 accubladzuiger k","source_excerpt_hash":"05c20c0c02cad0e2f0cc342d117ba5e8ded67694143ed4fb776cef29ea357b3e","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"SHA 56 - AK systeem","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":9},
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
    evidence_locator: "Official STIHL PDF manual/catalog page 13: matches family [SHE], models [SHE 71, SHE 81], and drive terms [230 v].",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SHE"],
    matched_drive_terms: ["230 v"],
    matched_models: ["SHE 71","SHE 81"],
    retrieval_started_at: "2026-10-25T17:21:31.242Z",
    retrieved_at: "2026-10-25T17:21:31.336Z",
    body_sha256: "ffb8176790386bb71b8f0aff3f906274de77a2832bc4f8d544ef8ed20a185e42",
    body_bytes: 8482483,
    pdf_parser: "pdfjs-dist/legacy",
    pdf_text_extracted: true,
    pdf_page_count: 248,
    pdf_text_length: 686066,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PDF_DOCUMENT_PAGE_CONTEXT",
    page_number: 13,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"page_number":13,"matched_family_text":"SHE","matched_drive_text":"230 v","matched_models":["SHE 71","SHE 81"],"source_excerpt":"100 W Schutzklasse II E Ausführung 230 V Netzanschlussdaten 230 V, 50 Hz, 4,8 A Absicherung 10 A","source_excerpt_hash":"d4c9c26bfddd881f1bf25adeef3cf73317dc54baa4f344b6e96e277363bfc428","evidence_context_id":"PDF_DOCUMENT_PAGE_CONTEXT","pdf_parser":"pdfjs-dist/legacy"},
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
    evidence_locator: "Official STIHL verification: \"SR 450 Gasoline Backpack Sprayer\" matches family [SR], models [SR 450], and drive terms [gasoline] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["SR"],
    matched_drive_terms: ["gasoline"],
    matched_models: ["SR 450"],
    retrieval_started_at: "2026-10-25T17:21:50.659Z",
    retrieved_at: "2026-10-25T17:21:55.478Z",
    body_sha256: "19a2447b50cba6fa5ce79542c30fd8e03ad021edb733c4078052961da5a14513",
    body_bytes: 159651,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {"matched_family_text":"SR","matched_drive_text":"gasoline","matched_models":["SR 450"],"source_excerpt":"SR 450 Gasoline Backpack Sprayer SR 450 Gasoline Backpack Sprayer SR 450 Ga","source_excerpt_hash":"af7f687457ba74e0c17ef4a1e4aaad16cdcfa3a07df80a60a436f4397613dfc8","evidence_context_id":"PRIMARY_PRODUCT_CONTEXT","primary_h1":"","primary_product_name":"SR 450 Gasoline Backpack Sprayer","jsonld_entities_filtered":0,"nested_secondary_elements_isolated":7},
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  RE: Object.freeze({
    family: "RE",
    machine_type: "PRESSURE_WASHER",
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_028",
    requested_url: "https://www.stihl.nl/nl/p/hogedrukreinigers-re-130-81522",
    source_url: "https://www.stihl.nl/nl/p/hogedrukreinigers-re-130-81522",
    source_title: "RE 130 PLUS hogedrukreiniger kopen",
    evidence_locator: "Official STIHL verification: \"RE 130 PLUS hogedrukreiniger kopen\" matches family [RE], models [RE 130], and drive terms [elektrische, inductiemotor, 220-240 v] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["RE"],
    matched_drive_terms: ["elektrische", "inductiemotor", "220-240 v"],
    matched_models: ["RE 130"],
    retrieval_started_at: "2026-10-26T05:42:41.014Z",
    retrieved_at: "2026-10-26T05:42:46.433Z",
    body_sha256: "bb312ab038f1f0366e48906a75fb16df91d8ec522a27b76108226ecef7a280aa",
    body_bytes: 217318,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {
      matched_family_text: "RE",
      matched_drive_text: "elektrische, inductiemotor, 220-240 v",
      matched_models: ["RE 130"],
      source_excerpt: "aken uitvoeren met je STIHL RE 130 PLUS elektrische hogedrukreiniger. Service en advies GEBRUIKSAANWIJZING Hier",
      source_excerpt_hash: "6fc4f7956e4123e330e89c725f18e91730907ee24b8d49ae864070cb75051363",
      evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
      primary_h1: "",
      primary_product_name: "RE 130",
      secondary_pdf_catalog_url: "https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf",
      secondary_pdf_page: 161,
      secondary_pdf_sha256: "406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162"
    },
    source_excerpt: "aken uitvoeren met je STIHL RE 130 PLUS elektrische hogedrukreiniger. Service en advies GEBRUIKSAANWIJZING Hier",
    source_excerpt_hash: "6fc4f7956e4123e330e89c725f18e91730907ee24b8d49ae864070cb75051363",
    supported_generations: Object.freeze(['1xx']),
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  RM: Object.freeze({
    family: "RM",
    machine_type: "LAWN_MOWER",
    drive_type: DRIVE_TYPES.PETROL,
    display: DISPLAY_LABELS.PETROL,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_029",
    requested_url: "https://www.stihl.nl/nl/p/grasmaaiers-rm-448-185012",
    source_url: "https://www.stihl.nl/nl/p/grasmaaiers-rm-448-185012",
    source_title: "RM 448 T benzinegrasmaaier kopen",
    evidence_locator: "Official STIHL verification: \"RM 448 T benzinegrasmaaier kopen\" matches family [RM], models [RM 448], and drive terms [benzine, motor] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["RM"],
    matched_drive_terms: ["benzine", "motor"],
    matched_models: ["RM 448"],
    retrieval_started_at: "2026-10-26T05:42:46.532Z",
    retrieved_at: "2026-10-26T05:42:51.408Z",
    body_sha256: "0859432bfc193b32503a27a51d75ea724f54c5d955ff1cfe37e2fd1d539da729",
    body_bytes: 193518,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {
      matched_family_text: "RM",
      matched_drive_text: "benzine, motor",
      matched_models: ["RM 448"],
      source_excerpt: "RM 448 T benzinegrasmaaier kopen RM 448 RM 448 T benzinegrasmaaier kopen Bli",
      source_excerpt_hash: "c91a8a04fec64d25ae98ec4350ae8f0e909a21cafb3b89cb07031e8a01470a15",
      evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
      primary_h1: "",
      primary_product_name: "RM 448",
      secondary_pdf_catalog_url: "https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf",
      secondary_pdf_page: 107,
      secondary_pdf_sha256: "406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162",
      service_kit_manual_doc: "0458-007-0049"
    },
    source_excerpt: "RM 448 T benzinegrasmaaier kopen RM 448 RM 448 T benzinegrasmaaier kopen Bli",
    source_excerpt_hash: "c91a8a04fec64d25ae98ec4350ae8f0e909a21cafb3b89cb07031e8a01470a15",
    status: 'ACTIVE',
    confidence: 'HIGH'
  }),
  RMA: Object.freeze({
    family: "RMA",
    machine_type: "LAWN_MOWER",
    drive_type: DRIVE_TYPES.BATTERY,
    display: DISPLAY_LABELS.BATTERY,
    source_type: 'OFFICIAL_STIHL_FAMILY_EVIDENCE',
    fetch_id: "fetch_stihl_family_030",
    requested_url: "https://www.stihl.nl/nl/p/grasmaaiers-rma-448-ak-systeem-185059",
    source_url: "https://www.stihl.nl/nl/p/grasmaaiers-rma-448-ak-systeem-185059",
    source_title: "RMA 448 V accugrasmaaier kopen",
    evidence_locator: "Official STIHL verification: \"RMA 448 V accugrasmaaier kopen\" matches family [RMA], models [RMA 448], and drive terms [accu, batterij] within primary product context.",
    family_match: true,
    drive_match: true,
    matched_family_tokens: ["RMA"],
    matched_drive_terms: ["accu", "batterij"],
    matched_models: ["RMA 448"],
    retrieval_started_at: "2026-10-26T05:42:51.477Z",
    retrieved_at: "2026-10-26T05:42:56.156Z",
    body_sha256: "029075bc0de0f7bc8ccfdd15f669c664efb8684f04de1022d55230c0efc5075f",
    body_bytes: 209081,
    pdf_parser: null,
    pdf_text_extracted: false,
    pdf_page_count: null,
    pdf_text_length: null,
    raw_bytes_used: false,
    context_bound: true,
    evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0,
    extracted_evidence: {
      matched_family_text: "RMA",
      matched_drive_text: "accu, batterij",
      matched_models: ["RMA 448"],
      source_excerpt: "RMA 448 V accugrasmaaier kopen RMA 448 - AK systeem RMA 448 V accugrasmaai",
      source_excerpt_hash: "ee59bfc343b1bb036a08d87d25751369dba09196bfc20fb30e8ef0208981d258",
      evidence_context_id: "PRIMARY_PRODUCT_CONTEXT",
      primary_h1: "",
      primary_product_name: "RMA 448 - AK systeem",
      secondary_pdf_catalog_url: "https://www.stihl.co.uk/content/dam/stihl/vu/gb/en/download-files/pdf-files/STIHL_GB_Product_Catalogue_2023.pdf",
      secondary_pdf_page: 108,
      secondary_pdf_sha256: "406ce31aa5607699cfdea2714dc4e1c454ae569eb1dfc1c48a529d8d8d47a162"
    },
    source_excerpt: "RMA 448 V accugrasmaaier kopen RMA 448 - AK systeem RMA 448 V accugrasmaai",
    source_excerpt_hash: "ee59bfc343b1bb036a08d87d25751369dba09196bfc20fb30e8ef0208981d258",
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
  "REA",
  "RGA",
  "RL",
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
import {
  MACHINE_ELIGIBILITY,
  isAttachmentDesignation,
  resolveMachineEligibility,
  isPoweredMachine,
  isUnpoweredAttachment,
  isNonMachineNoise,
  EXACT_NON_MACHINE_ACCESSORIES,
  EXACT_REPLACEMENT_PARTS
} from './ModelMachineEligibilityRegistry.js';

export {
  MACHINE_ELIGIBILITY,
  isAttachmentDesignation,
  resolveMachineEligibility,
  isPoweredMachine,
  isUnpoweredAttachment,
  isNonMachineNoise,
  EXACT_NON_MACHINE_ACCESSORIES,
  EXACT_REPLACEMENT_PARTS
};

export function isPoweredModelDesignation(modelInput) {
  return resolveMachineEligibility(modelInput).eligibility === MACHINE_ELIGIBILITY.POWERED_MACHINE;
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
 * Exact-model drive evidence registry for standalone powered machinery
 * supported by official STIHL documentation (Phase 56N.1).
 */
export const EXACT_POWERED_MODELS = Object.freeze({
  'HOS Sharpeners': Object.freeze({
    model_name: 'HOS Sharpeners',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    resolution: 'EXPLICIT_MODEL',
    source_type: 'OFFICIAL_STIHL_ARCHIVED_DOCUMENT',
    confidence: 'HIGH',
    evidence_document: 'hosmanual.pdf',
    evidence_excerpt: 'Type:   Single-phase AC, squirrel-cage motor Operating voltage:   230 V Frequency:   50 Hz Rated current:   1.3 A Power rating:   0.18 kW Motor speed:   2,800 RPM Type of protection: IP 54 (DIN 40050)',
    notes: 'Official STIHL HOS instruction manual (0458-522-0121) archived document (Common Crawl WARC capture of cdnassets.stihlusa.com/1625859444-hosmanual.pdf): single-phase AC motor, operating voltage 230 V, power rating 0.18 kW, motor speed 2,800 RPM.'
  }),
  'USG Sharpeners': Object.freeze({
    model_name: 'USG Sharpeners',
    drive_type: DRIVE_TYPES.MAINS_ELECTRIC,
    display: DISPLAY_LABELS.MAINS_ELECTRIC,
    resolution: 'EXPLICIT_MODEL',
    source_type: 'OFFICIAL_STIHL_MODEL_DOCUMENT',
    confidence: 'HIGH',
    evidence_document: 'USG_Manual.pdf',
    evidence_excerpt: '21   Specifications  21.1   Motor (230 V)  Type:   Single-phase AC, squir‐ rel cage motor Voltage:   230 V Frequency:   50 Hz Rated current:   1.1 A Power consumption:   180 W Motor speed:   2,800 rpm Weight   8.8 kg Type of protection   I',
    notes: 'Official STIHL USG instruction manual (0458-523-0121-A) specifications: single-phase AC motor, operating voltage 230 V, rated current 1.1 A, power consumption 180 W, motor speed 2,800 rpm.'
  })
});

/**
 * Resolves the drive type of a model with strict precedence:
 *   1. Attachment safety gate (ATTACHMENT_NOT_POWERED)
 *   2. Canonical explicit evidence extraction
 *   3. Conflict detection between explicit evidence and verified family rule (CONFLICT_QUARANTINED)
 *   4. Explicit model evidence (EXPLICIT_MODEL)
 *   5. Official semantically verified STIHL family rule (FAMILY_RULE)
 *   6. Fail-closed UNKNOWN ('Niet vastgesteld')
 */
export function resolveDriveType(modelInput, options = {}) {
  const { exactModels = true, excludeFamilies = null } = options;
  const eligibilityInfo = resolveMachineEligibility(modelInput);

  // Precedence 1A: Attachment safety gate (Unpowered KombiTools / MultiTools)
  if (eligibilityInfo.eligibility === MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT) {
    return {
      drive_type: DRIVE_TYPES.UNKNOWN,
      display: DISPLAY_LABELS.UNKNOWN,
      resolution: 'ATTACHMENT_NOT_POWERED',
      eligibility: MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT,
      family: null,
      source_type: 'ATTACHMENT_SAFETY_GATE',
      confidence: 'HIGH',
      notes: 'Unpowered tool or attachment designation. Contains no independent engine/motor.'
    };
  }

  // Precedence 1B: Non-machine accessories (Mowing heads, carrying systems, adapters)
  if (eligibilityInfo.eligibility === MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY) {
    return {
      drive_type: DRIVE_TYPES.UNKNOWN,
      display: DISPLAY_LABELS.UNKNOWN,
      resolution: 'NON_MACHINE_ACCESSORY',
      eligibility: MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY,
      family: null,
      source_type: 'MACHINE_ELIGIBILITY_GATE',
      confidence: 'HIGH',
      notes: eligibilityInfo.reason
    };
  }

  // Precedence 1C: Replacement parts cataloged as models (gaskets, starter ropes, skirts)
  if (eligibilityInfo.eligibility === MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL) {
    return {
      drive_type: DRIVE_TYPES.UNKNOWN,
      display: DISPLAY_LABELS.UNKNOWN,
      resolution: 'REPLACEMENT_PART_AS_MODEL',
      eligibility: MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL,
      family: null,
      source_type: 'MACHINE_ELIGIBILITY_GATE',
      confidence: 'HIGH',
      notes: eligibilityInfo.reason
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

  const rawModelStr = extractModelString(modelInput);
  const normalizedModelName = rawModelStr ? rawModelStr.trim() : '';

  // Precedence 2A: Exact model drive evidence (Official STIHL documentation, e.g. HOS, USG)
  if (exactModels && normalizedModelName && EXACT_POWERED_MODELS[normalizedModelName]) {
    const exact = EXACT_POWERED_MODELS[normalizedModelName];
    if (explicitDriveType && explicitDriveType !== exact.drive_type) {
      return {
        drive_type: DRIVE_TYPES.UNKNOWN,
        display: DISPLAY_LABELS.UNKNOWN,
        resolution: 'CONFLICT_QUARANTINED',
        family: null,
        explicit_value: explicitDriveType,
        exact_value: exact.drive_type,
        source_type: 'QUARANTINED_CONFLICT',
        confidence: 'NONE',
        notes: `Explicit model evidence (${rawSourceBasis}) conflicts with verified STIHL exact model evidence (${exact.drive_type}). Quarantined without unsafe override.`
      };
    }
    return {
      drive_type: exact.drive_type,
      display: exact.display,
      resolution: exact.resolution,
      family: null,
      source_type: exact.source_type,
      confidence: exact.confidence,
      notes: exact.notes
    };
  }

  const family = parseModelFamily(modelInput);
  const rule = family && (!excludeFamilies || !excludeFamilies.includes(family)) ? OFFICIAL_STIHL_FAMILY_RULES[family] : null;

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
    if (Array.isArray(rule.supported_generations)) {
      const numMatch = normalizedModelName.match(/\d+/);
      const grp = numMatch ? numMatch[0].slice(0, 1) + 'xx' : 'other';
      if (!rule.supported_generations.includes(grp)) {
        return {
          drive_type: DRIVE_TYPES.UNKNOWN,
          display: DISPLAY_LABELS.UNKNOWN,
          resolution: 'UNSUPPORTED_GENERATION',
          family: rule.family,
          generation_group: grp,
          source_type: null,
          confidence: 'NONE'
        };
      }
    }
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

export function getDriveResolutionMetadata(modelInput, options = {}) {
  const modelStr = extractModelString(modelInput);
  const isAttachment = isAttachmentDesignation(modelInput);
  const family = parseModelFamily(modelInput);
  const rule = family ? OFFICIAL_STIHL_FAMILY_RULES[family] || null : null;
  const resolution = resolveDriveType(modelInput, options);

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
  EXACT_POWERED_MODELS,
  isAttachmentDesignation,
  isPoweredModelDesignation,
  parseModelFamily,
  getFamilyRule,
  resolveDriveType,
  getDriveResolutionMetadata,
  getRegistryStats
});
