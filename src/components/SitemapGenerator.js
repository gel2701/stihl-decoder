/**
 * Programmatic XML Sitemap & Robots.txt Generator
 */

export function generateSitemapXml(baseUrl = 'https://stihldecoder.nl', database = {}) {
  const models = database.models || [];
  const guides = database.guides || [];

  const staticRoutes = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/modellen', priority: '0.9', changefreq: 'weekly' }
  ];

  const guideRoutes = guides.map(g => ({
    loc: `/gidsen/${g.slug}`,
    priority: '0.9',
    changefreq: 'monthly'
  }));

  const modelRoutes = models.map(m => {
    const categorySlug = m.category_slug || 'kettingzagen';
    const slug = m.slug || (m.model_name || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      loc: `/modellen/${categorySlug}/${slug}`,
      priority: '0.8',
      changefreq: 'weekly'
    };
  });

  const allRoutes = [...staticRoutes, ...guideRoutes, ...modelRoutes];

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
