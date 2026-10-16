#!/usr/bin/env node
/**
 * Phase 54F-A-R2: Provenance & Scope Validator CLI
 *
 * Validates that all candidate section enrichments in parts_section_enrichment.json
 * obey the fundamental rule:
 * "evidence specificity >= claim specificity"
 *
 * Exits 0 on SUCCESS, 1 on FAILURE.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { EnrichmentScopeValidator, SCOPES } from '../src/parts/EnrichmentScopeValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(DB_PATH, { readonly: true });

const ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');
const OBSERVATIONS_FILE = path.join(rootDir, 'data', 'harvest', 'phase54f', 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(rootDir, 'data', 'harvest', 'phase54f', 'accepted_evidence.jsonl');

console.log('===============================================================');
console.log('🔍 PHASE 54F-A-R2 PROVENANCE & SCOPE VALIDATOR');
console.log('===============================================================\n');

if (!fs.existsSync(ENRICHMENT_FILE)) {
  console.error(`❌ Enrichment file not found: ${ENRICHMENT_FILE}`);
  process.exit(1);
}

const enrichmentDoc = JSON.parse(fs.readFileSync(ENRICHMENT_FILE, 'utf8'));
const enrichments = enrichmentDoc.enrichments || [];
console.log(`Loaded ${enrichments.length} candidate enrichments.`);

// Load observations map
const observations = fs.readFileSync(OBSERVATIONS_FILE, 'utf8')
  .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

const evidenceMap = new Map();
for (const o of observations) {
  evidenceMap.set(o.evidence_id, o);
}
console.log(`Loaded ${evidenceMap.size} raw observations.`);

// Load canonical fitments map
const fitmentRows = db.prepare(`
  SELECT fitment_id, canonical_model_id, variant_key, configuration_key, fitment_scope, part_number, section_name
  FROM model_part_fitments
`).all();

const fitmentMap = new Map();
for (const f of fitmentRows) {
  fitmentMap.set(f.fitment_id, f);
}
console.log(`Loaded ${fitmentMap.size} canonical fitments from database.`);

// Run validation
const result = EnrichmentScopeValidator.validateEnrichmentSet(enrichments, evidenceMap, fitmentMap);

console.log('\n--- SCOPE VALIDATION RESULTS ---');
console.log(`TOTAL_ENRICHMENTS:                         ${result.total}`);
console.log(`VALID_ENRICHMENTS:                         ${result.valid_count}`);
console.log(`INVALID_ENRICHMENTS:                       ${result.invalid_count}`);
console.log(`MODEL_LEVEL_TO_EXACT_VARIANT_LEAKAGE:      ${result.model_level_to_exact_variant_leakage}`);
console.log(`NULL_VARIANT_KEY_EXACT_VARIANT_ENRICHMENTS: ${result.null_variant_key_exact_variant_enrichments}`);

if (result.invalid_count > 0) {
  console.error(`\n❌ VALIDATION FAILED: Found ${result.invalid_count} invalid enrichments violating scope policy!`);
  console.error('First 5 failures:');
  console.error(JSON.stringify(result.failures.slice(0, 5), null, 2));
  process.exit(1);
}

console.log('\n✅ PROVENANCE & SCOPE VALIDATION PASSED (0 ERRORS)\n');
