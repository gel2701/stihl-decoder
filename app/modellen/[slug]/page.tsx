import React from 'react';
import { generateModelJsonLd } from '../../../src/components/ModelJsonLd.js';
import { GietklokHelper } from '../../../components/tools/GietklokHelper';

interface PageProps {
  params: {
    slug: string;
  };
}

export default function ModelPage({ params }: PageProps) {
  const slug = params.slug;
  const modelName = slug.toUpperCase().replace(/-/g, ' ');

  const jsonLd = generateModelJsonLd({
    modelName,
    category: 'Kettingzaag',
    displacementCc: 50.2,
    powerHp: 4.1,
    sparkPlug: 'NGK CMR6H',
    carbSettings: { H: 'M-Tronic (Auto)', L: 'M-Tronic (Auto)', LA: 'M-Tronic (Auto)' },
    url: `https://stihldecoder.nl/modellen/${slug}`
  });

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8 text-white font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
          STIHL Model Specificaties
        </span>
        <h1 className="text-3xl font-extrabold text-white">STIHL {modelName}</h1>
        <p className="text-sm text-gray-300 leading-relaxed">
          Officiële gids voor de STIHL {modelName}. Bekijk carburateur basisafstellingen, bougiespecificaties, kettingsteek en lees de gietklok/datumstempel af om het bouwjaar te verifiëren.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-800 text-xs">
          <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
            <h3 className="font-bold text-orange-400 uppercase">Motor Specificaties</h3>
            <div><span className="text-gray-400">Cilinderinhoud:</span> <strong className="text-white">50.2 cc</strong></div>
            <div><span className="text-gray-400">Vermogen:</span> <strong className="text-white">4.1 pk (3.0 kW)</strong></div>
            <div><span className="text-gray-400">Bougie:</span> <strong className="text-white">NGK CMR6H</strong></div>
          </div>
          <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
            <h3 className="font-bold text-orange-400 uppercase">Carburateur Basisafstelling</h3>
            <div><span className="text-gray-400">H-Schroef:</span> <strong className="text-white">M-Tronic (Auto)</strong></div>
            <div><span className="text-gray-400">L-Schroef:</span> <strong className="text-white">M-Tronic (Auto)</strong></div>
            <div><span className="text-gray-400">LA-Schroef:</span> <strong className="text-white">M-Tronic (Auto)</strong></div>
          </div>
        </div>
      </div>

      {/* Gietklok Helper Module */}
      <section className="pt-4">
        <GietklokHelper />
      </section>
    </main>
  );
}
