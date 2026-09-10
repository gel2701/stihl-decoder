/**
 * MachineDossierManager.js
 * Browser-safe and Node.js-compatible manager for STIHL Machine Dossiers (Phase 38A).
 * Provides versioned localStorage management, schema validation, safe DOM sinks,
 * and privacy-isolated evidence hydration without transmitting personal data.
 */

export const DOSSIER_STORAGE_KEY = 'stihl_machine_dossiers_v1';
export const DOSSIER_SCHEMA_VERSION = 1;

export const IDENTITY_STATUSES = Object.freeze({
  EXACT_MODEL_IDENTIFIED: 'EXACT_MODEL_IDENTIFIED',
  USER_CONFIRMED_MODEL: 'USER_CONFIRMED_MODEL',
  PROBABLE_MODEL_SERIES: 'PROBABLE_MODEL_SERIES'
});

export const IDENTITY_SOURCES = Object.freeze({
  EXACT_CANONICAL_DECODE: 'EXACT_CANONICAL_DECODE',
  SERIAL_DECODE: 'SERIAL_DECODE',
  SERIAL_DECODE_ASSIST_CONFIRMED: 'SERIAL_DECODE_ASSIST_CONFIRMED',
  USER_CONFIRMED: 'USER_CONFIRMED',
  MODEL_PAGE_SELECTION: 'MODEL_PAGE_SELECTION',
  MANUAL_ENTRY: 'MANUAL_ENTRY'
});

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
 * Validates the structure and version of a machine dossier.
 */
export function validateDossierSchema(dossier) {
  if (!dossier || typeof dossier !== 'object') return false;
  if (dossier.schema_version !== DOSSIER_SCHEMA_VERSION) return false;
  if (!dossier.dossier_id || typeof dossier.dossier_id !== 'string') return false;
  if (!dossier.identity || typeof dossier.identity !== 'object') return false;
  if (!dossier.identity.model_slug || !dossier.identity.model_name) return false;

  const validStatuses = [
    IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
    IDENTITY_STATUSES.USER_CONFIRMED_MODEL
  ];
  if (!validStatuses.includes(dossier.identity.identity_status)) return false;

  if (!dossier.machine || typeof dossier.machine !== 'object') return false;
  if (!dossier.maintenance || typeof dossier.maintenance !== 'object') return false;
  if (!Array.isArray(dossier.maintenance.notes)) return false;

  return true;
}

/**
 * Creates a valid, normalized Machine Dossier object.
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
  const cleanNickname = nickname ? String(nickname).trim().substring(0, 50) : null;
  const cleanYear = pYear ? parseInt(pYear, 10) : null;
  const cleanLastServiceDate = sDate ? String(sDate).trim() : null;
  const newId = generateDossierId();

  const formattedNotes = (notes || []).map((n) => {
    if (typeof n === 'string') {
      return {
        id: 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
        date: new Date().toISOString().split('T')[0],
        text: n,
        category: 'NOTE'
      };
    }
    return n;
  });

  const dossier = {
    schema_version: DOSSIER_SCHEMA_VERSION,
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
      notes: formattedNotes
    },
    created_at: createdAt,
    updated_at: createdAt
  };

  // Top-level aliases for convenience
  dossier.model_slug = dossier.identity.model_slug;
  dossier.model_name = dossier.identity.model_name;
  dossier.identity_status = dossier.identity.identity_status;
  dossier.identity_source = dossier.identity.identity_source;
  dossier.serial_number = dossier.machine.serial_number;
  dossier.nickname = dossier.machine.nickname;
  dossier.purchase_year = dossier.machine.purchase_year;
  dossier.last_service_date = dossier.maintenance.last_service_date;
  dossier.notes = dossier.maintenance.notes;

  return dossier;
}

/**
 * Gets a reference to the active storage provider (localStorage or in-memory mock).
 */
