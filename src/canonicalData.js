import crypto from 'crypto';

export const OFFICIAL_PRIMARY_DOCUMENTS = {
  '0458-259-8621-D': {
    documentNumber: '0458-259-8621-D',
    title: 'STIHL FS 100 / FS 100 RX Instruction Manual',
    models: ['FS 100', 'FS 100 RX', 'FS 100 R']
  },
  '0458-452-8621-J': {
    documentNumber: '0458-452-8621-J',
    title: 'STIHL BR 500 / BR 600 Instruction Manual',
    models: ['BR 500', 'BR 600']
  },
  '0458-573-8621-D': {
    documentNumber: '0458-573-8621-D',
    title: 'STIHL MS 261 Instruction Manual',
    models: ['MS 261', 'MS 261 C-M']
  }
};

export const SERIES_REFERENCE_DOCUMENTS = {
  '1130': {
    seriesCode: '1130',
    title: 'STIHL Werkplaatshandboek 1130',
    sourceType: 'series_workshop_manual',
    models: ['MS 170', 'MS 180']
  },
  '1129': {
    seriesCode: '1129',
    title: 'STIHL Service Manual 1129',
    sourceType: 'series_service_manual',
    models: ['MS 200', '020 T']
  },
  '1123': {
    seriesCode: '1123',
    title: 'STIHL Service Manual 1123',
    sourceType: 'series_service_manual',
    models: ['MS 210', 'MS 230', 'MS 250']
  },
  '1121': {
    seriesCode: '1121',
    title: 'STIHL Werkplaatshandboek 1121',
    sourceType: 'series_workshop_manual',
    models: ['MS 260']
  },
  '1133': {
    seriesCode: '1133',
    title: 'STIHL Service Manual 1133',
    sourceType: 'series_service_manual',
    models: ['MS 270', 'MS 280']
  },
  '1127': {
    seriesCode: '1127',
    title: 'STIHL Service Manual 1127',
    sourceType: 'series_service_manual',
    models: ['MS 290', 'MS 310', 'MS 390']
  },
  '1140': {
    seriesCode: '1140',
    title: 'STIHL Service Manual 1140',
    sourceType: 'series_service_manual',
    models: ['MS 311', 'MS 362', 'MS 400']
  },
  '1125': {
    seriesCode: '1125',
    title: 'STIHL Service Manual 1125',
    sourceType: 'series_service_manual',
    models: ['MS 340', 'MS 360', '034', '036']
  },
  '1135': {
    seriesCode: '1135',
    title: 'STIHL Werkplaatshandboek 1135',
    sourceType: 'series_workshop_manual',
    models: ['MS 341', 'MS 361']
  },
  '1138': {
    seriesCode: '1138',
    title: 'STIHL Service Manual 1138',
    sourceType: 'series_service_manual',
    models: ['MS 441']
  },
  '4134': {
    seriesCode: '4134',
    title: 'STIHL Werkplaatshandboek 4134',
    sourceType: 'series_workshop_manual',
    models: ['FS 350']
  },
  '4228': {
    seriesCode: '4228',
    title: 'STIHL Service Manual 4228',
    sourceType: 'series_service_manual',
    models: ['HS 45']
  },
  '1142': {
    seriesCode: '1142',
    title: 'STIHL Werkplaatshandboek 1142',
    sourceType: 'series_workshop_manual',
    models: ['MS 462', 'MS 462 C-M']
  },
  '1145': {
    seriesCode: '1145',
    title: 'STIHL Technical Data Sheet 1145',
    sourceType: 'series_technical_data_sheet',
    models: ['MS 201', 'MS 201 TC-M']
  },
  '4147': {
    seriesCode: '4147',
    title: 'STIHL Werkplaatshandboek 4147',
    sourceType: 'series_workshop_manual',
    models: ['FS 460', 'FS 460 C-EM']
  },
  '4282': {
    seriesCode: '4282',
    title: 'STIHL Service Manual 4282',
    sourceType: 'series_service_manual',
    models: ['BR 600', 'BR 700']
  },
  '4238': {
    seriesCode: '4238',
    title: 'STIHL Werkplaatshandboek 4238',
    sourceType: 'series_workshop_manual',
    models: ['TS 420']
  }
};

