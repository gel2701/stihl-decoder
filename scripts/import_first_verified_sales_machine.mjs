import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const officialAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const dbJsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const batchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-11-03_verified_sales_machine');
const salesMachinesPath = path.join(rootDir, 'data', 'verified_sales_machines.json');

console.log('1. Loading existing official serial anchors...');
const officialAnchorsDoc = JSON.parse(fs.readFileSync(officialAnchorsPath, 'utf8'));
const anchors = officialAnchorsDoc.anchors;
const initialCount = anchors.length;
console.log(`Initial anchor count: ${initialCount}`);

const targetSerial = '161441572';
const existingIdx = anchors.findIndex(a => a.serial_number === targetSerial);
if (existingIdx !== -1) {
  console.log(`Serial ${targetSerial} already exists in official_serial_anchors.`);
} else {
  const newAnchor = {
    serial_number: targetSerial,
    model_name: 'MS 260 C-B .325" P Motorsäge',
    canonical_model_id: 'stihl_ms_260',
    category: 'Kettingzaag',
    drive_type: 'Benzine',
    source: 'MY_STIHL',
    source_url: 'https://app.stihl.com/nl-nl/mystihl/tools/add',
    verification_date: '2026-11-03',
    verification_method: 'handmatig gecontroleerd MY STIHL-account, screenshot van 3 november 2026',
    evidence_type: 'OFFICIAL_WEB_LOOKUP',
    verification_status: 'OFFICIAL_STIHL_LOOKUP'
  };

  anchors.push(newAnchor);
  anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
  officialAnchorsDoc.anchors = anchors;

  fs.writeFileSync(officialAnchorsPath, JSON.stringify(officialAnchorsDoc, null, 2) + '\n', 'utf8');
  console.log(`Updated official_serial_anchors.json with ${targetSerial}. New count: ${anchors.length}`);

  // 2. Update stihl_database.json
  const dbJson = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
  dbJson.official_serial_anchors = anchors;
  fs.writeFileSync(dbJsonPath, JSON.stringify(dbJson, null, 2) + '\n', 'utf8');
  console.log(`Updated stihl_database.json official_serial_anchors array.`);

  // 3. Create batch manifest
  fs.mkdirSync(batchDir, { recursive: true });
  const batchManifest = {
    batch_name: 'serials_2026-11-03_verified_sales_machine',
    batch_date: '2026-11-03',
    batch_purpose: 'Controlled registration of first verified physical sales machine (Serial 161441572 - MS 260 C-B)',
    provenance: {
      serial_number: targetSerial,
      model_name: 'MS 260 C-B .325" P Motorsäge',
      canonical_model_id: 'stihl_ms_260',
      category: 'Kettingzaag',
      drive_type: 'Benzine',
      source: 'MY_STIHL',
      verification_method: 'handmatig gecontroleerd MY STIHL-account, screenshot van 3 november 2026',
      evidence_status: 'OFFICIAL_STIHL_LOOKUP'
    },
    metrics: {
      canonical_anchors_before: initialCount,
      new_official_anchors_added: 1,
      canonical_anchors_after: anchors.length,
      ranges_created: 0,
      inferred_cohorts_created: 0
    }
  };
  fs.writeFileSync(path.join(batchDir, 'batch_manifest.json'), JSON.stringify(batchManifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(batchDir, 'README.md'), `# Import Batch 2026-11-03: First Verified Sales Machine\n\nSerial: 161441572\nModel: MS 260 C-B .325" P Motorsäge\nProvenance: MY STIHL account screenshot 2026-11-03 (hand-verified)\n`, 'utf8');
  console.log(`Created batch folder and manifest at ${batchDir}`);
}

// 4. Update verified_sales_machines.json
const salesRecord = {
  serial_number: targetSerial,
  official_product_name: 'MS 260 C-B .325" P Motorsäge',
  normalized_model: 'MS 260 C-B',
  canonical_model_id: 'stihl_ms_260',
  category: 'Kettingzaag',
  category_slug: 'kettingzagen',
  drive_type: 'Benzine',
  asking_price_eur: 385,
  asking_price_formatted: '€ 385,-',
  condition: 'volledig werkend, volgens verkoper',
  condition_summary: 'Volledig werkend (volgens verkoper)',
  location: 'Coevorden',
  seller_role: 'Particuliere verkoper',
  identity_verification: {
    source: 'MY STIHL',
    verification_date: '2026-11-03',
    method: 'handmatig gecontroleerd MY STIHL-account, screenshot van 3 november 2026',
    status: 'OFFICIAL_STIHL_LOOKUP',
    account_data_published: false,
    screenshot_published: false
  },
  photos: [
    { filename: 'IMG_20261103_234758_505.jpg', label: 'Overzicht voorzijde zaagblad en behuizing' },
    { filename: 'IMG_20261103_234821_680.jpg', label: 'Zijkant kettingdeksel en kettingspanner' },
    { filename: 'IMG_20261103_234839_810.jpg', label: 'Bovenzijde handgreep en bediening' },
    { filename: 'IMG_20261103_234923_509.jpg', label: 'Serienummer en typeplaatje op carter' }
  ],
  created_at: '2026-11-03T23:50:00Z',
  updated_at: new Date().toISOString()
};

let salesMachines = [];
if (fs.existsSync(salesMachinesPath)) {
  try {
    salesMachines = JSON.parse(fs.readFileSync(salesMachinesPath, 'utf8'));
    if (!Array.isArray(salesMachines)) salesMachines = [];
  } catch {
    salesMachines = [];
  }
}

const existingSalesIdx = salesMachines.findIndex(m => m.serial_number === targetSerial);
if (existingSalesIdx !== -1) {
  salesMachines[existingSalesIdx] = salesRecord;
} else {
  salesMachines.push(salesRecord);
}
fs.writeFileSync(salesMachinesPath, JSON.stringify(salesMachines, null, 2) + '\n', 'utf8');
console.log(`Saved sales machine record to ${salesMachinesPath}`);

// 5. Run seed script to update SQLite
console.log('5. Running data/seed.cjs to update SQLite...');
execSync('node data/seed.cjs', { cwd: rootDir, stdio: 'inherit' });
console.log('Seed completed successfully.');
