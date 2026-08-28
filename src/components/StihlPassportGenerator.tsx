import React, { useRef } from 'react';
import { toPng } from 'html-to-image';

export interface PassportData {
  serialNumber: string;
  modelName: string;
  country: string;
  productionYears: string;
  powerHp: number;
  displacementCc?: number | null;
  chainInfo?: string;
  theftCheck: {
    isStolen?: boolean;
    userSelfReported?: boolean;
    checkedAt: string;
    statusLabel: string;
  };
}

export const StihlPassportGenerator: React.FC<{ data: PassportData }> = ({ data }) => {
  const passportRef = useRef<HTMLDivElement>(null);

  const downloadImage = async () => {
    if (!passportRef.current) return;
    try {
      const dataUrl = await toPng(passportRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `stihl-serienummer-rapport-${data.serialNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Fout bij genereren afbeelding:', err);
    }
  };

  const isSelfReported = data.theftCheck ? Boolean(data.theftCheck.userSelfReported) : false;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent('https://stihldecoder.nl/?s=' + data.serialNumber)}`;
  const chainText = data.chainInfo || '.325" @ 1.3 mm';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 4:3 Verhouding geoptimaliseerd voor Marktplaats foto's */}
      <div
        ref={passportRef}
        className="w-[640px] h-[520px] bg-neutral-950 text-white p-7 rounded-2xl border border-neutral-800 flex flex-col justify-between shadow-2xl relative overflow-hidden font-sans"
      >
        {/* Subtiel gloei-effect */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-neutral-800/80 pb-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-orange-500 font-bold">
              Serienummer Rapport (indicatief)
            </span>
            <h2 className="text-3xl font-black tracking-tight text-white mt-0.5">{data.modelName}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-black tracking-wider">
              INDICATIEF OVERZICHT
            </span>
          </div>
        </div>

        {/* Stop Heling Veiligheidsbalk (Full Width Highlight) */}
        <div className="p-3 rounded-xl border flex items-center justify-between bg-neutral-900 border-neutral-700 text-neutral-300">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{isSelfReported ? '📋' : 'ℹ️'}</span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider block">
                Stop Heling Diefstalcontrole Status
              </span>
              <span className="text-sm font-semibold text-white">
                {data.theftCheck ? data.theftCheck.statusLabel : 'Niet gecontroleerd via StopHeling'}
              </span>
            </div>
          </div>
          <div className="text-right text-[11px] text-neutral-400">
            <span>Datum:</span>
            <span className="font-mono text-white font-bold block">{data.theftCheck ? data.theftCheck.checkedAt : '26-08-2026'}</span>
          </div>
        </div>

        {/* Technische Details Grid met Zaaggroep Spec */}
        <div className="grid grid-cols-2 gap-3 my-1">
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Serienummer</span>
            <span className="font-mono text-lg font-bold text-white tracking-wider">{data.serialNumber}</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Herkomst / Fabriek</span>
            <span className="text-base font-bold text-white">{data.country}</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Geschat Bouwjaar</span>
            <span className="text-base font-bold text-orange-400">{data.productionYears}</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Motor Specificaties</span>
            <span className="text-base font-bold text-white">{data.displacementCc ? `${data.displacementCc} cc / ` : ''}{data.powerHp} pk</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2 flex justify-between items-center">
            <div>
              <span className="text-[11px] text-neutral-400 block font-medium">Snijgarnituur / Kettingmaat (Standaard)</span>
              <span className="text-sm font-bold text-orange-300 font-mono">{chainText}</span>
            </div>
            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-mono">Indicatief overzicht</span>
          </div>
        </div>

        {/* Footer / Watermerk met QR-code */}
        <div className="flex justify-between items-center border-t border-neutral-800/80 pt-3 text-xs text-neutral-400">
          <div>
            <p className="font-semibold text-neutral-300">Onafhankelijk rapport op basis van bekende serienummer- en herkomstdata</p>
            <p className="text-[10px] text-neutral-500">Scan QR-code voor live rapport en aanvullende handmatige controle</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="font-mono font-black text-orange-500 text-base block">stihldecoder.nl</span>
            </div>
            <img src={qrUrl} alt="Scan QR" className="w-10 h-10 rounded border border-neutral-700 bg-white p-0.5 flex-shrink-0" />
          </div>
        </div>
      </div>

      <button
        onClick={downloadImage}
        className="px-6 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-2.5 transition active:scale-95 cursor-pointer"
      >
        📄 Download rapport met Stop Heling-statusveld & QR-code
      </button>
    </div>
  );
};
