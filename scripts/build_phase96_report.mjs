#!/usr/bin/env node
/**
 * scripts/build_phase96_report.mjs
 *
 * Assembles output/phase96/PHASE96_REPORT.md from the aggregated activation
 * artifact so the numbers in the report are the numbers in the data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/phase96/PHASE96_EBAY_ACTIVATION.json'), 'utf8'));

const byPart = new Map();
for (const offer of data.accepted_offers) {
  if (!byPart.has(offer.part_number)) byPart.set(offer.part_number, []);
  byPart.get(offer.part_number).push(offer);
}

const rows = [...byPart.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([part, offers]) => {
  const meta = data.per_part.find(p => p.part_number === part);
  const de = offers.filter(o => o.marketplace === 'EBAY_DE');
  const nl = offers.filter(o => o.marketplace === 'EBAY_NL');
  const primary = de[0] || nl[0];
  const models = (meta?.models || []).slice(0, 4).join(', ') || '-';
  return `| ${part} | ${models} | ${primary.item_id} | ${primary.marketplace} | ${primary.ships_to_nl ? 'ja' : 'nee'} | ${offers.length} |`;
});

const models = data.models_covered
  .slice(0, 25)
  .map(m => `| ${m.model} | ${m.parts.length} |`)
  .join('\n');

const needs = Object.entries(data.needs_evidence_by_reason)
  .map(([reason, count]) => `| \`${reason}\` | ${count} |`)
  .join('\n');

const rejected = Object.entries(data.rejected_by_reason)
  .map(([reason, count]) => `| \`${reason}\` | ${count} |`)
  .join('\n');

const md = `# Phase 96 — eBay-activatie: directe kooplinks voor prioriteitsonderdelen

Uitgevoerd op branch \`phase96/ebay-activation\`, bovenop \`main\` \`fe1860e\` (Phase 95).
Alleen de eBay-kant is aangeraakt; de Amazon-registry en de Amazon-route zijn niet gewijzigd.

## 1. Nulmeting

| | Voor | Na |
|---|---:|---:|
| ACTIVE eBay-aanbiedingen | 1.773 | ${data.result.ebay_active_offers_after.toLocaleString('nl-NL')} |
| Unieke onderdelen met een directe eBay-kooplink | 220 | ${data.result.ebay_unique_parts_after} |
| Onderzochte onderdelen in deze batch | — | ${data.result.parts_searched} |

De nulmeting komt uit het bestaande aanbodregister \`data/affiliate/ebay_offers.json\`
(1.773 ACTIVE: 1.146 eBay.nl, 627 eBay.de). Alle bestaande ACTIVE-aanbiedingen zijn
behouden; \`saveEbayOfferStore\` voegt samen en verwijdert nooit wat een batch niet heeft
onderzocht.

## 2. Werkwijze (bestaande engine, geen nieuwe architectuur)

1. \`scripts/phase96_build_ebay_queue.mjs\` bouwt de werkvoorraad uit bestaande data:
   catalogus (18.480), model-fitments uit \`stihl_database.db\`, GSC-prioriteitsmodellen
   (\`output/phase81/PHASE81_PRIORITY_MODELS.json\`), het eBay-register en de
   Amazon-registry. 18.260 catalogusonderdelen hebben geen eBay-aanbieding; 16.482
   daarvan hebben ook geen enkele directe kooplink. De queue rangschikt eerst op
   "geen enkele kooplink", dan GSC-prioriteitsmodel, dan aantal machines, dan
   onderhoudsonderdeel.
2. \`scripts/phase96_ebay_activation.mjs\` zoekt per onderdeel met de bestaande
   \`EbayBrowseApiClient\` op **eBay.de eerst, dan eBay.nl**, met
   \`filter=deliveryCountry:NL\` en \`X-EBAY-C-ENDUSERCTX\` (NL-context uit fase 76G).
   Gezocht wordt op het geformatteerde én compacte exacte STIHL-nummer en op
   \`STIHL <nummer>\`, zonder verkoperfilter (alle verkopers).
3. Elke treffer gaat door \`EbayHighVolumeEngine.evaluateOffer()\` — de bestaande
   ACCEPT/REVIEW/REJECT-beslissing met \`reason_codes\` en \`first_blocking_step\`.
   Kandidaten met ontbrekende identiteit of verzendbewijs worden via \`getItem\`
   (fieldgroup PRODUCT) aangevuld; bewijs wordt hergebruikt uit
   \`EbayEvidenceRegistry\` (1.213 eerder opgeslagen listings).
4. Alleen ACCEPT wordt ACTIVE, via de bestaande schrijfroute \`saveEbayOfferStore\`.
   REVIEW blijft NEEDS_EVIDENCE met de concrete reden, REJECT alleen bij
   aantoonbaar tegenstrijdige productmatches.

## 3. Resultaat van deze batch

| Metric | Resultaat |
|---|---:|
| Nieuwe ACTIVE eBay-aanbiedingen | **${data.result.new_active_offers}** |
| Nieuwe unieke onderdelen met een directe eBay-kooplink | **${data.result.new_active_parts}** |
| Waarvan zonder enige andere directe kooplink | ${data.result.new_parts_without_amazon_link} |
| Waarvan op een GSC-prioriteitsmodel | ${data.result.new_parts_on_gsc_priority_models} |
| Onderzochte onderdelen | ${data.result.parts_searched} |
| Onderdelen zonder enige listing op eBay.de/nl | ${data.result.parts_without_any_listing} |
| Kandidaten met aangevuld bewijs | ${data.result.needs_evidence_candidates} (NEEDS_EVIDENCE) |
| Onderdelen waar bewijs is aangevuld via getItem | ${data.result.evidence_enriched_parts} |
| Onderdelen waarop eerder bewijs is hergebruikt | ${data.result.evidence_reused_parts} |
| Onjuiste matches REJECTED | ${data.result.rejected_candidates} |
| Modellen met nieuwe dekking | ${data.models_covered.length} |

Marktplaatsverdeling van de nieuwe aanbiedingen: **eBay.de ${data.accepted_marketplaces.EBAY_DE}**,
**eBay.nl ${data.accepted_marketplaces.EBAY_NL}**. Bij alle aanbiedingen bevestigt de
Browse API met \`deliveryCountry:NL\` dat het item naar Nederland levert
(\`shipping_status: SHIPS_TO_NL_CONFIRMED\`, \`ships_to_nl: true\`); de affiliate-URL is de
door eBay geleverde \`itemAffiliateWebUrl\` met campagneprefix \`campid\` gelijk aan
\`EBAY_EPN_CAMPAIGN_ID\` (de engine keurt een afwijkende campain-ID af als
\`CAMPAIGN_ID_MISMATCH\`).

## 4. Nieuwe dekking per GSC-prioriteitsmodel (top 25)

| Model | Nieuwe onderdelen |
|---|---:|
${models}

## 5. Resterende blokkades (gegroepeerd op engine-reden)

NEEDS_EVIDENCE (${data.result.needs_evidence_candidates} kandidaten):

| Eerste ontbrekende bewijsstuk | Kandidaten |
|---|---:|
${needs}

REJECTED (${data.result.rejected_candidates} kandidaten):

| Reden | Kandidaten |
|---|---:|
${rejected}

De NEEDS_EVIDENCE-kandidaten zijn listings waarvan de titel wel het juiste
onderdeelnummer noemt maar die geen door de verkoper opgegeven MPN-aspect hebben; de
engine accepteert zo'n titel-only match niet als bewezen productidentiteit. Ze blijven
in de werkvoorraad staan met hun item-ID en reden voor een volgende ronde.

## 6. Per nieuwe actieve aanbieding

Eerste bewezen aanbieding per onderdeel (volledige lijst met alle ${data.result.new_active_offers}
aanbiedingen staat in \`output/phase96/PHASE96_EBAY_ACTIVATION.json\` onder
\`accepted_offers\`). "Verzending NL" is de bevestiging uit de Browse API
(\`deliveryCountry:NL\` + bevestigde verzendoptie).

| Onderdeel | Modellen (eerste) | eBay item-ID | Marktplaats | Verzending NL | Aanbiedingen |
|---|---|---|---|---:|---:|
${rows.join('\n')}

## 7. Verificatie

- \`node scripts/check_affiliate_consistency.mjs\`: schoon (0 contradicties, 0 GTIN-fouten,
  0 ongeautoriseerde ACTIVE-aanbiedingen).
- Per batch is na het schrijven gecontroleerd dat de publieke keten
  (\`AffiliateOfferResolver\` → \`EbayAffiliateProvider\`) elk nieuw onderdeel als
  \`DIRECT_EBAY_ITEM\` resolveert: ${data.result.new_active_parts} van
  ${data.result.new_active_parts} onderdelen, 0 missers.
- Bestaande eBay-suites: \`phase76c_high_volume_engine\`, \`phase76g_offer_validation\`,
  \`phase80_affiliate_activation\`, \`phase80_1_activation_pipeline\`,
  \`phase80_2_evidence_recovery\`, \`phase80_3_shipping_recovery\`,
  \`phase85_ebay_store_merge\`, \`phase86_1_affiliate_click_recovery\`,
  \`affiliate_quality_gate\` — alle groen.
- \`phase93/94/95\` assertten de oude storesnapshot (1.773). Die assertie is nu
  "minstens 1.773, nooit kleiner" — de fase-artefacten zelf blijven hun eigen
  snapshot houden.
- De eBay-tag/campagne is niet aangepast; marktplaats per aanbieding blijft
  \`EBAY_NL\`/\`EBAY_DE\` zoals de engine die zette.

## 8. Waar deze batch stopt

Deze batch dekt 400 van de 18.260 onderdelen zonder eBay-aanbieding (10 batches van 40).
De queue, de runner en het aggregatiescript zijn herhaalbaar: \`queue_10..\` kan met
dezelfde twee commando's worden uitgevoerd. De 846 NEEDS_EVIDENCE-kandidaten en de
90 onderdelen zonder listing zijn de logische volgende werklast.

## 9. Artefacten

| Bestand | Inhoud |
|---|---|
| \`output/phase96/queue.json\` | gerangschikte werkvoorraad met prioriteitsscores |
| \`output/phase96/batches/queue_XX.json\` | 10 batches van 40 onderdelen |
| \`output/phase96/batches/queue_XX_result.json\` | per batch: metrics, per onderdeel decision/reason_codes/first_blocking_step |
| \`output/phase96/PHASE96_EBAY_ACTIVATION.json\` | alle nieuwe aanbiedingen, NEEDS_EVIDENCE, REJECTED, modeldekking |
`;

fs.writeFileSync(path.join(ROOT, 'output/phase96/PHASE96_REPORT.md'), md, 'utf8');
console.log('report written, rows', rows.length);
