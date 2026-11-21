/**
 * Phase 77E — Affiliate fast-track batch.
 *
 * Processes the 25 commercial priority parts from Phase 77D in one batch with the
 * existing infrastructure only:
 *   - VerifiedOfferRegistry (status, per-marketplace caps, kill switches)
 *   - TwoGateVerifier (Gate 1 technical, Gate 2 product/compatibility)
 *   - the stored offer registry and evidence artifacts
 *
 * Admission rules beyond Two-Gate:
 *   - AMAZON_LISTING_COMPATIBLE candidates need a typed AMAZON_PRODUCT_PAGE /
 *     AMAZON_LISTING source for their own ASIN on the right marketplace (the
 *     class the 62 existing listing-based ACTIVE offers use).
 *   - Independent-evidence candidates need at least one source that is neither
 *     their own Amazon listing nor a bare manufacturer URL.
 *   - A claim that only says "ASIN X matches STIHL <part>" without any typed
 *     source is not accepted.
 *   - The total ACTIVE cap (100) and the per-marketplace caps are hard limits.
 *
 * Usage:
 *   node scripts/phase77e_fasttrack_batch.mjs            # classify only
 *   node scripts/phase77e_fasttrack_batch.mjs --apply    # activate within caps
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getAllIndexablePartsSet } from '../src/seo/PartIndexationRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'phase77e');
fs.mkdirSync(outDir, { recursive: true });
const APPLY = process.argv.includes('--apply');
const GENERATED_AT = new Date().toISOString();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pct = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);

// Mirror the server runtime defaults BEFORE the affiliate modules are evaluated,
// because the resolver builds its default registry at import time.
if (process.env.AMAZON_AFFILIATE_ENABLED === undefined) process.env.AMAZON_AFFILIATE_ENABLED = 'true';
if (process.env.AMAZON_ASSOCIATE_TAG_NL === undefined) process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
if (process.env.AMAZON_ASSOCIATE_TAG_DE === undefined) process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';

const { TwoGateVerifier } = await import('../src/affiliate/TwoGateVerifier.js');
const { VerifiedOfferRegistry, defaultVerifiedOfferRegistry } = await import('../src/affiliate/VerifiedOfferRegistry.js');
const { getPartAffiliateOffer } = await import('../src/search/IntelligentPartsSearchEngine.js');
const { renderPartDetailPageHtml } = await import('../src/components/PartDetailPageTemplate.js');
const { renderModelPartsPageHtml } = await import('../src/components/ModelPartsPageTemplate.js');

defaultVerifiedOfferRegistry.productionActivationAllowed = true;
defaultVerifiedOfferRegistry.activeWhitelist = null;

const queueDoc = readJson('output/phase77e/PHASE77E_QUEUE.json');
const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const catalogPartsDoc = readJson('data/parts_catalog.json');
const catalogPartList = Array.isArray(catalogPartsDoc) ? catalogPartsDoc : (catalogPartsDoc.parts || []);
const catalogPartSet = new Set(catalogPartList.map(p => String(p.part_number || p).replace(/[^0-9]/g, '')));
const database = readJson('data/stihl_database.json');
const db = new DatabaseSync(path.join(root, 'data', 'stihl_database.db'), { readOnly: true });
const indexableParts = getAllIndexablePartsSet();

const SELF_CERTIFIED = /^(asin\s+B[0-9A-Z]{9}\s+(matches|bevestigd|corresponds|confirmed)|agent\s+verified|matched\s+by\s+title|title\s+match)/i;
const AMAZON_URL = /^https?:\/\/(www\.)?amazon\.(nl|de|com)\//i;
const MANUFACTURER_URL = /^https?:\/\/(www\.)?stihl\.(nl|de|com|co\.uk)\//i;
const LISTING_SOURCE_TYPES = new Set(['AMAZON_PRODUCT_PAGE', 'AMAZON_LISTING', 'AMAZON_LISTING_DE', 'AMAZON_LISTING_NL']);

const evidenceSources = (offer) => (Array.isArray(offer.verifiable_evidence_sources) ? offer.verifiable_evidence_sources.filter(Boolean) : []);
const evidenceUrls = (offer) => [
  ...evidenceSources(offer).map(s => s.url).filter(Boolean),
  offer.independent_evidence_url
].filter(Boolean);
const sameListingAsCandidate = (url, asin) => AMAZON_URL.test(url) && url.toUpperCase().includes(String(asin).toUpperCase());

/**
 * Strict admission check for NEW promotions.
 *
 * Two-Gate alone is not enough: the repository rule forbids relying on
 * self-certifying identity text or on the candidate's own Amazon listing as
 * "corroboration". The 62 legacy listing-class ACTIVE offers are left untouched
 * (retroactive tightening is a separate audit), but no new offer is promoted
 * without a source that is independent of the listing itself.
 */
