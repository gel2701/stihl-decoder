const fs = require('fs');
const path = require('path');

let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn('sqlite3 package not available, seed script will generate JSON backup.');
}

const dbPath = path.join(__dirname, 'stihl_database.db');
const jsonPath = path.join(__dirname, 'stihl_database.json');

const plantsData = [
  { plant_code: '1', country_code: 'DE', country_name: 'Duitsland', plant_location: 'Waiblingen', notes: 'Hoofdfabriek & Kenniscentrum van STIHL.' },
  { plant_code: '2', country_code: 'US', country_name: 'Verenigde Staten', plant_location: 'Virginia Beach 1', notes: 'Grootste STIHL fabriek in de VS.' },
  { plant_code: '3', country_code: 'BR', country_name: 'Brazilië', plant_location: 'São Leopoldo', notes: 'Cilinder- en motorenproductie.' },
  { plant_code: '4', country_code: 'CH', country_name: 'Zwitserland', plant_location: 'Wil (Kettingen/Zwaarden)', notes: 'STIHL Kettenwerk voor gepatenteerde zaagkettingen en geleidebladen.' },
  { plant_code: '5', country_code: 'US', country_name: 'Verenigde Staten', plant_location: 'Virginia Beach 2', notes: 'Gespecialiseerde assemblagefabriek VS.' },
  { plant_code: '8', country_code: 'CN', country_name: 'China', plant_location: 'Qingdao', notes: 'STIHL Power Tools Qingdao.' },
  { plant_code: '9', country_code: 'BR', country_name: 'Speciaal / Internationale Assemblage', plant_location: 'Diverse locaties', notes: 'Internationale assemblage voor regionale markten.' }
];

