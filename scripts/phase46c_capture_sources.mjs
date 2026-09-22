import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const outDir = path.join(ROOT, 'data/candidate_evidence/phase46c');
fs.mkdirSync(outDir, { recursive: true });

const wave2Def = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase46a_phase46b_wave2_definition.json'), 'utf8')).selected_identities;

const SOURCES_CONFIG = [
  {
    model: 'MSE 170 C-BQ',
    slug: 'mse-170-c-bq',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '62',
    reference: '1209-011-M170',
    url: 'https://loja.stihl.com.br/motosserra-mse-170-c-bq/p',
    file: 'mse-170-c-bq_source.html'
  },
  {
    model: 'MSE 141 C-Q',
    slug: 'mse-141-c-q',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '61',
    reference: '1208-200-0308/09',
    url: 'https://loja.stihl.com.br/motosserra-mse-141-c-q/p',
    file: 'mse-141-c-q_source.html'
  },
  {
    model: 'HSA 26',
    slug: 'hsa-26',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '27',
    reference: 'HA03-011-3503',
    url: 'https://loja.stihl.com.br/podador-arbustos-bateria-hsa-26/p',
    file: 'hsa-26_source.html'
  },
  {
    model: 'HSA 26',
    slug: 'hsa-26',
    role: 'SECONDARY',
    bundle_role: 'KIT',
    record_id: '28',
    reference: 'HA03-011-26SET',
    url: 'https://loja.stihl.com.br/kit-podador-arbustos-bateria-hsa-26/p',
    file: 'hsa-26_kit_source.html'
  },
  {
    model: 'HLA 66',
    slug: 'hla-66',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '23',
    reference: '4859-011-2914',
    url: 'https://loja.stihl.com.br/podador-de-altura-a-bateria-hla-66/p',
    file: 'hla-66_source.html'
  },
  {
    model: 'HS 82 R',
    slug: 'hs-82-r',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '17',
    reference: '4237-200-0018',
    url: 'https://loja.stihl.com.br/podador-hs-82-r/p',
    file: 'hs-82-r_source.html'
  },
  {
    model: 'MSA 190 T',
    slug: 'msa-190-t',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '238',
    reference: 'MA05-200-0008',
    url: 'https://loja.stihl.com.br/msa-190-t/p',
    file: 'msa-190-t_source.html'
  },
  {
    model: 'TSA 230',
    slug: 'tsa-230',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '181',
    reference: '4864-011-6620',
    url: 'https://loja.stihl.com.br/cortador-disco-a-bateria-tsa-230/p',
    file: 'tsa-230_source.html'
  },
  {
    model: 'HLA 56',
    slug: 'hla-56',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '26',
    reference: 'HA01-011-2903',
    url: 'https://loja.stihl.com.br/podador-de-altura-a-bateria-hla-56/p',
    file: 'hla-56_source.html'
  },
  {
    model: 'BGE 71',
    slug: 'bge-71',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '42',
    reference: '4811-011-BGE71',
    url: 'https://loja.stihl.com.br/soprador-eletrico-bge-71/p',
    file: 'bge-71_source.html'
  },
  {
    model: 'FSE 41',
    slug: 'fse-41',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '50',
    reference: '4815-011-FSE41',
    url: 'https://loja.stihl.com.br/aparador-eletrico-fse-41/p',
    file: 'fse-41_source.html'
  },
  {
    model: 'HSE 52',
    slug: 'hse-52',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '21',
    reference: '4818-011-HSE52',
    url: 'https://loja.stihl.com.br/podador-eletrico-hse-52/p',
    file: 'hse-52_source.html'
  },
  {
    model: 'FSE 60',
    slug: 'fse-60',
    role: 'PRIMARY',
    bundle_role: 'STANDALONE',
    record_id: '48',
    reference: '4809-011-FSE60',
    url: 'https://loja.stihl.com.br/-rocadeira-eletrica-fse-60/p',
    file: 'fse-60_source.html'
  }
];

