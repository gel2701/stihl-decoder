/**
 * Reusable Centralized Affiliate Disclosure Component for STIHLDecoder.nl
 * Phase 54A / Phase 59B — Amazon Associates Compliance, Transparency & Legal Notice
 */

export const AMAZON_ASSOCIATES_DISCLOSURE_EN =
  'As an Amazon Associate I earn from qualifying purchases.';

export const AMAZON_ASSOCIATES_DISCLOSURE_NL =
  'Als Amazon-partner verdien ik aan kwalificerende aankopen.';

export const AFFILIATE_DISCLOSURE_TEXT =
  'Sommige links op deze pagina zijn affiliatelinks. Als je via zo\'n link iets koopt, kan StihlDecoder een commissie ontvangen. Dit kost jou niets extra.';

export const AFFILIATE_INDEPENDENCE_TEXT =
  'StihlDecoder is een onafhankelijke informatieservice en is niet gelieerd aan ANDREAS STIHL AG & Co. KG of Amazon.';

export const OEM_AFTERMARKET_NOTICE =
  'Onderdeelnummers betreffen officiële STIHL OEM-referenties. Zoekresultaten op Amazon kunnen zowel originele onderdelen als compatibele aftermarket-vervangingsonderdelen van derden tonen. Controleer altijd op de productpagina de specificaties en compatibiliteit met uw machinemodel.';

/**
 * Renders semantic, accessible HTML disclosure block for commercial sections.
 * @param {Object} [options]
 * @param {string} [options.className]
 * @returns {string} HTML snippet
 */
export function renderAffiliateDisclosureHtml(options = {}) {
  const extraClass = options.className ? ` ${options.className}` : '';

  return `
    <div class="rounded-xl bg-gray-900/80 border border-gray-700/80 p-4 text-xs text-gray-300 space-y-2.5${extraClass}" role="note" aria-label="Affiliate mededeling en transparantie">
      <div class="flex items-center gap-2 font-semibold text-white">
        <svg class="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Transparantie & Affiliate mededeling</span>
      </div>
      <p class="font-medium text-amber-300/90 text-2xs leading-relaxed">
        <strong>Amazon-partnervermelding:</strong> ${AMAZON_ASSOCIATES_DISCLOSURE_EN} (${AMAZON_ASSOCIATES_DISCLOSURE_NL})
      </p>
      <p class="text-gray-300 text-2xs leading-relaxed">
        ${AFFILIATE_DISCLOSURE_TEXT}
      </p>
      <p class="text-gray-400 text-3xs leading-relaxed border-t border-gray-800 pt-2">
        <strong class="text-gray-300">OEM & Aftermarket:</strong> ${OEM_AFTERMARKET_NOTICE}
      </p>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between text-gray-500 text-3xs leading-relaxed pt-1 gap-1">
        <span>${AFFILIATE_INDEPENDENCE_TEXT}</span>
        <a href="/privacy" class="text-orange-400 hover:text-orange-300 underline font-medium flex-shrink-0">Privacy- & Cookiebeleid →</a>
      </div>
    </div>
  `.trim();
}
