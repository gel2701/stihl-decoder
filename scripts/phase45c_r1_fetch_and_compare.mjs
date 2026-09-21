import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const urls = [
  { name: 'bga-30-standalone', url: 'https://loja.stihl.com.br/soprador-bateria-bga-30/p', file: 'data/candidate_evidence/phase45c_wave1/bga-30_standalone_source.html' },
  { name: 'hsa-30-standalone', url: 'https://loja.stihl.com.br/podador-hsa-30/p', file: 'data/candidate_evidence/phase45c_wave1/hsa-30_standalone_source.html' },
  { name: 'fsa-50-kit', url: 'https://loja.stihl.com.br/fsa-50-kit/p', file: 'data/candidate_evidence/phase45c_wave1/fsa-50_kit_source.html' }
];

for (const u of urls) {
  console.log('Fetching', u.name, u.url);
  const res = await fetch(u.url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'accept': 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(15000)
  });
  console.log(u.name, 'Status:', res.status);
  const html = await res.text();
  const sha = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  console.log(u.name, 'Length:', html.length, 'SHA256:', sha);
  const filePath = path.join(ROOT, u.file);
  fs.writeFileSync(filePath, html, 'utf8');

  // Extract specs
  const itemRegex = /<li[^>]*class="[^"]*TechnicalSpecificationItem[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationName[^"]*">([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationValue[^"]*">([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
  const rawSpecs = {};
  let m;
  while ((m = itemRegex.exec(html)) !== null) {
    const name = m[1].replace(/<[^>]+>/g, '').trim();
    const val = m[2].replace(/<[^>]+>/g, '').trim();
    rawSpecs[name] = val;
  }
  console.log(u.name, 'Specs count:', Object.keys(rawSpecs).length);
  console.log(JSON.stringify(rawSpecs, null, 2));
}
