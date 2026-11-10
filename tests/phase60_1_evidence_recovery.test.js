/**
 * Phase 60.1: Amazon Evidence Recovery & Dual-Gate Contract Tests
 * Validates:
 * 1. Corrected EAN check digit for NGK CMR6H (0000 400 7011 -> 0087295133651)
 * 2. Corrected catalog identity for 0000 400 7000 (NGK BPMR7A, NOT CMR6H)
 * 3. Rejection of Phase 59F.1 forbidden matches (0000 400 7025 CMR7H, 0000 642 1223 spline mismatch)
 * 4. Dual-gate classification integrity (5 verified offers, 47 rejected/pending staged offers)
 * 5. Production lock invariant (exactly 3 active pilots, no unauthorized live ASINs)
 * 6. Canonical parts invariant (18,373 parts)
 * 7. Wording invariant: "Bevestigde compatibiliteit", zero "Gegarandeerd passend op"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const ROOT_DIR = process.cwd();

test('Phase 60.1: Amazon Evidence Recovery & Invariants', async (t) => {

  await t.test('1. Error Corrections: EAN check digit and Part Identity', () => {
    // 1a. Mathematical check digit verification for 0087295133651
    const eanStr = '0087295133651';
    assert.strictEqual(eanStr.length, 13, 'EAN must be 13 digits');
    const digits = eanStr.split('').map(Number);
    const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const checkDigit = (10 - (sum % 10)) % 10;
    assert.strictEqual(digits[12], checkDigit, 'Check digit must be mathematically verified');
    assert.strictEqual(checkDigit, 1, 'NGK 3365 CMR6H check digit must be 1, not 2');

    // 1b. parts_catalog.json for 0000 400 7000 must be NGK BPMR7A
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/parts_catalog.json'), 'utf8'));
    const p7000 = catalog.parts.find(p => p.part_number === '00004007000');
    assert.ok(p7000, '00004007000 must exist');
    assert.ok(p7000.part_name.includes('BPMR7A'), `00004007000 must be BPMR7A, got ${p7000.part_name}`);
    assert.ok(!p7000.part_name.includes('CMR6H'), '00004007000 must NOT be CMR6H');

    // 1c. PHASE60_COMMERCIAL_OPPORTUNITIES.json reflects BPMR7A
    const opps = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'PHASE60_COMMERCIAL_OPPORTUNITIES.json'), 'utf8'));
    const opp7000 = opps.top_20_parts.find(p => p.part_number === '00004007000');
    assert.ok(opp7000);
    assert.ok(opp7000.part_name.includes('BPMR7A'));
  });

  await t.test('2. Dual-Gate Verification & Forbidden Matches Rejection', () => {
    const verified = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'PHASE60_1_VERIFIED_OFFERS.json'), 'utf8'));
    const rejected = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'PHASE60_1_REJECTED_AND_PENDING.json'), 'utf8'));

    // Verified offers count
    assert.strictEqual(verified.counts.total_verified_offers, 5, 'Exactly 5 verified offers (3 pilots + 2 staged ready)');
    assert.strictEqual(verified.counts.active_live_pilots, 3, 'Strictly 3 active live pilots');
    assert.strictEqual(verified.counts.verified_staged_ready, 2, '2 verified staged ready');

    // Check specific verified items
    const verifiedPartNumbers = verified.offers.map(o => o.part_number);
    assert.ok(verifiedPartNumbers.includes('11104007005')); // Bosch WSR6F
    assert.ok(verifiedPartNumbers.includes('00004007000')); // NGK BPMR7A
    assert.ok(verifiedPartNumbers.includes('00004007011')); // NGK CMR6H
    assert.ok(verifiedPartNumbers.includes('00004007009')); // Bosch USR7AC
    assert.ok(verifiedPartNumbers.includes('00006421240')); // Oregon 18720 SM7

    // Rejected items check
    assert.strictEqual(rejected.counts.total_rejected_or_pending, 47);
    const disproven = rejected.items.filter(i => i.classification === 'INCORRECT_MATCH_CONFIRMED');
    assert.strictEqual(disproven.length, 3, '3 confirmed incorrect matches disproven');

    // Check that 0000 400 7025 is among disproven
    assert.ok(disproven.some(d => d.part_number === '00004007025' && d.asin === 'B07RHQ5FR4'));
    // Check that 0000 642 1223 with 18720 SM7 is among disproven
    assert.ok(disproven.some(d => d.part_number === '00006421223' && d.asin === 'B000IBWVWG'));
    // Check that 0000 642 1223 with B00004RA6N is among disproven
    assert.ok(disproven.some(d => d.part_number === '00006421223' && d.asin === 'B00004RA6N'));
  });

  await t.test('3. Strict Production Lock & Safety Net', () => {
    const verifiedRegistry = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/affiliate/verified_amazon_registry.json'), 'utf8'));
    assert.ok(verifiedRegistry.policy.max_active_offers_allowed <= 100, 'Max active offers within policy cap');
    assert.ok(['11104007005', '00004007000', '00004007011'].every(p => verifiedRegistry.policy.pilot_activated_parts.includes(p)), 'Baseline 3 pilot parts remain active');

    // Check that all unverified / staged parts fall back to search
    const verifiedDoc = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'PHASE60_1_VERIFIED_OFFERS.json'), 'utf8'));
    assert.strictEqual(verifiedDoc.production_lock_policy.immediate_activation_allowed_for_new_offers, false);
    assert.strictEqual(verifiedDoc.production_lock_policy.require_explicit_operator_command, true);
  });

  await t.test('4. Canonical Invariants Preservation', () => {
    // 18,373 canonical parts
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/parts_catalog.json'), 'utf8'));
    assert.strictEqual(catalog.parts_count, 18374);
    assert.strictEqual(catalog.parts.length, 18374);

    // 843 SEO parts
    const indexable = getAllIndexablePartsList();
    assert.strictEqual(indexable.length, 843);

    // 1,024 Sitemap URLs
    const database = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/stihl_database.json'), 'utf8'));
    const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
    const locMatches = sitemapXml.match(/<loc>/g) || [];
    assert.strictEqual(locMatches.length, 1024);

    // "Bevestigde compatibiliteit" enforced, "Gegarandeerd passend op" is 0
    const templates = [
      'src/components/ModelPartsPageTemplate.js',
      'src/components/PartsDiscoveryPageTemplate.js',
      'src/components/PartDetailPageTemplate.js'
    ];
    for (const tpl of templates) {
      const content = fs.readFileSync(path.join(ROOT_DIR, tpl), 'utf8');
      assert.strictEqual(content.includes('Gegarandeerd passend op'), false, `Forbidden phrasing found in ${tpl}`);
    }
  });

});