const DOCUMENT_NUMBER_ALIASES = {
  '0458-452-0121-J': '0458-452-8621-J',
  '0458-543-0121': '0458-573-8621-D'
};

const MODEL_PRIMARY_SOURCE_OVERRIDES = {
  'fs-100': '0458-259-8621-D',
  'fs-100-rx': '0458-259-8621-D',
  'br-600': '0458-452-8621-J',
  'ms-261': '0458-573-8621-D'
};

const CORE_SPEC_FIELDS = [
  'displacement_cc',
  'power_kw',
  'power_hp',
  'weight_kg',
  'spark_plug',
  'electrode_gap_mm',
  'carb_h_setting',
  'carb_l_setting',
  'carb_la_setting',
  'chain_pitch',
  'chain_gauge_mm',
  'oil_mix_ratio'
];

export function getModelVerificationSummary(model) {
  const rawDocumentNumber = model?.provenance?.source_document_number || MODEL_PRIMARY_SOURCE_OVERRIDES[model?.slug] || null;
  const documentNumber = rawDocumentNumber ? (DOCUMENT_NUMBER_ALIASES[rawDocumentNumber] || rawDocumentNumber) : null;
  const registryEntry = documentNumber ? OFFICIAL_PRIMARY_DOCUMENTS[documentNumber] : null;
  const seriesCode = model?.series_code || null;
  const seriesReference = seriesCode ? SERIES_REFERENCE_DOCUMENTS[seriesCode] : null;
  const modelName = model?.model_name || '';
  const modelMatched = registryEntry
    ? registryEntry.models.some((candidate) => {
        const normalizedCandidate = candidate.toUpperCase();
        const normalizedModel = modelName.toUpperCase();
        return normalizedModel.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedModel);
      })
    : false;

  const hasPrimaryDocument = Boolean(registryEntry && modelMatched);
  const hasSeriesReference = Boolean(!hasPrimaryDocument && seriesReference);

  let dataStatus = 'PRIMARY_SOURCE_PENDING';
  let displayConfidence = 'LOW';
  let badgeLabel = 'Primaire bron ontbreekt';
  let sourceLabel = model?.provenance?.legacy_reference || model?.data_source || 'Primaire STIHL bron nog niet gekoppeld';
  let sourceType = 'legacy_repository_entry';
  let sourceTitle = 'Legacy repository entry awaiting primary source review';
  let sourceTier = 'pending';

  if (hasPrimaryDocument) {
    dataStatus = 'PRIMARY_SOURCE_LINKED';
    displayConfidence = 'MEDIUM';
    badgeLabel = 'Primaire bron gekoppeld';
    sourceLabel = `${documentNumber} - ${registryEntry.title}`;
    sourceType = 'official_stihl_instruction_manual';
    sourceTitle = registryEntry.title;
    sourceTier = 'primary';
  } else if (hasSeriesReference) {
    dataStatus = 'SERIES_SOURCE_LINKED';
    displayConfidence = 'LOW';
    badgeLabel = 'Familiebron gekoppeld';
    sourceLabel = seriesReference.title;
    sourceType = seriesReference.sourceType;
    sourceTitle = seriesReference.title;
    sourceTier = 'series';
  }

  return {
    hasPrimaryDocument,
    hasSeriesReference,
    documentNumber: hasPrimaryDocument ? documentNumber : null,
    documentTitle: hasPrimaryDocument ? registryEntry.title : null,
    seriesCode: hasSeriesReference ? seriesReference.seriesCode : seriesCode,
    seriesTitle: hasSeriesReference ? seriesReference.title : null,
    dataStatus,
    displayConfidence,
    badgeLabel,
    sourceLabel,
    sourceType,
    sourceTitle,
    sourceTier
  };
}

