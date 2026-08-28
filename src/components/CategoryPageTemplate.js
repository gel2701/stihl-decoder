/**
 * Data-Driven Category Landing Page SSR Template Renderer for STIHLDecoder.nl
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getModelVerificationSummary } from '../canonicalData.js';

export function renderCategoryPageHtml(categorySlug, database, baseUrl = 'https://stihldecoder.nl') {
  const categoryNames = {
    'kettingzagen': 'STIHL Kettingzagen',
    'bosmaaiers': 'STIHL Bosmaaiers',
    'bladblazers': 'STIHL Bladblazers',
    'heggenscharen': 'STIHL Heggenscharen',
    'accu-kettingzagen': 'STIHL Accu Kettingzagen'
  };

  const categoryTitle = categoryNames[categorySlug] || `STIHL ${categorySlug}`;
  const canonicalUrl = `${baseUrl}/${categorySlug}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: categoryTitle, url: `/${categorySlug}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'intent',
    intent: {
      title: `${categoryTitle} Modellen Overzicht & Serienummer Decoder`,
      description: `Bekijk het complete overzicht van alle ${categoryTitle} met zichtbare bronstatus, onderdeleninformatie en aanwijzingen voor serienummer- en typeplaatjecontrole.`
    },
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `${categoryTitle} Modellen Overzicht & Serienummer Decoder | STIHLDecoder`,
    description: `Compleet overzicht van alle ${categoryTitle}. Bekijk modeldata, bronstatus en controleer serienummers zonder meer zekerheid te claimen dan de bronlaag ondersteunt.`,
    canonicalUrl,
    ogType: 'website',
    jsonLdData
  });

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  // Filter models belonging to this category
  const allModels = database.models || [];
  const categoryModels = allModels.filter(m => m.category_slug === categorySlug || (categorySlug === 'kettingzagen' && (!m.category_slug || m.category_slug === 'kettingzagen')));

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  ${seoMetaHtml}
  <script src="https://cdn.tailwindcss.com"></script>
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
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Categorie Categoriehub</span>
          </span>
          <p class="text-xs text-gray-400">Canoniek modellenoverzicht</p>
        </div>
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Zoeken</a>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-5xl mx-auto px-4 py-6 flex-1 w-full space-y-8">
    
    <!-- Breadcrumbs -->
    ${breadcrumbsHtml}

    <!-- Header & H1 Title -->
    <header class="space-y-3">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
        Categorie Overzicht met bronstatus
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        ${categoryTitle}: Modellen, Specificaties & Serienummers
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Bekijk alle bekende ${categoryTitle} in onze canonieke database. Selecteer een model voor bronstatus, onderdeleninformatie en een voorzichtige interpretatie van de beschikbare modeldata.
      </p>
    </header>

    <!-- Prominent Decoder Tool Form -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 stihl-orange-glow">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <h2 class="text-lg font-bold text-orange-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Direct Serienummer van een ${categoryTitle} controleren:
        </h2>
        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Formaat- en herkomstcheck</span>
      </div>

      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer 9-cijferig serienummer in..." 
          class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-base placeholder-gray-500 focus:outline-none focus:border-orange-500"
          autocomplete="off"
        />
        <button 
          type="submit" 
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Analyseer Serienummer</span>
        </button>
      </form>
    </section>

    <!-- Category Models Grid -->
    <section class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Gepubliceerde ${categoryTitle}</span>
        <span class="text-xs text-gray-400 font-normal">${categoryModels.length} Gepubliceerde modellen</span>
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${categoryModels.map(m => {
          const mSlug = m.slug || m.id.replace(/_/g, '-');
          const mCat = m.category_slug || categorySlug;
          const verification = getModelVerificationSummary(m);
          return `
            <a href="/${mCat}/${mSlug}/" class="bg-gray-900/70 border border-gray-800 hover:border-orange-500 p-5 rounded-2xl transition space-y-3 block group">
              <div class="flex justify-between items-start">
                <span class="font-extrabold text-white text-lg group-hover:text-orange-400 font-mono">STIHL ${m.model_name}</span>
                <span class="px-2 py-0.5 rounded text-2xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">${m.series_code ? `Serie ${m.series_code}` : 'Model'}</span>
              </div>
              <div class="text-xs text-gray-400 space-y-1">
                <p>• Vermogen: <strong class="text-gray-200">${m.power_hp ? `${m.power_hp} pk (${m.power_kw} kW)` : (m.power_kw ? `${m.power_kw} kW` : 'Niet vastgesteld')}</strong></p>
                <p>• Cilinderinhoud: <strong class="text-gray-200">${m.displacement_cc ? `${m.displacement_cc} cc` : 'Niet vastgesteld'}</strong></p>
                <p>• Gewicht: <strong class="text-gray-200">${m.weight_kg ? `${m.weight_kg} kg` : 'Niet vastgesteld'}</strong></p>
                <p>• Bronstatus: <strong class="text-gray-200">${verification.badgeLabel}</strong></p>
              </div>
              <div class="pt-2 border-t border-gray-800 flex justify-between items-center text-2xs font-bold text-orange-400">
                <span>Bekijk Modelgids & Serienummers</span>
                <span>→</span>
              </div>
            </a>
          `;
        }).join('')}
      </div>
    </section>

    <!-- Category Popular Comparisons -->
    <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
      <h3 class="text-lg font-bold text-white">Populaire ${categoryTitle} Vergelijkingen:</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <a href="/vergelijk/ms-260-vs-ms-261/" class="bg-gray-950 p-4 rounded-xl border border-gray-800 hover:border-orange-500 block font-bold text-white">
          <span class="text-orange-400 block font-mono text-xs">Klassiek vs M-Tronic</span>
          STIHL MS 260 vs MS 261 →
        </a>
        <a href="/vergelijk/ms-361-vs-ms-362/" class="bg-gray-950 p-4 rounded-xl border border-gray-800 hover:border-orange-500 block font-bold text-white">
          <span class="text-orange-400 block font-mono text-xs">Professionele Middenklasse</span>
          STIHL MS 361 vs MS 362 →
        </a>
        <a href="/vergelijk/ms-170-vs-ms-180/" class="bg-gray-950 p-4 rounded-xl border border-gray-800 hover:border-orange-500 block font-bold text-white">
          <span class="text-orange-400 block font-mono text-xs">Compacte Instapklasse</span>
          STIHL MS 170 vs MS 180 →
        </a>
      </div>
    </section>

    <!-- Interlinking Hub -->
    <section class="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl space-y-3 text-xs">
      <h3 class="text-sm font-bold text-white">Relevante STIHL Gidsen & Kennisbank:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300">
        <a href="/stihl-serienummer-decoder/" class="hover:text-orange-400 hover:underline">→ Serienummer Decoder</a>
        <a href="/stihl-serienummer/" class="hover:text-orange-400 hover:underline">→ Serienummer Aflezen</a>
        <a href="/stihl-bouwjaar/" class="hover:text-orange-400 hover:underline">→ Bouwjaar Controleren</a>
        <a href="/stihl-diefstalcheck/" class="hover:text-orange-400 hover:underline">→ Diefstalcheck</a>
        <a href="/stihl-waarde/" class="hover:text-orange-400 hover:underline">→ Waardebepaling</a>
        <a href="/stihl-paspoort/" class="hover:text-orange-400 hover:underline">→ Serienummer Rapport Maken</a>
        <a href="/stihl-modellen/" class="hover:text-orange-400 hover:underline">→ STIHL Modellen Overzicht</a>
        <a href="/waar-staat-serienummer-stihl/" class="hover:text-orange-400 hover:underline">→ Waar staat het serienummer</a>
        <a href="/stihl-serienummer-bouwjaar/" class="hover:text-orange-400 hover:underline">→ Serienummer vs Bouwjaar</a>
        <a href="/stihl-productiedatum/" class="hover:text-orange-400 hover:underline">→ Productiedatum Gids</a>
        <a href="/stihl-model-herkennen/" class="hover:text-orange-400 hover:underline">→ Model Herkennen</a>
        <a href="/stihl-typeplaatje/" class="hover:text-orange-400 hover:underline">→ Typeplaatje Aflezen</a>
        <a href="/stihl-serienummer-ongeldig/" class="hover:text-orange-400 hover:underline">→ Verdacht Serienummer</a>
        <a href="/stihl-tweedehands-checklist/" class="hover:text-orange-400 hover:underline">→ Tweedehands Checklist</a>
        <a href="/onderdeelnummer/" class="hover:text-orange-400 hover:underline">→ Onderdeelnummer Gids</a>
        <a href="/gidsen/stihl-gietklok-aflezen/" class="hover:text-orange-400 hover:underline">→ Gietklok Handleiding</a>
        <a href="/gidsen/namaak-stihl-herkennen/" class="hover:text-orange-400 hover:underline">→ Namaak Herkennen</a>
        <a href="/gidsen/serienummer-locaties/" class="hover:text-orange-400 hover:underline">→ Serienummer Locaties</a>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel. Niet gelieerd aan ANDREAS STIHL AG & Co. KG.
      </p>
    </div>
  </footer>

</body>
</html>`;
}
