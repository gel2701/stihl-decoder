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

describe('Phase 40B: Basic Classification Activation', () => {
  it('T1: Activation delta — 57 models activated', () => {
    expect(modelArray.length).toBe(57);
    expect(activationAudit.summary.classifications_activated).toBe(57);
    expect(activationAudit.summary.unmatched_candidates).toBe(0);
    expect(activationAudit.per_model_audit.filter(a => a.status === 'ACTIVATED').length).toBe(57);
  });

  it('T2: CORE5 completeness — 57/57 complete', () => {
    for (const model of modelArray) {
      expect(model.basic_classification).toBeDefined();
      for (const field of CORE5_FIELDS) {
        expect(model.basic_classification[field]).toBeDefined();
      }
    }
  });

  it('T3: Vocabulary — all values in controlled vocabulary', () => {
    for (const model of modelArray) {
      for (const field of CORE5_FIELDS) {
        const value = model.basic_classification[field];
        const vocabKey = field + 's';
        if (vocab[vocabKey]) {
          expect(vocab[vocabKey]).toContain(value);
        }
      }
      expect(vocab.engine_types).toContain(model.basic_classification.engine_type);
      expect(vocab.fuel_types).toContain(model.basic_classification.fuel_type);
    }
  });

  it('T4: Runtime parity — canonical = runtime', () => {
    expect(parity.total_parity_checks).toBe(57);
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
      'Handkettingzaag': 'Handkettingzaag',
      'Tophandle kettingzaag': 'Tophandle kettingzaag',
      'Handbladblazer': 'Handbladblazer',
      'Rugbladblazer': 'Rugbladblazer',
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

  it('T9: BG56 not-added — correctly absent', () => {
    expect(modelArray.find(m => m.slug === 'bg-56')).toBeUndefined();
    expect(candidates.find(c => c.model_slug === 'bg-56')).toBeUndefined();
  });
});
