import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const canonicalDatabase = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const canonicalManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'canonical_manifest.json'), 'utf8'));
const seedScript = fs.readFileSync(path.join(rootDir, 'data', 'seed.cjs'), 'utf8');
const phase33eScript = fs.readFileSync(path.join(rootDir, 'scripts', 'phase33e_source_integrity_audit.js'), 'utf8');
const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
const homepage = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const models = canonicalDatabase.models || [];
const linkedModels = models.filter((model) => model.data_status === 'PRIMARY_SOURCE_LINKED');
const seriesLinkedModels = models.filter((model) => model.data_status === 'SERIES_SOURCE_LINKED');
const pendingModels = models.filter((model) => model.data_status === 'PRIMARY_SOURCE_PENDING');

assert.ok(models.length > 0, 'canonical database should contain models');
assert.strictEqual(canonicalDatabase.meta?.canonical_store, 'json');
assert.strictEqual(canonicalDatabase.meta?.sqlite_role, 'analytics_and_optional_derived_exports');

assert.strictEqual(linkedModels.length, canonicalManifest.primary_source_linked_models);
assert.strictEqual(seriesLinkedModels.length, canonicalManifest.series_source_linked_models);
assert.strictEqual(pendingModels.length, canonicalManifest.primary_source_pending_models);

for (const model of models) {
  assert.notStrictEqual(model.specs_verified, true, `legacy specs_verified flag should not stay true for ${model.slug}`);
  assert.strictEqual(model.production_confidence, 'UNKNOWN', `production_confidence should be UNKNOWN for ${model.slug}`);
}

assert.match(seedScript, /readCanonicalDatabase/);
assert.match(seedScript, /SQLite database rebuilt from canonical JSON/);
assert.doesNotMatch(seedScript, /const modelsData = \[/);

assert.match(phase33eScript, /audit_mode: 'report_only'/);
assert.match(phase33eScript, /phase33e_source_integrity_report\.json/);
assert.doesNotMatch(phase33eScript, /fs\.writeFileSync\(jsonPath/);

assert.match(readme, /Canonieke databron: `data\/stihl_database\.json`/);
assert.match(readme, /PRIMARY_SOURCE_PENDING/);

assert.doesNotMatch(homepage, /window\.STIHL_DATABASE\s*=/);
assert.match(homepage, /decodeEndpoint/);

console.log('✅ Canonical policy checks passed.');
