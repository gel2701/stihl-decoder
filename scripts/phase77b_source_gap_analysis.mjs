/**
 * Phase 77B — Source verification and catalog-gap analysis (read-only).
 *
 * Builds on output/phase77a/ and the bounded visual samples in
 * output/phase77b/PHASE77B_VISUAL_SAMPLE*.json:
 *  - what the original sources really contain (documents, diagrams, placeholders),
 *  - how many drawings are technically suitable for a viewer,
 *  - how many bind to model / section / position / part,
 *  - why 94% of the fitments are still general_unresolved,
 *  - which concrete improvements yield the largest catalog coverage.
 *
 * It never downloads artwork itself, never writes images into the repository and
 * never touches production data.
 *
 * Usage: node scripts/phase77b_source_gap_analysis.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77b');
fs.mkdirSync(outDir, { recursive: true });

const GENERATED_AT = new Date().toISOString();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pct = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

const inventory77a = readJson('output/phase77a/PHASE77A_DIAGRAM_INVENTORY.json');
const matches77a = readJson('output/phase77a/PHASE77A_MODEL_MATCHES.json');
const rights77a = readJson('output/phase77a/PHASE77A_RIGHTS_AUDIT.json');
const randomSample = readJson('output/phase77b/PHASE77B_VISUAL_SAMPLE.json');
let pilotSample = null;
try {
  pilotSample = readJson('output/phase77b/PHASE77B_VISUAL_SAMPLE_PILOTS.json');
} catch {
  pilotSample = { sample: [], totals: {} };
}

const configurations = readJson('data/parts_model_configurations.json').configurations || [];
const db = new DatabaseSync(path.join(root, 'data', 'stihl_database.db'), { readOnly: true });
const catalogParts = db.prepare('SELECT COUNT(*) AS c FROM parts').get().c;
const fitmentsTotal = db.prepare('SELECT COUNT(*) AS c FROM model_part_fitments').get().c;

// ---------------------------------------------------------------------------
// 1. Verified availability per diagram URL (sampled assets only)
// ---------------------------------------------------------------------------
const verificationByUrl = new Map();
for (const record of [...randomSample.sample, ...pilotSample.sample]) {
  verificationByUrl.set(record.url, record);
}
const PLACEHOLDER_HASH = randomSample.duplicate_groups[0]?.sha256 || null;
const isPlaceholder = (record) => Boolean(record && PLACEHOLDER_HASH && record.sha256 === PLACEHOLDER_HASH);

const sampleStats = (sample) => {
  const fetched = sample.sample.filter(r => r.fetch_status === 'FETCHED_AND_HASHED');
  const placeholders = fetched.filter(isPlaceholder);
  const real = fetched.filter(r => !isPlaceholder(r));
  return {
    sampled: sample.sample.length,
    fetched: fetched.length,
    placeholders: placeholders.length,
    real_unique: new Set(real.map(r => r.sha256)).size,
    placeholder_share_pct: pct(placeholders.length, fetched.length),
    real_share_pct: pct(real.length, fetched.length),
    real_bytes_median: real.length
      ? real.map(r => r.bytes).sort((a, b) => a - b)[Math.floor(real.length / 2)]
      : null,
    real_dimensions: [...new Set(real.map(r => `${r.width}x${r.height}`))]
  };
};
const randomStats = sampleStats(randomSample);
const pilotStats = sampleStats(pilotSample);

// Pilot-model exact availability (the pilot sample covers every pilot URL)
const PILOT_MODELS = [
  { key: 'ms_170', label: 'MS 170', ids: ['ms_170'] },
  { key: 'ms_261', label: 'MS 261', ids: ['ms_261'] },
  { key: 'ms_260', label: '026 / MS 260', ids: ['026', 'ms_260'] },
  { key: 'fs_55', label: 'FS 55', ids: ['fs_55'] },
  { key: 'hs_81', label: 'HS 81', ids: ['hs_81'] }
];

const pilotAvailability = PILOT_MODELS.map(pilot => {
  const assets = inventory77a.diagram_assets.filter(a => a.model_ids.some(id => pilot.ids.includes(id)));
  const sampled = assets.map(a => ({ asset: a, record: verificationByUrl.get(a.url) })).filter(x => x.record);
  const placeholders = sampled.filter(x => isPlaceholder(x.record));
  const real = sampled.filter(x => x.record && !isPlaceholder(x.record));
  return {
    model_key: pilot.key,
    model_label: pilot.label,
    assets: assets.length,
    sampled_assets: sampled.length,
    verified_real_diagrams: real.length,
    verified_placeholders: placeholders.length,
    unverified_assets: assets.length - sampled.length,
    verification_scope: assets.length > 0 && sampled.length === assets.length ? 'COMPLETE' : 'PARTIAL_SAMPLE'
  };
});

// ---------------------------------------------------------------------------
// 2. Corrected section / position binding with verification status
// ---------------------------------------------------------------------------
const linkedWithVerification = matches77a.linked_sections.map(section => {
  const record = verificationByUrl.get(section.asset_url);
  let availability = 'NOT_SAMPLED';
  if (record) availability = isPlaceholder(record) ? 'PLACEHOLDER_IMAGE' : 'VERIFIED_REAL_DIAGRAM';
  return {
    ...section,
    availability,
    image_bytes: record?.bytes ?? null,
    image_dimensions: record?.width ? `${record.width}x${record.height}` : null
  };
});

const verifiedLinked = linkedWithVerification.filter(s => s.availability === 'VERIFIED_REAL_DIAGRAM');
const placeholderLinked = linkedWithVerification.filter(s => s.availability === 'PLACEHOLDER_IMAGE');
const unverifiedLinked = linkedWithVerification.filter(s => s.availability === 'NOT_SAMPLED');

const positionsOf = (sections) => new Set(sections.flatMap(s => s.position_entries.map(p => `${s.model_id}::${s.catalog_section_key}::${p.position}`)));
const partsOf = (sections) => new Set(sections.flatMap(s => s.position_entries.map(p => p.part_number)));

const verifiedPositions = positionsOf(verifiedLinked);
const verifiedParts = partsOf(verifiedLinked);
const estimatedRealSheets = Math.round(inventory77a.totals.unique_diagram_urls * (randomStats.real_share_pct / 100));

// Model completeness: a model is "fully linkable" only when every one of its
// diagram sections is bound to the catalog AND its artwork is verified real.
const modelCompleteness = new Map();
for (const section of linkedWithVerification) {
  if (!modelCompleteness.has(section.model_id)) {
    modelCompleteness.set(section.model_id, { model_id: section.model_id, sections: 0, real: 0, placeholder: 0, not_sampled: 0, positions: new Set(), parts: new Set() });
  }
  const entry = modelCompleteness.get(section.model_id);
  entry.sections += 1;
  if (section.availability === 'VERIFIED_REAL_DIAGRAM') entry.real += 1;
  else if (section.availability === 'PLACEHOLDER_IMAGE') entry.placeholder += 1;
  else entry.not_sampled += 1;
  for (const item of section.position_entries) {
    entry.positions.add(`${section.catalog_section_key}:${item.position}`);
    entry.parts.add(item.part_number);
  }
}
const modelRows = [...modelCompleteness.values()].map(entry => ({
  model_id: entry.model_id,
  linked_sections: entry.sections,
  verified_real_sections: entry.real,
  placeholder_sections: entry.placeholder,
  unsampled_sections: entry.not_sampled,
  positions: entry.positions.size,
  parts: entry.parts.size,
  fully_linkable: entry.real === entry.sections && entry.sections > 0
}));
const fullyLinkableModels = modelRows.filter(m => m.fully_linkable);

// ---------------------------------------------------------------------------
// 3. Why are 94% of the fitments general_unresolved?
// ---------------------------------------------------------------------------
const sourceBreakdown = db.prepare(`
  SELECT source_id,
         COUNT(*) AS fitments,
         SUM(CASE WHEN section_key = 'general_unresolved' OR section_key IS NULL THEN 1 ELSE 0 END) AS unresolved,
         SUM(CASE WHEN configuration_key IS NOT NULL THEN 1 ELSE 0 END) AS with_configuration_key,
         COUNT(DISTINCT canonical_model_id) AS models
  FROM model_part_fitments
  GROUP BY source_id
  ORDER BY fitments DESC
`).all().map(row => ({
  source_id: row.source_id,
  fitments: row.fitments,
  unresolved: row.unresolved,
  unresolved_pct: pct(row.unresolved, row.fitments),
  with_configuration_key: row.with_configuration_key,
  models: row.models
}));

const unresolvedTopConfigurationKeys = db.prepare(`
  SELECT configuration_key, COUNT(*) AS fitments
  FROM model_part_fitments
  WHERE source_id = 'sparepartsworld'
    AND (section_key = 'general_unresolved' OR section_key IS NULL)
    AND configuration_key IS NOT NULL
  GROUP BY configuration_key
  ORDER BY fitments DESC
  LIMIT 15
`).all();

const contextRows = db.prepare('SELECT COUNT(*) AS c FROM model_part_fitment_section_contexts').get().c;
const scopeResolutions = db.prepare('SELECT COUNT(*) AS c FROM part_fitment_scope_resolutions').get().c;

// Lever 1: reuse resolved GHS (model, part) section identity for sparepartsworld rows
const ghsResolved = db.prepare(`
  SELECT canonical_model_id AS model_id, part_number, section_key
  FROM model_part_fitments
  WHERE source_id = 'ghs' AND section_key IS NOT NULL AND section_key <> 'general_unresolved'
`).all();
const spwUnresolved = db.prepare(`
  SELECT canonical_model_id AS model_id, part_number, COUNT(*) AS c
  FROM model_part_fitments
  WHERE source_id = 'sparepartsworld'
    AND (section_key = 'general_unresolved' OR section_key IS NULL)
  GROUP BY canonical_model_id, part_number
`).all();
const spwIndex = new Map(spwUnresolved.map(r => [`${r.model_id}|${r.part_number}`, r.c]));
let overlapFitments = 0;
const overlapParts = new Set();
const overlapModels = new Set();
for (const row of ghsResolved) {
  const count = spwIndex.get(`${row.model_id}|${row.part_number}`);
  if (!count) continue;
  overlapFitments += count;
  overlapParts.add(row.part_number);
  overlapModels.add(row.model_id);
}

// Lever 2: what the local PDF page index can and cannot provide
let pageIndexStats = { pages: 0, with_usable_heading: 0, with_models: 0 };
try {
  const pages = readJson('data/batch3_pdf_page_index.json').pages;
  pageIndexStats = {
    pages: pages.length,
    with_usable_heading: pages.filter(p => p.section_heading && p.section_heading.replace(/[^A-Za-z]/g, '').length >= 4).length,
    with_models: pages.filter(p => Array.isArray(p.models) && p.models.length > 0).length
  };
} catch {}

// Lever 3: coverage impact of applying the overlap lever
const linkedParts77a = new Set(matches77a.linked_sections.flatMap(s => s.position_entries.map(p => p.part_number)));
const unionPartsAfterLever = new Set([...linkedParts77a, ...overlapParts]);
const coverageNow = pct(linkedParts77a.size, catalogParts);
const coverageAfterLever = pct(unionPartsAfterLever.size, catalogParts);

// ---------------------------------------------------------------------------
// 4. Source inventory (documents + assets)
// ---------------------------------------------------------------------------
const registryCounts = {};
for (const [rel, label] of [
  ['data/additional_sources_document_registry.json', 'archive_org_and_forum'],
  ['data/batch2_document_registry.json', 'local_archive_library'],
  ['data/batch3_pdf_document_registry.json', 'local_pdf_batch']
]) {
  try {
    const docs = readJson(rel).documents || [];
    registryCounts[label] = {
      documents: docs.length,
      parts_lists: docs.filter(d => (d.document_type || '').toUpperCase() === 'PARTS_LIST').length,
      pdf_documents: docs.filter(d => /\.pdf$/i.test(d.source_file_path || d.source_url || '')).length
    };
  } catch {
    registryCounts[label] = { documents: 0, parts_lists: 0, pdf_documents: 0 };
  }
}

const sourceInventory = [
  {
    source_id: 'ghs_catalog',
    display_name: 'Garden Hire Spares STIHL IPL section pages (harvested metadata)',
    documents: configurations.length,
    diagram_urls: inventory77a.totals.unique_diagram_urls,
    verified_real_diagrams: `${pilotStats.real_unique} unique in ${pilotStats.fetched} pilot URLs / ${randomStats.real_unique} in ${randomStats.fetched} random URLs`,
    placeholder_share_pct: pilotStats.placeholder_share_pct,
    models: inventory77a.totals.models_with_diagram,
    positions_in_source: 'visible on the artwork (printed numbers), not stored as data',
    licence_marks: 'GHS watermark on every sheet; no licence statement in the harvest',
    rights_status: 'RIGHTS_UNKNOWN'
  },
  {
    source_id: 'local_archive_library',
    display_name: 'Local STIHL archive library (batch2 + archive.org + forum metadata)',
    documents: registryCounts.local_archive_library.documents + registryCounts.archive_org_and_forum.documents,
    diagram_urls: 0,
    verified_real_diagrams: 'not verifiable: files are absent from this checkout',
    placeholder_share_pct: null,
    models: null,
    positions_in_source: 'unknown (page index has no part numbers)',
    licence_marks: 'no per-file licence metadata recorded',
    rights_status: 'RIGHTS_UNKNOWN'
  },
  {
    source_id: 'local_pdfs',
    display_name: 'PDFs present in the repository',
    documents: inventory77a.file_scan.local_pdfs.length,
    diagram_urls: 0,
    verified_real_diagrams: '0 — both extracted images are product photos (visually checked)',
    placeholder_share_pct: null,
    models: null,
    positions_in_source: 'none',
    licence_marks: 'STIHL copyright, no licence statement',
    rights_status: 'PUBLICATION_RESTRICTED'
  },
  {
    source_id: 'stihl_official_ipl',
    display_name: 'STIHL official Illustrated Parts Lists',
    documents: 0,
    diagram_urls: 0,
    verified_real_diagrams: '0 — no IPL artwork in the repository',
    placeholder_share_pct: null,
    models: null,
    positions_in_source: 'n/a',
    licence_marks: 'proprietary',
    rights_status: 'PUBLICATION_RESTRICTED'
  }
];

// ---------------------------------------------------------------------------
// 5. Viewer suitability
// ---------------------------------------------------------------------------
const realRecords = [...randomSample.sample, ...pilotSample.sample]
  .filter(r => r.fetch_status === 'FETCHED_AND_HASHED' && !isPlaceholder(r));
const dimensionCounts = realRecords.reduce((acc, r) => {
  const key = `${r.width}x${r.height}`;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const viewerSuitability = {
  technically_suitable_images_sampled: realRecords.length,
  resolution: dimensionCounts,
  watermark: 'GHS logo watermark across the drawing',
  position_numbers_in_artwork: true,
  hotspot_coordinates_available: false,
  viewer_ready: realRecords.length > 0 && verifiedPositions.size > 0,
  verdict: 'SUITABLE_WITH_LIMITATIONS',
  limitations: [
    '700x700 is low for deep zoom',
    'no x/y coordinates per position, so hotspots need a mapping pass',
    'watermark and third-party page layout',
    'publication blocked by rights'
  ],
  publishable_now: 0
};

// ---------------------------------------------------------------------------
// 6. Ranked improvements
// ---------------------------------------------------------------------------
const improvements = [
  {
    rank: 1,
    action: 'Treat missing artwork as a data quality problem: replace placeholder URLs per model before counting coverage',
    measured_effect: `${pilotStats.placeholders} of ${pilotStats.fetched} pilot URLs are placeholders (${pilotStats.placeholder_share_pct}%); the real sheet count is ~${estimatedRealSheets} of ${inventory77a.totals.unique_diagram_urls}`,
    coverage_gain_parts: 0,
    coverage_after_pct: coverageNow,
    effort: 'LOW',
    risk: 'NONE (verification only)'
  },
  {
    rank: 2,
    action: 'Reuse resolved GHS section identity for sparepartsworld rows with the same model + part number',
    measured_effect: `${overlapFitments} fitments, ${overlapParts.size} parts, ${overlapModels.size} models can move out of general_unresolved`,
    coverage_gain_parts: unionPartsAfterLever.size - linkedParts77a.size,
    coverage_after_pct: coverageAfterLever,
    effort: 'MEDIUM',
    risk: 'MEDIUM — must be stored as DERIVED_FROM_SECTION_EVIDENCE, never as verified'
  },
  {
    rank: 3,
    action: 'Resolve section identity at the source: harvest GHS section pages including their position tables',
    measured_effect: 'Would bind every GHS section (2,376 URLs) to positions instead of the current 235',
    coverage_gain_parts: null,
    effort: 'HIGH',
    risk: 'HIGH — new acquisition + rights still unresolved'
  },
  {
    rank: 4,
    action: 'Recover sections from the local archive PDFs (78 documents) once the files are available',
    measured_effect: `${pageIndexStats.pages} indexed pages, but only ${pageIndexStats.with_usable_heading} have a usable heading and ${pageIndexStats.with_models} carry model metadata, and 0 carry part numbers`,
    coverage_gain_parts: null,
    effort: 'HIGH',
    risk: 'MEDIUM — needs OCR plus the actual PDF files'
  }
];

// ---------------------------------------------------------------------------
// 7. Write artifacts
// ---------------------------------------------------------------------------
const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

writeJson('PHASE77B_SOURCE_INVENTORY.json', {
  schema_version: '1.0.0',
  phase: '77B',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  local_windows_archives: {
    reachable_from_this_environment: false,
    probed_paths: inventory77a.source_roots.map(r => ({ path: r.configured_path, exists: r.exists })),
    note: 'No Windows mount exists in this Linux checkout; the originals must be inventoried on the host with PHASE77A_ARCHIVE_ROOTS.'
  },
  sources: sourceInventory,
  registries: registryCounts,
  visual_verification: {
    placeholder_hash: PLACEHOLDER_HASH,
    random_sample: randomStats,
    pilot_sample: pilotStats,
    estimated_real_sheets_of_2376: estimatedRealSheets,
    visually_inspected: [
      { asset: 'ms_261 section B', result: 'PLACEHOLDER ("GHS — Image coming soon")' },
      { asset: '026 chain brake', result: 'REAL exploded view, 700x700, position numbers visible' },
      { asset: 'ms_261 oil pump/clutch', result: 'REAL exploded view, 700x700, position numbers visible' },
      { asset: 'PDF source_b_0458-737-5521-C.pdf image 1', result: 'PRODUCT_PHOTO (MS 500i chainsaw), not a diagram' },
      { asset: 'PDF USG_Manual.pdf image 1', result: 'PRODUCT_PHOTO (USG grinder), not a diagram' }
    ]
  },
  pilot_availability: pilotAvailability,
  viewer_suitability: viewerSuitability
});

writeJson('PHASE77B_DATABASE_MATCH.json', {
  schema_version: '1.0.0',
  phase: '77B',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  catalog_baseline: { parts: catalogParts, fitments: fitmentsTotal },
  metadata_level: {
    linked_sections: matches77a.linked_sections.length,
    linked_positions: matches77a.binding_levels.position_bound.count,
    linked_parts: matches77a.coverage.linked_parts,
    coverage_pct: matches77a.coverage.catalog_coverage_pct
  },
  verified_level: {
    linked_sections_real: verifiedLinked.length,
    linked_sections_placeholder: placeholderLinked.length,
    linked_sections_unsampled: unverifiedLinked.length,
    verified_positions: verifiedPositions.size,
    verified_parts: verifiedParts.size,
    coverage_pct: pct(verifiedParts.size, catalogParts)
  },
  models: {
    with_diagram_metadata: inventory77a.totals.models_with_diagram,
    fully_linkable: fullyLinkableModels.length,
    fully_linkable_ids: fullyLinkableModels.map(m => m.model_id),
    per_model: modelRows
  },
  position_match: {
    positions_bound_to_a_real_diagram: verifiedPositions.size,
    positions_bound_to_placeholder_or_unsampled: positionsOf([...placeholderLinked, ...unverifiedLinked]).size,
    artwork_level_verification: 'NOT_POSSIBLE — position numbers are printed on the drawing; the catalog stores numbers without coordinates'
  },
  examples: matches77a.examples
});

writeJson('PHASE77B_UNRESOLVED_ANALYSIS.json', {
  schema_version: '1.0.0',
  phase: '77B',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  totals: {
    fitments: fitmentsTotal,
    unresolved: sourceBreakdown.reduce((sum, s) => sum + s.unresolved, 0),
    unresolved_pct: pct(sourceBreakdown.reduce((sum, s) => sum + s.unresolved, 0), fitmentsTotal)
  },
  by_source: sourceBreakdown,
  top_configuration_keys_without_section: unresolvedTopConfigurationKeys,
  explanation: {
    primary_cause: 'The dominant source (sparepartsworld, 96.5% of fitments) publishes part rows without a diagram section. Its configuration keys are machine variants (LOOP_HANDLE, ELECTRIC, D), not sections, so section_key cannot be derived from that source.',
    secondary_cause: '81,565 of those fitments carry no configuration key at all; the source page is a single model-wide parts list.',
    fail_closed_behaviour: 'The importer correctly refuses to guess and stores general_unresolved instead of inventing a section.',
    enrichment_state: { section_contexts_rows: contextRows, scope_resolutions: scopeResolutions }
  },
  local_pdf_page_index: pageIndexStats,
  improvement_levers: improvements,
  derived_section_reuse: {
    candidate_fitments: overlapFitments,
    candidate_parts: overlapParts.size,
    candidate_models: overlapModels.size,
    required_status_label: 'DERIVED_FROM_SECTION_EVIDENCE',
    never_store_as: 'VERIFIED'
  }
});

writeJson('PHASE77B_PUBLICATION_READINESS.json', {
  schema_version: '1.0.0',
  phase: '77B',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  images_published: 0,
  images_downloaded_into_repository: 0,
  temporary_research_copies: 'deleted after hashing/inspection',
  sources: rights77a.sources,
  required_before_publication: [
    'Written licence or explicit permission from ANDREAS STIHL AG & Co. KG for the IPL artwork',
    'A reseller/vendor agreement that permits sublicensing of diagram images (GHS terms currently contain no such grant)',
    'Resolution of the watermark/branding layer if third-party page artwork is reused',
    'A documented provenance record per drawing (model, variant, revision, source page)',
    'First-party hosting with a takedown/attribution policy — no hotlinking',
    'Legal review of the interactive-viewer interaction (positions over third-party artwork)'
  ],
  verdict: {
    publishable_diagrams_now: 0,
    publishable_after_licence: 'all verified-real sheets, per-model',
    public_viewer_enabled: false
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

const report = `# Phase 77B — Bronverificatie en catalogusgat-analyse

Datum: ${GENERATED_AT}
Read-only. Geen productiegegevens gewijzigd, geen publieke viewer, geen afbeelding in de repository.

## 0. Wat wel en niet kon

De vier originele Windows-archieven zijn vanuit deze Linux-checkout **niet bereikbaar** (geen \`/mnt/c\`,
geen Windows-pad). Ze zijn opnieuw geprobeerd en als afwezig geregistreerd. Wat wél kon: de volledige
metadata-laag analyseren, de bron-URL's **daadwerkelijk ophalen en visueel controleren**, en de koppeling
met onze database herberekenen. Draai \`node scripts/phase77b_sample_source_images.mjs\` en
\`node scripts/phase77b_source_gap_analysis.mjs\` op de host met de archieven voor het lokale deel.

## 1. Werkelijk gevonden tekeningen per bron

${mdTable(['Bron', 'Documenten', 'Diagram-URL\'s', 'Geverifieerd echt', 'Placeholders', 'Rechten'], sourceInventory.map(s => [s.display_name, s.documents, s.diagram_urls, s.verified_real_diagrams, s.placeholder_share_pct === null ? '—' : `${s.placeholder_share_pct}%`, s.rights_status]))}

- Steekproef 30 willekeurige GHS-URL's: **${randomStats.fetched} opgehaald, ${randomStats.placeholders} placeholder, ${randomStats.real_unique} unieke echte tekeningen** (${randomStats.placeholder_share_pct}% placeholder).
- Steekproef alle **${pilotStats.fetched}** GHS-URL's van de vijf proefmodellen: **${pilotStats.placeholders} placeholder, ${pilotStats.real_unique} echt** (${pilotStats.placeholder_share_pct}% placeholder).
- De placeholder is één identiek bestand van ${randomSample.duplicate_groups[0]?.bytes} bytes ("GHS — Image coming soon"), gevonden bij modellen als ${randomSample.duplicate_groups[0]?.models.slice(0, 4).join(', ')}.
- Visueel gecontroleerd: 2 echte tekeningen (026 chain brake, MS 261 oil pump/clutch) zijn echte STIHL-exploded views van **700x700** met zichtbare positienummers; de 2 afbeeldingen uit de lokale PDF's zijn **productfoto's** (MS 500i, USG), geen IPL's. De volledige steekproef bevat resoluties ${Object.keys(dimensionCounts).join(', ')} — inclusief 240x240 thumbs, dus niet elke echte afbeelding is viewerwaardig.
- **Geschatte werkelijke tekeningen: ~${estimatedRealSheets} van ${inventory77a.totals.unique_diagram_urls}** URL's (op basis van de willekeurige steekproef).

## 2. Welke tekeningen ontbreken

- **${pilotStats.placeholders} van ${pilotStats.fetched}** proefmodel-URL's leveren geen tekening; per model: ${pilotAvailability.map(p => `${p.model_label} ${p.verified_real_diagrams}/${p.assets}`).join(', ')}.
- **FS 55** heeft 3 secties maar 0 afbeeldingen; **HS 81** komt niet voor in de bron.
- De lokale archieven (${registryCounts.local_archive_library.documents + registryCounts.archive_org_and_forum.documents} documenten, waarvan ${registryCounts.local_archive_library.parts_lists} parts lists) bevatten volgens hun registries de IPL-PDF's, maar de bestanden zijn hier afwezig; de page-index (${pageIndexStats.pages} pagina's) bevat **geen onderdeelnummers** en grotendeels onbruikbare koppen (${pageIndexStats.with_usable_heading} bruikbaar).
- Er zijn **0** lokale tekeningbestanden en **0** vectorbronnen.

## 3. Hoeveel modellen volledig gekoppeld kunnen worden

- **${fullyLinkableModels.length}** modellen zijn volledig koppelbaar (alle gekoppelde secties met een geverifieerd echte tekening): ${fullyLinkableModels.length ? fullyLinkableModels.map(m => m.model_id).join(', ') : 'geen'}.
- Op metadata-niveau zijn ${modelRows.length} modellen deels gekoppeld; ${modelRows.filter(m => m.verified_real_sections > 0).length} daarvan hebben minstens één geverifieerd echte tekening.
- De beperking is tweeledig: **beschikbaarheid** (placeholders) en **sectie-identiteit** in onze eigen catalogus.

## 4. Hoeveel positienummers overeenkomen

- Metadata-niveau (Phase 77A): **${matches77a.binding_levels.position_bound.count}** posities boven **${matches77a.coverage.linked_parts}** onderdelen.
- Na verificatie: **${verifiedPositions.size}** posities en **${verifiedParts.size}** onderdelen hangen aan een aantoonbaar echte tekening; ${positionsOf([...placeholderLinked, ...unverifiedLinked]).size} posities hangen aan een placeholder of niet-bemonsterde tekening.
- Positienummers staan **op de tekening** (zichtbaar bij visuele controle), maar wij hebben ze alleen als catalogusgetal zonder x/y-coördinaten. "Overeenkomen" betekent hier dus: hetzelfde positienummer binnen dezelfde sectie — niet een gematchte hotspot.

## 5. Hoeveel afbeeldingen technisch geschikt zijn voor een interactieve viewer

- **${viewerSuitability.technically_suitable_images_sampled}** bemonsterde, echte afbeeldingen zijn bruikbaar als viewer-achtergrond; resolutie **${Object.keys(dimensionCounts).join(', ')}**, GHS-watermerk, zichtbare positienummers.
- Verdict: **${viewerSuitability.verdict}** — bruikbaar voor een referentieviewer, beperkt voor diepe zoom; hotspots vereisen een aparte coördinaten-mapping.
- **0** afbeeldingen zijn publiceerbaar (rechten).

## 6. Wat nodig is om rechtmatig te publiceren

${mdTable(['Vereiste'], [
  ['Schriftelijke licentie/toestemming STIHL voor IPL-artwork'],
  ['Vendor-/resellerovereenkomst die sublicensing van diagrammen toestaat (GHS-terms bevatten die niet)'],
  ['Provenance per tekening: model, variant, revisie, bronpagina'],
  ['First-party hosting met attributie/takedownbeleid — geen hotlinks'],
  ['Juridische review van de viewer-interactie op andermans artwork']
])}

## 7. Waarom 94% van de fitments general_unresolved is

${mdTable(['Bron', 'Fitments', 'Unresolved', '%', 'Met configuratiekey', 'Modellen'], sourceBreakdown.map(s => [s.source_id, s.fitments, s.unresolved, s.unresolved_pct, s.with_configuration_key, s.models]))}

- **Hoofdoorzaak**: ${sourceBreakdown[0].source_id} levert ${sourceBreakdown[0].unresolved_pct}% van alle fitments en publiceert geen diagramsectie. De configuratiekeys zijn machinevarianten (${unresolvedTopConfigurationKeys.slice(0, 5).map(k => k.configuration_key).join(', ')}), geen secties.
- **Versterkend**: 81.565 fitments hebben zelfs geen configuratiekey; dat zijn modelbrede onderdelenlijsten.
- **Correct fail-closed**: de importeur verzint geen sectie. Er zijn ${contextRows} section-contextrijen en ${scopeResolutions} scope-resoluties — er is dus geen verborgen voorraad "bijna opgeloste" secties.
- **Page-index**: ${pageIndexStats.pages} pagina's, ${pageIndexStats.with_usable_heading} met bruikbare kop, ${pageIndexStats.with_models} met modelmetadata, 0 met onderdeelnummers.

## 8. Concrete verbeteringen, gerangschikt naar dekking

${mdTable(['#', 'Actie', 'Gemeten effect', 'Dekkingswinst', 'Inspanning', 'Risico'], improvements.map(i => [i.rank, i.action, i.measured_effect, i.coverage_gain_parts === null ? 'niet te kwantificeren zonder nieuwe bron' : (i.coverage_gain_parts === 0 ? '0 onderdelen (kwaliteitscorrectie, geen dekkingwinst)' : `${i.coverage_gain_parts} onderdelen (${coverageNow}% → ${i.coverage_after_pct}%)`), i.effort, i.risk]))}

- Toegepast levert levers 1+2 een dekking van **${coverageNow}% → ${coverageAfterLever}%** (${linkedParts77a.size} → ${unionPartsAfterLever.size} distincte onderdelen) — zonder één nieuwe download.
- Lever 2 moet als **DERIVED_FROM_SECTION_EVIDENCE** worden opgeslagen, nooit als VERIFIED; anders ontstaat precies de schijnzekerheid die de quality gate verbiedt.

## 9. Conclusie

1. De eerdere ${inventory77a.totals.unique_diagram_urls} "tekeningen" zijn een **metadatabovengrens**; ongeveer **${estimatedRealSheets}** zijn naar schatting echt, en voor de proefmodellen is ${pct(pilotStats.real_unique, pilotStats.fetched)}% aantoonbaar echt.
2. De technische keten werkt, maar op veel kleinere schaal dan 77A suggereerde: **${verifiedPositions.size}** geverifieerde posities in plaats van ${matches77a.binding_levels.position_bound.count}.
3. Publicatie is en blijft geblokkeerd op rechten (0 afbeeldingen).
4. De grootste dekkingwinst zit niet in meer afbeeldingen maar in **sectie-identiteit**: ${overlapFitments} fitments kunnen met bestaande evidence uit \`general_unresolved\` komen.
5. Voor het lokale deel (PDF's, Scribd, USA Parts) is de host met de archieven nodig; de scripts zijn daar klaar voor.
`;

fs.writeFileSync(path.join(outDir, 'PHASE77B_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({
  random_sample: randomStats,
  pilot_sample: pilotStats,
  estimated_real_sheets: estimatedRealSheets,
  verified_sections: verifiedLinked.length,
  verified_positions: verifiedPositions.size,
  verified_parts: verifiedParts.size,
  fully_linkable_models: fullyLinkableModels.length,
  unresolved_fitments: sourceBreakdown.reduce((s, x) => s + x.unresolved, 0),
  overlap_lever: { fitments: overlapFitments, parts: overlapParts.size, models: overlapModels.size },
  coverage_now_pct: coverageNow,
  coverage_after_lever_pct: coverageAfterLever
}, null, 2));
