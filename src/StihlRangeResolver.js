export class StihlRangeResolver {
  /**
   * Geeft een breakpoint-gebaseerde productie-indicatie terug.
   */
  static resolve(numericSerial, plantCode, database) {
    const db = database || {};
    const ranges = db.model_serial_ranges || db.serial_breakpoints || [];

    if (Array.isArray(ranges)) {
      const match = ranges.find(r => 
        (r.plant_code === plantCode || !r.plant_code) &&
        numericSerial >= r.serial_start &&
        numericSerial <= r.serial_end
      );

      if (match) {
        return {
          yearRangeFormatted: match.year_end ? `${match.year_start} – ${match.year_end}` : `vanaf circa ${match.year_start}`,
          yearStart: match.year_start,
          yearEnd: match.year_end || null,
          generation: match.generation_name || match.generation || 'Waarschijnlijke uitvoering',
          confidence: match.confidence_level || 'HIGH',
          // Breakpoint records establish a range, not publishable technical evidence.
          seriesSummary: 'Breakpoint-gebaseerde indicatie van de modelreeks; exacte technische uitvoering is niet bevestigd.'
        };
      }
    }
    return null;
  }
}