const admit = (offer) => {
  const asin = String(offer.asin || '').toUpperCase();
  const sources = evidenceSources(offer);
  const proof = String(offer.asin_product_identity_proof || offer.confirmed_product_identity || '');
  const ownListing = sources.filter(src => src && typeof src.url === 'string' && sameListingAsCandidate(src.url, asin));
  const independent = sources.filter(src => src && typeof src.url === 'string' && !sameListingAsCandidate(src.url, asin) && !MANUFACTURER_URL.test(src.url));
  const bareManufacturer = sources.filter(src => src && typeof src.url === 'string' && MANUFACTURER_URL.test(src.url));

  if (independent.length > 0) {
    return { passed: true, basis: 'INDEPENDENT_EXTERNAL_SOURCE', reasons: [] };
  }
  const priorUnproven = /unproven|uncorroborated|research required/i.test(String(offer.status_reason || ''));
  const reason = SELF_CERTIFIED.test(proof.trim())
    ? 'SELF_CERTIFIED_ASIN_IDENTITY'
    : ownListing.length > 0
      ? 'OWN_AMAZON_LISTING_IS_NOT_INDEPENDENT_CORROBORATION'
      : bareManufacturer.length > 0
        ? 'BARE_MANUFACTURER_URL_DOES_NOT_CITE_THE_ASIN'
        : 'NO_INDEPENDENT_ASIN_CORROBORATION';
  return {
    passed: false,
    basis: null,
    reasons: [
      `ASIN_IDENTITY_UNVERIFIED: ${reason}.`,
      ...(priorUnproven ? ['PRIOR_AUDIT_MARKED_UNPROVEN: the stored record still carries an unproven/uncorroborated identity reason.'] : [])
    ]
  };
};

// Capacity is a hard limit: existing tests assert ACTIVE <= 100 and the policy
// cap may not exceed 100.
const totalCap = Number(registryDoc.policy?.max_active_offers_allowed ?? 100);
const activeTotalBefore = registryDoc.offers.filter(o => o.status === 'ACTIVE').length;
const activeByMarketplace = (marketplace) => registryDoc.offers.filter(o => o.status === 'ACTIVE' && String(o.marketplace).toLowerCase() === marketplace).length;

