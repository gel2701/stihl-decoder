import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const jsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const dbData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const fs100Records = [
  {
    id: 'stihl_fs_100',
    slug: 'fs-100',
    category_slug: 'bosmaaiers',
    series_code: '4180',
    model_name: 'FS 100',
    category: 'Bosmaaier',
    fuel_type: 'PETROL_4MIX',
    fuel_type_label: 'Benzine — STIHL 4-MIX (4-takt met mengsmering)',
    displacement_cc: 31.4,
    power_kw: 1.05,
    power_hp: 1.4,
    weight_kg: 5.8,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    idle_speed_rpm: 2800,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: '2800 RPM (Stationair)',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 1,
    data_confidence: 'HIGH',
    production_confidence: 'HIGH',
    specs_verified: true,
    data_source: 'Official STIHL Instruction Manual 0458-434-0121',
    provenance: {
      source_type: 'official_stihl_instruction_manual',
      source_title: 'STIHL FS 100 Operating / Instruction Manual',
      source_document_number: '0458-434-0121',
      source_year: 2014,
      confidence: 'HIGH'
    }
  },
  {
    id: 'stihl_fs_100_rx',
    slug: 'fs-100-rx',
    category_slug: 'bosmaaiers',
    series_code: '4180',
    model_name: 'FS 100 RX',
    category: 'Bosmaaier',
    fuel_type: 'PETROL_4MIX',
    fuel_type_label: 'Benzine — STIHL 4-MIX (Lichtgewicht Trimmer)',
    displacement_cc: 31.4,
    power_kw: 1.05,
    power_hp: 1.4,
    weight_kg: 4.5,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    idle_speed_rpm: 2800,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: '2800 RPM (Stationair)',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 1,
    data_confidence: 'HIGH',
    production_confidence: 'HIGH',
    specs_verified: true,
    data_source: 'Official STIHL Instruction Manual 0458-434-0121',
    provenance: {
      source_type: 'official_stihl_instruction_manual',
      source_title: 'STIHL FS 100 RX Operating Manual',
      source_document_number: '0458-434-0121',
      source_year: 2014,
      confidence: 'HIGH'
    }
  }
];

fs100Records.forEach(rec => {
  const existingIdx = dbData.models.findIndex(m => m.id === rec.id || m.slug === rec.slug);
  if (existingIdx >= 0) {
    dbData.models[existingIdx] = rec;
  } else {
    dbData.models.push(rec);
  }
});

fs.writeFileSync(jsonPath, JSON.stringify(dbData, null, 2), 'utf8');
console.log('✅ Added verified FS 100 & FS 100 RX records to stihl_database.json');
