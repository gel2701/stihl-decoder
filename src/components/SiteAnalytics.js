/**
 * Site-wide GA4 consent updates + click tracking for STIHLDecoder.nl.
 * The Google tag itself is injected directly into every HTML <head>.
 */
(() => {
  const CONSENT_KEY = 'stihl_cookie_consent';
  const testMode = window.__stihlTestMode === true;

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
    try {
      var isSecure = window.location.protocol === 'https:';
      var secureFlag = isSecure ? '; Secure' : '';
      document.cookie = CONSENT_KEY + '=' + encodeURIComponent(value) + '; Path=/; SameSite=Lax; Max-Age=31536000' + secureFlag;
    } catch (e) {}
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  function updateAnalyticsConsent(granted) {
    if (testMode) return;
    ensureGtag();
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }

  // Microsoft Clarity is session-recording analytics: load only after explicit consent.
  const CLARITY_PROJECT_ID = 'zc7idfdot7';
  let clarityLoaded = false;

  function loadClarityWithConsent() {
    if (testMode || clarityLoaded || getConsent() !== 'granted') return;
    if (document.querySelector('script[data-stihl-clarity]')) return;
    clarityLoaded = true;
    window.clarity = window.clarity || function() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + CLARITY_PROJECT_ID;
    script.dataset.stihlClarity = CLARITY_PROJECT_ID;
    document.head.appendChild(script);
  }

  window.initGoogleAnalytics = function initGoogleAnalytics() {
    setConsent('granted');
    updateAnalyticsConsent(true);
    loadClarityWithConsent();
  };

  window.trackStihlEvent = function trackStihlEvent(eventName, params = {}) {
    if (!testMode && getConsent() === 'granted' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        ...params,
        transport_type: 'beacon'
      });
    }
  };

  if (!window.handleAffiliateClick) {
    window.handleAffiliateClick = function handleAffiliateClick(el, ev, data) {
      try {
        if (getConsent() !== 'granted') return;
        if (el && el.dataset && el.dataset.clickedRecently === '1') return;
        if (el && el.dataset) {
          el.dataset.clickedRecently = '1';
          setTimeout(function() { el.dataset.clickedRecently = '0'; }, 1200);
        }
        var isTest = window.location.search.indexOf('test=1') !== -1 || Boolean(data && data.is_test);
        var isMobile = /mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile/i.test(navigator.userAgent || '');
        var deviceType = isMobile ? 'mobile' : 'desktop';
        var placement = (data && data.placement) || ((data && data.product_verified) ? 'verified_product_card' : 'guide_content');
        var eventId = 'aff_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        var payload = JSON.stringify({
          event_id: eventId,
          provider: (data && data.provider) || 'amazon',
          marketplace: (data && data.marketplace) || 'amazon.nl',
          part_number: (data && data.part_number) || '',
          offer_type: (data && data.offer_type) || 'MANUAL_ASIN',
          match_type: (data && data.match_type) || 'MANUAL_ASIN',
          asin_if_known: (data && data.asin_if_known) || null,
          product_verified: Boolean(data && data.product_verified),
          destination_url: el ? el.href : null,
          page_path: window.location.pathname,
          placement: placement,
          device_type: deviceType,
          is_mobile: isMobile,
          is_test: isTest ? 1 : 0
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/affiliate/track', new Blob([payload], { type: 'application/json' }));
        } else if (window.fetch) {
          window.fetch('/api/affiliate/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
          }).catch(function() {});
        }
      } catch (err) {}
    };
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
    if (testMode || getConsent() !== 'granted' || typeof window.gtag !== 'function') return;

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
          <span style="color:#a3a3a3">De Google-tag is actief in beperkte consentmodus. Google Analytics en Microsoft Clarity (klikgedrag en sessieopnamen) worden pas na uw toestemming geactiveerd. Externe links naar Amazon kunnen cookies van derden plaatsen. Lees ons <a href="/privacy" style="color:#f97316;text-decoration:underline">privacy- en cookiebeleid</a>.</span>
        </div>
        <div style="display:flex;gap:8px;margin-left:auto">
          <button id="cookie-reject-btn" type="button" style="border:1px solid #404040;background:#262626;color:#f5f5f5;border-radius:10px;padding:8px 13px;font-weight:700;cursor:pointer">Weigeren</button>
          <button id="cookie-accept-btn" type="button" style="border:1px solid #c2410c;background:#c2410c;color:#fff;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">Accepteren</button>
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
    if (consent) {
      try {
        var isSecure = window.location.protocol === 'https:';
        var secureFlag = isSecure ? '; Secure' : '';
        document.cookie = CONSENT_KEY + '=' + encodeURIComponent(consent) + '; Path=/; SameSite=Lax; Max-Age=31536000' + secureFlag;
      } catch (e) {}
    }

    updateAnalyticsConsent(consent === 'granted');
    if (consent === 'granted') loadClarityWithConsent();

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