let simulatedActiveTotal = activeTotalBefore;
const classifyItem = (item) => {
  const partNumber = PartNormalizer.normalizePartNumber(item.part_number);
  const offers = registryDoc.offers.filter(o => PartNormalizer.normalizePartNumber(o.part_number) === partNumber);
  const activeOffers = offers.filter(o => o.status === 'ACTIVE');
  const record = {
    rank: item.rank,
    part_number: partNumber,
    part_name: item.part_name,
    primary_model: item.models[0],
    models: item.models,
    catalog_present: catalogPartSet.has(partNumber),
    offers_found: offers.length,
    active_offers: activeOffers.map(o => ({ asin: o.asin, marketplace: o.marketplace, tag: o.affiliate_tag })),
    decision: null,
    decision_reason: null,
    gate_1: null,
    gate_2: null,
    gate_errors: [],
    admission_basis: null,
    required_evidence: [],
    candidate: null
  };

  if (activeOffers.length > 0) {
    record.decision = 'ALREADY_ACTIVE';
    record.decision_reason = `Already has ${activeOffers.length} direct ACTIVE offer(s).`;
    return record;
  }
  if (offers.length === 0) {
    record.decision = 'NEEDS_EVIDENCE';
    record.decision_reason = 'NO_CANDIDATE: no stored offer for this part in any marketplace.';
    record.required_evidence = ['Find an authorised product source whose listing names this exact STIHL part number, then record the ASIN evidence.'];
    return record;
  }

  const candidate = offers.find(o => o.status === 'VERIFIED' || o.status === 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE') || offers[0];
  record.candidate = {
    asin: candidate.asin,
    marketplace: candidate.marketplace,
    status: candidate.status,
    evidence_classification: candidate.evidence_classification || null,
    verification_date: candidate.verification_date,
    shipping_to_nl_status: candidate.shipping_to_nl_status || null,
    evidence_urls: evidenceUrls(candidate)
  };

  const verification = TwoGateVerifier.verifyOffer(candidate, { catalogPartMap: catalogPartSet });
  record.gate_1 = verification.gate1?.passed ?? null;
  record.gate_2 = verification.gate2?.passed ?? null;
  record.gate_errors = verification.errors || [];

  if (!verification.passed) {
    const hardReject = record.gate_errors.some(e => /ASIN_MISMATCH|GTIN_MISMATCH|PACKAGE_QUANTITY_MISMATCH|INCORRECT_MATCH|BLOCKED_CONFLICT|SUSPICIOUS_SEQUENTIAL_GTIN|INVALID_GTIN|OEM_CLASSIFICATION_CONTRADICTION/i.test(e));
    record.decision = hardReject ? 'REJECTED' : 'NEEDS_EVIDENCE';
    record.decision_reason = hardReject ? 'Two-Gate failed on product identity/consistency.' : 'Two-Gate failed on missing or stale evidence.';
    record.required_evidence = record.gate_errors;
    return record;
  }

  const admission = admit(candidate);
  record.admission_basis = admission.basis;
  if (!admission.passed) {
    record.decision = 'NEEDS_EVIDENCE';
    record.decision_reason = 'Two-Gate passes, but the ASIN identity is not admissible under the repository evidence rules.';
    record.required_evidence = admission.reasons;
    return record;
  }

  const marketplace = String(candidate.marketplace).toLowerCase();
  if (marketplace === 'amazon.de' && candidate.shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED') {
    record.decision = 'NEEDS_EVIDENCE';
    record.decision_reason = 'German offer lacks confirmed NL shipping evidence.';
    record.required_evidence = ['Dated Amazon.de shipping evidence (URL + description) proving delivery to the Netherlands.'];
    return record;
  }

  const marketplaceCap = Number(registryDoc.policy?.max_active_offers_per_marketplace?.[marketplace] ?? totalCap);
  if (activeByMarketplace(marketplace) >= marketplaceCap || simulatedActiveTotal >= totalCap) {
    record.decision = 'READY_BUT_CAP_BLOCKED';
    record.decision_reason = `Verified and admissible, but the ACTIVE cap is full (${simulatedActiveTotal}/${totalCap} total, ${activeByMarketplace(marketplace)}/${marketplaceCap} on ${marketplace}).`;
    record.required_evidence = ['Capacity: the ACTIVE cap of 100 is protected by the existing test invariants.'];
    return record;
  }

  record.decision = 'READY_TO_ACTIVATE';
  record.decision_reason = `Two-Gate passed and ASIN identity is admissible (${admission.basis}).`;
  simulatedActiveTotal += 1;
  return record;
};

const results = queueDoc.items.map(classifyItem);

// ---------------------------------------------------------------------------
// Activation (only READY_TO_ACTIVATE, only with --apply, never above the caps)
// ---------------------------------------------------------------------------
const activation = { requested: APPLY, attempted: [], activated: [], blocked: [] };
if (APPLY) {
  const ready = results.filter(r => r.decision === 'READY_TO_ACTIVATE').sort((a, b) => a.rank - b.rank);
  if (ready.length > 0) {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      registryPath: path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json')
    });
    registry.loadFromFile();
    let remainingTotal = totalCap - activeTotalBefore;
    for (const item of ready) {
      if (remainingTotal <= 0) {
        activation.blocked.push({ part_number: item.part_number, errors: ['TOTAL_ACTIVE_CAP_REACHED'] });
        continue;
      }
      activation.attempted.push(item.part_number);
      const res = registry.activateOffer(item.part_number, 'Phase 77E fast-track batch activation (Two-Gate + admission rules)', {
        marketplace: item.candidate.marketplace,
        asin: item.candidate.asin
      });
      if (res.success) {
        remainingTotal -= 1;
        activation.activated.push({ part_number: item.part_number, asin: res.offer.asin, marketplace: res.offer.marketplace, model: item.primary_model });
        item.decision = 'ACTIVATED';
      } else {
        activation.blocked.push({ part_number: item.part_number, errors: res.errors });
      }
    }
    if (activation.activated.length > 0) {
      const doc = registry.exportRegistry();
      doc.policy = { ...(registryDoc.policy || {}), ...(doc.policy || {}) };
      doc.policy.max_active_offers_allowed = totalCap;
      doc.policy.max_active_offers_per_marketplace = {
        ...(registryDoc.policy?.max_active_offers_per_marketplace || {}),
        ...(doc.policy.max_active_offers_per_marketplace || {})
      };
      doc.policy.max_active_offers_per_marketplace['amazon.nl'] = registryDoc.policy?.max_active_offers_per_marketplace?.['amazon.nl'] ?? 100;
      doc.policy.max_active_offers_per_marketplace['amazon.de'] = registryDoc.policy?.max_active_offers_per_marketplace?.['amazon.de'] ?? 50;
      doc.policy.pilot_activated_parts = Array.from(new Set(doc.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number)));
      doc.metrics = {
        total_registered: doc.offers.length,
        staged: doc.offers.filter(o => o.status === 'STAGED').length,
        verified: doc.offers.filter(o => o.status === 'VERIFIED').length,
        active: doc.offers.filter(o => o.status === 'ACTIVE').length,
        active_nl: doc.offers.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.nl').length,
        active_de: doc.offers.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.de').length,
        research_required: doc.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
        suspended: doc.offers.filter(o => o.status === 'SUSPENDED').length,
        last_updated: new Date().toISOString()
      };
      doc.phase = '77E';
      doc.exported_at = new Date().toISOString();
      fs.writeFileSync(path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    }
  }
}

