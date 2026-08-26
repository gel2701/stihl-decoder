/**
 * Dynamic Sitemap.xml & Robots.txt Generator for STIHLDecoder.nl
 * Phase 30 Strategic 5 Models & Troubleshooting Guides Integration
 */

export function generateSitemapXml(baseUrl = 'https://stihldecoder.nl', database = {}) {
  const models = database.models || [];
  const intentPages = database.intent_pages || [];
  const guides = database.guides || [];

  const categories = ['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen', 'doorslijpers'];
  const comparisons = ['ms-260-vs-ms-261', 'ms-361-vs-ms-362', 'ms-170-vs-ms-180'];

  const urls = [];

  // 1. Homepage
  urls.push({ loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' });

  // 2. Category Hub Landing Pages
  categories.forEach(cat => {
    urls.push({ loc: `${baseUrl}/${cat}/`, priority: '0.9', changefreq: 'weekly' });
  });

  // 3. Model Pages & Model Parts Pages
  models.forEach(m => {
    const catSlug = m.category_slug || 'kettingzagen';
    const mSlug = m.slug || m.id.replace(/_/g, '-');
    urls.push({ loc: `${baseUrl}/${catSlug}/${mSlug}/`, priority: '0.8', changefreq: 'weekly' });
    urls.push({ loc: `${baseUrl}/${catSlug}/${mSlug}/onderdelen/`, priority: '0.7', changefreq: 'weekly' });
  });

  // 4. Comparison Pages
  comparisons.forEach(comp => {
    urls.push({ loc: `${baseUrl}/vergelijk/${comp}/`, priority: '0.8', changefreq: 'weekly' });
  });

  // 5. Intent Landing Pages
  intentPages.forEach(ip => {
    urls.push({ loc: `${baseUrl}/${ip.slug}/`, priority: '0.8', changefreq: 'monthly' });
  });

  // 6. Guides
  guides.forEach(g => {
    urls.push({ loc: `${baseUrl}/gidsen/${g.slug}/`, priority: '0.7', changefreq: 'monthly' });
  });

  // 7. Parts Hub
  urls.push({ loc: `${baseUrl}/onderdeelnummer/`, priority: '0.7', changefreq: 'monthly' });

  // Build XML string
  const urlXml = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlXml}
</urlset>`;
}

export function generateRobotsTxt(baseUrl = 'https://stihldecoder.nl') {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml`;
}
