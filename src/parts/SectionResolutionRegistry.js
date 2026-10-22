/**
 * Phase 56H — Evidence-Based Diagram Section Resolution Registry
 *
 * Centralizes deterministic, provenance-backed diagram section resolution for
 * model_part_fitments without mutating frozen Phase 54F scalar columns or shard hashes.
 *
 * Resolution layers:
 *   1. Scalar resolved section on fitment (`f.section_name !== 'Unresolved Diagram Section'`)
 *   2. Rule A — Explicit single-section source evidence on exact scope (`data/parts_section_resolutions_56h.json`, 10 fitments)
 *   3. Rule C — Verified canonical multi-section & additional contexts (`data/model_part_fitment_section_contexts.json`, 814 contexts across 338 fitments: 334 unresolved multi-section fitments + 4 additional contexts on scalar-resolved fitments)
 *
 * Strictly enforces:
 *   - Exact fitment_id / scope matching (`canonical_model_id + part_number + fitment_scope + variant_key + configuration_key`)
 *   - Zero cross-variant or cross-configuration leakage
 *   - Non-lossy multi-section preservation (`VALID_MULTI_SECTION`)
 *   - Preservation of `section_name_raw`
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SectionNormalizer } from './SectionNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const defaultContextsPath = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const defaultResolutions56hPath = path.join(rootDir, 'data', 'parts_section_resolutions_56h.json');

let cachedContextsByFitmentId = null;
let cachedResolutionsByFitmentId = null;

function ensureRegistryLoaded() {
  if (cachedContextsByFitmentId === null) {
    cachedContextsByFitmentId = new Map();
    try {
      if (fs.existsSync(defaultContextsPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultContextsPath, 'utf8'));
        const list = Array.isArray(doc.contexts) ? doc.contexts : [];
        for (const ctx of list) {
          if (!ctx.fitment_id) continue;
          if (!cachedContextsByFitmentId.has(ctx.fitment_id)) {
            cachedContextsByFitmentId.set(ctx.fitment_id, []);
          }
          cachedContextsByFitmentId.get(ctx.fitment_id).push(ctx);
        }
      }
    } catch (e) {
      cachedContextsByFitmentId = new Map();
    }
  }

  if (cachedResolutionsByFitmentId === null) {
    cachedResolutionsByFitmentId = new Map();
    try {
      if (fs.existsSync(defaultResolutions56hPath)) {
        const doc = JSON.parse(fs.readFileSync(defaultResolutions56hPath, 'utf8'));
        const list = Array.isArray(doc.resolutions) ? doc.resolutions : [];
        for (const res of list) {
          if (!res.fitment_id) continue;
          cachedResolutionsByFitmentId.set(res.fitment_id, res);
        }
      }
    } catch (e) {
      cachedResolutionsByFitmentId = new Map();
    }
  }
}

export function resetSectionResolutionCache() {
  cachedContextsByFitmentId = null;
  cachedResolutionsByFitmentId = null;
}

/**
 * Computes canonical fitment_id if not explicitly present on a fitment object.
 */
export function computeCanonicalFitmentId(fitment) {
  if (!fitment) return '';
  if (fitment.fitment_id) return fitment.fitment_id;
  const pn = fitment.part_number || '';
  const modelId = fitment.canonical_model_id || '';
  const varKey = (fitment.variant_key || 'base').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const cfgKey = fitment.configuration_key
    ? fitment.configuration_key.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    : 'base';
  const scope = fitment.fitment_scope || 'BASE_MODEL_CONFIRMED';
  return `${pn}::${modelId}::${varKey}::${cfgKey}::${scope}`;
}

