/**
 * Stihl Serienummer Rapport Component & 1200x900px Canvas Exporter
 * Phase 33 Category Specification Whitelist & Honest Verification Reporting
 */

import { normalizeCategorySlug, CATEGORY_TYPES } from '../categoryWhitelist.js';
import { getClassificationContextLabel } from '../driveClassification.js';
import { buildModelRecommendations, renderPassportRecommendationSlotsHtml } from '../modelRecommendations.js';
import { resolvePlantRecord } from '../plantResolver.js';
import { isPublicDisplayEligibleFact, getPublicEvidenceFactsForModel, buildPublicEvidenceFields } from '../publicEvidence.js';

function compactText(value, fallback = 'Niet vastgesteld') {
  const text = String(value || '').trim();
  return text || fallback;
}

export function getEligibleFact(field, data = {}) {
  const facts = Array.isArray(data.publicEvidenceFacts) ? data.publicEvidenceFacts : [];
  const fact = facts.find((f) => {
    const fField = f?.field || f?.field_name || f?.canonical_field;
    return fField === field && isPublicDisplayEligibleFact(f);
  });
  if (fact) return fact;

  const fields = data.publicEvidenceFields || {};
  const fieldEntry = fields[field];
  if (fieldEntry && fieldEntry.display_eligible && isPublicDisplayEligibleFact(fieldEntry)) {
    return fieldEntry;
  }
  return null;
}

export function getFactSourceTag(field, data = {}) {
  const fact = getEligibleFact(field, data);
  if (!fact) return ''; // Geen concrete eligible fact -> GEEN official badge/tag!

  const meta = fact.meta || fact;
  const docId = meta.sourceDocumentId || meta.source_document_id || fact.source_document_id;
  const edition = meta.sourceEdition || meta.source_edition || fact.source_edition;
  const printedPage = meta.printedPage || meta.printed_page || fact.printed_page;

  if (docId && edition) {
    const pageStr = printedPage ? `, p. ${printedPage}` : '';
    return `(✓ STIHL ${docId} Ed. ${edition}${pageStr})`;
  }
  if (docId) {
    const pageStr = printedPage ? `, p. ${printedPage}` : '';
    return `(✓ STIHL ${docId}${pageStr})`;
  }

  const status = fact.public_evidence_status || fact.evidence_status || meta.status;
  if (status === 'CANONICAL_VERIFIED' || status === 'OFFICIAL_DOCUMENTED') {
    return '(✓ Officieel bevestigd)';
  }
  return '';
}

export function buildSafePassportSpecRows(data = {}) {
  const specs = data.technicalSpecs && typeof data.technicalSpecs === 'object' ? data.technicalSpecs : {};
  const rows = [];

  const addRow = (label, value, unit, field) => {
    if (value === null || value === undefined || value === '') return;
    const tag = getFactSourceTag(field, data);
    const tagSuffix = tag ? ` ${tag}` : '';
    const unitSuffix = unit ? ` ${unit}` : '';
    rows.push(`${label}: ${value}${unitSuffix}${tagSuffix}`.trim());
  };

  addRow('Motorinhoud', specs.displacement_cc, 'cc', 'displacement_cc');
  addRow('Vermogen', specs.power_kw, 'kW', 'power_kw');
  addRow('Stationair toerental', specs.idle_speed_rpm, '1/min', 'idle_speed_rpm');
  addRow('Bougie', specs.spark_plug, null, 'spark_plug');
  addRow('Elektrodenafstand', specs.electrode_gap_mm, 'mm', 'electrode_gap_mm');
  addRow('Brandstoftank', specs.fuel_tank_l, 'l', 'fuel_tank_l');
  addRow('Olietank', specs.oil_tank_l, 'l', 'oil_tank_l');
  addRow('Gewicht', specs.weight_kg, 'kg', 'weight_kg');
  if (specs.chain_pitch && specs.chain_gauge_mm) {
    const chainTag = getFactSourceTag('chain_pitch', data);
    const chainSuffix = chainTag ? ` ${chainTag}` : '';
    rows.push(`Kettingsteek: ${specs.chain_pitch} @ ${specs.chain_gauge_mm} mm${chainSuffix}`.trim());
  }

  return rows;
}