function getStorage(customStorage = null) {
  if (customStorage) return customStorage;
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Reads and validates all dossiers from localStorage.
 * Handles missing key, corrupt JSON, and schema versioning gracefully.
 */
export function loadDossiers(customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return [];

  try {
    const raw = storage.getItem(DOSSIER_STORAGE_KEY);
    if (!raw) return [];

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[MachineDossierManager] Corrupted dossier JSON in storage, resetting to empty array.');
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    // Filter to valid version 1 dossiers and decorate with convenient getters
    return parsed.filter(validateDossierSchema).map((d) => {
      d.id = d.id || d.dossier_id;
      d.model_slug = d.identity.model_slug;
      d.model_name = d.identity.model_name;
      d.identity_status = d.identity.identity_status;
      d.identity_source = d.identity.identity_source;
      d.serial_number = d.machine.serial_number;
      d.nickname = d.machine.nickname;
      d.purchase_year = d.machine.purchase_year;
      d.last_service_date = d.maintenance ? d.maintenance.last_service_date : null;
      d.notes = d.maintenance.notes;
      return d;
    });
  } catch (err) {
    console.warn('[MachineDossierManager] Could not read localStorage:', err.message);
    return [];
  }
}

/**
 * Saves a new or updated dossier into localStorage.
 * Returns { success: boolean, error?: string, dossier?: object }.
 */
export function saveDossier(dossier, customStorage = null) {
  if (!validateDossierSchema(dossier)) {
    return { success: false, error: 'Ongeldig dossierschema.' };
  }

  const storage = getStorage(customStorage);
  if (!storage) {
    return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };
  }

  try {
    const existing = loadDossiers(storage);
    const index = existing.findIndex((d) => d.dossier_id === dossier.dossier_id || d.id === dossier.dossier_id);

    const toSave = {
      ...dossier,
      updated_at: new Date().toISOString()
    };

    if (index >= 0) {
      existing[index] = toSave;
    } else {
      existing.push(toSave);
    }

    storage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(existing));
    return { success: true, dossier: toSave };
  } catch (err) {
    console.error('[MachineDossierManager] Storage write failed:', err);
    return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };
  }
}

/**
 * Deletes a dossier by its unique ID.
 */
export function deleteDossier(dossierId, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  try {
    const existing = loadDossiers(storage);
    const filtered = existing.filter((d) => d.dossier_id !== dossierId && d.id !== dossierId);
    storage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(filtered));
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Verwijderen mislukt.' };
  }
}

/**
 * Updates user-modifiable fields on a dossier without touching official evidence.
 */
export function updateDossierUserData(dossierId, updates = {}, customStorage = null) {
  const storage = getStorage(customStorage);
  if (!storage) return { success: false, error: 'Opslaan op dit apparaat is niet beschikbaar.' };

  const existing = loadDossiers(storage);
  const target = existing.find((d) => d.dossier_id === dossierId || d.id === dossierId);
  if (!target) return { success: false, error: 'Dossier niet gevonden.' };

  if (updates.nickname !== undefined) {
    target.machine.nickname = updates.nickname ? String(updates.nickname).trim().substring(0, 50) : null;
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
    target.maintenance.last_service_date = (serviceDateVal && String(serviceDateVal).trim() !== '') ? String(serviceDateVal).trim() : null;
    target.last_service_date = target.maintenance.last_service_date;
  }

  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
}

/**
 * Adds a maintenance note to a dossier.
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

  const isDate = noteDateOrCategory && /^\d{4}-\d{2}-\d{2}/.test(noteDateOrCategory);
  const dateVal = isDate ? noteDateOrCategory : new Date().toISOString().split('T')[0];
  const categoryVal = (!isDate && noteDateOrCategory) ? String(noteDateOrCategory).trim() : 'NOTE';

  const newNote = {
    id: 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    date: dateVal,
    text: String(noteText).trim().substring(0, 500),
    category: categoryVal
  };

  if (!target.maintenance.notes) {
    target.maintenance.notes = [];
  }
  target.maintenance.notes.unshift(newNote);
  target.updated_at = new Date().toISOString();
  return saveDossier(target, storage);
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
