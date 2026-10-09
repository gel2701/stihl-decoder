/**
 * Part Detail Page SSR Template Renderer for STIHLDecoder.nl
 * Phase 52C — Canonical Part Detail View with SEO Thin-Page Protection
 */

import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderAffiliateLink } from './AffiliateLink.js';
import { PRIMARY_ORIGIN } from '../config.js';
import { PartCatalogResolver } from '../parts/PartCatalogResolver.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';
import { getSafeModelPath } from '../publicationRules.js';

export function renderPartDetailPageHtml(rawPartNumber, database = null, baseUrl = PRIMARY_ORIGIN) {
  const resolved = PartCatalogResolver.resolvePartNumber(rawPartNumber, database);
  const formattedPartNo = resolved?.part_number_display || PartNormalizer.formatPartNumber(rawPartNumber);
  const canonicalUrl = `${baseUrl}/onderdeelnummer/${resolved?.part_number || rawPartNumber}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Onderdeelnummers', url: '/onderdeelnummer/' },
    { name: `STIHL ${formattedPartNo}`, url: `/onderdeelnummer/${resolved?.part_number || rawPartNumber}/` }
  ];

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  if (!resolved || !resolved.found && resolved.fitment_count === 0) {
    return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL ${formattedPartNo} Onderdeel | STIHLDecoder</title>
  <meta name="robots" content="noindex, follow">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 p-4">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-white flex items-center gap-2">
        <span class="w-8 h-8 rounded bg-orange-600 flex items-center justify-center font-black">S</span>
        STIHL Decoder
      </a>
      <a href="/onderdeelnummer/" class="text-xs text-orange-400 font-bold hover:underline">← Alle Onderdeelnummers</a>
    </div>
  </header>
  <main class="max-w-4xl mx-auto px-4 py-12 flex-1 w-full space-y-6 text-center">
    <div class="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-4 max-w-xl mx-auto">
      <div class="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-xl font-bold">!</div>
      <h1 class="text-2xl font-extrabold text-white">Onderdeelnummer ${formattedPartNo}</h1>
      <p class="text-xs text-gray-400 leading-relaxed">
        Dit specifieke onderdeelnummer is momenteel niet opgenomen in de canonieke onderdelendatabase of vereist controle van de serieprefix.
      </p>
      <div class="pt-4">
        <a href="/#decoder" class="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl transition inline-block">
          Zoek via Decoder →
        </a>
      </div>
    </div>
  </main>
</body>
</html>`;
  }

  const partName = resolved.part_name || 'STIHL Vervangingsonderdeel';
  const compatibleModels = resolved.compatible_models || [];
  const fitments = resolved.fitments || [];

  // Group fitments by section
  const sectionMap = new Map();
  for (const f of fitments) {
    const sName = f.section_name || 'Algemene sectie';
    if (!sectionMap.has(sName)) {
      sectionMap.set(sName, []);
    }
    sectionMap.get(sName).push(f);
  }

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL ${formattedPartNo} — ${partName} | Compatibiliteit & Onderdeelgids</title>
  <meta name="description" content="STIHL onderdeelnummer ${formattedPartNo} (${partName}). Bekijk geschikte modellen, montagelocatie en diagramposities.">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="noindex, follow">
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
          </span>
          <span class="text-2xs text-gray-400 block -mt-1 font-mono">Onderdeel Details</span>
        </div>
      </a>
      <a href="/onderdeelnummer/" class="text-xs text-orange-400 font-bold hover:underline">
        ← Alle Onderdeelnummers
      </a>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
    ${breadcrumbsHtml}

    <header class="space-y-3 border-b border-gray-800 pb-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
          Canonieke Onderdelencatalogus
        </span>
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-block">
          ✓ Gedocumenteerd
        </span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${formattedPartNo}
      </h1>
      <p class="text-lg text-orange-400 font-semibold">
        ${partName}
      </p>
      <p class="text-xs text-gray-400 leading-relaxed max-w-3xl">
        Canonieke referentie voor STIHL onderdeelnummer <strong>${formattedPartNo}</strong>. Controleer altijd het typeplaatje en de specifieke machine-uitvoering vóór montage.
      </p>
    </header>

    <!-- Compatible Models Section -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <span>Geschikte STIHL Modellen</span>
          <span class="text-xs font-mono text-gray-400 bg-gray-900 border border-gray-800 px-2.5 py-0.5 rounded-full">${compatibleModels.length} modellen</span>
        </h2>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        ${compatibleModels.map(m => {
          const modelObj = (database?.models || []).find(mod => {
            const mSlug = (mod.slug || mod.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
            return mSlug === m.model_id;
          });
          const safePath = modelObj ? getSafeModelPath(modelObj) : null;
          return `
            <div class="bg-gray-900/70 border border-gray-800 rounded-xl p-4 space-y-2 hover:border-gray-700 transition">
              <div class="flex justify-between items-start">
                <span class="font-bold text-white text-sm">${m.model_name}</span>
                <span class="text-2xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">${m.fitment_count} posities</span>
              </div>
              ${m.configurations.length > 0 ? `
                <div class="text-2xs text-gray-400">
                  <span class="text-gray-500 block">Uitvoering:</span>
                  <span>${m.configurations.join(', ')}</span>
                </div>
              ` : ''}
              ${safePath ? `
                <div class="pt-1">
                  <a href="${safePath}onderdelen/" class="text-xs font-semibold text-orange-400 hover:underline">
                    Bekijk alle onderdelen voor ${m.model_name} →
                  </a>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>

    <!-- Diagram Sections & Positions -->
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 text-xs">
      <h3 class="text-base font-bold text-white">Montagelocatie & Diagramsecties</h3>
      <div class="space-y-4">
        ${Array.from(sectionMap.entries()).map(([secName, fList]) => `
          <div class="border-b border-gray-800/80 pb-3 last:border-b-0 space-y-1.5">
            <div class="font-semibold text-orange-300 text-xs">${secName}</div>
            <div class="flex flex-wrap gap-2 text-2xs text-gray-400">
              ${fList.map(f => `
                <span class="bg-gray-950 px-2 py-1 rounded border border-gray-800 font-mono">
                  ${f.canonical_model_id.replace(/_/g, ' ').toUpperCase()} (Pos. ${f.diagram_position || '—'})
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Verification Disclaimer -->
    <section class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-xs text-amber-200 space-y-2">
      <h4 class="font-bold text-amber-400 text-sm flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        Belangrijk voor aankoop & montage:
      </h4>
      <p>
        Controleer altijd het serienummer op het typeplaatje van uw STIHL machine voordat u onderdelen bestelt. Bij sommige revisies kunnen specifieke uitvoeringen afwijken.
      </p>
    </section>

  </main>

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
