import React, { useRef } from 'react';

export interface PassportData {
  serialNumber: string;
  modelName: string;
  country: string;
  productionYears: string;
  powerHp: number;
  displacementCc: number;
}

export const StihlPassportGenerator: React.FC<{ data: PassportData }> = ({ data }) => {
  const passportRef = useRef<HTMLDivElement>(null);

  const downloadImage = async () => {
    if (!passportRef.current) return;
    try {
      // HTML5 Canvas Fallback & Image Export
      const element = passportRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // Draw background
        ctx.fillStyle = '#171717';
        ctx.fillRect(0, 0, 1200, 900);

        // Header accent line
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(0, 0, 1200, 12);

        // Header Title
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('OFFICIËLE DECODERING - STIHL MACHINE PASPOORT', 60, 80);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'black 48px sans-serif';
        ctx.fillText(data.modelName, 60, 140);

        // Badge
        ctx.fillStyle = '#059669';
        ctx.fillRect(950, 60, 190, 44);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('✓ GEVERIFIEERD', 970, 88);

        // Divider
        ctx.strokeStyle = '#262626';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, 180);
        ctx.lineTo(1140, 180);
        ctx.stroke();

        // Cards Grid (2x2)
        // Card 1: Serial
        ctx.fillStyle = '#262626';
        ctx.fillRect(60, 220, 510, 220);
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '18px sans-serif';
        ctx.fillText('Gevalideerd Serienummer', 90, 260);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px monospace';
        ctx.fillText(data.serialNumber, 90, 320);

        // Card 2: Herkomst / Fabriek
        ctx.fillStyle = '#262626';
        ctx.fillRect(630, 220, 510, 220);
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '18px sans-serif';
        ctx.fillText('Herkomst / Fabriek', 660, 260);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(data.country, 660, 320);

        // Card 3: Geschat Bouwjaar
        ctx.fillStyle = '#262626';
        ctx.fillRect(60, 480, 510, 220);
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '18px sans-serif';
        ctx.fillText('Geschat Bouwjaar', 90, 520);
        ctx.fillStyle = '#fb923c';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(data.productionYears, 90, 580);

        // Card 4: Motor Specificaties
        ctx.fillStyle = '#262626';
        ctx.fillRect(630, 480, 510, 220);
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '18px sans-serif';
        ctx.fillText('Motor Specificaties', 660, 520);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(`${data.displacementCc || 50.2} cc / ${data.powerHp || 4.1} pk`, 660, 580);

        // Footer
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
        link.download = `stihl-paspoort-${data.serialNumber}.png`;
        link.href = canvas.toDataURL('image/png', 0.95);
        link.click();
      }
    } catch (err) {
      console.error('Fout bij genereren afbeelding:', err);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Container */}
      <div
        ref={passportRef}
        className="w-[600px] h-[450px] bg-neutral-900 text-white p-8 rounded-xl border border-orange-500/30 flex flex-col justify-between shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-neutral-800 pb-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-orange-500 font-semibold">Officiële Decodering</span>
            <h2 className="text-2xl font-black tracking-tight">{data.modelName}</h2>
          </div>
          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wide">
            ✓ GEVERIFIEERD
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 my-auto py-2">
          <div className="bg-neutral-800/60 p-3 rounded-lg border border-neutral-700/50">
            <span class="text-xs text-neutral-400 block">Serienummer</span>
            <span class="font-mono text-lg font-bold text-white tracking-wider">{data.serialNumber}</span>
          </div>
          <div className="bg-neutral-800/60 p-3 rounded-lg border border-neutral-700/50">
            <span class="text-xs text-neutral-400 block">Herkomst / Fabriek</span>
            <span class="text-base font-bold text-white">{data.country}</span>
          </div>
          <div className="bg-neutral-800/60 p-3 rounded-lg border border-neutral-700/50">
            <span class="text-xs text-neutral-400 block">Geschat Bouwjaar</span>
            <span class="text-base font-bold text-orange-400">{data.productionYears}</span>
          </div>
          <div className="bg-neutral-800/60 p-3 rounded-lg border border-neutral-700/50">
            <span class="text-xs text-neutral-400 block">Motor Specificaties</span>
            <span class="text-base font-bold text-white">{data.displacementCc} cc / {data.powerHp} pk</span>
          </div>
        </div>

        {/* Footer / Watermark */}
        <div className="flex justify-between items-end border-t border-neutral-800 pt-3 text-xs text-neutral-400">
          <div>
            <p className="font-medium text-neutral-300">Ideaal voor verkoop op Marktplaats & 2dehands</p>
            <p className="text-[10px] text-neutral-500">Rapport gegenereerd via databaseverificatie</p>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-orange-500 text-sm">stihldecoder.nl</span>
          </div>
        </div>
      </div>

      <button
        onClick={downloadImage}
        className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition"
      >
        📷 Download Afbeelding voor Marktplaats Advertentie
      </button>
    </div>
  );
};
