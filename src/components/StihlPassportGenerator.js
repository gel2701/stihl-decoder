/**
 * Stihl Serienummer Rapport Component & 1200x900px Canvas Exporter
 * Phase 33 Category Specification Whitelist & Honest Verification Reporting
 */

import { normalizeCategorySlug, CATEGORY_TYPES } from '../categoryWhitelist.js';

function compactText(value, fallback = 'Niet vastgesteld') {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildSafePassportSpecRows(data) {
  const specs = data.technicalSpecs && typeof data.technicalSpecs === 'object' ? data.technicalSpecs : {};
  const rows = [];

  if (specs.displacement_cc) rows.push(`Motorinhoud: ${specs.displacement_cc} cc`);
  if (specs.power_kw) rows.push(`Vermogen: ${specs.power_kw} kW`);
  if (specs.spark_plug) rows.push(`Bougie: ${specs.spark_plug}`);
  if (specs.electrode_gap_mm) rows.push(`Elektrodenafstand: ${specs.electrode_gap_mm} mm`);
  if (specs.chain_pitch && specs.chain_gauge_mm) rows.push(`Kettingsteek: ${specs.chain_pitch} @ ${specs.chain_gauge_mm} mm`);

  return rows;
}

export function buildPassportViewModel(data = {}) {
  const serial = data.cleanedSerial || data.serialNumber || '';
  const formattedSerial = data.formatted || (serial ? `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}` : 'Niet vastgesteld');
  const identityStatus = data.modelIdentityStatus || (data.exactModel ? 'EXACT_MODEL_IDENTIFIED' : (data.probableModelSeries ? 'PROBABLE_MODEL_SERIES' : 'MODEL_NOT_IDENTIFIED'));
  const exactModel = compactText(data.exactModel, '');
  const probableModelSeries = compactText(data.probableModelSeries, '');
  const model = exactModel || probableModelSeries || compactText(data.model, 'STIHL Machine');
  const categoryStr = compactText(data.category, '');
  const catSlug = normalizeCategorySlug(categoryStr, model);
  const plantCountry = compactText(data.plantInfo?.country || data.factory?.country, 'Niet vastgesteld');
  const plantLocation = compactText(data.plantInfo?.location || data.factory?.location || data.factory?.facility, '');
  const country = plantLocation && plantLocation !== 'Niet vastgesteld' ? `${plantCountry} (${plantLocation})` : plantCountry;
  const years = compactText(data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Onbekend'}` : data.estimatedYears, 'Niet vastgesteld');
  const technicalSpecRows = buildSafePassportSpecRows(data);
  const hasTechnicalSpecs = technicalSpecRows.length > 0;
  const identityTitle = identityStatus === 'EXACT_MODEL_IDENTIFIED' ? 'Exact model geïdentificeerd' : 'Waarschijnlijke modelreeks';
  const identityExplanation = identityStatus === 'EXACT_MODEL_IDENTIFIED'
    ? 'Technische specificaties zijn alleen opgenomen wanneer ze veilig aan dit model zijn gekoppeld.'
    : 'Technische specificaties zijn niet aan dit serienummer gekoppeld zolang het exacte model niet voldoende is bevestigd.';

  const theftCheck = data.theftCheck || {
    userSelfReported: false,
    checkedAt: new Date().toLocaleDateString('nl-NL'),
    statusLabel: 'Niet gecontroleerd via StopHeling'
  };

  return {
    serial,
    formattedSerial,
    model,
    exactModel: exactModel || null,
    probableModelSeries: probableModelSeries || null,
    identityStatus,
    identityTitle,
    identityLabel: data.confidenceLabel || (identityStatus === 'EXACT_MODEL_IDENTIFIED' ? 'Exact model geïdentificeerd' : 'Breakpoint-gebaseerde indicatie'),
    identityExplanation,
    category: categoryStr || null,
    categorySlug: catSlug,
    isChainsaw: catSlug === CATEGORY_TYPES.CHAINSAW || catSlug === CATEGORY_TYPES.ACCU_CHAINSAW,
    country,
    years,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck
  };
}

export function renderStihlPassportHtml(data) {
  const passport = buildPassportViewModel(data);
  const {
    serial,
    formattedSerial,
    model,
    identityTitle,
    identityLabel,
    identityExplanation,
    country,
    years,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck
  } = passport;

  const isSelfReported = theftCheck.userSelfReported || theftCheck.status === 'USER_REPORTED_CLEAN';
  const statusTone = isSelfReported
    ? 'bg-neutral-900 border-neutral-700 text-neutral-300'
    : 'bg-neutral-900 border-neutral-800 text-neutral-400';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://www.stihldecoder.nl/?s=' + serial)}`;

  return `
    <div id="stihl-passport-card" class="bg-neutral-950 border border-neutral-800 rounded-2xl p-7 text-white font-sans max-w-xl mx-auto my-6 shadow-2xl relative overflow-hidden space-y-4">
      <div class="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-neutral-800/80 pb-4">
        <div>
          <span class="text-2xs font-mono uppercase tracking-widest text-orange-500 font-bold block">Serienummer Rapport (indicatief)</span>
          <h2 class="text-2xl font-black tracking-tight text-white mt-0.5">${model}</h2>
          <p class="text-2xs text-neutral-400 mt-1">${identityTitle}: ${identityLabel}</p>
        </div>
        <span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-2xs font-black tracking-wider">
          ${isSelfReported ? 'Zelf gerapporteerd' : 'Indicatief overzicht'}
        </span>
      </div>

      <!-- Stop Heling Banner -->
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
          <span class="font-mono text-white font-bold block">${theftCheck.checkedAt}</span>
        </div>
      </div>

      <!-- Grid with Category Specifications -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Serienummer</span>
          <span class="font-mono text-base font-bold text-white tracking-wider">${formattedSerial}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Herkomst / Fabriek</span>
          <span class="text-sm font-bold text-white">${country}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Geschat Bouwjaar</span>
          <span class="text-sm font-bold text-orange-400">${years}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">${identityTitle}</span>
          <span class="text-sm font-bold text-white">${identityLabel}</span>
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

      <!-- Footer with Unobscured Domain and QR Code -->
      <div class="flex justify-between items-center border-t border-neutral-800/80 pt-3 text-3xs text-neutral-400 gap-4">
        <div class="space-y-0.5">
          <p class="font-semibold text-neutral-300">Onafhankelijk rapport op basis van bekende serienummer- en herkomstdata</p>
          <span class="font-mono font-black text-orange-500 text-sm block">www.stihldecoder.nl</span>
          <p class="text-neutral-500 text-3xs">Scan QR-code voor het live rapport en voer handmatige controle uit waar nodig</p>
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
    formattedSerial,
    model,
    identityTitle,
    identityLabel,
    identityExplanation,
    country,
    years,
    technicalSpecRows,
    hasTechnicalSpecs
  } = passport;

  const theftCheck = passport.theftCheck || {
    userSelfReported: false,
    checkedAt: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    statusLabel: 'Niet gecontroleerd via StopHeling'
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
    ctx.fillText('ONAFHANKELIJK SERIENUMMER RAPPORT (INDICATIEF)', 60, 75);

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
    ctx.fillText('INDICATIEF OVERZICHT', 925, 76);

    // Stop Heling Banner Box
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 160, 1080, 80);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('STOP HELING DIEFSTALCONTROLE STATUS', 90, 195);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 20px sans-serif';
    ctx.fillText(theftCheck.statusLabel, 90, 225);

    ctx.fillStyle = '#737373';
    ctx.font = '16px monospace';
    ctx.fillText(`Datum: ${theftCheck.checkedAt}`, 880, 210);

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
    ctx.fillText('Geschat Bouwjaar', 90, 455);
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
    ctx.fillText('Onafhankelijk rapport op basis van bekende serienummer- en herkomstdata', 60, 770);
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('www.stihldecoder.nl', 60, 810);
    ctx.fillStyle = '#525252';
    ctx.font = '14px sans-serif';
    ctx.fillText('Scan QR-code met uw mobiel voor het live rapport en aanvullende handmatige controle', 60, 840);

    // Draw QR Code
    if (qrImageElement) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(1000, 745, 140, 140);
      ctx.drawImage(qrImageElement, 1010, 755, 120, 120);
    }

    const link = document.createElement('a');
    link.download = `STIHL_Serienummer_Rapport_${serial}_${model.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('https://www.stihldecoder.nl/?s=' + serial)}`;
  qrImg.onload = () => renderCanvasAndDownload(qrImg);
  qrImg.onerror = () => renderCanvasAndDownload(null);
  qrImg.src = qrUrl;
}
