/**
 * Schema.org JSON-LD Helper for Programmatic SEO
 */

export function generateModelJsonLd({ modelName, category, displacementCc, powerHp, sparkPlug, carbSettings, url, allowProduct = false, serialLocationText = 'Controleer het typeplaatje en de passende STIHL documentatie voor uw uitvoering.' }) {
  const graph = [
    {
      '@type': 'TechArticle',
      'headline': `${modelName} Modeldata, bronstatus & serienummergids`,
      'description': `Overzicht van zichtbare modeldata, onderhoudsreferenties en serienummercontrole voor de STIHL ${modelName}.`,
      'url': url,
      'inLanguage': 'nl-NL'
    }
  ];

  if (allowProduct && (displacementCc || powerHp)) {
    graph.push({
      '@type': 'Product',
      'name': `STIHL ${modelName}`,
      'category': category || 'Tuinmachine',
      'description': `STIHL ${modelName} ${category || 'machine'} met alleen documenteerbare specificaties uit de beschikbare brondata.`,
      'brand': {
        '@type': 'Brand',
        'name': 'STIHL'
      }
    });
  }

  graph.push({
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': `Waar vind ik het serienummer van de STIHL ${modelName}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': serialLocationText
        }
      },
      {
        '@type': 'Question',
        'name': `Waar controleer ik onderhoudsinstellingen voor de STIHL ${modelName}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Controleer carburateur- en onderhoudsinstellingen altijd met het juiste typeplaatje en de passende primaire documentatie voor uw uitvoering.`
        }
      }
    ]
  });

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
