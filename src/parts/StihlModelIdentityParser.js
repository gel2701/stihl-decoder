/**
 * STIHL Model Identity Parser (Phase 52B-R1)
 *
 * Deterministically extracts:
 *   - canonical_model (e.g. 'FS 100', '009', 'MS 261', 'FR 460', 'RM 248.1')
 *   - canonical_model_id (e.g. 'fs_100', '009', 'ms_261', 'fr_460', 'rm_248_1')
 *   - base_model_name (e.g. 'FS 100', '009', 'MS 261')
 *   - variant_key (e.g. 'r', 'c_m', 'tc_efm', 'av', 'c', 'base')
 *   - variant_name (e.g. 'FS 100 R', 'MS 261 C-M', 'FR 460 TC-EFM', '010 AV')
 *   - configuration_key (e.g. 'LOOP_HANDLE', 'ANTI_VIBRATION', 'QUIET_QUICKSTOP', 'BACKPACK')
 *   - configuration_name (e.g. 'Loop Handle', 'Anti-Vibration', 'Quiet QuickStop')
 *   - entity_type: 'BASE_MODEL' | 'MODEL_VARIANT' | 'MACHINE_CONFIGURATION' | 'ATTACHMENT'
 *   - source_model_name (original input title)
 */

export class StihlModelIdentityParser {
  /**
   * Cleans common category suffixes, brand prefixes, and spare parts boilerplate.
   */
  static cleanBoilerplateAndCategories(str) {
    if (!str || typeof str !== 'string') return '';
    let s = str.trim().replace(/^STIHL[\s_\-]+/i, '').trim();

    // Repeatedly strip trailing category names and spare parts boilerplates
    const pattern = /(\s+(Spare\s+Parts|Parts|Diagrams|Exploded\s+Views?|Gasoline\s+Chainsaws?|Petrol\s+Chainsaws?|Cordless\s+Chainsaws?|Electric\s+Chainsaws?|Chainsaws?|Brushcutters?|Trimmers?|Blowers?|Lawnmowers?|Lawn\s+Mowers?|Ride-On\s+Mowers?|Robotic\s+Mowers?|Hedge\s+Trimmers?|Cut\s+Off\s+Machines?|Cut-Off\s+Saws?|Cut\s+Off\s+Saws?|Pole\s+Pruners?|KombiEngines?|KombiTools?|MultiTools?|KombiEngine|KombiTool|MultiTool|Engines?|Cleaners?|Shredders?|Pressure\s+Washers?|Sweepers?|Tillers?|Earth\s+Augers?|Augers?|Drills?|Mistblowers?|Sprayers?|Garden\s+Pruners?|Long-Reach\s+Hedge\s+Trimmers?))+\s*$/i;

    while (pattern.test(s)) {
      s = s.replace(pattern, '').trim();
    }
    return s;
  }

  /**
   * Parses an input STIHL model title or raw string into canonical model components.
   */
  static parseModelIdentity(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') {
      return {
        canonical_model: '',
        canonical_model_id: '',
        base_model_name: '',
        variant_key: 'base',
        variant_name: '',
        entity_type: 'BASE_MODEL',
        configuration_key: null,
        configuration_name: null,
        source_model_name: ''
      };
    }

    const cleaned = this.cleanBoilerplateAndCategories(rawTitle);

    // 1. Kombi & Multi Tool Attachments (e.g. 'FCS-KM', 'FS-KM', 'HT-KM', 'BF-MM', 'KW-KM')
    const kombiMatch = cleaned.match(/^([A-Z]{2,3}-[KM]{2})\b/i);
    if (kombiMatch) {
      const baseModel = kombiMatch[1].toUpperCase();
      let rest = cleaned.slice(kombiMatch[0].length).trim();
      rest = rest.replace(/^(Edge\s+Trimmer|Edge|Cultivator|Pick\s+Tine|Broom|Sweeper|Scythe|PowerSweep|Bristle\s+Brush|Pole\s+Pruner|Hedge\s+Trimmer|Blower|Grass\s+Blade|Strimmer)\b/i, '').trim();

      const configKey = rest ? rest.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;
      return {
        canonical_model: baseModel,
        canonical_model_id: baseModel.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        base_model_name: baseModel,
        variant_key: 'base',
        variant_name: baseModel,
        entity_type: 'ATTACHMENT',
        configuration_key: configKey || null,
        configuration_name: rest || null,
        configuration: rest || null,
        source_model_name: rawTitle
      };
    }

