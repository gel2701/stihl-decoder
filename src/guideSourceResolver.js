/**
 * Canonical Guide Source Resolver & Provenance Validator
 * Phase 49B-R1 — Source-Bound Guide & Procedure Integrity
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_PRIMARY_DOCUMENTS, SERIES_REFERENCE_DOCUMENTS } from './canonicalData.js';
import { getAllStructuredGuides } from './content/guides/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load facts from public_evidence_facts.json lazily/cached
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

// Build index of official publications in public_evidence_facts
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

// Build index of documents from data/document_registry.json & data/document_model_scope_resolution.json
let cachedDocRegistry = null;
function getDocumentRegistryIndex() {
  if (!cachedDocRegistry) {
    cachedDocRegistry = new Map();
    const regPath = path.join(rootDir, 'data', 'document_registry.json');
    const scopePath = path.join(rootDir, 'data', 'document_model_scope_resolution.json');

    const modelScopeMap = new Map();
    if (fs.existsSync(scopePath)) {
      const scopeData = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
      for (const d of (scopeData.documents || [])) {
        const models = new Set();
        for (const mr of (d.model_relations || [])) {
          if (mr.slug) models.add(normalizeModelScopeIdentifier(mr.slug));
          if (mr.model_name) models.add(normalizeModelScopeIdentifier(mr.model_name));
        }
        // Also extract obvious models from title (e.g. MS 241, 028, 038)
        const titleMatches = (d.title || '').match(/(MS\s*\d+[A-Z0-9\-\s]*|\b0\d{2}\b)/gi) || [];
        for (const tm of titleMatches) {
          models.add(normalizeModelScopeIdentifier(tm));
        }
        modelScopeMap.set(String(d.document_id), models);
      }
    }

    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const d of (reg.documents || [])) {
        const models = modelScopeMap.get(String(d.document_id)) || new Set();
        const entry = {
          canonical_document_id: String(d.document_id),
          publication_id: d.normalized_document_number || d.document_number || null,
          document_title: d.document_title,
          source_class: d.source_class || 'DOCUMENT_REGISTRY_MANUAL',
          authenticity_status: 'REGISTRY_AUTHENTICATED',
          models
        };
        cachedDocRegistry.set(String(d.document_id), entry);
        if (d.normalized_document_number) {
          cachedDocRegistry.set(String(d.normalized_document_number), entry);
        }
      }
    }
  }
  return cachedDocRegistry;
}

/**
 * Normalizes a model identifier for scope comparison (e.g. 'MS 260' -> 'ms-260', '026' -> '026')
 */
