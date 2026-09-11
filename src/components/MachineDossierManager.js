/**
 * MachineDossierManager.js
 * Browser-safe and Node.js-compatible manager for STIHL Machine Dossiers (Phase 38A & 38B).
 * Provides versioned localStorage management, transactional V1->V2 migration,
 * structured maintenance timeline, user-defined reminders, calendar (.ics) export,
 * atomic JSON backup import/export, and privacy-isolated evidence hydration.
 */

export const DOSSIER_STORAGE_KEY_V1 = 'stihl_machine_dossiers_v1';
export const DOSSIER_STORAGE_KEY_V2 = 'stihl_machine_dossiers_v2';
export const DOSSIER_STORAGE_KEY = DOSSIER_STORAGE_KEY_V2;

export const DOSSIER_SCHEMA_VERSION_V1 = 1;
export const DOSSIER_SCHEMA_VERSION_V2 = 2;
export const DOSSIER_SCHEMA_VERSION = DOSSIER_SCHEMA_VERSION_V2;

export const BACKUP_FORMAT_IDENTIFIER = 'stihldecoder-machine-backup';
export const BACKUP_FORMAT_VERSION = 1;

export const SOON_WINDOW_DAYS = 30;

// Maximum input and storage limits
export const MAX_BACKUP_BYTES = 1024 * 1024; // 1 MB
export const MAX_DOSSIERS = 100;
export const MAX_EVENTS_PER_DOSSIER = 100;
export const MAX_REMINDERS_PER_DOSSIER = 50;
export const MAX_NICKNAME_LENGTH = 50;
export const MAX_LABEL_LENGTH = 100;
export const MAX_NOTE_LENGTH = 500;

export const IDENTITY_STATUSES = Object.freeze({
  EXACT_MODEL_IDENTIFIED: 'EXACT_MODEL_IDENTIFIED',
  USER_CONFIRMED_MODEL: 'USER_CONFIRMED_MODEL',
  PROBABLE_MODEL_SERIES: 'PROBABLE_MODEL_SERIES',
  USER_REPORTED_UNVERIFIED_MODEL: 'USER_REPORTED_UNVERIFIED_MODEL'
});

export const DOSSIER_SAVEABLE_IDENTITY_STATUSES = Object.freeze([
  IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
  IDENTITY_STATUSES.USER_CONFIRMED_MODEL
]);

export const IDENTITY_SOURCES = Object.freeze({
  EXACT_CANONICAL_DECODE: 'EXACT_CANONICAL_DECODE',
  SERIAL_DECODE: 'SERIAL_DECODE',
  SERIAL_DECODE_ASSIST_CONFIRMED: 'SERIAL_DECODE_ASSIST_CONFIRMED',
  USER_CONFIRMED: 'USER_CONFIRMED',
  MODEL_PAGE_SELECTION: 'MODEL_PAGE_SELECTION',
  MANUAL_ENTRY: 'MANUAL_ENTRY'
});

export const MAINTENANCE_EVENT_TYPES = Object.freeze({
  GENERAL_SERVICE: 'GENERAL_SERVICE',
  SPARK_PLUG: 'SPARK_PLUG',
  AIR_FILTER: 'AIR_FILTER',
  FUEL_FILTER: 'FUEL_FILTER',
  CHAIN: 'CHAIN',
  BAR: 'BAR',
  CARBURETOR: 'CARBURETOR',
  FUEL_SYSTEM: 'FUEL_SYSTEM',
  STARTER: 'STARTER',
  CLUTCH: 'CLUTCH',
  CUTTING_ATTACHMENT: 'CUTTING_ATTACHMENT',
  OTHER: 'OTHER'
});

export const REMINDER_STATES = Object.freeze({
  GEPLAND: 'GEPLAND',
  VANDAAG: 'VANDAAG',
  VERLOPEN: 'VERLOPEN',
  AFGEROND: 'AFGEROND'
});

/**
 * Strict calendar date validator. Accepts actual calendar dates in YYYY-MM-DD format.
 * Rejects invalid dates like 2026-02-30, 2026-04-31, 2026-13-01, 0000-00-00.
 */
export function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;
  return true;
}

/**
 * Local calendar date string (YYYY-MM-DD) based on local clock.
 * Zero timezone shifting.
 */
export function getLocalTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Evaluates the status of a reminder against a local calendar date.
 * Uses strict string comparison for YYYY-MM-DD.
 */
export function evaluateReminderState(reminder, todayStr = getLocalTodayString()) {
  if (!reminder || typeof reminder !== 'object') return REMINDER_STATES.GEPLAND;
  if (reminder.completed) return REMINDER_STATES.AFGEROND;
  const dueDate = reminder.due_date;
  if (!dueDate || !isValidCalendarDate(dueDate)) return REMINDER_STATES.GEPLAND;
  if (dueDate < todayStr) return REMINDER_STATES.VERLOPEN;
  if (dueDate === todayStr) return REMINDER_STATES.VANDAAG;
  return REMINDER_STATES.GEPLAND;
}

/**
 * Checks if a reminder due date falls within the upcoming 'soon' window (default 30 days).
 */
export function isWithinSoonWindow(dueDate, todayStr = getLocalTodayString(), windowDays = SOON_WINDOW_DAYS) {
  if (!isValidCalendarDate(dueDate) || !isValidCalendarDate(todayStr)) return false;
  if (dueDate < todayStr) return false; // Overdue is not soon
  const [y, m, d] = todayStr.split('-').map(Number);
  const target = new Date(y, m - 1, d + windowDays);
  const targetStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  return dueDate <= targetStr;
}

/**
 * Calculates effective last service date for UI display.
 * Returns the most recent date between manual_last_service_date and latest maintenance event.
 * NEVER mutates or overwrites stored manual_last_service_date.
 */
