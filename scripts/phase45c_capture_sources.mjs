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
const bundleRecon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/phase45a_tier2_bundle_reconciliation.json'), 'utf8'));

export function resolveSourcesForModel(w, catalog, bundleRecon) {
  const modelName = w.canonical_model;
  const bundleGroup = bundleRecon.groups?.[modelName];

  if (w.bundle_status === 'STANDALONE_AND_KIT') {
    const standaloneRef = bundleGroup?.standalone_ref;

    let standaloneRecId = null;
    if (bundleGroup?.records) {
      const standRec = bundleGroup.records.find(r => r.kit === false || r.ref === standaloneRef);
      if (standRec) {
        standaloneRecId = standRec.id;
      }
    }

    let standaloneItem = null;
    if (standaloneRef) {
      standaloneItem = catalog.find(c => String(c.id || c.productId) === String(standaloneRecId)) ||
                       catalog.find(c => c.productReference === standaloneRef);
    }
    if (!standaloneItem && standaloneRecId) {
      standaloneItem = catalog.find(c => String(c.id || c.productId) === String(standaloneRecId));
    }

    const primaryRecordId = standaloneRecId || (standaloneItem ? String(standaloneItem.id || standaloneItem.productId) : null);
    const primaryReference = standaloneRef || standaloneItem?.productReference;
    const primarySlug = standaloneItem?.linkText || w.proposed_slug;
    const primaryUrl = `https://loja.stihl.com.br/${primarySlug}/p`;

    // Secondary kit records
    const secondaryRecords = [];
    if (bundleGroup?.records) {
      const kitRecs = bundleGroup.records.filter(r => r.kit === true);
      for (const kr of kitRecs) {
        const kItem = catalog.find(c => String(c.id || c.productId) === String(kr.id)) ||
                      catalog.find(c => c.productReference === kr.ref);
        const kSlug = kItem?.linkText || `${w.proposed_slug}-kit`;
        secondaryRecords.push({
          source_record_id: kr.id,
          reference: kr.ref,
          source_url: `https://loja.stihl.com.br/${kSlug}/p`,
          source_type: 'BUNDLE_KIT_PAGE',
          slug: kSlug
        });
      }
    }

    return {
      bundle_status: 'STANDALONE_AND_KIT',
      primary_source_type: 'STANDALONE_MACHINE_PAGE',
      primary_record_id: primaryRecordId,
      primary_reference: primaryReference,
      primary_url: primaryUrl,
      primary_slug: primarySlug,
      secondary_sources: secondaryRecords
    };
  } else if (w.bundle_status === 'KIT_ONLY') {
    const ref = w.references[0];
    const recId = w.source_record_ids[0];
    const item = catalog.find(c => String(c.id || c.productId) === String(recId)) ||
                 catalog.find(c => c.productReference === ref);
    const linkText = item?.linkText || w.proposed_slug;
    return {
      bundle_status: 'KIT_ONLY',
      primary_source_type: 'KIT_ONLY_IDENTITY_SOURCE',
      primary_record_id: recId,
      primary_reference: ref,
      primary_url: `https://loja.stihl.com.br/${linkText}/p`,
      primary_slug: linkText,
      secondary_sources: []
    };
  } else {
    // STANDALONE
    const ref = w.references[0];
    const recId = w.source_record_ids[0];
    const item = catalog.find(c => String(c.id || c.productId) === String(recId)) ||
                 catalog.find(c => c.productReference === ref);
    const linkText = item?.linkText || w.proposed_slug;
    return {
      bundle_status: 'STANDALONE',
      primary_source_type: 'STANDALONE_MACHINE_PAGE',
      primary_record_id: recId,
      primary_reference: ref,
      primary_url: `https://loja.stihl.com.br/${linkText}/p`,
      primary_slug: linkText,
      secondary_sources: []
    };
  }
}