export function normalizeModelRecord(model) {
  const summary = getModelVerificationSummary(model);
  const previousDocumentNumber = model?.provenance?.source_document_number || null;
  const legacyReference = previousDocumentNumber && !summary.hasPrimaryDocument ? previousDocumentNumber : null;
  const normalizedFieldVerification = {};

  for (const field of CORE_SPEC_FIELDS) {
    const value = model[field] ?? null;
    normalizedFieldVerification[field] = {
      value,
      status: summary.hasPrimaryDocument && value !== null
        ? 'DOCUMENT_LINKED'
        : summary.hasSeriesReference && value !== null
          ? 'SERIES_REFERENCE_LINKED'
          : 'PRIMARY_SOURCE_PENDING',
      source: summary.hasPrimaryDocument
        ? summary.documentNumber
        : summary.hasSeriesReference
          ? summary.seriesTitle
          : null,
      note: summary.hasPrimaryDocument
        ? 'Waarde aanwezig in een gekoppelde primaire handleiding; paginaniveau-verwijzing ontbreekt nog.'
        : summary.hasSeriesReference
          ? 'Waarde is gekoppeld aan een series- of familiehandboek uit de repositorygeschiedenis; modelspecifieke primaire bron en paginaniveau-verwijzing ontbreken nog.'
          : 'Waarde staat nog als repositorygegeven en wacht op primaire STIHL bronverwijzing.'
    };
  }

  return {
    ...model,
    data_confidence: summary.displayConfidence,
    production_confidence: 'UNKNOWN',
    specs_verified: false,
    data_status: summary.dataStatus,
    model_status: summary.dataStatus,
    data_source: summary.sourceTier === 'pending' ? 'Primaire STIHL bron nog niet gekoppeld' : summary.sourceLabel,
    provenance: {
      source_type: summary.sourceType,
      source_title: summary.sourceTitle,
      source_document_number: summary.hasPrimaryDocument ? summary.documentNumber : null,
      source_revision: model?.provenance?.source_revision || null,
      source_year: summary.hasPrimaryDocument ? (model?.provenance?.source_year || null) : null,
      confidence: summary.displayConfidence,
      verification_status: summary.dataStatus,
      legacy_reference: summary.hasSeriesReference ? summary.seriesTitle : legacyReference,
      note: summary.hasPrimaryDocument
        ? 'Primaire handleiding gekoppeld; veldniveau paginareferenties moeten nog expliciet worden vastgelegd.'
        : summary.hasSeriesReference
          ? 'Series- of familiehandboek gekoppeld vanuit bestaande repositorysporen; modelspecifieke primaire handleiding en paginaniveau-verwijzingen ontbreken nog.'
        : 'Synthetische of niet-gecontroleerde bronverwijzing verwijderd uit actieve claims.'
    },
    field_verification: normalizedFieldVerification
  };
}

export function summarizeCanonicalDatabase(database) {
  const models = database.models || [];
  const verified = models.map(getModelVerificationSummary);
  const primaryLinked = verified.filter((entry) => entry.hasPrimaryDocument).length;
  const seriesLinked = verified.filter((entry) => entry.hasSeriesReference).length;
  const pending = verified.length - primaryLinked - seriesLinked;
  const manifestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(models))
    .digest('hex');

  return {
    canonicalStore: 'json',
    modelCount: models.length,
    primarySourceLinkedModels: primaryLinked,
    seriesSourceLinkedModels: seriesLinked,
    primarySourcePendingModels: pending,
    manifestHash
  };
}

export function buildPublicCatalogSnapshot(database) {
  return {
    models: (database.models || []).map((model) => {
      const summary = getModelVerificationSummary(model);
      return {
        slug: model.slug || model.id.replace(/_/g, '-'),
        model_name: model.model_name,
        category_slug: model.category_slug || 'kettingzagen',
        series_code: model.series_code || null,
        data_status: summary.dataStatus,
        data_confidence: summary.displayConfidence
      };
    }),
    plants: database.plants || [],
    meta: summarizeCanonicalDatabase(database)
  };
}