export function buildPassportViewModel(data = {}, databaseOrResult = null) {
  const db = databaseOrResult || data.database || null;
  const serialRaw = data.cleanedSerial || data.serialNumber || data.serial || (data.machine && data.machine.serial_number) || '';
  const serial = typeof serialRaw === 'string' ? serialRaw.trim() : (serialRaw ? String(serialRaw).trim() : '');
  const hasSerial = Boolean(serial && serial !== 'null' && serial !== 'undefined');

  const formattedSerial = hasSerial
    ? (data.formatted || (serial.length === 9 ? `${serial.substring(0,1)} ${serial.substring(1,4)} ${serial.substring(4,7)} ${serial.substring(7)}` : serial))
    : 'Nog niet toegevoegd';

  const isOfficialAnchor = Boolean(
    data.officialAnchor ||
    data.identitySource === 'OFFICIAL_STIHL_LOOKUP' ||
    data.modelIdentitySource === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.identity_source === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.official_source === 'OFFICIAL_STIHL_LOOKUP' ||
    data.identity?.official_product_name
  );

  // Model resolution
  const exactModel = compactText(data.exactModel, '');
  const confirmedModel = compactText(data.confirmedModel, '');
  const resolvedModel = compactText(data.resolvedModel, '');
  const probableModelSeries = compactText(data.probableModelSeries, '');
  const rawModel = compactText(data.model || data.modelName || data.model_name || data.identity?.model_name, '');

  let model = rawModel || 'STIHL Machine';
  let officialProductName = null;
  let canonicalModelName = null;

  if (isOfficialAnchor) {
    officialProductName = data.officialAnchor?.officialProductName || data.officialAnchor?.modelName || data.identity?.official_product_name || exactModel || model;
    model = officialProductName;
    const canonSlug = data.officialAnchor?.canonicalModelId || data.identity?.canonical_model_id || data.resolvedModel || data.canonicalModelId;
    if (canonSlug) {
      canonicalModelName = String(canonSlug).replace(/^stihl_/, '').replace(/-/g, ' ').toUpperCase();
    }
  } else if (exactModel) {
    model = exactModel;
  } else if (confirmedModel) {
    model = confirmedModel;
  } else if (resolvedModel) {
    model = resolvedModel;
  } else if (probableModelSeries) {
    model = probableModelSeries;
  }

  // Model slug & Series code
  const modelSlug = data.modelSlug || data.model_slug || data.identity?.model_slug || (model ? model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
  const seriesCode = data.seriesCode || data.series_code || data.identity?.series_code || null;

  // Identity Status
  let identityStatus = data.modelIdentityStatus || data.identityStatus || data.identity?.identity_status;
  if (!identityStatus) {
    if (isOfficialAnchor) {
      identityStatus = 'EXACT_MODEL_IDENTIFIED';
    } else if (data.exactModel) {
      identityStatus = 'EXACT_MODEL_IDENTIFIED';
    } else if (data.confirmedModel || !hasSerial) {
      identityStatus = 'USER_CONFIRMED_MODEL';
    } else if (data.probableModelSeries) {
      identityStatus = 'PROBABLE_MODEL_SERIES';
    } else {
      identityStatus = 'MODEL_NOT_IDENTIFIED';
    }
  }

  // Determine passport mode
  let passportMode = 'MODEL_ONLY';
  if (isOfficialAnchor) {
    passportMode = 'OFFICIAL_SERIAL_VERIFIED';
  } else if (hasSerial) {
    passportMode = 'MODEL_WITH_SERIAL';
  }

  const categoryStr = compactText(data.category || data.identity?.category, 'Kettingzaag');
  const catSlug = normalizeCategorySlug(categoryStr, model);

  // Country & Factory
  let country = 'Nog niet gekoppeld (geen serienummer)';
  if (hasSerial) {
    const rawCountry = data.machine?.factory_country || data.factory_country || data.plantInfo?.country || data.factory?.country || null;
    const rawLocation = data.machine?.factory_location || data.factory_location || data.plantInfo?.location || data.factory?.location || data.factory?.facility || null;

    if (!rawCountry && db) {
      const factoryCode = data.factory?.code || data.plantInfo?.code || data.plantInfo?.plant_code || (serial.length >= 1 ? serial.charAt(0) : null);
      const plantRecord = resolvePlantRecord(db, factoryCode);
      if (plantRecord && (plantRecord.country || plantRecord.country_name)) {
        const c = plantRecord.country_name || plantRecord.country;
        const loc = plantRecord.plant_location || plantRecord.location || plantRecord.facility;
        country = loc ? `${c} (${loc})` : c;
      } else {
        country = 'Niet vastgesteld';
      }
    } else if (rawCountry) {
      country = rawLocation ? `${rawCountry} (${rawLocation})` : rawCountry;
    } else {
      country = 'Niet vastgesteld';
    }
  }

  // Years: Never calculate or estimate year without serial number!
  const userYear = data.userProvidedYear || data.purchaseYear || data.purchase_year || (data.machine && data.machine.purchase_year) || null;
  let years = 'Niet opgegeven';
  if (userYear) {
    years = `Opgegeven aankoopjaar: ${userYear} (👤 Door gebruiker opgegeven)`;
  } else if (hasSerial) {
    if (data.production && data.production.year) {
      years = `${data.production.year} (geschat)`;
    } else if (data.production && data.production.yearRange) {
      years = data.production.yearRange;
    } else if (data.manufacturingYearEstimate) {
      years = `${data.manufacturingYearEstimate.yearStart} - ${data.manufacturingYearEstimate.yearEnd || 'Onbekend'}`;
    } else if (data.estimatedYears) {
      years = data.estimatedYears;
    } else {
      years = 'Niet vastgesteld';
    }
  }

  // Identity Titles & Labels
  let identityTitle = 'Modelidentiteit';
  let identityLabel = 'Model geselecteerd door gebruiker';
  let identityExplanation = 'Technische specificaties zijn gekoppeld op basis van het geverifieerde of door gebruiker gekozen model.';

  if (passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    identityTitle = 'Exact model geïdentificeerd';
    identityLabel = 'Officieel bevestigd door STIHL (MY STIHL)';
    identityExplanation = 'Serienummer en modeluitvoering zijn officieel geverifieerd via MY STIHL productlookup.';
  } else if (identityStatus === 'EXACT_MODEL_IDENTIFIED') {
    identityTitle = 'Exact model geïdentificeerd';
    identityLabel = data.confidenceLabel || 'Exact model geïdentificeerd';
    identityExplanation = 'Technische specificaties zijn afkomstig uit officiële documentatie en veilig gekoppeld.';
  } else if (identityStatus === 'USER_CONFIRMED_MODEL' || passportMode === 'MODEL_ONLY') {
    identityTitle = 'Modelbevestiging';
    identityLabel = 'Model geselecteerd door gebruiker';
    identityExplanation = 'Technische specificaties zijn gekoppeld op basis van het door de gebruiker geselecteerde model.';
  } else if (data.probableModelSeries) {
    identityTitle = 'Waarschijnlijke modelreeks';
    identityLabel = data.confidenceLabel || 'Breakpoint-gebaseerde indicatie';
    identityExplanation = 'Technische specificaties zijn niet aan dit serienummer gekoppeld zolang het exacte model niet voldoende is bevestigd.';
  } else {
    identityTitle = 'Serienummer validatie';
    identityLabel = data.confidenceLabel || 'Breakpoint-gebaseerde indicatie';
    identityExplanation = 'Technische specificaties zijn niet aan dit serienummer gekoppeld zolang het exacte model niet voldoende is bevestigd.';
  }

  const facts = (data.publicEvidenceFacts && data.publicEvidenceFacts.length > 0)
    ? data.publicEvidenceFacts
    : (db && modelSlug ? getPublicEvidenceFactsForModel(modelSlug, db) : []);
  const evidenceFields = (data.publicEvidenceFields && Object.keys(data.publicEvidenceFields).length > 0)
    ? data.publicEvidenceFields
    : (db && modelSlug ? buildPublicEvidenceFields(modelSlug, db) : {});

  const enrichedData = {
    ...data,
    publicEvidenceFacts: facts,
    publicEvidenceFields: evidenceFields
  };

  const technicalSpecRows = buildSafePassportSpecRows(enrichedData);
  const hasTechnicalSpecs = technicalSpecRows.length > 0;
  const driveClassification = data.driveClassification || null;
  const driveContextLabel = getClassificationContextLabel(driveClassification);

  let theftCheck = null;
  if (hasSerial) {
    theftCheck = data.theftCheck || {
      available: true,
      userSelfReported: false,
      checkedAt: new Date().toLocaleDateString('nl-NL'),
      statusLabel: 'Niet gecontroleerd via StopHeling'
    };
  } else {
    theftCheck = {
      available: false,
      status: 'INACTIVE',
      userSelfReported: false,
      checkedAt: null,
      statusLabel: 'Niet gecontroleerd (geen serienummer)'
    };
  }

  // Canonical Model QR URL: Always points to the public canonical model page.
  // CRITICAL PRIVACY GATE: NEVER include serial numbers or query params in external QR requests!
  const safeCatSlug = catSlug || 'kettingzagen';
  const safeModelSlug = modelSlug || '';
  const publicUrl = (safeCatSlug && safeModelSlug)
    ? `https://www.stihldecoder.nl/${safeCatSlug}/${safeModelSlug}/`
    : 'https://www.stihldecoder.nl/';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(publicUrl)}`;

  // Safe recommendations
  const recommendations = data.recommendations || buildModelRecommendations(
    { model_slug: modelSlug, model_name: model, category: categoryStr, series_code: seriesCode },
    data.technicalSpecs || {},
    { compatibilityEvidence: (data.publicEvidenceFacts && data.publicEvidenceFacts.length > 0) ? data.publicEvidenceFacts : (data.compatibilityEvidence || facts) }
  );

  return {
    serial: hasSerial ? serial : null,
    hasSerial,
    formattedSerial: hasSerial ? formattedSerial : 'Nog niet toegevoegd',
    passportMode,
    model,
    modelSlug,
    seriesCode,
    canonicalModelName,
    officialProductName,
    exactModel: exactModel || (isOfficialAnchor ? officialProductName : null),
    probableModelSeries: probableModelSeries || null,
    identityStatus,
    identityTitle,
    identityLabel,
    identityExplanation,
    category: categoryStr,
    categorySlug: catSlug,
    isChainsaw: catSlug === CATEGORY_TYPES.CHAINSAW || catSlug === CATEGORY_TYPES.ACCU_CHAINSAW,
    country,
    years,
    driveClassification,
    driveContextLabel,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck,
    publicUrl,
    qrUrl,
    recommendations,
    publicEvidenceFacts: facts,
    publicEvidenceFields: evidenceFields
  };
}

// Phase 79: Shared-image evidence states. A shared passport must never claim a
// stronger evidence level than the stored data justifies.
export const PASSPORT_EVIDENCE_STATES = {
  MODEL_ONLY: 'MODEL_ONLY',
  USER_CONFIRMED_MODEL: 'USER_CONFIRMED_MODEL',
  SERIAL_UNVERIFIED: 'SERIAL_UNVERIFIED',
  SERIAL_OFFICIAL: 'SERIAL_OFFICIAL'
};

export const PASSPORT_EVIDENCE_LABELS = {
  MODEL_ONLY: 'Alleen model bekend',
  USER_CONFIRMED_MODEL: 'Model door gebruiker opgegeven',
  SERIAL_UNVERIFIED: 'Serienummer aanwezig, niet officieel bevestigd',
  SERIAL_OFFICIAL: 'Serienummer officieel geverifieerd'
};

export const PASSPORT_EVIDENCE_BADGES = {
  MODEL_ONLY: 'ALLEEN MODEL BEKEND',
  USER_CONFIRMED_MODEL: 'MODEL DOOR GEBRUIKER',
  SERIAL_UNVERIFIED: 'SERIENUMMER NIET BEVESTIGD',
  SERIAL_OFFICIAL: 'OFFICIEEL GEVERIFIEERD'
};

export const MASKED_SERIAL_TEXT = '•••••••••  (afgeschermd)';
export const PASSPORT_EXPORT_BRAND = 'Gemaakt met STIHLDecoder.nl';
export const PASSPORT_EXPORT_DISCLAIMER = 'Geen eigendomsbewijs. Gebaseerd op door jou opgegeven gegevens en openbare modelinformatie.';

export function resolvePassportEvidenceState(passport = {}) {
  if (passport.passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    return PASSPORT_EVIDENCE_STATES.SERIAL_OFFICIAL;
  }
  if (passport.hasSerial) {
    return PASSPORT_EVIDENCE_STATES.SERIAL_UNVERIFIED;
  }
  if (passport.identityStatus === 'EXACT_MODEL_IDENTIFIED') {
    return PASSPORT_EVIDENCE_STATES.MODEL_ONLY;
  }
  return PASSPORT_EVIDENCE_STATES.USER_CONFIRMED_MODEL;
}

/**
 * Pure export model for the shareable PNG. Kept free of DOM access so the
 * privacy and evidence rules can be verified in Node.
 * Default: the serial number is masked on the shared image.
 */
export function buildPassportExportModel(data = {}, options = {}) {
  const passport = buildPassportViewModel(data);
  const showSerial = options.showSerial === true && passport.hasSerial;
  const serialMasked = passport.hasSerial && !showSerial;
  const evidenceState = resolvePassportEvidenceState(passport);
  const safeModelSlug = String(passport.modelSlug || 'model')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'model';
  const dateStamp = new Date().toISOString().slice(0, 10);

  return {
    passport,
    model: passport.model,
    modelTitle: passport.model.startsWith('STIHL') ? passport.model : `STIHL ${passport.model}`,
    identityLine: `${passport.identityTitle}: ${passport.identityLabel}`,
    evidenceState,
    evidenceLabel: PASSPORT_EVIDENCE_LABELS[evidenceState],
    evidenceBadge: PASSPORT_EVIDENCE_BADGES[evidenceState],
    hasSerial: passport.hasSerial,
    showSerial,
    serialMasked,
    serialText: !passport.hasSerial ? 'Nog niet toegevoegd' : (showSerial ? passport.formattedSerial : MASKED_SERIAL_TEXT),
    serialCaption: serialMasked ? 'Serienummer bewust verborgen op deze afbeelding' : '',
    originText: serialMasked ? 'Afgeschermd op deze afbeelding' : passport.country,
    yearsText: passport.years,
    specLines: (passport.technicalSpecRows || []).slice(0, 4),
    hasTechnicalSpecs: passport.hasTechnicalSpecs,
    technicalFallback: passport.identityExplanation,
    publicUrl: passport.publicUrl,
    qrUrl: passport.qrUrl,
    brandLine: PASSPORT_EXPORT_BRAND,
    disclaimer: PASSPORT_EXPORT_DISCLAIMER,
    filename: `STIHL_Machinepaspoort_${safeModelSlug}_${dateStamp}.png`
  };
}

export function renderStihlPassportHtml(data, databaseOrResult = null) {
  const passport = buildPassportViewModel(data, databaseOrResult);
  const {
    serial,
    hasSerial,
    formattedSerial,
    passportMode,
    model,
    canonicalModelName,
    seriesCode,
    identityTitle,
    identityLabel,
    identityExplanation,
    country,
    years,
    driveClassification,
    driveContextLabel,
    technicalSpecRows,
    hasTechnicalSpecs,
    theftCheck,
    publicUrl,
    qrUrl,
    recommendations
  } = passport;

  const isSelfReported = theftCheck.userSelfReported || theftCheck.status === 'USER_REPORTED_CLEAN';
  const statusTone = isSelfReported
    ? 'bg-neutral-900 border-neutral-700 text-neutral-300'
    : 'bg-neutral-900 border-neutral-800 text-neutral-400';

  let badgeText = 'Indicatief overzicht';
  if (passportMode === 'OFFICIAL_SERIAL_VERIFIED') {
    badgeText = '✓ Officieel STIHL';
  } else if (passportMode === 'MODEL_ONLY') {
    badgeText = 'Modelpaspoort';
  } else if (isSelfReported) {
    badgeText = 'Zelf gerapporteerd';
  }

  const recommendationsHtml = renderPassportRecommendationSlotsHtml(recommendations);

  return `
    <div id="stihl-passport-card" class="bg-neutral-950 border border-neutral-800 rounded-2xl p-7 text-white font-sans max-w-xl mx-auto my-6 shadow-2xl relative overflow-hidden space-y-4">
      <div class="absolute top-0 right-0 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-neutral-800/80 pb-4">
        <div>
          <span class="text-2xs font-mono uppercase tracking-widest text-orange-500 font-bold block">${passportMode === 'MODEL_ONLY' ? 'STIHL Modelpaspoort' : 'STIHL Machinepaspoort'}</span>
          <h2 class="text-2xl font-black tracking-tight text-white mt-0.5">${model.startsWith('STIHL') ? model : `STIHL ${model}`}</h2>
          ${canonicalModelName && canonicalModelName !== model.toUpperCase() ? `
            <span class="text-2xs text-orange-400 font-mono block">Canonieke basis: STIHL ${canonicalModelName}</span>
          ` : ''}
          <p class="text-2xs text-neutral-400 mt-1">${identityTitle}: ${identityLabel}</p>
        </div>
        <span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-2xs font-black tracking-wider">
          ${badgeText}
        </span>
      </div>

      <!-- Stop Heling Banner (only when serial is present) -->
      ${hasSerial ? `
        <div class="p-3 rounded-xl border flex items-center justify-between ${statusTone}">
          <div class="flex items-center gap-2.5">
            <span class="text-lg">${isSelfReported ? '📋' : 'ℹ️'}</span>
            <div>
              <span class="text-2xs font-bold uppercase tracking-wider block">Stop Heling Status</span>
              <span class="text-xs font-semibold text-neutral-200">${theftCheck.statusLabel}</span>
            </div>
          </div>
          <div class="text-right text-3xs text-neutral-400">
            <span>Datum:</span>
            <span class="font-mono text-white font-bold block">${theftCheck.checkedAt || '—'}</span>
          </div>
        </div>
      ` : ''}

      <!-- Grid with Category Specifications -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Model</span>
          <span class="text-sm font-bold text-white">${model}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800" data-serial="${serial || ''}">
          <div class="flex justify-between items-center mb-0.5">
            <span class="text-2xs text-neutral-400 block font-medium">Serienummer</span>
            ${!hasSerial ? `
              <a href="/stihl-paspoort/" class="text-3xs text-orange-400 hover:text-orange-300 font-bold underline">Serienummer toevoegen</a>
            ` : ''}
          </div>
          <span class="font-mono text-base font-bold ${hasSerial ? 'text-white' : 'text-neutral-300'} tracking-wider">${formattedSerial}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Herkomst / Fabriek</span>
          <span class="text-sm font-bold text-white">${country}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
          <span class="text-2xs text-neutral-400 block font-medium">Bouwjaar</span>
          <span class="text-sm font-bold text-orange-400">${years}</span>
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2">
          <span class="text-2xs text-neutral-400 block font-medium">${identityTitle}</span>
          <span class="text-sm font-bold text-white">${identityLabel}</span>
        </div>
        ${seriesCode ? `
          <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800">
            <span class="text-2xs text-neutral-400 block font-medium">Modelreeks (Seriecode)</span>
            <span class="font-mono text-sm font-bold text-white">Serie ${seriesCode}</span>
          </div>
        ` : ''}
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 ${seriesCode ? '' : 'col-span-2'}">
          <span class="text-2xs text-neutral-400 block font-medium">Aandrijvingstype</span>
          <span class="text-sm font-bold text-white">${driveClassification?.display_label || 'Niet vastgesteld'}</span>
          ${driveContextLabel ? `<span class="text-2xs text-neutral-400 block mt-1">${driveContextLabel}</span>` : ''}
        </div>
        <div class="bg-neutral-900/90 p-3 rounded-xl border border-neutral-800 col-span-2">
          <div>
            <span class="text-2xs text-neutral-400 block font-medium">${hasTechnicalSpecs ? 'Technische specificaties' : 'Technische specificatiesstatus'}</span>
            ${hasTechnicalSpecs
              ? `<div class="space-y-1 mt-1">${technicalSpecRows.map((row) => `<span class="text-sm font-bold text-orange-300 font-mono block">${row}</span>`).join('')}</div>`
              : `<span class="text-sm font-semibold text-neutral-300">${identityExplanation}</span>`}
          </div>
        </div>
      </div>

      <!-- Recommendation Slots Foundation (Phase 47) -->
      ${recommendationsHtml}

      <!-- Footer with Unobscured Domain and QR Code -->
      <div class="flex justify-between items-center border-t border-neutral-800/80 pt-3 text-3xs text-neutral-400 gap-4">
        <div class="space-y-0.5">
          <p class="font-semibold text-neutral-300">Onafhankelijk STIHL machinepaspoort op basis van geverifieerde gegevens</p>
          <span class="font-mono font-black text-orange-500 text-sm block">www.stihldecoder.nl</span>
          <p class="text-neutral-500 text-3xs">Scan QR-code voor de modelpagina of het live controlerapport</p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <img src="${qrUrl}" alt="Scan QR Code" class="w-12 h-12 rounded-lg border border-neutral-700 bg-white p-0.5 shadow-md" />
        </div>
      </div>
    </div>
  `;
}

function fitCanvasText(ctx, text, maxWidth, baseFont, minSize = 11) {
  const source = String(text || '');
  const sizeMatch = baseFont.match(/(\d+)px/);
  const baseSize = sizeMatch ? Number(sizeMatch[1]) : 16;
  const fontFor = (px) => baseFont.replace(/\d+px/, `${px}px`);
  let size = baseSize;
  ctx.font = fontFor(size);
  while (size > minSize && ctx.measureText(source).width > maxWidth) {
    size -= 1;
    ctx.font = fontFor(size);
  }
  let value = source;
  if (ctx.measureText(value).width > maxWidth) {
    while (value.length > 4 && ctx.measureText(`${value}…`).width > maxWidth) {
      value = value.slice(0, -1);
    }
    value = `${value}…`;
  }
  return value;
}

export function downloadStihlPassportImage(data, options = {}) {
  if (typeof document === 'undefined') return;

  const exportModel = buildPassportExportModel(data, options);
  const { passport } = exportModel;
  const theftCheck = passport.theftCheck || {
    userSelfReported: false,
    checkedAt: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    statusLabel: exportModel.hasSerial ? 'Niet gecontroleerd via StopHeling' : 'Niet gecontroleerd (geen serienummer)'
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  function renderCanvasAndDownload(qrImageElement) {
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 1200, 900);

    // Top Accent Bar
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 0, 1200, 12);

    // Header
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('STIHL MACHINEPASPOORT', 60, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.modelTitle, 700, '900 44px sans-serif', 26), 60, 126);

    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.identityLine, 700, '16px sans-serif', 12), 60, 154);

    // Evidence-status badge (right aligned, never stronger than the stored data)
    ctx.font = 'bold 15px sans-serif';
    const badgeText = exportModel.evidenceBadge;
    const badgeWidth = Math.min(Math.max(ctx.measureText(badgeText).width + 40, 240), 350);
    const badgeX = 1140 - badgeWidth;
    ctx.fillStyle = '#ea580c33';
    ctx.fillRect(badgeX, 46, badgeWidth, 44);
    ctx.fillStyle = '#fb923c';
    ctx.fillText(badgeText, badgeX + 20, 74);

    // Stop Heling Banner Box
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 176, 1080, 76);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('STOP HELING DIEFSTALCONTROLE STATUS', 90, 206);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 20px sans-serif';
    ctx.fillText(
      fitCanvasText(
        ctx,
        exportModel.hasSerial ? theftCheck.statusLabel : 'Niet van toepassing (geen serienummer geregistreerd)',
        720,
        '600 20px sans-serif',
        13
      ),
      90,
      236
    );
    ctx.fillStyle = '#737373';
    ctx.font = '15px monospace';
    ctx.fillText(exportModel.hasSerial ? `Datum: ${theftCheck.checkedAt || '—'}` : 'Status: Geen serienummer', 880, 212);

    // Card grid: serial number (masked by default) & origin
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 268, 525, 132);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Serienummer', 90, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(fitCanvasText(ctx, exportModel.serialText, 455, 'bold 34px monospace', 20), 90, 352);
    if (exportModel.serialCaption) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = '13px sans-serif';
      ctx.fillText(fitCanvasText(ctx, exportModel.serialCaption, 455, '13px sans-serif', 10), 90, 380);
    }

    ctx.fillStyle = '#171717';
    ctx.fillRect(615, 268, 525, 132);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Herkomst / Fabriek', 645, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.originText, 455, 'bold 26px sans-serif', 16), 645, 352);

    // Card grid: year & evidence status
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 416, 525, 132);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Bouwjaar', 90, 448);
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.yearsText, 455, 'bold 26px sans-serif', 15), 90, 500);

    ctx.fillStyle = '#171717';
    ctx.fillRect(615, 416, 525, 132);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('Bewijsstatus', 645, 448);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.evidenceLabel, 455, 'bold 22px sans-serif', 14), 645, 500);

    // Technical specifications (fitted so every line stays inside the card)
    ctx.fillStyle = '#171717';
    ctx.fillRect(60, 564, 1080, 150);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText(exportModel.hasTechnicalSpecs ? 'Technische specificaties' : 'Technische specificatiesstatus', 90, 596);
    ctx.fillStyle = '#fb923c';
    if (exportModel.hasTechnicalSpecs) {
      ctx.font = 'bold 20px monospace';
      exportModel.specLines.forEach((row, index) => {
        ctx.fillText(fitCanvasText(ctx, row, 1000, 'bold 20px monospace', 12), 90, 630 + (index * 26));
      });
    } else {
      ctx.font = '600 19px sans-serif';
      ctx.fillText(fitCanvasText(ctx, exportModel.technicalFallback, 1000, '600 19px sans-serif', 13), 90, 646);
    }

    // Footer Divider
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 730);
    ctx.lineTo(1140, 730);
    ctx.stroke();

    // Footer: brand mention, honest disclaimer and public domain
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(exportModel.brandLine, 60, 768);

    ctx.fillStyle = '#737373';
    ctx.font = '15px sans-serif';
    ctx.fillText(fitCanvasText(ctx, exportModel.disclaimer, 880, '15px sans-serif', 11), 60, 798);

    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px sans-serif';
    ctx.fillText('www.stihldecoder.nl — onafhankelijk STIHL machinepaspoort', 60, 830);

    // Draw QR Code (always points to the public model page, never to a private dossier)
    if (qrImageElement) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(1000, 742, 140, 140);
      ctx.drawImage(qrImageElement, 1010, 752, 120, 120);
    }

    const link = document.createElement('a');
    link.download = exportModel.filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  qrImg.onload = () => renderCanvasAndDownload(qrImg);
  qrImg.onerror = () => renderCanvasAndDownload(null);
  qrImg.src = exportModel.qrUrl.replace('size=100x100', 'size=120x120');
}
