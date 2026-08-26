import React from 'react';

export interface ModelJsonLdProps {
  model: {
    name: string;
    category?: string;
    categorySlug?: string;
    slug?: string;
    displacementCc?: number | null;
    powerHp?: number | null;
    powerKw?: number | null;
    sparkPlug?: string | null;
    electrodeGapMm?: number | null;
    carbH?: string | null;
    carbL?: string | null;
    carbLA?: string | null;
  };
  baseUrl?: string;
}

export function ModelJsonLd({ model, baseUrl = 'https://stihldecoder.nl' }: ModelJsonLdProps) {
  const categorySlug = model.categorySlug || 'kettingzagen';
  const slug = model.slug || model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const url = `${baseUrl}/modellen/${categorySlug}/${slug}`;

  const carbH = model.carbH || '1 slag open';
  const carbL = model.carbL || '1 slag open';
  const carbLA = model.carbLA || '2800 RPM stationair';

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        'headline': `STIHL ${model.name} Bouwjaar, Serienummer & Specificaties`,
        'description': `Controleer het bouwjaar, herkomstfabriek en specificaties van de STIHL ${model.name}. Inclusief carburateur basisafstelling, bougietype en serienummer locaties.`,
        'url': url,
        'inLanguage': 'nl-NL'
      },
      {
        '@type': 'Product',
        'name': `STIHL ${model.name}`,
        'category': model.category || 'Kettingzaag',
        'description': `STIHL ${model.name} ${model.category || 'machine'} met ${model.displacementCc || 50.2} cc cilinderinhoud en ${model.powerHp || 4.1} pk vermogen.`,
        'brand': {
          '@type': 'Brand',
          'name': 'STIHL'
        }
      },
      {
        '@type': 'FAQPage',
        'mainEntity': [
          {
            '@type': 'Question',
            'name': `Waar staat het serienummer van een STIHL ${model.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Het 9-cijferige serienummer van de STIHL ${model.name} staat ingeslagen in het metaal van het carter (boven de uitlaat of bij de geleideplaatmontage) of op het typeplaatje.`
            }
          },
          {
            '@type': 'Question',
            'name': `Wat is de standaard carburateur afstelling van de STIHL ${model.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Standaard basisafstelling voor STIHL ${model.name}: H-schroef: ${carbH}, L-schroef: ${carbL}, LA-schroef: ${carbLA}.`
            }
          }
        ]
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
    />
  );
}
