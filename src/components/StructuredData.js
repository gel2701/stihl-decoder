/**
 * Centralized Schema.org Structured Data Engine for STIHLDecoder.nl
 * Phase 34 SEO Integrity & Structured Data Hardening
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

  // 2. WebSite & WebApplication Schemas (Homepage & Core Tool Pages)
  if (pageType === 'decoder' || pageType === 'home') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      'url': `${baseUrl}/`,
      'name': 'STIHLDecoder.nl',
      'alternateName': ['STIHL Decoder', 'stihldecoder.nl'],
      'inLanguage': 'nl-NL'
    });

    graph.push({
      '@type': 'WebApplication',
      'name': 'STIHLDecoder.nl — Serienummer & Machine Decoder',
      'url': `${baseUrl}/`,
      'applicationCategory': 'UtilitiesApplication',
      'operatingSystem': 'All',
      'browserRequirements': 'Requires JavaScript and HTML5 support',
      'description': 'Onafhankelijke online decoder voor serienummercontrole, typeplaatjecontrole en transparante bronstatus van STIHL modeldata.',
      'author': {
        '@type': 'Organization',
        'name': 'STIHLDecoder.nl',
        'url': `${baseUrl}/`
      }
    });
  }

  // 3. Model Page Schemas
  if (pageType === 'model' && model) {
    const categorySlug = model.category_slug || 'kettingzagen';
    const isBattery = model.fuel_type ? model.fuel_type.startsWith('BATTERY') : false;

    // TechArticle Schema
    graph.push({
      '@type': 'TechArticle',
      'headline': `STIHL ${model.model_name} Bouwjaar, Serienummer & Specificaties`,
      'description': `Bekijk de bekende modeldata van STIHL ${model.model_name} met zichtbare bronstatus en aanwijzingen voor serienummer- en typeplaatjecontrole.`,
      'url': canonicalUrl,
      'inLanguage': 'nl-NL'
    });

    // Product Schema Verification Gate (Addendum E & Rules 9, 10, 11)
    // Only generate Product node if record is verified OR has concrete verified specs
    const isVerifiedRecord = model.verification_status === 'MODEL_IDENTITY_VERIFIED' ||
                             model.data_status === 'PRIMARY_SOURCE_LINKED' ||
                             model.model_status === 'PRIMARY_SOURCE_LINKED' ||
                             Boolean(model.data_source || (model.provenance && model.provenance.source_title));
    const hasConcreteSpecs = Boolean(model.displacement_cc || model.power_hp || model.power_kw || isBattery);

    if (isVerifiedRecord && hasConcreteSpecs) {
      const descParts = [`STIHL ${model.model_name}`];
      if (model.displacement_cc) {
        descParts.push(`met ${model.displacement_cc} cc motor`);
      } else if (isBattery) {
        descParts.push('met accu-aandrijving');
      }

      if (model.power_hp) {
        descParts.push(`en ${model.power_hp} pk vermogen`);
      } else if (model.power_kw) {
        descParts.push(`en ${model.power_kw} kW vermogen`);
      }
      descParts.push('.');

      graph.push({
        '@type': 'Product',
        'name': `STIHL ${model.model_name}`,
        'category': model.category || 'Tuinmachine',
        'description': descParts.join(' '),
        'brand': {
          '@type': 'Brand',
          'name': 'STIHL'
        }
      });
    }

    // Category-Aware FAQ Schema matching visible HTML 1-to-1 (Rules 7, 8 & Addendum F)
    let serialLocationAnswer = 'De exacte locatie van het serienummer verschilt per model. Controleer het typeplaatje en de STIHL handleiding.';
    if (categorySlug === 'kettingzagen' || categorySlug === 'accu-kettingzagen') {
      serialLocationAnswer = 'Het serienummer staat ingeslagen in het metaal van het carter (nabij de uitlaat of kettinggeleidebevestiging) en op de sticker.';
    } else if (categorySlug === 'bosmaaiers') {
      serialLocationAnswer = 'Het serienummer staat op het motortypeplaatje of ingeslagen op het carter van de bosmaaier.';
    } else if (categorySlug === 'bladblazers') {
      serialLocationAnswer = 'Het serienummer bevindt zich op het motorblok of het typeplaatje van de bladblazer.';
    } else if (categorySlug === 'heggenscharen') {
      serialLocationAnswer = 'Het serienummer staat op het carter of typeplaatje van de heggenschaar.';
    } else if (categorySlug === 'doorslijpers') {
      serialLocationAnswer = 'Het serienummer staat ingeslagen op het motorhuis of typeplaatje van de doorslijper.';
    }

    const faqs = [
      {
        '@type': 'Question',
        'name': `Hoe oud is mijn STIHL ${model.model_name}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Voer het 9-cijferige serienummer in voor formaat- en herkomstcontrole; gebruik daarnaast het typeplaatje om model en uitvoering van uw ${model.model_name} te bevestigen.`
        }
      },
      {
        '@type': 'Question',
        'name': `Waar vind ik het 9-cijferige serienummer?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': serialLocationAnswer
        }
      }
    ];

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

  // 5. Intent Page Schemas
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
