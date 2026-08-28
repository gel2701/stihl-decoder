/**
 * Centralized SEO Meta Tag Builder for STIHLDecoder.nl
 */

export function renderSeoMeta({ title, description, canonicalUrl, ogType = 'website', jsonLdData }) {
  const defaultTitle = 'STIHL Serienummer & Bouwjaar Decoder | STIHLDecoder';
  const defaultDesc = 'Controleer het 9-cijferige serienummer van uw STIHL machine en bekijk de zichtbare bronstatus van modeldata, zonder ongefundeerde model- of bouwjaarclaims.';
  
  const metaTitle = title || defaultTitle;
  const metaDesc = description || defaultDesc;
  const canonical = canonicalUrl || 'https://www.stihldecoder.nl/';

  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${metaTitle}</title>
    <meta name="description" content="${metaDesc}">
    <link rel="canonical" href="${canonical}">
    <meta name="robots" content="index, follow">

    <!-- Favicon & Web App Branding Assets -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">

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