export function calculateEffectiveLastServiceDate(dossier) {
  if (!dossier || !dossier.maintenance) return null;
  const manualDate = (dossier.maintenance.last_service_date && isValidCalendarDate(dossier.maintenance.last_service_date))
    ? dossier.maintenance.last_service_date
    : null;
  const events = Array.isArray(dossier.maintenance.events) ? dossier.maintenance.events : [];
  let latestEventDate = null;
  for (const ev of events) {
    if (ev && ev.date && isValidCalendarDate(ev.date)) {
      if (!latestEventDate || ev.date > latestEventDate) {
        latestEventDate = ev.date;
      }
    }
  }
  if (!manualDate) return latestEventDate;
  if (!latestEventDate) return manualDate;
  return latestEventDate > manualDate ? latestEventDate : manualDate;
}

/**
 * Deep recursive check for prototype pollution keys (__proto__, constructor, prototype).
 */
export function hasPrototypePollution(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
      Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
      Object.prototype.hasOwnProperty.call(obj, 'prototype')) {
    return true;
  }
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (hasPrototypePollution(obj[key])) return true;
    }
  }
  return false;
}

/**
 * Generates a unique, non-semantic dossier ID.
 * Never derived from serial, model, or nickname.
 */
export function generateDossierId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Safe non-semantic fallback
  const rand1 = Math.random().toString(36).substring(2, 10);
  const rand2 = Math.random().toString(36).substring(2, 10);
  const rand3 = Math.random().toString(36).substring(2, 10);
  return 'dossier_' + Date.now().toString(36) + '_' + rand1 + rand2 + rand3;
}

/**
 * Validates the structure and version of a machine dossier (V1 or V2).
 */
export function validateDossierSchema(dossier, expectedVersion = DOSSIER_SCHEMA_VERSION_V2) {
  if (!dossier || typeof dossier !== 'object') return false;
  if (dossier.schema_version !== expectedVersion) return false;
  if (!dossier.dossier_id || typeof dossier.dossier_id !== 'string') return false;
  if (!dossier.identity || typeof dossier.identity !== 'object') return false;
  if (!dossier.identity.model_slug || !dossier.identity.model_name) return false;

  if (!DOSSIER_SAVEABLE_IDENTITY_STATUSES.includes(dossier.identity.identity_status)) return false;

  if (!dossier.machine || typeof dossier.machine !== 'object') return false;
  if (!dossier.maintenance || typeof dossier.maintenance !== 'object') return false;
  if (!Array.isArray(dossier.maintenance.notes)) return false;

  if (expectedVersion === DOSSIER_SCHEMA_VERSION_V2) {
    if (!Array.isArray(dossier.maintenance.events)) return false;
    if (!Array.isArray(dossier.maintenance.reminders)) return false;
  }

  return true;
}

/**
 * Validates a single V1 dossier object for migration purposes.
 */
function validateV1Dossier(dossier) {
  return validateDossierSchema(dossier, DOSSIER_SCHEMA_VERSION_V1);
}

/**
 * Creates a valid, normalized Machine Dossier object (V2 schema).
 */
