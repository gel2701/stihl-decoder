/**
 * Privacy Policy & Cookie Statement SSR Template for STIHLDecoder.nl
 * Phase 59B — Amazon Associates Compliance, Cookie Transparency & Privacy Information
 */

import { PRIMARY_ORIGIN } from '../config.js';
import { renderBreadcrumbsHtml } from './Breadcrumbs.js';
import { renderSeoMeta } from './SeoMeta.js';
import { AMAZON_ASSOCIATES_DISCLOSURE_EN, AMAZON_ASSOCIATES_DISCLOSURE_NL } from '../affiliate/AffiliateDisclosure.js';

export function renderPrivacyPolicyHtml(baseUrl = PRIMARY_ORIGIN) {
  const canonicalUrl = `${baseUrl}/privacy/`;

  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Privacy- & Cookiebeleid', url: '/privacy/' }
  ];

  const breadcrumbsHtml = renderBreadcrumbsHtml(breadcrumbs);

  const seoMetaHtml = renderSeoMeta({
    title: 'Privacy- & Cookiebeleid | STIHLDecoder.nl',
    description: 'Informatie over privacy, cookies, gegevensverwerking en deelname aan het Amazon Associates partnerprogramma op STIHLDecoder.nl.',
    canonicalUrl,
    ogType: 'website',
    robotsContent: 'noindex, follow'
  });

  return `<!DOCTYPE html>
<html lang="nl" class="dark">
<head>
  ${seoMetaHtml}
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/tailwind.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
  <header class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-orange-600/30">
          S
        </div>
        <div>
          <span class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            STIHL Decoder
            <span class="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Privacy & Juridisch</span>
          </span>
          <p class="text-xs text-gray-400">Transparantie, Cookies & Affiliatebeleid</p>
        </div>
      </a>
      <a href="/" class="text-xs text-orange-400 font-bold hover:underline">← Terug naar Home</a>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
    ${breadcrumbsHtml}

    <header class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
          Wettelijke Informatie
        </span>
        <span class="text-xs text-gray-400">Laatst bijgewerkt: oktober 2026</span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        Privacy- & Cookiebeleid
      </h1>
      <p class="text-sm text-gray-300 leading-relaxed max-w-3xl">
        Op deze pagina lichten wij toe hoe STIHLDecoder.nl omgaat met gegevensbescherming, cookies, functionele opslag en deelname aan externe partnerprogramma's zoals Amazon Associates.
      </p>
    </header>

    <!-- 1. Onafhankelijkheid & Doel -->
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span>1. Over StihlDecoder.nl & Onafhankelijkheid</span>
      </h2>
      <p class="text-sm text-gray-300 leading-relaxed">
        STIHLDecoder.nl is een onafhankelijke informatieve tool voor doe-het-zelvers, reparateurs, hoveniers en verzamelaars. StihlDecoder.nl is op geen enkele wijze gelieerd aan, gesponsord door of goedgekeurd door <strong>ANDREAS STIHL AG & Co. KG</strong> of haar dochterondernemingen. Alle merk- en modelnamen zijn het eigendom van de respectieve merkhouders.
      </p>
      <p class="text-sm text-gray-300 leading-relaxed">
        U kunt onze website volledig anoniem bezoeken. Wij vereisen geen account, geen registratie en verzamelen geen persoonsgegevens zoals namen, e-mailadressen of betalingsgegevens.
      </p>
    </article>

    <!-- 2. Amazon Associates Programma -->
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span>2. Amazon Associates Partnerprogramma & Affiliatelinks</span>
      </h2>
      <div class="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-amber-200 text-xs space-y-2">
        <p class="font-bold text-orange-400 text-sm">
          Officiële Amazon Partnerverklaring:
        </p>
        <p class="font-mono text-white text-xs">
          "${AMAZON_ASSOCIATES_DISCLOSURE_EN}"
        </p>
        <p class="text-gray-300 text-2xs">
          Nederlands: "${AMAZON_ASSOCIATES_DISCLOSURE_NL}"
        </p>
      </div>
      <p class="text-sm text-gray-300 leading-relaxed">
        StihlDecoder.nl neemt deel aan het <strong>Amazon Associates-programma</strong> (waaronder Amazon EU Associates voor o.a. Amazon.nl en Amazon.de). Dit is een affiliate-advertentieprogramma dat websites de mogelijkheid biedt om advertentiekosten te verdienen door te linken naar Amazon.nl, Amazon.de en gerelateerde Amazon-marktplaatsen.
      </p>
      <div class="space-y-2 text-sm text-gray-300">
        <h3 class="font-bold text-white text-base">Hoe werken de Amazon-links op deze website?</h3>
        <ul class="list-disc list-inside space-y-1.5 text-xs text-gray-300">
          <li><strong>Directe uitgaande links:</strong> Wanneer u op een knop klikt zoals "Zoek op Amazon.nl", navigeert uw browser via een directe link naar Amazon (<code class="text-orange-400 font-mono text-3xs">rel="sponsored nofollow noopener"</code>). Er vindt geen verhullende redirect plaats.</li>
          <li><strong>Onderdeelnummers en zoekopdrachten:</strong> De zoekopdracht bevat het betreffende STIHL OEM-referentienummer. De zoekresultaten op Amazon kunnen zowel originele STIHL-onderdelen als compatibele aftermarket-onderdelen van derden tonen. Controleer op de Amazon-productpagina altijd de geschiktheid voor uw machinemodel.</li>
          <li><strong>Geen meerkosten:</strong> Wanneer u na het doorklikken een aankoop doet op Amazon, kost dit u niets extra. De prijs is exact hetzelfde als wanneer u direct naar Amazon zou gaan.</li>
          <li><strong>Cookies van derden op Amazon:</strong> Door op een link naar Amazon te klikken, verlaat u StihlDecoder.nl. Amazon kan op haar eigen domein cookies plaatsen om een eventuele aankoop binnen de commissietermijn toe te wijzen. StihlDecoder.nl plaatst deze cookies niet en heeft geen inzage in uw bestellingen of persoonlijke accountgegevens bij Amazon. Raadpleeg het privacy- en cookiebeleid van Amazon voor meer informatie.</li>
        </ul>
      </div>
    </article>

    <!-- 3. Cookies & Google Analytics -->
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span>3. Cookies & Analytische Metingen</span>
      </h2>
      <p class="text-sm text-gray-300 leading-relaxed">
        Wij respecteren uw privacy en hanteren de Europese ePrivacy- en AVG-richtlijnen:
      </p>
      <div class="space-y-3 text-xs text-gray-300">
        <div class="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <h4 class="font-bold text-white text-sm mb-1">Functionele cookies &amp; Lokale opslag (Noodzakelijk)</h4>
          <p class="text-gray-400 leading-relaxed">
            Functionele cookies en lokale browser-opslag (<code class="text-amber-400 font-mono text-3xs">localStorage</code>) zijn strikt noodzakelijk voor de werking van de website en vereisen geen voorafgaande toestemming.
          </p>
          <ul class="list-disc list-inside mt-2 space-y-1 text-gray-400">
            <li><code class="text-gray-200 font-mono text-3xs">stihl_cookie_consent</code>: Onthoudt uw cookievoorkeur (toegestaan of geweigerd).</li>
            <li><code class="text-gray-200 font-mono text-3xs">stihl_saved_machines</code>: Bewaart uw machinepaspoort lokaal in uw eigen browser zonder dat dit ooit naar een server wordt verzonden.</li>
          </ul>
        </div>
        <div class="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <h4 class="font-bold text-white text-sm mb-1">Analytische cookies (Google Analytics, Consent Mode v2)</h4>
          <p class="text-gray-400 leading-relaxed">
            Standaard draait Google Analytics op deze site in een strikt beperkte consentmodus (<code class="text-amber-400 font-mono text-3xs">analytics_storage = 'denied'</code>). Analytische cookies worden pas geplaatst en opslag wordt pas ingeschakeld wanneer u expliciet toestemming geeft via de cookiebanner of onderstaande knoppen.
          </p>
        </div>
        <div class="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <h4 class="font-bold text-white text-sm mb-1">Amazon Affiliate &amp; Externe Links (Cookies van derden)</h4>
          <p class="text-gray-400 leading-relaxed">
            Wanneer u besluit door te klikken naar Amazon, verlaat u onze website. Amazon kan eigen tracking- en sessiecookies plaatsen conform het Amazon privacy- en cookiebeleid om eventuele kwalificerende aankopen toe te wijzen.
          </p>
        </div>
        </div>
        <div class="p-4 rounded-xl bg-gray-950/70 border border-gray-800">
          <h4 class="font-bold text-white text-sm mb-1">Privacy-vriendelijke affiliate klikmeting</h4>
          <p class="text-gray-400 leading-relaxed">
            Wanneer u op een uitgaande Amazon-link klikt, stuurt onze pagina een geaggregeerd signaal naar onze eigen server (<code class="text-amber-400 font-mono text-3xs">/api/affiliate/track</code>) om bij te houden welk onderdeelnummer gezocht is. Hierbij worden geen cookies geplaatst, geen IP-adressen opgeslagen en geen gebruikersprofielen opgebouwd.
          </p>
        </div>
      </div>
    </article>

    <!-- 4. Toestemming Beheren -->
    <article class="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-4">
      <h2 class="text-xl font-bold text-white flex items-center gap-2">
        <span>4. Cookie-instellingen Beheren of Intrekken</span>
      </h2>
      <p class="text-sm text-gray-300 leading-relaxed">
        U kunt uw cookiekeuze op elk gewenst moment wijzigen of intrekken met onderstaande knoppen:
      </p>
      <div class="flex flex-wrap items-center gap-3 pt-2">
        <button id="manage-cookie-accept" type="button" class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition text-xs shadow cursor-pointer">
          Toestemming Geven (Accepteren)
        </button>
        <button id="manage-cookie-reject" type="button" class="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold border border-neutral-700 transition text-xs cursor-pointer">
          Toestemming Weigeren / Intrekken
        </button>
        <span id="consent-status-display" class="text-xs font-mono text-gray-400 pl-2"></span>
      </div>
    </article>
  </main>

  <footer class="border-t border-gray-800 bg-gray-950 py-8 text-center text-xs text-gray-500 mt-12">
    <div class="max-w-6xl mx-auto px-4 space-y-3">
      <p class="font-medium text-gray-400">STIHL Machine & Serienummer Decoder Tool</p>
      <p class="text-2xs text-gray-400">
        ${AMAZON_ASSOCIATES_DISCLOSURE_EN} (${AMAZON_ASSOCIATES_DISCLOSURE_NL})
      </p>
      <p class="max-w-3xl mx-auto text-gray-500 text-2xs leading-relaxed">
        <strong>Disclaimer:</strong> STIHLDecoder.nl is een onafhankelijk informatief hulpmiddel. Niet gelieerd aan, goedgekeurd door of gesponsord door ANDREAS STIHL AG & Co. KG.
      </p>
    </div>
  </footer>

  <script>
    (function() {
      const display = document.getElementById('consent-status-display');
      function updateDisplay() {
        const c = localStorage.getItem('stihl_cookie_consent');
        if (display) {
          display.textContent = 'Huidige status: ' + (c ? (c === 'granted' ? 'Toegestaan (granted)' : 'Geweigerd (denied)') : 'Niet ingesteld');
        }
      }
      updateDisplay();

      document.getElementById('manage-cookie-accept')?.addEventListener('click', function() {
        localStorage.setItem('stihl_cookie_consent', 'granted');
        if (typeof gtag === 'function') {
          gtag('consent', 'update', { analytics_storage: 'granted' });
        }
        updateDisplay();
        alert('Cookie-toestemming is opgeslagen als toegestaan.');
      });

      document.getElementById('manage-cookie-reject')?.addEventListener('click', function() {
        localStorage.setItem('stihl_cookie_consent', 'denied');
        if (typeof gtag === 'function') {
          gtag('consent', 'update', { analytics_storage: 'denied' });
        }
        updateDisplay();
        alert('Cookie-toestemming is ingetrokken / geweigerd.');
      });
    })();
  </script>
</body>
</html>`;
}
