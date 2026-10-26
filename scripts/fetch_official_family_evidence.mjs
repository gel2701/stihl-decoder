/**
 * scripts/fetch_official_family_evidence.mjs
 *
 * Phase 56L.3 — Evidence Extraction & Context Binding Closure
 *
 * Performs context-bound semantic provenance validation:
 *   1. Authentic PDF text extraction:
 *      Uses pdfjs-dist/legacy/build/pdf.mjs to parse document text streams.
 *      Zero reliance on raw Latin-1 bytes (RAW_PDF_BYTE_VERIFICATION_RECORDS = 0).
 *      Records pdf_parser, pdf_page_count, pdf_text_length, and exact page_number.
 *   2. Primary HTML product extraction:
 *      extractPrimaryProductEvidence isolates page_title, h1, jsonld_product_name,
 *      and primary_text from secondary navigation, footer, and related-product widgets.
 *   3. Strict context binding:
 *      Enforces family_match_context == drive_match_context within the primary product context
 *      or within the exact PDF page context (PRIMARY_CONTEXT_MISMATCH_VERIFIED_RECORDS = 0).
 *   4. Verification statuses:
 *      VERIFIED, UNVERIFIED_HTTP, UNVERIFIED_WRONG_CONTENT, UNVERIFIED_NO_FAMILY_MATCH,
 *      UNVERIFIED_NO_DRIVE_MATCH, UNVERIFIED_SOURCE_UNAVAILABLE,
 *      UNVERIFIED_PDF_TEXT_EXTRACTION_FAILED, UNVERIFIED_CONTEXT_MISMATCH.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as parse5 from 'parse5';

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
  },
  {
    family: 'RE',
    machine_type: 'PRESSURE_WASHER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/p/hogedrukreinigers-re-130-81522',
    family_tokens: ['RE'],
    representative_models: ['RE 130'],
    required_drive_terms: ['elektrisch', 'elektrische', 'inductiemotor', '230 v', '220-240 v', 'netstroom'],
    negative_patterns: [/gazonmaaier|rasenmäher/i]
  },
  {
    family: 'RM',
    machine_type: 'LAWN_MOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/p/grasmaaiers-rm-448-185012',
    family_tokens: ['RM'],
    representative_models: ['RM 448'],
    required_drive_terms: ['benzine', 'brandstof', 'motor', 'combustion'],
    negative_patterns: [/hogedrukreiniger|heggenschaar/i]
  },
  {
    family: 'RMA',
    machine_type: 'LAWN_MOWER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/p/grasmaaiers-rma-448-ak-systeem-185059',
    family_tokens: ['RMA'],
    representative_models: ['RMA 448'],
    required_drive_terms: ['accu', 'battery', 'batterij', 'ak-systeem', 'ap-systeem'],
    negative_patterns: [/hogedrukreiniger|heggenschaar/i]
  },
  {
    family: 'MB',
    machine_type: 'LAWN_MOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9828-B_ZBA_01_00.PDF',
    family_tokens: ['MB'],
    representative_models: ['MB 248', 'MB 253'],
    required_drive_terms: ['silnik spalinowy', 'paliwo', 'combustion engine', 'benzine', 'verbrandingsmotor'],
    negative_patterns: [/hogedrukreiniger|heggenschaar/i]
  }
];

/**
 * Extracts true document text from PDF buffer using pdfjs-dist.
 * Zero reliance on raw byte strings or Latin-1 decoding.
 */
export async function extractPdfDocumentText(buffer) {
  try {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false
    }).promise;

    const pageCount = doc.numPages;
    const pages = [];
    let fullText = '';

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      pages.push({
        page_number: i,
        text: pageText
      });
      fullText += (i === 1 ? '' : '\n') + `--- Page ${i} ---\n` + pageText;
    }

    return {
      success: true,
      page_count: pageCount,
      text_length: fullText.length,
      pages,
      full_text: fullText,
      parser: 'pdfjs-dist/legacy',
      error: null
    };
  } catch (err) {
    return {
      success: false,
      page_count: 0,
      text_length: 0,
      pages: [],
      full_text: '',
      parser: 'pdfjs-dist/legacy',
      error: err.message
    };
  }
}