export function createDossierObject({
  modelSlug,
  model_slug,
  modelName,
  model_name,
  category,
  seriesCode = null,
  series_code = null,
  identityStatus,
  identity_status,
  identitySource,
  identity_source,
  serialNumber = null,
  serial_number = null,
  nickname = null,
  purchaseYear = null,
  purchase_year = null,
  lastServiceDate = null,
  last_service_date = null,
  maintenance = null,
  notes = [],
  events = [],
  reminders = [],
  createdAt = new Date().toISOString()
}) {
  const mSlug = modelSlug || model_slug;
  const mName = modelName || model_name;
  const idStatus = identityStatus || identity_status;
  const idSource = identitySource || identity_source;
  const sNum = serialNumber != null ? serialNumber : serial_number;
  const pYear = purchaseYear != null ? purchaseYear : purchase_year;
  const sCode = seriesCode || series_code;
  const sDate = lastServiceDate || last_service_date || (maintenance && maintenance.last_service_date);

  if (idStatus === IDENTITY_STATUSES.PROBABLE_MODEL_SERIES) {
    throw new Error('Cannot create final dossier from unconfirmed PROBABLE_MODEL_SERIES.');
  }

  const validStatuses = [
    IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
    IDENTITY_STATUSES.USER_CONFIRMED_MODEL
  ];
  if (!validStatuses.includes(idStatus)) {
    throw new Error(`Invalid identity status: ${idStatus}`);
  }

  // Model page selection must always be USER_CONFIRMED_MODEL
  if (idSource === IDENTITY_SOURCES.MODEL_PAGE_SELECTION && idStatus !== IDENTITY_STATUSES.USER_CONFIRMED_MODEL) {
    throw new Error('Model page selection must have USER_CONFIRMED_MODEL identity status.');
  }

  const cleanSerial = sNum ? String(sNum).trim().substring(0, 30) : null;
  const cleanNickname = nickname ? String(nickname).trim().substring(0, MAX_NICKNAME_LENGTH) : null;
  const cleanYear = pYear ? parseInt(pYear, 10) : null;
  const cleanLastServiceDate = (sDate && isValidCalendarDate(String(sDate).trim())) ? String(sDate).trim() : null;
  const newId = generateDossierId();

  const formattedNotes = (notes || []).map((n) => {
    if (typeof n === 'string') {
      return {
        id: 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
        date: getLocalTodayString(),
        text: String(n).trim().substring(0, MAX_NOTE_LENGTH),
        category: 'NOTE'
      };
    }
    return {
      id: n.id || ('note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)),
      date: isValidCalendarDate(n.date) ? n.date : getLocalTodayString(),
      text: String(n.text || '').trim().substring(0, MAX_NOTE_LENGTH),
      category: n.category ? String(n.category).trim() : 'NOTE'
    };
  });

  const dossier = {
    schema_version: DOSSIER_SCHEMA_VERSION_V2,
    dossier_id: newId,
    id: newId,
    identity: {
      model_slug: String(mSlug).trim().toLowerCase(),
      model_name: String(mName).trim(),
      category: category ? String(category).trim() : 'Onbekend',
      series_code: sCode ? String(sCode).trim() : null,
      identity_status: idStatus,
      identity_source: idSource || (idStatus === IDENTITY_STATUSES.USER_CONFIRMED_MODEL ? IDENTITY_SOURCES.USER_CONFIRMED : IDENTITY_SOURCES.EXACT_CANONICAL_DECODE)
    },
    machine: {
      serial_number: cleanSerial || null,
      nickname: cleanNickname || null,
      purchase_year: cleanYear && !isNaN(cleanYear) ? cleanYear : null
    },
    maintenance: {
      last_service_date: cleanLastServiceDate || null,
      notes: formattedNotes,
      events: Array.isArray(events) ? events.slice(0, MAX_EVENTS_PER_DOSSIER) : [],
      reminders: Array.isArray(reminders) ? reminders.slice(0, MAX_REMINDERS_PER_DOSSIER) : []
    },
    created_at: createdAt,
    updated_at: createdAt
  };

  // Top-level convenience getters (not source of truth)
  decorateDossierAliases(dossier);

  return dossier;
}

/**
 * Decorates a dossier object with read-time convenience aliases.
 * Source of truth remains strictly nested under identity, machine, maintenance.
 */
function decorateDossierAliases(d) {
  d.id = d.dossier_id;
  d.model_slug = d.identity.model_slug;
  d.model_name = d.identity.model_name;
  d.category = d.identity.category;
  d.series_code = d.identity.series_code;
  d.identity_status = d.identity.identity_status;
  d.identity_source = d.identity.identity_source;
  d.serial_number = d.machine.serial_number;
  d.nickname = d.machine.nickname;
  d.purchase_year = d.machine.purchase_year;
  d.manual_last_service_date = d.maintenance.last_service_date;
  d.effective_last_service_date = calculateEffectiveLastServiceDate(d);
  d.last_service_date = d.maintenance.last_service_date;
  d.notes = d.maintenance.notes;
  d.events = d.maintenance.events;
  d.reminders = d.maintenance.reminders;
  return d;
}

/**
 * Gets a reference to the active storage provider.
 */
function getStorage(customStorage = null) {
  if (customStorage) return customStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

/**
 * Transactional migration from V1 to V2 schema.
 * Condition: executes ONLY when V2 key is completely absent (storage.getItem(V2_KEY) === null).
 * If V2 key exists (even if empty [] or corrupted), migration is strictly skipped.
 * V1 notes are never promoted to events.
 * V1 user values and identity semantics are 100% preserved.
 * V1 key is removed ONLY after V2 write and read-back validation succeed.
 */
export function migrateV1ToV2(storage) {
  if (!storage) return { success: false, reason: 'NO_STORAGE' };

  try {
    // Rule 6: Migrate ONLY when V2 key is absent
    if (storage.getItem(DOSSIER_STORAGE_KEY_V2) !== null) {
      return { success: true, migrated: false, reason: 'V2_KEY_ALREADY_EXISTS' };
    }

    const rawV1 = storage.getItem(DOSSIER_STORAGE_KEY_V1);
    if (rawV1 === null) {
      // Neither V1 nor V2 exists
      return { success: true, migrated: false, reason: 'NO_V1_DATA' };
    }

    let parsedV1;
    try {
      parsedV1 = JSON.parse(rawV1);
    } catch {
      return { success: false, migrated: false, reason: 'V1_CORRUPT_JSON' };
    }

    if (!Array.isArray(parsedV1)) {
      return { success: false, migrated: false, reason: 'V1_NOT_AN_ARRAY' };
    }

    // Filter and transform valid V1 items
    const v2Candidates = [];
    for (const item of parsedV1) {
      if (!validateV1Dossier(item)) continue;

      const v2 = {
        schema_version: DOSSIER_SCHEMA_VERSION_V2,
        dossier_id: item.dossier_id,
        id: item.dossier_id,
        identity: {
          model_slug: item.identity.model_slug,
          model_name: item.identity.model_name,
          category: item.identity.category || 'Onbekend',
          series_code: item.identity.series_code || null,
          identity_status: item.identity.identity_status,
          identity_source: item.identity.identity_source
        },
        machine: {
          serial_number: item.machine ? item.machine.serial_number : null,
          nickname: item.machine ? item.machine.nickname : null,
          purchase_year: item.machine ? item.machine.purchase_year : null
        },
        maintenance: {
          last_service_date: item.maintenance ? item.maintenance.last_service_date : null,
          notes: (item.maintenance && Array.isArray(item.maintenance.notes)) ? item.maintenance.notes : [],
          events: [], // Rule 5: NEVER auto-promote notes to events
          reminders: []
        },
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString()
      };

      if (!validateDossierSchema(v2, DOSSIER_SCHEMA_VERSION_V2)) {
        return { success: false, migrated: false, reason: 'V2_CANDIDATE_INVALID' };
      }

      v2Candidates.push(v2);
    }

    // Transactional step: write V2 once
    try {
      const v2Json = JSON.stringify(v2Candidates);
      storage.setItem(DOSSIER_STORAGE_KEY_V2, v2Json);

      // Read back and verify
      const readBack = storage.getItem(DOSSIER_STORAGE_KEY_V2);
      if (!readBack) throw new Error('V2 read-back verification failed');
      const parsedReadBack = JSON.parse(readBack);
      if (!Array.isArray(parsedReadBack) || parsedReadBack.length !== v2Candidates.length) {
        throw new Error('V2 read-back integrity mismatch');
      }

      // Success: Rule 9 clean up legacy V1 key
      storage.removeItem(DOSSIER_STORAGE_KEY_V1);
      return { success: true, migrated: true, count: v2Candidates.length };
    } catch (err) {
      // If V2 write/readback fails, Rule 9: DO NOT delete V1
      return { success: false, migrated: false, error: err.message };
    }
  } catch (err) {
    return { success: false, migrated: false, reason: 'STORAGE_ACCESS_ERROR', error: err.message };
  }
}

/**
 * Reads and validates all dossiers from localStorage.
 * Automatically performs transactional V1->V2 migration when V2 is absent.
 */
export function loadDossiers(customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return [];

  // Attempt migration if V2 does not exist
  try {
    migrateV1ToV2(storage);
  } catch {
    // Gracefully handle storage access restrictions
  }

  try {
    const raw = storage.getItem(DOSSIER_STORAGE_KEY_V2);
    if (!raw) return [];

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[MachineDossierManager] Corrupted V2 dossier JSON in storage, returning empty array.');
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    // Filter to valid V2 dossiers and decorate with convenience aliases
    return parsed
      .filter((d) => validateDossierSchema(d, DOSSIER_SCHEMA_VERSION_V2))
      .map(decorateDossierAliases);
  } catch (err) {
    console.warn('[MachineDossierManager] Could not read localStorage:', err.message);
    return [];
  }
}

/**
 * Saves a new or updated dossier into localStorage.
 * Atomic and quota-safe.
 */
export function saveDossier(dossier, customStorage = null) {
  if (!validateDossierSchema(dossier, DOSSIER_SCHEMA_VERSION_V2)) {
    return { success: false, error: 'Ongeldig dossierschema.' };
  }

  const storage = getStorage(customStorage);
  if (!storage) {
    return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };
  }

  // Backup existing raw string for quota rollback
  const previousRaw = storage.getItem(DOSSIER_STORAGE_KEY_V2);

  try {
    const existing = loadDossiers(storage);
    const index = existing.findIndex((d) => d.dossier_id === dossier.dossier_id || d.id === dossier.dossier_id);

    // Prepare clean canonical object to save (strip top-level aliases to prevent diverging duplicate truth)
    const cleanToSave = {
      schema_version: DOSSIER_SCHEMA_VERSION_V2,
      dossier_id: dossier.dossier_id,
      id: dossier.dossier_id,
      identity: {
        model_slug: dossier.identity.model_slug,
        model_name: dossier.identity.model_name,
        category: dossier.identity.category,
        series_code: dossier.identity.series_code,
        identity_status: dossier.identity.identity_status,
        identity_source: dossier.identity.identity_source
      },
      machine: {
        serial_number: dossier.machine.serial_number,
        nickname: dossier.machine.nickname,
        purchase_year: dossier.machine.purchase_year
      },
      maintenance: {
        last_service_date: dossier.maintenance.last_service_date,
        notes: Array.isArray(dossier.maintenance.notes) ? dossier.maintenance.notes : [],
        events: Array.isArray(dossier.maintenance.events) ? dossier.maintenance.events : [],
        reminders: Array.isArray(dossier.maintenance.reminders) ? dossier.maintenance.reminders : []
      },
      created_at: dossier.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (index >= 0) {
      existing[index] = cleanToSave;
    } else {
      if (existing.length >= MAX_DOSSIERS) {
        return { success: false, error: `Maximum aantal van ${MAX_DOSSIERS} machines bereikt.` };
      }
      existing.push(cleanToSave);
    }

    storage.setItem(DOSSIER_STORAGE_KEY_V2, JSON.stringify(existing));
    return { success: true, dossier: decorateDossierAliases(cleanToSave) };
  } catch (err) {
    // Rollback storage to previous valid state safely
    try {
      if (previousRaw !== null) {
        storage.setItem(DOSSIER_STORAGE_KEY_V2, previousRaw);
      } else {
        storage.removeItem(DOSSIER_STORAGE_KEY_V2);
      }
    } catch {}
    console.error('[MachineDossierManager] Storage write failed:', err);
    return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar (geheugen vol of fout).' };
  }
}

/**
 * Deletes a dossier by its unique ID.
 */
export function deleteDossier(dossierId, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const previousRaw = storage.getItem(DOSSIER_STORAGE_KEY_V2);

  try {
    const existing = loadDossiers(storage);
    const filtered = existing
      .filter((d) => d.dossier_id !== dossierId && d.id !== dossierId)
      .map((d) => ({
        schema_version: DOSSIER_SCHEMA_VERSION_V2,
        dossier_id: d.dossier_id,
        id: d.dossier_id,
        identity: d.identity,
        machine: d.machine,
        maintenance: d.maintenance,
        created_at: d.created_at,
        updated_at: d.updated_at
      }));

    storage.setItem(DOSSIER_STORAGE_KEY_V2, JSON.stringify(filtered));
    return { success: true };
  } catch (err) {
    if (previousRaw !== null) storage.setItem(DOSSIER_STORAGE_KEY_V2, previousRaw);
    return { success: false, error: 'Verwijderen mislukt.' };
  }
}

/**
 * Updates user-modifiable machine details without touching evidence.
 */
export function updateDossierUserData(dossierId, updates = {}, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target) return { success: false, error: 'Dossier niet gevonden.' };

  if (updates.nickname !== undefined) {
    target.machine.nickname = updates.nickname ? String(updates.nickname).trim().substring(0, MAX_NICKNAME_LENGTH) : null;
  }
  if (updates.serial_number !== undefined) {
    target.machine.serial_number = updates.serial_number ? String(updates.serial_number).trim().substring(0, 30) : null;
  }
  const yearVal = updates.purchase_year !== undefined ? updates.purchase_year : updates.purchaseYear;
  if (yearVal !== undefined) {
    const y = parseInt(yearVal, 10);
    target.machine.purchase_year = !isNaN(y) ? y : null;
  }
  const serviceDateVal = updates.last_service_date !== undefined
    ? updates.last_service_date
    : (updates.lastServiceDate !== undefined
        ? updates.lastServiceDate
        : (updates.maintenance && updates.maintenance.last_service_date !== undefined ? updates.maintenance.last_service_date : undefined));
  if (serviceDateVal !== undefined) {
    const cleanDate = serviceDateVal ? String(serviceDateVal).trim() : null;
    target.maintenance.last_service_date = (cleanDate && isValidCalendarDate(cleanDate)) ? cleanDate : null;
  }

  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Adds a generic user note to a dossier.
 */
export function addDossierNote(dossierId, noteText, noteDateOrCategory = null, customStorage = null) {
  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    return { success: false, error: 'Notitietekst mag niet leeg zijn.' };
  }

  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target) return { success: false, error: 'Dossier niet gevonden.' };

  const isDate = noteDateOrCategory && isValidCalendarDate(noteDateOrCategory);
  const dateVal = isDate ? noteDateOrCategory : getLocalTodayString();
  const categoryVal = (!isDate && noteDateOrCategory) ? String(noteDateOrCategory).trim() : 'NOTE';

  const newNote = {
    id: 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    date: dateVal,
    text: String(noteText).trim().substring(0, MAX_NOTE_LENGTH),
    category: categoryVal
  };

  if (!target.maintenance.notes) target.maintenance.notes = [];
  target.maintenance.notes.unshift(newNote);
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Adds a structured maintenance event.
 * Never overwrites manual_last_service_date.
 */
export function addMaintenanceEvent(dossierId, { date, type, label, note }, customStorage = null) {
  if (!isValidCalendarDate(date)) {
    return { success: false, error: 'Ongeldige onderhoudsdatum.' };
  }
  const eventType = MAINTENANCE_EVENT_TYPES[type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE;
  const cleanLabel = label ? String(label).trim().substring(0, MAX_LABEL_LENGTH) : 'Onderhoud uitgevoerd';
  const cleanNote = note ? String(note).trim().substring(0, MAX_NOTE_LENGTH) : null;

  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target) return { success: false, error: 'Dossier niet gevonden.' };

  if (!Array.isArray(target.maintenance.events)) target.maintenance.events = [];
  if (target.maintenance.events.length >= MAX_EVENTS_PER_DOSSIER) {
    return { success: false, error: `Maximum van ${MAX_EVENTS_PER_DOSSIER} onderhoudsacties bereikt.` };
  }

  const newEvent = {
    id: 'event_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    date,
    type: eventType,
    label: cleanLabel,
    note: cleanNote,
    source: 'USER_PROVIDED'
  };

  // Add and maintain descending chronological order (newest first)
  target.maintenance.events.push(newEvent);
  target.maintenance.events.sort((a, b) => b.date.localeCompare(a.date));
  target.updated_at = new Date().toISOString();

  return saveDossier(target, storage);
}

/**
 * Updates an existing maintenance event.
 */
export function updateMaintenanceEvent(dossierId, eventId, updates = {}, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target || !Array.isArray(target.maintenance.events)) return { success: false, error: 'Dossier of actie niet gevonden.' };

  const event = target.maintenance.events.find((e) => e.id === eventId);
  if (!event) return { success: false, error: 'Onderhoudsactie niet gevonden.' };

  if (updates.date !== undefined) {
    if (!isValidCalendarDate(updates.date)) return { success: false, error: 'Ongeldige onderhoudsdatum.' };
    event.date = updates.date;
  }
  if (updates.type !== undefined) {
    event.type = MAINTENANCE_EVENT_TYPES[updates.type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE;
  }
  if (updates.label !== undefined) {
    event.label = String(updates.label).trim().substring(0, MAX_LABEL_LENGTH);
  }
  if (updates.note !== undefined) {
    event.note = updates.note ? String(updates.note).trim().substring(0, MAX_NOTE_LENGTH) : null;
  }

  target.maintenance.events.sort((a, b) => b.date.localeCompare(a.date));
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Deletes a maintenance event from a dossier.
 */
export function deleteMaintenanceEvent(dossierId, eventId, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target || !Array.isArray(target.maintenance.events)) return { success: false, error: 'Dossier niet gevonden.' };

  target.maintenance.events = target.maintenance.events.filter((e) => e.id !== eventId);
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Adds a user-defined reminder.
 * Reminder date is strictly chosen by user (zero interval inference).
 */
export function addReminder(dossierId, { dueDate, due_date, type, label, note }, customStorage = null) {
  const dateVal = dueDate || due_date;
  if (!isValidCalendarDate(dateVal)) {
    return { success: false, error: 'Ongeldige herinneringsdatum.' };
  }
  const remType = MAINTENANCE_EVENT_TYPES[type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE;
  const cleanLabel = label ? String(label).trim().substring(0, MAX_LABEL_LENGTH) : 'Gepland onderhoud';
  const cleanNote = note ? String(note).trim().substring(0, MAX_NOTE_LENGTH) : null;

  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target) return { success: false, error: 'Dossier niet gevonden.' };

  if (!Array.isArray(target.maintenance.reminders)) target.maintenance.reminders = [];
  if (target.maintenance.reminders.length >= MAX_REMINDERS_PER_DOSSIER) {
    return { success: false, error: `Maximum van ${MAX_REMINDERS_PER_DOSSIER} herinneringen bereikt.` };
  }

  const newReminder = {
    id: 'rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    due_date: dateVal,
    type: remType,
    label: cleanLabel,
    note: cleanNote,
    source: 'USER_PROVIDED',
    completed: false,
    completed_at: null
  };

  target.maintenance.reminders.push(newReminder);
  target.maintenance.reminders.sort((a, b) => a.due_date.localeCompare(b.due_date));
  target.updated_at = new Date().toISOString();

  return saveDossier(target, storage);
}

/**
 * Updates a reminder.
 */
export function updateReminder(dossierId, reminderId, updates = {}, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target || !Array.isArray(target.maintenance.reminders)) return { success: false, error: 'Dossier niet gevonden.' };

  const rem = target.maintenance.reminders.find((r) => r.id === reminderId);
  if (!rem) return { success: false, error: 'Herinnering niet gevonden.' };

  if (updates.due_date !== undefined || updates.dueDate !== undefined) {
    const dVal = updates.due_date !== undefined ? updates.due_date : updates.dueDate;
    if (!isValidCalendarDate(dVal)) return { success: false, error: 'Ongeldige herinneringsdatum.' };
    rem.due_date = dVal;
  }
  if (updates.type !== undefined) {
    rem.type = MAINTENANCE_EVENT_TYPES[updates.type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE;
  }
  if (updates.label !== undefined) {
    rem.label = String(updates.label).trim().substring(0, MAX_LABEL_LENGTH);
  }
  if (updates.note !== undefined) {
    rem.note = updates.note ? String(updates.note).trim().substring(0, MAX_NOTE_LENGTH) : null;
  }

  target.maintenance.reminders.sort((a, b) => a.due_date.localeCompare(b.due_date));
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Deletes a reminder.
 */
export function deleteReminder(dossierId, reminderId, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target || !Array.isArray(target.maintenance.reminders)) return { success: false, error: 'Dossier niet gevonden.' };

  target.maintenance.reminders = target.maintenance.reminders.filter((r) => r.id !== reminderId);
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Completes a reminder.
 * By default, completion does NOT automatically prove maintenance occurred.
 * If createEvent is true, explicitly creates an event with specified eventDate (or local today).
 */
export function completeReminder(dossierId, reminderId, { createEvent = false, eventDate = null, eventNote = null } = {}, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target || !Array.isArray(target.maintenance.reminders)) return { success: false, error: 'Dossier niet gevonden.' };

  const rem = target.maintenance.reminders.find((r) => r.id === reminderId);
  if (!rem) return { success: false, error: 'Herinnering niet gevonden.' };

  const todayStr = getLocalTodayString();
  rem.completed = true;
  rem.completed_at = todayStr;

  if (createEvent) {
    const chosenDate = (eventDate && isValidCalendarDate(eventDate)) ? eventDate : todayStr;
    const newEvent = {
      id: 'event_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      date: chosenDate,
      type: rem.type,
      label: rem.label || 'Onderhoud uitgevoerd',
      note: eventNote !== null && eventNote !== undefined ? String(eventNote).trim().substring(0, MAX_NOTE_LENGTH) : rem.note,
      source: 'USER_PROVIDED'
    };
    if (!Array.isArray(target.maintenance.events)) target.maintenance.events = [];
    target.maintenance.events.push(newEvent);
    target.maintenance.events.sort((a, b) => b.date.localeCompare(a.date));
  }

  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Escapes text for RFC 5545 iCalendar values.
 */
export function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string for an all-day reminder.
 * Default summary: "Onderhoud STIHL <Model>".
 * Does NOT include serial numbers or private user notes by default.
 */
export function generateReminderIcs({ modelName, dueDate, type, label, uidOverride = null, dtstampOverride = null }) {
  if (!isValidCalendarDate(dueDate)) {
    throw new Error('Ongeldige datum voor kalenderexport');
  }
  const cleanModel = modelName ? String(modelName).trim() : 'Machine';
  const cleanDueDate = dueDate.replace(/-/g, ''); // YYYYMMDD
  const now = new Date();
  const dtstamp = dtstampOverride || (now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
  const uid = uidOverride || ('rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9) + '@stihldecoder.nl');
  const summary = escapeIcsText(`Onderhoud STIHL ${cleanModel}`);
  const description = escapeIcsText(label ? `Gepland: ${label}` : 'Gepland machine-onderhoud via STIHLDecoder');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//STIHLDecoder//Machine Dossier//NL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${cleanDueDate}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n') + '\r\n';
}

/**
 * Exports stored user dossiers as a versioned JSON backup.
 * Excludes all technical evidence and official source snapshots.
 */
export function exportDossierBackup(customStorage = null, exportedAt = new Date().toISOString()) {
  const dossiers = loadDossiers(customStorage);

  const cleanDossiers = dossiers.map((d) => ({
    schema_version: DOSSIER_SCHEMA_VERSION_V2,
    dossier_id: d.dossier_id,
    id: d.dossier_id,
    identity: {
      model_slug: d.identity.model_slug,
      model_name: d.identity.model_name,
      category: d.identity.category,
      series_code: d.identity.series_code,
      identity_status: d.identity.identity_status,
      identity_source: d.identity.identity_source
    },
    machine: {
      serial_number: d.machine.serial_number,
      nickname: d.machine.nickname,
      purchase_year: d.machine.purchase_year
    },
    maintenance: {
      last_service_date: d.maintenance.last_service_date,
      notes: Array.isArray(d.maintenance.notes) ? d.maintenance.notes : [],
      events: Array.isArray(d.maintenance.events) ? d.maintenance.events : [],
      reminders: Array.isArray(d.maintenance.reminders) ? d.maintenance.reminders : []
    },
    created_at: d.created_at,
    updated_at: d.updated_at
  }));

  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    version: BACKUP_FORMAT_VERSION,
    exported_at: exportedAt,
    dossiers: cleanDossiers
  };
}

/**
 * Validates a backup payload against security and schema constraints.
 * Protects against oversized input, prototype pollution, malformed objects, and invalid models.
 */
export function validateBackupPayload(backupData) {
  if (!backupData || typeof backupData !== 'object') {
    return { valid: false, error: 'Ongeldig back-upformaat.' };
  }
  if (hasPrototypePollution(backupData)) {
    return { valid: false, error: 'Beveiligingsfout in back-upbestand.' };
  }
  if (backupData.format !== BACKUP_FORMAT_IDENTIFIER) {
    return { valid: false, error: 'Onbekend back-upformaat.' };
  }
  if (backupData.version !== BACKUP_FORMAT_VERSION) {
    return { valid: false, error: 'Niet-ondersteunde back-upversie.' };
  }
  if (!Array.isArray(backupData.dossiers)) {
    return { valid: false, error: 'Dossierlijst ontbreekt in back-up.' };
  }
  if (backupData.dossiers.length > MAX_DOSSIERS) {
    return { valid: false, error: `Te veel dossiers in back-up (maximaal ${MAX_DOSSIERS}).` };
  }

  const validStatuses = [
    IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
    IDENTITY_STATUSES.USER_CONFIRMED_MODEL
  ];

  for (let i = 0; i < backupData.dossiers.length; i++) {
    const d = backupData.dossiers[i];
    if (!d || typeof d !== 'object') {
      return { valid: false, error: `Dossier #${i + 1} is ongeldig.` };
    }
    if (!d.dossier_id && !d.id) {
      return { valid: false, error: `Dossier #${i + 1} mist een identificatiecode.` };
    }
    if (!d.identity || typeof d.identity !== 'object') {
      return { valid: false, error: `Dossier #${i + 1} mist machine-identiteit.` };
    }
    if (!d.identity.model_slug || !d.identity.model_name) {
      return { valid: false, error: `Dossier #${i + 1} heeft geen geldig machinemodel.` };
    }
    if (!validStatuses.includes(d.identity.identity_status)) {
      return { valid: false, error: `Dossier #${i + 1} heeft een ongeldige identiteitsstatus (${d.identity.identity_status}).` };
    }
    if (!d.machine || typeof d.machine !== 'object') {
      return { valid: false, error: `Dossier #${i + 1} mist machinedetails.` };
    }
    if (!d.maintenance || typeof d.maintenance !== 'object') {
      return { valid: false, error: `Dossier #${i + 1} mist onderhoudsgegevens.` };
    }
    if (d.maintenance.events && (!Array.isArray(d.maintenance.events) || d.maintenance.events.length > MAX_EVENTS_PER_DOSSIER)) {
      return { valid: false, error: `Dossier #${i + 1} overschrijdt het maximum aantal onderhoudsacties.` };
    }
    if (d.maintenance.reminders && (!Array.isArray(d.maintenance.reminders) || d.maintenance.reminders.length > MAX_REMINDERS_PER_DOSSIER)) {
      return { valid: false, error: `Dossier #${i + 1} overschrijdt het maximum aantal herinneringen.` };
    }
  }

  return { valid: true };
}

/**
 * Atomically imports a backup payload into localStorage.
 * Builds resulting candidate array strictly field-by-field.
 * Resolves ID collisions with new random UUIDs.
 * If validation fails or storage quota is exceeded, writes nothing.
 */
export function importDossierBackup(backupInput, customStorage = null) {
  let parsed;

  if (typeof backupInput === 'string') {
    const byteLength = (typeof Buffer !== 'undefined')
      ? Buffer.byteLength(backupInput, 'utf8')
      : new TextEncoder().encode(backupInput).length;

    if (byteLength > MAX_BACKUP_BYTES) {
      return { success: false, error: 'Back-upbestand is te groot (maximaal 1 MB).' };
    }

    try {
      parsed = JSON.parse(backupInput);
    } catch {
      return { success: false, error: 'Ongeldig JSON-bestand.' };
    }
  } else if (backupInput && typeof backupInput === 'object') {
    parsed = backupInput;
  } else {
    return { success: false, error: 'Ongeldige invoer voor back-up.' };
  }

  const validation = validateBackupPayload(parsed);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const storage = getStorage(customStorage);
  if (!storage) {
    return { success: false, error: 'Opslag op dit apparaat niet beschikbaar.' };
  }

  const previousRaw = storage.getItem(DOSSIER_STORAGE_KEY_V2);
  const existing = loadDossiers(storage);
  const existingIdSet = new Set(existing.map((d) => d.dossier_id));
  const importedIdSet = new Set();

  const safeImported = [];

  for (const item of parsed.dossiers) {
    let candidateId = item.dossier_id || item.id;
    // Rule 30: Detect collision against existing storage and within backup set
    if (!candidateId || existingIdSet.has(candidateId) || importedIdSet.has(candidateId)) {
      candidateId = generateDossierId();
    }
    importedIdSet.add(candidateId);

    const cleanEvents = (Array.isArray(item.maintenance.events) ? item.maintenance.events : []).map((e) => ({
      id: e.id || ('event_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)),
      date: isValidCalendarDate(e.date) ? e.date : getLocalTodayString(),
      type: MAINTENANCE_EVENT_TYPES[e.type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE,
      label: e.label ? String(e.label).trim().substring(0, MAX_LABEL_LENGTH) : 'Onderhoud uitgevoerd',
      note: e.note ? String(e.note).trim().substring(0, MAX_NOTE_LENGTH) : null,
      source: 'USER_PROVIDED'
    }));

    const cleanReminders = (Array.isArray(item.maintenance.reminders) ? item.maintenance.reminders : []).map((r) => ({
      id: r.id || ('rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)),
      due_date: isValidCalendarDate(r.due_date) ? r.due_date : getLocalTodayString(),
      type: MAINTENANCE_EVENT_TYPES[r.type] || MAINTENANCE_EVENT_TYPES.GENERAL_SERVICE,
      label: r.label ? String(r.label).trim().substring(0, MAX_LABEL_LENGTH) : 'Gepland onderhoud',
      note: r.note ? String(r.note).trim().substring(0, MAX_NOTE_LENGTH) : null,
      source: 'USER_PROVIDED',
      completed: Boolean(r.completed),
      completed_at: isValidCalendarDate(r.completed_at) ? r.completed_at : null
    }));

    const cleanNotes = (Array.isArray(item.maintenance.notes) ? item.maintenance.notes : []).map((n) => ({
      id: n.id || ('note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)),
      date: isValidCalendarDate(n.date) ? n.date : getLocalTodayString(),
      text: String(n.text || '').trim().substring(0, MAX_NOTE_LENGTH),
      category: n.category ? String(n.category).trim() : 'NOTE'
    }));

    const cleanDossier = {
      schema_version: DOSSIER_SCHEMA_VERSION_V2,
      dossier_id: candidateId,
      id: candidateId,
      identity: {
        model_slug: String(item.identity.model_slug).trim().toLowerCase(),
        model_name: String(item.identity.model_name).trim(),
        category: item.identity.category ? String(item.identity.category).trim() : 'Onbekend',
        series_code: item.identity.series_code ? String(item.identity.series_code).trim() : null,
        identity_status: item.identity.identity_status,
        identity_source: item.identity.identity_source
      },
      machine: {
        serial_number: item.machine.serial_number ? String(item.machine.serial_number).trim().substring(0, 30) : null,
        nickname: item.machine.nickname ? String(item.machine.nickname).trim().substring(0, MAX_NICKNAME_LENGTH) : null,
        purchase_year: item.machine.purchase_year ? parseInt(item.machine.purchase_year, 10) : null
      },
      maintenance: {
        last_service_date: (item.maintenance.last_service_date && isValidCalendarDate(item.maintenance.last_service_date))
          ? item.maintenance.last_service_date
          : null,
        notes: cleanNotes,
        events: cleanEvents,
        reminders: cleanReminders
      },
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    safeImported.push(cleanDossier);
  }

  // Combined candidate list
  const totalCombined = existing.concat(safeImported).map((d) => ({
    schema_version: DOSSIER_SCHEMA_VERSION_V2,
    dossier_id: d.dossier_id,
    id: d.dossier_id,
    identity: d.identity,
    machine: d.machine,
    maintenance: d.maintenance,
    created_at: d.created_at,
    updated_at: d.updated_at
  }));

  if (totalCombined.length > MAX_DOSSIERS) {
    return { success: false, error: `Import zou het maximum van ${MAX_DOSSIERS} machines overschrijden.` };
  }

  // Atomic write with quota protection
  try {
    storage.setItem(DOSSIER_STORAGE_KEY_V2, JSON.stringify(totalCombined));
    return { success: true, importedCount: safeImported.length, totalCount: totalCombined.length };
  } catch (err) {
    try {
      if (previousRaw !== null) storage.setItem(DOSSIER_STORAGE_KEY_V2, previousRaw);
    } catch {}
    return { success: false, error: 'Import mislukt: onvoldoende opslagruimte op dit apparaat.' };
  }
}

/**
 * Hydrates official evidence at read-time using ONLY the model_slug.
 * NEVER transmits serial numbers, nicknames, purchase year, or notes.
 */
export async function hydrateDossierEvidence(dossier, fetchFn = null) {
  if (!dossier || !dossier.identity || !dossier.identity.model_slug) {
    return { success: false, error: 'Geen model-identiteit aanwezig.' };
  }

  const modelSlug = dossier.identity.model_slug;
  const fn = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

  if (!fn) {
    return { success: false, error: 'Fetch API niet beschikbaar.' };
  }

  try {
    // Privacy guarantee: request contains ONLY the model_slug
    const url = `/api/decode?code=${encodeURIComponent(modelSlug)}`;
    const response = await fn(url);
    if (!response.ok) {
      return { success: false, error: 'Officiële gegevens tijdelijk niet beschikbaar' };
    }
    const data = await response.json();

    if (!data || !data.success) {
      return { success: false, error: 'Officiële gegevens tijdelijk niet beschikbaar' };
    }

    return {
      success: true,
      evidence: {
        model: data.model || dossier.identity.model_name,
        category: data.category || dossier.identity.category,
        sourceStatus: data.sourceStatus,
        sourceStatusLabel: data.sourceStatusLabel,
        technicalSpecs: data.technicalSpecs || {},
        publicEvidenceFields: data.publicEvidenceFields || {},
        publicEvidenceSummary: data.publicEvidenceSummary || null,
        driveClassification: data.driveClassification || null
      }
    };
  } catch (err) {
    return { success: false, error: 'Officiële gegevens tijdelijk niet beschikbaar' };
  }
}

/**
 * Safe DOM text rendering helper: Sets textContent on an element.
 * Guaranteed zero innerHTML injection for user-provided data.
 */
export function setSafeText(element, text, fallback = '—') {
  if (!element) return;
  element.textContent = text !== null && text !== undefined && String(text).trim() !== '' ? String(text) : fallback;
}
