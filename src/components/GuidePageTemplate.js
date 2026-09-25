/**
 * Data-Driven Substantive Guide Page SSR Template for STIHLDecoder.nl
 * Phase 49A — User Trust & Functional Integrity Recovery
 */

import { PRIMARY_ORIGIN } from '../config.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderSeoMeta } from './SeoMeta.js';
import { buildStructuredData } from './StructuredData.js';

export function renderGuidePageHtml(guide, database, baseUrl = PRIMARY_ORIGIN) {
  const canonicalUrl = `${baseUrl}/gidsen/${guide.slug}/`;
  const isSerialLocations = guide.slug === 'serienummer-locaties';

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Gidsen', url: '/#kennisbank' },
    { name: guide.title, url: `/gidsen/${guide.slug}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'guide',
    guide,
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `${guide.title} | STIHLDecoder Gidsen`,
    description: guide.description,
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
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Kennisbank</span>
          </span>
          <p class="text-xs text-gray-400">STIHLDecoder Kennisbank</p>
        </div>
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Home</a>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
    ${breadcrumbsHtml}

    <header class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
          Praktische Handleiding
        </span>
        <span class="text-xs text-gray-400">Bijgewerkt voor betrouwbare inspectie</span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        ${guide.title}
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        ${guide.description}
      </p>
    </header>

    ${isSerialLocations ? renderSerialLocationGuideBody() : `
      <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <p class="text-sm text-gray-300 leading-relaxed">${guide.description}</p>
      </article>
    `}

    <!-- CTA Section to Decoder -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 stihl-orange-glow">
      <div class="space-y-1">
        <h3 class="text-lg font-bold text-white">Serienummer gevonden?</h3>
        <p class="text-xs text-gray-400">Voer het serienummer in onze decoder in voor directe formaat- en modelanalyse.</p>
      </div>
      <a href="/#decoder" class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-600/30 text-sm whitespace-nowrap">
        Serienummer Analyseren →
      </a>
    </section>
  </main>

  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel. Niet gelieerd aan, goedgekeurd door of gesponsord door ANDREAS STIHL AG & Co. KG.
      </p>
    </div>
  </footer>
</body>
</html>`;
}

function renderSerialLocationGuideBody() {
  return `
    <article class="space-y-8 text-sm text-gray-300 leading-relaxed">
      <!-- Intro & What is a Serial -->
      <section class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">1</span>
          Wat is een STIHL Serienummer?
        </h2>
        <p>
          Veel STIHL-machines gebruiken een 9-cijferig serienummer (bijvoorbeeld <code class="bg-gray-950 px-2 py-0.5 rounded text-orange-400 font-mono">163118080</code>). Neem het volledige serienummer exact over zoals het op de machine of het typeplaatje staat. De decoder kan bij bepaalde serienummerreeksen een herkomstindicatie geven. De zekerheid verschilt per reeks en productieperiode.
        </p>
        <div class="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 text-xs text-blue-200 space-y-2">
          <strong class="font-semibold text-blue-400 block">Cruciaal verschil: Serienummer vs. 11-cijferig Onderdeelnummer</strong>
          <p>
            Veel gebruikers verwarren een ingegoten onderdeelnummer met een serienummer. Een <strong>onderdeelnummer (Teilenummer)</strong> bestaat uit 11 cijfers (bijvoorbeeld <code class="bg-gray-950 px-1.5 py-0.5 rounded font-mono text-white">1121 021 0800</code>) en begint met een 4-cijferige serie-prefix. Dit nummer identificeert slechts een los gietdeel of deksel, en is <em>geen</em> unieke identificatie van de complete zaag of machine.
          </p>
        </div>
      </section>

      <!-- Pre-Inspection Safety & Cleaning -->
      <section class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">2</span>
          Veiligheidsmaatregelen & Reiniging vóór Inspectie
        </h2>
        <ul class="space-y-2 list-disc list-inside text-xs sm:text-sm">
          <li><strong>Machine uitschakelen:</strong> Schakel de machine altijd volledig uit en laat een warme motor afkoelen.</li>
          <li><strong>Accu verwijderen:</strong> Haal bij accumachines altijd eerst de accu uit het accuvak voordat u inspecteert.</li>
          <li><strong>Olie en zaagsel verwijderen:</strong> Serienummers op kettingzagen zitten vaak bedekt onder aangekoekt kettingzaagsel en kleverige harsolie. Veeg de plek voorzichtig schoon met een droge doek of milde ontvetter. Krab niet met harde metalen voorwerpen over het carter om beschadiging van de stempel te voorkomen.</li>
        </ul>
      </section>

      <!-- Machine Categories Breakdown -->
      <section class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">3</span>
          Waar staat het serienummer per machinecategorie?
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <!-- Kettingzagen -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">1. Kettingzagen (MS / MSA / MSE)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> De exacte locatie verschilt per model en generatie. Controleer eerst het carter ingeslagen in het metaal (vaak aan de rechterzijde of bovenzijde, nabij uitlaat of velkam) of de identificatiesticker (zoals op de kettingremhendel of handgreep). Raadpleeg bij twijfel de handleiding van uw specifieke uitvoering.</p>
          </div>

          <!-- Bosmaaiers -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">2. Bosmaaiers & Trimmers (FS / FSA / FSE)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> De positie kan variëren per serie en revisie. Controleer eerst het motorcarter (ingeslagen aan de onder- of achterzijde van het motorblok) of de typeplaatjessticker op de stuurboom of het motorhuis.</p>
          </div>

          <!-- Bladblazers -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">3. Bladblazers (BG / BGA / BR)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> De locatie hangt af van het modeltype. Controleer bij handblazers het motorhuis nabij de handgreep of aanzuigzijde; bij ruggedragen blazers het motorblok op het frame of de typeplaat op de rugdrager.</p>
          </div>

          <!-- Heggenscharen -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">4. Heggenscharen (HS / HSA / HLA)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> Het nummer kan zich bevinden op het metalen aandrijfhuis of motorcarter, of op het typeplaatje nabij de bedieningshandgrepen. Raadpleeg de officiële handleiding van uw uitvoering.</p>
          </div>

          <!-- Doorslijpers -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">5. Doorslijpers (TS / TSA)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> Staat doorgaans ingeslagen op het carter onder het filterdeksel of nabij de voorste handbeugel, of op de fabriekstypeplaat. Reinig steenstof voorzichtig om de tekens leesbaar te maken.</p>
          </div>

          <!-- Accu machines -->
          <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
            <h3 class="font-bold text-white text-sm text-orange-400">6. Accu-machines (AK, AP, AS Systemen)</h3>
            <p><strong>Veelvoorkomende inspectiepunten:</strong> Kan zich bevinden in het accuvak (verwijder altijd eerst de accu voor veilige inspectie) op een barcode- en serienummersticker, of op het typeplaatje op de motorbehuizing.</p>
          </div>
        </div>
      </section>

      <!-- Stamped vs Sticker -->
      <section class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">4</span>
          Ingeslagen Nummer versus Typeplaatjessticker
        </h2>
        <p>
          Het <strong>ingeslagen nummer in het metalen carter</strong> is altijd leidend. Stickers kunnen in de loop der tijd door intensief gebruik, benzine of reinigingsmiddelen loslaten of onleesbaar worden. Bij tweedehands machines beschermt het controleren van het ingeslagen nummer u bovendien tegen machines waarvan kappen zijn gewisseld of die zijn samengesteld uit meerdere donor-machines.
        </p>
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200">
          <strong class="font-semibold text-amber-400 block mb-1">Let op: Exacte positie kan variëren per generatie</strong>
          <p>
            Binnen dezelfde modelfamilie (zoals de klassieke 026 versus de moderne MS 261 C-M) heeft STIHL tijdens revisies de positie van stempels soms aangepast. Wij geven bewust een eerlijk overzicht van de meest voorkomende inspectiepunten zonder fictieve exacte coördinaten te verzinnen. Raadpleeg bij twijfel de officiële gebruikershandleiding van uw specifieke modeluitvoering.
          </p>
        </div>
      </section>
    </article>
  `;
}
