/**
 * globalModelSearch.js
 * Comprehensive search index over all registered STIHL model identities.
 * Builds safe searchable set from:
 *   1. Canonical registered model identities (database.models)
 *   2. Eligible public evidence identities (public_evidence.model_index)
 *   3. Explicit existing aliases (database.aliases)
 * Implements variant isolation (MS 200 vs MS 200 T, MS 261 vs MS 261 C-M)
 * and strict query normalization. User selection is ALWAYS required (no auto-confirm).
 */

export function buildSearchableIdentities(database = {}) {
  if (Array.isArray(database)) return database;
  if (Array.isArray(database.identities)) return database.identities;
  const canonicalModels = Array.isArray(database.models) ? database.models : [];
  const evidenceModelIndex = database.public_evidence?.model_index || {};
  const aliases = database.aliases || {};

  const identityMap = new Map();

  // 1. Canonical registered models
  canonicalModels.forEach((m) => {
    const slug = (m.slug || m.id || m.model_name.toLowerCase().replace(/\s+/g, '-')).trim();
    identityMap.set(slug, {
      slug,
      model_name: m.model_name,
      category: m.category || m.category_slug || 'Kettingzagen',
      series_code: m.series_code || null,
      is_canonical: true,
      has_evidence: Boolean(evidenceModelIndex[slug] || evidenceModelIndex[m.model_name]),
      aliases: []
    });
  });

  // 2. Eligible public_evidence identities
  Object.entries(evidenceModelIndex).forEach(([key, info]) => {
    const slug = (info.model_slug || key).toLowerCase().replace(/\s+/g, '-').trim();
    if (!identityMap.has(slug)) {
      identityMap.set(slug, {
        slug,
        model_name: info.model_name || key,
        category: info.category || 'Kettingzagen',
        series_code: info.series_code || null,
        is_canonical: false,
        has_evidence: true,
        aliases: []
      });
    } else {
      identityMap.get(slug).has_evidence = true;
    }
  });

  // 3. Explicit existing aliases
  Object.entries(aliases).forEach(([alias, target]) => {
    const targetSlug = (target?.slug || target?.model_name || (typeof target === 'string' ? target : '')).toLowerCase().replace(/\s+/g, '-').trim();
    if (identityMap.has(targetSlug)) {
      identityMap.get(targetSlug).aliases.push(alias);
    }
  });

  return Array.from(identityMap.values());
}

export function normalizeSearchQuery(q = '') {
  if (!q || typeof q !== 'string') return '';
  let s = q.trim().toUpperCase();
  s = s.replace(/^STIHL[\s_\-]+/i, '').trim();
  s = s.replace(/\s+/g, ' ');
  return s;
}

export function searchGlobalModels(queryStr, database = {}, options = {}) {
  const normalized = normalizeSearchQuery(queryStr);
  if (!normalized) return [];

  const identities = buildSearchableIdentities(database);
  const cleanQ = normalized.replace(/[^A-Z0-9]/g, '');

  const results = [];

  for (const item of identities) {
    const cleanName = item.model_name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanSlug = item.slug.toUpperCase().replace(/[^A-Z0-9]/g, '');

    let score = 0;
    let matchType = null;

    // 1. Exact normalized model match
    if (cleanName === cleanQ) {
      score = 100;
      matchType = 'EXACT_NAME';
    } else if (cleanSlug === cleanQ) {
      score = 90;
      matchType = 'EXACT_SLUG';
    } else if (item.aliases.some((a) => a.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanQ)) {
      score = 80;
      matchType = 'EXACT_ALIAS';
    } else if (cleanName.startsWith(cleanQ)) {
      score = 70;
      matchType = 'PREFIX_NAME';
    } else if (cleanSlug.startsWith(cleanQ)) {
      score = 60;
      matchType = 'PREFIX_SLUG';
    } else if (cleanName.includes(cleanQ)) {
      score = 50;
      matchType = 'CONTAINS_NAME';
    } else if (cleanSlug.includes(cleanQ)) {
      score = 40;
      matchType = 'CONTAINS_SLUG';
    }

    if (score > 0) {
      // Variant Isolation: If query did NOT specify variant suffix (e.g. C-M, TC-M, C-EM, T),
      // prioritize the base model so variant models don't shadow base models.
      const isVariant = item.model_name.includes('C-M') || item.model_name.includes('C-EM') || item.model_name.includes('TC-M') || item.model_name.endsWith(' T');
      const qHasVariant = normalized.includes('C-M') || normalized.includes('C-EM') || normalized.includes('TC-M') || normalized.endsWith(' T');
      if (isVariant && !qHasVariant) {
        score -= 5;
      }

      results.push({
        ...item,
        score,
        matchType
      });
    }
  }

  // Sort by score descending, then alphabetical by model_name
  results.sort((a, b) => b.score - a.score || a.model_name.localeCompare(b.model_name));

  const limit = options.limit || 20;
  return results.slice(0, limit);
}

export function findRegisteredModel(inputQuery, database = {}) {
  if (!inputQuery || typeof inputQuery !== 'string') return null;
  const results = searchGlobalModels(inputQuery, database, { limit: 1 });
  if (results.length > 0 && (results[0].matchType === 'EXACT_NAME' || results[0].matchType === 'EXACT_SLUG' || results[0].matchType === 'EXACT_ALIAS')) {
    return results[0];
  }
  return null;
}
