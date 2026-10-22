/**
 * Interactive Exploded View / Schematic Callout Pilot for STIHLDecoder.nl
 * Phase 56G — Feasibility & Technical Prototype (max 3 pilot models: MS 261, MS 170, FS 55)
 *
 * ARCHITECTURAL & LEGAL INVARIANTS:
 * 1. Copyright safety: Zero third-party or OEM STIHL raster/CAD illustrations are embedded or redistributed.
 *    All SVG geometry is 100% original first-party schematic vector artwork.
 * 2. Zero computer-vision guessing: Callout pins are rendered ONLY for fitments that possess a verified,
 *    meaningful catalog diagram_position (PartNormalizer.isMeaningfulDiagramPosition).
 * 3. Fail-closed on unknown positions: Fitments without a meaningful diagram_position (e.g. "-1", null, "")
 *    are NEVER assigned a guessed coordinate; they appear exclusively in the non-positioned table section.
 * 4. Preserve original identifiers: Original 11-digit STIHL part numbers, formatted display numbers, and
 *    exact diagram_position strings are preserved verbatim.
 * 5. Accessible & No-JS ready: Renders a complete semantic HTML table + <noscript> notice so all part
 *    relationships remain 100% usable without JavaScript, on desktop and mobile.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { PartNameNormalizer } from '../parts/PartNameNormalizer.js';

export const PILOT_MODELS = Object.freeze([
  {
    canonical_model_id: 'ms_261',
    model_name: 'MS 261',
    slug: 'ms-261',
    pilot_section: 'Rewind Starter',
    schematic_title: 'Schematisch Overzicht: Handstarter (Rewind Starter)'
  },
  {
    canonical_model_id: 'ms_170',
    model_name: 'MS 170',
    slug: 'ms-170',
    pilot_section: 'Muffler',
    schematic_title: 'Schematisch Overzicht: Uitlaat (Muffler)'
  },
  {
    canonical_model_id: 'fs_55',
    model_name: 'FS 55',
    slug: 'fs-55',
    pilot_section: 'Air Filter - Fuel Tank',
    schematic_title: 'Schematisch Overzicht: Luchtfilter & Brandstoftank'
  }
]);

export const MAX_PILOT_MODELS = 3;

/**
 * Checks whether a canonical model ID is part of the 3-model interactive pilot.
 * @param {string} canonicalModelId
 * @returns {boolean}
 */
export function isPilotModel(canonicalModelId) {
  if (!canonicalModelId || typeof canonicalModelId !== 'string') return false;
  const norm = canonicalModelId.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return PILOT_MODELS.some(m => m.canonical_model_id === norm);
}

/**
 * Partitions verified section parts into:
 *   - positionedHotspots: parts with a verified meaningful diagram_position, mapped to deterministic
 *     schematic callout grid coordinates (never guessed on an OEM drawing).
 *   - unpositionedParts: parts without a meaningful diagram_position (fail-closed: zero coordinates).
 *
 * @param {Array<Object>} parts
 * @param {Object} [options]
 * @param {number} [options.svgWidth=720]
 * @param {number} [options.svgHeight=360]
 */
