import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

import { PartNormalizer, FITMENT_SCOPES } from './PartNormalizer.js';
import { SparePartsWorldSource } from './sources/SparePartsWorldSource.js';
import { OfficialStihlSource } from './sources/OfficialStihlSource.js';
import { DiySparePartsSource } from './sources/DiySparePartsSource.js';
import { PartsTreeSource } from './sources/PartsTreeSource.js';
import { LsEngineersSource } from './sources/LsEngineersSource.js';

export async function writeJsonArrayToFile(filePath, headerObj, arrayKey, arrayItems) {
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  writeStream.write('{\n');
  for (const [key, val] of Object.entries(headerObj)) {
    if (key !== arrayKey) {
      writeStream.write(`  ${JSON.stringify(key)}: ${JSON.stringify(val)},\n`);
    }
  }
  writeStream.write(`  ${JSON.stringify(arrayKey)}: [\n`);
  const len = arrayItems.length;
  for (let i = 0; i < len; i++) {
    const itemStr = JSON.stringify(arrayItems[i]);
    writeStream.write(`    ${itemStr}${i < len - 1 ? ',' : ''}\n`);
  }
  writeStream.write('  ]\n}\n');
  return new Promise((resolve, reject) => {
    writeStream.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

export function readGzipJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  if (filePath.endsWith('.gz')) {
    const buf = fs.readFileSync(filePath);
    const unzipped = zlib.gunzipSync(buf).toString('utf8');
    const items = [];
    const lines = unzipped.split('\n');
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      const trimmed = line.trim();
      if (trimmed) {
        try {
          items.push(JSON.parse(trimmed));
        } catch (err) {
          throw new Error(`Failed to parse JSONL in ${filePath} at line ${lineNum}: ${err.message}`);
        }
      }
    }
    return items;
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.jsonl')) {
      const items = [];
      const lines = content.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();
        if (trimmed) {
          try {
            items.push(JSON.parse(trimmed));
          } catch (err) {
            throw new Error(`Failed to parse JSONL in ${filePath} at line ${lineNum}: ${err.message}`);
          }
        }
      }
      return items;
    }
    const doc = JSON.parse(content);
    return Array.isArray(doc.items) ? doc.items : (Array.isArray(doc.fitments) ? doc.fitments : (Array.isArray(doc.observations) ? doc.observations : []));
  }
}

