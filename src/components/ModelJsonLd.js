/**
 * Schema.org JSON-LD Helper for Programmatic SEO
 */

export function generateModelJsonLd({ modelName, category, displacementCc, powerHp, sparkPlug, carbSettings, url }) {
  const carbH = (carbSettings && carbSettings.H) || 'Niet vastgesteld';
  const carbL = (carbSettings && carbSettings.L) || 'Niet vastgesteld';
  const carbLA = (carbSettings && carbSettings.LA) || 'Niet vastgesteld';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        'headline': `${modelName} Specificaties, Bouwjaar & Serienummer Decodering`,
        'description': `Complete technische specificaties, carburateur basisafstelling (${carbH} / ${carbL}) en serienummer herkenning voor de STIHL ${modelName}.`,
        'url': url,
        'inLanguage': 'nl-NL'
      },
      {
        '@type': 'Product',
        'name': `STIHL ${modelName}`,
        'category': category || 'Tuinmachine',
        'description': `STIHL ${modelName} ${category || 'machine'} met alleen documenteerbare specificaties uit de beschikbare brondata.`,
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
            'name': `Waar vind ik het serienummer van de STIHL ${modelName}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Het serienummer van de STIHL ${modelName} staat ingeslagen in het gietmetaal van het carter boven de uitlaat of nabij het geleideblad.`
            }
          },
          {
            '@type': 'Question',
            'name': `Wat is de standaard carburateurafstelling voor de STIHL ${modelName}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Standaard basisafstelling: H-schroef: ${carbH}, L-schroef: ${carbL}, LA-schroef: ${carbLA}.`
            }
          }
        ]
      }
    ]
  };
}
