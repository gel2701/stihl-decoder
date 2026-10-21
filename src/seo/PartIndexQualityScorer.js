/**
 * Part SEO Quality & Commercial Opportunity Scorer for STIHLDecoder.nl
 * Phase 56A — Parts Commercial Growth Foundation
 *
 * Implements deterministic, evidence-backed evaluation of STIHL parts:
 * 1. Part SEO Quality Score (SEO_TIER_A, SEO_TIER_B, SEO_TIER_C, SEO_THIN, SEO_BLOCKED)
 * 2. Commercial Opportunity Score (COMMERCIAL_HIGH, COMMERCIAL_MEDIUM, COMMERCIAL_LOW, COMMERCIAL_UNKNOWN)
 *
 * ZERO FABRICATED DATA:
 * Scoring is exclusively derived from existing canonical database records,
 * verified fitments, diagram contexts, and authentic supersession bulletins.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { PartIndexReadinessClassifier } from './PartIndexReadinessClassifier.js';

export const SEO_TIERS = {
  TIER_A: 'SEO_TIER_A',
  TIER_B: 'SEO_TIER_B',
  TIER_C: 'SEO_TIER_C',
  THIN: 'SEO_THIN',
  BLOCKED: 'SEO_BLOCKED'
};

export const COMMERCIAL_TIERS = {
  HIGH: 'COMMERCIAL_HIGH',
  MEDIUM: 'COMMERCIAL_MEDIUM',
  LOW: 'COMMERCIAL_LOW',
  UNKNOWN: 'COMMERCIAL_UNKNOWN'
};

export const COMMERCIAL_CATEGORY_RULES = [
  { category: 'bougie', regex: /\b(spark plug|bougie|zündkerze)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'luchtfilter', regex: /\b(air filter|luchtfilter|filterelement|filter element|filter fleece|filtervlies)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'brandstoffilter', regex: /\b(fuel filter|brandstoffilter|pickup body|saugkopf)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'oliefilter', regex: /\b(oil filter|oliefilter|oil pickup)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'starter', regex: /\b(starter|repulseur|handstarter|recoil starter|seilrolle|starter roll)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'startkoord', regex: /\b(starter rope|startkoord|anwerfseil|starter cord)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'carburateur', regex: /\b(carburetor|carburateur|vergaser)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'carburateurdelen', regex: /\b(carburetor kit|diaphragm|membraan|regelmembraan|reparatursatz|pumpendiaphragma)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'koppeling', regex: /\b(clutch|koppeling|fliehkraftkupplung)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'koppelingsveer', regex: /\b(clutch spring|koppelingsveer|zugfeder)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'kettingwiel', regex: /\b(chain sprocket|kettingwiel|kettenrad|rim sprocket|spur sprocket)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'tandwiel', regex: /\b(gear|tandwiel|stirnrad|kegelrad)\b/i, tier: COMMERCIAL_TIERS.MEDIUM },
  { category: 'zaagketting_delen', regex: /\b(guide bar|zaagblad|zaagketting|saw chain|führungsschiene|bar nose)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'oliepomp', regex: /\b(oil pump|oliepomp|ölpumpe|worm gear|schnecke)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'antivibratie', regex: /\b(av buffer|anti-vibration|antivibratie|ring buffer|annular buffer|anschlagpuffer|puffer)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'pakkingen', regex: /\b(gasket|pakking|dichtung|seal ring|shaft seal|wellendichtring)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'brandstofslang', regex: /\b(fuel hose|brandstofslang|kraftstoffschlauch|hose line|fuel line)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'primer', regex: /\b(primer|manual fuel pump|handpomp|primer bulb)\b/i, tier: COMMERCIAL_TIERS.HIGH },
  { category: 'maaikop_delen', regex: /\b(mowing head|maaikop|trimmer head|mähkopf|spool|draadspoel|eyelet)\b/i, tier: COMMERCIAL_TIERS.HIGH }
];

export const GENERIC_HARDWARE_REGEX = /\b(washer|screw|nut|bolt|pan head|spline screw|hexagon nut|hex nut|lock nut|e-clip|circlip|snap ring|o-ring|dowel pin|hose clamp|retaining ring|cotter pin|spacer|collar|grommet|sealing plug|din\d+|allen key|torx wrench)\b/i;

export class PartIndexQualityScorer {
  /**
   * Evaluates SEO quality and commercial opportunity for a single part.
   *
   * @param {Object} part
   * @param {Object} [context]
   * @param {Set<string>} [context.conflictPartSet]
   * @param {Set<string>} [context.supersessionPartSet]
   * @param {Map<string, number>} [context.evidenceMap]
   * @returns {Object} Full scoring result
   */
  static evaluatePart(part, context = {}) {
    const rawName = part.part_name || '';
    const cleanName = PartIndexReadinessClassifier.extractCleanComponentName(rawName);
    const evalName = cleanName || rawName;

    const reasons = [];
    let seoScore = 0;

    // 1. Data Integrity & Encoding checks
    const hasEncodingIssue = rawName.includes('\uFFFD') ||
      rawName.includes('&amp;') ||
      rawName.includes('&quot;') ||
      rawName.includes('&#') ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(rawName) ||
      /[\u00C0-\u00C3][\u0080-\u00BF]/.test(rawName);

    if (hasEncodingIssue) {
      reasons.push('unresolved_encoding');
    }

    const hasConflict = Boolean(context.conflictPartSet && context.conflictPartSet.has(part.part_number));
    if (hasConflict) {
      reasons.push('technical_conflict_unresolved');
    }

    if (rawName.trim().length === 0 || rawName.toLowerCase().includes('unknown') || rawName.toLowerCase().includes('onbekend')) {
      reasons.push('missing_or_unknown_name');
    }

    // Name length & technical specificity
    if (evalName.length >= 15) {
      seoScore += 15;
    } else if (evalName.length >= 8) {
      seoScore += 10;
    } else {
      seoScore += 5;
      reasons.push('short_name');
    }

    // 2. Generic hardware classification
    const isHardware = GENERIC_HARDWARE_REGEX.test(evalName) || GENERIC_HARDWARE_REGEX.test(rawName);
    if (isHardware) {
      seoScore -= 25;
      reasons.push('generic_hardware');
    }

    // 3. Model breadth & fitment depth
    const modelCount = part.model_count || 0;
    const fitmentCount = part.fitment_count || 0;

    if (modelCount >= 10) seoScore += 25;
    else if (modelCount >= 5) seoScore += 20;
    else if (modelCount >= 2) seoScore += 15;
    else if (modelCount === 1) {
      seoScore += 5;
      reasons.push('single_model_only');
    } else {
      reasons.push('zero_models');
    }

    if (fitmentCount >= 10) seoScore += 15;
    else if (fitmentCount >= 3) seoScore += 10;
    else if (fitmentCount >= 1) seoScore += 5;
    else reasons.push('insufficient_fitments');

    // 4. Meaningful canonical section
    const rawSections = part.raw_sections ? part.raw_sections.split('|') : (part.sections || []);
    const meaningfulSections = rawSections.filter(s => s && s !== 'Unresolved Diagram Section' && s !== 'Algemene sectie' && s !== 'general_unresolved');
    if (meaningfulSections.length > 0) {
      seoScore += 15;
    } else {
      reasons.push('lacks_canonical_section');
    }

    // 5. Meaningful diagram position
    const rawPositions = part.raw_positions ? part.raw_positions.split('|') : (part.positions || []);
    const meaningfulPositions = rawPositions.filter(pos => PartNormalizer.isMeaningfulDiagramPosition(pos));
    if (meaningfulPositions.length > 0) {
      seoScore += 10;
    } else {
      reasons.push('lacks_diagram_position');
    }

    // 6. Configuration context
    const hasConfig = Boolean(part.has_config);
    if (hasConfig) {
      seoScore += 10;
    } else {
      reasons.push('lacks_configuration_context');
    }

    // 7. Supersession / replacement info
    const hasSupersession = Boolean(context.supersessionPartSet && context.supersessionPartSet.has(part.part_number));
    if (hasSupersession) {
      seoScore += 10;
    }

    // 8. Evidence observations depth
    const evCount = (context.evidenceMap && context.evidenceMap.get(part.part_number)) || 0;
    if (evCount >= 10) seoScore += 10;
    else if (evCount >= 3) seoScore += 5;

    // 9. SEO Tier Assignment
    let seoTier;
    if (hasEncodingIssue || hasConflict || rawName.trim().length === 0) {
      seoTier = SEO_TIERS.BLOCKED;
    } else if (isHardware) {
      seoTier = SEO_TIERS.THIN;
    } else if (seoScore >= 65 && modelCount >= 2 && meaningfulPositions.length > 0 && meaningfulSections.length > 0) {
      seoTier = SEO_TIERS.TIER_A;
    } else if (seoScore >= 45 && modelCount >= 2 && (meaningfulPositions.length > 0 || meaningfulSections.length > 0)) {
      seoTier = SEO_TIERS.TIER_B;
    } else if (seoScore >= 30 && fitmentCount >= 1) {
      seoTier = SEO_TIERS.TIER_C;
    } else {
      seoTier = SEO_TIERS.THIN;
    }

    // 10. Commercial Opportunity Evaluation
    let commercialTier = COMMERCIAL_TIERS.UNKNOWN;
    let commercialCategory = null;

    for (const rule of COMMERCIAL_CATEGORY_RULES) {
      if (rule.regex.test(rawName)) {
        commercialTier = rule.tier;
        commercialCategory = rule.category;
        break;
      }
    }

    if (!commercialCategory) {
      if (isHardware) {
        commercialTier = COMMERCIAL_TIERS.LOW;
      } else if (modelCount >= 5 || fitmentCount >= 10) {
        commercialTier = COMMERCIAL_TIERS.MEDIUM;
      } else if (modelCount >= 2) {
        commercialTier = COMMERCIAL_TIERS.LOW;
      } else {
        commercialTier = COMMERCIAL_TIERS.UNKNOWN;
      }
    }

    const displayPartNo = part.part_number_display || PartNormalizer.formatPartNumber(part.part_number);

    return {
      part_number: part.part_number,
      part_number_display: displayPartNo,
      part_name: rawName,
      clean_name: evalName,
      category: commercialCategory,
      seo_score: seoScore,
      seo_tier: seoTier,
      commercial_tier: commercialTier,
      model_count: modelCount,
      fitment_count: fitmentCount,
      section_count: meaningfulSections.length,
      position_count: meaningfulPositions.length,
      has_config: hasConfig,
      has_supersession: hasSupersession,
      is_generic_hardware: isHardware,
      reasons
    };
  }
}