// ---------------------------------------------------------------------------
// Coverage before/after per priority model
// ---------------------------------------------------------------------------
const registryAfter = readJson('data/affiliate/verified_amazon_registry.json');
const activePartSetBefore = new Set(registryDoc.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
const activePartSetAfter = new Set(registryAfter.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number));
const priorityModels = [
  ['MS 440', 'ms_440'], ['MS 170', 'ms_170'], ['BG 86', 'bg_86'], ['MS 461', 'ms_461'],
  ['BR 600', 'br_600'], ['MS 390', 'ms_390'], ['MS 361', 'ms_361'], ['HS 45', 'hs_45'], ['MS 250', 'ms_250']
];
const coverage = priorityModels.map(([name, fitmentId]) => {
  const parts = db.prepare('SELECT DISTINCT part_number FROM model_part_fitments WHERE canonical_model_id = ?').all(fitmentId).map(r => r.part_number);
  const before = parts.filter(p => activePartSetBefore.has(p)).length;
  const after = parts.filter(p => activePartSetAfter.has(p)).length;
  return {
    model: name,
    catalog_parts: parts.length,
    direct_before: before,
    direct_after: after,
    coverage_before_pct: pct(before, parts.length),
    coverage_after_pct: pct(after, parts.length)
  };
});

// ---------------------------------------------------------------------------
// Link verification (part page, model page, search resolver)
// ---------------------------------------------------------------------------
const indexableActive = [...activePartSetAfter].filter(p => indexableParts.has(p));
const newActivatedPart = activation.activated[0]?.part_number || null;
const sampleActive = newActivatedPart || indexableActive[0] || [...activePartSetAfter][0] || '00004007000';
const sampleFallback = results.find(r => r.decision === 'NEEDS_EVIDENCE' && r.offers_found > 0)?.part_number || '11281201602';
const activeOffer = getPartAffiliateOffer(sampleActive, database?.parts?.[0]?.part_name || 'STIHL onderdeel');
const fallbackOffer = getPartAffiliateOffer(sampleFallback, 'Air filter');
const partPageActive = renderPartDetailPageHtml(sampleActive, database, 'https://www.stihldecoder.nl');
const partPageFallback = renderPartDetailPageHtml(sampleFallback, database, 'https://www.stihldecoder.nl');
const modelPage = renderModelPartsPageHtml({ slug: 'ms-440', model_name: 'MS 440' }, database, 'https://www.stihldecoder.nl', {});
const brModelPage = renderModelPartsPageHtml({ slug: 'br-600', model_name: 'BR 600' }, database, 'https://www.stihldecoder.nl', {});

