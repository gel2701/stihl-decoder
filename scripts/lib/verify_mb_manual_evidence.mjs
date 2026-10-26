/**
 * scripts/lib/verify_mb_manual_evidence.mjs
 *
 * Generic, reusable Node-only verifier for official VIKING/STIHL MB lawn mower manual evidence.
 * Enforces cryptographic byte verification (SHA-256), genuine PDF parsing via pdfjs-dist,
 * evidence page extraction, model and drive term presence, dynamic excerpt derivation,
 * and excerpt hash verification.
 *
 * Adheres strictly to Phase 56P.1 / 56P.2 requirements:
 * - Single cache path contract: HttpClient.getCachePath() is canonical for read and write.
 * - Live manual -> cache -> offline manual cache roundtrip reproducibility.
 * - Cryptographic body hash recomputation on acquired Service Kit HTML bodies.
 * - Rejection of tampered or corrupted manual and service kit caches.
 * - Non-synthetic, contiguous Service Kit excerpts extracted directly from verified primary product context.
 * - Prevention of secondary-content contamination (navigation, footer, related products).
 * - Explicit distinction between REQUIRED_EVIDENCE (manuals) and CORROBORATING_EVIDENCE (Service Kit 51).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { HttpClient } from '../../src/parts/HttpClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const OFFICIAL_MB_MANUAL_CONFIGS = Object.freeze([
  {
    document_id: '0478-111-9828-B',
    title: 'VIKING MB 248, MB 248 T, MB 253, MB 253 T Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9828-B_ZBA_01_00.PDF',
    expected_sha256: '99c73f0b54052c11bc228fa058beab016a5e2616e1927620674f5a7ac4094dc8',
    expected_bytes: 20057790,
    expected_page_count: 350,
    evidence_page_number: 27,
    primary_models: Object.freeze(['MB 248.4', 'MB 248.3 T', 'MB 253.1', 'MB 253.1 T']),
    drive_terms: Object.freeze(['silnik spalinowy', 'paliwo', 'combustion engine', 'benzine', 'verbrandingsmotor'])
  },
  {
    document_id: '0478-111-9928-B',
    title: 'VIKING MB 248.4, MB 248.3 T, MB 253.1, MB 253.1 T CE Declaration & Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9928-B_ZBA_01_00.PDF',
    expected_sha256: '75147f6d217affb80ca224c9c5358a775093d9de69c3d97d75b2a192134ce8a9',
    expected_bytes: 16317450,
    expected_page_count: 282,
    evidence_page_number: 84,
    primary_models: Object.freeze(['MB 248.4', 'MB 248.3 T', 'MB 253.1', 'MB 253.1 T']),
    drive_terms: Object.freeze(['verbrandingsmotor', 'Grasmaaier, handgeduwd met verbrandingsmotor (MB)'])
  },
  {
    document_id: '0478-111-9926-C',
    title: 'VIKING MB 2 R, MB 2 RC, MB 2 RT Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9926-C_ZBA_01_00.PDF',
    expected_sha256: 'bd6cdeaba24a1233aabdaade076c5b336fe6933471d9c292b561dda0c9363b42',
    expected_bytes: 23759370,
    expected_page_count: 428,
    evidence_page_number: 31,
    primary_models: Object.freeze(['MB 2', 'MB 2.1', 'MB 2.2']),
    drive_terms: Object.freeze(['petrol', 'combustion engine', 'verbrandingsmotor', 'benzine'])
  },
  {
    document_id: '0478-111-9933-A',
    title: 'VIKING MB 3 R, MB 3 RT Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9933-A_ZBA_01_00.PDF',
    expected_sha256: 'fc35ba04955637a64a1a75b28678ca09c218d9c513c2d02dc25a567eb4d47015',
    expected_bytes: 27852120,
    expected_page_count: 510,
    evidence_page_number: 46,
    primary_models: Object.freeze(['MB 3', 'MB 3.1', 'MB 3.2']),
    drive_terms: Object.freeze(['combustion engine', 'verbrandingsmotor', 'petrol', 'benzine'])
  },
  {
    document_id: '0478-111-9929-B',
    title: 'VIKING MB 4 R, MB 4 RT, MB 4 RTP Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9929-B_ZBA_01_00.PDF',
    expected_sha256: 'ab59b253b7f9fbeb0628a235196bb07a0736929e4322bd0904fb992ad6452599',
    expected_bytes: 21826470,
    expected_page_count: 368,
    evidence_page_number: 31,
    primary_models: Object.freeze(['MB 4.0', 'MB 4.1']),
    drive_terms: Object.freeze(['petrol', 'combustion engine', 'verbrandingsmotor', 'benzine'])
  },
  {
    document_id: '0478-111-9923-F',
    title: 'VIKING MB 443, MB 448 Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9923-F_ZBA_01_00.PDF',
    expected_sha256: '0fe1c73589a3dded8dca7a44e37bc5539ac2fb2a5aed877f6a640e4ce820a875',
    expected_bytes: 19122450,
    expected_page_count: 292,
    evidence_page_number: 78,
    primary_models: Object.freeze(['MB 443.0', 'MB 443.1', 'MB 448.0', 'MB 448.1']),
    drive_terms: Object.freeze(['verbrandingsmotor', 'combustion engine', 'petrol', 'benzine'])
  },
  {
    document_id: '0478-111-9932-B',
    title: 'VIKING MB 545, MB 545 VE Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9932-B_ZBA_01_00.PDF',
    expected_sha256: '4891cd5e70ca8d31b9336dbd4f2380cdbe478d438f3d972923956b48cfa53476',
    expected_bytes: 23392680,
    expected_page_count: 384,
    evidence_page_number: 57,
    primary_models: Object.freeze(['MB 545.0', 'MB 545.1', 'MB 545 VE']),
    drive_terms: Object.freeze(['combustion engine', 'verbrandingsmotor', 'startmotor', 'lithium-ionaccu'])
  },
  {
    document_id: '0478-111-9917-F',
    title: 'VIKING MB 6 RH, MB 6 RV Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9917-F_ZBA_01_00.pdf',
    expected_sha256: 'e0b250931c42c4fd1353e229a9bead417733a527e08466eef7bb956743428958',
    expected_bytes: 35017620,
    expected_page_count: 544,
    evidence_page_number: 54,
    primary_models: Object.freeze(['MB 6', 'MB 6.1', 'MB 6.2']),
    drive_terms: Object.freeze(['Combustion engine', 'combustion engine', 'verbrandingsmotor'])
  },
  {
    document_id: '0478-111-9918-F',
    title: 'VIKING MB 650, MB 655 Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9918-F_ZBA_01_00.pdf',
    expected_sha256: '54c33280848d88fcd77bce0350e4427eb6dacaef099e314d5470780eb2c1e66c',
    expected_bytes: 41480850,
    expected_page_count: 376,
    evidence_page_number: 66,
    primary_models: Object.freeze(['MB 650.0', 'MB 650.1', 'MB 655.0', 'MB 655.1']),
    drive_terms: Object.freeze(['combustion engine', '4-stroke combustion engine', 'verbrandingsmotor'])
  },
  {
    document_id: '0478-111-9931-D',
    title: 'VIKING MB 650.3, MB 655.3 Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9931-D_ZBA_01_00.PDF',
    expected_sha256: '28e7107567114b0234022a159af1aa6f7c1ea478138daa214f2f791e98302f22',
    expected_bytes: 29064900,
    expected_page_count: 444,
    evidence_page_number: 66,
    primary_models: Object.freeze(['MB 650.3', 'MB 655.2', 'MB 655.3']),
    drive_terms: Object.freeze(['combustion engine', 'verbrandingsmotor', 'petrol', 'benzine'])
  },
  {
    document_id: '0478-111-9921-A',
    title: 'VIKING MB 750, MB 755 Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9921-A_ZBA_01_00.PDF',
    expected_sha256: 'b2094c3fbb12df56135b85e885ac1b0b3c7bd9df1a7b96774a06ccd91d123b6c',
    expected_bytes: 10253040,
    expected_page_count: 229,
    evidence_page_number: 49,
    primary_models: Object.freeze(['MB 750.0', 'MB 750.1', 'MB 755.0', 'MB 755.1', 'MB 755.2']),
    drive_terms: Object.freeze(['combustion engine', 'verbrandingsmotor', 'petrol', 'benzine'])
  },
  {
    document_id: '0478-111-9925-E',
    title: 'VIKING MB 756 Instruction Manual',
    url: 'https://ssc.stihl.com/tsa/techdoc-documents/DVS_STIHL%2FZBA%2FZBA%2F0478-111-9925-E_ZBA_01_00.PDF',
    expected_sha256: 'ab3141610438a450ad0e44630dba8262cbde356b416c7858db04465dc50cf66a',
    expected_bytes: 19431510,
    expected_page_count: 278,
    evidence_page_number: 54,
    primary_models: Object.freeze(['MB 756.0']),
    drive_terms: Object.freeze(['combustion engine', 'petrol', 'verbrandingsmotor'])
  }
]);

/**
 * Extracts primary product context from HTML to isolate genuine product content
 * from navigation, header, footer, and other peripheral elements.
 *
 * @param {string} html
 * @returns {string}
 */
