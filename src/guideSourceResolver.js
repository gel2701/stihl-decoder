/**
 * Canonical Guide Source Resolver & Provenance Validator
 * Phase 49B-R2 — Source Resolver Authority & Claim Coverage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_PRIMARY_DOCUMENTS, SERIES_REFERENCE_DOCUMENTS } from './canonicalData.js';
import { getAllStructuredGuides } from './content/guides/index.js';
import { getGuidePublicationStatus, isGuidePublished } from './publicationRules.js';

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
          // page_count must come from an authoritative source (explicit field in the inventory entry).
          // pdf_spec_page identifies where specifications were found, NOT the final page of the document.
          // Using pdf_spec_page + 4 as a page-count ceiling is incorrect and would reject legitimate locators.
          // If no authoritative page_count is present, use null (no upper bound enforced by this tier).
          const pageCount = (src.page_count != null) ? Number(src.page_count) : null;
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
  const rawScope = sourceDeclaration.model_scope !== undefined ? sourceDeclaration.model_scope : sourceDeclaration.modelScope;
  const model_scope = Array.isArray(rawScope) ? rawScope : (rawScope !== undefined && rawScope !== null ? [rawScope] : []);
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
          publication_id: doc.seriesCode,
          document_title: doc.title,
          source_class: 'OFFICIAL_SERVICE_MANUAL',
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

    const sourceHasGenericScope =
      isStandardOrBrandProtection ||
      allowedModels.has('all') ||
      allowedModels.has('universeel') ||
      allowedModels.has('alle-motorgereedschappen');

    if (!sourceHasGenericScope) {
      if (rawScope === undefined || rawScope === null) {
        errors.push('Model-specific source declaration requires an explicit non-empty model_scope.');
      } else if (Array.isArray(rawScope)) {
        if (rawScope.length === 0) {
          errors.push('Model-specific source declaration requires an explicit non-empty model_scope.');
        } else if (rawScope.some(m => !m || typeof m !== 'string' || !m.trim())) {
          errors.push('Model-specific source declaration requires an explicit non-empty model_scope with non-empty string values.');
        }
      } else if (typeof rawScope !== 'string' || !rawScope.trim()) {
        errors.push('Model-specific source declaration requires an explicit non-empty model_scope.');
      }
    }

    const declaredModels = Array.isArray(rawScope)
      ? rawScope
      : (rawScope && typeof rawScope === 'string' && rawScope.trim() ? [rawScope] : []);

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
  // Page must be a true positive integer — no floats (38.5), no strings ("38"), no NaN, no Infinity.
  let locatorStatus = 'LOCATOR_UNVERIFIED';
  if (locator && typeof locator === 'object') {
    if (locator.page !== undefined && locator.page !== null) {
      if (!Number.isInteger(locator.page) || locator.page <= 0) {
        errors.push(`Invalid locator page ${locator.page}. Page must be a positive integer (no fractions, no strings).`);
      } else if (knownPageCount && locator.page > knownPageCount) {
        errors.push(`Locator page ${locator.page} exceeds known document page count (${knownPageCount}) for source "${targetDocId}".`);
      } else if (!knownPageCount && (options.isPublishedGuide || options.enforceOfficialAuthority) && !isStandardOrBrandProtection) {
        errors.push(`Source "${targetDocId}" lacks an authoritative document page count; unbounded page locators are forbidden on published guides.`);
      }
    }

    // Require locator.section and locator.heading to be non-empty trimmed strings if provided.
    // Whitespace-only, boolean (true/false), or non-string values are invalid and cannot grant LOCATOR_VERIFIED.
    const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

    if (locator.section !== undefined && locator.section !== null && !isNonEmptyString(locator.section)) {
      errors.push(`Invalid locator section label. Section must be a non-empty trimmed string.`);
    }
    if (locator.heading !== undefined && locator.heading !== null && !isNonEmptyString(locator.heading)) {
      errors.push(`Invalid locator heading label. Heading must be a non-empty trimmed string.`);
    }

    const hasValidPage = Number.isInteger(locator.page) && locator.page > 0 &&
      (!knownPageCount ? !(options.isPublishedGuide || options.enforceOfficialAuthority) : locator.page <= knownPageCount);
    const hasMeaningfulText = isNonEmptyString(locator.section) || isNonEmptyString(locator.heading);

    if (hasValidPage && hasMeaningfulText) {
      locatorStatus = 'LOCATOR_VERIFIED';
    } else if (hasValidPage) {
      locatorStatus = 'LOCATOR_PAGE_ONLY';
    } else if (isStandardOrBrandProtection && hasMeaningfulText) {
      locatorStatus = 'LOCATOR_VERIFIED';
    } else if (hasMeaningfulText) {
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
 * Resolves the authoritative publication state of a guide.
 *
 * GUIDE_ROUTE_CONFIG (accessed via getGuidePublicationStatus) is the sole runtime publication authority.
 * Embedded guide.publicationStatus is declarative metadata only and must match the route status.
 *
 * Returns:
 * {
 *   routeStatus,       // Authority status from GUIDE_ROUTE_CONFIG ('PUBLISHED', 'READY_FOR_REVIEW', 'HOLD')
 *   declaredStatus,    // Embedded guide.publicationStatus
 *   isPublished,       // Boolean: true strictly iff routeStatus === 'PUBLISHED'
 *   statusMatches      // Boolean: true iff declaredStatus === routeStatus
 * }
 */
export function resolveGuidePublicationState(guide, options = {}) {
  const slug = guide?.slug || null;
  const declaredStatus = guide?.publicationStatus || null;
  const routeStatus = options.routeStatus || (options.isPublished !== undefined ? (options.isPublished ? 'PUBLISHED' : 'HOLD') : (slug ? getGuidePublicationStatus(slug) : 'HOLD'));
  const isPublished = (routeStatus === 'PUBLISHED');
  const statusMatches = Boolean(declaredStatus && routeStatus && declaredStatus === routeStatus);

  return {
    routeStatus,
    declaredStatus,
    isPublished,
    statusMatches
  };
}

