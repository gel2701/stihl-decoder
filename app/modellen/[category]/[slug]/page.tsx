import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModelJsonLd } from '../../../../src/components/ModelJsonLd';
import { SerialDecoderForm } from '../../../../src/components/SerialDecoderForm';
import { getModelBySlug } from '../../../../lib/database';

interface Props {
  params: { category: string; slug: string };
}

// 1. Dynamische SEO Metadata per model
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const model = await getModelBySlug(params.slug);
  if (!model) return {};

  const title = `STIHL ${model.name} Bouwjaar, Serienummer & Specificaties | StihlDecoder`;
  const description = `Controleer het bouwjaar, herkomstfabriek en specificaties van de STIHL ${model.name}. Inclusief carburateur basisafstelling, bougietype en serienummer locaties.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://stihldecoder.nl/modellen/${params.category}/${params.slug}`,
      type: 'article',
      locale: 'nl_NL',
    },
    alternates: {
      canonical: `https://stihldecoder.nl/modellen/${params.category}/${params.slug}`,
    }
  };
}

// 2. Pagina Component met Statische Content & Decoder Form
export default async function ModelCategoryPage({ params }: Props) {
  const model = await getModelBySlug(params.slug);
  if (!model) notFound();

  return (
    <article className="max-w-4xl mx-auto px-4 py-8 text-white font-sans space-y-8">
      {/* Schema.org Structured Data */}
      <ModelJsonLd model={model} />

      <header className="mb-6">
        <span className="text-xs font-mono uppercase text-orange-500 font-bold tracking-wider">
          STIHL Modelgids & Decodering
        </span>
        <h1 className="text-3xl sm:text-4xl font-black mt-1 text-white">
          STIHL {model.name} Bouwjaar & Specificaties
        </h1>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          Officiële gids voor de STIHL {model.name}. Bekijk carburateur basisafstellingen, bougiespecificaties, kettingsteek en controleer het serienummer van uw machine.
        </p>
      </header>

      {/* Directe Decoder Tool voor dit model */}
      <section className="mb-10 bg-gray-900 border border-gray-800 p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-orange-400 mb-2">
          Serienummer van jouw {model.name} controleren:
        </h2>
        <SerialDecoderForm initialModelHint={model.name} />
      </section>

      {/* Technische Gegevenstabel (Voor Google & Gebruiker) */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black border-b border-gray-800 pb-2 text-white">
          Fabrieksspecificaties STIHL {model.name}
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-xs text-gray-400 block">Motorvermogen</span>
            <span className="text-base font-bold text-white">
              {model.powerHp ? `${model.powerHp} pk (${model.powerKw} kW)` : 'Niet van toepassing'}
            </span>
          </div>
          <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-xs text-gray-400 block">Cilinderinhoud</span>
            <span className="text-base font-bold text-white">
              {model.displacementCc ? `${model.displacementCc} cc` : (model.batterySystem ? 'Accu-aangedreven' : '-')}
            </span>
          </div>
          <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-xs text-gray-400 block">Bougie & Elektrodenafstand</span>
            <span className="text-base font-bold text-white">
              {model.sparkPlug ? `${model.sparkPlug} (${model.electrodeGapMm || 0.50} mm)` : 'Geen bougie (Accu)'}
            </span>
          </div>
          <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 space-y-1">
            <span className="text-xs text-gray-400 block">Carburateur Standaardafstelling</span>
            <span className="text-base font-bold text-orange-400">
              {model.carbH ? `H: ${model.carbH} | L: ${model.carbL}` : 'Elektronisch / Accu'}
            </span>
          </div>
        </div>
      </section>
    </article>
  );
}
