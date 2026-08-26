/**
 * Programmatic XML Sitemap & Robots.txt Generator for STIHLDecoder.nl
 */

export function generateSitemapXml(baseUrl = 'https://stihldecoder.nl', database = {}) {
  const models = database.models || [];
  const guides = database.guides || [];
  const intentPages = database.intent_pages || [];

  const staticRoutes = [
    { loc: '/', priority: '1.0', changefreq: 'daily' }
  ];

  // Clean category model routes (e.g. /kettingzagen/ms-261/)
  const modelRoutes = models.map(m => {
    const categorySlug = m.category_slug || 'kettingzagen';
    const slug = m.slug || m.id.replace(/_/g, '-');
    return {
      loc: `/${categorySlug}/${slug}/`,
      priority: '0.8',
      changefreq: 'weekly'
    };
  });

  // Intent landing pages (e.g. /stihl-serienummer-decoder/, /stihl-bouwjaar/)
  const intentRoutes = intentPages.map(ip => ({
    loc: `/${ip.slug}/`,
    priority: '0.9',
    changefreq: 'weekly'
  }));

  // Guide pages
  const guideRoutes = guides.map(g => ({
    loc: `/gidsen/${g.slug}/`,
    priority: '0.8',
    changefreq: 'monthly'
  }));

  const allRoutes = [...staticRoutes, ...intentRoutes, ...guideRoutes, ...modelRoutes];

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
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
}
