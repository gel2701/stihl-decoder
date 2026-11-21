import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relPath), 'utf8'));
}

function writeJson(relPath, data) {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const database = readJson('data/stihl_database.json');
const catalogDoc = readJson('data/parts_catalog.json');
const models = database.models || [];

const normId = (s) =>
  String(s || '')
    .replace(/^stihl_/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const fitmentsByModel = new Map();
for (const r of db.prepare('SELECT DISTINCT canonical_model_id FROM model_part_fitments').all()) {
  fitmentsByModel.set(r.canonical_model_id, true);
}

const directCountStmt = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments WHERE canonical_model_id = ?');
const subModelStmt = db.prepare('SELECT * FROM model_part_fitments WHERE canonical_model_id = ?');
const exactVariantStmt = db.prepare('SELECT * FROM model_part_fitments WHERE canonical_model_id = ? AND variant_key = ?');

// Explicit safe variant mappings (verified exact variant_key matches only; never guessing different variants like C-EM -> C-M)
const EXACT_ARCHIVE_MAPPINGS = {
  bga_30: { type: 'sub_ipl', source_model_ids: ['bga_30_0'], source_desc: 'Existing documented IPL sub-ID bga_30_0 in model_part_fitments' },
  hsa_100: { type: 'sub_ipl', source_model_ids: ['hsa_100_0', 'hsa_100_1'], source_desc: 'Existing documented IPL sub-IDs hsa_100_0 / hsa_100_1 in model_part_fitments' },
  fsa_30: { type: 'sub_ipl', source_model_ids: ['fsa_30_0'], source_desc: 'Existing documented IPL sub-ID fsa_30_0 in model_part_fitments' },
  ms_201_t: { type: 'variant', base_model_id: 'ms_201', variant_keys: ['tc_m'], source_desc: 'Exact variant_key tc_m on canonical family ms_201' },
  ms_200_t: { type: 'variant', base_model_id: 'ms_200', variant_keys: ['t'], source_desc: 'Exact variant_key t on canonical family ms_200' },
  ms_261_c_m: { type: 'variant', base_model_id: 'ms_261', variant_keys: ['c_m'], source_desc: 'Exact variant_key c_m on canonical family ms_261' },
  ms_251_c: { type: 'variant', base_model_id: 'ms_251', variant_keys: ['c'], source_desc: 'Exact variant_key c on canonical family ms_251' },
  fs_55_r: { type: 'variant', base_model_id: 'fs_55', variant_keys: ['r'], source_desc: 'Exact variant_key r on canonical family fs_55' },
  msa_60_c_b: { type: 'variant', base_model_id: 'msa_60_0', variant_keys: ['c_b'], source_desc: 'Exact variant_key c_b on canonical IPL msa_60_0' },
  msa_70_c_b: { type: 'variant', base_model_id: 'msa_70_0', variant_keys: ['c_b'], source_desc: 'Exact variant_key c_b on canonical IPL msa_70_0' },
  msa_160_c_b: { type: 'variant', base_model_id: 'msa_160', variant_keys: ['c_b'], source_desc: 'Exact variant_key c_b on canonical family msa_160' },
  msa_200_c_b: { type: 'variant', base_model_id: 'msa_200', variant_keys: ['c_b'], source_desc: 'Exact variant_key c_b on canonical family msa_200' },
  msa_220_c_b: { type: 'variant', base_model_id: 'msa_220', variant_keys: ['c_b'], source_desc: 'Exact variant_key c_b on canonical family msa_220' },
  msa_190_t: { type: 'variant', base_model_id: 'msa_190', variant_keys: ['t'], source_desc: 'Exact variant_key t on canonical family msa_190' },
  mse_170_c_bq: { type: 'variant', base_model_id: 'mse_170', variant_keys: ['c_bq'], source_desc: 'Exact variant_key c_bq on canonical family mse_170' },
  mse_141_c_q: { type: 'variant', base_model_id: 'mse_141', variant_keys: ['c_q'], source_desc: 'Exact variant_key c_q on canonical family mse_141' },
  hs_82_r: { type: 'variant', base_model_id: 'hs_82', variant_keys: ['r'], source_desc: 'Exact variant_key r on canonical family hs_82' },
  ms_362_c_m: { type: 'variant', base_model_id: 'ms_362', variant_keys: ['c_m'], source_desc: 'Exact variant_key c_m on canonical family ms_362 (thin model 1 -> 249)' }
};

// Strict explicit catalog mentions (zero inference, never matching chain gauge ".050" or bare digits without context)
function findExplicitCatalogParts(modelName) {
  const hits = [];
  if (modelName === '050') {
    for (const p of catalogDoc.parts) {
      if (/\b(?:For|Fits)\b[^)]*\b050\b(?:\.|,|\s+\d{3}|\))/i.test(p.part_name || '') && !/\.050|050"/i.test(p.part_name || '')) {
        hits.push(p);
      }
    }
    return hits;
  }
  if (modelName === 'MS 500') {
    for (const p of catalogDoc.parts) {
      if (/\bMS\s*500(?:\b|\/|\s)(?!i\b)/i.test(p.part_name || '')) {
        hits.push(p);
      }
    }
    return hits;
  }
  const token = modelName.replace(/[\s-]+/g, '[\\s\\-]*');
  const re = new RegExp(`(^|[^a-z0-9])${token}($|[^a-z0-9])`, 'i');
  for (const p of catalogDoc.parts) {
    if (re.test(p.part_name || '')) {
      hits.push(p);
    }
  }
  return hits;
}

