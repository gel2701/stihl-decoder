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

    if (plantCode === '1') {
      if (numericSerial >= 180000000) {
        return {
          yearRangeFormatted: "2016 – Heden",
          yearStart: 2016,
          yearEnd: null,
          generation: "Modern Productie-tijdperk (Facelift / M-Tronic V2+)",
          confidence: 'MEDIUM'
        };
      } else if (numericSerial >= 170000000) {
        return {
          yearRangeFormatted: "2010 – 2016",
          yearStart: 2010,
          yearEnd: 2016,
          generation: "Generatie 1 (2-MIX / Vroege M-Tronic)",
          confidence: 'MEDIUM'
        };
      } else if (numericSerial >= 140000000) {
        return {
          yearRangeFormatted: "2000 – 2010",
          yearStart: 2000,
          yearEnd: 2010,
          generation: "Klassiek Tijdperk (MS-Serie Introductie)",
          confidence: 'MEDIUM'
        };
      }
    }

    return {
      yearRangeFormatted: "Ca. 2011 – 2020",
      yearStart: 2011,
      yearEnd: 2020,
      generation: "Standaard Productiereeks",
      confidence: 'ESTIMATED'
    };
  }
}
