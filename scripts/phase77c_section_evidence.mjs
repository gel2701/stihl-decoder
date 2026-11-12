/**
 * Phase 77C — Number audit + safe section-candidate preview (read-only).
 *
 * Recomputes the Phase 77A/77B totals from the source data, reconciles
 * contradictions between the reports, and derives *safe* section candidates for
 * the unresolved sparepartsworld fitments using GHS section evidence.
 *
 * A candidate is only accepted when:
 *   G1 the canonical model matches,
 *   G2 the canonical part number matches and exists in the parts catalog,
 *   G3 GHS carries a concrete section identity (not general_unresolved, not the
 *      "Model Parts Breakdown" catch-all),
 *   G4 the (model, part) pair does not map to multiple GHS sections,
 *   G5 the machine variant does not conflict (wildcards: empty, 'base').
 *
 * Accepted records are labelled DERIVED_FROM_SECTION_EVIDENCE. Nothing is written
 * to the production database, nothing is marked VERIFIED, no image is downloaded.
 *
 * Usage: node scripts/phase77c_section_evidence.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77c');
fs.mkdirSync(outDir, { recursive: true });

const GENERATED_AT = new Date().toISOString();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pct = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);
const wildcard = (variant) => !variant || variant === 'base';

const inventory77a = readJson('output/phase77a/PHASE77A_DIAGRAM_INVENTORY.json');
const matches77a = readJson('output/phase77a/PHASE77A_MODEL_MATCHES.json');
const visualSample = readJson('output/phase77b/PHASE77B_VISUAL_SAMPLE.json');
const pilotSample = readJson('output/phase77b/PHASE77B_VISUAL_SAMPLE_PILOTS.json');
const db = new DatabaseSync(path.join(root, 'data', 'stihl_database.db'), { readOnly: true });

const catalogParts = db.prepare('SELECT COUNT(*) AS c FROM parts').get().c;
const fitmentsTotal = db.prepare('SELECT COUNT(*) AS c FROM model_part_fitments').get().c;
const partExists = db.prepare('SELECT 1 AS ok FROM parts WHERE part_number = ?');
const offersRegistry = readJson('data/affiliate/verified_amazon_registry.json');
const activeOffers = offersRegistry.offers.filter(o => o.status === 'ACTIVE');

// ---------------------------------------------------------------------------
// 1. Recompute the five claims and the report contradictions
// ---------------------------------------------------------------------------
const uniqueUrls = new Set(inventory77a.diagram_assets.map(a => a.url)).size;
const urlReferences = inventory77a.totals.ghs_rows_with_diagram;

const placeholderHash = visualSample.duplicate_groups[0]?.sha256 || null;
const sampleCounts = (sample) => {
  const fetched = sample.sample.filter(r => r.fetch_status === 'FETCHED_AND_HASHED');
  const placeholders = fetched.filter(r => r.sha256 === placeholderHash);
  return { fetched: fetched.length, placeholders: placeholders.length, real: fetched.length - placeholders.length };
};
const pilotCounts = sampleCounts(pilotSample);
const randomCounts = sampleCounts(visualSample);

// Section-candidate pool (ungated, as reported in 77B)
const ghsResolvedRows = db.prepare(`
  SELECT canonical_model_id AS model_id, part_number, section_key, section_name,
         variant_key, source_url
  FROM model_part_fitments
  WHERE source_id = 'ghs'
    AND section_key IS NOT NULL
    AND section_key <> 'general_unresolved'
`).all();
const spwUnresolvedRows = db.prepare(`
  SELECT canonical_model_id AS model_id, part_number, variant_key, COUNT(*) AS fitments
  FROM model_part_fitments
  WHERE source_id = 'sparepartsworld'
    AND (section_key = 'general_unresolved' OR section_key IS NULL)
  GROUP BY canonical_model_id, part_number, variant_key
`).all();

const ghsByPair = new Map();
for (const row of ghsResolvedRows) {
  const key = `${row.model_id}|${row.part_number}`;
  if (!ghsByPair.has(key)) ghsByPair.set(key, { model_id: row.model_id, part_number: row.part_number, sections: new Map(), variants: new Set(), source_urls: new Set() });
  const entry = ghsByPair.get(key);
  entry.sections.set(row.section_key, row.section_name);
  if (row.variant_key) entry.variants.add(row.variant_key);
  if (row.source_url) entry.source_urls.add(row.source_url);
}
const spwByPair = new Map();
for (const row of spwUnresolvedRows) {
  const key = `${row.model_id}|${row.part_number}`;
  if (!spwByPair.has(key)) spwByPair.set(key, { fitments: 0, variants: new Set() });
  const entry = spwByPair.get(key);
  entry.fitments += row.fitments;
  if (row.variant_key) entry.variants.add(row.variant_key);
}

const overlapPairs = [...ghsByPair.keys()].filter(key => spwByPair.has(key));
const overlapFitments = overlapPairs.reduce((sum, key) => sum + spwByPair.get(key).fitments, 0);
const overlapParts = new Set(overlapPairs.map(key => key.split('|')[1]));
const overlapModels = new Set(overlapPairs.map(key => key.split('|')[0]));

// 77A metadata-level distinct counts (the artifact counts rows per section)
const metadataPositions = new Set();
const metadataParts = new Set();
for (const section of matches77a.linked_sections) {
  for (const entry of section.position_entries) {
    metadataPositions.add(`${section.model_id}::${section.catalog_section_key}::${entry.position}`);
    metadataParts.add(entry.part_number);
  }
}

const numberAudit = {
  schema_version: '1.0.0',
  phase: '77C',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  tiers: {
    metadata: 'Counted directly from stored registries/artifacts; no network, no image inspection.',
    sample_estimate: 'Extrapolated from a bounded, deterministic sample of source URLs.',
    individually_verified: 'Fetched, hashed and (for two of them) visually inspected.',
    derived_link: 'Section identity derived from another source for the same model + part; never VERIFIED.'
  },
  claims: [
    {
      claim: '2,376 unique GHS diagram URLs',
      reported: 2376,
      recomputed: uniqueUrls,
      tier: 'metadata',
      verdict: uniqueUrls === 2376 ? 'CONFIRMED' : 'CORRECTED',
      detail: `${urlReferences} configuration rows reference ${uniqueUrls} unique URLs`
    },
    {
      claim: '42 of 61 pilot URLs are placeholders',
      reported: '42/61',
      recomputed: `${pilotCounts.placeholders}/${pilotCounts.fetched}`,
      tier: 'individually_verified',
      verdict: pilotCounts.placeholders === 42 && pilotCounts.fetched === 61 ? 'CONFIRMED' : 'CORRECTED',
      detail: `placeholder SHA-256 ${placeholderHash ? placeholderHash.slice(0, 16) + '…' : 'unknown'}`
    },
    {
      claim: '1,993 potentially linkable fitments',
      reported: 1993,
      recomputed: overlapFitments,
      tier: 'metadata (ungated upper bound)',
      verdict: overlapFitments === 1993 ? 'CONFIRMED_AS_UPPER_BOUND' : 'CORRECTED',
      detail: 'Upper bound before the variant/ambiguity gates; the safe count is lower (see candidates).'
    },
    {
      claim: '775 involved parts',
      reported: 775,
      recomputed: overlapParts.size,
      tier: 'metadata (ungated upper bound)',
      verdict: overlapParts.size === 775 ? 'CONFIRMED_AS_UPPER_BOUND' : 'CORRECTED'
    },
    {
      claim: '223 involved models',
      reported: 223,
      recomputed: overlapModels.size,
      tier: 'metadata (ungated upper bound)',
      verdict: overlapModels.size === 223 ? 'CONFIRMED_AS_UPPER_BOUND' : 'CORRECTED'
    }
  ],
  contradictions: [
    {
      id: 'C1',
      what: 'Phase 77A reports 512 linked parts, but the linked_sections payload contains a different number of distinct part numbers.',
      values: { reported_in_77a: matches77a.coverage.linked_parts, distinct_in_linked_sections: metadataParts.size },
      resolution: '77A counts one part per linked section (a part can appear in several sections). The distinct count is authoritative for coverage.'
    },
    {
      id: 'C2',
      what: 'Phase 77A reports 710 linked positions; the distinct position tuples in the payload can differ from the section-row sum.',
      values: { reported_in_77a: matches77a.binding_levels.position_bound.count, distinct_in_linked_sections: metadataPositions.size },
      resolution: 'Position tuples are unique per (model, section, position); coverage statements must use the distinct set.'
    },
    {
      id: 'C3',
      what: 'Phase 77B quotes 1,993 fitments / 775 parts / 223 models as if they were usable links.',
      values: { ungated: { fitments: overlapFitments, parts: overlapParts.size, models: overlapModels.size } },
      resolution: 'These are ungated upper bounds. Phase 77C applies the five gates and reports the safe subset separately.'
    }
  ],
  data_integrity: {
    catalog_parts: catalogParts,
    fitments: fitmentsTotal,
    active_offers: activeOffers.length,
    active_offers_nl: activeOffers.filter(o => String(o.marketplace).toLowerCase() === 'amazon.nl').length,
    active_offers_de: activeOffers.filter(o => String(o.marketplace).toLowerCase() === 'amazon.de').length
  }
};

// ---------------------------------------------------------------------------
// 2. Safe candidate derivation (five gates)
// ---------------------------------------------------------------------------
const NON_SPECIFIC_SECTIONS = new Set(['general_unresolved', 'model_parts_breakdown']);
const accepted = [];
const rejected = [];

for (const pairKey of overlapPairs.sort()) {
  const ghs = ghsByPair.get(pairKey);
  const spw = spwByPair.get(pairKey);
  const [modelId, partNumber] = pairKey.split('|');
  const base = { model_id: modelId, part_number: partNumber, spw_fitments: spw.fitments };
  const concreteSections = [...ghs.sections.entries()].filter(([key]) => !NON_SPECIFIC_SECTIONS.has(key));

  const reject = (reason, detail) => rejected.push({ ...base, reason, detail });

  if (!partExists.get(partNumber)) {
    reject('PART_NOT_IN_CATALOG', 'part number missing from the parts table');
    continue;
  }
  if (concreteSections.length === 0) {
    const onlyCatchAll = [...ghs.sections.keys()].every(key => key === 'model_parts_breakdown');
    reject(
      onlyCatchAll ? 'ONLY_CATCH_ALL_SECTION_MODEL_PARTS_BREAKDOWN' : 'NO_CONCRETE_GHS_SECTION',
      `GHS sections: ${[...ghs.sections.keys()].join(', ') || 'none'}`
    );
    continue;
  }
  if (concreteSections.length > 1) {
    reject('AMBIGUOUS_MULTIPLE_SECTIONS', `GHS maps this part to ${concreteSections.length} sections: ${concreteSections.map(([key]) => key).join(', ')}`);
    continue;
  }

  const [sectionKey, sectionName] = concreteSections[0];
  const ghsVariants = [...ghs.variants].filter(Boolean);
  const spwVariants = [...spw.variants].filter(Boolean);
  const ghsSpecific = ghsVariants.filter(v => !wildcard(v));
  const spwSpecific = spwVariants.filter(v => !wildcard(v));
  const intersects = ghsSpecific.some(v => spwSpecific.includes(v));

  if (ghsSpecific.length > 0 && spwSpecific.length > 0 && !intersects) {
    reject('VARIANT_CONFLICT', `GHS variants [${ghsSpecific.join(', ')}] vs sparepartsworld variants [${spwSpecific.join(', ')}]`);
    continue;
  }

  const variantScope = spwSpecific.length === 0
    ? 'SPW_VARIANT_UNSPECIFIED'
    : (ghsSpecific.length === 0 ? 'GHS_VARIANT_UNSPECIFIED' : (intersects ? 'EXACT_VARIANT_MATCH' : 'UNKNOWN'));

  accepted.push({
    candidate_id: `77c-${modelId}-${partNumber}-${sectionKey}`,
    status: 'DERIVED_FROM_SECTION_EVIDENCE',
    never_mark_as: 'VERIFIED',
    model_id: modelId,
    part_number: partNumber,
    ghs_section_key: sectionKey,
    ghs_section_name: sectionName,
    ghs_source_url: [...ghs.source_urls][0] || null,
    ghs_variants: ghsVariants,
    spw_variants: spwVariants,
    variant_scope: variantScope,
    derivation_method: 'SAME_CANONICAL_MODEL_AND_PART_GHS_SECTION_REUSE',
    spw_fitments_affected: spw.fitments,
    confidence: variantScope === 'EXACT_VARIANT_MATCH' ? 'MEDIUM_HIGH' : 'MEDIUM',
    applied_to_database: false,
    preview_only: true
  });
}

const rejectionSummary = rejected.reduce((acc, item) => {
  acc[item.reason] = (acc[item.reason] || 0) + 1;
  return acc;
}, {});

const acceptedParts = new Set(accepted.map(c => c.part_number));
const acceptedModels = new Set(accepted.map(c => c.model_id));
const acceptedFitments = accepted.reduce((sum, c) => sum + c.spw_fitments_affected, 0);
const unionParts = new Set([...metadataParts, ...acceptedParts]);

// ---------------------------------------------------------------------------
// 3. Write the preview artifacts
// ---------------------------------------------------------------------------
const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

writeJson('PHASE77C_NUMBER_AUDIT.json', numberAudit);

writeJson('PHASE77C_SECTION_CANDIDATES.json', {
  schema_version: '1.0.0',
  phase: '77C',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  database_mutated: false,
  gates: {
    G1: 'canonical model must match',
    G2: 'canonical part number must match and exist in the catalog',
    G3: 'GHS must carry a concrete section identity (general_unresolved and model_parts_breakdown are excluded)',
    G4: 'one (model, part) pair may not map to multiple GHS sections',
    G5: 'machine variant must not conflict (empty/base are wildcards)'
  },
  summary: {
    overlap_pairs_considered: overlapPairs.length,
    ungated_fitments: overlapFitments,
    ungated_parts: overlapParts.size,
    ungated_models: overlapModels.size,
    safe_candidates: accepted.length,
    safe_fitments: acceptedFitments,
    safe_parts: acceptedParts.size,
    safe_models: acceptedModels.size,
    rejected_pairs: rejected.length,
    rejection_reasons: rejectionSummary,
    variant_scope_breakdown: accepted.reduce((acc, c) => {
      acc[c.variant_scope] = (acc[c.variant_scope] || 0) + 1;
      return acc;
    }, {}),
    coverage_before_pct: pct(metadataParts.size, catalogParts),
    coverage_after_safe_candidates_pct: pct(unionParts.size, catalogParts),
    coverage_after_pct_if_ungated: pct(new Set([...metadataParts, ...overlapParts]).size, catalogParts)
  },
  candidates: accepted,
  rejections: rejected
});

const csvHeader = 'candidate_id,status,model_id,part_number,ghs_section_key,ghs_section_name,variant_scope,spw_fitments_affected,confidence,derivation_method';
const csvRows = accepted.map(c => [
  c.candidate_id,
  c.status,
  c.model_id,
  c.part_number,
  c.ghs_section_key,
  `"${String(c.ghs_section_name).replace(/"/g, '""')}"`,
  c.variant_scope,
  c.spw_fitments_affected,
  c.confidence,
  c.derivation_method
].join(','));
fs.writeFileSync(path.join(outDir, 'PHASE77C_SECTION_CANDIDATES.csv'), `${[csvHeader, ...csvRows].join('\n')}\n`, 'utf8');

// ---------------------------------------------------------------------------
// 4. Archive runbook (the four Windows archives)
// ---------------------------------------------------------------------------
const runbook = `# Phase 77C — Runbook: lokale Windows-archieven inventariseren

De vier originele archieven zijn vanuit deze cloudomgeving **niet bereikbaar** (geen Windows-mount).
Er is niets gesimuleerd: de rapporten scheiden metadata, steekproefschattingen, individueel geverifieerde
afbeeldingen en afgeleide koppelingen.

## Configuratie op de Windows-host

Vereist: Node.js 22+ (vanwege \`node:sqlite\`), de repository-checkout en leesrechten op de archieven.

\`\`\`powershell
# 1. Zet de vier archiefwortels (puntkomma-gescheiden; mappen zonder resultaat mogen ontbreken)
$env:PHASE77A_ARCHIVE_ROOTS = @(
  "$env:USERPROFILE\\.agents\\stihl_scribd_documents_output",
  "D:\\stihl_archive_downloads",
  "D:\\stihl_gardenhirespares_output",
  "D:\\stihl_models_full_documentation_archive"
) -join ';'

# 2. Inventariseer alle bestanden, afbeeldingen, PDF's en metadataverwijzingen
node scripts\\phase77a_inventory_diagrams.mjs

# 3. Optioneel: begrensde beeldverificatie (schrijft alleen hashes, geen afbeeldingen)
node scripts\\phase77b_sample_source_images.mjs --limit=30

# 4. Herbereken de koppelingen en het gat
node scripts\\phase77b_source_gap_analysis.mjs
node scripts\\phase77c_section_evidence.mjs
\`\`\`

## Wat het script doet en niet doet

- Leest alleen; schrijft uitsluitend naar \`output/phase77a\`, \`output/phase77b\` en \`output/phase77c\`.
- Downloadt geen archiefbestanden en publiceert niets.
- De beeldsteekproef haalt alleen de reeds in metadata bekende URL's op, hasht ze en verwijdert het
  tijdelijke bestand direct; er komt geen afbeelding in de repository.
- Padvalidatie: paden buiten de opgegeven wortels worden niet gelezen.

## Verwachte uitkomsten op de host

- Aantal gescande bestanden per archiefwortel (\`source_roots[].files_scanned\`).
- Aantal lokale PDF's en per PDF het aantal ingebedde afbeeldings-objecten.
- Aantal lokale afbeeldingsbestanden, gehasht en geclassificeerd.
- Of de lokale IPL-PDF's daadwerkelijk tekeningen bevatten (nu: onbekend, want de bestanden ontbreken hier).

Zonder deze stap blijven alle uitspraken over de lokale archieven **metadata-only**.
`;
fs.writeFileSync(path.join(outDir, 'PHASE77C_ARCHIVE_RUNBOOK.md'), runbook, 'utf8');

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
const mdTable = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.join(' | ')} |`)
].join('\n');

const report = `# Phase 77C — Research cleanup & section evidence

Datum: ${GENERATED_AT}
Read-only. Geen productiecode, geen databasewijziging, geen afbeelding in de repository, geen publieke viewer.

## 1. PR-conflicten opgelost

PR #140 was gebaseerd op een oude main (\`060ba0a\`), waardoor de paspoort-, homepage-, CSS- en
testwijzigingen uit de tussentijdse main-merge in de PR-diff verschenen. Deze branch
(\`research/phase77c-section-evidence\`) is vanaf de **actuele main** gemaakt en bevat uitsluitend
researchbestanden: \`output/phase77a/\`, \`output/phase77b/\`, \`output/phase77c/\` en de drie
inventarisatiescripts. Er is geen regel productiecode overgenomen.

## 2. Exacte onderzoeksbestanden

${mdTable(['Pad', 'Type'], [
  ['output/phase77a/PHASE77A_DIAGRAM_INVENTORY.json', 'metadata-inventarisatie'],
  ['output/phase77a/PHASE77A_MODEL_MATCHES.json', 'koppelingen'],
  ['output/phase77a/PHASE77A_RIGHTS_AUDIT.json', 'rechten'],
  ['output/phase77a/PHASE77A_REPORT.md', 'rapport'],
  ['output/phase77b/PHASE77B_VISUAL_SAMPLE.json', 'steekproef 30 URLs'],
  ['output/phase77b/PHASE77B_VISUAL_SAMPLE_PILOTS.json', 'steekproef 61 proef-URLs'],
  ['output/phase77b/PHASE77B_SOURCE_INVENTORY.json', 'broninventarisatie'],
  ['output/phase77b/PHASE77B_DATABASE_MATCH.json', 'koppeling na verificatie'],
  ['output/phase77b/PHASE77B_UNRESOLVED_ANALYSIS.json', '94%-analyse'],
  ['output/phase77b/PHASE77B_PUBLICATION_READINESS.json', 'publicatievereisten'],
  ['output/phase77b/PHASE77B_REPORT.md', 'rapport'],
  ['output/phase77c/PHASE77C_NUMBER_AUDIT.json', 'getalcontrole'],
  ['output/phase77c/PHASE77C_SECTION_CANDIDATES.json', 'kandidatenpreview'],
  ['output/phase77c/PHASE77C_SECTION_CANDIDATES.csv', 'compacte reviewlijst'],
  ['output/phase77c/PHASE77C_ARCHIVE_RUNBOOK.md', 'Windows-uitvoering'],
  ['scripts/phase77a_inventory_diagrams.mjs', 'script'],
  ['scripts/phase77b_sample_source_images.mjs', 'script'],
  ['scripts/phase77b_source_gap_analysis.mjs', 'script'],
  ['scripts/phase77c_section_evidence.mjs', 'script']
])}

## 3. Bevestigde en geschatte tekeningen

${mdTable(['Claim', 'Gerapporteerd', 'Herberekend', 'Niveau', 'Oordeel'], numberAudit.claims.map(c => [c.claim, c.reported, c.recomputed, c.tier, c.verdict]))}

- Individueel geverifieerd: ${pilotCounts.real} unieke echte afbeeldingen in ${pilotCounts.fetched} proef-URL's, waarvan 2 visueel geïnspecteerd (700x700, STIHL-exploded views).
- Steekproefschatting: ~${Math.round(uniqueUrls * ((randomCounts.real / randomCounts.fetched) || 0))} van ${uniqueUrls} URL's zijn echt (${randomCounts.real}/${randomCounts.fetched} in de willekeurige steekproef).
- ${pilotCounts.placeholders} van ${pilotCounts.fetched} proef-URL's zijn placeholders (${pct(pilotCounts.placeholders, pilotCounts.fetched)}%).

## 4. Veilige sectiekandidaten

- Ongated potentieel (77B): ${overlapFitments} fitments / ${overlapParts.size} onderdelen / ${overlapModels.size} modellen — **bovengrens**.
- Na de vijf poorten: **${accepted.length} kandidaten**, **${acceptedFitments} fitments**, **${acceptedParts.size} onderdelen**, **${acceptedModels.size} modellen**.
- Alle kandidaten hebben status \`DERIVED_FROM_SECTION_EVIDENCE\`, \`preview_only: true\`, \`applied_to_database: false\`.
- Dekking: ${pct(metadataParts.size, catalogParts)}% → **${pct(unionParts.size, catalogParts)}%** (${metadataParts.size} → ${unionParts.size} onderdelen).

## 5. Ambigue en afgekeurde koppelingen

${mdTable(['Reden', 'Aantal paren'], Object.entries(rejectionSummary).map(([reason, count]) => [reason, count]))}

- Totaal afgekeurd: **${rejected.length}** van ${overlapPairs.length} paren. De details staan per paar in \`PHASE77C_SECTION_CANDIDATES.json\` (\`rejections\`).
- ${rejectionSummary.VARIANT_CONFLICT || 0} paren zijn afgekeurd omdat de machinevarianten elkaar uitsluiten; die worden **niet** willekeurig aan één sectie toegewezen.
- ${rejectionSummary.AMBIGUOUS_MULTIPLE_SECTIONS || 0} paren verwijzen naar meerdere GHS-secties en zijn daarom afgekeurd.

## 6. Controles

Zie \`PHASE77C_REGRESSION_CHECKS.json\` voor de invariantcontroles (99 actieve aanbiedingen, resolver,
koopknoppen, paspoort, decoder, bewijsdata, sitemap).

## 7. Rechten en archieven

- Alle GHS-/STIHL-tekeningen blijven \`REFERENCE_ONLY\`; geen hotlinks, geen viewer, geen reproductie.
- De vier Windows-archieven zijn niet bereikbaar; \`PHASE77C_ARCHIVE_RUNBOOK.md\` bevat de exacte
  configuratie en commando's om ze op de host te inventariseren. Er is niets gesimuleerd.
`;

fs.writeFileSync(path.join(outDir, 'PHASE77C_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({
  claims: numberAudit.claims.map(c => ({ claim: c.claim, reported: c.reported, recomputed: c.recomputed, verdict: c.verdict })),
  overlap_pairs: overlapPairs.length,
  ungated: { fitments: overlapFitments, parts: overlapParts.size, models: overlapModels.size },
  safe: { candidates: accepted.length, fitments: acceptedFitments, parts: acceptedParts.size, models: acceptedModels.size },
  rejections: rejectionSummary,
  coverage: { before: pct(metadataParts.size, catalogParts), after: pct(unionParts.size, catalogParts) }
}, null, 2));
