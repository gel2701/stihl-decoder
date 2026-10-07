import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { PartNormalizer, FITMENT_SCOPES } from './PartNormalizer.js';
import { DiySparePartsSource } from './sources/DiySparePartsSource.js';
import { PartsTreeSource } from './sources/PartsTreeSource.js';
import { OfficialStihlSource } from './sources/OfficialStihlSource.js';

export class PartsHarvesterEngine {
  constructor(options = {}) {
    this.httpClient = options.httpClient;
    this.outputDir = options.outputDir || path.resolve(process.cwd(), 'data');
    this.dryRun = Boolean(options.dryRun);

    this.sources = {
      diyspareparts: new DiySparePartsSource(this.httpClient, options),
      partstree: new PartsTreeSource(this.httpClient, options),
      official_stihl: new OfficialStihlSource(options)
    };
  }

  /**
   * Runs robots/policy preflight for all configured web sources
   */
  async checkSourcePolicies() {
    const diyPolicy = await this.sources.diyspareparts.checkRobotsPolicy();
    const ptPolicy = await this.sources.partstree.checkRobotsPolicy();
    return [diyPolicy, ptPolicy];
  }

  /**
   * Harvests parts for a list of models or a single model
   */
  async harvestModels(modelList, options = {}) {
    const runId = `harvest_${Date.now()}`;
    const mode = this.httpClient ? this.httpClient.mode : 'FIXTURE';

    // 1. Source Policy Preflight
    const sourcePolicies = await this.checkSourcePolicies();

    const stats = {
      run_id: runId,
      mode,
      models_requested: modelList.length,
      models_found: 0,
      variants_found: 0,
      sections_discovered: 0,
      sections_parsed: 0,
      sections_failed: 0,
      empty_valid_sections: 0,
      raw_part_rows: 0,
      valid_part_rows: 0,
      unique_part_numbers: 0,
      fitment_relations: 0,
      evidence_observations_count: 0,
      duplicate_rows_collapsed: 0,
      rejected_rows: 0,
      conflicts_detected: 0,
      synthetic_canonical_records: 0,
      sources_used: ['official_stihl', 'diyspareparts', 'partstree'],
      source_policies: sourcePolicies,
      evidence_breakdown: {
        official_stihl: 0,
        corroborated_multi_source: 0,
        single_structured_parts_source: 0,
        conflicted: 0
      },
      per_model_summary: {}
    };

    const partsCatalogMap = new Map();
    const fitmentsMap = new Map();
    const evidenceObservations = [];
    const variantsMap = new Map();
    const conflictsMap = new Map(); // conflict_id -> conflict object
    const allRejected = [];
    const liveHttpEvidence = [];

    // Log policy checks in HTTP evidence if in live mode
    for (const pol of sourcePolicies) {
      liveHttpEvidence.push({
        source_id: pol.source_id,
        url: pol.robots_url,
        http_status: pol.http_status,
        content_type: pol.content_type || 'text/plain',
        decision: pol.decision,
        notes: pol.notes,
        fetched_at: new Date().toISOString()
      });
    }

    for (const modelQuery of modelList) {
      const modelStats = {
        model: modelQuery,
        found: false,
        variants: 0,
        sections_discovered: 0,
        sections_parsed: 0,
        sections_failed: 0,
        raw_part_rows: 0,
        valid_part_rows: 0,
        unique_parts: 0,
        fitments: 0,
        conflicts: 0,
        rejected: 0
      };

      const norm = PartNormalizer.normalizeModelVariant(modelQuery);
      variantsMap.set(`${norm.canonical_model_id}::${norm.variant_key}`, {
        canonical_model_id: norm.canonical_model_id,
        base_model_name: norm.base_model_name,
        variant_key: norm.variant_key,
        variant_name: norm.variant_name,
        source_model_name: norm.source_model_name
      });

      // 1. Primary Source: DIY Spare Parts
      const primaryDiscovery = await this.sources.diyspareparts.discoverModel(modelQuery);
      liveHttpEvidence.push({
        source_id: 'diyspareparts',
        url: primaryDiscovery.url,
        http_status: primaryDiscovery.http_status,
        content_type: primaryDiscovery.content_type || 'text/html',
        response_sha256: primaryDiscovery.response_sha256 || null,
        model_query: modelQuery,
        sections_discovered: (primaryDiscovery.sections || []).length,
        variants_discovered: (primaryDiscovery.variants || []).length,
        fetched_at: new Date().toISOString()
      });

      // 2. Secondary Source: PartsTree
      const secondaryDiscovery = await this.sources.partstree.discoverModel(modelQuery);
      liveHttpEvidence.push({
        source_id: 'partstree',
        url: secondaryDiscovery.url,
        http_status: secondaryDiscovery.http_status,
        content_type: secondaryDiscovery.content_type || 'text/html',
        response_sha256: secondaryDiscovery.response_sha256 || null,
        model_query: modelQuery,
        sections_discovered: (secondaryDiscovery.sections || []).length,
        variants_discovered: (secondaryDiscovery.variants || []).length,
        fetched_at: new Date().toISOString()
      });

      // Add discovered variants
      const discoveredVariants = [...(primaryDiscovery.variants || []), ...(secondaryDiscovery.variants || [])];
      for (const v of discoveredVariants) {
        const vNorm = PartNormalizer.normalizeModelVariant(modelQuery, v.variantName);
        const vKey = `${vNorm.canonical_model_id}::${vNorm.variant_key}`;
        if (!variantsMap.has(vKey)) {
          variantsMap.set(vKey, {
            canonical_model_id: vNorm.canonical_model_id,
            base_model_name: vNorm.base_model_name,
            variant_key: vNorm.variant_key,
            variant_name: vNorm.variant_name,
            source_model_name: v.variantName
          });
          stats.variants_found++;
          modelStats.variants++;
        }
      }

      const modelPartsExtracted = [];

      // 3. Process Primary Sections (DIY Spare Parts)
      const primarySections = primaryDiscovery.sections || [];
      stats.sections_discovered += primarySections.length;
      modelStats.sections_discovered += primarySections.length;

      for (const sec of primarySections) {
        const secRes = await this.sources.diyspareparts.fetchSection(sec);
        liveHttpEvidence.push({
          source_id: 'diyspareparts',
          section_name: sec.sectionName,
          section_url: sec.sectionUrl,
          http_status: secRes.http_status,
          content_type: secRes.content_type || 'text/html',
          response_sha256: secRes.response_sha256 || null,
          part_rows_extracted: (secRes.parts || []).length,
          fetched_at: new Date().toISOString()
        });

        if (secRes.status === 'PARSED') {
          stats.sections_parsed++;
          modelStats.sections_parsed++;
        } else if (secRes.status === 'EMPTY_VALID') {
          stats.empty_valid_sections++;
          modelStats.sections_parsed++;
        } else {
          stats.sections_failed++;
          modelStats.sections_failed++;
        }

        for (const p of (secRes.parts || [])) {
          stats.raw_part_rows++;
          modelStats.raw_part_rows++;
          modelPartsExtracted.push({
            ...p,
            canonical_model_id: norm.canonical_model_id,
            variant_key: norm.variant_key,
            fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED
          });
        }
        for (const r of (secRes.rejected || [])) {
          stats.rejected_rows++;
          modelStats.rejected++;
          allRejected.push(r);
        }
      }

      // 4. Process Secondary Sections (PartsTree)
      const secondarySections = secondaryDiscovery.sections || [];
      for (const sec of secondarySections) {
        const secRes = await this.sources.partstree.fetchSection(sec);
        liveHttpEvidence.push({
          source_id: 'partstree',
          section_name: sec.sectionName,
          section_url: sec.sectionUrl,
          http_status: secRes.http_status,
          content_type: secRes.content_type || 'text/html',
          response_sha256: secRes.response_sha256 || null,
          part_rows_extracted: (secRes.parts || []).length,
          fetched_at: new Date().toISOString()
        });

        for (const p of (secRes.parts || [])) {
          stats.raw_part_rows++;
          modelStats.raw_part_rows++;
          modelPartsExtracted.push({
            ...p,
            canonical_model_id: norm.canonical_model_id,
            variant_key: norm.variant_key,
            fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED
          });
        }
      }

      // 5. Official STIHL Evidence Integration
      const officialParts = await this.sources.official_stihl.getOfficialPartsForModel(modelQuery);
      if (officialParts.length > 0) {
        modelStats.found = true;
      }
      for (const op of officialParts) {
        stats.raw_part_rows++;
        modelStats.raw_part_rows++;
        modelPartsExtracted.push({
          ...op,
          canonical_model_id: norm.canonical_model_id,
          variant_key: norm.variant_key,
          fitment_scope: FITMENT_SCOPES.BASE_MODEL_CONFIRMED
        });
      }

      if (primaryDiscovery.found || secondaryDiscovery.found || officialParts.length > 0) {
        stats.models_found++;
        modelStats.found = true;
      }

      // 6. Deduplication, Conflict Detection & Fitment Assembly
      const modelPartNumberMap = new Map();

      for (const p of modelPartsExtracted) {
        const pNum = p.part_number;
        const normSectionKey = PartNormalizer.normalizeSectionKey(p.section_key);

        // Record granular evidence observation
        const obsId = `obs_${pNum}_${norm.canonical_model_id}_${p.source_id}_${normSectionKey}_${p.diagram_position}`;
        evidenceObservations.push({
          evidence_id: obsId,
          part_number: pNum,
          canonical_model_id: norm.canonical_model_id,
          variant_key: p.variant_key || 'base',
          fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
          section_key: normSectionKey,
          section_name: p.section_name,
          diagram_position: p.diagram_position,
          source_id: p.source_id,
          source_url: p.source_url,
          part_name_raw: p.part_name_raw,
          quantity: p.quantity || 1
        });

        // Add or update canonical catalog entry
        if (!partsCatalogMap.has(pNum)) {
          partsCatalogMap.set(pNum, {
            part_number: pNum,
            part_number_display: p.part_number_display,
            part_name: p.part_name_raw,
            part_name_normalized: p.part_name_normalized,
            source_count: 1,
            sources: [p.source_id]
          });
        } else {
          const existing = partsCatalogMap.get(pNum);
          if (!existing.sources.includes(p.source_id)) {
            existing.sources.push(p.source_id);
            existing.source_count = existing.sources.length;
          }

          // Compare descriptions with deterministic helper
          const nameCmp = PartNormalizer.comparePartNames(existing.part_name, p.part_name_raw);
          if (nameCmp.isConflict && p.source_id !== existing.sources[0]) {
            const conflictId = `conf_${pNum}_name_${existing.sources[0]}_${p.source_id}`;
            if (!conflictsMap.has(conflictId)) {
              conflictsMap.set(conflictId, {
                conflict_id: conflictId,
                part_number: pNum,
                conflict_type: 'PART_NAME_MISMATCH',
                source_a: existing.sources[0],
                value_a: existing.part_name,
                source_b: p.source_id,
                value_b: p.part_name_raw,
                status: 'REVIEW_REQUIRED'
              });
              stats.conflicts_detected++;
              modelStats.conflicts++;
            }
          }

          // Official STIHL description overrides third-party descriptions
          if (p.source_id === 'official_stihl') {
            existing.part_name = p.part_name_raw;
            existing.part_name_normalized = p.part_name_normalized;
          }
        }

        // Canonical Fitment Key (part_number + model + variant + normalized section + position)
        const fitmentKey = `${pNum}::${norm.canonical_model_id}::${p.variant_key || 'base'}::${normSectionKey}::${p.diagram_position}`;

        if (!fitmentsMap.has(fitmentKey)) {
          fitmentsMap.set(fitmentKey, {
            fitment_id: fitmentKey,
            part_number: pNum,
            canonical_model_id: norm.canonical_model_id,
            variant_key: p.variant_key || 'base',
            fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
            section_key: normSectionKey,
            section_name: p.section_name,
            diagram_position: p.diagram_position,
            quantity: p.quantity,
            notes: p.notes,
            superseded_by: p.superseded_by,
            source_id: p.source_id,
            source_url: p.source_url,
            source_evidence_status: p.source_evidence_status
          });
          stats.fitment_relations++;
          modelStats.fitments++;
        } else {
          // If already recorded, official precedence applies
          const existingFitment = fitmentsMap.get(fitmentKey);
          if (p.source_id === 'official_stihl') {
            existingFitment.source_id = p.source_id;
            existingFitment.source_url = p.source_url;
            existingFitment.source_evidence_status = p.source_evidence_status;
            existingFitment.notes = p.notes;
          }
        }

        modelPartNumberMap.set(pNum, true);
      }

      modelStats.unique_parts = modelPartNumberMap.size;
      stats.per_model_summary[modelQuery] = modelStats;
    }

    stats.valid_part_rows = partsCatalogMap.size;
    stats.unique_part_numbers = partsCatalogMap.size;
    stats.evidence_observations_count = evidenceObservations.length;
    stats.conflicts_detected = conflictsMap.size;

    // Calculate evidence breakdown
    for (const f of fitmentsMap.values()) {
      if (f.source_evidence_status === 'OFFICIAL_STIHL') {
        stats.evidence_breakdown.official_stihl++;
      } else if (f.source_evidence_status === 'CORROBORATED_MULTI_SOURCE') {
        stats.evidence_breakdown.corroborated_multi_source++;
      } else {
        stats.evidence_breakdown.single_structured_parts_source++;
      }
    }

    // Deterministic Sorting
    const sortedParts = Array.from(partsCatalogMap.values()).sort((a, b) => a.part_number.localeCompare(b.part_number));
    const sortedFitments = Array.from(fitmentsMap.values()).sort((a, b) => a.fitment_id.localeCompare(b.fitment_id));
    const sortedObservations = evidenceObservations.sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
    const sortedVariants = Array.from(variantsMap.values()).sort((a, b) => `${a.canonical_model_id}::${a.variant_key}`.localeCompare(`${b.canonical_model_id}::${b.variant_key}`));
    const sortedConflicts = Array.from(conflictsMap.values()).sort((a, b) => a.conflict_id.localeCompare(b.conflict_id));

    const partsSourcesDoc = {
      schema_version: 'parts-sources-v1',
      sources: [
        {
          source_id: 'official_stihl',
          source_name: 'Official STIHL Service Documentation',
          source_type: 'OFFICIAL_MANUFACTURER_DOCUMENTATION',
          source_url: 'https://www.stihl.com',
          authority_level: 'OFFICIAL_STIHL'
        },
        {
          source_id: 'diyspareparts',
          source_name: 'DIY Spare Parts',
          source_type: 'PARTS_DIAGRAM_CATALOG',
          source_url: 'https://www.diyspareparts.com',
          authority_level: 'STRUCTURED_PARTS_CATALOG'
        },
        {
          source_id: 'partstree',
          source_name: 'PartsTree',
          source_type: 'PARTS_DIAGRAM_CATALOG',
          source_url: 'https://www.partstree.com',
          authority_level: 'STRUCTURED_PARTS_CATALOG'
        }
      ]
    };

    const partsCatalogDoc = {
      schema_version: 'parts-catalog-v1',
      parts_count: sortedParts.length,
      parts: sortedParts
    };

    const modelPartFitmentsDoc = {
      schema_version: 'model-part-fitments-v1',
      fitments_count: sortedFitments.length,
      fitments: sortedFitments
    };

    const partFitmentEvidenceDoc = {
      schema_version: 'part-fitment-evidence-v1',
      observations_count: sortedObservations.length,
      observations: sortedObservations
    };

    const partsVariantsDoc = {
      schema_version: 'parts-model-variants-v1',
      variants_count: sortedVariants.length,
      variants: sortedVariants
    };

    const partsConflictsDoc = {
      schema_version: 'parts-conflicts-v1',
      conflicts_count: sortedConflicts.length,
      conflicts: sortedConflicts
    };

    const manifestDoc = {
      schema_version: 'parts-harvest-manifest-v1',
      ...stats
    };

    const liveHarvestEvidenceDoc = {
      schema_version: 'phase52a-live-harvest-evidence-v1',
      harvest_mode: mode,
      generated_at: new Date().toISOString(),
      requests_count: liveHttpEvidence.length,
      requests: liveHttpEvidence
    };

    if (!this.dryRun) {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      fs.writeFileSync(path.join(this.outputDir, 'parts_catalog.json'), JSON.stringify(partsCatalogDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'model_part_fitments.json'), JSON.stringify(modelPartFitmentsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'part_fitment_evidence.json'), JSON.stringify(partFitmentEvidenceDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_sources.json'), JSON.stringify(partsSourcesDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_conflicts.json'), JSON.stringify(partsConflictsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_model_variants.json'), JSON.stringify(partsVariantsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_harvest_manifest.json'), JSON.stringify(manifestDoc, null, 2), 'utf8');

      if (mode === 'LIVE') {
        fs.writeFileSync(path.join(this.outputDir, 'phase52a_live_harvest_evidence.json'), JSON.stringify(liveHarvestEvidenceDoc, null, 2), 'utf8');
      }
    }

    return {
      stats,
      partsCatalogDoc,
      modelPartFitmentsDoc,
      partFitmentEvidenceDoc,
      partsSourcesDoc,
      partsConflictsDoc,
      partsVariantsDoc,
      manifestDoc,
      liveHarvestEvidenceDoc
    };
  }
}
