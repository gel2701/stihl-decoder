/**
 * Centralized Schema.org Structured Data Engine for STIHLDecoder.nl
 */

import { PRIMARY_ORIGIN } from '../config.js';

export function buildStructuredData({ pageType, model, guide, intent, breadcrumbs = [], url }) {
  const baseUrl = PRIMARY_ORIGIN;
  const canonicalUrl = url || baseUrl;
  const graph = [];

  // 1. BreadcrumbList Schema (Every Page)
  if (breadcrumbs && breadcrumbs.length > 0) {
    graph.push({
      '@type': 'BreadcrumbList',
      'itemListElement': breadcrumbs.map((b, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': b.name,
        'item': b.url ? (b.url.startsWith('http') ? b.url : `${baseUrl}${b.url}`) : baseUrl
      }))
    });
  }

  // 2. WebApplication Schema (Decoder Homepage & Tool Pages)
  if (pageType === 'decoder' || pageType === 'home') {
    graph.push({
      '@type': 'WebApplication',
      'name': 'STIHL Serienummer & Machine Decoder',
      'url': baseUrl,
      'applicationCategory': 'UtilitiesApplication',
      'operatingSystem': 'All',
      'browserRequirements': 'Requires JavaScript and HTML5 support',
      'description': 'Onafhankelijke online decoder voor serienummercontrole, typeplaatjecontrole en transparante bronstatus van STIHL modeldata.',
      'author': {
        '@type': 'Organization',
        'name': 'STIHLDecoder.nl',
        'url': baseUrl
      }
    });
  }

  // 3. Model Page Schemas
  if (pageType === 'model' && model) {
    // TechArticle
    graph.push({
      '@type': 'TechArticle',
      'headline': `STIHL ${model.model_name} Bouwjaar, Serienummer & Specificaties`,
      'description': `Bekijk de bekende modeldata van STIHL ${model.model_name} met zichtbare bronstatus en aanwijzingen voor serienummer- en typeplaatjecontrole.`,
      'url': canonicalUrl,
      'inLanguage': 'nl-NL'
    });

    // Product Schema ONLY if reliable displacement or power data exists
    if (model.displacement_cc || model.power_hp || model.power_kw) {
      graph.push({
        '@type': 'Product',
        'name': `STIHL ${model.model_name}`,
        'category': model.category || 'Tuinmachine',
        'description': `STIHL ${model.model_name} met ${model.displacement_cc ? model.displacement_cc + ' cc' : 'accu-aandrijving'} en ${model.power_hp ? model.power_hp + ' pk' : '-'} vermogen.`,
        'brand': {
          '@type': 'Brand',
          'name': 'STIHL'
        }
      });
    }

    // Visible FAQs to FAQPage schema
    const faqs = [];
    faqs.push({
      '@type': 'Question',
      'name': `Waar staat het serienummer van de STIHL ${model.model_name}?`,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': `Het 9-cijferige serienummer van de STIHL ${model.model_name} staat ingeslagen in het gietmetaal van het carter (boven de uitlaat of bij de geleideplaatmontage) of op het typeplaatje.`
      }
    });

    if (model.carb_h_setting || model.carb_l_setting) {
      faqs.push({
        '@type': 'Question',
        'name': `Wat is de carburateur basisafstelling voor de STIHL ${model.model_name}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Bekende repositorywaarde voor STIHL ${model.model_name}: H-schroef: ${model.carb_h_setting || 'niet vastgesteld'}, L-schroef: ${model.carb_l_setting || 'niet vastgesteld'}, LA-schroef: ${model.carb_la_setting || 'niet vastgesteld'}. Controleer altijd de primaire handleiding of serviceliteratuur.`
        }
      });
    }

    graph.push({
      '@type': 'FAQPage',
      'mainEntity': faqs
    });
  }

  // 4. Guide / Article Page Schemas
  if (pageType === 'guide' && guide) {
    graph.push({
      '@type': 'TechArticle',
      'headline': guide.title,
      'description': guide.description,
      'url': canonicalUrl,
      'inLanguage': 'nl-NL'
    });
  }

  // 5. Intent Page Schemas (e.g. /stihl-bouwjaar/, /stihl-diefstalcheck/)
  if (pageType === 'intent' && intent) {
    graph.push({
      '@type': 'TechArticle',
      'headline': intent.title,
      'description': intent.description,
      'url': canonicalUrl,
      'inLanguage': 'nl-NL'
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
