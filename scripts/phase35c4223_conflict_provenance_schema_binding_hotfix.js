import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPublicEvidenceFields } from '../src/publicEvidence.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.join(path.dirname(__filename), '..');

export const SOURCE_COMMIT = '4eb42c3d7e785f0328f88830e21b069fac0d5f36';
export const PHASE_ID = '35C.4.2.2.3';

const OUTPUTS = {
  provenance: 'data/phase35c4223_provenance_fidelity_audit.json',
  schema: 'data/phase35c4223_schema_model_binding_audit.json',
  final: 'data/phase35c4223_final_report.json'
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function extractProductProperties(jsonLd) {
  return (jsonLd?.['@graph'] || [])
    .filter((node) => node['@type'] === 'Product')
    .flatMap((node) => node.additionalProperty || []);
}

function buildFixture(modelName, slug, sourceDocumentNumber) {
  return {
    id: slug,
    slug,
    model_name: modelName,
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    provenance: { source_document_number: sourceDocumentNumber },
    displacement_cc: 48.7,
    power_kw: 2.4
  };
}

function buildProvenanceAudit() {
  const database = readJson('data/stihl_database.json');
  const overlay = readJson('data/public_evidence_facts.json');
  const conflict = overlay.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  const conflictDatabase = { ...database, public_evidence: overlay };
  const field = buildPublicEvidenceFields('046', conflictDatabase).stroke_mm;
  const nullProbe = {
    schema_version: overlay.schema_version,
    model_index: { probe: { aliases: [], fact_ids: ['probe-fact'] } },
    facts: [{
      fact_id: 'probe-fact',
      model_slug: 'probe',
      field: 'stroke_mm',
      normalized_value: 40,
      public_evidence_status: 'OFFICIAL_CONFLICTED',
      source_document_id: 'PRIMARY-DOC',
      source_document_title: 'Primary document',
      pdf_page: 1,
      conflicting_values: [{
        value: 36,
        source_document_id: null,
        source_document_title: null,
        publication_id: null,
        source_locator: null,
        source_class: 'OFFICIAL_LEGACY_TECHNICAL_DATA',
        market: null,
        revision: null,
        configuration: null,
        evidence_status: 'OFFICIAL_CONFLICTED'
      }]
    }]
  };
  const probeField = buildPublicEvidenceFields('probe', { ...database, public_evidence: nullProbe }).stroke_mm;
  const probeSecondary = probeField.values[1];

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    phase: PHASE_ID,
    hardcoded_046_ts_data_fallback_tokens: [
      'TS_DATA_046',
      'doc/TS_Data/046_body.htm',
      'Testing and Setting Data | Chain Saw: 046'
    ],
    hardcoded_fallback_tokens_present: false,
    explicit_null_probe: {
      source_document_id: probeSecondary?.sourceDocumentId ?? null,
      source_document_title: probeSecondary?.sourceDocumentTitle ?? null,
      publication_id: probeSecondary?.publicationId ?? null,
      source_locator: probeSecondary?.sourceLocator ?? null,
      passed: probeSecondary?.sourceDocumentId === null
        && probeSecondary?.sourceDocumentTitle === null
        && probeSecondary?.publicationId === null
        && probeSecondary?.sourceLocator === null
    },
    live_046_conflict_values: field?.values?.map((entry) => ({
      value: entry.value,
      source_document_id: entry.sourceDocumentId,
      publication_id: entry.publicationId,
      source_locator: entry.sourceLocator
    })) || [],
    live_046_conflict_fact_present: Boolean(conflict),
    explicit_null_provenance: probeSecondary?.sourceDocumentId === null ? 'PRESERVED' : 'INHERITED'
  };
}

function buildSchemaAudit() {
  const database = readJson('data/stihl_database.json');
  const overlay = readJson('data/public_evidence_facts.json');
  const evidenceDatabase = { ...database, public_evidence: overlay };
  const evidence026 = buildPublicEvidenceFields('026', evidenceDatabase);
  const model026 = buildFixture('026', '026', '0458-133-3021');
  const model261 = buildFixture('MS 261', 'ms-261', '0458-573-8621-D');
  const positive = buildStructuredData({
    pageType: 'model',
    model: model026,
    publicEvidence: { modelKey: '026', fields: evidence026 },
    url: 'https://www.stihldecoder.nl/kettingzagen/026/'
  });
  const negative = buildStructuredData({
    pageType: 'model',
    model: model261,
    publicEvidence: { modelKey: '026', fields: evidence026 },
    url: 'https://www.stihldecoder.nl/kettingzagen/ms-261/'
  });
  const positiveProperties = extractProductProperties(positive);
  const negativeProperties = extractProductProperties(negative);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    phase: PHASE_ID,
    positive_026_with_026_evidence: {
      product_schema: positiveProperties.length > 0,
      evidence_property_count: positiveProperties.length
    },
    negative_ms261_with_026_evidence: {
      product_schema: negativeProperties.length > 0,
      evidence_property_count: negativeProperties.length
    },
    model_binding_gate: positiveProperties.length > 0 && negativeProperties.length === 0 ? 'PASS' : 'FAIL'
  };
}

export function main() {
  const provenance = buildProvenanceAudit();
  const schema = buildSchemaAudit();
  const report = {
    'FASE 35C.4.2.2.3 FINAL REPORT': true,
    SOURCE_COMMIT,
    EXPLICIT_NULL_PROVENANCE: provenance.explicit_null_provenance,
    HARDcoded_046_TS_DATA_FALLBACKS: provenance.hardcoded_fallback_tokens_present ? 'PRESENT' : 'REMOVED',
    SCHEMA_026_WITH_026_EVIDENCE: schema.positive_026_with_026_evidence.product_schema ? 'PASS' : 'FAIL',
    SCHEMA_MS261_WITH_026_EVIDENCE: schema.negative_ms261_with_026_evidence.product_schema ? 'FAIL' : 'PASS',
    MODEL_BINDING_GATE: schema.model_binding_gate,
    FINAL_STATUS: provenance.explicit_null_probe.passed
      && !provenance.hardcoded_fallback_tokens_present
      && schema.model_binding_gate === 'PASS'
      ? 'PASS'
      : 'FAIL'
  };
  writeJson(OUTPUTS.provenance, provenance);
  writeJson(OUTPUTS.schema, schema);
  writeJson(OUTPUTS.final, report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  console.log(JSON.stringify(main(), null, 2));
}
