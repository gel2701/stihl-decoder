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
    series_code: '1130',
    model_name: 'MS 170 / MS 170-D',
    category: 'Kettingzaag',
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
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_180',
    series_code: '1130',
    model_name: 'MS 180 / MS 180 C-BE',
    category: 'Kettingzaag',
    displacement_cc: 31.8,
    power_kw: 1.5,
    power_hp: 2.0,
    weight_kg: 4.1,
    spark_plug: 'NGK CMR6H / Bosch USR7AC',
    electrode_gap_mm: 0.5,
    carb_h_setting: '3/4 slag open',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2800 RPM stationair',
    chain_pitch: '3/8" P',
    chain_gauge_mm: 1.3,
    oil_mix_ratio: '1:50',
    is_discontinued: 0
  },
  {
    id: 'stihl_026',
    series_code: '1121',
    model_name: '024 / 026 / MS 260',
    category: 'Kettingzaag',
    displacement_cc: 48.7,
    power_kw: 2.6,
    power_hp: 3.5,
    weight_kg: 4.8,
    spark_plug: 'NGK BPMR7A / Bosch WSR6F',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 slag open',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2800 RPM (Standaard stationair)',
    chain_pitch: '.325"',
    chain_gauge_mm: 1.6,
    oil_mix_ratio: '1:50',
    is_discontinued: 1
  },
  {
    id: 'stihl_ms_261_cm',
    series_code: '1141',
    model_name: 'MS 261 C-M (M-Tronic)',
    category: 'Kettingzaag',
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
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_362_c_m',
    series_code: '1140',
    model_name: 'MS 311 / MS 362 / MS 391 / MS 400 C-M',
    category: 'Kettingzaag',
    displacement_cc: 59.0,
    power_kw: 3.5,
    power_hp: 4.8,
    weight_kg: 5.6,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_l_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_la_setting: 'Elektronisch geregeld (M-Tronic)',
    chain_pitch: '3/8"',
    chain_gauge_mm: 1.6,
    oil_mix_ratio: '1:50',
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_500i',
    series_code: '1147',
    model_name: 'MS 500i (Elektronische Injectie)',
    category: 'Kettingzaag',
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
    is_discontinued: 0
  },
  {
    id: 'stihl_ms_661_c_m',
    series_code: '1144',
    model_name: 'MS 661 / MS 661 C-M',
    category: 'Kettingzaag',
    displacement_cc: 91.1,
    power_kw: 5.4,
    power_hp: 7.3,
    weight_kg: 7.4,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_l_setting: 'Elektronisch geregeld (M-Tronic)',
    carb_la_setting: 'Elektronisch geregeld (M-Tronic)',
    chain_pitch: '3/8"',
    chain_gauge_mm: 1.6,
    oil_mix_ratio: '1:50',
    is_discontinued: 0
  },
  {
    id: 'stihl_br_600',
    series_code: '4282',
    model_name: 'BR 600 4-MIX',
    category: 'Bladblazer',
    displacement_cc: 64.8,
    power_kw: 2.8,
    power_hp: 3.8,
    weight_kg: 10.2,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: '3/4 slag open',
    carb_l_setting: '3/4 slag open',
    carb_la_setting: 'Stationair afstelling',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    is_discontinued: 0
  },
  {
    id: 'stihl_fs_130',
    series_code: '4180',
    model_name: 'FS 87 / FS 90 / FS 100 / FS 130 / KM 130',
    category: 'Bosmaaier',
    displacement_cc: 36.3,
    power_kw: 1.4,
    power_hp: 1.9,
    weight_kg: 5.9,
    spark_plug: 'NGK CMR6H',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 1/4 slag open',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2800 RPM stationair',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    is_discontinued: 1
  },
  {
    id: 'stihl_ts_420',
    series_code: '4238',
    model_name: 'TS 410 / TS 420',
    category: 'Doorslijper',
    displacement_cc: 66.7,
    power_kw: 3.2,
    power_hp: 4.4,
    weight_kg: 9.6,
    spark_plug: 'NGK BPMR7A / Bosch WSR6F',
    electrode_gap_mm: 0.5,
    carb_h_setting: '1 slag open',
    carb_l_setting: '1 slag open',
    carb_la_setting: '2500 RPM stationair',
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: '1:50',
    is_discontinued: 0
  }
];

