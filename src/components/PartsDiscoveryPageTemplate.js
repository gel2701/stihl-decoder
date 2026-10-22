/**
 * Central Parts Discovery Page Template for STIHLDecoder.nl
 * Phase 56D — Parts Discovery & SEO Scale Wave 2
 *
 * Implements `/onderdelen/` as a centralized, authoritative parts search engine:
 * 1. Exact Part Number Match (compact "11231602050", formatted "1123 160 2050", whitespace variations)
 * 2. Model Filter (e.g. "MS 261", "FS 350") -> links to model parts guide
 * 3. Component Text Search (e.g. "carburateur", "luchtfilter", "bougie", "koppeling")
 * 4. Curated Maintenance & Wear Categories
 * 5. Full SEO Metadata, Breadcrumbs, and Structured Data
 *
 * ZERO FUZZY MISATTRIBUTION:
 * Exact part matches are strictly segregated from text and model search results.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { PartCatalogResolver } from '../parts/PartCatalogResolver.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderSeoMeta } from './SeoMeta.js';
import { PRIMARY_ORIGIN } from '../config.js';
import { getSafeModelPath, getSafeModelPartsPath } from '../publicationRules.js';
import { isPartIndexable, getIndexablePartEntry } from '../seo/PartIndexationRegistry.js';

export function renderPartsDiscoveryPageHtml(query = '', database = {}, baseUrl = PRIMARY_ORIGIN, options = {}) {
  const rawQuery = (typeof query === 'string' ? query : '').trim();
  const canonicalUrl = `${baseUrl}/onderdelen/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Onderdelen Zoeker', url: '/onderdelen/' }
  ];
  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  // Analyze query type
  const normPartNo = PartNormalizer.normalizePartNumber(rawQuery);
  const isPartNumberQuery = Boolean(normPartNo);

  let exactMatchResult = null;
  let modelMatches = [];
  let textSearchResults = [];
  let searched = rawQuery.length > 0;

  if (isPartNumberQuery) {
    // 1. Exact Part Number Lookup
    const resolved = PartCatalogResolver.resolvePartNumber(normPartNo, database);
    if (resolved && resolved.part_number) {
      const isIndexable = isPartIndexable(resolved.part_number);
      const indexEntry = isIndexable ? getIndexablePartEntry(resolved.part_number) : null;
      exactMatchResult = {
        ...resolved,
        is_indexable: isIndexable,
        clean_name: indexEntry?.clean_name || resolved.technical_profile?.display_name || resolved.part_name || 'STIHL Vervangingsonderdeel',
        formatted_number: PartNormalizer.formatPartNumber(resolved.part_number)
      };
    }
  } else if (rawQuery.length >= 2) {
    // 2. Check if query matches a known model
    const cleanQ = rawQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
    const allModels = database.models || [];
    modelMatches = allModels.filter(m => {
      if (m.data_status === 'EVIDENCE_STORE_LINKED') return false;
      const mNameClean = (m.model_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const mSlugClean = (m.slug || m.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return mNameClean.includes(cleanQ) || mSlugClean.includes(cleanQ);
    }).slice(0, 6);

    // 3. Multilingual Text Search with Dutch & German Synonyms across parts catalog
    textSearchResults = PartCatalogResolver.searchParts(rawQuery, 30, { database, modelId: options.modelId });
  }

  const searchSuggestions = (searched && !exactMatchResult && modelMatches.length === 0 && textSearchResults.length === 0)
    ? PartCatalogResolver.getSearchSuggestions(rawQuery)
    : null;

  const pageTitle = searched
    ? `STIHL Onderdelen Zoeken: "${rawQuery}" | STIHLDecoder`
    : `STIHL Onderdelen Zoeken & Explosietekeningen Catalogus | STIHLDecoder`;

  const metaDescription = searched
    ? `Zoekresultaten voor STIHL onderdelen "${rawQuery}". Controleer onderdeelnummers, exploded views en compatibele STIHL modellen.`
    : `Centrale onderdelenzoeker voor alle 17.082 STIHL onderdelen. Zoek direct op onderdeelnummer (compact of geformatteerd), model of diagramsectie.`;

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageTitle,
    description: metaDescription,
    url: canonicalUrl,
    inLanguage: 'nl-NL'
  };

  const seoMetaHtml = renderSeoMeta({
    title: pageTitle,
    description: metaDescription,
    canonicalUrl,
    ogType: 'website',
    robotsContent: searched ? 'noindex, follow' : 'index, follow',
    jsonLdData
  });

  // Curated maintenance categories
  const categoriesList = [
    { name: 'Bougies & Ontsteking', icon: '⚡', q: 'bougie', desc: 'Bougies, ontstekingsmodules, bougiekappen en kabels' },
    { name: 'Lucht- & Brandstoffilters', icon: '💨', q: 'filter', desc: 'Luchtfilters, aanzuigkoppen, viltfilters en brandstoffilters' },
    { name: 'Carburateurs & Membranen', icon: '🎛️', q: 'carburateur', desc: 'Complete carburateurs, membraansets en pakkingen' },
    { name: 'Koppelingen & Kettingwielen', icon: '⚙️', q: 'koppeling', desc: 'Centrifugaalkoppelingen, koppelingsveren en aandrijfwielen' },
    { name: 'Starters & Startkoorden', icon: '🔄', q: 'starter', desc: 'Repulseurs, startrollen, trekveren en anwerfseil' },
    { name: 'Oliepompen & Smering', icon: '🛢️', q: 'oliepomp', desc: 'Kettingoliepompen, wormwielen en olieslangen' }
  ];

  // Popular model shortcuts
  const popularSlugs = ['ms-170', 'ms-180', 'ms-211', 'ms-250', 'ms-261', 'ms-362', 'ms-462', 'fs-38', 'fs-55', 'fs-350', 'br-600', 'ts-420'];
  const popularModels = popularSlugs.map(slug => {
    const m = (database.models || []).find(mod => (mod.slug || mod.id).toLowerCase() === slug);
    return m ? { model: m, partsPath: getSafeModelPartsPath(m) } : null;
  }).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  ${seoMetaHtml}
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">

  <!-- Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
          </span>
          <span class="text-2xs text-gray-400 block -mt-1 font-mono">Centrale Onderdelenzoeker</span>
        </div>
      </a>
      <div class="flex items-center gap-3 text-xs">
        <a href="/onderdeelnummer/" class="text-gray-300 hover:text-white transition hidden sm:inline">
          Serie Overzicht
        </a>
        <a href="/" class="text-orange-400 font-bold hover:underline">
          ← Naar Home
        </a>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
    ${breadcrumbsHtml}

    <!-- Hero / Search Section -->
    <header class="text-center space-y-4 max-w-3xl mx-auto">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
        17.082 Canonieke Onderdelen
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL Onderdelen Zoeken
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed">
        Zoek direct in de canonieke STIHL-onderdelencatalogus. Ondersteunt 11-cijferige onderdeelnummers (compact of met spaties), modelnamen en technische componenten.
      </p>

      <!-- Search Form -->
      <form action="/onderdelen/" method="GET" class="pt-2">
        <div class="flex flex-col sm:flex-row gap-2 bg-gray-900 p-2 rounded-2xl border border-gray-800 shadow-xl focus-within:border-orange-500 transition">
          <div class="flex-1 flex items-center px-3 gap-2">
            <span class="text-gray-400">🔍</span>
            <input
              type="text"
              name="q"
              value="${rawQuery.replace(/"/g, '&quot;')}"
              placeholder="Bijv. 1123 160 2050, carburateur, bougie of MS 261..."
              class="w-full bg-transparent text-white placeholder-gray-500 text-sm focus:outline-none py-2"
              autocomplete="off"
              autofocus
            />
          </div>
          <button
            type="submit"
            class="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-600/30 transition shrink-0"
          >
            Zoek Onderdeel
          </button>
        </div>
      </form>
      <div class="flex flex-wrap items-center justify-center gap-2 text-2xs text-gray-400 pt-1">
        <span>Voorbeelden:</span>
        <a href="/onderdelen/?q=11231602050" class="text-orange-400 hover:underline font-mono">11231602050</a>
        <span>•</span>
        <a href="/onderdelen/?q=1123+160+2050" class="text-orange-400 hover:underline font-mono">1123 160 2050</a>
        <span>•</span>
        <a href="/onderdelen/?q=carburateur" class="text-orange-400 hover:underline">Carburateur</a>
        <span>•</span>
        <a href="/onderdelen/?q=MS+261" class="text-orange-400 hover:underline">MS 261</a>
      </div>
    </header>

    ${searched ? `
    <!-- Search Results Section -->
    <section class="space-y-6">

      ${exactMatchResult ? `
      <!-- Exact Part Number Match Banner -->
      <div class="bg-gradient-to-r from-emerald-950/60 to-gray-900 border-2 border-emerald-500/50 rounded-2xl p-6 space-y-4 shadow-xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-2xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              ✓ Exacte Onderdeelnummer Match
            </span>
            <span class="text-xs text-gray-400">Geverifieerd in canonieke catalogus</span>
          </div>
          <span class="text-xs font-mono text-gray-400">${exactMatchResult.fitments.length} posities</span>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-black text-white font-mono text-orange-400">
              STIHL ${exactMatchResult.formatted_number}
            </h2>
            <p class="text-base text-gray-200 font-semibold pt-0.5">
              ${exactMatchResult.clean_name}
            </p>
            <p class="text-xs text-gray-400 pt-1">
              Gedocumenteerd voor ${exactMatchResult.compatible_models.length} STIHL ${exactMatchResult.compatible_models.length === 1 ? 'model' : 'modellen'}${exactMatchResult.technical_profile?.sections?.[0] ? ` • Sectie: ${exactMatchResult.technical_profile.sections[0]}` : ''}.
            </p>
          </div>
          <div class="shrink-0">
            <a
              href="/onderdeelnummer/${exactMatchResult.part_number}/"
              class="px-5 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-600/30 transition flex items-center gap-2"
            >
              <span>Bekijk Volledige Onderdeelgids</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </div>
      ` : (isPartNumberQuery ? `
      <!-- Part Number Not Found Banner -->
      <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 text-center space-y-3">
        <span class="text-3xl">⚠️</span>
        <h2 class="text-lg font-bold text-white">Geen Exacte Match voor "${rawQuery}"</h2>
        <p class="text-xs text-gray-400 max-w-xl mx-auto">
          Het nummer <strong>${normPartNo}</strong> is een geldig 11-cijferig formaat, maar komt niet voor in de actuele canonieke STIHL-catalogus. Controleer het nummer op de originele verpakking of het oude onderdeel.
        </p>
        <div class="pt-2 space-y-2">
          <span class="text-2xs uppercase tracking-wider text-gray-400 font-mono block">Zoek op veelgezochte categorieën:</span>
          <div class="flex flex-wrap justify-center gap-2">
            ${['Bougie', 'Luchtfilter', 'Carburateur', 'Zaagketting', 'Zaagblad'].map(chip => `
              <a href="/onderdelen/?q=${encodeURIComponent(chip)}" class="px-3 py-1 rounded-lg bg-gray-950 border border-gray-800 hover:border-orange-500/50 text-xs text-gray-300 hover:text-white transition">
                ${chip}
              </a>
            `).join('')}
          </div>
        </div>
      </div>
      ` : '')}

      ${modelMatches.length > 0 ? `
      <!-- Model Matches Section -->
      <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>⚙️ Gevonden STIHL Modellen voor "${rawQuery}":</span>
          <span class="text-2xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">${modelMatches.length}</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${modelMatches.map(m => {
            const partsPath = getSafeModelPartsPath(m);
            return `
              <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 hover:border-gray-700 transition space-y-2">
                <div class="font-bold text-white text-sm">STIHL ${m.model_name}</div>
                <div class="text-2xs text-gray-400">${m.category || 'STIHL Machine'}</div>
                ${partsPath ? `
                  <a href="${partsPath}" class="text-xs font-semibold text-orange-400 hover:underline block pt-1">
                    Bekijk alle onderdelen voor ${m.model_name} →
                  </a>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      ${textSearchResults.length > 0 ? `
      <!-- Text Search Results Table -->
      <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div class="flex justify-between items-center border-b border-gray-800 pb-2.5">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <span>📋 Tekstzoekresultaten voor "${rawQuery}":</span>
            <span class="text-2xs font-mono text-gray-400 bg-gray-950 px-2 py-0.5 rounded border border-gray-800">${textSearchResults.length} onderdelen</span>
          </h3>
          <span class="text-2xs text-gray-400">Sorteerd op compatibiliteit</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-gray-400 border-b border-gray-800 text-2xs font-mono uppercase tracking-wider">
                <th class="py-2 px-3 w-40">Onderdeelnummer</th>
                <th class="py-2 px-3">Omschrijving</th>
                <th class="py-2 px-3">Sectie</th>
                <th class="py-2 pl-3 text-right w-24">Modellen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800/50">
              ${textSearchResults.map(p => `
                <tr class="hover:bg-gray-800/40 transition">
                  <td class="py-2.5 px-3 font-mono font-bold text-orange-400 whitespace-nowrap">
                    <a href="/onderdeelnummer/${p.part_number}/" class="hover:underline">
                      ${p.part_number_display || PartNormalizer.formatPartNumber(p.part_number)}
                    </a>
                  </td>
                  <td class="py-2.5 px-3 text-gray-200">
                    <a href="/onderdeelnummer/${p.part_number}/" class="hover:text-white hover:underline">
                      ${p.part_name}
                    </a>
                  </td>
                  <td class="py-2.5 px-3 text-2xs text-gray-400 font-mono">
                    ${p.section_name || 'Algemeen'}
                  </td>
                  <td class="py-2.5 pl-3 text-right font-mono text-gray-400">
                    ${p.model_count || 1}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : (!exactMatchResult && modelMatches.length === 0 && !isPartNumberQuery ? `
      <!-- No Results State with Helpful Suggestions (Phase 56F) -->
      <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 text-center space-y-4">
        <span class="text-3xl">🔍</span>
        <h2 class="text-base font-bold text-white">Geen onderdelen gevonden voor "${rawQuery}"</h2>
        <p class="text-xs text-gray-400 max-w-md mx-auto">
          We konden geen directe onderdelen vinden voor deze zoekterm. Controleer de spelling of kies uit de onderstaande suggesties:
        </p>

        ${searchSuggestions?.suggestion ? `
          <div class="pt-1">
            <span class="text-xs text-gray-300">Bedoelde u misschien:</span>
            <a href="/onderdelen/?q=${encodeURIComponent(searchSuggestions.suggestion)}" class="ml-2 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 text-xs font-bold hover:bg-orange-500/30 transition">
              <span>💡 ${searchSuggestions.suggestion}</span>
              <span>→</span>
            </a>
          </div>
        ` : ''}

        ${searchSuggestions?.chips && searchSuggestions.chips.length > 0 ? `
          <div class="pt-2 space-y-2">
            <span class="text-2xs uppercase tracking-wider text-gray-400 font-mono block">Veelgezochte categorieën & modellen:</span>
            <div class="flex flex-wrap justify-center gap-2">
              ${searchSuggestions.chips.map(chip => `
                <a href="/onderdelen/?q=${encodeURIComponent(chip)}" class="px-3 py-1 rounded-lg bg-gray-950 border border-gray-800 hover:border-orange-500/50 text-xs text-gray-300 hover:text-white transition">
                  ${chip}
                </a>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ` : '')}

    </section>
    ` : `
    <!-- Curated Discovery Hub (Initial State) -->
    <section class="space-y-8">

      <!-- Maintenance Categories Grid -->
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-gray-800 pb-2">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>🔧 Populaire Onderdelengroepen</span>
          </h2>
          <span class="text-2xs text-gray-400">Directe filters</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${categoriesList.map(cat => `
            <a
              href="/onderdelen/?q=${encodeURIComponent(cat.q)}"
              class="bg-gray-900/80 p-4 rounded-xl border border-gray-800 hover:border-orange-500/50 hover:bg-gray-900 transition block space-y-1.5 group"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-white text-sm group-hover:text-orange-400 transition flex items-center gap-2">
                  <span>${cat.icon}</span>
                  <span>${cat.name}</span>
                </span>
                <span class="text-xs text-orange-400 opacity-0 group-hover:opacity-100 transition">→</span>
              </div>
              <p class="text-2xs text-gray-400 leading-relaxed">${cat.desc}</p>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- Popular Models Quick Links -->
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-gray-800 pb-2">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>⚙️ Onderdelen per STIHL Model</span>
          </h2>
          <span class="text-2xs text-gray-400">Directe catalogustekeningen</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          ${popularModels.map(item => `
            <a
              href="${item.partsPath}"
              class="bg-gray-950 p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition block text-xs group"
            >
              <span class="font-bold text-white block group-hover:text-orange-400 transition">STIHL ${item.model.model_name}</span>
              <span class="text-2xs text-gray-400 block truncate">${item.model.category || 'Onderdelengids'}</span>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- Technical Guide Banner -->
      <div class="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-2 text-xs">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>ℹ️ Hoe herkent u een STIHL Onderdeelnummer?</span>
        </h3>
        <p class="text-gray-300 leading-relaxed text-xs">
          STIHL gebruikt gestandaardiseerde 11-cijferige onderdeelnummers (Teilenummer), doorgaans geschreven in <strong>4-3-4 indeling</strong> (bijv. <code class="text-orange-400 font-mono">1123 160 2050</code>). De eerste 4 cijfers duiden de machiniereeks aan (bijv. <code class="text-orange-400 font-mono">1123</code> voor de MS 210/230/250 familie).
        </p>
        <div class="pt-2">
          <a href="/onderdeelnummer/" class="text-orange-400 font-semibold hover:underline flex items-center gap-1">
            <span>Bekijk alle canonieke serie-prefixes in het Serie Overzicht</span>
            <span>→</span>
          </a>
        </div>
      </div>

    </section>
    `}

  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-800 bg-gray-900/60 text-gray-400 text-xs py-6 mt-12">
    <div class="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <span class="text-white font-bold">STIHL Decoder</span> — Onafhankelijke technische database & onderdelengids.
      </div>
      <div class="flex gap-4">
        <a href="/onderdelen/" class="hover:text-white transition">Onderdelen Zoeker</a>
        <a href="/onderdeelnummer/" class="hover:text-white transition">Serie Overzicht</a>
        <a href="/stihl-paspoort/" class="hover:text-white transition">Machinepaspoort</a>
      </div>
    </div>
  </footer>

</body>
</html>`;
}
