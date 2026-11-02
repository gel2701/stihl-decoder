/**
 * IntelligentSearchEngine.js
 * STIHLDecoder.nl — Phase 4: Intelligent Search & Model Recognition
 *
 * Implements:
 * 1. Intent Detection: Model query vs 11-digit Part Number vs 9-digit Serial Number vs Ambiguous input.
 *    STRICT GUARDS:
 *    - An 11-digit part number is NEVER fuzzy matched to a machine model.
 *    - A 9-digit serial number is NEVER treated as a machine via text similarity.
 * 2. Smart Model Recognition:
 *    - Formatting/casing/hyphenation normalization (MS260, ms 260, Stihl MS-260 -> MS 260).
 *    - Known variant suffixes (MS261CM -> MS 261 C-M, MS 261 VW, etc.).
 *    - Classic series recognition without spec inheritance (026 -> STIHL 026 with predecessor context).
 * 3. Controlled Typo Recovery & Bounded Fuzzy Matching:
 *    - Specific character swap (O <-> 0: MS 26O -> MS 260, FS45O -> FS 450).
 *    - Spacing corrections (MS 261C M -> MS 261 C-M).
 *    - Bounded Levenshtein distance (e.g. MS 2500 -> suggests MS 250; NEVER invents models).
 * 4. Disambiguation & Autocomplete Suggestions:
 *    - Multi-match stem handling (MS 26 -> [MS 260, MS 261, MS 261 C-M, MS 261 VW]).
 *    - Ambiguous numeric handling (260 -> [MS 260, 026], 261 -> [MS 261, MS 261 C-M]).
 */

import { normalizeModelQuery, VARIANT_SUFFIXES } from '../modelNormalizer.js';
import { resolveModelRelationship, HISTORICAL_MODEL_RELATIONSHIPS } from '../modelRelationships.js';
import { buildSearchableIdentities } from '../globalModelSearch.js';
import { getDirectPartsForModel } from '../parts/DirectPartsEngine.js';

export const SEARCH_INTENTS = {
  MODEL: 'MODEL',
  PART_NUMBER: 'PART_NUMBER',
  SERIAL_NUMBER: 'SERIAL_NUMBER',
  AMBIGUOUS_NUMERIC: 'AMBIGUOUS_NUMERIC',
  AMBIGUOUS_PREFIX: 'AMBIGUOUS_PREFIX',
  UNKNOWN: 'UNKNOWN'
};

export const MATCH_TYPES = {
  EXACT: 'EXACT',
  NORMALIZED: 'NORMALIZED',
  VARIANT: 'VARIANT',
  HISTORICAL_ALIAS: 'HISTORICAL_ALIAS',
  PREFIX_MATCH: 'PREFIX_MATCH',
  TYPO_RECOVERY: 'TYPO_RECOVERY',
  SUGGESTION: 'SUGGESTION'
};

/**
 * Standard STIHL recognized auxiliary models that are verified in parts/anchors
 * but kept decoupled from the frozen 110-model canonical table.
 */
export const VERIFIED_AUXILIARY_MODELS = [
  {
    model_name: 'FS 450',
    slug: 'fs-450',
    category: 'Bosmaaier',
    category_slug: 'bosmaaiers',
    series_code: '4128',
    fuel_type_label: 'Benzine (2-takt)',
    power_source: 'GASOLINE',
    engine_type: 'COMBUSTION_2_STROKE',
    machine_form: 'HANDHELD',
    variant: null,
    explanation: 'Populaire zware professionele bosmaaier / vrijsnijder binnen serie 4128'
  },
  {
    model_name: 'MS 261 VW',
    slug: 'ms-261',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    series_code: '1141',
    fuel_type_label: 'Benzine (2-takt)',
    power_source: 'GASOLINE',
    engine_type: 'COMBUSTION_2_STROKE',
    machine_form: 'HANDHELD',
    variant: 'Winteruitvoering (VW)',
    explanation: 'Winteruitvoering van MS 261 met handvat- en carburateurverwarming (VW)'
  }
];

/**
 * Levenshtein Distance for bounded fuzzy matching
 */
