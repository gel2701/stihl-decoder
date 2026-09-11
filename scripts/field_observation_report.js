/**
 * field_observation_report.js
 * Phase 38C Private Review Queue & Document Candidate Matcher.
 * 
 * Inspects pending observations from SQLite database, aggregates them by serial bucket
 * and reported model, and matches them against existing deterministic document registries
 * (e.g. data/batch3_pdf_document_registry.json for MS 231, 251).
 *
 * Privacy default: Serials are masked by default (REVIEW_REPORT_EXACT_SERIALS = 0).
 * Use --show-serials only for authorized engineering review.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseConnection } from '../src/databaseConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const OBSERVATION_RETENTION_POLICY = Object.freeze({
  PENDING: 'Retained for engineering review (max 180 days)',
  NEEDS_REVIEW: 'Retained during active investigation',
  CORROBORATED_FIELD_SIGNAL: 'Retained as field anomaly signal until manual verification completes',
  VERIFIED_OFFICIAL_SOURCE: 'Retained until official evidence published; raw serial purged after evidence integration',
  REJECTED: 'Raw serial purged within 30 days of review decision',
  DUPLICATE: 'Suppressed at ingestion via unique dedupe_key (zero duplicate rows)'
});

export function loadDocumentRegistry() {
  const registryPath = path.join(rootDir, 'data', 'batch3_pdf_document_registry.json');
  if (!fs.existsSync(registryPath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.documents || Object.values(raw));
    return list;
  } catch (err) {
    return [];
  }
}

export function findSourceCandidateForModel(reportedModelStr, documents = []) {
  if (!reportedModelStr) return null;
  const clean = reportedModelStr.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Extract model numbers like '251', '231', '261'
  const numMatch = clean.match(/\d{2,4}/);
  const modelNum = numMatch ? numMatch[0] : null;

  for (const doc of documents) {
    const pathStr = String(doc.source_file_path || doc.file_path || doc.title || '').toUpperCase();
    if (modelNum && pathStr.includes(modelNum)) {
      return {
        document_id: doc.document_id || 'UNKNOWN',
        title: path.basename(doc.source_file_path || doc.file_path || 'Service Manual'),
        source_file_path: doc.source_file_path || null,
        status: 'POSSIBLE_SOURCE_CANDIDATE'
      };
    }
  }

  return null;
}

export function maskSerial(serial = '') {
  if (!serial || serial.length < 4) return '***';
  return serial.slice(0, 4) + '*****';
}

export function generateFieldObservationReport(options = {}) {
  const showSerials = Boolean(options.showSerials);
  const db = getDatabaseConnection();
  const documents = loadDocumentRegistry();

  return new Promise((resolve, reject) => {
    if (!db) {
      resolve({
        total_observations: 0,
        pending_count: 0,
        groups: [],
        retention_policy: OBSERVATION_RETENTION_POLICY,
        error: 'DATABASE_UNAVAILABLE'
      });
      return;
    }

    db.all(`SELECT * FROM field_observations ORDER BY created_at DESC;`, [], (err, rows = []) => {
      if (err) {
        resolve({
          total_observations: 0,
          pending_count: 0,
          groups: [],
          retention_policy: OBSERVATION_RETENTION_POLICY,
          error: err.message
        });
        return;
      }

      const pendingRows = rows.filter((r) => r.verification_status === 'PENDING');
      const groups = [];
      const groupMap = new Map();

      for (const row of pendingRows) {
        const key = `${row.decoder_predicted_series || 'UNKNOWN'}::${row.user_reported_model_normalized}`;
        if (!groupMap.has(key)) {
          const candidate = findSourceCandidateForModel(row.user_reported_model_raw, documents);
          groupMap.set(key, {
            predicted_series: row.decoder_predicted_series,
            user_reported_model: row.user_reported_model_raw,
            normalized_model: row.user_reported_model_normalized,
            matched_model_slug: row.matched_model_slug,
            matched_model_name: row.matched_model_name,
            observation_count: 0,
            unique_serials: new Set(),
            sources: new Set(),
            source_candidate: candidate ? {
              EXISTING_SOURCE_CANDIDATE_FOUND: 'YES',
              document_id: candidate.document_id,
              title: candidate.title,
              status: candidate.status
            } : {
              EXISTING_SOURCE_CANDIDATE_FOUND: 'NO'
            },
            sample_serial: showSerials ? row.serial_normalized : maskSerial(row.serial_normalized)
          });
        }

        const g = groupMap.get(key);
        g.observation_count++;
        g.unique_serials.add(row.serial_hash);
        g.sources.add(row.observation_source);
      }

      for (const g of groupMap.values()) {
        groups.push({
          predicted_series: g.predicted_series,
          user_reported_model: g.user_reported_model,
          normalized_model: g.normalized_model,
          matched_model_slug: g.matched_model_slug,
          matched_model_name: g.matched_model_name,
          observation_count: g.observation_count,
          unique_serial_count: g.unique_serials.size,
          sources: Array.from(g.sources),
          source_candidate: g.source_candidate,
          serial_display: g.sample_serial
        });
      }

      resolve({
        total_observations: rows.length,
        pending_count: pendingRows.length,
        exact_serials_shown: showSerials ? 'YES' : 'NO',
        groups,
        retention_policy: OBSERVATION_RETENTION_POLICY
      });
    });
  });
}

// CLI Execution
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const showSerials = process.argv.includes('--show-serials');
  console.log('📋 Generating STIHL Field Observation Review Report...');
  console.log(`   EXACT_SERIALS_MODE=${showSerials ? 'ENABLED (--show-serials)' : 'MASKED (Default)'}`);

  generateFieldObservationReport({ showSerials }).then((report) => {
    console.log(`\n=== FIELD OBSERVATION SUMMARY ===`);
    console.log(`Total Observations: ${report.total_observations}`);
    console.log(`Pending Review:     ${report.pending_count}`);
    console.log(`Exact Serials:      ${showSerials ? report.exact_serials_shown : '0'}`);
    console.log(`Groups:`);

    if (report.groups.length === 0) {
      console.log('   (Geen openstaande veldobservaties gevonden)');
    } else {
      report.groups.forEach((g, idx) => {
        console.log(`  [${idx + 1}] Reported: "${g.user_reported_model}" (Normalized: ${g.normalized_model})`);
        console.log(`      Predicted Series:   ${g.predicted_series || 'Geen'}`);
        console.log(`      Observation Count:  ${g.observation_count} (Unique serials: ${g.unique_serial_count})`);
        console.log(`      Serial Display:     ${g.serial_display}`);
        console.log(`      Source Candidate:   ${g.source_candidate.EXISTING_SOURCE_CANDIDATE_FOUND === 'YES' ? `YES (${g.source_candidate.document_id} - ${g.source_candidate.title})` : 'NO'}`);
        console.log(`      Observation Sources: ${g.sources.join(', ')}`);
      });
    }

    console.log(`\nRetention Policy:`);
    Object.entries(report.retention_policy).forEach(([k, v]) => {
      console.log(`   ${k}: ${v}`);
    });
  });
}
