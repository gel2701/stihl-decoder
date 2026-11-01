/**
 * src/affiliate/ContinuousEnrichmentEngine.js
 *
 * Phase 59D: Continuous Evidence Enrichment Pipeline
 *
 * Provides a repeatable engine for investigating and enriching partially proven
 * STIHL parts matches (the 13 PART_COMPATIBILITY_VERIFIED candidates, 3 INCORRECT_MATCH_CONFIRMED,
 * and future candidate cohorts).
 *
 * Preserves all partial results, logs next required evidence steps, and prevents
 * candidate discard during ongoing research.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';

export const ENRICHMENT_STAGES = {
  STAGE_1_MANUFACTURER_MPN: 'STAGE_1_MANUFACTURER_MPN',
  STAGE_2_GTIN_BARCODE: 'STAGE_2_GTIN_BARCODE',
  STAGE_3_ASIN_IDENTITY: 'STAGE_3_ASIN_IDENTITY',
  STAGE_4_TWO_GATE_READY: 'STAGE_4_TWO_GATE_READY',
  STAGE_REJECTED_REPLACED: 'STAGE_REJECTED_REPLACED'
};

export class ContinuousEnrichmentEngine {
  /**
   * Evaluates current evidence readiness and determines next required investigation step.
   *
   * @param {Object} candidate
   * @returns {Object} Enrichment dossier with stage, next actions, and readiness score
   */
  static evaluateEnrichmentStatus(candidate) {
    const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
    const result = {
      part_number: normPart,
      part_name: candidate.part_name || candidate.title || '',
      investigation_status: candidate.investigation_status || 'EVIDENCE_RECOVERY_IN_PROGRESS',
      oem_brand_classification: candidate.oem_brand_classification || 'UNVERIFIED_AFTERMARKET',
      current_stage: ENRICHMENT_STAGES.STAGE_1_MANUFACTURER_MPN,
      readiness_score: 0, // 0 to 100
      factor_a_compatibility_proven: false,
      factor_b_asin_proven: false,
      next_required_actions: [],
      candidate_replacements: [],
      preservation_notes: ''
    };

    // Factor A: Compatibility & Manufacturer Evidence
    const hasMpn = Boolean(candidate.round_a_manufacturer_evidence?.mpn || candidate.manufacturer_part_number || candidate.mpn);
    const hasCompatibility = Boolean(candidate.round_a_manufacturer_evidence?.compatibility || candidate.compatibility_proof);
    const hasGtin = Boolean(candidate.round_b_product_identity_evidence?.ean_gtin || candidate.gtin || candidate.ean);

    if (hasMpn && hasCompatibility) {
      result.factor_a_compatibility_proven = true;
      result.readiness_score += 40;
    }

    if (hasGtin) {
      result.readiness_score += 20;
    }

    // Factor B: Amazon ASIN Identity Evidence
    const hasAsin = Boolean(candidate.verified_replacement_asin || candidate.asin);
    const isAsinVerified = Boolean(
      candidate.round_c_amazon_asin_verification?.status === 'VERIFIED_ACTIVE' ||
      candidate.independent_evidence_url
    );

    if (hasAsin && isAsinVerified) {
      result.factor_b_asin_proven = true;
      result.readiness_score += 40;
    }

    // Determine current stage & next steps
    if (candidate.investigation_status === 'VERIFIED_COMPLETE') {
      result.current_stage = ENRICHMENT_STAGES.STAGE_4_TWO_GATE_READY;
      result.readiness_score = 100;
      result.preservation_notes = 'Dossier fully corroborated across all 3 rounds. Two-Gate verified and ready for staging.';
    } else if (candidate.investigation_status === 'INCORRECT_MATCH_CONFIRMED') {
      result.current_stage = ENRICHMENT_STAGES.STAGE_REJECTED_REPLACED;
      result.readiness_score = 30;
      result.preservation_notes = `Original pairing confirmed technically incorrect (${candidate.discrepancy_found || 'Flawed cross-reference'}). Original pairing rejected; investigating replacement MPN.`;
      if (candidate.round_a_manufacturer_evidence?.mpn?.startsWith('Stens')) {
        result.candidate_replacements.push(candidate.round_a_manufacturer_evidence.mpn);
        result.next_required_actions.push('Locate verified ASIN for validated replacement MPN: ' + candidate.round_a_manufacturer_evidence.mpn);
      } else {
        result.next_required_actions.push('Identify correct OEM-compatible replacement MPN via authorized distributor cross-reference.');
      }
    } else if (candidate.investigation_status === 'PART_COMPATIBILITY_VERIFIED') {
      result.current_stage = ENRICHMENT_STAGES.STAGE_3_ASIN_IDENTITY;
      result.readiness_score = Math.max(result.readiness_score, 60);
      result.preservation_notes = 'Part compatibility 100% established via OEM parts manuals and GTIN barcodes. Lacks stable single-unit ASIN on Amazon.nl.';
      result.next_required_actions.push('Audit Amazon.nl catalog via Creators API / SiteStripe for verified single-unit OEM retail listing.');
      result.next_required_actions.push('Examine whether aftermarket brand (Stens/Sägenspezi/Rotary) provides stable blister ASIN.');
    } else {
      result.current_stage = ENRICHMENT_STAGES.STAGE_1_MANUFACTURER_MPN;
      result.next_required_actions.push('Retrieve OEM parts manual page for part breakdown and model application.');
      result.next_required_actions.push('Search manufacturer catalog for GTIN/EAN barcode.');
    }

    return result;
  }

  /**
   * Processes a batch of candidates and generates an aggregated enrichment backlog.
   *
   * @param {Array<Object>} candidates
   * @returns {Object} Backlog report
   */
  static processBacklog(candidates) {
    const dossiers = candidates.map(c => this.evaluateEnrichmentStatus(c));
    return {
      total_candidates: dossiers.length,
      stage_summary: {
        stage_4_ready: dossiers.filter(d => d.current_stage === ENRICHMENT_STAGES.STAGE_4_TWO_GATE_READY).length,
        stage_3_asin_needed: dossiers.filter(d => d.current_stage === ENRICHMENT_STAGES.STAGE_3_ASIN_IDENTITY).length,
        stage_2_gtin_needed: dossiers.filter(d => d.current_stage === ENRICHMENT_STAGES.STAGE_2_GTIN_BARCODE).length,
        stage_1_mpn_needed: dossiers.filter(d => d.current_stage === ENRICHMENT_STAGES.STAGE_1_MANUFACTURER_MPN).length,
        stage_rejected_replaced: dossiers.filter(d => d.current_stage === ENRICHMENT_STAGES.STAGE_REJECTED_REPLACED).length
      },
      dossiers
    };
  }
}
