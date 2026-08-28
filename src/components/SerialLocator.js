/**
 * Interactive Visual Serial Number Locator Component
 */

export function renderSerialLocatorHtml() {
  return `
    <section class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
      <div class="border-b border-gray-800 pb-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <span>📍</span> Visuele Serienummer Locator
            </h3>
            <p class="text-xs text-gray-400 mt-1">
              Selecteer uw machinetype om te zien waar het serienummer fysiek ingeslagen is op het gietstuk of carter.
            </p>
          </div>
        </div>
      </div>

      <!-- Machine Type Selector Tabs -->
      <div class="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-4">
        <button class="locator-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition bg-orange-600 text-white" data-category="chainsaw">
          🪓 Kettingzaag (MS)
        </button>
        <button class="locator-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition bg-gray-800 hover:bg-gray-700 text-gray-300" data-category="brushcutter">
          🌿 Bosmaaier (FS)
        </button>
        <button class="locator-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition bg-gray-800 hover:bg-gray-700 text-gray-300" data-category="blower">
          🍂 Bladblazer (BR / BG)
        </button>
        <button class="locator-tab-btn px-4 py-2 rounded-lg text-xs font-bold transition bg-gray-800 hover:bg-gray-700 text-gray-300" data-category="cutoff">
          🚜 Doorslijper (TS)
        </button>
      </div>

      <!-- Locator Content Card -->
      <div id="locator-content-box" class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-gray-950 p-6 rounded-xl border border-gray-800">
        <div class="space-y-4">
          <div class="inline-block px-3 py-1 rounded-full text-2xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            STIHL Kettingzagen (MS-serie)
          </div>
          <h4 id="locator-title" class="text-lg font-bold text-white">Boven de Uitlaat & Vlakbij Geleideplaat</h4>
          <ul id="locator-list" class="space-y-2 text-xs text-gray-300 list-disc list-inside">
            <li><strong>Locatie 1 (Metaal ingeslagen):</strong> Direct ingeslagen in het magnesium carter vlak boven de uitlaatdemper.</li>
            <li><strong>Locatie 2 (Zwaardkap):</strong> Op de behuizing rond de 2 moeren waarmee het zaagblad/geleideblad vastzit.</li>
            <li><strong>Locatie 3 (Barcode Sticker):</strong> Op de onderzijde van de achterste handgreep of op de kettingremkap.</li>
          </ul>
        </div>

        <div class="bg-gray-900 p-6 rounded-xl border border-gray-800 flex flex-col items-center justify-center text-center space-y-3">
          <div class="w-16 h-16 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-3xl font-black">
            🔍
          </div>
          <span class="text-xs font-mono font-bold text-white">Serienummerformaat</span>
          <p class="text-2xs text-gray-400 max-w-xs">
            Let op: veel STIHL machines gebruiken een cijferreeks als serienummer (bijv. 178 456 789). Cijfers ingeslagen op gietstukken van 11 cijfers (bijv. 1121 021 0800) zijn onderdeelnummers.
          </p>
        </div>
      </div>
    </section>
  `;
}
