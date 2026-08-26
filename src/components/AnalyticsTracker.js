/**
 * Centralized Persistent Analytics Engine & Whitelisted Metadata Architecture for STIHLDecoder.nl
 * Phase 32 Production Analytics, SQLite Persistence & SEO Freeze Baseline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let sqlite3;
try {
  sqlite3 = (await import('sqlite3')).default.verbose();
} catch (e) {
  // SQLite fallback for non-native environments
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'data', 'stihl_database.db');
const jsonPath = path.join(__dirname, '..', '..', 'data', 'stihl_database.json');

export const SEO_CONTENT_FREEZE = 'ACTIVE';

export const EVENT_TYPES = {
  DECODER_USED: 'decoder_used',
  MODEL_IDENTIFIED: 'model_identified',
  VALUATION_STARTED: 'valuation_started',
  VALUATION_COMPLETED: 'valuation_completed',
  PASSPORT_VIEW: 'passport_view',
  PASSPORT_STARTED: 'passport_started',
  PASSPORT_CREATED: 'passport_created',
  PASSPORT_PRO_VIEW: 'passport_pro_view',
  PASSPORT_PRO_CLICK: 'passport_pro_click',
  PART_SEARCH: 'part_search',
  AFFILIATE_CLICK: 'affiliate_click',
  REPAIR_LEAD_STARTED: 'repair_lead_started',
  REPAIR_LEAD_COMPLETED: 'repair_lead_completed',
  SELL_LEAD_STARTED: 'sell_lead_started',
  SELL_LEAD_COMPLETED: 'sell_lead_completed',
  COMPARISON_VIEWED: 'comparison_viewed',
  INTERNAL_MODEL_SEARCH: 'internal_model_search'
};

const WHITELISTED_METADATA_KEYS = [
  'model_slug',
  'category',
  'source_page',
  'destination_type',
  'condition',
  'experiment_variant',
  'part_category',
  'pairSlug',
  'model'
];

const BOT_USER_AGENTS_REGEX = /googlebot|bingbot|yandexbot|ahrefsbot|semrushbot|baiduspider|playwright|headlesschrome|internal-test|lighthouse/i;

export function isBotUserAgent(userAgent = '') {
  return BOT_USER_AGENTS_REGEX.test(userAgent);
}

export function trackEvent(eventType, metadata = {}, reqUserAgent = '', isTest = false) {
  const validEvents = Object.values(EVENT_TYPES);
  if (!validEvents.includes(eventType)) {
    console.warn(`[AnalyticsTracker] Unknown eventType: ${eventType}`);
    return;
  }

  // 1. Bot Filtering
  const isBot = isBotUserAgent(reqUserAgent || metadata.userAgent || '');
  if (isBot) {
    console.log(`[EventTracked-BotFiltered] ${eventType} ignored`);
    return { status: 'BOT_FILTERED' };
  }

  // 2. Strict Whitelisted Metadata Sanitization
  const cleanMetadata = {};
  Object.keys(metadata).forEach(key => {
    if (WHITELISTED_METADATA_KEYS.includes(key)) {
      cleanMetadata[key] = metadata[key];
    }
  });

  const modelSlug = cleanMetadata.model_slug || cleanMetadata.model || null;
  const pagePath = cleanMetadata.source_page || '/';
  const metadataJson = JSON.stringify(cleanMetadata);
  const createdAt = new Date().toISOString();

  // 3. Persistent Storage to SQLite
  if (sqlite3 && fs.existsSync(dbPath)) {
    try {
      const db = new sqlite3.Database(dbPath);
      db.run(
        `INSERT INTO analytics_events (event_type, model_slug, page_path, metadata_json, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [eventType, modelSlug, pagePath, metadataJson, isTest ? 1 : 0, createdAt],
        (err) => {
          if (err) console.error('⚠️ SQLite event insert error:', err.message);
          db.close();
        }
      );
    } catch (err) {
      console.warn('⚠️ SQLite analytics fallback trigger:', err.message);
    }
  }

  // 4. Also store in JSON Backup
  try {
    if (fs.existsSync(jsonPath)) {
      const dbJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (!dbJson.analytics_events) dbJson.analytics_events = [];
      dbJson.analytics_events.push({
        event_type: eventType,
        model_slug: modelSlug,
        page_path: pagePath,
        metadata_json: metadataJson,
        is_test: isTest ? 1 : 0,
        created_at: createdAt
      });
      if (dbJson.analytics_events.length > 2000) {
        dbJson.analytics_events = dbJson.analytics_events.slice(-2000);
      }
      fs.writeFileSync(jsonPath, JSON.stringify(dbJson, null, 2), 'utf8');
    }
  } catch (err) {}

  console.log(`[EventTracked-Persistent] ${eventType}`, metadataJson);
  return { status: 'SUCCESS', eventType, isTest };
}

// Backward compatibility alias for trackEvent
export function logStihlEvent(eventName, payload = {}, reqUserAgent = '', isTest = false) {
  return trackEvent(eventName, payload, reqUserAgent, isTest);
}

export function getConversionDashboardMetrics() {
  let events = [];
  try {
    if (fs.existsSync(jsonPath)) {
      const dbJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      events = dbJson.analytics_events || [];
    }
  } catch (e) {}

  // Exclude test events from production KPI reporting
  const prodEvents = events.filter(e => !e.is_test);

  const count = (type) => prodEvents.filter(e => e.event_type === type).length;

  const decoderUses = count(EVENT_TYPES.DECODER_USED);
  const modelsIdentified = count(EVENT_TYPES.MODEL_IDENTIFIED);
  const valuationStarts = count(EVENT_TYPES.VALUATION_STARTED);
  const passportStarts = count(EVENT_TYPES.PASSPORT_STARTED);
  const passportCreations = count(EVENT_TYPES.PASSPORT_CREATED);
  const proViews = count(EVENT_TYPES.PASSPORT_PRO_VIEW);
  const proClicks = count(EVENT_TYPES.PASSPORT_PRO_CLICK);
  const affiliateClicks = count(EVENT_TYPES.AFFILIATE_CLICK);
  const repairLeads = count(EVENT_TYPES.REPAIR_LEAD_COMPLETED);
  const sellLeads = count(EVENT_TYPES.SELL_LEAD_COMPLETED);

  const identificationRate = decoderUses > 0 ? ((modelsIdentified / decoderUses) * 100).toFixed(1) + '%' : '0.0%';

  return {
    status: prodEvents.length > 0 ? 'REAL_PRODUCTION_DATA' : 'NO_PRODUCTION_DATA_YET',
    seoFreezeStatus: SEO_CONTENT_FREEZE,
    totalProductionEvents: prodEvents.length,
    decoderUses,
    modelsIdentified,
    identificationRate,
    valuationStarts,
    passportStarts,
    passportCreations,
    proViews,
    proClicks,
    affiliateClicks,
    repairLeads,
    sellLeads,
    realRevenueEur: '0.00',
    message: prodEvents.length === 0 ? 'Waiting for live production data (0 real events logged)' : 'Real live production data active'
  };
}

export function getContentGapReport(databaseModels = []) {
  let events = [];
  try {
    if (fs.existsSync(jsonPath)) {
      const dbJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      events = dbJson.analytics_events || [];
    }
  } catch (e) {}

  const prodEvents = events.filter(e => !e.is_test);
  const searches = prodEvents.filter(e => e.event_type === EVENT_TYPES.INTERNAL_MODEL_SEARCH || e.event_type === EVENT_TYPES.MODEL_IDENTIFIED);

  const searchMap = new Map();
  searches.forEach(e => {
    try {
      const meta = JSON.parse(e.metadata_json || '{}');
      const model = (meta.model_slug || meta.model || '').toUpperCase().trim();
      if (model && !/^\d{9}$/.test(model)) {
        searchMap.set(model, (searchMap.get(model) || 0) + 1);
      }
    } catch (err) {}
  });

  const publishedNames = new Set((databaseModels || []).map(m => m.model_name.toUpperCase()));
  const unmapped = Array.from(searchMap.entries())
    .map(([query, count]) => ({ query, count, hasPage: publishedNames.has(query) }))
    .filter(s => !s.hasPage)
    .sort((a, b) => b.count - a.count);

  return {
    dataProvenance: prodEvents.length > 0 ? 'REAL_PRODUCTION_DATA' : 'NO_DATA_YET',
    totalRecordedSearches: searches.length,
    topUnmappedModelSearches: unmapped.slice(0, 10)
  };
}
