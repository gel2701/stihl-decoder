import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';

const partsPath = path.resolve('data/parts_catalog.json');
const fitmentsPath = path.resolve('data/model_part_fitments.json');
const supersessionsPath = path.resolve('data/parts_supersessions.json');

const partsDoc = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
const parts = partsDoc.parts || partsDoc;

const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
const supersessions = supersessionsDoc.relations || supersessionsDoc;

const fitmentsDoc = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));

// Load shards to compute exact fitment coverage
const partsWithConfirmedFitments = new Set();
const partsWithDiagrams = new Set();

if (fitmentsDoc.shard_files) {
  for (const sFile of fitmentsDoc.shard_files) {
    const sPath = path.resolve('data', sFile);
    let raw = fs.readFileSync(sPath);
    if (sFile.endsWith('.gz')) {
      raw = zlib.gunzipSync(raw);
    }
    const lines = raw.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const f = JSON.parse(line);
        if (f.part_number) {
          partsWithConfirmedFitments.add(f.part_number);
          if (f.diagram_position || f.section_name) {
            partsWithDiagrams.add(f.part_number);
          }
        }
      } catch (e) {}
    }
  }
}

const indexableParts = getAllIndexablePartsList();

const metrics = {
  total_searchable_parts: parts.length,
  total_indexed_parts: indexableParts.length,
  total_supersession_relations: supersessions.length,
  parts_with_confirmed_fitments: partsWithConfirmedFitments.size,
  parts_with_diagram_links: partsWithDiagrams.size,
  verified_amazon_active_offers: defaultVerifiedOfferRegistry.maxActiveOffersAllowed
};

console.log('=== PHASE 5 MEASURED METRICS ===');
console.log(JSON.stringify(metrics, null, 2));
