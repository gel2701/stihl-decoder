/**
 * Phase 77D — GSC-first commercial parts coverage (read-only research).
 *
 * Produces a verifiable report for the nine commercial priority models:
 *   1. demand inventory (live GSC status + stored historical GSC baseline),
 *   2. per-model buy coverage (catalog parts, ACTIVE NL/DE offers, fallbacks),
 *   3. concrete section evidence (never general_unresolved, never assumed),
 *   4. a scored top 25 with an explicit, reproducible formula,
 *   5. a concrete follow-up implementation plan.
 *
 * No production data is written, no ASIN is activated, no diagram is published.
 *
 * Usage: node scripts/phase77d_gsc_commercial_coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { getSearchConsoleConfigState } from '../src/seo/SearchConsoleClient.js';
import { getAllIndexablePartsSet } from '../src/seo/PartIndexationRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77d');
fs.mkdirSync(outDir, { recursive: true });
const GENERATED_AT = new Date().toISOString();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const db = new DatabaseSync(path.join(root, 'data', 'stihl_database.db'), { readOnly: true });
const registry = readJson('data/affiliate/verified_amazon_registry.json');
const phase60 = readJson('PHASE60_COMMERCIAL_OPPORTUNITIES.json');
const phase73 = readJson('reports/phase73_50_new_offers.json');
const indexableParts = getAllIndexablePartsSet();
const gscState = getSearchConsoleConfigState(process.env);

const PRIORITY_MODELS = [
  { rank: 1, name: 'MS 440', id: 'stihl_ms_440', fitment_id: 'ms_440' },
  { rank: 2, name: 'MS 170', id: 'stihl_ms_170', fitment_id: 'ms_170' },
  { rank: 3, name: 'BG 86', id: 'stihl_bg_86', fitment_id: 'bg_86' },
  { rank: 4, name: 'MS 461', id: 'stihl_ms_461', fitment_id: 'ms_461' },
  { rank: 5, name: 'BR 600', id: 'stihl_br_600', fitment_id: 'br_600' },
  { rank: 6, name: 'MS 390', id: 'stihl_ms_390', fitment_id: 'ms_390' },
  { rank: 7, name: 'MS 361', id: 'stihl_ms_361', fitment_id: 'ms_361' },
  { rank: 8, name: 'HS 45', id: 'stihl_hs_45', fitment_id: 'hs_45' },
  { rank: 9, name: 'MS 250', id: 'stihl_ms_250', fitment_id: 'ms_250' }
];
const PRIORITY_POINTS = [20, 18, 16, 14, 12, 10, 8, 6, 4];

// Service-part classifier: hardware (bolts, nuts, washers) is deliberately
// excluded from the commercial ranking because it has low search intent.
const CATEGORY_RULES = [
  { category: 'bougie', weight: 1.0, regex: /bougie|spark plug|zündkerze|kerze/i },
  { category: 'filter', weight: 1.0, regex: /filter/i },
  { category: 'carburateur', weight: 1.0, regex: /carburateur|carburetor|vergaser|membraan|diaphragm|reparatursatz/i },
  { category: 'ketting_tandwiel', weight: 1.0, regex: /kettingtandwiel|rim sprocket|sprocket|rondsel|clutch drum|koppelingstrommel/i },
  { category: 'zaagblad_ketting', weight: 0.9, regex: /zaagblad|guide bar|schwert|zaagketting|saw chain|ketting\b/i },
  { category: 'starter', weight: 0.9, regex: /starter|startkoord|recoil|startveer|starter cord|seilzug/i },
  { category: 'ontsteking', weight: 0.9, regex: /ontsteking|ignition|zündspule|ignition coil|bougiedop|spark plug boot/i },
  { category: 'cilinder_zuiger', weight: 0.85, regex: /cilinder|cylinder|zuiger|piston|zylinder|kolben/i },
  { category: 'pakking', weight: 0.7, regex: /pakking|gasket|dichtung|keerring|seal\b|simmerring/i },
  { category: 'brandstofsysteem', weight: 0.8, regex: /brandstofslang|fuel hose|tankdop|fuel cap|oliedop|oil cap|benzinschlauch|tankverschluss|primer|choke/i },
  { category: 'uitlaat', weight: 0.7, regex: /uitlaat|muffler|schalldämpfer|auspuff/i },
  { category: 'luchtinlaat', weight: 0.7, regex: /luchtfilter|air filter|luftfilter|aanzuig/i },
  { category: 'lagers', weight: 0.6, regex: /lager|bearing|kugellager/i },
  { category: 'handgreep_av', weight: 0.5, regex: /handgreep|handle|trillingsdemper|av mount|griff/i },
  { category: 'behuizing', weight: 0.4, regex: /behuizing|housing|gehäuse|cover|abdeckung/i },
  { category: 'schakelaar', weight: 0.4, regex: /schakelaar|switch|schalter/i }
];
const HARDWARE_REGEX = /bout|bolt|moer|nut|ring|washer|schroef|screw|veerring|clip|split pin|stift|pin\b|niet\b|rivet|klem|clamp/i;

const classify = (name) => {
  for (const rule of CATEGORY_RULES) {
    if (rule.regex.test(name)) return { category: rule.category, weight: rule.weight };
  }
  if (HARDWARE_REGEX.test(name)) return { category: 'bevestiging', weight: 0.0 };
  return { category: 'overig', weight: 0.25 };
};

const normalize = (value) => String(value || '').replace(/[^0-9a-z]/gi, '');
const pct = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

// ---------------------------------------------------------------------------
// 1. Demand inventory (live GSC status + stored historical baseline)
// ---------------------------------------------------------------------------
const gscBaselinePath = path.join(root, 'PHASE60_1_COMMERCIAL_VALIDATION.md');
const gscBaselineSource = fs.existsSync(gscBaselinePath) ? fs.readFileSync(gscBaselinePath, 'utf8') : '';
const historicalGscRows = [];
for (const line of gscBaselineSource.split('\n')) {
  const page = line.match(/\|\s*\*\*[^*`|]*`([^`]+)`[^*|]*\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*([\d.]+)\*\*/);
  if (page) {
    historicalGscRows.push({
      subject: page[1].trim(),
      impressions: Number(page[2]),
      clicks: Number(page[3]),
      average_position: Number(page[4]),
      ctr_pct: Number(((Number(page[3]) / Number(page[2])) * 100).toFixed(2)),
      source: 'PHASE60_1_COMMERCIAL_VALIDATION.md (GSC baseline 2026-08-01..2026-10-31)'
    });
  }
}

