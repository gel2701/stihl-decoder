/**
 * Centralized Affiliate Link Component for STIHLDecoder.nl
 * Phase 28 Affiliate-Ready Architecture
 */

export function renderAffiliateLink({ partName, partNumber, category }) {
  // Safe placeholder structure for future affiliate partner integration
  const affiliateUrl = `https://stihldecoder.nl/onderdeelnummer/?part=${encodeURIComponent(partNumber)}&ref=stihldecoder`;

  return `
    <a 
      href="${affiliateUrl}" 
      rel="nofollow sponsored noopener" 
      target="_blank" 
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 font-bold text-2xs transition group"
      onclick="if(window.trackStihlEvent){window.trackStihlEvent('affiliate_click', {partNumber: '${partNumber}', category: '${category}'});}"
    >
      <span>Zoek ${partName}</span>
      <span class="group-hover:translate-x-0.5 transition-transform">→</span>
    </a>
  `;
}
