/**
 * Canonical Guide Source Resolver & Provenance Validator
 * Phase 49B-R2 — Source Resolver Authority & Claim Coverage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_PRIMARY_DOCUMENTS, SERIES_REFERENCE_DOCUMENTS } from './canonicalData.js';
import { getAllStructuredGuides } from './content/guides/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Curated registry of trusted technical standards (ISO, DIN, EN)
 */
export const TRUSTED_TECHNICAL_STANDARDS = {
  'ISO 11469': {
    standard_id: 'ISO 11469',
    title: 'Plastics — Generic identification and marking of plastics products',
    standards_body: 'ISO',
    scope: ['gegoten-onderdelen-en-behuizingscomponenten', 'all'],
    reference: 'ISO 11469:2016'
  },
  'DIN 16901': {
    standard_id: 'DIN 16901',
    title: 'Plastics mouldings; Tolerances and acceptance conditions for linear dimensions',
    standards_body: 'DIN',
    scope: ['gegoten-onderdelen-en-behuizingscomponenten', 'all'],
    reference: 'DIN 16901:1982-11'
  }
};

/**
 * Curated registry of official brand protection policies
 */
export const TRUSTED_BRAND_PROTECTION_REGISTRY = {
  'STIHL-BRAND-PROTECTION-GUIDELINE-V1': {
    brand_protection_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
    title: 'STIHL Brand Protection: Waarschuwing tegen merkvervalsing en namaakproducten',
    publisher: 'ANDREAS STIHL AG & Co. KG - Brand Protection',
    scope: ['alle-motorgereedschappen', 'all'],
    reference: 'https://corporate.stihl.com/en/brand-protection'
  }
};

/**
 * Controlled model aliases: exact, validated mappings between closely related designation variants.
 * Note: Substring matching is forbidden. MS 261 != MS 26. 026 != MS 260.
 */
export const CONTROLLED_MODEL_ALIASES = {
  'ms-261-c-m': ['ms-261'],
  'ms-261': ['ms-261-c-m'],
  'fs-100-rx': ['fs-100'],
  'fs-100-r': ['fs-100'],
  'ms-170-c': ['ms-170'],
  'ms-180-c': ['ms-180']
};

// Cache for public evidence facts
let cachedPublicEvidenceFacts = null;
function getPublicEvidenceFacts() {
  if (!cachedPublicEvidenceFacts) {
    const factsPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
    if (fs.existsSync(factsPath)) {
      cachedPublicEvidenceFacts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    } else {
      cachedPublicEvidenceFacts = { facts: [] };
    }
  }
  return cachedPublicEvidenceFacts;
}

// Facts publication index
let cachedFactsPubIndex = null;
function getFactsPublicationIndex() {
  if (!cachedFactsPubIndex) {
    cachedFactsPubIndex = new Map();
    const facts = getPublicEvidenceFacts();
    for (const f of (facts.facts || [])) {
      if (f.publication_id) {
        if (!cachedFactsPubIndex.has(f.publication_id)) {
          cachedFactsPubIndex.set(f.publication_id, {
            publication_id: f.publication_id,
            document_title: f.source_document_title || f.publication_id,
            source_class: f.source_class || 'OFFICIAL_INSTRUCTION_MANUAL',
            authenticity_status: f.public_evidence_status || 'AUTHENTICATED_OFFICIAL',
            models: new Set()
          });
        }
        if (f.model_slug) {
          cachedFactsPubIndex.get(f.publication_id).models.add(normalizeModelScopeIdentifier(f.model_slug));
          if (f.model_name) {
            cachedFactsPubIndex.get(f.publication_id).models.add(normalizeModelScopeIdentifier(f.model_name));
          }
        }
      }
    }
  }
  return cachedFactsPubIndex;
}

