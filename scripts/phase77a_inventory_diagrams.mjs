/**
 * Phase 77A — Existing STIHL exploded-diagram inventory (read-only).
 *
 * Inventories every previously collected archive that is reachable from this
 * checkout, extracts diagram image references, deduplicates them, links them to
 * the existing parts database and records a rights status per source.
 *
 * It never downloads artwork, never publishes an image and never mutates catalog
 * data. Output lands in output/phase77a/.
 *
 * Usage:
 *   node scripts/phase77a_inventory_diagrams.mjs
 *   PHASE77A_ARCHIVE_ROOTS="/path/a;/path/b" node scripts/phase77a_inventory_diagrams.mjs
 *
 * The named Windows archives from the assignment are probed and reported as
 * unavailable when this script runs on a machine that does not have them.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77a');
fs.mkdirSync(outDir, { recursive: true });

const GENERATED_AT = new Date().toISOString();
const IMAGE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif', '.tif', '.tiff'];
const TEXT_EXTENSIONS = ['.json', '.md', '.html', '.htm'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'playwright-report', 'test-results']);

const DEFAULT_ARCHIVE_ROOTS = [
  'C:\\Users\\GelliusSnippe\\.agents\\stihl_scribd_documents_output',
  'stihl_archive_downloads',
  'stihl_gardenhirespares_output',
  'stihl_models_full_documentation_archive',
  'data',
  'output',
  'reports',
  'docs'
];

const archiveRoots = (process.env.PHASE77A_ARCHIVE_ROOTS || '')
  .split(/[;\n]/)
  .map(s => s.trim())
  .filter(Boolean);

const rootsToScan = archiveRoots.length ? archiveRoots : DEFAULT_ARCHIVE_ROOTS;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = (file) => sha256(fs.readFileSync(file));
const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .replace(/&amp;/g, '&')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Archive roots + local file inventory
// ---------------------------------------------------------------------------
function walk(dir, depth, state, limitDepth = 12) {
  if (depth > limitDepth) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    state.unreadable.push({ path: dir, error: String(err && err.code || err) });
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, depth + 1, state, limitDepth);
    } else if (entry.isFile()) {
      if (full.startsWith(outDir + path.sep)) continue;
      state.files.push(full);
    }
  }
}

const rootReports = [];
const localFiles = [];
for (const configured of rootsToScan) {
  const resolved = path.isAbsolute(configured) ? configured : path.join(root, configured);
  const exists = fs.existsSync(resolved);
  const report = {
    configured_path: configured,
    resolved_path: resolved,
    exists,
    accessible: false,
    files_scanned: 0,
    images: 0,
    pdfs: 0,
    note: exists ? null : 'NOT_PRESENT_IN_THIS_CHECKOUT'
  };
  if (exists) {
    const state = { files: [], unreadable: [] };
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) walk(resolved, 0, state);
      else state.files.push(resolved);
      report.accessible = state.unreadable.length === 0;
      if (state.unreadable.length) report.unreadable_paths = state.unreadable.slice(0, 10);
    } catch (err) {
      report.note = `SCAN_FAILED: ${String(err && err.code || err)}`;
    }
    report.files_scanned = state.files.length;
    report.images = state.files.filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())).length;
    report.pdfs = state.files.filter(f => path.extname(f).toLowerCase() === '.pdf').length;
    localFiles.push(...state.files);
  }
  rootReports.push(report);
}

const uniqueLocalFiles = [...new Set(localFiles)];
const extensionCounts = {};
let totalBytes = 0;
for (const file of uniqueLocalFiles) {
  const ext = path.extname(file).toLowerCase() || '(none)';
  extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  try { totalBytes += fs.statSync(file).size; } catch {}
}

// Local artwork + PDFs (hash + embedded image objects)
const filesSeen = new Set();
const localImages = [];
const pdfInventory = [];
for (const file of uniqueLocalFiles) {
  const ext = path.extname(file).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) continue;
  if (filesSeen.has(file)) continue;
  filesSeen.add(file);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (ext === '.pdf') {
    const buffer = fs.readFileSync(file);
    const text = buffer.toString('latin1');
    const embedded = (text.match(/\/Subtype\s*\/Image/g) || []).length;
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    pdfInventory.push({
      path: rel,
      bytes: buffer.length,
      pages_estimate: pages,
      embedded_image_objects: embedded,
      sha256: sha256(buffer),
      classification: 'PDF_DOCUMENT_ARTWORK_UNVERIFIED',
      publication_status: 'PUBLICATION_RESTRICTED'
    });
    continue;
  }
  localImages.push({
    path: rel,
    bytes: fs.statSync(file).size,
    sha256: sha256File(file),
    classification: classifyLocalImage(rel)
  });
}

function classifyLocalImage(relPath) {
  const p = relPath.toLowerCase();
  if (/favicon|apple-touch|icon-|logo/.test(p)) return 'SITE_ICON_OR_LOGO';
  if (/(^|\/)(tekening|diagram|exploded|ipl|parts-?list)/.test(p)) return 'LOCAL_DIAGRAM_CANDIDATE';
  return 'LOCAL_IMAGE_UNCLASSIFIED';
}

// Image references inside JSON/MD/HTML artifacts (source metadata, not artwork itself)
const referencePattern = /(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:png|jpe?g|webp|svg|gif|avif)(?:\?[^\s"'<>()\\]*)?/gi;
const imageReferences = [];
const textFilesScanned = [];
for (const file of uniqueLocalFiles) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXTENSIONS.includes(ext)) continue;
  let content;
  try {
    const stat = fs.statSync(file);
    if (stat.size > 40 * 1024 * 1024) continue;
    content = fs.readFileSync(file, 'utf8');
  } catch { continue; }
  textFilesScanned.push(path.relative(root, file).replace(/\\/g, '/'));
  const matches = content.match(referencePattern);
  if (!matches) continue;
  for (const raw of new Set(matches)) {
    imageReferences.push({
      source_file: path.relative(root, file).replace(/\\/g, '/'),
      url: raw.startsWith('//') ? `https:${raw}` : raw
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Diagram inventory from the GHS catalog (the only real artwork references)
// ---------------------------------------------------------------------------
const configurations = readJson('data/parts_model_configurations.json').configurations || [];
const stihlDb = new DatabaseSync(path.join(root, 'data', 'stihl_database.db'), { readOnly: true });
const partsCount = stihlDb.prepare('SELECT COUNT(*) AS c FROM parts').get().c;

const fitmentModels = new Set(
  stihlDb.prepare('SELECT DISTINCT canonical_model_id AS m FROM model_part_fitments').all().map(r => r.m).filter(Boolean)
);
const sectionRows = stihlDb.prepare(`
  SELECT canonical_model_id AS model_id, variant_key, section_key, section_name,
         COUNT(*) AS fitments,
         COUNT(DISTINCT part_number) AS parts,
         COUNT(DISTINCT CASE WHEN diagram_position IS NOT NULL
                   AND diagram_position NOT IN ('0', '-1', 'null', 'undefined')
                  THEN diagram_position END) AS positions
  FROM model_part_fitments
  WHERE section_key IS NOT NULL AND section_key <> 'general_unresolved'
  GROUP BY canonical_model_id, variant_key, section_key, section_name
`).all();

const sectionsByModel = new Map();
for (const row of sectionRows) {
  if (!sectionsByModel.has(row.model_id)) sectionsByModel.set(row.model_id, []);
  sectionsByModel.get(row.model_id).push(row);
}

const partsWithPositionStmt = stihlDb.prepare(`
  SELECT part_number, diagram_position
  FROM model_part_fitments
  WHERE canonical_model_id = ? AND section_key = ? AND diagram_position IS NOT NULL
    AND diagram_position NOT IN ('0', '-1', 'null', 'undefined')
  ORDER BY CAST(diagram_position AS INTEGER), part_number
`);
const partNameStmt = stihlDb.prepare('SELECT part_name FROM parts WHERE part_number = ?');

const diagramRows = configurations.filter(row => row.diagram_image_url);
const diagramByUrl = new Map();
for (const row of diagramRows) {
  const url = String(row.diagram_image_url).trim();
  const key = url.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  if (!diagramByUrl.has(key)) {
    diagramByUrl.set(key, {
      asset_id: `ghs-${sha256(key).slice(0, 16)}`,
      classification: 'EXPLODED_DIAGRAM_SHEET',
      source_id: row.source_id || 'ghs',
      source_host: safeHost(url),
      url,
      url_sha256: sha256(key),
      source_page_url: row.source_url || null,
      rights_status: 'RIGHTS_UNKNOWN',
      publication_allowed: false,
      storage: 'REFERENCE_ONLY_NOT_DOWNLOADED',
      model_ids: new Set(),
      section_codes: new Set(),
      section_titles: new Set(),
      occurrences: 0
    });
  }
  const asset = diagramByUrl.get(key);
  asset.occurrences += 1;
  asset.model_ids.add(row.canonical_model_id);
  if (row.diagram_code) asset.section_codes.add(row.diagram_code);
  if (row.diagram_title) asset.section_titles.add(row.diagram_title);
}
const diagramAssets = [...diagramByUrl.values()].map(asset => {
  const titles = [...asset.section_titles];
  const isTorqueTable = titles.length > 0 && titles.every(t => /tightening torque/i.test(t));
  return {
    ...asset,
    classification: isTorqueTable ? 'TIGHTENING_TORQUE_TABLE' : 'EXPLODED_DIAGRAM_SHEET',
    model_ids: [...asset.model_ids].sort(),
    section_codes: [...asset.section_codes].sort(),
    section_titles: titles.sort()
  };
});

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// Duplicate reference groups (same URL referenced by more than one configuration row)
const duplicateGroups = [...diagramRows.reduce((acc, row) => {
  const url = String(row.diagram_image_url).trim();
  if (!acc.has(url)) acc.set(url, []);
  acc.get(url).push(`${row.canonical_model_id}:${row.configuration_key}`);
  return acc;
}, new Map()).entries()].filter(([, refs]) => refs.length > 1)
  .map(([url, refs]) => ({ url, occurrences: refs.length, references: refs.sort() }));

// ---------------------------------------------------------------------------
// 3. Model / section / position binding
// ---------------------------------------------------------------------------
const modelIdsWithDiagram = [...new Set(diagramRows.map(r => r.canonical_model_id))].sort();
const modelsBound = modelIdsWithDiagram.filter(id => fitmentModels.has(id));
const modelsUnbound = modelIdsWithDiagram.filter(id => !fitmentModels.has(id));

const linkedSections = [];
const linkedPositions = new Map();
const linkedParts = new Set();
const unboundSections = [];
let variantConflicts = 0;

for (const row of diagramRows) {
  const candidates = sectionsByModel.get(row.canonical_model_id) || [];
  const target = normalizeText(row.diagram_title || row.configuration_name);
  let hit = candidates.find(sec => normalizeText(sec.section_name) === target);
  if (!hit) {
    hit = candidates.find(sec => {
      const dbName = normalizeText(sec.section_name);
      return dbName && (target.startsWith(dbName) || dbName.startsWith(target)) && Math.abs(dbName.length - target.length) <= 12;
    });
  }
  if (!hit) {
    unboundSections.push({
      model_id: row.canonical_model_id,
      configuration_key: row.configuration_key,
      section_title: row.diagram_title || row.configuration_name,
      reason: fitmentModels.has(row.canonical_model_id) ? 'SECTION_NAME_NOT_RESOLVED_IN_CATALOG' : 'MODEL_NOT_IN_CATALOG'
    });
    continue;
  }

  const variantMatches = !row.variant_key || !hit.variant_key || row.variant_key === hit.variant_key;
  if (!variantMatches) {
    variantConflicts += 1;
    unboundSections.push({
      model_id: row.canonical_model_id,
      configuration_key: row.configuration_key,
      section_title: row.diagram_title || row.configuration_name,
      reason: 'VARIANT_CONFLICT_REQUIRES_REVIEW'
    });
    continue;
  }

  const positions = partsWithPositionStmt.all(row.canonical_model_id, hit.section_key);
  const positionEntries = [];
  const seenPositions = new Set();
  for (const entry of positions) {
    const positionKey = `${entry.diagram_position}::${entry.part_number}`;
    if (seenPositions.has(positionKey)) continue;
    seenPositions.add(positionKey);
    linkedParts.add(entry.part_number);
    const key = `${row.canonical_model_id}::${hit.section_key}::${entry.diagram_position}`;
    if (!linkedPositions.has(key)) linkedPositions.set(key, entry.part_number);
    positionEntries.push({ position: entry.diagram_position, part_number: entry.part_number });
  }

  linkedSections.push({
    asset_url: row.diagram_image_url,
    model_id: row.canonical_model_id,
    variant_key: row.variant_key || null,
    ghs_configuration_key: row.configuration_key,
    ghs_section_code: row.diagram_code || null,
    ghs_section_title: row.diagram_title || row.configuration_name,
    catalog_section_key: hit.section_key,
    catalog_section_name: hit.section_name,
    catalog_variant_key: hit.variant_key || null,
    confidence: 'SECTION_AND_VARIANT_MATCH',
    catalog_fitments: hit.fitments,
    catalog_parts: hit.parts,
    catalog_positions: hit.positions,
    position_entries: positionEntries
  });
}

// ---------------------------------------------------------------------------
// 4. Rights audit
// ---------------------------------------------------------------------------
const localArchiveDocumentCounts = {};
for (const relPath of ['data/batch2_document_registry.json', 'data/additional_sources_document_registry.json', 'data/batch3_pdf_document_registry.json']) {
  try {
    const doc = readJson(relPath);
    localArchiveDocumentCounts[relPath] = (doc.documents || []).length;
  } catch {
    localArchiveDocumentCounts[relPath] = null;
  }
}

const registries = ['data/additional_sources_document_registry.json', 'data/batch2_document_registry.json']
  .map(relPath => {
    try { return { relPath, documents: readJson(relPath).documents || [] }; } catch { return { relPath, documents: [] }; }
  });

const registryText = (doc) => [doc.source_url, doc.source_file_path, doc.document_title, doc.normalized_title, doc.source_database]
  .filter(Boolean).join(' ').toLowerCase();
const corpusMentions = {
  scribd: registries.reduce((sum, r) => sum + r.documents.filter(d => registryText(d).includes('scribd')).length, 0),
  usa_parts: registries.reduce((sum, r) => sum + r.documents.filter(d => /usa.?parts|usaparts/.test(registryText(d))).length, 0),
  garden_hire_spares: registries.reduce((sum, r) => sum + r.documents.filter(d => /garden.?hire/.test(registryText(d))).length, 0),
  document_kinds_parts_list: registries.reduce((sum, r) => sum + r.documents.filter(d => (d.document_type || '').toUpperCase() === 'PARTS_LIST').length, 0)
};

const rightsSources = [
  {
    source_id: 'ghs',
    display_name: 'Garden Hire Spares (GHS) — STIHL IPL section pages',
    host: 'www.gardenhirespares.co.uk',
    asset_count: diagramAssets.length,
    rights_holder: 'ANDREAS STIHL AG & Co. KG (artwork); GHS (page/photography layer)',
    licence_info: 'No reuse, sublicence or publication grant found in the harvested rows or on the merchant pages. Reseller terms do not transfer IPL artwork rights.',
    publication_status: 'RIGHTS_UNKNOWN',
    publication_rationale: 'Publicly reachable pixels are not a publication licence. A paid Scribd subscription or open web access does not grant republication rights either.',
    allowed_on_public_site: false,
    storage: 'REFERENCE_ONLY (URL + hash stored, image never downloaded into the repo)'
  },
  {
    source_id: 'stihl_ipl',
    display_name: 'STIHL official Illustrated Parts Lists',
    host: 'stihl.com',
    asset_count: 0,
    rights_holder: 'ANDREAS STIHL AG & Co. KG',
    licence_info: 'Copyrighted dealer documentation; no licensed feed or written permission on file.',
    publication_status: 'PUBLICATION_RESTRICTED',
    publication_rationale: 'Explicitly proprietary; publishing requires a licence agreement with STIHL.',
    allowed_on_public_site: false,
    storage: 'NOT_PRESENT_IN_REPOSITORY'
  },
  {
    source_id: 'archive_org_local_library',
    display_name: 'Local STIHL archive (batch2 local library + archive.org copies)',
    host: 'local-archive',
    asset_count: 0,
    document_count: (localArchiveDocumentCounts['data/batch2_document_registry.json'] || 0) + (localArchiveDocumentCounts['data/additional_sources_document_registry.json'] || 0),
    rights_holder: 'Various (STIHL, dealers, forum uploaders, archive.org uploaders)',
    licence_info: 'No per-file licence recorded; archive.org items differ per item and forum attachments carry uploader terms only.',
    publication_status: 'RIGHTS_UNKNOWN',
    publication_rationale: 'Document metadata exists, but the PDFs themselves are not in this checkout and carry no licence metadata.',
    allowed_on_public_site: false,
    storage: 'METADATA_ONLY_IN_THIS_CHECKOUT'
  },
  {
    source_id: 'local_pdf_documents',
    display_name: 'PDF documents present in the repository (data/)',
    host: 'local-file',
    asset_count: pdfInventory.length,
    document_count: pdfInventory.length,
    rights_holder: 'ANDREAS STIHL AG & Co. KG',
    licence_info: 'Manuals/instruction documents; no publication licence recorded.',
    publication_status: 'PUBLICATION_RESTRICTED',
    publication_rationale: 'Instruction manuals are not IPLs and remain STIHL copyright.',
    allowed_on_public_site: false,
    storage: 'LOCAL_RESEARCH_ONLY'
  },
  {
    source_id: 'repo_site_assets',
    display_name: 'Own site icons (favicons/PWA)',
    host: 'first-party',
    asset_count: localImages.length,
    rights_holder: 'StihlDecoder (own work)',
    licence_info: 'Own assets, publication allowed.',
    publication_status: 'PUBLICATION_ALLOWED',
    publication_rationale: 'First-party icons, not diagrams.',
    allowed_on_public_site: true,
    storage: 'REPOSITORY'
  }
];

// ---------------------------------------------------------------------------
// 5. Pilot models
// ---------------------------------------------------------------------------
const PILOTS = [
  { key: 'ms_170', label: 'MS 170', aliases: ['ms_170'] },
  { key: 'ms_261', label: 'MS 261', aliases: ['ms_261'] },
  { key: 'ms_260', label: '026 / MS 260', aliases: ['026', 'ms_260'] },
  { key: 'fs_55', label: 'FS 55', aliases: ['fs_55'] },
  { key: 'hs_81', label: 'HS 81', aliases: ['hs_81'] }
];

const activeOffers = (() => {
  try {
    const registry = readJson('data/affiliate/verified_amazon_registry.json');
    return registry.offers.filter(o => o.status === 'ACTIVE');
  } catch { return []; }
})();
const offersByPart = new Map();
for (const offer of activeOffers) {
  if (!offersByPart.has(offer.part_number)) offersByPart.set(offer.part_number, []);
  offersByPart.get(offer.part_number).push({
    marketplace: offer.marketplace,
    asin: offer.asin,
    affiliate_tag: offer.affiliate_tag
  });
}

const offerBackedLinks = (() => {
  const seen = new Map();
  for (const entry of linkedSections) {
    for (const item of entry.position_entries) {
      const offers = offersByPart.get(item.part_number);
      if (!offers || offers.length === 0) continue;
      const key = `${entry.model_id}::${entry.catalog_section_key}::${item.diagram_position}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        model_id: entry.model_id,
        ghs_section: `${entry.ghs_section_code || '?'} — ${entry.ghs_section_title}`,
        catalog_section: `${entry.catalog_section_key} — ${entry.catalog_section_name}`,
        position: item.position,
        part_number: item.part_number,
        part_name: partNameStmt.get(item.part_number)?.part_name || null,
        diagram_url: entry.asset_url,
        amazon_offers: offers
      });
    }
  }
  return [...seen.values()];
})();

function buildExamples(limit) {
  const scored = [...linkedSections]
    .filter(entry => entry.position_entries.length > 0)
    .map(entry => ({
      entry,
      offered: entry.position_entries.filter(p => offersByPart.has(p.part_number)).length
    }))
    .sort((a, b) => b.offered - a.offered || b.entry.position_entries.length - a.entry.position_entries.length);

  const picked = [];
  const usedModels = new Set();
  for (const { entry } of scored) {
    if (picked.length >= limit) break;
    if (usedModels.has(entry.model_id)) continue;
    usedModels.add(entry.model_id);
    picked.push(entry);
  }
  for (const { entry } of scored) {
    if (picked.length >= limit) break;
    if (picked.includes(entry)) continue;
    picked.push(entry);
  }

  const examples = [];
  for (const entry of picked) {
    const toEntry = (item) => ({
      position: item.position,
      part_number: item.part_number,
      part_name: partNameStmt.get(item.part_number)?.part_name || null,
      active_amazon_offers: offersByPart.get(item.part_number) || []
    });
    const offeredEntries = entry.position_entries.filter(item => offersByPart.has(item.part_number));
    const positions = [
      ...entry.position_entries.slice(0, 6),
      ...offeredEntries
    ]
      .filter((item, index, allList) => allList.findIndex(x => x.position === item.position && x.part_number === item.part_number) === index)
      .map(toEntry);
    if (!positions.some(p => p.part_name)) continue;
    examples.push({
      model_id: entry.model_id,
      ghs_section: `${entry.ghs_section_code || '?'} — ${entry.ghs_section_title}`,
      catalog_section: `${entry.catalog_section_key} — ${entry.catalog_section_name}`,
      diagram_url: entry.asset_url,
      diagram_rights: 'RIGHTS_UNKNOWN',
      confidence: entry.confidence,
      catalog_positions_in_section: entry.position_entries.length,
      offer_backed_positions_in_section: offeredEntries.length,
      positions,
      viewer_chain_complete: offeredEntries.length > 0
    });
  }
  return examples;
}

const pilots = PILOTS.map(pilot => {
  const rows = configurations.filter(row => pilot.aliases.includes(row.canonical_model_id));
  const withImage = rows.filter(row => row.diagram_image_url);
  const linked = linkedSections.filter(entry => pilot.aliases.includes(entry.model_id));
  const pilotParts = new Set(linked.flatMap(entry => entry.position_entries.map(p => p.part_number)));
  const pilotPositions = new Set(linked.flatMap(entry => entry.position_entries.map(p => `${entry.catalog_section_key}:${p.position}`)));
  let readiness = 'MISSING_MODEL_IN_SOURCE';
  if (rows.length > 0 && withImage.length === 0) readiness = 'SECTIONS_WITHOUT_IMAGE';
  else if (withImage.length > 0 && linked.length === 0) readiness = 'IMAGE_ONLY_SECTION_UNBOUND';
  else if (linked.length > 0 && pilotPositions.size > 0) readiness = 'POSITION_VIEWER_DATA_READY';
  else if (linked.length > 0) readiness = 'SECTION_BOUND_NO_POSITIONS';

  return {
    model_key: pilot.key,
    model_label: pilot.label,
    source_model_ids: pilot.aliases.filter(id => rows.some(r => r.canonical_model_id === id)),
    source_configurations: rows.length,
    configurations_with_image: withImage.length,
    unique_diagram_urls: new Set(withImage.map(r => r.diagram_image_url)).size,
    present_in_catalog_fitments: pilot.aliases.some(id => fitmentModels.has(id)),
    linked_sections: linked.length,
    linked_positions: pilotPositions.size,
    linked_parts: pilotParts.size,
    linked_parts_with_active_offers: [...pilotParts].filter(p => offersByPart.has(p)).length,
    viewer_readiness: readiness,
    sections_sample: linked.slice(0, 4).map(entry => ({
      ghs_section: `${entry.ghs_section_code || '?'} — ${entry.ghs_section_title}`,
      catalog_section: entry.catalog_section_name,
      positions: entry.position_entries.slice(0, 5)
    }))
  };
});

// ---------------------------------------------------------------------------
// 6. Coverage + totals
// ---------------------------------------------------------------------------
const sectionsResolvedTotal = sectionRows.reduce((sum, r) => sum + r.fitments, 0);
const fitmentsTotal = stihlDb.prepare('SELECT COUNT(*) AS c FROM model_part_fitments').get().c;
const catalogCoveragePct = Number(((linkedParts.size / partsCount) * 100).toFixed(2));
const classificationCounts = {};
for (const asset of diagramAssets) {
  classificationCounts[asset.classification] = (classificationCounts[asset.classification] || 0) + 1;
}
for (const image of localImages) {
  classificationCounts[image.classification] = (classificationCounts[image.classification] || 0) + 1;
}

const summary = {
  source_roots_scanned: rootReports.length,
  source_roots_available: rootReports.filter(r => r.exists).length,
  source_roots_missing: rootReports.filter(r => !r.exists).map(r => r.configured_path),
  files_scanned: uniqueLocalFiles.length,
  files_by_extension: extensionCounts,
  bytes_scanned: totalBytes,
  text_files_scanned: textFilesScanned.length,
  local_image_files: localImages.length,
  local_pdf_files: pdfInventory.length,
  local_diagram_files: localImages.filter(i => i.classification === 'LOCAL_DIAGRAM_CANDIDATE').length,
  pdf_embedded_image_objects: pdfInventory.reduce((sum, p) => sum + p.embedded_image_objects, 0),
  image_references_in_metadata: imageReferences.length,
  unique_image_reference_urls: new Set(imageReferences.map(r => r.url)).size,
  ghs_configuration_rows: configurations.length,
  ghs_rows_with_diagram: diagramRows.length,
  unique_diagram_urls: diagramAssets.length,
  duplicate_diagram_references: diagramRows.length - diagramAssets.length,
  models_with_diagram: modelIdsWithDiagram.length,
  models_bound_to_catalog: modelsBound.length,
  models_unbound: modelsUnbound.length,
  diagram_sections_linked: linkedSections.length,
  diagram_sections_unlinked: unboundSections.length,
  variant_conflicts: variantConflicts,
  linked_positions: linkedPositions.size,
  linked_parts: linkedParts.size,
  catalog_parts: partsCount,
  catalog_coverage_pct: catalogCoveragePct,
  resolved_section_fitments: sectionsResolvedTotal,
  total_fitments: fitmentsTotal,
  exploded_view_sheets: diagramAssets.filter(a => a.classification === 'EXPLODED_DIAGRAM_SHEET').length,
  tightening_torque_tables: diagramAssets.filter(a => a.classification === 'TIGHTENING_TORQUE_TABLE').length,
  offer_backed_viewer_links: offerBackedLinks.length,
  publication_allowed_assets: 0,
  rights_unknown_assets: diagramAssets.length,
  publication_restricted_assets: pdfInventory.length
};

// ---------------------------------------------------------------------------
// 7. Write artifacts
// ---------------------------------------------------------------------------
const writeJson = (name, payload) => {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

writeJson('PHASE77A_DIAGRAM_INVENTORY.json', {
  schema_version: '1.0.0',
  phase: '77A',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  scope_note: 'Inventories previously collected sources only. No network access, no image download, no publication.',
  source_roots: rootReports,
  file_scan: {
    files_scanned: uniqueLocalFiles.length,
    files_by_extension: extensionCounts,
    bytes_scanned: totalBytes,
    text_files_scanned: textFilesScanned,
    local_images: localImages,
    local_pdfs: pdfInventory,
    image_references_in_metadata: {
      total: imageReferences.length,
      by_host: Object.fromEntries(
        [...new Set(imageReferences.map(r => safeHost(r.url) || 'relative'))].map(host => [
          host,
          imageReferences.filter(r => (safeHost(r.url) || 'relative') === host).length
        ])
      ),
      sample: imageReferences.slice(0, 25)
    }
  },
  document_corpora: {
    registries: localArchiveDocumentCounts,
    registry_mentions: corpusMentions,
    page_index_entries: (() => {
      try { return readJson('data/batch3_pdf_page_index.json').pages.length; } catch { return 0; }
    })(),
    canonical_documents: (() => {
      try { return readJson('data/cross_corpus_document_registry.json').canonical_documents.length; } catch { return 0; }
    })()
  },
  diagram_assets: diagramAssets,
  deduplication: {
    total_references: diagramRows.length,
    unique_urls: diagramAssets.length,
    duplicate_reference_count: diagramRows.length - diagramAssets.length,
    duplicate_groups: duplicateGroups
  },
  classification_counts: classificationCounts,
  totals: summary
});

writeJson('PHASE77A_MODEL_MATCHES.json', {
  schema_version: '1.0.0',
  phase: '77A',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  catalog_baseline: {
    parts: partsCount,
    fitments: fitmentsTotal,
    fitments_in_resolved_sections: sectionsResolvedTotal,
    resolved_section_share_pct: Number(((sectionsResolvedTotal / fitmentsTotal) * 100).toFixed(2)),
    models_in_fitments: fitmentModels.size
  },
  binding_levels: {
    model_bound: {
      count: modelsBound.length,
      description: 'Diagram sheet belongs to a model that exists in the parts catalog.',
      reliability: 'HIGH'
    },
    section_bound: {
      count: linkedSections.length,
      description: 'Model + section title + variant agree with a resolved catalog section.',
      reliability: 'MEDIUM (section identity matched by normalized name, variant checked)'
    },
    position_bound: {
      count: linkedPositions.size,
      description: 'A catalog diagram position inside a section-bound drawing resolves to a part number.',
      reliability: 'MEDIUM (positions originate from the catalog rows, not from the artwork itself)'
    },
    missing: {
      models_unbound: modelsUnbound,
      sections_unbound_count: unboundSections.length,
      sections_unbound_sample: unboundSections.slice(0, 40),
      variant_conflicts: variantConflicts
    }
  },
  coverage: {
    linked_parts: linkedParts.size,
    catalog_parts: partsCount,
    catalog_coverage_pct: catalogCoveragePct,
    linked_parts_with_active_offers: [...linkedParts].filter(p => offersByPart.has(p)).length
  },
  offer_backed_links: offerBackedLinks,
  linked_sections: linkedSections.map(entry => ({
    ...entry,
    position_entries: entry.position_entries.slice(0, 40)
  })),
  pilots,
  examples: buildExamples(5),
  viewer_feasibility: {
    data_chain: ['diagram sheet (rights blocked)', 'diagram position', 'part number', 'part name', 'Amazon/eBay offer'],
    technically_possible_for_linked_positions: linkedPositions.size > 0,
    publishable_today: false,
    blocker: 'PUBLICATION_RIGHTS',
    note: 'The chain can be built and tested privately for the section-bound subset; no artwork may go public without a licence.'
  }
});

writeJson('PHASE77A_RIGHTS_AUDIT.json', {
  schema_version: '1.0.0',
  phase: '77A',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  policy: {
    published_images_in_this_phase: 0,
    publication_rule: 'An image is only publishable with a documented licence or written permission. Public reachability or a Scribd subscription is not permission.',
    storage_rule: 'Diagram references stay in the repository as URL + SHA-256 metadata only; artwork itself is not downloaded or republished.'
  },
  sources: rightsSources,
  statuses: {
    PUBLICATION_ALLOWED: rightsSources.filter(s => s.publication_status === 'PUBLICATION_ALLOWED' && s.source_id !== 'repo_site_assets').reduce((sum, s) => sum + s.asset_count, 0),
    RIGHTS_UNKNOWN: rightsSources.filter(s => s.publication_status === 'RIGHTS_UNKNOWN').reduce((sum, s) => sum + s.asset_count, 0),
    PUBLICATION_RESTRICTED: rightsSources.filter(s => s.publication_status === 'PUBLICATION_RESTRICTED').reduce((sum, s) => sum + s.asset_count, 0)
  },
  conclusion: {
    images_with_established_publication_rights: 0,
    legally_publishable_diagrams: 0,
    next_step: 'Obtain a written licence or a licensed parts-catalog feed (STIHL dealer/IPL access or a vendor that permits sublicensing of diagram images).'
  }
});

// ---------------------------------------------------------------------------
// 8. Report
// ---------------------------------------------------------------------------
const mdTable = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.join(' | ')} |`)
].join('\n');

const pilotRows = pilots.map(p => [
  p.model_label,
  p.source_configurations,
  p.configurations_with_image,
  p.linked_sections,
  p.linked_positions,
  p.linked_parts,
  p.linked_parts_with_active_offers,
  p.viewer_readiness
]);

const rootRows = rootReports.map(r => [
  `\`${r.configured_path}\``,
  r.exists ? 'ja' : 'nee',
  r.files_scanned,
  r.pdfs,
  r.images,
  r.note || '—'
]);

const exampleBlocks = buildExamples(5).map((example, index) => {
  const lines = example.positions.map(p =>
    `  - positie ${p.position} → \`${p.part_number}\` ${p.part_name || '(naam onbekend)'}` +
    (p.active_amazon_offers.length
      ? ` — ${p.active_amazon_offers.map(o => `${o.marketplace} ${o.asin} (${o.affiliate_tag})`).join(', ')}`
      : ' — geen actieve Amazon-aanbieding')
  );
  return [
    `### Voorbeeld ${index + 1} — ${example.model_id}, sectie ${example.ghs_section}`,
    '',
    `- Brontekening: \`${example.diagram_url}\``,
    `- Rechten: ${example.diagram_rights} (niet publiceerbaar)`,
    `- Catalogussectie: ${example.catalog_section} (${example.confidence})`,
    ...lines
  ].join('\n');
}).join('\n\n');

const report = `# Phase 77A — Herstel bestaande STIHL-explosietekeningen (inventarisatie)

Datum: ${GENERATED_AT}
Status: read-only inventarisatie. Geen afbeelding gedownload, geen afbeelding gepubliceerd, geen catalogusdata gewijzigd.

## 0. Bereik van deze uitvoering (belangrijk)

De opdracht noemt drie lokale archieven (\`stihl_scribd_documents_output\`, \`stihl_archive_downloads\`,
\`stihl_gardenhirespares_output\`, \`stihl_models_full_documentation_archive\`) op een Windows-machine.
Die mappen zijn in deze checkout **niet aanwezig**; ze zijn hieronder als \`NOT_PRESENT_IN_THIS_CHECKOUT\`
geregistreerd. Wat wél aanwezig is, is de volledige metadata- en cataloguslaag: de GHS-catalogus met
diagram-URL's, de documentregistries van de lokale archieven, de PDF-page-index en de onderdelendatabase.
Dit rapport kwantificeert daarom precies hoeveel tekeningen er in de verzamelde bronnen zitten en hoeveel
daarvan technisch koppelbaar zijn; de bestanden zelf kunnen op de machine met de archieven met hetzelfde
script worden geïnventariseerd via \`PHASE77A_ARCHIVE_ROOTS\`.

## 1. Inventarisatie van bronnen

${mdTable(['Bron', 'Aanwezig', 'Bestanden', "PDF's", 'Afbeeldingen', 'Opmerking'], rootRows)}

- Totaal gescande bestanden: **${summary.files_scanned}** (${Object.entries(extensionCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}).
- JSON/MD/HTML-artefacten gescand op afbeeldingsreferenties: **${summary.text_files_scanned}**.
- Afbeeldingsreferenties in die metadata: **${summary.image_references_in_metadata}** verwijzingen naar **${summary.unique_image_reference_urls}** unieke URL's (metadata, geen artwork).
- Lokale afbeeldingsbestanden in de gescande mappen: **${summary.local_image_files}**; echte lokale explosietekeningen: **${summary.local_diagram_files}** (de repo-iconen staan buiten de gescande archiefmappen).
- Lokale PDF's: **${summary.local_pdf_files}**, samen **${summary.pdf_embedded_image_objects}** ingebedde afbeeldingsobjecten. Het zijn handleidingen, geen IPL's.
- Documentregistries: ${Object.entries(localArchiveDocumentCounts).map(([k, v]) => `\`${k}\`: ${v}`).join(', ')}; PDF-page-index: **${(() => { try { return readJson('data/batch3_pdf_page_index.json').pages.length; } catch { return 0; } })()}** pagina's; canonieke documenten: **${(() => { try { return readJson('data/cross_corpus_document_registry.json').canonical_documents.length; } catch { return 0; } })()}**.
- Vermeldingen in de registries: Scribd **${corpusMentions.scribd}**, USA Parts **${corpusMentions.usa_parts}**, Garden Hire Spares **${corpusMentions.garden_hire_spares}**, parts lists **${corpusMentions.document_kinds_parts_list}**.
- Eerdere GitHub-onderzoeken bevestigen het beeld: \`PHASE61D_REPORT.md\` (0 publieke explosietekeningen) en \`PHASE61D_DIAGRAM_AUDIT.json\` (46 configuratie-URL's voor 5 modellen). Phase 77A breidt dat uit naar **alle** ${summary.models_with_diagram} modellen met diagramreferenties.

## 2. Gevonden explosietekeningen

- GHS-catalogusrijen: **${summary.ghs_configuration_rows}**, waarvan **${summary.ghs_rows_with_diagram}** met een diagram-URL.
- Unieke tekeningen na deduplicatie (URL + SHA-256): **${summary.unique_diagram_urls}**.
- Dubbele referenties: **${summary.duplicate_diagram_references}** (${duplicateGroups.length} dedupe-groepen; dezelfde tekening wordt door meerdere configuratierijen gebruikt).
- Classificatie: **${summary.exploded_view_sheets}** echte exploded-view sheets, **${summary.tightening_torque_tables}** aandraaimoment-tabellen (${Object.entries(classificationCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}).
- Er zijn **geen** lokale tekeningbestanden, geen vector-Illustrator/SVG-bronnen en geen uit PDF's gerenderde IPL-pagina's in deze checkout.
- De tekeningen zijn uitsluitend als externe URL bekend (${new Set(diagramAssets.map(a => a.source_host)).size} host: ${[...new Set(diagramAssets.map(a => a.source_host))].join(', ')}); er is niets gedownload.

## 3. Modellen en varianten

- Modellen met minstens één diagramreferentie: **${summary.models_with_diagram}**.
- Daarvan herkenbaar in onze eigen fitment-database: **${summary.models_bound_to_catalog}**; niet gebonden: **${summary.models_unbound}**.
- Variantconflicten die een handmatige review vereisen: **${summary.variant_conflicts}**. Een tekening van een andere uitvoering wordt nooit als exacte match getoond.

## 4. Koppeling aan bestaande diagramsecties en posities

- Tekeningen gekoppeld aan een bestaande, geresolveerde catalogussectie: **${summary.diagram_sections_linked}** van ${summary.ghs_rows_with_diagram} (${((summary.diagram_sections_linked / summary.ghs_rows_with_diagram) * 100).toFixed(1)}%).
- Niet koppelbaar op sectieniveau: **${summary.diagram_sections_unlinked}**, vooral omdat **${((1 - sectionsResolvedTotal / fitmentsTotal) * 100).toFixed(1)}%** van onze fitments nog in \`general_unresolved\` staat (${sectionsResolvedTotal} van ${fitmentsTotal} fitments hebben een geresolveerde sectie).
- Gekoppelde tekeningposities: **${summary.linked_positions}**; gekoppelde onderdeelnummers: **${summary.linked_parts}**.
- Catalogusdekking: **${summary.catalog_coverage_pct}%** van ${partsCount} onderdelen.
- Van de gekoppelde onderdelen hebben **${[...linkedParts].filter(p => offersByPart.has(p)).length}** een actieve Amazon-aanbieding; dat levert **${summary.offer_backed_viewer_links}** volledige viewer-ketens (tekening → positie → onderdeelnummer → Amazon-aanbieding).
- eBay: de providers bestaan (\`src/affiliate/EbayAffiliateProvider.js\`, \`EbaySyncEngine.js\`, \`EbayBrowseApiClient.js\`), maar er staan geen actieve eBay-aanbiedingen in de repository, dus eBay-links zijn in deze fase niet meetbaar.

## 5. Proefkoppeling — vijf modellen

${mdTable(['Model', 'Bronconfiguraties', 'Met tekening', 'Gekoppelde secties', 'Posities', 'Onderdelen', 'Met Amazon-aanbod', 'Viewer-gereedheid'], pilotRows)}

## 6. Vijf uitgewerkte koppelingen

${exampleBlocks}

## 7. Rechten

${mdTable(['Bron', 'Rechthebbende', 'Status', 'Publiceerbaar'], rightsSources.map(s => [s.display_name, s.rights_holder, s.publication_status, s.allowed_on_public_site ? 'ja' : 'nee']))}

- Afbeeldingen met vastgestelde publicatierechten: **0**.
- \`RIGHTS_UNKNOWN\`: **${summary.rights_unknown_assets}** tekeningen (GHS).
- \`PUBLICATION_RESTRICTED\`: **${summary.publication_restricted_assets}** lokale PDF's (STIHL).
- Een Scribd-abonnement of een openbaar bereikbare afbeelding is géén publicatietoestemming; alle referenties blijven metadata-only in de afgeschermde onderzoeksomgeving.

## 8. Conclusie en voorstel

**Technisch**: de keten tekening → positie → onderdeelnummer → aanbieding is aantoonbaar te bouwen voor ${summary.linked_positions} posities over ${summary.linked_parts} onderdelen, waarvan ${summary.offer_backed_viewer_links} posities direct een actieve Amazon-aanbieding opleveren; voor de overige tekeningen ontbreekt het aan een geresolveerde sectie-identiteit in onze eigen catalogus, niet aan de afbeelding.

**Juridisch**: 0 van ${summary.unique_diagram_urls} tekeningen is vandaag publiceerbaar. Zonder licentie geen publieke viewer met GHS- of STIHL-artwork.

**Voorstel voor geautomatiseerde verwerking van de rest:**
1. Draai dit script op de machine met de lokale archieven (\`PHASE77A_ARCHIVE_ROOTS=...\`) om PDF's, Scribd-output en USA Parts-bestanden te hashen en te classificeren.
2. Los eerst de sectie-identiteit op: breid de bestaande sectie-resolutie uit zodat meer dan ${((sectionsResolvedTotal / fitmentsTotal) * 100).toFixed(1)}% van de fitments een echte \`section_key\` heeft. Zonder die stap blijft elke tekening een model-breed plaatje in plaats van een positie-viewer.
3. Koppel daarna per model de GHS-sectie aan de geresolveerde sectie (dit script doet dat al deterministisch) en valideer variantrevisies handmatig.
4. Publiceer niets tot een schriftelijke licentie of gelicenseerde catalogusfeed beschikbaar is; bouw de viewer intussen intern tegen de metadata.

## 9. Meest kansrijke bronnen en ontbrekende bestanden

- **Meest kansrijk**: de GHS-catalogus (${summary.unique_diagram_urls} tekeningen, ${summary.models_with_diagram} modellen,direct gekoppeld aan model + sectienaam) — mits licentie.
- **Aanvullend**: de lokale archiefbibliotheek (${localArchiveDocumentCounts['data/batch2_document_registry.json'] || 0} documenten, waarvan ${corpusMentions.document_kinds_parts_list} als parts list) en de archive.org-set (663 documenten) — hier zitten de IPL-PDF's, maar de bestanden zijn hier niet aanwezig en de page-index bevat alleen tekst, geen afbeeldingen.
- **Ontbrekend in deze checkout**: de vier genoemde archiefmappen, de Scribd-output, USA Parts-bestanden en alle IPL-PDF's buiten de drie lokale handleidingen. Ook ontbreken beeldcoördinaten (x/y) per positienummer; onze data heeft alleen positienummers.
`;

fs.writeFileSync(path.join(outDir, 'PHASE77A_REPORT.md'), report, 'utf8');

console.log(JSON.stringify(summary, null, 2));
console.log(`\nArtifacts written to ${path.relative(root, outDir)}/`);
