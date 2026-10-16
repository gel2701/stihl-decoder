/**
 * Phase 54F-A-R2: Scope & Provenance Validator
 *
 * Enforces the core invariant:
 * "NO CLAIM MAY BE MORE SPECIFIC THAN ITS SUPPORTING EVIDENCE"
 * (evidence specificity >= claim specificity)
 */

export const SCOPES = {
  MODEL_LEVEL_ONLY: 'MODEL_LEVEL_ONLY',
  BASE_MODEL_CONFIRMED: 'BASE_MODEL_CONFIRMED',
  EXACT_VARIANT: 'EXACT_VARIANT'
};

export class EnrichmentScopeValidator {
  /**
   * Validates that an enrichment does not exceed the specificity of its supporting evidence.
   *
   * @param {Object} enrichment The enrichment candidate record
   * @param {Object} evidence The raw/accepted supporting evidence observation
   * @param {Object} fitment The canonical fitment target record
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateEnrichment(enrichment, evidence, fitment) {
    const errors = [];

    if (!enrichment) {
      errors.push('ENRICHMENT_RECORD_MISSING');
      return { valid: false, errors };
    }

    if (!evidence) {
      errors.push('SUPPORTING_EVIDENCE_MISSING');
      return { valid: false, errors };
    }

    if (!fitment) {
      errors.push('TARGET_FITMENT_MISSING');
      return { valid: false, errors };
    }

    // 1. Evidence specificity >= claim specificity
    // If fitment is EXACT_VARIANT, evidence MUST have explicit matching variant identity
    if (fitment.fitment_scope === SCOPES.EXACT_VARIANT) {
      if (!evidence.variant_key || evidence.source_scope !== SCOPES.EXACT_VARIANT) {
        errors.push(
          `SPECIFICITY_LEAKAGE: Fitment ${fitment.fitment_id} has scope EXACT_VARIANT with variant_key '${fitment.variant_key}', ` +
          `but supporting evidence ${evidence.evidence_id} has source_scope '${evidence.source_scope || 'MODEL_LEVEL_ONLY'}' ` +
          `and variant_key '${evidence.variant_key}'. Model-level evidence cannot support an exact-variant claim.`
        );
      } else if (evidence.variant_key !== fitment.variant_key) {
        errors.push(
          `VARIANT_MISMATCH: Evidence variant_key '${evidence.variant_key}' does not match fitment variant_key '${fitment.variant_key}'.`
        );
      }
    }

    // 2. MODEL_LEVEL_ONLY evidence can ONLY enrich BASE_MODEL_CONFIRMED fitments
    const isModelLevelEvidence = (evidence.source_scope === SCOPES.MODEL_LEVEL_ONLY || evidence.variant_key === null);
    if (isModelLevelEvidence) {
      if (fitment.fitment_scope === SCOPES.EXACT_VARIANT) {
        errors.push(
          `INVALID_MODEL_LEVEL_TO_EXACT_VARIANT: Evidence ${evidence.evidence_id} has scope MODEL_LEVEL_ONLY ` +
          `and cannot enrich EXACT_VARIANT fitment ${fitment.fitment_id}.`
        );
      }
      if (fitment.configuration_key !== null) {
        errors.push(
          `INVALID_MODEL_LEVEL_TO_CONFIG_SPECIFIC: Evidence ${evidence.evidence_id} has scope MODEL_LEVEL_ONLY ` +
          `and cannot enrich configuration-specific fitment ${fitment.fitment_id} (configuration_key='${fitment.configuration_key}').`
        );
      }
      if (fitment.fitment_scope !== SCOPES.BASE_MODEL_CONFIRMED) {
        errors.push(
          `SCOPE_MISMATCH: Model-level evidence must target BASE_MODEL_CONFIRMED, found '${fitment.fitment_scope}'.`
        );
      }
    }

    // 3. Exact matching of part and model
    if (evidence.part_number !== fitment.part_number) {
      errors.push(`PART_MISMATCH: Evidence part ${evidence.part_number} != fitment part ${fitment.part_number}`);
    }
    if (evidence.canonical_model_id !== fitment.canonical_model_id) {
      errors.push(`MODEL_MISMATCH: Evidence model ${evidence.canonical_model_id} != fitment model ${fitment.canonical_model_id}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates an entire collection of enrichments against canonical fitments and evidence.
   */
  static validateEnrichmentSet(enrichments, evidenceMap, fitmentMap) {
    let validCount = 0;
    let invalidCount = 0;
    let modelLevelToVariantLeakageCount = 0;
    let nullVariantExactVariantCount = 0;
    const failures = [];

    for (const e of enrichments) {
      const fitment = fitmentMap.get(e.fitment_id);
      const expectedEvId = `ev_p54f_${e.canonical_model_id}_${e.part_number}_${e.section_key}`;
      const evidence = evidenceMap.get(expectedEvId);

      const result = this.validateEnrichment(e, evidence, fitment);
      if (result.valid) {
        validCount++;
      } else {
        invalidCount++;
        failures.push({
          fitment_id: e.fitment_id,
          errors: result.errors
        });

        if (fitment && fitment.fitment_scope === SCOPES.EXACT_VARIANT && (!evidence || evidence.source_scope === SCOPES.MODEL_LEVEL_ONLY)) {
          modelLevelToVariantLeakageCount++;
        }
        if (fitment && fitment.fitment_scope === SCOPES.EXACT_VARIANT && (!evidence || evidence.variant_key === null)) {
          nullVariantExactVariantCount++;
        }
      }
    }

    return {
      total: enrichments.length,
      valid_count: validCount,
      invalid_count: invalidCount,
      model_level_to_exact_variant_leakage: modelLevelToVariantLeakageCount,
      null_variant_key_exact_variant_enrichments: nullVariantExactVariantCount,
      failures
    };
  }
}
