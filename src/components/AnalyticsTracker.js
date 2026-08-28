/**
 * Centralized Persistent Analytics Engine & Whitelisted Metadata Architecture for STIHLDecoder.nl
 * Phase 32B Production Analytics, SQLite Persistence & Render Disk Migration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseConnection, getDatabaseHealthSnapshot, isPersistentDiskActive } from '../databaseConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

  const eventId = metadata.event_id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  const modelSlug = cleanMetadata.model_slug || cleanMetadata.model || null;
  const pagePath = cleanMetadata.source_page || '/';
  const metadataJson = JSON.stringify(cleanMetadata);
  const createdAt = new Date().toISOString();
  const dbHealth = getDatabaseHealthSnapshot();

  const db = getDatabaseConnection();
  if (!db || !dbHealth.analyticsSchemaReady) {
    console.warn('[AnalyticsTracker] SQLite analytics unavailable or schema not ready.');
    return {
      status: 'UNAVAILABLE',
      eventId,
      eventType,
      reason: db ? 'SCHEMA_NOT_READY' : 'NO_DATABASE_CONNECTION'
    };
  }

  try {
    db.run(
      `INSERT OR IGNORE INTO analytics_events (event_id, event_type, model_slug, page_path, metadata_json, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [eventId, eventType, modelSlug, pagePath, metadataJson, isTest ? 1 : 0, createdAt],
      (err) => {
        if (err) console.error('⚠️ SQLite event insert error:', err.message);
      }
    );
  } catch (err) {
    console.warn('⚠️ SQLite analytics write failed:', err.message);
    return {
      status: 'DB_WRITE_ERROR',
      eventId,
      eventType,
      reason: err.message
    };
  }

  console.log(`[EventTracked-Persistent] ${eventType}`, metadataJson);
  return { status: 'QUEUED', eventId, eventType, isTest };
}

function readAnalyticsEventsFromJson() {
  try {
    if (fs.existsSync(jsonPath)) {
      const dbJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return dbJson.analytics_events || [];
    }
  } catch (e) {}
  return [];
}

export function logStihlEvent(eventName, payload = {}, reqUserAgent = '', isTest = false) {
  return trackEvent(eventName, payload, reqUserAgent, isTest);
}

export function getConversionDashboardMetrics() {
  let events = readAnalyticsEventsFromJson();
  const dbHealth = getDatabaseHealthSnapshot();
  const persistentActive = isPersistentDiskActive();

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

  return {
    status: prodEvents.length > 0 ? 'REAL_PRODUCTION_DATA' : 'NO_PRODUCTION_DATA_YET',
    databasePersistence: persistentActive ? 'PERSISTENT_DISK' : 'EPHEMERAL_FILESYSTEM (Render container storage resets on rebuild)',
    persistentDiskActive: persistentActive,
    databaseHealth: dbHealth.analyticsSchemaReady ? 'READY' : 'MIGRATION_REQUIRED',
    seoFreezeStatus: SEO_CONTENT_FREEZE,
    totalProductionEvents: prodEvents.length,
    totalTestEvents: events.filter(e => e.is_test).length,
    decoderUses,
    modelsIdentified,
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
  let events = readAnalyticsEventsFromJson();

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
