/**
 * Data-Driven Model Page SSR Template Renderer for STIHLDecoder.nl
 * Phase 30 Strategic Models & Troubleshooting Guides Interlinking
 */

import { buildStructuredData } from './StructuredData.js';
import { renderSeoMeta } from './SeoMeta.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { getRelatedModels, renderRelatedModelsHtml } from './RelatedModels.js';
import { getModelVerificationSummary } from '../canonicalData.js';
import { PRIMARY_ORIGIN } from '../config.js';
import {
  buildPublicEvidenceFields,
  buildPublicEvidenceFieldMap,
  buildPublicEvidenceMeta,
  buildPublicSourceSummary,
  formatPublicTechnicalValue,
  flattenPublicFactValue,
  getPublicTechnicalDisplayState,
  getPreferredPublicFact,
  getSingleValuePublicFact,
  getPublicStatusLabel
} from '../publicEvidence.js';
import {
  getFuelDriveLabel,
  getRegisteredComparisonForModel,
  getRegisteredComparisons,
  isPetrolModel,
  getSafeCategorySlug,
  getSafeModelPartsPath,
  getSafeModelPath,
  getSerialLocationAnswer,
  getValuationPublicationState,
  isBatteryModel,
  getRelevantPublicLinks
} from '../publicationRules.js';

function renderFactEvidenceLine(fact) {
  if (!fact) return '';
  const meta = buildPublicEvidenceMeta(fact);
  const label = getPublicStatusLabel(fact.public_evidence_status);
  const locator = [`p. ${meta.pdfPage}`];
  if (meta.publicationId) locator.unshift(meta.publicationId);
  return `
    <div class="pt-2 border-t border-gray-800/70 space-y-1">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">${label}</span>
      <p class="text-2xs text-gray-400">${meta.sourceDocumentTitle}${locator.length ? ` · ${locator.join(' · ')}` : ''}</p>
    </div>
  `;
}

function renderConflictBlock(label, publicField) {
  if (!publicField || publicField.evidence_status !== 'OFFICIAL_CONFLICTED') return '';
  const values = Array.isArray(publicField.values) ? publicField.values : [];
  if (values.length === 0) return '';

  return `
    <div class="bg-amber-500/10 p-4 rounded-xl border border-amber-500/30 space-y-3">
      <div>
        <span class="text-gray-400 block">${label}:</span>
        <span class="text-base font-bold text-amber-300">Bronverschil gevonden</span>
      </div>
      <div class="space-y-2 text-xs text-gray-200">
        ${values.map((entry) => `
          <div class="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
            <span class="block font-semibold text-white">${entry.sourceLabel || 'Officiële bron'}</span>
            <span class="block text-orange-300">${entry.value}${entry.unit ? ` ${entry.unit}` : ''}</span>
          </div>
        `).join('')}
      </div>
      <p class="text-2xs text-gray-400">STIHL-documentatie vermeldt verschillende waarden. Mogelijk betreft dit een uitvoering, revisie of marktverschil.</p>
    </div>
  `;
}

function renderSingleValueField(label, publicField, fallbackMarkup = '') {
  if (publicField?.single_value_eligible) {
    return `
      <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
        <span class="text-gray-400 block">${label}:</span>
        <span class="text-base font-bold text-white">${publicField.value}${publicField.unit ? ` ${publicField.unit}` : ''}</span>
      </div>
    `;
  }
  if (publicField?.evidence_status === 'OFFICIAL_CONFLICTED') {
    return renderConflictBlock(label, publicField);
  }
  return fallbackMarkup;
}

function renderComparisonValue(modelSlug, field, database, formatter) {
  const state = getPublicTechnicalDisplayState(modelSlug, field, database);
  if (state.single_value_eligible) {
    return formatPublicTechnicalValue(state, formatter);
  }
  if (state.evidence_status === 'OFFICIAL_CONFLICTED') {
    return 'Bronverschil';
  }
  return 'Niet betrouwbaar gedocumenteerd';
}