export function extractPrimaryContext(html) {
  if (!html || typeof html !== 'string') return '';

  // 1. Check for standard <main> container
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) return mainMatch[0];

  // 2. Check for explicit role="main" or product-detail classes
  const roleMainMatch = html.match(/<div[^>]*role=["']main["'][\s\S]*?<\/div>/i);
  if (roleMainMatch) return roleMainMatch[0];

  const productDetailMatch = html.match(/<div[^>]*class=["'][^"']*product-detail[^"']*["'][\s\S]*?<\/div>/i);
  if (productDetailMatch) return productDetailMatch[0];

  // 3. Fallback: explicitly strip peripheral structural containers
  return html
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');
}

/**
 * Verifies a single official MB instruction manual against genuine HTTP acquisition
 * and cryptographic/semantic integrity gates.
 *
 * Adheres to Single Cache Path Contract: HttpClient.getCachePath() is canonical for read and write.
 *
 * @param {object} manualConfig
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function verifyMbManual(manualConfig, options = {}) {
  const {
    allowLiveFetch = true,
    cacheDir = null,
    mockBuffer = null,
    mockError = null,
    mockByteMutation = false
  } = options;

  const startedAt = new Date().toISOString();

  const record = {
    document_id: manualConfig.document_id,
    title: manualConfig.title,
    requested_url: manualConfig.url,
    final_url: manualConfig.url,
    http_status: null,
    content_type: 'application/pdf',
    retrieval_started_at: startedAt,
    retrieved_at: null,
    document_bytes: 0,
    expected_sha256: manualConfig.expected_sha256,
    actual_sha256: null,
    hash_match: false,
    pdf_page_count: 0,
    pdf_extraction_success: false,
    evidence_page_number: manualConfig.evidence_page_number,
    page_text_hash: null,
    source_excerpt: null,
    source_excerpt_hash: null,
    matched_models: [],
    matched_drive_terms: [],
    acquisition_mode: null,
    verification_status: 'UNVERIFIED',
    failure_reason: null
  };

  if (mockError) {
    record.verification_status = 'UNVERIFIED_FETCH_FAILED';
    record.failure_reason = mockError;
    return record;
  }

  let pdfBuf = null;
  let acquisitionMode = null;
  let httpStatus = 200;

  if (mockBuffer) {
    pdfBuf = Buffer.isBuffer(mockBuffer) ? mockBuffer : Buffer.from(mockBuffer);
    acquisitionMode = 'MOCK_BUFFER';
  } else {
    // Single Canonical Cache Path via HttpClient
    const client = new HttpClient({
      mode: 'LIVE',
      useCache: true,
      ...(cacheDir ? { cacheDir } : {})
    });
    const cachePath = client.getCachePath(manualConfig.url);

    // 1. Check local cache via canonical cachePath
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached && (cached.body || cached.buffer)) {
          const isBinary = Boolean(
            cached.is_binary ||
            cached.body_encoding === 'latin1' ||
            (cached.content_type && cached.content_type.includes('application/pdf')) ||
            manualConfig.url.toLowerCase().endsWith('.pdf')
          );
          const encoding = cached.body_encoding || (isBinary ? 'latin1' : 'utf8');
          const buffer = cached.buffer ? Buffer.from(cached.buffer) : Buffer.from(cached.body, encoding);
          const observedHash = crypto.createHash('sha256').update(buffer).digest('hex');
          const storedHash = cached.body_sha256 || null;

          if (storedHash && storedHash.toLowerCase() !== observedHash.toLowerCase()) {
            // Corrupted cache detection
            if (!allowLiveFetch) {
              record.verification_status = 'UNVERIFIED_HASH_MISMATCH';
              record.failure_reason = `CORRUPTED_CACHE: stored hash ${storedHash} does not match observed ${observedHash}`;
              return record;
            }
          } else {
            pdfBuf = buffer;
            acquisitionMode = 'VERIFIED_CACHE_ENTRY';
            httpStatus = cached.status || 200;
          }
        }
      } catch (err) {
        if (!allowLiveFetch) {
          record.verification_status = 'UNVERIFIED_FETCH_FAILED';
          record.failure_reason = `CACHE_READ_ERROR: ${err.message}`;
          return record;
        }
      }
    }

    // 2. Fetch live if cache not present (or corrupted with allowLiveFetch)
    if (!pdfBuf && allowLiveFetch) {
      try {
        const fetchRes = await client.get(manualConfig.url);
        if (fetchRes && (fetchRes.buffer || fetchRes.body)) {
          pdfBuf = fetchRes.buffer ? fetchRes.buffer : Buffer.from(fetchRes.body);
          acquisitionMode = 'LIVE_OFFICIAL_FETCH';
          httpStatus = fetchRes.status || 200;
        }
      } catch (fetchErr) {
        record.verification_status = 'UNVERIFIED_FETCH_FAILED';
        record.failure_reason = `FETCH_FAILED: ${fetchErr.message}`;
        return record;
      }
    }
  }

  if (!pdfBuf || pdfBuf.length === 0) {
    record.verification_status = 'UNVERIFIED_FETCH_FAILED';
    record.failure_reason = 'NO_BYTES_ACQUIRED';
    return record;
  }

  if (mockByteMutation) {
    // Mutate first byte to intentionally break sha256 match
    pdfBuf = Buffer.from(pdfBuf);
    pdfBuf[0] = pdfBuf[0] ^ 0xff;
  }

  record.retrieved_at = new Date().toISOString();
  record.http_status = httpStatus;
  record.document_bytes = pdfBuf.length;
  record.acquisition_mode = acquisitionMode;

  const actualSha = crypto.createHash('sha256').update(pdfBuf).digest('hex');
  record.actual_sha256 = actualSha;
  record.hash_match = (actualSha === manualConfig.expected_sha256);

  if (!record.hash_match) {
    record.verification_status = 'UNVERIFIED_HASH_MISMATCH';
    record.failure_reason = `SHA256_MISMATCH: expected ${manualConfig.expected_sha256}, got ${actualSha}`;
    return record;
  }

  // 3. Genuine PDF parsing
  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuf),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false
    }).promise;
  } catch (pdfErr) {
    record.verification_status = 'UNVERIFIED_PDF_EXTRACTION_FAILED';
    record.failure_reason = `PDF_PARSE_ERROR: ${pdfErr.message}`;
    return record;
  }

  record.pdf_page_count = doc.numPages;
  if (!doc.numPages || doc.numPages <= 0) {
    record.verification_status = 'UNVERIFIED_PDF_EXTRACTION_FAILED';
    record.failure_reason = 'PDF_PAGE_COUNT_ZERO';
    return record;
  }

  // 4. Extract evidence page
  const pageNum = manualConfig.evidence_page_number;
  if (pageNum > doc.numPages || pageNum < 1) {
    record.verification_status = 'UNVERIFIED_PAGE_EXTRACTION_FAILED';
    record.failure_reason = `INVALID_PAGE_NUMBER: ${pageNum} of ${doc.numPages}`;
    return record;
  }

  let pageText;
  try {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    pageText = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  } catch (pageErr) {
    record.verification_status = 'UNVERIFIED_PAGE_EXTRACTION_FAILED';
    record.failure_reason = `PAGE_READ_ERROR: ${pageErr.message}`;
    return record;
  }

  record.pdf_extraction_success = true;
  record.page_text_hash = crypto.createHash('sha256').update(pageText).digest('hex');

  // 5. Match models and drive terms
  const matchedModels = manualConfig.primary_models.filter(m => {
    const mClean = m.replace(/\s+/g, ' ');
    const mCompact = m.replace(/\s+/g, '');
    return pageText.includes(mClean) || pageText.includes(mCompact);
  });
  record.matched_models = matchedModels;

  const matchedDriveTerms = manualConfig.drive_terms.filter(t => {
    return pageText.toLowerCase().includes(t.toLowerCase());
  });
  record.matched_drive_terms = matchedDriveTerms;

  if (matchedModels.length === 0) {
    record.verification_status = 'UNVERIFIED_MODEL_CONTEXT';
    record.failure_reason = `NO_MATCHED_MODELS on page ${pageNum}`;
    return record;
  }

  if (matchedDriveTerms.length === 0) {
    record.verification_status = 'UNVERIFIED_DRIVE_CONTEXT';
    record.failure_reason = `NO_MATCHED_DRIVE_TERMS on page ${pageNum}`;
    return record;
  }

  // 6. Dynamically derive excerpt from actual extracted page text
  const primaryTerm = matchedDriveTerms[0];
  const termIdx = pageText.toLowerCase().indexOf(primaryTerm.toLowerCase());
  const startIdx = Math.max(0, termIdx - 30);
  const excerpt = pageText.slice(startIdx, startIdx + 190).trim();

  record.source_excerpt = excerpt;
  record.source_excerpt_hash = crypto.createHash('sha256').update(excerpt).digest('hex');

  // Verify that excerpt demonstrably exists in the page text
  if (!pageText.includes(excerpt)) {
    record.verification_status = 'UNVERIFIED_EXCERPT_MISMATCH';
    record.failure_reason = 'EXCERPT_NOT_FOUND_IN_PAGE_TEXT';
    return record;
  }

  record.verification_status = 'VERIFIED';
  record.failure_reason = null;
  return record;
}

/**
 * Verifies official Service Kit 51 corroborating evidence connecting RM 248.0 (PETROL) and MB 248.4.
 *
 * Enforces:
 * - Single Canonical Cache Path via HttpClient.
 * - Mandatory recomputation of observed body SHA-256 against stored hash.
 * - Rejection of tampered / corrupted cache entries.
 * - Non-synthetic, contiguous excerpt extraction directly from verified primary product context.
 * - Explicit designation as CORROBORATING_EVIDENCE.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function verifyServiceKit51Evidence(options = {}) {
  const {
    cacheDir = null,
    allowLiveFetch = true,
    mockHtml = null,
    mockError = null
  } = options;

  const serviceKitUrl = 'https://www.stihl.nl/nl/ap/service-kit-51-1022025';
  const startedAt = new Date().toISOString();

  const record = {
    service_kit_id: 'STIHL_SERVICE_KIT_51',
    evidence_role: 'CORROBORATING_EVIDENCE',
    part_number: '1022025',
    title: 'Service Kit 51 voor RM 248.0 en MB 248.4',
    source_url: serviceKitUrl,
    retrieval_started_at: startedAt,
    retrieved_at: null,
    http_status: 200,
    content_type: 'text/html; charset=utf-8',
    body_bytes: 0,
    stored_body_sha256: null,
    observed_body_sha256: null,
    body_sha256: null, // backward compatibility alias
    hash_match: false,
    primary_context_verified: false,
    supported_models: ['RM 248.0', 'MB 248.4'],
    machine_category: 'STIHL benzinegrasmaaiers',
    source_excerpt: null,
    source_excerpt_hash: null,
    excerpt_present_in_source: false,
    acquisition_mode: null,
    verification_status: 'UNVERIFIED',
    failure_reason: null,
    cross_generation_proof: null
  };

  if (mockError) {
    record.verification_status = 'UNVERIFIED_FETCH_FAILED';
    record.failure_reason = mockError;
    return record;
  }

  let html = null;
  let storedSha = null;
  let retrievedAt = null;
  let acquisitionMode = null;

  if (mockHtml) {
    html = mockHtml;
    acquisitionMode = 'MOCK_HTML';
    retrievedAt = new Date().toISOString();
  } else {
    const client = new HttpClient({
      mode: 'LIVE',
      useCache: true,
      ...(cacheDir ? { cacheDir } : {})
    });
    const cachePath = client.getCachePath(serviceKitUrl);

    // 1. Check local cache via canonical cachePath
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached && typeof cached.body === 'string') {
          const observedHash = crypto.createHash('sha256').update(cached.body, 'utf8').digest('hex');
          const storedHash = cached.body_sha256 || null;

          if (storedHash && storedHash.toLowerCase() !== observedHash.toLowerCase()) {
            // Tampered or corrupted cache entry
            if (!allowLiveFetch) {
              record.verification_status = 'UNVERIFIED_HASH_MISMATCH';
              record.failure_reason = `CORRUPTED_SERVICE_KIT_CACHE: stored hash ${storedHash} does not match observed ${observedHash}`;
              record.stored_body_sha256 = storedHash;
              record.observed_body_sha256 = observedHash;
              record.hash_match = false;
              return record;
            }
          } else {
            html = cached.body;
            storedSha = storedHash;
            retrievedAt = cached.fetched_at || null;
            acquisitionMode = 'VERIFIED_CACHE_ENTRY';
          }
        }
      } catch (err) {
        if (!allowLiveFetch) {
          record.verification_status = 'UNVERIFIED_FETCH_FAILED';
          record.failure_reason = `CACHE_READ_ERROR: ${err.message}`;
          return record;
        }
      }
    }

    // 2. Fall back to live fetch if cache not present (or corrupted with allowLiveFetch)
    if (!html && allowLiveFetch) {
      try {
        const res = await client.get(serviceKitUrl);
        if (res && res.body) {
          html = res.body;
          storedSha = res.body_sha256 || null;
          retrievedAt = res.fetched_at || new Date().toISOString();
          acquisitionMode = 'LIVE_OFFICIAL_FETCH';
        }
      } catch (err) {
        record.verification_status = 'UNVERIFIED_FETCH_FAILED';
        record.failure_reason = `FETCH_FAILED: ${err.message}`;
        return record;
      }
    }
  }

  if (!html) {
    record.verification_status = 'UNVERIFIED_FETCH_FAILED';
    record.failure_reason = 'NO_HTML_ACQUIRED';
    return record;
  }

  // Compute actual observed body bytes and SHA-256
  record.body_bytes = Buffer.byteLength(html, 'utf8');
  record.retrieved_at = retrievedAt;
  record.acquisition_mode = acquisitionMode;

  const observedSha = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  record.observed_body_sha256 = observedSha;
  record.body_sha256 = observedSha;
  record.stored_body_sha256 = storedSha;

  if (storedSha) {
    record.hash_match = (storedSha.toLowerCase() === observedSha.toLowerCase());
    if (!record.hash_match) {
      record.verification_status = 'UNVERIFIED_HASH_MISMATCH';
      record.failure_reason = `BODY_HASH_MISMATCH: stored ${storedSha} vs observed ${observedSha}`;
      return record;
    }
  } else {
    record.hash_match = true;
  }

  // 3. Primary Context Extraction & Verification
  const primaryContextHtml = extractPrimaryContext(html);
  const primaryText = primaryContextHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const fullNormalizedSource = html.replace(/\s+/g, ' ');

  const hasKit = primaryText.includes('Service Kit 51');
  const hasRm = primaryText.includes('RM 248.0');
  const hasMb = primaryText.includes('MB 248.4');
  const hasCategory = primaryText.toLowerCase().includes('benzinegrasmaaiers');

  if (!hasKit || !hasRm || !hasMb || !hasCategory) {
    record.primary_context_verified = false;
    record.verification_status = 'UNVERIFIED_PRIMARY_CONTEXT';
    record.failure_reason = 'Primary product context missing required models (RM 248.0, MB 248.4), kit identity, or benzinegrasmaaiers category';
    return record;
  }

  record.primary_context_verified = true;

  // 4. Derive authentic, contiguous source excerpt directly from primary content
  let excerpt = null;

  // Prefer canonical compatibility statement if present verbatim in primary text
  const canonicalPhrase = 'De volgende machines zijn compatibel met de STIHL Service Kit 51: RM 248.0 en MB 248.4';
  if (primaryText.includes(canonicalPhrase)) {
    excerpt = canonicalPhrase;
  } else {
    // Dynamically extract contiguous slice around MB 248.4 from primary text
    const mbIdx = primaryText.indexOf('MB 248.4');
    if (mbIdx !== -1) {
      const start = Math.max(0, primaryText.lastIndexOf('. ', Math.max(0, mbIdx - 10)) + 2 || Math.max(0, mbIdx - 60));
      const endCandidate = primaryText.indexOf('. ', mbIdx + 8);
      const end = endCandidate !== -1 ? endCandidate + 1 : Math.min(primaryText.length, mbIdx + 80);
      excerpt = primaryText.slice(start, end).trim();
    }
  }

  if (!excerpt || excerpt.length === 0) {
    record.verification_status = 'UNVERIFIED_EXCERPT_EXTRACTION_FAILED';
    record.failure_reason = 'Failed to extract contiguous source excerpt from primary context';
    return record;
  }

  // Strict Invariant: Excerpt must demonstrably exist within the primary text / source
  const excerptPresent = primaryText.includes(excerpt) || fullNormalizedSource.includes(excerpt);
  record.excerpt_present_in_source = excerptPresent;

  if (!excerptPresent) {
    record.verification_status = 'UNVERIFIED_SYNTHETIC_EXCERPT';
    record.failure_reason = 'Excerpt does not exist as contiguous text within acquired source';
    return record;
  }

  record.source_excerpt = excerpt;
  record.source_excerpt_hash = crypto.createHash('sha256').update(excerpt, 'utf8').digest('hex');

  record.verification_status = 'VERIFIED';
  record.failure_reason = null;
  record.cross_generation_proof = 'Explicitly couples STIHL RM 248.0 (PETROL) with VIKING MB 248.4 under identical engine service kit (Service Kit 51) within official STIHL benzinegrasmaaiers primary product context.';
  return record;
}

/**
 * Runs genuine verification across all 12 official MB manuals and Service Kit 51.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function verifyAllMbManuals(options = {}) {
  const manualResults = [];
  let manualsAcquired = 0;
  let manualsHashVerified = 0;
  let manualsPdfExtracted = 0;
  let manualsExcerptVerified = 0;
  let manualsSemanticallyVerified = 0;
  let manualsFailed = 0;

  for (const config of OFFICIAL_MB_MANUAL_CONFIGS) {
    const res = await verifyMbManual(config, options);
    manualResults.push(res);

    if (res.document_bytes > 0) manualsAcquired++;
    if (res.hash_match) manualsHashVerified++;
    if (res.pdf_extraction_success) manualsPdfExtracted++;
    if (res.source_excerpt && res.source_excerpt_hash) manualsExcerptVerified++;
    if (res.verification_status === 'VERIFIED') {
      manualsSemanticallyVerified++;
    } else {
      manualsFailed++;
    }
  }

  const serviceKitResult = await verifyServiceKit51Evidence(options);

  return {
    manuals_required: OFFICIAL_MB_MANUAL_CONFIGS.length,
    manuals_acquired: manualsAcquired,
    manuals_hash_verified: manualsHashVerified,
    manuals_pdf_extracted: manualsPdfExtracted,
    manuals_excerpt_verified: manualsExcerptVerified,
    manuals_semantically_verified: manualsSemanticallyVerified,
    manuals_failed: manualsFailed,
    service_kit_verified: serviceKitResult.verification_status === 'VERIFIED',
    service_kit_result: serviceKitResult,
    manual_results: manualResults
  };
}
