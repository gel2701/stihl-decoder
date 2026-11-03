/**
 * Phase 61D — Honest diagram availability notice.
 *
 * STIHLDecoder publishes no OEM/third-party exploded-view raster images:
 * the catalog stores section names and diagram positions, not licensed artwork.
 * This notice makes that explicit wherever the UI links to "diagram" sections.
 */

export const DIAGRAM_AVAILABILITY_TEXT =
  'Echte STIHL-explosietekeningen (afbeeldingen) zijn hier niet beschikbaar. U ziet de onderdelenlijst met tekeningposities: de sectienaam en het positienummer waaronder het onderdeel in de officiële onderdelentekening staat.';

export function renderDiagramAvailabilityNoticeHtml(options = {}) {
  const extraClass = options.className ? ` ${options.className}` : '';

  return `
    <div class="rounded-xl bg-gray-950/70 border border-gray-800 p-3 text-2xs text-gray-300 leading-relaxed${extraClass}" role="note" aria-label="Beschikbaarheid tekeningen">
      <span class="font-semibold text-gray-200">Onderdelenlijst met tekeningposities.</span>
      ${DIAGRAM_AVAILABILITY_TEXT}
    </div>
  `.trim();
}
