import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function latestJson(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Input directory not found: ${dir}`);
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error(`No JSON harvest files found in ${dir}`);
  return path.join(dir, files[0].name);
}

const explicitInput = argValue('--input');
const inputDir = path.resolve(ROOT, argValue('--input-dir', 'data/candidate_evidence/official_products'));
const inputPath = explicitInput ? path.resolve(ROOT, explicitInput) : latestJson(inputDir);
const outDir = path.resolve(ROOT, argValue('--out', 'data/generated/official_product_reports'));

const harvest = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const counters = { MATCH: 0, DATABASE_MISSING: 0, CONFLICT_REVIEW_REQUIRED: 0 };
const newModels = [];
const matchedModels = [];
const conflicts = [];
const additions = [];
const manuals = [];
const productReferences = [];

for (const row of harvest.results || []) {
  const candidate = row.candidate || {};
  const comparison = row.comparison || {};
  if (candidate.manual_url) manuals.push({ model_name: candidate.model_name, url: candidate.manual_url });
  if (candidate.product_reference) productReferences.push({ model_name: candidate.model_name, reference: candidate.product_reference });
  if (comparison.model_match) matchedModels.push({ model_name: candidate.model_name, database_model_id: comparison.database_model_id });
  else newModels.push({ model_name: candidate.model_name, product_reference: candidate.product_reference, source_url: candidate.source_url });

  for (const [field, detail] of Object.entries(comparison.comparison || {})) {
    if (detail.status in counters) counters[detail.status] += 1;
    const record = {
      model_name: candidate.model_name,
      database_model_id: comparison.database_model_id,
      field,
      current: detail.current,
      incoming: detail.incoming,
      source_url: candidate.source_url,
      market: candidate.market
    };
    if (detail.status === 'CONFLICT_REVIEW_REQUIRED') conflicts.push(record);
    if (detail.status === 'DATABASE_MISSING') additions.push(record);
  }
}

const unique = (rows, key) => [...new Map(rows.map((row) => [row[key], row])).values()];
const summary = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_harvest: path.relative(ROOT, inputPath),
  market: harvest.market,
  source_class: harvest.source_class,
  automatic_promotion_allowed: false,
  requested_urls: harvest.requested_urls || 0,
  harvested: harvest.harvested || 0,
  failed: harvest.failed || 0,
  matched_models: unique(matchedModels, 'model_name').length,
  new_models: unique(newModels, 'model_name').length,
  official_manuals_found: unique(manuals, 'url').length,
  product_references_found: productReferences.length,
  field_comparison: counters,
  review_required: conflicts.length > 0 || additions.length > 0 || newModels.length > 0,
  new_model_candidates: unique(newModels, 'model_name'),
  database_addition_candidates: additions,
  conflicts,
  official_manuals: unique(manuals, 'url'),
  errors: harvest.errors || []
};

fs.mkdirSync(outDir, { recursive: true });
const stamp = String(harvest.run_at || new Date().toISOString()).replace(/[:.]/g, '-');
const jsonPath = path.join(outDir, `official_product_report_${harvest.market || 'UNKNOWN'}_${stamp}.json`);
const mdPath = jsonPath.replace(/\.json$/, '.md');
fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

const lines = [
  '# Official STIHL Product Harvest Report',
  '',
  `- Market: **${summary.market}**`,
  `- Requested product URLs: **${summary.requested_urls}**`,
  `- Successfully harvested: **${summary.harvested}**`,
  `- Failed: **${summary.failed}**`,
  `- Existing models matched: **${summary.matched_models}**`,
  `- New model candidates: **${summary.new_models}**`,
  `- Official manuals found: **${summary.official_manuals_found}**`,
  `- STIHL product references found: **${summary.product_references_found}**`,
  `- Field matches: **${counters.MATCH}**`,
  `- Missing database fields: **${counters.DATABASE_MISSING}**`,
  `- Conflicts requiring review: **${counters.CONFLICT_REVIEW_REQUIRED}**`,
  '- Automatic promotion: **DISABLED**',
  '',
  '## New model candidates',
  '',
  ...summary.new_model_candidates.slice(0, 100).map((r) => `- ${r.model_name}${r.product_reference ? ` — ${r.product_reference}` : ''}`),
  '',
  '## Database additions',
  '',
  ...summary.database_addition_candidates.slice(0, 200).map((r) => `- ${r.model_name}: ${r.field} = ${JSON.stringify(r.incoming)}`),
  '',
  '## Conflicts requiring review',
  '',
  ...summary.conflicts.slice(0, 200).map((r) => `- ${r.model_name}: ${r.field} — database ${JSON.stringify(r.current)} vs ${r.market} ${JSON.stringify(r.incoming)}`),
  '',
  '## Errors',
  '',
  ...(summary.errors.length ? summary.errors.map((e) => `- ${e.url}: ${e.error}`) : ['- None'])
];
fs.writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');

console.log(JSON.stringify({ report_json: path.relative(ROOT, jsonPath), report_markdown: path.relative(ROOT, mdPath), ...summary }, null, 2));