export function levenshteinDistance(a = '', b = '') {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Normalizes input string for search with typo & format recovery
 */
export function sanitizeSearchQuery(query = '') {
  if (!query || typeof query !== 'string') return '';
  let s = query.trim();
  // Strip leading STIHL branding
  s = s.replace(/^STIHL[\s_\-]+/i, '').trim();
  // Standardize multiple spaces and hyphens
  s = s.replace(/\s+/g, ' ');
  return s;
}

/**
 * Corrects common character substitutions (e.g. letter O instead of digit 0)
 */
export function correctQueryTypos(query = '') {
  let s = sanitizeSearchQuery(query);
  if (!s) return { corrected: '', hasTypo: false, typoType: null };

  let hasTypo = false;
  let typoType = null;

  // Typo 1: Letter 'O' / 'o' instead of digit '0' at the end of model numbers
  // e.g. "MS 26O" -> "MS 260", "FS45O" -> "FS 450", "BR60O" -> "BR 600"
  if (/^([A-Z]{1,4}[-_\s]?\d+)[Oo](?=[-_\s]|$)/i.test(s)) {
    s = s.replace(/^([A-Z]{1,4}[-_\s]?\d+)[Oo](?=[-_\s]|$)/i, '$10');
    hasTypo = true;
    typoType = 'ZERO_O_SUBSTITUTION';
  }

  // Typo 2: Letter 'O' inside digit sequences like FS 4O0 -> FS 400
  if (/^([A-Z]{1,4}[-_\s]?\d+)[Oo](\d+)/i.test(s)) {
    s = s.replace(/^([A-Z]{1,4}[-_\s]?\d+)[Oo](\d+)/i, '$10$2');
    hasTypo = true;
    typoType = 'ZERO_O_SUBSTITUTION';
  }

  // Typo 3: Suffix spacing like "MS 261C M" -> "MS 261 C-M" or "261 C M"
  if (/(\d+)\s*C[\s_-]?M\b/i.test(s)) {
    const prev = s;
    s = s.replace(/(\d+)\s*C[\s_-]?M\b/i, '$1 C-M');
    if (s !== prev && !hasTypo) {
      hasTypo = true;
      typoType = 'SUFFIX_SPACING';
    }
  } else if (/(\d+)\s*C[\s_-]?E[\s_-]?M\b/i.test(s)) {
    const prev = s;
    s = s.replace(/(\d+)\s*C[\s_-]?E[\s_-]?M\b/i, '$1 C-EM');
    if (s !== prev && !hasTypo) {
      hasTypo = true;
      typoType = 'SUFFIX_SPACING';
    }
  } else if (/(\d+)\s*TC[\s_-]?M\b/i.test(s)) {
    const prev = s;
    s = s.replace(/(\d+)\s*TC[\s_-]?M\b/i, '$1 TC-M');
    if (s !== prev && !hasTypo) {
      hasTypo = true;
      typoType = 'SUFFIX_SPACING';
    }
  }

  return { corrected: s, hasTypo, typoType };
}

/**
 * Detects search intent strictly according to canonical guidelines.
 * Strict rules:
 * - 11 digits: PART_NUMBER (never fuzzy matches to a model)
 * - 9 digits (or 8-10 digit serial candidate): SERIAL_NUMBER (never text-matched to a model)
 * - 2-3 digits without prefix (e.g. 260, 261): AMBIGUOUS_NUMERIC
 * - String starting with prefix and partial number (e.g. MS 26): AMBIGUOUS_PREFIX
 * - Otherwise: MODEL
 */
export function detectSearchIntent(rawQuery = '') {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return SEARCH_INTENTS.UNKNOWN;
  }

  const s = rawQuery.trim().replace(/^STIHL[\s_\-]+/i, '').trim();
  const digitsOnly = s.replace(/\D/g, '');

  // 1. Exact 11-digit part number
  if (digitsOnly.length === 11) {
    return SEARCH_INTENTS.PART_NUMBER;
  }

  // 2. Part number formatted like 1121 021 0800 or 1121-021-0800
  if (/^\d{4}[\s.-]?\d{3}[\s.-]?\d{4}$/.test(s)) {
    return SEARCH_INTENTS.PART_NUMBER;
  }

  // 3. 9-digit serial number (or alphanumeric 8-10)
  if (digitsOnly.length === 9 && !/[a-zA-Z]/.test(s)) {
    return SEARCH_INTENTS.SERIAL_NUMBER;
  }
  if (/^[A-Za-z0-9]{8,10}$/.test(s) && /[a-zA-Z]/.test(s) && /\d/.test(s) && digitsOnly.length >= 7) {
    return SEARCH_INTENTS.SERIAL_NUMBER;
  }

  // 4. Short standalone numbers (2-3 digits) without letters e.g. 260, 261
  // Note: 026 is an authentic legacy model in relationships, but bare 260 or 261 is ambiguous!
  if (/^\d{2,3}$/.test(s)) {
    // If it's a known legacy 0-prefixed model like 026, 036, it has dedicated relationship
    if (/^0\d{2}$/.test(s) && resolveModelRelationship(s)) {
      return SEARCH_INTENTS.MODEL;
    }
    return SEARCH_INTENTS.AMBIGUOUS_NUMERIC;
  }

  // 5. Short incomplete model stems like "MS 26", "FS 4", "BR 6"
  if (/^[A-Z]{1,4}\s*\d{1,2}$/i.test(s)) {
    return SEARCH_INTENTS.AMBIGUOUS_PREFIX;
  }

  return SEARCH_INTENTS.MODEL;
}

