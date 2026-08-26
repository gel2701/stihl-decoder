import fs from 'fs';
import path from 'path';

export interface ModelData {
  id: string;
  slug: string;
  categorySlug: string;
  seriesCode: string;
  name: string;
  category: string;
  fuelType: string;
  fuelTypeLabel: string;
  displacementCc: number | null;
  powerKw: number | null;
  powerHp: number | null;
  weightKg: number | null;
  sparkPlug: string | null;
  electrodeGapMm: number | null;
  carbH: string | null;
  carbL: string | null;
  carbLA: string | null;
  chainPitch: string | null;
  chainGaugeMm: number | null;
  oilMixRatio: string | null;
  batterySystem: string | null;
  voltageV: number | null;
  updatedAt?: string;
}

export interface GuideData {
  slug: string;
  title: string;
  description: string;
  updatedAt?: string;
}

function loadJsonDatabase() {
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'stihl_database.json');
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading JSON database:', e);
  }
  return {};
}

export async function getAllModels(): Promise<ModelData[]> {
  const db = loadJsonDatabase();
  const models = db.models || [];
  return models.map((m: any) => ({
    id: m.id,
    slug: m.slug || m.id.replace(/_/g, '-'),
    categorySlug: m.category_slug || 'kettingzagen',
    seriesCode: m.series_code,
    name: m.model_name,
    category: m.category,
    fuelType: m.fuel_type || 'PETROL_2STROKE',
    fuelTypeLabel: m.fuel_type_label || 'Benzine (2-Takt)',
    displacementCc: m.displacement_cc || null,
    powerKw: m.power_kw || null,
    powerHp: m.power_hp || null,
    weightKg: m.weight_kg || null,
    sparkPlug: m.spark_plug || null,
    electrodeGapMm: m.electrode_gap_mm || null,
    carbH: m.carb_h_setting || null,
    carbL: m.carb_l_setting || null,
    carbLA: m.carb_la_setting || null,
    chainPitch: m.chain_pitch || null,
    chainGaugeMm: m.chain_gauge_mm || null,
    oilMixRatio: m.oil_mix_ratio || null,
    batterySystem: m.battery_system || null,
    voltageV: m.voltage_v || null,
    updatedAt: new Date().toISOString()
  }));
}

export async function getModelBySlug(slug: string): Promise<ModelData | null> {
  const models = await getAllModels();
  const cleanSlug = slug.toLowerCase().replace(/^stihl-/, '');
  return models.find(m => m.slug === slug || m.slug.replace(/^stihl-/, '') === cleanSlug || m.id === slug) || null;
}

export async function getAllGuides(): Promise<GuideData[]> {
  const db = loadJsonDatabase();
  return db.guides || [
    { slug: 'stihl-gietklok-aflezen', title: 'STIHL Gietklok Aflezen', description: 'Gids voor gietklokdatum' },
    { slug: 'namaak-stihl-herkennen', title: 'Namaak STIHL Herkennen', description: 'Kloon en nep zagen herkennen' },
    { slug: 'serienummer-locaties', title: 'Serienummer Locaties', description: 'Waar vind u het serienummer' }
  ];
}
