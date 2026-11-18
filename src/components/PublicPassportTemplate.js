/**
 * Public Shareable Machine Passport Template & Sanitizer
 * Route: /paspoort/:shareId/
 * Strictly enforces PII protection, serial masking, evidence separation, and owner-declaration labeling.
 */

import { renderQrSvg } from '../utils/qrCode.js';
import { getPublicEvidenceFactsForModel, buildPublicTechnicalSpecs } from '../publicEvidence.js';
import { getSafeModelPath, getSafeModelPartsPath, getSafeCategorySlug, getFuelDriveLabel } from '../publicationRules.js';
import { PartCatalogResolver } from '../parts/PartCatalogResolver.js';
import { buildModelRecommendations, renderPassportRecommendationSlotsHtml } from '../modelRecommendations.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function maskSerialForPublicDisplay(rawSerial) {
  const s = String(rawSerial || '').trim();
  if (!s) return null;
  if (s.length <= 3) return '•••';
  return `${'•'.repeat(Math.min(8, Math.max(4, s.length - 3)))}${s.slice(-3)}`;
}

export function sanitizePassportForShare(input = {}, database = {}) {
  const rawModelSlug = String(input.model_slug || input.modelSlug || '').trim().toLowerCase();
  const rawModelName = String(input.model_name || input.modelName || '').trim();
  const models = Array.isArray(database?.models) ? database.models : [];

  const matchedModel = models.find((m) =>
    (m.slug && m.slug.toLowerCase() === rawModelSlug) ||
    (m.model_name && m.model_name.toLowerCase() === rawModelName.toLowerCase())
  ) || null;

  const modelName = matchedModel?.model_name || rawModelName;
  const modelSlug = matchedModel?.slug || rawModelSlug || modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!modelName || !modelSlug) {
    return { error: 'Modelidentiteit is vereist om een paspoort te delen.' };
  }

  const rawVariant = input.variant ? String(input.variant).trim().slice(0, 80) : null;
  const rawIdStatus = String(input.identity_status || input.identityStatus || '').trim();
  const variantUnconfirmed = Boolean(
    input.variant_unconfirmed ||
    input.variantUnconfirmed ||
    rawIdStatus === 'VARIANT_UNCONFIRMED'
  );
  const identityStatus = variantUnconfirmed ? 'VARIANT_UNCONFIRMED' : 'MODEL_CONFIRMED';

  const rawSerialStatus = String(input.serial_status || input.serialStatus || '').trim();
  const serialStatus = rawSerialStatus === 'SERIAL_OFFICIALLY_VERIFIED'
    ? 'SERIAL_OFFICIALLY_VERIFIED'
    : 'SERIAL_UNVERIFIED';

  // Critical Privacy Gate: NEVER store or expose unmasked serial or PII in public share records
  const rawSerial = input.serial_number || input.serialNumber || '';
  const serialMasked = rawSerial ? maskSerialForPublicDisplay(rawSerial) : (input.serial_masked ? String(input.serial_masked).slice(0, 24) : null);

  const condition = input.condition ? String(input.condition).trim().slice(0, 40) : null;
  const rawYear = input.owner_declared_year ?? input.purchase_year ?? input.purchaseYear ?? null;
  const parsedYear = rawYear ? parseInt(rawYear, 10) : null;
  const ownerDeclaredYear = parsedYear && parsedYear >= 1950 && parsedYear <= new Date().getFullYear() + 1 ? parsedYear : null;

  const nickname = input.nickname ? String(input.nickname).trim().slice(0, 50) : null;

  // Validate compressed re-encoded dataURL images only (max 3, max 320KB chars each, never SVG/HTML)
  const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
  const photos = rawPhotos
    .filter((p) => typeof p === 'string' && /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) && p.length <= 350000)
    .slice(0, 3);

  // Sanitize owner maintenance / repair events + notes (strips any PII fields cleanly)
  const rawEvents = Array.isArray(input.maintenance_log)
    ? input.maintenance_log
    : [
        ...(Array.isArray(input.events) ? input.events : []),
        ...(Array.isArray(input.maintenance?.events) ? input.maintenance.events : []),
        ...(Array.isArray(input.notes) ? input.notes : []),
        ...(Array.isArray(input.maintenance?.notes) ? input.maintenance.notes : [])
      ];

  const maintenanceLog = rawEvents.slice(0, 40).map((entry) => ({
    date: String(entry?.date || '').trim().slice(0, 20) || null,
    category: String(entry?.category || entry?.event_type || 'ONDERHOUD').trim().slice(0, 40),
    title: String(entry?.title || entry?.label || entry?.text || entry?.note || '').trim().slice(0, 140),
    part_number: entry?.part_number ? String(entry.part_number).trim().slice(0, 20) : null,
    notes: entry?.notes && entry.title ? String(entry.notes).trim().slice(0, 240) : null
  })).filter((e) => Boolean(e.title));

  return {
    model_slug: modelSlug,
    model_name: modelName,
    variant: rawVariant,
    variant_unconfirmed: variantUnconfirmed,
    identity_status: identityStatus,
    serial_masked: serialMasked,
    serial_present: Boolean(serialMasked),
    serial_status: serialStatus,
    category: matchedModel?.category || input.category || 'STIHL Machine',
    category_slug: matchedModel?.category_slug || getSafeCategorySlug(matchedModel) || 'kettingzagen',
    condition,
    owner_declared_year: ownerDeclaredYear,
    nickname,
    photos,
    maintenance_log: maintenanceLog
  };
}

