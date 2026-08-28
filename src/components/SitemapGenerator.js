/**
 * Dynamic Sitemap.xml & Robots.txt Generator for STIHLDecoder.nl
 * Phase 34 SEO Integrity & Sitemap Hardening
 */

import { PRIMARY_ORIGIN } from '../config.js';

export function generateSitemapXml(baseUrl = PRIMARY_ORIGIN, database = {}) {
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
    const lastmod = m.content_updated_at || m.updated_at || null;
    urls.push({ loc: `${baseUrl}/${catSlug}/${mSlug}/`, priority: '0.8', changefreq: 'weekly', lastmod });
    urls.push({ loc: `${baseUrl}/${catSlug}/${mSlug}/onderdelen/`, priority: '0.7', changefreq: 'weekly', lastmod });
  });

  // 4. Comparison Pages
  comparisons.forEach(comp => {
    urls.push({ loc: `${baseUrl}/vergelijk/${comp}/`, priority: '0.8', changefreq: 'weekly' });
  });

  // 5. Intent Landing Pages
  intentPages.forEach(ip => {
    const lastmod = ip.updated_at || null;
    urls.push({ loc: `${baseUrl}/${ip.slug}/`, priority: '0.8', changefreq: 'monthly', lastmod });
  });

  // 6. Guides
  guides.forEach(g => {
    const lastmod = g.updated_at || null;
    urls.push({ loc: `${baseUrl}/gidsen/${g.slug}/`, priority: '0.7', changefreq: 'monthly', lastmod });
  });

  // 7. Parts Hub
  urls.push({ loc: `${baseUrl}/onderdeelnummer/`, priority: '0.7', changefreq: 'monthly' });

  // Build XML string with lastmod support only when authentic timestamp exists
  const urlXml = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlXml}
</urlset>`;
}

export function generateRobotsTxt(baseUrl = PRIMARY_ORIGIN) {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml`;
}