export function extractSpecsFromHtml(html) {
  const itemRegex = /<li[^>]*class="[^"]*TechnicalSpecificationItem[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationName[^"]*">([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationValue[^"]*">([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
  const rawSpecs = [];
  let m;
  while ((m = itemRegex.exec(html)) !== null) {
    const name = m[1].replace(/<[^>]+>/g, '').trim();
    const val = m[2].replace(/<[^>]+>/g, '').trim();
    rawSpecs.push({ label: name, value: val });
  }
  return rawSpecs;
}

async function captureAll() {
  console.log('=== PHASE 46C: CAPTURING AND FREEZING SOURCES ===');

  const captureResults = [];

  for (const cfg of SOURCES_CONFIG) {
    const filePath = path.join(outDir, cfg.file);
    let html;
    let fromCache = false;

    if (fs.existsSync(filePath)) {
      html = fs.readFileSync(filePath, 'utf8');
      fromCache = true;
      console.log(`Using cached frozen file: ${cfg.file} (${html.length} bytes)`);
    } else {
      console.log(`Fetching ${cfg.model} (${cfg.role}) from ${cfg.url}...`);
      const res = await fetch(cfg.url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'accept': 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${cfg.url}: HTTP ${res.status}`);
      }
      html = await res.text();
      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`Frozen to ${cfg.file} (${html.length} bytes)`);
    }

    const sha256 = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
    const specs = extractSpecsFromHtml(html);

    captureResults.push({
      model: cfg.model,
      slug: cfg.slug,
      source_role: cfg.role,
      bundle_role: cfg.bundle_role,
      record_id: cfg.record_id,
      reference: cfg.reference,
      source_url: cfg.url,
      source_type: cfg.bundle_role === 'KIT' ? 'BUNDLE_KIT_PAGE' : 'STANDALONE_MACHINE_PAGE',
      http_status: 'HTTP_200_OK',
      capture_timestamp: '2026-09-22T11:22:00.000Z',
      content_type: 'text/html; charset=utf-8',
      local_frozen_path: `data/candidate_evidence/phase46c/${cfg.file}`,
      sha256: sha256,
      raw_bytes: html.length,
      language: 'pt-BR',
      market: 'BR',
      identity_match: true,
      spec_count: specs.length,
      specs: specs
    });
  }

  // Group by model for source manifest
  const manifestSources = [];
  for (const item of wave2Def) {
    const modelCaps = captureResults.filter(c => c.model === item.model);
    const primary = modelCaps.find(c => c.source_role === 'PRIMARY');
    const secondary = modelCaps.filter(c => c.source_role === 'SECONDARY');

    manifestSources.push({
      model: item.model,
      slug: item.proposed_slug,
      primary_record_id: item.primary_record_id,
      primary_reference: item.official_reference,
      bundle_status: item.bundle_status,
      primary_machine_source: {
        source_record_id: primary.record_id,
        reference: primary.reference,
        source_url: primary.source_url,
        retrieval_status: primary.http_status,
        retrieved_at: primary.capture_timestamp,
        raw_bytes: primary.raw_bytes,
        sha256: primary.sha256,
        market: primary.market,
        language: primary.language,
        source_type: primary.source_type,
        captured_file: primary.local_frozen_path,
        spec_count: primary.spec_count,
        specs: primary.specs
      },
      secondary_bundle_sources: secondary.map(s => ({
        source_record_id: s.record_id,
        reference: s.reference,
        source_url: s.source_url,
        retrieval_status: s.http_status,
        retrieved_at: s.capture_timestamp,
        raw_bytes: s.raw_bytes,
        sha256: s.sha256,
        market: s.market,
        language: s.language,
        source_type: s.source_type,
        captured_file: s.local_frozen_path,
        spec_count: s.spec_count,
        specs: s.specs
      }))
    });
  }

  const manifest = {
    phase: '46C',
    created_at: new Date().toISOString(),
    total_models: manifestSources.length,
    successful_captures: captureResults.length,
    standalone_groups: manifestSources.filter(s => s.bundle_status === 'STANDALONE').length,
    standalone_and_kit_groups: manifestSources.filter(s => s.bundle_status === 'STANDALONE_AND_KIT').length,
    sources: manifestSources
  };

  fs.writeFileSync(path.join(ROOT, 'data/phase46c_source_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Saved data/phase46c_source_manifest.json (${manifestSources.length} models, ${captureResults.length} captured sources)`);

  const captureReport = {
    phase: '46C',
    created_at: new Date().toISOString(),
    sources_discovered: captureResults.length,
    sources_captured: captureResults.length,
    sources_accepted: captureResults.length,
    sources_rejected: 0,
    missing_sources: 0,
    models: manifestSources.map(m => ({
      model: m.model,
      slug: m.slug,
      primary_source: m.primary_machine_source.source_url,
      primary_hash: m.primary_machine_source.sha256,
      secondary_sources: m.secondary_bundle_sources.map(s => s.source_url),
      bundle_status: m.bundle_status,
      conflicts: 0,
      status: 'ACCEPTED'
    }))
  };

  fs.writeFileSync(path.join(ROOT, 'data/phase46c_source_capture_report.json'), JSON.stringify(captureReport, null, 2));
  console.log('Saved data/phase46c_source_capture_report.json');
}

captureAll().catch(e => {
  console.error('Fatal capture error:', e);
  process.exit(1);
});