/**
 * Builds the comprehensive list of searchable model entries
 */
export function getComprehensiveModelCatalog(database = {}) {
  const models = [];
  const seenSlugs = new Set();

  // 1. Models from canonical database
  const dbModels = Array.isArray(database?.models) ? database.models : [];
  for (const m of dbModels) {
    const slug = (m.slug || m.id || m.model_name.toLowerCase().replace(/\s+/g, '-')).trim();
    if (!seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      models.push({
        model_name: m.model_name,
        slug,
        category: m.category || m.category_slug || 'Kettingzaag',
        category_slug: m.category_slug || 'kettingzagen',
        series_code: m.series_code || null,
        fuel_type_label: m.fuel_type_label || null,
        variant: m.model_name.includes('C-M') ? 'M-Tronic' : (m.model_name.includes('C-EM') ? 'ErgoStart + M-Tronic' : null),
        explanation: m.basic_classification?.notes || null,
        is_canonical: true,
        source: 'CANONICAL_DATABASE'
      });
    }
  }

  // 2. Verified auxiliary models (FS 450, MS 261 VW)
  for (const aux of VERIFIED_AUXILIARY_MODELS) {
    const slugKey = aux.model_name.toUpperCase();
    if (!models.some(m => m.model_name.toUpperCase() === slugKey)) {
      models.push({
        ...aux,
        is_canonical: false,
        source: 'VERIFIED_CATALOG_AUXILIARY'
      });
    }
  }

  // 3. Historical relationship models (026, 036, 044, 046, 066, 020 T)
  for (const [key, rel] of Object.entries(HISTORICAL_MODEL_RELATIONSHIPS)) {
    const cleanKey = rel.model_name.toUpperCase();
    if (!models.some(m => m.model_name.toUpperCase() === cleanKey)) {
      models.push({
        model_name: rel.model_name,
        legacy_key: key,
        slug: rel.related_model_slug || key.toLowerCase().replace(/\s+/g, '-'),
        category: rel.category,
        category_slug: 'kettingzagen',
        series_code: rel.series_code,
        fuel_type_label: 'Benzine (2-takt)',
        variant: 'Historisch model',
        explanation: rel.notes,
        is_historical: true,
        related_model_name: rel.related_model_name,
        relationship_type: rel.relationship_type,
        is_canonical: false,
        source: 'HISTORICAL_RELATIONSHIPS'
      });
    }
  }

  return models;
}

/**
 * Searches models with multi-tier matching hierarchy
 */
