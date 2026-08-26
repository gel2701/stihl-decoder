/**
 * Centralized Event Enum & Privacy-Friendly Analytics Architecture for STIHLDecoder.nl
 * Phase 30 Event Enum Standardization & Conversion Funnel Tracking
 */

export const EVENT_TYPES = {
  DECODER_USED: 'decoder_used',
  MODEL_IDENTIFIED: 'model_identified',
  PASSPORT_VIEW: 'passport_view',
  PASSPORT_STARTED: 'passport_started',
  PASSPORT_CREATED: 'passport_created',
  PASSPORT_PRO_VIEW: 'passport_pro_view',
  PASSPORT_PRO_CLICK: 'passport_pro_click',
  VALUATION_STARTED: 'valuation_started',
  VALUATION_COMPLETED: 'valuation_completed',
  PART_SEARCH: 'part_search',
  COMPARISON_VIEWED: 'comparison_viewed',
  AFFILIATE_CLICK: 'affiliate_click',
  SELL_LEAD_STARTED: 'sell_lead_started',
  SELL_LEAD_COMPLETED: 'sell_lead_completed',
  REPAIR_LEAD_STARTED: 'repair_lead_started',
  REPAIR_LEAD_COMPLETED: 'repair_lead_completed',
  INTERNAL_MODEL_SEARCH: 'internal_model_search'
};

const internalSearchCounter = new Map();
const conversionFunnelCounts = new Map();

// Initialize funnel counters
Object.values(EVENT_TYPES).forEach(evt => conversionFunnelCounts.set(evt, 0));

export function logStihlEvent(eventName, payload = {}) {
  const validEvents = Object.values(EVENT_TYPES);
  if (!validEvents.includes(eventName)) {
    console.warn(`[AnalyticsTracker] Invalid event name: ${eventName}`);
    return;
  }

  // Increment funnel count
  conversionFunnelCounts.set(eventName, (conversionFunnelCounts.get(eventName) || 0) + 1);

  // Anonymized internal search logging (STRICT GDPR: No serial numbers stored)
  if (eventName === EVENT_TYPES.INTERNAL_MODEL_SEARCH || eventName === EVENT_TYPES.MODEL_IDENTIFIED) {
    const rawQuery = (payload.model || payload.query || '').trim().toUpperCase();
    // Strictly ignore 9-digit numeric serials to prevent storing PII / serial numbers
    if (rawQuery && !/^\d{9}$/.test(rawQuery)) {
      internalSearchCounter.set(rawQuery, (internalSearchCounter.get(rawQuery) || 0) + 1);
    }
  }

  // Sanitize payload to strip PII (No serial numbers, names, emails, IPs, phone numbers)
  const sanitizedPayload = { ...payload };
  delete sanitizedPayload.serial_number;
  delete sanitizedPayload.email;
  delete sanitizedPayload.name;
  delete sanitizedPayload.phone;
  delete sanitizedPayload.ip;
  delete sanitizedPayload.message;

  const timestamp = new Date().toISOString();
  const eventData = {
    event: eventName,
    timestamp,
    ...sanitizedPayload
  };

  console.log(`[EventTracked] ${eventName}`, JSON.stringify(eventData));
  return eventData;
}

export function getConversionDashboardMetrics() {
  const decoderUses = conversionFunnelCounts.get(EVENT_TYPES.DECODER_USED) || 0;
  const modelsIdentified = conversionFunnelCounts.get(EVENT_TYPES.MODEL_IDENTIFIED) || 0;
  const valuationStarts = conversionFunnelCounts.get(EVENT_TYPES.VALUATION_STARTED) || 0;
  const passportStarts = conversionFunnelCounts.get(EVENT_TYPES.PASSPORT_STARTED) || 0;
  const passportCreations = conversionFunnelCounts.get(EVENT_TYPES.PASSPORT_CREATED) || 0;
  const proClicks = conversionFunnelCounts.get(EVENT_TYPES.PASSPORT_PRO_CLICK) || 0;
  const affiliateClicks = conversionFunnelCounts.get(EVENT_TYPES.AFFILIATE_CLICK) || 0;

  const decoderConversionRate = decoderUses > 0 ? ((modelsIdentified / decoderUses) * 100).toFixed(1) : '0.0';
  const passportConversionRate = decoderUses > 0 ? ((passportCreations / decoderUses) * 100).toFixed(1) : '0.0';

  return {
    decoderUses,
    modelsIdentified,
    valuationStarts,
    passportStarts,
    passportCreations,
    proClicks,
    affiliateClicks,
    decoderConversionRate: `${decoderConversionRate}%`,
    passportConversionRate: `${passportConversionRate}%`
  };
}

export function getContentGapReport(databaseModels = []) {
  const publishedSlugs = new Set((databaseModels || []).map(m => (m.slug || m.id).toLowerCase()));
  const publishedNames = new Set((databaseModels || []).map(m => m.model_name.toUpperCase()));

  const searchList = Array.from(internalSearchCounter.entries()).map(([query, count]) => ({
    query,
    count,
    hasPage: publishedNames.has(query) || Array.from(publishedSlugs).some(s => s.includes(query.toLowerCase()))
  }));

  const unmappedSearches = searchList.filter(s => !s.hasPage).sort((a, b) => b.count - a.count);

  return {
    totalRecordedSearches: Array.from(internalSearchCounter.values()).reduce((a, b) => a + b, 0),
    topUnmappedModelSearches: unmappedSearches.slice(0, 10),
    topSearchedModelsOverall: searchList.sort((a, b) => b.count - a.count).slice(0, 10)
  };
}
