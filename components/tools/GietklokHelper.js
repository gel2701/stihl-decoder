/**
 * STIHL Gietklok / Datumstempel Visualizer & Decoder Helper (Vanilla & ES Module)
 */

export function renderGietklokHelperHtml(year = 21, month = 5, dialType = 'dots') {
  const fullYear = year < 50 ? 2000 + year : 1900 + year;
  const monthNames = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
  ];

  let estMonth = month + 2;
  let estYear = fullYear;
  if (estMonth > 12) {
    estMonth -= 12;
    estYear += 1;
  }

  const assemblyEst = `${monthNames[month - 1]} ${fullYear} (Machine assemblage ca. ${monthNames[estMonth - 1]} ${estYear})`;

  return `
    <div id="gietklok-container" class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-white max-w-2xl mx-auto shadow-xl space-y-6">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h3 class="text-xl font-black text-orange-500 flex items-center gap-2">
            ⏱️ STIHL Gietklok / Datumstempel Hulp
          </h3>
          <p class="text-sm text-neutral-400">
            Lees de fabricagedatum af van kappen en carterdelen.
          </p>
        </div>
        <div class="flex gap-2 bg-neutral-800 p-1 rounded-lg text-xs font-semibold">
          <button id="btn-dial-dots" class="px-3 py-1.5 rounded-md transition ${dialType === 'dots' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'}">
            Puntjes / Dots
          </button>
          <button id="btn-dial-arrow" class="px-3 py-1.5 rounded-md transition ${dialType === 'arrow' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'}">
            Pijl / Wijzer
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <!-- SVG Dial Visualizer -->
        <div class="flex flex-col items-center">
          <svg viewBox="0 0 200 200" class="w-52 h-52 select-none">
            <circle cx="100" cy="100" r="90" fill="#1c1c1c" stroke="#f97316" stroke-width="4" />
            
            ${Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 - 60) * (Math.PI / 180);
              const x = 100 + 70 * Math.cos(angle);
              const y = 100 + 70 * Math.sin(angle);
              const isSelected = dialType === 'arrow' ? month === i + 1 : i + 1 <= month;
              return `
                <g class="cursor-pointer month-seg" data-month="${i + 1}">
                  <circle cx="${x}" cy="${y}" r="${dialType === 'dots' ? "6" : "8"}" fill="${isSelected ? '#f97316' : '#333333'}" stroke="${isSelected ? '#ffffff' : '#555555'}" stroke-width="1.5" />
                  <text x="${x}" y="${y + 3}" text-anchor="middle" font-size="7" font-weight="bold" fill="${isSelected ? '#ffffff' : '#888888'}">${i + 1}</text>
                </g>
              `;
            }).join('')}

            ${dialType === 'arrow' ? `
              <g transform="rotate(${(month - 1) * 30}, 100, 100)">
                <line x1="100" y1="100" x2="100" y2="42" stroke="#f97316" stroke-width="3.5" stroke-linecap="round" />
                <polygon points="100,32 95,44 105,44" fill="#f97316" />
              </g>
            ` : ''}

            <circle cx="100" cy="100" r="28" fill="#111111" stroke="#444444" stroke-width="2" />
            <text x="100" y="106" text-anchor="middle" font-size="20" font-weight="900" fill="#ffffff" font-family="monospace">${year.toString().padStart(2, '0')}</text>
          </svg>
          <span class="text-xs text-neutral-500 mt-2">Klik op een maandcijfer om te wijzigen</span>
        </div>

        <!-- Controls & Output -->
        <div class="space-y-4">
          <div>
            <label class="text-xs text-neutral-400 font-bold block uppercase tracking-wider mb-1">
              Jaartal in het midden (2 cijfers)
            </label>
            <input id="gietklok-year-input" type="number" min="70" max="99" value="${year}" class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 font-mono text-lg text-white focus:outline-none focus:border-orange-500" />
            <div class="flex gap-1 mt-2">
              <button class="btn-quick-yr px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono" data-yr="15">'15</button>
              <button class="btn-quick-yr px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono" data-yr="18">'18</button>
              <button class="btn-quick-yr px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono" data-yr="20">'20</button>
              <button class="btn-quick-yr px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono" data-yr="22">'22</button>
              <button class="btn-quick-yr px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono" data-yr="24">'24</button>
            </div>
          </div>

          <div class="p-4 bg-orange-950/30 border border-orange-500/30 rounded-xl">
            <span class="text-xs text-orange-400 font-bold uppercase tracking-wider block">Gedecodeerde Onderdeeldatum:</span>
            <span id="gietklok-result-text" class="text-lg font-black text-white block mt-0.5">${assemblyEst}</span>
            <p class="text-xs text-neutral-300 mt-2 leading-relaxed">
              💡 <strong>Let op:</strong> De assemblage van de machine volgt gebruikelijk 1 tot 4 maanden na de gietdatum van de onderdelen.
            </p>
          </div>
        </div>
      </div>

      <!-- Location Footer -->
      <div class="pt-4 border-t border-neutral-800 text-xs text-neutral-400 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong class="text-neutral-200 block mb-1">1. Startkap</strong>
          Binnenzijde van het ventilatorrooster / trekstarterhuis.
        </div>
        <div class="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong class="text-neutral-200 block mb-1">2. Bovenkap</strong>
          Binnenzijde van de cilinderkap / luchtfilterdeksel.
        </div>
        <div class="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong class="text-neutral-200 block mb-1">3. Carterhelft</strong>
          In de holte onder de handgreep of nabij het oliereservoir.
        </div>
      </div>
    </div>
  `;
}
