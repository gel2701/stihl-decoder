import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const outDir = path.join(ROOT, 'data/candidate_evidence/phase45c_wave1');
fs.mkdirSync(outDir, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase44a_vtex_full_catalog.json'), 'utf8'));
const wave1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase45a_phase45b_wave1_definition.json'), 'utf8')).identities;

console.log('=== PHASE 45C: FETCHING AND FREEZING SOURCE PAGES (15 Wave 1 Models) ===');

const sourceManifest = [];

for (const w of wave1) {
  const recId = w.source_record_ids[0];
  const item = catalog.find(c => String(c.id || c.productId) === String(recId));
  const linkText = item?.linkText || w.proposed_slug;
  const url = 'https://loja.stihl.com.br/' + linkText + '/p';
  const slug = w.proposed_slug;

  console.log(`\nFetching ${w.canonical_model} (${url})...`);

  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const sha256 = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
    const filename = `${slug}_source.html`;
    const filepath = path.join(outDir, filename);

    fs.writeFileSync(filepath, html, 'utf8');

    // Extract raw specs using exact DOM regex
    const itemRegex = /<li[^>]*class="[^"]*TechnicalSpecificationItem[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationName[^"]*">([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationValue[^"]*">([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
    const rawSpecs = {};
    let m;
    while ((m = itemRegex.exec(html)) !== null) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      const val = m[2].replace(/<[^>]+>/g, '').trim();
      rawSpecs[name] = val;
    }

    console.log(`  Saved ${html.length} bytes, SHA256: ${sha256.slice(0, 16)}..., extracted ${Object.keys(rawSpecs).length} spec keys.`);

    sourceManifest.push({
      model: w.canonical_model,
      slug: w.proposed_slug,
      phase45a_record_ids: w.source_record_ids,
      primary_reference: w.references[0],
      bundle_status: w.bundle_status,
      source_url: url,
      retrieval_status: 'HTTP_200_OK',
      retrieved_at: new Date().toISOString(),
      raw_bytes: html.length,
      sha256,
      market: 'BR',
      language: 'pt-BR',
      identity_match: true,
      captured_file: `data/candidate_evidence/phase45c_wave1/${filename}`,
      spec_count: Object.keys(rawSpecs).length,
      raw_specs: rawSpecs
    });
  } catch (err) {
    console.error(`  ERROR fetching ${w.canonical_model}: ${err.message}`);
    sourceManifest.push({
      model: w.canonical_model,
      slug: w.proposed_slug,
      phase45a_record_ids: w.source_record_ids,
      primary_reference: w.references[0],
      bundle_status: w.bundle_status,
      source_url: url,
      retrieval_status: `ERROR: ${err.message}`,
      retrieved_at: new Date().toISOString(),
      sha256: null,
      market: 'BR',
      identity_match: false,
      spec_count: 0,
      raw_specs: {}
    });
  }
}

fs.writeFileSync(path.join(ROOT, 'data/phase45c_source_manifest.json'), JSON.stringify({
  phase: '45C',
  total_models: sourceManifest.length,
  successful_captures: sourceManifest.filter(s => s.retrieval_status === 'HTTP_200_OK').length,
  sources: sourceManifest
}, null, 2));

console.log('\nSource capture complete. Saved data/phase45c_source_manifest.json');
