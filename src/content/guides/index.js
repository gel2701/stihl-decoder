/**
 * Central Content Registry for Knowledge Base Guides
 * Phase 49B — Knowledge Base Content Rebuild
 */

import { stihlKettingzaagStartNietGuide } from './stihl-kettingzaag-start-niet.js';
import { stihlCarburateurAfstellenGuide } from './stihl-carburateur-afstellen.js';
import { stihlMTronicResettenGuide } from './stihl-m-tronic-resetten.js';
import { stihlGietklokAflezenGuide } from './stihl-gietklok-aflezen.js';
import { namaakStihlHerkennenGuide } from './namaak-stihl-herkennen.js';

export const REBUILT_GUIDES = [
  stihlKettingzaagStartNietGuide,
  stihlCarburateurAfstellenGuide,
  stihlMTronicResettenGuide,
  stihlGietklokAflezenGuide,
  namaakStihlHerkennenGuide
];

export const REBUILT_GUIDES_MAP = new Map(
  REBUILT_GUIDES.map((g) => [g.slug, g])
);

export function getStructuredGuide(slug) {
  return REBUILT_GUIDES_MAP.get(slug) || null;
}

export function getAllStructuredGuides() {
  return [...REBUILT_GUIDES];
}