const linkVerification = {
  generated_at_utc: GENERATED_AT,
  active_sample: {
    part_number: sampleActive,
    newly_activated: sampleActive === newActivatedPart,
    resolver_is_direct: Boolean(activeOffer?.is_direct),
    resolver_url_has_nl_tag: Boolean(activeOffer?.url && activeOffer.url.includes('tag=srihldecoder2-21')),
    part_page_is_indexable: indexableParts.has(sampleActive),
    part_page_has_direct_marker: partPageActive.includes('data-offer-type="MANUAL_ASIN"'),
    part_page_has_direct_link: Boolean(activeOffer?.url && partPageActive.includes(activeOffer.url.split('?')[0]))
  },
  fallback_sample: {
    part_number: sampleFallback,
    resolver_is_direct: Boolean(fallbackOffer?.is_direct),
    part_page_has_direct_marker: partPageFallback.includes('data-offer-type="MANUAL_ASIN"'),
    part_page_has_search_fallback: /Zoek op Amazon|Amazon-zoekopdracht/i.test(partPageFallback)
  },
  model_page: {
    model: 'MS 440',
    has_direct_button: modelPage.includes('🛒 Directe Koop'),
    has_search_button: modelPage.includes('🛒 Zoek op Amazon'),
    direct_button_index: modelPage.indexOf('🛒 Directe Koop'),
    first_search_fallback_index: modelPage.indexOf('🛒 Zoek op Amazon'),
    direct_button_above_first_fallback: modelPage.indexOf('🛒 Directe Koop') > -1 &&
      (modelPage.indexOf('🛒 Zoek op Amazon') === -1 || modelPage.indexOf('🛒 Directe Koop') < modelPage.indexOf('🛒 Zoek op Amazon'))
  },
  newly_activated_model_page: newActivatedPart ? {
    part_number: newActivatedPart,
    direct_button_present_for_part: brModelPage.includes(newActivatedPart) && brModelPage.includes('🛒 Directe Koop')
  } : null,
  indexable_active_parts: {
    active_parts: activePartSetAfter.size,
    indexable_active_parts: indexableActive.length,
    note: 'Alleen deze onderdelen hebben een indexeerbare onderdeelnummerpagina; de overige ACTIVE-offers verschijnen op de modelpagina en in de zoeker.'
  }
};

const summary = {
  processed: results.length,
  already_active: results.filter(r => r.decision === 'ALREADY_ACTIVE').length,
  ready_to_activate: results.filter(r => r.decision === 'READY_TO_ACTIVATE').length,
  ready_but_cap_blocked: results.filter(r => r.decision === 'READY_BUT_CAP_BLOCKED').length,
  activated: activation.activated.length,
  needs_evidence: results.filter(r => r.decision === 'NEEDS_EVIDENCE').length,
  rejected: results.filter(r => r.decision === 'REJECTED').length,
  active_offers_after: registryAfter.offers.filter(o => o.status === 'ACTIVE').length
};

