import React, { useState } from 'react';

export const SerialLocatorGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ms' | 'fs' | 'bg' | 'ts'>('ms');

  const locators = {
    ms: {
      title: 'Kettingzagen (MS-serie)',
      instruction: 'Ingeslagen in het carter boven de uitlaat / demper (niet het stickerlabel).',
      details: 'Bij de meeste STIHL benzine-kettingzagen is het 9-cijferige serienummer diep ingeslagen in het magnesium carter vlak boven de uitlaatdemper of nabij de 2 zwaardmoeren.',
      icon: '🪓'
    },
    fs: {
      title: 'Bosmaaiers (FS-serie)',
      instruction: 'Op het motorblok onder de bedieningsstang of bij de koelribben.',
      details: 'Ingeslagen in het aluminium motorblok aan de onderzijde van de cilinder of op de schachtkoppeling bij het motorgedeelte.',
      icon: '🌿'
    },
    bg: {
      title: 'Bladblazers (BG / BR-serie)',
      instruction: 'Onderzijde van het kunststof motorhuis nabij het aanzuigrooster.',
      details: 'Bij rug- en handblazers bevindt het serienummer zich ingeslagen op het motorblok onder de koelkap of nabij het luchtfilterhuis.',
      icon: '🍂'
    },
    ts: {
      title: 'Doorslijpers (TS-serie)',
      instruction: 'Ingeslagen in het gietmetaal van de beschermkap of het frame bij de motormontage.',
      details: 'Bij doorslijpers (bijv. TS 410 / TS 420) is het nummer ingeslagen in de metalen arm bij de snijkap of aan de onderzijde van het motorframe.',
      icon: '🚜'
    }
  };

  const current = locators[activeTab];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <span>📍</span> Visuele Serienummer Locator Gids
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Selecteer uw machinetype om te zien waar het 9-cijferige serienummer fysiek ingeslagen is.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-4">
        <button
          onClick={() => setActiveTab('ms')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'ms' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          🪓 Kettingzagen (MS)
        </button>
        <button
          onClick={() => setActiveTab('fs')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'fs' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          🌿 Bosmaaiers (FS)
        </button>
        <button
          onClick={() => setActiveTab('bg')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'bg' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          🍂 Bladblazers (BG/BR)
        </button>
        <button
          onClick={() => setActiveTab('ts')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'ts' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          🚜 Doorslijpers (TS)
        </button>
      </div>

      {/* Active Tab Info Box */}
      <div className="bg-gray-950 p-6 rounded-xl border border-gray-800 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{current.icon}</span>
          <div>
            <span className="text-2xs font-mono font-bold text-orange-400 uppercase">STIHL {current.title}</span>
            <h4 className="text-base font-bold text-white mt-0.5">{current.instruction}</h4>
          </div>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed pt-2 border-t border-gray-800/80">
          {current.details}
        </p>
      </div>
    </div>
  );
};
