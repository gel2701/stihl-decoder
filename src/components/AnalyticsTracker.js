/**
 * Privacy-Friendly Analytics & Event Tracking Architecture for STIHLDecoder.nl
 * Phase 28 Event Tracking
 */

export const TRACKABLE_EVENTS = [
  'decoder_used',
  'model_identified',
  'passport_created',
  'valuation_started',
  'valuation_completed',
  'part_search',
  'comparison_viewed',
  'affiliate_click',
  'sell_lead',
  'repair_lead'
];

export function logStihlEvent(eventName, payload = {}) {
  if (!TRACKABLE_EVENTS.includes(eventName)) {
    console.warn(`[AnalyticsTracker] Unknown event name: ${eventName}`);
    return;
  }

  const timestamp = new Date().toISOString();
  const eventData = {
    event: eventName,
    timestamp,
    ...payload
  };

  // Log in server memory or stdout in a privacy-friendly manner (no personal IP or user identifiers)
  console.log(`[EventTracked] ${eventName}`, JSON.stringify(eventData));
  return eventData;
}
