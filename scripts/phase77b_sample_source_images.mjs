/**
 * Phase 77B — Bounded visual-verification sample of source diagram URLs (read-only).
 *
 * Phase 77A counted 2,376 unique GHS diagram URLs from metadata alone. This script
 * checks whether those URLs actually return artwork, because at least one of them
 * returned a "GHS — Image coming soon" placeholder.
 *
 * It fetches a small deterministic sample (default 30 URLs), hashes every response,
 * records bytes/content-type and reports duplicate/placeholder groups. The image
 * bytes are held in the OS temp directory only, are never written into the
 * repository and are deleted immediately after hashing. Nothing is published,
 * hotlinked or redistributed.
 *
 * Usage:
 *   node scripts/phase77b_sample_source_images.mjs --limit=30
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77b');
fs.mkdirSync(outDir, { recursive: true });

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Math.min(100, Number(limitArg.split('=')[1]) || 30)) : 30;
const TIMEOUT_MS = 20000;

const modelsArg = process.argv.find(a => a.startsWith('--models='));
const modelFilter = modelsArg ? modelsArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;

const inventory = JSON.parse(fs.readFileSync(path.join(root, 'output', 'phase77a', 'PHASE77A_DIAGRAM_INVENTORY.json'), 'utf8'));
const assets = [...inventory.diagram_assets]
  .filter(a => a.classification === 'EXPLODED_DIAGRAM_SHEET')
  .filter(a => !modelFilter || a.model_ids.some(id => modelFilter.includes(id)))
  .sort((a, b) => a.asset_id.localeCompare(b.asset_id));

const step = Math.max(1, Math.floor(assets.length / LIMIT));
const sample = [];
for (let i = 0; i < assets.length && sample.length < LIMIT; i += step) sample.push(assets[i]);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase77b-sample-'));

const results = [];
for (const asset of sample) {
  const record = {
    asset_id: asset.asset_id,
    model_ids: asset.model_ids,
    section_titles: asset.section_titles,
    url: asset.url,
    http_status: null,
    content_type: null,
    bytes: null,
    width: null,
    height: null,
    sha256: null,
    fetch_status: 'NOT_ATTEMPTED',
    visual_classification: null
  };
  try {
    const response = await fetch(asset.url, {
      headers: { 'User-Agent': 'STIHLDecoder-research/77B (bounded verification sample)' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    record.http_status = response.status;
    record.content_type = response.headers.get('content-type');
    if (!response.ok) {
      record.fetch_status = `HTTP_${response.status}`;
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      record.bytes = buffer.length;
      record.sha256 = sha256(buffer);
      // dimensions for JPEG (SOF markers) and PNG
      if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        record.width = buffer.readUInt32BE(16);
        record.height = buffer.readUInt32BE(20);
      } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset < buffer.length - 9) {
          if (buffer[offset] !== 0xff) { offset += 1; continue; }
          const marker = buffer[offset + 1];
          const length = buffer.readUInt16BE(offset + 2);
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            record.height = buffer.readUInt16BE(offset + 5);
            record.width = buffer.readUInt16BE(offset + 7);
            break;
          }
          offset += 2 + length;
        }
      }
      record.fetch_status = 'FETCHED_AND_HASHED';
      const tmpFile = path.join(tmpDir, `${asset.asset_id}.img`);
      fs.writeFileSync(tmpFile, buffer);
      fs.unlinkSync(tmpFile);
    }
  } catch (err) {
    record.fetch_status = `FETCH_FAILED: ${String(err && err.message || err).slice(0, 120)}`;
  }
  results.push(record);
}

// Placeholder detection: identical bytes across different models/sections cannot be
// distinct section artwork. The known "Image coming soon" asset is captured by the
// largest repeated hash group; every group is reported so the finding is verifiable.
const byHash = new Map();
for (const r of results) {
  if (!r.sha256) continue;
  if (!byHash.has(r.sha256)) byHash.set(r.sha256, []);
  byHash.get(r.sha256).push(r);
}
const duplicateGroups = [...byHash.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([hash, items]) => ({
    sha256: hash,
    count: items.length,
    bytes: items[0].bytes,
    width: items[0].width,
    height: items[0].height,
    asset_ids: items.map(i => i.asset_id),
    models: [...new Set(items.flatMap(i => i.model_ids))]
  }));

for (const group of duplicateGroups) {
  for (const r of results) {
    if (r.sha256 === group.sha256) r.visual_classification = 'REPEATED_NON_UNIQUE_IMAGE';
  }
}
for (const r of results) {
  if (!r.visual_classification && r.fetch_status === 'FETCHED_AND_HASHED') r.visual_classification = 'UNIQUE_IMAGE_NEEDS_VISUAL_REVIEW';
  if (!r.visual_classification) r.visual_classification = r.fetch_status;
}

const fetched = results.filter(r => r.fetch_status === 'FETCHED_AND_HASHED');
const payload = {
  schema_version: '1.0.0',
  phase: '77B',
  generated_at_utc: new Date().toISOString(),
  read_only: true,
  policy: {
    images_written_to_repository: 0,
    storage: 'OS temp directory only; every file deleted immediately after hashing',
    published_or_hotlinked: false,
    sample_size: results.length,
    sampling: `deterministic every ${step}th asset of ${assets.length} exploded-view assets`
  },
  totals: {
    sampled: results.length,
    fetched_and_hashed: fetched.length,
    fetch_failed: results.length - fetched.length,
    unique_hashes: new Set(fetched.map(r => r.sha256)).size,
    repeated_hashes: duplicateGroups.length,
    placeholder_candidates: duplicateGroups.reduce((sum, g) => sum + g.count, 0),
    total_bytes_hashed: fetched.reduce((sum, r) => sum + (r.bytes || 0), 0)
  },
  duplicate_groups: duplicateGroups,
  sample: results
};

const outputName = modelFilter
  ? `PHASE77B_VISUAL_SAMPLE_PILOTS.json`
  : 'PHASE77B_VISUAL_SAMPLE.json';
fs.writeFileSync(path.join(outDir, outputName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(payload.totals, null, 2));
console.log('duplicate groups:', duplicateGroups.map(g => ({ count: g.count, bytes: g.bytes, models: g.models.slice(0, 5) })));
