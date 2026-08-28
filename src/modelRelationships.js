/**
 * Historical STIHL Model Relationship & Predecessor/Successor Engine for STIHLDecoder.nl
 * Phase 33B Historical Model Audit
 */

export const RELATIONSHIP_TYPES = {
  PREDECESSOR: 'PREDECESSOR', // Voorloper (bijv. 026 is voorloper van MS 260)
  SUCCESSOR: 'SUCCESSOR', // Opvolger (bijv. MS 260 is opvolger van 026)
  SAME_MODEL_FAMILY: 'SAME_MODEL_FAMILY', // Zelfde serie-familie (bijv. Serie 1121)
  RENAMED_MODEL: 'RENAMED_MODEL', // Hernoemd model (bijv. 020 T -> MS 200 T)
  HISTORICAL_DESIGNATION: 'HISTORICAL_DESIGNATION'
};

export const HISTORICAL_MODEL_RELATIONSHIPS = {
  '026': {
    model_name: 'STIHL 026',
    series_code: '1121',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 260',
    related_model_slug: 'ms-260',
    production_period: '1988 – 2002',
    notes: 'De STIHL 026 is de historische voorloper van de MS 260 binnen de iconische 1121-serie. Delen hetzelfde carter en serie-prefix (1121).'
  },
  '036': {
    model_name: 'STIHL 036',
    series_code: '1128',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 360',
    related_model_slug: 'ms-360',
    production_period: '1991 – 2002',
    notes: 'De STIHL 036 is de historische voorloper van de MS 360 binnen de 1128-serie.'
  },
  '046': {
    model_name: 'STIHL 046',
    series_code: '1128',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 460',
    related_model_slug: 'ms-460',
    production_period: '1995 – 2002',
    notes: 'De STIHL 046 is de historische voorloper van de MS 460 / 046 Magnum.'
  },
  '044': {
    model_name: 'STIHL 044',
    series_code: '1128',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 440',
    related_model_slug: 'ms-440',
    production_period: '1989 – 2002',
    notes: 'De STIHL 044 is de voorloper van de MS 440 professionele bosbouw zaag.'
  },
  '066': {
    model_name: 'STIHL 066',
    series_code: '1122',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 660',
    related_model_slug: 'ms-660',
    production_period: '1991 – 2002',
    notes: 'De STIHL 066 Magnum is de voorloper van de MS 660 zware vellingszaag.'
  },
  '020 T': {
    model_name: 'STIHL 020 T',
    series_code: '1129',
    category: 'Kettingzaag (Boomverzorging)',
    relationship_type: RELATIONSHIP_TYPES.RENAMED_MODEL,
    related_model_name: 'MS 200 T',
    related_model_slug: 'ms-200-t',
    production_period: '1996 – 2002',
    notes: 'De STIHL 020 T werd in 2002 hernoemd naar MS 200 T bij de introductie van het MS-naamgevingsstelsel.'
  }
};

/**
 * Resolves historical model relationship for a query
 */
export function resolveModelRelationship(query = '') {
  const norm = query.trim().toUpperCase().replace(/[\s-]/g, '');
  
  for (const [key, rel] of Object.entries(HISTORICAL_MODEL_RELATIONSHIPS)) {
    const cleanKey = key.replace(/[\s-]/g, '').toUpperCase();
    if (norm === cleanKey || norm === `STIHL${cleanKey}`) {
      return rel;
    }
  }

  return null;
}