/**
 * Validates procedure steps provenance (each step must have at least 1 valid sourceRef,
 * and if the guide is published, each source must be LOCATOR_VERIFIED and AUTHENTICATED_OFFICIAL).
 */
export function validateProcedureStepsProvenance(guide, resolvedSources = new Map(), options = {}) {
  const errors = [];
  const sourceIds = new Set((guide.sources || []).map(s => s.id || s.source_id));
  const pubState = resolveGuidePublicationState(guide, options);
  const isPublished = (options.isPublished !== undefined) ? options.isPublished : pubState.isPublished;

  // Populate resolvedSources if omitted
  if (resolvedSources.size === 0 && Array.isArray(guide.sources)) {
    const seenIds = new Set();
    for (const src of guide.sources) {
      const sId = src.source_id || src.id;
      if (sId && seenIds.has(sId)) {
        errors.push(`Duplicate source identifier "${sId}" declared in guide.sources. Each source declaration must have a unique identifier.`);
      }
      if (sId) seenIds.add(sId);
      const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: isPublished });
      if (res.resolved && res.canonicalSource && !resolvedSources.has(res.canonicalSource.source_id)) {
        resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      }
    }
  }

  function checkSteps(steps, context, opts = {}) {
    if (!steps || !Array.isArray(steps)) return;
    steps.forEach((step, idx) => {
      const stepLabel = `${context} step ${step.step || idx + 1}`;
      if (!step.sourceRefs || !Array.isArray(step.sourceRefs) || step.sourceRefs.length === 0) {
        errors.push(`${stepLabel} has no sourceRefs.`);
      } else {
        for (const ref of step.sourceRefs) {
          if (!sourceIds.has(ref)) {
            errors.push(`${stepLabel} references unknown sourceRef "${ref}".`);
          } else {
            const resolved = resolvedSources.get(ref);
            if (resolved) {
              if (isPublished) {
                if (resolved.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && resolved.authenticity_status !== 'AUTHENTICATED_STANDARD') {
                  errors.push(`${stepLabel} references source "${ref}" which lacks AUTHENTICATED_OFFICIAL status (${resolved.authenticity_status}).`);
                }
                if (resolved.locatorStatus !== 'LOCATOR_VERIFIED') {
                  errors.push(`${stepLabel} references source "${ref}" which is not LOCATOR_VERIFIED (status: ${resolved.locatorStatus}).`);
                }
              }

              // Claim-level provenance verification for flooded engine recovery
              if (opts.claimType === 'FLOODED_RECOVERY' && resolved.locator) {
                const heading = (resolved.locator.heading || '').toLowerCase();
                const isFloodedHeading = heading.includes('not start') || heading.includes('flooded') || heading.includes('verzopen') || heading.includes('troubleshooting');
                const isStartingHeadingOnly = heading.includes('starting the engine') && !isFloodedHeading;
                if (isStartingHeadingOnly) {
                  errors.push(`${stepLabel} references source "${ref}" which points to start procedure ("${resolved.locator.heading}", p. ${resolved.locator.page}) instead of flooded engine recovery.`);
                }
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
        const exRefs = ex.sourceRefs || (ex.steps && ex.steps[0] && ex.steps[0].sourceRefs);
        if (isPublished) {
          if (!exRefs || exRefs.length === 0) {
            errors.push(`startProcedures.documentedExamples.${key} has no sourceRefs.`);
          }
          if (!ex.modelLabel) {
            errors.push(`startProcedures.documentedExamples.${key} lacks a modelLabel.`);
          } else {
            const modelRefs = ex.modelLabelSourceRefs || ex.sourceRefs || exRefs;
            if (!modelRefs || modelRefs.length === 0) {
              errors.push(`startProcedures.documentedExamples.${key}.modelLabel has no sourceRefs.`);
            } else {
              const extractedModels = extractModelsFromLabel(ex.modelLabel);
              if (extractedModels.length === 0) {
                errors.push(`startProcedures.documentedExamples.${key}.modelLabel must specify at least one recognizable STIHL model designation.`);
              } else {
                for (const model of extractedModels) {
                  let isCovered = false;
                  for (const ref of modelRefs) {
                    const resolved = resolvedSources.get(ref);
                    if (resolved && isModelCoveredBySource(model, resolved)) {
                      isCovered = true;
                      break;
                    }
                  }
                  if (!isCovered) {
                    errors.push(
                      `startProcedures.documentedExamples.${key}.modelLabel assigns model "${model}" but none of the cited sources (${modelRefs.join(', ')}) cover this model in their canonical scope.`
                    );
                  }
                }
              }
            }
          }
          if (ex.coldStartIntro && !ex.sourceRefs && !ex.coldStartIntroSourceRefs) {
            errors.push(`startProcedures.documentedExamples.${key}.coldStartIntro has no sourceRefs.`);
          }
          if (ex.warmStartIntro && !ex.sourceRefs && !ex.warmStartIntroSourceRefs) {
            errors.push(`startProcedures.documentedExamples.${key}.warmStartIntro has no sourceRefs.`);
          }
        }
        checkSteps(ex.steps, `startProcedures.documentedExamples.${key}`, { claimType: 'START_PROCEDURE' });
      }
    }
    if (guide.startProcedures.coldStart) {
      if (isPublished && guide.startProcedures.coldStart.intro) {
        const introRefs = guide.startProcedures.coldStart.introSourceRefs || guide.startProcedures.coldStart.sourceRefs;
        if (!introRefs || introRefs.length === 0) {
          errors.push(`startProcedures.coldStart.intro has no sourceRefs.`);
        }
      }
      if (guide.startProcedures.coldStart.steps) {
        checkSteps(guide.startProcedures.coldStart.steps, 'startProcedures.coldStart', { claimType: 'START_PROCEDURE' });
      }
    }
    if (guide.startProcedures.warmStart) {
      if (isPublished && guide.startProcedures.warmStart.intro) {
        const introRefs = guide.startProcedures.warmStart.introSourceRefs || guide.startProcedures.warmStart.sourceRefs;
        if (!introRefs || introRefs.length === 0) {
          errors.push(`startProcedures.warmStart.intro has no sourceRefs.`);
        }
      }
      if (guide.startProcedures.warmStart.steps) {
        checkSteps(guide.startProcedures.warmStart.steps, 'startProcedures.warmStart', { claimType: 'START_PROCEDURE' });
      }
    }
  }

  if (guide.floodedEngineRecovery) {
    if (guide.floodedEngineRecovery.documentedExamples) {
      for (const [key, ex] of Object.entries(guide.floodedEngineRecovery.documentedExamples)) {
        const exRefs = ex.sourceRefs || (ex.steps && ex.steps[0] && ex.steps[0].sourceRefs);
        if (isPublished) {
          if (!exRefs || exRefs.length === 0) {
            errors.push(`floodedEngineRecovery.documentedExamples.${key} has no sourceRefs.`);
          }
          if (!ex.modelLabel) {
            errors.push(`floodedEngineRecovery.documentedExamples.${key} lacks a modelLabel.`);
          } else {
            const modelRefs = ex.modelLabelSourceRefs || ex.sourceRefs || exRefs;
            if (!modelRefs || modelRefs.length === 0) {
              errors.push(`floodedEngineRecovery.documentedExamples.${key}.modelLabel has no sourceRefs.`);
            } else {
              const extractedModels = extractModelsFromLabel(ex.modelLabel);
              if (extractedModels.length === 0) {
                errors.push(`floodedEngineRecovery.documentedExamples.${key}.modelLabel must specify at least one recognizable STIHL model designation.`);
              } else {
                for (const model of extractedModels) {
                  let isCovered = false;
                  for (const ref of modelRefs) {
                    const resolved = resolvedSources.get(ref);
                    if (resolved && isModelCoveredBySource(model, resolved)) {
                      isCovered = true;
                      break;
                    }
                  }
                  if (!isCovered) {
                    errors.push(
                      `floodedEngineRecovery.documentedExamples.${key}.modelLabel assigns model "${model}" but none of the cited sources (${modelRefs.join(', ')}) cover this model in their canonical scope.`
                    );
                  }
                }
              }
            }
          }
          if (ex.intro && !ex.sourceRefs && !ex.introSourceRefs) {
            errors.push(`floodedEngineRecovery.documentedExamples.${key}.intro has no sourceRefs.`);
          }
        }
        checkSteps(ex.steps, `floodedEngineRecovery.documentedExamples.${key}`, { claimType: 'FLOODED_RECOVERY' });
      }
    }
    if (guide.floodedEngineRecovery.steps) {
      checkSteps(guide.floodedEngineRecovery.steps, 'floodedEngineRecovery', { claimType: 'FLOODED_RECOVERY' });
    }
  }

  return errors;
}

/**
 * Validates safety warnings provenance.
 * For PUBLISHED guides:
 * - Every warning must have non-empty sourceRefs array.
 * - Every ref must exist in guide.sources.
 * - Every referenced source must be AUTHENTICATED_OFFICIAL or AUTHENTICATED_STANDARD.
 * - Every referenced source must be LOCATOR_VERIFIED.
 * - Claim-level check: Carburetor safety warnings must be linked to a locator covering carburetor adjustment / motor management,
 *   and must be rejected if linked solely to a starting procedure locator (e.g. "Starting the Engine").
 */
export function validateWarningProvenance(guide, resolvedSources = new Map(), options = {}) {
  const errors = [];
  if (!guide || typeof guide !== 'object') return errors;
  if (!guide.warnings || !Array.isArray(guide.warnings)) return errors;

  const sourceIds = new Set((guide.sources || []).map(s => s.id || s.source_id));
  const pubState = resolveGuidePublicationState(guide, options);
  const isPublished = pubState.isPublished;

  // Populate resolvedSources if omitted
  if (resolvedSources.size === 0 && Array.isArray(guide.sources)) {
    const seenIds = new Set();
    for (const src of guide.sources) {
      const sId = src.source_id || src.id;
      if (sId && seenIds.has(sId)) {
        errors.push(`Duplicate source identifier "${sId}" declared in guide.sources. Each source declaration must have a unique identifier.`);
      }
      if (sId) seenIds.add(sId);
      const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: isPublished });
      if (res.resolved && res.canonicalSource && !resolvedSources.has(res.canonicalSource.source_id)) {
        resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      }
    }
  }

  for (const warning of guide.warnings) {
    const warningTitle = warning.title || 'Untitled Warning';
    const warningLabel = `Warning "${warningTitle}"`;

    if (!warning.sourceRefs || !Array.isArray(warning.sourceRefs) || warning.sourceRefs.length === 0) {
      if (isPublished) {
        errors.push(`${warningLabel} has no sourceRefs.`);
      }
      continue;
    }

    const warningFullText = `${warning.title || ''} ${warning.text || ''}`.toLowerCase();
    const isCarburetorWarning = warningFullText.includes('carburateur') || warningFullText.includes('carburetor');

    let hasCarbSpecificSource = false;
    let onlyHasStartSource = true;

    for (const ref of warning.sourceRefs) {
      if (!sourceIds.has(ref)) {
        errors.push(`${warningLabel} references unknown sourceRef "${ref}".`);
      } else {
        const resolved = resolvedSources.get(ref);
        if (resolved) {
          if (isPublished) {
            if (resolved.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && resolved.authenticity_status !== 'AUTHENTICATED_STANDARD') {
              errors.push(`${warningLabel} references source "${ref}" which lacks AUTHENTICATED_OFFICIAL status (${resolved.authenticity_status}).`);
            }
            if (resolved.locatorStatus !== 'LOCATOR_VERIFIED') {
              errors.push(`${warningLabel} references source "${ref}" which is not LOCATOR_VERIFIED (status: ${resolved.locatorStatus}).`);
            }
          }

          if (isCarburetorWarning && resolved.locator) {
            const locText = `${resolved.locator.section || ''} ${resolved.locator.heading || ''}`.toLowerCase();
            const isCarbLocator = locText.includes('carburetor') || locText.includes('carburateur') || locText.includes('motor management') || locText.includes('afstellen');
            const isStartOnly = locText.includes('starting the engine') && !isCarbLocator;

            if (isCarbLocator) {
              hasCarbSpecificSource = true;
            }
            if (!isStartOnly) {
              onlyHasStartSource = false;
            }
          }
        }
      }
    }

    if (isCarburetorWarning && (!hasCarbSpecificSource || onlyHasStartSource)) {
      errors.push(`${warningLabel} references source(s) pointing to start procedure instead of carburetor adjustment or motor management.`);
    }
  }

  return errors;
}

/**
 * Inventories every operational claim that GuidePageTemplate can render.
 *
 * Returns an array of:
 *   { path: string, text: string, sourceRefs: string[]|undefined, claimClass: string }
 *
 * claimClass is derived from schema position (not self-declared by the author).
 *
 * Covered renderer paths (must mirror GuidePageTemplate.js exactly):
 *   - directAnswer.content
 *   - troubleshootingLevels[*].items[*]
 *   - startProcedures.genericPrinciple.text
 *   - floodedEngineRecovery.genericPrinciple.text
 *   - technicalInspections.*  (fuel.text, fuel.agingNotice/agingWarning,
 *                               sparkPlug.text, sparkPlug.colors[*].meaning, sparkPlug.gapNotice,
 *                               carburetorVsMtronic.text, carburetorVsMtronic.mtronicText)
 *   - troubleshootingMatrix[*]  (possibleCause, safeFirstCheck, nextStep)
 *   - whenToStopAndCallDealer[*]
 *   - faq[*].answer
 *
 * NOTE: procedure steps (startProcedures/floodedEngineRecovery) and warnings are validated
 * separately by validateProcedureStepsProvenance / validateWarningProvenance.
 */
export function collectRenderedOperationalClaims(guide) {
  const claims = [];

  function push(path, text, sourceRefs, claimClass) {
    claims.push({ path, text: String(text ?? ''), sourceRefs, claimClass });
  }

  // 1. directAnswer.content
  if (guide.directAnswer?.content) {
    push('directAnswer.content', guide.directAnswer.content,
      guide.directAnswer.sourceRefs, 'DIRECT_ANSWER');
  }

  // 2. troubleshootingLevels[*] — description, items[*]
  if (Array.isArray(guide.troubleshootingLevels)) {
    guide.troubleshootingLevels.forEach((lvl, li) => {
      if (lvl.description) {
        push(`troubleshootingLevels[${li}].description`, lvl.description,
          lvl.sourceRefs || lvl.descriptionSourceRefs, 'TROUBLESHOOTING_LEVEL_DESCRIPTION');
      }
      if (Array.isArray(lvl.items)) {
        lvl.items.forEach((item, ii) => {
          if (typeof item === 'string') {
            push(`troubleshootingLevels[${li}].items[${ii}]`, item, undefined, 'TROUBLESHOOTING_LEVEL_ITEM');
          } else if (item && typeof item === 'object') {
            push(`troubleshootingLevels[${li}].items[${ii}]`, item.text ?? '', item.sourceRefs, 'TROUBLESHOOTING_LEVEL_ITEM');
          }
        });
      }
    });
  }

  // 3. startProcedures (genericPrinciple.text, documentedExamples intros, coldStart/warmStart intros)
  if (guide.startProcedures) {
    if (guide.startProcedures.genericPrinciple?.text) {
      push('startProcedures.genericPrinciple.text', guide.startProcedures.genericPrinciple.text,
        guide.startProcedures.genericPrinciple.sourceRefs, 'GENERIC_PRINCIPLE');
    }
    if (guide.startProcedures.documentedExamples) {
      for (const [key, ex] of Object.entries(guide.startProcedures.documentedExamples)) {
        const exRefs = ex.sourceRefs || (ex.steps && ex.steps[0] && ex.steps[0].sourceRefs);
        if (ex.modelLabel) {
          push(`startProcedures.documentedExamples.${key}.modelLabel`, ex.modelLabel,
            ex.modelLabelSourceRefs || ex.sourceRefs || exRefs, 'PROCEDURE_MODEL_LABEL');
        }
        if (ex.coldStartIntro) {
          push(`startProcedures.documentedExamples.${key}.coldStartIntro`, ex.coldStartIntro,
            ex.coldStartIntroSourceRefs || ex.sourceRefs, 'PROCEDURE_INTRO');
        }
        if (ex.warmStartIntro) {
          push(`startProcedures.documentedExamples.${key}.warmStartIntro`, ex.warmStartIntro,
            ex.warmStartIntroSourceRefs || ex.sourceRefs, 'PROCEDURE_INTRO');
        }
      }
    }
    if (guide.startProcedures.coldStart?.intro) {
      const introRefs = guide.startProcedures.coldStart.introSourceRefs || guide.startProcedures.coldStart.sourceRefs;
      push('startProcedures.coldStart.intro', guide.startProcedures.coldStart.intro,
        introRefs, 'PROCEDURE_INTRO');
    }
    if (guide.startProcedures.warmStart?.intro) {
      const introRefs = guide.startProcedures.warmStart.introSourceRefs || guide.startProcedures.warmStart.sourceRefs;
      push('startProcedures.warmStart.intro', guide.startProcedures.warmStart.intro,
        introRefs, 'PROCEDURE_INTRO');
    }
  }

  // 4. floodedEngineRecovery (explanation, safetyNotice, genericPrinciple.text, documentedExamples intro & modelLabel)
  if (guide.floodedEngineRecovery) {
    if (guide.floodedEngineRecovery.explanation) {
      push('floodedEngineRecovery.explanation', guide.floodedEngineRecovery.explanation,
        guide.floodedEngineRecovery.explanationSourceRefs || guide.floodedEngineRecovery.sourceRefs, 'GENERIC_PRINCIPLE');
    }
    if (guide.floodedEngineRecovery.safetyNotice) {
      push('floodedEngineRecovery.safetyNotice', guide.floodedEngineRecovery.safetyNotice,
        guide.floodedEngineRecovery.safetyNoticeSourceRefs || guide.floodedEngineRecovery.sourceRefs, 'GENERIC_PRINCIPLE');
    }
    if (guide.floodedEngineRecovery.genericPrinciple?.text) {
      push('floodedEngineRecovery.genericPrinciple.text', guide.floodedEngineRecovery.genericPrinciple.text,
        guide.floodedEngineRecovery.genericPrinciple.sourceRefs, 'GENERIC_PRINCIPLE');
    }
    if (guide.floodedEngineRecovery.documentedExamples) {
      for (const [key, ex] of Object.entries(guide.floodedEngineRecovery.documentedExamples)) {
        const exRefs = ex.sourceRefs || (ex.steps && ex.steps[0] && ex.steps[0].sourceRefs);
        if (ex.modelLabel) {
          push(`floodedEngineRecovery.documentedExamples.${key}.modelLabel`, ex.modelLabel,
            ex.modelLabelSourceRefs || ex.sourceRefs || exRefs, 'PROCEDURE_MODEL_LABEL');
        }
        if (ex.intro) {
          push(`floodedEngineRecovery.documentedExamples.${key}.intro`, ex.intro,
            ex.introSourceRefs || ex.sourceRefs, 'PROCEDURE_INTRO');
        }
      }
    }
  }

  // 5. technicalInspections — all rendered technical/operational fields
  if (guide.technicalInspections) {
    const ti = guide.technicalInspections;
    if (ti.fuel) {
      if (ti.fuel.text) push('technicalInspections.fuel.text', ti.fuel.text, ti.fuel.sourceRefs, 'TECHNICAL_INSPECTION');
      const ageText = ti.fuel.agingNotice || ti.fuel.agingWarning;
      if (ageText) push('technicalInspections.fuel.agingNotice', ageText, ti.fuel.agingSourceRefs || ti.fuel.sourceRefs, 'TECHNICAL_INSPECTION');
    }
    if (ti.sparkPlug) {
      if (ti.sparkPlug.text) push('technicalInspections.sparkPlug.text', ti.sparkPlug.text, ti.sparkPlug.sourceRefs, 'TECHNICAL_INSPECTION');
      if (Array.isArray(ti.sparkPlug.colors)) {
        ti.sparkPlug.colors.forEach((c, ci) => {
          if (c.meaning) push(`technicalInspections.sparkPlug.colors[${ci}].meaning`, c.meaning, c.sourceRefs || ti.sparkPlug.sourceRefs, 'TECHNICAL_INSPECTION');
        });
      }
      if (ti.sparkPlug.gapNotice) push('technicalInspections.sparkPlug.gapNotice', ti.sparkPlug.gapNotice, ti.sparkPlug.sourceRefs, 'TECHNICAL_INSPECTION');
    }
    if (ti.carburetorVsMtronic) {
      if (ti.carburetorVsMtronic.text) push('technicalInspections.carburetorVsMtronic.text', ti.carburetorVsMtronic.text, ti.carburetorVsMtronic.sourceRefs, 'TECHNICAL_INSPECTION');
      if (ti.carburetorVsMtronic.mtronicText) push('technicalInspections.carburetorVsMtronic.mtronicText', ti.carburetorVsMtronic.mtronicText, ti.carburetorVsMtronic.sourceRefs, 'TECHNICAL_INSPECTION');
    }
  }

  // 6. troubleshootingMatrix[*] — possibleCause, safeFirstCheck, nextStep
  if (Array.isArray(guide.troubleshootingMatrix)) {
    guide.troubleshootingMatrix.forEach((row, ri) => {
      if (row.possibleCause) push(`troubleshootingMatrix[${ri}].possibleCause`, row.possibleCause, row.sourceRefs || row.possibleCauseRefs, 'MATRIX_DIAGNOSIS');
      if (row.safeFirstCheck) push(`troubleshootingMatrix[${ri}].safeFirstCheck`, row.safeFirstCheck, row.sourceRefs || row.safeFirstCheckRefs, 'MATRIX_ACTION');
      if (row.nextStep) push(`troubleshootingMatrix[${ri}].nextStep`, row.nextStep, row.sourceRefs || row.nextStepRefs, 'MATRIX_ACTION');
    });
  }

  // 7. whenToStopAndCallDealer[*]
  if (Array.isArray(guide.whenToStopAndCallDealer)) {
    guide.whenToStopAndCallDealer.forEach((item, wi) => {
      if (typeof item === 'string') {
        push(`whenToStopAndCallDealer[${wi}]`, item, undefined, 'DEALER_GUIDANCE');
      } else if (item && typeof item === 'object') {
        push(`whenToStopAndCallDealer[${wi}]`, item.text ?? '', item.sourceRefs, 'DEALER_GUIDANCE');
      }
    });
  }

  // 8. faq[*].answer
  if (Array.isArray(guide.faq)) {
    guide.faq.forEach((f, fi) => {
      if (f.answer) push(`faq[${fi}].answer`, f.answer, f.sourceRefs, 'FAQ_ANSWER');
    });
  }

  // 9. generationModelData[*] (M-Tronic reset guide)
  if (Array.isArray(guide.generationModelData)) {
    guide.generationModelData.forEach((gen, gi) => {
      if (Array.isArray(gen.models)) {
        gen.models.forEach((m, mi) => {
          push(`generationModelData[${gi}].models[${mi}]`, m, gen.sourceRefs, 'GENERATION_SPECIFICATION');
        });
      }
      if (gen.characteristics) push(`generationModelData[${gi}].characteristics`, gen.characteristics, gen.sourceRefs, 'GENERATION_SPECIFICATION');
      if (gen.procedureOverview) push(`generationModelData[${gi}].procedureOverview`, gen.procedureOverview, gen.sourceRefs, 'GENERATION_PROCEDURE');
    });
  }

  // 10. distinctionFramework (gietklok guide)
  if (guide.distinctionFramework) {
    const df = guide.distinctionFramework;
    if (df.partCastDateVsMachineAssembly && Array.isArray(df.partCastDateVsMachineAssembly.points)) {
      df.partCastDateVsMachineAssembly.points.forEach((pt, pi) => {
        if (pt.description) push(`distinctionFramework.partCastDateVsMachineAssembly.points[${pi}].description`, pt.description, pt.sourceRefs || df.sourceRefs, 'FRAMEWORK_DISTINCTION');
      });
    }
    if (df.mouldDateFormats) {
      if (df.mouldDateFormats.description) {
        push(`distinctionFramework.mouldDateFormats.description`, df.mouldDateFormats.description, df.sourceRefs, 'FRAMEWORK_DISTINCTION');
      }
      if (Array.isArray(df.mouldDateFormats.elements)) {
        df.mouldDateFormats.elements.forEach((el, ei) => {
          push(`distinctionFramework.mouldDateFormats.elements[${ei}]`, el, df.sourceRefs, 'FRAMEWORK_DISTINCTION');
        });
      }
    }
    if (df.replacedPartsNotice?.text) {
      push('distinctionFramework.replacedPartsNotice.text', df.replacedPartsNotice.text, df.replacedPartsNotice.sourceRefs || df.sourceRefs, 'FRAMEWORK_DISTINCTION');
    }
  }

  // 11. resultCategories[*] (namaak herkennen guide)
  if (Array.isArray(guide.resultCategories)) {
    guide.resultCategories.forEach((cat, ci) => {
      if (cat.description) push(`resultCategories[${ci}].description`, cat.description, cat.sourceRefs, 'CATEGORY_DIAGNOSIS');
    });
  }

  // 12. inspectionChecklist[*] (namaak herkennen guide)
  if (Array.isArray(guide.inspectionChecklist)) {
    guide.inspectionChecklist.forEach((chk, ci) => {
      if (chk.text) push(`inspectionChecklist[${ci}].text`, chk.text, chk.sourceRefs, 'INSPECTION_STEP');
    });
  }

  return claims;
}

/**
 * Validates provenance of all rendered operational claims collected by collectRenderedOperationalClaims.
 *
 * For PUBLISHED guides: every claim that is operational MUST have:
 *   - non-empty sourceRefs array
 *   - every ref must exist in guide.sources
 *   - every referenced source must resolve successfully
 *
 * Claim classes that are operational on a PUBLISHED guide:
 *   TROUBLESHOOTING_LEVEL_ITEM, TECHNICAL_INSPECTION, MATRIX_DIAGNOSIS, MATRIX_ACTION,
 *   DEALER_GUIDANCE, FAQ_ANSWER, DIRECT_ANSWER, GENERIC_PRINCIPLE,
 *   GENERATION_SPECIFICATION, GENERATION_PROCEDURE, FRAMEWORK_DISTINCTION,
 *   CATEGORY_DIAGNOSIS, INSPECTION_STEP
 *
 * Author CANNOT self-exempt a claim by setting any flag — the classification comes from schema position.
 */
export function validateOperationalClaimsProvenance(guide, resolvedSources = new Map(), pubState = {}) {
  const errors = [];
  const isPublished = pubState.isPublished ?? false;
  const sourceIds = new Set((guide.sources || []).map(s => s.id || s.source_id));

  // All claimClasses from collectRenderedOperationalClaims are considered operational.
  // No bypass path exists.
  const OPERATIONAL_CLAIM_CLASSES = new Set([
    'TROUBLESHOOTING_LEVEL_ITEM',
    'TROUBLESHOOTING_LEVEL_DESCRIPTION',
    'TECHNICAL_INSPECTION',
    'MATRIX_DIAGNOSIS',
    'MATRIX_ACTION',
    'DEALER_GUIDANCE',
    'FAQ_ANSWER',
    'DIRECT_ANSWER',
    'GENERIC_PRINCIPLE',
    'GENERATION_SPECIFICATION',
    'GENERATION_PROCEDURE',
    'FRAMEWORK_DISTINCTION',
    'CATEGORY_DIAGNOSIS',
    'INSPECTION_STEP',
    'SAFETY_WARNING',
    'PROCEDURE_INTRO',
    'PROCEDURE_MODEL_LABEL'
  ]);

  if (!isPublished) return errors; // Only enforce on published guides

  // Populate resolvedSources if omitted
  if (resolvedSources.size === 0 && Array.isArray(guide.sources)) {
    const seenIds = new Set();
    for (const src of guide.sources) {
      const sId = src.source_id || src.id;
      if (sId && seenIds.has(sId)) {
        errors.push(`Duplicate source identifier "${sId}" declared in guide.sources. Each source declaration must have a unique identifier.`);
      }
      if (sId) seenIds.add(sId);
      const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: isPublished });
      if (res.resolved && res.canonicalSource && !resolvedSources.has(res.canonicalSource.source_id)) {
        resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      }
    }
  }

  const claims = collectRenderedOperationalClaims(guide);

  for (const claim of claims) {
    if (!OPERATIONAL_CLAIM_CLASSES.has(claim.claimClass)) continue;

    const label = `Operational claim at "${claim.path}" (${claim.claimClass})`;

    if (!claim.sourceRefs || !Array.isArray(claim.sourceRefs) || claim.sourceRefs.length === 0) {
      errors.push(`${label} has no sourceRefs.`);
      continue;
    }

    const isFuelClaim = claim.path.includes('.fuel.') ||
      /\b(brandstof.*verouder|oude brandstof|brandstof.*ontmeng|brandstof.*opslag|brandstofkwaliteit|verouderde brandstof)\b/i.test(claim.text) ||
      /\b(brandstof.*verouder|oude brandstof)\b/i.test(claim.path);
    let hasFuelSpecificSource = false;
    let onlyHasStartSource = true;

    const isCrankcaseTestingClaim =
      /\b(druk-.*vacuüm|vacuüm.*druk|drukmeting|vacuümmeting|krukaskeerring|carter.*druk|carter.*vacuüm|valse lucht.*krukas|krukas.*pakking)\b/i.test(claim.text) ||
      /\b(druk-.*vacuüm|krukaskeerring)\b/i.test(claim.path);
    let hasCrankcaseSpecificSource = false;
    let onlyHasUnrelatedSourceForCrankcase = true;

    const isMTronicDiagnosticClaim =
      /\b(m-tronic.*diagnos|diagnosesysteem.*m-tronic|elektronische diagnose.*m-tronic|dealerdiagnose.*m-tronic|diagnosesysteem)\b/i.test(claim.text) ||
      /\b(m-tronic.*diagnos|diagnosesysteem)\b/i.test(claim.path);
    let hasMTronicDiagnosticSource = false;
    let onlyHasStartSourceForMTronic = true;

    const isMechanicalCompressionClaim =
      /\b(cilinder- en zuigerinspectie.*fabrieksvoorschrift|cilinder.*zuiger.*slijtage|compressiemeting van cilinder)\b/i.test(claim.text) ||
      /\b(cilinder.*zuiger.*inspectie)\b/i.test(claim.path);
    let hasMechanicalServiceSource = false;
    let onlyHasUnrelatedSourceForMechanical = true;

    for (const ref of claim.sourceRefs) {
      if (!sourceIds.has(ref)) {
        errors.push(`${label} references unknown sourceRef "${ref}".`);
      } else {
        const resolved = resolvedSources.get(ref);
        if (!resolved) {
          errors.push(`${label} references source "${ref}" which could not be resolved.`);
        } else {
          // For published guides: operational claims must be backed by authenticated sources
          // with verified locators — matching the enforcement level applied to warnings and steps.
          if (resolved.authenticity_status !== 'AUTHENTICATED_OFFICIAL' &&
              resolved.authenticity_status !== 'AUTHENTICATED_STANDARD') {
            errors.push(`${label} references source "${ref}" which lacks AUTHENTICATED_OFFICIAL status (${resolved.authenticity_status}).`);
          }
          if (resolved.locatorStatus !== 'LOCATOR_VERIFIED') {
            errors.push(`${label} references source "${ref}" which is not LOCATOR_VERIFIED (status: ${resolved.locatorStatus}).`);
          }

          if (isFuelClaim && resolved.locator) {
            const locText = `${resolved.locator.section || ''} ${resolved.locator.heading || ''}`.toLowerCase();
            const isFuelLocator = locText.includes('fuel') || locText.includes('brandstof') ||
                                  locText.includes('mixing') || locText.includes('mengsmering') ||
                                  locText.includes('storage') || locText.includes('opslag');
            const isStartOnly = locText.includes('starting the engine') && !isFuelLocator;

            if (isFuelLocator) {
              hasFuelSpecificSource = true;
            }
            if (!isStartOnly) {
              onlyHasStartSource = false;
            }
          }

          if (isCrankcaseTestingClaim && resolved.locator) {
            const locText = `${resolved.locator.section || ''} ${resolved.locator.heading || ''}`.toLowerCase();
            const isCrankcaseSpecificLocator =
              locText.includes('leak') || locText.includes('pressure') ||
              locText.includes('vacuum') || locText.includes('crankcase') ||
              locText.includes('carter') || locText.includes('dichtig') ||
              locText.includes('afpers') || locText.includes('keerring') ||
              locText.includes('abdrück');

            const isUnrelatedLocator =
              locText.includes('carburetor') || locText.includes('carburateur') ||
              locText.includes('starting') || locText.includes('starten') ||
              locText.includes('fuel') || locText.includes('brandstof');

            if (isCrankcaseSpecificLocator) {
              hasCrankcaseSpecificSource = true;
            }
            if (!isUnrelatedLocator || isCrankcaseSpecificLocator) {
              onlyHasUnrelatedSourceForCrankcase = false;
            }
          }

          if (isMTronicDiagnosticClaim && resolved.locator) {
            const locText = `${resolved.locator.section || ''} ${resolved.locator.heading || ''}`.toLowerCase();
            const isDiagnosticLocator =
              locText.includes('diagnos') || locText.includes('service') ||
              locText.includes('calibration') || locText.includes('kalibratie') ||
              locText.includes('troubleshooting') || locText.includes('fault') ||
              locText.includes('storing') || locText.includes('motormanagement');
            const isStartOnlyLocator =
              (locText.includes('starting the engine') || locText.includes('startprocedure') || locText.includes('motor starten')) &&
              !isDiagnosticLocator;

            if (isDiagnosticLocator) {
              hasMTronicDiagnosticSource = true;
            }
            if (!isStartOnlyLocator) {
              onlyHasStartSourceForMTronic = false;
            }
          }

          if (isMechanicalCompressionClaim && resolved.locator) {
            const locText = `${resolved.locator.section || ''} ${resolved.locator.heading || ''}`.toLowerCase();
            const isMechanicalLocator =
              locText.includes('cylinder') || locText.includes('cilinder') ||
              locText.includes('piston') || locText.includes('zuiger') ||
              locText.includes('compression') || locText.includes('compressie');

            const isUnrelatedLocator =
              (locText.includes('does not start') || locText.includes('carburetor') ||
               locText.includes('starting') || locText.includes('fuel')) &&
              !isMechanicalLocator;

            if (isMechanicalLocator) {
              hasMechanicalServiceSource = true;
            }
            if (!isUnrelatedLocator || isMechanicalLocator) {
              onlyHasUnrelatedSourceForMechanical = false;
            }
          }
        }
      }
    }

    if (isFuelClaim && (!hasFuelSpecificSource || onlyHasStartSource)) {
      errors.push(`${label} references source(s) pointing to start procedure instead of fuel mixing, storage, or fuel specifications.`);
    }

    if (isCrankcaseTestingClaim && (!hasCrankcaseSpecificSource || onlyHasUnrelatedSourceForCrankcase)) {
      errors.push(
        `${label} makes crankcase pressure/vacuum or seal testing claims but references source(s) without a crankcase-specific testing locator (requires a procedure locator covering crankcase pressure/vacuum testing or seal leakage diagnosis).`
      );
    }

    if (isMTronicDiagnosticClaim && (!hasMTronicDiagnosticSource || onlyHasStartSourceForMTronic)) {
      errors.push(
        `${label} makes M-Tronic electronic diagnosis or diagnostic system claims but references source(s) pointing to starting procedure instead of an M-Tronic diagnostic or service locator.`
      );
    }

    if (isMechanicalCompressionClaim && (!hasMechanicalServiceSource || onlyHasUnrelatedSourceForMechanical)) {
      errors.push(
        `${label} makes cylinder/piston or compression inspection procedure claims but references source(s) without a mechanical service locator covering cylinder, piston, or compression testing.`
      );
    }

    if (claim.path.includes('generationModelData') && claim.path.includes('.models[')) {
      let isCovered = false;
      for (const ref of claim.sourceRefs) {
        const resolved = resolvedSources.get(ref);
        if (resolved && isModelCoveredBySource(claim.text, resolved)) {
          isCovered = true;
          break;
        }
      }
      if (!isCovered) {
        errors.push(
          `${label} assigns model "${claim.text}" but none of the cited sources (${claim.sourceRefs.join(', ')}) cover this model in their canonical scope.`
        );
      }
    }

    if (claim.claimClass === 'PROCEDURE_MODEL_LABEL') {
      const extractedModels = extractModelsFromLabel(claim.text);
      if (extractedModels.length === 0) {
        errors.push(`${label} must specify at least one recognizable STIHL model designation.`);
      } else {
        for (const model of extractedModels) {
          let isCovered = false;
          for (const ref of claim.sourceRefs) {
            const resolved = resolvedSources.get(ref);
            if (resolved && isModelCoveredBySource(model, resolved)) {
              isCovered = true;
              break;
            }
          }
          if (!isCovered) {
            errors.push(
              `${label} assigns model "${model}" but none of the cited sources (${claim.sourceRefs.join(', ')}) cover this model in their canonical scope.`
            );
          }
        }
      }
    }
  }

  return errors;
}

