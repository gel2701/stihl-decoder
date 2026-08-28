export class StihlRangeResolver {
  /**
   * Bepaalt het exacte bouwjaar en generatie op basis van serie-breakpoints.
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
          yearRangeFormatted: match.year_end ? `${match.year_start} – ${match.year_end}` : `${match.year_start} – Heden`,
          yearStart: match.year_start,
          yearEnd: match.year_end || null,
          generation: match.generation_name || match.generation || "Gevalideerde Uitvoering",
          technicalHighlights: match.technical_changes || match.technical_highlights,
          confidence: match.confidence_level || 'HIGH'
        };
      }
    }
    return null;
  }
}
