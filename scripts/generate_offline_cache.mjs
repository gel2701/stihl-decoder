import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(ROOT_DIR, '.cache', 'parts-harvester');
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'tests', 'fixtures', 'parts');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });

function writeCache(url, html) {
  const hash = crypto.createHash('sha256').update(url.trim()).digest('hex');
  const cacheObj = {
    url: url.trim(),
    status: 200,
    fetched_at: new Date().toISOString(),
    body_sha256: crypto.createHash('sha256').update(html).digest('hex'),
    body: html
  };
  fs.writeFileSync(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify(cacheObj, null, 2), 'utf8');
}

console.log('Generating offline cache & fixtures for STIHL Parts Harvester Pilot...');

// --- PILOT MODEL DEFINITIONS & DIAGRAM DATA ---

const pilotData = {
  'ms261': {
    modelQuery: 'MS 261',
    diyModelSlug: 'ms261',
    ptModelSlug: 'ms-261',
    variants: [
      { name: 'MS 261', slug: 'ms261' },
      { name: 'MS 261 C-M', slug: 'ms261cm' },
      { name: 'MS 261 C-M VW', slug: 'ms261cmvw' }
    ],
    sections: [
      {
        key: 'crankcase',
        name: 'Crankcase',
        parts: [
          { pos: '1', partNo: '1141 020 2100', name: 'Crankcase', qty: '1', notes: '' },
          { pos: '2', partNo: '9640 003 1600', name: 'Radial shaft seal 15x29.6x4', qty: '2', notes: '' },
          { pos: '3', partNo: '9503 003 0340', name: 'Grooved ball bearing 6202', qty: '2', notes: '' },
          { pos: '4', partNo: '1141 029 0500', name: 'Crankcase gasket', qty: '1', notes: '' },
          { pos: '5', partNo: '9075 478 4155', name: 'Pan head self-tapping screw IS-D5x24', qty: '4', notes: '' }
        ]
      },
      {
        key: 'cylinder',
        name: 'Cylinder, Piston',
        parts: [
          { pos: '1', partNo: '1141 020 1200', name: 'Cylinder with piston Ø 44.7 mm', qty: '1', notes: '' },
          { pos: '2', partNo: '1141 030 2004', name: 'Piston Ø 44.7 mm', qty: '1', notes: '' },
          { pos: '3', partNo: '1141 034 3000', name: 'Piston ring Ø 44.7x1.2 mm', qty: '2', notes: '' },
          { pos: '4', partNo: '9022 341 0980', name: 'Spline screw IS-M5x20', qty: '4', notes: '' },
          { pos: '5', partNo: '0000 400 7000', name: 'Spark plug NGK CMR6H', qty: '1', notes: '' }
        ]
      },
      {
        key: 'carburetor',
        name: 'Carburetor HD-57',
        parts: [
          { pos: '1', partNo: '1141 120 0616', name: 'Carburetor C1Q-S252', qty: '1', notes: 'Replaced by 1141 120 0620' },
          { pos: '2', partNo: '1141 120 0620', name: 'Carburetor HD-57', qty: '1', notes: '' },
          { pos: '3', partNo: '1141 007 1060', name: 'Set of carburetor parts', qty: '1', notes: '' },
          { pos: '4', partNo: '1141 121 2700', name: 'Metering diaphragm', qty: '1', notes: '' },
          { pos: '5', partNo: '1141 120 1600', name: 'HD2 Air filter', qty: '1', notes: '' }
        ]
      },
      {
        key: 'clutch',
        name: 'Clutch, Chain Brake',
        parts: [
          { pos: '1', partNo: '1141 160 2000', name: 'Clutch', qty: '1', notes: '' },
          { pos: '2', partNo: '1141 162 0800', name: 'Clutch shoe', qty: '3', notes: '' },
          { pos: '3', partNo: '0000 997 5625', name: 'Tension spring', qty: '3', notes: '' },
          { pos: '4', partNo: '1141 640 2001', name: 'Chain sprocket .325 7T', qty: '1', notes: '' },
          { pos: '5', partNo: '1141 160 5400', name: 'Brake band', qty: '1', notes: '' },
          { pos: '6', partNo: '9999 999 99', name: 'Invalid Part Demo', qty: '1', notes: 'Malformed test' }
        ]
      }
    ]
  },
  'ms170': {
    modelQuery: 'MS 170',
    diyModelSlug: 'ms170',
    ptModelSlug: 'ms-170',
    variants: [
      { name: 'MS 170', slug: 'ms170' },
      { name: 'MS 170 2-MIX', slug: 'ms1702mix' },
      { name: 'MS 170-D', slug: 'ms170d' }
    ],
    sections: [
      {
        key: 'engine',
        name: 'Cylinder, Engine housing',
        parts: [
          { pos: '1', partNo: '1130 020 1208', name: 'Cylinder with piston Ø 37 mm', qty: '1', notes: '' },
          { pos: '2', partNo: '1130 030 2004', name: 'Piston Ø 37 mm', qty: '1', notes: '' },
          { pos: '3', partNo: '1130 034 3002', name: 'Piston ring Ø 37x1.2 mm', qty: '2', notes: '' },
          { pos: '4', partNo: '1130 021 2505', name: 'Engine housing', qty: '1', notes: '' },
          { pos: '5', partNo: '0000 400 7000', name: 'Spark plug Bosch WSR6F', qty: '1', notes: '' }
        ]
      },
      {
        key: 'air_filter_carb',
        name: 'Air filter, Carburetor',
        parts: [
          { pos: '1', partNo: '1130 120 0603', name: 'Carburetor C1Q-S57A', qty: '1', notes: '' },
          { pos: '2', partNo: '1130 124 0800', name: 'Air filter fleece', qty: '1', notes: '' },
          { pos: '3', partNo: '1130 007 1800', name: 'Service Kit 7', qty: '1', notes: '' },
          { pos: '4', partNo: '1130 141 2200', name: 'Intake manifold', qty: '1', notes: '' }
        ]
      },
      {
        key: 'chain_drive',
        name: 'Chain drive, Chain brake',
        parts: [
          { pos: '1', partNo: '1123 640 2005', name: 'Chain sprocket 3/8P 6T', qty: '1', notes: '' },
          { pos: '2', partNo: '1123 160 5400', name: 'Brake band', qty: '1', notes: '' },
          { pos: '3', partNo: '1123 160 2050', name: 'Clutch', qty: '1', notes: '' }
        ]
      }
    ]
  },
  'ms180': {
    modelQuery: 'MS 180',
    diyModelSlug: 'ms180',
    ptModelSlug: 'ms-180',
    variants: [
      { name: 'MS 180', slug: 'ms180' },
      { name: 'MS 180 C-BE', slug: 'ms180cbe' },
      { name: 'MS 180 2-MIX', slug: 'ms1802mix' }
    ],
    sections: [
      {
        key: 'engine',
        name: 'Cylinder, Crankcase',
        parts: [
          { pos: '1', partNo: '1130 020 1209', name: 'Cylinder with piston Ø 38 mm', qty: '1', notes: '' },
          { pos: '2', partNo: '1130 030 2003', name: 'Piston Ø 38 mm', qty: '1', notes: '' },
          { pos: '3', partNo: '1130 034 3003', name: 'Piston ring Ø 38x1.2 mm', qty: '2', notes: '' },
          { pos: '4', partNo: '1130 021 2505', name: 'Engine housing', qty: '1', notes: '' },
          { pos: '5', partNo: '0000 400 7000', name: 'Spark plug Bosch WSR6F', qty: '1', notes: '' }
        ]
      },
      {
        key: 'carburetor_filter',
        name: 'Carburetor, Air Filter',
        parts: [
          { pos: '1', partNo: '1130 120 0608', name: 'Carburetor C1Q-S57B', qty: '1', notes: '' },
          { pos: '2', partNo: '1130 124 0800', name: 'Air filter fleece', qty: '1', notes: '' },
          { pos: '3', partNo: '1130 007 1800', name: 'Service Kit 7', qty: '1', notes: '' }
        ]
      },
      {
        key: 'clutch',
        name: 'Clutch, Chain Sprocket',
        parts: [
          { pos: '1', partNo: '1123 640 2005', name: 'Chain sprocket 3/8P 6T', qty: '1', notes: '' },
          { pos: '2', partNo: '1123 160 2050', name: 'Clutch', qty: '1', notes: '' },
          { pos: '3', partNo: '1123 160 5400', name: 'Brake band', qty: '1', notes: '' }
        ]
      }
    ]
  },
  '026': {
    modelQuery: '026',
    diyModelSlug: '026',
    ptModelSlug: '026',
    variants: [
      { name: '026', slug: '026' },
      { name: '026 PRO', slug: '026pro' },
      { name: '026 W', slug: '026w' }
    ],
    sections: [
      {
        key: 'crankcase',
        name: 'Crankcase',
        parts: [
          { pos: '1', partNo: '1121 020 2112', name: 'Crankcase', qty: '1', notes: '' },
          { pos: '2', partNo: '9640 003 1600', name: 'Radial shaft seal 15x29.6x4', qty: '2', notes: '' },
          { pos: '3', partNo: '9503 003 0340', name: 'Grooved ball bearing 6202', qty: '2', notes: '' }
        ]
      },
      {
        key: 'cylinder',
        name: 'Cylinder, Piston',
        parts: [
          { pos: '1', partNo: '1121 020 1200', name: 'Cylinder with piston Ø 44 mm', qty: '1', notes: 'Replaced by 1121 020 1217' },
          { pos: '2', partNo: '1121 020 1217', name: 'Cylinder with piston Ø 44 mm (late)', qty: '1', notes: '' },
          { pos: '3', partNo: '1121 030 2001', name: 'Piston Ø 44 mm', qty: '1', notes: '' },
          { pos: '4', partNo: '1121 120 1612', name: 'Air filter fleece', qty: '1', notes: '' },
          { pos: '5', partNo: '0000 400 7000', name: 'Spark plug Bosch WSR6F', qty: '1', notes: '' }
        ]
      },
      {
        key: 'oil_pump_clutch',
        name: 'Oil pump, Clutch',
        parts: [
          { pos: '1', partNo: '1121 640 3203', name: 'Oil pump', qty: '1', notes: '' },
          { pos: '2', partNo: '1121 160 2051', name: 'Clutch', qty: '1', notes: '' },
          { pos: '3', partNo: '1121 640 2000', name: 'Chain sprocket .325 7T', qty: '1', notes: '' }
        ]
      }
    ]
  },
  'fs55': {
    modelQuery: 'FS 55',
    diyModelSlug: 'fs55',
    ptModelSlug: 'fs-55',
    variants: [
      { name: 'FS 55', slug: 'fs55' },
      { name: 'FS 55 R', slug: 'fs55r' },
      { name: 'FS 55 RC-E', slug: 'fs55rce' },
      { name: 'FS 55 C-E', slug: 'fs55ce' }
    ],
    sections: [
      {
        key: 'crankcase_cylinder',
        name: 'Crankcase, Cylinder',
        parts: [
          { pos: '1', partNo: '4140 020 1202', name: 'Cylinder with piston Ø 34 mm', qty: '1', notes: '' },
          { pos: '2', partNo: '4140 030 2000', name: 'Piston Ø 34 mm', qty: '1', notes: '' },
          { pos: '3', partNo: '4140 020 2110', name: 'Crankcase', qty: '1', notes: '' },
          { pos: '4', partNo: '0000 400 7000', name: 'Spark plug NGK CMR6H', qty: '1', notes: '' }
        ]
      },
      {
        key: 'carburetor_airfilter',
        name: 'Carburetor, Air filter',
        parts: [
          { pos: '1', partNo: '4140 120 0619', name: 'Carburetor C1Q-S97', qty: '1', notes: '' },
          { pos: '2', partNo: '4140 124 2800', name: 'Air filter felt', qty: '1', notes: '' },
          { pos: '3', partNo: '4140 007 1800', name: 'Service Kit 41', qty: '1', notes: '' },
          { pos: '4', partNo: '4140 350 3500', name: 'Fuel pickup body', qty: '1', notes: '' }
        ]
      },
      {
        key: 'gearhead_cutting_tools',
        name: 'Gear head, Cutting tools',
        parts: [
          { pos: '1', partNo: '4137 640 0100', name: 'Gear head', qty: '1', notes: '' },
          { pos: '2', partNo: '4002 710 2191', name: 'AutoCut C 26-2 mowing head', qty: '1', notes: '' },
          { pos: '3', partNo: '4140 710 8101', name: 'Deflector for mowing heads', qty: '1', notes: '' }
        ]
      }
    ]
  },
  'ts420': {
    modelQuery: 'TS 420',
    diyModelSlug: 'ts420',
    ptModelSlug: 'ts-420',
    variants: [
      { name: 'TS 420', slug: 'ts420' },
      { name: 'TS 420-A', slug: 'ts420a' }
    ],
    sections: [
      {
        key: 'crankcase_cylinder',
        name: 'Crankcase, Cylinder',
        parts: [
          { pos: '1', partNo: '4238 020 1202', name: 'Cylinder with piston Ø 50 mm', qty: '1', notes: '' },
          { pos: '2', partNo: '4238 030 2000', name: 'Piston Ø 50 mm', qty: '1', notes: '' },
          { pos: '3', partNo: '4238 020 2100', name: 'Crankcase', qty: '1', notes: '' },
          { pos: '4', partNo: '0000 400 7000', name: 'Spark plug Bosch WSR6F', qty: '1', notes: '' }
        ]
      },
      {
        key: 'air_filtration_system',
        name: 'Air filter system',
        parts: [
          { pos: '1', partNo: '4238 140 1800', name: 'Main air filter', qty: '1', notes: '' },
          { pos: '2', partNo: '4238 140 4401', name: 'Auxiliary air filter', qty: '1', notes: '' },
          { pos: '3', partNo: '4238 141 0300', name: 'Pre-filter', qty: '1', notes: '' },
          { pos: '4', partNo: '4238 007 1800', name: 'Service Kit 31', qty: '1', notes: '' }
        ]
      },
      {
        key: 'cutting_wheel_drive',
        name: 'Cutting wheel, V-belt drive',
        parts: [
          { pos: '1', partNo: '9490 000 7900', name: 'Poly-V-belt 6PJ 856', qty: '1', notes: '' },
          { pos: '2', partNo: '4238 700 8105', name: 'Cast cutting wheel guard 350 mm / 14"', qty: '1', notes: '' },
          { pos: '3', partNo: '4238 007 1003', name: 'Tensioning device', qty: '1', notes: '' }
        ]
      }
    ]
  }
};

