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

/**
 * Validates that an alias record strictly satisfies the full official evidence contract:
 * - input_serial: exact 8 digits
 * - official_serial_number: exact 9 digits
 * - source: MY_STIHL
 * - verification_status: OFFICIAL_STIHL_LOOKUP
 * - alias_type: MY_STIHL_LEADING_ZERO_NORMALIZATION
 * - generic_zero_prefix_rule_allowed: false
 *
 * Zero mutations, zero normalization heuristics, zero arithmetic conversions.
 */
export function isValidOfficialAlias(alias) {
  if (!alias || typeof alias !== 'object') return false;
  if (typeof alias.input_serial !== 'string' || !/^\d{8}$/.test(alias.input_serial)) return false;
  if (typeof alias.official_serial_number !== 'string' || !/^\d{9}$/.test(alias.official_serial_number)) return false;
  if (alias.source !== 'MY_STIHL') return false;
  if (alias.verification_status !== 'OFFICIAL_STIHL_LOOKUP') return false;
  if (alias.alias_type !== 'MY_STIHL_LEADING_ZERO_NORMALIZATION') return false;
  if (alias.generic_zero_prefix_rule_allowed !== false) return false;
  return true;
}

export class OfficialSerialAliasResolver {
  /**
   * Resolves an official serial input alias for a given raw serial string if one exists.
   * Priority:
   * 1. options.officialAliases (if explicitly provided)
   * 2. database.official_serial_input_aliases
   * 3. data/official_serial_input_aliases.json (canonical fallback)
   * 
   * Strict exact match only. No arithmetic transformations, no generic zero prefixing.
   * All candidate records are strictly validated against the official evidence contract.
   */
  static resolve(serialInput, database, options = {}) {
    if (!serialInput) return null;
    const serialStr = String(serialInput).trim();
    if (!/^\d{8}$/.test(serialStr)) return null;

    let candidate = null;

    // 1. Check in options.officialAliases (explicit injection/override)
    if (options && Array.isArray(options.officialAliases)) {
      candidate = options.officialAliases.find(a => a && a.input_serial === serialStr) || null;
      if (candidate) {
        return isValidOfficialAlias(candidate) ? candidate : null;
      }
    }

    // 2. Check in database.official_serial_input_aliases
    if (database && Array.isArray(database.official_serial_input_aliases)) {
      candidate = database.official_serial_input_aliases.find(a => a && a.input_serial === serialStr) || null;
      if (candidate) {
        return isValidOfficialAlias(candidate) ? candidate : null;
      }
    }

    // 3. Check fallback canonical JSON
    const defaultAliases = loadDefaultOfficialAliases();
    candidate = defaultAliases.find(a => a && a.input_serial === serialStr) || null;
    if (candidate) {
      return isValidOfficialAlias(candidate) ? candidate : null;
    }

    return null;
  }
}
