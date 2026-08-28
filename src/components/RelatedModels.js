/**
 * Database-driven Related Models Resolver & Component
 */

import { getFuelDriveLabel, getSafeModelPath } from '../publicationRules.js';

export function getRelatedModels(targetModel, database) {
  if (!targetModel || !database || !database.models) return [];

  const allModels = database.models;

  return allModels
    .filter(m => m.id !== targetModel.id)
    .map(m => {
      let score = 0;
      // 1. Exact Category match (+10 pts)
      if (m.category_slug === targetModel.category_slug || m.category === targetModel.category) score += 10;
      
      // 2. Exact Series Code match (+8 pts)
      if (m.series_code && targetModel.series_code && m.series_code === targetModel.series_code) score += 8;

      // 3. Similar Displacement (+/- 15cc) (+5 pts)
      if (m.displacement_cc && targetModel.displacement_cc) {
        const diff = Math.abs(m.displacement_cc - targetModel.displacement_cc);
        if (diff <= 15) score += 5;
        if (diff <= 5) score += 3;
      }

      // 4. Same Fuel Type (+3 pts)
      if (m.fuel_type === targetModel.fuel_type) score += 3;

      return { model: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.model);
}

export function renderRelatedModelsHtml(relatedModels) {
  if (!relatedModels || relatedModels.length === 0) return '';

  const cards = relatedModels.map(m => {
    const url = getSafeModelPath(m);
    if (!url) {
      return '';
    }

    return `
      <a href="${url}" class="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-orange-500/50 p-4 rounded-xl transition flex flex-col justify-between space-y-2 group">
        <div>
          <span class="text-3xs font-mono uppercase text-orange-400 font-bold tracking-wider block">${m.category}</span>
          <h4 class="text-base font-bold text-white group-hover:text-orange-400 transition mt-0.5">${m.model_name}</h4>
        </div>
        <div class="text-2xs text-gray-400 flex items-center justify-between pt-2 border-t border-gray-800/60">
          <span>${m.displacement_cc ? m.displacement_cc + ' cc' : getFuelDriveLabel(m)}</span>
          <span class="font-bold text-gray-300">${m.power_hp ? m.power_hp + ' pk' : '-'}</span>
        </div>
      </a>
    `;
  }).filter(Boolean).join('');

  if (!cards) return '';

  return `
    <section class="space-y-4 pt-6 border-t border-gray-800">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold text-white flex items-center gap-2">
          Vergelijkbare STIHL Modellen
        </h3>
        <span class="text-xs text-gray-400">Relevante modelklasse</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${cards}
      </div>
    </section>
  `;
}