// Phase 36B official harvested source inventory
let cachedOfficialInventory = null;
function getOfficialSourceInventoryIndex() {
  if (!cachedOfficialInventory) {
    cachedOfficialInventory = new Map();
    const invPath = path.join(rootDir, 'data', 'phase36b_official_source_inventory.json');
    if (fs.existsSync(invPath)) {
      const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
      for (const src of (inv.sources || [])) {
        if (src.document_id) {
          const models = new Set();
          for (const m of (src.models_covered || [])) {
            models.add(normalizeModelScopeIdentifier(m));
          }
          const titleMatches = (src.title || '').match(/(MS\s*\d+[A-Z0-9\-\s]*|\b0\d{2}\b)/gi) || [];
          for (const tm of titleMatches) {
            models.add(normalizeModelScopeIdentifier(tm));
          }
          const pageCount = (src.document_id === '0458-207-8321-B') ? 48 : (src.pdf_spec_page ? src.pdf_spec_page + 4 : null);
          cachedOfficialInventory.set(src.document_id, {
            document_id: src.document_id,
            document_title: src.title,
            source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
            authenticity_status: 'AUTHENTICATED_OFFICIAL',
            page_count: pageCount,
            models
          });
        }
      }
    }
  }
  return cachedOfficialInventory;
}

// Audit reports index (Phase 35a and Phase 35b targeted manual audit)
let cachedAuditIndex = null;
function getAuditReportIndex() {
  if (!cachedAuditIndex) {
    cachedAuditIndex = new Map();
    const reportPath35b = path.join(rootDir, 'data', 'phase35b_document_authority_report.json');
    const reportPath35a = path.join(rootDir, 'data', 'phase35a_document_authority_report.json');

    function loadAudit(filePath) {
      if (fs.existsSync(filePath)) {
        const rep = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const item of (rep.targeted_manual_audit || [])) {
          if (item.document_id) {
            const models = new Set();
            for (const em of (item.EXPECTED_MODEL_CONTEXT || [])) {
              models.add(normalizeModelScopeIdentifier(em));
            }
            cachedAuditIndex.set(String(item.document_id), {
              document_id: String(item.document_id),
              document_title: item.document_title,
              authority_status: item.AUTHORITY_STATUS || 'INSUFFICIENT_EXTRACTED_TEXT',
              models
            });
          }
        }
      }
    }
    loadAudit(reportPath35a);
    loadAudit(reportPath35b);
  }
  return cachedAuditIndex;
}

// Document registry index (data/document_registry.json)
let cachedDocRegistry = null;
function getDocumentRegistryIndex() {
  if (!cachedDocRegistry) {
    cachedDocRegistry = new Map();
    const regPath = path.join(rootDir, 'data', 'document_registry.json');
    const scopePath = path.join(rootDir, 'data', 'document_model_scope_resolution.json');
    const auditIndex = getAuditReportIndex();

    const modelScopeMap = new Map();
    if (fs.existsSync(scopePath)) {
      const scopeData = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
      for (const d of (scopeData.documents || [])) {
        const models = new Set();
        for (const mr of (d.model_relations || [])) {
          if (mr.slug) models.add(normalizeModelScopeIdentifier(mr.slug));
          if (mr.model_name) models.add(normalizeModelScopeIdentifier(mr.model_name));
        }
        const titleText = d.document_title || d.title || '';
        const titleMatches = titleText.match(/(MS\s*\d+(?:\s*[A-Z\-]+)?|\b0\d{2}\b|FS\s*\d+|BR\s*\d+)/gi) || [];
        for (const tm of titleMatches) {
          models.add(normalizeModelScopeIdentifier(tm));
        }
        modelScopeMap.set(String(d.document_id), models);
      }
    }

    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const d of (reg.documents || [])) {
        const docIdStr = String(d.document_id);
        const models = modelScopeMap.get(docIdStr) || new Set();
        const titleText = d.document_title || d.title || '';
        const titleMatches = titleText.match(/(MS\s*\d+(?:\s*[A-Z\-]+)?|\b0\d{2}\b|FS\s*\d+|BR\s*\d+)/gi) || [];
        for (const tm of titleMatches) {
          models.add(normalizeModelScopeIdentifier(tm));
        }

        let authenticity_status = 'DOCUMENT_REGISTERED';
        if (auditIndex.has(docIdStr)) {
          authenticity_status = auditIndex.get(docIdStr).authority_status;
        } else if (d.authenticity_status && d.authenticity_status !== 'AUTHENTICATED_OFFICIAL') {
          authenticity_status = d.authenticity_status;
        }

        const entry = {
          canonical_document_id: docIdStr,
          publication_id: d.normalized_document_number || d.document_number || null,
          document_title: d.document_title || d.title,
          source_class: d.source_class || 'DOCUMENT_REGISTRY_MANUAL',
          authenticity_status,
          page_count: d.page_count || null,
          models
        };
        cachedDocRegistry.set(docIdStr, entry);
        if (d.normalized_document_number) {
          cachedDocRegistry.set(String(d.normalized_document_number), entry);
        }
      }
    }
  }
  return cachedDocRegistry;
}

