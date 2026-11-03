/**
 * Phase 61D — Exploded diagram availability audit (read-only).
 *
 * Counts, per model, what actually exists in the catalog:
 *  - diagram sections (distinct section_key in model_part_fitments)
 *  - real diagram images (diagram_image_url present in parts_model_configurations)
 *  - parts with a meaningful diagram position
 *  - parts without any image
 *
 * Never fetches, embeds or republishes third-party artwork. With --probe it only
 * performs a HEAD request per distinct image host to record accessibility.
 *
 * Usage: node scripts/phase61d_audit_diagrams.mjs [--probe]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const probe = process.argv.includes('--probe');

const PRIORITY_MODELS = [
  { key: 'fs_460', label: 'FS 460 C-EM' },
  { key: 'ms_440', label: 'MS 440' },
  { key: 'ms_261', label: 'MS 261' },
  { key: 'ms_170', label: 'MS 170' },
  { key: 'fs_350', label: 'FS 350' }
];

const configurations = JSON.parse(
  fs.readFileSync(path.join(root, 'data', 'parts_model_configurations.json'), 'utf8')
).configurations || [];

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'parts_catalog.json'), 'utf8'));

let Database = null;
try {
  Database = (await import('better-sqlite3')).default;
} catch (err) {
  console.error('better-sqlite3 is required for the diagram audit');
  throw err;
}
const db = new Database(path.join(root, 'data', 'stihl_database.db'), { readonly: true });

const MODEL_STATS_SQL = `
  SELECT canonical_model_id AS model_id,
         COUNT(*) AS fitments,
         COUNT(DISTINCT section_key) AS sections,
         COUNT(DISTINCT CASE WHEN diagram_position IS NOT NULL AND diagram_position <> '' THEN diagram_position END) AS distinct_positions,
         COUNT(DISTINCT CASE WHEN diagram_position IS NOT NULL
                   AND diagram_position <> ''
                   AND diagram_position NOT IN ('-1', '0', 'null', 'undefined')
                  THEN part_number END) AS positioned_parts,
         COUNT(DISTINCT part_number) AS unique_parts
  FROM model_part_fitments
  WHERE canonical_model_id = ?
  GROUP BY canonical_model_id`;

function imageStatsForModel(modelId) {
  const rows = configurations.filter(c => c.canonical_model_id === modelId);
  const withImage = rows.filter(c => c.diagram_image_url);
  const hosts = {};
  for (const c of withImage) {
    try {
      const host = new URL(c.diagram_image_url).hostname;
      hosts[host] = (hosts[host] || 0) + 1;
    } catch {}
  }
  return {
    configurations: rows.length,
    configurations_with_image: withImage.length,
    distinct_image_urls: new Set(withImage.map(c => c.diagram_image_url)).size,
    image_hosts: hosts,
    sources: Array.from(new Set(rows.map(c => c.source_id || 'unknown')))
  };
}

const models = PRIORITY_MODELS.map(({ key, label }) => {
  const row = db.prepare(MODEL_STATS_SQL).get(key) || {
    model_id: key, fitments: 0, sections: 0, distinct_positions: 0, positioned_parts: 0, unique_parts: 0
  };
  const images = imageStatsForModel(key);
  return {
    model_id: key,
    model_label: label,
    present_in_catalog: row.fitments > 0,
    sections: row.sections,
    fitments: row.fitments,
    unique_parts: row.unique_parts,
    parts_with_position: row.positioned_parts,
    parts_without_position: row.unique_parts - row.positioned_parts,
    distinct_positions: row.distinct_positions,
    real_diagram_images: images.distinct_image_urls,
    configurations: images.configurations,
    configurations_with_image: images.configurations_with_image,
    image_hosts: images.image_hosts,
    configuration_sources: images.sources,
    public_diagram_images: 0,
    parts_without_visual: row.unique_parts
  };
});

const totals = {
  models_audited: models.length,
  models_with_sections: models.filter(m => m.sections > 0).length,
  models_with_real_images: models.filter(m => m.configurations_with_image > 0).length,
  public_diagram_images: models.reduce((a, m) => a + m.public_diagram_images, 0),
  parts_with_position: models.reduce((a, m) => a + m.parts_with_position, 0),
  parts_without_visual: models.reduce((a, m) => a + m.parts_without_visual, 0)
};

const globalImages = configurations.filter(c => c.diagram_image_url);
const sourceAudit = [{
  source_id: 'gardenhirespares',
  host: 'www.gardenhirespares.co.uk',
  configurations_with_image: globalImages.length,
  images_reachable: probe ? null : 'NOT_PROBED',
  model_binding: 'source model + configuration key recorded per row',
  position_binding: 'section/diagram positions originate from the same catalog rows',
  reuse_rights: 'NO_LICENSE_GRANT_FOUND',
  decision: 'EXTERNAL_LINK_ONLY_NOT_EMBEDDED',
  rationale: 'STIHL IPL artwork is copyright-protected; no reuse licence from the merchant was found. Images stay out of the public product.'
}, {
  source_id: 'stihl_ipl',
  host: 'stihl.com',
  configurations_with_image: 0,
  images_reachable: 'NOT_AVAILABLE',
  reuse_rights: 'COPYRIGHT_ANDREAS_STIHL',
  decision: 'NOT_PUBLISHED',
  rationale: 'No licensed STIHL exploded-view artwork is present in the repository or database.'
}];

if (probe && globalImages.length > 0) {
  const testUrl = globalImages[0].diagram_image_url;
  try {
    const res = await fetch(testUrl, { method: 'HEAD' });
    sourceAudit[0].images_reachable = res.ok ? 'HTTP_' + res.status : 'HTTP_' + res.status;
    sourceAudit[0].probed_url = testUrl;
  } catch (err) {
    sourceAudit[0].images_reachable = 'PROBE_FAILED';
    sourceAudit[0].probe_error = String(err && err.message || err);
  }
}

const report = {
  schema_version: '1.0.0',
  phase: '61D',
  generated_at_utc: new Date().toISOString(),
  read_only: true,
  catalog_parts: catalog.parts.length,
  priority_models: models,
  totals,
  source_audit: sourceAudit,
  conclusion: {
    real_diagrams_publicly_available: 0,
    legally_embeddable: 0,
    representation: 'De publieke site toont onderdelenlijsten met tekeningposities, geen explosietekening-afbeeldingen.'
  }
};

const outPath = path.join(root, 'PHASE61D_DIAGRAM_AUDIT.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ totals, per_model: models.map(m => ({
  model: m.model_label,
  found: m.present_in_catalog,
  sections: m.sections,
  positioned: m.parts_with_position,
  real_images: m.real_diagram_images,
  public_images: m.public_diagram_images
})) }, null, 2));
db.close();
