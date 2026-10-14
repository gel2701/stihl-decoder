/**
 * Central Site Configuration & Base Origin Source of Truth for STIHLDecoder.nl
 * Aligned with Render Primary Domain: www.stihldecoder.nl
 */

export const PRIMARY_HOST = 'www.stihldecoder.nl';
export const PRIMARY_ORIGIN = `https://${PRIMARY_HOST}`;
export const SITE_URL = process.env.SITE_URL || PRIMARY_ORIGIN;

export function buildCanonicalUrl(pathStr = '') {
  const cleanPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
  return `${PRIMARY_ORIGIN}${cleanPath}`;
}

export function getTrustedDeploymentHosts() {
  const hosts = new Set([
    PRIMARY_HOST.toLowerCase(),
    'stihldecoder.nl',
    'www.stihldecoder.nl',
    'localhost',
    '127.0.0.1'
  ]);

  const activeSiteUrl = process.env.SITE_URL || SITE_URL;
  if (activeSiteUrl) {
    try {
      const u = new URL(activeSiteUrl.startsWith('http') ? activeSiteUrl : `https://${activeSiteUrl}`);
      if (u.hostname) hosts.add(u.hostname.toLowerCase());
    } catch {}
  }

  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    hosts.add(process.env.RENDER_EXTERNAL_HOSTNAME.trim().toLowerCase());
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    try {
      const u = new URL(process.env.RENDER_EXTERNAL_URL);
      if (u.hostname) hosts.add(u.hostname.toLowerCase());
    } catch {}
  }

  return hosts;
}
