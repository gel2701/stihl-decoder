/**
 * Data-Driven Intent Landing Page SSR Template Renderer for STIHLDecoder.nl
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';

export function renderIntentPageHtml(intent, database, baseUrl = 'https://stihldecoder.nl') {
  const canonicalUrl = `${baseUrl}/${intent.slug}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: intent.title, url: `/${intent.slug}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'intent',
    intent,
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `${intent.title} | STIHLDecoder`,
    description: intent.description,
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
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Gids & Analyse</span>
          </span>
          <p class="text-xs text-gray-400">Kenniscentrum STIHL Serienummers & Techniek</p>
        </div>
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Zoeken</a>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-4xl mx-auto px-4 py-6 flex-1 w-full space-y-8">
    
    <!-- Breadcrumbs -->
    ${breadcrumbsHtml}

    <!-- Header & H1 Title -->
    <header class="space-y-2">
      <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
        STIHL Kennisbank Gids
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        ${intent.h1 || intent.title}
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        ${intent.intro || intent.description}
      </p>
    </header>

    <!-- Prominent Decoder Tool Form -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 stihl-orange-glow">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <h2 class="text-lg font-bold text-orange-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Serienummer direct analyseren:
        </h2>
        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Instant Checker</span>
      </div>

      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer het 9-cijferige serienummer in..." 
          class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-base placeholder-gray-500 focus:outline-none focus:border-orange-500"
          autocomplete="off"
        />
        <button 
          type="submit" 
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Controleer</span>
        </button>
      </form>
    </section>

    <!-- Main Intent Body Content -->
    <section class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4 text-xs text-gray-300 leading-relaxed">
      ${intent.contentHtml || `<p>${intent.description}</p>`}
    </section>

  </main>

  <!-- Footer with Legal Disclaimer -->
  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel voor reparateurs en verzamelaars. Deze site is niet gelieerd aan, gesponsord door of goedgekeurd door ANDREAS STIHL AG & Co. KG.
      </p>
    </div>
  </footer>

</body>
</html>`;
}
