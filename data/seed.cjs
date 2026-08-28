const fs = require('fs');
const path = require('path');

let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (error) {
  console.warn('sqlite3 package not available, skipping SQLite export.');
}

const dataDir = __dirname;
const dbPath = path.join(dataDir, 'stihl_database.db');
const jsonPath = path.join(dataDir, 'stihl_database.json');
const manifestPath = path.join(dataDir, 'canonical_manifest.json');

function readCanonicalDatabase() {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function readCanonicalManifest(database) {
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const models = Array.isArray(database.models) ? database.models : [];
  return {
    generated_at: new Date().toISOString(),
    modelCount: models.length,
    primarySourceLinkedModels: models.filter((model) => model?.data_status === 'PRIMARY_SOURCE_LINKED').length,
    primarySourcePendingModels: models.filter((model) => model?.data_status === 'PRIMARY_SOURCE_PENDING').length
  };
}

function recreateSqliteDatabase(database) {
  if (!sqlite3) {
    return false;
  }

  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (error) {
      if (error && error.code === 'EBUSY') {
        console.warn('SQLite database is currently locked; skipping derived export. Canonical JSON remains authoritative.');
        return false;
      }
      throw error;
    }
  }

  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`CREATE TABLE plants (
      plant_code CHAR(1) PRIMARY KEY,
      country_code VARCHAR(2) NOT NULL,
      country_name VARCHAR(100) NOT NULL,
      plant_location VARCHAR(150) NOT NULL,
      notes TEXT
    )`);

    const plantStmt = db.prepare(`INSERT INTO plants VALUES (?, ?, ?, ?, ?)`);
    for (const plant of database.plants || []) {
      plantStmt.run(
        plant.plant_code,
        plant.country_code,
        plant.country_name,
        plant.plant_location,
        plant.notes || null
      );
    }
    plantStmt.finalize();

    db.run(`CREATE TABLE models (
      id VARCHAR(50) PRIMARY KEY,
      slug VARCHAR(100) NOT NULL,
      category_slug VARCHAR(100) NOT NULL DEFAULT 'kettingzagen',
      series_code VARCHAR(10),
      model_name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      fuel_type VARCHAR(30),
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
      data_confidence VARCHAR(20) DEFAULT 'LOW',
      production_confidence VARCHAR(20) DEFAULT 'UNKNOWN',
      specs_verified BOOLEAN DEFAULT FALSE,
      data_source VARCHAR(200),
      data_status VARCHAR(40),
      source_document_number VARCHAR(40),
      source_label VARCHAR(200)
    )`);

    const modelStmt = db.prepare(`INSERT INTO models VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const model of database.models || []) {
      const provenance = model.provenance || {};
      modelStmt.run(
        model.id,
        model.slug,
        model.category_slug || 'UNKNOWN',
        model.series_code || null,
        model.model_name,
        model.category || 'Onbekend',
        model.fuel_type || null,
        model.fuel_type_label || null,
        model.displacement_cc ?? null,
        model.power_kw ?? null,
        model.power_hp ?? null,
        model.weight_kg ?? null,
        model.spark_plug || null,
        model.electrode_gap_mm ?? null,
        model.carb_h_setting || null,
        model.carb_l_setting || null,
        model.carb_la_setting || null,
        model.chain_pitch || null,
        model.chain_gauge_mm ?? null,
        model.oil_mix_ratio || null,
        model.battery_system || null,
        model.voltage_v ?? null,
        model.is_discontinued ? 1 : 0,
        model.data_confidence || 'LOW',
        model.production_confidence || 'UNKNOWN',
        model.specs_verified ? 1 : 0,
        model.data_source || null,
        model.data_status || null,
        provenance.source_document_number || null,
        provenance.source_title || null
      );
    }
    modelStmt.finalize();

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
      confidence_level VARCHAR(20) DEFAULT 'LOW',
      FOREIGN KEY (model_id) REFERENCES models(id)
    )`);
    db.run(`CREATE INDEX idx_serial_lookup ON model_serial_ranges (plant_code, serial_start, serial_end)`);

    const rangeStmt = db.prepare(`INSERT INTO model_serial_ranges (model_id, plant_code, serial_start, serial_end, year_start, year_end, generation_name, technical_changes, confidence_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const range of database.model_serial_ranges || []) {
      rangeStmt.run(
        range.model_id,
        range.plant_code,
        range.serial_start,
        range.serial_end,
        range.year_start,
        range.year_end ?? null,
        range.generation_name,
        range.technical_changes || null,
        range.confidence_level || 'LOW'
      );
    }
    rangeStmt.finalize();

    db.run(`CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id VARCHAR(64),
      event_type VARCHAR(50) NOT NULL,
      model_slug VARCHAR(100),
      page_path VARCHAR(200),
      metadata_json TEXT,
      is_test BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE INDEX idx_analytics_event_type ON analytics_events(event_type)`);
    db.run(`CREATE INDEX idx_analytics_created ON analytics_events(created_at)`);
  });

  db.close();
  return true;
}

function seedDatabase() {
  const database = readCanonicalDatabase();
  const manifest = readCanonicalManifest(database);
  const sqliteWritten = recreateSqliteDatabase(database);

  console.log('Canonical database loaded from', jsonPath);
  console.log('Canonical manifest:', {
    generated_at: manifest.generated_at,
    modelCount: manifest.model_count ?? manifest.modelCount,
    primarySourceLinkedModels: manifest.primary_source_linked_models ?? manifest.primarySourceLinkedModels,
    primarySourcePendingModels: manifest.primary_source_pending_models ?? manifest.primarySourcePendingModels
  });

  if (sqliteWritten) {
    console.log('SQLite database rebuilt from canonical JSON at', dbPath);
  } else {
    console.log('SQLite export skipped; canonical JSON remains the source of truth.');
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
