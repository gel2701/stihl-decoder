/**
 * Data-Driven Substantive Guide Page SSR Template for STIHLDecoder.nl
 * Phase 49B — Knowledge Base Content Rebuild
 */

import { PRIMARY_ORIGIN } from '../config.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderSeoMeta } from './SeoMeta.js';
import { buildStructuredData } from './StructuredData.js';
import { getStructuredGuide } from '../content/guides/index.js';

export function renderGuidePageHtml(guide, database, baseUrl = PRIMARY_ORIGIN) {
  const canonicalUrl = `${baseUrl}/gidsen/${guide.slug}/`;
  const isSerialLocations = guide.slug === 'serienummer-locaties';
  const structuredGuide = getStructuredGuide(guide.slug);
  const guideToUse = structuredGuide ? { ...guide, ...structuredGuide } : guide;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Gidsen', url: '/#kennisbank' },
    { name: guideToUse.shortTitle || guideToUse.title, url: `/gidsen/${guide.slug}/` }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'guide',
    guide: guideToUse,
    breadcrumbs,
    url: canonicalUrl
  });

  const seoMetaHtml = renderSeoMeta({
    title: `${guideToUse.title} | STIHLDecoder Kennisbank`,
    description: guideToUse.metaDescription || guideToUse.description,
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
        ${guideToUse.title}
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        ${guideToUse.metaDescription || guideToUse.description}
      </p>
    </header>

    ${isSerialLocations
      ? renderSerialLocationGuideBody()
      : (structuredGuide ? renderStructuredGuideBody(guideToUse) : `
        <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <p class="text-sm text-gray-300 leading-relaxed">${guide.description}</p>
        </article>
      `)}

    <!-- CTA Section to Decoder -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 stihl-orange-glow">
      <div class="space-y-1">
        <h3 class="text-lg font-bold text-white">Serienummer controleren?</h3>
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

function renderStructuredGuideBody(guide) {
  return `
    <article class="space-y-8 text-sm text-gray-300 leading-relaxed">
      <!-- 1. Direct Answer Card -->
      ${guide.directAnswer ? `
        <section id="kort-antwoord" class="bg-gradient-to-r from-orange-950/30 via-gray-900 to-gray-900 border border-orange-500/40 rounded-2xl p-6 sm:p-8 space-y-3 shadow-lg">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span>
            <h2 class="text-base sm:text-lg font-bold text-white uppercase tracking-wider">
              ${guide.directAnswer.heading}
            </h2>
          </div>
          <p class="text-sm sm:text-base text-gray-200 leading-relaxed font-medium">
            ${guide.directAnswer.content}
          </p>
        </section>
      ` : ''}

      <!-- 2. Table of Contents -->
      <nav id="inhoud" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-3">
        <h2 class="text-xs font-mono uppercase tracking-widest text-gray-400 font-bold">Inhoudsopgave</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <a href="#veiligheid" class="text-orange-400 hover:underline">1. Veiligheid & Voorzorgsmaatregelen</a>
          <a href="#niveaus" class="text-orange-400 hover:underline">2. Veilige Diagnoseniveaus (Level 1, 2, 3)</a>
          <a href="#startprocedure" class="text-orange-400 hover:underline">3. Startprocedure: Koude vs Warme Motor</a>
          <a href="#verzopen-motor" class="text-orange-400 hover:underline">4. Verzopen Motor Herstellen</a>
          <a href="#technische-inspecties" class="text-orange-400 hover:underline">5. Brandstof, Bougie & Carburateur vs M-Tronic</a>
          <a href="#probleem-matrix" class="text-orange-400 hover:underline">6. Probleem- & Oorzaakmatrix</a>
          <a href="#wanneer-dealer" class="text-orange-400 hover:underline">7. Wanneer Dealer Inschakelen?</a>
          <a href="#bronnen" class="text-orange-400 hover:underline">8. Bronnen & Beperkingen</a>
          <a href="#faq" class="text-orange-400 hover:underline">9. Veelgestelde Vragen (FAQ)</a>
        </div>
      </nav>

      <!-- 3. Safety Warnings -->
      ${guide.warnings && guide.warnings.length > 0 ? `
        <section id="veiligheid" class="space-y-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-mono font-bold">!</span>
            Veiligheidswaarschuwingen & Startpositie
          </h2>
          <div class="grid grid-cols-1 gap-4">
            ${guide.warnings.map(w => `
              <div class="p-4 rounded-xl border ${w.severity === 'danger' ? 'bg-red-950/20 border-red-500/30 text-red-200' : 'bg-amber-950/20 border-amber-500/30 text-amber-200'} space-y-1 text-xs sm:text-sm">
                <strong class="font-bold block text-white">${w.title}</strong>
                <p class="leading-relaxed">${w.text}</p>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 4. Safe Troubleshooting Levels -->
      ${guide.troubleshootingLevels ? `
        <section id="niveaus" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div class="space-y-1">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">2</span>
              Veilige Diagnoseniveaus
            </h2>
            <p class="text-xs text-gray-400">Wat kunt u veilig zelf proberen en wanneer is professionele service noodzakelijk?</p>
          </div>

          <div class="grid grid-cols-1 gap-4">
            ${guide.troubleshootingLevels.map(lvl => `
              <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <h3 class="font-bold text-white text-sm sm:text-base">${lvl.level}</h3>
                  <span class="px-2 py-0.5 rounded text-2xs font-mono font-semibold bg-gray-800 text-orange-400 border border-gray-700">
                    ${lvl.badge}
                  </span>
                </div>
                <p class="text-xs text-gray-400">${lvl.description}</p>
                <ul class="space-y-1.5 list-disc list-inside text-xs text-gray-300">
                  ${lvl.items.map(it => `<li>${it}</li>`).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 5. Start Procedures (Cold vs Warm) -->
      ${guide.startProcedures ? `
        <section id="startprocedure" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">3</span>
            Startprocedure: Koude Motor versus Warme Motor
          </h2>

          <!-- Cold Start -->
          <div class="space-y-4">
            <div class="border-b border-gray-800 pb-2">
              <h3 class="text-base font-bold text-orange-400">${guide.startProcedures.coldStart.title}</h3>
              <p class="text-xs text-gray-400">${guide.startProcedures.coldStart.intro}</p>
            </div>
            <ol class="space-y-3 list-decimal list-inside text-xs sm:text-sm text-gray-300">
              ${guide.startProcedures.coldStart.steps.map(s => `
                <li class="pl-1 leading-relaxed">
                  <strong class="text-white">${s.title}:</strong> ${s.text}
                </li>
              `).join('')}
            </ol>
          </div>

          <!-- Warm Start -->
          <div class="space-y-4 pt-4 border-t border-gray-800">
            <div class="border-b border-gray-800 pb-2">
              <h3 class="text-base font-bold text-orange-400">${guide.startProcedures.warmStart.title}</h3>
              <p class="text-xs text-gray-400">${guide.startProcedures.warmStart.intro}</p>
            </div>
            <ol class="space-y-3 list-decimal list-inside text-xs sm:text-sm text-gray-300">
              ${guide.startProcedures.warmStart.steps.map(s => `
                <li class="pl-1 leading-relaxed">
                  <strong class="text-white">${s.title}:</strong> ${s.text}
                </li>
              `).join('')}
            </ol>
          </div>
        </section>
      ` : ''}

      <!-- 6. Flooded Engine Recovery -->
      ${guide.floodedEngineRecovery ? `
        <section id="verzopen-motor" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div class="space-y-1">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">4</span>
              ${guide.floodedEngineRecovery.title}
            </h2>
            <p class="text-xs sm:text-sm text-gray-300 leading-relaxed">${guide.floodedEngineRecovery.explanation}</p>
          </div>

          <div class="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200">
            <strong>Veiligheidsinstructie:</strong> ${guide.floodedEngineRecovery.safetyNotice}
          </div>

          <div class="space-y-3">
            <h3 class="text-sm font-bold text-white">Stappenplan voor ontzopen en droogmaken:</h3>
            <ol class="space-y-3 list-decimal list-inside text-xs sm:text-sm text-gray-300">
              ${guide.floodedEngineRecovery.steps.map(s => `
                <li class="pl-1 leading-relaxed">
                  <strong class="text-white">${s.title}:</strong> ${s.text}
                </li>
              `).join('')}
            </ol>
          </div>
        </section>
      ` : ''}

      <!-- 7. Technical Inspections: Fuel, Plug, Carb vs M-Tronic -->
      ${guide.technicalInspections ? `
        <section id="technische-inspecties" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">5</span>
            Brandstof, Bougie & Carburateur vs M-Tronic
          </h2>

          <!-- Fuel & Aging -->
          <div class="space-y-3">
            <h3 class="font-bold text-white text-base text-orange-400">${guide.technicalInspections.fuel.title}</h3>
            <p class="text-xs sm:text-sm text-gray-300">${guide.technicalInspections.fuel.text}</p>
            <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs text-gray-300 space-y-1">
              <strong class="text-amber-400 font-semibold block">Let op brandstofveroudering:</strong>
              <p>${guide.technicalInspections.fuel.agingWarning}</p>
            </div>
          </div>

          <!-- Spark plug -->
          <div class="space-y-3 pt-4 border-t border-gray-800">
            <h3 class="font-bold text-white text-base text-orange-400">${guide.technicalInspections.sparkPlug.title}</h3>
            <p class="text-xs sm:text-sm text-gray-300">${guide.technicalInspections.sparkPlug.text}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${guide.technicalInspections.sparkPlug.colors.map(c => `
                <div class="bg-gray-950 p-3 rounded-lg border border-gray-800 text-xs">
                  <strong class="text-white block mb-0.5">${c.color}</strong>
                  <span class="text-gray-400">${c.meaning}</span>
                </div>
              `).join('')}
            </div>
            <p class="text-xs text-gray-400 italic">${guide.technicalInspections.sparkPlug.gapNotice}</p>
          </div>

          <!-- Carb vs M-Tronic -->
          <div class="space-y-3 pt-4 border-t border-gray-800">
            <h3 class="font-bold text-white text-base text-orange-400">${guide.technicalInspections.carburetorVsMtronic.title}</h3>
            <p class="text-xs sm:text-sm text-gray-300">${guide.technicalInspections.carburetorVsMtronic.text}</p>
            <p class="text-xs sm:text-sm text-gray-300">${guide.technicalInspections.carburetorVsMtronic.mtronicText}</p>
          </div>
        </section>
      ` : ''}

      <!-- 8. Troubleshooting Matrix -->
      ${guide.troubleshootingMatrix && guide.troubleshootingMatrix.length > 0 ? `
        <section id="probleem-matrix" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">6</span>
            Probleem- en Oorzaakmatrix
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-gray-300 border border-gray-800 rounded-xl overflow-hidden">
              <thead class="bg-gray-950 text-gray-200 border-b border-gray-800 font-semibold">
                <tr>
                  <th class="p-3">Symptoom</th>
                  <th class="p-3">Mogelijke oorzaak</th>
                  <th class="p-3">Veilige eerste controle</th>
                  <th class="p-3">Volgende stap</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800/60">
                ${guide.troubleshootingMatrix.map(m => `
                  <tr class="hover:bg-gray-850/40 transition">
                    <td class="p-3 font-semibold text-white whitespace-normal">${m.symptom}</td>
                    <td class="p-3 text-gray-300 whitespace-normal">${m.possibleCause}</td>
                    <td class="p-3 text-gray-300 whitespace-normal">${m.safeFirstCheck}</td>
                    <td class="p-3 text-gray-400 whitespace-normal">${m.nextStep}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      ` : ''}

      <!-- 9. When to Stop & Call Dealer -->
      ${guide.whenToStopAndCallDealer ? `
        <section id="wanneer-dealer" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">7</span>
            Wanneer stoppen met zelf proberen?
          </h2>
          <p class="text-xs sm:text-sm text-gray-300">
            Stop onmiddellijk met startpogingen en raadpleeg een erkende STIHL servicedealer bij een van de volgende situaties:
          </p>
          <ul class="space-y-2 list-disc list-inside text-xs sm:text-sm text-gray-300">
            ${guide.whenToStopAndCallDealer.map(w => `<li>${w}</li>`).join('')}
          </ul>
        </section>
      ` : ''}

      <!-- 10. Sources and Limitations -->
      ${guide.sources && guide.sources.length > 0 ? `
        <section id="bronnen" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">8</span>
            Bronnen en Beperkingen
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            ${guide.sources.map(s => `
              <div class="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-1">
                <strong class="text-white block font-semibold">${s.documentTitle}</strong>
                <p class="text-gray-400 text-2xs font-mono">Publicatie-ID: ${s.publicationId} | Scope: ${s.modelScope}</p>
                <p class="text-gray-300 mt-1">${s.notes}</p>
              </div>
            `).join('')}
          </div>
          <div class="bg-gray-950/60 border border-gray-800 p-4 rounded-xl text-2xs text-gray-400 leading-relaxed">
            <strong>Beperking van aansprakelijkheid:</strong> Deze gids biedt onafhankelijke technische en informatieve richtlijnen. Raadpleeg bij afwijkingen of specialistische werkzaamheden altijd de officiële handleiding van uw specifieke machine of een gecertificeerde STIHL dealer.
          </div>
        </section>
      ` : ''}

      <!-- 11. FAQ -->
      ${guide.faq && guide.faq.length > 0 ? `
        <section id="faq" class="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-md bg-orange-600/20 text-orange-400 flex items-center justify-center text-xs font-mono">9</span>
            Veelgestelde Vragen
          </h2>
          <div class="space-y-4 text-xs sm:text-sm">
            ${guide.faq.map(f => `
              <div class="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-2">
                <h3 class="font-bold text-white text-sm text-orange-400">${f.question}</h3>
                <p class="text-gray-300 leading-relaxed">${f.answer}</p>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 12. Relevant Links -->
      ${guide.relevantLinks && guide.relevantLinks.length > 0 ? `
        <nav id="links" class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h2 class="text-xs font-mono uppercase tracking-widest text-gray-400 font-bold">Gerelateerde Gidsen & Onderdelen</h2>
          <div class="flex flex-wrap gap-3 text-xs">
            ${guide.relevantLinks.map(l => `
              <a href="${l.href}" class="px-3 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-orange-400 hover:border-orange-500/50 hover:underline">
                → ${l.label}
              </a>
            `).join('')}
          </div>
        </nav>
      ` : ''}
    </article>
  `;
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
            Veel gebruikers verwarren een onderdeelnummer of gietnummer met een serienummer. Een 11-cijferig STIHL onderdeelnummer identificeert een onderdeel, component of samenstelling en is niet het unieke serienummer van de complete machine. Een <strong>onderdeelnummer (Teilenummer)</strong> bestaat uit 11 cijfers (bijvoorbeeld <code class="bg-gray-950 px-1.5 py-0.5 rounded font-mono text-white">1121 021 0800</code>) en begint met een 4-cijferige serie-prefix. Let op het onderscheid (onderdeelnummer ≠ automatisch gietnummer): een fysiek ingegoten nummer KAN een onderdeelnummer zijn, maar beide termen zijn niet universeel synoniem.
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
          <li><strong>Accu veiligheid:</strong> Schakel de machine uit. Verwijder een uitneembare accu wanneer het ontwerp dat toestaat. Bij machines met geïntegreerde accu volgt u de uitschakel-/transportvergrendelingsprocedure uit de handleiding.</li>
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
            <p><strong>Veelvoorkomende inspectiepunten:</strong> Kan zich bevinden in het accuvak (verwijder een uitneembare accu vooraf; volg bij geïntegreerde accu de veiligheidsprocedure) op een barcode- en serienummersticker, of op het typeplaatje op de motorbehuizing.</p>
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
          Wanneer zowel een ingeslagen nummer als een typeplaatje aanwezig zijn, vergelijk beide. Welke identificatiemarkering aanwezig is verschilt per model en generatie. Stickers kunnen in de loop der tijd door intensief gebruik, benzine of reinigingsmiddelen loslaten of onleesbaar worden. Bij machines met een ingeslagen carternummer biedt deze markering extra zekerheid om na te gaan of behuizingsdelen niet zijn gewisseld met andere machines.
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
