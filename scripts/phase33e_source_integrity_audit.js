import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  OFFICIAL_PRIMARY_DOCUMENTS,
  getModelVerificationSummary,
  summarizeCanonicalDatabase
} from '../src/canonicalData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const jsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const reportPath = path.join(rootDir, 'data', 'phase33e_source_integrity_report.json');

const dbData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const models = Array.isArray(dbData.models) ? dbData.models : [];

function modelMentionsPrimaryDoc(model, summary) {
  if (!summary.hasPrimaryDocument || !summary.sourceDocumentNumber) {
    return false;
  }

  const doc = OFFICIAL_PRIMARY_DOCUMENTS[summary.sourceDocumentNumber];
  if (!doc) {
    return false;
  }

  const aliases = [
    model.model_name,
    model.slug,
    ...(Array.isArray(model.aliases) ? model.aliases : [])
  ]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());

  return doc.models_mentioned.some((mentioned) => {
    const target = String(mentioned).toUpperCase();
    return aliases.some((alias) => alias.includes(target) || target.includes(alias));
  });
}

function collectFindings(model) {
  const summary = getModelVerificationSummary(model);
  const findings = [];

  if (!summary.hasPrimaryDocument) {
    findings.push({
      severity: 'pending',
      code: 'PRIMARY_SOURCE_PENDING',
      message: 'Model has no linked primary source document in the canonical registry.'
    });
  }

  if (summary.hasPrimaryDocument && !modelMentionsPrimaryDoc(model, summary)) {
    findings.push({
      severity: 'error',
      code: 'DOCUMENT_MODEL_MISMATCH',
      message: `Linked document ${summary.sourceDocumentNumber} does not clearly mention this model.`
    });
  }

  if (model.specs_verified === true) {
    findings.push({
      severity: 'warning',
      code: 'LEGACY_VERIFIED_FLAG',
      message: 'Legacy specs_verified=true is still present while canonical policy uses field-level source status.'
    });
  }

  if ((model.production_confidence || '').toUpperCase() !== 'UNKNOWN') {
    findings.push({
      severity: 'warning',
      code: 'PRODUCTION_CONFIDENCE_TOO_HIGH',
      message: `production_confidence is ${model.production_confidence}; canonical policy expects UNKNOWN unless separately proven.`
    });
  }

  return {
    slug: model.slug,
    model_name: model.model_name,
    data_status: model.data_status || null,
    data_source: model.data_source || null,
    source_document_number: summary.sourceDocumentNumber,
    findings
  };
}

const perModel = models.map(collectFindings);
const summary = summarizeCanonicalDatabase(dbData);
const report = {
  generated_at: new Date().toISOString(),
  audit_mode: 'report_only',
  canonical_file: path.relative(rootDir, jsonPath).replace(/\\/g, '/'),
  canonical_hash: summary.hash,
  totals: {
    models: models.length,
    primarySourceLinkedModels: summary.primarySourceLinkedModels,
    primarySourcePendingModels: summary.primarySourcePendingModels,
    modelsWithErrors: perModel.filter((entry) => entry.findings.some((finding) => finding.severity === 'error')).length,
    modelsWithWarnings: perModel.filter((entry) => entry.findings.some((finding) => finding.severity === 'warning')).length
  },
  officialRegistry: Object.values(OFFICIAL_PRIMARY_DOCUMENTS).map((doc) => ({
    document_number: doc.document_number,
    document_title: doc.document_title,
    models_mentioned: doc.models_mentioned
  })),
  perModel
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

const integrityFingerprint = crypto
  .createHash('sha256')
  .update(JSON.stringify(report.totals))
  .digest('hex')
  .slice(0, 12);

console.log('Phase 33E source integrity audit completed.');
console.log(`Mode: ${report.audit_mode}`);
console.log(`Canonical file: ${report.canonical_file}`);
console.log(`Models: ${report.totals.models}`);
console.log(`Primary source linked: ${report.totals.primarySourceLinkedModels}`);
console.log(`Primary source pending: ${report.totals.primarySourcePendingModels}`);
console.log(`Models with errors: ${report.totals.modelsWithErrors}`);
console.log(`Models with warnings: ${report.totals.modelsWithWarnings}`);
console.log(`Integrity fingerprint: ${integrityFingerprint}`);
console.log(`Report written to: ${path.relative(rootDir, reportPath).replace(/\\/g, '/')}`);
