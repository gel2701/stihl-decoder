/**
 * Injects the Google tag + consent bootstrap + site analytics client into every HTML response.
 * The Google tag itself is present on every page so Tag Assistant can detect it immediately.
 * Analytics storage defaults to denied unless the visitor has previously granted consent.
 */

export const GA_MEASUREMENT_ID = 'G-P2V0J69LDX';

export const SITE_ANALYTICS_TAGS = `
  <script data-stihl-ga4-consent-bootstrap="1">
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    (function() {
      var analyticsConsent = 'denied';
      try {
        if (localStorage.getItem('stihl_cookie_consent') === 'granted') {
          analyticsConsent = 'granted';
        }
      } catch (e) {}
      window.gtag('consent', 'default', {
        analytics_storage: analyticsConsent,
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500
      });
    })();
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}" data-stihl-ga4="${GA_MEASUREMENT_ID}"></script>
  <script data-stihl-ga4-config="1">
    window.gtag('js', new Date());
    window.gtag('config', '${GA_MEASUREMENT_ID}', {
      anonymize_ip: true,
      page_path: window.location.pathname + window.location.search,
      page_location: window.location.href
    });
  </script>
  <script defer src="/src/components/SiteAnalytics.js" data-stihl-site-analytics="1"></script>`;

export function injectSiteAnalyticsIntoHtml(html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.includes('data-stihl-ga4-consent-bootstrap')) return html;

  if (html.includes('</head>')) {
    return html.replace(
      '</head>',
      `${SITE_ANALYTICS_TAGS}\n</head>`
    );
  }

  if (html.includes('</body>')) {
    return html.replace(
      '</body>',
      `${SITE_ANALYTICS_TAGS}\n</body>`
    );
  }

  return `${html}\n${SITE_ANALYTICS_TAGS}`;
}

export function installSiteAnalyticsResponseInjection(res) {
  if (!res || res.__siteAnalyticsInjectionInstalled) return;
  res.__siteAnalyticsInjectionInstalled = true;

  let writeHeadContentType = '';
  const originalWriteHead =
    typeof res.writeHead === 'function' ? res.writeHead.bind(res) : null;
  const originalEnd = res.end.bind(res);

  if (originalWriteHead) {
    res.writeHead = function writeHeadWithAnalyticsCapture(statusCode, statusMessageOrHeaders, maybeHeaders) {
      const headers =
        statusMessageOrHeaders && typeof statusMessageOrHeaders === 'object'
          ? statusMessageOrHeaders
          : (maybeHeaders && typeof maybeHeaders === 'object' ? maybeHeaders : null);

      const directContentType = headers
        ? (headers['Content-Type'] ?? headers['content-type'])
        : undefined;

      if (directContentType != null) {
        writeHeadContentType = String(directContentType).toLowerCase();
      } else {
        const stored = res.getHeader?.('Content-Type');
        if (stored != null) writeHeadContentType = String(stored).toLowerCase();
      }

      return originalWriteHead(statusCode, statusMessageOrHeaders, maybeHeaders);
    };
  }

  res.end = function endWithSiteAnalytics(chunk, encoding, callback) {
    const storedContentType = String(res.getHeader?.('Content-Type') || '').toLowerCase();
    const contentType = writeHeadContentType || storedContentType;

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
