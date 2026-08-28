/**
 * Stihl Digitaal Machine Paspoort Generator Component & 1200x900px Canvas Exporter with Stop Heling Verification, Category Whitelisting & Unobscured QR Code
 * Phase 33 Category Specification Whitelist & Leak Prevention
 */

import { normalizeCategorySlug, CATEGORY_TYPES } from '../categoryWhitelist.js';

export function renderStihlPassportHtml(data) {
  const serial = data.cleanedSerial || data.serialNumber || '184592301';
  const formattedSerial = data.formatted || `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}`;
  const model = data.modelMatch ? data.modelMatch.modelName : (data.model || 'STIHL Machine');
  const categoryStr = data.category || (data.modelMatch && data.modelMatch.category) || model;
  const catSlug = normalizeCategorySlug(categoryStr, model);
  const isChainsaw = (catSlug === CATEGORY_TYPES.CHAINSAW || catSlug === CATEGORY_TYPES.ACCU_CHAINSAW);

  const plantCountry = data.plantInfo?.country || data.factory?.country || 'Onbekend';
  const plantLocation = data.plantInfo?.location || data.factory?.location || data.factory?.facility;
  const country = plantLocation ? `${plantCountry} (${plantLocation})` : plantCountry;
  const years = data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Heden'}` : (data.estimatedYears || 'Niet vastgesteld');
  const dispCc = (data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.displacementCc) || (data.technicalSpecs && data.technicalSpecs.displacement_cc);
  const powerHp = (data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.powerHp) || (data.technicalSpecs && data.technicalSpecs.power_hp);

  let categorySpecLabel = 'Machine Categorie & Uitvoering';
  let categorySpecValue = 'Standaard STIHL Fabrieksuitvoering';

  if (isChainsaw) {
    categorySpecLabel = 'Snijgarnituur / Kettingmaat (Standaard)';
    const chainDetails = data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.chainDetails;
    categorySpecValue = chainDetails ? 
      (typeof chainDetails === 'string' ? chainDetails : `${chainDetails.pitch} @ ${chainDetails.gauge || 1.3} mm`) : 
      (data.technicalSpecs && data.technicalSpecs.chain_pitch ? `${data.technicalSpecs.chain_pitch} @ ${data.technicalSpecs.chain_gauge_mm || 'Niet vastgesteld'} mm` : 'Niet vastgesteld');
  } else if (catSlug === CATEGORY_TYPES.BLOWER) {
    categorySpecLabel = 'Aandrijving & Bladblazer Systeem';
    categorySpecValue = 'STIHL 4-MIX® / 2-MIX® Ruggedragen Blazer';
  } else if (catSlug === CATEGORY_TYPES.BRUSHCUTTER) {
    categorySpecLabel = 'Aandrijving & Bosmaaier Systeem';
    categorySpecValue = 'STIHL Profi Bosmaaier / Trimmer Systeem';
  } else if (catSlug === CATEGORY_TYPES.CUTOFF_SAW) {
    categorySpecLabel = 'Aandrijving & Doorslijper Systeem';
    categorySpecValue = 'STIHL Cycloon Luchtfiltersysteem Doorslijper';
  }

  const theftCheck = data.theftCheck || {
    status: 'UNVERIFIED',
    isStolen: null,
    checkedAt: new Date().toLocaleDateString('nl-NL'),
    statusLabel: 'Niet gecontroleerd via StopHeling'
  };

  const isStolen = theftCheck.status === 'STOLEN';
  const isVerified = theftCheck.status === 'CLEAR';
  const statusTone = isStolen
    ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
    : isVerified
      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
      : 'bg-amber-950/30 border-amber-500/40 text-amber-200';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://www.stihldecoder.nl/?s=' + serial)}`;

  return `
    <div id="stihl-passport-card" class="bg-neutral-950 border border-neutral-800 rounded-2xl p-7 text-white font-sans max-w-xl mx-auto my-6 shadow-2xl relative overflow-hidden space-y-4">
      <div class="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-neutral-800/80 pb-4">
        <div>
          <span class="text-2xs font-mono uppercase tracking-widest text-orange-500 font-bold block">Machinepaspoort</span>
          <h2 class="text-2xl font-black tracking-tight text-white mt-0.5">${model}</h2>
        </div>
        <span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-2xs font-black tracking-wider">
          ${isVerified ? 'Controle afgerond' : 'Controle vereist'}
        </span>
      </div>

      <!-- Stop Heling Banner -->
      <div class="p-3 rounded-xl border flex items-center justify-between ${statusTone}">
        <div class="flex items-center gap-2.5">
          <span class="text-lg">${isStolen ? '🚨' : (isVerified ? '🛡️' : '⚠️')}</span>
          <div>
            <span class="text-2xs font-bold uppercase tracking-wider block">Stop Heling Diefstalcontrole</span>
            <span class="text-xs font-black text-white">${theftCheck.statusLabel}</span>
          </div>
        </div>
        <div class="text-right text-3xs text-neutral-400">
          <span>Checkdatum:</span>
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
          <span class="text-2xs text-neutral-400 block font-medium">Motor Specificaties</span>
          <span class="text-sm font-bold text-white">${dispCc ? dispCc + ' cc / ' : ''}${powerHp ? powerHp + ' pk' : 'Niet vastgesteld'}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2 flex justify-between items-center">
          <div>
            <span class="text-2xs text-neutral-400 block font-medium">${categorySpecLabel}</span>
            <span class="text-sm font-bold text-orange-300 font-mono">${categorySpecValue}</span>
          </div>
          <span class="text-3xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-mono">${isVerified ? 'Controlebron aanwezig' : 'Extra verificatie nodig'}</span>
        </div>
      </div>

      <!-- Footer with Unobscured Domain and QR Code -->
      <div class="flex justify-between items-center border-t border-neutral-800/80 pt-3 text-3xs text-neutral-400 gap-4">
        <div class="space-y-0.5">
          <p class="font-semibold text-neutral-300">Onafhankelijk controle-overzicht voor serienummer en herkomstsignalen</p>
          <span class="font-mono font-black text-orange-500 text-sm block">www.stihldecoder.nl</span>
          <p class="text-neutral-500 text-3xs">Scan QR-code voor het live rapport en voer handmatige controle uit waar nodig</p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <img src="${qrUrl}" alt="Scan QR Verificatie" class="w-12 h-12 rounded-lg border border-neutral-700 bg-white p-0.5 shadow-md" />
        </div>
      </div>
    </div>
  `;
}

