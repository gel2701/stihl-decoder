/**
 * Injects the site-wide analytics client into every HTML response.
 * This keeps current and future SSR/static pages on one analytics path.
 */

export const SITE_ANALYTICS_SCRIPT_TAG =
  '<script defer src="/src/components/SiteAnalytics.js" data-stihl-site-analytics="1"></script>';

export function injectSiteAnalyticsIntoHtml(html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.includes('data-stihl-site-analytics')) return html;

  if (html.includes('</head>')) {
    return html.replace(
      '</head>',
      `  ${SITE_ANALYTICS_SCRIPT_TAG}\n</head>`
    );
  }

  if (html.includes('</body>')) {
    return html.replace(
      '</body>',
      `  ${SITE_ANALYTICS_SCRIPT_TAG}\n</body>`
    );
  }

  return `${html}\n${SITE_ANALYTICS_SCRIPT_TAG}`;
}

export function installSiteAnalyticsResponseInjection(res) {
  if (!res || res.__siteAnalyticsInjectionInstalled) return;
  res.__siteAnalyticsInjectionInstalled = true;

  const originalEnd = res.end.bind(res);

  res.end = function endWithSiteAnalytics(chunk, encoding, callback) {
    const contentType = String(res.getHeader?.('Content-Type') || '').toLowerCase();

    if (chunk != null && contentType.includes('text/html')) {
      const html = Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : (typeof chunk === 'string' ? chunk : null);

      if (html !== null) {
        chunk = injectSiteAnalyticsIntoHtml(html);
      }
    }

    return originalEnd(chunk, encoding, callback);
  };
}
