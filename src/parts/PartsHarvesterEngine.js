import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { PartNormalizer } from './PartNormalizer.js';
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
   * Harvests parts for a list of models or a single model
   */
  async harvestModels(modelList, options = {}) {
    const runId = `harvest_${Date.now()}`;
    const selectedSourceId = options.sourceId || null;

    const stats = {
      run_id: runId,
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
      duplicate_rows_collapsed: 0,
      rejected_rows: 0,
      conflicts_detected: 0,
      unresolved: 0,
      sources_used: ['diyspareparts', 'partstree', 'official_stihl'],
      evidence_breakdown: {
        official_stihl: 0,
        corroborated_multi_source: 0,
        single_structured_parts_source: 0,
        conflicted: 0
      },
      per_model_summary: {}
    };

    const partsCatalogMap = new Map(); // part_number -> part object
    const fitmentsMap = new Map(); // fitmentKey -> fitment object
    const variantsMap = new Map(); // variantKey -> variant object
    const conflictsList = [];
    const allRejected = [];

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
      const secondaryDiscovery = await this.sources.partstree.discoverModel(modelQuery);

      const isFound = primaryDiscovery.found || secondaryDiscovery.found;
      if (isFound) {
        stats.models_found++;
        modelStats.found = true;
      }

      // Add any discovered variants
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

      // 2. Process Primary Sections
      const primarySections = primaryDiscovery.sections || [];
      stats.sections_discovered += primarySections.length;
      modelStats.sections_discovered += primarySections.length;

      const modelPartsExtracted = [];

      for (const sec of primarySections) {
        const secRes = await this.sources.diyspareparts.fetchSection(sec);
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
          modelPartsExtracted.push({ ...p, canonical_model_id: norm.canonical_model_id, variant_key: norm.variant_key });
        }

        for (const rej of (secRes.rejected || [])) {
          stats.rejected_rows++;
          modelStats.rejected++;
          allRejected.push(rej);
        }
      }

      // 3. Process Secondary Sections (for corroboration)
      const secondarySections = secondaryDiscovery.sections || [];
      for (const sec of secondarySections) {
        const secRes = await this.sources.partstree.fetchSection(sec);
        for (const p of (secRes.parts || [])) {
          stats.raw_part_rows++;
          modelStats.raw_part_rows++;
          modelPartsExtracted.push({ ...p, canonical_model_id: norm.canonical_model_id, variant_key: norm.variant_key });
        }
      }

      // 4. Process Official STIHL source
      const officialParts = await this.sources.official_stihl.getOfficialPartsForModel(modelQuery);
      for (const p of officialParts) {
        stats.raw_part_rows++;
        modelStats.raw_part_rows++;
        modelPartsExtracted.push({ ...p, canonical_model_id: norm.canonical_model_id, variant_key: norm.variant_key });
      }

      // 5. Integrate & Deduplicate model parts
      const modelUniqueParts = new Set();

      for (const rawPart of modelPartsExtracted) {
        const pNo = rawPart.part_number;
        modelUniqueParts.add(pNo);

        // Catalog part integration
        if (!partsCatalogMap.has(pNo)) {
          partsCatalogMap.set(pNo, {
            part_number: pNo,
            part_number_display: rawPart.part_number_display || PartNormalizer.formatPartNumber(pNo),
            part_name: rawPart.part_name_raw,
            part_name_normalized: rawPart.part_name_normalized || PartNormalizer.normalizePartName(rawPart.part_name_raw),
            source_count: 1,
            sources: [rawPart.source_id]
          });
          stats.valid_part_rows++;
          modelStats.valid_part_rows++;
        } else {
          const existing = partsCatalogMap.get(pNo);
          if (!existing.sources.includes(rawPart.source_id)) {
            existing.sources.push(rawPart.source_id);
            existing.source_count = existing.sources.length;
          }

          // Check for name conflict across independent sources
          if (rawPart.source_id !== existing.sources[0] &&
              rawPart.part_name_normalized &&
              existing.part_name_normalized &&
              rawPart.part_name_normalized.toLowerCase() !== existing.part_name_normalized.toLowerCase()) {
            conflictsList.push({
              conflict_id: `conf_${pNo}_name`,
              part_number: pNo,
              conflict_type: 'PART_NAME_MISMATCH',
              source_a: existing.sources[0],
              value_a: existing.part_name,
              source_b: rawPart.source_id,
              value_b: rawPart.part_name_raw,
              status: 'REVIEW_REQUIRED'
            });
            stats.conflicts_detected++;
            modelStats.conflicts++;
          }
        }

        // Fitment relation integration
        const fitmentKey = `${pNo}::${rawPart.canonical_model_id}::${rawPart.variant_key}::${rawPart.section_key}::${rawPart.diagram_position}`;

        if (!fitmentsMap.has(fitmentKey)) {
          fitmentsMap.set(fitmentKey, {
            fitment_id: fitmentKey,
            part_number: pNo,
            canonical_model_id: rawPart.canonical_model_id,
            variant_key: rawPart.variant_key,
            section_key: rawPart.section_key,
            section_name: rawPart.section_name,
            diagram_position: rawPart.diagram_position,
            quantity: rawPart.quantity || 1,
            notes: rawPart.notes || null,
            superseded_by: rawPart.superseded_by || null,
            source_id: rawPart.source_id,
            source_url: rawPart.source_url,
            source_evidence_status: rawPart.source_evidence_status
          });
          stats.fitment_relations++;
          modelStats.fitments++;
        } else {
          stats.duplicate_rows_collapsed++;
          const existingFitment = fitmentsMap.get(fitmentKey);
          // Upgrade evidence status if corroborated across multiple independent sources
          if (existingFitment.source_id !== rawPart.source_id) {
            if (rawPart.source_evidence_status === 'OFFICIAL_STIHL' || existingFitment.source_evidence_status === 'OFFICIAL_STIHL') {
              existingFitment.source_evidence_status = 'OFFICIAL_STIHL';
            } else {
              existingFitment.source_evidence_status = 'CORROBORATED_MULTI_SOURCE';
            }
          }
        }
      }

      modelStats.unique_parts = modelUniqueParts.size;
      stats.per_model_summary[modelQuery] = modelStats;
    }

    stats.unique_part_numbers = partsCatalogMap.size;

    // Calculate evidence breakdown
    for (const f of fitmentsMap.values()) {
      if (f.source_evidence_status === 'OFFICIAL_STIHL') {
        stats.evidence_breakdown.official_stihl++;
      } else if (f.source_evidence_status === 'CORROBORATED_MULTI_SOURCE') {
        stats.evidence_breakdown.corroborated_multi_source++;
      } else if (f.source_evidence_status === 'SINGLE_STRUCTURED_PARTS_SOURCE') {
        stats.evidence_breakdown.single_structured_parts_source++;
      } else {
        stats.evidence_breakdown.conflicted++;
      }
    }

    // Build deterministic sorted arrays
    const sortedParts = Array.from(partsCatalogMap.values()).sort((a, b) => a.part_number.localeCompare(b.part_number));
    const sortedFitments = Array.from(fitmentsMap.values()).sort((a, b) => a.fitment_id.localeCompare(b.fitment_id));
    const sortedVariants = Array.from(variantsMap.values()).sort((a, b) => {
      const cmp = a.canonical_model_id.localeCompare(b.canonical_model_id);
      return cmp !== 0 ? cmp : a.variant_key.localeCompare(b.variant_key);
    });
    const sortedConflicts = conflictsList.sort((a, b) => a.conflict_id.localeCompare(b.conflict_id));

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

    if (!this.dryRun) {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      fs.writeFileSync(path.join(this.outputDir, 'parts_catalog.json'), JSON.stringify(partsCatalogDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'model_part_fitments.json'), JSON.stringify(modelPartFitmentsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_sources.json'), JSON.stringify(partsSourcesDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_conflicts.json'), JSON.stringify(partsConflictsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_model_variants.json'), JSON.stringify(partsVariantsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_harvest_manifest.json'), JSON.stringify(manifestDoc, null, 2), 'utf8');
    }

    return {
      stats,
      partsCatalogDoc,
      modelPartFitmentsDoc,
      partsSourcesDoc,
      partsConflictsDoc,
      partsVariantsDoc,
      manifestDoc
    };
  }
}
