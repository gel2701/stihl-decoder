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
import { AffiliateOfferResolver } from '../affiliate/AffiliateOfferResolver.js';
import { renderAffiliateDisclosureHtml } from '../affiliate/AffiliateDisclosure.js';
import { isPartIndexable, getIndexablePartEntry } from '../seo/PartIndexationRegistry.js';
import { isPartIndexationPilotEnabled, getPartIndexationPilotEntry } from '../seo/PartIndexationPilot.js';

export function renderPartDetailPageHtml(rawPartNumberOrResolved, database = null, baseUrl = PRIMARY_ORIGIN) {
  const resolved = (rawPartNumberOrResolved && typeof rawPartNumberOrResolved === 'object' && rawPartNumberOrResolved.part_number)
    ? rawPartNumberOrResolved
    : PartCatalogResolver.resolvePartNumber(rawPartNumberOrResolved, database);
  const rawPartNumber = typeof rawPartNumberOrResolved === 'string' ? rawPartNumberOrResolved : (resolved?.part_number || '');
  const formattedPartNo = resolved?.part_number_display || PartNormalizer.formatPartNumber(rawPartNumber);
  const canonicalUrl = `${baseUrl}/onderdeelnummer/${resolved?.part_number || rawPartNumber}/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Onderdeelnummers', url: '/onderdeelnummer/' },
    { name: `STIHL ${formattedPartNo}`, url: `/onderdeelnummer/${resolved?.part_number || rawPartNumber}/` }
  ];

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  if (!resolved || (!resolved.part_name && resolved.fitment_count === 0)) {
    return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>STIHL ${formattedPartNo} Onderdeel | STIHLDecoder</title>
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="noindex, follow">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "${baseUrl}/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Onderdeelnummers",
        "item": "${baseUrl}/onderdeelnummer/"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "STIHL ${formattedPartNo}",
        "item": "${canonicalUrl}"
      }
    ]
  }
  </script>
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

  const isIndexable = Boolean(resolved?.part_number && isPartIndexable(resolved.part_number));
  const indexEntry = isIndexable ? getIndexablePartEntry(resolved.part_number) : null;
  const displayPartName = indexEntry?.clean_name || resolved.technical_profile?.display_name || resolved.part_name || 'STIHL Vervangingsonderdeel';
  const robotsContent = isIndexable ? 'index, follow' : 'noindex, follow';
  const pageTitle = isIndexable
    ? `STIHL ${formattedPartNo} ${displayPartName} — Geschikte Modellen | STIHLDecoder`
    : `STIHL ${formattedPartNo} — ${displayPartName} | Compatibiliteit & Onderdeelgids`;
  const metaDescription = isIndexable
    ? `Bekijk op welke STIHL machines onderdeel ${formattedPartNo} (${displayPartName.toLowerCase()}) voorkomt, met bekende uitvoeringen, montageposities en compatibiliteitsinformatie.`
    : `STIHL onderdeelnummer ${formattedPartNo} (${displayPartName}). Bekijk geschikte modellen, montagelocatie en diagramposities.`;

  const compatibleModels = resolved.compatible_models || [];
  const fitments = resolved.fitments || [];

  const offers = AffiliateOfferResolver.resolveOffers({
    partNumber: resolved.part_number,
    partName: displayPartName,
    model: compatibleModels[0]?.model_id || null
  });

  // Group fitments by section (meaningful, resolved diagram sections only, including verified multi-section contexts)
  const sectionMap = new Map();
  const seenInDetailSection = new Map();
  for (const f of fitments) {
    const resolvedSecs = Array.isArray(f.resolved_sections) && f.resolved_sections.length > 0
      ? f.resolved_sections.map(rs => rs.section_name)
      : [f.section_name];

    for (const sName of resolvedSecs) {
      if (!sName || sName === 'Unresolved Diagram Section' || sName === 'Algemene sectie' || sName === 'general_unresolved') {
        continue;
      }
      if (!sectionMap.has(sName)) {
        sectionMap.set(sName, []);
        seenInDetailSection.set(sName, new Set());
      }
      const dedupKey = `${f.canonical_model_id}::${f.diagram_position || ''}`;
      if (!seenInDetailSection.get(sName).has(dedupKey)) {
        seenInDetailSection.get(sName).add(dedupKey);
        sectionMap.get(sName).push({
          ...f,
          section_name: sName
        });
      }
    }
  }

  const supersession = resolved.technical_profile?.supersession;
  let supersessionHtml = '';
  if (supersession && supersession.replaced_by && supersession.public_active && supersession.applicability !== 'EVIDENCE_ONLY_SCOPE_UNRESOLVED') {
    const formattedReplacedBy = PartNormalizer.formatPartNumber(supersession.replaced_by) || supersession.replaced_by;
    const targetLinkHtml = supersession.target_in_catalog
      ? `<a href="/onderdeelnummer/${supersession.replaced_by}/" class="text-amber-400 hover:text-amber-300 font-mono font-bold underline ml-1">STIHL ${formattedReplacedBy} →</a>`
      : `<span class="font-mono font-bold text-amber-300 ml-1">STIHL ${formattedReplacedBy}</span>`;

    let noticeText = '';
    const serialCond = supersession.scope?.serial_condition;
    if (serialCond && serialCond.serial) {
      noticeText = `STIHL technische documentatie (${supersession.source_document || 'TI'}) vermeldt voor deze toepassing een wijziging vanaf serienummer <strong>${serialCond.serial}</strong> naar onderdeel: ${targetLinkHtml}.`;
    } else if (supersession.scope?.model_ids && supersession.scope.model_ids.length > 0) {
      const modelsDisplay = supersession.scope.model_ids.map(m => m.toUpperCase().replace(/_/g, ' ')).join(', ');
      noticeText = `Volgens officiële STIHL technische documentatie (${supersession.source_document || 'TI'}) geldt voor <strong>${modelsDisplay}</strong> een vervanging naar onderdeel: ${targetLinkHtml}.`;
    } else if (supersession.applicability === 'GLOBAL_EXPLICIT') {
      noticeText = `Volgens officiële STIHL technische documentatie (${supersession.source_document || 'TI'}) is dit onderdeelnummer <strong>vervangen door</strong>: ${targetLinkHtml}.`;
    }

    if (noticeText) {
      supersessionHtml = `
    <!-- Superseded Part Notice Banner -->
    <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-left">
      <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center shrink-0">ℹ</div>
      <div class="space-y-1">
        <div class="text-sm font-bold text-amber-300">Vervangen onderdeelnummer</div>
        <p class="text-xs text-gray-300 leading-relaxed">
          ${noticeText}
        </p>
      </div>
    </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${pageTitle}</title>
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="${robotsContent}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "${baseUrl}/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Onderdeelnummers",
        "item": "${baseUrl}/onderdeelnummer/"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "STIHL ${formattedPartNo}",
        "item": "${canonicalUrl}"
      }
    ]
  }
  </script>
  ${isIndexable ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "STIHL ${formattedPartNo} ${displayPartName}",
    "mpn": "${formattedPartNo}",
    "sku": "${resolved?.part_number || rawPartNumber}",
    "brand": {
      "@type": "Brand",
      "name": "STIHL"
    },
    "description": ${JSON.stringify(metaDescription)},
    "category": "Tuin- en bosbouwmachine onderdelen"
  }
  </script>
  ` : ''}
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
      <div class="flex items-center gap-3 text-xs">
        <a href="/onderdelen/" class="text-gray-300 hover:text-white transition hidden sm:inline">
          Onderdelen Zoeker
        </a>
        <a href="/onderdeelnummer/" class="text-orange-400 font-bold hover:underline">
          ← Alle Onderdeelnummers
        </a>
      </div>
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
        STIHL ${formattedPartNo}${isIndexable ? ` — ${displayPartName}` : ''}
      </h1>
      <p class="text-lg text-orange-400 font-semibold">
        ${isIndexable ? `${displayPartName} & Compatibiliteit` : displayPartName}
      </p>
      <p class="text-xs text-gray-400 leading-relaxed max-w-3xl">
        Canonieke referentie voor STIHL onderdeelnummer <strong>${formattedPartNo}</strong>. Controleer altijd het typeplaatje en de specifieke machine-uitvoering vóór montage.
      </p>
    </header>
${supersessionHtml}

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

    ${(resolved.technical_profile?.supersession?.public_active && resolved.technical_profile.supersession.applicability !== 'EVIDENCE_ONLY_SCOPE_UNRESOLVED') ? `
    <!-- Technical Supersession Notice -->
    <section class="bg-blue-950/40 border border-blue-800/60 rounded-2xl p-5 space-y-2 text-xs">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-blue-400"></span>
        <h3 class="font-bold text-white text-sm">Opvolgend Onderdeelnummer</h3>
        <span class="text-3xs font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/60">Officieel STIHL Bulletin</span>
      </div>
      <p class="text-gray-300 leading-relaxed">
        ${resolved.technical_profile.supersession.scope?.serial_condition?.serial
          ? `STIHL technische documentatie (${resolved.technical_profile.supersession.source_document || 'Service Bulletin'}) vermeldt voor deze toepassing een wijziging vanaf serienummer <strong>${resolved.technical_profile.supersession.scope.serial_condition.serial}</strong> naar onderdeel: ${resolved.technical_profile.supersession.target_in_catalog ? `<a href="/onderdeelnummer/${resolved.technical_profile.supersession.replaced_by}/" class="font-mono font-bold text-orange-400 hover:underline">${PartNormalizer.formatPartNumber(resolved.technical_profile.supersession.replaced_by) || resolved.technical_profile.supersession.replaced_by} →</a>` : `<span class="font-mono font-bold text-orange-300">${PartNormalizer.formatPartNumber(resolved.technical_profile.supersession.replaced_by) || resolved.technical_profile.supersession.replaced_by}</span>`}.`
          : `Volgens officiële STIHL documentatie (${resolved.technical_profile.supersession.source_document || 'Service Bulletin'}) is onderdeel <strong>${formattedPartNo}</strong> vervangen door: ${resolved.technical_profile.supersession.target_in_catalog ? `<a href="/onderdeelnummer/${resolved.technical_profile.supersession.replaced_by}/" class="font-mono font-bold text-orange-400 hover:underline">${PartNormalizer.formatPartNumber(resolved.technical_profile.supersession.replaced_by) || resolved.technical_profile.supersession.replaced_by} →</a>` : `<span class="font-mono font-bold text-orange-300">${PartNormalizer.formatPartNumber(resolved.technical_profile.supersession.replaced_by) || resolved.technical_profile.supersession.replaced_by}</span>`}.`}
      </p>
      <p class="text-2xs text-gray-400">
        Controleer altijd machinenummer en specifieke configuratie voorafgaand aan montage.
      </p>
    </section>
    ` : ''}

    ${sectionMap.size > 0 ? `
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
                  ${f.canonical_model_id.replace(/_/g, ' ').toUpperCase()}${f.diagram_position ? ` (Pos. ${f.diagram_position})` : ''}
                </span>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    ${offers.length > 0 ? (() => {
      const hasVerifiedOffer = offers.some(o => o.match_type === 'MANUAL_ASIN' || o.is_verified === true);
      const sectionTitle = hasVerifiedOffer ? 'Waar te koop' : 'Zoek dit onderdeel online';
      const sectionPill = hasVerifiedOffer ? 'Aangesloten webwinkels' : 'Online zoeken';
      const sectionIntro = hasVerifiedOffer
        ? 'Bekijk gecontroleerde productpagina’s en zoekopties bij aangesloten webwinkels.'
        : 'Zoek op Amazon naar dit onderdeelnummer. Beschikbaarheid en exacte productmatch zijn niet vooraf bevestigd.';
      const sectionId = hasVerifiedOffer ? 'waar-te-koop-heading' : 'zoek-online-heading';

      return `
    <!-- Commercial Offers Section ("${sectionTitle}") -->
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 text-xs" aria-labelledby="${sectionId}">
      <div class="flex items-center justify-between">
        <h2 id="${sectionId}" class="text-base font-bold text-white flex items-center gap-2">
          <span>${sectionTitle}</span>
          <span class="text-2xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">${sectionPill}</span>
        </h2>
      </div>
      <p class="text-xs text-gray-400 leading-relaxed">
        ${sectionIntro}
      </p>
      <div class="space-y-3">
        ${offers.map(offer => {
          const isVerified = Boolean(offer.is_verified || offer.match_type === 'MANUAL_ASIN');
          const badgeText = offer.badge_label || (isVerified ? 'Geverifieerd product' : 'Amazon-zoekopdracht');
          const buttonText = offer.label || (isVerified ? 'Bekijk product op Amazon.nl' : 'Zoek op Amazon.nl');
          const descriptionText = offer.description || (isVerified
            ? 'Voor dit onderdeel is een specifieke Amazon-productpagina gecontroleerd. Controleer vóór aankoop altijd onderdeelnummer en machine-uitvoering.'
            : `Zoek op Amazon naar STIHL onderdeel ${formattedPartNo}. De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd.`);
          const ariaLabel = offer.cta_aria_label || `${buttonText} voor STIHL onderdeel ${formattedPartNo}`;

          const redirectParams = new URLSearchParams({
            url: offer.url,
            part_number: resolved.part_number,
            model: compatibleModels[0]?.model_id || '',
            provider: offer.provider || 'amazon',
            marketplace: offer.marketplace || '',
            offer_type: offer.match_type || 'SEARCH_LINK',
            match_type: offer.match_type || (isVerified ? 'MANUAL_ASIN' : 'SEARCH_LINK'),
            asin_if_known: offer.asin || '',
            product_verified: isVerified ? 'true' : 'false',
            query_variant: offer.query_variant || '',
            seo_tier: indexEntry?.seo_tier || (isIndexable ? 'SEO_TIER_A' : 'SEO_TIER_C'),
            commercial_tier: indexEntry?.commercial_tier || 'COMMERCIAL_UNKNOWN'
          });
          const redirectUrl = `/api/affiliate/out?${redirectParams.toString()}`;
          return `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gray-950/70 border border-gray-800 hover:border-gray-700 transition">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-white text-sm capitalize">${offer.marketplace || offer.provider}</span>
                <span class="text-3xs font-mono px-2 py-0.5 rounded bg-gray-900 text-gray-400 border border-gray-800">${badgeText}</span>
              </div>
              <div class="text-2xs text-gray-400">
                ${descriptionText}
              </div>
            </div>
            <a
              href="${redirectUrl}"
              target="_blank"
              rel="sponsored nofollow noopener"
              class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-sm hover:shadow transition flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950"
              aria-label="${ariaLabel}"
              onclick="if(window.trackStihlEvent){window.trackStihlEvent('affiliate_click', {provider: '${offer.provider}', part_number: '${resolved.part_number}', offer_type: '${offer.match_type}', query_variant: '${offer.query_variant || ''}', asin_if_known: '${offer.asin || ''}', product_verified: ${isVerified}, page_path: window.location.pathname, seo_tier: '${indexEntry?.seo_tier || (isIndexable ? 'SEO_TIER_A' : 'SEO_TIER_C')}', commercial_tier: '${indexEntry?.commercial_tier || 'COMMERCIAL_UNKNOWN'}'});}"
            >
              <span>${buttonText}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        `;}).join('')}
      </div>
      ${renderAffiliateDisclosureHtml()}
    </section>
    `;})() : ''}

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