export function searchIntelligentModels(queryStr = '', database = {}, options = {}) {
  const limit = options.limit || 8;
  const intent = detectSearchIntent(queryStr);

  // Strict intent guards: part numbers and serials MUST NOT fuzzy match to models!
  if (intent === SEARCH_INTENTS.PART_NUMBER || intent === SEARCH_INTENTS.SERIAL_NUMBER) {
    return {
      intent,
      query: queryStr,
      exactMatch: null,
      candidates: [],
      suggestions: [],
      isAmbiguous: false,
      typoNotice: null
    };
  }

  const catalog = getComprehensiveModelCatalog(database);
  const sanitized = sanitizeSearchQuery(queryStr);
  const { corrected, hasTypo, typoType } = correctQueryTypos(queryStr);

  const cleanRaw = sanitized.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanCorrected = corrected.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Tier 1: Exact canonical match on raw/sanitized query
  const exactMatch = catalog.find((m) => {
    const cleanName = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanSlug = m.slug.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const cleanLegacy = m.legacy_key ? m.legacy_key.replace(/[^A-Z0-9]/gi, '').toUpperCase() : '';
    return cleanName === cleanRaw || cleanSlug === cleanRaw || cleanLegacy === cleanRaw || cleanName === `STIHL${cleanRaw}`;
  });

  if (exactMatch && !hasTypo) {
    return {
      intent: SEARCH_INTENTS.MODEL,
      query: queryStr,
      exactMatch: {
        ...exactMatch,
        match_type: MATCH_TYPES.EXACT,
        match_label: 'Exact model gevonden'
      },
      candidates: [],
      suggestions: [],
      isAmbiguous: false,
      typoNotice: null
    };
  }

  // Tier 2: Typo-recovered exact match (e.g. MS 26O -> MS 260, FS45O -> FS 450, MS 261C M -> MS 261 C-M)
  if (hasTypo) {
    const typoMatch = catalog.find((m) => {
      const cleanName = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const cleanSlug = m.slug.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return cleanName === cleanCorrected || cleanSlug === cleanCorrected;
    });

    if (typoMatch) {
      let explanation = `Bedoelde je ${typoMatch.model_name}?`;
      if (typoType === 'ZERO_O_SUBSTITUTION') {
        explanation = `Typefout hersteld: letter 'O' vervangen door cijfer '0' (${queryStr.trim()} → ${typoMatch.model_name})`;
      } else if (typoType === 'SUFFIX_SPACING') {
        explanation = `Uitvoeringscode genormaliseerd (${queryStr.trim()} → ${typoMatch.model_name})`;
      }

      return {
        intent: SEARCH_INTENTS.MODEL,
        query: queryStr,
        exactMatch: {
          ...typoMatch,
          match_type: MATCH_TYPES.TYPO_RECOVERY,
          match_label: 'Typefout hersteld'
        },
        candidates: [],
        suggestions: [],
        isAmbiguous: false,
        typoNotice: explanation
      };
    }
  }

  // Tier 3: Ambiguous short numeric queries (e.g. 260, 261)
  if (intent === SEARCH_INTENTS.AMBIGUOUS_NUMERIC) {
    const digits = sanitized.replace(/\D/g, '');
    const matchingCandidates = catalog.filter((m) => {
      const mDigits = m.model_name.replace(/\D/g, '');
      const relatedDigits = m.related_model_name ? m.related_model_name.replace(/\D/g, '') : '';
      return mDigits === digits || mDigits.includes(digits) || m.model_name.includes(digits) || relatedDigits === digits;
    }).map((m) => {
      let matchType = MATCH_TYPES.SUGGESTION;
      let label = 'Mogelijk model';
      let expl = m.explanation || `STIHL ${m.category} met nummer ${digits}`;

      if (m.is_historical) {
        matchType = MATCH_TYPES.HISTORICAL_ALIAS;
        label = 'Historisch model';
        expl = m.explanation;
      } else if (m.model_name.includes('C-M') || m.model_name.includes('VW')) {
        matchType = MATCH_TYPES.VARIANT;
        label = 'Mogelijke uitvoering';
      }

      return {
        ...m,
        match_type: matchType,
        match_label: label,
        explanation: expl
      };
    });

    return {
      intent: SEARCH_INTENTS.AMBIGUOUS_NUMERIC,
      query: queryStr,
      exactMatch: null,
      candidates: matchingCandidates.slice(0, limit),
      suggestions: [],
      isAmbiguous: true,
      typoNotice: null,
      message: `Het nummer "${queryStr.trim()}" kan betrekking hebben op meerdere STIHL-modellen:`
    };
  }

  // Tier 4: Prefix multi-match (e.g. "MS 26")
  const prefixCandidates = catalog.filter((m) => {
    const cleanName = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return cleanName.startsWith(cleanCorrected) || cleanName.startsWith(cleanRaw);
  }).map((m) => {
    let matchType = MATCH_TYPES.PREFIX_MATCH;
    let label = 'Mogelijk model';
    if (m.model_name.includes('C-M') || m.model_name.includes('VW')) {
      matchType = MATCH_TYPES.VARIANT;
      label = 'Mogelijke uitvoering';
    } else if (m.is_historical) {
      matchType = MATCH_TYPES.HISTORICAL_ALIAS;
      label = 'Historische voorloper';
    }
    return {
      ...m,
      match_type: matchType,
      match_label: label,
      explanation: m.explanation || `STIHL ${m.category} (${m.model_name})`
    };
  });

  if (prefixCandidates.length > 1) {
    return {
      intent: SEARCH_INTENTS.AMBIGUOUS_PREFIX,
      query: queryStr,
      exactMatch: null,
      candidates: prefixCandidates.slice(0, limit),
      suggestions: [],
      isAmbiguous: true,
      typoNotice: null,
      message: `Meerdere modellen gevonden voor "${queryStr.trim()}". Selecteer jouw model:`
    };
  } else if (prefixCandidates.length === 1) {
    return {
      intent: SEARCH_INTENTS.MODEL,
      query: queryStr,
      exactMatch: prefixCandidates[0],
      candidates: [],
      suggestions: [],
      isAmbiguous: false,
      typoNotice: null
    };
  }

  // Tier 5: Controlled Bounded Fuzzy Matching for Typos (Levenshtein distance <= 2)
  // e.g. "MS 2500" -> distance 1 from "MS 250"
  // STRICT RULE: Only suggest genuine, existing models. NEVER fabricate models!
  const fuzzyScored = [];
  for (const m of catalog) {
    const cleanName = m.model_name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const distRaw = levenshteinDistance(cleanRaw, cleanName);
    const distCorrected = levenshteinDistance(cleanCorrected, cleanName);
    const minDist = Math.min(distRaw, distCorrected);

    // Only allow max distance 2 (or 1 for short queries)
    const maxAllowedDist = cleanRaw.length <= 4 ? 1 : 2;
    if (minDist <= maxAllowedDist) {
      fuzzyScored.push({
        ...m,
        distance: minDist,
        match_type: MATCH_TYPES.SUGGESTION,
        match_label: 'Suggestie',
        explanation: `Plausibel model (overeenkomst met ${m.model_name})`
      });
    }
  }

  fuzzyScored.sort((a, b) => a.distance - b.distance || a.model_name.localeCompare(b.model_name));

  return {
    intent: SEARCH_INTENTS.MODEL,
    query: queryStr,
    exactMatch: null,
    candidates: [],
    suggestions: fuzzyScored.slice(0, limit),
    isAmbiguous: false,
    typoNotice: null,
    message: fuzzyScored.length > 0
      ? `Geen exacte overeenkomst gevonden voor "${queryStr.trim()}". Controleer het modelnummer of probeer een van de voorgestelde modellen:`
      : `Geen model of onderdeel gevonden voor "${queryStr.trim()}". Voer het exacte model of serienummer van het typeplaatje in.`
  };
}

