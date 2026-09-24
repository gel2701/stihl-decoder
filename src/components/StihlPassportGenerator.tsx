import React, { useRef } from 'react';
import { toPng } from 'html-to-image';

export interface PassportData {
  serialNumber?: string | null;
  modelName: string;
  categorySlug?: string | null;
  modelSlug?: string | null;
  country?: string | null;
  productionYears?: string | null;
  passportMode?: 'MODEL_ONLY' | 'MODEL_WITH_SERIAL' | 'OFFICIAL_SERIAL_VERIFIED';
  officialProductName?: string | null;
  officialVerifiedAt?: string | null;
  powerHp?: number | null;
  powerKw?: number | null;
  displacementCc?: number | null;
  chainInfo?: string;
  theftCheck?: {
    isStolen?: boolean;
    userSelfReported?: boolean;
    checkedAt?: string | null;
    statusLabel: string;
  } | null;
}

export const StihlPassportGenerator: React.FC<{ data: PassportData }> = ({ data }) => {
  const passportRef = useRef<HTMLDivElement>(null);
  const hasSerial = Boolean(data.serialNumber && data.serialNumber.trim());

  const passportMode = data.passportMode || (
    data.officialProductName || data.officialVerifiedAt
      ? 'OFFICIAL_SERIAL_VERIFIED'
      : (hasSerial ? 'MODEL_WITH_SERIAL' : 'MODEL_ONLY')
  );

  const downloadImage = async () => {
    if (!passportRef.current) return;
    try {
      const dataUrl = await toPng(passportRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      const fileSerial = hasSerial ? (data.serialNumber || 'serial') : 'model';
      link.download = `stihl-machinepaspoort-${fileSerial}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Fout bij genereren afbeelding:', err);
    }
  };

  const isSelfReported = data.theftCheck ? Boolean(data.theftCheck.userSelfReported) : false;

  // Canonical Model QR URL: Always points to the public canonical model page.
  // CRITICAL PRIVACY GATE: NEVER include serial numbers or query params in external QR requests!
  const safeCatSlug = data.categorySlug || 'kettingzagen';
  const safeModelSlug = data.modelSlug || (data.modelName ? data.modelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : '');
  const publicTargetUrl = (safeCatSlug && safeModelSlug)
    ? `https://www.stihldecoder.nl/${safeCatSlug}/${safeModelSlug}/`
    : 'https://www.stihldecoder.nl/';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(publicTargetUrl)}`;

  const technicalRows = [
    data.displacementCc ? `${data.displacementCc} cc` : null,
    data.powerKw ? `${data.powerKw} kW` : (data.powerHp ? `${data.powerHp} pk` : null),
    data.chainInfo || null
  ].filter(Boolean) as string[];

  let badgeText = 'INDICATIEF OVERZICHT';
  if (passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    badgeText = '✓ OFFICIEEL STIHL';
  } else if (passportMode === 'MODEL_ONLY') {
    badgeText = 'MODELPASPOORT';
  } else if (isSelfReported) {
    badgeText = 'ZELF GERAPPORTEERD';
  }

  const countryText = hasSerial
    ? (data.country || 'Niet vastgesteld')
    : 'Nog niet gekoppeld (geen serienummer)';

  const yearsText = hasSerial
    ? (data.productionYears || 'Niet vastgesteld')
    : 'Niet opgegeven';

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
              STIHL Machinepaspoort
            </span>
            <h2 className="text-3xl font-black tracking-tight text-white mt-0.5">{data.modelName}</h2>
            {data.officialProductName && (
              <span className="text-xs font-semibold text-emerald-400 block mt-0.5">
                {data.officialProductName}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-black tracking-wider">
              {badgeText}
            </span>
          </div>
        </div>

        {/* Stop Heling Veiligheidsbalk (Alleen tonen bij serienummer) */}
        {passportMode !== 'MODEL_ONLY' && (
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
            {data.theftCheck?.checkedAt && (
              <div className="text-right text-[11px] text-neutral-400">
                <span>Datum:</span>
                <span className="font-mono text-white font-bold block">{data.theftCheck.checkedAt}</span>
              </div>
            )}
          </div>
        )}

        {/* Technische Details Grid met Zaaggroep Spec */}
        <div className="grid grid-cols-2 gap-3 my-1">
          <div className={`p-3 rounded-xl border ${hasSerial ? 'bg-neutral-900/90 border-neutral-800' : 'bg-neutral-900/90 border-dashed border-neutral-800'}`}>
            <span className="text-[11px] text-neutral-400 block font-medium">Serienummer</span>
            <span className={`text-base font-bold ${hasSerial ? 'font-mono text-white tracking-wider' : 'text-neutral-400 italic'}`}>
              {hasSerial ? data.serialNumber : 'Nog niet toegevoegd'}
            </span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Herkomst / Fabriek</span>
            <span className="text-sm font-bold text-white">{countryText}</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span className="text-[11px] text-neutral-400 block font-medium">Geschat Bouwjaar</span>
            <span className="text-sm font-bold text-orange-400">{yearsText}</span>
          </div>
          <div className="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2">
            <span className="text-[11px] text-neutral-400 block font-medium">
              {technicalRows.length > 0 ? 'Technische specificaties' : 'Technische specificatiesstatus'}
            </span>
            {technicalRows.length > 0 ? (
              <div className="mt-1 flex flex-col gap-1">
                {technicalRows.map((row) => (
                  <span key={row} className="text-sm font-bold text-orange-300 font-mono">{row}</span>
                ))}
              </div>
            ) : (
              <span className="text-sm font-semibold text-neutral-300">
                Technische specificaties worden alleen getoond wanneer ze veilig aan het actuele decoderresultaat zijn gekoppeld.
              </span>
            )}
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
