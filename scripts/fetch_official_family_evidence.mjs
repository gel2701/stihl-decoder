/**
 * scripts/fetch_official_family_evidence.mjs
 *
 * Phase 56L.2 — Semantic STIHL Family Evidence Acquisition & Verification
 *
 * Performs semantic provenance validation:
 *   1. Fetches authentic official STIHL sources (HTML product pages & official PDF manuals/catalogs).
 *   2. Strict evidence contract per family: family tokens, representative models, required drive terms,
 *      and negative mismatch checks (false positive prevention).
 *   3. Real extracted evidence locator (matched tokens, matched models, drive terms, excerpt, and excerpt hash).
 *   4. Clean distinction between HTTP fetch records and family evidence records.
 *   5. Robust cache reuse without impossible timestamp orders (fetch_started_at <= fetch_completed_at).
 *   6. Verification statuses: VERIFIED, UNVERIFIED_HTTP, UNVERIFIED_WRONG_CONTENT,
 *      UNVERIFIED_NO_FAMILY_MATCH, UNVERIFIED_NO_DRIVE_MATCH, UNVERIFIED_SOURCE_UNAVAILABLE.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARVEST_DIR = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l');
const LEDGER_PATH = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');

// Explicit semantic evidence contract for all 28 active candidates
export const FAMILY_SOURCE_TARGETS = [
  {
    family: 'MS',
    machine_type: 'CHAINSAW',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/kettingzagen-motorzagen-ms-151-102583',
    family_tokens: ['MS'],
    representative_models: ['MS 151', 'MS 211', 'MS 250', 'MS 261'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix', 'tweetakt'],
    negative_patterns: [/gazonmaaier|rasenmäher|zitmaaier|hakselaar|versnipperaar/i]
  },
  {
    family: 'MSA',
    machine_type: 'CHAINSAW',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/kettingzagen-motorzagen-msa-60-ak-systeem-164117',
    family_tokens: ['MSA'],
    representative_models: ['MSA 60', 'MSA 120', 'MSA 140', 'MSA 160', 'MSA 200', 'MSA 220', 'MSA 300'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'lithium', 'ak-systeem', 'ap-systeem', 'as-systeem', 'cordless'],
    negative_patterns: [/gazonmaaier|rasenmäher|zitmaaier|hakselaar|versnipperaar/i]
  },
  {
    family: 'MSE',
    machine_type: 'CHAINSAW',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/p/kettingzagen-motorzagen-mse-141-76267',
    family_tokens: ['MSE'],
    representative_models: ['MSE 141', 'MSE 170', 'MSE 190', 'MSE 210', 'MSE 230'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v', 'corded'],
    negative_patterns: [/gazonmaaier|rasenmäher|zitmaaier|RM\s*2|RT\s*5097/i]
  },
  {
    family: 'FS',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fs-38-628',
    family_tokens: ['FS'],
    representative_models: ['FS 38', 'FS 40', 'FS 55', 'FS 56', 'FS 91'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix', '4-mix', 'tweetakt'],
    negative_patterns: [/hakselaar|versnipperaar|häcksler|GHE\s*250|RM\s*2/i]
  },
  {
    family: 'FSA',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fsa-30-as-systeem-186896',
    family_tokens: ['FSA'],
    representative_models: ['FSA 30', 'FSA 45', 'FSA 57', 'FSA 60', 'FSA 120'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'lithium', 'ak-systeem', 'ap-systeem', 'as-systeem'],
    negative_patterns: [/hakselaar|versnipperaar|RM\s*2/i]
  },
  {
    family: 'FSE',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fse-52-2624',
    family_tokens: ['FSE'],
    representative_models: ['FSE 52', 'FSE 60', 'FSE 71', 'FSE 81'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: [/veegmachine|kehrmaschine|RM\s*2/i]
  },
  {
    family: 'FR',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/grastrimmers-kantenmaaiers-bosmaaiers-fr-410-1022177',
    family_tokens: ['FR'],
    representative_models: ['FR 410', 'FR 460', 'FR 131'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix', '4-mix'],
    negative_patterns: [/hakselaar|versnipperaar|GHE\s*250/i]
  },
  {
    family: 'TS',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihlusa.com/products/cut-off-machines/professional-cut-off-machines/ts420/',
    family_tokens: ['TS'],
    representative_models: ['TS 410', 'TS 420', 'TS 500i', 'TS 700', 'TS 800'],
    required_drive_terms: ['gasoline', 'benzine', 'combustion', '2-stroke', '2-takt', '2-mix'],
    negative_patterns: [/lawn\s*mower|rasenmäher/i]
  },
  {
    family: 'TSA',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/doorslijpers-bandenzagen-tsa-230-ap-systeem-209755',
    family_tokens: ['TSA'],
    representative_models: ['TSA 230', 'TSA 300'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'lithium', 'ap-systeem'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'HS',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hs-45-12832',
    family_tokens: ['HS'],
    representative_models: ['HS 45', 'HS 82', 'HS 87'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix'],
    negative_patterns: [/drukspuit|nevelspuit|spritze/i]
  },
  {
    family: 'HSA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hsa-50-ak-systeem-183477',
    family_tokens: ['HSA'],
    representative_models: ['HSA 26', 'HSA 30', 'HSA 40', 'HSA 50', 'HSA 60', 'HSA 100', 'HSA 130'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem', 'as-systeem'],
    negative_patterns: [/RT\s*5097|zitmaaier|aufsitzmäher/i]
  },
  {
    family: 'HSE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hse-42-2508',
    family_tokens: ['HSE'],
    representative_models: ['HSE 42', 'HSE 52', 'HSE 71', 'HSE 81'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: [/drukspuit|nevelspuit/i]
  },
  {
    family: 'HL',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hl-94-74075',
    family_tokens: ['HL'],
    representative_models: ['HL 91', 'HL 92', 'HL 94'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'HLA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/heggenscharen-en-heggenscharen-op-steel-hla-56-ak-systeem-93677',
    family_tokens: ['HLA'],
    representative_models: ['HLA 56', 'HLA 66', 'HLA 86', 'HLA 135'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem', 'as-systeem'],
    negative_patterns: [/hogedrukreiniger|hochdruckreiniger|RE\s*272/i]
  },
  {
    family: 'HLE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-277-9821-B_ZBA_02_01.pdf',
    family_tokens: ['HLE'],
    representative_models: ['HLE 71', 'HLE 71 K'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v', 'netzanschluss'],
    negative_patterns: [/telescoopstang\s*456/i]
  },
  {
    family: 'HT',
    machine_type: 'POLE_PRUNER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/hoogsnoeiers-ht-135-137521',
    family_tokens: ['HT'],
    representative_models: ['HT 103', 'HT 105', 'HT 131', 'HT 135'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '4-mix', '2-mix'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'HTA',
    machine_type: 'POLE_PRUNER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/hoogsnoeiers-hta-50-ak-systeem-144350',
    family_tokens: ['HTA'],
    representative_models: ['HTA 50', 'HTA 66', 'HTA 86', 'HTA 135'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'HTE',
    machine_type: 'POLE_PRUNER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/p/hoogsnoeiers-elektrische-hoogsnoeier-hte-60-1089',
    family_tokens: ['HTE'],
    representative_models: ['HTE 60'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: [/snoeischaar|bypass|PG\s*20/i]
  },
  {
    family: 'KM',
    machine_type: 'KOMBI',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/combisysteem-multisysteem-km-56-rc-e-1559',
    family_tokens: ['KM'],
    representative_models: ['KM 56', 'KM 94', 'KM 111', 'KM 131'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '4-mix', '2-mix'],
    negative_patterns: [/BGE\s*71|elektrische\s*bladblazer/i]
  },
  {
    family: 'KMA',
    machine_type: 'KOMBI',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/combisysteem-multisysteem-kma-80-r-ak-systeem-179890',
    family_tokens: ['KMA'],
    representative_models: ['KMA 80', 'KMA 130', 'KMA 135'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'BG',
    machine_type: 'BLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bg-56-2907',
    family_tokens: ['BG'],
    representative_models: ['BG 50', 'BG 56', 'BG 66', 'BG 86'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix'],
    negative_patterns: [/bosmaaier|grastrimmer|kantenmaaier/i]
  },
  {
    family: 'BGA',
    machine_type: 'BLOWER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-bga-60-ak-systeem-145802',
    family_tokens: ['BGA'],
    representative_models: ['BGA 45', 'BGA 57', 'BGA 60', 'BGA 86', 'BGA 100'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem', 'as-systeem'],
    negative_patterns: [/bezemrol|KW-MM|borstelrol/i]
  },
  {
    family: 'BGE',
    machine_type: 'BLOWER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf',
    family_tokens: ['BGE'],
    representative_models: ['BGE 61', 'BGE 71', 'BGE 81'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v', 'elektro'],
    negative_patterns: [/metallkanister|jerrycan/i]
  },
  {
    family: 'BR',
    machine_type: 'BLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-br-200-2661',
    family_tokens: ['BR'],
    representative_models: ['BR 200', 'BR 350', 'BR 430', 'BR 500', 'BR 600', 'BR 700', 'BR 800'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '4-mix', '2-mix'],
    negative_patterns: [/bosmaaier|grastrimmer|kantenmaaier/i]
  },
  {
    family: 'SH',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sh-56-2895',
    family_tokens: ['SH'],
    representative_models: ['SH 56', 'SH 86'],
    required_drive_terms: ['benzine', 'brandstof', 'combustion', 'gasoline', '2-takt', '2-mix'],
    negative_patterns: [/verticuteer|gazonbeluchter/i]
  },
  {
    family: 'SHA',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-sha-56-ak-systeem-137684',
    family_tokens: ['SHA'],
    representative_models: ['SHA 56'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem'],
    negative_patterns: [/verticuteer|gazonbeluchter/i]
  },
  {
    family: 'SHE',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0458-290-9821-F_ZBA_03_01.pdf',
    family_tokens: ['SHE'],
    representative_models: ['SHE 71', 'SHE 81'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v', 'elektro'],
    negative_patterns: [/draagtas\s*voor\s*motorzagen|sägebock/i]
  },
  {
    family: 'SR',
    machine_type: 'MISTBLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihlusa.com/products/sprayers/backpack-sprayers/sr450/',
    family_tokens: ['SR'],
    representative_models: ['SR 200', 'SR 430', 'SR 450'],
    required_drive_terms: ['gasoline', 'benzine', 'combustion', '2-stroke', '2-mix', '2-takt'],
    negative_patterns: [/pikhaak|sappie/i]
  }
];

/**
 * Evaluates semantic evidence on an acquired HTTP fetch response body.
 *
 * Checks:
 *   1. HTTP status == 200
 *   2. False positive prevention: negative patterns / wrong content
 *   3. Family presence: family tokens and/or representative models
 *   4. Drive presence: required drive terms (fuel, battery, mains electric)
 *
 * Returns structured semantic evaluation with verification status and extracted evidence.
 */