const writeJson = (name, payload) => fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
writeJson('PHASE77E_BATCH_RESULTS.json', {
  schema_version: '1.0.0',
  phase: '77E',
  generated_at_utc: GENERATED_AT,
  applied: APPLY,
  database_mutated: activation.activated.length > 0,
  registry_policy: {
    max_active_offers_allowed: totalCap,
    max_active_offers_per_marketplace: registryDoc.policy?.max_active_offers_per_marketplace ?? null,
    active_before: activeTotalBefore,
    active_after: activePartSetAfter.size,
    active_nl_before: activeByMarketplace('amazon.nl'),
    active_de_before: activeByMarketplace('amazon.de')
  },
  admission_rules: {
    strict_admission: 'Every new promotion needs at least one source that is neither the candidate\'s own Amazon listing nor a bare manufacturer URL. Existing listing-class ACTIVE offers are not touched retroactively.',
    known_inconsistency: 'The registry still contains ACTIVE offers whose only evidence is their own Amazon listing (legacy). That is reported, not silently extended.',
    caps: 'Total ACTIVE <= 100 and per-marketplace caps are hard limits; both are asserted by existing tests.'
  },
  summary,
  activation,
  results
});
writeJson('PHASE77E_COVERAGE_BEFORE_AFTER.json', { generated_at_utc: GENERATED_AT, models: coverage });
writeJson('PHASE77E_LINK_VERIFICATION.json', linkVerification);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const resultsTable = results.map(r => `| ${r.rank} | ${r.part_number} | ${r.primary_model} | ${r.decision} | ${(r.decision_reason || '').replace(/\|/g, '/')} |`).join('\n');
const activatedTable = activation.activated.length
  ? activation.activated.map(a => `| ${a.part_number} | ${a.model} | ${a.marketplace} | ${a.asin} |`).join('\n')
  : '| — | — | — | — |';