const serialBreakpointsData = [
  {
    model_id: 'stihl_ms_261_cm',
    plant_code: '1',
    serial_start: 175000000,
    serial_end: 179999999,
    production_year_start: 2010,
    production_year_end: 2015,
    generation: 'MS 261 Gen 1 (M-Tronic 2.1)',
    technical_bulletin_ref: 'TI-2010-044'
  },
  {
    model_id: 'stihl_ms_261_cm',
    plant_code: '1',
    serial_start: 180000000,
    serial_end: 189999999,
    production_year_start: 2016,
    production_year_end: 2021,
    generation: 'MS 261 Gen 2 (Facelift -300g, M-Tronic 3.0)',
    technical_bulletin_ref: 'TI-2016-018'
  },
  {
    model_id: 'stihl_br_600',
    plant_code: '2',
    serial_start: 270000000,
    serial_end: 289999999,
    production_year_start: 2007,
    production_year_end: 2017,
    generation: 'BR 600 Gen 1 (Virginia Beach US)',
    technical_bulletin_ref: 'TI-2007-009'
  },
  {
    model_id: 'stihl_ms_170',
    plant_code: '8',
    serial_start: 800000000,
    serial_end: 899999999,
    production_year_start: 2012,
    production_year_end: 2025,
    generation: 'MS 170 / 180 (Qingdao China Assembly)',
    technical_bulletin_ref: 'TI-2012-088'
  }
];

