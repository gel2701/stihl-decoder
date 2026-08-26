/**
 * Repair & Sell Lead Generation MVP Components for STIHLDecoder.nl
 * Phase 30 Lead MVPs
 */

export function renderRepairLeadMvpCard({ modelName = 'STIHL Machine' }) {
  return `
    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-3 text-xs">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">
          <span>🔧 Machine defect of startprobleem?</span>
        </h3>
        <span class="text-2xs text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded">Reparatie Service</span>
      </div>
      <p class="text-gray-300">
        Loopt uw ${modelName} onregelmatig of slaat de motor niet aan? Ontvang vrijblijvend advies of een prijsindicatie voor reparatie.
      </p>
      <form action="/api/v1/leads/repair" method="POST" class="space-y-2 pt-1" onsubmit="if(window.trackStihlEvent){window.trackStihlEvent('repair_lead_started', {model: '${modelName}'});}">
        <input type="hidden" name="model" value="${modelName}">
        <input 
          type="text" 
          name="problem" 
          placeholder="Omschrijf het probleem (bijv. slaat af bij gas geven)..." 
          required 
          class="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-orange-500"
        />
        <div class="flex gap-2">
          <input 
            type="email" 
            name="contact" 
            placeholder="Uw e-mailadres..." 
            required 
            class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-orange-500"
          />
          <button 
            type="submit" 
            class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
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
    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-3 text-xs">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">
          <span>💶 Wil je deze ${modelName} verkopen?</span>
        </h3>
        <span class="text-2xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Direct Inkoopaanbod</span>
      </div>
      <p class="text-gray-300">
        Ontvang een vrijblijvend overname-bod van geverifieerde STIHL opkopers of vergelijkbare verzamelaars.
      </p>
      <form action="/api/v1/leads/sell" method="POST" class="space-y-2 pt-1" onsubmit="if(window.trackStihlEvent){window.trackStihlEvent('sell_lead_started', {model: '${modelName}'});}">
        <input type="hidden" name="model" value="${modelName}">
        <div class="grid grid-cols-2 gap-2">
          <select name="condition" class="bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs">
            <option value="GOED">Staat: Goed / Lopend</option>
            <option value="REDELIJK">Staat: Redelijk</option>
            <option value="DEFECT">Staat: Defect / Opknapper</option>
          </select>
          <input 
            type="text" 
            name="asking_price" 
            placeholder="Vraagprijs (€)..." 
            class="bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-orange-500"
          />
        </div>
        <div class="flex gap-2">
          <input 
            type="email" 
            name="contact" 
            placeholder="Uw e-mailadres..." 
            required 
            class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-orange-500"
          />
          <button 
            type="submit" 
            class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
          >
            Ontvang Bod
          </button>
        </div>
      </form>
    </div>
  `;
}
