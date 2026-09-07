export class StihlRangeResolver {
  /**
   * Geeft een breakpoint-gebaseerde productie-indicatie terug.
   */
  static resolve(numericSerial, plantCode, database) {
    const db = database || {};
    const ranges = db.model_serial_ranges || db.serial_breakpoints || [];

    if (Array.isArray(ranges)) {
      const matches = ranges.filter(r =>
        (r.plant_code === plantCode || !r.plant_code) &&
        numericSerial >= r.serial_start && numericSerial <= r.serial_end
      ).sort((a, b) => {
        const plantRank = Number(Boolean(b.plant_code)) - Number(Boolean(a.plant_code));
        if (plantRank) return plantRank;
        return (Number(a.serial_end) - Number(a.serial_start)) - (Number(b.serial_end) - Number(b.serial_start));
      });
      const match = matches.length === 1 ? matches[0] : null;

      if (match) {
        return {
          range_id: match.range_id || match.id || null,
          model_id: match.model_id || null,
          model_name: match.model_name || null,
          plant_code: match.plant_code || null,
          serial_start: match.serial_start,
          serial_end: match.serial_end,
          yearRangeFormatted: match.year_end ? `${match.year_start} – ${match.year_end}` : `vanaf circa ${match.year_start}`,
          yearStart: match.year_start,
          yearEnd: match.year_end || null,
          generation: match.generation_name || match.generation || 'Waarschijnlijke uitvoering',
          confidence: match.confidence_level || 'HIGH',
          source_class: match.source_class || null,
          source_ref: match.source_ref || null,
          evidence_scope: match.evidence_scope || null,
          // Breakpoint records establish a range, not publishable technical evidence.
          seriesSummary: 'Breakpoint-gebaseerde indicatie van de modelreeks; exacte technische uitvoering is niet bevestigd.'
        };
      }
    }
    return null;
  }
}
