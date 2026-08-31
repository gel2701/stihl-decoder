/**
 * Data-Driven Model Comparison SSR Template Renderer for STIHLDecoder.nl
 * Phase 28 Comparison Engine
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getModelVerificationSummary } from '../canonicalData.js';
import { getSafeModelPath } from '../publicationRules.js';
import { PRIMARY_ORIGIN } from '../config.js';
import { formatPublicTechnicalValue, getPublicTechnicalDisplayState } from '../publicEvidence.js';

function renderTechnicalValue(model, field, database, formatter) {
  if (!model) return 'Niet betrouwbaar gedocumenteerd';
  const state = getPublicTechnicalDisplayState(model.slug || model.model_name, field, database);
  if (state.single_value_eligible) {
    return formatPublicTechnicalValue(state, formatter);
  }
  if (state.evidence_status === 'OFFICIAL_CONFLICTED') {
    return 'Bronverschil';
  }
  return 'Niet betrouwbaar gedocumenteerd';
}

export function renderComparisonPageHtml(pairSlug, database, baseUrl = PRIMARY_ORIGIN) {
  const parts = pairSlug.split('-vs-');
  const slugA = parts[0] ? parts[0].toLowerCase() : 'ms-260';
  const slugB = parts[1] ? parts[1].toLowerCase() : 'ms-261';

  const models = database.models || [];
  const modelA = models.find(m => m.slug === slugA || m.id.replace(/_/g, '-') === slugA);
  const modelB = models.find(m => m.slug === slugB || m.id.replace(/_/g, '-') === slugB);

  const nameA = modelA ? modelA.model_name : slugA.toUpperCase();
  const nameB = modelB ? modelB.model_name : slugB.toUpperCase();
  const verificationA = modelA ? getModelVerificationSummary(modelA) : null;
  const verificationB = modelB ? getModelVerificationSummary(modelB) : null;
  const modelAPath = getSafeModelPath(modelA);
  const modelBPath = getSafeModelPath(modelB);

  const canonicalUrl = `${baseUrl}/vergelijk/${slugA}-vs-${slugB}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Vergelijkingen', url: null },
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
    description: `Twijfelt u tussen de STIHL ${nameA} en de STIHL ${nameB}? Vergelijk zichtbare modeldata en bronstatus, en controleer de machine-uitvoering voordat u onderdelen of waardeclaims overneemt.`,
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
  <link rel="stylesheet" href="/css/tailwind.css">
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
        Twijfelt u tussen een STIHL ${nameA} en een STIHL ${nameB}? Bekijk onze vergelijking van zichtbare modeldata, technische verschillen en bronstatus. Controleer de uitvoering op typeplaatje of machine voordat u onderdelen of waardeclaims overneemt.
      </p>
    </header>

    <!-- Side-by-Side Comparison Table -->
    <section class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Directe Vergelijkingstabel</span>
        <span class="text-xs text-gray-400 font-normal">Bronstatus zichtbaar per model</span>
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
              <td class="p-4 font-bold text-gray-400">Bronstatus</td>
              <td class="p-4 font-bold text-white">${verificationA ? verificationA.badgeLabel : 'Bronstatus onbekend'}</td>
              <td class="p-4 font-bold text-white">${verificationB ? verificationB.badgeLabel : 'Bronstatus onbekend'}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Motorvermogen</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelA, 'power_kw', database, (value) => `${value} kW`)}</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelB, 'power_kw', database, (value) => `${value} kW`)}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Cilinderinhoud</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelA, 'displacement_cc', database, (value) => `${value} cc`)}</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelB, 'displacement_cc', database, (value) => `${value} cc`)}</td>
            </tr>
            <tr>
              <td class="p-4 font-bold text-gray-400">Gewicht (Kaal motorblok)</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelA, 'weight_kg', database, (value) => `${value} kg`)}</td>
              <td class="p-4 font-bold text-white">${renderTechnicalValue(modelB, 'weight_kg', database, (value) => `${value} kg`)}</td>
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
            De <strong>STIHL ${nameA}</strong> is vooral interessant als de bekende specificaties, onderhoudsstaat en beoogde toepassing beter bij uw gebruik passen. Controleer het typeplaatje en de feitelijke uitvoering voordat u onderdelen of waardeclaims overneemt.
          </p>
          ${modelAPath ? `<a href="${modelAPath}" class="text-orange-400 font-bold hover:underline inline-block pt-1">Bekijk STIHL ${nameA} Modelgids →</a>` : '<span class="text-gray-400 inline-block pt-1">Veilige modelroute ontbreekt</span>'}
        </div>

        <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
          <h4 class="font-bold text-orange-400 text-sm">Wanneer kiest u voor de STIHL ${nameB}?</h4>
          <p>
            De <strong>STIHL ${nameB}</strong> kan aantrekkelijk zijn wanneer de gedocumenteerde specificaties en onderdelenbeschikbaarheid beter aansluiten op uw werk. Gebruik deze vergelijking als vertrekpunt en verifieer de uitvoering op de machine zelf.
          </p>
          ${modelBPath ? `<a href="${modelBPath}" class="text-orange-400 font-bold hover:underline inline-block pt-1">Bekijk STIHL ${nameB} Modelgids →</a>` : '<span class="text-gray-400 inline-block pt-1">Veilige modelroute ontbreekt</span>'}
        </div>
      </div>
    </section>

    <!-- Prominent Decoder CTA -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-3">
      <h3 class="text-base font-bold text-white">Serienummer van uw machine verifiëren?</h3>
      <p class="text-xs text-gray-300">
        Voer het serienummer in voor formaat- en herkomstcontrole. Gebruik daarnaast het typeplaatje om het exacte model te bevestigen.
      </p>
      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer het serienummer in..." 
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
