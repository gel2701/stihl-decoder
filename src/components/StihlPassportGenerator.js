/**
 * Stihl Serienummer Rapport Component & 1200x900px Canvas Exporter
 * Phase 33 Category Specification Whitelist & Honest Verification Reporting
 */

import { normalizeCategorySlug, CATEGORY_TYPES } from '../categoryWhitelist.js';
import { getClassificationContextLabel } from '../driveClassification.js';
import { buildModelRecommendations, renderPassportRecommendationSlotsHtml } from '../modelRecommendations.js';
import { resolvePlantRecord } from '../decoder.js';

function compactText(value, fallback = 'Niet vastgesteld') {
  const text = String(value || '').trim();
  return text || fallback;
}

function getFactSourceTag(field, data) {
  const fact = (data.publicEvidenceFacts || []).find((f) => f.field === field);
  const meta = fact?.meta;
  if (meta?.sourceDocumentId && meta?.sourceEdition) {
    const pageStr = meta.printedPage ? `, p. ${meta.printedPage}` : '';
    return `(✓ STIHL ${meta.sourceDocumentId} Ed. ${meta.sourceEdition}${pageStr})`;
  }
  if (meta?.sourceDocumentId) {
    const pageStr = meta.printedPage ? `, p. ${meta.printedPage}` : '';
    return `(✓ STIHL ${meta.sourceDocumentId}${pageStr})`;
  }
  return '(✓ Officieel bevestigd)';
}

function buildSafePassportSpecRows(data) {
  const specs = data.technicalSpecs && typeof data.technicalSpecs === 'object' ? data.technicalSpecs : {};
  const rows = [];

  if (specs.displacement_cc) rows.push(`Motorinhoud: ${specs.displacement_cc} cc ${getFactSourceTag('displacement_cc', data)}`);
  if (specs.power_kw) rows.push(`Vermogen: ${specs.power_kw} kW ${getFactSourceTag('power_kw', data)}`);
  if (specs.idle_speed_rpm) rows.push(`Stationair toerental: ${specs.idle_speed_rpm} 1/min ${getFactSourceTag('idle_speed_rpm', data)}`);
  if (specs.spark_plug) rows.push(`Bougie: ${specs.spark_plug} ${getFactSourceTag('spark_plug', data)}`);
  if (specs.electrode_gap_mm) rows.push(`Elektrodenafstand: ${specs.electrode_gap_mm} mm ${getFactSourceTag('electrode_gap_mm', data)}`);
  if (specs.fuel_tank_l) rows.push(`Brandstoftank: ${specs.fuel_tank_l} l ${getFactSourceTag('fuel_tank_l', data)}`);
  if (specs.oil_tank_l) rows.push(`Olietank: ${specs.oil_tank_l} l ${getFactSourceTag('oil_tank_l', data)}`);
  if (specs.weight_kg) rows.push(`Gewicht: ${specs.weight_kg} kg ${getFactSourceTag('weight_kg', data)}`);
  if (specs.chain_pitch && specs.chain_gauge_mm) rows.push(`Kettingsteek: ${specs.chain_pitch} @ ${specs.chain_gauge_mm} mm`);

  return rows;
}

