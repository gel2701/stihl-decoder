/**
 * Schema.org JSON-LD Helper for Programmatic SEO
 */

export function generateModelJsonLd({ modelName, category, displacementCc, powerHp, sparkPlug, carbSettings, url, allowProduct = false, serialLocationText = 'Controleer het typeplaatje en de passende STIHL documentatie voor uw uitvoering.' }) {
  const carbH = (carbSettings && carbSettings.H) || 'Niet vastgesteld';
  const carbL = (carbSettings && carbSettings.L) || 'Niet vastgesteld';
  const carbLA = (carbSettings && carbSettings.LA) || 'Niet vastgesteld';
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
        'name': `Wat is een bruikbare basisreferentie voor de carburateur van de STIHL ${modelName}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Repositoryreferentie: H-schroef: ${carbH}, L-schroef: ${carbL}, LA-schroef: ${carbLA}. Controleer de exacte afstelling altijd met het juiste typeplaatje en de primaire documentatie voor uw uitvoering.`
        }
      }
    ]
  });

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
