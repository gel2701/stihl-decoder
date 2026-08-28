/**
 * Data-Driven Model Page SSR Template Renderer for STIHLDecoder.nl
 * Phase 30 Strategic Models & Troubleshooting Guides Interlinking
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getRelatedModels, renderRelatedModelsHtml } from './RelatedModels.js';
import { renderPassportProMvpCard } from './PassportProMvp.js';
import { renderRepairLeadMvpCard, renderSellLeadMvpCard } from './LeadMvpForms.js';
import { getModelVerificationSummary } from '../canonicalData.js';

export function renderModelPageHtml(model, database, baseUrl = 'https://stihldecoder.nl') {
  const verification = getModelVerificationSummary(model);
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
    title: `STIHL ${model.model_name} Serienummer Decoder, Bouwjaar & Modelinformatie | STIHLDecoder`,
    description: `Bekijk de bekende modeldata voor STIHL ${model.model_name}, inclusief bronstatus, onderdeleninformatie en aanwijzingen voor controle via typeplaatje en serienummer.`,
    canonicalUrl,
    ogType: 'article',
    jsonLdData
  });

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);
  const relatedModels = getRelatedModels(model, database);
  const relatedModelsHtml = renderRelatedModelsHtml(relatedModels);

  const isPetrol = (model.fuel_type || 'PETROL_2STROKE').startsWith('PETROL');
  const isBattery = (model.fuel_type || '').startsWith('BATTERY');
  const isChainsaw = categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen';

  // Model comparison partner detection
  const comparisonPartner = getComparisonPartner(model, database);
  const passportProCardHtml = renderPassportProMvpCard({ modelName: model.model_name, abVariant: 'B' });
  const repairLeadCardHtml = renderRepairLeadMvpCard({ modelName: model.model_name });
  const sellLeadCardHtml = renderSellLeadMvpCard({ modelName: model.model_name });

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
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Modelgids met bronstatus</span>
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

    <!-- Header & H1 Title with Data Authority Badges -->
    <header class="space-y-3">
      <div class="flex flex-wrap gap-2 items-center">
        <a href="/${categorySlug}/" class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:underline">
          STIHL ${model.category || 'Modelgids'} Categorie
        </a>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Data Kwaliteit: ${verification.displayConfidence} (${verification.badgeLabel})
        </span>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
          Bronstatus: ${verification.sourceLabel}
        </span>
      </div>

      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${model.model_name} Serienummer Decoder, Bouwjaar & Modelinformatie
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Bekijk de momenteel bekende modeldata van de STIHL ${model.model_name}. Gebruik het serienummer voor formaat- en herkomstcontrole en bevestig model en uitvoering altijd via typeplaatje of primaire handleiding.
      </p>
    </header>

    <!-- Prominent Decoder Tool Form -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 stihl-orange-glow">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <h2 class="text-lg font-bold text-orange-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Serienummer van jouw STIHL ${model.model_name} controleren:
        </h2>
        <span class="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Serienummercontrole</span>
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
    </section>

    <!-- Technical Specifications Grid -->
    <section class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Fabrieksspecificaties STIHL ${model.model_name}</span>
        <span class="text-xs font-normal text-gray-400">${verification.badgeLabel}</span>
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Motorvermogen:</span>
          <span class="text-base font-bold text-white">${model.power_hp ? `${model.power_hp} pk (${model.power_kw} kW)` : (model.power_kw ? `${model.power_kw} kW` : 'Niet vastgesteld')}</span>
        </div>

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Cilinderinhoud / Aandrijving:</span>
          <span class="text-base font-bold text-white">${model.displacement_cc ? `${model.displacement_cc} cc` : (isBattery ? 'STIHL AP Accu 36V' : 'Niet vastgesteld')}</span>
        </div>

        ${isPetrol ? `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Bougie & Elektrodenafstand:</span>
            <span class="text-base font-bold text-white">${model.spark_plug || 'NGK BPMR7A / CMR6H'} (${model.electrode_gap_mm ? `${model.electrode_gap_mm} mm` : '0.5 mm'})</span>
          </div>

          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Carburateur Standaardafstelling:</span>
            <span class="text-base font-bold text-orange-400">${model.carb_h_setting ? `H: ${model.carb_h_setting} | L: ${model.carb_l_setting || '1 slag'}` : (model.carb_la_setting || 'Fabrieksafstelling')}</span>
          </div>
        ` : ''}

        ${(isChainsaw && model.chain_pitch) ? `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Kettingsteek & Dikte (Standaard):</span>
            <span class="text-base font-bold text-white font-mono">${model.chain_pitch} @ ${model.chain_gauge_mm ? `${model.chain_gauge_mm} mm` : 'Niet vastgesteld'}</span>
          </div>
        ` : ''}

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Gewicht (Kaal motorblok):</span>
          <span class="text-base font-bold text-white">${model.weight_kg ? `${model.weight_kg} kg` : 'Niet vastgesteld'}</span>
        </div>
      </div>
    </section>

    <!-- Premium Machine Passport Pro MVP -->
    ${passportProCardHtml}

    <!-- Lead MVPs Section (Repair & Sell) -->
    <section class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${repairLeadCardHtml}
      ${sellLeadCardHtml}
    </section>

    <!-- Model Comparison Section -->
    ${comparisonPartner ? `
      <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>Modelvergelijking: STIHL ${model.model_name} vs STIHL ${comparisonPartner.model_name}</span>
          </h2>
          <a href="/vergelijk/${slug}-vs-${comparisonPartner.slug || comparisonPartner.id.replace(/_/g, '-')}/" class="text-xs text-orange-400 font-bold hover:underline">
            Bekijk Uitgebreide Vergelijking →
          </a>
        </div>
        <p class="text-xs text-gray-300">
          Twijfelt u tussen de STIHL ${model.model_name} en de STIHL ${comparisonPartner.model_name}? Bekijk de belangrijkste technische verschillen in vermogen, cilinderinhoud en gewicht:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-gray-950 p-4 rounded-xl border border-gray-800">
          <div class="space-y-1">
            <span class="font-bold text-orange-400 block font-mono">STIHL ${model.model_name}</span>
            <p class="text-gray-300">• Vermogen: ${model.power_hp} pk (${model.power_kw} kW)</p>
            <p class="text-gray-300">• Inhoud: ${model.displacement_cc} cc</p>
            <p class="text-gray-300">• Gewicht: ${model.weight_kg} kg</p>
          </div>
          <div class="space-y-1">
            <a href="/${comparisonPartner.category_slug || 'kettingzagen'}/${comparisonPartner.slug || comparisonPartner.id.replace(/_/g, '-')}/" class="font-bold text-orange-400 block font-mono hover:underline">
              STIHL ${comparisonPartner.model_name} →
            </a>
            <p class="text-gray-300">• Vermogen: ${comparisonPartner.power_hp} pk (${comparisonPartner.power_kw} kW)</p>
            <p class="text-gray-300">• Inhoud: ${comparisonPartner.displacement_cc} cc</p>
            <p class="text-gray-300">• Gewicht: ${comparisonPartner.weight_kg} kg</p>
          </div>
        </div>
      </section>
    ` : ''}

    <!-- Conversion Funnel CTAs -->
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
      <a href="/stihl-paspoort/" class="bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-orange-400 text-sm block group-hover:underline">📋 1. Maak Serienummer Rapport</span>
        <span class="text-gray-400 block text-2xs">Download een onafhankelijk verkooprapport</span>
      </a>
      <a href="/waarde/${slug}/" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">💶 2. Controleer Waarde</span>
        <span class="text-gray-400 block text-2xs">Indicatieve tweedehands marktwaarde</span>
      </a>
      <a href="/${categorySlug}/${slug}/onderdelen/" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">🔧 3. Bekijk Onderdelen</span>
        <span class="text-gray-400 block text-2xs">Onderdeelnummers serie ${model.series_code || '1141'}</span>
      </a>
    </section>

    <!-- Interlinking Hub including all 6 Troubleshooting Guides -->
    <section class="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl space-y-3 text-xs">
      <h3 class="text-sm font-bold text-white">Handige STIHL Gidsen & Kennisbank:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300">
        <a href="/kettingzagen/" class="hover:text-orange-400 hover:underline">→ Kettingzagen Hub</a>
        <a href="/bosmaaiers/" class="hover:text-orange-400 hover:underline">→ Bosmaaiers Hub</a>
        <a href="/bladblazers/" class="hover:text-orange-400 hover:underline">→ Bladblazers Hub</a>
        <a href="/${categorySlug}/${slug}/onderdelen/" class="hover:text-orange-400 hover:underline">→ STIHL ${model.model_name} Onderdelen</a>
        <a href="/vergelijk/ms-260-vs-ms-261/" class="hover:text-orange-400 hover:underline">→ MS 260 vs MS 261</a>
        <a href="/vergelijk/ms-361-vs-ms-362/" class="hover:text-orange-400 hover:underline">→ MS 361 vs MS 362</a>
        <a href="/stihl-serienummer-decoder/" class="hover:text-orange-400 hover:underline">→ Serienummer Decoder</a>
        <a href="/stihl-serienummer/" class="hover:text-orange-400 hover:underline">→ Serienummer Aflezen</a>
        <a href="/stihl-bouwjaar/" class="hover:text-orange-400 hover:underline">→ Bouwjaar Controleren</a>
        <a href="/stihl-diefstalcheck/" class="hover:text-orange-400 hover:underline">→ Diefstalcheck</a>
        <a href="/stihl-waarde/" class="hover:text-orange-400 hover:underline">→ Waardebepaling</a>
        <a href="/stihl-paspoort/" class="hover:text-orange-400 hover:underline">→ Serienummer Rapport Maken</a>
        <a href="/gidsen/stihl-gietklok-aflezen/" class="hover:text-orange-400 hover:underline">→ Gietklok Handleiding</a>
        <a href="/gidsen/namaak-stihl-herkennen/" class="hover:text-orange-400 hover:underline">→ Namaak Herkennen</a>
        <a href="/gidsen/serienummer-locaties/" class="hover:text-orange-400 hover:underline">→ Serienummer Locaties</a>
        <a href="/gidsen/stihl-kettingzaag-start-niet/" class="hover:text-orange-400 hover:underline font-bold text-orange-400">→ Kettingzaag Start Niet Guide</a>
        <a href="/gidsen/stihl-carburateur-afstellen/" class="hover:text-orange-400 hover:underline font-bold text-orange-400">→ Carburateur Afstellen Guide</a>
        <a href="/gidsen/stihl-m-tronic-resetten/" class="hover:text-orange-400 hover:underline font-bold text-orange-400">→ M-Tronic Resetten Guide</a>
      </div>
    </section>

    <!-- Visible FAQs Section -->
    <section class="space-y-4 pt-4 border-t border-gray-800">
      <h3 class="text-xl font-bold text-white">Veelgestelde Vragen over STIHL ${model.model_name}</h3>
      
      <div class="space-y-3 text-xs">
        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <h4 class="font-bold text-white">Hoe oud is mijn STIHL ${model.model_name}?</h4>
          <p class="text-gray-300">Voer het 9-cijferige serienummer in voor formaat- en herkomstcontrole; gebruik daarnaast het typeplaatje om model en uitvoering van uw ${model.model_name} te bevestigen.</p>
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

  <!-- Footer -->
  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>E-E-A-T / Transparantie Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijke informatie- en decoderingsdienst. STIHLDecoder is niet verbonden aan, gesponsord door of goedgekeurd door ANDREAS STIHL AG & Co. KG. Niet ieder modelrecord heeft al een primaire STIHL bron op veldniveau; de bronstatus staat daarom per model zichtbaar vermeld.
      </p>
    </div>
  </footer>

</body>
</html>`;
}

function getComparisonPartner(model, database) {
  const models = database.models || [];
  const cleanName = (model.model_name || '').toLowerCase();
  
  if (cleanName.includes('260')) return models.find(m => m.slug === 'ms-261');
  if (cleanName.includes('261')) return models.find(m => m.slug === 'ms-260');
  if (cleanName.includes('360')) return models.find(m => m.slug === 'ms-361');
  if (cleanName.includes('361')) return models.find(m => m.slug === 'ms-362');
  if (cleanName.includes('362')) return models.find(m => m.slug === 'ms-361');
  if (cleanName.includes('170')) return models.find(m => m.slug === 'ms-180');
  if (cleanName.includes('180')) return models.find(m => m.slug === 'ms-170');

  return models.find(m => m.id !== model.id && m.category_slug === model.category_slug);
}