const ghsLedgerRaw = readJson('data/sources/ghs_stihl_source_ledger.json');
const ghsArr = Array.isArray(ghsLedgerRaw) ? ghsLedgerRaw : (ghsLedgerRaw.records || ghsLedgerRaw.entries || Object.values(ghsLedgerRaw));
const hasGhsModelUrl = (modelName) => {
  const token = modelName.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ghsArr.some((r) => String(r.source_url || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(token));
};

const phase96Fitments = [];
const dedupKey = new Set();

const configDoc = readJson('data/parts_model_configurations.json');
const modelsWithOwnConfigs = new Set((configDoc.configurations || []).map((c) => c.canonical_model_id));

function addAdditiveFitment(row, targetModelId, provenanceClass, evidenceNote) {
  const key = `${targetModelId}::${row.part_number}::${row.section_key || 'general'}::${row.diagram_position || ''}`;
  if (dedupKey.has(key)) return;
  dedupKey.add(key);
  const keepCfg = Boolean(row.configuration_key && modelsWithOwnConfigs.has(targetModelId));
  phase96Fitments.push({
    fitment_id: `p96_${targetModelId}_${row.part_number}_${phase96Fitments.length + 1}`,
    part_number: row.part_number,
    canonical_model_id: targetModelId,
    variant_key: 'base',
    configuration_key: keepCfg ? row.configuration_key : null,
    configuration_name: row.configuration_name || null,
    fitment_scope: keepCfg ? 'EXACT_CONFIGURATION' : 'BASE_MODEL_CONFIRMED',
    section_key: row.section_key || 'general_catalog',
    section_name: row.section_name || 'Algemene Onderdelen',
    diagram_position: row.diagram_position || null,
    quantity: row.quantity || 1,
    notes: row.notes || evidenceNote,
    source_id: 'phase96_archive_enrichment',
    source_url: row.source_url || 'data/parts_catalog.json',
    source_evidence_status: provenanceClass,
    provenance_class: provenanceClass
  });
}

const emptyModelsAudit = [];
const thinModelsEnriched = [];

// Process all 41 zero-direct-fitment models
const emptyModels = models.filter((m) => directCountStmt.get(normId(m.slug || m.id)).c === 0);

for (const m of emptyModels) {
  const mId = normId(m.slug || m.id);
  const spec = EXACT_ARCHIVE_MAPPINGS[mId];
  let added = 0;

  if (spec) {
    if (spec.type === 'sub_ipl') {
      for (const srcId of spec.source_model_ids) {
        const rows = subModelStmt.all(srcId);
        for (const r of rows) {
          addAdditiveFitment(r, mId, 'OFFICIAL_DOCUMENTED', spec.source_desc);
          added++;
        }
      }
    } else if (spec.type === 'variant') {
      for (const vk of spec.variant_keys) {
        const rows = exactVariantStmt.all(spec.base_model_id, vk);
        for (const r of rows) {
          addAdditiveFitment(r, mId, 'OFFICIAL_DOCUMENTED', spec.source_desc);
          added++;
        }
      }
    }
    // Also merge any explicit catalog part mentions for completeness
    const catHits = findExplicitCatalogParts(m.model_name);
    for (const p of catHits) {
      addAdditiveFitment(
        { part_number: p.part_number, section_key: 'catalog_application', section_name: 'Catalogusonderdelen', source_url: 'data/parts_catalog.json', fitment_scope: 'BASE_MODEL_CONFIRMED' },
        mId,
        'SECONDARY_EVIDENCED',
        `Explicit model designation "${m.model_name}" in OEM catalog part title`
      );
    }
    const finalCount = phase96Fitments.filter((f) => f.canonical_model_id === mId).length;
    emptyModelsAudit.push({
      canonical_model_id: mId,
      model_name: m.model_name,
      category: m.category,
      classification: 'OFFICIAL_DOCUMENTED',
      added_fitments: finalCount,
      evidence_source: spec.source_desc
    });
    continue;
  }

  // Group 3: Exact catalog mentions (Secondary Evidenced)
  const catHits = findExplicitCatalogParts(m.model_name);
  if (catHits.length > 0) {
    for (const p of catHits) {
      addAdditiveFitment(
        { part_number: p.part_number, section_key: 'catalog_application', section_name: 'Catalogusonderdelen', source_url: 'data/parts_catalog.json', fitment_scope: 'BASE_MODEL_CONFIRMED' },
        mId,
        'SECONDARY_EVIDENCED',
        `Explicit model designation "${m.model_name}" in OEM catalog part title`
      );
    }
    const finalCount = phase96Fitments.filter((f) => f.canonical_model_id === mId).length;
    emptyModelsAudit.push({
      canonical_model_id: mId,
      model_name: m.model_name,
      category: m.category,
      classification: 'SECONDARY_EVIDENCED',
      added_fitments: finalCount,
      evidence_source: 'Explicit OEM model citation in data/parts_catalog.json',
      part_numbers: catHits.map((p) => p.part_number)
    });
    continue;
  }

  // Group 4: Genuine NEEDS_EVIDENCE (0 guessed fitments!)
  const baseFamily = mId.split('_').slice(0, 2).join('_');
  const hasBaseFamily = fitmentsByModel.has(baseFamily);
  const ghsUrlPresent = hasGhsModelUrl(m.model_name);
  emptyModelsAudit.push({
    canonical_model_id: mId,
    model_name: m.model_name,
    category: m.category,
    classification: 'NEEDS_EVIDENCE',
    added_fitments: 0,
    reason: ghsUrlPresent
      ? 'GHS model index URL exists in archive ledger without harvested IPL part table'
      : (hasBaseFamily
        ? `Base family ${baseFamily} has parts in archive, but exact variant "${m.model_name}" lacks variant-specific IPL evidence`
        : 'No IPL fitment rows or explicit catalog model citations present in local archives')
  });
}

// Also enrich MS 362 C-M (thin model with 1 direct row) + thin models <= 5 with explicit catalog mentions
const thinModels = models.filter((m) => {
  const c = directCountStmt.get(normId(m.slug || m.id)).c;
  return c > 0 && c <= 5;
});

for (const m of thinModels) {
  const mId = normId(m.slug || m.id);
  const existingParts = new Set(subModelStmt.all(mId).map((r) => r.part_number));
  let addedThin = 0;

  const spec = EXACT_ARCHIVE_MAPPINGS[mId];
  if (spec && spec.type === 'variant') {
    for (const vk of spec.variant_keys) {
      for (const r of exactVariantStmt.all(spec.base_model_id, vk)) {
        if (!existingParts.has(r.part_number)) {
          addAdditiveFitment(r, mId, 'OFFICIAL_DOCUMENTED', spec.source_desc);
          existingParts.add(r.part_number);
          addedThin++;
        }
      }
    }
  }

  const catHits = findExplicitCatalogParts(m.model_name);
  for (const p of catHits) {
    if (!existingParts.has(p.part_number)) {
      addAdditiveFitment(
        { part_number: p.part_number, section_key: 'catalog_application', section_name: 'Catalogusonderdelen', source_url: 'data/parts_catalog.json', fitment_scope: 'BASE_MODEL_CONFIRMED' },
        mId,
        'SECONDARY_EVIDENCED',
        `Explicit model designation "${m.model_name}" in OEM catalog part title`
      );
      existingParts.add(p.part_number);
      addedThin++;
    }
  }

  if (addedThin > 0) {
    thinModelsEnriched.push({
      canonical_model_id: mId,
      model_name: m.model_name,
      existing_direct: directCountStmt.get(mId).c,
      added_fitments: addedThin
    });
  }
}

// Write data/parts_fitments_phase96.json
writeJson('data/parts_fitments_phase96.json', {
  schema_version: '1.0.0',
  phase: 'phase96',
  description: 'Verified additive model-part fitments derived exclusively from exact local archive IPL sub-IDs, exact variant_key records, and explicit OEM catalog model citations. Zero inferred fitments.',
  total_fitments: phase96Fitments.length,
  fitments: phase96Fitments
});

// Update data/fitment_model_index.json cleanly so PartCatalogResolver.hasPartsForModel & Sitemap see enriched models
const idxPath = 'data/fitment_model_index.json';
const idxDoc = readJson(idxPath);
const idxSet = new Set(idxDoc.canonical_model_ids || []);
const newlyRenderableIds = [];
for (const entry of emptyModelsAudit) {
  if (entry.added_fitments > 0 && !idxSet.has(entry.canonical_model_id)) {
    idxSet.add(entry.canonical_model_id);
    newlyRenderableIds.push(entry.canonical_model_id);
  }
}
idxDoc.canonical_model_ids = Array.from(idxSet).sort();
idxDoc.phase96_added_models = newlyRenderableIds;
idxDoc.updated_at = new Date().toISOString();
writeJson(idxPath, idxDoc);

const summary = {
  generated_at: new Date().toISOString(),
  baseline_empty_models: emptyModels.length,
  classification_counts: {
    OFFICIAL_DOCUMENTED: emptyModelsAudit.filter((x) => x.classification === 'OFFICIAL_DOCUMENTED').length,
    SECONDARY_EVIDENCED: emptyModelsAudit.filter((x) => x.classification === 'SECONDARY_EVIDENCED').length,
    NEEDS_EVIDENCE: emptyModelsAudit.filter((x) => x.classification === 'NEEDS_EVIDENCE').length
  },
  newly_enriched_empty_models: emptyModelsAudit.filter((x) => x.added_fitments > 0).length,
  total_phase96_additive_fitments: phase96Fitments.length,
  newly_added_to_renderable_index: newlyRenderableIds,
  thin_models_enriched: thinModelsEnriched,
  empty_models_audit: emptyModelsAudit
};

writeJson('output/phase96/PHASE96_CATALOG_ENRICHMENT.json', summary);
console.log(JSON.stringify({
  classification_counts: summary.classification_counts,
  newly_enriched_empty_models: summary.newly_enriched_empty_models,
  total_phase96_additive_fitments: summary.total_phase96_additive_fitments,
  newly_added_to_renderable_index: summary.newly_added_to_renderable_index,
  thin_models_enriched_count: summary.thin_models_enriched.length
}, null, 2));
