export interface ProductionPeriodResult {
  match_type?: string;
  isAmbiguous?: boolean;
  range_id?: string | null;
  model_id?: string | null;
  model_name?: string | null;
  plant_code?: string | null;
  serial_start?: number;
  serial_end?: number;
  yearRangeFormatted: string;
  yearStart: number;
  yearEnd: number | null;
  generation: string;
  seriesSummary?: string;
  matchReason?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'ESTIMATED';
  rangeMatches?: any[];
  candidates?: string[];
}

export class StihlRangeResolver {
  public static findMatches(numericSerial: number, plantCode: string, database?: any): any[] {
    const db = database || {};
    const ranges = db.model_serial_ranges || db.serial_breakpoints || [];

    if (!Array.isArray(ranges)) return [];

    return ranges.filter((r: any) =>
      (r.plant_code === plantCode || !r.plant_code) &&
      numericSerial >= r.serial_start && numericSerial <= r.serial_end
    ).sort((a: any, b: any) => {
      const plantRank = Number(Boolean(b.plant_code)) - Number(Boolean(a.plant_code));
      if (plantRank) return plantRank;
      return (Number(a.serial_end) - Number(a.serial_start)) - (Number(b.serial_end) - Number(b.serial_start));
    });
  }

  public static resolve(
    numericSerial: number,
    plantCode: string,
    database?: any
  ): ProductionPeriodResult | null {
    const matches = this.findMatches(numericSerial, plantCode, database);

    if (matches.length === 0) {
      return null;
    }

    const uniqueModelIds = new Set(matches.map((m: any) => m.model_id).filter(Boolean));

    if (matches.length === 1) {
      const match = matches[0];
      const isPrimary = (match.range_evidence_class === 'PRIMARY_DOCUMENTED');
      const matchReason = isPrimary
        ? 'Serienummer valt binnen een door primaire STIHL-bron ondersteunde modelreeks.'
        : 'Serienummer valt binnen een bekende historische modelreeks.';

      return {
        match_type: 'UNIQUE_RANGE_MATCH',
        range_id: match.range_id || match.id || null,
        model_id: match.model_id || null,
        model_name: match.model_name || null,
        plant_code: match.plant_code || null,
        range_evidence_class: match.range_evidence_class || 'HISTORICAL_REPOSITORY_EVIDENCE',
        range_semantic_level: match.range_semantic_level || 'PROBABLE_MODEL_SERIES_RANGE',
        confidence: match.confidence_level || 'MEDIUM',
        confidence_reason: match.confidence_reason || null,
        source_status: match.source_status || 'HISTORICAL_REPOSITORY_VERIFIED',
        source_refs: match.source_refs || [],
        historical_source_commits: match.historical_source_commits || [],
        serial_start: match.serial_start,
        serial_end: match.serial_end,
        yearRangeFormatted: match.year_end ? `${match.year_start} – ${match.year_end}` : `vanaf circa ${match.year_start}`,
        yearStart: match.year_start,
        yearEnd: match.year_end || null,
        generation: match.generation_name || match.generation || 'Waarschijnlijke uitvoering',
        matchReason,
        seriesSummary: 'Breakpoint-gebaseerde indicatie van de modelreeks; exacte technische uitvoering is niet bevestigd.',
        rangeMatches: matches
      };
    }

    if (uniqueModelIds.size === 1) {
      const match = matches[0];
      const isPrimary = (match.range_evidence_class === 'PRIMARY_DOCUMENTED');
      const matchReason = isPrimary
        ? 'Serienummer valt binnen een door primaire STIHL-bron ondersteunde modelreeks.'
        : 'Serienummer valt binnen een bekende historische modelreeks.';

      return {
        match_type: 'SAME_MODEL_OVERLAP',
        range_id: match.range_id || match.id || null,
        model_id: match.model_id || null,
        model_name: match.model_name || null,
        plant_code: match.plant_code || null,
        range_evidence_class: match.range_evidence_class || 'HISTORICAL_REPOSITORY_EVIDENCE',
        range_semantic_level: match.range_semantic_level || 'PROBABLE_MODEL_SERIES_RANGE',
        confidence: match.confidence_level || 'MEDIUM',
        confidence_reason: match.confidence_reason || null,
        source_status: match.source_status || 'HISTORICAL_REPOSITORY_VERIFIED',
        source_refs: match.source_refs || [],
        historical_source_commits: match.historical_source_commits || [],
        serial_start: match.serial_start,
        serial_end: match.serial_end,
        yearRangeFormatted: match.year_end ? `${match.year_start} – ${match.year_end}` : `vanaf circa ${match.year_start}`,
        yearStart: match.year_start,
        yearEnd: match.year_end || null,
        generation: match.generation_name || match.generation || 'Waarschijnlijke uitvoering',
        matchReason,
        seriesSummary: 'Breakpoint-gebaseerde indicatie van de modelreeks; exacte technische uitvoering is niet bevestigd.',
        rangeMatches: matches
      };
    }

    const candidateNames = [...new Set(matches.map((m: any) => m.model_name || m.generation_name || m.model_id).filter(Boolean))];
    const firstMatch = matches[0];
    return {
      match_type: 'AMBIGUOUS_MULTI_CANDIDATE',
      isAmbiguous: true,
      range_id: null,
      model_id: null,
      model_name: candidateNames.join(' / '),
      plant_code: firstMatch.plant_code || plantCode,
      range_evidence_class: 'HISTORICAL_REPOSITORY_EVIDENCE',
      range_semantic_level: 'MODEL_FAMILY_RANGE',
      confidence: 'MEDIUM',
      confidence_reason: 'Meerdere historische reeksen overlappen in dit bereik.',
      source_status: 'HISTORICAL_REPOSITORY_CONFLICTED',
      source_refs: [],
      historical_source_commits: [],
      serial_start: Math.min(...matches.map((m: any) => m.serial_start)),
      serial_end: Math.max(...matches.map((m: any) => m.serial_end)),
      yearRangeFormatted: firstMatch.year_end ? `${firstMatch.year_start} – ${firstMatch.year_end}` : `vanaf circa ${firstMatch.year_start}`,
      yearStart: Math.min(...matches.map((m: any) => m.year_start)),
      yearEnd: matches.some((m: any) => !m.year_end) ? null : Math.max(...matches.map((m: any) => m.year_end)),
      generation: 'Mogelijk meerdere modelreeksen in dit serienummerbereik',
      matchReason: 'Serienummer valt binnen een bereik waarin meerdere STIHL modellen zijn geproduceerd.',
      seriesSummary: 'Meerdere modellen delen dit numerieke bereik; modelbevestiging via typeplaatje vereist.',
      candidates: candidateNames,
      rangeMatches: matches
    };
  }
}
