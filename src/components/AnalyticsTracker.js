/**
 * Persistent Event Logging & Bot Filtering Architecture for STIHLDecoder.nl
 * Phase 31B Real Data Provenance, Bot Filtering & Persistent Log Storage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const eventsFilePath = path.join(__dirname, '..', '..', 'data', 'events.json');

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

const BOT_USER_AGENTS_REGEX = /googlebot|bingbot|yandexbot|ahrefsbot|semrushbot|baiduspider|playwright|headlesschrome|internal-test|lighthouse/i;

export function isBotUserAgent(userAgent = '') {
  return BOT_USER_AGENTS_REGEX.test(userAgent);
}

export function logStihlEvent(eventName, payload = {}, reqUserAgent = '') {
  const validEvents = Object.values(EVENT_TYPES);
  if (!validEvents.includes(eventName)) {
    console.warn(`[AnalyticsTracker] Invalid event name: ${eventName}`);
    return;
  }

  // Filter out automated bots & test runners from production user metrics
  if (isBotUserAgent(reqUserAgent || payload.userAgent || '')) {
    console.log(`[EventTracked-BotFiltered] ${eventName} ignored (Bot UA detected)`);
    return { status: 'BOT_FILTERED' };
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

  // Persistent File Storage append
  try {
    let currentEvents = [];
    if (fs.existsSync(eventsFilePath)) {
      const raw = fs.readFileSync(eventsFilePath, 'utf8');
      if (raw) currentEvents = JSON.parse(raw);
    }
    currentEvents.push(eventData);
    // Keep max 5000 events
    if (currentEvents.length > 5000) currentEvents = currentEvents.slice(-5000);
    fs.writeFileSync(eventsFilePath, JSON.stringify(currentEvents, null, 2), 'utf8');
  } catch (err) {
    // Fail silently in browser or read-only environments
  }

  console.log(`[EventTracked-Production] ${eventName}`, JSON.stringify(eventData));
  return eventData;
}

export function getConversionDashboardMetrics() {
  let storedEvents = [];
  try {
    if (fs.existsSync(eventsFilePath)) {
      const raw = fs.readFileSync(eventsFilePath, 'utf8');
      if (raw) storedEvents = JSON.parse(raw);
    }
  } catch (e) {}

  const realEventCount = storedEvents.length;
  const status = realEventCount > 0 ? 'REAL_PRODUCTION_DATA' : 'TRACKING_IMPLEMENTED_NO_PRODUCTION_DATA';

  const counts = {};
  Object.values(EVENT_TYPES).forEach(evt => {
    counts[evt] = storedEvents.filter(e => e.event === evt).length;
  });

  return {
    status,
    totalRecordedEvents: realEventCount,
    decoderUses: counts[EVENT_TYPES.DECODER_USED] || 0,
    modelsIdentified: counts[EVENT_TYPES.MODEL_IDENTIFIED] || 0,
    valuationStarts: counts[EVENT_TYPES.VALUATION_STARTED] || 0,
    passportStarts: counts[EVENT_TYPES.PASSPORT_STARTED] || 0,
    passportCreations: counts[EVENT_TYPES.PASSPORT_CREATED] || 0,
    proClicks: counts[EVENT_TYPES.PASSPORT_PRO_CLICK] || 0,
    affiliateClicks: counts[EVENT_TYPES.AFFILIATE_CLICK] || 0,
    repairLeads: counts[EVENT_TYPES.REPAIR_LEAD_COMPLETED] || 0,
    sellLeads: counts[EVENT_TYPES.SELL_LEAD_COMPLETED] || 0,
    message: realEventCount === 0 ? 'Wachten op live gebruikersdata (Nog geen gegevens beschikbaar)' : 'Echte live gebruikersgegevens actief'
  };
}

export function getContentGapReport(databaseModels = []) {
  let storedEvents = [];
  try {
    if (fs.existsSync(eventsFilePath)) {
      const raw = fs.readFileSync(eventsFilePath, 'utf8');
      if (raw) storedEvents = JSON.parse(raw);
    }
  } catch (e) {}

  const modelSearches = storedEvents.filter(e => e.event === EVENT_TYPES.INTERNAL_MODEL_SEARCH || e.event === EVENT_TYPES.MODEL_IDENTIFIED);
  const searchMap = new Map();

  modelSearches.forEach(e => {
    const rawQuery = (e.model || e.query || '').trim().toUpperCase();
    if (rawQuery && !/^\d{9}$/.test(rawQuery)) {
      searchMap.set(rawQuery, (searchMap.get(rawQuery) || 0) + 1);
    }
  });

  const publishedSlugs = new Set((databaseModels || []).map(m => (m.slug || m.id).toLowerCase()));
  const publishedNames = new Set((databaseModels || []).map(m => m.model_name.toUpperCase()));

  const searchList = Array.from(searchMap.entries()).map(([query, count]) => ({
    query,
    count,
    hasPage: publishedNames.has(query) || Array.from(publishedSlugs).some(s => s.includes(query.toLowerCase()))
  }));

  const unmappedSearches = searchList.filter(s => !s.hasPage).sort((a, b) => b.count - a.count);

  return {
    dataProvenance: storedEvents.length > 0 ? 'REAL_PRODUCTION_DATA' : 'NO_DATA_YET',
    totalRecordedSearches: modelSearches.length,
    topUnmappedModelSearches: unmappedSearches.slice(0, 10),
    topSearchedModelsOverall: searchList.sort((a, b) => b.count - a.count).slice(0, 10)
  };
}