export function buildSchematicHotspots(parts = [], options = {}) {
  const svgWidth = Number(options.svgWidth) || 720;
  const svgHeight = Number(options.svgHeight) || 360;

  const positioned = [];
  const unpositioned = [];
  const seenPosPart = new Set();

  for (const raw of Array.isArray(parts) ? parts : []) {
    if (!raw || typeof raw !== 'object') continue;
    const partNumber = PartNormalizer.normalizePartNumber(raw.part_number);
    if (!partNumber) continue;

    const partNumberDisplay = raw.part_number_display || PartNormalizer.formatPartNumber(partNumber);
    const cleanName = PartNameNormalizer.normalizeDisplayName(raw.part_name || '', partNumber) || raw.part_name || `Onderdeel ${partNumberDisplay}`;
    const rawPos = raw.diagram_position != null ? String(raw.diagram_position).trim() : '';
    const hasMeaningfulPos = PartNormalizer.isMeaningfulDiagramPosition(rawPos);

    const record = {
      part_number: partNumber,
      part_number_display: partNumberDisplay,
      part_name: cleanName,
      raw_part_name: raw.part_name || cleanName,
      diagram_position: hasMeaningfulPos ? PartNormalizer.normalizeDiagramPosition(rawPos) : null,
      quantity: Number(raw.quantity) > 0 ? Number(raw.quantity) : 1,
      part_url: `/onderdeelnummer/${partNumber}/`
    };

    if (hasMeaningfulPos) {
      const dedupeKey = `${record.diagram_position}:${record.part_number}`;
      if (!seenPosPart.has(dedupeKey)) {
        seenPosPart.add(dedupeKey);
        positioned.push(record);
      }
    } else {
      unpositioned.push(record);
    }
  }

  // Sort deterministically by numeric diagram_position, then part_number
  positioned.sort((a, b) => {
    const na = parseInt(a.diagram_position, 10);
    const nb = parseInt(b.diagram_position, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a.diagram_position).localeCompare(String(b.diagram_position)) || a.part_number.localeCompare(b.part_number);
  });

  // Deterministic schematic callout layout along an assembly axis (not a computer-vision guess)
  const cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(positioned.length * 1.5))));
  const rows = Math.max(1, Math.ceil(positioned.length / cols));
  const padX = 80;
  const padY = 70;
  const usableW = Math.max(160, svgWidth - padX * 2);
  const usableH = Math.max(120, svgHeight - padY * 2);

  const positionedHotspots = positioned.map((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = cols === 1 ? Math.round(svgWidth / 2) : Math.round(padX + (col / (cols - 1)) * usableW);
    const cy = rows === 1 ? Math.round(svgHeight / 2) : Math.round(padY + (row / (rows - 1)) * usableH);
    return {
      ...item,
      hotspot_id: `pos-${item.diagram_position}-${item.part_number}`,
      cx,
      cy,
      hit_radius: 22, // 44px diameter touch target for mobile usability
      coordinate_provenance: 'DETERMINISTIC_SCHEMATIC_GRID_LAYOUT'
    };
  });

  return {
    svgWidth,
    svgHeight,
    positionedHotspots,
    unpositionedParts: unpositioned
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the interactive schematic callout prototype + full accessible / non-JS HTML fallback table.
 *
 * @param {Object} params
 * @param {string} params.modelName
 * @param {string} params.sectionName
 * @param {Array<Object>} params.parts
 * @returns {string} HTML string
 */
export function renderInteractiveDiagramPilotHtml({ modelName, sectionName, parts = [] } = {}) {
  const { svgWidth, svgHeight, positionedHotspots, unpositionedParts } = buildSchematicHotspots(parts);
  const allParts = [...positionedHotspots, ...unpositionedParts];

  const connectorLinesSvg = positionedHotspots.map((h, i) => {
    if (i === 0) return '';
    const prev = positionedHotspots[i - 1];
    return `<line x1="${prev.cx}" y1="${prev.cy}" x2="${h.cx}" y2="${h.cy}" stroke="#374151" stroke-width="1.5" stroke-dasharray="4 4" />`;
  }).join('\n          ');

  const hotspotNodesSvg = positionedHotspots.map(h => `
          <a href="${escapeHtml(h.part_url)}"
             class="diagram-hotspot-node"
             data-hotspot-id="${escapeHtml(h.hotspot_id)}"
             data-part-number="${escapeHtml(h.part_number)}"
             data-diagram-position="${escapeHtml(h.diagram_position)}"
             aria-label="Positie ${escapeHtml(h.diagram_position)}: STIHL ${escapeHtml(h.part_name)} (${escapeHtml(h.part_number_display)})"
             onclick="if(window.__selectStihlDiagramHotspot){return window.__selectStihlDiagramHotspot('${escapeHtml(h.hotspot_id)}', event);}">
            <circle cx="${h.cx}" cy="${h.cy}" r="${h.hit_radius}" fill="transparent" />
            <circle cx="${h.cx}" cy="${h.cy}" r="16" fill="#111827" stroke="#f97316" stroke-width="2.5" />
            <text x="${h.cx}" y="${h.cy + 4}" text-anchor="middle" fill="#ffffff" font-family="monospace" font-size="11" font-weight="bold">${escapeHtml(h.diagram_position)}</text>
          </a>`).join('\n');

  const tableRowsHtml = allParts.map(p => {
    const rowId = p.hotspot_id || `unpos-${p.part_number}`;
    return `
            <tr id="row-${escapeHtml(rowId)}"
                data-diagram-row="${escapeHtml(rowId)}"
                data-part-number="${escapeHtml(p.part_number)}"
                class="border-b border-gray-800/60 hover:bg-gray-800/40 transition">
              <td class="py-2.5 px-3 font-mono font-bold text-orange-400">${p.diagram_position ? escapeHtml(p.diagram_position) : '—'}</td>
              <td class="py-2.5 px-3 font-mono whitespace-nowrap">
                <a href="${escapeHtml(p.part_url)}" class="text-orange-400 hover:underline font-bold">${escapeHtml(p.part_number_display)}</a>
              </td>
              <td class="py-2.5 px-3 text-gray-200">${escapeHtml(p.part_name)}</td>
              <td class="py-2.5 px-3 text-right font-mono text-gray-400">${p.quantity}</td>
            </tr>`;
  }).join('');

  return `
<section class="interactive-diagram-pilot bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4" data-pilot-model="${escapeHtml(modelName)}" data-pilot-section="${escapeHtml(sectionName)}">
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
    <div>
      <span class="text-2xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30">
        Schematisch Referentie-Diagram (Pilot)
      </span>
      <h3 class="text-base font-bold text-white mt-1">
        STIHL ${escapeHtml(modelName)} — ${escapeHtml(sectionName)}
      </h3>
    </div>
    <span class="text-2xs font-mono text-gray-400">
      ${positionedHotspots.length} geverifieerde posities • ${unpositionedParts.length} zonder positienummer
    </span>
  </header>

  <p class="text-xs text-gray-400 leading-relaxed">
    Klik of tik op een genummerde positie om het bijbehorende STIHL onderdeelnummer in de onderstaande referentietabel te markeren.
    Dit schema gebruikt uitsluitend geverifieerde catalogusposities (geen OEM-tekening en geen automatische beeldherkenning).
  </p>

  ${positionedHotspots.length > 0 ? `
  <div class="w-full overflow-x-auto bg-gray-950 border border-gray-800 rounded-xl p-3">
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}"
         role="img"
         aria-label="Interactief referentieschema voor STIHL ${escapeHtml(modelName)} sectie ${escapeHtml(sectionName)}"
         class="w-full h-auto max-h-80 select-none">
      <rect x="8" y="8" width="${svgWidth - 16}" height="${svgHeight - 16}" rx="12" fill="#030712" stroke="#1f2937" stroke-width="1.5" />
      <text x="24" y="34" fill="#9ca3af" font-family="monospace" font-size="11">STIHL ${escapeHtml(modelName)} • ${escapeHtml(sectionName)} (Geverifieerde Diagramreferenties)</text>
      ${connectorLinesSvg}
      ${hotspotNodesSvg}
    </svg>
  </div>
  ` : ''}

  <noscript>
    <div class="p-3 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300">
      JavaScript is uitgeschakeld. Gebruik de volledige onderdelen- en positietabel hieronder; alle onderdeelnummers zijn direct aanklikbaar.
    </div>
  </noscript>

  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs border-collapse" aria-label="Onderdelenlijst ${escapeHtml(modelName)} ${escapeHtml(sectionName)}">
      <thead>
        <tr class="border-b border-gray-800 text-gray-400 text-2xs uppercase">
          <th class="py-2 px-3 w-16">Pos.</th>
          <th class="py-2 px-3">Onderdeelnummer</th>
          <th class="py-2 px-3">Omschrijving</th>
          <th class="py-2 px-3 text-right w-16">Aantal</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
  </div>

  <script>
    window.__selectStihlDiagramHotspot = function(hotspotId, evt) {
      var row = document.getElementById('row-' + hotspotId);
      if (!row) return true;
      if (evt && evt.preventDefault) evt.preventDefault();
      var allRows = document.querySelectorAll('[data-diagram-row]');
      for (var i = 0; i < allRows.length; i++) {
        allRows[i].classList.remove('bg-orange-500/20', 'ring-1', 'ring-orange-500');
      }
      row.classList.add('bg-orange-500/20', 'ring-1', 'ring-orange-500');
      if (row.scrollIntoView) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return false;
    };
  </script>
</section>`.trim();
}