export function buildPassportViewModel(data = {}, databaseOrResult = null) {
  const db = databaseOrResult || data.database || null;
  const serialRaw = data.cleanedSerial || data.serialNumber || data.serial || (data.machine && data.machine.serial_number) || '';
  const serial = typeof serialRaw === 'string' ? serialRaw.trim() : (serialRaw ? String(serialRaw).trim() : '');
  const hasSerial = Boolean(serial && serial !== 'null' && serial !== 'undefined');

  const formattedSerial = hasSerial
    ? (data.formatted || (serial.length === 9 ? `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}` : serial))
    : 'Nog niet toegevoegd';

  const isOfficialAnchor = Boolean(
    data.officialAnchor ||
    data.identitySource === 'OFFICIAL_STIHL_LOOKUP' ||
    data.modelIdentitySource === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.identity_source === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.official_source === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.official_product_name
  );

  // Model resolution
  const exactModel = compactText(data.exactModel, '');
  const confirmedModel = compactText(data.confirmedModel, '');
  const resolvedModel = compactText(data.resolvedModel, '');
  const probableModelSeries = compactText(data.probableModelSeries, '');
  const rawModel = compactText(data.model || data.modelName || data.model_name || data.identity?.model_name, '');

  let model = rawModel || 'STIHL Machine';
  let officialProductName = null;
  let canonicalModelName = null;

  if (isOfficialAnchor) {
    officialProductName = data.officialAnchor?.officialProductName || data.officialAnchor?.modelName || data.identity?.official_product_name || exactModel || model;
    model = officialProductName;
    const canonSlug = data.officialAnchor?.canonicalModelId || data.identity?.canonical_model_id || data.resolvedModel || data.canonicalModelId;
    if (canonSlug) {
      canonicalModelName = String(canonSlug).replace(/^stihl_/, '').replace(/-/g, ' ').toUpperCase();
    }
  } else if (exactModel) {
    model = exactModel;
  } else if (confirmedModel) {
    model = confirmedModel;
  } else if (resolvedModel) {
    model = resolvedModel;
  } else if (probableModelSeries) {
    model = probableModelSeries;
  }

  // Model slug & Series code
  const modelSlug = data.modelSlug || data.model_slug || data.identity?.model_slug || (model ? model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
  const seriesCode = data.seriesCode || data.series_code || data.identity?.series_code || null;

  // Identity Status
  let identityStatus = data.modelIdentityStatus || data.identityStatus || data.identity?.identity_status;
  if (!identityStatus) {
    if (isOfficialAnchor) {
      identityStatus = 'EXACT_MODEL_IDENTIFIED';
    } else if (data.exactModel) {
      identityStatus = 'EXACT_MODEL_IDENTIFIED';
    } else if (data.confirmedModel || !hasSerial) {
      identityStatus = 'USER_CONFIRMED_MODEL';
    } else if (data.probableModelSeries) {
      identityStatus = 'PROBABLE_MODEL_SERIES';
    } else {
      identityStatus = 'MODEL_NOT_IDENTIFIED';
    }
  }

  // Determine passport mode
  let passportMode = 'MODEL_ONLY';
  if (isOfficialAnchor) {
    passportMode = 'OFFICIAL_SERIAL_VERIFIED';
  } else if (hasSerial) {
    passportMode = 'MODEL_WITH_SERIAL';
  }

  const categoryStr = compactText(data.category || data.identity?.category, 'Kettingzaag');
  const catSlug = normalizeCategorySlug(categoryStr, model);

  // Country & Factory
  let country = 'Nog niet gekoppeld (geen serienummer)';
  if (hasSerial) {
    const rawCountry = data.machine?.factory_country || data.factory_country || data.plantInfo?.country || data.factory?.country || null;
    const rawLocation = data.machine?.factory_location || data.factory_location || data.plantInfo?.location || data.factory?.location || data.factory?.facility || null;

    if (!rawCountry && db) {
      const factoryCode = data.factory?.code || data.plantInfo?.code || data.plantInfo?.plant_code || (serial.length >= 1 ? serial.charAt(0) : null);
      const plantRecord = resolvePlantRecord(db, factoryCode);
      if (plantRecord && (plantRecord.country || plantRecord.country_name)) {
        const c = plantRecord.country_name || plantRecord.country;
        const loc = plantRecord.plant_location || plantRecord.location || plantRecord.facility;
        country = loc ? `${c} (${loc})` : c;
      } else {
        country = 'Niet vastgesteld';
      }
    } else if (rawCountry) {
      country = rawLocation ? `${rawCountry} (${rawLocation})` : rawCountry;
    } else {
      country = 'Niet vastgesteld';
    }
  }

  // Years: Never calculate or estimate year without serial number!
  const userYear = data.userProvidedYear || data.purchaseYear || data.purchase_year || (data.machine && data.machine.purchase_year) || null;
  let years = 'Niet opgegeven';
  if (userYear) {
    years = `Opgegeven aankoopjaar: ${userYear} (👤 Door gebruiker opgegeven)`;
  } else if (hasSerial) {
    if (data.production && data.production.year) {
      years = `${data.production.year} (geschat)`;
    } else if (data.production && data.production.yearRange) {
      years = data.production.yearRange;
    } else if (data.manufacturingYearEstimate) {
      years = `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Onbekend'}`;
    } else if (data.estimatedYears) {
      years = data.estimatedYears;
    } else {
      years = 'Niet vastgesteld';
    }
  }

  // Identity Titles & Labels
  let identityTitle = 'Modelidentiteit';
  let identityLabel = 'Model geselecteerd door gebruiker';
  let identityExplanation = 'Technische specificaties zijn gekoppeld op basis van het geverifieerde of door gebruiker gekozen model.';

  if (passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    identityTitle = 'Exact model geïdentificeerd';
    identityLabel = 'Officieel bevestigd door STIHL (MY STIHL)';
    identityExplanation = 'Serienummer en modeluitvoering zijn officieel geverifieerd via MY STIHL productlookup.';
  } else if (identityStatus === 'EXACT_MODEL_IDENTIFIED') {
    identityTitle = 'Exact model geïdentificeerd';
    identityLabel = data.confidenceLabel || 'Exact model geïdentificeerd';
    identityExplanation = 'Technische specificaties zijn afkomstig uit officiële documentatie en veilig gekoppeld.';
  } else if (identityStatus === 'USER_CONFIRMED_MODEL' || passportMode === 'MODEL_ONLY') {
    identityTitle = 'Modelbevestiging';
    identityLabel = 'Model geselecteerd door gebruiker';
    identityExplanation = 'Technische specificaties zijn gekoppeld op basis van het door de gebruiker geselecteerde model.';
  } else if (data.probableModelSeries) {
    identityTitle = 'Waarschijnlijke modelreeks';
    identityLabel = data.confidenceLabel || 'Breakpoint-gebaseerde indicatie';
    identityExplanation = 'Technische specificaties zijn niet aan dit serienummer gekoppeld zolang het exacte model niet voldoende is bevestigd.';
  } else {
    identityTitle = 'Serienummer validatie';
    identityLabel = data.confidenceLabel || 'Breakpoint-gebaseerde indicatie';
    identityExplanation = 'Technische specificaties zijn niet aan dit serienummer gekoppeld zolang het exacte model niet voldoende is bevestigd.';
  }

  const technicalSpecRows = buildSafePassportSpecRows(data);
  const hasTechnicalSpecs = technicalSpecRows.length > 0;
  const driveClassification = data.driveClassification || null;
  const driveContextLabel = getClassificationContextLabel(driveClassification);

  let theftCheck = null;
  if (hasSerial) {
    theftCheck = data.theftCheck || {
      available: true,
      userSelfReported: false,
      checkedAt: new Date().toLocaleDateString('nl-NL'),
      statusLabel: 'Niet gecontroleerd via StopHeling'
    };
  } else {
    theftCheck = {
      available: false,
      status: 'INACTIVE',
      userSelfReported: false,
      checkedAt: null,
      statusLabel: 'Niet gecontroleerd (geen serienummer)'
    };
  }

  // Canonical Model QR URL: Always points to the public canonical model page.
  // CRITICAL PRIVACY GATE: NEVER include serial numbers or query params in external QR requests!
  const safeCatSlug = catSlug || 'kettingzagen';
  const safeModelSlug = modelSlug || '';
  const publicUrl = (safeCatSlug && safeModelSlug)
    ? `https://www.stihldecoder.nl/${safeCatSlug}/${safeModelSlug}/`
    : 'https://www.stihldecoder.nl/';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(publicUrl)}`;

  // Safe recommendations
  const recommendations = data.recommendations || buildModelRecommendations(
    { model_slug: modelSlug, model_name: model, category: categoryStr, series_code: seriesCode },
    data.technicalSpecs || {},
    { compatibilityEvidence: data.publicEvidenceFacts || data.compatibilityEvidence }
  );

  return {
    serial: hasSerial ? serial : null,
    hasSerial,
    formattedSerial: hasSerial ? formattedSerial : 'Nog niet toegevoegd',
    passportMode,
    model,
    modelSlug,
    seriesCode,
    canonicalModelName,
    officialProductName,
    exactModel: exactModel || (isOfficialAnchor ? officialProductName : null),
    probableModelSeries: probableModelSeries || null,
    identityStatus,
    identityTitle,
    identityLabel,
    identityExplanation,
    category: categoryStr,
    categorySlug: catSlug,
    isChainsaw: catSlug === CATEGORY_TYPES.CHAINSAW || catSlug === CATEGORY_TYPES.ACCU_CHAINSAW,
    country,
    years,
    driveClassification,
    driveContextLabel,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck,
    publicUrl,
    qrUrl,
    recommendations
  };
}

export function renderStihlPassportHtml(data, databaseOrResult = null) {
  const passport = buildPassportViewModel(data, databaseOrResult);
  const {
    serial,
    hasSerial,
    formattedSerial,
    passportMode,
    model,
    canonicalModelName,
    seriesCode,
    identityTitle,
    identityLabel,
    identityExplanation,
    country,
    years,
    driveClassification,
    driveContextLabel,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck,
    publicUrl,
    qrUrl,
    recommendations
  } = passport;

  const isSelfReported = theftCheck.userSelfReported || theftCheck.status === 'USER_REPORTED_CLEAN';
  const statusTone = isSelfReported
    ? 'bg-neutral-900 border-neutral-700 text-neutral-300'
    : 'bg-neutral-900 border-neutral-800 text-neutral-400';

  let badgeText = 'Indicatief overzicht';
  if (passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    badgeText = '✓ Officieel STIHL';
  } else if (passportMode === 'MODEL_ONLY') {
    badgeText = 'STIHL Machinepaspoort';
  } else if (isSelfReported) {
    badgeText = 'Zelf gerapporteerd';
  }

  const recommendationsHtml = renderPassportRecommendationSlotsHtml(recommendations);

  return `
    <div id="stihl-passport-card" class="bg-neutral-950 border border-neutral-800 rounded-2xl p-7 text-white font-sans max-w-xl mx-auto my-6 shadow-2xl relative overflow-hidden space-y-4">
      <div class="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-neutral-800/80 pb-4">
        <div>
          <span class="text-2xs font-mono uppercase tracking-widest text-orange-500 font-bold block">STIHL Machinepaspoort</span>
          <h2 class="text-2xl font-black tracking-tight text-white mt-0.5">${model}</h2>
          ${canonicalModelName && canonicalModelName !== model.toUpperCase() ? `
            <span class="text-2xs text-orange-400 font-mono block">Canonieke basis: STIHL ${canonicalModelName}</span>
          ` : ''}
          <p class="text-2xs text-neutral-400 mt-1">${identityTitle}: ${identityLabel}</p>
        </div>
        <span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-2xs font-black tracking-wider">
          ${badgeText}
        </span>
      </div>

      <!-- Stop Heling Banner (only when serial is present) -->
      ${hasSerial ? `
        <div class="p-3 rounded-xl border flex items-center justify-between ${statusTone}">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">${isSelfReported ? '📋' : 'ℹ️'}</span>
            <div>
              <span class="text-2xs font-bold uppercase tracking-wider block">Stop Heling Status</span>
              <span class="text-xs font-semibold text-neutral-200">${theftCheck.statusLabel}</span>
            </div>
          </div>
          <div class="text-right text-3xs text-neutral-400">
            <span>Datum:</span>
            <span class="font-mono text-white font-bold block">${theftCheck.checkedAt || '—'}</span>
          </div>
        </div>
      ` : ''}

      <!-- Grid with Category Specifications -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800" data-serial="${serial || ''}">
          <span class="text-2xs text-neutral-400 block font-medium">Serienummer</span>
          <span class="font-mono text-base font-bold text-white tracking-wider">${formattedSerial}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Herkomst / Fabriek</span>
          <span class="text-sm font-bold text-white">${country}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Bouwjaar</span>
          <span class="text-sm font-bold text-orange-400">${years}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">${identityTitle}</span>
          <span class="text-sm font-bold text-white">${identityLabel}</span>
        </div>
        ${seriesCode ? `
          <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span class="text-2xs text-neutral-400 block font-medium">Modelreeks (Seriecode)</span>
            <span class="font-mono text-sm font-bold text-white">Serie ${seriesCode}</span>
          </div>
        ` : ''}
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 ${seriesCode ? '' : 'col-span-2'}">
          <span class="text-2xs text-neutral-400 block font-medium">Aandrijvingstype</span>
          <span class="text-sm font-bold text-white">${driveClassification?.display_label || 'Niet vastgesteld'}</span>
          ${driveContextLabel ? `<span class="text-2xs text-neutral-400 block mt-1">${driveContextLabel}</span>` : ''}
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2">
          <div>
            <span class="text-2xs text-neutral-400 block font-medium">${hasTechnicalSpecs ? 'Technische specificaties' : 'Technische specificatiesstatus'}</span>
            ${hasTechnicalSpecs
              ? `<div class="space-y-1 mt-1">${technicalSpecRows.map((row) => `<span class="text-sm font-bold text-orange-300 font-mono block">${row}</span>`).join('')}</div>`
              : `<span class="text-sm font-semibold text-neutral-300">${identityExplanation}</span>`}
          </div>
        </div>
      </div>

      <!-- Recommendation Slots Foundation (Phase 47) -->
      ${recommendationsHtml}

      <!-- Footer with Unobscured Domain and QR Code -->
      <div class="flex justify-between items-center border-t border-neutral-800/80 pt-3 text-3xs text-neutral-400 gap-4">
        <div class="space-y-0.5">
          <p class="font-semibold text-neutral-300">Onafhankelijk STIHL machinepaspoort op basis van geverifieerde gegevens</p>
          <span class="font-mono font-black text-orange-500 text-sm block">www.stihldecoder.nl</span>
          <p class="text-neutral-500 text-3xs">Scan QR-code voor de modelpagina of het live controlerapport</p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <img src="${qrUrl}" alt="Scan QR Code" class="w-12 h-12 rounded-lg border border-neutral-700 bg-white p-0.5 shadow-md" />
        </div>
      </div>
    </div>
  `;
}

export function downloadStihlPassportImage(data) {
  const passport = buildPassportViewModel(data);
  const {
    serial,
    hasSerial,
    formattedSerial,
    passportMode,
    model,
    identityTitle,
    identityLabel,
    identityExplanation,
    country,
    years,
    technicalSpecRows,
    hasTechnicalSpecs,
    publicUrl
  } = passport;

  const theftCheck = passport.theftCheck || {
    userSelfReported: false,
    checkedAt: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    statusLabel: hasSerial ? 'Niet gecontroleerd via StopHeling' : 'Niet gecontroleerd (geen serienummer)'
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  function renderCanvasAndDownload(qrImageElement) {
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 1200, 900);

    // Top Accent Bar
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 0, 1200, 12);

    // Header Text
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('STIHL MACHINEPASPOORT', 60, 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px sans-serif';
    ctx.fillText(model, 60, 130);

    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${identityTitle}: ${identityLabel}`, 60, 155);

    // Source-status badge
    ctx.fillStyle = '#ea580c20';
    ctx.fillRect(900, 50, 240, 42);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(passportMode === 'OFFICIAL_SERIAL_VERIFIED' ? 'OFFICIEEL STIHL' : (passportMode === 'MODEL_ONLY' ? 'MODELPASPOORT' : 'INDICATIEF OVERZICHT'), 925, 76);

    // Stop Heling Banner Box
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 160, 1080, 80);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('STOP HELING DIEFSTALCONTROLE STATUS', 90, 195);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 20px sans-serif';
    ctx.fillText(hasSerial ? theftCheck.statusLabel : 'Niet van toepassing (geen serienummer geregistreerd)', 90, 225);

    ctx.fillStyle = '#737373';
    ctx.font = '16px monospace';
    ctx.fillText(hasSerial ? `Datum: ${theftCheck.checkedAt || '—'}` : 'Status: Geen serienummer', 840, 210);

    // Grid Cards
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 260, 525, 140);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Serienummer', 90, 295);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(formattedSerial, 90, 350);

    ctx.fillStyle = '#171717';
    ctx.fillRect(615, 260, 525, 140);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Herkomst / Fabriek', 645, 295);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(country, 645, 350);

    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 420, 525, 140);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Bouwjaar', 90, 455);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(years, 90, 510);

    ctx.fillStyle = '#171717';
    ctx.fillRect(615, 420, 525, 140);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(identityTitle, 645, 455);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(identityLabel, 645, 505);

    // Category Specific Full Row Card
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 580, 1080, 120);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(hasTechnicalSpecs ? 'Technische specificaties' : 'Technische specificatiesstatus', 90, 615);
    ctx.fillStyle = '#fb923c';
    if (hasTechnicalSpecs) {
      ctx.font = 'bold 22px monospace';
      technicalSpecRows.slice(0, 3).forEach((row, index) => {
        ctx.fillText(row, 90, 655 + (index * 28));
      });
    } else {
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(identityExplanation, 90, 665, 980);
    }

    // Footer Divider
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 730);
    ctx.lineTo(1140, 730);
    ctx.stroke();

    // Footer Text & Domain
    ctx.fillStyle = '#737373';
    ctx.font = '16px sans-serif';
    ctx.fillText('Onafhankelijk STIHL machinepaspoort op basis van geverifieerde gegevens', 60, 770);
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('www.stihldecoder.nl', 60, 810);
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText('Scan QR-code voor de modelpagina of het live controlerapport', 60, 840);

    // Draw QR Code
    if (qrImageElement) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(1000, 745, 140, 140);
      ctx.drawImage(qrImageElement, 1010, 755, 120, 120);
    }

    const fileSerial = serial || 'model';
    const link = document.createElement('a');
    link.download = `STIHL_Machinepaspoort_${fileSerial}_${model.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(publicUrl)}`;
  qrImg.onload = () => renderCanvasAndDownload(qrImg);
  qrImg.onerror = () => renderCanvasAndDownload(null);
  qrImg.src = qrUrl;
}