export class SectionResolutionRegistry {
  /**
   * Returns full section resolution state for a fitment.
   *
   * @param {Object} fitment
   * @returns {{
   *   fitment_id: string,
   *   status: 'SCALAR_RESOLVED' | 'SCALAR_WITH_ADDITIONAL_CONTEXT' | 'RESOLVED_EXPLICIT_EVIDENCE' | 'VALID_MULTI_SECTION' | 'UNRESOLVED',
   *   resolution_rule: string | null,
   *   confidence_contract: string | null,
   *   raw_section_name: string | null,
   *   primary_section_key: string,
   *   primary_section_name: string,
   *   primary_section_canonical: string | null,
   *   resolved_sections: Array<{
   *     section_key: string,
   *     section_name: string,
   *     section_name_raw: string,
   *     diagram_position: string | null,
   *     source_evidence_id: string | null,
   *     source_id: string | null,
   *     source_url: string | null,
   *     resolution_rule: string,
   *     provenance_hash: string | null
   *   }>
   * }}
   */
  static resolveFitmentSections(fitment) {
    ensureRegistryLoaded();
    const fitmentId = computeCanonicalFitmentId(fitment);
    const rawSecName = fitment?.section_name || 'Unresolved Diagram Section';
    const rawSecKey = fitment?.section_key || 'general_unresolved';
    const scalarCanon = SectionNormalizer.normalizeSectionName(rawSecName);

    const contexts = cachedContextsByFitmentId.get(fitmentId) || [];
    const ruleAResolution = cachedResolutionsByFitmentId.get(fitmentId) || null;

    // Case 1: Fitment already has a scalar resolved section
    if (scalarCanon) {
      const resolvedSections = [
        {
          section_key: SectionNormalizer.normalizeSectionKey(rawSecKey !== 'general_unresolved' ? rawSecKey : scalarCanon),
          section_name: scalarCanon,
          section_name_raw: rawSecName,
          diagram_position: fitment.diagram_position || null,
          source_evidence_id: null,
          source_id: fitment.source_id || null,
          source_url: fitment.source_url || null,
          resolution_rule: 'EXISTING_SCALAR_SECTION',
          provenance_hash: null
        }
      ];

      const seenCanon = new Set([scalarCanon]);
      for (const ctx of contexts) {
        const ctxCanon = SectionNormalizer.normalizeSectionName(ctx.section_name) || ctx.section_name;
        if (ctxCanon && !seenCanon.has(ctxCanon)) {
          seenCanon.add(ctxCanon);
          resolvedSections.push({
            section_key: SectionNormalizer.normalizeSectionKey(ctx.section_key || ctxCanon),
            section_name: ctxCanon,
            section_name_raw: ctx.section_name_raw || ctx.section_name,
            diagram_position: ctx.diagram_position || fitment.diagram_position || null,
            source_evidence_id: ctx.source_evidence_id || null,
            source_id: ctx.source_id || null,
            source_url: ctx.source_url || null,
            resolution_rule: 'RULE_C_ADDITIONAL_CANONICAL_CONTEXT',
            provenance_hash: ctx.provenance_hash || null
          });
        }
      }

      return {
        fitment_id: fitmentId,
        status: resolvedSections.length > 1 ? 'SCALAR_WITH_ADDITIONAL_CONTEXT' : 'SCALAR_RESOLVED',
        resolution_rule: resolvedSections.length > 1 ? 'RULE_C_ADDITIONAL_CANONICAL_CONTEXT' : 'EXISTING_SCALAR_SECTION',
        confidence_contract: 'VERIFIED_CANONICAL',
        raw_section_name: rawSecName,
        primary_section_key: resolvedSections[0].section_key,
        primary_section_name: scalarCanon,
        primary_section_canonical: scalarCanon,
        resolved_sections: resolvedSections
      };
    }

    // Case 2: Fitment is scalar unresolved, but has verified canonical multi-section contexts (Rule C: 334 fitments / 810 contexts)
    if (contexts.length > 0) {
      const resolvedSections = [];
      const seenCanon = new Set();
      for (const ctx of contexts) {
        const ctxCanon = SectionNormalizer.normalizeSectionName(ctx.section_name) || ctx.section_name;
        if (!ctxCanon || seenCanon.has(ctxCanon)) continue;
        seenCanon.add(ctxCanon);
        resolvedSections.push({
          section_key: SectionNormalizer.normalizeSectionKey(ctx.section_key || ctxCanon),
          section_name: ctxCanon,
          section_name_raw: ctx.section_name_raw || ctx.section_name,
          diagram_position: ctx.diagram_position || fitment.diagram_position || null,
          source_evidence_id: ctx.source_evidence_id || null,
          source_id: ctx.source_id || null,
          source_url: ctx.source_url || null,
          resolution_rule: 'RULE_C_EXISTING_CANONICAL_MULTI_CONTEXT',
          provenance_hash: ctx.provenance_hash || null
        });
      }

      if (resolvedSections.length > 0) {
        return {
          fitment_id: fitmentId,
          status: resolvedSections.length > 1 ? 'VALID_MULTI_SECTION' : 'RESOLVED_EXPLICIT_EVIDENCE',
          resolution_rule: 'RULE_C_EXISTING_CANONICAL_MULTI_CONTEXT',
          confidence_contract: 'VERIFIED_MULTI_SECTION_CONTEXT',
          raw_section_name: rawSecName,
          primary_section_key: resolvedSections[0].section_key,
          primary_section_name: resolvedSections[0].section_name,
          primary_section_canonical: resolvedSections[0].section_name,
          resolved_sections: resolvedSections
        };
      }
    }

    // Case 3: Fitment is scalar unresolved, but has Rule A explicit exact-scope source evidence (10 fitments)
    if (ruleAResolution && ruleAResolution.canonical_section_name) {
      const canonName = SectionNormalizer.normalizeSectionName(ruleAResolution.canonical_section_name) || ruleAResolution.canonical_section_name;
      const canonKey = SectionNormalizer.normalizeSectionKey(ruleAResolution.canonical_section_key || canonName);
      const secEntry = {
        section_key: canonKey,
        section_name: canonName,
        section_name_raw: ruleAResolution.section_name_raw || ruleAResolution.canonical_section_name,
        diagram_position: fitment.diagram_position || ruleAResolution.diagram_position || null,
        source_evidence_id: ruleAResolution.source_evidence_id || null,
        source_id: ruleAResolution.source_id || null,
        source_url: ruleAResolution.source_url || null,
        resolution_rule: ruleAResolution.resolution_rule || 'RULE_A_EXPLICIT_EXACT_SCOPE_EVIDENCE',
        provenance_hash: ruleAResolution.provenance_hash || null
      };

      return {
        fitment_id: fitmentId,
        status: 'RESOLVED_EXPLICIT_EVIDENCE',
        resolution_rule: secEntry.resolution_rule,
        confidence_contract: ruleAResolution.confidence_contract || 'EXACT_SCOPE_SOURCE_EVIDENCE',
        raw_section_name: rawSecName,
        primary_section_key: canonKey,
        primary_section_name: canonName,
        primary_section_canonical: canonName,
        resolved_sections: [secEntry]
      };
    }

    // Case 4: Remains Unresolved
    return {
      fitment_id: fitmentId,
      status: 'UNRESOLVED',
      resolution_rule: null,
      confidence_contract: null,
      raw_section_name: rawSecName,
      primary_section_key: SectionNormalizer.normalizeSectionKey(rawSecKey),
      primary_section_name: rawSecName,
      primary_section_canonical: null,
      resolved_sections: []
    };
  }

  /**
   * Returns summary counts of registered contexts and Phase 56H explicit resolutions.
   */
  static getRegistryStats() {
    ensureRegistryLoaded();
    let totalContextRows = 0;
    for (const list of cachedContextsByFitmentId.values()) {
      totalContextRows += list.length;
    }
    return {
      context_fitments_count: cachedContextsByFitmentId.size,
      total_context_rows: totalContextRows,
      rule_a_resolutions_count: cachedResolutionsByFitmentId.size
    };
  }
}
