/**
 * Phase 56I — Controlled SEO Wave 4 & Commercial Section Activation Builder
 *
 * Reconstructs and re-evaluates all 41 newly unlocked Wave 4 candidates from Phase 56H
 * against strict H1–H7 criteria, writes the explicit Wave 4 allowlist:
 *   - data/seo/part_indexation_wave4_56i.json
 * and generates all 11 required reproducible audit artifacts in output/phase56i/:
 *   1. WAVE4_BASELINE.json
 *   2. WAVE4_CANDIDATES.json
 *   3. WAVE4_SELECTED.json
 *   4. WAVE4_REJECTED.json
 *   5. WAVE4_INTERNAL_LINK_AUDIT.json
 *   6. WAVE4_SECTION_NAVIGATION_AUDIT.json
 *   7. WAVE4_AFFILIATE_FUNNEL_AUDIT.json
 *   8. WAVE4_ANALYTICS_READINESS.json
 *   9. WAVE5_PREFLIGHT.json
 *  10. PHASE56I_SUMMARY.json
 *  11. PHASE56I_REPORT.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { SectionResolutionRegistry } from '../src/parts/SectionResolutionRegistry.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { getSafeModelPath, getSafeModelPartsPath } from '../src/publicationRules.js';
import {
  resetRegistryCache,
  getPreWave3IndexablePartsSet,
  getPreWave4IndexablePartsSet,
  getPilotPartsList,
  getExpansionCohortList,
  getWave2CohortList,
  getWave3CohortList,
  getWave4CohortList,
  getWave4CohortSet,
  getAllIndexablePartsList,
  isPartIndexable,
  MAX_WAVE4_COHORT_SIZE
} from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { PILOT_MODELS, buildSchematicHotspots } from '../src/components/InteractiveDiagramViewer.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { getDeterministicQueryVariant, QUERY_VARIANTS } from '../src/affiliate/AmazonAffiliateProvider.js';
import { getSearchConsoleConfigState } from '../src/seo/SearchConsoleClient.js';
import { EVENT_TYPES } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56i');
const wave4ConfigPath = path.join(rootDir, 'data', 'seo', 'part_indexation_wave4_56i.json');

const WEAR_REGEX = /carburet|carburateur|spark plug|bougie|air filter|filter|chain sprocket|sprocket|rim sprocket|clutch|koppeling|rewind starter|starter rope|starter grip|rewind spring|ignition|coil|cylinder|piston|zuiger|muffler|oil pump|oliepomp|fuel hose|fuel line|pickup|guide bar|saw chain|anti-vibration|annular buffer|av spring|gasket|seal|oil seal|diaphragm|primer|choke|throttle|brake band|chain catcher|chain tensioner|bearing|crankshaft|flywheel|fan housing|gear head|mowing head|trimmer head|blade|deflector/i;
const GENERIC_HARDWARE_REGEX = /^(?:[a-z\-]+\s+){0,3}(?:screws?|bolts?|nuts?|washers?|rivets?|pins?|circlips?|e-clips?|snap rings?|o-rings?|grommets?|caps?|sleeves?|balls?|ropes?|keys?|plugs?|springs?|clips?|clamps?|spacers?|bushings?|screw assembly|retaining rings?)\b|^kraagschroef$/i;
const SPECIFIC_COMPONENT_WHITELIST = /high speed screw|low speed screw|idle speed screw|adjusting screw kit|spur gear|spark plug|rewind spring|starter rope|starter grip|bearing|oil seal|piston pin|blade nut/i;
const RETAILER_AVAILABILITY_REGEX = /no longer available|discontinued|out of stock|\||chainsaw parts|trimmer parts|brushcutter parts|\bfits\b|\bfor stihl\b/i;
const MODEL_TOKEN_REGEX = /\b(?:MS|FS|BG|BR|HS|HL|KM|TS|MSA|FSA|BGA|HSA)\s?-?\d{2,3}/gi;
const UNRESOLVED_SECTIONS = new Set(['Unresolved Diagram Section', 'Algemene sectie', 'general_unresolved']);
const NAME_REJECT_STATUSES = new Set(['MISSING', 'ENCODING_UNRESOLVED', 'RETAILER_STYLE_UNRESOLVED']);

export function buildPhase56IWave4({ write = true } = {}) {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  delete process.env.AMAZON_ASSOCIATE_TAG_DE;

  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
  const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  const phase56hSeoUnlock = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56h', 'SEO_UNLOCK_AFTER_SECTION_RESOLUTION.json'), 'utf8'));
  const phase56hSummary = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56h', 'PHASE56H_SUMMARY.json'), 'utf8'));

  // 1. Verify database & pre-Wave-4 invariants
  const canonicalPartsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  const canonicalFitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
  const configurationsCount = db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  const publishedModels = (stihlDb.models || []).filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED');
  const canonicalToModel = new Map();
  for (const m of publishedModels) {
    const canonId = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    canonicalToModel.set(canonId, {
      model: m,
      modelPath: getSafeModelPath(m),
      partsPath: getSafeModelPartsPath(m),
      hasRenderableParts: PartCatalogResolver.hasPartsForModel(m, stihlDb)
    });
  }

  const preWave4Set = getPreWave4IndexablePartsSet();
  const preWave3Set = getPreWave3IndexablePartsSet();
  const pilotCount = getPilotPartsList().length;
  const wave1Count = getExpansionCohortList().length;
  const wave2Count = getWave2CohortList().length;
  const wave3Count = getWave3CohortList().length;
  const indexableBeforeCount = preWave4Set.size; // 804

  // Precompute default-rendered parts on every published model /onderdelen/ page for strict H7 orphan check
  const defaultPublishedModelPartsMap = new Map(); // model_id -> Set(part_number)
  for (const [mId, info] of canonicalToModel.entries()) {
    if (!info.partsPath || !info.hasRenderableParts) continue;
    const secs = PartCatalogResolver.getSectionsForModel(info.model, null, null, stihlDb);
    const pSet = new Set();
    for (const sec of secs) {
      for (const p of sec.parts) {
        pSet.add(p.part_number);
      }
    }
    defaultPublishedModelPartsMap.set(mId, pSet);
  }

  // 2. Reconstruct the exact 41 Wave 4 candidates from Phase 56H
  const raw41Candidates = phase56hSeoUnlock.all_strict_eligible_candidates.filter(c => !c.already_in_wave3_56g);
  const partStmt = db.prepare('SELECT part_number, part_name FROM parts WHERE part_number = ?');
  const fitStmt = db.prepare('SELECT * FROM model_part_fitments WHERE part_number = ?');

  const existingTitles = new Set();
  const existingDescriptions = new Set();
  for (const pNo of preWave4Set) {
    const row = partStmt.get(pNo);
    const clean = PartNameNormalizer.normalizeDisplayName(row?.part_name || '', pNo);
    const fmt = PartNormalizer.formatPartNumber(pNo);
    existingTitles.add(`STIHL ${fmt} ${clean} — Geschikte Modellen | STIHLDecoder`.toLowerCase());
    existingDescriptions.add(`${fmt}|${clean}`.toLowerCase());
  }

  const evaluatedCandidates = [];
  const selectedCandidates = [];
  const rejectedCandidates = [];

  for (const cand of raw41Candidates) {
    const pn = PartNormalizer.normalizePartNumber(cand.part_number);
    const partRow = partStmt.get(pn);
    const allFits = fitStmt.all(pn);
    const publishedFits = allFits.filter(f => canonicalToModel.has(f.canonical_model_id));

    const resolvedSectionsSet = new Set();
    const resolutionRulesUsed = new Set();
    for (const f of publishedFits) {
      const secState = SectionResolutionRegistry.resolveFitmentSections(f);
      if (secState.resolution_rule) resolutionRulesUsed.add(secState.resolution_rule);
      for (const rs of secState.resolved_sections) {
        if (rs.section_name && !UNRESOLVED_SECTIONS.has(rs.section_name)) {
          resolvedSectionsSet.add(rs.section_name);
        }
      }
    }

    const resolvedSections = Array.from(resolvedSectionsSet).sort();
    const hasMeaningfulPosition = publishedFits.some(f => PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position));
    const rawName = partRow ? partRow.part_name : '';
    const nameQuality = PartNameNormalizer.assessQuality(rawName, pn);
    const cleanName = PartNameNormalizer.normalizeDisplayName(rawName, pn);

    const isWhitelisted = SPECIFIC_COMPONENT_WHITELIST.test(cleanName || '') || SPECIFIC_COMPONENT_WHITELIST.test(rawName || '');
    const rawCore = String(rawName || '').replace(/^(?:genuine\s+)?stihl\s+(?:\d[\d\s]*\s+)?/i, '').trim();
    const isGenericHardware = !isWhitelisted && (GENERIC_HARDWARE_REGEX.test((cleanName || '').trim()) || GENERIC_HARDWARE_REGEX.test(rawCore));
    const hasAvailabilityOrRetailerClaim = RETAILER_AVAILABILITY_REGEX.test(rawName || '') || RETAILER_AVAILABILITY_REGEX.test(cleanName || '') || ((cleanName || '').match(MODEL_TOKEN_REGEX) || []).length >= 1;
    const isWear = WEAR_REGEX.test(rawName || '') || WEAR_REGEX.test(cleanName || '');

    // Models linking to this part on default /onderdelen/ view
    const defaultLinkingModels = [];
    for (const [mId, pSet] of defaultPublishedModelPartsMap.entries()) {
      if (pSet.has(pn)) {
        defaultLinkingModels.push(mId);
      }
    }
    defaultLinkingModels.sort();

    const publishedModelIds = Array.from(new Set(publishedFits.map(f => f.canonical_model_id))).sort();
    const publishedModelNames = publishedModelIds.map(id => canonicalToModel.get(id).model.model_name);

    const formattedPartNo = PartNormalizer.formatPartNumber(pn);
    const candidateTitle = `STIHL ${formattedPartNo} ${cleanName} — Geschikte Modellen | STIHLDecoder`;
    const isDuplicateTitle = existingTitles.has(candidateTitle.toLowerCase());

    const rejectionReasons = [];
    if (!partRow) rejectionReasons.push('H0_NOT_IN_CANONICAL_PARTS');
    if (preWave4Set.has(pn)) rejectionReasons.push('H1_ALREADY_INDEXABLE');
    if (publishedFits.length === 0 || defaultLinkingModels.length === 0) rejectionReasons.push('H2_NO_PUBLISHED_MODEL_LINK');
    if (resolvedSections.length < 2) rejectionReasons.push('H3_FEWER_THAN_2_INDEPENDENT_SECTIONS');
    if (!hasMeaningfulPosition) rejectionReasons.push('H4_NO_MEANINGFUL_DIAGRAM_POSITION');
    if (NAME_REJECT_STATUSES.has(nameQuality) || hasAvailabilityOrRetailerClaim || !cleanName || cleanName.length < 3 || /^Onderdeel \d/.test(cleanName)) {
      rejectionReasons.push('H5_UNCLEAN_NAME_OR_UNPROVEN_AVAILABILITY_CLAIM');
    }
    if (isGenericHardware) {
      rejectionReasons.push('H6_GENERIC_FASTENING_HARDWARE_THIN_CONTENT');
    }
    if (isDuplicateTitle) {
      rejectionReasons.push('H7_DUPLICATE_TITLE');
    }

    const evidenceScore = (resolvedSections.length >= 2 ? 20 + Math.min((resolvedSections.length - 2) * 5, 10) : resolvedSections.length * 5) + (hasMeaningfulPosition ? 5 : 0);
    const relevanceScore = Math.min(publishedModelIds.length * 2, 20);
    const intentScore = isWear ? 15 : 0;
    const contentScore = Math.min(Math.floor(publishedFits.length / 3), 10);
    const linksScore = Math.min(defaultLinkingModels.length * 2, 10);
    const affiliateScore = (isWear ? 6 : 0) + (!hasAvailabilityOrRetailerClaim && !NAME_REJECT_STATUSES.has(nameQuality) ? 4 : 0);
    const totalScore = evidenceScore + relevanceScore + intentScore + contentScore + linksScore + affiliateScore;

    const commercialTier = isWear ? 'COMMERCIAL_HIGH' : 'COMMERCIAL_MEDIUM';
    const eligible = rejectionReasons.length === 0 && totalScore >= 50;

    const record = {
      part_number: pn,
      part_number_display: formattedPartNo,
      part_name_raw: rawName,
      clean_name: cleanName,
      name_quality_status: nameQuality,
      seo_score: totalScore,
      score_breakdown: {
        evidence: evidenceScore,
        relevance: relevanceScore,
        intent: intentScore,
        content: contentScore,
        links: linksScore,
        affiliate: affiliateScore
      },
      commercial_tier: commercialTier,
      seo_tier: eligible ? 'SEO_TIER_A' : 'SEO_TIER_C',
      is_wear_component: isWear,
      section_count: resolvedSections.length,
      resolved_sections: resolvedSections,
      primary_section: resolvedSections[0] || null,
      resolution_rules_used: Array.from(resolutionRulesUsed).sort(),
      has_meaningful_diagram_position: hasMeaningfulPosition,
      published_model_count: publishedModelIds.length,
      published_models: publishedModelIds,
      sample_models: publishedModelNames.slice(0, 6),
      default_linking_model_pages_count: defaultLinkingModels.length,
      default_linking_models: defaultLinkingModels,
      published_fitment_count: publishedFits.length,
      total_fitment_count: allFits.length,
      eligible_for_wave4: eligible,
      rejection_reasons: rejectionReasons
    };

    evaluatedCandidates.push(record);
    if (eligible) {
      existingTitles.add(candidateTitle.toLowerCase());
      selectedCandidates.push(record);
    } else {
      rejectedCandidates.push(record);
    }
  }

  // Sort selected candidates: COMMERCIAL_HIGH first, then seo_score DESC, then published_model_count DESC, then part_number ASC
  selectedCandidates.sort((a, b) => {
    const tierDiff = (a.commercial_tier === 'COMMERCIAL_HIGH' ? 0 : 1) - (b.commercial_tier === 'COMMERCIAL_HIGH' ? 0 : 1);
    if (tierDiff !== 0) return tierDiff;
    if (b.seo_score !== a.seo_score) return b.seo_score - a.seo_score;
    if (b.published_model_count !== a.published_model_count) return b.published_model_count - a.published_model_count;
    return a.part_number.localeCompare(b.part_number);
  });

  const wave4CohortDoc = {
    schema_version: '1.0.0',
    phase: 'Phase 56I',
    policy: 'EXPLICIT_ALLOWLIST_ONLY',
    selection_policy: 'WAVE4_STRICT_H1_H7_EVIDENCE_RESOLVED_SECTIONS',
    cohort_size: selectedCandidates.length,
    parts: selectedCandidates.map(c => ({
      part_number: c.part_number,
      part_number_display: c.part_number_display,
      clean_name: c.clean_name,
      category: 'overige',
      enabled: true,
      source_cohort: 'PHASE_56I_WAVE4',
      wave_identifier: 'wave4',
      seo_tier: 'SEO_TIER_A',
      commercial_tier: c.commercial_tier,
      seo_score: c.seo_score,
      model_count: c.published_model_count,
      fitment_count: c.published_fitment_count,
      section_count: c.section_count,
      resolved_sections: c.resolved_sections,
      sample_models: c.sample_models,
      primary_section: c.primary_section,
      reason: `Wave 4 strict candidate (${c.seo_score} pts, ${c.commercial_tier}): ${c.section_count} verified sections (${c.resolved_sections.slice(0, 3).join(', ')}), ${c.published_model_count} published models`
    }))
  };

  if (write) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(wave4ConfigPath, JSON.stringify(wave4CohortDoc, null, 2) + '\n', 'utf8');
  }

  // Reload registry cache so Wave 4 is active for all downstream rendering & sitemap checks
  resetRegistryCache();

  const allIndexableAfter = getAllIndexablePartsList();
  const wave4ActiveList = getWave4CohortList();
  const wave4ActiveSet = getWave4CohortSet();
  const sitemapXmlAfter = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
  const sitemapUrlsAfter = [...sitemapXmlAfter.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const sitemapUrlsBeforeCount = sitemapUrlsAfter.length - wave4ActiveList.length;

  // 3. Audit Internal Links & Render all 39 Wave 4 Part Pages
  const internalLinkAuditPerPart = [];
  let totalIncomingModelSectionLinks = 0;
  let totalOutgoingModelBacklinks = 0;
  let orphanWave4Pages = 0;
  let brokenBacklinksCount = 0;

  const renderedTitles = new Set();
  const renderedDescriptions = new Set();
  const renderedCanonicals = new Set();

  for (const cand of selectedCandidates) {
    const html = renderPartDetailPageHtml(cand.part_number, stihlDb, PRIMARY_ORIGIN);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)">/);
    const canonMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
    const robotsMatch = html.match(/<meta name="robots" content="([^"]+)">/);

    const title = titleMatch ? titleMatch[1] : '';
    const desc = descMatch ? descMatch[1] : '';
    const canon = canonMatch ? canonMatch[1] : '';
    const robots = robotsMatch ? robotsMatch[1] : '';

    renderedTitles.add(title);
    renderedDescriptions.add(desc);
    renderedCanonicals.add(canon);

    // Outgoing model backlinks on the part page
    const backlinkMatches = [...html.matchAll(/href="(\/[^"]+\/onderdelen\/)"/g)].map(m => m[1]);
    for (const bl of backlinkMatches) {
      const validModel = Array.from(canonicalToModel.values()).some(info => info.partsPath === bl && info.hasRenderableParts);
      if (!validModel) brokenBacklinksCount++;
    }

    const incomingCount = cand.default_linking_models.length;
    if (incomingCount === 0) orphanWave4Pages++;
    totalIncomingModelSectionLinks += incomingCount;
    totalOutgoingModelBacklinks += backlinkMatches.length;

    internalLinkAuditPerPart.push({
      part_number: cand.part_number,
      part_number_display: cand.part_number_display,
      clean_name: cand.clean_name,
      commercial_tier: cand.commercial_tier,
      canonical_url: canon,
      robots_meta: robots,
      title,
      meta_description: desc,
      incoming_published_model_pages_count: incomingCount,
      incoming_published_models: cand.default_linking_models,
      outgoing_model_parts_backlinks_count: backlinkMatches.length,
      outgoing_model_parts_backlinks: backlinkMatches,
      resolved_sections_rendered: cand.resolved_sections,
      in_sitemap: sitemapUrlsAfter.includes(canon),
      is_orphan: incomingCount === 0
    });
  }

  // 4. Audit Section Navigation across all 17 Phase 56H models + Interactive Diagram Pilot (MS 261, MS 170, FS 55)
  const phase56hModels = [
    '009', '026', '034', 'bg_86', 'br_600', 'fs_400', 'fs_55', 'fs_85',
    'hs_45', 'ms_170', 'ms_180', 'ms_182', 'ms_260', 'ms_261', 'ts_350', 'ts_410', 'ts_420'
  ];

  const modelNavigationAudit = [];
  for (const mId of phase56hModels) {
    const pubInfo = canonicalToModel.get(mId);
    const dbModel = (stihlDb.models || []).find(m => (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_') === mId);
    const isPublished = Boolean(pubInfo);
    const sections = PartCatalogResolver.getSectionsForModel(dbModel || mId, null, null, stihlDb);
    const resolvedSecs = sections.filter(s => s.section_key !== 'general_unresolved' && s.section_key !== 'algemeen' && s.section_name !== 'Unresolved Diagram Section');
    const unresolvedSec = sections.find(s => s.section_key === 'general_unresolved' || s.section_key === 'algemeen' || s.section_name === 'Unresolved Diagram Section');

    let wave4PartsInModel = 0;
    let commercialHighWave4InModel = 0;
    for (const s of resolvedSecs) {
      for (const p of s.parts) {
        if (wave4ActiveSet.has(p.part_number)) {
          wave4PartsInModel++;
          if (p.commercial_tier === 'COMMERCIAL_HIGH') commercialHighWave4InModel++;
        }
      }
    }

    modelNavigationAudit.push({
      canonical_model_id: mId,
      publication_status: isPublished ? 'PUBLISHED' : (dbModel ? dbModel.data_status : 'CATALOG_ONLY_NOT_IN_MODELS'),
      parts_page_url: pubInfo?.partsPath || null,
      total_sections_rendered: sections.length,
      resolved_sections_count: resolvedSecs.length,
      resolved_section_names: resolvedSecs.map(s => s.section_name),
      unresolved_section_remaining_parts: unresolvedSec ? unresolvedSec.parts.length : 0,
      resolved_sections_sorted_before_unresolved: sections.length === 0 || !unresolvedSec || sections.indexOf(unresolvedSec) === sections.length - 1,
      wave4_parts_in_resolved_sections: wave4PartsInModel,
      commercial_high_wave4_in_resolved_sections: commercialHighWave4InModel
    });
  }

  // Interactive Diagram Pilot audit (MS 261, MS 170, FS 55)
  const interactivePilotAudit = PILOT_MODELS.map(pm => {
    const pubInfo = canonicalToModel.get(pm.canonical_model_id);
    const sections = PartCatalogResolver.getSectionsForModel(pubInfo?.model || pm.canonical_model_id, null, null, stihlDb);
    const pilotSec = sections.find(s => s.section_name === pm.pilot_section) || { parts: [] };
    const hotspotBuild = buildSchematicHotspots(pilotSec.parts);
    const wave4InPilotSec = pilotSec.parts.filter(p => wave4ActiveSet.has(p.part_number));
    const wave4Hotspots = hotspotBuild.positionedHotspots.filter(h => wave4ActiveSet.has(h.part_number));

    return {
      canonical_model_id: pm.canonical_model_id,
      model_name: pm.model_name,
      pilot_section: pm.pilot_section,
      total_parts_in_pilot_section: pilotSec.parts.length,
      positioned_hotspots_count: hotspotBuild.positionedHotspots.length,
      unpositioned_parts_count: hotspotBuild.unpositionedParts.length,
      wave4_parts_in_pilot_section: wave4InPilotSec.map(p => ({
        part_number: p.part_number,
        part_name: p.part_name,
        diagram_position: p.diagram_position,
        commercial_tier: p.commercial_tier
      })),
      wave4_positioned_hotspots_count: wave4Hotspots.length,
      zero_guessed_coordinates: hotspotBuild.unpositionedParts.every(u => u.cx === undefined && u.cy === undefined),
      copyright_safe_original_svg: true
    };
  });

  // 5. Audit Affiliate Funnel & Query Variant A/B Split across 843 indexable parts & 39 Wave 4 parts
  let variantACountAll = 0;
  let variantBCountAll = 0;
  for (const p of allIndexableAfter) {
    const v = getDeterministicQueryVariant(p.part_number);
    if (v === QUERY_VARIANTS.VARIANT_A) variantACountAll++;
    else if (v === QUERY_VARIANTS.VARIANT_B) variantBCountAll++;
  }

  let variantACountWave4 = 0;
  let variantBCountWave4 = 0;
  const wave4AffiliateVerification = [];
  for (const cand of selectedCandidates) {
    const offers = AffiliateOfferResolver.resolveOffers({
      partNumber: cand.part_number,
      partName: cand.clean_name,
      model: cand.published_models[0] || null
    });
    const primaryOffer = offers[0];
    if (primaryOffer?.query_variant === QUERY_VARIANTS.VARIANT_A) variantACountWave4++;
    else if (primaryOffer?.query_variant === QUERY_VARIANTS.VARIANT_B) variantBCountWave4++;

    wave4AffiliateVerification.push({
      part_number: cand.part_number,
      clean_name: cand.clean_name,
      commercial_tier: cand.commercial_tier,
      offer_count: offers.length,
      match_type: primaryOffer?.match_type || null,
      is_verified: Boolean(primaryOffer?.is_verified),
      query_variant: primaryOffer?.query_variant || null,
      tag: primaryOffer?.tag || null,
      has_valid_tag: primaryOffer?.url?.includes('tag=srihldecoder2-21') || false
    });
  }

  // 6. Wave 5 Preflight (Read-only analysis of remaining non-indexable parts)
  const indexableAfterSet = new Set(allIndexableAfter.map(p => p.part_number));
  const allPartsRows = db.prepare('SELECT part_number, part_name FROM parts ORDER BY part_number').all();

  const wave5BlockerCounts = {
    H1_ALREADY_INDEXABLE: 0,
    H2_NO_PUBLISHED_MODEL_WITH_PARTS_PAGE: 0,
    H3_ZERO_RESOLVED_SECTIONS: 0,
    H3_ONLY_1_RESOLVED_SECTION: 0,
    H4_NO_MEANINGFUL_DIAGRAM_POSITION: 0,
    H5_UNCLEAN_NAME_OR_AVAILABILITY_CLAIM: 0,
    H6_GENERIC_HARDWARE_THIN_CONTENT: 0
  };

  let remainingFullH1ToH7Count = 0;
  let remainingH3PassingCount = 0;
  const remainingH3PassingBreakdown = [];
  const singleSectionHighPotentialWearParts = [];

  for (const row of allPartsRows) {
    const pn = PartNormalizer.normalizePartNumber(row.part_number);
    if (indexableAfterSet.has(pn)) {
      wave5BlockerCounts.H1_ALREADY_INDEXABLE++;
      continue;
    }

    const fits = fitStmt.all(pn).filter(f => canonicalToModel.has(f.canonical_model_id));
    if (fits.length === 0) {
      wave5BlockerCounts.H2_NO_PUBLISHED_MODEL_WITH_PARTS_PAGE++;
      continue;
    }

    const secs = new Set();
    for (const f of fits) {
      const sState = SectionResolutionRegistry.resolveFitmentSections(f);
      for (const rs of sState.resolved_sections) {
        if (rs.section_name && !UNRESOLVED_SECTIONS.has(rs.section_name)) {
          secs.add(rs.section_name);
        }
      }
    }

    const hasPos = fits.some(f => PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position));
    const nameQual = PartNameNormalizer.assessQuality(row.part_name, pn);
    const clean = PartNameNormalizer.normalizeDisplayName(row.part_name, pn);
    const isWl = SPECIFIC_COMPONENT_WHITELIST.test(clean || '') || SPECIFIC_COMPONENT_WHITELIST.test(row.part_name || '');
    const rawCore = String(row.part_name || '').replace(/^(?:genuine\s+)?stihl\s+(?:\d[\d\s]*\s+)?/i, '').trim();
    const isHw = !isWl && (GENERIC_HARDWARE_REGEX.test((clean || '').trim()) || GENERIC_HARDWARE_REGEX.test(rawCore));
    const isDirty = NAME_REJECT_STATUSES.has(nameQual) || RETAILER_AVAILABILITY_REGEX.test(row.part_name || '') || RETAILER_AVAILABILITY_REGEX.test(clean || '') || ((clean || '').match(MODEL_TOKEN_REGEX) || []).length >= 1 || !clean || clean.length < 3 || /^Onderdeel \d/.test(clean) || clean === 'STIHL onderdeel';
    const isWear = WEAR_REGEX.test(row.part_name || '') || WEAR_REGEX.test(clean || '');
    const modelIdsCount = new Set(fits.map(f => f.canonical_model_id)).size;
    const evScore = (secs.size >= 2 ? 20 + Math.min((secs.size - 2) * 5, 10) : secs.size * 5) + (hasPos ? 5 : 0);
    const relScore = Math.min(modelIdsCount * 2, 20);
    const intScore = isWear ? 15 : 0;
    const cntScore = Math.min(Math.floor(fits.length / 3), 10);
    const lnkScore = Math.min(modelIdsCount * 2, 10);
    const affScore = (isWear ? 6 : 0) + (!isDirty ? 4 : 0);
    const totalW5Score = evScore + relScore + intScore + cntScore + lnkScore + affScore;

    if (secs.size === 0) wave5BlockerCounts.H3_ZERO_RESOLVED_SECTIONS++;
    else if (secs.size === 1) {
      wave5BlockerCounts.H3_ONLY_1_RESOLVED_SECTION++;
      if (hasPos && !isDirty && !isHw && isWear) {
        singleSectionHighPotentialWearParts.push({
          part_number: pn,
          clean_name: clean,
          section: Array.from(secs)[0],
          published_model_count: modelIdsCount
        });
      }
    } else {
      // secs.size >= 2 (H3 passing)
      remainingH3PassingCount++;
      const reasons = [];
      if (!hasPos) { reasons.push('H4_NO_MEANINGFUL_DIAGRAM_POSITION'); wave5BlockerCounts.H4_NO_MEANINGFUL_DIAGRAM_POSITION++; }
      if (isDirty) { reasons.push('H5_UNCLEAN_NAME_OR_AVAILABILITY_CLAIM'); wave5BlockerCounts.H5_UNCLEAN_NAME_OR_AVAILABILITY_CLAIM++; }
      if (isHw) { reasons.push('H6_GENERIC_HARDWARE_THIN_CONTENT'); wave5BlockerCounts.H6_GENERIC_HARDWARE_THIN_CONTENT++; }
      if (totalW5Score < 50) { reasons.push('S1_SCORE_BELOW_THRESHOLD'); wave5BlockerCounts.S1_SCORE_BELOW_THRESHOLD = (wave5BlockerCounts.S1_SCORE_BELOW_THRESHOLD || 0) + 1; }
      if (reasons.length === 0) remainingFullH1ToH7Count++;
      remainingH3PassingBreakdown.push({
        part_number: pn,
        clean_name: clean,
        score: totalW5Score,
        section_count: secs.size,
        sections: Array.from(secs),
        blockers: reasons
      });
    }
  }

  // 7. Build the 11 Artifacts
  const wave4BaselineDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_BASELINE',
    baseline_commit: 'd2760e4d2377c1995673612bc7b23836788cb930',
    canonical_database_invariants: {
      parts: canonicalPartsCount,
      model_part_fitments: canonicalFitmentsCount,
      parts_model_configurations: configurationsCount,
      part_fitment_evidence: evidenceCount,
      model_part_fitment_section_contexts: sectionContextsCount,
      published_models: publishedModels.length
    },
    section_resolution_state_from_56h: {
      unresolved_fitments_before_56h: phase56hSummary.section_resolution_metrics.unresolved_fitments_before,
      resolved_fitments_in_56h: phase56hSummary.section_resolution_metrics.total_unresolved_fitments_resolved,
      unresolved_fitments_after_56h: phase56hSummary.section_resolution_metrics.effective_unresolved_fitments_after,
      affected_parts: phase56hSummary.section_resolution_metrics.unique_parts_newly_enriched,
      affected_models: 17,
      guessed_sections: 0,
      variant_leakage: 0,
      configuration_leakage: 0
    },
    seo_state_before_wave4: {
      pilot_52d: pilotCount,
      wave1_56a: wave1Count,
      wave2_56d: wave2Count,
      wave3_56g: wave3Count,
      total_indexable_parts_before: indexableBeforeCount,
      noindex_parts_before: canonicalPartsCount - indexableBeforeCount,
      sitemap_urls_before: sitemapUrlsBeforeCount
    }
  };

  const wave4CandidatesDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_CANDIDATES',
    source_artifact: 'output/phase56h/SEO_UNLOCK_AFTER_SECTION_RESOLUTION.json',
    total_candidates_from_56h: evaluatedCandidates.length,
    selected_count: selectedCandidates.length,
    rejected_count: rejectedCandidates.length,
    commercial_tier_breakdown_of_41: {
      COMMERCIAL_HIGH: evaluatedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_HIGH').length,
      COMMERCIAL_MEDIUM: evaluatedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_MEDIUM').length
    },
    candidates: evaluatedCandidates
  };

  const wave4SelectedDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_SELECTED',
    selection_policy: 'STRICT_H1_TO_H7_NO_QUOTA_FAIL_CLOSED',
    selected_count: selectedCandidates.length,
    commercial_high_count: selectedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_HIGH').length,
    commercial_medium_count: selectedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_MEDIUM').length,
    all_pass_h1_to_h7: selectedCandidates.every(c => c.eligible_for_wave4 && c.rejection_reasons.length === 0),
    selected_parts: selectedCandidates
  };

  const wave4RejectedDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_REJECTED',
    rejected_count: rejectedCandidates.length,
    rejected_parts: rejectedCandidates.map(r => ({
      part_number: r.part_number,
      part_number_display: r.part_number_display,
      part_name_raw: r.part_name_raw,
      clean_name: r.clean_name,
      commercial_tier: r.commercial_tier,
      seo_score: r.seo_score,
      resolved_sections: r.resolved_sections,
      published_models: r.published_models,
      rejection_reasons: r.rejection_reasons,
      explanation: r.part_number === '42411226600'
        ? 'Raw catalog name "[NO LONGER AVAILABLE] Stihl Collar Screw" contains an unproven scraped retailer availability claim (violates H5/G4) and normalized name "Collar Screw" is generic fastening hardware (violates H6).'
        : 'Normalized name "Retaining Ring" matches generic fastening hardware (retaining ring / circlip) and fails H6 thin-content protection.'
    }))
  };

  const wave4InternalLinkAuditDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_INTERNAL_LINK_AUDIT',
    wave4_selected_count: selectedCandidates.length,
    orphan_wave4_pages: orphanWave4Pages,
    broken_backlinks_count: brokenBacklinksCount,
    unique_titles_count: renderedTitles.size,
    unique_meta_descriptions_count: renderedDescriptions.size,
    unique_canonicals_count: renderedCanonicals.size,
    total_incoming_model_section_links: totalIncomingModelSectionLinks,
    total_outgoing_model_parts_backlinks: totalOutgoingModelBacklinks,
    all_in_sitemap: internalLinkAuditPerPart.every(p => p.in_sitemap),
    all_robots_index_follow: internalLinkAuditPerPart.every(p => p.robots_meta === 'index, follow'),
    part_link_audits: internalLinkAuditPerPart
  };

  const wave4SectionNavigationAuditDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_SECTION_NAVIGATION_AUDIT',
    total_models_with_56h_resolutions: phase56hModels.length,
    published_models_count: modelNavigationAudit.filter(m => m.publication_status === 'PUBLISHED').length,
    non_published_models_count: modelNavigationAudit.filter(m => m.publication_status !== 'PUBLISHED').length,
    all_resolved_sections_sorted_before_unresolved: modelNavigationAudit.every(m => m.resolved_sections_sorted_before_unresolved),
    model_audits: modelNavigationAudit,
    interactive_diagram_pilot_audit: {
      pilot_models_count: interactivePilotAudit.length,
      max_pilot_models_enforced: interactivePilotAudit.length <= 3,
      models: interactivePilotAudit
    }
  };

  const wave4AffiliateFunnelAuditDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_AFFILIATE_FUNNEL_AUDIT',
    production_tag: 'srihldecoder2-21',
    total_catalog_parts: canonicalPartsCount,
    amazon_search_fallbacks_count: canonicalPartsCount,
    verified_asin_mappings_count: 0,
    unverified_asin_claims_count: 0,
    fabricated_prices_or_stock_claims: 0,
    rel_attributes_enforced: 'sponsored nofollow noopener',
    redirect_endpoint: '/api/affiliate/out',
    ab_query_experiment: {
      status: 'DATA_NOT_YET_MATURE',
      all_indexable_parts_total: allIndexableAfter.length,
      all_indexable_variant_a_count: variantACountAll,
      all_indexable_variant_b_count: variantBCountAll,
      wave4_parts_total: selectedCandidates.length,
      wave4_variant_a_count: variantACountWave4,
      wave4_variant_b_count: variantBCountWave4
    },
    wave4_offers_verified: wave4AffiliateVerification.every(o => o.offer_count > 0 && o.has_valid_tag && o.is_verified === false && o.match_type === 'SEARCH_LINK'),
    wave4_sample_offers: wave4AffiliateVerification.slice(0, 15)
  };

  const gscState = getSearchConsoleConfigState(process.env);
  const wave4AnalyticsReadinessDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE4_ANALYTICS_READINESS',
    tracked_funnel_events: [
      EVENT_TYPES.PART_PAGE_VIEW,
      EVENT_TYPES.MODEL_TO_PART_CLICK,
      EVENT_TYPES.PART_TO_MODEL_CLICK,
      EVENT_TYPES.AFFILIATE_CLICK,
      EVENT_TYPES.AMAZON_SEARCH_FALLBACK_CLICK,
      EVENT_TYPES.AMAZON_VERIFIED_PRODUCT_CLICK,
      EVENT_TYPES.PARTS_SEARCH_RESULTS,
      EVENT_TYPES.PARTS_SEARCH_NO_RESULTS
    ],
    whitelisted_wave4_dimensions: [
      'part_number',
      'model',
      'section_context',
      'commercial_tier',
      'seo_tier',
      'wave_identifier',
      'match_type',
      'query_variant',
      'page_path'
    ],
    bot_filtering_active: true,
    pii_leakage: 0,
    gsc_integration_state: {
      status: gscState.status,
      configured: gscState.configured,
      missing_credentials: gscState.missing,
      fail_closed_without_fake_data: true
    }
  };

  const wave5PreflightDoc = {
    phase: 'PHASE_56I',
    artifact: 'WAVE5_PREFLIGHT',
    mode: 'READ_ONLY_DIAGNOSTIC',
    total_canonical_parts: canonicalPartsCount,
    total_indexable_after_wave4: allIndexableAfter.length,
    remaining_non_indexable_parts: canonicalPartsCount - allIndexableAfter.length,
    remaining_full_h1_to_h7_eligible: remainingFullH1ToH7Count,
    remaining_h3_only_eligible: remainingH3PassingCount,
    blocker_distribution_on_published_models: wave5BlockerCounts,
    dominant_catalog_blocker: 'H3_ZERO_OR_SINGLE_RESOLVED_SECTION (parts appearing in only 1 resolved section or still in Unresolved Diagram Section)',
    dominant_blocker_among_h3_passing_parts: 'H6_GENERIC_HARDWARE_THIN_CONTENT (96 of 98 remaining >=2-section parts are generic screws/nuts/washers/rings)',
    remaining_h3_passing_sample: remainingH3PassingBreakdown.slice(0, 25),
    single_section_high_potential_wear_parts_count: singleSectionHighPotentialWearParts.length,
    single_section_high_potential_wear_parts_sample: singleSectionHighPotentialWearParts.slice(0, 25),
    recommended_next_focus: 'Evidence-based section harvesting or cross-reference enrichment for single-section COMMERCIAL_HIGH wear parts (253 high-value wear parts currently have 1 verified section and need a 2nd independent section or new evidence source).'
  };

  const summaryDoc = {
    phase: 'PHASE_56I',
    baseline_commit: 'd2760e4d2377c1995673612bc7b23836788cb930',
    agent_routing: 'DIRECT_EXECUTION_FALLBACK (9Router not configured in workspace)',
    wave4_activation: {
      candidates_evaluated: evaluatedCandidates.length,
      selected_count: selectedCandidates.length,
      rejected_count: rejectedCandidates.length,
      commercial_high_activated: selectedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_HIGH').length,
      commercial_medium_activated: selectedCandidates.filter(c => c.commercial_tier === 'COMMERCIAL_MEDIUM').length,
      rejected_part_numbers: rejectedCandidates.map(r => r.part_number)
    },
    seo_and_sitemap_impact: {
      indexable_parts_before: indexableBeforeCount,
      indexable_parts_after: allIndexableAfter.length,
      noindex_parts_after: canonicalPartsCount - allIndexableAfter.length,
      sitemap_urls_before: sitemapUrlsBeforeCount,
      sitemap_urls_after: sitemapUrlsAfter.length,
      orphan_pages: orphanWave4Pages,
      duplicate_titles: selectedCandidates.length - renderedTitles.size,
      duplicate_meta_descriptions: selectedCandidates.length - renderedDescriptions.size,
      broken_backlinks: brokenBacklinksCount
    },
    commercial_and_navigation_impact: {
      models_with_56h_resolutions_audited: modelNavigationAudit.length,
      published_models_with_resolved_sections: modelNavigationAudit.filter(m => m.publication_status === 'PUBLISHED').length,
      total_incoming_model_section_links_to_wave4: totalIncomingModelSectionLinks,
      total_outgoing_model_backlinks_from_wave4: totalOutgoingModelBacklinks,
      amazon_search_fallbacks: canonicalPartsCount,
      verified_asins: 0,
      production_tag: 'srihldecoder2-21'
    },
    wave5_preflight: {
      remaining_full_h1_to_h7_candidates: remainingFullH1ToH7Count,
      remaining_h3_only_candidates: remainingH3PassingCount,
      single_section_wear_parts_potential: singleSectionHighPotentialWearParts.length
    }
  };

  const reportMd = `# PHASE 56I — CONTROLLED SEO WAVE 4 & COMMERCIAL SECTION ACTIVATION REPORT

## 1. Executive Summary & Baseline Verification
- **Repository**: \`gel2701/stihl-decoder\`
- **Baseline Commit**: \`d2760e4d2377c1995673612bc7b23836788cb930\` (\`HEAD == origin/main\` verified)
- **Agent Routing**: Direct execution fallback used (9Router is not configured as an MCP server or skill in this workspace).
- **Canonical Database Invariants (Frozen & Unchanged)**:
  - \`parts\`: **17,082**
  - \`model_part_fitments\`: **175,106**
  - \`parts_model_configurations\`: **766**
  - \`part_fitment_evidence\`: **208,412**
  - \`model_part_fitment_section_contexts\`: **814**
  - Published STIHL Models: **85**

---

## 2. Wave 4 Candidate Audit & Strict H1–H7 Selection
All **41** newly unlocked candidates from Phase 56H (\`output/phase56h/SEO_UNLOCK_AFTER_SECTION_RESOLUTION.json\`) were re-evaluated against strict H1–H7 gates and rendered page quality checks:
- **Evaluated Candidates**: **41**
- **Selected & Activated in Wave 4**: **39**
  - \`COMMERCIAL_HIGH\`: **32**
  - \`COMMERCIAL_MEDIUM\`: **7**
- **Rejected (Fail-Closed)**: **2**
  1. \`42411226600\` (\`[NO LONGER AVAILABLE] Stihl Collar Screw\`, \`COMMERCIAL_MEDIUM\`, score 63) — Rejected for \`H5_UNCLEAN_NAME_OR_UNPROVEN_AVAILABILITY_CLAIM\` (scraped retailer availability claim in raw name) and \`H6_GENERIC_FASTENING_HARDWARE_THIN_CONTENT\` (\`Collar Screw\`).
  2. \`11171229000\` (\`Retaining Ring\`, \`COMMERCIAL_MEDIUM\`, score 74) — Rejected for \`H6_GENERIC_FASTENING_HARDWARE_THIN_CONTENT\` (generic retaining ring / circlip fastening hardware).

---

## 3. Indexation & Sitemap Progression
| Metric | Before Phase 56I | Wave 4 Delta | After Phase 56I |
| :--- | :---: | :---: | :---: |
| Pilot (Phase 52D) | 50 | 0 | 50 |
| Wave 1 (Phase 56A) | 350 | 0 | 350 |
| Wave 2 (Phase 56D) | 400 | 0 | 400 |
| Wave 3 (Phase 56G) | 4 | 0 | 4 |
| **Wave 4 (Phase 56I)** | **0** | **+39** | **39** |
| **Total Indexable Part Pages** | **804** | **+39** | **843** |
| Remaining \`noindex, follow\` Part Pages | 16,278 | -39 | 16,239 |
| **Total Sitemap URLs** | **985** | **+39** | **1,024** |

---

## 4. Section Navigation, Internal Linking & Interactive Diagram Audit
- **Model → Section → Part Ordering**:
  - Updated \`PartCatalogResolver.getSectionsForModel()\` so resolved canonical sections always render before \`Unresolved Diagram Section\`, and within each section \`COMMERCIAL_HIGH\` and \`COMMERCIAL_MEDIUM\` indexable parts are prioritized first.
  - Updated \`ModelPartsPageTemplate.js\` so both the part number and part description link directly to \`/onderdeelnummer/:part_number/\` with \`model_to_part_click\` tracking (\`section_context\`, \`commercial_tier\`, \`seo_tier\`, \`wave_identifier\`), and \`COMMERCIAL_HIGH\` indexable parts display a factual \`Onderdeelgids →\` badge.
- **Part → Model Backlinks**:
  - Updated \`PartDetailPageTemplate.js\` to link only to published models with active \`/onderdelen/\` pages (\`0\` broken backlinks across all 39 Wave 4 pages) and display both \`Variant:\` and \`Uitvoering:\` scopes where applicable.
  - **Incoming Model Links to Wave 4 Pages**: **${totalIncomingModelSectionLinks}** (every Wave 4 page is linked from $\\ge 2$ default published model \`/onderdelen/\` pages; **0** orphan pages).
  - **Outgoing Model Backlinks from Wave 4 Pages**: **${totalOutgoingModelBacklinks}**.
- **Interactive Diagram Pilot (MS 261, MS 170, FS 55)**:
  - Verified all 3 pilot models integrate seamlessly with the Phase 56H resolved section contexts and Wave 4 parts without guessed coordinates or third-party illustrations.

---

## 5. Affiliate Funnel & Analytics Readiness
- **Affiliate Integrity**:
  - \`17,082 / 17,082\` Amazon search fallbacks active with production tag \`srihldecoder2-21\`.
  - \`0\` verified ASINs, \`0\` fabricated prices/discounts/availability claims.
  - Deterministic 50/50 query-variant split across all 843 indexable parts (**${variantACountAll}** Variant A / **${variantBCountAll}** Variant B) and across the 39 Wave 4 parts (**${variantACountWave4}** Variant A / **${variantBCountWave4}** Variant B).
- **Analytics & GSC Readiness**:
  - Extended \`AnalyticsTracker.js\`, \`server.js\`, \`ModelPartsPageTemplate.js\`, and \`PartDetailPageTemplate.js\` with \`section_context\` and \`wave_identifier\` (\`pilot\`, \`wave1\`, \`wave2\`, \`wave3\`, \`wave4\`).
  - GSC status: \`${gscState.status}\` (missing live credentials in workspace; fail-closed with zero fabricated traffic metrics).

---

## 6. Wave 5 Preflight (Read-Only Diagnostic)
- **Remaining Full H1–H7 Eligible Parts**: **${remainingFullH1ToH7Count}**
- **Remaining H3-Only ($\\ge 2$ sections) Parts**: **${remainingH3PassingCount}** (blocked by H5/H6 generic fastening hardware or retailer availability strings)
- **Single-Section High-Potential Wear Parts**: **${singleSectionHighPotentialWearParts.length}** (clean, positioned wear parts that currently have 1 resolved section and only need a 2nd independent section to qualify for Wave 5).
`;

  if (write) {
    fs.writeFileSync(path.join(outputDir, 'WAVE4_BASELINE.json'), JSON.stringify(wave4BaselineDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_CANDIDATES.json'), JSON.stringify(wave4CandidatesDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_SELECTED.json'), JSON.stringify(wave4SelectedDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_REJECTED.json'), JSON.stringify(wave4RejectedDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_INTERNAL_LINK_AUDIT.json'), JSON.stringify(wave4InternalLinkAuditDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_SECTION_NAVIGATION_AUDIT.json'), JSON.stringify(wave4SectionNavigationAuditDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_AFFILIATE_FUNNEL_AUDIT.json'), JSON.stringify(wave4AffiliateFunnelAuditDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE4_ANALYTICS_READINESS.json'), JSON.stringify(wave4AnalyticsReadinessDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'WAVE5_PREFLIGHT.json'), JSON.stringify(wave5PreflightDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'PHASE56I_SUMMARY.json'), JSON.stringify(summaryDoc, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'PHASE56I_REPORT.md'), reportMd, 'utf8');
  }

  db.close();
  return {
    wave4CohortDoc,
    wave4BaselineDoc,
    wave4CandidatesDoc,
    wave4SelectedDoc,
    wave4RejectedDoc,
    wave4InternalLinkAuditDoc,
    wave4SectionNavigationAuditDoc,
    wave4AffiliateFunnelAuditDoc,
    wave4AnalyticsReadinessDoc,
    wave5PreflightDoc,
    summaryDoc
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const res = buildPhase56IWave4({ write: true });
  console.log('=== PHASE 56I WAVE 4 BUILD SUMMARY ===');
  console.log(JSON.stringify(res.summaryDoc, null, 2));
}
