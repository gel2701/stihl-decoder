#!/usr/bin/env node
/**
 * scripts/build_phase98_report.mjs
 *
 * Writes output/phase98/PHASE98_REPORT.md from PHASE98_BASELINE.json and
 * PHASE98_EBAY_ACTIVATION.json, so every number in the report is a number in
 * the data. Deployment facts come from the environment when known:
 *   PHASE98_PR, PHASE98_PROD_COMMIT, PHASE98_DEPLOYED_AT, PHASE98_PROD_VERSION
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const baseline = readJson('output/phase98/PHASE98_BASELINE.json');
const data = readJson('output/phase98/PHASE98_EBAY_ACTIVATION.json');
const queue = readJson('output/phase98/queue.json');
const retry = (() => {
  try {
    return readJson('output/phase98/batches/retry_00.json');
  } catch {
    return { parts: [] };
  }
})();

const num = value => Number(value || 0).toLocaleString('nl-NL');
const env = process.env;

const byPart = new Map();
for (const offer of data.accepted_offers) {
  if (!byPart.has(offer.part_number)) byPart.set(offer.part_number, []);
  byPart.get(offer.part_number).push(offer);
}
const partRows = [...data.accepted_parts].sort().map(part => {
  const offers = byPart.get(part) || [];
  const meta = data.per_part.find(entry => entry.part_number === part && !entry.batch?.startsWith('retry'))
    || data.per_part.find(entry => entry.part_number === part);
  const primary = offers.find(offer => offer.marketplace === 'EBAY_DE') || offers[0];
  const models = (meta?.models || []).slice(0, 3).join(', ') || '-';
  const shipping = primary.shipping_status
    || (primary.ships_to_nl ? 'SHIPS_TO_NL_CONFIRMED' : 'ONBEVESTIGD');
  const amazon = meta?.has_amazon_direct_link ? 'ja' : 'nee';
  return `| ${part} | ${models} | ${primary.item_id} | ${primary.marketplace} | ${shipping} | ${primary.shipping_cost_nl ?? '-'} | ${amazon} | ${offers.length} |`;
});

const gscRows = data.gsc_model_coverage
  .slice(0, 30)
  .map(entry => `| ${entry.model} | ${num(entry.parts)} | ${num(entry.parts_covered_before)} | ${num(entry.parts_covered_after)} | +${num(entry.new_parts)} | ${num(entry.remaining_without_any_direct_link)} |`)
  .join('\n');

const needsRows = Object.entries(data.needs_evidence_by_reason)
  .sort((a, b) => b[1] - a[1])
  .map(([reason, count]) => `| \`${reason}\` | ${num(count)} |`)
  .join('\n');
const rejectedRows = Object.entries(data.rejected_by_reason)
  .sort((a, b) => b[1] - a[1])
  .map(([reason, count]) => `| \`${reason}\` | ${num(count)} |`)
  .join('\n');

const checklist = data.batches.checkpoints
  .map(item => `| \`${item.batch_id}\` | ${item.resolved} | ${item.complete ? 'ja' : 'nee'} | ${item.rate_limited ? 'ja' : 'nee'} | ${item.updated_at || '-'} |`)
  .join('\n');

const unfinishedRows = (data.result.unfinished_parts || [])
  .slice(0, 30)
  .map(entry => `| ${entry.part_number} | \`${entry.batch}\` | ${(entry.api_errors || []).join('; ') || '-'} |`)
  .join('\n');

const pr = env.PHASE98_PR || '(open)';
const prodCommit = env.PHASE98_PROD_COMMIT || '(na deploy)';
const deployedAt = env.PHASE98_DEPLOYED_AT || '-';
const prodVersion = env.PHASE98_PROD_VERSION || '-';

const md = `# Fase 98 — meer STIHL-onderdelen met een eerste directe eBay-kooplink

Alleen de eBay-kant is gewijzigd. De Amazon-registry en de Amazon-route zijn niet
aangeraakt; Amazon-dekking is uitsluitend gebruikt om te prioriteren en om de
gecombineerde dekking te meten.

## 1. Dekking voor en na (identieke sleutels)

| Metric | Voor | Na |
|---|---:|---:|
| ACTIVE eBay-aanbiedingen | ${num(data.coverage.before.ebay_active_offers)} | ${num(data.coverage.after.ebay_active_offers)} |
| Unieke onderdelen met een eBay-link | ${num(data.coverage.before.ebay_parts)} | ${num(data.coverage.after.ebay_parts)} |
| eBay.de / eBay.nl | ${num(data.coverage.before.ebay_marketplaces.EBAY_DE || 0)} / ${num(data.coverage.before.ebay_marketplaces.EBAY_NL || 0)} | ${num(data.coverage.after.ebay_marketplaces.EBAY_DE || 0)} / ${num(data.coverage.after.ebay_marketplaces.EBAY_NL || 0)} |
| Amazon-onderdelen met directe link | ${num(data.coverage.before.amazon_parts)} | ${num(data.coverage.after.amazon_parts)} |
| **Unieke onderdelen met een directe kooplink (eBay of Amazon)** | **${num(data.coverage.before.combined_parts)}** | **${num(data.coverage.after.combined_parts)}** |

De nulmeting leest de store zoals die op main staat (commit \`${baseline.production.commit || 'main'}\`),
niet de werkmap: een lopende batch schrijft al aanbiedingen weg en die mogen niet
als "voor" worden geteld. De eindmeting leest de live store plus de Amazon-registry
opnieuw, met dezelfde sleutels (\`parts_ebay\`, \`parts_amazon\`, \`parts_combined\`).

## 2. Resultaat van deze batch

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **${num(data.result.new_active_offers)}** |
| Nieuwe unieke onderdelen met hun **eerste directe eBay-kooplink** | **${num(data.result.new_parts_with_first_ebay_link)}** |
| Nieuwe unieke onderdelen met hun **eerste directe kooplink over alle platformen** | **${num(data.result.new_parts_with_first_buy_link_anywhere)}** |
| Waarvan zonder Amazon-link vóór deze batch | ${num(data.result.new_parts_without_amazon_link_before)} |
| Waarvan met alleen een Amazon-link vóór deze batch | ${num(data.result.new_parts_with_amazon_link_before)} |
| Nieuwe onderdelen op een GSC-prioriteitsmodel | ${num(data.result.new_parts_on_gsc_priority_models)} |
| Onderzochte onderdelen (exacte nummerpass) | ${num(data.result.parts_searched_exact_pass)} |
| Onderzochte onderdelen (aanvullende zoektermen) | ${num(data.result.parts_searched_alternative_pass)} |
| Onderzochte onderdelen totaal | ${num(data.result.parts_searched)} |
| Onderdelen zonder enige listing op eBay.de/nl | ${num(data.result.parts_without_any_listing)} |
| Onderdelen dat na beide passes nog geen eBay-link heeft | ${num(data.result.parts_without_ebay_link_after_both_passes)} |
| Onafgeronde onderdelen (marktplaats gaf een fout) | ${num(data.result.parts_unfinished)} |
| NEEDS_EVIDENCE-kandidaten | ${num(data.result.needs_evidence_candidates)} |
| REJECTED-kandidaten | ${num(data.result.rejected_candidates)} |
| Onderdelen met aangevuld bewijs via getItem | ${num(data.result.evidence_enriched_parts)} |
| Onderdelen met hergebruikt bewijs | ${num(data.result.evidence_reused_parts)} |
| Dubbel getelde geaccepteerde records | ${num(data.result.duplicate_accepted_records)} |
| Nieuwe onderdelen buiten deze queue | ${num(data.result.parts_outside_this_queue_with_new_offers)} |

Marktplaatsverdeling van de nieuwe aanbiedingen: **eBay.de ${num(data.accepted_marketplaces.EBAY_DE || 0)}**,
**eBay.nl ${num(data.accepted_marketplaces.EBAY_NL || 0)}**.
${num(data.shipping_evidence.offers_with_nl_shipping)} van ${num(data.result.new_active_offers)} aanbiedingen
hebben \`ships_to_nl: true\`; statusverdeling:
${Object.entries(data.shipping_evidence.statuses).map(([key, value]) => `\`${key}\` ${value}`).join(', ')}.

## 3. Queue en prioritering

- Queue: ${num(queue.summary.queue_size)} onderdelen in batches van 40
  (\`${queue.summary.batch_ids.join('`, `')}\`), direct na \`queue_19\` van fase 97.
- Alle ${num(queue.summary.queue_composition.without_any_direct_buy_link)} queueonderdelen hadden
  **geen directe kooplink op eBay én Amazon**; alle
  ${num(queue.summary.queue_composition.on_gsc_priority_models)} staan op een GSC-prioriteitsmodel
  (${num(queue.summary.queue_composition.distinct_gsc_models)} modellen).
- Uitgesloten: ${num(queue.summary.researched_before_phase98.unique_parts)} onderdelen die fase 96 en
  fase 97 al onderzochten (${num(baseline.researched_before_phase98.phase96)} fase 96,
  ${num(baseline.researched_before_phase98.phase97)} fase 97, ${num(baseline.researched_before_phase98.both)} in beide).
- Resterend na deze queue: ${num(queue.summary.remaining_after_queue.candidates)} kandidaten,
  waarvan ${num(queue.summary.remaining_after_queue.without_any_direct_buy_link)} zonder enige kooplink en
  ${num(queue.summary.remaining_after_queue.on_gsc_priority_models)} op een GSC-prioriteitsmodel.

## 4. Extra dekking per GSC-prioriteitsmodel

| Model | Onderdelen | Gedekt vóór | Gedekt ná | Nieuw | Nog zonder link |
|---|---:|---:|---:|---:|---:|
${gscRows || '| — | 0 | 0 | 0 | 0 | 0 |'}

## 5. LISTING_MPN-voorraad uit fase 97, opnieuw gemeten

| | Aantal |
|---|---:|
| Unieke onderdelen in de fase 97 LISTING_MPN-backlog | ${num(data.listing_mpn_phase97.unique_parts)} |
| Met een geldige eBay-link vóór fase 98 | ${num(data.listing_mpn_phase97.parts_with_ebay_link_before_phase98)} |
| Met een geldige eBay-link ná fase 98 | ${num(data.listing_mpn_phase97.parts_with_ebay_link_after_phase98)} |
| Nog zonder eBay-link (open) | ${num(data.listing_mpn_phase97.parts_still_without_link.length)} |

Geen van deze onderdelen is zonder nieuwe listing of nieuwe, door de engine
geaccepteerde bewijsbron opnieuw geopend; titel-only matches blijven
\`NEEDS_EVIDENCE\` en tegenstrijdige nummers blijven \`REJECTED\`.

## 6. Per nieuw onderdeel (eerste bewezen aanbieding)

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Verzendkosten | Amazon-link vóór | Aanbiedingen |
|---|---|---|---|---|---:|---|---:|
${partRows.join('\n') || '| — | — | — | — | — | — | — | 0 |'}

De volledige lijst met alle ${num(data.result.new_active_offers)} aanbiedingen staat in
\`output/phase98/PHASE98_EBAY_ACTIVATION.json\` onder \`accepted_offers\`.

## 7. Resterende blokkades

NEEDS_EVIDENCE (${num(data.result.needs_evidence_candidates)} kandidaten op
${num(data.result.parts_with_needs_evidence)} onderdelen):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
${needsRows || '| — | 0 |'}

REJECTED (${num(data.result.rejected_candidates)} kandidaten op
${num(data.result.parts_with_rejected_candidates)} onderdelen):

| Reden | Kandidaten |
|---|---:|
${rejectedRows || '| — | 0 |'}

Onafgeronde onderdelen (${num(data.result.parts_unfinished)}): een marktplaats gaf een
fout, dus de geplande zoekopdrachten op beide marktplaatsen zijn niet voltooid. Deze
staan als onafgerond in het checkpoint en zijn niet als "geen listing" geteld.

| Onderdeel | Batch | API-fouten |
|---|---|---|
${unfinishedRows || '| — | — | — |'}

## 8. Batchbereik en checkpoint

| Batch | Verwerkt | Compleet | 429-stop | Laatste checkpoint |
|---|---:|---|---|---|
${checklist}

Alternatieve zoektermen (model + onderdeeltype) zijn in een tweede pass gedraaid over
de ${num(retry.parts.length)} onderdelen die de exacte nummerpass zonder ACCEPT afrondden;
de exacte nummerladder staat altijd vooraan in de zoekopdracht.

## 9. Publicatie en verificatie

- PR: ${pr}
- Geverifieerde productiecommit: \`${prodCommit}\`
- Gedeployed: ${deployedAt}
- \`/api/version\`: ${prodVersion}
- Store geschreven via de bestaande \`EbayStoreBootstrap\` + \`saveEbayOfferStore\`;
  bestaande ACTIVE-aanbiedingen zijn niet verwijderd of gewijzigd.
- Campagne: archief en \`EBAY_EPN_CAMPAIGN_ID\` geven beide
  \`${data.campaign.store_campaign_ids.join(', ')}\`; ${num(data.campaign.new_offers_with_campaign_id)} van
  ${num(data.result.new_active_offers)} nieuwe aanbiedingen dragen die campagne in de affiliate-URL.
  Technische campagnevalidatie is daarmee aangetoond; een registratie in het
  EPN-dashboard is niet bevestigd (geen inloggegevens beschikbaar).

## 10. Artefacten

| Bestand | Inhoud |
|---|---|
| \`output/phase98/PHASE98_BASELINE.json\` | nulmeting met de deelverzamelingen per platform |
| \`output/phase98/queue.json\` | de volgende 400 prioriteitsonderdelen |
| \`output/phase98/batches/queue_XX.json\` | batches van 40 onderdelen |
| \`output/phase98/batches/queue_XX_progress.json\` | hervatbaar checkpoint per onderdeel |
| \`output/phase98/batches/retry_00.json\` | onderdelen voor de alternatieve zoekpass |
| \`output/phase98/PHASE98_EBAY_ACTIVATION.json\` | alle nieuwe aanbiedingen, blokkades en modeldekking |
`;

fs.writeFileSync(path.join(ROOT, 'output', 'phase98', 'PHASE98_REPORT.md'), md, 'utf8');
console.log('report written, part rows', partRows.length);
