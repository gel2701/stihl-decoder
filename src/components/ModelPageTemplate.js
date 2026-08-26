/**
 * Data-Driven Model Page SSR Template Renderer for STIHLDecoder.nl
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getRelatedModels, renderRelatedModelsHtml } from './RelatedModels.js';

export function renderModelPageHtml(model, database, baseUrl = 'https://stihldecoder.nl') {
  const categorySlug = model.category_slug || 'kettingzagen';
  const slug = model.slug || model.id.replace(/_/g, '-');
  const canonicalUrl = `${baseUrl}/${categorySlug}/${slug}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: model.category || 'Modellen', url: `/${categorySlug}/` },
    { name: `STIHL ${model.model_name}`, url: `/${categorySlug}/${slug}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'model',
    model,
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `STIHL ${model.model_name} Bouwjaar & Serienummer Decoder | STIHLDecoder`,
    description: `Controleer je STIHL ${model.model_name} serienummer, ontdek de geschatte productieperiode, uitvoering, technische gegevens en carburateur afstelling.`,
    canonicalUrl,
    ogType: 'article',
    jsonLdData
  });

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);
  const relatedModels = getRelatedModels(model, database);
  const relatedModelsHtml = renderRelatedModelsHtml(relatedModels);

  const isPetrol = (model.fuel_type || 'PETROL_2STROKE').startsWith('PETROL');
  const isBattery = (model.fuel_type || '').startsWith('BATTERY');

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
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Geverifieerde Modelgids</span>
          </span>
          <p class="text-xs text-gray-400">Serienummers, Specificaties & Waardebepaling</p>
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
        STIHL ${model.category || 'Modelgids'}
      </span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${model.model_name} Serienummer Decoder & Modelinformatie
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Bekijk de geverifieerde fabrieksspecificaties van de STIHL ${model.model_name}. Controleer serienummers op herkomst, geschatte productieperiode, carburateur basisafstellingen, bougiemodel en kettingmaat.
      </p>
    </header>

    <!-- Prominent Decoder Tool Form -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 stihl-orange-glow">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <h2 class="text-lg font-bold text-orange-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Serienummer van jouw STIHL ${model.model_name} controleren:
        </h2>
        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Instant Breakpoint Match</span>
      </div>

      <form action="/" method="GET" class="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          name="q" 
          placeholder="Voer het 9-cijferige serienummer in van uw ${model.model_name}..." 
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
      <p class="text-xs text-gray-400">
        💡 Vul een 9-cijferig serienummer in (bijv. ingeslagen op het carter) voor fabriek, geschatte productieperiode en StopHeling diefstalcontrole.
      </p>
    </section>

    <!-- Technical Specifications Grid -->
    <section class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Fabrieksspecificaties STIHL ${model.model_name}</span>
        <span class="text-xs font-normal text-gray-400">Geverifieerde Data</span>
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Motorvermogen:</span>
          <span class="text-base font-bold text-white">${model.power_hp ? `${model.power_hp} pk (${model.power_kw} kW)` : (model.power_kw ? `${model.power_kw} kW` : '-')}</span>
        </div>

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Cilinderinhoud / Aandrijving:</span>
          <span class="text-base font-bold text-white">${model.displacement_cc ? `${model.displacement_cc} cc` : (isBattery ? 'STIHL AP Accu 36V' : '-')}</span>
        </div>

        ${isPetrol ? `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Bougie & Elektrodenafstand:</span>
            <span class="text-base font-bold text-white">${model.spark_plug || 'NGK CMR6H'} (${model.electrode_gap_mm || 0.50} mm)</span>
          </div>

          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Carburateur Standaardafstelling:</span>
            <span class="text-base font-bold text-orange-400">${model.carb_h_setting ? `H: ${model.carb_h_setting} | L: ${model.carb_l_setting || '1 slag'}` : 'Elektronisch geregeld (M-Tronic)'}</span>
          </div>
        ` : ''}

        ${model.chain_pitch ? `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Kettingsteek & Dikte (Standaard):</span>
            <span class="text-base font-bold text-white font-mono">${model.chain_pitch} @ ${model.chain_gauge_mm || 1.3} mm</span>
          </div>
        ` : ''}

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Gewicht (Kaal motorblok):</span>
          <span class="text-base font-bold text-white">${model.weight_kg ? `${model.weight_kg} kg` : '-'}</span>
        </div>
      </div>
    </section>

    <!-- Serial Breakpoints & Production Period Section -->
    <section class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        Productieperiode & Serienummer Reeksen
      </h2>
      <p class="text-xs text-gray-300 leading-relaxed">
        <strong>Geschatte productieperiode:</strong> De productieperiode wordt geschat op basis van bekende STIHL-serienummerreeksen en model-breakpoints per fabriek. Het serienummer vormt niet noodzakelijk een directe datumcode.
      </p>

      <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-gray-400">Betrouwbaarheidsniveau Breakpoint Match:</span>
          <span class="px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Hoog (Range Match)</span>
        </div>
        <p class="text-gray-400 text-2xs">
          Serienummers die beginnen met fabriekscode 1 (Waiblingen, DE), 2/5 (Virginia Beach, US) of 3 (São Leopoldo, BR) worden gecorreleerd met bekende productie-breakpoints van de ${model.model_name}.
        </p>
      </div>
    </section>

    <!-- Serial Number Location Guide -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-white">Waar staat het serienummer van de STIHL ${model.model_name}?</h2>
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 text-xs text-gray-300 space-y-2">
        <p>
          Het 9-cijferige serienummer van de STIHL ${model.model_name} staat ingeslagen op twee primaire locaties:
        </p>
        <ul class="list-disc list-inside space-y-1 text-gray-200">
          <li><strong>Carter Metaalstempel:</strong> Boven de uitlaat of bij de geleideplaatmontage op het carter gegraveerd.</li>
          <li><strong>Typeplaatje / Sticker:</strong> Op het zwarte barcode-etiket aan de onder- of binnenzijde van de handgreep.</li>
        </ul>
      </div>
    </section>

    <!-- Internal Linking Hub (FASE 11 Requirement) -->
    <section class="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl space-y-3 text-xs">
      <h3 class="text-sm font-bold text-white">Handige STIHL Links & Gidsen:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300">
        <a href="/stihl-serienummer-decoder/" class="hover:text-orange-400 hover:underline">→ Serienummer Decoder</a>
        <a href="/stihl-bouwjaar/" class="hover:text-orange-400 hover:underline">→ Bouwjaar Controleren</a>
        <a href="/stihl-serienummer/" class="hover:text-orange-400 hover:underline">→ Serienummer Aflezen</a>
        <a href="/stihl-paspoort/" class="hover:text-orange-400 hover:underline">→ Machinepaspoort Maken</a>
        <a href="/stihl-waarde/" class="hover:text-orange-400 hover:underline">→ Waardebepaling</a>
        <a href="/onderdeelnummer/" class="hover:text-orange-400 hover:underline">→ Onderdeelnummer Gids</a>
      </div>
    </section>

    <!-- Conversion Funnel CTAs -->
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
      <a href="/stihl-paspoort/" class="bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-orange-400 text-sm block group-hover:underline">🛡️ Maak Machinepaspoort</span>
        <span class="text-gray-400 block text-2xs">Download geverifieerd Marktplaats certificaat</span>
      </a>
      <a href="/waarde/${slug}/" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">💶 Controleer Waarde</span>
        <span class="text-gray-400 block text-2xs">Indicatieve tweedehands marktwaarde</span>
      </a>
      <a href="/onderdeelnummer/stihl-${model.series_code || '1141'}/" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">🔧 Bekijk Onderdelen</span>
        <span class="text-gray-400 block text-2xs">Onderdeelnummers serie ${model.series_code || '1141'}</span>
      </a>
    </section>

    <!-- Visible FAQs Section -->
    <section class="space-y-4 pt-4 border-t border-gray-800">
      <h3 class="text-xl font-bold text-white">Veelgestelde Vragen over STIHL ${model.model_name}</h3>
      
      <div class="space-y-3 text-xs">
        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <h4 class="font-bold text-white">Hoe oud is mijn STIHL ${model.model_name}?</h4>
          <p class="text-gray-300">Voer het 9-cijferige serienummer in van uw ${model.model_name} in onze decoder om de geschatte productieperiode op basis van bekende serienummerreeksen af te lezen.</p>
        </div>

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <h4 class="font-bold text-white">Waar vind ik het 9-cijferige serienummer?</h4>
          <p class="text-gray-300">Het serienummer staat ingeslagen in het metaal van het carter (boven de uitlaat of bij het kettingzaagblad) en op de sticker onderaan het handvat.</p>
        </div>
      </div>
    </section>

    <!-- Related Models Section -->
    ${relatedModelsHtml}

  </main>

  <!-- Footer with Legal Disclaimer -->
  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel voor reparateurs en verzamelaars. Deze site is niet gelieerd aan, gesponsord door of goedgekeurd door ANDREAS STIHL AG & Co. KG. Alle merknamen zijn eigendom van hun respectievelijke merkhouders.
      </p>
    </div>
  </footer>

</body>
</html>`;
}