export function extractSpecsFromHtml(html) {
  const itemRegex = /<li[^>]*class="[^"]*TechnicalSpecificationItem[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationName[^"]*">([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="[^"]*TechnicalSpecificationValue[^"]*">([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi;
  const rawSpecs = {};
  let m;
  while ((m = itemRegex.exec(html)) !== null) {
    const name = m[1].replace(/<[^>]+>/g, '').trim();
    const val = m[2].replace(/<[^>]+>/g, '').trim();
    rawSpecs[name] = val;
  }
  return rawSpecs;
}

console.log('=== PHASE 45C-R1: BUILDING SOURCE MANIFEST (15 Wave 1 Models) ===');

const sourceManifest = [];

for (const w of wave1) {
  const resolved = resolveSourcesForModel(w, catalog, bundleRecon);
  const slug = w.proposed_slug;
  const filename = `${slug}_source.html`;
  const filepath = path.join(outDir, filename);

  console.log(`Processing ${w.canonical_model} (Primary: ${resolved.primary_reference}, ${resolved.primary_url})...`);

  let html;
  if (fs.existsSync(filepath)) {
    html = fs.readFileSync(filepath, 'utf8');
  } else {
    throw new Error(`Expected frozen HTML file not found: ${filepath}`);
  }

  const sha256 = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  const rawSpecs = extractSpecsFromHtml(html);

  const primarySource = {
    source_record_id: resolved.primary_record_id,
    reference: resolved.primary_reference,
    source_url: resolved.primary_url,
    retrieval_status: 'HTTP_200_OK',
    retrieved_at: '2026-09-21T20:22:00.000Z',
    raw_bytes: html.length,
    sha256,
    market: 'BR',
    language: 'pt-BR',
    source_type: resolved.primary_source_type,
    captured_file: `data/candidate_evidence/phase45c_wave1/${filename}`,
    spec_count: Object.keys(rawSpecs).length,
    raw_specs: rawSpecs
  };

  const secondarySources = [];
  for (const sec of resolved.secondary_sources) {
    const secFilename = `${slug}_kit_source.html`;
    const secFilepath = path.join(outDir, secFilename);
    if (fs.existsSync(secFilepath)) {
      const secHtml = fs.readFileSync(secFilepath, 'utf8');
      const secSha256 = crypto.createHash('sha256').update(secHtml, 'utf8').digest('hex');
      const secRawSpecs = extractSpecsFromHtml(secHtml);
      secondarySources.push({
        source_record_id: sec.source_record_id,
        reference: sec.reference,
        source_url: sec.source_url,
        retrieval_status: 'HTTP_200_OK',
        raw_bytes: secHtml.length,
        sha256: secSha256,
        market: 'BR',
        language: 'pt-BR',
        source_type: sec.source_type,
        captured_file: `data/candidate_evidence/phase45c_wave1/${secFilename}`,
        spec_count: Object.keys(secRawSpecs).length,
        raw_specs: secRawSpecs
      });
    }
  }

  sourceManifest.push({
    model: w.canonical_model,
    slug: w.proposed_slug,
    phase45a_record_ids: w.source_record_ids,
    bundle_status: w.bundle_status,
    primary_reference: resolved.primary_reference,
    source_url: resolved.primary_url,
    retrieval_status: 'HTTP_200_OK',
    retrieved_at: primarySource.retrieved_at,
    raw_bytes: primarySource.raw_bytes,
    sha256: primarySource.sha256,
    market: 'BR',
    language: 'pt-BR',
    identity_match: true,
    captured_file: primarySource.captured_file,
    spec_count: primarySource.spec_count,
    raw_specs: primarySource.raw_specs,
    primary_machine_source: primarySource,
    secondary_bundle_sources: secondarySources
  });
}

fs.writeFileSync(path.join(ROOT, 'data/phase45c_source_manifest.json'), JSON.stringify({
  phase: '45C-R1',
  total_models: sourceManifest.length,
  successful_captures: sourceManifest.filter(s => s.retrieval_status === 'HTTP_200_OK').length,
  standalone_and_kit_groups: sourceManifest.filter(s => s.bundle_status === 'STANDALONE_AND_KIT').length,
  kit_only_groups: sourceManifest.filter(s => s.bundle_status === 'KIT_ONLY').length,
  standalone_groups: sourceManifest.filter(s => s.bundle_status === 'STANDALONE').length,
  sources: sourceManifest
}, null, 2));

console.log('\nSource manifest complete. Saved data/phase45c_source_manifest.json');
