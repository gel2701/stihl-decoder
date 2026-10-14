/**
 * Reusable Centralized Affiliate Disclosure Component for STIHLDecoder.nl
 * Phase 54A — Honest Commercial Transparency & Compliance
 */

export const AFFILIATE_DISCLOSURE_TEXT =
  'Sommige links op deze pagina zijn affiliatelinks. Als je via zo\'n link iets koopt, kan StihlDecoder een commissie ontvangen. Dit kost jou niets extra.';

export const AFFILIATE_INDEPENDENCE_TEXT =
  'StihlDecoder is een onafhankelijke informatieservice en is niet gelieerd aan ANDREAS STIHL AG & Co. KG of Amazon.';

/**
 * Renders semantic, accessible HTML disclosure block for commercial sections.
 * @param {Object} [options]
 * @param {string} [options.className]
 * @returns {string} HTML snippet
 */
export function renderAffiliateDisclosureHtml(options = {}) {
  const extraClass = options.className ? ` ${options.className}` : '';

  return `
    <div class="rounded-xl bg-gray-900/60 border border-gray-800 p-3.5 text-2xs text-gray-400 space-y-1.5${extraClass}" role="note" aria-label="Affiliate mededeling">
      <div class="flex items-center gap-1.5 font-semibold text-gray-300">
        <svg class="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Transparantie & Affiliate mededeling</span>
      </div>
      <p class="leading-relaxed">
        ${AFFILIATE_DISCLOSURE_TEXT}
      </p>
      <p class="text-gray-500 text-3xs leading-relaxed">
        ${AFFILIATE_INDEPENDENCE_TEXT}
      </p>
    </div>
  `.trim();
}
