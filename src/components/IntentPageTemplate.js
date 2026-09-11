/**
 * Data-Driven Intent Landing Page SSR Template Renderer for STIHLDecoder.nl
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getModelVerificationSummary } from '../canonicalData.js';
import { getSafeModelPath } from '../publicationRules.js';
import { PRIMARY_ORIGIN } from '../config.js';

export function renderIntentPageHtml(intent, database, baseUrl = PRIMARY_ORIGIN) {
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
  const models = database.models || [];

  if (intent.slug === 'stihl-paspoort') {
    return renderPassportHubHtml({ intent, database, baseUrl, seoMetaHtml, breadcrumbsHtml, models });
  }

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
        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Formaat- en herkomstcheck</span>
      </div>

      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer het serienummer in..." 
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

    <!-- Popular Models Grid Interlinking -->
    <section class="space-y-3 pt-2">
      <h3 class="text-sm font-bold text-white">Bekijk STIHL Modellen met zichtbare bronstatus:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        ${models.map(m => {
          const verification = getModelVerificationSummary(m);
          const modelPath = getSafeModelPath(m);
          if (!modelPath) {
            return '';
          }
          return `<a href="${modelPath}" class="bg-gray-900 border border-gray-800 p-2.5 rounded-xl hover:border-orange-500 text-gray-200 font-bold block">STIHL ${m.model_name}<span class="block text-2xs text-gray-400 mt-1">${verification.badgeLabel}</span></a>`;
        }).filter(Boolean).join('')}
      </div>
    </section>

    <!-- Internal Linking Hub -->
    <section class="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl space-y-3 text-xs">
      <h3 class="text-sm font-bold text-white">Relevante STIHL Gidsen & Kennisbank:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300">
        <a href="/stihl-serienummer-decoder/" class="hover:text-orange-400 hover:underline">→ Serienummer Decoder</a>
        <a href="/stihl-serienummer/" class="hover:text-orange-400 hover:underline">→ Serienummer Aflezen</a>
        <a href="/stihl-bouwjaar/" class="hover:text-orange-400 hover:underline">→ Bouwjaar Controleren</a>
        <a href="/stihl-diefstalcheck/" class="hover:text-orange-400 hover:underline">→ Diefstalcheck</a>
        <a href="/stihl-waarde/" class="hover:text-orange-400 hover:underline">→ Waardebepaling</a>
        <a href="/stihl-paspoort/" class="hover:text-orange-400 hover:underline">→ Serienummer Rapport Maken</a>
        <a href="/stihl-modellen/" class="hover:text-orange-400 hover:underline">→ STIHL Modellen</a>
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

export function renderPassportHubHtml({ intent, database, baseUrl, seoMetaHtml, breadcrumbsHtml, models } = {}) {
  const modelOptions = (models || []).map((m) => ({
    slug: m.slug || m.id,
    name: m.model_name || m.name,
    category: m.category || 'Kettingzaag',
    series: m.series || m.seriesCode || null
  })).sort((a, b) => a.name.localeCompare(b.name));

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  ${seoMetaHtml}
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">

  <!-- Header -->
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Machine Dossier</span>
          </span>
          <p class="text-xs text-gray-400">Digitaal STIHL Machine Paspoort & Onderhoud</p>
        </div>
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Zoeken</a>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-5xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
    
    <!-- Breadcrumbs -->
    ${breadcrumbsHtml}

    <!-- Header & Hero -->
    <header class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
          Machine Dossier
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Lokaal & Privé
        </span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL Machine Dossier & Paspoort Hub
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Beheer uw eigen STIHL-machines, houd een gestructureerde onderhoudshistorie en herinneringen bij, en raadpleeg direct officiële, geverifieerde fabrieksspecificaties.
      </p>
    </header>

    <!-- Privacy Guarantee Banner -->
    <section class="bg-emerald-950/30 border border-emerald-800/50 p-4 rounded-2xl text-xs text-emerald-200 flex items-start sm:items-center gap-3">
      <span class="text-xl flex-shrink-0">🔒</span>
      <div class="space-y-0.5">
        <strong class="font-bold text-emerald-300 block">Privacy-first opslag:</strong>
        <p class="text-emerald-300/80 leading-relaxed">
          Uw persoonlijke machine- en onderhoudsgegevens worden alleen op dit apparaat opgeslagen. Voor actuele technische specificaties wordt uitsluitend het STIHL-model opgevraagd bij STIHLDecoder.
        </p>
      </div>
    </section>

    <!-- Return-Value Indicator Metrics Panel (Section 16) -->
    <section class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
      <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-center space-y-1">
        <span class="text-2xs text-neutral-400 block font-medium">Opgeslagen machines</span>
        <span id="metric-machines-count" class="text-2xl font-black text-white">0</span>
      </div>
      <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-center space-y-1">
        <span class="text-2xs text-neutral-400 block font-medium">Gepland onderhoud</span>
        <span id="metric-reminders-count" class="text-2xl font-black text-blue-400">0</span>
      </div>
      <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-center space-y-1">
        <span class="text-2xs text-neutral-400 block font-medium">Binnenkort (30 dgn)</span>
        <span id="metric-soon-count" class="text-2xl font-black text-amber-400">0</span>
      </div>
      <div class="bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl text-center space-y-1">
        <span class="text-2xs text-neutral-400 block font-medium">Verlopen onderhoud</span>
        <span id="metric-overdue-count" class="text-2xl font-black text-red-400">0</span>
      </div>
    </section>

    <!-- Privacy Notice -->
    <section class="bg-emerald-950/30 border border-emerald-800/50 p-4 rounded-2xl text-xs text-emerald-200 flex items-start sm:items-center gap-3">
      <span class="text-xl flex-shrink-0">🔒</span>
      <div class="space-y-0.5">
        <strong class="font-bold text-emerald-300 block">Privacy-first opslag:</strong>
        <p class="text-emerald-300/80 leading-relaxed">
          Uw persoonlijke machinegegevens worden alleen op dit apparaat opgeslagen. Voor actuele technische gegevens kan alleen het STIHL-model worden opgevraagd bij STIHLDecoder.
        </p>
      </div>
    </section>

    <!-- Backup & Restore Toolbar (Section 23-31) -->
    <section class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 p-3.5 rounded-2xl text-xs">
      <div class="space-y-0.5">
        <span class="font-bold text-neutral-200 block">Back-up & Beheer</span>
        <p class="text-2xs text-neutral-400">Dit bestand bevat de machinegegevens die u zelf heeft opgeslagen.</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-export-backup" type="button" class="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold px-3 py-2 rounded-xl border border-neutral-700 transition cursor-pointer text-2xs flex items-center gap-1">
          <span>⬇ Exporteer gegevens</span>
        </button>
        <button id="btn-import-backup-trigger" type="button" class="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold px-3 py-2 rounded-xl border border-neutral-700 transition cursor-pointer text-2xs flex items-center gap-1">
          <span>⬆ Importeer back-up</span>
        </button>
        <input type="file" id="input-import-backup-file" accept=".json" class="hidden" />
      </div>
    </section>

    <!-- Machines Toolbar & Filters -->
    <section class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span>Mijn Machines</span>
          <span id="dossier-count-badge" class="text-xs bg-neutral-800 text-neutral-300 px-2.5 py-0.5 rounded-full font-mono font-bold">0</span>
        </h2>
      </div>

      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        <!-- Filter buttons -->
        <div class="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-2xs">
          <button id="filter-btn-all" class="px-2.5 py-1 rounded-lg font-bold bg-orange-600 text-white cursor-pointer">Alle (<span id="filter-count-all">0</span>)</button>
          <button id="filter-btn-soon" class="px-2.5 py-1 rounded-lg font-bold text-neutral-400 hover:text-white cursor-pointer">Binnenkort (<span id="filter-count-soon">0</span>)</button>
          <button id="filter-btn-overdue" class="px-2.5 py-1 rounded-lg font-bold text-neutral-400 hover:text-white cursor-pointer">Verlopen (<span id="filter-count-overdue">0</span>)</button>
        </div>

        <button id="btn-open-add" class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer">
          <span>➕ Machine toevoegen</span>
        </button>
      </div>
    </section>

    <!-- Storage Status Alert -->
    <div id="storage-status-alert" class="hidden p-3.5 rounded-xl text-xs font-semibold"></div>

    <!-- Dossier Grid Container -->
    <section id="dossier-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4"></section>

    <!-- Empty State Container -->
    <section id="dossier-empty" class="hidden bg-neutral-900/50 border border-neutral-800 p-8 rounded-2xl text-center space-y-4">
      <div class="w-14 h-14 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center mx-auto text-2xl font-bold">
        📋
      </div>
      <div class="space-y-1">
        <h3 id="empty-title" class="text-base font-bold text-white">Nog geen machines opgeslagen</h3>
        <p id="empty-desc" class="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
          Voeg uw eerste STIHL-machine toe om onderhoudsnotities bij te houden en altijd direct toegang te hebben tot geverifieerde fabrieksspecificaties.
        </p>
      </div>
      <div class="flex flex-col sm:flex-row justify-center gap-3 pt-2">
        <button id="btn-empty-add" class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition cursor-pointer shadow-md">
          ➕ Voeg je eerste machine toe
        </button>
        <a href="/" class="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs px-5 py-3 rounded-xl transition text-center">
          🔍 Serienummer decoderen
        </a>
      </div>
    </section>

  </main>

  <!-- Add Machine Modal -->
  <div id="modal-add" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          <span>➕ Machine toevoegen aan dossier</span>
        </h3>
        <button id="btn-close-add" class="text-neutral-400 hover:text-white text-lg font-bold p-1 cursor-pointer">✕</button>
      </div>

      <form id="form-add-machine" class="space-y-3.5 text-xs">
        <div>
          <label for="select-model" class="block font-bold text-neutral-300 mb-1">Kies STIHL Model *</label>
          <select id="select-model" class="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-orange-500" required>
            <option value="">-- Selecteer model --</option>
            ${modelOptions.map((m) => `<option value="${m.slug}" data-name="${m.name}" data-category="${m.category}" data-series="${m.series || ''}">STIHL ${m.name} (${m.category})</option>`).join('')}
          </select>
        </div>

        <div class="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl space-y-1.5">
          <label for="check-confirm-model" class="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" id="check-confirm-model" class="mt-0.5 rounded border-neutral-700 text-orange-600 focus:ring-orange-500 cursor-pointer" required>
            <span class="text-neutral-200 font-semibold leading-tight">
              Ik bevestig dat dit mijn machinemodel is *
            </span>
          </label>
          <p class="text-2xs text-neutral-400 pl-5 leading-relaxed">
            Voorbeeld: U heeft de machine fysiek in bezit of gecontroleerd via het typeplaatje.
          </p>
        </div>

        <div>
          <label for="input-nickname" class="block font-bold text-neutral-300 mb-1">Bijnaam / Omschrijving (optioneel)</label>
          <input type="text" id="input-nickname" maxlength="50" placeholder="bv. Werkplaatszaag, Mijn bosmaaier" class="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500">
        </div>

        <div>
          <label for="input-serial" class="block font-bold text-neutral-300 mb-1">Serienummer (optioneel)</label>
          <input type="text" id="input-serial" maxlength="30" placeholder="bv. 184592301" class="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-orange-500">
          <span class="block text-2xs text-neutral-400 mt-1">Blijft uitsluitend lokaal opgeslagen als gebruikersinvoer.</span>
        </div>

        <div>
          <label for="input-purchase-year" class="block font-bold text-neutral-300 mb-1">Aankoopjaar (optioneel)</label>
          <input type="number" id="input-purchase-year" min="1950" max="2099" placeholder="bv. 2021" class="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-orange-500">
          <span class="block text-2xs text-neutral-400 mt-1">Let op: Wordt geregistreerd als <em>aankoopjaar</em> (door gebruiker opgegeven), géén fabrieksbouwjaar.</span>
        </div>

        <div>
          <label for="input-last-service" class="block font-bold text-neutral-300 mb-1">Laatste onderhoud (optioneel)</label>
          <input type="date" id="input-last-service" class="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2.5 text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-orange-500">
          <span class="block text-2xs text-neutral-400 mt-1">Datum van laatste onderhoud of inspectie (door gebruiker opgegeven).</span>
        </div>

        <div id="add-error" class="hidden p-3 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs font-semibold"></div>

        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
          <button type="button" id="btn-cancel-add" class="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold cursor-pointer">Annuleren</button>
          <button type="submit" class="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold cursor-pointer shadow-md">Opslaan in dossier</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Detail / Dossier Modal -->
  <div id="modal-detail" class="hidden fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
    <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-5 sm:p-7 space-y-5 shadow-2xl my-auto text-xs relative max-h-[90vh] overflow-y-auto">
      
      <!-- Top header -->
      <div class="flex items-start justify-between border-b border-neutral-800 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <span id="detail-category-badge" class="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-neutral-800 text-neutral-300"></span>
            <span id="detail-status-badge" class="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30"></span>
          </div>
          <h3 id="detail-title" class="text-2xl font-black text-white mt-1"></h3>
          <p id="detail-nickname" class="text-xs text-orange-400 font-bold mt-0.5"></p>
        </div>
        <button id="btn-close-detail" class="text-neutral-400 hover:text-white text-xl font-bold p-1 cursor-pointer">✕</button>
      </div>

      <!-- Section 1: Identiteit & Gebruikersdata -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">1. Identiteit & Machinegegevens</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
          <div>
            <span class="text-2xs text-neutral-500 block">Modelidentiteit</span>
            <span id="detail-identity-text" class="text-white font-bold"></span>
          </div>
          <div>
            <span class="text-2xs text-neutral-500 block">Serienummer (door gebruiker ingevoerd)</span>
            <span id="detail-serial-text" class="font-mono text-white font-bold"></span>
          </div>
          <div>
            <span class="text-2xs text-neutral-500 block">Aankoopjaar (door gebruiker opgegeven)</span>
            <span id="detail-year-text" class="text-neutral-300 font-semibold"></span>
            <span class="text-3xs text-neutral-500 block">Géén onafhankelijk bouwjaar</span>
          </div>
          <div>
            <span class="text-2xs text-neutral-500 block">Laatste onderhoud (handmatig opgegeven)</span>
            <div class="flex items-center gap-2 mt-0.5">
              <span id="detail-last-service-text" class="text-neutral-300 font-semibold"></span>
              <button type="button" id="btn-edit-last-service" class="text-3xs text-orange-400 hover:text-orange-300 underline cursor-pointer">Bewerken</button>
            </div>
            <div id="edit-last-service-box" class="hidden mt-1.5 p-2 bg-neutral-900 rounded-lg border border-neutral-800 space-y-1.5">
              <input type="date" id="input-edit-last-service" class="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-orange-500">
              <div class="flex items-center gap-1.5">
                <button type="button" id="btn-save-last-service" class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-3xs px-2 py-1 rounded cursor-pointer">Opslaan</button>
                <button type="button" id="btn-clear-last-service" class="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-3xs px-2 py-1 rounded cursor-pointer">Wissen</button>
                <button type="button" id="btn-cancel-last-service" class="text-neutral-400 hover:text-neutral-200 text-3xs px-1 cursor-pointer">Annuleren</button>
              </div>
            </div>
            <span class="text-3xs text-neutral-500 block mt-1">Effectief recentste: <strong id="detail-effective-service-text" class="text-neutral-300 font-normal"></strong></span>
          </div>
        </div>
      </section>

      <!-- Section 2: Officiële Specificaties (Live Gated) -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">2. Officiële Technische Gegevens (Live Geverifieerd)</h4>
          <span id="detail-source-badge" class="text-2xs text-emerald-400 font-mono font-semibold"></span>
        </div>
        <div id="detail-specs-container" class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-1.5">
          <div id="detail-specs-loading" class="text-neutral-500 py-2 text-center">Specificaties laden via actuele evidence store...</div>
        </div>
      </section>

      <!-- Section 3: Onderhouds- & Afstelgegevens -->
      <section class="space-y-2">
        <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">3. Onderhouds- & Afstelgegevens</h4>
        <div id="detail-maint-container" class="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-1.5">
          <div class="text-neutral-500 py-2 text-center">Onderhoudsgegevens worden geladen...</div>
        </div>
      </section>

      <!-- Section 4: Gestructureerde Onderhoudshistorie (Phase 38B) -->
      <section class="space-y-2.5">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">4. Onderhoudshistorie</h4>
          <span class="text-2xs text-neutral-500">Uitgevoerd onderhoud (door gebruiker opgegeven)</span>
        </div>

        <!-- Add maintenance event form -->
        <form id="form-add-event" class="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label for="input-event-date" class="block text-3xs font-bold text-neutral-400 mb-0.5">Datum *</label>
              <input type="date" id="input-event-date" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500" required>
            </div>
            <div>
              <label for="select-event-type" class="block text-3xs font-bold text-neutral-400 mb-0.5">Categorie *</label>
              <select id="select-event-type" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
                <option value="GENERAL_SERVICE">Algemene beurt</option>
                <option value="SPARK_PLUG">Bougie</option>
                <option value="AIR_FILTER">Luchtfilter</option>
                <option value="FUEL_FILTER">Brandstoffilter</option>
                <option value="CHAIN">Zaagketting</option>
                <option value="BAR">Zaagblad</option>
                <option value="CARBURETOR">Carburateur</option>
                <option value="FUEL_SYSTEM">Brandstofsysteem</option>
                <option value="STARTER">Starter / Koord</option>
                <option value="CLUTCH">Koppeling</option>
                <option value="CUTTING_ATTACHMENT">Snijgarnituur</option>
                <option value="OTHER">Overig</option>
              </select>
            </div>
            <div>
              <label for="input-event-label" class="block text-3xs font-bold text-neutral-400 mb-0.5">Omschrijving *</label>
              <input type="text" id="input-event-label" maxlength="100" placeholder="bv. Bougie vervangen" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-orange-500" required>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 pt-1">
            <input type="text" id="input-event-note" maxlength="500" placeholder="Notitie (optioneel, bv. NGK BPMR7A gemonteerd)" class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-orange-500">
            <button type="submit" class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap">
              Onderhoud toevoegen
            </button>
          </div>
        </form>

        <!-- Events timeline list -->
        <div id="detail-events-list" class="space-y-1.5"></div>
      </section>

      <!-- Section 5: Onderhoudsplanning & Herinneringen (Phase 38B) -->
      <section class="space-y-2.5">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">5. Onderhoudsplanning & Herinneringen</h4>
          <span class="text-2xs text-neutral-500">Gebruikersplanning (geen fabrieksinterval)</span>
        </div>

        <!-- Add reminder form -->
        <form id="form-add-reminder" class="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label for="input-rem-date" class="block text-3xs font-bold text-neutral-400 mb-0.5">Herinneringsdatum *</label>
              <input type="date" id="input-rem-date" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500" required>
            </div>
            <div>
              <label for="select-rem-type" class="block text-3xs font-bold text-neutral-400 mb-0.5">Categorie *</label>
              <select id="select-rem-type" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-orange-500">
                <option value="GENERAL_SERVICE">Algemene beurt</option>
                <option value="SPARK_PLUG">Bougie controleren/vervangen</option>
                <option value="AIR_FILTER">Luchtfilter reinigen</option>
                <option value="FUEL_FILTER">Brandstoffilter vervangen</option>
                <option value="CHAIN">Ketting slijpen</option>
                <option value="BAR">Zaagblad ontbramen</option>
                <option value="CARBURETOR">Carburateur nazien</option>
                <option value="FUEL_SYSTEM">Brandstof verversen</option>
                <option value="STARTER">Starter inspecteren</option>
                <option value="CLUTCH">Koppeling controleren</option>
                <option value="CUTTING_ATTACHMENT">Snijgarnituur nakijken</option>
                <option value="OTHER">Overig onderhoud</option>
              </select>
            </div>
            <div>
              <label for="input-rem-label" class="block text-3xs font-bold text-neutral-400 mb-0.5">Taakomschrijving *</label>
              <input type="text" id="input-rem-label" maxlength="100" placeholder="bv. Luchtfilter reinigen" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-orange-500" required>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 pt-1">
            <input type="text" id="input-rem-note" maxlength="500" placeholder="Extra opmerking (optioneel)" class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-orange-500">
            <button type="submit" class="bg-neutral-800 hover:bg-orange-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap">
              Onderhoud plannen
            </button>
          </div>
        </form>

        <!-- Reminders list -->
        <div id="detail-reminders-list" class="space-y-1.5"></div>
      </section>

      <!-- Section 6: Eigen Notities -->
      <section class="space-y-2.5">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-neutral-400">6. Vrije Notities</h4>
          <span class="text-2xs text-neutral-500">Persoonlijke notities</span>
        </div>

        <!-- Add note form -->
        <form id="form-add-note" class="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2">
          <div class="flex flex-col sm:flex-row gap-2">
            <input type="date" id="input-note-date" class="bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500">
            <input type="text" id="input-note-text" maxlength="500" placeholder="bv. Zaagblad 40cm aangeschaft..." class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-orange-500" required>
            <button type="submit" class="bg-neutral-800 hover:bg-orange-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap">Notitie opslaan</button>
          </div>
        </form>

        <!-- Notes list -->
        <div id="detail-notes-list" class="space-y-1.5"></div>
      </section>

      <!-- Section 7: Officiële Bronnen & Disclaimer -->
      <section class="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80 space-y-1 text-2xs text-neutral-400">
        <div id="detail-source-meta" class="font-mono text-neutral-300"></div>
        <p class="leading-relaxed">
          Onafhankelijk samengesteld via STIHLDecoder.nl. Technische gegevens zijn gekoppeld op basis van het geverifieerde machinemodel.
        </p>
      </section>

      <!-- Bottom actions -->
      <div class="flex items-center justify-between pt-3 border-t border-neutral-800">
        <button id="btn-delete-dossier" class="text-red-400 hover:text-red-300 font-bold text-xs cursor-pointer flex items-center gap-1">
          <span>🗑️ Machine verwijderen</span>
        </button>
        <button id="btn-close-detail-bottom" class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl cursor-pointer">
          Sluiten
        </button>
      </div>

    </div>
  </div>

  <!-- Complete Reminder Modal -->
  <div id="modal-complete-rem" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl relative text-xs">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
        <h4 class="text-sm font-bold text-white">Herinnering afronden</h4>
        <button id="btn-close-complete-rem" class="text-neutral-400 hover:text-white font-bold p-1 cursor-pointer">✕</button>
      </div>
      <p id="complete-rem-label" class="text-white font-medium"></p>
      
      <div class="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2.5">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" id="check-create-service-event" class="mt-0.5 rounded border-neutral-700 text-orange-600 focus:ring-orange-500 cursor-pointer">
          <span class="text-neutral-200 font-semibold leading-tight">
            Ook toevoegen aan onderhoudshistorie
          </span>
        </label>
        
        <div id="complete-event-date-wrap" class="hidden space-y-1 pt-1 border-t border-neutral-900">
          <label for="input-complete-event-date" class="block text-3xs font-bold text-neutral-400">Uitvoerdatum onderhoud</label>
          <input type="date" id="input-complete-event-date" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500">
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
        <button type="button" id="btn-cancel-complete-rem" class="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold cursor-pointer">Annuleren</button>
        <button type="button" id="btn-confirm-complete-rem" class="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer">Bevestigen</button>
      </div>
    </div>
  </div>

  <!-- Footer with Legal Disclaimer -->
  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel voor reparateurs en verzamelaars. Deze site is niet gelieerd aan, gesponsord door of goedgekeurd door ANDREAS STIHL AG & Co. KG.
      </p>
    </div>
  </footer>

  <!-- Machine Dossier Hub Client Logic (Browser-Safe, Zero Third-Party JS) -->
  <script type="module">
    import {
      loadDossiers,
      saveDossier,
      deleteDossier,
      createDossierObject,
      updateDossierUserData,
      addDossierNote,
      addMaintenanceEvent,
      deleteMaintenanceEvent,
      addReminder,
      deleteReminder,
      completeReminder,
      generateReminderIcs,
      exportDossierBackup,
      importDossierBackup,
      evaluateReminderState,
      isWithinSoonWindow,
      calculateEffectiveLastServiceDate,
      getLocalTodayString,
      setSafeText,
      IDENTITY_STATUSES,
      IDENTITY_SOURCES,
      REMINDER_STATES,
      hydrateDossierEvidence
    } from '/src/components/MachineDossierManager.js';

    let activeDossierId = null;
    let currentFilter = 'all'; // 'all' | 'soon' | 'overdue'
    let pendingCompleteReminderId = null;

    function getDossierMetrics(dossiers) {
      const todayStr = getLocalTodayString();
      let totalReminders = 0;
      let soonCount = 0;
      let overdueCount = 0;

      for (const d of dossiers) {
        const reminders = (d.maintenance && Array.isArray(d.maintenance.reminders)) ? d.maintenance.reminders : [];
        for (const rem of reminders) {
          if (!rem.completed) {
            totalReminders++;
            const state = evaluateReminderState(rem, todayStr);
            if (state === REMINDER_STATES.VERLOPEN) {
              overdueCount++;
            } else if (isWithinSoonWindow(rem.due_date, todayStr)) {
              soonCount++;
            }
          }
        }
      }

      return {
        machineCount: dossiers.length,
        totalReminders,
        soonCount,
        overdueCount
      };
    }

    function renderDossierList() {
      const dossiers = loadDossiers();
      const grid = document.getElementById('dossier-grid');
      const empty = document.getElementById('dossier-empty');
      const badge = document.getElementById('dossier-count-badge');
      const todayStr = getLocalTodayString();

      // Compute metrics
      const metrics = getDossierMetrics(dossiers);
      document.getElementById('metric-machines-count').textContent = String(metrics.machineCount);
      document.getElementById('metric-reminders-count').textContent = String(metrics.totalReminders);
      document.getElementById('metric-soon-count').textContent = String(metrics.soonCount);
      document.getElementById('metric-overdue-count').textContent = String(metrics.overdueCount);

      document.getElementById('filter-count-all').textContent = String(metrics.machineCount);
      document.getElementById('filter-count-soon').textContent = String(metrics.soonCount);
      document.getElementById('filter-count-overdue').textContent = String(metrics.overdueCount);

      badge.textContent = String(dossiers.length);
      grid.replaceChildren();

      // Filter dossiers
      let filteredDossiers = dossiers;
      if (currentFilter === 'soon') {
        filteredDossiers = dossiers.filter((d) => {
          const rems = (d.maintenance && Array.isArray(d.maintenance.reminders)) ? d.maintenance.reminders : [];
          return rems.some((r) => !r.completed && isWithinSoonWindow(r.due_date, todayStr));
        });
      } else if (currentFilter === 'overdue') {
        filteredDossiers = dossiers.filter((d) => {
          const rems = (d.maintenance && Array.isArray(d.maintenance.reminders)) ? d.maintenance.reminders : [];
          return rems.some((r) => !r.completed && evaluateReminderState(r, todayStr) === REMINDER_STATES.VERLOPEN);
        });
      }

      if (filteredDossiers.length === 0) {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
        if (dossiers.length > 0) {
          document.getElementById('empty-title').textContent = 'Geen machines in dit filter';
          document.getElementById('empty-desc').textContent = 'Er zijn momenteel geen machines die voldoen aan het geselecteerde onderhoudsfilter.';
        } else {
          document.getElementById('empty-title').textContent = 'Nog geen machines opgeslagen';
          document.getElementById('empty-desc').textContent = 'Voeg uw eerste STIHL-machine toe om onderhoudsnotities bij te houden en altijd direct toegang te hebben tot geverifieerde fabrieksspecificaties.';
        }
        return;
      }

      grid.classList.remove('hidden');
      empty.classList.add('hidden');

      for (const d of filteredDossiers) {
        const card = document.createElement('article');
        card.className = 'bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 p-4 sm:p-5 rounded-2xl space-y-3 transition shadow-lg flex flex-col justify-between';

        const topDiv = document.createElement('div');
        topDiv.className = 'space-y-1.5';

        const tagRow = document.createElement('div');
        tagRow.className = 'flex items-center justify-between text-2xs';

        const catSpan = document.createElement('span');
        catSpan.className = 'font-mono uppercase font-bold text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded';
        setSafeText(catSpan, d.identity.category);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'font-bold text-orange-400';
        statusSpan.textContent = d.identity.identity_status === IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED
          ? '✓ Exact model'
          : '✓ Door gebruiker bevestigd';

        tagRow.appendChild(catSpan);
        tagRow.appendChild(statusSpan);

        const title = document.createElement('h3');
        title.className = 'text-xl font-black text-white tracking-tight';
        title.textContent = 'STIHL ' + d.identity.model_name;

        const nicknameP = document.createElement('p');
        nicknameP.className = 'text-xs text-orange-300 font-bold';
        if (d.machine && d.machine.nickname) {
          setSafeText(nicknameP, '„' + d.machine.nickname + '”');
        }

        const metaDiv = document.createElement('div');
        metaDiv.className = 'text-2xs text-neutral-400 space-y-0.5 pt-1';

        const serialP = document.createElement('p');
        serialP.className = 'font-mono';
        if (d.machine && d.machine.serial_number) {
          serialP.textContent = 'Serienummer: ' + d.machine.serial_number + ' (opgegeven)';
        } else {
          serialP.textContent = 'Serienummer: Niet opgegeven';
        }

        const effectiveDate = calculateEffectiveLastServiceDate(d);
        const serviceP = document.createElement('p');
        serviceP.textContent = 'Laatste onderhoud: ' + (effectiveDate || 'Nog geen');

        const activeReminders = (d.maintenance && Array.isArray(d.maintenance.reminders))
          ? d.maintenance.reminders.filter((r) => !r.completed)
          : [];
        const remP = document.createElement('p');
        remP.textContent = 'Gepland onderhoud: ' + activeReminders.length;

        metaDiv.appendChild(serialP);
        metaDiv.appendChild(serviceP);
        metaDiv.appendChild(remP);

        topDiv.appendChild(tagRow);
        topDiv.appendChild(title);
        if (d.machine && d.machine.nickname) topDiv.appendChild(nicknameP);
        topDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'flex-1 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-bold py-2 rounded-xl transition cursor-pointer';
        viewBtn.textContent = 'Bekijk dossier →';
        viewBtn.onclick = () => openDossierDetail(d.dossier_id);

        actionsDiv.appendChild(viewBtn);

        card.appendChild(topDiv);
        card.appendChild(actionsDiv);
        grid.appendChild(card);
      }
    }

    function renderEventsList(dossier) {
      const list = document.getElementById('detail-events-list');
      list.replaceChildren();

      const events = (dossier.maintenance && Array.isArray(dossier.maintenance.events)) ? dossier.maintenance.events : [];
      if (events.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-neutral-500 text-2xs py-2 italic text-center';
        empty.textContent = 'Nog geen onderhoud vastgelegd.';
        list.appendChild(empty);
        return;
      }

      for (const ev of events) {
        const item = document.createElement('div');
        item.className = 'bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-start justify-between gap-2';

        const textDiv = document.createElement('div');
        textDiv.className = 'space-y-0.5 flex-1';

        const metaRow = document.createElement('div');
        metaRow.className = 'flex items-center gap-2 text-3xs';

        const dSpan = document.createElement('span');
        dSpan.className = 'font-mono text-neutral-400 font-bold';
        dSpan.textContent = ev.date;

        const typeBadge = document.createElement('span');
        typeBadge.className = 'px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 font-mono';
        typeBadge.textContent = ev.type || 'GENERAL_SERVICE';

        metaRow.appendChild(dSpan);
        metaRow.appendChild(typeBadge);

        const labelP = document.createElement('p');
        labelP.className = 'text-xs text-white font-bold';
        setSafeText(labelP, ev.label);

        textDiv.appendChild(metaRow);
        textDiv.appendChild(labelP);

        if (ev.note) {
          const noteP = document.createElement('p');
          noteP.className = 'text-2xs text-neutral-400';
          setSafeText(noteP, ev.note);
          textDiv.appendChild(noteP);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'text-neutral-500 hover:text-red-400 text-xs p-1 cursor-pointer';
        delBtn.textContent = '🗑️';
        delBtn.onclick = () => {
          deleteMaintenanceEvent(dossier.dossier_id, ev.id);
          const updated = loadDossiers().find((item) => item.dossier_id === dossier.dossier_id);
          if (updated) {
            renderEventsList(updated);
            setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(updated) || 'Nog geen');
            renderDossierList();
          }
        };

        item.appendChild(textDiv);
        item.appendChild(delBtn);
        list.appendChild(item);
      }
    }

    function renderRemindersList(dossier) {
      const list = document.getElementById('detail-reminders-list');
      list.replaceChildren();

      const reminders = (dossier.maintenance && Array.isArray(dossier.maintenance.reminders)) ? dossier.maintenance.reminders : [];
      if (reminders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-neutral-500 text-2xs py-2 italic text-center';
        empty.textContent = 'Geen onderhoud gepland.';
        list.appendChild(empty);
        return;
      }

      const todayStr = getLocalTodayString();

      for (const rem of reminders) {
        const state = evaluateReminderState(rem, todayStr);
        const item = document.createElement('div');
        item.className = 'bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2';

        const textDiv = document.createElement('div');
        textDiv.className = 'space-y-0.5 flex-1';

        const metaRow = document.createElement('div');
        metaRow.className = 'flex items-center gap-2 text-3xs';

        const stateBadge = document.createElement('span');
        if (state === REMINDER_STATES.AFGEROND) {
          stateBadge.className = 'px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
          stateBadge.textContent = '✓ Afgerond';
        } else if (state === REMINDER_STATES.VERLOPEN) {
          stateBadge.className = 'px-1.5 py-0.5 rounded font-bold bg-red-500/20 text-red-400 border border-red-500/30';
          stateBadge.textContent = '⚠ Verlopen';
        } else if (state === REMINDER_STATES.VANDAAG) {
          stateBadge.className = 'px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
          stateBadge.textContent = '● Vandaag';
        } else {
          stateBadge.className = 'px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30';
          stateBadge.textContent = 'Gepland';
        }

        const dSpan = document.createElement('span');
        dSpan.className = 'font-mono text-neutral-400';
        dSpan.textContent = rem.due_date;

        metaRow.appendChild(stateBadge);
        metaRow.appendChild(dSpan);

        const labelP = document.createElement('p');
        labelP.className = 'text-xs text-white font-bold';
        setSafeText(labelP, rem.label);

        textDiv.appendChild(metaRow);
        textDiv.appendChild(labelP);

        if (rem.note) {
          const noteP = document.createElement('p');
          noteP.className = 'text-2xs text-neutral-400';
          setSafeText(noteP, rem.note);
          textDiv.appendChild(noteP);
        }

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'flex items-center gap-1.5 self-end sm:self-center';

        if (!rem.completed) {
          const completeBtn = document.createElement('button');
          completeBtn.type = 'button';
          completeBtn.className = 'px-2 py-1 rounded bg-emerald-700/50 hover:bg-emerald-600 text-emerald-200 text-3xs font-bold cursor-pointer';
          completeBtn.textContent = '✓ Afronden';
          completeBtn.onclick = () => openCompleteReminderModal(rem);
          actionsDiv.appendChild(completeBtn);
        }

        const icsBtn = document.createElement('button');
        icsBtn.type = 'button';
        icsBtn.className = 'px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-3xs font-bold cursor-pointer';
        icsBtn.textContent = '📅 .ics';
        icsBtn.onclick = () => {
          const icsContent = generateReminderIcs({
            modelName: dossier.identity.model_name,
            dueDate: rem.due_date,
            type: rem.type,
            label: rem.label
          });
          downloadTextFile(icsContent, 'onderhoud-stihl-' + dossier.identity.model_slug + '-' + rem.due_date + '.ics', 'text/calendar;charset=utf-8');
        };
        actionsDiv.appendChild(icsBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'text-neutral-500 hover:text-red-400 text-xs p-1 cursor-pointer';
        delBtn.textContent = '🗑️';
        delBtn.onclick = () => {
          deleteReminder(dossier.dossier_id, rem.id);
          const updated = loadDossiers().find((item) => item.dossier_id === dossier.dossier_id);
          if (updated) {
            renderRemindersList(updated);
            renderDossierList();
          }
        };
        actionsDiv.appendChild(delBtn);

        item.appendChild(textDiv);
        item.appendChild(actionsDiv);
        list.appendChild(item);
      }
    }

    function renderNotesList(dossier) {
      const list = document.getElementById('detail-notes-list');
      list.replaceChildren();

      const notes = (dossier.maintenance && Array.isArray(dossier.maintenance.notes)) ? dossier.maintenance.notes : [];
      if (notes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-neutral-500 text-2xs py-1 italic text-center';
        empty.textContent = 'Nog geen notities geregistreerd.';
        list.appendChild(empty);
        return;
      }

      for (const note of notes) {
        const item = document.createElement('div');
        item.className = 'bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 flex items-start justify-between gap-2';

        const textDiv = document.createElement('div');
        textDiv.className = 'space-y-0.5';

        const dSpan = document.createElement('span');
        dSpan.className = 'text-3xs font-mono text-neutral-500 block';
        dSpan.textContent = note.date;

        const p = document.createElement('p');
        p.className = 'text-xs text-neutral-200';
        setSafeText(p, note.text);

        textDiv.appendChild(dSpan);
        textDiv.appendChild(p);
        item.appendChild(textDiv);
        list.appendChild(item);
      }
    }

    function downloadTextFile(content, fileName, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function openCompleteReminderModal(rem) {
      pendingCompleteReminderId = rem.id;
      const modal = document.getElementById('modal-complete-rem');
      setSafeText(document.getElementById('complete-rem-label'), rem.label);
      document.getElementById('check-create-service-event').checked = false;
      document.getElementById('complete-event-date-wrap').classList.add('hidden');
      document.getElementById('input-complete-event-date').value = getLocalTodayString();
      modal.classList.remove('hidden');
    }

    async function openDossierDetail(dossierId) {
      const dossiers = loadDossiers();
      const d = dossiers.find((item) => item.dossier_id === dossierId);
      if (!d) return;

      activeDossierId = d.dossier_id;

      const modal = document.getElementById('modal-detail');
      modal.classList.remove('hidden');

      setSafeText(document.getElementById('detail-title'), 'STIHL ' + d.identity.model_name);
      setSafeText(document.getElementById('detail-nickname'), d.machine.nickname ? '„' + d.machine.nickname + '”' : '');
      setSafeText(document.getElementById('detail-category-badge'), d.identity.category);

      const statusBadge = document.getElementById('detail-status-badge');
      if (d.identity.identity_status === IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED) {
        statusBadge.textContent = 'Exact model geïdentificeerd';
      } else {
        statusBadge.textContent = 'Model door gebruiker bevestigd';
      }

      setSafeText(document.getElementById('detail-identity-text'), d.identity.model_name + ' (' + d.identity.category + ')');
      setSafeText(document.getElementById('detail-serial-text'), d.machine.serial_number || 'Niet opgegeven');
      setSafeText(document.getElementById('detail-year-text'), d.machine.purchase_year ? String(d.machine.purchase_year) : 'Niet opgegeven');
      setSafeText(document.getElementById('detail-last-service-text'), (d.maintenance && d.maintenance.last_service_date) ? d.maintenance.last_service_date : 'Nog geen');
      setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(d) || 'Nog geen');
      document.getElementById('edit-last-service-box')?.classList.add('hidden');

      // Set default date inputs to today
      const todayStr = getLocalTodayString();
      document.getElementById('input-event-date').value = todayStr;
      document.getElementById('input-rem-date').value = todayStr;
      document.getElementById('input-note-date').value = todayStr;

      renderEventsList(d);
      renderRemindersList(d);
      renderNotesList(d);

      // Hydrate official specs dynamically
      const specsContainer = document.getElementById('detail-specs-container');
      const maintContainer = document.getElementById('detail-maint-container');
      const sourceBadge = document.getElementById('detail-source-badge');
      const sourceMeta = document.getElementById('detail-source-meta');

      specsContainer.replaceChildren();
      maintContainer.replaceChildren();

      const loadingP = document.createElement('div');
      loadingP.className = 'text-neutral-500 py-2 text-center';
      loadingP.textContent = 'Specificaties laden via actuele evidence store...';
      specsContainer.appendChild(loadingP);

      const res = await hydrateDossierEvidence(d);
      specsContainer.replaceChildren();
      maintContainer.replaceChildren();

      if (!res.success || !res.evidence) {
        const errDiv = document.createElement('div');
        errDiv.className = 'text-neutral-400 py-2 text-center';
        errDiv.textContent = 'Officiële gegevens tijdelijk niet beschikbaar';
        specsContainer.appendChild(errDiv);
        sourceBadge.textContent = 'Tijdelijk niet beschikbaar';
        sourceMeta.textContent = 'Officiële bronverificatie niet beschikbaar.';
        return;
      }

      const ev = res.evidence;
      sourceBadge.textContent = ev.sourceStatusLabel || 'Geverifieerde bron';
      sourceMeta.textContent = 'Bronstatus: ' + (ev.sourceStatus || 'OFFICIAL_DOCUMENTED');

      const specs = ev.technicalSpecs || {};
      const fields = ev.publicEvidenceFields || {};

      // Category specs
      const specList = [
        { key: 'displacement_cc', label: 'Cilinderinhoud', unit: 'cc' },
        { key: 'power_kw', label: 'Vermogen', unit: 'kW' },
        { key: 'power_hp', label: 'Vermogen', unit: 'pk' },
        { key: 'bore_mm', label: 'Boring', unit: 'mm' },
        { key: 'stroke_mm', label: 'Slag', unit: 'mm' },
        { key: 'weight_kg', label: 'Gewicht', unit: 'kg' }
      ];

      let renderedSpecCount = 0;
      for (const item of specList) {
        if (specs[item.key] !== undefined) {
          const row = document.createElement('div');
          row.className = 'flex justify-between items-center py-1 border-b border-neutral-900 text-xs';
          
          const lSpan = document.createElement('span');
          lSpan.className = 'text-neutral-400';
          lSpan.textContent = item.label;

          const vSpan = document.createElement('span');
          vSpan.className = 'font-mono text-white font-bold';
          vSpan.textContent = specs[item.key] + ' ' + item.unit;

          row.appendChild(lSpan);
          row.appendChild(vSpan);
          specsContainer.appendChild(row);
          renderedSpecCount++;
        }
      }

      // 046 stroke conflict safety
      if (d.identity.model_slug === '046' && fields.stroke_mm && fields.stroke_mm.evidence_status === 'OFFICIAL_CONFLICTED') {
        const warnRow = document.createElement('div');
        warnRow.className = 'text-amber-400 text-2xs p-2 rounded bg-amber-950/40 border border-amber-800/40';
        warnRow.textContent = '△ Slaglengte: Bronverschil gevonden tussen officiële handleidingen (veilig verborgen als enkele waarde).';
        specsContainer.appendChild(warnRow);
      }

      if (renderedSpecCount === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-neutral-400 py-2 text-center';
        emptyDiv.textContent = 'Beperkte officiële gegevens beschikbaar voor dit model.';
        specsContainer.appendChild(emptyDiv);
      }

      // Maintenance specs (Category-Safe!)
      const isChainsaw = (d.identity.category || '').toLowerCase().includes('kettingzaag');
      const maintList = [
        { key: 'spark_plug', label: 'Bougie', unit: '' },
        { key: 'spark_plug_gap_mm', label: 'Elektrodenafstand', unit: 'mm' },
        { key: 'idle_speed_rpm', label: 'Stationair toerental', unit: '1/min' },
        { key: 'clutch_speed_rpm', label: 'Koppeltoerental', unit: '1/min' },
        { key: 'max_speed_rpm', label: 'Max. toerental', unit: '1/min' },
        { key: 'fuel_tank_l', label: 'Brandstoftank', unit: 'l' },
        { key: 'oil_tank_l', label: 'Kettingolietank', unit: 'l', chainsawOnly: true },
        { key: 'chain_pitch', label: 'Kettingsteek', unit: '', chainsawOnly: true }
      ];

      let renderedMaintCount = 0;
      for (const item of maintList) {
        if (item.chainsawOnly && !isChainsaw) continue;
        if (specs[item.key] !== undefined) {
          const row = document.createElement('div');
          row.className = 'flex justify-between items-center py-1 border-b border-neutral-900 text-xs';
          
          const lSpan = document.createElement('span');
          lSpan.className = 'text-neutral-400';
          lSpan.textContent = item.label;

          const vSpan = document.createElement('span');
          vSpan.className = 'font-mono text-orange-300 font-bold';
          vSpan.textContent = String(specs[item.key]) + (item.unit ? ' ' + item.unit : '');

          row.appendChild(lSpan);
          row.appendChild(vSpan);
          maintContainer.appendChild(row);
          renderedMaintCount++;
        }
      }

      if (renderedMaintCount === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-neutral-400 py-2 text-center';
        emptyDiv.textContent = 'Geen specifieke onderhoudsgegevens gedocumenteerd.';
        maintContainer.appendChild(emptyDiv);
      }
    }

    // Event listeners initialization
    document.addEventListener('DOMContentLoaded', () => {
      renderDossierList();

      // Check URL hash for pre-selected model (e.g. #add=ms-310)
      if (location.hash.startsWith('#add=')) {
        const slug = decodeURIComponent(location.hash.substring(5)).toLowerCase();
        const select = document.getElementById('select-model');
        if (select) {
          select.value = slug;
          document.getElementById('modal-add').classList.remove('hidden');
        }
      }

      // Filter button clicks
      const setFilter = (filter) => {
        currentFilter = filter;
        document.getElementById('filter-btn-all').className = filter === 'all'
          ? 'px-2.5 py-1 rounded-lg font-bold bg-orange-600 text-white cursor-pointer'
          : 'px-2.5 py-1 rounded-lg font-bold text-neutral-400 hover:text-white cursor-pointer';
        document.getElementById('filter-btn-soon').className = filter === 'soon'
          ? 'px-2.5 py-1 rounded-lg font-bold bg-orange-600 text-white cursor-pointer'
          : 'px-2.5 py-1 rounded-lg font-bold text-neutral-400 hover:text-white cursor-pointer';
        document.getElementById('filter-btn-overdue').className = filter === 'overdue'
          ? 'px-2.5 py-1 rounded-lg font-bold bg-orange-600 text-white cursor-pointer'
          : 'px-2.5 py-1 rounded-lg font-bold text-neutral-400 hover:text-white cursor-pointer';
        renderDossierList();
      };

      document.getElementById('filter-btn-all')?.addEventListener('click', () => setFilter('all'));
      document.getElementById('filter-btn-soon')?.addEventListener('click', () => setFilter('soon'));
      document.getElementById('filter-btn-overdue')?.addEventListener('click', () => setFilter('overdue'));

      // Add modal triggers
      const openAdd = () => {
        document.getElementById('add-error').classList.add('hidden');
        document.getElementById('modal-add').classList.remove('hidden');
      };
      document.getElementById('btn-open-add')?.addEventListener('click', openAdd);
      document.getElementById('btn-empty-add')?.addEventListener('click', openAdd);

      const closeAdd = () => document.getElementById('modal-add').classList.add('hidden');
      document.getElementById('btn-close-add')?.addEventListener('click', closeAdd);
      document.getElementById('btn-cancel-add')?.addEventListener('click', closeAdd);

      // Close detail modal
      const closeDetail = () => {
        document.getElementById('modal-detail').classList.add('hidden');
        activeDossierId = null;
      };
      document.getElementById('btn-close-detail')?.addEventListener('click', closeDetail);
      document.getElementById('btn-close-detail-bottom')?.addEventListener('click', closeDetail);

      // Form Add Machine Submit
      document.getElementById('form-add-machine')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const select = document.getElementById('select-model');
        const opt = select.options[select.selectedIndex];
        const confirmed = document.getElementById('check-confirm-model').checked;

        if (!select.value || !confirmed) {
          const errDiv = document.getElementById('add-error');
          errDiv.textContent = 'Bevestig dat dit uw model is alvorens op te slaan.';
          errDiv.classList.remove('hidden');
          return;
        }

        const modelSlug = select.value;
        const modelName = opt.getAttribute('data-name') || select.value;
        const category = opt.getAttribute('data-category') || 'Kettingzaag';
        const seriesCode = opt.getAttribute('data-series') || null;

        const nickname = document.getElementById('input-nickname').value;
        const serial = document.getElementById('input-serial').value;
        const year = document.getElementById('input-purchase-year').value;
        const lastService = document.getElementById('input-last-service')?.value || null;

        try {
          const newDossier = createDossierObject({
            modelSlug,
            modelName,
            category,
            seriesCode,
            identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
            identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
            serialNumber: serial,
            nickname,
            purchaseYear: year,
            lastServiceDate: lastService
          });

          const saveRes = saveDossier(newDossier);
          if (!saveRes.success) {
            const errDiv = document.getElementById('add-error');
            errDiv.textContent = saveRes.error || 'Opslaan op dit apparaat is niet beschikbaar.';
            errDiv.classList.remove('hidden');
            return;
          }

          closeAdd();
          document.getElementById('form-add-machine').reset();
          renderDossierList();
        } catch (err) {
          const errDiv = document.getElementById('add-error');
          errDiv.textContent = err.message || 'Opslaan op dit apparaat is niet beschikbaar.';
          errDiv.classList.remove('hidden');
        }
      });

      // Form Add Event Submit
      document.getElementById('form-add-event')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!activeDossierId) return;

        const date = document.getElementById('input-event-date').value;
        const type = document.getElementById('select-event-type').value;
        const label = document.getElementById('input-event-label').value;
        const note = document.getElementById('input-event-note').value;

        const res = addMaintenanceEvent(activeDossierId, { date, type, label, note });
        if (res.success && res.dossier) {
          document.getElementById('input-event-label').value = '';
          document.getElementById('input-event-note').value = '';
          renderEventsList(res.dossier);
          setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(res.dossier) || 'Nog geen');
          renderDossierList();
        }
      });

      // Form Add Reminder Submit
      document.getElementById('form-add-reminder')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!activeDossierId) return;

        const dueDate = document.getElementById('input-rem-date').value;
        const type = document.getElementById('select-rem-type').value;
        const label = document.getElementById('input-rem-label').value;
        const note = document.getElementById('input-rem-note').value;

        const res = addReminder(activeDossierId, { dueDate, type, label, note });
        if (res.success && res.dossier) {
          document.getElementById('input-rem-label').value = '';
          document.getElementById('input-rem-note').value = '';
          renderRemindersList(res.dossier);
          renderDossierList();
        }
      });

      // Complete reminder checkbox toggle
      document.getElementById('check-create-service-event')?.addEventListener('change', (e) => {
        const wrap = document.getElementById('complete-event-date-wrap');
        if (e.target.checked) wrap.classList.remove('hidden');
        else wrap.classList.add('hidden');
      });

      // Confirm complete reminder
      document.getElementById('btn-confirm-complete-rem')?.addEventListener('click', () => {
        if (!activeDossierId || !pendingCompleteReminderId) return;
        const createEvent = document.getElementById('check-create-service-event').checked;
        const eventDate = document.getElementById('input-complete-event-date').value;

        const res = completeReminder(activeDossierId, pendingCompleteReminderId, {
          createEvent,
          eventDate
        });

        if (res.success && res.dossier) {
          document.getElementById('modal-complete-rem').classList.add('hidden');
          pendingCompleteReminderId = null;
          renderRemindersList(res.dossier);
          if (createEvent) {
            renderEventsList(res.dossier);
            setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(res.dossier) || 'Nog geen');
          }
          renderDossierList();
        }
      });

      const closeCompleteModal = () => {
        document.getElementById('modal-complete-rem').classList.add('hidden');
        pendingCompleteReminderId = null;
      };
      document.getElementById('btn-close-complete-rem')?.addEventListener('click', closeCompleteModal);
      document.getElementById('btn-cancel-complete-rem')?.addEventListener('click', closeCompleteModal);

      // Form Add Note Submit
      document.getElementById('form-add-note')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!activeDossierId) return;

        const textInput = document.getElementById('input-note-text');
        const dateInput = document.getElementById('input-note-date');
        const text = textInput.value;
        const date = dateInput.value || getLocalTodayString();

        if (!text.trim()) return;

        const res = addDossierNote(activeDossierId, text, date);
        if (res.success && res.dossier) {
          textInput.value = '';
          renderNotesList(res.dossier);
          renderDossierList();
        }
      });

      // Edit / Save / Clear / Cancel Last Service Date
      document.getElementById('btn-edit-last-service')?.addEventListener('click', () => {
        const box = document.getElementById('edit-last-service-box');
        const input = document.getElementById('input-edit-last-service');
        const d = loadDossiers().find((item) => item.dossier_id === activeDossierId);
        input.value = (d && d.maintenance && d.maintenance.last_service_date) || '';
        box.classList.remove('hidden');
      });

      document.getElementById('btn-cancel-last-service')?.addEventListener('click', () => {
        document.getElementById('edit-last-service-box')?.classList.add('hidden');
      });

      document.getElementById('btn-save-last-service')?.addEventListener('click', () => {
        if (!activeDossierId) return;
        const input = document.getElementById('input-edit-last-service');
        const val = input.value;
        const res = updateDossierUserData(activeDossierId, { last_service_date: val });
        if (res.success && res.dossier) {
          document.getElementById('edit-last-service-box')?.classList.add('hidden');
          setSafeText(document.getElementById('detail-last-service-text'), res.dossier.maintenance.last_service_date || 'Nog geen');
          setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(res.dossier) || 'Nog geen');
          renderDossierList();
        }
      });

      document.getElementById('btn-clear-last-service')?.addEventListener('click', () => {
        if (!activeDossierId) return;
        const res = updateDossierUserData(activeDossierId, { last_service_date: null });
        if (res.success && res.dossier) {
          document.getElementById('edit-last-service-box')?.classList.add('hidden');
          setSafeText(document.getElementById('detail-last-service-text'), 'Nog geen');
          setSafeText(document.getElementById('detail-effective-service-text'), calculateEffectiveLastServiceDate(res.dossier) || 'Nog geen');
          renderDossierList();
        }
      });

      // Export Backup JSON
      document.getElementById('btn-export-backup')?.addEventListener('click', () => {
        const backupObj = exportDossierBackup();
        const jsonStr = JSON.stringify(backupObj, null, 2);
        const dateStr = getLocalTodayString();
        downloadTextFile(jsonStr, 'stihldecoder-machines-backup-' + dateStr + '.json', 'application/json;charset=utf-8');
      });

      // Import Backup JSON Trigger & Handler
      const fileInput = document.getElementById('input-import-backup-file');
      document.getElementById('btn-import-backup-trigger')?.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });

      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const alertBox = document.getElementById('storage-status-alert');
        alertBox.className = 'hidden';

        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          const res = importDossierBackup(content);
          alertBox.classList.remove('hidden');
          if (res.success) {
            alertBox.className = 'p-3.5 rounded-xl text-xs font-semibold bg-emerald-950/50 border border-emerald-800/80 text-emerald-300';
            alertBox.textContent = '✅ Back-up succesvol geïmporteerd! ' + res.importedCount + ' machines toegevoegd.';
            renderDossierList();
          } else {
            alertBox.className = 'p-3.5 rounded-xl text-xs font-semibold bg-red-950/50 border border-red-800/80 text-red-300';
            alertBox.textContent = '❌ ' + (res.error || 'Import mislukt.');
          }
        };
        reader.readAsText(file);
      });

      // Delete Dossier
      document.getElementById('btn-delete-dossier')?.addEventListener('click', () => {
        if (!activeDossierId) return;
        if (confirm('Weet u zeker dat u dit machinepaspoort wilt verwijderen van dit apparaat?')) {
          deleteDossier(activeDossierId);
          closeDetail();
          renderDossierList();
        }
      });
    });
  </script>

</body>
</html>`;
}