export function extractModelsFromLabel(label) {
  if (!label || typeof label !== 'string') return [];
  const modelRegex = /\b(?:(?:MS|FS|BR|BG|TS|HT|HS|BT|FR|KM|MM|SH|SR|FSA|MSA|BGA|HSA|HLA|TSA|KMA|MSE|FSE|HSE|BGE)\s*\d+[a-z0-9]*(?:\s+(?:C-M|C-BE|C-B|C-E|C-Q|TC-M|T|R|RX|C|i)\b)*(?:-[a-z0-9]+)*|\b0\d{2}(?:\s+[A-Z])?\b)\b/gi;
  const matches = label.match(modelRegex) || [];
  return Array.from(new Set(matches.map(m => m.trim())));
}

export function isModelCoveredBySource(modelStr, resolvedSource) {
  if (!resolvedSource || !modelStr || typeof modelStr !== 'string') return false;
  const cleanModel = modelStr.trim();
  const targetNorm = normalizeModelScopeIdentifier(cleanModel);
  const scope = resolvedSource.canonical_scope || resolvedSource.canonicalScope || [];

  for (const s of scope) {
    const sNorm = normalizeModelScopeIdentifier(s);
    if (sNorm === targetNorm) return true;
    if (sNorm === 'all' || sNorm === 'universeel' || sNorm === 'alle-motorgereedschappen') return true;
    if (CONTROLLED_MODEL_ALIASES[targetNorm] && CONTROLLED_MODEL_ALIASES[targetNorm].includes(sNorm)) return true;
    if (CONTROLLED_MODEL_ALIASES[sNorm] && CONTROLLED_MODEL_ALIASES[sNorm].includes(targetNorm)) return true;
  }
  return false;
}

