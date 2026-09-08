/**
 * Safe Technical Preview Resolver for STIHL Decoder
 * FASE 36A.1 — Harden Safe Technical Preview Evidence Gates
 *
 * Enforces strict public evidence consensus gating and zero legacy fallback:
 * - Only active for PROBABLE_MODEL_SERIES.
 * - Technical fields allowed ONLY if explicit eligible public evidence exists
 *   for EVERY candidate model in the probable series with unanimous normalized values.
 * - Single-candidate trivial consensus strictly blocked for technical fields.
 * - Category fail-closed: NO fallback to 'Kettingzaag'.
 * - M-Tronic strictly gated: NO candidateModels.some, NO carb_h_setting fallback.
 * - Fuel family: NO unsourced "1:50" ratio claims.
 * - Full evidence trace on every technical field:
 *   key, value, source_type, confidence, candidate_count, evidence_fact_ids, source_document_ids, scope_status.
 * - technicalSpecs remains strictly isolated and empty {}.
 */

const FORBIDDEN_PREVIEW_TOKENS = [
  /M-Tronic V2\.1/i,
  /M-Tronic V3\.0/i,
  /V2\.1\s*\/\s*V3\.0/i,
  /300g\s+lichter/i,
  /lichter carter/i,
  /vliegwiel/i,
  /afgeschuinde cilinderkap/i,
  /\b[HL]\s*[:=]/i,
  /\bLA\s*[:=]/i,
  /vanaf\s+machinenr/i
];

export function hasForbiddenPreviewToken(val) {
  if (val === null || val === undefined) return false;
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  return FORBIDDEN_PREVIEW_TOKENS.some((re) => re.test(str));
}

export function normalizeCategoryLabel(rawCat) {
  if (!rawCat || typeof rawCat !== 'string') return null;
  const lower = rawCat.toLowerCase().trim();
  if (lower === 'unknown' || lower === 'stihl machine' || lower === 'niet vastgesteld') return null;
  if (lower.includes('kettingzaag') || lower.includes('chainsaw')) return 'Kettingzaag';
  if (lower.includes('bosmaaier') || lower.includes('trimmer') || lower.includes('clearing')) return 'Bosmaaier';
  if (lower.includes('bladblazer') || lower.includes('blower')) return 'Bladblazer';
  if (lower.includes('heggenschaar') || lower.includes('hedge')) return 'Heggenschaar';
  if (lower.includes('doorslijper') || lower.includes('cut-off')) return 'Doorslijper';
  return rawCat;
}

const ALLOWED_EVIDENCE_STATUSES = new Set([
  'CANONICAL_VERIFIED',
  'OFFICIAL_DOCUMENTED'
]);

const BLOCKED_EVIDENCE_STATUSES = new Set([
  'OFFICIAL_CONFLICTED',
  'UNKNOWN',
  'REJECTED',
  'REJECTED_UNVERIFIED',
  'UNVERIFIED'
]);

export const TECHNICAL_PREVIEW_GATES = [
  {
    key: 'displacement_cc',
    label: 'Cilinderinhoud (indicatief)',
    unit: 'cc',
    chainsawOnly: false
  },
  {
    key: 'power_kw',
    label: 'Vermogen (indicatief)',
    unit: 'kW',
    chainsawOnly: false
  },
  {
    key: 'spark_plug',
    label: 'Bougietype (reeks)',
    unit: '',
    chainsawOnly: false
  },
  {
    key: 'fuel_tank_l',
    label: 'Brandstoftank (indicatief)',
    unit: 'l',
    chainsawOnly: false
  },
  {
    key: 'weight_kg',
    label: 'Gewicht kaal (indicatief)',
    unit: 'kg',
    chainsawOnly: false
  },
  {
    key: 'chain_pitch',
    label: 'Kettingsteek (reeks)',
    unit: '',
    chainsawOnly: true
  },
  {
    key: 'chain_gauge_mm',
    label: 'Dikte aandrijfschakel',
    unit: 'mm',
    chainsawOnly: true
  }
];

