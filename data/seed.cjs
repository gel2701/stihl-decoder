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
    db.run(`BEGIN TRANSACTION`);
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
      model_id VARCHAR(50),
      plant_code CHAR(1) NOT NULL,
      serial_start BIGINT NOT NULL,
      serial_end BIGINT NOT NULL,
      year_start INT NOT NULL,
      year_end INT,
      generation_name VARCHAR(100) NOT NULL,
      technical_changes TEXT,
      confidence_level VARCHAR(20) DEFAULT 'LOW',
      range_evidence_class VARCHAR(50),
      range_semantic_level VARCHAR(50),
      range_display_name VARCHAR(100),
      candidate_model_ids TEXT,
      FOREIGN KEY (model_id) REFERENCES models(id)
    )`);
    db.run(`CREATE INDEX idx_serial_lookup ON model_serial_ranges (plant_code, serial_start, serial_end)`);

    const rangeStmt = db.prepare(`INSERT INTO model_serial_ranges (model_id, plant_code, serial_start, serial_end, year_start, year_end, generation_name, technical_changes, confidence_level, range_evidence_class, range_semantic_level, range_display_name, candidate_model_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const range of database.model_serial_ranges || []) {
      rangeStmt.run(
        range.model_id || null,
        range.plant_code,
        range.serial_start,
        range.serial_end,
        range.year_start,
        range.year_end ?? null,
        range.generation_name,
        range.technical_changes || null,
        range.confidence_level || 'LOW',
        range.range_evidence_class || null,
        range.range_semantic_level || null,
        range.range_display_name || range.model_name || null,
        Array.isArray(range.candidate_model_ids) ? JSON.stringify(range.candidate_model_ids) : null
      );
    }
    rangeStmt.finalize();

    const officialAnchorsPath = path.join(__dirname, 'official_serial_anchors.json');
    let officialAnchors = [];
    if (fs.existsSync(officialAnchorsPath)) {
      const parsedAnchors = JSON.parse(fs.readFileSync(officialAnchorsPath, 'utf8'));
      officialAnchors = Array.isArray(parsedAnchors.anchors) ? parsedAnchors.anchors : [];
    } else if (Array.isArray(database.official_serial_anchors)) {
      officialAnchors = database.official_serial_anchors;
    }

    db.run(`CREATE TABLE IF NOT EXISTS official_serial_anchors (
      serial_number VARCHAR(20) PRIMARY KEY,
      model_name VARCHAR(100) NOT NULL,
      canonical_model_id VARCHAR(50),
      category VARCHAR(50),
      drive_type VARCHAR(50),
      source VARCHAR(50) NOT NULL,
      source_url TEXT,
      verification_date VARCHAR(30),
      verification_method TEXT,
      evidence_type VARCHAR(50),
      verification_status VARCHAR(50) NOT NULL
    )`);

    const anchorStmt = db.prepare(`INSERT INTO official_serial_anchors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const anchor of officialAnchors) {
      anchorStmt.run(
        anchor.serial_number,
        anchor.model_name,
        anchor.canonical_model_id || null,
        anchor.category || null,
        anchor.drive_type || null,
        anchor.source,
        anchor.source_url || null,
        anchor.verification_date || anchor.verified_at || null,
        anchor.verification_method || null,
        anchor.evidence_type || null,
        anchor.verification_status
      );
    }
    anchorStmt.finalize();

    const officialAliasesPath = path.join(__dirname, 'official_serial_input_aliases.json');
    let officialAliases = [];
    if (fs.existsSync(officialAliasesPath)) {
      const parsedAliases = JSON.parse(fs.readFileSync(officialAliasesPath, 'utf8'));
      officialAliases = Array.isArray(parsedAliases.aliases) ? parsedAliases.aliases : [];
    } else if (Array.isArray(database.official_serial_input_aliases)) {
      officialAliases = database.official_serial_input_aliases;
    }

    db.run(`CREATE TABLE IF NOT EXISTS official_serial_input_aliases (
      input_serial VARCHAR(20) PRIMARY KEY,
      official_serial_number VARCHAR(20) NOT NULL,
      alias_type VARCHAR(50) NOT NULL,
      source VARCHAR(50) NOT NULL,
      source_url TEXT,
      verification_date VARCHAR(30),
      verification_status VARCHAR(50) NOT NULL,
      generic_zero_prefix_rule_allowed BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (official_serial_number) REFERENCES official_serial_anchors(serial_number)
    )`);

    const aliasStmt = db.prepare(`INSERT INTO official_serial_input_aliases VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const alias of officialAliases) {
      aliasStmt.run(
        alias.input_serial,
        alias.official_serial_number,
        alias.alias_type,
        alias.source,
        alias.source_url || null,
        alias.verification_date || null,
        alias.verification_status,
        alias.generic_zero_prefix_rule_allowed ? 1 : 0
      );
    }
    aliasStmt.finalize();

    // ==========================================
    // PHASE 52A: STIHL PARTS HARVESTER PILOT TABLES
    // ==========================================
    const partsCatalogPath = path.join(__dirname, 'parts_catalog.json');
    if (fs.existsSync(partsCatalogPath)) {
      const partsData = JSON.parse(fs.readFileSync(partsCatalogPath, 'utf8'));
      const partsList = Array.isArray(partsData.parts) ? partsData.parts : [];

      db.run(`CREATE TABLE IF NOT EXISTS parts (
        part_number VARCHAR(20) PRIMARY KEY,
        part_number_display VARCHAR(30),
        part_name TEXT,
        part_name_normalized TEXT,
        source_count INTEGER,
        sources TEXT
      )`);

      const partStmt = db.prepare(`INSERT INTO parts VALUES (?, ?, ?, ?, ?, ?)`);
      for (const p of partsList) {
        partStmt.run(
          p.part_number,
          p.part_number_display || null,
          p.part_name || null,
          p.part_name_normalized || null,
          p.source_count || 1,
          Array.isArray(p.sources) ? JSON.stringify(p.sources) : null
        );
      }
      partStmt.finalize();
    }

    const fitmentsPath = path.join(__dirname, 'model_part_fitments.json');
    if (fs.existsSync(fitmentsPath)) {
      const fitmentsData = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));
      const fitmentsList = Array.isArray(fitmentsData.fitments) ? fitmentsData.fitments : [];

      db.run(`CREATE TABLE IF NOT EXISTS model_part_fitments (
        fitment_id VARCHAR(150) PRIMARY KEY,
        part_number VARCHAR(20) NOT NULL,
        canonical_model_id VARCHAR(50) NOT NULL,
        variant_key VARCHAR(50) NOT NULL,
        section_key VARCHAR(100) NOT NULL,
        section_name VARCHAR(150) NOT NULL,
        diagram_position VARCHAR(50),
        quantity INTEGER DEFAULT 1,
        notes TEXT,
        superseded_by VARCHAR(20),
        source_id VARCHAR(50) NOT NULL,
        source_url TEXT,
        source_evidence_status VARCHAR(50)
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fitments_part ON model_part_fitments(part_number)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_fitments_model ON model_part_fitments(canonical_model_id)`);

      const fitStmt = db.prepare(`INSERT INTO model_part_fitments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const f of fitmentsList) {
        fitStmt.run(
          f.fitment_id,
          f.part_number,
          f.canonical_model_id,
          f.variant_key,
          f.section_key,
          f.section_name,
          f.diagram_position || null,
          f.quantity ?? 1,
          f.notes || null,
          f.superseded_by || null,
          f.source_id,
          f.source_url || null,
          f.source_evidence_status || 'SINGLE_STRUCTURED_PARTS_SOURCE'
        );
      }
      fitStmt.finalize();
    }

    const sourcesPath = path.join(__dirname, 'parts_sources.json');
    if (fs.existsSync(sourcesPath)) {
      const sourcesData = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
      const sourcesList = Array.isArray(sourcesData.sources) ? sourcesData.sources : [];

      db.run(`CREATE TABLE IF NOT EXISTS parts_sources (
        source_id VARCHAR(50) PRIMARY KEY,
        source_name VARCHAR(150) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_url TEXT,
        authority_level VARCHAR(50) NOT NULL
      )`);

      const srcStmt = db.prepare(`INSERT INTO parts_sources VALUES (?, ?, ?, ?, ?)`);
      for (const s of sourcesList) {
        srcStmt.run(
          s.source_id,
          s.source_name,
          s.source_type,
          s.source_url || null,
          s.authority_level
        );
      }
      srcStmt.finalize();
    }

    const conflictsPath = path.join(__dirname, 'parts_conflicts.json');
    if (fs.existsSync(conflictsPath)) {
      const conflictsData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
      const conflictsList = Array.isArray(conflictsData.conflicts) ? conflictsData.conflicts : [];

      db.run(`CREATE TABLE IF NOT EXISTS parts_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conflict_id VARCHAR(100),
        part_number VARCHAR(20) NOT NULL,
        conflict_type VARCHAR(50) NOT NULL,
        source_a VARCHAR(50),
        value_a TEXT,
        source_b VARCHAR(50),
        value_b TEXT,
        status VARCHAR(50)
      )`);

      const confStmt = db.prepare(`INSERT INTO parts_conflicts (conflict_id, part_number, conflict_type, source_a, value_a, source_b, value_b, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const c of conflictsList) {
        confStmt.run(
          c.conflict_id || null,
          c.part_number,
          c.conflict_type,
          c.source_a || null,
          c.value_a || null,
          c.source_b || null,
          c.value_b || null,
          c.status || 'REVIEW_REQUIRED'
        );
      }
      confStmt.finalize();
    }

    const variantsPath = path.join(__dirname, 'parts_model_variants.json');
    if (fs.existsSync(variantsPath)) {
      const variantsData = JSON.parse(fs.readFileSync(variantsPath, 'utf8'));
      const variantsList = Array.isArray(variantsData.variants) ? variantsData.variants : [];

      db.run(`CREATE TABLE IF NOT EXISTS parts_model_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_model_id VARCHAR(50) NOT NULL,
        base_model_name VARCHAR(100) NOT NULL,
        variant_key VARCHAR(50) NOT NULL,
        variant_name VARCHAR(100) NOT NULL,
        source_model_name VARCHAR(100)
      )`);

      const varStmt = db.prepare(`INSERT INTO parts_model_variants (canonical_model_id, base_model_name, variant_key, variant_name, source_model_name) VALUES (?, ?, ?, ?, ?)`);
      for (const v of variantsList) {
        varStmt.run(
          v.canonical_model_id,
          v.base_model_name,
          v.variant_key,
          v.variant_name,
          v.source_model_name || null
        );
      }
      varStmt.finalize();
    }

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
    db.run(`COMMIT`);
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
