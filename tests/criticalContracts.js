/**
 * CRITICAL CONTRACT REGISTRY — STIHL DECODER REGRESSION SHIELD
 *
 * BELANGRIJK / IMMUTABLE POLICY:
 * Deze contracten vormen het onveranderlijke veiligheidsnet van de applicatie.
 * Geen enkele feature-agent of pull request mag deze contracten afzwakken,
 * verwijderen of negeren om een falende feature of branch kunstmatig 'groen' te maken.
 *
 * Als een feature een contract schendt, is de FEATURE defect, niet de test.
 */

export const CRITICAL_CONTRACTS = Object.freeze({
  HOMEPAGE_LOADS: {
    id: 'HOMEPAGE_LOADS',
    description: 'Homepage retourneert HTTP 200 en bevat invoerveld #code-input en actieknop #search-btn.',
    category: 'E2E_HOMEPAGE'
  },
  HOMEPAGE_ZERO_JS_ERRORS: {
    id: 'HOMEPAGE_ZERO_JS_ERRORS',
    description: 'Tijdens laden en gebruik treden nul pageerrors of onverwachte console.error meldingen op in de browser runtime.',
    category: 'CLIENT_INTEGRITY'
  },
  SERIAL_ANALYZE_CLICK_WORKS: {
    id: 'SERIAL_ANALYZE_CLICK_WORKS',
    description: 'Invoer van een geldig serienummer en klikken op Analyseer toont direct de resultaatkaart met serienummer en fabriek/model.',
    category: 'E2E_HOMEPAGE'
  },
  SERIAL_ANALYZE_ENTER_WORKS: {
    id: 'SERIAL_ANALYZE_ENTER_WORKS',
    description: 'Invoer van een serienummer en drukken op Enter leidt tot exact dezelfde analyse als klikken op Analyseer.',
    category: 'E2E_HOMEPAGE'
  },
  OFFICIAL_SERIAL_ANCHOR_WORKS: {
    id: 'OFFICIAL_SERIAL_ANCHOR_WORKS',
    description: 'Officiële anker-serienummers (zoals 163118080) tonen de exacte gedocumenteerde variant (MS 440-Z) en officiële bronstatus.',
    category: 'E2E_HOMEPAGE'
  },
  MODEL_SEARCH_WORKS: {
    id: 'MODEL_SEARCH_WORKS',
    description: 'Invoer van een modelaanduiding (zoals MS 261 C-M) toont de modelkaart met correcte aandrijflijn en specificaties.',
    category: 'E2E_HOMEPAGE'
  },
  PART_NUMBER_WORKS: {
    id: 'PART_NUMBER_WORKS',
    description: 'Invoer van een 11-cijferig gietnummer (bijv. 11210210800) toont de waarschuwingskaart met onderdeelreeks en modelgroep.',
    category: 'E2E_HOMEPAGE'
  },
  PASSPORT_PAGE_LOADS: {
    id: 'PASSPORT_PAGE_LOADS',
    description: 'Het STIHL Paspoort (/stihl-paspoort/) laadt met HTTP 200, rendert de interactieve passport generator en bevat 0 JS fouten.',
    category: 'E2E_PASSPORT'
  },
  MODEL_PAGE_LOADS: {
    id: 'MODEL_PAGE_LOADS',
    description: 'Individuele modelpagina (bijv. /kettingzagen/ms-261/) laadt met HTTP 200 en toont H1 modeltitel en canonieke specificaties.',
    category: 'E2E_SEO_MODEL'
  },
  PARTS_PAGE_LOADS: {
    id: 'PARTS_PAGE_LOADS',
    description: 'Onderdelenpagina (/kettingzagen/ms-261/onderdelen/) laadt met HTTP 200 en rendert onderdelenlijst.',
    category: 'E2E_PARTS'
  },
  SERIAL_GUIDE_LOADS: {
    id: 'SERIAL_GUIDE_LOADS',
    description: 'Kennisbankgids (/gidsen/serienummer-locaties/) laadt met HTTP 200 en bevat substantiële, praktische handleiding.',
    category: 'E2E_GUIDE'
  },
  NO_FAKE_PRO_REPORT: {
    id: 'NO_FAKE_PRO_REPORT',
    description: 'Geen valse of niet-werkende Pro Report formulieren of misleidende CTAs op model- of contentpagina’s.',
    category: 'PUBLIC_TRUST'
  },
  NO_FAKE_REPAIR_FORM: {
    id: 'NO_FAKE_REPAIR_FORM',
    description: 'Geen dode of misleidende reparatie/lead formulieren.',
    category: 'PUBLIC_TRUST'
  },
  NO_FAKE_SELL_FORM: {
    id: 'NO_FAKE_SELL_FORM',
    description: 'Geen dode of misleidende verkoop/lead formulieren.',
    category: 'PUBLIC_TRUST'
  },
  BATTERY_NO_PETROL_CONTENT: {
    id: 'BATTERY_NO_PETROL_CONTENT',
    description: 'Accu- en elektrische machines bevatten absoluut geen benzinespecifieke onderdelen (carburateur, bougie, brandstoftank, M-Tronic).',
    category: 'TECHNICAL_SAFETY'
  },
  BROWSER_MODULE_GRAPH_VALID: {
    id: 'BROWSER_MODULE_GRAPH_VALID',
    description: 'Alle browser ES-modules zijn publiek bereikbaar (HTTP 200), bevatten 0 Node builtins en decoder.js blijft strikt privaat (HTTP 404).',
    category: 'MODULE_SECURITY'
  }
});

export const TOTAL_CRITICAL_CONTRACTS = Object.keys(CRITICAL_CONTRACTS).length;