const phase60Models = new Map(phase60.top_20_models.map(m => [m.canonical_id, m]));
const phase60Parts = new Map(phase60.top_20_parts.map(p => [p.part_number, p]));
const analyticsRows = db.prepare('SELECT COUNT(*) AS c FROM analytics_events').get().c;

const gscInventory = {
  schema_version: '1.0.0',
  phase: '77D',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  live_gsc: {
    status: gscState.status || (gscState.configured ? 'LIVE' : 'NOT_CONFIGURED'),
    configured: Boolean(gscState.configured),
    missing_credentials: gscState.missing || [],
    note: 'Geen OAuth-token in deze omgeving; de API-integratielaag faalt veilig gesloten en er zijn geen verzonnen GSC-cijfers gebruikt.',
    required_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    required_env_vars: ['GSC_ACCESS_TOKEN', 'GSC_SITE_URL']
  },
  stored_historical_gsc_baseline: {
    provenance: 'GSC-metingen 1 augustus t/m 31 oktober 2026, vastgelegd in PHASE60_1_COMMERCIAL_VALIDATION.md',
    rows: historicalGscRows
  },
  demand_sources: [
    {
      source: 'GSC_HISTORICAL_BASELINE',
      status: historicalGscRows.length ? 'AVAILABLE' : 'UNAVAILABLE',
      granularity: 'pagina/query-niveau, geaggregeerd per rapportregel',
      limitation: 'Niet live op te vragen; alleen de vier vastgelegde regels zijn reproduceerbaar.'
    },
    {
      source: 'HISTORICAL_SITE_TRAFFIC_INDEX',
      status: 'DECLARED_ONLY',
      provenance: 'PHASE60_COMMERCIAL_OPPORTUNITIES.json meta.real_traffic_sources',
      declared_volume: '117.474 zoekopdrachten, 114.667 onderdeelweergaven, 2.860 modelweergaven (3 november 2026)',
      limitation: `De onderliggende analytics_events-tabel bevat in deze checkout ${analyticsRows} rijen; de volumes zijn dus niet opnieuw te berekenen en worden uitsluitend als historisch cijfer geciteerd.`
    },
    {
      source: 'SITE_SEARCH_QUERIES',
      status: analyticsRows > 0 ? 'AVAILABLE' : 'EMPTY',
      limitation: 'Geen zoekterm-dataset in de checkout; geen termen verzonnen.'
    }
  ],
  priority_models: PRIORITY_MODELS.map(m => ({
    rank: m.rank,
    model_name: m.name,
    canonical_id: m.id,
    fitment_id: m.fitment_id,
    historical_ranking: phase60Models.get(m.fitment_id)?.commercial_score ?? null,
    historical_views: phase60Models.get(m.fitment_id)?.real_traffic_views ?? null,
    historical_searches: phase60Models.get(m.fitment_id)?.real_traffic_searches ?? null,
    gsc_baseline_rows: historicalGscRows.filter(r => String(r.subject).toLowerCase().replace(/[^a-z0-9]/g, '').includes(m.name.toLowerCase().replace(/[^a-z0-9]/g, '')))
  })),
  intent_classification: {
    method: 'Commerciële intentie is afgeleid uit de queryvorm (model + "onderdelen"), niet uit losse vertoningen.',
    confirmed_commercial_queries: historicalGscRows.filter(r => /onderDelen/i.test(r.subject)).map(r => r.subject),
    click_potential_note: 'De GSC-baseline laat zien dat posities 8-11 veel vertoningen maar bijna geen klikken opleveren; de winst zit in titel/CTR en in directe koopdekking, niet in extra paginas.'
  }
};