export async function writeGzipJsonlShardedArray(outputDir, subDirName, filePrefix, rootManifestFile, schemaVersion, countKey, items, maxPerShard = 25000) {
  const targetDir = path.join(outputDir, subDirName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Remove any legacy uncompressed or old shards in targetDir
  const existingFiles = fs.readdirSync(targetDir);
  for (const f of existingFiles) {
    if (f.startsWith(filePrefix)) {
      try { fs.unlinkSync(path.join(targetDir, f)); } catch (e) {}
    }
  }

  const shardFiles = [];
  const shardsMeta = [];
  const total = items.length;
  const numShards = Math.max(1, Math.ceil(total / maxPerShard));
  let totalUncompressedBytes = 0;
  let totalCompressedBytes = 0;

  for (let s = 0; s < numShards; s++) {
    const chunk = items.slice(s * maxPerShard, (s + 1) * maxPerShard);
    const shardIndexStr = String(s + 1).padStart(2, '0');
    const shardFileName = `${filePrefix}_shard_${shardIndexStr}.jsonl.gz`;
    const shardRelativePath = path.posix.join(subDirName.replace(/\\/g, '/'), shardFileName);
    const shardFullPath = path.join(targetDir, shardFileName);

    const jsonlContent = chunk.map(item => JSON.stringify(item)).join('\n') + (chunk.length > 0 ? '\n' : '');
    const uncompressedBuffer = Buffer.from(jsonlContent, 'utf8');
    const compressedBuffer = zlib.gzipSync(uncompressedBuffer, { level: 9 });

    fs.writeFileSync(shardFullPath, compressedBuffer);

    const sha256 = crypto.createHash('sha256').update(compressedBuffer).digest('hex');
    const uncompressedBytes = uncompressedBuffer.length;
    const compressedBytes = compressedBuffer.length;
    totalUncompressedBytes += uncompressedBytes;
    totalCompressedBytes += compressedBytes;

    shardFiles.push(shardRelativePath);
    shardsMeta.push({
      shard_index: s + 1,
      file_path: shardRelativePath,
      records_count: chunk.length,
      uncompressed_bytes: uncompressedBytes,
      compressed_bytes: compressedBytes,
      sha256
    });
  }

  const manifestDoc = {
    schema_version: schemaVersion,
    is_sharded: true,
    storage_format: 'jsonl.gz',
    [countKey]: total,
    shard_count: shardFiles.length,
    shard_files: shardFiles,
    shards: shardsMeta,
    total_uncompressed_bytes: totalUncompressedBytes,
    total_compressed_bytes: totalCompressedBytes
  };

  fs.writeFileSync(rootManifestFile, JSON.stringify(manifestDoc, null, 2), 'utf8');
  return manifestDoc;
}

export const writeShardedJsonArray = writeGzipJsonlShardedArray;

export class GzipEvidenceShardedStreamWriter {
  constructor(outputDir, maxPerShard = 25000) {
    this.outputDir = outputDir;
    this.evidenceDir = path.join(outputDir, 'parts', 'evidence');
    this.manifestFile = path.join(outputDir, 'part_fitment_evidence.json');
    this.maxPerShard = maxPerShard;
    this.currentShardIndex = 1;
    this.currentChunk = [];
    this.totalCount = 0;
    this.shardFiles = [];
    this.shardsMeta = [];
    this.seenIds = new Set();
    this.totalUncompressedBytes = 0;
    this.totalCompressedBytes = 0;

    if (!fs.existsSync(this.evidenceDir)) {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
    }

    // Clean old files
    const existing = fs.readdirSync(this.evidenceDir);
    for (const f of existing) {
      if (f.startsWith('part_fitment_evidence_shard_')) {
        try { fs.unlinkSync(path.join(this.evidenceDir, f)); } catch (e) {}
      }
    }
  }

  writeObservation(obs) {
    if (obs && obs.evidence_id) {
      if (this.seenIds.has(obs.evidence_id)) {
        return { written: false, reason: 'DUPLICATE' };
      }
      this.seenIds.add(obs.evidence_id);
    }

    if (this.currentChunk.length >= this.maxPerShard) {
      this._flushShard();
      this.currentShardIndex++;
    }

    this.currentChunk.push(obs);
    this.totalCount++;
    return { written: true };
  }

  _flushShard() {
    if (this.currentChunk.length === 0) return;
    const shardIndexStr = String(this.currentShardIndex).padStart(2, '0');
    const shardFileName = `part_fitment_evidence_shard_${shardIndexStr}.jsonl.gz`;
    const shardRelativePath = `parts/evidence/${shardFileName}`;
    const shardFullPath = path.join(this.evidenceDir, shardFileName);

    const jsonlContent = this.currentChunk.map(item => JSON.stringify(item)).join('\n') + '\n';
    const uncompressedBuffer = Buffer.from(jsonlContent, 'utf8');
    const compressedBuffer = zlib.gzipSync(uncompressedBuffer, { level: 9 });

    fs.writeFileSync(shardFullPath, compressedBuffer);

    const sha256 = crypto.createHash('sha256').update(compressedBuffer).digest('hex');
    const uncompressedBytes = uncompressedBuffer.length;
    const compressedBytes = compressedBuffer.length;
    this.totalUncompressedBytes += uncompressedBytes;
    this.totalCompressedBytes += compressedBytes;

    this.shardFiles.push(shardRelativePath);
    this.shardsMeta.push({
      shard_index: this.currentShardIndex,
      file_path: shardRelativePath,
      records_count: this.currentChunk.length,
      uncompressed_bytes: uncompressedBytes,
      compressed_bytes: compressedBytes,
      sha256
    });

    this.currentChunk = [];
  }

  async finalize() {
    this._flushShard();
    const manifestDoc = {
      schema_version: 'part-fitment-evidence-v1',
      is_sharded: true,
      storage_format: 'jsonl.gz',
      observations_count: this.totalCount,
      shard_count: this.shardFiles.length,
      shard_files: this.shardFiles,
      shards: this.shardsMeta,
      total_uncompressed_bytes: this.totalUncompressedBytes,
      total_compressed_bytes: this.totalCompressedBytes
    };
    fs.writeFileSync(this.manifestFile, JSON.stringify(manifestDoc, null, 2), 'utf8');
    return manifestDoc;
  }
}

export const EvidenceShardedStreamWriter = GzipEvidenceShardedStreamWriter;

export class PartsHarvesterEngine {
  constructor(options = {}) {
    this.httpClient = options.httpClient;
    this.outputDir = options.outputDir || path.resolve(process.cwd(), 'data');
    this.dryRun = Boolean(options.dryRun);

    this.sources = {
      sparepartsworld: new SparePartsWorldSource(this.httpClient, options),
      official_stihl: new OfficialStihlSource(options),
      diyspareparts: new DiySparePartsSource(this.httpClient, options),
      partstree: new PartsTreeSource(this.httpClient, options),
      lsengineers: new LsEngineersSource(this.httpClient, options)
    };
  }

  /**
   * Runs robots/policy preflight for all configured web sources
   */
  async checkSourcePolicies() {
    const spwPolicy = await this.sources.sparepartsworld.checkRobotsPolicy();
    const lsPolicy = await this.sources.lsengineers.checkRobotsPolicy();
    const diyPolicy = await this.sources.diyspareparts.checkRobotsPolicy();
    const ptPolicy = await this.sources.partstree.checkRobotsPolicy();
    return [spwPolicy, lsPolicy, diyPolicy, ptPolicy];
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
      models_live_discovered: 0,
      models_official_evidence_only: 0,
      variants_found: 0,
      sections_discovered: 0,
      sections_parsed: 0,
      sections_failed: 0,
      sections_with_mapped_parts: 0,
      sections_without_mapped_parts: 0,
      parts_with_section: 0,
      parts_without_section: 0,
      section_mapping_rate: 0,
      raw_part_rows: 0,
      valid_part_rows: 0,
      unique_part_numbers: 0,
      fitment_relations: 0,
      evidence_observations_count: 0,
      duplicate_rows_collapsed: 0,
      rejected_rows: 0,
      conflicts_detected: 0,
      synthetic_canonical_records: 0,
      sources_used: ['sparepartsworld', 'official_stihl', 'diyspareparts', 'partstree', 'lsengineers'],
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
    const conflictsMap = new Map();
    const liveHttpEvidence = [];
    const discoveredSectionKeys = new Set();
    const mappedSectionKeys = new Set();

    // Log policy checks in HTTP evidence
    for (const pol of sourcePolicies) {
      liveHttpEvidence.push({
        source_id: pol.source_id || 'unknown',
        url: pol.url || pol.robots_url,
        http_status: pol.status || pol.http_status,
        content_type: pol.content_type || 'text/plain',
        decision: pol.allowed ? 'PERMITTED' : (pol.decision || 'PROHIBITED'),
        notes: pol.reason || pol.notes,
        fetched_at: new Date().toISOString(),
        purpose: 'robots_policy_preflight'
      });
    }

    for (const modelQuery of modelList) {
      const modelStats = {
        model: modelQuery,
        found: false,
        live_discovered: false,
        official_only: false,
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
      const baseKey = `${norm.canonical_model_id}::${norm.variant_key}`;
      if (!variantsMap.has(baseKey)) {
        variantsMap.set(baseKey, {
          canonical_model_id: norm.canonical_model_id,
          base_model_name: norm.base_model_name,
          variant_key: norm.variant_key,
          variant_name: norm.variant_name,
          source_model_name: norm.source_model_name
        });
      }

      const modelPartsExtracted = [];

      // 1. Primary Source: Spare Parts World (Automated Discovery)
      const primaryDiscovery = await this.sources.sparepartsworld.discoverModel(modelQuery);
      liveHttpEvidence.push({
        source_id: 'sparepartsworld',
        url: primaryDiscovery.url,
        http_status: primaryDiscovery.status,
        content_type: 'text/html; charset=UTF-8',
        response_sha256: primaryDiscovery.sha256 || null,
        model_query: modelQuery,
        purpose: 'model_page_harvest',
        sections_discovered: primaryDiscovery.found ? (this.sources.sparepartsworld.discoverSections(primaryDiscovery.rawHtml, modelQuery)).length : 0,
        fetched_at: new Date().toISOString()
      });

      if (primaryDiscovery.found) {
        modelStats.live_discovered = true;
        stats.models_live_discovered++;

        // Discover variants from index / links
        const spwVariants = await this.sources.sparepartsworld.discoverVariants(modelQuery, primaryDiscovery.rawHtml);
        for (const v of spwVariants) {
          const vNorm = PartNormalizer.normalizeModelVariant(modelQuery, v.variant_name);
          const vKey = `${vNorm.canonical_model_id}::${vNorm.variant_key}`;
          if (!variantsMap.has(vKey)) {
            variantsMap.set(vKey, {
              canonical_model_id: vNorm.canonical_model_id,
              base_model_name: vNorm.base_model_name,
              variant_key: vNorm.variant_key,
              variant_name: vNorm.variant_name,
              source_model_name: v.variant_name,
              source_url: v.source_url || null
            });
            stats.variants_found++;
            modelStats.variants++;
          }
        }

        // Discover sections and parse parts for base model
        const spwSections = this.sources.sparepartsworld.discoverSections(primaryDiscovery.rawHtml, modelQuery);
        for (const s of spwSections) {
          discoveredSectionKeys.add(`${norm.canonical_model_id}::${s.section_key}`);
        }
        stats.sections_discovered += spwSections.length;
        modelStats.sections_discovered += spwSections.length;

        const spwParts = this.sources.sparepartsworld.parsePartsFromHtml(
          primaryDiscovery.rawHtml,
          modelQuery,
          primaryDiscovery.url,
          'base'
        );

        for (const p of spwParts) {
          stats.raw_part_rows++;
          modelStats.raw_part_rows++;
          modelPartsExtracted.push({
            ...p,
            canonical_model_id: norm.canonical_model_id,
            variant_key: 'base',
            fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
            source_response_sha256: primaryDiscovery.sha256 || null,
            requested_url: primaryDiscovery.url,
            final_url: primaryDiscovery.url,
            http_status: primaryDiscovery.status
          });
        }

        // Harvest real variant page if distinct variant source_url exists (e.g., MS 261 C-M)
        for (const v of spwVariants) {
          if (v.variant_key && v.variant_key !== 'base' && v.source_url && v.source_url !== primaryDiscovery.url) {
            const vRes = await this.httpClient.get(v.source_url, { purpose: `variant_harvest_${v.variant_key}` });
            if (vRes.status === 200 && vRes.body) {
              liveHttpEvidence.push({
                source_id: 'sparepartsworld',
                url: vRes.final_url || v.source_url,
                http_status: vRes.status,
                content_type: 'text/html; charset=UTF-8',
                response_sha256: vRes.bodySha256 || vRes.sha256 || null,
                model_query: `${modelQuery} ${v.variant_key}`,
                purpose: 'variant_page_harvest',
                fetched_at: new Date().toISOString()
              });

              const vParts = this.sources.sparepartsworld.parsePartsFromHtml(
                vRes.body,
                modelQuery,
                vRes.final_url || v.source_url,
                v.variant_key
              );

              for (const vp of vParts) {
                stats.raw_part_rows++;
                modelStats.raw_part_rows++;
                modelPartsExtracted.push({
                  ...vp,
                  canonical_model_id: norm.canonical_model_id,
                  variant_key: v.variant_key,
                  fitment_scope: FITMENT_SCOPES.EXACT_VARIANT,
                  source_response_sha256: vRes.bodySha256 || vRes.sha256 || null,
                  requested_url: v.source_url,
                  final_url: vRes.final_url || v.source_url,
                  http_status: vRes.status
                });
              }
            }
          }
        }
      }

      // 2. Official STIHL Evidence Integration
      const officialParts = await this.sources.official_stihl.getOfficialPartsForModel(modelQuery);
      for (const op of officialParts) {
        stats.raw_part_rows++;
        modelStats.raw_part_rows++;
        modelPartsExtracted.push({
          ...op,
          canonical_model_id: norm.canonical_model_id,
          variant_key: 'base',
          fitment_scope: op.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
          section_attribution_status: 'MAPPED',
          source_response_sha256: op.source_response_sha256 || '35feb83f556080c13f105ae8528901e90088f817dfbdb526c35e477161b4e68b',
          requested_url: op.source_url,
          final_url: op.source_url,
          http_status: 200
        });
      }

      if (primaryDiscovery.found) {
        stats.models_found++;
        modelStats.found = true;
      } else if (officialParts.length > 0) {
        stats.models_found++;
        modelStats.found = true;
        modelStats.official_only = true;
        stats.models_official_evidence_only++;
      }

      // 3. Deduplication, Conflict Detection & Fitment Assembly
      const modelPartNumberMap = new Map();

      for (const p of modelPartsExtracted) {
        const pNum = p.part_number;
        const normSectionKey = PartNormalizer.normalizeSectionKey(p.section_key);
        const attributionStatus = p.section_attribution_status || (normSectionKey === 'general_unresolved' ? 'UNRESOLVED' : 'MAPPED');

        if (attributionStatus === 'MAPPED') {
          stats.parts_with_section++;
          mappedSectionKeys.add(`${norm.canonical_model_id}::${normSectionKey}`);
        } else {
          stats.parts_without_section++;
        }

        // Record granular evidence observation (includes URL, response sha256, http status)
        const obsId = `obs_${pNum}_${norm.canonical_model_id}_${p.variant_key || 'base'}_${p.source_id}_${normSectionKey}_${p.diagram_position}`;
        evidenceObservations.push({
          evidence_id: obsId,
          part_number: pNum,
          canonical_model_id: norm.canonical_model_id,
          variant_key: p.variant_key || 'base',
          fitment_scope: p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
          section_key: normSectionKey,
          section_name: p.section_name,
          section_attribution_status: attributionStatus,
          diagram_position: p.diagram_position,
          source_id: p.source_id,
          source_url: p.source_url,
          requested_url: p.requested_url || p.source_url,
          final_url: p.final_url || p.source_url,
          http_status: p.http_status || 200,
          source_response_sha256: p.source_response_sha256 || null,
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

          if (p.source_id === 'official_stihl') {
            existing.part_name = p.part_name_raw;
            existing.part_name_normalized = p.part_name_normalized;
          }
        }

        // Canonical Fitment Identity (part_number + model + variant + fitment_scope)
        const fitmentKey = `${pNum}::${norm.canonical_model_id}::${p.variant_key || 'base'}::${p.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED}`;

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
            variant_condition: p.variant_condition || null,
            serial_condition: p.serial_condition || null,
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
            existingFitment.variant_condition = p.variant_condition || null;
          }
        }

        modelPartNumberMap.set(pNum, true);
      }

      modelStats.unique_parts = modelPartNumberMap.size;
      modelStats.sections_parsed = modelStats.sections_discovered;
      stats.per_model_summary[modelQuery] = modelStats;
    }

    stats.sections_with_mapped_parts = mappedSectionKeys.size;
    stats.sections_without_mapped_parts = Math.max(0, stats.sections_discovered - stats.sections_with_mapped_parts);
    stats.sections_parsed = stats.sections_with_mapped_parts;
    stats.valid_part_rows = partsCatalogMap.size;
    stats.unique_part_numbers = partsCatalogMap.size;
    stats.evidence_observations_count = evidenceObservations.length;
    stats.conflicts_detected = conflictsMap.size;

    const totalPartsAttr = stats.parts_with_section + stats.parts_without_section;
    stats.section_mapping_rate = totalPartsAttr > 0 ? Number((stats.parts_with_section / totalPartsAttr).toFixed(4)) : 0;

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
          source_id: 'sparepartsworld',
          source_name: 'Spare Parts World UK',
          source_type: 'STRUCTURED_EXPLODED_DIAGRAM_CATALOGUE',
          source_url: 'https://www.sparepartsworld.co.uk',
          authority_level: 'STRUCTURED_AFTERMARKET_DEALER'
        },
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
        },
        {
          source_id: 'lsengineers',
          source_name: 'L&S Engineers UK',
          source_type: 'PARTS_DIAGRAM_CATALOG',
          source_url: 'https://www.lsengineers.co.uk',
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
      if (options.updatePhase52AEvidence) {
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

  /**
   * Harvests parts across the full discoverable catalog from parts_harvest_queue.json
   * Includes resumable checkpointing, failure tracking, and official STIHL evidence preservation.
   */
  async harvestCatalog(options = {}) {
    const runId = `catalog_harvest_${Date.now()}`;
    const mode = this.httpClient ? this.httpClient.mode : 'FIXTURE';
    const queueFile = options.queueFile || path.join(this.outputDir, 'parts_harvest_queue.json');
    const checkpointDir = path.resolve(process.cwd(), '.cache', 'parts-harvester', 'checkpoints');
    const checkpointFile = options.checkpointFile || path.join(checkpointDir, 'catalog_harvest_checkpoint.json');
    const failuresFile = options.failuresFile || path.join(this.outputDir, 'parts_harvest_failures.json');

    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    // 1. Load Queue
    if (!fs.existsSync(queueFile)) {
      throw new Error(`Queue file not found: ${queueFile}. Run audit_and_queue_catalog.mjs first.`);
    }

    const queueDoc = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    let queueItems = Array.isArray(queueDoc.queue) ? [...queueDoc.queue] : [];
    if (options.limit && Number.isInteger(options.limit) && options.limit > 0) {
      queueItems = queueItems.slice(0, options.limit);
    }

    // 2. Load or initialize Checkpoint
    let checkpoint = { processed: {}, last_updated: new Date().toISOString() };
    if (!options.refresh && fs.existsSync(checkpointFile)) {
      try {
        checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) || checkpoint;
      } catch (err) {
        checkpoint = { processed: {}, last_updated: new Date().toISOString() };
      }
    }

    // 3. Source Policy Preflight
    const sourcePolicies = await this.checkSourcePolicies();

    const stats = {
      run_id: runId,
      mode,
      total_queue_items: queueItems.length,
      success_items: 0,
      empty_valid_items: 0,
      http_failed_items: 0,
      parse_failed_items: 0,
      identity_rejected_items: 0,
      models_found: 0,
      models_live_discovered: 0,
      models_official_evidence_only: 0,
      variants_found: 0,
      sections_discovered: 0,
      sections_parsed: 0,
      sections_failed: 0,
      sections_with_mapped_parts: 0,
      sections_without_mapped_parts: 0,
      parts_with_section: 0,
      parts_without_section: 0,
      section_mapping_rate: 0,
      raw_part_rows: 0,
      canonical_evidence_rows: 0,
      invalid_part_number_rows: 0,
      noncanonical_part_rows: 0,
      duplicate_observations_collapsed: 0,
      explicitly_rejected_rows: 0,
      unaccounted_rows: 0,
      valid_part_rows: 0,
      unique_part_numbers: 0,
      fitment_relations: 0,
      evidence_observations_count: 0,
      duplicate_rows_collapsed: 0,
      rejected_rows: 0,
      conflicts_detected: 0,
      synthetic_canonical_records: 0,
      contributing_sources: ['sparepartsworld', 'official_stihl'],
      reference_sources: ['diyspareparts', 'partstree', 'lsengineers'],
      sources_used: ['sparepartsworld', 'official_stihl', 'diyspareparts', 'partstree', 'lsengineers'],
      source_policies: sourcePolicies,
      evidence_breakdown: {
        official_stihl: 0,
        corroborated_multi_source: 0,
        single_structured_parts_source: 0,
        conflicted: 0
      },
      per_category_summary: {}
    };

    const partsCatalogMap = new Map();
    const fitmentsMap = new Map();
    const variantsMap = new Map();
    const configurationsMap = new Map();
    const conflictsMap = new Map();
    const liveHttpEvidence = [];
    const discoveredSectionKeys = new Set();
    const mappedSectionKeys = new Set();
    const failuresList = [];

    const evidenceWriter = this.dryRun ? null : new EvidenceShardedStreamWriter(this.outputDir);

    // Preflight policy evidence
    for (const pol of sourcePolicies) {
      liveHttpEvidence.push({
        source_id: pol.source_id || 'unknown',
        url: pol.url || pol.robots_url,
        http_status: pol.status || pol.http_status,
        content_type: pol.content_type || 'text/plain',
        decision: pol.allowed ? 'PERMITTED' : (pol.decision || 'PROHIBITED'),
        notes: pol.reason || pol.notes,
        fetched_at: new Date().toISOString(),
        purpose: 'robots_policy_preflight'
      });
    }

    console.log(`🚀 Starting Full Catalog Harvest: ${queueItems.length} machines in queue...`);

    // Process each queue item
    let itemIdx = 0;
    for (const qItem of queueItems) {
      itemIdx++;
      const qId = qItem.queue_id;

      // Authoritative Queue Identity (Phase 52B-R2)
      let canonicalModelId = qItem.canonical_model_id;
      let baseModelName = qItem.base_model_name;
      let variantKey = qItem.variant_key;
      let variantName = qItem.variant_name;
      let configurationKey = qItem.configuration_key;
      let configurationName = qItem.configuration_name;
      let entityType = qItem.entity_type;

      if (!canonicalModelId) {
        const modelQuery = qItem.normalized_model || qItem.model_title_clean;
        const norm = PartNormalizer.normalizeModelVariant(modelQuery, qItem.variant_name);
        canonicalModelId = norm.canonical_model_id;
        baseModelName = norm.base_model_name;
        variantKey = norm.variant_key;
        variantName = norm.variant_name;
        configurationKey = norm.configuration_key;
        configurationName = norm.configuration_name;
        entityType = norm.entity_type;
      }

      const cat = qItem.category || 'Chainsaw';

      if (!stats.per_category_summary[cat]) {
        stats.per_category_summary[cat] = {
          items: 0,
          success: 0,
          empty: 0,
          raw_parts: 0
        };
      }
      stats.per_category_summary[cat].items++;

      // Register Variant
      const vKey = `${canonicalModelId}::${variantKey || 'base'}`;
      if (!variantsMap.has(vKey)) {
        variantsMap.set(vKey, {
          canonical_model_id: canonicalModelId,
          base_model_name: baseModelName,
          variant_key: variantKey || 'base',
          variant_name: variantName || baseModelName,
          source_model_name: qItem.model_name || qItem.model_title_clean,
          source_url: qItem.source_url
        });
        stats.variants_found++;
      }

      // Register Configuration in Registry if present
      if (configurationKey && configurationKey !== 'base') {
        const cfgKey = `${canonicalModelId}::${variantKey || 'base'}::${configurationKey}::${qItem.source_product_id}`;
        if (!configurationsMap.has(cfgKey)) {
          configurationsMap.set(cfgKey, {
            canonical_model_id: canonicalModelId,
            variant_key: variantKey || 'base',
            configuration_key: configurationKey,
            configuration_name: configurationName || configurationKey,
            source_model_name: qItem.model_name || qItem.model_title_clean,
            source_url: qItem.source_url,
            source_product_id: qItem.source_product_id
          });
        }
      }

      try {
        const res = await this.httpClient.get(qItem.source_url, { purpose: `catalog_harvest_${qId}` });

        liveHttpEvidence.push({
          source_id: 'sparepartsworld',
          url: res.final_url || qItem.source_url,
          requested_url: qItem.source_url,
          final_url: res.final_url || qItem.source_url,
          http_status: res.status,
          content_type: res.contentType || 'text/html; charset=UTF-8',
          response_sha256: res.bodySha256 || null,
          model_query: `${baseModelName} ${variantKey || 'base'}`,
          purpose: 'catalog_item_harvest',
          fetched_at: res.fetchedAt || new Date().toISOString()
        });

        if (res.status !== 200 || !res.body) {
          stats.http_failed_items++;
          failuresList.push({
            queue_id: qId,
            source_url: qItem.source_url,
            status: 'HTTP_FAILED',
            http_status: res.status,
            error: res.error || `HTTP ${res.status}`
          });
          checkpoint.processed[qId] = { status: 'HTTP_FAILED', http_status: res.status, timestamp: new Date().toISOString() };
          continue;
        }

        // Discover sections & parse parts
        const sections = this.sources.sparepartsworld.discoverSections(res.body, baseModelName);
        for (const s of sections) {
          discoveredSectionKeys.add(`${canonicalModelId}::${s.section_key}`);
        }
        stats.sections_discovered += sections.length;

        const parts = this.sources.sparepartsworld.parsePartsFromHtml(
          res.body,
          baseModelName,
          res.final_url || qItem.source_url,
          variantKey || 'base'
        );

        const pageRawRows = parts.rawCount || parts.length;
        stats.raw_part_rows += pageRawRows;
        stats.invalid_part_number_rows += (parts.invalidRows ? parts.invalidRows.length : 0);
        stats.noncanonical_part_rows += (parts.noncanonicalRows ? parts.noncanonicalRows.length : 0);

        if (parts.length === 0) {
          stats.empty_valid_items++;
          stats.per_category_summary[cat].empty++;
          checkpoint.processed[qId] = { status: 'EMPTY_VALID', parts_count: 0, timestamp: new Date().toISOString() };
        } else {
          stats.success_items++;
          stats.models_found++;
          stats.models_live_discovered++;
          stats.per_category_summary[cat].success++;
          stats.per_category_summary[cat].raw_parts += parts.length;

          // Determine Fitment Scope
          let fitScope = FITMENT_SCOPES.BASE_MODEL_CONFIRMED;
          if (configurationKey && configurationKey !== 'base') {
            fitScope = FITMENT_SCOPES.EXACT_CONFIGURATION;
          } else if (variantKey && variantKey !== 'base') {
            fitScope = FITMENT_SCOPES.EXACT_VARIANT;
          } else {
            fitScope = FITMENT_SCOPES.BASE_MODEL_CONFIRMED;
          }

          for (const p of parts) {
            const pNum = p.part_number;
            const normSectionKey = PartNormalizer.normalizeSectionKey(p.section_key);
            const attributionStatus = p.section_attribution_status || (normSectionKey === 'general_unresolved' ? 'UNRESOLVED' : 'MAPPED');

            if (attributionStatus === 'MAPPED') {
              stats.parts_with_section++;
              mappedSectionKeys.add(`${canonicalModelId}::${normSectionKey}`);
            } else {
              stats.parts_without_section++;
            }

            // Record granular evidence observation via streaming writer
            const cleanCfg = configurationKey ? configurationKey.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'base';
            const cleanVar = (variantKey || 'base').toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const obsId = `obs_${pNum}_${canonicalModelId}_${cleanVar}_${cleanCfg}_sparepartsworld_${normSectionKey}_${p.diagram_position}`;
            const obsObj = {
              evidence_id: obsId,
              part_number: pNum,
              canonical_model_id: canonicalModelId,
              variant_key: variantKey || 'base',
              configuration_key: configurationKey || null,
              configuration_name: configurationName || null,
              fitment_scope: fitScope,
              section_key: normSectionKey,
              section_name: p.section_name,
              section_attribution_status: attributionStatus,
              diagram_position: p.diagram_position,
              source_id: 'sparepartsworld',
              source_url: res.final_url || qItem.source_url,
              requested_url: qItem.source_url,
              final_url: res.final_url || qItem.source_url,
              http_status: res.status,
              source_response_sha256: res.bodySha256 || null,
              part_name_raw: p.part_name_raw,
              quantity: p.quantity || 1
            };
            if (evidenceWriter) {
              const resWriter = evidenceWriter.writeObservation(obsObj);
              if (resWriter && resWriter.written) {
                stats.canonical_evidence_rows++;
                stats.evidence_observations_count++;
              } else if (resWriter && resWriter.reason === 'DUPLICATE') {
                stats.duplicate_observations_collapsed++;
                stats.duplicate_rows_collapsed++;
              }
            } else {
              stats.canonical_evidence_rows++;
              stats.evidence_observations_count++;
            }

            // Canonical Parts Catalog entry
            if (!partsCatalogMap.has(pNum)) {
              partsCatalogMap.set(pNum, {
                part_number: pNum,
                part_number_display: p.part_number_display,
                part_name: p.part_name_raw,
                part_name_normalized: p.part_name_normalized,
                source_count: 1,
                sources: ['sparepartsworld']
              });
            } else {
              const existing = partsCatalogMap.get(pNum);
              if (!existing.sources.includes('sparepartsworld')) {
                existing.sources.push('sparepartsworld');
                existing.source_count = existing.sources.length;
              }
            }

            // Canonical Fitment entry
            const fitmentKey = `${pNum}::${canonicalModelId}::${variantKey || 'base'}::${cleanCfg}::${fitScope}`;

            if (!fitmentsMap.has(fitmentKey)) {
              fitmentsMap.set(fitmentKey, {
                fitment_id: fitmentKey,
                part_number: pNum,
                canonical_model_id: canonicalModelId,
                variant_key: variantKey || 'base',
                configuration_key: configurationKey || null,
                configuration_name: configurationName || null,
                fitment_scope: fitScope,
                section_key: normSectionKey,
                section_name: p.section_name,
                diagram_position: p.diagram_position,
                quantity: p.quantity,
                notes: p.notes,
                variant_condition: null,
                serial_condition: null,
                superseded_by: null,
                source_id: 'sparepartsworld',
                source_url: res.final_url || qItem.source_url,
                source_evidence_status: 'SINGLE_STRUCTURED_PARTS_SOURCE'
              });
              stats.fitment_relations++;
            }
          }

          checkpoint.processed[qId] = {
            status: 'SUCCESS',
            parts_count: parts.length,
            timestamp: new Date().toISOString()
          };
        }
      } catch (err) {
        stats.parse_failed_items++;
        failuresList.push({
          queue_id: qId,
          source_url: qItem.source_url,
          status: 'PARSE_FAILED',
          error: err.message
        });
        checkpoint.processed[qId] = { status: 'PARSE_FAILED', error: err.message, timestamp: new Date().toISOString() };
      }

      // Checkpoint write every 200 items
      if (itemIdx % 200 === 0 && !this.dryRun) {
        checkpoint.last_updated = new Date().toISOString();
        fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf8');
      }
    }

    // 4. Integrate Official STIHL Evidence across all known models
    console.log('🏛️ Integrating Official STIHL Service Evidence...');
    const officialRecords = this.sources.official_stihl.evidenceRecords || [];
    const allOfficialModels = new Set(officialRecords.flatMap(r => r.models || []));

    for (const officialModel of allOfficialModels) {
      const oParts = await this.sources.official_stihl.getOfficialPartsForModel(officialModel);
      const oNorm = PartNormalizer.normalizeModelVariant(officialModel);
      const officialVariantKey = `${oNorm.canonical_model_id}::${oNorm.variant_key}`;
      if (!variantsMap.has(officialVariantKey)) {
        variantsMap.set(officialVariantKey, {
          canonical_model_id: oNorm.canonical_model_id,
          base_model_name: oNorm.base_model_name,
          variant_key: oNorm.variant_key,
          variant_name: oNorm.variant_name,
          source_model_name: oNorm.source_model_name
        });
        stats.variants_found++;
      }

      for (const op of oParts) {
        stats.raw_part_rows++;
        const pNum = op.part_number;
        const normSectionKey = PartNormalizer.normalizeSectionKey(op.section_key);

        stats.parts_with_section++;
        mappedSectionKeys.add(`${oNorm.canonical_model_id}::${normSectionKey}`);

        // Official Evidence Observation
        const obsId = `obs_${pNum}_${oNorm.canonical_model_id}_${oNorm.variant_key}_base_official_stihl_${normSectionKey}_${op.diagram_position}`;
        const obsObj = {
          evidence_id: obsId,
          part_number: pNum,
          canonical_model_id: oNorm.canonical_model_id,
          variant_key: oNorm.variant_key,
          configuration_key: null,
          configuration_name: null,
          fitment_scope: op.fitment_scope || FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
          section_key: normSectionKey,
          section_name: op.section_name,
          section_attribution_status: 'MAPPED',
          diagram_position: op.diagram_position,
          source_id: 'official_stihl',
          source_url: op.source_url,
          requested_url: op.source_url,
          final_url: op.source_url,
          http_status: 200,
          source_response_sha256: '35feb83f556080c13f105ae8528901e90088f817dfbdb526c35e477161b4e68b',
          part_name_raw: op.part_name_raw,
          quantity: 1
        };
        if (evidenceWriter) {
          const resWriter = evidenceWriter.writeObservation(obsObj);
          if (resWriter && resWriter.written) {
            stats.canonical_evidence_rows++;
            stats.evidence_observations_count++;
          } else if (resWriter && resWriter.reason === 'DUPLICATE') {
            stats.duplicate_observations_collapsed++;
            stats.duplicate_rows_collapsed++;
          }
        } else {
          stats.canonical_evidence_rows++;
          stats.evidence_observations_count++;
        }

        // Add or Update in Parts Catalog with Official Precedence
        if (!partsCatalogMap.has(pNum)) {
          partsCatalogMap.set(pNum, {
            part_number: pNum,
            part_number_display: op.part_number_display,
            part_name: op.part_name_raw,
            part_name_normalized: op.part_name_normalized,
            source_count: 1,
            sources: ['official_stihl']
          });
        } else {
          const existing = partsCatalogMap.get(pNum);
          if (!existing.sources.includes('official_stihl')) {
            existing.sources.push('official_stihl');
            existing.source_count = existing.sources.length;
          }
          // Official source name precedence
          existing.part_name = op.part_name_raw;
          existing.part_name_normalized = op.part_name_normalized;
        }

        // Canonical Fitment Entry with Official Precedence
        const fitScope = op.fitment_scope || (oNorm.variant_key === 'base' ? FITMENT_SCOPES.BASE_MODEL_CONFIRMED : FITMENT_SCOPES.EXACT_VARIANT);
        const fitmentKey = `${pNum}::${oNorm.canonical_model_id}::${oNorm.variant_key}::base::${fitScope}`;

        if (!fitmentsMap.has(fitmentKey)) {
          fitmentsMap.set(fitmentKey, {
            fitment_id: fitmentKey,
            part_number: pNum,
            canonical_model_id: oNorm.canonical_model_id,
            variant_key: oNorm.variant_key,
            configuration_key: null,
            configuration_name: null,
            fitment_scope: fitScope,
            section_key: normSectionKey,
            section_name: op.section_name,
            diagram_position: op.diagram_position,
            quantity: 1,
            notes: op.notes,
            variant_condition: op.variant_condition || null,
            serial_condition: op.serial_condition || null,
            superseded_by: null,
            source_id: 'official_stihl',
            source_url: op.source_url,
            source_evidence_status: 'OFFICIAL_STIHL'
          });
          stats.fitment_relations++;
        } else {
          const existingFitment = fitmentsMap.get(fitmentKey);
          existingFitment.source_id = 'official_stihl';
          existingFitment.source_url = op.source_url;
          existingFitment.source_evidence_status = 'OFFICIAL_STIHL';
          existingFitment.notes = op.notes;
          existingFitment.variant_condition = op.variant_condition || null;
        }
      }
    }

    // Finalize evidence streaming file
    if (evidenceWriter) {
      await evidenceWriter.finalize();
    }

    // 5. Final Metrics Calculation & Conservation Invariant
    stats.unaccounted_rows = stats.raw_part_rows - (
      stats.canonical_evidence_rows +
      stats.invalid_part_number_rows +
      stats.noncanonical_part_rows +
      stats.duplicate_observations_collapsed +
      stats.explicitly_rejected_rows
    );

    stats.row_conservation = {
      raw_part_rows: stats.raw_part_rows,
      canonical_evidence_rows: stats.canonical_evidence_rows,
      invalid_part_number_rows: stats.invalid_part_number_rows,
      noncanonical_part_rows: stats.noncanonical_part_rows,
      duplicate_observations_collapsed: stats.duplicate_observations_collapsed,
      explicitly_rejected_rows: stats.explicitly_rejected_rows,
      unaccounted_rows: stats.unaccounted_rows,
      conservation_invariant_satisfied: stats.unaccounted_rows === 0
    };

    stats.sections_with_mapped_parts = mappedSectionKeys.size;
    stats.sections_without_mapped_parts = Math.max(0, stats.sections_discovered - stats.sections_with_mapped_parts);
    stats.sections_parsed = stats.sections_with_mapped_parts;
    stats.valid_part_rows = partsCatalogMap.size;
    stats.unique_part_numbers = partsCatalogMap.size;
    stats.conflicts_detected = conflictsMap.size;

    const totalPartsAttr = stats.parts_with_section + stats.parts_without_section;
    stats.section_mapping_rate = totalPartsAttr > 0 ? Number((stats.parts_with_section / totalPartsAttr).toFixed(4)) : 0;

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
    const sortedVariants = Array.from(variantsMap.values()).sort((a, b) => `${a.canonical_model_id}::${a.variant_key}`.localeCompare(`${b.canonical_model_id}::${b.variant_key}`));
    const sortedConfigurations = Array.from(configurationsMap.values()).sort((a, b) =>
      `${a.canonical_model_id}::${a.variant_key}::${a.configuration_key}::${a.source_product_id}`.localeCompare(
        `${b.canonical_model_id}::${b.variant_key}::${b.configuration_key}::${b.source_product_id}`
      )
    );
    const sortedConflicts = Array.from(conflictsMap.values()).sort((a, b) => a.conflict_id.localeCompare(b.conflict_id));

    const partsSourcesDoc = {
      schema_version: 'parts-sources-v1',
      sources: [
        {
          source_id: 'sparepartsworld',
          source_name: 'Spare Parts World UK',
          source_type: 'STRUCTURED_EXPLODED_DIAGRAM_CATALOGUE',
          source_url: 'https://www.sparepartsworld.co.uk',
          authority_level: 'STRUCTURED_AFTERMARKET_DEALER'
        },
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
        },
        {
          source_id: 'lsengineers',
          source_name: 'L&S Engineers UK',
          source_type: 'PARTS_DIAGRAM_CATALOG',
          source_url: 'https://www.lsengineers.co.uk',
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
      observations_count: stats.evidence_observations_count
    };

    const partsVariantsDoc = {
      schema_version: 'parts-model-variants-v1',
      variants_count: sortedVariants.length,
      variants: sortedVariants
    };

    const partsConfigurationsDoc = {
      schema_version: 'parts-model-configurations-v1',
      configurations_count: sortedConfigurations.length,
      configurations: sortedConfigurations
    };

    const partsConflictsDoc = {
      schema_version: 'parts-conflicts-v1',
      conflicts_count: sortedConflicts.length,
      conflicts: sortedConflicts
    };

    const manifestDoc = {
      schema_version: 'parts-harvest-manifest-v1',
      parts_bearing_entities: queueItems.length,
      accepted_machines_count: queueItems.filter(q => q.entity_type !== 'ATTACHMENT').length,
      accepted_attachments_count: queueItems.filter(q => q.entity_type === 'ATTACHMENT').length,
      true_base_models_count: new Set(queueItems.map(q => q.canonical_model_id)).size,
      variants_count: sortedVariants.length,
      configurations_count: sortedConfigurations.length,
      ...stats
    };

    const failuresDoc = {
      schema_version: 'parts-harvest-failures-v1',
      total_failures: failuresList.length,
      failures: failuresList
    };

    const liveHarvestEvidenceDoc = {
      schema_version: 'phase52b-live-harvest-evidence-v1',
      harvest_mode: mode,
      generated_at: new Date().toISOString(),
      requests_count: liveHttpEvidence.length,
      requests: liveHttpEvidence
    };

    if (!this.dryRun) {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      await writeJsonArrayToFile(
        path.join(this.outputDir, 'parts_catalog.json'),
        { schema_version: 'parts-catalog-v1', parts_count: sortedParts.length },
        'parts',
        sortedParts
      );

      await writeGzipJsonlShardedArray(
        this.outputDir,
        'parts/fitments',
        'model_part_fitments',
        path.join(this.outputDir, 'model_part_fitments.json'),
        'model-part-fitments-v1',
        'fitments_count',
        sortedFitments,
        25000
      );

      await writeJsonArrayToFile(
        path.join(this.outputDir, 'parts_model_variants.json'),
        { schema_version: 'parts-model-variants-v1', variants_count: sortedVariants.length },
        'variants',
        sortedVariants
      );

      await writeJsonArrayToFile(
        path.join(this.outputDir, 'parts_model_configurations.json'),
        { schema_version: 'parts-model-configurations-v1', configurations_count: sortedConfigurations.length },
        'configurations',
        sortedConfigurations
      );

      fs.writeFileSync(path.join(this.outputDir, 'parts_sources.json'), JSON.stringify(partsSourcesDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_conflicts.json'), JSON.stringify(partsConflictsDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_harvest_manifest.json'), JSON.stringify(manifestDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'parts_harvest_failures.json'), JSON.stringify(failuresDoc, null, 2), 'utf8');
      fs.writeFileSync(path.join(this.outputDir, 'phase52b_live_harvest_evidence.json'), JSON.stringify(liveHarvestEvidenceDoc, null, 2), 'utf8');

      // Final checkpoint save
      checkpoint.last_updated = new Date().toISOString();
      checkpoint.completed = true;
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2), 'utf8');
    }

    return {
      stats,
      partsCatalogDoc,
      modelPartFitmentsDoc,
      partFitmentEvidenceDoc,
      partsSourcesDoc,
      partsConflictsDoc,
      partsVariantsDoc,
      partsConfigurationsDoc,
      manifestDoc,
      failuresDoc,
      liveHarvestEvidenceDoc
    };
  }
}
