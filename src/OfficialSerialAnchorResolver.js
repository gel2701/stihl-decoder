import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAnchorsPath = path.resolve(__dirname, '..', 'data', 'official_serial_anchors.json');

let cachedAnchors = null;

function loadDefaultOfficialAnchors() {
  if (cachedAnchors !== null) return cachedAnchors;
  try {
    if (fs.existsSync(defaultAnchorsPath)) {
      const data = JSON.parse(fs.readFileSync(defaultAnchorsPath, 'utf8'));
      cachedAnchors = Array.isArray(data.anchors) ? data.anchors : [];
      return cachedAnchors;
    }
  } catch (err) {
    console.error('Warning: could not load official_serial_anchors.json:', err.message);
  }
  cachedAnchors = [];
  return cachedAnchors;
}

export class OfficialSerialAnchorResolver {
  /**
   * Resolves an official serial anchor for a given serial number if one exists.
   * Priority:
   * 1. database.official_serial_anchors
   * 2. options.officialAnchors
   * 3. data/official_serial_anchors.json
   */
  static resolve(serialInput, database, options = {}) {
    if (!serialInput) return null;
    const serialStr = String(serialInput).trim();
    if (!/^\d{8,10}$/.test(serialStr)) return null;

    // 1. Check in database.official_serial_anchors
    if (database && Array.isArray(database.official_serial_anchors)) {
      const match = database.official_serial_anchors.find(a => a.serial_number === serialStr);
      if (match) return match;
    }

    // 2. Check in options.officialAnchors
    if (options && Array.isArray(options.officialAnchors)) {
      const match = options.officialAnchors.find(a => a.serial_number === serialStr);
      if (match) return match;
    }

    // 3. Check cached file data/official_serial_anchors.json
    const defaultAnchors = loadDefaultOfficialAnchors();
    const match = defaultAnchors.find(a => a.serial_number === serialStr);
    return match || null;
  }
}
