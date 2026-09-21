import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_SERIALS = [
  // Plant 1
  '110000000', '120000000', '135000000', '140000000', '145000000',
  '150000000', '155000000', '160000000', '161984210', '165000000',
  '169999999', '170000000', '171000000', '175000000', '178456789',
  '179999999', '180000000', '184592301', '185000000', '190000000',
  '199999999',
  // Plant 2
  '220000000', '250000000', '270000000', '280000000', '289999999',
  // Plant 3
  '330000000', '340000000', '350000000',
  // Plant 4
  '410000000', '450000000',
  // Plant 5
  '510000000', '550000000',
  // Plant 8
  '800000000', '810000000', '824061159', '850000000', '899999999',
  // Plant 9
  '910000000', '950000000'
];

const COMMITS_TO_AUDIT = [
  { commit: '4c0de6f', label: 'v1.1 initial release (13 serial_ranges)' },
  { commit: '90bb431', label: 'v2.0 engine (4 serial_breakpoints)' },
  { commit: '40d3cb7', label: 'Serial Breakpoints Engine (5 ranges, 25M MS260 range)' },
  { commit: 'a43b6e3', label: 'Pilot SEO Engine (3 ranges, MS201 dropped)' },
  { commit: 'c3cf8a4', label: 'Restoration fallback (14/15/16->MS260, 17/18->MS261)' },
  { commit: '1f7dacb', label: 'FASE 34 zero fallback (stripped startsWith fallbacks)' },
  { commit: 'fcc2765', label: 'Phase 35C.4.3.2.2.3 (block unevidenced breakpoint specs)' },
  { commit: 'ff23744', label: 'Phase 36 (SerialChronologyResolver, model assist, 3 ranges)' },
  { commit: '00fd2c8', label: 'Phase 45D baseline (current production HEAD)' }
];

const EVAL_RUNNER_CODE = `
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const serials = JSON.parse(process.env.AUDIT_SERIALS || '[]');
  let database = {};
  const dbPath = path.join(__dirname, 'data', 'stihl_database.json');
  if (fs.existsSync(dbPath)) {
    database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
  const evidencePath = path.join(__dirname, 'data', 'public_evidence_facts.json');
  if (fs.existsSync(evidencePath)) {
    database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  }

  const decoderModule = await import('./src/decoder.js');
  const results = {};

  for (const serial of serials) {
    try {
      let res;
      if (typeof decoderModule.decodeStihlCode === 'function') {
        res = decoderModule.decodeStihlCode(serial, database);
      } else if (typeof decoderModule.analyzeSerialNumber === 'function') {
        res = decoderModule.analyzeSerialNumber(serial, database, null);
      } else {
        res = { error: 'No decoder function found' };
      }

      results[serial] = {
        model: res.model || null,
        exactModel: res.exactModel || null,
        probableModelSeries: res.probableModelSeries || null,
        modelIdentityStatus: res.modelIdentityStatus || (res.model ? 'LEGACY_RESOLVED' : 'UNKNOWN'),
        factoryCode: res.factory?.code || res.factory?.digit || serial.charAt(0),
        factoryCountry: res.factory?.country || null,
        factoryLocation: res.factory?.location || null,
        estimatedYears: res.estimatedYears || res.productionPeriod?.yearRangeFormatted || null,
        confidence: res.confidence || null,
        technicalSpecsCount: res.technicalSpecs ? Object.keys(res.technicalSpecs).length : 0
      };
    } catch (err) {
      results[serial] = {
        error: err.message
      };
    }
  }

  process.stdout.write(JSON.stringify(results));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

async function auditHistoricalCommits() {
  console.log('▶ Starting historical decoder regression audit...');
  const matrix = {
    generated_at: new Date().toISOString(),
    serials_tested: TEST_SERIALS,
    commits: []
  };

  const tempBase = path.join(os.tmpdir(), 'stihl-recovery-worktree-' + Date.now());

  for (const item of COMMITS_TO_AUDIT) {
    console.log(`Checking commit ${item.commit}: ${item.label}...`);
    const tempDir = path.join(tempBase, item.commit);
    try {
      fs.mkdirSync(path.dirname(tempDir), { recursive: true });
      execSync(`git worktree add --detach "${tempDir}" ${item.commit}`, { cwd: rootDir, stdio: 'pipe' });

      // Write runner script into worktree
      const runnerPath = path.join(tempDir, 'eval_runner.mjs');
      fs.writeFileSync(runnerPath, EVAL_RUNNER_CODE, 'utf8');

      // Execute runner
      const out = execSync(`node eval_runner.mjs`, {
        cwd: tempDir,
        env: { ...process.env, AUDIT_SERIALS: JSON.stringify(TEST_SERIALS) },
        maxBuffer: 10 * 1024 * 1024
      }).toString();

      const results = JSON.parse(out);

      // Compute stats
      let ms260Count = 0;
      let ms261Count = 0;
      let otherCount = 0;
      let unassignedCount = 0;
      const modelCounts = {};

      for (const [serial, r] of Object.entries(results)) {
        const m = r.model || r.exactModel || r.probableModelSeries || 'UNKNOWN';
        modelCounts[m] = (modelCounts[m] || 0) + 1;
        if (m.includes('260') || (r.probableModelSeries && r.probableModelSeries.includes('260'))) {
          ms260Count++;
        } else if (m.includes('261') || (r.probableModelSeries && r.probableModelSeries.includes('261'))) {
          ms261Count++;
        } else if (m === 'UNKNOWN' || m === 'Onbekend Model' || m === 'Nog niet definitief bevestigd' || m === 'STIHL Benzine / Accu Machine' || m === 'STIHL Benzine Machine' || m === null) {
          unassignedCount++;
        } else {
          otherCount++;
        }
      }

      const total = TEST_SERIALS.length;
      matrix.commits.push({
        commit: item.commit,
        label: item.label,
        summary: {
          total_tested: total,
          ms260_count: ms260Count,
          ms260_percent: Number(((ms260Count / total) * 100).toFixed(1)),
          ms261_count: ms261Count,
          ms261_percent: Number(((ms261Count / total) * 100).toFixed(1)),
          other_model_count: otherCount,
          other_model_percent: Number(((otherCount / total) * 100).toFixed(1)),
          unassigned_count: unassignedCount,
          unassigned_percent: Number(((unassignedCount / total) * 100).toFixed(1)),
          distribution: modelCounts
        },
        results
      });

    } catch (err) {
      console.error(`Failed auditing commit ${item.commit}:`, err.message);
      matrix.commits.push({
        commit: item.commit,
        label: item.label,
        error: err.message
      });
    } finally {
      try {
        execSync(`git worktree remove --force "${tempDir}"`, { cwd: rootDir, stdio: 'pipe' });
      } catch (e) {}
    }
  }

  // Cleanup temp base
  try {
    fs.rmSync(tempBase, { recursive: true, force: true });
  } catch (e) {}

  const outputPath = path.join(rootDir, 'data', 'serial_recovery_historical_behavior_matrix.json');
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2), 'utf8');
  console.log(`✅ Historical behavior matrix written to ${outputPath}`);
}

auditHistoricalCommits().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
