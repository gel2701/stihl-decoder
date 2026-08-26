import { MetadataRoute } from 'next';
import { getAllModels, getAllGuides } from '../lib/database';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://stihldecoder.nl';
  const models = await getAllModels();
  const guides = await getAllGuides();

  const modelUrls = models.map((model) => ({
    url: `${baseUrl}/modellen/${model.categorySlug}/${model.slug}`,
    lastModified: new Date(model.updatedAt || Date.now()),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const guideUrls = guides.map((guide) => ({
    url: `${baseUrl}/gidsen/${guide.slug}`,
    lastModified: new Date(guide.updatedAt || Date.now()),
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    ...guideUrls,
    ...modelUrls,
  ];
}