export function renderModelPageHtml(model, database, baseUrl = PRIMARY_ORIGIN) {
  const verification = getModelVerificationSummary(model);
  const categorySlug = getSafeCategorySlug(model);
  const slug = model.slug || model.id.replace(/_/g, '-');
  const publicFieldMap = buildPublicEvidenceFieldMap(slug, database);
  const publicFields = buildPublicEvidenceFields(slug, database);
  const publicSummary = buildPublicSourceSummary(slug, database);
  const powerFact = getSingleValuePublicFact(publicFieldMap.power_kw || []) || getPreferredPublicFact(publicFieldMap.power_kw || []);
  const displacementFact = getSingleValuePublicFact(publicFieldMap.displacement_cc || []) || getPreferredPublicFact(publicFieldMap.displacement_cc || []);
  const sparkFact = getPreferredPublicFact(publicFieldMap.spark_plug || []);
  const gapFact = getPreferredPublicFact(publicFieldMap.electrode_gap_mm || []);
  const weightFact = getSingleValuePublicFact(publicFieldMap.weight_kg || []) || getPreferredPublicFact(publicFieldMap.weight_kg || []);
  const canonicalUrl = categorySlug ? `${baseUrl}/${categorySlug}/${slug}/` : `${baseUrl}/modellen-onbekend/${slug}/`;
  const safeModelPath = getSafeModelPath(model);
  const safePartsPath = getSafeModelPartsPath(model);

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    ...(categorySlug ? [{ name: model.category || 'Modellen', url: `/${categorySlug}/` }] : []),
    { name: `STIHL ${model.model_name}`, url: safeModelPath || canonicalUrl.replace(baseUrl, '') }
  ];

  const jsonLdData = buildStructuredData({
    pageType: 'model',
    model,
    publicEvidence: {
      fields: publicFields,
      summary: publicSummary,
      modelKey: slug
    },
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
  const relatedModelsHtml = renderRelatedModelsHtml(relatedModels, database);

  const isPetrol = isPetrolModel(model);
  const isBattery = isBatteryModel(model);
  const isChainsaw = categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen';
  const fuelDriveLabel = getFuelDriveLabel(model);
  const valuationState = getValuationPublicationState(model);

  // Model comparison partner detection
  const registeredComparison = getRegisteredComparisonForModel(model, database);
  const comparisonPartner = registeredComparison ? registeredComparison.partner : null;
  const comparisonPartnerPath = getSafeModelPath(comparisonPartner);
  const comparisonSlug = registeredComparison ? registeredComparison.comparisonSlug : null;
  const registeredComparisonLinks = getRegisteredComparisons(categorySlug).slice(0, 3);
  const comparisonDatabase = comparisonPartner ? database : null;
  const modelComparisonPower = comparisonDatabase
    ? renderComparisonValue(slug, 'power_kw', comparisonDatabase, (value) => `${value} kW`)
    : null;
  const partnerComparisonPower = comparisonPartner && comparisonDatabase
    ? renderComparisonValue(comparisonPartner.slug || comparisonPartner.model_name, 'power_kw', comparisonDatabase, (value) => `${value} kW`)
    : null;
  const modelComparisonDisplacement = comparisonDatabase
    ? renderComparisonValue(slug, 'displacement_cc', comparisonDatabase, (value) => `${value} cc`)
    : null;
  const partnerComparisonDisplacement = comparisonPartner && comparisonDatabase
    ? renderComparisonValue(comparisonPartner.slug || comparisonPartner.model_name, 'displacement_cc', comparisonDatabase, (value) => `${value} cc`)
    : null;
  const modelComparisonWeight = comparisonDatabase
    ? renderComparisonValue(slug, 'weight_kg', comparisonDatabase, (value) => `${value} kg`)
    : null;
  const partnerComparisonWeight = comparisonPartner && comparisonDatabase
    ? renderComparisonValue(comparisonPartner.slug || comparisonPartner.model_name, 'weight_kg', comparisonDatabase, (value) => `${value} kg`)
    : null;

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
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Modelgids met bronstatus</span>
          </span>
          <p class="text-xs text-gray-400">Serienummers, Specificaties & Waardebepaling</p>
        </div>
      </a>
      <div class="flex items-center gap-4">
        <a href="/stihl-paspoort/" class="text-xs text-orange-400 font-bold hover:underline flex items-center gap-1">📋 Mijn machines</a>
        <a href="/" class="text-xs text-gray-400 font-bold hover:text-white transition">← Terug naar Zoeken</a>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="max-w-4xl mx-auto px-4 py-6 flex-1 w-full space-y-8">

    <!-- Breadcrumbs -->
    ${breadcrumbsHtml}

    <!-- Header & H1 Title with Data Authority Badges -->
    <header class="space-y-3">
      <div class="flex flex-wrap gap-2 items-center">
        ${categorySlug ? `<a href="/${categorySlug}/" class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:underline">
          STIHL ${model.category || 'Modelgids'} Categorie
        </a>` : `<span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-gray-800 text-gray-300 border border-gray-700">Categorie: UNKNOWN</span>`}
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Data Kwaliteit: ${verification.displayConfidence} (${verification.badgeLabel})
        </span>
        <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
          Bronstatus: ${publicSummary.display_fact_count > 0 ? publicSummary.summaryLabel : verification.sourceLabel}
        </span>
      </div>

      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        STIHL ${model.model_name} Serienummer Decoder, Bouwjaar & Modelinformatie
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Bekijk de momenteel bekende modeldata van de STIHL ${model.model_name}. Gebruik het serienummer voor formaat- en herkomstcontrole en bevestig model en uitvoering altijd via typeplaatje of primaire handleiding.
      </p>
    </header>

    <!-- Prominent Decoder Tool Card -->
    <section class="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 stihl-orange-glow">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <h2 class="text-lg font-bold text-white">Serienummer van jouw STIHL ${model.model_name} controleren?</h2>
          </div>
          <p class="text-xs text-gray-300">Gebruik de interactieve serienummerdecoder op de homepage voor directe herkomst-, bouwjaar- en formaatcontrole.</p>
        </div>
        <a
          href="/#decoder"
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-600/30 text-xs flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <span>Serienummer Controleren</span>
          <span>→</span>
        </a>
      </div>
      <div class="pt-3 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="space-y-0.5">
          <span class="text-xs font-bold text-white block">Heb je deze machine?</span>
          <span class="text-2xs text-gray-400 block">Bewaar je machinegegevens, onderhoud en serienummer in je eigen STIHL Machinepaspoort.</span>
        </div>
        <a
          href="/stihl-paspoort/#add=${encodeURIComponent(slug)}"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition text-xs font-bold shadow-md cursor-pointer whitespace-nowrap"
        >
          <span>Voeg hem toe aan Mijn STIHL →</span>
        </a>
      </div>
    </section>

    <!-- Technical Specifications Grid -->
    <section id="technische-gegevens" class="space-y-4">
      <h2 class="text-2xl font-black border-b border-gray-800 pb-2 text-white flex items-center justify-between">
        <span>Fabrieksspecificaties STIHL ${model.model_name}</span>
        <span class="text-xs font-normal text-gray-400">${verification.badgeLabel}</span>
      </h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Motorvermogen:</span>
          <span class="text-base font-bold text-white">${powerFact && powerFact.public_evidence_status !== 'OFFICIAL_CONFLICTED' ? `${powerFact.normalized_value} kW` : 'Nog niet betrouwbaar gedocumenteerd'}</span>
          ${renderFactEvidenceLine(powerFact)}
        </div>

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <span class="text-gray-400 block">Cilinderinhoud / Aandrijving:</span>
          <span class="text-base font-bold text-white">${displacementFact && displacementFact.public_evidence_status !== 'OFFICIAL_CONFLICTED' ? `${displacementFact.normalized_value} cc` : fuelDriveLabel}</span>
          ${renderFactEvidenceLine(displacementFact)}
        </div>

        ${isPetrol ? `
          ${publicFields.spark_plug?.single_value_eligible || publicFields.electrode_gap_mm?.single_value_eligible ? `
            <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
              <span class="text-gray-400 block">Bougie & Elektrodenafstand:</span>
              <span class="text-base font-bold text-white">${publicFields.spark_plug?.value || ''}${publicFields.electrode_gap_mm?.value != null ? ` (${publicFields.electrode_gap_mm.value} mm)` : ''}</span>
              ${renderFactEvidenceLine((sparkFact?.public_evidence_status === 'OFFICIAL_CONFLICTED' || gapFact?.public_evidence_status === 'OFFICIAL_CONFLICTED') ? (sparkFact || gapFact) : (sparkFact || gapFact))}
            </div>
          ` : ''}
        ` : ''}

        ${renderSingleValueField('Gewicht (Kaal motorblok)', publicFields.weight_kg, `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span class="text-gray-400 block">Gewicht (Kaal motorblok):</span>
            <span class="text-base font-bold text-white">Nog niet betrouwbaar gedocumenteerd</span>
          </div>
        `)}

        ${renderSingleValueField('Boring', publicFields.bore_mm)}
        ${renderSingleValueField('Slag', publicFields.stroke_mm)}
        ${renderSingleValueField('Stationair toerental', publicFields.idle_speed_rpm)}
        ${renderSingleValueField('Maximaal toerental', publicFields.max_speed_rpm)}
        ${renderSingleValueField('Brandstoftank', publicFields.fuel_tank_capacity_cm3)}
        ${isChainsaw ? renderSingleValueField('Kettingolietank', publicFields.oil_tank_capacity_cm3) : ''}
        ${renderSingleValueField('Carburateur H-stelschroef', publicFields.carb_h_setting)}
        ${renderSingleValueField('Carburateur L-stelschroef', publicFields.carb_l_setting)}
        ${renderSingleValueField('Carburateur LA-stelschroef', publicFields.carb_la_setting)}
        ${(categorySlug === 'bladblazers' || categorySlug === 'nevelspuiten') ? renderSingleValueField('Blaaskracht', publicFields.blowing_force_n) : ''}
        ${isChainsaw ? renderSingleValueField('Kettingsteek', publicFields.chain_pitch) : ''}
        ${isChainsaw ? renderSingleValueField('Groefbreedte (aandrijfschakel)', publicFields.chain_gauge_mm) : ''}
      </div>
    </section>

    ${model.basic_classification ? `
    <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-3">
      <h3 class="text-sm font-bold text-white border-b border-gray-800 pb-2">Machineclassificatie</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div class="space-y-0.5">
          <span class="text-gray-400 block">Producttype</span>
          <span class="text-white font-bold">${model.basic_classification.product_type || 'Onbekend'}</span>
        </div>
        <div class="space-y-0.5">
          <span class="text-gray-400 block">Machinevorm</span>
          <span class="text-white font-bold">${{HANDHELD:'Handgedragen',WHEELED:'Op wielen',BACKPACK:'Rugmodel',TRUCK:'Opvrachtwagen',BATTERY:'Accu'}[model.basic_classification.machine_form] || model.basic_classification.machine_form}</span>
        </div>
        <div class="space-y-0.5">
          <span class="text-gray-400 block">Aandrijving</span>
          <span class="text-white font-bold">${{GASOLINE:'Benzine',ELECTRIC:'Elektrisch',BATTERY:'Accu',MANUAL:'Handkracht'}[model.basic_classification.power_source] || model.basic_classification.power_source}</span>
        </div>
        <div class="space-y-0.5">
          <span class="text-gray-400 block">Hoofdfunctie</span>
          <span class="text-white font-bold">${{SAWING:'Zagen',BLOWING:'Blazen',TRIMMING:'Maaien',HEDGE_TRIMMING:'Heggensnede',CUTTING:'Snoeien',PRUNING:'Snoeien',CLEANING:'Reinigen',SPRAYING:'Besproeien'}[model.basic_classification.primary_function] || model.basic_classification.primary_function}</span>
        </div>
      </div>
    </section>
    ` : ''}

    <!-- Model-First Machine Passport CTA (Phase 47) -->
    <section class="bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950/30 border border-orange-500/30 rounded-2xl p-6 shadow-xl space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block">
            Mijn STIHL
          </span>
          <h3 class="text-xl font-bold text-white">Heb je deze machine? Voeg hem toe aan Mijn STIHL</h3>
          <p class="text-xs text-gray-300">
            Bewaar je machinegegevens, onderhoud en serienummer in je eigen STIHL Machinepaspoort.
          </p>
        </div>
        <a
          href="/stihl-paspoort/#add=${slug}"
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-5 py-3 rounded-xl transition text-xs text-center flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-orange-600/30"
        >
          <span>➕ Voeg toe aan paspoort</span>
        </a>
      </div>
    </section>

    <!-- Model Comparison Section -->
    ${comparisonPartner && comparisonPartnerPath && comparisonSlug ? `
      <section class="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span>Modelvergelijking: STIHL ${model.model_name} vs STIHL ${comparisonPartner.model_name}</span>
          </h2>
          <a href="/vergelijk/${comparisonSlug}/" class="text-xs text-orange-400 font-bold hover:underline">
            Bekijk Uitgebreide Vergelijking →
          </a>
        </div>
        <p class="text-xs text-gray-300">
          Twijfelt u tussen de STIHL ${model.model_name} en de STIHL ${comparisonPartner.model_name}? Bekijk de belangrijkste technische verschillen in vermogen, cilinderinhoud en gewicht:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-gray-950 p-4 rounded-xl border border-gray-800">
          <div class="space-y-1">
            <span class="font-bold text-orange-400 block font-mono">STIHL ${model.model_name}</span>
            <p class="text-gray-300">• Vermogen: ${modelComparisonPower}</p>
            <p class="text-gray-300">• Inhoud: ${modelComparisonDisplacement}</p>
            <p class="text-gray-300">• Gewicht: ${modelComparisonWeight}</p>
          </div>
          <div class="space-y-1">
            <a href="${comparisonPartnerPath}" class="font-bold text-orange-400 block font-mono hover:underline">
              STIHL ${comparisonPartner.model_name} →
            </a>
            <p class="text-gray-300">• Vermogen: ${partnerComparisonPower}</p>
            <p class="text-gray-300">• Inhoud: ${partnerComparisonDisplacement}</p>
            <p class="text-gray-300">• Gewicht: ${partnerComparisonWeight}</p>
          </div>
        </div>
      </section>
    ` : ''}

    <!-- Conversion Funnel CTAs -->
    <section class="grid grid-cols-1 ${safePartsPath ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 text-xs">
      <a href="/stihl-paspoort/#add=${encodeURIComponent(slug)}" class="bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-orange-400 text-sm block group-hover:underline">📋 1. Voeg toe aan Mijn STIHL</span>
        <span class="text-gray-400 block text-2xs">Sla machinegegevens en onderhoud op in uw machinepaspoort</span>
      </a>
      <a href="#technische-gegevens" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">⚙️ 2. Specificaties</span>
        <span class="text-gray-400 block text-2xs">Geverifieerde motorgegevens en bronstatus</span>
      </a>
      ${safePartsPath ? `<a href="${safePartsPath}" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 p-4 rounded-xl text-center space-y-1 block transition group">
        <span class="font-bold text-white text-sm block group-hover:underline">🔧 3. Bekijk Onderdelen</span>
        <span class="text-gray-400 block text-2xs">${model.series_code ? `Modelgebonden onderdelen voor serie ${model.series_code}` : 'Modelgebonden onderdeleninformatie'}</span>
      </a>` : ''}
    </section>

    <!-- Interlinking Hub -->
    <section class="bg-gray-900/60 border border-gray-800 p-5 rounded-2xl space-y-3 text-xs">
      <h3 class="text-sm font-bold text-white">Relevante STIHL Gidsen & Kennisbank:</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300">
        ${getRelevantPublicLinks(model, database).map((l) => `<a href="${l.href}" class="hover:text-orange-400 hover:underline">→ ${l.label}</a>`).join('')}
      </div>
    </section>

    <!-- Visible FAQs Section -->
    <section class="space-y-4 pt-4 border-t border-gray-800">
      <h3 class="text-xl font-bold text-white">Veelgestelde Vragen over STIHL ${model.model_name}</h3>

      <div class="space-y-3 text-xs">
        ${(() => {
          const knownPeriod = model.production_years || (model.production_start_year ? `${model.production_start_year} - ${model.production_end_year || 'heden'}` : null) || model.year_introduced || model.production_period || null;
          if (!knownPeriod) return '';
          return `
          <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <h4 class="font-bold text-white">Hoe oud is mijn STIHL ${model.model_name}?</h4>
            <p class="text-gray-300">De STIHL ${model.model_name} heeft een bekende productieperiode (${knownPeriod}). Het exacte bouwjaar van uw machine kan worden afgelezen op het fabriekstypeplaatje of via de gietklok (maand-/jaarstempel) op het carter.</p>
          </div>`;
        })()}

        <div class="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
          <h4 class="font-bold text-white">Waar vind ik het serienummer van de STIHL ${model.model_name}?</h4>
          <p class="text-gray-300">${getSerialLocationAnswer(categorySlug)}</p>
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