const modelsData = [
  // Existing 23 models...
  { id: 'stihl_ms_170', slug: 'ms-170', category_slug: 'kettingzagen', series_code: '1130', model_name: 'MS 170', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)', displacement_cc: 30.1, power_kw: 1.2, power_hp: 1.6, weight_kg: 4.1, spark_plug: 'Bosch WSR 6 F / NGK BPMR 7 A', electrode_gap_mm: 0.5, carb_h_setting: 'Vast', carb_l_setting: 'Vast', carb_la_setting: 'Standaard', chain_pitch: '3/8" P', chain_gauge_mm: 1.1, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 1130' },
  { id: 'stihl_ms_180', slug: 'ms-180', category_slug: 'kettingzagen', series_code: '1130', model_name: 'MS 180', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)', displacement_cc: 31.8, power_kw: 1.4, power_hp: 1.9, weight_kg: 4.1, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: 'Vast', carb_l_setting: 'Vast', carb_la_setting: '2800 RPM', chain_pitch: '3/8" P', chain_gauge_mm: 1.1, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 1130' },
  { id: 'stihl_ms_200', slug: 'ms-200', category_slug: 'kettingzagen', series_code: '1129', model_name: 'MS 200 / 020 T', category: 'Kettingzaag (Boomverzorging)', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 35.2, power_kw: 1.7, power_hp: 2.3, weight_kg: 3.5, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8" P', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1129' },
  { id: 'stihl_ms_210', slug: 'ms-210', category_slug: 'kettingzagen', series_code: '1123', model_name: 'MS 210', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 35.3, power_kw: 1.5, power_hp: 2.0, weight_kg: 4.4, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8" P', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1123' },
  { id: 'stihl_ms_230', slug: 'ms-230', category_slug: 'kettingzagen', series_code: '1123', model_name: 'MS 230', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 40.2, power_kw: 2.0, power_hp: 2.7, weight_kg: 4.6, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '.325"', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1123' },
  { id: 'stihl_ms_250', slug: 'ms-250', category_slug: 'kettingzagen', series_code: '1123', model_name: 'MS 250', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 45.4, power_kw: 2.3, power_hp: 3.1, weight_kg: 4.6, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '.325"', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1123' },
  { id: 'stihl_ms_260', slug: 'ms-260', category_slug: 'kettingzagen', series_code: '1121', model_name: 'MS 260', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt Klassiek)', displacement_cc: 50.2, power_kw: 2.6, power_hp: 3.5, weight_kg: 4.8, spark_plug: 'NGK BPMR7A / Bosch WSR6F', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '.325"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 1121' },
  { id: 'stihl_ms_261_cm', slug: 'ms-261', category_slug: 'kettingzagen', series_code: '1141', model_name: 'MS 261', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt M-Tronic)', displacement_cc: 50.2, power_kw: 3.0, power_hp: 4.1, weight_kg: 4.9, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic)', carb_l_setting: 'Elektronisch (M-Tronic)', carb_la_setting: 'M-Tronic', chain_pitch: '.325"', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Technical Data Sheet 1141' },
  { id: 'stihl_ms_270', slug: 'ms-270', category_slug: 'kettingzagen', series_code: '1133', model_name: 'MS 270', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 50.0, power_kw: 2.6, power_hp: 3.5, weight_kg: 5.3, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '.325"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1133' },
  { id: 'stihl_ms_280', slug: 'ms-280', category_slug: 'kettingzagen', series_code: '1133', model_name: 'MS 280', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 54.7, power_kw: 2.8, power_hp: 3.8, weight_kg: 5.3, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '.325"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1133' },
  { id: 'stihl_ms_290', slug: 'ms-290', category_slug: 'kettingzagen', series_code: '1127', model_name: 'MS 290 Farm Boss', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 56.5, power_kw: 3.0, power_hp: 4.1, weight_kg: 5.9, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1127' },
  { id: 'stihl_ms_310', slug: 'ms-310', category_slug: 'kettingzagen', series_code: '1127', model_name: 'MS 310', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 59.0, power_kw: 3.2, power_hp: 4.4, weight_kg: 5.9, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1127' },
  { id: 'stihl_ms_311', slug: 'ms-311', category_slug: 'kettingzagen', series_code: '1140', model_name: 'MS 311', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 2-MIX)', displacement_cc: 59.0, power_kw: 3.1, power_hp: 4.2, weight_kg: 6.2, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Manual 1140' },
  { id: 'stihl_ms_340', slug: 'ms-340', category_slug: 'kettingzagen', series_code: '1125', model_name: 'MS 340', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 54.0, power_kw: 3.0, power_hp: 4.1, weight_kg: 6.0, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1125' },
  { id: 'stihl_ms_341', slug: 'ms-341', category_slug: 'kettingzagen', series_code: '1135', model_name: 'MS 341', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 59.0, power_kw: 3.2, power_hp: 4.4, weight_kg: 5.5, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1135' },
  { id: 'stihl_ms_360', slug: 'ms-360', category_slug: 'kettingzagen', series_code: '1125', model_name: 'MS 360 / 036 Pro', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 61.5, power_kw: 3.4, power_hp: 4.6, weight_kg: 5.7, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1125' },
  { id: 'stihl_ms_361', slug: 'ms-361', category_slug: 'kettingzagen', series_code: '1135', model_name: 'MS 361', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 59.0, power_kw: 3.4, power_hp: 4.6, weight_kg: 5.6, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 1135' },
  { id: 'stihl_ms_362', slug: 'ms-362', category_slug: 'kettingzagen', series_code: '1140', model_name: 'MS 362', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt M-Tronic)', displacement_cc: 59.0, power_kw: 3.5, power_hp: 4.8, weight_kg: 5.6, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic)', carb_l_setting: 'Elektronisch (M-Tronic)', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1140' },
  { id: 'stihl_ms_390', slug: 'ms-390', category_slug: 'kettingzagen', series_code: '1127', model_name: 'MS 390', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 64.1, power_kw: 3.4, power_hp: 4.6, weight_kg: 5.9, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1127' },
  { id: 'stihl_ms_400', slug: 'ms-400', category_slug: 'kettingzagen', series_code: '1140', model_name: 'MS 400 C-M', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (Magnesium Zuiger)', displacement_cc: 66.8, power_kw: 4.0, power_hp: 5.4, weight_kg: 5.8, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic)', carb_l_setting: 'Elektronisch (M-Tronic)', carb_la_setting: 'M-Tronic', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Tech Spec 1140 MS 400' },
  { id: 'stihl_ms_441', slug: 'ms-441', category_slug: 'kettingzagen', series_code: '1138', model_name: 'MS 441', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 2-MIX)', displacement_cc: 70.7, power_kw: 4.2, power_hp: 5.7, weight_kg: 6.6, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1138' },
  { id: 'stihl_ms_460', slug: 'ms-460', category_slug: 'kettingzagen', series_code: '1128', model_name: 'MS 460 / 046 Magnum', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt Magnum)', displacement_cc: 76.5, power_kw: 4.4, power_hp: 6.0, weight_kg: 6.6, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 1128' },
  { id: 'stihl_fs_350', slug: 'fs-350', category_slug: 'bosmaaiers', series_code: '4134', model_name: 'FS 350', category: 'Bosmaaier', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 1:50)', displacement_cc: 40.2, power_kw: 1.6, power_hp: 2.2, weight_kg: 7.3, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 1, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 4134' },
  { id: 'stihl_br_600', slug: 'br-600', category_slug: 'bladblazers', series_code: '4282', model_name: 'BR 600', category: 'Bladblazer', fuel_type: 'PETROL_4MIX', fuel_type_label: 'Benzine (4-Mix Gepatenteerd)', displacement_cc: 64.8, power_kw: 3.0, power_hp: 4.0, weight_kg: 10.2, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 4282' },
  { id: 'stihl_hs_45', slug: 'hs-45', category_slug: 'heggenscharen', series_code: '4228', model_name: 'HS 45', category: 'Heggenschaar', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt)', displacement_cc: 27.2, power_kw: 0.75, power_hp: 1.0, weight_kg: 4.7, spark_plug: 'NGK BPMR7A', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 4228' },

  // FASE 30 Section 13: 5 Strategic High-Intent Models
  { id: 'stihl_ms_462_cm', slug: 'ms-462', category_slug: 'kettingzagen', series_code: '1142', model_name: 'MS 462 C-M', category: 'Kettingzaag', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt M-Tronic 3.0)', displacement_cc: 72.2, power_kw: 4.4, power_hp: 6.0, weight_kg: 6.0, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic V3.0)', carb_l_setting: 'Elektronisch (M-Tronic V3.0)', carb_la_setting: 'M-Tronic', chain_pitch: '3/8"', chain_gauge_mm: 1.6, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 1142' },
  { id: 'stihl_ms_201_tcm', slug: 'ms-201-t', category_slug: 'kettingzagen', series_code: '1145', model_name: 'MS 201 TC-M', category: 'Kettingzaag (Boomverzorging)', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt M-Tronic Top-Handle)', displacement_cc: 35.2, power_kw: 1.8, power_hp: 2.4, weight_kg: 3.7, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic)', carb_l_setting: 'Elektronisch (M-Tronic)', carb_la_setting: 'M-Tronic', chain_pitch: '3/8" P', chain_gauge_mm: 1.3, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Technical Data Sheet 1145' },
  { id: 'stihl_fs_460_cem', slug: 'fs-460', category_slug: 'bosmaaiers', series_code: '4147', model_name: 'FS 460 C-EM', category: 'Bosmaaier', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt M-Tronic Profi)', displacement_cc: 45.6, power_kw: 2.2, power_hp: 3.0, weight_kg: 8.5, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: 'Elektronisch (M-Tronic)', carb_l_setting: 'Elektronisch (M-Tronic)', carb_la_setting: 'M-Tronic', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 4147' },
  { id: 'stihl_br_700', slug: 'br-700', category_slug: 'bladblazers', series_code: '4282', model_name: 'BR 700', category: 'Bladblazer', fuel_type: 'PETROL_4MIX', fuel_type_label: 'Benzine (4-Mix Topklasse)', displacement_cc: 64.8, power_kw: 2.8, power_hp: 3.8, weight_kg: 10.8, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Service Manual 4282' },
  { id: 'stihl_ts_420', slug: 'ts-420', category_slug: 'doorslijpers', series_code: '4238', model_name: 'TS 420', category: 'Doorslijper', fuel_type: 'PETROL_2STROKE', fuel_type_label: 'Benzine (2-Takt 2-MIX Cycloon)', displacement_cc: 66.7, power_kw: 3.2, power_hp: 4.4, weight_kg: 9.6, spark_plug: 'NGK CMR6H', electrode_gap_mm: 0.5, carb_h_setting: '1 slag open', carb_l_setting: '1 slag open', carb_la_setting: '2800 RPM', chain_pitch: null, chain_gauge_mm: null, oil_mix_ratio: '1:50', battery_system: null, voltage_v: null, is_discontinued: 0, data_confidence: 'HIGH', production_confidence: 'HIGH', specs_verified: true, data_source: 'STIHL Werkplaatshandboek 4238' }
];

const intentPagesData = [
  // Existing 14 intent pages...
  { slug: 'stihl-serienummer-decoder', h1: 'STIHL Serienummer Decoder & Machine Checker', title: 'STIHL Serienummer Decoder & Machine Checker', description: 'De gratis onafhankelijke online STIHL serienummer decoder.', intro: 'Voer het 9-cijferige serienummer in.', contentHtml: '<p>Analyse van fabriekscodes.</p>' },
  { slug: 'stihl-serienummer', h1: 'STIHL Serienummer Aflezen & Betekenis', title: 'STIHL Serienummer Aflezen & Betekenis', description: 'Alles over het 9-cijferige STIHL serienummer.', intro: 'Serienummer identificatie.', contentHtml: '<p>Serienummer locaties.</p>' },
  { slug: 'stihl-bouwjaar', h1: 'STIHL Bouwjaar Controleren op Serienummer & Gietklok', title: 'STIHL Bouwjaar Controleren op Serienummer & Gietklok', description: 'Hoe oud is uw STIHL machine?', intro: 'Bouwjaar achterhalen.', contentHtml: '<p>Gietklok & Breakpoints.</p>' },
  { slug: 'stihl-diefstalcheck', h1: 'STIHL Serienummer Diefstalcheck (StopHeling®)', title: 'STIHL Serienummer Diefstalcheck (StopHeling®)', description: 'Controleer tweedehands STIHL machines op diefstal.', intro: 'StopHeling politiedatabase check.', contentHtml: '<p>Diefstal preventie.</p>' },
  { slug: 'stihl-waarde', h1: 'STIHL Tweedehands Waardebepaling & Marktwaarde', title: 'STIHL Tweedehands Waardebepaling & Taxatie', description: 'Ontdek de tweedehands marktwaarde.', intro: 'Marktwaarde berekenen.', contentHtml: '<p>Taxatie inschatting.</p>' },
  { slug: 'stihl-paspoort', h1: 'STIHL Digitaal Machine Paspoort Maken', title: 'STIHL Digitaal Machine Paspoort Maken', description: 'Genereer een officieel STIHL Machine Paspoort.', intro: 'Digitaal paspoort.', contentHtml: '<p>Marktplaats verkoopcertificaat.</p>' },
  { slug: 'stihl-modellen', h1: 'STIHL Modellen Overzicht & Categorieën', title: 'STIHL Modellen Overzicht & Specificaties', description: 'Compleet overzicht van alle STIHL modellen.', intro: 'Modellenoverzicht.', contentHtml: '<p>Specificaties gids.</p>' },
  { slug: 'waar-staat-serienummer-stihl', h1: 'Waar staat het serienummer van een STIHL machine?', title: 'Waar staat het serienummer van een STIHL machine?', description: 'Vind de locatie van het serienummer.', intro: 'Locaties gids.', contentHtml: '<p>Carter stempel & stickers.</p>' },
  { slug: 'stihl-serienummer-bouwjaar', h1: 'STIHL Serienummer vs. Bouwjaar Relatie', title: 'STIHL Serienummer & Bouwjaar Relatie', description: 'Serienummer vs bouwjaar relatie.', intro: 'Breakpoint logica.', contentHtml: '<p>Fabriekscodes gids.</p>' },
  { slug: 'stihl-productiedatum', h1: 'STIHL Productiedatum Achterhalen', title: 'STIHL Productiedatum Achterhalen', description: 'Productiedatum verifiëren.', intro: 'Gietstempels & klok.', contentHtml: '<p>Productieperiode gids.</p>' },
  { slug: 'stihl-model-herkennen', h1: 'STIHL Model Herkennen & Type Identificatie', title: 'STIHL Model Herkennen & Type Identificatie', description: 'Model herkennen.', intro: 'Model identificatie.', contentHtml: '<p>Serie prefixes.</p>' },
  { slug: 'stihl-typeplaatje', h1: 'STIHL Typeplaatje & Barcode Sticker Aflezen', title: 'STIHL Typeplaatje & Barcode Sticker Aflezen', description: 'Typeplaatje aflezen.', intro: 'Barcode sticker gids.', contentHtml: '<p>Sticker kenmerken.</p>' },
  { slug: 'stihl-serienummer-ongeldig', h1: 'Verdacht STIHL Serienummer of Ongeldige Code', title: 'Verdacht STIHL Serienummer of Ongeldige Code', description: 'Verdacht serienummer.', intro: 'Namaak waarschuwing.', contentHtml: '<p>Kloon indicatoren.</p>' },
  { slug: 'stihl-tweedehands-checklist', h1: 'STIHL Tweedehands Koper Checklist', title: 'STIHL Tweedehands Koper Checklist', description: 'Checklist tweedehands STIHL kopen.', intro: 'Aankoopadvies.', contentHtml: '<p>5 controlepunten.</p>' }
];

const guidesData = [
  // Existing 3 guides + FASE 30 3 Targeted High-Intent Troubleshooting Guides
  {
    slug: 'stihl-gietklok-aflezen',
    title: 'STIHL Gietklok & Datumstempel Aflezen: Zo bepaalt u de exacte productiedatum',
    description: 'Stapsgewijze handleiding voor het aflezen van de gietklok (Gussuhr) op het carter of de cilinderkap van uw STIHL machine.',
    updatedAt: '2026-08-26'
  },
  {
    slug: 'namaak-stihl-herkennen',
    title: 'Namaak STIHL Herkennen: 5 Belangrijke Kenmerken van Replica & Kloon Zagen',
    description: 'Hoe herkent u een imitatie STIHL zaag? Controleer het serienummer, het carter en de typeplaatjes tegen Chinese namaak.',
    updatedAt: '2026-08-26'
  },
  {
    slug: 'serienummer-locaties',
    title: 'Waar staat het STIHL serienummer? Vind de 9-cijferige stempel op uw machine',
    description: 'Overzicht van alle serienummer locaties op STIHL kettingzagen, bosmaaiers, bladblazers en doorslijpers.',
    updatedAt: '2026-08-26'
  },
  // FASE 30 High-Intent Troubleshooting Guide 1
  {
    slug: 'stihl-kettingzaag-start-niet',
    title: 'STIHL Kettingzaag Start Niet? Oorzaken & Stappenplan voor Diagnose',
    description: 'Wat te doen als uw STIHL kettingzaag verzopen is of niet aanslaat? Bekijk het stappenplan voor brandstof, bougie vonk, carter impuls en M-Tronic reset.',
    updatedAt: '2026-08-26'
  },
  // FASE 30 High-Intent Troubleshooting Guide 2
  {
    slug: 'stihl-carburateur-afstellen',
    title: 'STIHL Carburateur Afstellen: L, H & LA Schroeven Instellen',
    description: 'Standaard basisafstelling voor STIHL carburateurs. Zo stelt u de L (laag), H (hoog) en LA (stationair) schroef in voor een stabiel toerental.',
    updatedAt: '2026-08-26'
  },
  // FASE 30 High-Intent Troubleshooting Guide 3
  {
    slug: 'stihl-m-tronic-resetten',
    title: 'STIHL M-Tronic Resetten & Kalibreren: Stappenplan per Generatie',
    description: 'Officiële reset- en kalibratieprocedure voor STIHL M-Tronic motoren (Gen 1, Gen 2 en Gen 3). Herstel een slecht lopende M-Tronic zaag.',
    updatedAt: '2026-08-26'
  }
];

const counterfeitRulesData = [
  {
    pattern_regex: "^0\\d+",
    risk_level: "SUSPECT_SERIAL",
    reason: "Verdacht serienummer: Het serienummer begint met een 0 en komt niet overeen met bekende authentieke patronen in onze database (authentieke fabriekscodes zijn 1, 2, 3, 4, 5, 8 of 9)."
  },
  {
    pattern_regex: "^999999999$|^123456789$|^987654321$|^111111111$|^888888888$",
    risk_level: "SUSPECT_SERIAL",
    reason: "Verdacht serienummer: Dit serienummer staat bekend als nep- / testnummer dat op imitaties gebruikt wordt."
  }
];

const serialBreakpointsData = [
  {
    model_id: "stihl_ms_260",
    plant_code: "1",
    serial_start: 145000000,
    serial_end: 169999999,
    year_start: 2001,
    year_end: 2011,
    generation_name: "MS 260 (Klassiek / Analoog)",
    technical_changes: "Opvolger van 026. Handmatige carburateurafstelling (L/H), vast carter.",
    confidence_level: "HIGH"
  },
  {
    model_id: "stihl_ms_261_cm",
    plant_code: "1",
    serial_start: 171000000,
    serial_end: 179999999,
    year_start: 2010,
    year_end: 2016,
    generation_name: "MS 261 / MS 261 C-M Gen 1",
    technical_changes: "Introductie 1141 serie. Hoekige cilinderkap, vroege M-Tronic V1.0 of standaard carburateur.",
    confidence_level: "HIGH"
  },
  {
    model_id: "stihl_ms_261_cm",
    plant_code: "1",
    serial_start: 180000000,
    serial_end: 199999999,
    year_start: 2016,
    year_end: null,
    generation_name: "MS 261 C-M Gen 2 (Facelift / V2)",
    technical_changes: "Afgeschuinde cilinderkap, 300g lichter carter/vliegwiel, M-Tronic V2.1 / V3.0.",
    confidence_level: "HIGH"
  }
];

function seedDatabase() {
  if (sqlite3) {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      // 1. Plants
      db.run(`CREATE TABLE plants (
        plant_code CHAR(1) PRIMARY KEY,
        country_code VARCHAR(2) NOT NULL,
        country_name VARCHAR(100) NOT NULL,
        plant_location VARCHAR(150) NOT NULL,
        notes TEXT
      )`);

      const stmtPlant = db.prepare(`INSERT INTO plants VALUES (?, ?, ?, ?, ?)`);
      plantsData.forEach(p => stmtPlant.run(p.plant_code, p.country_code, p.country_name, p.plant_location, p.notes));
      stmtPlant.finalize();

      // 2. Models
      db.run(`CREATE TABLE models (
        id VARCHAR(50) PRIMARY KEY,
        slug VARCHAR(100) NOT NULL,
        category_slug VARCHAR(100) NOT NULL DEFAULT 'kettingzagen',
        series_code VARCHAR(10),
        model_name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        fuel_type VARCHAR(30) NOT NULL DEFAULT 'PETROL_2STROKE',
        fuel_type_label VARCHAR(50),
        displacement_cc NUMERIC(5,1),
        power_kw NUMERIC(4,2),
        power_hp NUMERIC(4,2),
        weight_kg NUMERIC(4,2),
        spark_plug VARCHAR(100),
        electrode_gap_mm NUMERIC(3,2),
        carb_h_setting VARCHAR(50),
        carb_l_setting VARCHAR(50),
        carb_la_setting VARCHAR(50),
        chain_pitch VARCHAR(20),
        chain_gauge_mm NUMERIC(4,2),
        oil_mix_ratio VARCHAR(20),
        battery_system VARCHAR(100),
        voltage_v INTEGER,
        is_discontinued BOOLEAN DEFAULT FALSE,
        data_confidence VARCHAR(20) DEFAULT 'HIGH',
        production_confidence VARCHAR(20) DEFAULT 'HIGH',
        specs_verified BOOLEAN DEFAULT TRUE,
        data_source VARCHAR(150)
      )`);

      const stmtModel = db.prepare(`INSERT INTO models VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      modelsData.forEach(m => stmtModel.run(
        m.id, m.slug, m.category_slug, m.series_code, m.model_name, m.category, m.fuel_type, m.fuel_type_label,
        m.displacement_cc, m.power_kw, m.power_hp, m.weight_kg, m.spark_plug, m.electrode_gap_mm,
        m.carb_h_setting, m.carb_l_setting, m.carb_la_setting, m.chain_pitch, m.chain_gauge_mm,
        m.oil_mix_ratio, m.battery_system, m.voltage_v, m.is_discontinued,
        m.data_confidence || 'HIGH', m.production_confidence || 'HIGH', m.specs_verified ? 1 : 0, m.data_source || 'STIHL Service Documentatie'
      ));
      stmtModel.finalize();

      // 3. Model Serial Ranges
      db.run(`CREATE TABLE IF NOT EXISTS model_serial_ranges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id VARCHAR(50) NOT NULL,
        plant_code CHAR(1) NOT NULL,
        serial_start BIGINT NOT NULL,
        serial_end BIGINT NOT NULL,
        year_start INT NOT NULL,
        year_end INT,
        generation_name VARCHAR(100) NOT NULL,
        technical_changes TEXT,
        confidence_level VARCHAR(20) DEFAULT 'HIGH',
        FOREIGN KEY (model_id) REFERENCES models(id)
      )`);

      db.run(`CREATE INDEX idx_serial_lookup ON model_serial_ranges (plant_code, serial_start, serial_end)`);

      const stmtRange = db.prepare(`INSERT INTO model_serial_ranges (model_id, plant_code, serial_start, serial_end, year_start, year_end, generation_name, technical_changes, confidence_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      serialBreakpointsData.forEach(r => stmtRange.run(
        r.model_id, r.plant_code, r.serial_start, r.serial_end, r.year_start, r.year_end, r.generation_name, r.technical_changes, r.confidence_level
      ));
      stmtRange.finalize();

      // 4. Theft Checks
      db.run(`CREATE TABLE theft_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_number VARCHAR(50) NOT NULL,
        is_stolen BOOLEAN NOT NULL DEFAULT FALSE,
        checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'stopheling.nl',
        raw_response TEXT,
        expires_at TIMESTAMP WITH TIME ZONE
      )`);

      db.run(`CREATE INDEX idx_theft_serial ON theft_checks(serial_number)`);

      console.log('✅ SQLite Database successfully initialized at', dbPath);
    });

    db.close();
  }

  const jsonDatabase = {
    plants: plantsData,
    models: modelsData,
    intent_pages: intentPagesData,
    guides: guidesData,
    counterfeit_rules: counterfeitRulesData,
    model_serial_ranges: serialBreakpointsData,
    theft_checks: []
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonDatabase, null, 2), 'utf8');
  console.log('✅ JSON Database backup successfully generated at', jsonPath);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