export function normalizeModelScopeIdentifier(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  return modelId.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

/**
 * Resolves a single guide source against canonical registries.
 *
 * Requirements:
 * 1. publication_id or canonical_document_id must exist canonically in canonicalData.js,
 *    public_evidence_facts.json, or document_registry.json.
 * 2. publication_id must not be a free-text label (e.g. 'STIHL Veiligheidsrichtlijn').
 * 3. Declared model_scope must not exceed the canonical model scope (no widening).
 * 4. Locator (page, section, or heading) is required for operational procedure sources.
 */
export function resolveGuideSource(sourceDeclaration, options = { throwOnError: true }) {
  const errors = [];
  if (!sourceDeclaration || typeof sourceDeclaration !== 'object') {
    if (options.throwOnError !== false) throw new Error('Source declaration must be an object');
    return { resolved: false, errors: ['Source declaration must be an object'] };
  }

  const source_id = sourceDeclaration.source_id || sourceDeclaration.id;
  const publication_id = sourceDeclaration.publication_id || sourceDeclaration.publicationId;
  const canonical_document_id = sourceDeclaration.canonical_document_id || sourceDeclaration.canonicalDocumentId;
  const model_scope = sourceDeclaration.model_scope || sourceDeclaration.modelScope || [];
  const locator = sourceDeclaration.locator;

  if (!source_id) {
    errors.push('Missing source_id in source declaration');
  }

  const targetDocId = publication_id || canonical_document_id;
  if (!targetDocId) {
    // Check if this is an external technical standard or brand protection policy
    if (
      sourceDeclaration.sourceClass === 'TECHNICAL_STANDARD' ||
      sourceDeclaration.sourceClass === 'OFFICIAL_BRAND_PROTECTION' ||
      sourceDeclaration.sourceLabel
    ) {
      const canonicalScope = ['ALL'];
      return {
        resolved: true,
        canonicalScope,
        canonical_scope: canonicalScope,
        canonicalSource: {
          source_id,
          canonical_document_id: null,
          publication_id: null,
          source_label: sourceDeclaration.sourceLabel,
          document_title: sourceDeclaration.documentTitle || sourceDeclaration.sourceLabel,
          source_class: sourceDeclaration.sourceClass || 'TECHNICAL_STANDARD',
          authenticity_status: 'AUTHENTICATED_STANDARD',
          model_scope: Array.isArray(model_scope) ? model_scope : [model_scope],
          canonicalScope,
          canonical_scope: canonicalScope,
          locator
        },
        errors: []
      };
    }
    errors.push(`Source ${source_id || 'UNKNOWN'} has no publication_id or canonical_document_id`);
  }

  // Reject free-text publication IDs
  // Valid formats: '0458-...', 4-digit series ('1121'), or numeric document ID ('1068494421')
  const isDocumentIdFormat = /^(0458-[\w\-]+|\d{4}|\d{6,12})$/.test(targetDocId || '');
  if (targetDocId && !isDocumentIdFormat) {
    errors.push(`Invalid non-canonical publication ID format: "${targetDocId}". Free-text names are forbidden. It appears to be free-text description.`);
  }

  // Check 1: Primary documents
  let canonicalMatch = null;
  let allowedModels = new Set();

  if (targetDocId && OFFICIAL_PRIMARY_DOCUMENTS[targetDocId]) {
    const doc = OFFICIAL_PRIMARY_DOCUMENTS[targetDocId];
    canonicalMatch = {
      canonical_document_id: doc.documentNumber,
      publication_id: doc.documentNumber,
      document_title: doc.title,
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      authenticity_status: 'AUTHENTICATED_OFFICIAL'
    };
    (doc.models || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
  }

  // Check 2: Series reference documents
  if (!canonicalMatch && targetDocId && SERIES_REFERENCE_DOCUMENTS[targetDocId]) {
    const doc = SERIES_REFERENCE_DOCUMENTS[targetDocId];
    canonicalMatch = {
      canonical_document_id: doc.seriesCode,
      publication_id: null,
      document_title: doc.title,
      source_class: doc.sourceType ? doc.sourceType.toUpperCase() : 'SERIES_REFERENCE_MANUAL',
      authenticity_status: 'SERIES_AUTHENTICATED'
    };
    (doc.models || []).forEach(m => allowedModels.add(normalizeModelScopeIdentifier(m)));
  }

  // Check 3: Facts publication index
  if (!canonicalMatch && targetDocId) {
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
        allowedModels.add(normalizeModelScopeIdentifier(m));
      }
    }
  }

  // Check 4: Document registry index
  if (!canonicalMatch && targetDocId) {
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
      for (const m of regDoc.models) {
        allowedModels.add(normalizeModelScopeIdentifier(m));
      }
    }
  }

  if (!canonicalMatch) {
    errors.push(`Document ID "${targetDocId}" does not exist in document registry or canonical primary documents.`);
  } else {
    // Validate model scope: check specific model identifiers against allowedModels
    const genericScopes = new Set([
      'carburateurmodellen-algemeen',
      'gegoten-onderdelen-en-behuizingscomponenten',
      'alle-motorgereedschappen',
      'universeel',
      'all'
    ]);

    const declaredModels = Array.isArray(model_scope) ? model_scope : [model_scope];
    for (const declared of declaredModels) {
      const norm = normalizeModelScopeIdentifier(declared);
      if (genericScopes.has(norm)) {
        continue;
      }
      const normCompact = norm.replace(/-/g, '');
      const matchFound = Array.from(allowedModels).some(am => {
        const amNorm = normalizeModelScopeIdentifier(am);
        const amCompact = amNorm.replace(/-/g, '');
        return amNorm === norm || amCompact === normCompact || amCompact.includes(normCompact);
      });
      if (allowedModels.size > 0 && !matchFound) {
        errors.push(
          `Scope mismatch: declared model "${declared}" is not in the canonical scope of "${targetDocId}" (${Array.from(allowedModels).join(', ')}). Exceeds canonical scope; scope widening is forbidden.`
        );
      }
    }

    // Validate locator: operational procedure sources must have locator
    if (!locator || typeof locator !== 'object' || (!locator.page && !locator.section && !locator.heading)) {
      errors.push(`Source "${targetDocId}" lacks concrete document locator (page, section, or heading required).`);
    }
  }

  if (errors.length > 0) {
    if (options.throwOnError !== false) {
      throw new Error(errors.join('; '));
    }
    return { resolved: false, errors };
  }

  const canonicalScope = Array.from(allowedModels);
  return {
    resolved: true,
    canonicalScope,
    canonical_scope: canonicalScope,
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
      locator
    },
    errors: []
  };
}

/**
 * Validates procedure steps provenance (each step must have at least 1 valid sourceRef).
 */
export function validateProcedureStepsProvenance(guide) {
  const errors = [];
  const sourceIds = new Set((guide.sources || []).map(s => s.id || s.source_id));

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

  const sources = guide.sources || [];
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`Guide "${guide.slug}" declares zero sources.`);
  }

  for (const src of sources) {
    const res = resolveGuideSource(src, { throwOnError: false });
    if (!res.resolved) {
      errors.push(...res.errors);
    } else {
      resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
    }
  }

  const stepErrors = validateProcedureStepsProvenance(guide);
  errors.push(...stepErrors);

  return {
    valid: errors.length === 0,
    errors,
    resolvedSources
  };
}

/**
 * Validates all registered guides in the repository.
 */
export function validateAllGuides() {
  const guides = getAllStructuredGuides();
  const errors = [];
  let totalSources = 0;

  for (const guide of guides) {
    const res = validateGuideSources(guide);
    if (!res.valid) {
      errors.push(`Guide "${guide.slug}": ${res.errors.join(', ')}`);
    }
    totalSources += (guide.sources || []).length;
  }

  return {
    valid: errors.length === 0,
    errors,
    totalSources
  };
}