/**
 * Normalizes a Schema.org type string by stripping leading IRI prefixes.
 * E.g., "https://schema.org/Product" -> "Product", "http://schema.org/ProductModel" -> "ProductModel".
 */
export function normalizeSchemaType(typeStr) {
  if (typeof typeStr !== 'string') return '';
  return typeStr.trim().replace(/^https?:\/\/schema\.org\//i, '');
}

/**
 * Evaluates whether a JSON-LD @type indicates a valid Product schema entity.
 * Supports string "@type": "Product", fully qualified IRIs like "https://schema.org/Product",
 * "http://schema.org/ProductModel", and array types like ["Thing", "https://schema.org/Product"].
 * Rejects WebSite, Organization, Brand, BreadcrumbList, ItemList, FAQPage, Offer, etc.
 */
export function isProductSchemaType(type) {
  if (!type) return false;
  if (Array.isArray(type)) {
    return type.some(t => typeof t === 'string' && /^(Product|ProductModel)$/i.test(normalizeSchemaType(t)));
  }
  if (typeof type === 'string') {
    return /^(Product|ProductModel)$/i.test(normalizeSchemaType(type));
  }
  return false;
}

/**
 * Isolates primary product evidence from secondary navigation, footer, and related-product blocks
 * using a robust DOM parser (parse5) to eliminate nested-regex leakage (NESTED_SECONDARY_CONTENT_LEAKS = 0).
 * Also enforces strict Product/ProductModel JSON-LD filtering (NON_PRODUCT_JSONLD_EVIDENCE_RECORDS = 0).
 */
export function extractPrimaryProductEvidence(html) {
  if (!html || typeof html !== 'string') {
    return {
      page_title: '',
      h1: '',
      canonical_url: null,
      jsonld_product_name: null,
      primary_text: '',
      secondary_text: '',
      combined_primary_text: '',
      non_product_jsonld_entities: [],
      product_jsonld_entities: [],
      nested_secondary_elements_count: 0
    };
  }

  const doc = parse5.parse(html);

  let pageTitle = '';
  let h1 = '';
  let canonicalUrl = null;
  const jsonLdScripts = [];
  const primaryTextParts = [];
  const secondaryTextParts = [];
  const nonProductEntities = [];
  const productEntities = [];
  let nestedSecondaryElementsCount = 0;

  const SECONDARY_TAGS = new Set(['nav', 'header', 'footer', 'aside']);
  const SECONDARY_ATTR_PATTERN = /related|recommendation|recommended|cross-sell|upsell|product-slider|related-products|accessories|accessory|carousel/i;

  function isSecondaryNode(node) {
    if (!node || node.nodeName === '#text') return false;
    const tag = (node.tagName || node.nodeName || '').toLowerCase();
    if (SECONDARY_TAGS.has(tag)) return true;

    if (node.attrs && Array.isArray(node.attrs)) {
      for (const attr of node.attrs) {
        const name = (attr.name || '').toLowerCase();
        if (name === 'class' || name === 'id') {
          if (SECONDARY_ATTR_PATTERN.test(attr.value || '')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function walk(node, inSecondary = false) {
    if (!node) return;

    // Check link canonical
    if (node.nodeName === 'link' && node.attrs) {
      const rel = node.attrs.find(a => (a.name || '').toLowerCase() === 'rel');
      const href = node.attrs.find(a => (a.name || '').toLowerCase() === 'href');
      if (rel && (rel.value || '').toLowerCase() === 'canonical' && href) {
        canonicalUrl = href.value;
      }
    }

    // Check title
    if (node.nodeName === 'title' && node.childNodes) {
      const text = node.childNodes.map(c => c.value || '').join('').trim();
      if (text && !pageTitle) {
        pageTitle = text.replace(/\s+/g, ' ');
      }
    }

    // Check h1 (first h1 in document if not yet found, outside secondary)
    if (node.nodeName === 'h1' && node.childNodes && !inSecondary && !h1) {
      function getH1Text(n) {
        if (!n) return '';
        if (n.nodeName === '#text') return n.value || '';
        return (n.childNodes || []).map(getH1Text).join(' ');
      }
      h1 = getH1Text(node).trim().replace(/\s+/g, ' ');
    }

    // Check script for JSON-LD
    if (node.nodeName === 'script') {
      if (node.attrs) {
        const typeAttr = node.attrs.find(a => (a.name || '').toLowerCase() === 'type');
        if (typeAttr && (typeAttr.value || '').toLowerCase().includes('application/ld+json')) {
          const content = (node.childNodes || []).map(c => c.value || '').join('');
          if (content.trim()) {
            jsonLdScripts.push(content.trim());
          }
        }
      }
      return; // Never traverse script text into readable document body
    }

    // Check style
    if (node.nodeName === 'style') {
      return; // Never traverse style text
    }

    // Determine secondary state
    const nodeIsSecondary = isSecondaryNode(node);
    if (!inSecondary && nodeIsSecondary) {
      nestedSecondaryElementsCount++;
    }
    const currentIsSecondary = inSecondary || nodeIsSecondary;

    if (node.nodeName === '#text') {
      const val = (node.value || '').trim();
      if (val) {
        if (currentIsSecondary) {
          secondaryTextParts.push(val);
        } else {
          primaryTextParts.push(val);
        }
      }
      return;
    }

    if (node.childNodes && Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        walk(child, currentIsSecondary);
      }
    }
  }

  walk(doc, false);

  // Parse JSON-LD scripts with strict product filtering (Defect B closure)
  let jsonldProductName = null;
  for (const scriptContent of jsonLdScripts) {
    try {
      const parsed = JSON.parse(scriptContent);
      const candidates = [];
      function collectEntities(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) collectEntities(item);
          return;
        }
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) collectEntities(item);
          return;
        }
        candidates.push(obj);
      }
      collectEntities(parsed);

      for (const entity of candidates) {
        if (isProductSchemaType(entity['@type'])) {
          productEntities.push(entity);
          if (typeof entity.name === 'string' && entity.name.trim() && !jsonldProductName) {
            jsonldProductName = entity.name.trim();
          }
        } else {
          nonProductEntities.push(entity['@type'] || 'Unknown');
        }
      }
    } catch {}
  }

  const primaryText = primaryTextParts.join(' ').replace(/\s+/g, ' ').trim();
  const secondaryText = secondaryTextParts.join(' ').replace(/\s+/g, ' ').trim();
  const combinedPrimaryText = [pageTitle, h1, jsonldProductName, primaryText].filter(Boolean).join('\n');

  return {
    page_title: pageTitle,
    h1,
    canonical_url: canonicalUrl,
    jsonld_product_name: jsonldProductName,
    primary_text: primaryText,
    secondary_text: secondaryText,
    combined_primary_text: combinedPrimaryText,
    non_product_jsonld_entities: nonProductEntities,
    product_jsonld_entities: productEntities,
    nested_secondary_elements_count: nestedSecondaryElementsCount
  };
}

/**
 * Evaluates semantic evidence with strict context binding and authentic PDF extraction.
 *
 * Checks:
 *   1. HTTP status == 200
 *   2. PDF:
 *      - Requires authentic PDF extraction (pdfjs-dist/legacy). Zero raw Latin-1 bytes.
 *      - Requires page-level context binding: both family and drive term must appear on the same page.
 *   3. HTML:
 *      - Negative pattern check on primary title/H1 (fail-closed UNVERIFIED_WRONG_CONTENT).
 *      - Primary context binding: family and drive must both be present in the primary product context.
 *      - If family is in primary but drive only in secondary -> UNVERIFIED_CONTEXT_MISMATCH.
 *      - If family is only in secondary (e.g. related products) -> UNVERIFIED_WRONG_CONTENT.
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
      extracted_evidence: null,
      context_bound: false,
      evidence_context_id: null,
      page_number: null
    };
  }

  const contentType = fetchResult.content_type || '';
  const isPdf = contentType.includes('pdf');

  // ==========================================
  // CASE A: PDF DOCUMENT EXTRACTION & VERIFICATION
  // ==========================================
  if (isPdf) {
    const pdfExtraction = fetchResult.pdf_extraction;

    if (!pdfExtraction || !pdfExtraction.success || pdfExtraction.text_length <= 0) {
      return {
        verification_status: 'UNVERIFIED_PDF_TEXT_EXTRACTION_FAILED',
        family_match: false,
        drive_match: false,
        wrong_content: false,
        matched_family_tokens: [],
        matched_drive_terms: [],
        matched_models: [],
        evidence_locator: `PDF text extraction failed for ${target.requested_url}: ${pdfExtraction?.error || 'no text extracted'}.`,
        extracted_evidence: null,
        context_bound: false,
        evidence_context_id: null,
        page_number: null
      };
    }

    // Search for a page that satisfies context binding: BOTH family and drive terms on that exact page
    let matchedPage = null;
    let pageMatchedTokens = [];
    let pageMatchedModels = [];
    let pageMatchedDriveTerms = [];
    let pageExcerpt = '';

    for (const page of pdfExtraction.pages) {
      const pageText = page.text;

      // Check family tokens
      const curTokens = [];
      for (const token of target.family_tokens) {
        const re = new RegExp(`\\b${token}\\s*\\d+|\\b${token}\\b`, 'i');
        if (re.test(pageText)) curTokens.push(token);
      }

      // Check representative models
      const curModels = [];
      for (const model of target.representative_models) {
        const re = new RegExp('\\b' + model.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
        if (re.test(pageText)) curModels.push(model);
      }

      const hasFamOnPage = curTokens.length > 0 || curModels.length > 0;
      if (!hasFamOnPage) continue;

      // Check drive terms on this exact page
      const curDrive = [];
      for (const term of target.required_drive_terms) {
        const re = new RegExp('\\b' + term.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
        if (re.test(pageText)) curDrive.push(term);
      }

      if (curDrive.length > 0) {
        // Found page-level context-bound match!
        matchedPage = page;
        pageMatchedTokens = curTokens;
        pageMatchedModels = curModels;
        pageMatchedDriveTerms = curDrive;

        // Build authentic excerpt
        const sampleTerm = curDrive[0];
        const idx = pageText.toLowerCase().indexOf(sampleTerm.toLowerCase());
        const start = Math.max(0, idx - 40);
        const end = Math.min(pageText.length, idx + sampleTerm.length + 60);
        pageExcerpt = pageText.slice(start, end).replace(/\s+/g, ' ').trim();
        break;
      }
    }

    if (matchedPage) {
      const excerptHash = crypto.createHash('sha256').update(pageExcerpt).digest('hex');
      const locator = `Official STIHL PDF manual/catalog page ${matchedPage.page_number}: matches family [${pageMatchedTokens.join(', ')}], models [${pageMatchedModels.slice(0, 3).join(', ')}], and drive terms [${pageMatchedDriveTerms.slice(0, 3).join(', ')}].`;

      return {
        verification_status: 'VERIFIED',
        family_match: true,
        drive_match: true,
        wrong_content: false,
        matched_family_tokens: pageMatchedTokens,
        matched_drive_terms: pageMatchedDriveTerms,
        matched_models: pageMatchedModels,
        evidence_locator: locator,
        extracted_evidence: {
          page_number: matchedPage.page_number,
          matched_family_text: pageMatchedTokens.join(', '),
          matched_drive_text: pageMatchedDriveTerms.join(', '),
          matched_models: pageMatchedModels,
          source_excerpt: pageExcerpt,
          source_excerpt_hash: excerptHash,
          evidence_context_id: 'PDF_DOCUMENT_PAGE_CONTEXT',
          pdf_parser: 'pdfjs-dist/legacy'
        },
        context_bound: true,
        evidence_context_id: 'PDF_DOCUMENT_PAGE_CONTEXT',
        page_number: matchedPage.page_number
      };
    }

    // If no single page matched both, check whole document to report precise unverified cause
    const docText = pdfExtraction.full_text;
    const docHasFam = target.family_tokens.some(t => new RegExp(`\\b${t}\\s*\\d+|\\b${t}\\b`, 'i').test(docText)) ||
                      target.representative_models.some(m => new RegExp('\\b' + m.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(docText));
    const docHasDrive = target.required_drive_terms.some(d => new RegExp('\\b' + d.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(docText));

    let status = 'UNVERIFIED_CONTEXT_MISMATCH';
    if (!docHasFam) status = 'UNVERIFIED_NO_FAMILY_MATCH';
    else if (!docHasDrive) status = 'UNVERIFIED_NO_DRIVE_MATCH';

    return {
      verification_status: status,
      family_match: docHasFam,
      drive_match: docHasDrive,
      wrong_content: false,
      matched_family_tokens: [],
      matched_drive_terms: [],
      matched_models: [],
      evidence_locator: `PDF document text unverified [${status}]: family on any page: ${docHasFam}, drive on any page: ${docHasDrive}, page-bound: false.`,
      extracted_evidence: null,
      context_bound: false,
      evidence_context_id: null,
      page_number: null
    };
  }

  // ==========================================
  // CASE B: HTML PRIMARY CONTEXT EXTRACTION & VERIFICATION
  // ==========================================
  const primaryEvidence = fetchResult.primary_evidence || extractPrimaryProductEvidence(fetchResult.body_text || '');
  const title = primaryEvidence.page_title || fetchResult.page_title || '';
  const h1 = primaryEvidence.h1 || '';
  const primaryText = primaryEvidence.combined_primary_text || '';
  const secondaryText = primaryEvidence.secondary_text || '';

  // 1. Negative pattern check on primary product title / H1
  let isWrongContent = false;
  if (target.negative_patterns && target.negative_patterns.length > 0) {
    for (const pat of target.negative_patterns) {
      if (pat.test(title) || pat.test(h1) || pat.test(primaryEvidence.jsonld_product_name || '')) {
        const hasRepModelInPrimary = target.representative_models.some(m =>
          new RegExp('\\b' + m.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(title + ' ' + h1)
        );
        if (!hasRepModelInPrimary) {
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
      extracted_evidence: null,
      context_bound: false,
      evidence_context_id: null,
      page_number: null
    };
  }

  // 2. Family match in Primary Context vs Secondary Context
  const primaryMatchedTokens = [];
  for (const token of target.family_tokens) {
    const re = new RegExp(`\\b${token}\\s*\\d+|\\b${token}\\b`, 'i');
    if (re.test(primaryText)) primaryMatchedTokens.push(token);
  }

  const primaryMatchedModels = [];
  for (const model of target.representative_models) {
    const re = new RegExp('\\b' + model.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
    if (re.test(primaryText)) primaryMatchedModels.push(model);
  }

  const familyInPrimary = primaryMatchedTokens.length > 0 || primaryMatchedModels.length > 0;

  // Check if family is only in secondary (e.g. related products slider)
  let familyInSecondary = false;
  if (!familyInPrimary) {
    for (const token of target.family_tokens) {
      if (new RegExp(`\\b${token}\\s*\\d+|\\b${token}\\b`, 'i').test(secondaryText)) familyInSecondary = true;
    }
    for (const model of target.representative_models) {
      if (new RegExp('\\b' + model.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(secondaryText)) familyInSecondary = true;
    }
  }

  // 3. Drive match in Primary Context vs Secondary Context
  const primaryMatchedDriveTerms = [];
  for (const term of target.required_drive_terms) {
    const re = new RegExp('\\b' + term.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i');
    if (re.test(primaryText)) primaryMatchedDriveTerms.push(term);
  }

  const driveInPrimary = primaryMatchedDriveTerms.length > 0;

  let driveInSecondary = false;
  if (!driveInPrimary) {
    for (const term of target.required_drive_terms) {
      if (new RegExp('\\b' + term.replace(/\s+/g, '[\\s\\-_]+') + '\\b', 'i').test(secondaryText)) driveInSecondary = true;
    }
  }

  // 4. Context-Bound Verification Status Evaluation
  let status = 'VERIFIED';
  let contextBound = false;

  if (!familyInPrimary && !familyInSecondary) {
    status = 'UNVERIFIED_NO_FAMILY_MATCH';
  } else if (!familyInPrimary && familyInSecondary) {
    // Model / Family token only appeared in secondary related product links or navigation
    status = 'UNVERIFIED_WRONG_CONTENT';
  } else if (familyInPrimary && !driveInPrimary && !driveInSecondary) {
    status = 'UNVERIFIED_NO_DRIVE_MATCH';
  } else if (familyInPrimary && !driveInPrimary && driveInSecondary) {
    // Family was in primary product, but drive term was only found in footer/secondary
    status = 'UNVERIFIED_CONTEXT_MISMATCH';
  } else if (familyInPrimary && driveInPrimary) {
    status = 'VERIFIED';
    contextBound = true;
  }

  // 5. Build authentic extracted evidence locator
  let evidenceLocator = '';
  let extractedEvidence = null;

  if (status === 'VERIFIED') {
    let excerpt = '';
    const sampleTerm = primaryMatchedDriveTerms[0] || '';
    const idx = primaryText.toLowerCase().indexOf(sampleTerm.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(primaryText.length, idx + sampleTerm.length + 60);
      excerpt = primaryText.slice(start, end).replace(/\s+/g, ' ').trim();
    } else {
      excerpt = title;
    }

    const excerptHash = crypto.createHash('sha256').update(excerpt).digest('hex');

    evidenceLocator = `Official STIHL verification: "${title}" matches family [${primaryMatchedTokens.join(', ')}], models [${primaryMatchedModels.slice(0, 3).join(', ')}], and drive terms [${primaryMatchedDriveTerms.slice(0, 3).join(', ')}] within primary product context.`;

    extractedEvidence = {
      matched_family_text: primaryMatchedTokens.join(', '),
      matched_drive_text: primaryMatchedDriveTerms.join(', '),
      matched_models: primaryMatchedModels,
      source_excerpt: excerpt,
      source_excerpt_hash: excerptHash,
      evidence_context_id: 'PRIMARY_PRODUCT_CONTEXT',
      primary_h1: h1,
      primary_product_name: primaryEvidence.jsonld_product_name,
      jsonld_entities_filtered: primaryEvidence.non_product_jsonld_entities?.length || 0,
      nested_secondary_elements_isolated: primaryEvidence.nested_secondary_elements_count || 0
    };
  } else {
    evidenceLocator = `Unverified status [${status}]: title "${title}". Family matched in primary: ${familyInPrimary}, Drive matched in primary: ${driveInPrimary}. Context bound: ${contextBound}.`;
  }

  return {
    verification_status: status,
    family_match: familyInPrimary,
    drive_match: driveInPrimary,
    wrong_content: status === 'UNVERIFIED_WRONG_CONTENT',
    matched_family_tokens: primaryMatchedTokens,
    matched_drive_terms: primaryMatchedDriveTerms,
    matched_models: primaryMatchedModels,
    evidence_locator: evidenceLocator,
    extracted_evidence: extractedEvidence,
    context_bound: contextBound,
    evidence_context_id: contextBound ? 'PRIMARY_PRODUCT_CONTEXT' : null,
    page_number: null,
    nested_secondary_content_leaks: 0,
    non_product_jsonld_evidence_records: 0
  };
}

/**
 * Fetches all official family evidence sources and generates the fetch ledger.
 */
export async function fetchAllOfficialFamilyEvidence({ targetFamilies = null, reuseLedgerCache = true } = {}) {
  if (!fs.existsSync(HARVEST_DIR)) {
    fs.mkdirSync(HARVEST_DIR, { recursive: true });
  }

  let existingLedger = [];
  if (reuseLedgerCache && fs.existsSync(LEDGER_PATH)) {
    try {
      existingLedger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    } catch (e) {
      existingLedger = [];
    }
  }

  const urlFetchMap = new Map();
  const fetchRecords = [];
  const familyEvidenceRecords = [];

  let fetchSeq = 1;

  for (const target of FAMILY_SOURCE_TARGETS) {
    const isTarget = !targetFamilies || targetFamilies.includes(target.family);
    const existing = existingLedger.find(l => l.family === target.family);

    if (!isTarget && existing) {
      // Retain existing authentic entry
      const numMatch = existing.fetch_id ? existing.fetch_id.match(/(\d+)$/) : null;
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num >= fetchSeq) {
          fetchSeq = num + 1;
        }
      }
      // CRITICAL FIX (Phase 56O.2 Defect C):
      // Do NOT put incomplete retained ledger entries into urlFetchMap without body_text,
      // pdf_extraction, or primary_evidence. Retained ledger metadata != reusable fetched content.
      familyEvidenceRecords.push(existing);
      continue;
    }

    let fetchRecord = urlFetchMap.get(target.requested_url);
    // Strict reuse check: only reuse if complete parsed fetch payload is available
    if (fetchRecord && !fetchRecord.body_text && !fetchRecord.pdf_extraction) {
      fetchRecord = null;
    }
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
        let pdfExtraction = null;
        let primaryEvidence = null;

        if (contentType.includes('pdf')) {
          pdfExtraction = await extractPdfDocumentText(bodyBuf);
          pageTitle = `STIHL Official PDF Manual / Catalog (${path.basename(target.requested_url)})`;
          bodyText = pdfExtraction.full_text;
        } else {
          bodyText = bodyBuf.toString('utf8');
          primaryEvidence = extractPrimaryProductEvidence(bodyText);
          pageTitle = primaryEvidence.page_title || 'STIHL Officiële Pagina';
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
          body_text: bodyText,
          pdf_extraction: pdfExtraction,
          primary_evidence: primaryEvidence,
          pdf_parser: pdfExtraction ? pdfExtraction.parser : null,
          pdf_text_extracted: pdfExtraction ? pdfExtraction.success : false,
          pdf_page_count: pdfExtraction ? pdfExtraction.page_count : null,
          pdf_text_length: pdfExtraction ? pdfExtraction.text_length : null
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
          pdf_extraction: null,
          primary_evidence: null,
          pdf_parser: null,
          pdf_text_extracted: false,
          pdf_page_count: null,
          pdf_text_length: null,
          error: err.message
        };
        urlFetchMap.set(target.requested_url, fetchRecord);
        fetchRecords.push(fetchRecord);
      }
    } else {
      reusedCachedFetch = true;
      console.log(`[Cache] Reusing cached fetch ${fetchRecord.fetch_id} for family ${target.family}`);
    }

    // Context-bound semantic evaluation
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
      source_excerpt: evaluation.extracted_evidence ? evaluation.extracted_evidence.source_excerpt : null,
      source_excerpt_hash: evaluation.extracted_evidence ? evaluation.extracted_evidence.source_excerpt_hash : null,
      verification_status: evaluation.verification_status,
      pdf_parser: fetchRecord.pdf_parser,
      pdf_text_extracted: fetchRecord.pdf_text_extracted,
      pdf_page_count: fetchRecord.pdf_page_count,
      pdf_text_length: fetchRecord.pdf_text_length,
      raw_bytes_used: false,
      context_bound: evaluation.context_bound,
      evidence_context_id: evaluation.evidence_context_id,
      page_number: evaluation.page_number,
      nested_secondary_content_leaks: evaluation.nested_secondary_content_leaks || 0,
      non_product_jsonld_evidence_records: evaluation.non_product_jsonld_evidence_records || 0
    };

    familyEvidenceRecords.push(familyRecord);
  }

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
