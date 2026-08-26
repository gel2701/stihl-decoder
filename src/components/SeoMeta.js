/**
 * Centralized SEO Meta Tag Builder for STIHLDecoder.nl
 */

export function renderSeoMeta({ title, description, canonicalUrl, ogType = 'website', jsonLdData }) {
  const defaultTitle = 'STIHL Serienummer & Bouwjaar Decoder | STIHLDecoder';
  const defaultDesc = 'Controleer het 9-cijferige serienummer van uw STIHL kettingzaag, bosmaaier of bladblazer. Bepaal fabriek van herkomst, geschatte productieperiode, bougie en carburateurafstelling.';
  
  const metaTitle = title || defaultTitle;
  const metaDesc = description || defaultDesc;
  const canonical = canonicalUrl || 'https://stihldecoder.nl/';

  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metaTitle}</title>
    <meta name="description" content="${metaDesc}">
    <link rel="canonical" href="${canonical}">
    <meta name="robots" content="index, follow">

    <!-- Open Graph Tags -->
    <meta property="og:title" content="${metaTitle}">
    <meta property="og:description" content="${metaDesc}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:locale" content="nl_NL">
    <meta property="og:site_name" content="STIHLDecoder.nl">

    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${metaTitle}">
    <meta name="twitter:description" content="${metaDesc}">

    ${jsonLdData ? `<script type="application/ld+json">${JSON.stringify(jsonLdData)}</script>` : ''}
  `;
}
