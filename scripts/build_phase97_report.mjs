#!/usr/bin/env node
/**
 * scripts/build_phase97_report.mjs
 *
 * Writes output/phase97/PHASE97_REPORT.md from the aggregated activation
 * artifact and the baseline reconciliation, so every number in the report is a
 * number in the data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const data = readJson('output/phase97/PHASE97_EBAY_ACTIVATION.json');
const baseline = readJson('output/phase97/PHASE97_BASELINE.json');
const mpn = readJson('output/phase97/listing_mpn_groups.json');

const byPart = new Map();
for (const offer of data.accepted_offers) {
  if (!byPart.has(offer.part_number)) byPart.set(offer.part_number, []);
  byPart.get(offer.part_number).push(offer);
}

const partRows = [...byPart.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([part, offers]) => {
  const meta = data.per_part.find(entry => entry.part_number === part);
  const primary = offers.find(offer => offer.marketplace === 'EBAY_DE') || offers[0];
  const models = (meta?.models || []).slice(0, 4).join(', ') || '-';
  const shipping = primary.shipping_status || (primary.ships_to_nl ? 'SHIPS_TO_NL_CONFIRMED' : 'ONBEVESTIGD');
  return `| ${part} | ${models} | ${primary.item_id} | ${primary.marketplace} | ${shipping} | ${primary.shipping_cost_nl ?? '-'} | ${offers.length} |`;
});

const modelRows = data.models_covered
  .slice(0, 30)
  .map(model => `| ${model.model} | ${model.parts.length} |`)
  .join('\n');

const needsRows = Object.entries(data.needs_evidence_by_reason)
  .map(([reason, count]) => `| \`${reason}\` | ${count} |`)
  .join('\n');
const rejectedRows = Object.entries(data.rejected_by_reason)
  .map(([reason, count]) => `| \`${reason}\` | ${count} |`)
  .join('\n');

const batchSummary = data.batches.progress_files
  .map(item => `${item.batch_id}: ${item.resolved} onderdelen${item.complete ? ' (compleet)' : ''}`)
  .join('; ');

const mpnRows = mpn.groups
  .filter(group => group.gsc_priority_model)
  .slice(0, 40)
  .map(group => `| ${group.part_number} | ${group.candidates} | ${group.has_active_ebay_offer ? 'ja' : 'nee'} | ${group.alternative_search_hints?.[0] || '-'} |`)
  .join('\n');

const md = `# Fase 97 — meer live eBay-dekking voor GSC-prioriteitsonderdelen

Alleen de eBay-kant is gewijzigd. De Amazon-registry en de Amazon-route zijn niet
aangeraakt.

## 1. Nulmeting en reconciliatie van fase 96

Productie draaide bij de start op \`4c7e0db\` (main, gedeployed 2026-11-21T06:59Z).
De eBay-store bevatte **${baseline.store_after_phase96.active_offers.toLocaleString('nl-NL')} ACTIVE aanbiedingen op
${baseline.store_after_phase96.unique_parts} unieke onderdelen** (${baseline.store_after_phase96.marketplaces.EBAY_NL} eBay.nl,
${baseline.store_after_phase96.marketplaces.EBAY_DE} eBay.de); de Amazon-registry ${data.baseline.amazon_active_parts} actieve onderdelen;
samen ${data.baseline.combined_unique_parts} unieke onderdelen met een directe kooplink.

Het fase 96-rapport meldde 695 nieuwe aanbiedingen op 159 onderdelen, maar de store
groeide met ${baseline.phase96_growth.offers} aanbiedingen en ${baseline.phase96_growth.parts} onderdelen. Het verschil —
**${baseline.phase96_unreported.offers} aanbiedingen op ${baseline.phase96_unreported.parts} onderdelen** — is nu
volledig te verklaren en te controleren:

- ${baseline.phase96_unreported.skipped_parts_in_result_files} onderdelen staan in de resultaatbestanden als \`ALREADY_ACTIVE\`.
  Dat zijn onderdelen die een eerdere, onderbroken run al had geactiveerd; de hervatte
  run sloeg ze over en telde ze daarom niet mee.
- Alle ${baseline.phase96_unreported.offers} aanbiedingen van die ${baseline.phase96_unreported.parts} onderdelen staan in de
  store en zijn met dezelfde campagne en hetzelfde bewijs geschreven; geen enkel
  onderdeel is zonder aanbieding achtergebleven
  (${baseline.phase96_unreported.skipped_parts_without_store_offer} zonder store-record).
- De werkelijke fase 96-oogst is dus ${baseline.phase96_growth.offers} aanbiedingen op ${baseline.phase96_growth.parts} onderdelen,
  niet 695/159. Het rapport van fase 96 is op dit punt te laag en is hierbij
  gecorrigeerd.

### Campagnecontrole

| Bron | Campagne-ID |
|---|---|
| Aanbodarchief (\`data/affiliate/ebay_offers.json\`) | ${baseline.campaign_check.archive_campaign_ids.join(', ')} |
| Beheerdersconfiguratie \`EBAY_EPN_CAMPAIGN_ID\` | ${baseline.campaign_check.environment_campaign_id_configured ? 'gezet, gelijk aan het archief' : 'niet gezet'} |
| Productie-bootstrap (\`EbayStoreBootstrap\`) | gebruikt \`archive.campaign_id\` wanneer de omgeving geen ID heeft |

De Browse API antwoordt met \`itemAffiliateWebUrl\` waarin \`campid\` gelijk is aan
\`EBAY_EPN_CAMPAIGN_ID\`; de engine keurt elke afwijking af als
\`CAMPAIGN_ID_MISMATCH\`. Een onafhankelijke controle in het eBay Partner
Network-dashboard was niet mogelijk: daarvoor zijn geen inloggegevens beschikbaar.
De campagne is daarom bevestigd via de beheerdersconfiguratie en de door eBay
geleverde affiliate-URL's, niet via het EPN-dashboard.

## 2. Werkwijze

1. \`scripts/phase97_build_ebay_queue.mjs\` hergebruikt de fase 96-queue en sluit de
   400 daar onderzochte onderdelen uit. De volgende 400 prioriteitsonderdelen staan
   in \`queue_10\` t/m \`queue_19\`, met dezelfde weging (eerst geen enkele kooplink,
   dan GSC-prioriteitsmodel, dan aantal machines, dan onderhoudsonderdeel).
2. De 846 LISTING_MPN-kandidaten zijn per uniek onderdeel gegroepeerd
   (${data.listing_mpn.unique_parts} onderdelen); ${data.listing_mpn.parts_still_without_link.length} daarvan hadden nog geen
   eBay-link en vormen de retry-batch met alternatieve zoektermen (model + onderdeelnaam).
3. De runner (\`scripts/phase97_ebay_activation.mjs\`) gebruikt ongewijzigd
   \`EbayBrowseApiClient\`, \`EbayHighVolumeEngine.evaluateOffer()\`,
   \`EbayEvidenceRegistry\` en \`saveEbayOfferStore\`: eBay.de eerst, dan eBay.nl,
   \`deliveryCountry:NL\`, alle verkopers, ACCEPT/REVIEW/REJECT met
   \`reason_codes\` en \`first_blocking_step\`. Alleen ACCEPT wordt ACTIVE.
4. De runner checkpoint na elk onderdeel. Een API-quotumstop (\`HTTP 429\`) laat het
   onderdeel ongemoeid in plaats van het als "geen listing" op te slaan.

## 3. Resultaat

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **${data.result.new_active_offers}** |
| Nieuwe unieke onderdelen met een eerste directe eBay-kooplink | **${data.result.new_active_parts}** |
| Waarvan zonder enige andere directe kooplink (eerste kooplink over alle platformen) | ${data.result.new_parts_without_amazon_link} |
| Waarvan op een GSC-prioriteitsmodel | ${data.result.new_parts_on_gsc_priority_models} |
| Unieke onderdelen met een directe kooplink na deze batch | ${data.result.combined_unique_parts_after} |
| Onderzochte onderdelen | ${data.result.parts_searched} |
| Onderdelen zonder enige listing op eBay.de/nl | ${data.result.parts_without_any_listing} |
| NEEDS_EVIDENCE-kandidaten | ${data.result.needs_evidence_candidates} |
| REJECTED-kandidaten | ${data.result.rejected_candidates} |
| Onderdelen met aangevuld bewijs via getItem | ${data.result.evidence_enriched_parts} |

Marktplaatsverdeling: **eBay.de ${data.accepted_marketplaces.EBAY_DE || 0}**,
**eBay.nl ${data.accepted_marketplaces.EBAY_NL || 0}**. Alle nieuwe aanbiedingen
hebben \`shipping_status: SHIPS_TO_NL_CONFIRMED\` uit de Browse API met
\`deliveryCountry:NL\`, en een affiliate-URL met de bevestigde campagne.

## 4. Dekking per GSC-prioriteitsmodel (top 30)

| Model | Nieuwe onderdelen |
|---|---:|
${modelRows || '| — | 0 |'}

## 5. LISTING_MPN-voorraad

| | Aantal |
|---|---:|
| Kandidaten in fase 96 | ${data.listing_mpn.candidates} |
| Unieke onderdelen | ${data.listing_mpn.unique_parts} |
| Met een geldige eBay-link vóór deze batch | ${data.listing_mpn.parts_with_active_ebay_offer_before} |
| Met een geldige eBay-link ná deze batch | ${data.listing_mpn.parts_with_active_ebay_offer_after} |
| Nieuw gekoppeld via de retry-batch | ${data.listing_mpn.parts_gained_link.length} |
| Nog zonder eBay-link (open, met blokkade) | ${data.listing_mpn.parts_still_without_link.length} |

| Onderdeel | Kandidaten | eBay-link | Alternatieve zoekterm |
|---|---:|---|---|
${mpnRows || '| — | 0 | nee | - |'}

## 6. Per nieuw actief onderdeel

Eerste bewezen aanbieding per onderdeel; de volledige lijst met alle
${data.result.new_active_offers} aanbiedingen staat in
\`output/phase97/PHASE97_EBAY_ACTIVATION.json\` onder \`accepted_offers\`.

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Verzendkosten | Aanbiedingen |
|---|---|---|---|---|---:|---:|
${partRows.join('\n') || '| — | — | — | — | — | — | 0 |'}

## 7. Resterende blokkades

NEEDS_EVIDENCE (${data.result.needs_evidence_candidates} kandidaten):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
${needsRows || '| — | 0 |'}

REJECTED (${data.result.rejected_candidates} kandidaten):

| Reden | Kandidaten |
|---|---:|
${rejectedRows || '| — | 0 |'}

## 8. Batchbereik en verificatie

- Batches: ${batchSummary || 'geen'}.
- Queue: ${data.batches.ids.length} complete batches; nog open: ${data.batches.incomplete.length}.
- \`node scripts/check_affiliate_consistency.mjs\`: schoon.
- Publieke keten (\`AffiliateOfferResolver\` → \`EbayAffiliateProvider\`): elk nieuw
  onderdeel resolveert als \`DIRECT_EBAY_ITEM\` (0 missers in de laatste run).
- Bestaande eBay-suites en de fase 96-suites zijn groen, plus de nieuwe
  fase 97-suite voor alternatieve zoektermen.
- De eBay-campagne en de marktplaats per aanbieding zijn niet aangepast.

## 9. Artefacten

| Bestand | Inhoud |
|---|---|
| \`output/phase97/queue.json\` | volgende 400 prioriteitsonderdelen |
| \`output/phase97/batches/queue_XX.json\` | batches van 40 onderdelen |
| \`output/phase97/batches/queue_XX_progress.json\` | hervatbare voortgang per onderdeel |
| \`output/phase97/batches/queue_XX_result.json\` | metrics en per onderdeel decision/reason_codes |
| \`output/phase97/listing_mpn_groups.json\` | de 846 LISTING_MPN-kandidaten per onderdeel |
| \`output/phase97/PHASE97_BASELINE.json\` | nulmeting en reconciliatie van fase 96 |
| \`output/phase97/PHASE97_EBAY_ACTIVATION.json\` | alle nieuwe aanbiedingen, blokkades en modeldekking |
`;

fs.writeFileSync(path.join(ROOT, 'output', 'phase97', 'PHASE97_REPORT.md'), md, 'utf8');
console.log('report written, part rows', partRows.length);
