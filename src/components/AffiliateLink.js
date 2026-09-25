/**
 * Internal parts guide navigation CTA for STIHLDecoder.nl.
 * Phase 49A — Honest navigation without fake live search claims.
 */

export function renderAffiliateLink({ partName, partNumber = null, category }) {
  const href = '/onderdeelnummer/';
  const safePartNumber = typeof partNumber === 'string' && partNumber.trim() ? partNumber.trim() : null;

  return `
    <a
      href="${href}"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 font-bold text-2xs transition group"
      ${safePartNumber ? `data-part-number="${safePartNumber.replace(/"/g, '&quot;')}"` : ''}
      onclick="if(window.trackStihlEvent){window.trackStihlEvent('part_guide_view', {partNumber: ${safePartNumber ? `'${safePartNumber}'` : 'null'}, category: '${category}'});}"
    >
      <span>${safePartNumber ? `Onderdeel ${safePartNumber}` : 'Bekijk onderdeelnummergids'}</span>
      <span class="group-hover:translate-x-0.5 transition-transform">→</span>
    </a>
  `;
}
