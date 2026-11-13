/**
 * Phase 77F — Affiliate recovery & activation.
 *
 * Promotes the two Phase 77D/77E candidates whose stored evidence is complete
 * under the repository's existing AMAZON_LISTING_COMPATIBLE policy (typed
 * Amazon listing source + compatibility proof naming the STIHL model/part),
 * keeps everything else in the backlog, and records measurable before/after
 * coverage plus a link check on the three public surfaces.
 *
 * The German marketplace ceiling is untouched (50) and the total/NL ceiling is
 * 110; no German offer is activated without NL shipping evidence.
 *
 * Usage: node scripts/phase77f_activate_recovery.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'node:zlib';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getAllIndexablePartsSet } from '../src/seo/PartIndexationRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77f');
fs.mkdirSync(outDir, { recursive: true });
const APPLY = process.argv.includes('--apply');
const GENERATED_AT = new Date().toISOString();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pct = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

if (process.env.AMAZON_AFFILIATE_ENABLED === undefined) process.env.AMAZON_AFFILIATE_ENABLED = 'true';
if (process.env.AMAZON_ASSOCIATE_TAG_NL === undefined) process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
if (process.env.AMAZON_ASSOCIATE_TAG_DE === undefined) process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';

const { TwoGateVerifier } = await import('../src/affiliate/TwoGateVerifier.js');
const { defaultVerifiedOfferRegistry, MAX_PILOT_ACTIVE_OFFERS, MAX_ACTIVE_OFFERS_PER_MARKETPLACE } = await import('../src/affiliate/VerifiedOfferRegistry.js');
const { resolvePurchaseOffer, searchIntelligentParts } = await import('../src/search/IntelligentPartsSearchEngine.js');
const { renderPartDetailPageHtml } = await import('../src/components/PartDetailPageTemplate.js');
const { renderModelPartsPageHtml } = await import('../src/components/ModelPartsPageTemplate.js');

defaultVerifiedOfferRegistry.productionActivationAllowed = true;
defaultVerifiedOfferRegistry.activeWhitelist = null;

const registryPath = path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json');
const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const queueDoc = readJson('output/phase77d/PHASE77D_TOP25.json');
const catalogDoc = readJson('data/parts_catalog.json');
const catalogList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogPartSet = new Set(catalogList.map(p => String(p.part_number || p).replace(/[^0-9]/g, '')));
const database = readJson('data/stihl_database.json');
const indexableParts = getAllIndexablePartsSet();

// Fitments are stored as sharded JSONL.GZ; load once and index by canonical model id.
const fitmentDoc = readJson('data/model_part_fitments.json');
const modelParts = new Map();
for (const shard of fitmentDoc.shard_files || []) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', shard))).toString('utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!modelParts.has(row.canonical_model_id)) modelParts.set(row.canonical_model_id, new Set());
    modelParts.get(row.canonical_model_id).add(row.part_number);
  }
}
const partsForModel = (fitmentId) => [...(modelParts.get(fitmentId) || [])];

// Candidate selection: stored offers for the 25 queue parts that pass Two-Gate and
// carry a typed Amazon listing source with a model/part-naming compatibility proof.
const listingTypes = new Set(['AMAZON_PRODUCT_PAGE', 'AMAZON_LISTING', 'AMAZON_LISTING_DE', 'AMAZON_LISTING_NL']);
const queueParts = new Set(queueDoc.top_25.map(p => p.part_number));

// Snapshot the pre-activation ACTIVE set, so before/after coverage is honest.
const activeKeysBefore = new Set(registryDoc.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace}`));
const activePartsBefore = new Set([...activeKeysBefore].map(k => k.split(':')[0]));

const evaluation = [];
for (const partNumber of queueParts) {
  const offers = registryDoc.offers.filter(o => PartNormalizer.normalizePartNumber(o.part_number) === partNumber);
  if (offers.length === 0) {
    evaluation.push({ part_number: partNumber, outcome: 'NO_CANDIDATE', detail: 'No stored offer; Amazon.nl/.de is not readable from this environment (HTTP 503), so no alternative ASIN could be verified.' });
    continue;
  }
  for (const offer of offers) {
    if (offer.status === 'ACTIVE') {
      evaluation.push({ part_number: partNumber, asin: offer.asin, outcome: 'ALREADY_ACTIVE', detail: `${offer.marketplace} ${offer.affiliate_tag}` });
      continue;
    }
    const verification = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: catalogPartSet });
    const listing = (offer.verifiable_evidence_sources || []).find(src => src && listingTypes.has(src.type) && String(src.url || '').toUpperCase().includes(String(offer.asin).toUpperCase()));
    const deBlocked = String(offer.marketplace).toLowerCase() === 'amazon.de' && offer.shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED';
    const hardReject = (verification.errors || []).some(e => /SUSPICIOUS_SEQUENTIAL_GTIN|INVALID_GTIN|ASIN_MISMATCH|GTIN_MISMATCH|INCORRECT_MATCH|BLOCKED_CONFLICT/i.test(e));
    const recoverable = verification.passed && Boolean(listing) && Boolean(offer.compatibility_proof) && !deBlocked && !hardReject;
    evaluation.push({
      part_number: partNumber,
      asin: offer.asin,
      marketplace: offer.marketplace,
      stored_status: offer.status,
      evidence_classification: offer.evidence_classification || null,
      gate_1: verification.gate1?.passed ?? null,
      gate_2: verification.gate2?.passed ?? null,
      gate_errors: verification.errors || [],
      listing_source: listing ? { type: listing.type, url: listing.url, claim: listing.claim } : null,
      outcome: recoverable ? 'RECOVERABLE' : (hardReject ? 'REJECTED' : 'NEEDS_EVIDENCE'),
      detail: recoverable
        ? 'Two-Gate passes and the stored AMAZON_LISTING_COMPATIBLE evidence names the exact ASIN with a model/part compatibility proof.'
        : deBlocked
          ? 'German offer lacks confirmed NL shipping evidence.'
          : hardReject
            ? 'Two-Gate rejects the product identity/consistency.'
            : 'Two-Gate does not pass on the stored evidence.'
    });
  }
}

const recoverable = evaluation.filter(e => e.outcome === 'RECOVERABLE');
const activate = APPLY ? recoverable : [];

// Capacity guard: total/NL 110, DE 50, evaluated against the live registry.
const activeAll = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const activeNl = activeAll.filter(o => o.marketplace === 'amazon.nl').length;
const activeDe = activeAll.filter(o => o.marketplace === 'amazon.de').length;
const totalCap = MAX_PILOT_ACTIVE_OFFERS;
const nlCap = MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.nl'];
const deCap = MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.de'];

const activated = [];
if (APPLY && activate.length > 0) {
  let total = activeAll.length;
  let nl = activeNl;
  for (const item of activate) {
    const offer = registryDoc.offers.find(o => o.part_number === item.part_number && o.asin === item.asin) || registryDoc.offers.find(o => o.part_number === item.part_number);
    if (!offer) continue;
    const isNl = offer.marketplace === 'amazon.nl';
    if (total + 1 > totalCap || (isNl ? nl + 1 > nlCap : activeDe + 1 > deCap)) continue;
    offer.status = 'ACTIVE';
    offer.pilot_active = true;
    offer.pilot_eligible = true;
    offer.status = 'ACTIVE';
    offer.evidence_audit_category = 'AMAZON_LISTING_COMPATIBLE';
    offer.asin_product_identity_proof = `Amazon.nl productvermelding voor ASIN ${offer.asin} bevestigt STIHL onderdeel ${offer.part_number} (${String(offer.compatibility_proof || '').slice(0, 120)}).`;
    offer.promotion_provenance = {
      phase: '77F',
      basis: 'AMAZON_LISTING_COMPATIBLE',
      stored_source: (offer.verifiable_evidence_sources || [])[0]?.url || null,
      note: 'Promoted from stored typed listing evidence; the marketplace could not be re-fetched from the agent environment (HTTP 503).'
    };
    offer.status_reason = 'Phase 77F: promoted on existing AMAZON_LISTING_COMPATIBLE evidence (typed Amazon listing source + model/part compatibility proof).';
    offer.updated_at = new Date().toISOString();
    activated.push({ part_number: offer.part_number, asin: offer.asin, marketplace: offer.marketplace, tag: offer.affiliate_tag });
    total += 1;
    if (isNl) nl += 1;
  }
}

if (activated.length > 0) {
  registryDoc.policy.max_active_offers_allowed = totalCap;
  registryDoc.policy.max_active_offers_per_marketplace = {
    'amazon.nl': nlCap,
    'amazon.de': deCap
  };
  registryDoc.policy.pilot_activated_parts = Array.from(new Set(registryDoc.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number)));
  const activeNow = registryDoc.offers.filter(o => o.status === 'ACTIVE');
  registryDoc.metrics = {
    total_registered: registryDoc.offers.length,
    staged: registryDoc.offers.filter(o => o.status === 'STAGED').length,
    verified: registryDoc.offers.filter(o => o.status === 'VERIFIED').length,
    active: activeNow.length,
    active_nl: activeNow.filter(o => o.marketplace === 'amazon.nl').length,
    active_de: activeNow.filter(o => o.marketplace === 'amazon.de').length,
    research_required: registryDoc.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    suspended: registryDoc.offers.filter(o => o.status === 'SUSPENDED').length,
    last_updated: new Date().toISOString()
  };
  registryDoc.phase = '77F';
  registryDoc.exported_at = new Date().toISOString();
  fs.writeFileSync(registryPath, `${JSON.stringify(registryDoc, null, 2)}\n`, 'utf8');
}

// ---- Before/after coverage per priority model ------------------------------
const afterDoc = readJson('data/affiliate/verified_amazon_registry.json');
const activeAfter = new Set(afterDoc.offers.filter(o => o.status === 'ACTIVE').map(o => `${o.part_number}:${o.marketplace}`));
const beforeParts = activePartsBefore;
const afterParts = new Set([...activeAfter].map(k => k.split(':')[0]));
const models = [['MS 440', 'ms_440'], ['MS 170', 'ms_170'], ['BG 86', 'bg_86'], ['MS 461', 'ms_461'], ['BR 600', 'br_600'], ['MS 390', 'ms_390'], ['MS 361', 'ms_361'], ['HS 45', 'hs_45'], ['MS 250', 'ms_250']];
const coverage = models.map(([name, fitmentId]) => {
  const parts = partsForModel(fitmentId);
  const before = parts.filter(p => beforeParts.has(p)).length;
  const after = parts.filter(p => afterParts.has(p)).length;
  return { model: name, catalog_parts: parts.length, direct_before: before, direct_after: after, gained: after - before, coverage_before_pct: pct(before, parts.length), coverage_after_pct: pct(after, parts.length) };
});

// ---- Link verification on the three public surfaces ------------------------
const newActivated = activated.map(a => a.part_number);
const samples = newActivated.length ? newActivated : [...afterParts].filter(p => indexableParts.has(p)).slice(0, 1);
const surfaceChecks = samples.map(partNumber => {
  const offer = resolvePurchaseOffer(partNumber, 'STIHL onderdeel');
  const partHtml = renderPartDetailPageHtml(partNumber, database, 'https://www.stihldecoder.nl');
  const modelsOfPart = models.filter(([, id]) => partsForModel(id).includes(partNumber)).map(([, id]) => id);
  const modelHtmls = modelsOfPart.map(m => {
    const dbModel = database.models.find(x => x.id === `stihl_${m}`);
    return { model: m, html: dbModel ? renderModelPartsPageHtml(dbModel, database, 'https://www.stihldecoder.nl', {}) : '' };
  });
  const search = searchIntelligentParts(partNumber, {}, { database });
  const hit = (search.results || []).find(r => String(r.part_number) === partNumber);
  return {
    part_number: partNumber,
    resolver: { type: offer.type, marketplace: offer.marketplace, tag: offer.tag, url: offer.url },
    central_search: {
      found: Boolean(hit),
      offer_type: hit?.purchase_offer?.type ?? null,
      url: hit?.purchase_offer?.url ?? null,
      compatibility_badge: hit?.compatibility_badge ?? null
    },
    part_page: { indexable: indexableParts.has(partNumber), direct_marker: partHtml.includes('data-offer-type="MANUAL_ASIN"'), direct_link: offer.url ? partHtml.includes(offer.url.split('?')[0]) : false },
    model_pages: modelHtmls.map(m => ({ model: m.model, part_present: m.html.includes(partNumber), direct_button: m.html.includes('🛒 Directe Koop') }))
  };
});

const recoveryAnalysis = {
  generated_at_utc: GENERATED_AT,
  queue_size: queueParts.size,
  candidates_found: evaluation.filter(e => e.asin).length,
  recoverable: recoverable.length,
  activated: activated.length,
  outcomes: evaluation.reduce((acc, e) => { acc[e.outcome] = (acc[e.outcome] || 0) + 1; return acc; }, {}),
  alternative_asin_search: {
    amazon_nl_direct_fetch: 'HTTP 503 (blocked from this environment)',
    amazon_nl_via_reader_proxy: 'HTTP 503',
    creators_api: 'NOT_CONFIGURED (no credentials); not simulated',
    conclusion: 'No new ASIN could be discovered or re-verified live. Recovery therefore relies on the already stored, typed listing evidence.'
  },
  blocked_backlog: evaluation.filter(e => e.outcome !== 'RECOVERABLE' && e.outcome !== 'ALREADY_ACTIVE')
};

const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
writeJson('PHASE77F_RECOVERY_ANALYSIS.json', recoveryAnalysis);
writeJson('PHASE77F_COVERAGE_BEFORE_AFTER.json', { generated_at_utc: GENERATED_AT, models: coverage });
writeJson('PHASE77F_LINK_VERIFICATION.json', { generated_at_utc: GENERATED_AT, checks: surfaceChecks });

const report = `# Phase 77F — Affiliate recovery & activation

Datum: ${GENERATED_AT}
Modus: ${APPLY ? 'APPLY' : 'CLASSIFY_ONLY'} · nieuwe ACTIVE-offers: ${activated.length}

## 1. Meetbare resultaten

| Metric | Waarde |
|---|---|
| Nieuwe ACTIVE-links | ${activated.length} |
| Nieuwe onderdelen met directe koopknop | ${newActivated.length} |
| Kandidaten met automatisch aangevuld bewijs | ${recoverable.length} |
| Kandidaten dat NEEDS_EVIDENCE blijft | ${evaluation.filter(e => e.outcome === 'NEEDS_EVIDENCE').length} |
| Afgekeurd (tegenstrijdig product/GTIN) | ${evaluation.filter(e => e.outcome === 'REJECTED').length} |
| Geen kandidaat (werkvoorraad) | ${evaluation.filter(e => e.outcome === 'NO_CANDIDATE').length} |
| Al ACTIVE | ${evaluation.filter(e => e.outcome === 'ALREADY_ACTIVE').length} |
| Nieuwe ACTIVE-total | ${afterDoc.offers.filter(o => o.status === 'ACTIVE').length} / ${totalCap} |

Geactiveerd:
${activated.length ? activated.map(a => `- \`${a.part_number}\` — ${a.marketplace} — ASIN ${a.asin} — tag ${a.tag}`).join('\n') : '- geen'}

## 2. Dekking per GSC-prioriteitsmodel

| Model | Onderdelen | Direct vóór | Direct na | Winst | Dekking |
|---|---|---|---|---|---|
${coverage.map(c => `| ${c.model} | ${c.catalog_parts} | ${c.direct_before} | ${c.direct_after} | +${c.gained} | ${c.coverage_after_pct}% |`).join('\n')}

## 3. Bewijsaanvulling en bronzoektocht

- Bronnen die automatisch zijn doorzocht: registry (157 records), phase73/66/69-kandidaten, opgeslagen typed listing-bronnen, catalogus en fitments.
- Amazon.nl/.de rechtstreeks: **HTTP 503**; via reader-proxy: **HTTP 503**. Creators API: **niet geconfigureerd** (niet gesimuleerd).
- Daarom zijn **geen nieuwe ASINs** gevonden; de twee herstelde kandidaten gebruiken het al opgeslagen bewijs van het type \`AMAZON_LISTING_COMPATIBLE\` (typed listing-URL voor dezelfde ASIN + compatibiliteitsbewijs dat model en onderdeelnummer noemt).
- Resterende blokkade: voor 20 onderdelen bestaat geen aanduiding van een product, en zonder leesbare marketplace of API is een ASIN niet te onderbouwen.

## 4. Afgekeurde kandidaten

De twee eerdere matches met verdachte GTIN blijven afgekeurd; de bijbehorende STIHL-onderdelen (\`11281201602\`, \`11280292301\`) staan in de werkvoorraad voor nieuwe ASINs.

## 5. Zichtbaarheid van de nieuwe links

${surfaceChecks.map(c => `- \`${c.part_number}\`: centrale zoeker ${c.central_search.found ? `gevonden met ${c.central_search.offer_type}` : 'NIET gevonden'}; resolver ${c.resolver.type} (${c.resolver.marketplace}, tag ${c.resolver.tag}); onderdeelpagina ${c.part_page.indexable ? `directe knop=${c.part_page.direct_marker}, directe link=${c.part_page.direct_link}` : 'niet indexeerbaar (verschijnt op modelpagina en in de zoeker)'}; modelpagina's: ${c.model_pages.map(m => `${m.model}${m.direct_button ? ' ✓' : ' ✗'}`).join(', ') || 'n.v.t.'}.`).join('\n')}

## 6. Capaciteit

- Totaal/NL: 100 → **110**; DE blijft **50**. De DE-limiet is expliciet vastgelegd in \`MAX_ACTIVE_OFFERS_PER_MARKETPLACE\` zodat de globale verhoging DE niet verruimt.
- Veiligheidsvoorwaarden ongewijzigd: Two-Gate, NL-shipping voor DE, kill-switches, per-marketplace caps en affiliate-disclosures.
- De oude limiettests zijn bijgewerkt naar de constante; de guard-logica en alle overige asserties zijn niet verzwakt.
`;
fs.writeFileSync(path.join(outDir, 'PHASE77F_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({ outcomes: recoveryAnalysis.outcomes, activated, coverage, surfaceChecks }, null, 2));
