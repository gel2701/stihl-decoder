/**
 * Model Parts Compatibility Page SSR Template Renderer for STIHLDecoder.nl
 * Phase 28 Commercial Parts Cluster Architecture
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderAffiliateLink } from './AffiliateLink.js';
import { getModelVerificationSummary } from '../canonicalData.js';
import { getSafeCategorySlug, getSafeModelPath } from '../publicationRules.js';
import { PRIMARY_ORIGIN } from '../config.js';
import { formatPublicTechnicalValue, getPublicTechnicalDisplayState } from '../publicEvidence.js';

function renderSafeTechnicalValue(model, field, database, formatter) {
  const state = getPublicTechnicalDisplayState(model.slug || model.model_name, field, database);
  if (state.single_value_eligible) {
    return formatPublicTechnicalValue(state, formatter);
  }
  if (state.evidence_status === 'OFFICIAL_CONFLICTED') {
    return 'Bronverschil';
  }
  return 'Niet betrouwbaar gedocumenteerd';
}

export function renderModelPartsPageHtml(model, database, baseUrl = PRIMARY_ORIGIN) {
  const categorySlug = getSafeCategorySlug(model);
  const slug = model.slug || model.id.replace(/_/g, '-');
  const canonicalUrl = categorySlug ? `${baseUrl}/${categorySlug}/${slug}/onderdelen/` : `${baseUrl}/onderdelen-onbekend/${slug}/`;
  const modelPath = getSafeModelPath(model);

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    ...(categorySlug ? [{ name: model.category || 'Modellen', url: `/${categorySlug}/` }] : []),
    { name: `STIHL ${model.model_name}`, url: modelPath || canonicalUrl.replace('/onderdelen/', '/') },
    { name: 'Onderdelen & Vervanging', url: categorySlug ? `/${categorySlug}/${slug}/onderdelen/` : canonicalUrl.replace(baseUrl, '') }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'intent',
    intent: {
      title: `STIHL ${model.model_name} Onderdelen & Compatibiliteitsgids`,
      description: `Bekijk zichtbare onderdeleninformatie en onderhoudscontext voor de STIHL ${model.model_name}. Controleer typeplaatje, uitvoering en bronstatus voordat u onderdelen bestelt.`
    },
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `STIHL ${model.model_name} Onderdelen & Compatibiliteitsgids | STIHLDecoder`,
    description: `Zoekt u onderdelen voor uw STIHL ${model.model_name}? Bekijk zichtbare modeldata, bronstatus en compatibele onderdelen als vertrekpunt voor een handmatige machinecheck.`,
    canonicalUrl,
    ogType: 'article',
    jsonLdData
  });

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);
  const verification = getModelVerificationSummary(model);

  const isChainsaw = categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen';
  const sparkState = getPublicTechnicalDisplayState(slug, 'spark_plug', database);
  const gapState = getPublicTechnicalDisplayState(slug, 'electrode_gap_mm', database);
  const hasSparkData = sparkState.single_value_eligible || gapState.single_value_eligible;

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
          <span class="text-2xs text-gray-400 block -mt-1 font-mono">Model Onderdelen Gids</span>
        </div>
      </a>
      <a href="${modelPath || '/'}" class="text-xs text-orange-400 font-bold hover:underline">
        ← Terug naar STIHL ${model.model_name}
      </a>
    </div>
  </header>

  <!-- Main Container -->
  <main class="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
    ${breadcrumbsHtml}

    <header class="space-y-3 border-b border-gray-800 pb-6">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
        Onderdelen & Vervanging
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${model.model_name} Onderdelen & Compatibiliteitsgids
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Bekijk vervangingsonderdelen voor de STIHL ${model.model_name} op basis van de beschikbare repositorydata. Controleer altijd typeplaatje, uitvoering en bronstatus voordat u bestelt.
      </p>
    </header>

    <!-- Essential Parts Grid -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span>Onderdelenoverzicht STIHL ${model.model_name}</span>
        <span class="text-2xs text-gray-400 font-normal">${verification.badgeLabel}</span>
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        ${hasSparkData ? `<div class="bg-gray-900/70 p-5 rounded-2xl border border-gray-800 space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold text-white text-sm">Bougie & Ontsteking</span>
            <span class="text-2xs font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">Elektrisch</span>
          </div>
          <p class="text-gray-300">• Aanbevolen Bougie: <strong class="text-white font-mono">${renderSafeTechnicalValue(model, 'spark_plug', database)}</strong></p>
          <p class="text-gray-300">• Elektrodenafstand: <strong class="text-white font-mono">${renderSafeTechnicalValue(model, 'electrode_gap_mm', database, (value) => `${value} mm`)}</strong></p>
          <div class="pt-2">
            ${renderAffiliateLink({
              partName: `Bougie voor STIHL ${model.model_name}`,
              searchQuery: `bougie STIHL ${model.model_name}`,
              category: 'spark_plug'
            })}
          </div>
        </div>` : ''}

        ${isChainsaw ? `
          <div class="bg-gray-900/70 p-5 rounded-2xl border border-gray-800 space-y-2">
            <div class="flex justify-between items-center">
              <span class="font-bold text-white text-sm">Zaagketting & Geleideblad</span>
              <span class="text-2xs font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">Snijgarnituur</span>
            </div>
            <p class="text-gray-300">• Technische kettingmaten worden alleen getoond zodra ze per veld betrouwbaar zijn gedocumenteerd.</p>
            <div class="pt-2">
              ${renderAffiliateLink({
                partName: `Zaagketting voor STIHL ${model.model_name}`,
                searchQuery: `zaagketting STIHL ${model.model_name}`,
                category: 'chain'
              })}
            </div>
          </div>
        ` : ''}

        <div class="bg-gray-900/70 p-5 rounded-2xl border border-gray-800 space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold text-white text-sm">Carburateur & Membraanset</span>
            <span class="text-2xs font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">Brandstof</span>
          </div>
          <p class="text-gray-300">• Afstelwaarden worden pas getoond zodra ze per veld aan veilige bronstatus zijn gekoppeld.</p>
          <div class="pt-2">
            ${renderAffiliateLink({
              partName: `Membraanset voor STIHL ${model.model_name}`,
              searchQuery: `carburateur STIHL ${model.model_name}`,
              category: 'carburetor'
            })}
          </div>
        </div>

        <div class="bg-gray-900/70 p-5 rounded-2xl border border-gray-800 space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold text-white text-sm">Luchtfilter & Olie-element</span>
            <span class="text-2xs font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">Filter</span>
          </div>
          <p class="text-gray-300">• Filter- en menggegevens worden niet als technische waarheid getoond zonder veldniveau-evidence.</p>
          <div class="pt-2">
            ${renderAffiliateLink({
              partName: `Luchtfilter voor STIHL ${model.model_name}`,
              searchQuery: `luchtfilter STIHL ${model.model_name}`,
              category: 'air_filter'
            })}
          </div>
        </div>
      </div>
    </section>

    <!-- Safety & Compatibility Warning -->
    <section class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-xs text-amber-200 space-y-2">
      <h3 class="font-bold text-amber-400 text-sm flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        Belangrijk voor aankoop van onderdelen:
      </h3>
      <p>
        Controleer altijd het serienummer van uw STIHL ${model.model_name} op het carter of typeplaatje voordat u onderdelen bestelt. Bij facelift- en M-Tronic generatiewijzigingen kunnen carteronderdelen en vliegwielen verschillen.
      </p>
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
