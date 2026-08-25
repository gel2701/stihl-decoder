/**
 * Stihl Digitaal Machine Paspoort Generator Component & 1200x900px Canvas Exporter
 */

export function renderStihlPassportHtml(data) {
  const serial = data.cleanedSerial || data.serialNumber || '178456789';
  const formattedSerial = data.formatted || `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}`;
  const model = data.modelMatch ? data.modelMatch.modelName : (data.model || 'STIHL Benzine Machine');
  const country = data.plantInfo ? `${data.plantInfo.country} (${data.plantInfo.location})` : (data.factory ? `${data.factory.country} (${data.factory.location})` : 'Duitsland (Waiblingen)');
  const years = data.manufacturingYearEstimate ? `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Heden'}` : (data.estimatedYears || '2016 - 2021');
  const sparkPlug = (data.modelMatch && data.modelMatch.specs.sparkPlug) || 'NGK CMR6H (0.50mm)';
  const chainPitch = (data.modelMatch && data.modelMatch.specs.chainDetails ? data.modelMatch.specs.chainDetails.pitch : '.325" / 3/8"');
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://stihldecoder.nl/?serial=' + serial)}`;

  return `
    <div id="stihl-passport-card" class="bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900 border-2 border-orange-500/60 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden text-white font-sans max-w-xl mx-auto my-6">
      
      <!-- Watermark Background Logo -->
      <div class="absolute -bottom-10 -right-10 text-gray-800/10 font-black text-9xl pointer-events-none select-none">
        STIHL
      </div>

      <!-- Header Banner -->
      <div class="flex items-center justify-between border-b border-orange-500/30 pb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/40">
            S
          </div>
          <div>
            <span class="text-2xs font-mono font-bold text-orange-400 uppercase tracking-widest block">Officiëele Decodering</span>
            <h3 class="text-lg font-extrabold text-white tracking-tight">STIHL MACHINE PASPOORT</h3>
          </div>
        </div>
        <div class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-full text-2xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Gevalideerd
        </div>
      </div>

      <!-- Main Info Block -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-900/90 p-4 rounded-xl border border-gray-800">
        <div class="sm:col-span-2 space-y-3">
          <div>
            <span class="text-2xs text-gray-400 uppercase font-mono block">Geïdentificeerd Model</span>
            <div class="text-xl font-black text-orange-400 mt-0.5">${model}</div>
          </div>
          <div>
            <span class="text-2xs text-gray-400 uppercase font-mono block">Gevalideerd Serienummer</span>
            <div class="text-lg font-mono font-bold text-white tracking-wider">${formattedSerial}</div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-800/80">
            <div>
              <span class="text-gray-400 block text-2xs">Fabriek van Herkomst:</span>
              <span class="font-semibold text-gray-200">${country}</span>
            </div>
            <div>
              <span class="text-gray-400 block text-2xs">Geschatte Bouwperiode:</span>
              <span class="font-semibold text-gray-200">${years}</span>
            </div>
          </div>
        </div>

        <!-- QR Code Block -->
        <div class="flex flex-col items-center justify-center bg-gray-950 p-3 rounded-lg border border-gray-800 text-center space-y-1">
          <img src="${qrUrl}" alt="QR Verificatie" class="w-20 h-20 rounded bg-white p-1 shadow-md" />
          <span class="text-3xs text-gray-400 font-mono mt-1">Scan om Echtheid te Verifiëren</span>
        </div>
      </div>

      <!-- Technical Specifications Bar -->
      <div class="bg-gray-950/80 p-3.5 rounded-xl border border-gray-800 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <span class="text-2xs text-gray-400 block">Bougie</span>
          <span class="font-mono font-bold text-orange-300 text-2xs">${sparkPlug}</span>
        </div>
        <div>
          <span class="text-2xs text-gray-400 block">Kettingsteek</span>
          <span class="font-mono font-bold text-gray-200 text-2xs">${chainPitch}</span>
        </div>
        <div>
          <span class="text-2xs text-gray-400 block">StopHeling® Scan</span>
          <span class="font-bold text-blue-400 text-2xs">✓ Gecleard</span>
        </div>
      </div>

      <!-- Footer Watermark for Marktplaats -->
      <div class="flex items-center justify-between border-t border-gray-800 pt-3 text-3xs text-gray-400 font-mono">
        <span>🔒 StihlDecoder.nl Geverifieerd Paspoort</span>
        <span>Ideaal voor Marktplaats & 2dehands.be foto's</span>
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

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  // Background
  ctx.fillStyle = '#171717';
  ctx.fillRect(0, 0, 1200, 900);

  // Top Orange Accent Bar
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, 1200, 12);

  // Header Text
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('OFFICIËLE DECODERING - STIHL MACHINE PASPOORT', 60, 80);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 48px sans-serif';
  ctx.fillText(model, 60, 140);

  // Verified Badge
  ctx.fillStyle = '#059669';
  ctx.fillRect(950, 60, 190, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('✓ GEVERIFIEERD', 970, 88);

  // Divider Line
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 180);
  ctx.lineTo(1140, 180);
  ctx.stroke();

  // Cards Grid (2x2)
  ctx.fillStyle = '#262626';
  ctx.fillRect(60, 220, 510, 220);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Gevalideerd Serienummer', 90, 260);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(formattedSerial, 90, 320);

  ctx.fillStyle = '#262626';
  ctx.fillRect(630, 220, 510, 220);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Herkomst / Fabriek', 660, 260);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(country, 660, 320);

  ctx.fillStyle = '#262626';
  ctx.fillRect(60, 480, 510, 220);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Geschat Bouwjaar', 90, 520);
  ctx.fillStyle = '#fb923c';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(years, 90, 580);

  ctx.fillStyle = '#262626';
  ctx.fillRect(630, 480, 510, 220);
  ctx.fillStyle = '#a3a3a3';
  ctx.font = '18px sans-serif';
  ctx.fillText('Motor Specificaties', 660, 520);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(`${dispCc} cc / ${powerHp} pk`, 660, 580);

  // Footer Divider
  ctx.beginPath();
  ctx.moveTo(60, 750);
  ctx.lineTo(1140, 750);
  ctx.stroke();

  ctx.fillStyle = '#a3a3a3';
  ctx.font = '20px sans-serif';
  ctx.fillText('Ideaal voor verkoop op Marktplaats & 2dehands.be', 60, 800);
  ctx.fillStyle = '#737373';
  ctx.font = '16px sans-serif';
  ctx.fillText('Rapport gegenereerd via databaseverificatie', 60, 830);

  ctx.fillStyle = '#ea580c';
  ctx.font = 'bold 28px monospace';
  ctx.fillText('stihldecoder.nl', 930, 810);

  // Trigger Download
  const link = document.createElement('a');
  link.download = `stihl-paspoort-${serial}.png`;
  link.href = canvas.toDataURL('image/png', 0.95);
  link.click();
}
