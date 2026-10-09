#!/usr/bin/env node
/**
 * CLI tool for STIHL Parts Harvester Pilot (Phase 52A)
 * Usage:
 *   node scripts/harvest_stihl_parts.mjs --pilot --live --refresh
 *   node scripts/harvest_stihl_parts.mjs --pilot
 *   node scripts/harvest_stihl_parts.mjs --model "MS 261" --live
 *   node scripts/harvest_stihl_parts.mjs --pilot --dry-run
 */

import path from 'path';
import { fileURLToPath } from 'url';

import { HttpClient } from '../src/parts/HttpClient.js';
import { PartsHarvesterEngine } from '../src/parts/PartsHarvesterEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PILOT_MODELS = [
  'MS 261',
  'MS 170',
  'MS 180',
  '026',
  'FS 55',
  'TS 420'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    pilot: false,
    catalog: false,
    model: null,
    live: false,
    allModels: false,
    dryRun: false,
    refresh: false,
    limit: null,
    sourceId: null,
    outputDir: path.join(rootDir, 'data')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pilot') {
      options.pilot = true;
    } else if (arg === '--catalog' || arg === '--all-models') {
      options.catalog = true;
      options.allModels = true;
    } else if (arg === '--live') {
      options.live = true;
    } else if (arg === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--refresh') {
      options.refresh = true;
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--source' && args[i + 1]) {
      options.sourceId = args[++i];
    } else if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  const mode = options.live ? 'LIVE' : 'FIXTURE';

  console.log('===============================================================');
  console.log('🚀 STIHL PARTS HARVESTER (Phase 52B Full Catalog Expansion)');
  console.log('===============================================================');
  console.log('Execution Mode:  ', mode);
  console.log('Target Scope:    ', options.catalog ? 'FULL_CATALOG' : (options.pilot ? 'PILOT_MODELS (6)' : `SINGLE_MODEL (${options.model})`));
  console.log('Dry Run:         ', options.dryRun ? 'YES (No files written)' : 'NO');
  console.log('Cache Refresh:   ', options.refresh ? 'YES (Force re-fetch)' : 'NO');
  console.log('Output Directory:', options.outputDir);
  console.log('---------------------------------------------------------------');

  const httpClient = new HttpClient({
    mode,
    refresh: options.refresh,
    timeoutMs: 15000,
    minDelayMs: options.live ? 500 : 0
  });

  const engine = new PartsHarvesterEngine({
    httpClient,
    outputDir: options.outputDir,
    dryRun: options.dryRun
  });

  const startTime = Date.now();
  let results;

  if (options.catalog) {
    results = await engine.harvestCatalog(options);
  } else {
    let targetModels = [];
    if (options.pilot) {
      targetModels = [...PILOT_MODELS];
    } else if (options.model) {
      targetModels = [options.model];
    } else {
      console.log('Usage: node scripts/harvest_stihl_parts.mjs [--catalog | --pilot | --model "<name>"] [--live] [--dry-run] [--refresh]');
      process.exit(1);
    }
    results = await engine.harvestModels(targetModels, options);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const stats = results.stats;

  console.log('\n===============================================================');
  console.log('📊 HARVEST RESULTS SUMMARY');
  console.log('===============================================================');
  console.log('Execution Mode:            ', stats.mode);
  if (options.catalog) {
    console.log('Queue Items Total:         ', stats.total_queue_items);
    console.log('Success Items:             ', stats.success_items);
    console.log('Empty Valid Items:         ', stats.empty_valid_items);
    console.log('HTTP Failed Items:         ', stats.http_failed_items);
    console.log('Parse Failed Items:        ', stats.parse_failed_items);
  } else {
    console.log('Models Requested:          ', stats.models_requested);
  }
  console.log('Models Discovered:         ', stats.models_found);
  console.log('Variants Discovered:       ', stats.variants_found);
  console.log('Sections Discovered:       ', stats.sections_discovered);
  console.log('Sections Parsed:           ', stats.sections_parsed);
  console.log('Raw Part Rows:             ', stats.raw_part_rows);
  console.log('Valid Part Rows:           ', stats.valid_part_rows);
  console.log('Unique Part Numbers:       ', stats.unique_part_numbers);
  console.log('Fitment Relations:         ', stats.fitment_relations);
  console.log('Evidence Observations:     ', stats.evidence_observations_count);
  console.log('Duplicates Collapsed:      ', stats.duplicate_rows_collapsed);
  console.log('Rejected Rows:             ', stats.rejected_rows);
  console.log('Conflicts Detected:        ', stats.conflicts_detected);
  console.log('Synthetic Canonical Records:', stats.synthetic_canonical_records);
  console.log('---------------------------------------------------------------');
  console.log('SOURCE POLICIES:');
  for (const pol of stats.source_policies || []) {
    console.log(`  • ${pol.source_id}: ${pol.decision} (HTTP ${pol.http_status}) -> ${pol.notes}`);
  }
  console.log('---------------------------------------------------------------');
  console.log('EVIDENCE BREAKDOWN:');
  console.log('  - Official STIHL:        ', stats.evidence_breakdown.official_stihl);
  console.log('  - Multi-source Corrob:   ', stats.evidence_breakdown.corroborated_multi_source);
  console.log('  - Single Structured:     ', stats.evidence_breakdown.single_structured_parts_source);
  console.log('  - Conflicted:            ', stats.evidence_breakdown.conflicted);
  console.log('---------------------------------------------------------------');

  if (stats.row_conservation) {
    console.log('---------------------------------------------------------------');
    console.log('ROW CONSERVATION ACCOUNTING:');
    console.log('  Raw Part Rows:           ', stats.row_conservation.raw_part_rows);
    console.log('  Canonical Evidence Rows: ', stats.row_conservation.canonical_evidence_rows);
    console.log('  Invalid Part Numbers:    ', stats.row_conservation.invalid_part_number_rows);
    console.log('  Noncanonical Parts:      ', stats.row_conservation.noncanonical_part_rows);
    console.log('  Duplicates Collapsed:    ', stats.row_conservation.duplicate_observations_collapsed);
    console.log('  Explicitly Rejected:     ', stats.row_conservation.explicitly_rejected_rows);
    console.log('  Unaccounted Rows:        ', stats.row_conservation.unaccounted_rows);
    console.log('  Conservation Satisfied:  ', stats.row_conservation.conservation_invariant_satisfied ? 'YES' : 'NO');
  }

  if (stats.per_category_summary) {
    console.log('PER CATEGORY BREAKDOWN:');
    for (const [cat, cStats] of Object.entries(stats.per_category_summary)) {
      console.log(`  • ${cat.padEnd(15)}: items=${cStats.items}, success=${cStats.success}, empty=${cStats.empty}, raw_parts=${cStats.raw_parts}`);
    }
  }

  if (stats.per_model_summary) {
    console.log('PER MODEL BREAKDOWN:');
    for (const [mName, mStats] of Object.entries(stats.per_model_summary)) {
      console.log(`  • ${mName.padEnd(10)}: unique=${mStats.unique_parts}, fitments=${mStats.fitments}, sections=${mStats.sections_parsed}/${mStats.sections_discovered}, rej=${mStats.rejected}`);
    }
  }

  console.log(`\nCompleted in ${durationSec}s.`);
}

main().catch(err => {
  console.error('Fatal harvest error:', err);
  process.exit(1);
});
