/**
 * Historical STIHL Model Relationship & Predecessor/Successor Engine for STIHLDecoder.nl
 * Phase 33C Historical Relationship & Source Metadata Correction
 */

export const RELATIONSHIP_TYPES = {
  PREDECESSOR: 'PREDECESSOR', // Voorloper (bijv. 026 is voorloper van MS 260)
  SUCCESSOR: 'SUCCESSOR', // Opvolger (bijv. MS 260 is opvolger van 026)
  SUCCESSOR_TRANSITION: 'SUCCESSOR_TRANSITION', // Historische overgang met technische revisies
  SAME_MODEL_FAMILY: 'SAME_MODEL_FAMILY', // Zelfde serie-familie (bijv. Serie 1121 of 1125)
  RENAMED_MODEL: 'RENAMED_MODEL', // Hernoemd model
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
    confidence: 'HIGH',
    spec_inheritance: false,
    notes: 'De STIHL 026 is de historische voorloper van de MS 260 binnen de 1121-serie.'
  },
  '036': {
    model_name: 'STIHL 036',
    series_code: '1125',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 360',
    related_model_slug: 'ms-360',
    production_period: '1991 – 2002',
    confidence: 'HIGH',
    spec_inheritance: false,
    notes: 'De STIHL 036 is de historische voorloper van de MS 360 binnen de 1125-serie (STIHL Type Family 1125).'
  },
  '046': {
    model_name: 'STIHL 046',
    series_code: '1128',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 460',
    related_model_slug: 'ms-460',
    production_period: '1995 – 2002',
    confidence: 'HIGH',
    spec_inheritance: false,
    notes: 'De STIHL 046 is de historische voorloper van de MS 460 / 046 Magnum binnen de 1128-serie.'
  },
  '044': {
    model_name: 'STIHL 044',
    series_code: '1128',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 440',
    related_model_slug: 'ms-440',
    production_period: '1989 – 2002',
    confidence: 'HIGH',
    spec_inheritance: false,
    notes: 'De STIHL 044 is de voorloper van de MS 440 professionele bosbouwzaag binnen de 1128-serie.'
  },
  '066': {
    model_name: 'STIHL 066',
    series_code: '1122',
    category: 'Kettingzaag',
    relationship_type: RELATIONSHIP_TYPES.PREDECESSOR,
    related_model_name: 'MS 660',
    related_model_slug: 'ms-660',
    production_period: '1991 – 2002',
    confidence: 'HIGH',
    spec_inheritance: false,
    notes: 'De STIHL 066 Magnum is de voorloper van de MS 660 zware vellingszaag binnen de 1122-serie.'
  },
  '020 T': {
    model_name: 'STIHL 020 T',
    series_code: '1129',
    category: 'Kettingzaag (Boomverzorging)',
    relationship_type: RELATIONSHIP_TYPES.SUCCESSOR_TRANSITION,
    related_model_name: 'MS 200 T',
    related_model_slug: 'ms-200-t',
    production_period: '1996 – 2002',
    confidence: 'MEDIUM',
    spec_inheritance: false,
    notes: 'De STIHL 020 T is historisch verwant aan en in 2002 opgevolgd door de MS 200 T binnen Serie 1129. Er geldt geen automatische overerving van specificaties.'
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
