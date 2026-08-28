/**
 * Real Market Valuation Engine & Data Classification for STIHLDecoder.nl
 * Phase 30 Data Classification, Sample Size Transparency & Valuation Confidence
 */

export const PASSPORT_PRO_PRICE = process.env.PASSPORT_PRO_PRICE || 4.99;

export const DATA_CLASSIFICATION = {
  REAL_MARKET_DATA: 'REAL_MARKET_DATA',
  MANUAL_ESTIMATE: 'MANUAL_ESTIMATE',
  CALCULATED_ESTIMATE: 'CALCULATED_ESTIMATE',
  UNKNOWN: 'UNKNOWN'
};

export const CONDITION_MULTIPLIERS = {
  SLECHT: { label: 'Slecht (Matig carter / opknapper)', factor: 0.70 },
  REDELIJK: { label: 'Redelijk (Normale gebruikssporen)', factor: 0.85 },
  GOED: { label: 'Goed (Goed onderhouden / goede compressie)', factor: 1.00 },
  ZEER_GOED: { label: 'Zeer Goed (Zo goed als nieuw / recent onderhoud)', factor: 1.20 }
};

export function calculateMarketValuation(model, condition = 'GOED') {
  const baseDisplacement = model ? (model.displacement_cc || 50) : 50;
  const baseHp = model ? (model.power_hp || 3.5) : 3.5;
  const isMtronic = model ? (model.carb_h_setting || '').includes('M-Tronic') : false;

  // Determine Data Classification
  const hasEnoughModelData = Boolean(model && (model.displacement_cc || model.power_hp || model.power_kw));
  const dataClassification = hasEnoughModelData ? DATA_CLASSIFICATION.CALCULATED_ESTIMATE : DATA_CLASSIFICATION.UNKNOWN;

  // Base median market price estimation logic
  let baseMedian = Math.round(baseDisplacement * 6.5 + baseHp * 25);
  if (isMtronic) baseMedian += 75;

  const condObj = CONDITION_MULTIPLIERS[condition.toUpperCase()] || CONDITION_MULTIPLIERS.GOED;
  const adjustedMedian = Math.round(baseMedian * condObj.factor);

  const minPrice = Math.round(adjustedMedian * 0.82);
  const maxPrice = Math.round(adjustedMedian * 1.18);
  const p25 = Math.round(adjustedMedian * 0.90);
  const p75 = Math.round(adjustedMedian * 1.10);

  const sampleSize = 0;
  const confidenceLevel = hasEnoughModelData ? 'LOW' : 'INSUFFICIENT_DATA';

  const isRealData = dataClassification === DATA_CLASSIFICATION.REAL_MARKET_DATA;
  const headlineTerm = isRealData ? 'Tweedehands Marktwaarde' : 'Indicatieve Waarde-inschatting';
  const provenanceText = isRealData 
    ? `Gebaseerd op ${sampleSize} marktwaarnemingen (Laatst bijgewerkt: 28 augustus 2026).`
    : `Indicatieve waarde-inschatting op basis van beperkte modeldata uit de repository. Dit is geen bewezen marktmeting, geen taxatierapport en geen vervanging voor een actuele marktanalyse.`;

  return {
    modelName: model ? model.model_name : 'STIHL Machine',
    condition: condObj.label,
    dataClassification,
    headlineTerm,
    rangeString: isRealData ? `€${minPrice} – €${maxPrice}` : null,
    medianPrice: adjustedMedian,
    p25,
    p75,
    minPrice,
    maxPrice,
    sampleSize,
    confidenceLevel,
    provenanceText,
    lastUpdated: '28 augustus 2026'
  };
}
