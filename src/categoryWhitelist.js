/**
 * Category-Specific Specification Whitelist & Safety Enforcement for STIHLDecoder.nl
 * Phase 33 Category Field Leak Fix & Safety Rules
 */

export const CATEGORY_TYPES = {
  CHAINSAW: 'kettingzagen',
  BLOWER: 'bladblazers',
  BRUSHCUTTER: 'bosmaaiers',
  HEDGE_TRIMMER: 'heggenscharen',
  CUTOFF_SAW: 'doorslijpers',
  ACCU_CHAINSAW: 'accu-kettingzagen'
};

// Chainsaw-Only Specification Fields (STRICTLY BLOCKED for non-chainsaws)
export const CHAINSAW_ONLY_FIELDS = [
  'chain_pitch',
  'chain_gauge',
  'chain_gauge_mm',
  'bar_length',
  'guide_bar',
  'oil_tank',
  'chain_oil'
];

// Blower-Only / Blower-Relevant Fields
export const BLOWER_ONLY_FIELDS = [
  'blowing_force_n',
  'air_velocity_ms',
  'air_flow_m3h'
];

// Brushcutter-Relevant Fields
export const BRUSHCUTTER_ONLY_FIELDS = [
  'cutting_attachment',
  'cutting_diameter',
  'shaft_type',
  'gear_ratio'
];

// Cutoff-Saw-Relevant Fields
export const CUTOFF_SAW_ONLY_FIELDS = [
  'disc_diameter',
  'max_cutting_depth'
];

/**
 * Normalizes category string to standard category slug
 */
export function normalizeCategorySlug(categoryNameOrSlug = '', modelNameOrId = '') {
  const cat = (categoryNameOrSlug || '').toLowerCase().trim();
  const name = (modelNameOrId || '').toUpperCase().trim();

  if (cat.includes('kettingzaag') || cat.includes('chainsaw') || name.startsWith('MS')) {
    return CATEGORY_TYPES.CHAINSAW;
  }
  if (cat.includes('bladblazer') || cat.includes('blower') || name.startsWith('BR') || name.startsWith('BG') || name.startsWith('SH')) {
    return CATEGORY_TYPES.BLOWER;
  }
  if (cat.includes('bosmaaier') || cat.includes('trimmer') || cat.includes('brushcutter') || name.startsWith('FS') || name.startsWith('FR')) {
    return CATEGORY_TYPES.BRUSHCUTTER;
  }
  if (cat.includes('heggenschaar') || cat.includes('hedgetrimmer') || name.startsWith('HS') || name.startsWith('HLA')) {
    return CATEGORY_TYPES.HEDGE_TRIMMER;
  }
  if (cat.includes('doorslijper') || cat.includes('cutoff') || name.startsWith('TS')) {
    return CATEGORY_TYPES.CUTOFF_SAW;
  }

  return 'algemeen';
}

/**
 * Validates and sanitizes a model's specification object based on its category and prefix.
 * Removes non-applicable / leaked specification fields and logs anomalies.
 */
export function sanitizeModelSpecifications(specs = {}, categoryStr = '', modelName = '') {
  if (!specs || typeof specs !== 'object') return {};

  const cleanSpecs = { ...specs };
  const catSlug = normalizeCategorySlug(categoryStr, modelName);
  const nameUpper = (modelName || '').toUpperCase().trim();

  // Sanity Check: Model Prefix vs Category Conflict
  if (nameUpper.startsWith('BR') && catSlug !== CATEGORY_TYPES.BLOWER) {
    console.warn(`[CATEGORY_SPEC_CONFLICT] Model ${modelName} prefix BR conflicts with category ${categoryStr}`);
  }
  if (nameUpper.startsWith('FS') && catSlug !== CATEGORY_TYPES.BRUSHCUTTER) {
    console.warn(`[CATEGORY_SPEC_CONFLICT] Model ${modelName} prefix FS conflicts with category ${categoryStr}`);
  }
  if (nameUpper.startsWith('MS') && catSlug !== CATEGORY_TYPES.CHAINSAW && catSlug !== CATEGORY_TYPES.ACCU_CHAINSAW) {
    console.warn(`[CATEGORY_SPEC_CONFLICT] Model ${modelName} prefix MS conflicts with category ${categoryStr}`);
  }
  if (nameUpper.startsWith('TS') && catSlug !== CATEGORY_TYPES.CUTOFF_SAW) {
    console.warn(`[CATEGORY_SPEC_CONFLICT] Model ${modelName} prefix TS conflicts with category ${categoryStr}`);
  }

  // HARD SAFETY RULE: Block chainsaw-only fields for non-chainsaw categories
  if (catSlug !== CATEGORY_TYPES.CHAINSAW && catSlug !== CATEGORY_TYPES.ACCU_CHAINSAW) {
    CHAINSAW_ONLY_FIELDS.forEach(field => {
      if (cleanSpecs[field] !== undefined) {
        delete cleanSpecs[field];
      }
    });
  }

  // Block blower fields for non-blowers
  if (catSlug !== CATEGORY_TYPES.BLOWER) {
    BLOWER_ONLY_FIELDS.forEach(field => {
      delete cleanSpecs[field];
    });
  }

  // Block brushcutter fields for non-brushcutters
  if (catSlug !== CATEGORY_TYPES.BRUSHCUTTER) {
    BRUSHCUTTER_ONLY_FIELDS.forEach(field => {
      delete cleanSpecs[field];
    });
  }

  // Block cutoff saw fields for non-cutoff saws
  if (catSlug !== CATEGORY_TYPES.CUTOFF_SAW) {
    CUTOFF_SAW_ONLY_FIELDS.forEach(field => {
      delete cleanSpecs[field];
    });
  }

  return cleanSpecs;
}