    // 2. Historical 3-digit and 2-digit numeric models (e.g. '009', '010', '011', '012', '015', '020', '026', '044', '066', '08', '07')
    const legacyMatch = cleaned.match(/^(0\d{2}|0[789])\b/i);
    if (legacyMatch) {
      const baseNum = legacyMatch[1];
      let rest = cleaned.slice(legacyMatch[0].length).trim();
      const baseModel = baseNum;
      const canonicalModelId = baseNum.toLowerCase();

      let variantKey = 'base';
      let variantName = baseModel;

      // Check compound historical suffixes: AVSEQ, AVEQ, AVSE, AVTEQ, AVT, AVQ, AVE, AV, EQ, SEQ, LQ, Q, WVH, VW, W, SUPER, PRO, C, E, S, T, R
      const histVarMatch = rest.match(/^(AVSEQ|AVEQ|AVSE|AVTEQ|AVT|AVQ|AVE|AV|EQ|SEQ|LQ|Q|WVH|VW|W|SUPER|PRO|C|E|S|T|R)\b/i);
      if (histVarMatch) {
        const vStr = histVarMatch[1].toUpperCase();
        variantKey = vStr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        variantName = `${baseModel} ${vStr}`;
        rest = rest.slice(histVarMatch[0].length).trim();
      }

      const entityType = rest ? 'MACHINE_CONFIGURATION' : (variantKey !== 'base' ? 'MODEL_VARIANT' : 'BASE_MODEL');
      const configKey = rest ? rest.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;

      return {
        canonical_model: baseModel,
        canonical_model_id: canonicalModelId,
        base_model_name: baseModel,
        variant_key: variantKey,
        variant_name: variantName,
        entity_type: entityType,
        configuration_key: configKey || null,
        configuration_name: rest || null,
        configuration: rest || null,
        source_model_name: rawTitle
      };
    }

    // 3. Modern Prefix + Number + Sub-generation (e.g. 'MS 261', 'RM 248.1', 'HSA 140.0', 'FS 100', 'FR 460', 'TS 420', 'KM 131')
    const modernMatch = cleaned.match(/^([A-Z]{1,4})\s*(\d{1,4}(?:\.\d{1,2})?|[0-9]+i?)\b/i);
    if (modernMatch) {
      const prefix = modernMatch[1].toUpperCase();
      const number = modernMatch[2].toUpperCase();
      const baseModel = `${prefix} ${number}`;
      const canonicalModelId = `${prefix}_${number}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      let rest = cleaned.slice(modernMatch[0].length).trim();

      let variantKey = 'base';
      let variantName = baseModel;

      // Match explicit STIHL variant suffixes:
      // Multi-token: TC-EFM, TC-EM, TC-E, TC-M, C-EM VW, C-M VW, C-EM, C-M, C-BE, C-BQ, C-BM, C-B, C-E, C-Q, RC-E, RC-BE, RC, 2-MIX, 4-MIX, MAGNUM, FARM BOSS, WOOD BOSS, PRO, SUPER, INJECTION, R C-E, RX, R, T, K, V, W, Z, X, E, C, S, A, B, D, M
      const varMatch = rest.match(/^(TC-EFM|TC-EM|TC-E|TC-M|C-EM\s+VW|C-M\s+VW|C-EM\s+K|C-M\s+K|C-EM|C-M|C-BE|C-BQ|C-BM|C-B|C-E|C-Q|RC-E|RC-BE|RC|2-MIX|4-MIX|MAGNUM|FARM\s+BOSS|WOOD\s+BOSS|PRO|SUPER|INJECTION|R\s+C-E|RX|R|T|K|V|W|Z|X|E|C|S|A|B|D|M)\b/i);
      if (varMatch) {
        const vStr = varMatch[1].toUpperCase().replace(/\s+/g, ' ');
        variantKey = vStr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        variantName = `${baseModel} ${vStr}`;
        rest = rest.slice(varMatch[0].length).trim();
      }

      const entityType = rest ? 'MACHINE_CONFIGURATION' : (variantKey !== 'base' ? 'MODEL_VARIANT' : 'BASE_MODEL');
      const configKey = rest ? rest.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') : null;

      return {
        canonical_model: baseModel,
        canonical_model_id: canonicalModelId,
        base_model_name: baseModel,
        variant_key: variantKey,
        variant_name: variantName,
        entity_type: entityType,
        configuration_key: configKey || null,
        configuration_name: rest || null,
        configuration: rest || null,
        source_model_name: rawTitle
      };
    }

    // 4. Fallback for unclassified models
    const fallbackId = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return {
      canonical_model: cleaned,
      canonical_model_id: fallbackId,
      base_model_name: cleaned,
      variant_key: 'base',
      variant_name: cleaned,
      entity_type: 'BASE_MODEL',
      configuration_key: null,
      configuration_name: null,
      configuration: null,
      source_model_name: rawTitle
    };
  }
}