/**
 * Normalizes a model identifier for exact scope comparison (e.g. 'MS 260' -> 'ms-260', '026' -> '026')
 */
export function normalizeModelScopeIdentifier(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  return modelId
    .trim()
    .toLowerCase()
    .replace(/^([a-z]+)(\d+)/, '$1-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolves a single guide source against canonical registries and audits.
 */
export function resolveGuideSource(sourceDeclaration, options = { throwOnError: true }) {
  const errors = [];
  if (!sourceDeclaration || typeof sourceDeclaration !== 'object') {
    if (options.throwOnError !== false) throw new Error('Source declaration must be an object');
    return { resolved: false, errors: ['Source declaration must be an object'], locatorStatus: 'LOCATOR_UNVERIFIED' };
  }

  const source_id = sourceDeclaration.source_id || sourceDeclaration.id;
  const publication_id = sourceDeclaration.publication_id || sourceDeclaration.publicationId;
  const canonical_document_id = sourceDeclaration.canonical_document_id || sourceDeclaration.canonicalDocumentId;
  const standard_id = sourceDeclaration.standard_id || sourceDeclaration.standardId;
  const brand_protection_id = sourceDeclaration.brand_protection_id || sourceDeclaration.brandProtectionId;
  const model_scope = sourceDeclaration.model_scope || sourceDeclaration.modelScope || [];
  const locator = sourceDeclaration.locator;
  const source_class = sourceDeclaration.source_class || sourceDeclaration.sourceClass;
  const source_label = sourceDeclaration.source_label || sourceDeclaration.sourceLabel;

  if (!source_id) {
    errors.push('Missing source_id in source declaration');
  }

  let canonicalMatch = null;
  let allowedModels = new Set();
  let isStandardOrBrandProtection = false;
  let knownPageCount = null;

  // 1. Technical Standard Resolution (ISO / DIN)
  const isTechnicalStandard = (source_class === 'TECHNICAL_STANDARD') || (standard_id && TRUSTED_TECHNICAL_STANDARDS[standard_id]);
  if (isTechnicalStandard) {
    const stdKey = standard_id || canonical_document_id || publication_id || source_label;
    if (stdKey && TRUSTED_TECHNICAL_STANDARDS[stdKey]) {
      const std = TRUSTED_TECHNICAL_STANDARDS[stdKey];
      isStandardOrBrandProtection = true;
      canonicalMatch = {
        canonical_document_id: std.standard_id,
        publication_id: std.standard_id,
        document_title: std.title,
        source_class: 'TECHNICAL_STANDARD',
        authenticity_status: 'AUTHENTICATED_STANDARD'
      };
      (std.scope || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
    } else {
      errors.push(`Technical standard "${stdKey || 'UNKNOWN'}" is not registered in trusted technical standards registry (ISO 11469, DIN 16901). Free-text standard labels are forbidden.`);
    }
  }

  // 2. Official Brand Protection Resolution
  const isBrandProtection = !canonicalMatch && ((source_class === 'OFFICIAL_BRAND_PROTECTION') || (brand_protection_id && TRUSTED_BRAND_PROTECTION_REGISTRY[brand_protection_id]));
  if (isBrandProtection && errors.length === 0) {
    const bpKey = brand_protection_id || canonical_document_id || publication_id || source_label;
    if (bpKey && TRUSTED_BRAND_PROTECTION_REGISTRY[bpKey]) {
      const bp = TRUSTED_BRAND_PROTECTION_REGISTRY[bpKey];
      isStandardOrBrandProtection = true;
      canonicalMatch = {
        canonical_document_id: bp.brand_protection_id,
        publication_id: bp.brand_protection_id,
        document_title: bp.title,
        source_class: 'OFFICIAL_BRAND_PROTECTION',
        authenticity_status: 'AUTHENTICATED_OFFICIAL'
      };
      (bp.scope || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
    } else {
      errors.push(`Brand protection source "${bpKey || 'UNKNOWN'}" is not registered in trusted brand protection registry. Free-text brand protection labels are forbidden.`);
    }
  }

  // 3. Instruction Manual / Service Manual / Registry Resolution
  const targetDocId = publication_id || canonical_document_id;
  if (!canonicalMatch && errors.length === 0) {
    if (!targetDocId) {
      errors.push(`Source ${source_id || 'UNKNOWN'} has no publication_id or canonical_document_id`);
    } else {
      // Reject free-text publication IDs
      const isDocumentIdFormat = /^(0458-[\w\-]+|\d{4}|\d{6,12})$/.test(targetDocId);
      if (!isDocumentIdFormat) {
        errors.push(`Invalid non-canonical publication ID format: "${targetDocId}". Free-text names are forbidden. It appears to be free-text description.`);
      }

      // Check Tier 1: Primary canonical documents
      if (OFFICIAL_PRIMARY_DOCUMENTS[targetDocId]) {
        const doc = OFFICIAL_PRIMARY_DOCUMENTS[targetDocId];
        canonicalMatch = {
          canonical_document_id: doc.documentNumber,
          publication_id: doc.documentNumber,
          document_title: doc.title,
          source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
          authenticity_status: 'AUTHENTICATED_OFFICIAL'
        };
        knownPageCount = doc.page_count || null;
        (doc.models || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
      }

      // Check Tier 2: Harvested official inventory (Phase 36B)
      if (!canonicalMatch) {
        const invIndex = getOfficialSourceInventoryIndex();
        if (invIndex.has(targetDocId)) {
          const invDoc = invIndex.get(targetDocId);
          canonicalMatch = {
            canonical_document_id: invDoc.document_id,
            publication_id: invDoc.document_id,
            document_title: invDoc.document_title,
            source_class: invDoc.source_class,
            authenticity_status: invDoc.authenticity_status
          };
          knownPageCount = invDoc.page_count || null;
          for (const m of invDoc.models) {
            allowedModels.add(m);
          }
        }
      }

      // Check Tier 3: Facts publication index
      if (!canonicalMatch) {
        const factsIndex = getFactsPublicationIndex();
        if (factsIndex.has(targetDocId)) {
          const factDoc = factsIndex.get(targetDocId);
          canonicalMatch = {
            canonical_document_id: factDoc.publication_id,
            publication_id: factDoc.publication_id,
            document_title: factDoc.document_title,
            source_class: factDoc.source_class,
            authenticity_status: factDoc.authenticity_status
          };
          for (const m of factDoc.models) {
            allowedModels.add(m);
          }
        }
      }

      // Check Tier 4: Series reference documents
      if (!canonicalMatch && SERIES_REFERENCE_DOCUMENTS[targetDocId]) {
        const doc = SERIES_REFERENCE_DOCUMENTS[targetDocId];
        canonicalMatch = {
          canonical_document_id: doc.seriesCode,
          publication_id: null,
          document_title: doc.title,
          source_class: doc.sourceType ? doc.sourceType.toUpperCase() : 'SERIES_REFERENCE_MANUAL',
          authenticity_status: 'PROBABLE_OFFICIAL'
        };
        (doc.models || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
      }

      // Check Tier 5: Targeted manual audit (Phase 35a/35b)
      if (!canonicalMatch) {
        const auditIndex = getAuditReportIndex();
        if (auditIndex.has(String(targetDocId))) {
          const auditDoc = auditIndex.get(String(targetDocId));
          canonicalMatch = {
            canonical_document_id: auditDoc.document_id,
            publication_id: null,
            document_title: auditDoc.document_title,
            source_class: 'OFFICIAL_SERVICE_MANUAL',
            authenticity_status: auditDoc.authority_status
          };
          for (const m of auditDoc.models) {
            allowedModels.add(m);
          }
        }
      }

      // Check Tier 6: Document registry index
      if (!canonicalMatch) {
        const docRegistry = getDocumentRegistryIndex();
        if (docRegistry.has(String(targetDocId))) {
          const regDoc = docRegistry.get(String(targetDocId));
          canonicalMatch = {
            canonical_document_id: regDoc.canonical_document_id,
            publication_id: regDoc.publication_id,
            document_title: regDoc.document_title,
            source_class: regDoc.source_class,
            authenticity_status: regDoc.authenticity_status
          };
          knownPageCount = regDoc.page_count || null;
          for (const m of regDoc.models) {
            allowedModels.add(m);
          }
        }
      }

      if (!canonicalMatch) {
        errors.push(`Document ID "${targetDocId}" does not exist in document registry or canonical primary documents.`);
      }
    }
  }

  // 4. Model Scope Validation (Exact Matching & Controlled Aliases, No Generic Widening)
  if (canonicalMatch) {
    const genericScopes = new Set([
      'carburateurmodellen-algemeen',
      'gegoten-onderdelen-en-behuizingscomponenten',
      'alle-motorgereedschappen',
      'universeel',
      'all'
    ]);

    const declaredModels = Array.isArray(model_scope) ? model_scope : [model_scope];
    const sourceHasGenericScope =
      isStandardOrBrandProtection ||
      allowedModels.has('all') ||
      allowedModels.has('universeel') ||
      allowedModels.has('alle-motorgereedschappen');

    for (const declared of declaredModels) {
      const norm = normalizeModelScopeIdentifier(declared);
      if (genericScopes.has(norm)) {
        if (!sourceHasGenericScope) {
          errors.push(
            `Scope mismatch: generic scope "${declared}" is not allowed for model-specific source "${targetDocId}" (${Array.from(allowedModels).join(', ')}). Exceeds canonical scope; scope widening is forbidden.`
          );
        }
        continue;
      }

      // Exact match check with controlled aliases
      let matchFound = false;
      for (const am of allowedModels) {
        const amNorm = normalizeModelScopeIdentifier(am);
        if (amNorm === norm) {
          matchFound = true;
          break;
        }
        // Controlled alias match
        if (CONTROLLED_MODEL_ALIASES[norm] && CONTROLLED_MODEL_ALIASES[norm].includes(amNorm)) {
          matchFound = true;
          break;
        }
        if (CONTROLLED_MODEL_ALIASES[amNorm] && CONTROLLED_MODEL_ALIASES[amNorm].includes(norm)) {
          matchFound = true;
          break;
        }
      }

      if (allowedModels.size > 0 && !matchFound) {
        errors.push(
          `Scope mismatch: declared model "${declared}" is not in the canonical scope of "${targetDocId}" (${Array.from(allowedModels).join(', ')}). Exceeds canonical scope; scope widening is forbidden.`
        );
      }
    }
  }

  // 5. Locator Validation & Page Bounds Check
  let locatorStatus = 'LOCATOR_UNVERIFIED';
  if (locator && typeof locator === 'object') {
    if (locator.page !== undefined && locator.page !== null) {
      if (typeof locator.page !== 'number' || locator.page <= 0) {
        errors.push(`Invalid locator page ${locator.page}. Page must be a positive integer.`);
      } else if (knownPageCount && locator.page > knownPageCount) {
        errors.push(`Locator page ${locator.page} exceeds known document page count (${knownPageCount}) for source "${targetDocId}".`);
      }
    }

    const hasValidPage = typeof locator.page === 'number' && locator.page > 0 && (!knownPageCount || locator.page <= knownPageCount);
    const hasHeadingOrSection = Boolean(locator.section || locator.heading);

    if (hasValidPage && hasHeadingOrSection) {
      locatorStatus = 'LOCATOR_VERIFIED';
    } else if (hasValidPage) {
      locatorStatus = 'LOCATOR_PAGE_ONLY';
    } else if (isStandardOrBrandProtection && hasHeadingOrSection) {
      locatorStatus = 'LOCATOR_VERIFIED';
    } else if (hasHeadingOrSection) {
      locatorStatus = 'LOCATOR_PAGE_ONLY';
    }
  } else {
    locatorStatus = 'LOCATOR_UNVERIFIED';
  }

  // 6. Authority & Publication Gate Enforcement
  if (canonicalMatch) {
    if (options.isPublishedGuide || options.enforceOfficialAuthority) {
      if (canonicalMatch.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && canonicalMatch.authenticity_status !== 'AUTHENTICATED_STANDARD') {
        errors.push(
          `Source "${targetDocId}" has authenticity status "${canonicalMatch.authenticity_status}". Published operational claims require AUTHENTICATED_OFFICIAL or AUTHENTICATED_STANDARD.`
        );
      }
      if (options.isOperationalProcedure && locatorStatus !== 'LOCATOR_VERIFIED') {
        errors.push(`Source "${targetDocId}" for operational procedure must have LOCATOR_VERIFIED (current: ${locatorStatus}).`);
      }
    }
  }

  if (errors.length > 0) {
    if (options.throwOnError !== false) {
      throw new Error(errors.join('; '));
    }
    return {
      resolved: false,
      errors,
      canonicalScope: [],
      canonical_scope: [],
      locatorStatus
    };
  }

  const canonicalScope = Array.from(allowedModels);
  return {
    resolved: true,
    canonicalScope,
    canonical_scope: canonicalScope,
    locatorStatus,
    canonicalSource: {
      source_id,
      canonical_document_id: canonicalMatch.canonical_document_id,
      publication_id: canonicalMatch.publication_id,
      document_title: canonicalMatch.document_title,
      source_class: canonicalMatch.source_class,
      authenticity_status: canonicalMatch.authenticity_status,
      model_scope: Array.isArray(model_scope) ? model_scope : [model_scope],
      canonicalScope,
      canonical_scope: canonicalScope,
      locatorStatus,
      locator
    },
    errors: []
  };
}

/**
 * Validates procedure steps provenance (each step must have at least 1 valid sourceRef,
 * and if the guide is published, each source must be LOCATOR_VERIFIED and AUTHENTICATED_OFFICIAL).
 */
export function validateProcedureStepsProvenance(guide, resolvedSources = new Map()) {
  const errors = [];
  const sourceIds = new Set((guide.sources || []).map(s => s.id || s.source_id));
  const isPublished = (guide.publicationStatus === 'PUBLISHED');

  function checkSteps(steps, context) {
    if (!steps || !Array.isArray(steps)) return;
    steps.forEach((step, idx) => {
      const stepLabel = `${context} step ${step.step || idx + 1}`;
      if (!step.sourceRefs || !Array.isArray(step.sourceRefs) || step.sourceRefs.length === 0) {
        errors.push(`${stepLabel} has no sourceRefs.`);
      } else {
        for (const ref of step.sourceRefs) {
          if (!sourceIds.has(ref)) {
            errors.push(`${stepLabel} references unknown sourceRef "${ref}".`);
          } else if (isPublished) {
            const resolved = resolvedSources.get(ref);
            if (resolved) {
              if (resolved.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && resolved.authenticity_status !== 'AUTHENTICATED_STANDARD') {
                errors.push(`${stepLabel} references source "${ref}" which lacks AUTHENTICATED_OFFICIAL status (${resolved.authenticity_status}).`);
              }
              if (resolved.locatorStatus !== 'LOCATOR_VERIFIED') {
                errors.push(`${stepLabel} references source "${ref}" which is not LOCATOR_VERIFIED (status: ${resolved.locatorStatus}).`);
              }
            }
          }
        }
      }
    });
  }

  if (guide.startProcedures) {
    if (guide.startProcedures.documentedExamples) {
      for (const [key, ex] of Object.entries(guide.startProcedures.documentedExamples)) {
        checkSteps(ex.steps, `startProcedures.documentedExamples.${key}`);
      }
    }
  }

  if (guide.floodedEngineRecovery) {
    if (guide.floodedEngineRecovery.documentedExamples) {
      for (const [key, ex] of Object.entries(guide.floodedEngineRecovery.documentedExamples)) {
        checkSteps(ex.steps, `floodedEngineRecovery.documentedExamples.${key}`);
      }
    }
  }

  return errors;
}

/**
 * Validates all sources and procedure step sourceRefs in a structured guide.
 */
export function validateGuideSources(guide) {
  const errors = [];
  const resolvedSources = new Map();

  if (!guide || typeof guide !== 'object') {
    return { valid: false, errors: ['Guide must be an object'], resolvedSources };
  }

  const isPublished = (guide.publicationStatus === 'PUBLISHED');
  const sources = guide.sources || [];
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`Guide "${guide.slug}" declares zero sources.`);
  }

  for (const src of sources) {
    const res = resolveGuideSource(src, {
      throwOnError: false,
      isPublishedGuide: isPublished
    });
    if (!res.resolved) {
      errors.push(...res.errors);
    } else {
      resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      if (!isPublished && res.canonicalSource.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && res.canonicalSource.authenticity_status !== 'AUTHENTICATED_STANDARD') {
        errors.push(`Source "${src.publication_id || src.canonical_document_id || src.id}" has non-promotable authenticity status "${res.canonicalSource.authenticity_status}". Requires official authentication before guide can be published.`);
      }
    }
  }

  const stepErrors = validateProcedureStepsProvenance(guide, resolvedSources);
  errors.push(...stepErrors);

  return {
    valid: errors.length === 0,
    errors,
    resolvedSources
  };
}

/**
 * Validates all registered guides in the repository.
 * Publication-aware:
 * - PUBLISHED guides: all gates are hard. Any failure breaks production validation.
 * - READY_FOR_REVIEW guides: issues are registered in reviewBlockers and do not fail production validation.
 */
export function validateAllGuides() {
  const guides = getAllStructuredGuides();
  const publishedErrors = [];
  const reviewBlockers = [];
  let totalSources = 0;
  let authenticatedOfficial = 0;
  let probableOfficial = 0;
  let technicalStandards = 0;
  let brandProtection = 0;
  let registeredOnly = 0;

  for (const guide of guides) {
    const isPublished = (guide.publicationStatus === 'PUBLISHED');
    const res = validateGuideSources(guide);
    totalSources += (guide.sources || []).length;

    for (const src of (guide.sources || [])) {
      const resolved = res.resolvedSources.get(src.id || src.source_id);
      if (resolved) {
        if (resolved.authenticity_status === 'AUTHENTICATED_OFFICIAL') {
          if (resolved.source_class === 'OFFICIAL_BRAND_PROTECTION') {
            brandProtection++;
          } else {
            authenticatedOfficial++;
          }
        } else if (resolved.authenticity_status === 'AUTHENTICATED_STANDARD') {
          technicalStandards++;
        } else if (resolved.authenticity_status === 'PROBABLE_OFFICIAL' || resolved.authenticity_status === 'SERIES_AUTHENTICATED') {
          probableOfficial++;
        } else {
          registeredOnly++;
        }
      }
    }

    if (!res.valid) {
      if (isPublished) {
        publishedErrors.push(...res.errors.map(e => `[${guide.slug}] ${e}`));
      } else {
        res.errors.forEach(e => {
          reviewBlockers.push({ slug: guide.slug, error: e });
        });
      }
    }
  }

  const validForProduction = publishedErrors.length === 0;

  return {
    valid: validForProduction,
    validForProduction,
    publishedErrors,
    reviewBlockers,
    totalSources,
    sourceMetrics: {
      totalSources,
      authenticatedOfficial,
      probableOfficial,
      technicalStandards,
      brandProtection,
      registeredOnly
    },
    errors: publishedErrors
  };
}
