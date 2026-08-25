import React, { useState } from 'react';

export const GietklokHelper: React.FC = () => {
  const [year, setYear] = useState<number>(21);
  const [selectedMonth, setSelectedMonth] = useState<number>(5);
  const [dialType, setDialType] = useState<'arrow' | 'dots'>('dots');

  const fullYear = year < 50 ? 2000 + year : 1900 + year;
  const monthNames = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
  ];

  const getAssemblyEstimate = () => {
    let estMonth = selectedMonth + 2;
    let estYear = fullYear;
    if (estMonth > 12) {
      estMonth -= 12;
      estYear += 1;
    }
    return `${monthNames[selectedMonth - 1]} ${fullYear} (Machine assemblage ca. ${monthNames[estMonth - 1]} ${estYear})`;
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-white max-w-2xl mx-auto shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-black text-orange-500 flex items-center gap-2">
            ⏱️ STIHL Gietklok / Datumstempel Hulp
          </h3>
          <p className="text-sm text-neutral-400">
            Lees de fabricagedatum af van kappen en carterdelen.
          </p>
        </div>
        <div className="flex gap-2 bg-neutral-800 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setDialType('dots')}
            className={`px-3 py-1.5 rounded-md transition ${dialType === 'dots' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            Puntjes / Dots
          </button>
          <button
            onClick={() => setDialType('arrow')}
            className={`px-3 py-1.5 rounded-md transition ${dialType === 'arrow' ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            Pijl / Wijzer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Interactieve SVG Klok */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 200 200" className="w-52 h-52 select-none">
            {/* Buitenste ring */}
            <circle cx="100" cy="100" r="90" fill="#1c1c1c" stroke="#f97316" strokeWidth="4" />
            
            {/* 12 Maand-posities */}
            {Array.from({ length: 12 }).map((_, index) => {
              const angle = (index * 30 - 60) * (Math.PI / 180);
              const x = 100 + 70 * Math.cos(angle);
              const y = 100 + 70 * Math.sin(angle);
              const isSelected = dialType === 'arrow' 
                ? selectedMonth === index + 1
                : index + 1 <= selectedMonth;

              return (
                <g 
                  key={index} 
                  className="cursor-pointer"
                  onClick={() => setSelectedMonth(index + 1)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={dialType === 'dots' ? "6" : "8"}
                    fill={isSelected ? '#f97316' : '#333333'}
                    stroke={isSelected ? '#ffffff' : '#555555'}
                    strokeWidth="1.5"
                  />
                  <text
                    x={x}
                    y={y + 3}
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill={isSelected ? '#ffffff' : '#888888'}
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}

            {/* Pijl indien type === arrow */}
            {dialType === 'arrow' && (
              <g transform={`rotate(${(selectedMonth - 1) * 30}, 100, 100)`}>
                <line x1="100" y1="100" x2="100" y2="42" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round" />
                <polygon points="100,32 95,44 105,44" fill="#f97316" />
              </g>
            )}

            {/* Centrum Jaartal Cirkel */}
            <circle cx="100" cy="100" r="28" fill="#111111" stroke="#444444" strokeWidth="2" />
            <text
              x="100"
              y="106"
              textAnchor="middle"
              fontSize="20"
              fontWeight="900"
              fill="#ffffff"
              fontFamily="monospace"
            >
              {year.toString().padStart(2, '0')}
            </text>
          </svg>
          <span className="text-xs text-neutral-500 mt-2">Klik op een maandcijfer om te wijzigen</span>
        </div>

        {/* Bediening & Resultaat */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-400 font-bold block uppercase tracking-wider mb-1">
              Jaartal in het midden (2 cijfers)
            </label>
            <input
              type="number"
              min="70"
              max="99"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || 0)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 font-mono text-lg text-white focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-1 mt-2">
              {[15, 18, 20, 22, 24].map((quickYear) => (
                <button
                  key={quickYear}
                  onClick={() => setYear(quickYear)}
                  className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs text-neutral-300 font-mono"
                >
                  '{quickYear}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-orange-950/30 border border-orange-500/30 rounded-xl">
            <span className="text-xs text-orange-400 font-bold uppercase tracking-wider block">
              Gedecodeerde Onderdeeldatum:
            </span>
            <span className="text-lg font-black text-white block mt-0.5">
              {getAssemblyEstimate()}
            </span>
            <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
              💡 <strong>Let op:</strong> De assemblage van de machine volgt gebruikelijk 1 tot 4 maanden na de gietdatum van de onderdelen.
            </p>
          </div>
        </div>
      </div>

      {/* Locatietips Accordion / Footer */}
      <div className="mt-6 pt-4 border-t border-neutral-800 text-xs text-neutral-400 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong className="text-neutral-200 block mb-1">1. Startkap</strong>
          Binnenzijde van het ventilatorrooster / trekstarterhuis.
        </div>
        <div className="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong className="text-neutral-200 block mb-1">2. Bovenkap</strong>
          Binnenzijde van de cilinderkap / luchtfilterdeksel.
        </div>
        <div className="bg-neutral-800/40 p-2.5 rounded-lg">
          <strong className="text-neutral-200 block mb-1">3. Carterhelft</strong>
          In de holte onder de handgreep of nabij het oliereservoir.
        </div>
      </div>
    </div>
  );
};