export function downloadStihlPassportImage(data) {
  const serial = data.cleanedSerial || data.serialNumber || '184592301';
  const formattedSerial = data.formatted || `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}`;
  const model = data.modelMatch ? data.modelMatch.modelName : (data.model || 'STIHL Machine');
  const categoryStr = data.category || (data.modelMatch && data.modelMatch.category) || model;
  const catSlug = normalizeCategorySlug(categoryStr, model);
  const isChainsaw = (catSlug === CATEGORY_TYPES.CHAINSAW || catSlug === CATEGORY_TYPES.ACCU_CHAINSAW);

  const plantCountry = data.plantInfo?.country || data.factory?.country || 'Onbekend';
  const plantLocation = data.plantInfo?.location || data.factory?.location || data.factory?.facility;
  const country = plantLocation ? `${plantCountry} (${plantLocation})` : plantCountry;
  const years = data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Heden'}` : (data.estimatedYears || 'Niet vastgesteld');
  const dispCc = (data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.displacementCc) || (data.technicalSpecs && data.technicalSpecs.displacement_cc);
  const powerHp = (data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.powerHp) || (data.technicalSpecs && data.technicalSpecs.power_hp);

  let categorySpecLabel = 'Machine Categorie & Uitvoering';
  let categorySpecValue = 'Standaard STIHL Fabrieksuitvoering';

  if (isChainsaw) {
    categorySpecLabel = 'Snijgarnituur / Kettingmaat (Standaard)';
    const chainDetails = data.modelMatch && data.modelMatch.specs && data.modelMatch.specs.chainDetails;
    categorySpecValue = chainDetails ? 
      (typeof chainDetails === 'string' ? chainDetails : `${chainDetails.pitch} @ ${chainDetails.gauge || 1.3} mm`) : 
      (data.technicalSpecs && data.technicalSpecs.chain_pitch ? `${data.technicalSpecs.chain_pitch} @ ${data.technicalSpecs.chain_gauge_mm || 'Niet vastgesteld'} mm` : 'Niet vastgesteld');
  } else if (catSlug === CATEGORY_TYPES.BLOWER) {
    categorySpecLabel = 'Aandrijving & Bladblazer Systeem';
    categorySpecValue = 'STIHL 4-MIX® / 2-MIX® Ruggedragen Blazer';
  } else if (catSlug === CATEGORY_TYPES.BRUSHCUTTER) {
    categorySpecLabel = 'Aandrijving & Bosmaaier Systeem';
    categorySpecValue = 'STIHL Profi Bosmaaier / Trimmer Systeem';
  } else if (catSlug === CATEGORY_TYPES.CUTOFF_SAW) {
    categorySpecLabel = 'Aandrijving & Doorslijper Systeem';
    categorySpecValue = 'STIHL Cycloon Luchtfiltersysteem Doorslijper';
  }

  const theftCheck = data.theftCheck || {
    status: 'UNVERIFIED',
    isStolen: null,
    checkedAt: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    statusLabel: 'Niet gecontroleerd via StopHeling'
  };

  if (theftCheck.status !== 'CLEAR') {
    alert('Download geblokkeerd: alleen een aantoonbaar geslaagde StopHeling-controle mag als controlelabel worden geëxporteerd.');
    return;
  }

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
    ctx.fillText('ONAFHANKELIJK MACHINE RAPPORT', 60, 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px sans-serif';
    ctx.fillText(model, 60, 130);

    // Source-status badge
    ctx.fillStyle = '#ea580c20';
    ctx.fillRect(940, 50, 200, 42);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('BRONSTATUS ZICHTBAAR', 958, 76);

    // Stop Heling Banner Box
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(60, 160, 1080, 80);
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('STOP HELING DIEFSTALCONTROLE', 90, 195);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px sans-serif';
    ctx.fillText(theftCheck.statusLabel, 90, 225);

    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px monospace';
    ctx.fillText(`Checkdatum: ${theftCheck.checkedAt}`, 880, 210);

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
    ctx.fillText('Motor Specificaties', 645, 455);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${dispCc ? dispCc + ' cc / ' : ''}${powerHp ? powerHp + ' pk' : 'Niet vastgesteld'}`, 645, 510);

    // Category Specific Full Row Card
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 580, 1080, 120);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(categorySpecLabel, 90, 615);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(categorySpecValue, 90, 665);

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
    ctx.fillText('Onafhankelijk rapport voor serienummer-, herkomst- en bronstatuscontrole', 60, 770);
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
    link.download = `STIHL_Paspoort_${serial}_${model.replace(/\s+/g, '_')}.png`;
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