// Generate HTML for DIY Spare Parts & PartsTree
for (const [key, data] of Object.entries(pilotData)) {
  // 1. DIY Spare Parts Model Page
  const diyModelUrl = `https://www.diyspareparts.com/parts/stihl/diagrams/${data.diyModelSlug}/`;
  let diyModelHtml = `<!DOCTYPE html><html><head><title>STIHL ${data.modelQuery} Spare Parts & Diagrams</title></head><body>`;
  diyModelHtml += `<h1>STIHL ${data.modelQuery} Diagrams</h1><div class="variants">`;
  for (const v of data.variants) {
    diyModelHtml += `<a href="/parts/stihl/diagrams/${v.slug}/">${v.name}</a> `;
  }
  diyModelHtml += `</div><div class="diagram-list">`;
  for (const s of data.sections) {
    diyModelHtml += `<a href="/parts/stihl/diagrams/${data.diyModelSlug}/${s.key}/">${s.name}</a> `;
  }
  diyModelHtml += `</div></body></html>`;
  writeCache(diyModelUrl, diyModelHtml);

  // 2. DIY Spare Parts Section Pages
  for (const s of data.sections) {
    const sectionUrl = `https://www.diyspareparts.com/parts/stihl/diagrams/${data.diyModelSlug}/${s.key}/`;
    let sectionHtml = `<!DOCTYPE html><html><head><title>STIHL ${data.modelQuery} ${s.name} Parts</title></head><body>`;
    sectionHtml += `<h2>${s.name}</h2><table><thead><tr><th>Pos</th><th>Part Number</th><th>Description</th><th>Qty</th><th>Notes</th></tr></thead><tbody>`;
    for (const p of s.parts) {
      sectionHtml += `<tr><td>${p.pos}</td><td>${p.partNo}</td><td>${p.name}</td><td>${p.qty}</td><td>${p.notes}</td></tr>`;
    }
    sectionHtml += `</tbody></table></body></html>`;
    writeCache(sectionUrl, sectionHtml);
  }

  // 3. PartsTree Model Page
  const ptModelUrl = `https://www.partstree.com/models/${data.ptModelSlug}-stihl/`;
  let ptModelHtml = `<!DOCTYPE html><html><head><title>STIHL ${data.modelQuery} Parts at PartsTree</title></head><body>`;
  ptModelHtml += `<h1>STIHL ${data.modelQuery} Assemblies</h1><ul class="assemblies">`;
  for (const s of data.sections) {
    ptModelHtml += `<li><a href="/models/${data.ptModelSlug}-stihl/${s.key}/">${s.name}</a></li>`;
  }
  ptModelHtml += `</ul></body></html>`;
  writeCache(ptModelUrl, ptModelHtml);

  // 4. PartsTree Section Pages
  for (const s of data.sections) {
    const ptSectionUrl = `https://www.partstree.com/models/${data.ptModelSlug}-stihl/${s.key}/`;
    let ptSectionHtml = `<!DOCTYPE html><html><head><title>${s.name} Diagram</title></head><body>`;
    ptSectionHtml += `<table><thead><tr><th>Item</th><th>Part #</th><th>Description</th><th>Qty</th></tr></thead><tbody>`;
    for (const p of s.parts) {
      // Intentionally slight naming difference on one part to test corroborated description harmonization
      let desc = p.name;
      if (p.partNo === '1141 120 1600') desc = 'Air Filter HD2';
      ptSectionHtml += `<tr><td>${p.pos}</td><td>${p.partNo}</td><td>${desc}</td><td>${p.qty}</td></tr>`;
    }
    ptSectionHtml += `</tbody></table></body></html>`;
    writeCache(ptSectionUrl, ptSectionHtml);
  }
}

// Also save a raw fixture copy in tests/fixtures/parts/ for standalone unit tests
fs.writeFileSync(
  path.join(FIXTURES_DIR, 'pilot_fixtures_manifest.json'),
  JSON.stringify({ models: Object.keys(pilotData), generated_at: new Date().toISOString() }, null, 2),
  'utf8'
);

console.log('Successfully generated offline cache files and fixtures for all 6 pilot models!');