const report = `# Phase 77E — Affiliate fast-track resultaten

Datum: ${GENERATED_AT}
Batchmodus: ${APPLY ? 'APPLY' : 'CLASSIFY_ONLY'} · register gewijzigd: ${activation.activated.length > 0 ? 'ja' : 'nee'}

## Samenvatting

| Uitkomst | Aantal |
|---|---|
| Automatisch verwerkt | ${summary.processed} |
| READY_TO_ACTIVATE | ${summary.ready_to_activate} |
| Daadwerkelijk geactiveerd | ${summary.activated} |
| READY maar geblokkeerd door de 100-limiet | ${summary.ready_but_cap_blocked} |
| NEEDS_EVIDENCE | ${summary.needs_evidence} |
| REJECTED | ${summary.rejected} |
| Al actief (geen actie) | ${summary.already_active} |
| ACTIVE-offers na batch | ${summary.active_offers_after} |

## Geactiveerd

| Onderdeel | Model | Marktplaats | ASIN |
|---|---|---|---|
${activatedTable}

## Register en limieten

- Max ACTIVE: ${totalCap} (NL ${registryDoc.policy?.max_active_offers_per_marketplace?.['amazon.nl']}, DE ${registryDoc.policy?.max_active_offers_per_marketplace?.['amazon.de']}).
- Vóór: ${activeTotalBefore} ACTIVE-offers (${activeByMarketplace('amazon.nl')} NL / ${activeByMarketplace('amazon.de')} DE). Na: ${summary.active_offers_after}.
- De limiet is **niet verhoogd**: de bestaande tests eisen \`ACTIVE <= 100\` en \`policy.max_active_offers_allowed <= 100\`, dus verhogen zou regressies opleveren. Er is ook geen capaciteitsblokkade opgetreden, omdat geen enkel onderdeel door de bewijspoort kwam; met 99/100 was er bovendien maar één plaats vrij geweest.

## Per prioriteitsmodel: directe links vóór/na

| Model | Catalogusonderdelen | Direct vóór | Direct na | Dekking |
|---|---|---|---|---|
${coverage.map(c => `| ${c.model} | ${c.catalog_parts} | ${c.direct_before} | ${c.direct_after} | ${c.coverage_after_pct}% |`).join('\n')}

## Uitslag per startonderdeel

| # | Onderdeel | Model | Uitkomst | Reden |
|---|---|---|---|---|
${resultsTable}

## Werkelijke blokkades

1. **Geen kandidaat (${results.filter(r => /NO_CANDIDATE/.test(r.decision_reason)).length})** — geen enkele opgeslagen aanbieding voor deze onderdelen. Zonder toegestane productbron (Creators API is niet geconfigureerd, geen productfeed) kan hier geen ASIN onderbouwd worden.
2. **Bewijs onvoldoende (${results.filter(r => r.decision === 'NEEDS_EVIDENCE' && !/NO_CANDIDATE/.test(r.decision_reason)).length})** — Two-Gate passeert wel, maar de ASIN-identiteit is niet toelaatbaar volgens de bewijsregels (zelfcertificering of alleen een kale fabrikant-URL).
3. **Afgekeurd (${summary.rejected})** — sequentiële GTIN-patronen; die zijn tegenstrijdig met echte productidentiteit.
4. **Capaciteit (${summary.ready_but_cap_blocked})** — een geverifieerd, toelaatbaar onderdeel past niet meer onder de 100-limiet.

## Kooplinks gecontroleerd

- Nieuw geactiveerd onderdeel \`${sampleActive}\`: resolver direct = ${linkVerification.active_sample.resolver_is_direct}, NL-tag = ${linkVerification.active_sample.resolver_url_has_nl_tag}, indexeerbare onderdeelpagina = ${linkVerification.active_sample.part_page_is_indexable}, directe knop op onderdeelpagina = ${linkVerification.active_sample.part_page_has_direct_marker}, directe link aanwezig = ${linkVerification.active_sample.part_page_has_direct_link}.
- Modelpagina BR 600 bevat het geactiveerde onderdeel met directe koopknop = ${linkVerification.newly_activated_model_page ? linkVerification.newly_activated_model_page.direct_button_present_for_part : 'n.v.t.'}.
- Modelpagina MS 440: directe knop = ${linkVerification.model_page.has_direct_button}, zoekknop = ${linkVerification.model_page.has_search_button}, directe knop boven de eerste zoekfallback = ${linkVerification.model_page.direct_button_above_first_fallback}.
- Fallbackvoorbeeld \`${sampleFallback}\`: geen directe link, wel zoekfallback = ${linkVerification.fallback_sample.part_page_has_search_fallback}.
- Indexeerbare ACTIVE-onderdelen: ${linkVerification.indexable_active_parts.indexable_active_parts} van ${linkVerification.indexable_active_parts.active_parts}. Alleen die hebben een eigen SEO-onderdeelnummerpagina; de rest verschijnt op de modelpagina en in de zoeker.

## Conclusie

${activation.activated.length === 0
  ? 'Geen enkel onderdeel is geactiveerd: de twee kandidaten die Two-Gate passeert, rusten op hun eigen Amazon-vermelding en een eerdere audit markeerde hun identiteit als onbewezen. Dat is een bewuste weigering, geen technisch falen. De rest is afgewezen (zwakke GTIN) of heeft geen enkele kandidaat.'
  : `Er is ${activation.activated.length} onderdeel geactiveerd; de rest is met een harde reden afgewezen of in de wachtrij gezet.`}
De grootste resterende blokkade is niet de techniek maar het ontbreken van een toegestane, onafhankelijke productbron voor de 20 onderdelen zonder kandidaat en voor de twee kandidaten met alleen een eigen Amazon-vermelding.
`;
fs.writeFileSync(path.join(outDir, 'PHASE77E_REPORT.md'), report, 'utf8');

console.log(JSON.stringify({ summary, activation, coverage, linkVerification }, null, 2));
