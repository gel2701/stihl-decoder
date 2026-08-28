/**
 * Internal parts-search CTA for STIHLDecoder.nl.
 * Uses descriptive search text unless a verified part number exists.
 */

export function renderAffiliateLink({ partName, partNumber = null, searchQuery = null, category }) {
  const href = '/onderdeelnummer/';
  const safePartNumber = typeof partNumber === 'string' && partNumber.trim() ? partNumber.trim() : null;
  const safeSearchQuery = typeof searchQuery === 'string' && searchQuery.trim() ? searchQuery.trim() : partName;

  return `
    <a
      href="${href}"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 font-bold text-2xs transition group"
      data-search-query="${safeSearchQuery.replace(/"/g, '&quot;')}"
      ${safePartNumber ? `data-part-number="${safePartNumber.replace(/"/g, '&quot;')}"` : ''}
      onclick="if(window.trackStihlEvent){window.trackStihlEvent('affiliate_click', {partNumber: ${safePartNumber ? `'${safePartNumber}'` : 'null'}, searchQuery: '${safeSearchQuery.replace(/'/g, "\\'")}', category: '${category}'});}"
    >
      <span>Zoek ${partName}</span>
      <span class="group-hover:translate-x-0.5 transition-transform">→</span>
    </a>
  `;
}
