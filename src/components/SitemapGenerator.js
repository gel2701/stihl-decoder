/**
 * Programmatic XML Sitemap & Robots.txt Generator
 */

export function generateSitemapXml(baseUrl = 'https://stihldecoder.nl', database = {}) {
  const models = database.models || [];
  
  const staticRoutes = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/modellen', priority: '0.9', changefreq: 'weekly' },
    { loc: '/kennisbank/stihl-bouwjaar-controleren', priority: '0.8', changefreq: 'monthly' },
    { loc: '/kennisbank/namaak-stihl-herkennen', priority: '0.8', changefreq: 'monthly' },
    { loc: '/kennisbank/stihl-onderdeelnummer-vergelijken', priority: '0.8', changefreq: 'monthly' }
  ];

  const modelRoutes = models.map(m => {
    const slug = (m.model_name || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      loc: `/modellen/stihl-${slug}`,
      priority: '0.8',
      changefreq: 'weekly'
    };
  });

  const allRoutes = [...staticRoutes, ...modelRoutes];

  const xmlUrls = allRoutes.map(r => `
  <url>
    <loc>${baseUrl}${r.loc}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlUrls}
</urlset>`;
}

export function generateRobotsTxt(baseUrl = 'https://stihldecoder.nl') {
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}
