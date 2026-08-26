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
  {
    id: 'stihl_ms_170',
    slug: 'stihl-ms-170',
    category_slug: 'kettingzagen',
    series_code: '1130',
    model_name: 'MS 170 / MS 170-D',
    category: 'Kettingzaag',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt 1:50)',
    displacement_cc: 30.1,
    power_kw: 1.2,
    power_hp: 1.6,
    weight_kg: 4.1,
    spark_plug: 'Bosch WSR 6 F / NGK BPMR 7 A',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Vast (Geen verstelling)',
    carb_l_setting: 'Vast (Geen verstelling)',
    carb_la_setting: 'Standaard stationair stelschroef',
    chain_pitch: '3/8" P',
    chain_gauge_mm: 1.1,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_260',
    slug: 'stihl-ms-260',
    category_slug: 'kettingzagen',
    series_code: '1121',
    model_name: 'MS 260 / 026 Pro',
    category: 'Kettingzaag',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt Klassiek)',
    displacement_cc: 50.2,
    power_kw: 2.6,
    power_hp: 3.5,
    weight_kg: 4.8,
    spark_plug: 'NGK BPMR7A / Bosch WSR6F',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 slag open (Handmatig)',
    carb_l_setting: '1 slag open (Handmatig)',
    carb_la_setting: '2800 RPM',
    chain_pitch: '.325"',
    chain_gauge_mm: 1.6,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 1
  },
  {
    id: 'stihl_ms_261',
    slug: 'stihl-ms-261',
    category_slug: 'kettingzagen',
    series_code: '1141',
    model_name: 'MS 261 Gen 1',
    category: 'Kettingzaag',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt 2-MIX)',
    displacement_cc: 50.2,
    power_kw: 2.8,
    power_hp: 3.8,
    weight_kg: 5.2,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 slag open (V1 Carburateur)',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2800 RPM',
    chain_pitch: '.325"',
    chain_gauge_mm: 1.3,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 1
  },
  {
    id: 'stihl_ms_261_cm',
    slug: 'stihl-ms-261-c-m',
    category_slug: 'kettingzagen',
    series_code: '1141',
    model_name: 'MS 261 C-M Gen 2 (Facelift)',
    category: 'Kettingzaag',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt M-Tronic)',
    displacement_cc: 50.2,
    power_kw: 3.0,
    power_hp: 4.1,
    weight_kg: 4.9,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_l_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_la_setting: 'Elektronisch geregeld (M-Tronic)',
    chain_pitch: '.325"',
    chain_gauge_mm: 1.3,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_201_tc_m',
    slug: 'stihl-ms-201-tc-m',
    category_slug: 'kettingzagen',
    series_code: '1145',
    model_name: 'MS 201 TC-M (Tophandle)',
    category: 'Kettingzaag (Boomverzorging)',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt M-Tronic)',
    displacement_cc: 35.2,
    power_kw: 1.8,
    power_hp: 2.4,
    weight_kg: 3.7,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_l_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_la_setting: 'Elektronisch geregeld (M-Tronic)',
    chain_pitch: '3/8" P',
    chain_gauge_mm: 1.3,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_500i',
    slug: 'stihl-ms-500i',
    category_slug: 'kettingzagen',
    series_code: '1147',
    model_name: 'MS 500i (Elektronische Injectie)',
    category: 'Kettingzaag',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt Injectie)',
    displacement_cc: 79.2,
    power_kw: 5.0,
    power_hp: 6.8,
    weight_kg: 6.2,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Injectiesysteem (Geen carburateur)',
    carb_l_setting: 'Injectiesysteem (Geen carburateur)',
    carb_la_setting: 'Elektronisch geregeld',
    chain_pitch: '3/8"',
    chain_gauge_mm: 1.6,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0
  },
  {
    id: 'stihl_br_600',
    slug: 'stihl-br-600',
    category_slug: 'bladblazers',
    series_code: '4282',
    model_name: 'BR 600 (4-Mix Rugblazer)',
    category: 'Bladblazer',
    fuel_type: 'PETROL_4MIX',
    fuel_type_label: 'Benzine (4-Mix Gepatenteerd)',
    displacement_cc: 64.8,
    power_kw: 3.0,
    power_hp: 4.0,
    weight_kg: 10.2,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 slag open',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2800 RPM',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0
  },
  {
    id: 'stihl_msa_220_c',
    slug: 'stihl-msa-220-c',
    category_slug: 'accu-kettingzagen',
    series_code: '1251',
    model_name: 'MSA 220 C-B (Accu Zaag)',
    category: 'Accu Kettingzaag',
    fuel_type: 'BATTERY_AP',
    fuel_type_label: 'Accu (AP-Systeem 36V)',
    displacement_cc: null,
    power_kw: 2.1,
    power_hp: 2.8,
    weight_kg: 3.6,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: '3/8" P',
    chain_gauge_mm: 1.1,
    oil_mix_ratio: null,
    battery_system: 'STIHL AP-Systeem (Professioneel)',
    voltage_v: 36,
    is_discontinued: 0
  }
];

const guidesData = [
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
    model_id: "stihl_ms_261",
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
  },
  {
    model_id: "stihl_ms_201_tc_m",
    plant_code: "1",
    serial_start: 175000000,
    serial_end: 184999999,
    year_start: 2011,
    year_end: 2015,
    generation_name: "MS 201 T (Pre-M-Tronic / V1)",
    technical_changes: "Klassieke tophandle zaag, handmatige carburateurafstelling.",
    confidence_level: "HIGH"
  },
  {
    model_id: "stihl_ms_201_tc_m",
    plant_code: "1",
    serial_start: 185000000,
    serial_end: 199999999,
    year_start: 2015,
    year_end: null,
    generation_name: "MS 201 TC-M (M-Tronic)",
    technical_changes: "Elektronisch motormanagement (M-Tronic), verbeterde acceleratie en spoeling.",
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
        is_discontinued BOOLEAN DEFAULT FALSE
      )`);

      const stmtModel = db.prepare(`INSERT INTO models VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      modelsData.forEach(m => stmtModel.run(
        m.id, m.slug, m.category_slug, m.series_code, m.model_name, m.category, m.fuel_type, m.fuel_type_label,
        m.displacement_cc, m.power_kw, m.power_hp, m.weight_kg, m.spark_plug, m.electrode_gap_mm,
        m.carb_h_setting, m.carb_l_setting, m.carb_la_setting, m.chain_pitch, m.chain_gauge_mm,
        m.oil_mix_ratio, m.battery_system, m.voltage_v, m.is_discontinued
      ));
      stmtModel.finalize();

      // 3. Model Serial Ranges (Breakpoints)
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
    guides: guidesData,
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