export function evaluateSemanticEvidence(target, fetchResult) {
  if (!fetchResult || fetchResult.http_status !== 200) {
    return {
      verification_status: fetchResult && fetchResult.http_status ? 'UNVERIFIED_HTTP' : 'UNVERIFIED_SOURCE_UNAVAILABLE',
      family_match: false,
      drive_match: false,
      wrong_content: false,
      matched_family_tokens: [],
      matched_drive_terms: [],
      matched_models: [],
      evidence_locator: 'Source fetch was not successful (HTTP ' + (fetchResult?.http_status || '0') + ').',
      extracted_evidence: null
    };
  }

  const title = fetchResult.page_title || '';
  const body = fetchResult.body_text || '';
  const combined = (title + '\n' + body);

  // 1. Negative pattern check (Wrong page / Redirected content)
  let isWrongContent = false;
  if (target.negative_patterns && target.negative_patterns.length > 0) {
    for (const pat of target.negative_patterns) {
      if (pat.test(title) || pat.test(body)) {
        // If it matches a negative pattern, check if ANY representative model is actually present
        const hasRepModel = target.representative_models.some(m => new RegExp('\\b' + m.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(combined));
        if (!hasRepModel) {
          isWrongContent = true;
          break;
        }
      }
    }
  }

  if (isWrongContent) {
    return {
      verification_status: 'UNVERIFIED_WRONG_CONTENT',
      family_match: false,
      drive_match: false,
      wrong_content: true,
      matched_family_tokens: [],
      matched_drive_terms: [],
      matched_models: [],
      evidence_locator: `Wrong content detected for target ${target.family}: source page "${title}" does not contain expected models and matched negative content patterns.`,
      extracted_evidence: null
    };
  }

  // 2. Family match
  const matchedTokens = [];
  for (const token of target.family_tokens) {
    // Word boundary check for family token or token + digits
    const re = new RegExp(`\\b${token}\\s*\\d+|\\b${token}\\b`, 'i');
    if (re.test(title) || re.test(body)) {
      matchedTokens.push(token);
    }
  }

  const matchedModels = [];
  for (const model of target.representative_models) {
    const re = new RegExp('\\b' + model.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
    if (re.test(title) || re.test(body)) {
      matchedModels.push(model);
    }
  }

  const hasFamilyMatch = matchedTokens.length > 0 || matchedModels.length > 0;

  // 3. Drive match
  const matchedDriveTerms = [];
  for (const term of target.required_drive_terms) {
    const re = new RegExp('\\b' + term.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
    if (re.test(title) || re.test(body)) {
      matchedDriveTerms.push(term);
    }
  }

  const hasDriveMatch = matchedDriveTerms.length > 0;

  // 4. Verification status
  let status = 'VERIFIED';
  if (!hasFamilyMatch) {
    status = 'UNVERIFIED_NO_FAMILY_MATCH';
  } else if (!hasDriveMatch) {
    status = 'UNVERIFIED_NO_DRIVE_MATCH';
  }

  // 5. Build authentic extracted evidence locator
  let evidenceLocator = '';
  let extractedEvidence = null;

  if (status === 'VERIFIED') {
    // Find representative excerpt
    let excerpt = '';
    const sampleTerm = matchedDriveTerms[0] || '';
    const idx = combined.toLowerCase().indexOf(sampleTerm.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(combined.length, idx + sampleTerm.length + 60);
      excerpt = combined.slice(start, end).replace(/\s+/g, ' ').trim();
    } else {
      excerpt = title;
    }

    const excerptHash = crypto.createHash('sha256').update(excerpt).digest('hex');

    evidenceLocator = `Official STIHL verification: "${title}" matches family [${matchedTokens.join(', ')}], models [${matchedModels.slice(0, 3).join(', ')}], and drive terms [${matchedDriveTerms.slice(0, 3).join(', ')}].`;

    extractedEvidence = {
      matched_family_text: matchedTokens.join(', '),
      matched_drive_text: matchedDriveTerms.join(', '),
      matched_models: matchedModels,
      source_excerpt: excerpt,
      source_excerpt_hash: excerptHash
    };
  } else {
    evidenceLocator = `Unverified status [${status}]: title "${title}". Family matched: ${hasFamilyMatch}, Drive matched: ${hasDriveMatch}.`;
  }

  return {
    verification_status: status,
    family_match: hasFamilyMatch,
    drive_match: hasDriveMatch,
    wrong_content: false,
    matched_family_tokens: matchedTokens,
    matched_drive_terms: matchedDriveTerms,
    matched_models: matchedModels,
    evidence_locator: evidenceLocator,
    extracted_evidence: extractedEvidence
  };
}

/**
 * Fetches all official family evidence sources and generates the fetch ledger.
 */
export async function fetchAllOfficialFamilyEvidence() {
  if (!fs.existsSync(HARVEST_DIR)) {
    fs.mkdirSync(HARVEST_DIR, { recursive: true });
  }

  const urlFetchMap = new Map();
  const fetchRecords = [];
  const familyEvidenceRecords = [];

  let fetchSeq = 1;

  for (const target of FAMILY_SOURCE_TARGETS) {
    let fetchRecord = urlFetchMap.get(target.requested_url);
    let reusedCachedFetch = false;

    if (!fetchRecord) {
      const fetchId = `fetch_stihl_family_${String(fetchSeq++).padStart(3, '0')}`;
      const startedAt = new Date().toISOString();

      try {
        console.log(`[Fetch] Fetching official source for family ${target.family}: ${target.requested_url}`);
        const res = await fetch(target.requested_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 STIHLDecoder-Evidence-Harvest/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.9'
          },
          redirect: 'follow'
        });

        const completedAt = new Date().toISOString();
        const buffer = await res.arrayBuffer();
        const bodyBuf = Buffer.from(buffer);
        const hash = crypto.createHash('sha256').update(bodyBuf).digest('hex');

        let contentType = res.headers.get('content-type') || 'text/html;charset=utf-8';
        let bodyText = '';
        let pageTitle = 'STIHL Officiële Bron';

        if (contentType.includes('pdf')) {
          bodyText = bodyBuf.toString('latin1');
          pageTitle = `STIHL Official PDF Manual / Catalog (${path.basename(target.requested_url)})`;
        } else {
          bodyText = bodyBuf.toString('utf8');
          const titleMatch = bodyText.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1].trim()) {
            pageTitle = titleMatch[1].trim().replace(/\s+/g, ' ');
          }
        }

        fetchRecord = {
          fetch_id: fetchId,
          requested_url: target.requested_url,
          final_url: res.url || target.requested_url,
          http_status: res.status,
          content_type: contentType,
          page_title: pageTitle,
          fetch_started_at: startedAt,
          fetch_completed_at: completedAt,
          body_sha256: hash,
          body_bytes: bodyBuf.length,
          body_text: bodyText
        };

        urlFetchMap.set(target.requested_url, fetchRecord);
        fetchRecords.push(fetchRecord);
      } catch (err) {
        console.error(`[Error] Fetch failed for ${target.requested_url}:`, err.message);
        const completedAt = new Date().toISOString();
        fetchRecord = {
          fetch_id: fetchId,
          requested_url: target.requested_url,
          final_url: target.requested_url,
          http_status: 0,
          content_type: null,
          page_title: 'Fetch Error: ' + err.message,
          fetch_started_at: startedAt,
          fetch_completed_at: completedAt,
          body_sha256: null,
          body_bytes: 0,
          body_text: '',
          error: err.message
        };
        urlFetchMap.set(target.requested_url, fetchRecord);
        fetchRecords.push(fetchRecord);
      }
    } else {
      reusedCachedFetch = true;
      console.log(`[Cache] Reusing cached fetch ${fetchRecord.fetch_id} for family ${target.family}`);
    }

    // Semantic evaluation
    const evaluation = evaluateSemanticEvidence(target, fetchRecord);

    const familyRecord = {
      family: target.family,
      machine_type: target.machine_type,
      drive_type: target.drive_type,
      display: target.display,
      fetch_id: fetchRecord.fetch_id,
      reused_cached_fetch: reusedCachedFetch,
      requested_url: target.requested_url,
      final_url: fetchRecord.final_url,
      http_status: fetchRecord.http_status,
      content_type: fetchRecord.content_type,
      page_title: fetchRecord.page_title,
      source_title: fetchRecord.page_title,
      fetch_started_at: fetchRecord.fetch_started_at,
      retrieval_started_at: fetchRecord.fetch_started_at,
      retrieved_at: fetchRecord.fetch_completed_at,
      fetch_completed_at: fetchRecord.fetch_completed_at,
      body_sha256: fetchRecord.body_sha256,
      body_bytes: fetchRecord.body_bytes,
      family_match: evaluation.family_match,
      drive_match: evaluation.drive_match,
      wrong_content: evaluation.wrong_content,
      matched_family_tokens: evaluation.matched_family_tokens,
      matched_drive_terms: evaluation.matched_drive_terms,
      matched_models: evaluation.matched_models,
      evidence_locator: evaluation.evidence_locator,
      extracted_evidence: evaluation.extracted_evidence,
      verification_status: evaluation.verification_status
    };

    familyEvidenceRecords.push(familyRecord);
  }

  // Strip large body_text from disk output to keep repository lean
  const cleanFetchRecords = fetchRecords.map(({ body_text, ...rest }) => rest);

  const ledgerPayload = {
    phase: 'PHASE_56L.2',
    timestamp: new Date().toISOString(),
    unique_fetches_count: cleanFetchRecords.length,
    family_evidence_count: familyEvidenceRecords.length,
    fetches: cleanFetchRecords,
    family_evidence: familyEvidenceRecords,
    // Provide array root for backward-compatibility with ledger loaders expecting an array
    entries: familyEvidenceRecords
  };

  // Save the full ledger; also allow JSON array iteration if needed
  // We can add Symbol.iterator or write entries as top level array with metadata properties,
  // or write familyEvidenceRecords with fetch references.
  // To preserve backwards-compatibility with `JSON.parse(...)` expecting an array:
  const arrayWithMeta = [...familyEvidenceRecords];
  arrayWithMeta.__meta = {
    fetches: cleanFetchRecords,
    unique_fetches: cleanFetchRecords.length
  };

  fs.writeFileSync(LEDGER_PATH, JSON.stringify(familyEvidenceRecords, null, 2), 'utf8');
  console.log(`[Ledger] Saved ${familyEvidenceRecords.length} entries to ${LEDGER_PATH}`);

  return familyEvidenceRecords;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAllOfficialFamilyEvidence().then((ledger) => {
    const verified = ledger.filter(l => l.verification_status === 'VERIFIED').length;
    const disabled = ledger.filter(l => l.verification_status !== 'VERIFIED').length;
    console.log(`[Done] Semantic verification complete: ${verified} VERIFIED, ${disabled} DISABLED / UNVERIFIED`);
  });
}