/**
 * Fast autocomplete suggestions for live search typing (debounced, mobile-optimized)
 */
export function getAutocompleteSuggestions(queryStr = '', database = {}, options = {}) {
  const limit = options.limit || 6;
  if (!queryStr || typeof queryStr !== 'string') return [];
  const s = queryStr.trim();
  if (s.length < 2) return [];

  // Strict intent check: If user typed 9 digits or 11 digits, do not autocomplete model names!
  const digitsOnly = s.replace(/\D/g, '');
  if (digitsOnly.length >= 9 && /^\d+$/.test(s.replace(/[\s.-]/g, ''))) {
    return [];
  }

  const result = searchIntelligentModels(s, database, { limit });

  const suggestions = [];

  if (result.exactMatch) {
    suggestions.push({
      model_name: result.exactMatch.model_name,
      category: result.exactMatch.category,
      variant: result.exactMatch.variant,
      slug: result.exactMatch.slug,
      match_type: result.exactMatch.match_type,
      badge: result.exactMatch.variant || 'Exact',
      label: `${result.exactMatch.category}${result.exactMatch.variant ? ` (${result.exactMatch.variant})` : ''}`,
      url: `/kettingzagen/${result.exactMatch.slug}/`
    });
  }

  if (Array.isArray(result.candidates)) {
    for (const c of result.candidates) {
      if (!suggestions.some(sugg => sugg.model_name === c.model_name)) {
        suggestions.push({
          model_name: c.model_name,
          category: c.category,
          variant: c.variant,
          slug: c.slug,
          match_type: c.match_type,
          badge: c.variant || (c.match_type === MATCH_TYPES.HISTORICAL_ALIAS ? 'Voorloper' : 'Bekijk'),
          label: `${c.category}${c.variant ? ` (${c.variant})` : ''}`,
          url: `/${c.category_slug || 'kettingzagen'}/${c.slug}/`
        });
      }
    }
  }

  if (Array.isArray(result.suggestions)) {
    for (const s of result.suggestions) {
      if (!suggestions.some(sugg => sugg.model_name === s.model_name)) {
        suggestions.push({
          model_name: s.model_name,
          category: s.category,
          variant: s.variant,
          slug: s.slug,
          match_type: s.match_type,
          badge: s.variant || 'Suggestie',
          label: `${s.category} (Suggestie)`,
          url: `/${s.category_slug || 'kettingzagen'}/${s.slug}/`
        });
      }
    }
  }

  return suggestions.slice(0, limit);
}