export function buildSafeTechnicalPreview(result, database = {}, publicEvidenceStore = null) {
  if (!result || result.modelIdentityStatus !== 'PROBABLE_MODEL_SERIES') {
    return {
      available: false,
      mode: 'PROBABLE_SERIES_PREVIEW',
      title: 'Veilige technische indicatie',
      subtitle: 'Afgeleid van waarschijnlijke modelreeks — geen exact bevestigd model',
      disclaimer: 'Deze gegevens zijn veilig afgeleid van de waarschijnlijke modelreeks. Exacte technische uitvoering kan per variant verschillen.',
      badge: 'Reeksindicatie',
      fields: [],
      technicalFieldAudit: {}
    };
  }

  const models = Array.isArray(database.models) ? database.models : [];
  const rangeModelId = result.serialResolution?.rangeModelId;
  const probableModel = result.resolvedModel || result.probableModelSeries || result.model;

  // 1. Discover Candidate Models for the Probable Series
  let candidateModels = [];

  if (rangeModelId) {
    const directModel = models.find((m) => m.id === rangeModelId);
    if (directModel) {
      if (directModel.series_code) {
        candidateModels = models.filter((m) => String(m.series_code) === String(directModel.series_code));
      } else {
        candidateModels = [directModel];
      }
    }
  }

  if (candidateModels.length === 0 && result.probableSeries) {
    candidateModels = models.filter((m) => String(m.series_code) === String(result.probableSeries));
  }

  if (candidateModels.length === 0 && probableModel) {
    const cleanProbable = probableModel.toUpperCase();
    candidateModels = models.filter((m) => {
      const name = (m.model_name || '').toUpperCase();
      return cleanProbable.includes(name) || name.includes(cleanProbable);
    });
  }

  // Filter candidates: category compatibility if known
  const expectedMachineType = result.driveClassification?.machine_type;
  if (expectedMachineType && expectedMachineType !== 'UNKNOWN') {
    candidateModels = candidateModels.filter((m) => {
      const cat = (m.category || m.category_slug || '').toLowerCase();
      if (expectedMachineType === 'CHAINSAW') return cat.includes('ketting') || cat.includes('saw');
      if (expectedMachineType === 'TRIMMER' || expectedMachineType === 'BRUSHCUTTER') return cat.includes('bosmaaier') || cat.includes('trimmer');
      if (expectedMachineType === 'BLOWER') return cat.includes('blazer') || cat.includes('blower');
      if (expectedMachineType === 'HEDGE_TRIMMER') return cat.includes('heggenschaar') || cat.includes('hedge');
      if (expectedMachineType === 'CUT_OFF_MACHINE') return cat.includes('doorslijper') || cat.includes('cut-off');
      return true;
    });
  }

  const fields = [];
  const technicalFieldAudit = {};

  // 2. Machine Category — STRICT FAIL-CLOSED (NO FALLBACK TO Kettingzaag)
  let catLabel = null;
  if (result.category && result.category !== 'STIHL Machine' && result.category !== 'UNKNOWN' && result.category !== 'Niet vastgesteld') {
    catLabel = normalizeCategoryLabel(result.category);
  } else if (candidateModels.length > 0) {
    const candidateCats = candidateModels.map((m) => normalizeCategoryLabel(m.category)).filter(Boolean);
    const uniqueCats = [...new Set(candidateCats)];
    if (uniqueCats.length === 1) {
      catLabel = uniqueCats[0];
    }
  }

  if (catLabel) {
    fields.push({
      key: 'machine_category',
      label: 'Machinecategorie',
      value: catLabel,
      source_type: 'CATEGORY_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  }

  // 3. Drive Type & Engine Cycle
  const driveLabel = result.driveClassification?.display_label || result.fuel_type_label;
  if (driveLabel && driveLabel !== 'Niet vastgesteld' && driveLabel !== 'UNKNOWN') {
    fields.push({
      key: 'drive_type',
      label: 'Aandrijvingstype',
      value: driveLabel,
      source_type: 'SERIES_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  }

  const driveType = result.driveClassification?.drive_type;
  if (driveType === 'PETROL_2STROKE') {
    fields.push({
      key: 'engine_cycle_display',
      label: 'Motorprincipe',
      value: '2-takt',
      source_type: 'SERIES_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  } else if (driveType === 'PETROL_4MIX') {
    fields.push({
      key: 'engine_cycle_display',
      label: 'Motorprincipe',
      value: '4-MIX® (4-takt op mengsmering)',
      source_type: 'SERIES_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  }

  // 4. Fuel Family — NO AUTOMATIC "1:50" WITHOUT EXPLICIT EVIDENCE
  if (driveType === 'PETROL_2STROKE' || driveType === 'PETROL_4MIX') {
    fields.push({
      key: 'likely_fuel_family',
      label: 'Brandstof',
      value: 'Benzine / mengsmering',
      source_type: 'SERIES_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  }

  // 5. M-Tronic Gate — HARD EVIDENCE OR EVIDENCE-SAFE SERIES LEVEL
  // Rules:
  // - No candidateModels.some(...)
  // - No legacy carb_h_setting as evidence
  // - Allowed only if:
  //   A) result.driveClassification.engine_technology === 'M_TRONIC' AND evidence-safe series-level
  //      (which requires candidateModels.length >= 2 AND all candidate models are M-Tronic models)
  //   OR
  //   B) All candidate models have explicit eligible public evidence for M-Tronic
  const evidenceStore = publicEvidenceStore || database.public_evidence;
  const publicFacts = Array.isArray(evidenceStore?.facts)
    ? evidenceStore.facts
    : (Array.isArray(evidenceStore) ? evidenceStore : []);

  let mtronicPermitted = false;

  if (candidateModels.length >= 2) {
    // Check if ALL candidate models have eligible public evidence for M-Tronic
    const allHavePublicEvidence = candidateModels.every((m) => {
      return publicFacts.some((f) => {
        const matchesModel = f.model_slug === m.slug || f.model_name === m.model_name || f.model_key === m.slug;
        return matchesModel &&
          (f.field === 'has_mtronic' || f.field === 'engine_technology') &&
          ALLOWED_EVIDENCE_STATUSES.has(f.public_evidence_status) &&
          (f.value === true || f.value === 'M_TRONIC' || f.normalized_value === true || f.normalized_value === 'M_TRONIC');
      });
    });

    if (allHavePublicEvidence) {
      mtronicPermitted = true;
    } else if (result.driveClassification?.engine_technology === 'M_TRONIC') {
      // Evidence-safe series-level check: all candidate models must be explicitly C-M models
      const allAreCM = candidateModels.every((m) => {
        const n = String(m.model_name || '').toUpperCase();
        return n.includes('C-M') || n.includes('M-TRONIC');
      });
      if (allAreCM) {
        mtronicPermitted = true;
      }
    }
  }

  if (mtronicPermitted) {
    fields.push({
      key: 'has_mtronic',
      label: 'Elektronisch motormanagement',
      value: 'M-Tronic aanwezig (reeksindicatie)',
      source_type: 'SERIES_DERIVED',
      confidence: 'SUPPORTED_ESTIMATE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });
  }

  // 6. Technical Specs via Public Evidence Consensus Gate
  // Rule 3: Single-candidate trivial consensus strictly blocked.
  // Rule 1 & 2: Only eligible public evidence facts from publicEvidenceStore.facts.
  for (const gate of TECHNICAL_PREVIEW_GATES) {
    const fieldKey = gate.key;

    // Cross-category safety: chain specs for chainsaws only
    if (gate.chainsawOnly && catLabel !== 'Kettingzaag') {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_CROSS_CATEGORY',
        reason: 'Chainsaw specifications are blocked for non-chainsaw machine categories.'
      };
      continue;
    }

    // Single candidate check
    if (candidateModels.length < 2) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_SINGLE_CANDIDATE',
        reason: 'Trivial single-candidate consensus is blocked; probable series requires multi-candidate consensus or series-level evidence.'
      };
      continue;
    }

    // Evaluate public evidence for each candidate model
    let hasConflict = false;
    let missingCoverage = false;
    let scopeMismatch = false;
    const candidateFactMap = [];

    for (const model of candidateModels) {
      // Find all matching facts for this candidate model & field
      const matchingFacts = publicFacts.filter((f) => {
        const matchesModel = f.model_slug === model.slug ||
          f.model_name === model.model_name ||
          (model.id && f.model_slug === model.id) ||
          (model.model_name && f.model_name && f.model_name.toLowerCase() === model.model_name.toLowerCase());
        return matchesModel && f.field === fieldKey;
      });

      // Check for conflicts
      const conflictFact = matchingFacts.find((f) => BLOCKED_EVIDENCE_STATUSES.has(f.public_evidence_status));
      if (conflictFact) {
        hasConflict = true;
        break;
      }

      // Check for eligible public evidence fact
      const eligibleFact = matchingFacts.find((f) => {
        if (!ALLOWED_EVIDENCE_STATUSES.has(f.public_evidence_status)) return false;
        if (f.single_value_eligible === false) return false;
        if (f.value === null || f.value === undefined || f.value === '') return false;
        return true;
      });

      if (!eligibleFact) {
        missingCoverage = true;
      } else {
        candidateFactMap.push({
          model,
          fact: eligibleFact,
          normalizedValue: eligibleFact.normalized_value !== undefined ? eligibleFact.normalized_value : eligibleFact.value
        });
      }
    }

    if (hasConflict) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_CONFLICT',
        reason: 'Candidate model has conflicted or rejected public evidence fact.'
      };
      continue;
    }

    if (candidateFactMap.length === 0) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_NO_PUBLIC_EVIDENCE',
        reason: 'No candidate model in probable series has eligible public evidence for this field.'
      };
      continue;
    }

    if (missingCoverage || candidateFactMap.length !== candidateModels.length) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_INCOMPLETE_CANDIDATE_COVERAGE',
        reason: 'Not all candidate models have eligible public evidence facts.'
      };
      continue;
    }

    // Check value consensus across all candidate models
    const firstVal = candidateFactMap[0].normalizedValue;
    const allAgree = candidateFactMap.every((entry) => {
      const v = entry.normalizedValue;
      if (typeof v === 'number' && typeof firstVal === 'number') {
        return Math.abs(v - firstVal) < 0.001;
      }
      return String(v).toLowerCase().trim() === String(firstVal).toLowerCase().trim();
    });

    if (!allAgree) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_CONFLICT',
        reason: 'Candidate models have diverging public evidence values.'
      };
      continue;
    }

    if (hasForbiddenPreviewToken(firstVal)) {
      technicalFieldAudit[fieldKey] = {
        status: 'BLOCKED_FORBIDDEN_TOKEN',
        reason: 'Value contains forbidden preview tokens.'
      };
      continue;
    }

    // All gates passed! Assemble formatted preview field with complete evidence trace
    const factIds = candidateFactMap.map((e) => e.fact.fact_id || e.fact.id).filter(Boolean);
    const docIds = candidateFactMap.map((e) => e.fact.source_doc_id || e.fact.source_ref || e.fact.document_id).filter(Boolean);
    const unit = gate.unit || candidateFactMap[0].fact.unit || '';
    const formattedVal = unit ? `${firstVal} ${unit}` : String(firstVal);

    fields.push({
      key: fieldKey,
      label: gate.label,
      value: formattedVal,
      source_type: 'PUBLIC_EVIDENCE_CONSENSUS',
      confidence: 'SUPPORTED_ESTIMATE',
      candidate_count: candidateModels.length,
      evidence_fact_ids: factIds,
      source_document_ids: [...new Set(docIds)],
      scope_status: 'EXACT_COMPATIBLE',
      exact_model_confirmed: false,
      exact_value_confirmed: false
    });

    technicalFieldAudit[fieldKey] = {
      status: 'VISIBLE',
      value: formattedVal,
      candidate_count: candidateModels.length,
      evidence_fact_ids: factIds
    };
  }

  // Final safety filter on forbidden tokens
  const safeFields = fields.filter((f) => !hasForbiddenPreviewToken(f.value) && !hasForbiddenPreviewToken(f.label));

  return {
    available: safeFields.length > 0,
    mode: 'PROBABLE_SERIES_PREVIEW',
    title: 'Veilige technische indicatie',
    subtitle: 'Afgeleid van waarschijnlijke modelreeks — geen exact bevestigd model',
    disclaimer: 'Deze gegevens zijn veilig afgeleid van de waarschijnlijke modelreeks. Exacte technische uitvoering kan per variant verschillen.',
    badge: 'Reeksindicatie',
    fields: safeFields,
    candidateModelCount: candidateModels.length,
    probableSeries: result.probableSeries || (rangeModelId ? String(models.find((m) => m.id === rangeModelId)?.series_code || '') : ''),
    technicalFieldAudit
  };
}
