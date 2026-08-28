import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeModelRecord, summarizeCanonicalDatabase } from '../src/canonicalData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const jsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const manifestPath = path.join(rootDir, 'data', 'canonical_manifest.json');

const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const normalizedModels = (database.models || []).map(normalizeModelRecord);

const normalizedDatabase = {
  ...database,
  meta: {
    schema_version: 3,
    canonical_store: 'json',
    canonical_file: 'data/stihl_database.json',
    sqlite_role: 'analytics_and_optional_derived_exports',
    homepage_data_source: '/api/decode',
    rebuilt_at: new Date().toISOString(),
    policy_note: 'Deze repository behandelt JSON als canonieke bron voor model- en contentdata. SQLite is afgeleid en niet de primaire bron voor modelclaims.'
  },
  models: normalizedModels
};

const summary = summarizeCanonicalDatabase(normalizedDatabase);
const manifest = {
  generated_at: new Date().toISOString(),
  schema_version: normalizedDatabase.meta.schema_version,
  canonical_file: normalizedDatabase.meta.canonical_file,
  canonical_store: normalizedDatabase.meta.canonical_store,
  sqlite_role: normalizedDatabase.meta.sqlite_role,
  model_count: summary.modelCount,
  primary_source_linked_models: summary.primarySourceLinkedModels,
  series_source_linked_models: summary.seriesSourceLinkedModels,
  primary_source_pending_models: summary.primarySourcePendingModels,
  content_hash_sha256: crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedDatabase))
    .digest('hex')
};

fs.writeFileSync(jsonPath, JSON.stringify(normalizedDatabase, null, 2), 'utf8');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(JSON.stringify({
  updated: jsonPath,
  manifest: manifestPath,
  modelCount: manifest.model_count,
  primarySourceLinkedModels: manifest.primary_source_linked_models,
  seriesSourceLinkedModels: manifest.series_source_linked_models,
  primarySourcePendingModels: manifest.primary_source_pending_models
}, null, 2));
