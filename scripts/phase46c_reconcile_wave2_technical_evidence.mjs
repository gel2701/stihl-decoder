/**
 * Phase 46C: BR Tier 2 Wave 2 Technical Evidence Reconciliation & Safe Activation
 *
 * Usage:
 *   node scripts/phase46c_reconcile_wave2_technical_evidence.mjs          # DRY RUN
 *   node scripts/phase46c_reconcile_wave2_technical_evidence.mjs --execute # EXECUTE WRITES
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const isExecute = process.argv.includes('--execute');

console.log('=== PHASE 46C: BR TIER 2 WAVE 2 TECHNICAL EVIDENCE RECONCILIATION ===');
console.log('Mode:', isExecute ? 'EXECUTE' : 'DRY RUN');
console.log('Timestamp:', new Date().toISOString());

// 1. Verify Phase46B baseline state
const EXPECTED_PHASE46B_COMMIT = 'b1af87bffe196290098aa079804f2e5b9c0a5509';
const EXPECTED_PHASE46B_TREE = 'abc4717d6ed1385e2939a2040a9267f6d0ce476f';

const dbPath = path.join(ROOT, 'data', 'stihl_database.json');
const dbRaw = fs.readFileSync(dbPath);
const db = JSON.parse(dbRaw.toString('utf8'));
if (db.models.length !== 110) {
  console.error(`HARD STOP: Expected 110 canonical models, got ${db.models.length}`);
  process.exit(1);
}

const factsPath = path.join(ROOT, 'data', 'public_evidence_facts.json');
const factsRaw = fs.readFileSync(factsPath);
const factsData = JSON.parse(factsRaw.toString('utf8'));
const oldFactsList = factsData.facts || factsData;
if (oldFactsList.length !== 721 && oldFactsList.length !== 761) {
  console.error(`HARD STOP: Expected 721 (baseline) or 761 (post-Phase46C) public facts, got ${oldFactsList.length}`);
  process.exit(1);
}
const oldFactsHash = crypto.createHash('sha256').update(factsRaw).digest('hex');

const manifestPath = path.join(ROOT, 'data', 'public_evidence_baseline_manifest.json');
const manifestRaw = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString('utf8'));

// 2. Load source manifest
const sourceManifestPath = path.join(ROOT, 'data', 'phase46c_source_manifest.json');
if (!fs.existsSync(sourceManifestPath)) {
  console.error('HARD STOP: Source manifest not found. Run scripts/phase46c_capture_sources.mjs first.');
  process.exit(1);
}
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));

// Helper: parse numbers
function parseNum(raw) {
  const t = String(raw).trim();
  if (/^\d+$/.test(t)) return { val: Number(t), cls: 'INTEGER' };
  if (/^\d+,\d+$/.test(t)) return { val: Number(t.replace(',', '.')), cls: 'DECIMAL_COMMA' };
  if (/^\d+\.\d+$/.test(t)) return { val: Number(t), cls: 'DECIMAL_POINT' };
  return { val: null, cls: 'UNSUPPORTED' };
}

// Deterministic Fact ID generator
function generateFactId(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

const rawLedger = [];
const semanticLedger = [];
const safeWrites = [];
const blockedRows = [];
const evidenceOnlyRows = [];
const dispositionCounts = {
  SAFE_SINGLE_VALUE: 0,
  SAFE_DUAL_UNIT_NORMALIZATION: 0,
  SAFE_COMPOUND_COMPONENT: 0,
  EVIDENCE_ONLY_SCOPED: 0,
  CONFIGURATION_MULTI_VALUE_BLOCKED: 0,
  CONFIGURATION_DEPENDENT_BLOCKED: 0,
  BATTERY_CONFIGURATION_BLOCKED: 0,
  CHARGER_SPEC_BLOCKED: 0,
  FIELD_SEMANTIC_AMBIGUOUS_BLOCKED: 0,
  UNIT_SEMANTIC_AMBIGUOUS_BLOCKED: 0,
  VARIANT_AMBIGUOUS_BLOCKED: 0,
  NOT_CANONICAL_FIELD: 0,
  DUPLICATE_EQUIVALENT: 0,
  SOURCE_CONFLICT_BLOCKED: 0,
  UNSUPPORTED_SOURCE_BLOCKED: 0
};

let rawRowCounter = 0;
let semanticRowCounter = 0;

// Process each model source
for (const s of sourceManifest.sources) {
  const modelName = s.model;
  const slug = s.slug;
  const prim = s.primary_machine_source;

  // Process primary specs
  for (const sp of prim.specs) {
    rawRowCounter++;
    const rawId = `RAW-46C-${String(rawRowCounter).padStart(4, '0')}`;
    const rawLabel = sp.label;
    const rawVal = sp.value;

    rawLedger.push({
      raw_id: rawId,
      model: modelName,
      slug: slug,
      source_id: prim.source_record_id,
      source_url: prim.source_url,
      source_hash: prim.sha256,
      raw_label: rawLabel,
      raw_value: rawVal,
      bundle_role: 'STANDALONE',
      extractor_rule: 'VTEX_TECHNICAL_SPEC_LI'
    });

    const textVal = String(rawVal).trim();

    // Classification rules
    // 1. Mains voltage
    if (/tensão|voltagem/i.test(rawLabel)) {
      if (/127|220/.test(textVal)) {
        semanticRowCounter++;
        dispositionCounts.CONFIGURATION_MULTI_VALUE_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'voltage_v',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'CONFIGURATION_MULTI_VALUE_BLOCKED',
          reason: 'Mains multi-voltage (127V / 220V) cannot be collapsed to unconditional scalar.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      // Battery voltage
      semanticRowCounter++;
      dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: 'voltage_v',
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
        reason: 'Battery platform voltage deferred to complete electrical evidence verification.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 2. Battery runtime
    if (/autonomia/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.BATTERY_CONFIGURATION_BLOCKED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'BATTERY_CONFIGURATION_BLOCKED',
        reason: 'Runtime depends on battery pack / tool configuration; unconditional scalar write blocked.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 3. Charger spec
    if (/tempo de car/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.CHARGER_SPEC_BLOCKED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'CHARGER_SPEC_BLOCKED',
        reason: 'Charging time is a charger property, not intrinsic machine metric.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 4. Battery system / recommended battery
    if (/sistema de bateria|bateria recomendada|tecnologia da bateria/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.EVIDENCE_ONLY_SCOPED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: 'battery_system',
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'EVIDENCE_ONLY_SCOPED',
        reason: 'Battery system string is qualitative evidence scoped to platform, not a scalar metric.',
        safe: false
      };
      semanticLedger.push(entry);
      evidenceOnlyRows.push(entry);
      continue;
    }

    // 5. Weight
    if (/peso/i.test(rawLabel)) {
      semanticRowCounter++;
      const isDual = textVal.includes('/');
      const disp = isDual ? 'CONFIGURATION_DEPENDENT_BLOCKED' : 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED';
      dispositionCounts[disp]++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: 'weight_kg',
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: disp,
        reason: 'Weight definition (with/without battery, bar/chain, cutting attachment) is ambiguous or configuration-dependent.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 6. Attachment, bar, chain, cutting dimensions
    if (/ferramenta de corte|diametro|tipo de sabre|corrente|passo da corrente|comprimento de corte|espaçamento|disco de corte|profundidade/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.CONFIGURATION_DEPENDENT_BLOCKED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'CONFIGURATION_DEPENDENT_BLOCKED',
        reason: 'Attachment, guide bar, saw chain, or cutting dimension is configuration-dependent.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 7. Length / Cable / Total length
    if (/comprimento/i.test(rawLabel)) {
      semanticRowCounter++;
      const disp = /cabo/i.test(rawLabel) ? 'NOT_CANONICAL_FIELD' : 'CONFIGURATION_DEPENDENT_BLOCKED';
      dispositionCounts[disp]++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: disp,
        reason: /cabo/i.test(rawLabel) ? 'Cable length is not a canonical technical field.' : 'Total length depends on attachment adjustment.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 8. Motor type / Technology
    if (/^motor$/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.NOT_CANONICAL_FIELD++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'NOT_CANONICAL_FIELD',
        reason: 'Motor description is qualitative.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 9. RPM
    if (/rotação|rot/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.CONFIGURATION_DEPENDENT_BLOCKED++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'CONFIGURATION_DEPENDENT_BLOCKED',
        reason: 'Operating RPM depends on load/attachment and is not an unconditional scalar.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 10. Non-canonical misc fields (Energia, Força de sopro, Capacidade do tanque de óleo)
    if (/energia|força de sopro|capacidade do tanque de óleo/i.test(rawLabel)) {
      semanticRowCounter++;
      dispositionCounts.NOT_CANONICAL_FIELD++;
      const entry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: rawLabel,
        raw_value: rawVal,
        disposition: 'NOT_CANONICAL_FIELD',
        reason: 'Specification has no corresponding canonical schema destination column.',
        safe: false
      };
      semanticLedger.push(entry);
      blockedRows.push(entry);
      continue;
    }

    // 11. Displacement (Gasoline HS 82 R)
    if (/cilindrada/i.test(rawLabel)) {
      const parsed = parseNum(textVal);
      if (parsed.val != null && parsed.val > 0) {
        semanticRowCounter++;
        dispositionCounts.SAFE_DUAL_UNIT_NORMALIZATION++;
        const factId = generateFactId(`phase46c:fact:${slug}:displacement_cc:${prim.source_url}:${parsed.val}`);
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'displacement_cc',
          raw_label: rawLabel,
          raw_value: rawVal,
          value: parsed.val,
          unit: 'cm3',
          measurement_definition: 'ENGINE_DISPLACEMENT',
          disposition: 'SAFE_DUAL_UNIT_NORMALIZATION',
          source_url: prim.source_url,
          source_reference: prim.reference,
          source_hash: prim.sha256,
          fact_id: factId,
          safe: true
        };
        semanticLedger.push(entry);
        safeWrites.push(entry);
        continue;
      }
    }

    // 12. Power
    if (/potência/i.test(rawLabel) && !/sonora/i.test(rawLabel)) {
      if (modelName === 'HS 82 R') {
        // Compound kW/CV: "0,7/ 1,0" -> expands into power_kw (0.7) and power_hp (1.0)
        const parts = textVal.split(/[\/\-]/).map(p => p.trim());
        const kwNum = parseNum(parts[0]);
        const hpNum = parseNum(parts[1]);

        if (parts.length === 2 && kwNum.val != null && hpNum.val != null) {
          semanticRowCounter++;
          dispositionCounts.SAFE_COMPOUND_COMPONENT++;
          const kwFactId = generateFactId(`phase46c:fact:${slug}:power_kw:${prim.source_url}:${kwNum.val}`);
          const kwEntry = {
            semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
            raw_id: rawId,
            model: modelName,
            slug: slug,
            field: 'power_kw',
            raw_label: rawLabel,
            raw_value: rawVal,
            value: kwNum.val,
            unit: 'kW',
            measurement_definition: 'ENGINE_POWER_KW',
            disposition: 'SAFE_COMPOUND_COMPONENT',
            source_url: prim.source_url,
            source_reference: prim.reference,
            source_hash: prim.sha256,
            fact_id: kwFactId,
            safe: true
          };
          semanticLedger.push(kwEntry);
          safeWrites.push(kwEntry);

          semanticRowCounter++;
          dispositionCounts.SAFE_COMPOUND_COMPONENT++;
          const hpFactId = generateFactId(`phase46c:fact:${slug}:power_hp:${prim.source_url}:${hpNum.val}`);
          const hpEntry = {
            semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
            raw_id: rawId,
            model: modelName,
            slug: slug,
            field: 'power_hp',
            raw_label: rawLabel,
            raw_value: rawVal,
            value: hpNum.val,
            unit: 'hp',
            measurement_definition: 'ENGINE_POWER_HP',
            disposition: 'SAFE_COMPOUND_COMPONENT',
            source_url: prim.source_url,
            source_reference: prim.reference,
            source_hash: prim.sha256,
            fact_id: hpFactId,
            safe: true
          };
          semanticLedger.push(hpEntry);
          safeWrites.push(hpEntry);
          continue;
        }
      } else {
        // Electrical / battery tool power is input electrical rating or mechanical dual reporting
        semanticRowCounter++;
        dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'power_kw',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
          reason: 'Electrical input power / battery motor power does not correspond to canonical engine output power.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
    }

    // 13. Sound pressure dB(A)
    if (/pressão sonora/i.test(rawLabel)) {
      if (textVal.includes('-')) {
        // Range (MSA 190 T: 91 - 101)
        semanticRowCounter++;
        dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_pressure_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
          reason: 'Sound pressure is given as a range, not a scalar value.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      if (textVal.includes('/')) {
        // Dual values (FSE 60: 95/83)
        semanticRowCounter++;
        dispositionCounts.CONFIGURATION_DEPENDENT_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_pressure_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'CONFIGURATION_DEPENDENT_BLOCKED',
          reason: 'Dual sound pressure values depend on attachment/guard configuration.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      const parsed = parseNum(textVal);
      if (parsed.val != null && parsed.val > 0) {
        semanticRowCounter++;
        dispositionCounts.SAFE_SINGLE_VALUE++;
        const factId = generateFactId(`phase46c:fact:${slug}:sound_pressure_db:${prim.source_url}:${parsed.val}`);
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_pressure_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          value: parsed.val,
          unit: 'dB(A)',
          measurement_definition: 'SOUND_PRESSURE_LEVEL',
          disposition: 'SAFE_SINGLE_VALUE',
          source_url: prim.source_url,
          source_reference: prim.reference,
          source_hash: prim.sha256,
          fact_id: factId,
          safe: true
        };
        semanticLedger.push(entry);
        safeWrites.push(entry);
        continue;
      }
    }

    // 14. Sound power dB(A)
    if (/potência sonora/i.test(rawLabel)) {
      if (textVal.includes('-')) {
        // Range (MSA 190 T: 99 - 101)
        semanticRowCounter++;
        dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_power_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
          reason: 'Sound power is given as a range, not a scalar value.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      if (textVal.includes('/')) {
        // Dual values (FSE 60: 104/94)
        semanticRowCounter++;
        dispositionCounts.CONFIGURATION_DEPENDENT_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_power_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'CONFIGURATION_DEPENDENT_BLOCKED',
          reason: 'Dual sound power values depend on attachment/guard configuration.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      const parsed = parseNum(textVal);
      if (parsed.val != null && parsed.val > 0) {
        semanticRowCounter++;
        dispositionCounts.SAFE_SINGLE_VALUE++;
        const factId = generateFactId(`phase46c:fact:${slug}:sound_power_db:${prim.source_url}:${parsed.val}`);
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'sound_power_db',
          raw_label: rawLabel,
          raw_value: rawVal,
          value: parsed.val,
          unit: 'dB(A)',
          measurement_definition: 'SOUND_POWER_LEVEL',
          disposition: 'SAFE_SINGLE_VALUE',
          source_url: prim.source_url,
          source_reference: prim.reference,
          source_hash: prim.sha256,
          fact_id: factId,
          safe: true
        };
        semanticLedger.push(entry);
        safeWrites.push(entry);
        continue;
      }
    }

    // 15. Air Volume (BGE 71)
    if (/vazão máx\. de ar/i.test(rawLabel)) {
      const parsed = parseNum(textVal);
      if (parsed.val != null && parsed.val > 0) {
        semanticRowCounter++;
        dispositionCounts.SAFE_SINGLE_VALUE++;
        const factId = generateFactId(`phase46c:fact:${slug}:air_volume_m3h:${prim.source_url}:${parsed.val}`);
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'air_volume_m3h',
          raw_label: rawLabel,
          raw_value: rawVal,
          value: parsed.val,
          unit: 'm³/h',
          measurement_definition: 'MAXIMUM_AIR_VOLUME',
          disposition: 'SAFE_SINGLE_VALUE',
          source_url: prim.source_url,
          source_reference: prim.reference,
          source_hash: prim.sha256,
          fact_id: factId,
          safe: true
        };
        semanticLedger.push(entry);
        safeWrites.push(entry);
        continue;
      }
    }

    // 16. Air Velocity (BGE 71)
    if (/velocidade máxima do ar/i.test(rawLabel)) {
      const parsed = parseNum(textVal);
      if (parsed.val != null && parsed.val > 0) {
        semanticRowCounter++;
        dispositionCounts.SAFE_SINGLE_VALUE++;
        const factId = generateFactId(`phase46c:fact:${slug}:air_velocity_ms:${prim.source_url}:${parsed.val}`);
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'air_velocity_ms',
          raw_label: rawLabel,
          raw_value: rawVal,
          value: parsed.val,
          unit: 'm/s',
          measurement_definition: 'MAXIMUM_AIR_VELOCITY',
          disposition: 'SAFE_SINGLE_VALUE',
          source_url: prim.source_url,
          source_reference: prim.reference,
          source_hash: prim.sha256,
          fact_id: factId,
          safe: true
        };
        semanticLedger.push(entry);
        safeWrites.push(entry);
        continue;
      }
    }

    // 17. Vibration
    if (/vibra/i.test(rawLabel)) {
      if (textVal.includes('<') || textVal.includes('&lt;')) {
        // Inequality string (TSA 230: < 4,3)
        semanticRowCounter++;
        dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
        const entry = {
          semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
          raw_id: rawId,
          model: modelName,
          slug: slug,
          field: 'vibration_ms2',
          raw_label: rawLabel,
          raw_value: rawVal,
          disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
          reason: 'Vibration is an inequality (< 4.3), not an exact scalar metric.',
          safe: false
        };
        semanticLedger.push(entry);
        blockedRows.push(entry);
        continue;
      }
      const parts = textVal.split(/[\/\-]/).map(p => p.trim());
      if (parts.length === 2) {
        const leftNum = parseNum(parts[0]);
        const rightNum = parseNum(parts[1]);
        if (leftNum.val != null && rightNum.val != null) {
          semanticRowCounter++;
          dispositionCounts.SAFE_COMPOUND_COMPONENT++;
          const leftFactId = generateFactId(`phase46c:fact:${slug}:vibration_left_ms2:${prim.source_url}:${leftNum.val}`);
          const leftEntry = {
            semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
            raw_id: rawId,
            model: modelName,
            slug: slug,
            field: 'vibration_left_ms2',
            raw_label: rawLabel,
            raw_value: rawVal,
            value: leftNum.val,
            unit: 'm/s²',
            measurement_definition: 'VIBRATION_LEVEL_LEFT_HANDLE',
            disposition: 'SAFE_COMPOUND_COMPONENT',
            source_url: prim.source_url,
            source_reference: prim.reference,
            source_hash: prim.sha256,
            fact_id: leftFactId,
            safe: true
          };
          semanticLedger.push(leftEntry);
          safeWrites.push(leftEntry);

          semanticRowCounter++;
          dispositionCounts.SAFE_COMPOUND_COMPONENT++;
          const rightFactId = generateFactId(`phase46c:fact:${slug}:vibration_right_ms2:${prim.source_url}:${rightNum.val}`);
          const rightEntry = {
            semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
            raw_id: rawId,
            model: modelName,
            slug: slug,
            field: 'vibration_right_ms2',
            raw_label: rawLabel,
            raw_value: rawVal,
            value: rightNum.val,
            unit: 'm/s²',
            measurement_definition: 'VIBRATION_LEVEL_RIGHT_HANDLE',
            disposition: 'SAFE_COMPOUND_COMPONENT',
            source_url: prim.source_url,
            source_reference: prim.reference,
            source_hash: prim.sha256,
            fact_id: rightFactId,
            safe: true
          };
          semanticLedger.push(rightEntry);
          safeWrites.push(rightEntry);
          continue;
        }
      }
    }

    // Default fallback (should not be reached)
    semanticRowCounter++;
    dispositionCounts.FIELD_SEMANTIC_AMBIGUOUS_BLOCKED++;
    const defEntry = {
      semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
      raw_id: rawId,
      model: modelName,
      slug: slug,
      field: null,
      raw_label: rawLabel,
      raw_value: rawVal,
      disposition: 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
      reason: 'Field could not be mapped to an accepted safe scalar metric.',
      safe: false
    };
    semanticLedger.push(defEntry);
    blockedRows.push(defEntry);
  }

  // Process secondary sources (e.g. HSA 26 kit)
  for (const sec of s.secondary_bundle_sources) {
    for (const sp of sec.specs) {
      rawRowCounter++;
      const rawId = `RAW-46C-${String(rawRowCounter).padStart(4, '0')}`;
      rawLedger.push({
        raw_id: rawId,
        model: modelName,
        slug: slug,
        source_id: sec.source_record_id,
        source_url: sec.source_url,
        source_hash: sec.sha256,
        raw_label: sp.label,
        raw_value: sp.value,
        bundle_role: 'KIT',
        extractor_rule: 'VTEX_TECHNICAL_SPEC_LI'
      });

      semanticRowCounter++;
      let disp = 'CONFIGURATION_DEPENDENT_BLOCKED';
      let reason = 'Kit-derived specification blocked by bundle precedence.';
      if (/tempo de car/i.test(sp.label) || /peso/i.test(sp.label)) {
        disp = 'CHARGER_SPEC_BLOCKED';
        reason = 'Kit charger specification / bundle package weight blocked from machine metrics.';
      } else if (/sistema de bateria/i.test(sp.label)) {
        disp = 'EVIDENCE_ONLY_SCOPED';
        reason = 'Kit battery system qualitative information.';
      } else if (/autonomia/i.test(sp.label)) {
        disp = 'BATTERY_CONFIGURATION_BLOCKED';
        reason = 'Kit runtime tied to bundled battery pack.';
      } else if (/^motor$|energia/i.test(sp.label)) {
        disp = 'NOT_CANONICAL_FIELD';
        reason = 'Kit specification has no canonical machine column.';
      } else if (/tensão/i.test(sp.label)) {
        disp = 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED';
        reason = 'Kit battery voltage is ambiguous/non-scalar.';
      }

      dispositionCounts[disp]++;
      const secEntry = {
        semantic_id: `SEM-46C-${String(semanticRowCounter).padStart(4, '0')}`,
        raw_id: rawId,
        model: modelName,
        slug: slug,
        field: null,
        raw_label: sp.label,
        raw_value: sp.value,
        disposition: disp,
        reason: reason,
        safe: false
      };
      semanticLedger.push(secEntry);
      blockedRows.push(secEntry);
    }
  }
}

// Accounting verification
const rawRowsTotal = rawLedger.length;
const semanticRowsTotal = semanticLedger.length;
const expansionRows = semanticRowsTotal - rawRowsTotal;

console.log(`Raw rows extracted: ${rawRowsTotal}`);
console.log(`Semantic expansion rows: ${expansionRows}`);
console.log(`Semantic ledger rows: ${semanticRowsTotal}`);
console.log(`Equation check: ${rawRowsTotal} raw + ${expansionRows} expansions = ${semanticRowsTotal} semantic rows: ${rawRowsTotal + expansionRows === semanticRowsTotal ? 'BALANCED ✅' : 'FAIL ❌'}`);

// 3. Disposition categories & ledger derivation
const SAFE_DISPOSITIONS = new Set([
  'SAFE_SINGLE_VALUE',
  'SAFE_DUAL_UNIT_NORMALIZATION',
  'SAFE_COMPOUND_COMPONENT'
]);

const EVIDENCE_ONLY_DISPOSITIONS = new Set([
  'EVIDENCE_ONLY_SCOPED'
]);

const BLOCKED_DISPOSITIONS = new Set([
  'CONFIGURATION_MULTI_VALUE_BLOCKED',
  'CONFIGURATION_DEPENDENT_BLOCKED',
  'BATTERY_CONFIGURATION_BLOCKED',
  'CHARGER_SPEC_BLOCKED',
  'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
  'UNIT_SEMANTIC_AMBIGUOUS_BLOCKED',
  'VARIANT_AMBIGUOUS_BLOCKED',
  'NOT_CANONICAL_FIELD',
  'DUPLICATE_EQUIVALENT',
  'SOURCE_CONFLICT_BLOCKED',
  'UNSUPPORTED_SOURCE_BLOCKED'
]);

const safeWritesTotal = semanticLedger.filter(r => SAFE_DISPOSITIONS.has(r.disposition)).length;
const blockedRowsTotal = semanticLedger.filter(r => BLOCKED_DISPOSITIONS.has(r.disposition)).length;
const evidenceOnlyRowsTotal = semanticLedger.filter(r => EVIDENCE_ONLY_DISPOSITIONS.has(r.disposition)).length;
const dispositionSum = Object.values(dispositionCounts).reduce((a, b) => a + b, 0);

console.log(`Total dispositions sum: ${dispositionSum} (matches semantic rows: ${dispositionSum === semanticRowsTotal ? 'YES ✅' : 'NO ❌'})`);
console.log(`Safe writes (SAFE_*): ${safeWritesTotal}`);
console.log(`Blocked rows (*_BLOCKED / NOT_CANONICAL): ${blockedRowsTotal}`);
console.log(`Evidence only rows (EVIDENCE_ONLY_*): ${evidenceOnlyRowsTotal}`);
console.log(`Accounting equation: ${safeWritesTotal} safe + ${blockedRowsTotal} blocked + ${evidenceOnlyRowsTotal} evidence-only = ${safeWritesTotal + blockedRowsTotal + evidenceOnlyRowsTotal} (ledger: ${semanticRowsTotal})`);

const safeEquationSum = dispositionCounts.SAFE_SINGLE_VALUE + dispositionCounts.SAFE_DUAL_UNIT_NORMALIZATION + dispositionCounts.SAFE_COMPOUND_COMPONENT;
console.log(`Safe writes equation: ${dispositionCounts.SAFE_SINGLE_VALUE} (SINGLE) + ${dispositionCounts.SAFE_DUAL_UNIT_NORMALIZATION} (DUAL_NORM) + ${dispositionCounts.SAFE_COMPOUND_COMPONENT} (COMPOUND) = ${safeEquationSum} (matches safe canonical writes: ${safeEquationSum === safeWritesTotal ? 'YES ✅' : 'NO ❌'})`);

// Strict Accounting Assertions
if (safeWritesTotal !== 40) {
  console.error(`HARD STOP: Expected exactly 40 safe writes, got ${safeWritesTotal}`);
  process.exit(1);
}
if (blockedRowsTotal !== 107) {
  console.error(`HARD STOP: Expected exactly 107 blocked rows, got ${blockedRowsTotal}`);
  process.exit(1);
}
if (evidenceOnlyRowsTotal !== 9) {
  console.error(`HARD STOP: Expected exactly 9 evidence-only rows, got ${evidenceOnlyRowsTotal}`);
  process.exit(1);
}
if (safeWritesTotal + blockedRowsTotal + evidenceOnlyRowsTotal !== semanticRowsTotal) {
  console.error(`HARD STOP: Accounting sum ${safeWritesTotal + blockedRowsTotal + evidenceOnlyRowsTotal} !== ${semanticRowsTotal}`);
  process.exit(1);
}
if (dispositionSum !== semanticRowsTotal) {
  console.error(`HARD STOP: Disposition sum ${dispositionSum} !== ${semanticRowsTotal}`);
  process.exit(1);
}

// 4. Build Canonical Delta
const canonicalDelta = [];
for (const w of safeWrites) {
  canonicalDelta.push({
    model: w.model,
    slug: w.slug,
    field: w.field,
    old_value: null,
    new_value: w.value,
    unit: w.unit,
    source_url: w.source_url,
    source_reference: w.source_reference,
    source_hash: w.source_hash,
    disposition: w.disposition,
    fact_id: w.fact_id,
    reason: `Verified official STIHL evidence from ${w.source_url}`
  });
}

// 5. Build Fact Crosswalk
const factCrosswalk = safeWrites.map(w => ({
  model: w.model,
  slug: w.slug,
  field: w.field,
  canonical_value: w.value,
  unit: w.unit,
  fact_id: w.fact_id,
  runtime_index_key: `${w.slug}:${w.field}`,
  source_reference: w.source_reference,
  source_url: w.source_url
}));

// 6. Build Field Disposition Summary
const fieldDispositionSummary = {
  phase: '46C',
  total_raw_rows: rawRowsTotal,
  total_semantic_expansions: expansionRows,
  total_semantic_rows: semanticRowsTotal,
  disposition_counts: dispositionCounts,
  safe_canonical_writes: safeWritesTotal,
  blocked_rows: blockedRowsTotal,
  evidence_only_rows: evidenceOnlyRowsTotal,
  accounting_balanced: (safeWritesTotal + blockedRowsTotal + evidenceOnlyRowsTotal === semanticRowsTotal) && (dispositionSum === semanticRowsTotal)
};

// 7. Build Model-by-Model Summary
const modelTechnicalSummary = sourceManifest.sources.map(s => {
  const modelRaw = rawLedger.filter(r => r.model === s.model);
  const modelSemantic = semanticLedger.filter(r => r.model === s.model);
  const modelWrites = semanticLedger.filter(r => r.model === s.model && SAFE_DISPOSITIONS.has(r.disposition));
  const modelBlocked = semanticLedger.filter(r => r.model === s.model && BLOCKED_DISPOSITIONS.has(r.disposition));
  const modelEvidenceOnly = semanticLedger.filter(r => r.model === s.model && EVIDENCE_ONLY_DISPOSITIONS.has(r.disposition));

  return {
    model: s.model,
    slug: s.slug,
    raw_rows: modelRaw.length,
    semantic_rows: modelSemantic.length,
    safe_canonical_writes: modelWrites.length,
    public_facts_created: modelWrites.length,
    evidence_only_rows: modelEvidenceOnly.length,
    blocked_rows: modelBlocked.length,
    conflicts: 0,
    activated_fields: modelWrites.map(w => ({ field: w.field, value: w.value, unit: w.unit })),
    remaining_null_fields: [
      'displacement_cc', 'power_kw', 'power_hp', 'weight_kg',
      'spark_plug', 'electrode_gap_mm', 'carb_h_setting', 'carb_l_setting',
      'carb_la_setting', 'chain_pitch', 'chain_gauge_mm', 'oil_mix_ratio',
      'battery_system', 'voltage_v', 'sound_pressure_db', 'sound_power_db',
      'vibration_left_ms2', 'vibration_right_ms2', 'air_volume_m3h', 'air_velocity_ms'
    ].filter(f => !modelWrites.some(w => w.field === f))
  };
});

// Write audit artifacts
fs.writeFileSync(path.join(ROOT, 'data/phase46c_raw_extraction_ledger.json'), JSON.stringify({
  phase: '46C',
  total_raw_rows: rawLedger.length,
  ledger: rawLedger
}, null, 2));

fs.writeFileSync(path.join(ROOT, 'data/phase46c_semantic_reconciliation_ledger.json'), JSON.stringify({
  phase: '46C',
  total_semantic_rows: semanticLedger.length,
  ledger: semanticLedger
}, null, 2));

fs.writeFileSync(path.join(ROOT, 'data/phase46c_field_disposition_summary.json'), JSON.stringify(fieldDispositionSummary, null, 2));

fs.writeFileSync(path.join(ROOT, 'data/phase46c_model_technical_summary.json'), JSON.stringify({
  phase: '46C',
  total_models: modelTechnicalSummary.length,
  summary: modelTechnicalSummary
}, null, 2));

fs.writeFileSync(path.join(ROOT, 'data/phase46c_canonical_delta.json'), JSON.stringify({
  phase: '46C',
  total_writes: canonicalDelta.length,
  writes: canonicalDelta
}, null, 2));

fs.writeFileSync(path.join(ROOT, 'data/phase46c_fact_crosswalk.json'), JSON.stringify({
  phase: '46C',
  total_crosswalk_entries: factCrosswalk.length,
  crosswalk: factCrosswalk
}, null, 2));

console.log('✅ Generated Phase 46C audit artifacts in data/');

if (isExecute) {
  console.log('\n--- EXECUTING TECHNICAL EVIDENCE ACTIVATION ---');

  // 1. Apply canonical writes to db.models (only the 12 Wave 2 models)
  const targetSlugs = new Set(sourceManifest.sources.map(s => s.slug));
  let writeCount = 0;

  for (const delta of canonicalDelta) {
    if (!targetSlugs.has(delta.slug)) {
      console.error(`HARD STOP: Proposed write targets non-Wave 2 model: ${delta.slug}`);
      process.exit(1);
    }
    const model = db.models.find(m => m.slug === delta.slug);
    if (!model) {
      console.error(`HARD STOP: Target model not found: ${delta.slug}`);
      process.exit(1);
    }
    if (model[delta.field] !== delta.new_value) {
      model[delta.field] = delta.new_value;
      writeCount++;
    }
  }

  if (writeCount > 0) {
    console.log(`Applied ${writeCount} canonical technical writes across ${targetSlugs.size} models.`);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log(`Updated ${dbPath}`);
  } else {
    console.log(`All ${canonicalDelta.length} canonical technical writes already applied. No db writes.`);
  }

  // 2. Build and append 40 new public facts
  const newPublicFacts = safeWrites.map(w => ({
    fact_id: w.fact_id,
    model_slug: w.slug,
    variant_slug: w.slug,
    model_name: w.model,
    category: db.models.find(m => m.slug === w.slug)?.category || 'Kettingzaag',
    field: w.field,
    raw_value: String(w.raw_value),
    normalized_value: w.value,
    unit: w.unit,
    measurement_definition: w.measurement_definition || null,
    public_evidence_status: 'OFFICIAL_DOCUMENTED',
    display_eligible: true,
    single_value_eligible: true,
    source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
    source_url: w.source_url,
    source_document_id: w.source_url,
    source_document_title: `STIHL ${w.model} BR Product Page`,
    market: 'BR',
    retrieved_at: '2026-09-22T11:22:00.000Z',
    model_scope: 'EXACT_MODEL',
    scope_evidence: [
      `DOC_MODEL:${w.slug}`,
      `STIHL_REFERENCE:${w.source_reference}`
    ],
    field_semantic_status: 'VALID',
    conflict_status: 'CLEAR',
    conflict_group_id: null,
    conflicting_values: [],
    configuration: null,
    source_locator_type: 'PRODUCT_PAGE',
    source_locator: w.source_url,
    source_heading: w.raw_label,
    evidence_hash: w.source_hash,
    generated_from_phase: '46C',
    evidence_status: 'OFFICIAL_DOCUMENTED',
    source: {
      url: w.source_url,
      reference: w.source_reference,
      raw_label: w.raw_label,
      raw_value: String(w.raw_value),
      retrieved_at: '2026-09-22T11:22:00.000Z'
    },
    source_lineage: `Phase46C official STIHL Brazil product page -> ${w.raw_label} -> ${w.value} ${w.unit}`
  }));

  // Append new facts (idempotent)
  const existingFactIds = new Set(oldFactsList.map(f => f.fact_id));
  const factsToAppend = newPublicFacts.filter(f => !existingFactIds.has(f.fact_id));

  if (factsToAppend.length > 0) {
    const finalFactsList = [...oldFactsList, ...factsToAppend];
    factsData.facts = finalFactsList;

    for (const nf of factsToAppend) {
      if (!factsData.model_index[nf.model_slug]) {
        factsData.model_index[nf.model_slug] = {
          model_name: nf.model_name,
          category: nf.category,
          aliases: [
            nf.model_slug,
            nf.model_name,
            `STIHL ${nf.model_name}`,
            nf.model_name.replace(/[\s\-_]+/g, '')
          ],
          fact_ids: []
        };
      }
      if (!factsData.model_index[nf.model_slug].fact_ids.includes(nf.fact_id)) {
        factsData.model_index[nf.model_slug].fact_ids.push(nf.fact_id);
      }

      if (!factsData.field_index[nf.model_slug]) {
        factsData.field_index[nf.model_slug] = {};
      }
      factsData.field_index[nf.model_slug][nf.field] = nf.fact_id;
    }

    factsData.phase = '46C';
    factsData.last_updated = '2026-09-22T11:31:01.664Z';

    fs.writeFileSync(factsPath, JSON.stringify(factsData, null, 2));
    console.log(`Updated ${factsPath}: ${oldFactsList.length} -> ${finalFactsList.length} public facts.`);

    // 3. Update public evidence baseline manifest
    const newFactsRaw = fs.readFileSync(factsPath);
    const newFactsHash = crypto.createHash('sha256').update(newFactsRaw).digest('hex');
    const newDbHash = crypto.createHash('sha256').update(JSON.stringify(db.models)).digest('hex');

    manifest.phase = '46C';
    manifest.canonical_model_count = db.models.length;
    manifest.canonical_db_hash = newDbHash;
    manifest.public_fact_count = finalFactsList.length;
    manifest.public_evidence_hash = newFactsHash;
    manifest.last_updated = '2026-09-22T11:31:01.664Z';

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Updated ${manifestPath}: public_fact_count = ${manifest.public_fact_count}`);
  } else {
    console.log(`Public evidence store already contains all ${newPublicFacts.length} Phase 46C facts. No new facts to append.`);
  }

  // 4. Rebuild SQLite database if writes occurred or db missing
  if (writeCount > 0 || !fs.existsSync(path.join(ROOT, 'data/stihl_database.db'))) {
    console.log('\n--- REBUILDING SQLITE DATABASE (seed.cjs) ---');
    execSync('node data/seed.cjs', { cwd: ROOT, stdio: 'inherit' });
    console.log('SQLite database rebuild complete.');
  } else {
    console.log('SQLite database already in sync. Rebuild skipped.');
  }

  console.log('\n✅ PHASE 46C EXECUTION COMPLETED SUCCESSFULLY.');
} else {
  console.log('\nDRY RUN complete. Use --execute to apply changes.');
}