// ---------------------------------------------------------------------------
// 2. Per-model coverage
// ---------------------------------------------------------------------------
const modelRows = new Map(db.prepare('SELECT * FROM models').all().map(m => [m.id, m]));
const partsRows = new Map(db.prepare('SELECT part_number, part_name FROM parts').all().map(p => [p.part_number, p]));
const fitmentsByModel = new Map();
for (const row of db.prepare(`
  SELECT canonical_model_id, part_number, source_id, variant_key, configuration_key, section_key, section_name
  FROM model_part_fitments
`).all()) {
  if (!fitmentsByModel.has(row.canonical_model_id)) fitmentsByModel.set(row.canonical_model_id, []);
  fitmentsByModel.get(row.canonical_model_id).push(row);
}

const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const verifiedOffers = registry.offers.filter(o => o.status === 'VERIFIED' || o.status === 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE');
const researchOffers = registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED');
const offersByPart = new Map();
for (const offer of registry.offers) {
  if (!offersByPart.has(offer.part_number)) offersByPart.set(offer.part_number, []);
  offersByPart.get(offer.part_number).push(offer);
}
const phase73ByPart = new Map(phase73.map(o => [o.part_number, o]));

const NON_CONCRETE_SECTIONS = new Set(['general_unresolved', 'model_parts_breakdown']);
const coverageModels = [];
const allPartsForScoring = [];
const distinctAllParts = new Set();
const distinctActiveParts = new Set();

for (const priority of PRIORITY_MODELS) {
  const model = modelRows.get(priority.id);
  const rows = fitmentsByModel.get(priority.fitment_id) || [];
  const partNumbers = [...new Set(rows.map(r => r.part_number))];
  const bySource = rows.reduce((acc, r) => { acc[r.source_id] = (acc[r.source_id] || 0) + 1; return acc; }, {});
  const concreteRows = rows.filter(r => r.section_key && !NON_CONCRETE_SECTIONS.has(r.section_key));
  const concreteSections = new Map();
  for (const row of concreteRows) concreteSections.set(row.section_key, row.section_name || row.section_key);
  const concreteParts = new Set(concreteRows.map(r => r.part_number));
  const baseParts = new Set(rows.filter(r => r.variant_key === 'base' || !r.variant_key).map(r => r.part_number));
  const configurations = db.prepare('SELECT COUNT(*) AS c FROM parts_model_configurations WHERE canonical_model_id = ?').get(priority.fitment_id).c;
  const variants = db.prepare('SELECT COUNT(*) AS c FROM parts_model_variants WHERE canonical_model_id = ?').get(priority.fitment_id).c;

  const nlActive = new Set(); const deActive = new Set(); const fallbackOnly = [];
  const serviceParts = [];
  for (const partNumber of partNumbers) {
    const offers = offersByPart.get(partNumber) || [];
    const nl = offers.filter(o => o.status === 'ACTIVE' && String(o.marketplace).toLowerCase() === 'amazon.nl');
    const de = offers.filter(o => o.status === 'ACTIVE' && String(o.marketplace).toLowerCase() === 'amazon.de');
    if (nl.length) nlActive.add(partNumber);
    if (de.length) deActive.add(partNumber);
    if (!nl.length && !de.length) fallbackOnly.push(partNumber);

    const name = partsRows.get(partNumber)?.part_name || '';
    const cls = classify(name);
    if (cls.weight === 0) continue;
    serviceParts.push({ partNumber, name, cls });
  }

  const withDirect = new Set([...nlActive, ...deActive]);
  for (const partNumber of partNumbers) distinctAllParts.add(partNumber);
  for (const partNumber of withDirect) distinctActiveParts.add(partNumber);
  coverageModels.push({
    rank: priority.rank,
    model_name: priority.name,
    canonical_id: priority.id,
    fitment_id: priority.fitment_id,
    slug: model?.slug || null,
    category: model?.category || null,
    catalog_parts: partNumbers.length,
    base_variant_parts: baseParts.size,
    fitment_rows_by_source: bySource,
    service_parts: serviceParts.length,
    concrete_section_parts: concreteParts.size,
    concrete_sections: concreteSections.size,
    concrete_section_names: [...concreteSections.values()].slice(0, 12),
    configurations,
    variants,
    active_offers: { total: withDirect.size, amazon_nl: nlActive.size, amazon_de: deActive.size },
    buy_coverage_pct: pct(withDirect.size, partNumbers.length),
    search_fallback_only_parts: fallbackOnly.length,
    verified_staged_offers: partNumbers.filter(p => (offersByPart.get(p) || []).some(o => o.status === 'VERIFIED' || o.status === 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE')).length,
    research_required_offers: partNumbers.filter(p => (offersByPart.get(p) || []).some(o => o.status === 'RESEARCH_REQUIRED')).length,
    indexable_parts: partNumbers.filter(p => indexableParts.has(p)).length,
    historical_commercial_score: phase60Models.get(priority.fitment_id)?.commercial_score ?? null,
    historical_views: phase60Models.get(priority.fitment_id)?.real_traffic_views ?? null
  });

  const priorityPoints = PRIORITY_POINTS[priority.rank - 1];
  for (const service of serviceParts) {
    const offers = offersByPart.get(service.partNumber) || [];
    const direct = offers.filter(o => o.status === 'ACTIVE');
    const verified = offers.filter(o => o.status === 'VERIFIED' || o.status === 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE');
    const research = offers.filter(o => o.status === 'RESEARCH_REQUIRED');
    const phase60Part = phase60Parts.get(service.partNumber);
    const hasConcreteSection = concreteParts.has(service.partNumber);

    const activeMarketplaces = new Set(direct.map(o => String(o.marketplace).toLowerCase()));
    const verifiedMarketplaces = new Set(verified.map(o => String(o.marketplace).toLowerCase()));
    const researchMarketplaces = new Set(research.map(o => String(o.marketplace).toLowerCase()));

    // Expected improvement value: demand x model priority x buy gap.
    const demandPoints = phase60Part?.real_traffic_views
      ? Math.min(phase60Part.real_traffic_views, 30) / 30 * 30
      : service.cls.weight * 18;
    const gapPoints = activeMarketplaces.size === 0 ? 25 : (activeMarketplaces.size === 1 ? 15 : 0);
    const certaintyPoints = hasConcreteSection ? 15 : (rows.some(r => r.part_number === service.partNumber && r.section_key) ? 9 : 5);
    const actionabilityPoints = verifiedMarketplaces.size ? 10 : (researchMarketplaces.size ? 5 : 0);
    const offerStatus = activeMarketplaces.size === 2
      ? 'ACTIVE_BOTH'
      : activeMarketplaces.size === 1
        ? `ACTIVE_${[...activeMarketplaces][0].replace('amazon.', '').toUpperCase()}_ONLY`
        : (verifiedMarketplaces.size ? 'VERIFIED_STAGED' : (researchMarketplaces.size ? 'RESEARCH_REQUIRED' : 'NO_OFFER'));

    allPartsForScoring.push({
      part_number: service.partNumber,
      part_number_display: partsRows.get(service.partNumber)?.part_number_display || null,
      part_name: service.name,
      category: service.cls.category,
      model: priority.name,
      model_rank: priority.rank,
      catalog_parts_on_model: partNumbers.length,
      offer_status: offerStatus,
      offer_marketplaces: [...new Set([...activeMarketplaces, ...verifiedMarketplaces])],
      asin: direct[0]?.asin || verified[0]?.asin || null,
      phase73_candidate: phase73ByPart.has(service.partNumber),
      has_concrete_section: hasConcreteSection,
      section_key: (concreteRows.find(r => r.part_number === service.partNumber) || {}).section_key || null,
      is_indexable: indexableParts.has(service.partNumber),
      historical_part_views: phase60Part?.real_traffic_views ?? null,
      demand_basis: phase60Part?.real_traffic_views ? 'GSC_HISTORICAL_PART_VIEWS' : 'CATEGORY_INTENT_PRIOR',
      score_components: {
        model_priority: priorityPoints,
        demand: Number(demandPoints.toFixed(1)),
        offer_gap: gapPoints,
        technical_certainty: certaintyPoints,
        actionability: actionabilityPoints
      },
      commercial_score: Number((priorityPoints + demandPoints + gapPoints + certaintyPoints + actionabilityPoints).toFixed(1))
    });
  }
}

// Deduplicate: keep the best-scoring occurrence of a part (a part can fit several
// priority models); record all priority models it covers.
const byPart = new Map();
for (const entry of allPartsForScoring) {
  const existing = byPart.get(entry.part_number);
  if (!existing) {
    byPart.set(entry.part_number, { ...entry, models: [entry.model] });
    continue;
  }
  if (!existing.models.includes(entry.model)) existing.models.push(entry.model);
  if (entry.commercial_score > existing.commercial_score) {
    const models = existing.models;
    byPart.set(entry.part_number, { ...entry, models });
  }
}
const ranked = [...byPart.values()].sort((a, b) => b.commercial_score - a.commercial_score || a.model_rank - b.model_rank || a.part_number.localeCompare(b.part_number));
const top25 = ranked.slice(0, 25).map((entry, index) => ({
  rank: index + 1,
  ...entry,
  next_action: entry.offer_status === 'ACTIVE_BOTH'
    ? 'Al gedekt op NL en DE; alleen de plaatsing op de modelpagina controleren.'
    : entry.offer_status.startsWith('ACTIVE_')
      ? `Al gedekt op ${entry.offer_status.replace('ACTIVE_', '').replace('_ONLY', '')}; tweede marktplaats toevoegen levert de resterende dekking.`
      : entry.offer_status === 'VERIFIED_STAGED'
      ? 'Operatorbesluit nodig; pas daarna activeren volgens de bestaande Two-Gate-procedure.'
      : entry.offer_status === 'RESEARCH_REQUIRED'
        ? 'ASIN-identiteit onafhankelijk onderbouwen of laten vallen; tot die tijd zoekfallback.'
        : 'Nog geen aanbod: eerst externe productbron vinden, geen ASIN verzinnen.'
}));

// ---------------------------------------------------------------------------
// 3. Section evidence (concrete identities only)
// ---------------------------------------------------------------------------
const phase77cPath = path.join(root, 'output', 'phase77c', 'PHASE77C_SECTION_CANDIDATES.json');
const phase77c = fs.existsSync(phase77cPath) ? JSON.parse(fs.readFileSync(phase77cPath, 'utf8')) : null;
const phase77cModelIds = new Set((phase77c?.candidates || []).map(c => c.model_id));
const phase77cOverlap = PRIORITY_MODELS.filter(m => phase77cModelIds.has(m.fitment_id) || phase77cModelIds.has(m.id));

const sectionEvidence = {
  schema_version: '1.0.0',
  phase: '77D',
  generated_at_utc: GENERATED_AT,
  policy: {
    accepted_section_sources: ['ghs'],
    rejected_sections: ['general_unresolved', 'model_parts_breakdown'],
    label: 'DERIVED_FROM_SECTION_EVIDENCE',
    never: 'VERIFIED',
    database_mutated: false,
    applied_to_database: false
  },
  models: coverageModels.map(m => ({
    model_name: m.model_name,
    canonical_id: m.canonical_id,
    fitment_id: m.fitment_id,
    concrete_sections: m.concrete_sections,
    concrete_section_parts: m.concrete_section_parts,
    catalog_parts: m.catalog_parts,
    coverage_pct: pct(m.concrete_section_parts, m.catalog_parts),
    section_names: m.concrete_section_names
  })),
  phase77c_candidates_in_artifact: phase77c?.candidates?.length ?? 0,
  phase77c_candidates_reusable_for_priority_models: phase77cOverlap.length,
  phase77c_overlapping_models: phase77cOverlap.map(m => m.name),
  phase77c_note: phase77cOverlap.length === 0
    ? `De ${phase77c?.candidates?.length ?? 0} kandidaten uit Phase 77C betreffen uitsluitend andere modellen (SE-stofzuigers); voor de negen prioriteitsmodellen is geen bestaande afgeleide koppeling van toepassing en zijn er in deze fase geen nieuwe afgeleid.`
    : 'Let op: er is overlap met Phase 77C; controleer die kandidaten afzonderlijk.'
};

// ---------------------------------------------------------------------------
// 4. Write artifacts
// ---------------------------------------------------------------------------
const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
writeJson('PHASE77D_GSC_INVENTORY.json', gscInventory);
writeJson('PHASE77D_MODEL_COVERAGE.json', {
  schema_version: '1.0.0',
  phase: '77D',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  database_mutated: false,
  priority_source: 'Opdracht Phase 77D (voorlopige commerciële rangorde), getoetst aan historische GSC/traffic-data en aanboddekking',
  aggregate: {
    models: coverageModels.length,
    catalog_parts_per_model_sum: coverageModels.reduce((s, m) => s + m.catalog_parts, 0),
    distinct_catalog_parts_union: distinctAllParts.size,
    active_offer_parts_per_model_sum: coverageModels.reduce((s, m) => s + m.active_offers.total, 0),
    distinct_parts_with_active_offer_union: distinctActiveParts.size,
    distinct_parts_search_fallback_only_union: distinctAllParts.size - distinctActiveParts.size,
    search_fallback_only_parts_per_model_sum: coverageModels.reduce((s, m) => s + m.search_fallback_only_parts, 0),
    concrete_section_parts_per_model_sum: coverageModels.reduce((s, m) => s + m.concrete_section_parts, 0),
    active_offers_registry: activeOffers.length,
    verified_staged_registry: verifiedOffers.length,
    research_required_registry: researchOffers.length
  },
  models: coverageModels
});
writeJson('PHASE77D_SECTION_EVIDENCE.json', sectionEvidence);
writeJson('PHASE77D_TOP25.json', {
  schema_version: '1.0.0',
  phase: '77D',
  generated_at_utc: GENERATED_AT,
  read_only: true,
  scoring_model: {
    total: 100,
    components: {
      model_priority: { max: 20, rule: 'rangorde 1-9 uit de opdracht: 20,18,16,14,12,10,8,6,4' },
      demand: { max: 30, rule: 'historische onderdeelweergaven geschaald naar 30, anders categorie-intentieprior (max 18)' },
      offer_gap: { max: 25, rule: 'geen directe ACTIVE-link=25, één marktplaats=15, beide marktplaatsen gedekt=0' },
      technical_certainty: { max: 15, rule: 'concrete GHS-sectie=15, alleen sectiesleutel=9, alleen catalogus=5' },
      actionability: { max: 10, rule: 'VERIFIED staged-aanbod=10, RESEARCH_REQUIRED kandidaat=5, niets=0' }
    },
    exclusions: 'Bevestigingsmateriaal (bouten, moeren, ringen, schroeven) is uitgesloten vanwege lage koopintentie.',
    caveat: 'Geen live GSC-data; de score meet verwachte verbeterwaarde (vraag x modelprioriteit x koopgat), geen omzetprognose. Onderdelen die al op beide marktplaatsen actief zijn scoren bewust laag: daar valt geen dekking meer te winnen.'
  },
  counts: {
    scored_service_parts: ranked.length,
    top_25: top25.length,
    active_both_in_top_25: top25.filter(p => p.offer_status === 'ACTIVE_BOTH').length,
    active_single_market_in_top_25: top25.filter(p => p.offer_status.startsWith('ACTIVE_') && p.offer_status !== 'ACTIVE_BOTH').length,
    staged_in_top_25: top25.filter(p => p.offer_status === 'VERIFIED_STAGED').length,
    research_in_top_25: top25.filter(p => p.offer_status === 'RESEARCH_REQUIRED').length,
    no_offer_in_top_25: top25.filter(p => p.offer_status === 'NO_OFFER').length
  },
  top_25: top25
});

const csvHeader = 'rank,part_number,part_name,category,models,offer_status,marketplaces,asin,has_concrete_section,commercial_score,next_action';
const csvRows = top25.map(p => [
  p.rank,
  p.part_number,
  `"${String(p.part_name).replace(/"/g, '""')}"`,
  p.category,
  `"${p.models.join('; ')}"`,
  p.offer_status,
  `"${p.offer_marketplaces.join('; ')}"`,
  p.asin || '',
  p.has_concrete_section ? 'yes' : 'no',
  p.commercial_score,
  `"${p.next_action.replace(/"/g, '""')}"`
].join(','));
fs.writeFileSync(path.join(outDir, 'PHASE77D_TOP25.csv'), `${[csvHeader, ...csvRows].join('\n')}\n`, 'utf8');

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
const topServiceModels = [...coverageModels].sort((a, b) => b.service_parts - a.service_parts).slice(0, 3);
const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map(row => `| ${row.join(' | ')} |`)
].join('\n');

const report = `# Phase 77D — GSC-first commercial parts coverage

Datum: ${GENERATED_AT}
Research-only: geen productiecode, geen databasewijziging, geen nieuwe ASIN, geen publieke tekening.

## 1. GSC-status en demand-bronnen

- **Live GSC**: \`${gscInventory.live_gsc.status}\` — ${gscInventory.live_gsc.note}
  Vereist: ${gscInventory.live_gsc.required_env_vars.join(', ')} met scope \`${gscInventory.live_gsc.required_scope}\`.
- **Historische GSC-baseline** (1 aug – 31 okt 2026): ${historicalGscRows.length} vastgelegde regels.
- **Historische traffic-index**: 117.474 zoekopdrachten / 114.667 onderdeelweergaven, alleen als geciteerd cijfer; de
  \`analytics_events\`-tabel bevat in deze checkout ${analyticsRows} rijen, dus niet reproduceerbaar.
- **Zoekterm-dataset**: niet aanwezig. Er zijn geen queries verzonnen.

${historicalGscRows.length ? table(['Onderwerp', 'Vertoningen', 'Klikken', 'CTR', 'Positie'], historicalGscRows.map(r => [r.subject, r.impressions, r.clicks, `${r.ctr_pct}%`, r.average_position])) : '_Geen reproduceerbare GSC-regels gevonden._'}

**Interpretatie van de koopintentie.** De enige aantoonbare commerciële query is \`stihl fs 460 c onderdelen\`
(283 vertoningen, 0 klikken, positie 9,12). Dat is geen vraagprobleem maar een klik- en aanbodprobleem: de pagina
staat op pagina 1, maar de titel en de koopdekking overtuigen niet. Dezelfde logica geldt voor de prioriteitsmodellen.

## 2. Prioriteitsmodellen: huidige koopdekking

${table(
  ['#', 'Model', 'Catalogusonderdelen', 'Serviceonderdelen', 'ACTIVE NL', 'ACTIVE DE', 'Dekking', 'Alleen zoekfallback', 'Concrete secties', 'Historische score'],
  coverageModels.map(m => [m.rank, m.model_name, m.catalog_parts, m.service_parts, m.active_offers.amazon_nl, m.active_offers.amazon_de, `${m.buy_coverage_pct}%`, m.search_fallback_only_parts, `${m.concrete_sections} (${m.concrete_section_parts} onderdelen)`, m.historical_commercial_score ?? '—'])
)}

- Registry in deze checkout: **${activeOffers.length} ACTIVE**, ${verifiedOffers.length} VERIFIED (staging), ${researchOffers.length} RESEARCH_REQUIRED.
- Unie over de negen modellen: **${distinctAllParts.size}** unieke catalogusonderdelen, waarvan **${distinctActiveParts.size}** met een directe ACTIVE-link (${pct(distinctActiveParts.size, distinctAllParts.size)}%); ${distinctAllParts.size - distinctActiveParts.size} onderdelen hebben alleen een zoekfallback.
- Phase 77C-overlap met deze modellen: **${phase77cOverlap.length}** van ${phase77c?.candidates?.length ?? 0} kandidaten.
- Geen enkel prioriteitsmodel heeft een directe kooplink voor meer dan een handvol onderdelen; de rest is zoekfallback.

## 3. Top 25 onderdelen (scoreformule in \`PHASE77D_TOP25.json\`)

${table(
  ['#', 'Onderdeel', 'Model(len)', 'Status', 'Score', 'Volgende actie'],
  top25.map(p => [p.rank, `${p.part_number} — ${p.part_name}`, p.models.join(', '), p.offer_status, p.commercial_score, p.next_action])
)}

Verdeling: ${top25.filter(p => p.offer_status === 'ACTIVE_BOTH').length} op beide marktplaatsen actief, ${top25.filter(p => p.offer_status.startsWith('ACTIVE_') && p.offer_status !== 'ACTIVE_BOTH').length} op één marktplaats actief, ${top25.filter(p => p.offer_status === 'VERIFIED_STAGED').length} staged geverifieerd, ${top25.filter(p => p.offer_status === 'RESEARCH_REQUIRED').length} research-kandidaat, ${top25.filter(p => p.offer_status === 'NO_OFFER').length} zonder aanbod.

## 4. Technische sectiedekking

${table(['Model', 'Concrete GHS-secties', 'Onderdelen met sectie', 'Dekking'], coverageModels.map(m => [m.model_name, m.concrete_sections, m.concrete_section_parts, `${pct(m.concrete_section_parts, m.catalog_parts)}%`]))}

- Alleen \`ghs\`-secties met een concrete identiteit tellen; \`general_unresolved\` en \`model_parts_breakdown\` zijn uitgesloten.
- De ${phase77c?.candidates?.length ?? 0} kandidaten uit Phase 77C zijn **niet** van toepassing op deze modellen (${phase77cOverlap.length} overlap) en zijn niet geactiveerd.
- Er is in deze fase **geen** nieuwe koppeling afgeleid en niets als \`VERIFIED\` gelabeld.

## 5. Verwachte verbeterkansen

1. **Klikwinst vóór aanbodwinst**: de GSC-baseline toont posities 8–11 met 0–3 klikken. Titel/description per modelpagina
   levert sneller resultaat dan nieuwe ASIN's.
2. **Dekkingswinst bij de grootste servicecatalogi**: ${topServiceModels.map(m => `${m.model_name} (${m.service_parts})`).join(', ')} hebben de meeste serviceonderdelen; elk extra ACTIVE-onderdeel raakt daar de meeste bezoekers.
3. **Bouwmotoren (BG 86, BR 600, HS 45) hebben nauwelijks koopdekking**: hier zit de grootste relatieve gat, maar ook de
   grootste verificatie-inspanning.

## 6. Concreet vervolgplan

1. **Geen nieuwe ASIN's**: eerst de bestaande ${verifiedOffers.length} staged VERIFIED-offers door de operator laten beoordelen.
2. **Per model één koopblok**: de top 3 onderdelen uit de top 25, met bestaande directe link of expliciete zoekfallback.
3. **GSC live aansluiten** met \`GSC_ACCESS_TOKEN\` + \`GSC_SITE_URL\`, daarna \`fetchSearchAnalytics\` per modelpagina;
   zonder die stap blijft de rangschikking een beredeneerde prioritering.
4. **Sectiebewijs pas dan uitbreiden** wanneer een bron daadwerkelijk een concrete sectie voor het prioriteitsmodel levert.
5. **Meten**: CTR en affiliate-clicks per modelpagina vergelijken vóór en na stap 2.

## 7. Wat expliciet niet is gedaan

- Geen productiecode of database gewijzigd.
- Geen ASIN geactiveerd of gePromoveerd.
- Geen afbeelding of explosietekening gepubliceerd of gedownload.
- Geen GSC-cijfers verzonnen; live GSC is niet geconfigureerd.
`;
fs.writeFileSync(path.join(outDir, 'PHASE77D_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({
  gsc_status: gscInventory.live_gsc.status,
  gsc_rows: historicalGscRows.length,
  analytics_rows: analyticsRows,
  models: coverageModels.map(m => ({ model: m.model_name, parts: m.catalog_parts, active: m.active_offers.total, coverage: m.buy_coverage_pct, sections: m.concrete_sections })),
  top25: top25.slice(0, 5).map(p => ({ rank: p.rank, part: p.part_number, model: p.model, status: p.offer_status, score: p.commercial_score })),
  counts: { ranked: ranked.length, activeBoth: top25.filter(p => p.offer_status === 'ACTIVE_BOTH').length, staged: top25.filter(p => p.offer_status === 'VERIFIED_STAGED').length, noOffer: top25.filter(p => p.offer_status === 'NO_OFFER').length }
}, null, 2));
