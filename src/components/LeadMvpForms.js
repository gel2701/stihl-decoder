/**
 * Repair & Sell Lead Generation MVP Components for STIHLDecoder.nl
 * Phase 32C Mobile UX & Responsive Form Optimization
 */

export function renderRepairLeadMvpCard({ modelName = 'STIHL Machine' }) {
  return `
    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 sm:p-6 space-y-3 text-xs">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">
          <span>🔧 Machine defect of startprobleem?</span>
        </h3>
        <span class="text-2xs text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">Reparatie Service</span>
      </div>
      <p class="text-gray-300 leading-relaxed">
        Loopt uw ${modelName} onregelmatig of slaat de motor niet aan? Ontvang vrijblijvend advies of een prijsindicatie voor reparatie.
      </p>
      <form action="/api/v1/leads/repair" method="POST" class="space-y-2.5 pt-1" onsubmit="if(window.trackStihlEvent){window.trackStihlEvent('repair_lead_started', {model: '${modelName}'});}">
        <input type="hidden" name="model" value="${modelName}">
        <input 
          type="text" 
          name="problem" 
          placeholder="Omschrijf het probleem (bijv. slaat af bij gas geven)..." 
          required 
          class="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
        />
        <div class="flex flex-col sm:flex-row gap-2">
          <input 
            type="email" 
            name="contact" 
            placeholder="Uw e-mailadres..." 
            required 
            class="w-full sm:flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
          />
          <button 
            type="submit" 
            class="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white font-bold px-5 py-3 rounded-xl text-xs transition cursor-pointer min-h-[48px] flex items-center justify-center"
          >
            Verstuur Aanvraag
          </button>
        </div>
      </form>
    </div>
  `;
}

export function renderSellLeadMvpCard({ modelName = 'STIHL Machine' }) {
  return `
    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 sm:p-6 space-y-3 text-xs">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">
          <span>💶 Wil je deze ${modelName} verkopen?</span>
        </h3>
        <span class="text-2xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Direct Inkoopaanbod</span>
      </div>
      <p class="text-gray-300 leading-relaxed">
        Ontvang een vrijblijvend overnamebod van geïnteresseerde opkopers of verzamelaars. Vergelijk voorwaarden altijd zelf voordat u akkoord gaat.
      </p>
      <form action="/api/v1/leads/sell" method="POST" class="space-y-2.5 pt-1" onsubmit="if(window.trackStihlEvent){window.trackStihlEvent('sell_lead_started', {model: '${modelName}'});}">
        <input type="hidden" name="model" value="${modelName}">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select name="condition" class="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-3 text-white text-sm min-h-[48px]">
            <option value="GOED">Staat: Goed / Lopend</option>
            <option value="REDELIJK">Staat: Redelijk</option>
            <option value="DEFECT">Staat: Defect / Opknapper</option>
          </select>
          <input 
            type="text" 
            name="asking_price" 
            placeholder="Vraagprijs (€)..." 
            class="w-full bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
          />
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input 
            type="email" 
            name="contact" 
            placeholder="Uw e-mailadres..." 
            required 
            class="w-full sm:flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3.5 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500 min-h-[48px]"
          />
          <button 
            type="submit" 
            class="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl text-xs transition cursor-pointer min-h-[48px] flex items-center justify-center"
          >
            Ontvang Bod
          </button>
        </div>
      </form>
    </div>
  `;
}