const counterfeitRulesData = [
  {
    pattern_regex: '^0\\d+',
    risk_level: 'DEFINITIVE_FAKE',
    reason: 'Serienummers van STIHL beginnen nooit met een 0. Authentieke fabriekscodes zijn 1, 2, 3, 4, 5, 8 of 9.',
    affected_models: null
  },
  {
    pattern_regex: '^(?!^[1234589])\\d+',
    risk_level: 'DEFINITIVE_FAKE',
    reason: 'Ongeldige fabriekscode. Het eerste cijfer van een echt STIHL serienummer moet 1 (DE), 2/5 (US), 3 (BR), 4 (CH), 8 (CN) of 9 zijn.',
    affected_models: null
  },
  {
    pattern_regex: '^\\d{1,8}$',
    risk_level: 'HIGH',
    reason: 'Serienummer is korter dan 9 cijfers. Officiële STIHL motornummers bevatten 9 cijfers.',
    affected_models: null
  },
  {
    pattern_regex: '^999999999$|^123456789$|^987654321$|^111111111$|^888888888$',
    risk_level: 'DEFINITIVE_FAKE',
    reason: 'Bekend nep- / test-serienummer dat veelvuldig op Chinese klonen (bijv. MS 660 / MS 381 namaakzagen) wordt ingeslagen.',
    affected_models: 'MS 660, MS 381, MS 070'
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
        series_code VARCHAR(10),
        model_name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
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
        oil_mix_ratio VARCHAR(20) DEFAULT '1:50',
        is_discontinued BOOLEAN DEFAULT FALSE
      )`);

      const stmtModel = db.prepare(`INSERT INTO models VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      modelsData.forEach(m => stmtModel.run(
        m.id, m.series_code, m.model_name, m.category, m.displacement_cc, m.power_kw, m.power_hp,
        m.weight_kg, m.spark_plug, m.electrode_gap_mm, m.carb_h_setting, m.carb_l_setting,
        m.carb_la_setting, m.chain_pitch, m.chain_gauge_mm, m.oil_mix_ratio, m.is_discontinued
      ));
      stmtModel.finalize();

      // 3. Serial Breakpoints
      db.run(`CREATE TABLE serial_breakpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id VARCHAR(50) NOT NULL,
        plant_code CHAR(1) NOT NULL,
        serial_start BIGINT NOT NULL,
        serial_end BIGINT NOT NULL,
        production_year_start INT NOT NULL,
        production_year_end INT,
        generation VARCHAR(50),
        technical_bulletin_ref VARCHAR(100),
        FOREIGN KEY (model_id) REFERENCES models(id),
        FOREIGN KEY (plant_code) REFERENCES plants(plant_code)
      )`);

      const stmtBp = db.prepare(`INSERT INTO serial_breakpoints (model_id, plant_code, serial_start, serial_end, production_year_start, production_year_end, generation, technical_bulletin_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      serialBreakpointsData.forEach(b => stmtBp.run(b.model_id, b.plant_code, b.serial_start, b.serial_end, b.production_year_start, b.production_year_end, b.generation, b.technical_bulletin_ref));
      stmtBp.finalize();

      // 4. Counterfeit Rules
      db.run(`CREATE TABLE counterfeit_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_regex VARCHAR(100) NOT NULL,
        risk_level VARCHAR(20) NOT NULL,
        reason TEXT NOT NULL,
        affected_models TEXT
      )`);

      const stmtCf = db.prepare(`INSERT INTO counterfeit_rules (pattern_regex, risk_level, reason, affected_models) VALUES (?, ?, ?, ?)`);
      counterfeitRulesData.forEach(c => stmtCf.run(c.pattern_regex, c.risk_level, c.reason, c.affected_models));
      stmtCf.finalize();

      console.log('✅ SQLite Database successfully initialized at', dbPath);
    });

    db.close();
  }

  const jsonDatabase = {
    plants: plantsData,
    models: modelsData,
    serial_breakpoints: serialBreakpointsData,
    counterfeit_rules: counterfeitRulesData,
    factories: {
      "1": {"country": "Duitsland", "location": "Waiblingen", "details": "Hoofdfabriek & Kenniscentrum van STIHL."},
      "2": {"country": "Verenigde Staten", "location": "Virginia Beach 1", "details": "Grootste STIHL fabriek in de VS."},
      "3": {"country": "Brazilië", "location": "São Leopoldo", "details": "Cilinder- en motorenproductie."},
      "4": {"country": "Zwitserland", "location": "Wil (Kettingen/Zwaarden)", "details": "STIHL Kettenwerk zaagkettingen fabriek."},
      "5": {"country": "Verenigde Staten", "location": "Virginia Beach 2", "details": "Gespecialiseerde assemblagefabriek VS."},
      "8": {"country": "China", "location": "Qingdao", "details": "STIHL Power Tools Qingdao."}
    },
    part_family_prefixes: {
      "1106": {"model": "070 / 090 / 090 AV", "type": "Kettingzaag (Extreem zwaar)", "displacement": "106 cc - 137 cc", "power": "6.5 pk - 8.5 pk", "era": "1968 - 1990+", "notes": "De zwaarste klassieke Stihl zaag voor zaagmolens."},
      "1121": {"model": "024 / 026 / MS 260", "type": "Kettingzaag (Professioneel)", "displacement": "44.3 cc - 50.2 cc", "power": "2.9 pk - 3.5 pk", "era": "1988 - 2011", "notes": "Eén van de meest verkochte professionele vellingszagen ter wereld."},
      "1130": {"model": "017 / 018 / MS 170 / MS 180", "type": "Kettingzaag (Consument)", "displacement": "30.1 cc - 31.8 cc", "power": "1.7 pk - 2.0 pk", "era": "1995 - heden", "notes": "Meest verkochte benzinekettingzaag ooit wereldwijd."},
      "1140": {"model": "MS 311 / MS 362 / MS 391 / MS 400 C-M", "type": "Kettingzaag (Magnesium zuiger)", "displacement": "59.0 cc - 66.8 cc", "power": "4.2 pk - 5.4 pk", "era": "2010 - heden", "notes": "'s Werelds eerste kettingzaag met magnesium zuiger."},
      "1141": {"model": "MS 261 / MS 271 / MS 291", "type": "Kettingzaag (Professioneel modern)", "displacement": "50.2 cc - 55.5 cc", "power": "3.5 pk - 4.1 pk", "era": "2010 - heden", "notes": "Uitgerust met 2-MIX motor en M-Tronic elektronisch beheer."},
      "1144": {"model": "MS 661 / MS 661 C-M", "type": "Kettingzaag (TIMBERSPORTS®)", "displacement": "91.1 cc", "power": "7.3 pk", "era": "2014 - heden", "notes": "Officiële zaag van de STIHL TIMBERSPORTS® Series."},
      "1147": {"model": "MS 500i / MS 500i W", "type": "Kettingzaag (Elektronische Injectie)", "displacement": "79.2 cc", "power": "6.8 pk", "era": "2019 - heden", "notes": "'s Werelds eerste benzinezaag met elektronische brandstofinjectie Injection."},
      "4180": {"model": "FS 87 / FS 90 / FS 100 / FS 130 / KM 130", "type": "Bosmaaier / 4-Mix", "displacement": "28.4 cc - 36.3 cc", "power": "1.3 pk - 1.9 pk", "era": "2005 - 2018", "notes": "Gepatenteerde 4-Mix® motorisering (4-takt op 2-takt mengsmering)."},
      "4238": {"model": "TS 410 / TS 420", "type": "Doorslijper / Bandenzaag", "displacement": "66.7 cc", "power": "4.4 pk", "era": "2007 - heden", "notes": "Wereldstandaard doorslijper met cycloon-luchtfilter."},
      "4282": {"model": "BR 500 / BR 550 / BR 600 / BR 700", "type": "Ruggedragen Bladblazer (Zwaar)", "displacement": "64.8 cc (4-Mix)", "power": "4.0 pk", "era": "2006 - heden", "notes": "Topklasse professionele rugblazer met hoge blaaskracht."}
    }
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonDatabase, null, 2), 'utf8');
  console.log('✅ JSON Database backup successfully generated at', jsonPath);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
