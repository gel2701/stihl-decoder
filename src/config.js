/**
 * Central Site Configuration & Base Origin Source of Truth for STIHLDecoder.nl
 * Phase 31C Single Canonical Host Architecture
 */

export const PRIMARY_HOST = 'stihldecoder.nl';
export const PRIMARY_ORIGIN = `https://${PRIMARY_HOST}`;
export const SITE_URL = process.env.SITE_URL || PRIMARY_ORIGIN;

export function buildCanonicalUrl(pathStr = '') {
  const cleanPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
  return `${PRIMARY_ORIGIN}${cleanPath}`;
}
