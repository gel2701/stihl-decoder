import assert from 'assert';
import { parsePtNumber, parseVolumeMl, normalizeSpecs, normalizeModelName } from '../lib/officialHarvester/normalize.js';

// decimal comma
assert.strictEqual(parsePtNumber('30,1'), 30.1);
assert.strictEqual(parsePtNumber('10,8'), 10.8);
assert.strictEqual(parsePtNumber('4,5 - sem conjunto de corte'), 4.5);
assert.strictEqual(parsePtNumber('127 / 220'), 127);
assert.strictEqual(parsePtNumber(''), null);
assert.strictEqual(parsePtNumber(null), null);

// ml <-> liter
assert.strictEqual(parseVolumeMl('500 ml'), 500);
assert.strictEqual(parseVolumeMl('0,5 l'), 500);
assert.strictEqual(parseVolumeMl('1,2 L'), 1200);

// full mapping: petrol saw
const { specs, extra_specs } = normalizeSpecs({
  'Cilindrada (cm³)': '30,1',
  'Potência (kW/cv)': '1,3',
  'Peso (kg)': '4,5 - sem conjunto de corte',
  'Nível de pressão sonora dB(A)': '100',
  'Nível de potência sonora dB(A)': '113',
  Corrente: '61 PMM3 Picco Micro Mini Corrente',
  'Passo da corrente': '3 /8” P',
  'Capacidade do tanque de combustível': '250 ml',
  'Tanque de óleo': '0,15 l',
  'Nível de vibração esquerda (m/s²)': '5,2',
  'Nível de vibração direita (m/s²)': '6,1',
  'Sabre exótico desconhecido (xyz)': '123',
});
assert.strictEqual(specs.displacement_cc, 30.1);
assert.strictEqual(specs.power_kw, 1.3);
assert.ok(!('power_hp' in specs), 'must not invent hp conversion');
assert.strictEqual(specs.weight_kg, 4.5);
assert.strictEqual(specs.sound_pressure_db, 100);
assert.strictEqual(specs.sound_power_db, 113);
assert.strictEqual(specs.chain_model, '61 PMM3 Picco Micro Mini Corrente');
assert.strictEqual(specs.fuel_tank_ml, 250);
assert.strictEqual(specs.oil_tank_ml, 150);
assert.strictEqual(specs.vibration_left_m_s2, 5.2);
assert.strictEqual(specs.vibration_right_m_s2, 6.1);
assert.ok(extra_specs['Sabre exótico desconhecido (xyz)'] === '123', 'unmapped preserved, nothing dropped');

// battery mapping
const batt = normalizeSpecs({
  'Tensão da bateria (V)': '10,8',
  'Sistema de bateria': 'AS',
  'Comprimento de corte (cm)': '45',
  'Espaçamento entre os dentes mm': '22',
});
assert.strictEqual(batt.specs.voltage_v, 10.8);
assert.strictEqual(batt.specs.battery_system, 'AS');
assert.strictEqual(batt.specs.cutting_length_cm, 45);
assert.strictEqual(batt.specs.tooth_spacing_mm, 22);

// combined esquerda/direita vibration splits explicitly
const vib = normalizeSpecs({ 'Nivel de vibração esquerda/direita (m/s²)': '3,9/3,6' });
assert.strictEqual(vib.specs.vibration_left_m_s2, 3.9);
assert.strictEqual(vib.specs.vibration_right_m_s2, 3.6);

// model normalization
assert.strictEqual(normalizeModelName('ms  162'), 'MS 162');
assert.strictEqual(normalizeModelName('MS-162'), 'MS-162');

console.log('✔ official harvester normalize checks passed.');
