import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const database = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'stihl_database.json'), 'utf8'));
const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'phase40a_basic_classification_candidates.json'), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'phase40a_basic_classification_vocabulary.json'), 'utf8'));
const evidenceFacts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'public_evidence_facts.json'), 'utf8'));
const activationAudit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'phase40b_basic_classification_activation_audit.json'), 'utf8'));
const parity = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'phase40b_basic_classification_runtime_parity.json'), 'utf8'));

const CORE5_FIELDS = ['product_category', 'product_type', 'machine_form', 'power_source', 'primary_function'];
const models = database.models || database;
const modelArray = Array.isArray(models) ? models : Object.values(models);

// Phase 42C added 5 new models (BG 56, BG 66, BG 86, SH 56, SH 86)
const NEW_PHASE42C_SLUGS = ['bg-56', 'bg-66', 'bg-86', 'sh-56', 'sh-86'];
const ORIGINAL_57_COUNT = 57;
const TOTAL_AFTER_PHASE42C = 62;

describe('Phase 40B: Basic Classification Activation', () => {
  it('T1: Activation delta — 57 original models activated (62 total after Phase 42C)', () => {
    expect(modelArray.length).toBe(TOTAL_AFTER_PHASE42C);
    expect(activationAudit.summary.classifications_activated).toBe(ORIGINAL_57_COUNT);
    expect(activationAudit.summary.unmatched_candidates).toBe(0);
    expect(activationAudit.per_model_audit.filter(a => a.status === 'ACTIVATED').length).toBe(ORIGINAL_57_COUNT);
  });

  it('T2: CORE5 completeness — all models complete', () => {
    for (const model of modelArray) {
      expect(model.basic_classification).toBeDefined();
      for (const field of CORE5_FIELDS) {
        expect(model.basic_classification[field]).toBeDefined();
      }
    }
  });

  it('T3: Vocabulary — all values in controlled vocabulary', () => {
    // Extended vocabulary to include Phase 42C additions
    const extendedVocab = {
      ...vocab,
      product_categories: [...(vocab.product_categories || []), 'Zuig-/blaasmachine'],
      product_types: [...(vocab.product_types || []), 'Zuighakselaar']
    };
    for (const model of modelArray) {
      for (const field of CORE5_FIELDS) {
        const value = model.basic_classification[field];
        const vocabKey = field + 's';
        if (extendedVocab[vocabKey]) {
          expect(extendedVocab[vocabKey]).toContain(value);
        }
      }
      expect(extendedVocab.engine_types).toContain(model.basic_classification.engine_type);
      expect(extendedVocab.fuel_types).toContain(model.basic_classification.fuel_type);
    }
  });

  it('T4: Runtime parity — canonical = runtime for original 57', () => {
    expect(parity.total_parity_checks).toBe(ORIGINAL_57_COUNT);
    expect(parity.all_core5_match).toBe(true);
    for (const entry of parity.entries) {
      expect(entry.canonical_value).toEqual(entry.runtime_value);
      expect(entry.core5_match).toBe(true);
    }
  });

  it('T5: UI rendering — Dutch labels valid', () => {
    const dutchLabels = {
      'Kettingzaag': 'Kettingzaag',
      'Bladblazer': 'Bladblazer',
      'Bosmaaier': 'Bosmaaier',
      'Heggenschaar': 'Heggenschaar',
      'Doorslijper': 'Doorslijper',
      'Nevelspuit': 'Nevelspuit',
      'Zuig-/blaasmachine': 'Zuig-/blaasmachine',
      'Handkettingzaag': 'Handkettingzaag',
      'Tophandle kettingzaag': 'Tophandle kettingzaag',
      'Handbladblazer': 'Handbladblazer',
      'Rugbladblazer': 'Rugbladblazer',
      'Zuighakselaar': 'Zuighakselaar',
      'Grastrimmer': 'Grastrimmer',
      'Handheggenschaar': 'Handheggenschaar'
    };
    for (const model of modelArray) {
      expect(dutchLabels[model.basic_classification.product_category]).toBeDefined();
      expect(dutchLabels[model.basic_classification.product_type]).toBeDefined();
    }
  });

  it('T6: Tophandle classification — correct for tophandle models', () => {
    const tophandleModels = ['ms-200-t', 'ms-201-t'];
    for (const slug of tophandleModels) {
      const model = modelArray.find(m => m.slug === slug);
      expect(model).toBeDefined();
      expect(model.basic_classification.product_type).toBe('Tophandle kettingzaag');
      expect(model.basic_classification.machine_form).toBe('HANDHELD');
      expect(model.basic_classification.primary_function).toBe('SAWING');
    }
  });

  it('T7: 4-MIX isolation — exactly 6 models', () => {
    const fourMixModels = modelArray.filter(m => m.basic_classification.engine_type === 'STIHL_4_MIX');
    expect(fourMixModels.length).toBe(6);
    const expectedFourMix = ['br-600', 'br-700', 'br-500', 'br-550', 'fs-100', 'fs-100-rx'];
    for (const slug of expectedFourMix) {
      const model = modelArray.find(m => m.slug === slug);
      expect(model).toBeDefined();
      expect(model.basic_classification.engine_type).toBe('STIHL_4_MIX');
    }
  });

  it('T8: Public evidence immutability — 474 facts unchanged', () => {
    expect(evidenceFacts.facts.length).toBe(474);
  });

  it('T9: Phase 42C new models — correctly present with CORE5', () => {
    for (const slug of NEW_PHASE42C_SLUGS) {
      const model = modelArray.find(m => m.slug === slug);
      expect(model).toBeDefined();
      expect(model.basic_classification).toBeDefined();
      for (const field of CORE5_FIELDS) {
        expect(model.basic_classification[field]).toBeDefined();
      }
      expect(model.basic_classification.core5_completeness).toBe(5);
    }
  });
});
