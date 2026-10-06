import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAliasesPath = path.resolve(__dirname, '..', 'data', 'official_serial_input_aliases.json');

let cachedAliases = null;

function loadDefaultOfficialAliases() {
  if (cachedAliases !== null) return cachedAliases;
  try {
    if (fs.existsSync(defaultAliasesPath)) {
      const data = JSON.parse(fs.readFileSync(defaultAliasesPath, 'utf8'));
      cachedAliases = Array.isArray(data.aliases) ? data.aliases : [];
      return cachedAliases;
    }
  } catch (err) {
    console.error('Warning: could not load official_serial_input_aliases.json:', err.message);
  }
  cachedAliases = [];
  return cachedAliases;
}

export class OfficialSerialAliasResolver {
  /**
   * Resolves an official serial input alias for a given raw serial string if one exists.
   * Priority:
   * 1. database.official_serial_input_aliases
   * 2. options.officialAliases
   * 3. data/official_serial_input_aliases.json
   * 
   * Strict exact match only. No arithmetic transformations, no generic zero prefixing.
   */
  static resolve(serialInput, database, options = {}) {
    if (!serialInput) return null;
    const serialStr = String(serialInput).trim();
    if (!/^\d{8}$/.test(serialStr)) return null;

    // 1. Check in database.official_serial_input_aliases
    if (database && Array.isArray(database.official_serial_input_aliases)) {
      const match = database.official_serial_input_aliases.find(a => a.input_serial === serialStr);
      if (match) return match;
    }

    // 2. Check in options.officialAliases
    if (options && Array.isArray(options.officialAliases)) {
      const match = options.officialAliases.find(a => a.input_serial === serialStr);
      if (match) return match;
    }

    // 3. Check cached file data/official_serial_input_aliases.json
    const defaultAliases = loadDefaultOfficialAliases();
    const match = defaultAliases.find(a => a.input_serial === serialStr);
    return match || null;
  }
}
