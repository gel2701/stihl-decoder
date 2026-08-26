/**
 * Data-Driven Model Comparison SSR Template Renderer for STIHLDecoder.nl
 * Phase 28 Comparison Engine
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';

export function renderComparisonPageHtml(pairSlug, database, baseUrl = 'https://stihldecoder.nl') {
  const parts = pairSlug.split('-vs-');
  const slugA = parts[0] ? parts[0].toLowerCase() : 'ms-260';
  const slugB = parts[1] ? parts[1].toLowerCase() : 'ms-261';

  const models = database.models || [];
  const modelA = models.find(m => m.slug === slugA || m.id.replace(/_/g, '-') === slugA) || models.find(m => m.slug === 'ms-260');
  const modelB = models.find(m => m.slug === slugB || m.id.replace(/_/g, '-') === slugB) || models.find(m => m.slug === 'ms-261');

  const nameA = modelA ? modelA.model_name : slugA.toUpperCase();
  const nameB = modelB ? modelB.model_name : slugB.toUpperCase();

  const canonicalUrl = `${baseUrl}/vergelijk/${slugA}-vs-${slugB}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Vergelijkingen', url: '/vergelijk/' },
    { name: `STIHL ${nameA} vs ${nameB}`, url: `/vergelijk/${slugA}-vs-${slugB}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'intent',
    intent: {
      title: `STIHL ${nameA} vs STIHL ${nameB} Vergelijking & Verschillen`,
      description: `Uitgebreide technische vergelijking tussen de STIHL ${nameA} en STIHL ${nameB}. Bekijk vermogen, gewicht, cilinderinhoud, carburateur en tweedehands advies.`
    },
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `STIHL ${nameA} vs STIHL ${nameB} Vergelijking & Verschillen | STIHLDecoder`,
    description: `Twijfelt u tussen de STIHL ${nameA} en de STIHL ${nameB}? Bekijk alle technische verschillen, gewicht, pk's, M-Tronic opties en tweedehands advies.`,
    canonicalUrl,
    ogType: 'article',
    jsonLdData
  });

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  ${seoMetaHtml}
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">

  <!-- Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 Z-50">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Model Vergelijking Engine</span>
          </span>
          <p class="text-xs text-gray-400">Onafhankelijke Technische Analyse</p>
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
        Vergelijkingsanalyse
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${nameA} vs STIHL ${nameB}: Belangrijkste Verschillen
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Twijfelt u tussen een STIHL ${nameA} en een STIHL ${nameB}? Bekijk onze gedetailleerde vergelijking van technische specificaties, cilinderinhoud, gewicht, carburateurtechnologie en tweedehands verkoopwaarden op Marktplaats.
      </p>
    </header>

    <!-- Side-by-Side Comparison Table -->
    <section class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Directe Vergelijkingstabel</span>
        <span class="text-xs text-gray-400 font-normal">Geverifieerde Data</span>
      </h2>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
          <thead class="bg-gray-900 border-b border-gray-800 text-white font-mono text-sm">
            <tr>
              <th class="p-4">Specificatie</th>
              <th class="p-4 text-orange-400 font-bold">STIHL ${nameA}</th>
              <th class="p-4 text-orange-400 font-bold">STIHL ${nameB}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800 text-gray-200">
            <tr>
              <td class="p-4 font-bold text-gray-400">Motorvermogen</td>
              <td class="p-4 font-bold text-white">${modelA.power_hp ? `${modelA.power_hp} pk (${modelA.power_kw} kW)` : 'Niet vastgesteld'}</td>
              <td class="p-4 font-bold text-white">${modelB.power_hp ? `${modelB.power_hp} pk (${modelB.power_kw} kW)` : 'Niet vastgesteld'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Cilinderinhoud</td>
              <td class="p-4 font-bold text-white">${modelA.displacement_cc ? `${modelA.displacement_cc} cc` : 'Niet vastgesteld'}</td>
              <td class="p-4 font-bold text-white">${modelB.displacement_cc ? `${modelB.displacement_cc} cc` : 'Niet vastgesteld'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Gewicht (Kaal motorblok)</td>
              <td class="p-4 font-bold text-white">${modelA.weight_kg ? `${modelA.weight_kg} kg` : 'Niet vastgesteld'}</td>
              <td class="p-4 font-bold text-white">${modelB.weight_kg ? `${modelB.weight_kg} kg` : 'Niet vastgesteld'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Carburateur / Systeem</td>
              <td class="p-4 font-mono text-gray-300">${modelA.carb_h_setting || 'Standaard / M-Tronic'}</td>
              <td class="p-4 font-mono text-gray-300">${modelB.carb_h_setting || 'Standaard / M-Tronic'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Bougie & Afstand</td>
              <td class="p-4">${modelA.spark_plug || 'NGK BPMR7A'}</td>
              <td class="p-4">${modelB.spark_plug || 'NGK CMR6H'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Kettingsteek / Dikte</td>
              <td class="p-4 font-mono">${modelA.chain_pitch || '.325"'} @ ${modelA.chain_gauge_mm || 1.3} mm</td>
              <td class="p-4 font-mono">${modelB.chain_pitch || '.325"'} @ ${modelB.chain_gauge_mm || 1.3} mm</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Status & Uitvoering</td>
              <td class="p-4">${modelA.is_discontinued ? '<span class="text-amber-400 font-bold">Uit productie (Klassieker)</span>' : '<span class="text-emerald-400 font-bold">Actueel Model</span>'}</td>
              <td class="p-4">${modelB.is_discontinued ? '<span class="text-amber-400 font-bold">Uit productie (Klassieker)</span>' : '<span class="text-emerald-400 font-bold">Actueel Model</span>'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Detailed Buying & Usage Advice -->
    <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4 text-xs text-gray-300 leading-relaxed">
      <h3 class="text-lg font-bold text-white">Welk model is de beste keuze voor u?</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
          <h4 class="font-bold text-orange-400 text-sm">Wanneer kiest u voor de STIHL ${nameA}?</h4>
          <p>
            De <strong>STIHL ${nameA}</strong> staat bekend om zijn betrouwbare ${modelA.displacement_cc || 50} cc motor. Met een gewicht van ${modelA.weight_kg || 4.8} kg is dit een uitstekende keuze voor wie zoekt naar bewezen robuuste techniek met handmatige afstelmogelijkheden.
          </p>
          <a href="/${modelA.category_slug || 'kettingzagen'}/${modelA.slug || slugA}/" class="text-orange-400 font-bold hover:underline inline-block pt-1">Bekijk STIHL ${nameA} Modelgids →</a>
        </div>

        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
          <h4 class="font-bold text-orange-400 text-sm">Wanneer kiest u voor de STIHL ${nameB}?</h4>
          <p>
            De <strong>STIHL ${nameB}</strong> biedt een hoger vermogen van ${modelB.power_hp || 4.1} pk. Dit model is uitgerust met modernere motortechnologie (zoals M-Tronic of lichter vliegwiel) voor snellere gasrespons en maximale zaagprestaties.
          </p>
          <a href="/${modelB.category_slug || 'kettingzagen'}/${modelB.slug || slugB}/" class="text-orange-400 font-bold hover:underline inline-block pt-1">Bekijk STIHL ${nameB} Modelgids →</a>
        </div>
      </div>
    </section>

    <!-- Prominent Decoder CTA -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-3">
      <h3 class="text-base font-bold text-white">Serienummer van uw machine verifiëren?</h3>
      <p class="text-xs text-gray-300">
        Voer het 9-cijferige serienummer van uw STIHL zaag in om te bepalen of het om een ${nameA} of ${nameB} gaat.
      </p>
      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer 9-cijferig serienummer in..." 
          class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500"
          autocomplete="off"
        />
        <button 
          type="submit" 
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Serienummer Controleren</span>
        </button>
      </form>
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
        <a href="/stihl-paspoort/" class="hover:text-orange-400 hover:underline">→ Machinepaspoort Maken</a>
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
