import React from 'react';
import { getSerialLocationAnswer, getSafeCategorySlug, shouldPublishProductSchema } from '../publicationRules.js';
import { PRIMARY_ORIGIN } from '../config.js';

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

export function ModelJsonLd({ model, baseUrl = PRIMARY_ORIGIN }: ModelJsonLdProps) {
  const categorySlug = getSafeCategorySlug({
    category_slug: model.categorySlug,
    category: model.category
  });
  const slug = model.slug || model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const url = categorySlug ? `${baseUrl}/${categorySlug}/${slug}/` : `${baseUrl}/modellen-onbekend/${slug}/`;

  const serialLocationText = getSerialLocationAnswer(categorySlug);
  const allowProduct = shouldPublishProductSchema({
    model_name: model.name,
    category_slug: categorySlug,
    displacement_cc: model.displacementCc,
    power_hp: model.powerHp,
    power_kw: model.powerKw,
    verification_status: 'UNVERIFIED',
    field_verification: { has_primary_document: false }
  });

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        'headline': `STIHL ${model.name} modeldata, bronstatus en serienummercontrole`,
        'description': `Bekijk zichtbare modeldata, bronstatus en serienummerlocaties voor de STIHL ${model.name}. Bevestig uitvoering en bouwperiode altijd met typeplaatje of primaire documentatie.`,
        'url': url,
        'inLanguage': 'nl-NL'
      },
      {
        '@type': 'FAQPage',
        'mainEntity': [
          {
            '@type': 'Question',
            'name': `Waar staat het serienummer van een STIHL ${model.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': serialLocationText
            }
          },
          {
            '@type': 'Question',
            'name': `Waar controleer ik onderhoudsinstellingen voor de STIHL ${model.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Controleer carburateur- en onderhoudsinstellingen altijd met het juiste typeplaatje en de passende primaire documentatie voor uw uitvoering.`
            }
          }
        ]
      }
    ]
  };

  if (allowProduct && (model.displacementCc || model.powerHp || model.powerKw)) {
    jsonLdData['@graph'].splice(1, 0, {
      '@type': 'Product',
      'name': `STIHL ${model.name}`,
      'category': model.category || 'Tuinmachine',
      'description': `STIHL ${model.name} ${model.category || 'machine'} met alleen documenteerbare specificaties uit de beschikbare brondata.`,
      'brand': {
        '@type': 'Brand',
        'name': 'STIHL'
      }
    });
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
    />
  );
}
