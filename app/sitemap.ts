export default async function sitemap() {
  const baseUrl = 'https://stihldecoder.nl';

  const models = [
    'stihl-ms-170',
    'stihl-ms-180',
    'stihl-026',
    'stihl-ms-261-c-m',
    'stihl-ms-362-c-m',
    'stihl-ms-500i',
    'stihl-ms-661-c-m',
    'stihl-br-600',
    'stihl-fs-130',
    'stihl-ts-420'
  ];

  const modelUrls = models.map(slug => ({
    url: `${baseUrl}/modellen/${slug}`,
    lastModified: new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: 0.8
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date().toISOString(),
      changeFrequency: 'daily' as const,
      priority: 1.0
    },
    {
      url: `${baseUrl}/modellen`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'weekly' as const,
      priority: 0.9
    },
    ...modelUrls
  ];
}
