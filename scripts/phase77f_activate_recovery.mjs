/**
 * Phase 77F (final) — ASIN identity recovery audit.
 *
 * The two recovered candidates rest on an Amazon product listing only. Under the
 * repository's "no self-certified ASINs" rule (AGENTS.md #4, quality-gate skill
 * §1.5), an Amazon listing cannot corroborate its own ASIN. This script:
 *
 *   1. re-evaluates both candidates with TwoGateVerifier,
 *   2. records the independent-source search that was attempted,
 *   3. keeps them as NEEDS_EVIDENCE (status ASIN_IDENTITY_UNVERIFIED) instead of
 *      ACTIVE or REJECTED,
 *   4. reports the remaining backlog and the unaffected coverage per model.
 *
 * It never promotes an offer: promotion requires an external merchant or
 * manufacturer catalog that cites the exact ASIN next to the MPN/GTIN.
 *
 * Usage: node scripts/phase77f_recovery_audit.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'url';
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

const registryPath = path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json');
const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const catalogDoc = readJson('data/parts_catalog.json');
const catalogList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogPartSet = new Set(catalogList.map(p => String(p.part_number || p).replace(/[^0-9]/g, '')));
const database = readJson('data/stihl_database.json');
const indexableParts = getAllIndexablePartsSet();

const CANDIDATES = [
  {
    part_number: '42821410300',
    asin: 'B079DM989K',
    marketplace: 'amazon.nl',
    external_part_evidence: 'https://www.stihl.nl/nl/p/bladblazers-bladzuigers-toebehoren-luchtfilters-1820',
    external_note: 'STIHL-documentatie en distributeurs (DIY Spare Parts, L&S, OakTen) bevestigen 4282 141 0300 en BR 500/550/600/700, maar noemen de ASIN niet.'
  },
  {
    part_number: '11281903400',
    asin: 'B079DNL88M',
    marketplace: 'amazon.nl',
    external_gtin: '795711121587',
    external_note: 'Techniekwebshop bevestigt EAN 795711121587 voor 1128 190 3400; deze bron noemt de ASIN niet en wijkt af van de opgeslagen GTIN.'
  }
];

const SEARCH_ATTEMPTS = [
  { source: 'web_search index', query: '"B079DM989K" / "B079DNL88M" / 795711121587', outcome: 'NO_ASIN_CITING_PAGE' },
  { source: 'amazon.nl/dp/<ASIN>', query: 'directe productpagina', outcome: 'HTTP 200 maar Captcha-pagina (geen productinhoud)' },
  { source: 'lite/html.duckduckgo.com', query: 'beide ASINs', outcome: 'HTTP 202 zonder resultaten (bot-challenge)' },
  { source: 'bing.com/search', query: 'beide ASINs + EAN', outcome: 'irrelevante resultaten (gedegradeerde SERP)' },
  { source: 'mojeek.com', query: 'beide ASINs', outcome: 'HTTP 403' },
  { source: 'Creators API', query: 'ASIN → GTIN/MPN', outcome: 'NIET_GECONFIGUREERD (geen credentials, niet gesimuleerd)' }
];

const evaluations = CANDIDATES.map(candidate => {
  const offer = registryDoc.offers.find(o => PartNormalizer.normalizePartNumber(o.part_number) === candidate.part_number);
  if (!offer) return { ...candidate, verdict: 'CANDIDATE_MISSING' };
  const sources = offer.verifiable_evidence_sources || [];
  const independentSources = sources.filter(s => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url) && !/amazon\.(nl|de)/i.test(s.url));
  const asinCitingIndependent = independentSources.filter(s => typeof s.claim === 'string' && s.claim.includes(offer.asin));
  const verdict = asinCitingIndependent.length > 0 ? 'CORROBORATED' : 'NEEDS_EVIDENCE';
  // Report the gate verdict the offer actually has in its safe (unverified) state.
  const gateTarget = verdict === 'NEEDS_EVIDENCE'
    ? { ...offer, status: 'ASIN_IDENTITY_UNVERIFIED', asin_identity_unverified: true }
    : offer;
  const verification = TwoGateVerifier.verifyOffer(gateTarget, { catalogPartMap: catalogPartSet });
  return {
    part_number: candidate.part_number,
    asin: offer.asin,
    marketplace: offer.marketplace,
    stored_gtin: offer.ean_gtin || offer.gtin || null,
    external_gtin: candidate.external_gtin || null,
    gtin_discrepancy: Boolean(candidate.external_gtin && candidate.external_gtin !== (offer.ean_gtin || offer.gtin)),
    evidence_sources: sources.map(s => ({ type: s.type, url: s.url })),
    independent_sources: independentSources.length,
    independent_sources_citing_asin: asinCitingIndependent.length,
    two_gate_passed: verification.passed,
    two_gate_errors: verification.errors,
    verdict,
    note: candidate.external_note
  };
});

if (APPLY) {
  for (const evaluation of evaluations) {
    const offer = registryDoc.offers.find(o => PartNormalizer.normalizePartNumber(o.part_number) === evaluation.part_number);
    if (!offer) continue;
    if (evaluation.verdict === 'NEEDS_EVIDENCE') {
      offer.status = 'ASIN_IDENTITY_UNVERIFIED';
      offer.pilot_active = false;
      offer.pilot_eligible = false;
      offer.asin_identity_unverified = true;
      offer.evidence_audit_category = 'ASIN_IDENTITY_UNVERIFIED';
      offer.asin_product_identity_proof = null;
      offer.status_reason = 'Phase 77F final: geen onafhankelijke bron koppelt deze ASIN aan MPN/GTIN; de eigen Amazon-vermelding geldt niet als onafhankelijk bewijs. Kandidaat behouden (NEEDS_EVIDENCE).';
      offer.verification_date = offer.verification_date || new Date().toISOString().slice(0, 10);
      offer.recovery_audit = {
        phase: '77F',
        checked_at: new Date().toISOString(),
        verdict: 'NEEDS_EVIDENCE',
        search_attempts: SEARCH_ATTEMPTS,
        external_part_evidence: CANDIDATES.find(c => c.part_number === evaluation.part_number)?.external_part_evidence || null,
        gtin_discrepancy: evaluation.gtin_discrepancy,
        note: evaluation.note
      };
      delete offer.promotion_provenance;
      const { gate1, gate2 } = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: catalogPartSet });
      offer.gate_1_technical = { status: gate1.status, passed: gate1.passed, checks: gate1.checks, errors: gate1.errors };
      offer.gate_2_product = { status: gate2.status, passed: gate2.passed, checks: gate2.checks, errors: gate2.errors };
      offer.updated_at = new Date().toISOString();
    }
  }

  const activeNow = registryDoc.offers.filter(o => o.status === 'ACTIVE');
  registryDoc.policy.max_active_offers_allowed = MAX_PILOT_ACTIVE_OFFERS;
  registryDoc.policy.max_active_offers_per_marketplace = {
    'amazon.nl': MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.nl'],
    'amazon.de': MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.de']
  };
  registryDoc.policy.pilot_activated_parts = Array.from(new Set(activeNow.map(o => o.part_number)));
  registryDoc.metrics = {
    total_registered: registryDoc.offers.length,
    staged: registryDoc.offers.filter(o => o.status === 'STAGED').length,
    verified: registryDoc.offers.filter(o => o.status === 'VERIFIED').length,
    active: activeNow.length,
    active_nl: activeNow.filter(o => o.marketplace === 'amazon.nl').length,
    active_de: activeNow.filter(o => o.marketplace === 'amazon.de').length,
    research_required: registryDoc.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    asin_identity_unverified: registryDoc.offers.filter(o => o.status === 'ASIN_IDENTITY_UNVERIFIED').length,
    suspended: registryDoc.offers.filter(o => o.status === 'SUSPENDED').length,
    last_updated: new Date().toISOString()
  };
  registryDoc.phase = '77F';
  registryDoc.exported_at = new Date().toISOString();
  fs.writeFileSync(registryPath, `${JSON.stringify(registryDoc, null, 2)}\n`, 'utf8');
}

// ---- Coverage per priority model (unchanged by a demotion, measured anyway) --
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
const afterDoc = readJson('data/affiliate/verified_amazon_registry.json');
const activeParts = new Set(afterDoc.offers.filter(o => o.status === 'ACTIVE').map(o => PartNormalizer.normalizePartNumber(o.part_number)));
const models = [['MS 440', 'ms_440'], ['MS 170', 'ms_170'], ['BG 86', 'bg_86'], ['MS 461', 'ms_461'], ['BR 600', 'br_600'], ['MS 390', 'ms_390'], ['MS 361', 'ms_361'], ['HS 45', 'hs_45'], ['MS 250', 'ms_250']];
const coverage = models.map(([name, fitmentId]) => {
  const parts = [...(modelParts.get(fitmentId) || [])];
  const direct = parts.filter(p => activeParts.has(PartNormalizer.normalizePartNumber(p))).length;
  return { model: name, catalog_parts: parts.length, direct_offers: direct, coverage_pct: pct(direct, parts.length) };
});

const needsEvidence = evaluations.filter(e => e.verdict === 'NEEDS_EVIDENCE');
const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
writeJson('PHASE77F_RECOVERY_ANALYSIS.json', {
  generated_at_utc: GENERATED_AT,
  apply: APPLY,
  candidates: evaluations,
  search_attempts: SEARCH_ATTEMPTS,
  new_active_offers: 0,
  needs_evidence: needsEvidence.map(e => e.part_number),
  independent_asin_candidates_in_registry: 0
});
writeJson('PHASE77F_COVERAGE_BEFORE_AFTER.json', { generated_at_utc: GENERATED_AT, models: coverage });

const report = `# Phase 77F (final) — ASIN-identiteitsherstel

Datum: ${GENERATED_AT}
Modus: ${APPLY ? 'APPLY' : 'CLASSIFY_ONLY'}

## 1. Uitkomst

| Metric | Waarde |
|---|---|
| Werkelijk nieuwe ACTIVE-links | **0** |
| Kandidaten naar NEEDS_EVIDENCE | ${needsEvidence.length} |
| Totaal ACTIVE-aanbiedingen | ${afterDoc.offers.filter(o => o.status === 'ACTIVE').length} (NL ${afterDoc.offers.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.nl').length} · DE ${afterDoc.offers.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.de').length}) |
| Capaciteitsplafond | totaal ${MAX_PILOT_ACTIVE_OFFERS} · NL ${MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.nl']} · DE ${MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.de']} |

## 2. Bewijs per ASIN

${evaluations.map(e => `### ${e.part_number} → ${e.asin}

- Opgeslagen GTIN: \`${e.stored_gtin || 'geen'}\`${e.external_gtin ? ` · extern opgegeven GTIN: \`${e.external_gtin}\` (${e.gtin_discrepancy ? 'wijkt af' : 'gelijk'})` : ''}
- Bewijsbronnen: ${e.evidence_sources.map(s => `${s.type} ${s.url}`).join('; ') || 'geen'}
- Onafhankelijke bronnen: ${e.independent_sources} · daarvan noemen de ASIN: ${e.independent_sources_citing_asin}
- Two-Gate na herbeoordeling: ${e.two_gate_passed ? 'PASS' : 'FAIL'} — ${e.two_gate_errors.join('; ') || 'geen fouten'}
- Verdict: **${e.verdict}**
- Toelichting: ${e.note}
`).join('\n')}

## 3. Bronzoektocht (geen fictieve verificatie)

${SEARCH_ATTEMPTS.map(a => `- ${a.source} — ${a.query} → ${a.outcome}`).join('\n')}

De externe bronnen bevestigen het STIHL-onderdeel en de machinecompatibiliteit, maar geen enkele bron koppelt de ASIN aan MPN/GTIN. Omdat de eigen Amazon-vermelding niet als onafhankelijk bewijs mag gelden, blijven beide kandidaten behouden als NEEDS_EVIDENCE en zijn ze niet geactiveerd.

## 4. Dekking per prioriteitsmodel (directe kooplinks)

| Model | Onderdelen | Directe aanbiedingen | Dekking |
|---|---|---|---|
${coverage.map(c => `| ${c.model} | ${c.catalog_parts} | ${c.direct_offers} | ${c.coverage_pct}% |`).join('\n')}

## 5. Resterende NEEDS_EVIDENCE

${needsEvidence.map(e => `- \`${e.part_number}\` (${e.asin}) — wacht op een externe catalogus/merchant die ASIN + MPN/GTIN samen noemt.`).join('\n') || '- geen'}

## 6. Capaciteit en veiligheid

- Plafond totaal/NL ${MAX_PILOT_ACTIVE_OFFERS}, DE ${MAX_ACTIVE_OFFERS_PER_MARKETPLACE['amazon.de']}; DE-erft nooit een hoger globaal plafond.
- Two-Gate, kill-switches, NL-shipping-eis voor DE en de autorisatielijst zijn niet versoepeld.
`;
fs.writeFileSync(path.join(outDir, 'PHASE77F_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({ evaluations, coverage, needs_evidence: needsEvidence.map(e => e.part_number) }, null, 2));
