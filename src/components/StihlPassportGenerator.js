/**
 * Stihl Digitaal Machine Paspoort Generator Component & 1200x900px Canvas Exporter with Stop Heling Banner
 */

export function renderStihlPassportHtml(data) {
  const serial = data.cleanedSerial || data.serialNumber || '178456789';
  const formattedSerial = data.formatted || `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}`;
  const model = data.modelMatch ? data.modelMatch.modelName : (data.model || 'STIHL Benzine Machine');
  const country = data.plantInfo ? `${data.plantInfo.country} (${data.plantInfo.location})` : (data.factory ? `${data.factory.country} (${data.factory.location})` : 'Duitsland (Waiblingen)');
  const years = data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Heden'}` : (data.estimatedYears || '2016 - 2021');
  const dispCc = (data.modelMatch && data.modelMatch.specs.displacementCc) || 50.2;
  const powerHp = (data.modelMatch && data.modelMatch.specs.powerHp) || 4.1;

  const theftCheck = data.theftCheck || {
    isStolen: false,
    checkedAt: new Date().toLocaleDateString('nl-NL'),
    statusLabel: '✓ NIET ALS GESTOLEN GEREGISTREERD'
  };

  const isStolen = theftCheck.isStolen;

  return `
    <div id="stihl-passport-card" class="bg-neutral-950 border border-neutral-800 rounded-2xl p-7 text-white font-sans max-w-xl mx-auto my-6 shadow-2xl relative overflow-hidden space-y-4">
      <div class="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-neutral-800/80 pb-4">
        <div>
          <span class="text-2xs font-mono uppercase tracking-widest text-orange-500 font-bold block">Officieel Machine Paspoort</span>
          <h2 class="text-2xl font-black tracking-tight text-white mt-0.5">${model}</h2>
        </div>
        <span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-2xs font-black tracking-wider">
          STIHL VERIFIED
        </span>
      </div>

      <!-- Stop Heling Banner -->
      <div class="p-3 rounded-xl border flex items-center justify-between ${isStolen ? 'bg-rose-950/40 border-rose-500/50 text-rose-300' : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'}">
        <div class="flex items-center gap-2.5">
          <span class="text-lg">${isStolen ? '🚨' : '🛡️'}</span>
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

      <!-- Grid -->
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
          <span class="text-sm font-bold text-white">${dispCc} cc / ${powerHp} pk</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-between items-end border-t border-neutral-800/80 pt-3 text-3xs text-neutral-400">
        <div>
          <p class="font-semibold text-neutral-300">Geverifieerd document voor verkoop & taxatie</p>
          <p class="text-neutral-500">Politiedatabase check • Geen gestolen registratie bekend</p>
        </div>
        <span class="font-mono font-black text-orange-500 text-sm">stihldecoder.nl</span>
      </div>
    </div>
  `;
}

export function downloadStihlPassportImage(data) {
  const serial = data.cleanedSerial || data.serialNumber || '178456789';
  const formattedSerial = data.formatted || `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}`;
  const model = data.modelMatch ? data.modelMatch.modelName : (data.model || 'STIHL Benzine Machine');
  const country = data.plantInfo ? `${data.plantInfo.country} (${data.plantInfo.location})` : (data.factory ? `${data.factory.country} (${data.factory.location})` : 'Duitsland (Waiblingen)');
  const years = data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Heden'}` : (data.estimatedYears || '2016 - 2021');
  const dispCc = (data.modelMatch && data.modelMatch.specs.displacementCc) || 50.2;
  const powerHp = (data.modelMatch && data.modelMatch.specs.powerHp) || 4.1;

  const theftCheck = data.theftCheck || {
    isStolen: false,
    checkedAt: new Date().toLocaleDateString('nl-NL'),
    statusLabel: '✓ NIET ALS GESTOLEN GEREGISTREERD'
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 1200, 900);

  // Top Accent Bar
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, 1200, 12);

  // Header Text
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('OFFICIEEL MACHINE PASPOORT', 60, 75);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px sans-serif';
  ctx.fillText(model, 60, 130);

  // STIHL VERIFIED Badge
  ctx.fillStyle = '#ea580c20';
  ctx.fillRect(940, 50, 200, 42);
  ctx.fillStyle = '#fb923c';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('STIHL VERIFIED', 975, 76);

  // Stop Heling Banner Box
  if (theftCheck.isStolen) {
    ctx.fillStyle = '#4c0519';
    ctx.fillRect(60, 160, 1080, 80);
    ctx.fillStyle = '#fda4af';
  } else {
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(60, 160, 1080, 80);
    ctx.fillStyle = '#6ee7b7';
  }
  
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
  ctx.fillRect(60, 270, 525, 200);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Serienummer', 90, 310);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(formattedSerial, 90, 370);

  ctx.fillStyle = '#171717';
  ctx.fillRect(615, 270, 525, 200);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Herkomst / Fabriek', 645, 310);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(country, 645, 370);

  ctx.fillStyle = '#171717';
  ctx.fillRect(60, 500, 525, 200);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Geschat Bouwjaar', 90, 540);
  ctx.fillStyle = '#fb923c';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(years, 90, 600);

  ctx.fillStyle = '#171717';
  ctx.fillRect(615, 500, 525, 200);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Motor Specificaties', 645, 540);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(`${dispCc} cc / ${powerHp} pk`, 645, 600);

  // Footer Divider
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 740);
  ctx.lineTo(1140, 740);
  ctx.stroke();

  ctx.fillStyle = '#d4d4d4';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Geverifieerd document voor verkoop & taxatie op Marktplaats & 2dehands.be', 60, 790);
  ctx.fillStyle = '#737373';
  ctx.font = '16px sans-serif';
  ctx.fillText('Politiedatabase StopHeling check • Geen gestolen registratie bekend op datum van controle', 60, 825);

  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('stihldecoder.nl', 910, 805);

  // Export PNG
  const link = document.createElement('a');
  link.download = `stihl-paspoort-${serial}.png`;
  link.href = canvas.toDataURL('image/png', 0.95);
  link.click();
}
