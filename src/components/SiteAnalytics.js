/**
 * Site-wide GA4 bootstrap + consent-aware click tracking for STIHLDecoder.nl.
 * Loaded on every HTML response by SiteAnalyticsInjector.
 */
(() => {
  const GA_MEASUREMENT_ID = 'G-P2V0J69LDX';
  const CONSENT_KEY = 'stihl_cookie_consent';
  const existingInitGoogleAnalytics =
    typeof window.initGoogleAnalytics === 'function'
      ? window.initGoogleAnalytics.bind(window)
      : null;

  function getConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      return null;
    }
  }

  function setConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Analytics remains opt-in even when storage is unavailable.
    }
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
  }

  function loadGoogleAnalytics() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    ensureGtag();

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.setAttribute('data-stihl-ga4', GA_MEASUREMENT_ID);
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      anonymize_ip: true,
      page_path: window.location.pathname + window.location.search,
      page_location: window.location.href
    });
  }

  function initGoogleAnalytics() {
    if (window.__gaLoaded) return;
    if (existingInitGoogleAnalytics) {
      existingInitGoogleAnalytics();
      return;
    }
    loadGoogleAnalytics();
  }

  if (!existingInitGoogleAnalytics) {
    window.initGoogleAnalytics = initGoogleAnalytics;
  }

  function normalizedClickLabel(element) {
    const aria = element.getAttribute('aria-label');
    const title = element.getAttribute('title');
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    return (aria || title || text || element.id || element.tagName || 'unknown').slice(0, 120);
  }

  function normalizedLinkUrl(element) {
    if (!(element instanceof HTMLAnchorElement)) return '';
    const href = element.getAttribute('href');
    if (!href) return '';

    try {
      const url = new URL(href, window.location.href);
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return url.href;
    } catch {
      return href.slice(0, 500);
    }
  }

  function trackSiteClick(event) {
    if (getConsent() !== 'granted' || typeof window.gtag !== 'function') return;

    const origin = event.target;
    if (!(origin instanceof Element)) return;

    const element = origin.closest('a,button,[role="button"],input[type="button"],input[type="submit"]');
    if (!element) return;

    window.gtag('event', 'site_click', {
      event_category: 'engagement',
      element_type: element.tagName.toLowerCase(),
      element_id: (element.id || '').slice(0, 100),
      element_label: normalizedClickLabel(element),
      link_url: normalizedLinkUrl(element),
      page_path: window.location.pathname + window.location.search,
      transport_type: 'beacon'
    });
  }

  function createConsentBanner() {
    if (document.getElementById('cookie-consent-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Privacy en cookies');
    banner.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'bottom:0',
      'z-index:9999',
      'background:#0a0a0a',
      'color:#e5e7eb',
      'border-top:1px solid #262626',
      'padding:14px 16px',
      'box-shadow:0 -8px 30px rgba(0,0,0,.35)',
      'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:13px'
    ].join(';');

    banner.innerHTML = `
      <div style="max-width:1152px;margin:0 auto;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div style="max-width:760px">
          <strong style="display:block;color:#fff;margin-bottom:3px">Privacy & Cookies</strong>
          <span style="color:#a3a3a3">Wij gebruiken optionele Google Analytics-cookies om verkeer en interacties op STIHLDecoder.nl te meten. Analytics wordt alleen geladen na uw toestemming.</span>
        </div>
        <div style="display:flex;gap:8px;margin-left:auto">
          <button id="cookie-reject-btn" type="button" style="border:1px solid #404040;background:#262626;color:#f5f5f5;border-radius:10px;padding:8px 13px;font-weight:700;cursor:pointer">Weigeren</button>
          <button id="cookie-accept-btn" type="button" style="border:1px solid #f97316;background:#ea580c;color:#fff;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">Accepteren</button>
        </div>
      </div>`;

    document.body.appendChild(banner);

    banner.querySelector('#cookie-accept-btn')?.addEventListener('click', () => {
      setConsent('granted');
      banner.remove();
      initGoogleAnalytics();
    });

    banner.querySelector('#cookie-reject-btn')?.addEventListener('click', () => {
      setConsent('denied');
      banner.remove();
    });
  }

  function boot() {
    const consent = getConsent();

    if (consent === 'granted') {
      initGoogleAnalytics();
    } else if (!consent && !document.getElementById('cookie-consent-banner')) {
      createConsentBanner();
    }

    document.addEventListener('click', trackSiteClick, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
