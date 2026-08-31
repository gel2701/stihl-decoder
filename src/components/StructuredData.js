/**
 * Centralized Schema.org Structured Data Engine for STIHLDecoder.nl
 * Phase 34 SEO Integrity & Structured Data Hardening
 */

import { PRIMARY_ORIGIN } from '../config.js';
import { getSerialLocationAnswer, getSafeCategorySlug, shouldPublishProductSchema } from '../publicationRules.js';

function buildSafeProductProperties(publicEvidenceFields = {}) {
  const properties = [];
  const addProperty = (name, field, formatter = (value, unit) => unit ? `${value} ${unit}` : `${value}`) => {
    const entry = publicEvidenceFields[field];
    if (!entry || !entry.single_value_eligible || entry.value == null) return;
    properties.push({
      '@type': 'PropertyValue',
      'name': name,
      'value': formatter(entry.value, entry.unit)
    });
  };

  addProperty('Motorinhoud', 'displacement_cc', (value) => `${value} cc`);
  addProperty('Vermogen', 'power_kw', (value) => `${value} kW`);
  addProperty('Cilinderboring', 'bore_mm', (value) => `${value} mm`);
  addProperty('Slag', 'stroke_mm', (value) => `${value} mm`);
  addProperty('Stationair toerental', 'idle_speed_rpm', (value) => `${value} rpm`);
  addProperty('Elektrodenafstand', 'electrode_gap_mm', (value) => `${value} mm`);
  addProperty('Brandstoftank', 'fuel_tank_l', (value) => `${value} l`);
  addProperty('Kettingolietank', 'oil_tank_l', (value) => `${value} l`);

  const sparkPlug = publicEvidenceFields.spark_plug;
  if (sparkPlug?.single_value_eligible && sparkPlug.value) {
    properties.push({
      '@type': 'PropertyValue',
      'name': 'Bougie',
      'value': sparkPlug.value
    });
  }

  return properties;
}

export function buildStructuredData({ pageType, model, guide, intent, publicEvidence = null, breadcrumbs = [], url }) {
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
    const categorySlug = getSafeCategorySlug(model);
    const publicEvidenceFields = publicEvidence?.fields || {};
    const safeProductProperties = buildSafeProductProperties(publicEvidenceFields);

    // TechArticle Schema
    graph.push({
      '@type': 'TechArticle',
      'headline': `STIHL ${model.model_name} Modeldata, bronstatus & serienummergids`,
      'description': `Bekijk de bekende modeldata van STIHL ${model.model_name} met zichtbare bronstatus en aanwijzingen voor serienummer- en typeplaatjecontrole.`,
      'url': canonicalUrl,
      'inLanguage': 'nl-NL'
    });

    const productGate = shouldPublishProductSchema(model);
    if (productGate.allowed && safeProductProperties.length > 0) {
      const descParts = [`STIHL ${model.model_name}`];
      if (publicEvidenceFields.displacement_cc?.single_value_eligible) {
        descParts.push(`met ${publicEvidenceFields.displacement_cc.value} cc motor`);
      } else if (model.battery_system || model.voltage_v) {
        descParts.push('met accu-aandrijving');
      }

      if (publicEvidenceFields.power_kw?.single_value_eligible) {
        descParts.push(`en ${publicEvidenceFields.power_kw.value} kW vermogen`);
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
        },
        'additionalProperty': safeProductProperties
      });
    }

    const faqs = [
      {
        '@type': 'Question',
        'name': `Hoe oud is mijn STIHL ${model.model_name}?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': `Voer het serienummer in voor formaat- en herkomstcontrole; gebruik daarnaast het typeplaatje om model en uitvoering van uw ${model.model_name} te bevestigen.`
        }
      },
      {
        '@type': 'Question',
        'name': `Waar vind ik het serienummer?`,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': getSerialLocationAnswer(categorySlug)
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
