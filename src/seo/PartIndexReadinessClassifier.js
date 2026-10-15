/**
 * Part Indexability Readiness Classifier for STIHLDecoder.nl
 * Phase 54C — SEO, Internal Linking & Controlled Indexation Readiness
 *
 * Evaluates individual part detail pages against evidence quality thresholds
 * to determine candidate status for potential future selective indexation.
 *
 * STRICT FAIL-CLOSED POLICY:
 * Individual part detail pages REMAIN 'noindex, follow' throughout Phase 54C.
 * This classifier is read-only and analytical.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const FUNCTIONAL_KEYWORDS = [
  'carburetor', 'carburateur', 'piston', 'zuiger', 'cylinder', 'cilinder', 'spark plug', 'bougie',
  'filter', 'clutch', 'koppeling', 'starter', 'sprocket', 'kettingwiel', 'coil',
  'bobine', 'gasket', 'pakking', 'oil pump', 'oliepomp', 'muffler', 'uitlaat',
  'blade', 'chain', 'zaagketting', 'guide bar', 'zaagblad', 'pawl', 'spring',
  'crankcase', 'carter', 'crankshaft', 'krukas', 'flywheel', 'vliegwiel'
];

const GENERIC_HARDWARE_REGEX = /\b(washer|screw|nut|bolt|pan head|spline screw|hexagon nut|hex nut|lock nut|e-clip|circlip|snap ring|o-ring|dowel pin|hose clamp|retaining ring|cotter pin|spacer|collar|grommet|sealing plug|din\d+|allen key|torx wrench)\b/i;

export class PartIndexReadinessClassifier {
  /**
   * Isolates the true component name from harvested descriptions by stripping catalog & model prose.
   *
   * @param {string} rawName
   * @returns {string} cleaned component name
   */
  static extractCleanComponentName(rawName) {
    if (!rawName) return '';
    return rawName
      .replace(/^stihl\s+/i, '')
      .replace(/^\d{4}\s*\d{3}\s*\d{4}\s*/i, '')
      .replace(/^\d{11}\s*/i, '')
      .replace(/\bchainsaw\s+parts?\b/gi, ' ')
      .replace(/\bdisc\s+cutter\s+parts?\b/gi, ' ')
      .replace(/\bhedge\s+trimmer\s+parts?\b/gi, ' ')
      .replace(/\bbrushcutter\s+parts?\b/gi, ' ')
      .replace(/\bblower\s+parts?\b/gi, ' ')
      .replace(/\bparts?\b/gi, ' ')
      .replace(/\|.*$/g, ' ')
      .replace(/\b(ms|fs|br|ts|bg|hs|sh|bt|hl|ht)\s*\d+[a-z0-9\s\/\-]*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Evaluates and classifies a single part record.
   *
   * @param {Object} part
   * @returns {Object} classification result with score, tier, reasons, and preview
   */
  static evaluatePart(part) {
    let score = 0;
    const rawName = (part.part_name || '').toLowerCase();
    const cleanName = PartIndexReadinessClassifier.extractCleanComponentName(part.part_name).toLowerCase();
    const reasons = [];

    // 1. Name & description quality based on isolated component name
    const evaluatedName = cleanName || rawName;
    if (evaluatedName.length > 20) {
      score += 15;
    } else if (evaluatedName.length > 10) {
      score += 10;
    } else {
      score += 5;
    }

    if (evaluatedName.length < 15) {
      reasons.push('short_or_generic_name');
    }

    // 2. Functional component vs generic fastener (word-boundary matched, compatibility prose isolated)
    const isGenericHardware = GENERIC_HARDWARE_REGEX.test(evaluatedName) || GENERIC_HARDWARE_REGEX.test(rawName);
    const isFunctional = !isGenericHardware && FUNCTIONAL_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(evaluatedName));

    if (isFunctional) {
      score += 20;
    }

    if (isGenericHardware) {
      score -= 25;
      reasons.push('generic_hardware');
    }

    // 3. Fitment depth & model breadth
    const modelCount = part.model_count || 0;
    const fitmentCount = part.fitment_count || 0;
    const sectionCount = part.section_count || 0;

    score += Math.min(30, modelCount * 2);
    score += Math.min(15, fitmentCount);
    score += Math.min(15, sectionCount * 5);

    if (part.has_config) score += 10;
    if (part.has_pos) score += 5;

    if (modelCount === 1) {
      reasons.push('single_model_only');
    }
    if (!part.has_config) {
      reasons.push('lacks_configuration_context');
    }
    if (fitmentCount < 3) {
      reasons.push('insufficient_fitment_depth');
    }

    // 4. Determine Readiness Tier (generic hardware excluded from STRONG_CANDIDATE)
    let tier = 'NOT_READY';
    if (!isGenericHardware && score >= 60 && modelCount >= 2 && sectionCount >= 1 && part.has_pos) {
      tier = 'STRONG_CANDIDATE';
    } else if (score >= 35 && fitmentCount >= 2) {
      tier = 'CANDIDATE';
    } else {
      tier = 'NOT_READY';
    }

    const displayPartNo = part.part_number_display || part.part_number;
    const futurePreview = {
      title: `STIHL ${displayPartNo} — ${part.part_name || 'Onderdeel'} & Compatibiliteit | STIHLDecoder`,
      description: `Bekijk op welke STIHL modellen onderdeel ${displayPartNo} voorkomt, inclusief bekende configuraties en montagecontext.`
    };

    return {
      part_number: part.part_number,
      part_number_display: displayPartNo,
      part_name: part.part_name,
      score,
      tier,
      is_functional: isFunctional,
      model_count: modelCount,
      fitment_count: fitmentCount,
      section_count: sectionCount,
      has_config: Boolean(part.has_config),
      has_pos: Boolean(part.has_pos),
      reasons,
      future_preview: futurePreview
    };
  }

  /**
   * Audits the entire canonical parts catalog from SQLite and generates aggregate readiness metrics.
   *
   * @param {string} [customDbPath]
   * @returns {Object} full audit result with metrics and top candidates
   */
  static runReadinessAudit(customDbPath = null) {
    const dbPath = customDbPath || path.join(rootDir, 'data', 'stihl_database.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at ${dbPath}`);
    }

    const db = new Database(dbPath, { readonly: true });
    const query = `
      SELECT 
        p.part_number, 
        p.part_number_display, 
        p.part_name, 
        COUNT(f.fitment_id) as fitment_count, 
        COUNT(DISTINCT f.canonical_model_id) as model_count, 
        COUNT(DISTINCT f.section_name) as section_count, 
        MAX(CASE WHEN f.diagram_position IS NOT NULL AND f.diagram_position != '' THEN 1 ELSE 0 END) as has_pos, 
        MAX(CASE WHEN f.configuration_key IS NOT NULL AND f.configuration_key != '' THEN 1 ELSE 0 END) as has_config 
      FROM parts p 
      JOIN model_part_fitments f ON p.part_number = f.part_number 
      GROUP BY p.part_number
    `;

    const rawParts = db.prepare(query).all();
    db.close();

    const counts = {
      TOTAL_PARTS: rawParts.length,
      STRONG_CANDIDATE: 0,
      CANDIDATE: 0,
      NOT_READY: 0
    };

    const reasonDistribution = {
      insufficient_fitment_depth: 0,
      single_model_only: 0,
      lacks_configuration_context: 0,
      generic_hardware: 0,
      short_or_generic_name: 0
    };

    const evaluated = [];

    for (const raw of rawParts) {
      const result = PartIndexReadinessClassifier.evaluatePart(raw);
      counts[result.tier]++;
      for (const r of result.reasons) {
        if (reasonDistribution[r] !== undefined) {
          reasonDistribution[r]++;
        }
      }
      evaluated.push(result);
    }

    evaluated.sort((a, b) => b.score - a.score || b.fitment_count - a.fitment_count);
    const top100 = evaluated.slice(0, 100);

    return {
      counts,
      reason_distribution: reasonDistribution,
      top_100_candidates: top100
    };
  }

  /**
   * Exports top 100 candidates to data/seo/part_indexation_candidates.json
   */
  static exportTopCandidates(auditResult, outputFilePath = null) {
    const targetPath = outputFilePath || path.join(rootDir, 'data', 'seo', 'part_indexation_candidates.json');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existingTimestamp = null;
    if (fs.existsSync(targetPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        if (
          existing.schema_version === '1.0.0' &&
          JSON.stringify(existing.counts) === JSON.stringify(auditResult.counts) &&
          JSON.stringify(existing.candidates) === JSON.stringify(auditResult.top_100_candidates)
        ) {
          existingTimestamp = existing.generated_at;
        }
      } catch (e) {
        // regenerate fresh on parse error
      }
    }

    const payload = {
      schema_version: '1.0.0',
      phase: 'Phase 54C',
      description: 'Top 100 candidate parts identified for potential future controlled indexation. ALL PARTS CURRENTLY REMAIN NOINDEX FOLLOW.',
      generated_at: existingTimestamp || new Date().toISOString(),
      counts: auditResult.counts,
      reason_distribution: auditResult.reason_distribution,
      candidates: auditResult.top_100_candidates
    };

    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
    return targetPath;
  }
}
