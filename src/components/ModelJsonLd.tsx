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
        'headline': `STIHL ${model.name} Modeldata, bronstatus & serienummergids`,
        'description': `Bekijk zichtbare modeldata, bronstatus en serienummerlocaties voor de STIHL ${model.name}. Bevestig bouwjaar en uitvoering altijd met typeplaatje of primaire documentatie.`,
        'url': url,
        'inLanguage': 'nl-NL'
      },
      {
        '@type': 'Product',
        'name': `STIHL ${model.name}`,
        'category': model.category || 'Kettingzaag',
        'description': `STIHL ${model.name} ${model.category || 'machine'} met zichtbare repositorydata over cilinderinhoud, vermogen en onderhoudspunten.`,
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
            'name': `Wat is een bruikbare basisreferentie voor de carburateur van de STIHL ${model.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Repositoryreferentie voor STIHL ${model.name}: H-schroef: ${carbH}, L-schroef: ${carbL}, LA-schroef: ${carbLA}. Controleer de exacte afstelling altijd met het juiste typeplaatje en de primaire documentatie voor uw uitvoering.`
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
