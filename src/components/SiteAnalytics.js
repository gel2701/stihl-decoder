/**
 * Site-wide GA4 consent updates + click tracking for STIHLDecoder.nl.
 * The Google tag itself is injected directly into every HTML <head>.
 */
(() => {
  const CONSENT_KEY = 'stihl_cookie_consent';

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
      // Consent remains in-memory for this page if storage is unavailable.
    }
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  function updateAnalyticsConsent(granted) {
    ensureGtag();
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }

  window.initGoogleAnalytics = function initGoogleAnalytics() {
    setConsent('granted');
    updateAnalyticsConsent(true);
  };

  window.trackStihlEvent = function trackStihlEvent(eventName, params = {}) {
    if (getConsent() === 'granted' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        ...params,
        transport_type: 'beacon'
      });
    }
  };

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
          <span style="color:#a3a3a3">De Google-tag is actief in beperkte consentmodus. Analytische cookies en Analytics-opslag worden alleen ingeschakeld na uw toestemming.</span>
        </div>
        <div style="display:flex;gap:8px;margin-left:auto">
          <button id="cookie-reject-btn" type="button" style="border:1px solid #404040;background:#262626;color:#f5f5f5;border-radius:10px;padding:8px 13px;font-weight:700;cursor:pointer">Weigeren</button>
          <button id="cookie-accept-btn" type="button" style="border:1px solid #f97316;background:#ea580c;color:#fff;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">Accepteren</button>
        </div>
      </div>`;

    document.body.appendChild(banner);

    banner.querySelector('#cookie-accept-btn')?.addEventListener('click', () => {
      window.initGoogleAnalytics();
      banner.remove();
    });

    banner.querySelector('#cookie-reject-btn')?.addEventListener('click', () => {
      setConsent('denied');
      updateAnalyticsConsent(false);
      banner.remove();
    });
  }

  function boot() {
    const consent = getConsent();

    updateAnalyticsConsent(consent === 'granted');

    if (!consent && !document.getElementById('cookie-consent-banner')) {
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
