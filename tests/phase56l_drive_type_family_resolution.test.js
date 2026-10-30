/**
 * tests/phase56l_drive_type_family_resolution.test.js
 *
 * Phase 56L.4 — Primary Context Parser Final Closure Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
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
  getRegistryStats,
  ModelFamilyDriveRegistry
} from '../src/ModelFamilyDriveRegistry.js';

import {
  getFuelTypeCode,
  getFuelDriveLabel,
  isPetrolModel,
  isBatteryModel
} from '../src/publicationRules.js';

import { resolveMachineClassification, getClassificationContextLabel } from '../src/driveClassification.js';
import {
  evaluateSemanticEvidence,
  extractPrimaryProductEvidence,
  extractPdfDocumentText
} from '../scripts/fetch_official_family_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56l');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const HARVEST_DIR = path.join(DATA_DIR, 'harvest', 'phase56l');

test('Phase 56L.2: Attachment Safety Gate prevents misclassification of KombiTools and accessories', () => {
  const attachmentCases = [
    'BG-KM',
    'FS-KM',
    'HL-KM',
    'HT-KM',
    'FS Power Tool Attachments',
    'BF-MM',
    'Mowing head Auto Cut C12-2 Cutting Attachment'
  ];

  for (const name of attachmentCases) {
    assert.strictEqual(isAttachmentDesignation(name), true, `${name} must be identified as attachment`);
    assert.strictEqual(isPoweredModelDesignation(name), false, `${name} must not be powered designation`);

    const res = resolveDriveType(name);
    assert.strictEqual(res.drive_type, DRIVE_TYPES.UNKNOWN, `${name} drive type must be UNKNOWN`);
    assert.strictEqual(res.display, DISPLAY_LABELS.UNKNOWN, `${name} display must be 'Niet vastgesteld'`);
    assert.strictEqual(res.resolution, 'ATTACHMENT_NOT_POWERED', `${name} resolution must be ATTACHMENT_NOT_POWERED`);
    assert.strictEqual(res.family, null, `${name} must not infer a family prefix rule`);
  }
});

test('Phase 56L.2: Powered machines continue resolving correctly under attachment safety gate', () => {
  const poweredCases = [
    { name: 'BG 86', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'FS 55', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'HT 131', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MS 211', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MSA 300', expectedDrive: DRIVE_TYPES.BATTERY },
    { name: 'MSE 210', expectedDrive: DRIVE_TYPES.MAINS_ELECTRIC }
  ];

  for (const c of poweredCases) {
    assert.strictEqual(isAttachmentDesignation(c.name), false, `${c.name} must not be flagged as attachment`);
    assert.strictEqual(isPoweredModelDesignation(c.name), true, `${c.name} must be flagged as powered designation`);

    const res = resolveDriveType(c.name);
    assert.strictEqual(res.drive_type, c.expectedDrive, `${c.name} drive type must match`);
    assert.strictEqual(res.resolution, 'FAMILY_RULE', `${c.name} resolution must be FAMILY_RULE`);
  }
});

test('Phase 56L.2: Canonical explicit evidence propagation contract', () => {
  // Test explicit GASOLINE -> EXPLICIT_MODEL PETROL
  const gasRes = resolveDriveType({ model_name: 'Custom-Saw', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(gasRes.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(gasRes.resolution, 'EXPLICIT_MODEL');

  // Test explicit BATTERY -> EXPLICIT_MODEL BATTERY
  const batRes = resolveDriveType({ model_name: 'Custom-Battery', explicit_power_source: 'BATTERY' });
  assert.strictEqual(batRes.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(batRes.resolution, 'EXPLICIT_MODEL');

  // Test explicit PETROL_2STROKE -> EXPLICIT_MODEL PETROL
  const twoStrokeRes = resolveDriveType({ model_name: 'Custom-2Stroke', explicit_fuel_type: 'PETROL_2STROKE' });
  assert.strictEqual(twoStrokeRes.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(twoStrokeRes.resolution, 'EXPLICIT_MODEL');

  // When explicit evidence agrees with family, resolution must be EXPLICIT_MODEL, NOT FAMILY_RULE
  const ms261Explicit = resolveDriveType({ model_name: 'MS 261', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(ms261Explicit.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(ms261Explicit.resolution, 'EXPLICIT_MODEL');
});

test('Phase 56L.2: Historical numeric STIHL models resolution (026, 009, 017, 044)', () => {
  const numeric026 = resolveDriveType({ model_name: '026', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric026.drive_type, DRIVE_TYPES.PETROL, '026 with gasoline evidence must not be UNKNOWN');
  assert.strictEqual(numeric026.display, 'Benzine');
  assert.strictEqual(numeric026.resolution, 'EXPLICIT_MODEL');

  const numeric009 = resolveDriveType({ model_name: '009', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric009.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric009.resolution, 'EXPLICIT_MODEL');

  const numeric017 = resolveDriveType({ model_name: '017', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric017.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric017.resolution, 'EXPLICIT_MODEL');

  const numeric044 = resolveDriveType({ model_name: '044', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric044.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric044.resolution, 'EXPLICIT_MODEL');
});

test('Phase 56L.2: Conflict detection quarantines contradictory explicit evidence', () => {
  const conflictModel = {
    model_name: 'MS 261',
    explicit_power_source: 'BATTERY'
  };
  const res = resolveDriveType(conflictModel);
  assert.strictEqual(res.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(res.display, 'Niet vastgesteld');
  assert.strictEqual(res.resolution, 'CONFLICT_QUARANTINED');
  assert.strictEqual(res.source_type, 'QUARANTINED_CONFLICT');
  assert.strictEqual(res.explicit_value, 'BATTERY');
  assert.strictEqual(res.family_value, 'PETROL');
});

test('Phase 56L.2: Primary acceptance target MS 211 resolves to Benzine (PETROL)', () => {
  const result = resolveDriveType({ model_name: 'MS 211' });
  assert.strictEqual(result.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(result.display, 'Benzine');
  assert.strictEqual(result.resolution, 'FAMILY_RULE');
  assert.strictEqual(result.family, 'MS');
  assert.strictEqual(result.machine_type, 'CHAINSAW');
  assert.strictEqual(result.source_type, 'OFFICIAL_STIHL_FAMILY_EVIDENCE');
  assert.strictEqual(result.confidence, 'HIGH');
});

test('Phase 56L.3: Semantic source verification & context-bound HTML isolation fixtures', () => {
  const mseTarget = {
    family: 'MSE',
    drive_type: 'MAINS_ELECTRIC',
    family_tokens: ['MSE'],
    representative_models: ['MSE 141', 'MSE 170', 'MSE 210'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: [/gazonmaaier|rasenmäher|zitmaaier|RM\s*2|RT\s*5097/i]
  };

  // 1. Wrong page fixture: MSE target with RM 2 lawn mower page
  const wrongPageFixture = {
    http_status: 200,
    page_title: 'RM 2 R benzine gazonmaaier kopen',
    body_text: 'De compacte benzine grasmaaier RM 2 R met mulchfunctie voor middelgrote gazons.'
  };
  const wrongEval = evaluateSemanticEvidence(mseTarget, wrongPageFixture);
  assert.strictEqual(wrongEval.verification_status, 'UNVERIFIED_WRONG_CONTENT');
  assert.strictEqual(wrongEval.wrong_content, true);
  assert.strictEqual(wrongEval.family_match, false);

  // 2. HTTP 200 STIHL page without family match
  const noFamilyFixture = {
    http_status: 200,
    page_title: 'STIHL Reinigingsmiddelen en accessoires kopen',
    body_text: 'Elektrische universele reiniger voor diverse toepassingen, 230 V voeding compatibel.'
  };
  const noFamEval = evaluateSemanticEvidence(mseTarget, noFamilyFixture);
  assert.strictEqual(noFamEval.verification_status, 'UNVERIFIED_NO_FAMILY_MATCH');
  assert.strictEqual(noFamEval.family_match, false);

  // 3. HTTP 200 STIHL page without drive match
  const noDriveFixture = {
    http_status: 200,
    page_title: 'STIHL MSE 141 Onderdelengids',
    body_text: 'Onderdelenoverzicht voor de MSE 141 serie kettingzaag zonder vermelde aandrijvingstechniek.'
  };
  const noDriveEval = evaluateSemanticEvidence(mseTarget, noDriveFixture);
  assert.strictEqual(noDriveEval.verification_status, 'UNVERIFIED_NO_DRIVE_MATCH');
  assert.strictEqual(noDriveEval.family_match, true);
  assert.strictEqual(noDriveEval.drive_match, false);

  // 4. Split context fixture: family model in primary, drive term ONLY in secondary footer
  const splitContextHtml = `
    <html>
      <head><title>STIHL MSE 141 Kettingzaag</title></head>
      <body>
        <main>
          <h1>STIHL MSE 141</h1>
          <p>Handige kettingzaag voor het zagen van haardhout en tuinklussen.</p>
        </main>
        <footer>
          <p>STIHL adviseert 230 V elektrische apparatuur te gebruiken met goedgekeurde verlengsnoeren.</p>
        </footer>
      </body>
    </html>
  `;
  const splitEval = evaluateSemanticEvidence(mseTarget, {
    http_status: 200,
    content_type: 'text/html',
    body_text: splitContextHtml
  });
  assert.strictEqual(splitEval.verification_status, 'UNVERIFIED_CONTEXT_MISMATCH', 'Split context must fail with UNVERIFIED_CONTEXT_MISMATCH');
  assert.strictEqual(splitEval.context_bound, false);

  // 5. Secondary-only related products fixture: target is BGA (battery blower), but primary page is BG 86 (petrol blower)
  const bgaTarget = {
    family: 'BGA',
    drive_type: 'BATTERY',
    family_tokens: ['BGA'],
    representative_models: ['BGA 45', 'BGA 57', 'BGA 60'],
    required_drive_terms: ['accu', 'battery', 'ak-systeem'],
    negative_patterns: []
  };
  const relatedProductHtml = `
    <html>
      <head><title>STIHL BG 86 Benzinebladblazer</title></head>
      <body>
        <main>
          <h1>STIHL BG 86</h1>
          <p>Krachtige benzine bladblazer voor professioneel terreinonderhoud.</p>
        </main>
        <div class="product-slider related-items">
          <h3>Wellicht ook interessant: BGA 60 Accubladblazer met handige accu-aandrijving</h3>
        </div>
      </body>
    </html>
  `;
  const relatedEval = evaluateSemanticEvidence(bgaTarget, {
    http_status: 200,
    content_type: 'text/html',
    body_text: relatedProductHtml
  });
  assert.notStrictEqual(relatedEval.verification_status, 'VERIFIED', 'Related product mention must never verify another family target');
  assert.strictEqual(relatedEval.context_bound, false);

  // 6. Genuine matching primary page -> VERIFIED
  const validFixture = {
    http_status: 200,
    page_title: 'MSE 141 elektrische kettingzaag kopen',
    body_text: 'De lichte en handige elektrische kettingzaag MSE 141 C-Q met netstroom 230 V voor tuin en haardhout.'
  };
  const validEval = evaluateSemanticEvidence(mseTarget, validFixture);
  assert.strictEqual(validEval.verification_status, 'VERIFIED');
  assert.strictEqual(validEval.family_match, true);
  assert.strictEqual(validEval.drive_match, true);
  assert.strictEqual(validEval.context_bound, true);
  assert.strictEqual(validEval.evidence_context_id, 'PRIMARY_PRODUCT_CONTEXT');
  assert.ok(validEval.extracted_evidence, 'Extracted evidence must be populated');
  assert.ok(validEval.extracted_evidence.source_excerpt_hash, 'Excerpt hash must be present');
});

test('Phase 56L.2: Timestamp ordering & Cache reuse integrity in fetch ledger', () => {
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  assert.ok(fs.existsSync(ledgerPath), 'Official family fetch ledger must exist');

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  // Timestamp ordering: fetch_started_at <= fetch_completed_at
  for (const entry of ledger) {
    const start = new Date(entry.fetch_started_at || entry.retrieval_started_at).getTime();
    const end = new Date(entry.fetch_completed_at || entry.retrieved_at).getTime();
    assert.ok(start <= end, `Fetch started_at (${start}) must be <= retrieved_at (${end}) for rule ${entry.family}`);
    assert.ok(!entry.retrieved_at.includes('00:00:00.000Z'), `Rule ${entry.family} must not use static placeholder timestamp`);
  }

  // Cache reuse: SHE and BGE share the exact same PDF manual fetch_id
  const bge = ledger.find(l => l.family === 'BGE');
  const she = ledger.find(l => l.family === 'SHE');
  assert.ok(bge && she, 'Both BGE and SHE must exist in ledger');
  assert.strictEqual(bge.fetch_id, she.fetch_id, 'BGE and SHE must share the exact same fetch_id');
  assert.strictEqual(she.reused_cached_fetch, true, 'SHE must be flagged as reused_cached_fetch = true');
  assert.strictEqual(bge.retrieved_at, she.retrieved_at, 'SHE must share identical retrieved_at timestamp with BGE');
});

test('Phase 56L.2: Active registry is 100% powered by semantically VERIFIED rules', () => {
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  const activeRules = Object.values(OFFICIAL_STIHL_FAMILY_RULES);
  assert.ok(activeRules.length >= 20, 'Must have at least 20 verified active rules');

  for (const rule of activeRules) {
    const l = ledger.find(entry => entry.family === rule.family);
    assert.ok(l, `Rule ${rule.family} must have an entry in the ledger`);
    assert.strictEqual(l.verification_status, 'VERIFIED', `Active rule ${rule.family} must be VERIFIED in ledger`);
    assert.strictEqual(l.family_match, true, `Active rule ${rule.family} must have family_match = true`);
    assert.strictEqual(l.drive_match, true, `Active rule ${rule.family} must have drive_match = true`);
    assert.strictEqual(Boolean(l.wrong_content), false, `Active rule ${rule.family} must not have wrong_content = true`);
  }

  // Unverified/disabled families (e.g. HTE) must NOT be in ACTIVE rules
  assert.strictEqual(OFFICIAL_STIHL_FAMILY_RULES['HTE'], undefined, 'HTE must not be in ACTIVE rules');
  assert.ok(DISABLED_FAMILY_RULES['HTE'], 'HTE must be recorded in DISABLED_FAMILY_RULES');
  assert.strictEqual(DISABLED_FAMILY_RULES['HTE'].status, 'DISABLED');
});

test('Phase 56L.2: Representative acceptance families (MS, MSA, MSE, FS, FSA, FSE, TS, TSA, HS, HSA, HSE, BG, BGA, BGE, BR)', () => {
  const representativeFamilies = [
    { family: 'MS', drive: DRIVE_TYPES.PETROL, model: 'MS 211' },
    { family: 'MSA', drive: DRIVE_TYPES.BATTERY, model: 'MSA 300' },
    { family: 'MSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'MSE 210' },
    { family: 'FS', drive: DRIVE_TYPES.PETROL, model: 'FS 55' },
    { family: 'FSA', drive: DRIVE_TYPES.BATTERY, model: 'FSA 120' },
    { family: 'FSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'FSE 60' },
    { family: 'TS', drive: DRIVE_TYPES.PETROL, model: 'TS 420' },
    { family: 'TSA', drive: DRIVE_TYPES.BATTERY, model: 'TSA 230' },
    { family: 'HS', drive: DRIVE_TYPES.PETROL, model: 'HS 45' },
    { family: 'HSA', drive: DRIVE_TYPES.BATTERY, model: 'HSA 60' },
    { family: 'HSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'HSE 42' },
    { family: 'BG', drive: DRIVE_TYPES.PETROL, model: 'BG 86' },
    { family: 'BGA', drive: DRIVE_TYPES.BATTERY, model: 'BGA 57' },
    { family: 'BGE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'BGE 71' },
    { family: 'BR', drive: DRIVE_TYPES.PETROL, model: 'BR 600' }
  ];

  for (const rep of representativeFamilies) {
    const rule = OFFICIAL_STIHL_FAMILY_RULES[rep.family];
    assert.ok(rule, `Representative family ${rep.family} must be ACTIVE in registry`);
    assert.strictEqual(rule.drive_type, rep.drive, `Family ${rep.family} drive type must match`);
    assert.strictEqual(rule.status, 'ACTIVE');

    const res = resolveDriveType(rep.model);
    assert.strictEqual(res.drive_type, rep.drive, `Model ${rep.model} must resolve to ${rep.drive}`);
    assert.strictEqual(res.resolution, 'FAMILY_RULE');
  }
});

test('Phase 56L.2: Integration with publicationRules.js and driveClassification.js', () => {
  // Attachment safety in publicationRules
  assert.strictEqual(getFuelTypeCode({ model_name: 'BG-KM' }), 'UNKNOWN');
  assert.strictEqual(getFuelDriveLabel({ model_name: 'BG-KM' }), 'Niet vastgesteld');
  assert.strictEqual(isPetrolModel({ model_name: 'BG-KM' }), false);

  // Attachment safety in driveClassification
  const bgKmCls = resolveMachineClassification({ exactModel: { model_name: 'BG-KM' } });
  assert.strictEqual(bgKmCls.power_source, 'UNKNOWN');
  assert.strictEqual(bgKmCls.drive_type, 'UNKNOWN');
  assert.strictEqual(bgKmCls.display_label, 'Niet vastgesteld');

  // Powered machine MS 211
  assert.strictEqual(getFuelTypeCode({ model_name: 'MS 211' }), 'PETROL');
  assert.strictEqual(getFuelDriveLabel({ model_name: 'MS 211' }), 'Benzine-aandrijving');
  assert.strictEqual(isPetrolModel({ model_name: 'MS 211' }), true);

  // Historic model 026
  assert.strictEqual(getFuelTypeCode({ model_name: '026', explicit_power_source: 'GASOLINE' }), 'PETROL_2STROKE');
  assert.strictEqual(isPetrolModel({ model_name: '026', explicit_power_source: 'GASOLINE' }), true);
});

test('Phase 56L.3: True PDF text extraction & page-level context binding fixtures', () => {
  const bgeTarget = {
    family: 'BGE',
    drive_type: 'MAINS_ELECTRIC',
    family_tokens: ['BGE'],
    representative_models: ['BGE 61', 'BGE 71', 'BGE 81'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v', 'elektro'],
    negative_patterns: []
  };

  // 1. PDF text extraction failure fixture
  const failedExtractionFixture = {
    http_status: 200,
    content_type: 'application/pdf',
    pdf_extraction: {
      success: false,
      error: 'Corrupt PDF header stream',
      pages: [],
      text_length: 0
    }
  };
  const failedEval = evaluateSemanticEvidence(bgeTarget, failedExtractionFixture);
  assert.strictEqual(failedEval.verification_status, 'UNVERIFIED_PDF_TEXT_EXTRACTION_FAILED');
  assert.strictEqual(failedEval.context_bound, false);

  // 2. Split page context fixture: family on page 1, drive term only on page 50
  const splitPageFixture = {
    http_status: 200,
    content_type: 'application/pdf',
    pdf_extraction: {
      success: true,
      error: null,
      page_count: 50,
      text_length: 5000,
      full_text: 'BGE 71 manual ... electric power tools',
      pages: [
        { page_number: 1, text: 'STIHL BGE 71 Handbuch für Gebläse' },
        { page_number: 2, text: 'Allgemeine Hinweise zur Sicherheit und Bedienung' },
        { page_number: 50, text: 'Elektrische Entsorgungshinweise nach ElektroG 230 V' }
      ]
    }
  };
  const splitPageEval = evaluateSemanticEvidence(bgeTarget, splitPageFixture);
  assert.strictEqual(splitPageEval.verification_status, 'UNVERIFIED_CONTEXT_MISMATCH', 'Split page PDF evidence must fail with UNVERIFIED_CONTEXT_MISMATCH');
  assert.strictEqual(splitPageEval.context_bound, false);

  // 3. Page-bound co-occurrence fixture -> VERIFIED
  const validPageFixture = {
    http_status: 200,
    content_type: 'application/pdf',
    pdf_extraction: {
      success: true,
      error: null,
      page_count: 10,
      text_length: 3000,
      full_text: '...',
      pages: [
        { page_number: 7, text: 'Bauart: Elektro-Blasgerät STIHL Typ BGE 61 BGE 71 BGE 81' }
      ]
    }
  };
  const validPageEval = evaluateSemanticEvidence(bgeTarget, validPageFixture);
  assert.strictEqual(validPageEval.verification_status, 'VERIFIED');
  assert.strictEqual(validPageEval.context_bound, true);
  assert.strictEqual(validPageEval.evidence_context_id, 'PDF_DOCUMENT_PAGE_CONTEXT');
  assert.strictEqual(validPageEval.page_number, 7);
  assert.ok(validPageEval.extracted_evidence.source_excerpt_hash);

  // 4. Validate authentic PDF entries in fetch ledger (HLE, BGE, SHE)
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  for (const fam of ['HLE', 'BGE', 'SHE']) {
    const entry = ledger.find(l => l.family === fam);
    assert.ok(entry, `Ledger entry for PDF family ${fam} must exist`);
    assert.strictEqual(entry.verification_status, 'VERIFIED');
    assert.strictEqual(entry.content_type.includes('pdf'), true);
    assert.strictEqual(entry.pdf_parser, 'pdfjs-dist/legacy');
    assert.strictEqual(entry.pdf_text_extracted, true);
    assert.ok(entry.pdf_page_count > 0, `${fam} page count must be > 0`);
    assert.ok(entry.pdf_text_length > 10000, `${fam} text length must be > 10,000 chars`);
    assert.strictEqual(entry.raw_bytes_used, false, `${fam} must not use raw bytes`);
    assert.strictEqual(entry.context_bound, true, `${fam} must be context bound`);
    assert.strictEqual(entry.evidence_context_id, 'PDF_DOCUMENT_PAGE_CONTEXT');
    assert.ok(Number.isInteger(entry.page_number) && entry.page_number > 0, `${fam} page_number must be positive int`);
  }
});

test('Phase 56L.4: Nested secondary containers are recursively pruned from primary context without leaking', () => {
  const mseTarget = {
    family: 'MSE',
    drive_type: 'MAINS_ELECTRIC',
    family_tokens: ['MSE'],
    representative_models: ['MSE 141', 'MSE 170', 'MSE 210'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: []
  };

  // 1. Nested related-div contamination: target family is ONLY in a deeply nested div inside related-products
  const nestedRelatedHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>STIHL MS 170 Benzine Kettingzaag</title></head>
      <body>
        <main>
          <h1>STIHL MS 170</h1>
          <p>Betrouwbare compacte benzine kettingzaag voor het zagen van brandhout.</p>
          <div class="related-products">
            <div class="slider-wrapper">
              <div class="product-card">
                <a href="/mse-210">
                  <span>MSE 210 elektrische kettingzaag met 230 V netstroom</span>
                </a>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `;

  const extracted = extractPrimaryProductEvidence(nestedRelatedHtml);
  // Ensure the nested text is in secondary_text, NOT primary_text
  assert.ok(extracted.secondary_text.includes('MSE 210'), 'Nested related content must be in secondary_text');
  assert.ok(extracted.secondary_text.includes('elektrische'), 'Nested related drive terms must be in secondary_text');
  assert.strictEqual(extracted.primary_text.includes('MSE 210'), false, 'Nested related content must NOT leak into primary_text');
  assert.strictEqual(extracted.primary_text.includes('elektrische'), false, 'Nested related terms must NOT leak into primary_text');

  // When evaluated against MSE target, this page must NOT verify MSE
  const evalResult = evaluateSemanticEvidence(mseTarget, {
    http_status: 200,
    content_type: 'text/html',
    body_text: nestedRelatedHtml
  });
  assert.notStrictEqual(evalResult.verification_status, 'VERIFIED', 'Nested related product mention must not verify MSE');
  assert.strictEqual(evalResult.context_bound, false, 'Must not be context-bound for target family');

  // 2. Deeply nested recommendation contamination: section.recommendations > div > div > article
  const nestedRecommendationHtml = `
    <html>
      <body>
        <header><nav><a href="/">Home</a></nav></header>
        <section class="main-content">
          <h1>STIHL FSA 57 Accustrimmer</h1>
        </section>
        <section class="recommendations">
          <div>
            <div class="sub-block">
              <article>
                <h3>STIHL MSE 141 Elektrische Kettingzaag 230V</h3>
              </article>
            </div>
          </div>
        </section>
      </body>
    </html>
  `;

  const extractedRec = extractPrimaryProductEvidence(nestedRecommendationHtml);
  assert.strictEqual(extractedRec.primary_text.includes('MSE 141'), false, 'Recommendations container must be cleanly stripped');
  assert.ok(extractedRec.secondary_text.includes('MSE 141'), 'Recommendations must be placed in secondary_text');
});

test('Phase 56L.4: Strict Schema.org Product / ProductModel JSON-LD type validation', () => {
  const mseTarget = {
    family: 'MSE',
    drive_type: 'MAINS_ELECTRIC',
    family_tokens: ['MSE'],
    representative_models: ['MSE 141', 'MSE 170', 'MSE 210'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: []
  };

  // 1. WebSite schema rejection: @type: "WebSite"
  const websiteHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "STIHL MSE Elektrische Kettingzagen Officiële Shop",
          "url": "https://www.stihl.nl"
        }
        </script>
      </head>
      <body>
        <h1>Over Onze Winkel</h1>
        <p>Welkom bij de officiële STIHL dealer.</p>
      </body>
    </html>
  `;
  const websiteExtracted = extractPrimaryProductEvidence(websiteHtml);
  assert.strictEqual(websiteExtracted.jsonld_product_name, null, 'WebSite @type must NOT be extracted as product name');

  // 2. Organization, Brand, BreadcrumbList rejection
  const nonProductHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "STIHL MSE Group"
          },
          {
            "@context": "https://schema.org",
            "@type": "Brand",
            "name": "STIHL"
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "MSE Elektrisch"
              }
            ]
          }
        ]
        </script>
      </head>
      <body>
        <p>Merkpagina</p>
      </body>
    </html>
  `;
  const nonProductExtracted = extractPrimaryProductEvidence(nonProductHtml);
  assert.strictEqual(nonProductExtracted.jsonld_product_name, null, 'Non-Product schema types must NOT be extracted');

  // 3. Valid @type: "Product" acceptance
  const validProductHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "STIHL MSE 210 C-B Elektrische kettingzaag",
          "description": "Krachtige elektrische kettingzaag met 230 V netaansluiting"
        }
        </script>
      </head>
      <body>
        <h1>MSE 210 C-B</h1>
      </body>
    </html>
  `;
  const productExtracted = extractPrimaryProductEvidence(validProductHtml);
  assert.strictEqual(productExtracted.jsonld_product_name, 'STIHL MSE 210 C-B Elektrische kettingzaag');

  // 4. Valid @type: "ProductModel" acceptance
  const validProductModelHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "ProductModel",
          "name": "STIHL MSE 141 C-Q",
          "description": "Lichte elektrische zaag 230V"
        }
        </script>
      </head>
      <body>
        <h1>MSE 141 C-Q</h1>
      </body>
    </html>
  `;
  const modelExtracted = extractPrimaryProductEvidence(validProductModelHtml);
  assert.strictEqual(modelExtracted.jsonld_product_name, 'STIHL MSE 141 C-Q');

  // 5. Valid array @type: ["Thing", "Product"] acceptance
  const arrayTypeHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": ["Thing", "Product"],
          "name": "STIHL MSE 170 C-B",
          "description": "Elektrische kettingzaag netstroom 230V"
        }
        </script>
      </head>
      <body>
        <h1>MSE 170 C-B</h1>
      </body>
    </html>
  `;
  const arrayExtracted = extractPrimaryProductEvidence(arrayTypeHtml);
  assert.strictEqual(arrayExtracted.jsonld_product_name, 'STIHL MSE 170 C-B');

  // 6. Multi-block JSON-LD: WebSite block followed by Product block -> only Product extracted
  const multiBlockHtml = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "STIHL Portal"
        }
        </script>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "STIHL MSE 190 C-B",
          "description": "Elektrisch"
        }
        </script>
      </head>
      <body>
        <h1>MSE 190</h1>
      </body>
    </html>
  `;
  const multiExtracted = extractPrimaryProductEvidence(multiBlockHtml);
  assert.strictEqual(multiExtracted.jsonld_product_name, 'STIHL MSE 190 C-B');
});

test('Phase 56L.4: Catalog & SEO Freeze Invariants', () => {
  const db = new Database(path.join(DATA_DIR, 'stihl_database.db'), { readonly: true });
  const partsCount = db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;
  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  assert.strictEqual(partsCount, 17082, 'Canonical parts count must be exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Canonical fitments count must be exactly 175,106');
  assert.strictEqual(configsCount, 766, 'Diagram configurations count must be exactly 766');
  assert.strictEqual(evidenceCount, 208412, 'Evidence ledger count must be exactly 208,412');
  assert.strictEqual(sectionContextsCount, 814, 'Section contexts count must be exactly 814');
});

test('Phase 56L.4: All 12 required artifacts exist and pass Phase 56L.4 hard gates', () => {
  const expectedArtifacts = [
    'MODEL_FAMILY_INVENTORY.json',
    'OFFICIAL_FAMILY_EVIDENCE.json',
    'DRIVE_TYPE_DRY_RUN.json',
    'DRIVE_TYPE_CONFLICTS.json',
    'DRIVE_TYPE_ACTIVATION.json',
    'MODEL_COVERAGE_BEFORE_AFTER.json',
    'ATTACHMENT_CLASSIFICATION_AUDIT.json',
    'FAMILY_PROVENANCE_INTEGRITY.json',
    'SEO_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56L_SUMMARY.json',
    'PHASE56L_REPORT.md'
  ];

  assert.strictEqual(expectedArtifacts.length, 12, 'Must require exactly 12 artifacts');

  for (const artifact of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, artifact);
    assert.ok(fs.existsSync(p), `Artifact ${artifact} must exist in output/phase56l/`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56L_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.outcome_status, 'PASS');
  assert.strictEqual(summary.hard_gates.POWERED_ATTACHMENT_MISCLASSIFICATIONS, 0);
  assert.strictEqual(summary.hard_gates.EXPLICIT_EVIDENCE_PROPAGATION_VALID, true);
  assert.strictEqual(summary.hard_gates.FABRICATED_FAMILY_PROVENANCE, 0);
  assert.strictEqual(summary.hard_gates.WRONG_CONTENT_VERIFIED_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.IMPOSSIBLE_TIMESTAMP_ORDER_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE, 0);
  assert.strictEqual(summary.hard_gates.SEMANTIC_FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(summary.hard_gates.RAW_PDF_BYTE_VERIFICATION_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.PRIMARY_CONTEXT_MISMATCH_VERIFIED_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.ACTIVE_PDF_RULES_WITHOUT_EXTRACTED_TEXT, 0);
  assert.strictEqual(summary.hard_gates.CONTEXT_BOUND_FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(summary.hard_gates.NESTED_SECONDARY_CONTENT_LEAKS, 0);
  assert.strictEqual(summary.hard_gates.NON_PRODUCT_JSONLD_EVIDENCE_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.PRIMARY_CONTEXT_PARSER_VERIFIED, true);

  const provenanceIntegrity = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'FAMILY_PROVENANCE_INTEGRITY.json'), 'utf8'));
  assert.strictEqual(provenanceIntegrity.status, 'PASS');
  assert.strictEqual(provenanceIntegrity.SEMANTIC_FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(provenanceIntegrity.CONTEXT_BOUND_FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(provenanceIntegrity.wrong_content_records, 1);
  assert.strictEqual(provenanceIntegrity.WRONG_CONTENT_VERIFIED_RECORDS, 0);
  assert.strictEqual(provenanceIntegrity.impossible_timestamp_order_records, 0);
  assert.strictEqual(provenanceIntegrity.ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE, 0);
  assert.strictEqual(provenanceIntegrity.fabricated_family_provenance, 0);
  assert.strictEqual(provenanceIntegrity.RAW_PDF_BYTE_VERIFICATION_RECORDS, 0);
  assert.strictEqual(provenanceIntegrity.PRIMARY_CONTEXT_MISMATCH_VERIFIED_RECORDS, 0);
  assert.strictEqual(provenanceIntegrity.ACTIVE_PDF_RULES_WITHOUT_EXTRACTED_TEXT, 0);
  assert.strictEqual(provenanceIntegrity.NESTED_SECONDARY_CONTENT_LEAKS, 0);
  assert.strictEqual(provenanceIntegrity.NON_PRODUCT_JSONLD_EVIDENCE_RECORDS, 0);
  assert.strictEqual(provenanceIntegrity.PRIMARY_CONTEXT_PARSER_VERIFIED, true);
});