export function renderPublicPassportHtml(record, database = {}, baseUrl = 'https://www.stihldecoder.nl') {
  const data = typeof record.payload_json === 'string' ? JSON.parse(record.payload_json) : record;
  const shareId = record.share_id || data.share_id;
  const shareCanonicalUrl = `${baseUrl}/paspoort/${encodeURIComponent(shareId)}/`;
  const qrSvg = renderQrSvg(shareCanonicalUrl, 136);

  const models = Array.isArray(database?.models) ? database.models : [];
  const matchedModel = models.find((m) => m.slug === data.model_slug || m.model_name === data.model_name) || null;
  const modelPath = matchedModel ? getSafeModelPath(matchedModel) : null;
  const hasParts = matchedModel ? PartCatalogResolver.hasPartsForModel(matchedModel, database) : false;
  const partsPath = matchedModel && hasParts ? getSafeModelPartsPath(matchedModel) : null;

  const techSpecs = matchedModel ? buildPublicTechnicalSpecs(matchedModel, database) : {};
  const publicFacts = matchedModel ? getPublicEvidenceFactsForModel(matchedModel, database) : [];
  const fuelLabel = matchedModel ? getFuelDriveLabel(matchedModel) : 'Niet vastgesteld';

  const recommendations = matchedModel
    ? buildModelRecommendations(matchedModel, techSpecs, { compatibilityEvidence: publicFacts })
    : null;
  const recommendationsHtml = recommendations ? renderPassportRecommendationSlotsHtml(recommendations) : '';

  const modelTitle = data.variant && data.variant.toUpperCase() !== data.model_name.toUpperCase()
    ? `${data.model_name} (${data.variant})`
    : (data.variant || data.model_name);

  const identityBadge = data.variant_unconfirmed
    ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">VARIANT_UNCONFIRMED · Basismodel bevestigd</span>'
    : '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">MODEL_CONFIRMED · Model bevestigd</span>';

  const serialBadge = data.serial_status === 'SERIAL_OFFICIALLY_VERIFIED'
    ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">SERIAL_OFFICIALLY_VERIFIED</span>'
    : '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-800 text-gray-300 border border-gray-700">SERIAL_UNVERIFIED · Geen officiële serienummerverificatie</span>';

  const specItems = [];
  if (techSpecs.displacement_cc) specItems.push(['Cilinderinhoud', `${techSpecs.displacement_cc} cc`]);
  if (techSpecs.power_kw) specItems.push(['Vermogen', `${techSpecs.power_kw} kW${techSpecs.power_hp ? ` (${techSpecs.power_hp} pk)` : ''}`]);
  if (techSpecs.spark_plug) specItems.push(['Bougie', `${techSpecs.spark_plug}${techSpecs.electrode_gap_mm ? ` (${techSpecs.electrode_gap_mm} mm)` : ''}`]);
  if (techSpecs.weight_kg) specItems.push(['Gewicht', `${techSpecs.weight_kg} kg`]);
  if (techSpecs.chain_pitch) specItems.push(['Kettingsteek', `${techSpecs.chain_pitch}`]);

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>STIHL ${escapeHtml(modelTitle)} — Gedeeld Machinepaspoort | STIHLDecoder</title>
  <link rel="canonical" href="${escapeHtml(shareCanonicalUrl)}">
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/90 backdrop-blur sticky top-0 z-40">
    <div class="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center font-black text-lg text-white">S</div>
        <div>
          <span class="font-bold text-white block leading-tight">STIHLDecoder</span>
          <span class="text-xs text-orange-400">Deelbaar Machinepaspoort</span>
        </div>
      </a>
      <div class="flex items-center gap-3 text-xs font-bold">
        <a href="/stihl-paspoort/" class="text-orange-400 hover:underline">📋 Mijn Machinepaspoorten</a>
        <a href="/" class="text-gray-300 hover:text-white">← Decoder</a>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
    <!-- Top Identity & QR Card -->
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5 shadow-xl">
      <div class="flex flex-col md:flex-row justify-between gap-6 items-start">
        <div class="space-y-3 flex-1">
          <div class="flex flex-wrap gap-2">
            ${identityBadge}
            ${serialBadge}
          </div>
          <h1 class="text-2xl sm:text-3xl font-black text-white">
            STIHL ${escapeHtml(modelTitle)}
          </h1>
          ${data.nickname ? `<p class="text-sm text-orange-300 font-semibold">Roepnaam: ${escapeHtml(data.nickname)} <span class="text-xs text-gray-400">(eigen opgave)</span></p>` : ''}
          ${data.variant_unconfirmed ? `
            <div class="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
              Basismodel <strong>STIHL ${escapeHtml(data.model_name)}</strong> is bevestigd. De opgegeven uitvoering <strong>"${escapeHtml(data.variant || '')}"</strong> is niet afzonderlijk bevestigd in officiële STIHL-documentatie.
            </div>
          ` : ''}
        </div>
        <div class="bg-white p-2.5 rounded-xl border border-gray-700 text-center shrink-0">
          ${qrSvg}
          <span class="block text-[10px] font-mono text-gray-800 mt-1 font-bold">Scan paspoort</span>
        </div>
      </div>

      <!-- Machine & Status Facts -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
          <span class="text-gray-400 block">Basismodel</span>
          <strong class="text-white text-sm">STIHL ${escapeHtml(data.model_name)}</strong>
        </div>
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
          <span class="text-gray-400 block">Serienummer (afgeschermd)</span>
          <strong class="text-white font-mono text-sm">${data.serial_masked ? escapeHtml(data.serial_masked) : 'Niet opgegeven'}</strong>
        </div>
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
          <span class="text-gray-400 block">Staat (eigen opgave)</span>
          <strong class="text-white text-sm">${data.condition ? escapeHtml(data.condition) : 'Niet opgegeven'}</strong>
        </div>
        <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
          <span class="text-gray-400 block">Bouwjaar (eigen opgave)</span>
          <strong class="text-orange-400 text-sm">${data.owner_declared_year ? escapeHtml(String(data.owner_declared_year)) : 'Niet opgegeven'}</strong>
        </div>
      </div>

      <!-- Action links -->
      <div class="flex flex-wrap gap-3 pt-2 border-t border-gray-800 text-xs font-bold">
        ${modelPath ? `<a href="${escapeHtml(modelPath)}" class="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white border border-gray-700">📖 Modelpagina STIHL ${escapeHtml(data.model_name)}</a>` : ''}
        ${partsPath ? `<a href="${escapeHtml(partsPath)}" class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white">🔧 Passende onderdelen bekijken →</a>` : ''}
      </div>
    </section>

    <!-- Verified Factory Technical Specifications -->
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white">Gedocumenteerde basisspecificaties</h2>
        <span class="text-xs font-mono text-gray-400">${escapeHtml(fuelLabel)}</span>
      </div>
      ${specItems.length > 0 ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          ${specItems.map(([k, v]) => `
            <div class="bg-gray-950 border border-gray-800 rounded-xl p-3">
              <span class="text-gray-400 block">${escapeHtml(k)}</span>
              <strong class="text-orange-300 font-mono text-sm">${escapeHtml(v)}</strong>
            </div>
          `).join('')}
        </div>
      ` : `
        <p class="text-xs text-gray-400">Voor dit model zijn nog geen afzonderlijke technische fabrieksspecificaties vastgesteld in onze bronnen; controleer het typeplaatje of de originele handleiding.</p>
      `}
    </section>

    ${data.photos && data.photos.length > 0 ? `
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white">Foto's van deze machine</h2>
        <span class="text-xs text-gray-400">Door eigenaar toegevoegd · metadata verwijderd</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${data.photos.map((src, idx) => `
          <div class="rounded-xl overflow-hidden border border-gray-800 bg-gray-950">
            <img src="${src}" alt="STIHL ${escapeHtml(modelTitle)} foto ${idx + 1}" class="w-full h-48 object-cover" />
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <!-- Owner Maintenance & Repair Log -->
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold text-white">Onderhoud &amp; reparaties</h2>
        <span class="text-xs px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">Eigen opgave eigenaar — geen fabrieksverificatie</span>
      </div>
      ${data.maintenance_log && data.maintenance_log.length > 0 ? `
        <ul class="space-y-2 text-xs">
          ${data.maintenance_log.map((item) => `
            <li class="bg-gray-950 border border-gray-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="font-bold text-white block">${escapeHtml(item.title)}</span>
                ${item.notes ? `<span class="text-gray-400">${escapeHtml(item.notes)}</span>` : ''}
                ${item.part_number ? `<span class="text-orange-400 font-mono text-[11px] block">Onderdeelnr: ${escapeHtml(item.part_number)}</span>` : ''}
              </div>
              <span class="text-gray-400 font-mono shrink-0">${item.date ? escapeHtml(item.date) : '—'}</span>
            </li>
          `).join('')}
        </ul>
      ` : `
        <p class="text-xs text-gray-400">Nog geen onderhouds- of reparatievermeldingen vastgelegd door de eigenaar.</p>
      `}
    </section>

    ${recommendationsHtml ? `
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
      <h2 class="text-lg font-bold text-white">Compatibele onderdelen &amp; kooplinks</h2>
      ${recommendationsHtml}
    </section>
    ` : ''}

    <footer class="text-center text-xs text-gray-500 pt-4 pb-8 border-t border-gray-800/80 space-y-1">
      <p>Onafhankelijk STIHL Machinepaspoort via <a href="/" class="text-orange-400 hover:underline">STIHLDecoder.nl</a>.</p>
      <p>Geen officieel eigendomsbewijs. Persoonlijke opmerkingen, bouwjaar en onderhoudsvermeldingen berusten op eigen opgave van de gebruiker.</p>
    </footer>
  </main>
</body>
</html>`;
}
