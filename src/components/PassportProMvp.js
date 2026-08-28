/**
 * Machine Passport Pro MVP & A/B Monetization Experiment Component for STIHLDecoder.nl
 * Phase 30 Premium Machine Passport MVP
 */

import { PASSPORT_PRO_PRICE } from './ValuationEngine.js';

export function renderPassportProMvpCard({ modelName = 'STIHL Machine', abVariant = 'A' }) {
  const ctaText = abVariant === 'B' 
    ? 'Maak Professioneel Verkooprapport' 
    : 'Maak Premium Machinepaspoort';

  return `
    <div class="bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950/40 border border-orange-500/30 rounded-2xl p-6 shadow-xl space-y-4">
      <div class="flex justify-between items-start border-b border-gray-800 pb-3">
        <div>
          <span class="px-2.5 py-0.5 rounded-full text-2xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 inline-block mb-1">
            PREMIUM RAPPORT
          </span>
          <h3 class="text-lg font-bold text-white">Machinepaspoort Pro</h3>
        </div>
        <span class="text-xl font-black text-orange-400 font-mono">€${PASSPORT_PRO_PRICE}</span>
      </div>

      <p class="text-xs text-gray-300 leading-relaxed">
        Maak voor uw <strong>${modelName}</strong> een onafhankelijk PDF-rapport met serienummer, typeplaatje-notities en een QR-link naar het live rapport. Dit product claimt geen officiële STIHL- of politiecertificering.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-200">
        <div class="flex items-center gap-2">
          <span class="text-emerald-400 font-bold">✓</span>
          <span>QR-code met live rapport-URL</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-emerald-400 font-bold">✓</span>
          <span>High-res PDF verkooprapport</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-emerald-400 font-bold">✓</span>
          <span>Eigenaars- & Onderhoudshistorie</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-emerald-400 font-bold">✓</span>
          <span>StopHeling statusveld indien controle slaagt</span>
        </div>
      </div>

      <div class="pt-2 flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-gray-800">
        <a 
          href="/stihl-paspoort/?tier=pro&variant=${abVariant}" 
          class="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition text-xs text-center flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30"
          onclick="if(window.trackStihlEvent){window.trackStihlEvent('passport_pro_click', {model: '${modelName}', variant: '${abVariant}'});}"
        >
          <span>${ctaText} — €${PASSPORT_PRO_PRICE}</span>
        </a>
        <span class="text-2xs text-gray-500 font-medium">Directe download • Onbeperkt geldig</span>
      </div>
    </div>
  `;
}
