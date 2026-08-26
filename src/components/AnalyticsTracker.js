/**
 * Privacy-Friendly Analytics & Event Tracking Architecture for STIHLDecoder.nl
 * Phase 29 Event Emission & Internal Search Intelligence
 */

export const TRACKABLE_EVENTS = [
  'decoder_used',
  'model_identified',
  'passport_view',
  'passport_started',
  'passport_created',
  'passport_pro_interest',
  'valuation_started',
  'valuation_completed',
  'part_search',
  'comparison_viewed',
  'affiliate_click',
  'sell_lead_started',
  'sell_lead_completed',
  'repair_lead_started',
  'repair_lead_completed',
  'internal_model_search'
];

// Anonymized internal model search counter (STRICT GDPR: No serial numbers stored)
const internalSearchCounter = new Map();

export function logStihlEvent(eventName, payload = {}) {
  if (!TRACKABLE_EVENTS.includes(eventName)) {
    console.warn(`[AnalyticsTracker] Unknown event name: ${eventName}`);
    return;
  }

  // Anonymized internal model query tracking
  if (eventName === 'internal_model_search' || eventName === 'model_identified') {
    const rawQuery = (payload.model || payload.query || '').trim().toUpperCase();
    if (rawQuery && !/^\d{9}$/.test(rawQuery)) { // Strictly ignore 9-digit serial numbers
      internalSearchCounter.set(rawQuery, (internalSearchCounter.get(rawQuery) || 0) + 1);
    }
  }

  const timestamp = new Date().toISOString();
  const eventData = {
    event: eventName,
    timestamp,
    ...payload
  };

  console.log(`[EventTracked] ${eventName}`, JSON.stringify(eventData));
  return eventData;
}

export function getContentGapReport(databaseModels = []) {
  const publishedSlugs = new Set((databaseModels || []).map(m => (m.slug || m.id).toLowerCase()));
  const publishedNames = new Set((databaseModels || []).map(m => m.model_name.toUpperCase()));

  const searchList = Array.from(internalSearchCounter.entries()).map(([query, count]) => ({
    query,
    count,
    hasPage: publishedNames.has(query) || Array.from(publishedSlugs).some(s => s.includes(query.toLowerCase()))
  }));

  // Filter searches without dedicated pages
  const unmappedSearches = searchList.filter(s => !s.hasPage).sort((a, b) => b.count - a.count);

  return {
    totalRecordedSearches: Array.from(internalSearchCounter.values()).reduce((a, b) => a + b, 0),
    topUnmappedModelSearches: unmappedSearches.slice(0, 10),
    topSearchedModelsOverall: searchList.sort((a, b) => b.count - a.count).slice(0, 10)
  };
}
