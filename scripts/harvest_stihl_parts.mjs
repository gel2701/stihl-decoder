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
    model: null,
    live: false,
    allModels: false,
    dryRun: false,
    refresh: false,
    sourceId: null,
    outputDir: path.join(rootDir, 'data')
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pilot') {
      options.pilot = true;
    } else if (arg === '--live') {
      options.live = true;
    } else if (arg === '--model' && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === '--all-models') {
      options.allModels = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--refresh') {
      options.refresh = true;
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

  if (options.allModels) {
    console.error('❌ ERROR: FULL_CATALOG_CRAWL_PROHIBITED: --all-models is disabled in Phase 52A (Pilot phase only). Use --pilot or --model "<name>".');
    process.exit(1);
  }

  let targetModels = [];
  if (options.pilot) {
    targetModels = [...PILOT_MODELS];
  } else if (options.model) {
    targetModels = [options.model];
  } else {
    console.log('Usage: node scripts/harvest_stihl_parts.mjs [--pilot | --model "<name>"] [--live] [--dry-run] [--refresh]');
    process.exit(1);
  }

  const mode = options.live ? 'LIVE' : 'FIXTURE';

  console.log('===============================================================');
  console.log('🚀 STIHL PARTS HARVESTER PILOT (Phase 52A-R2)');
  console.log('===============================================================');
  console.log('Execution Mode:', mode);
  console.log(`Target Models (${targetModels.length}):`, targetModels.join(', '));
  console.log('Dry Run:', options.dryRun ? 'YES (No files written)' : 'NO');
  console.log('Cache Refresh:', options.refresh ? 'YES (Force re-fetch)' : 'NO');
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
  const results = await engine.harvestModels(targetModels, options);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  const stats = results.stats;
  console.log('\n===============================================================');
  console.log('📊 HARVEST RESULTS SUMMARY');
  console.log('===============================================================');
  console.log('Execution Mode:            ', stats.mode);
  console.log('Models Requested:          ', stats.models_requested);
  console.log('Models Discovered:         ', stats.models_found);
  console.log('Variants Discovered:       ', stats.variants_found);
  console.log('Sections Discovered:       ', stats.sections_discovered);
  console.log('Sections Parsed:           ', stats.sections_parsed);
  console.log('Sections Failed:           ', stats.sections_failed);
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
  console.log('PER MODEL BREAKDOWN:');
  for (const [mName, mStats] of Object.entries(stats.per_model_summary)) {
    console.log(`  • ${mName.padEnd(10)}: unique=${mStats.unique_parts}, fitments=${mStats.fitments}, sections=${mStats.sections_parsed}/${mStats.sections_discovered}, rej=${mStats.rejected}`);
  }
  console.log(`\nCompleted in ${durationSec}s.`);
}

main().catch(err => {
  console.error('Fatal harvest error:', err);
  process.exit(1);
});