/**
 * Validates all sources and procedure step sourceRefs in a structured guide.
 */
export function validateGuideSources(guide, options = {}) {

  const errors = [];
  const resolvedSources = new Map();

  if (!guide || typeof guide !== 'object') {
    return { valid: false, errors: ['Guide must be an object'], resolvedSources };
  }

  const pubState = resolveGuidePublicationState(guide, options);
  if (!pubState.statusMatches) {
    errors.push(`Guide "${guide.slug || 'unknown'}" publication status mismatch: route=${pubState.routeStatus}, declared=${pubState.declaredStatus}`);
  }
  const isPublished = pubState.isPublished;

  const sources = guide.sources || [];
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`Guide "${guide.slug}" declares zero sources.`);
  }

  const seenIds = new Set();
  for (const src of sources) {
    const sId = src.source_id || src.id;
    if (sId && seenIds.has(sId)) {
      errors.push(`Duplicate source identifier "${sId}" declared in guide.sources. Each source declaration must have a unique identifier.`);
    }
    if (sId) seenIds.add(sId);
    const res = resolveGuideSource(src, {
      throwOnError: false,
      isPublishedGuide: isPublished
    });
    if (!res.resolved) {
      errors.push(...res.errors);
    } else {
      if (!resolvedSources.has(res.canonicalSource.source_id)) {
        resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      }
      if (!isPublished && res.canonicalSource.authenticity_status !== 'AUTHENTICATED_OFFICIAL' && res.canonicalSource.authenticity_status !== 'AUTHENTICATED_STANDARD') {
        errors.push(`Source "${src.publication_id || src.canonical_document_id || src.id}" has non-promotable authenticity status "${res.canonicalSource.authenticity_status}". Requires official authentication before guide can be published.`);
      }
    }
  }

  const stepErrors = validateProcedureStepsProvenance(guide, resolvedSources, options);
  errors.push(...stepErrors);

  const warningErrors = validateWarningProvenance(guide, resolvedSources, options);
  errors.push(...warningErrors);

  const operationalClaimErrors = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  errors.push(...operationalClaimErrors);

  return {
    valid: errors.length === 0,
    errors,
    resolvedSources,
    publicationState: pubState
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
    const pubState = resolveGuidePublicationState(guide);
    const isPublished = pubState.isPublished;
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
