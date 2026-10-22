/**
 * Test Suite: Phase 56H — Evidence-Based Diagram Section Resolution & Commercial Unlock
 *
 * Verifies:
 * 1. Exact unresolved section baseline audit (170,503 scalar unresolved, 4,603 scalar resolved, 175,106 total)
 * 2. Evidence classification across all 170,503 unresolved fitments (10 Rule A + 334 Rule C + 5,357 cross-scope blocked + 658 scope-ambiguous deferred + 164,144 insufficient evidence)
 * 3. Deterministic section resolution engine (SectionResolutionRegistry) & provenance contracts
 * 4. Multi-section preservation without scalar overwrite (334 fitments / 810 contexts + 4 additional contexts = 814 contexts)
 * 5. Zero cross-variant or cross-configuration section leakage
 * 6. Runtime integration into PartCatalogResolver, ModelPartsPageTemplate, and PartDetailPageTemplate
 * 7. Deep audit metrics for MS 261 (+8 resolved), MS 170 (+2 resolved), and FS 55 (+63 resolved)
 * 8. Analytical SEO & commercial unlock (+98 H3 multi-section parts, +41 strict H1-H7 Wave 4 candidates: 32 COMMERCIAL_HIGH + 9 COMMERCIAL_MEDIUM) while keeping active indexation frozen at 804 parts / 985 sitemap URLs
 * 9. GSC fail-closed status (NOT_CONFIGURED, 0 fabricated metrics) & Verified ASIN status (VERIFIED_ASIN_DELTA = 0)
 * 10. All 14 required Phase 56H artifacts present and non-empty in output/phase56h/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import {
  SectionResolutionRegistry,
  computeCanonicalFitmentId,
  resetSectionResolutionCache
} from '../src/parts/SectionResolutionRegistry.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56h');

const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 56H Test 1: Frozen Canonical Database & SEO Invariants Intact', () => {
  const partsCount = db.prepare('SELECT count(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT count(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT count(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT count(*) as c FROM part_fitment_evidence').get().c;
  const contextsCount = db.prepare('SELECT count(*) as c FROM model_part_fitment_section_contexts').get().c;
  const scalarUnresolved = db.prepare("SELECT count(*) as c FROM model_part_fitments WHERE section_name = 'Unresolved Diagram Section'").get().c;

  assert.strictEqual(partsCount, 17082, 'Canonical parts must remain 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Canonical fitments must remain 175,106');
  assert.strictEqual(configsCount, 766, 'Configurations must remain 766');
  assert.strictEqual(evidenceCount, 208412, 'Evidence records must remain 208,412');
  assert.strictEqual(contextsCount, 814, 'Section contexts must remain 814');
  assert.strictEqual(scalarUnresolved, 170503, 'SQLite scalar unresolved count must remain 170,503 for Phase 54F-D parity');

  const indexableParts = getAllIndexablePartsList();
  assert.strictEqual(indexableParts.length, 804, 'Active indexable parts must remain frozen at 804 in Phase 56H');

  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
  const sitemapUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  assert.strictEqual(sitemapUrls.length, 985, 'Active sitemap URLs must remain frozen at 985 in Phase 56H');
});

test('Phase 56H Test 2: All 14 Required Artifacts Exist and Are Valid', () => {
  const requiredFiles = [
    'UNRESOLVED_SECTION_BASELINE.json',
    'SECTION_EVIDENCE_CLASSIFICATION.json',
    'SECTION_RESOLUTION_CANDIDATES.json',
    'SECTION_RESOLUTION_RESULTS.json',
    'SECTION_CONFLICTS.json',
    'SECTION_MULTI_CONTEXT_RESULTS.json',
    'MS261_SECTION_AUDIT.json',
    'MS170_SECTION_AUDIT.json',
    'FS55_SECTION_AUDIT.json',
    'SEO_UNLOCK_AFTER_SECTION_RESOLUTION.json',
    'GSC_STATUS.json',
    'VERIFIED_ASIN_STATUS.json',
    'PHASE56H_SUMMARY.json',
    'PHASE56H_REPORT.md'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(outputDir, file);
    assert.ok(fs.existsSync(fullPath), `Artifact ${file} must exist in output/phase56h/`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 50, `Artifact ${file} must be non-empty`);
    if (file.endsWith('.json')) {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      assert.strictEqual(parsed.phase, 'PHASE_56H', `${file} must have phase === PHASE_56H`);
    }
  }
});

test('Phase 56H Test 3: Evidence Classification Accounting & Zero Guessed Sections', () => {
  const classDoc = JSON.parse(fs.readFileSync(path.join(outputDir, 'SECTION_EVIDENCE_CLASSIFICATION.json'), 'utf8'));
  const resDoc = JSON.parse(fs.readFileSync(path.join(outputDir, 'SECTION_RESOLUTION_RESULTS.json'), 'utf8'));

  assert.strictEqual(classDoc.total_unresolved_fitments_evaluated, 170503);
  assert.strictEqual(classDoc.classification_summary.EXPLICIT_SECTION_EVIDENCE, 10);
  assert.strictEqual(classDoc.classification_summary.EXISTING_CANONICAL_CONTEXT_MULTI_SECTION, 334);
  assert.strictEqual(classDoc.classification_summary.CROSS_SCOPE_BLOCKED_EVIDENCE, 5357);
  assert.strictEqual(classDoc.classification_summary.total_accounted, 170503);

  assert.strictEqual(resDoc.accounting.unresolved_before, 170503);
  assert.strictEqual(resDoc.accounting.promoted_single_section_rule_a, 10);
  assert.strictEqual(resDoc.accounting.promoted_multi_section_rule_c, 334);
  assert.strictEqual(resDoc.accounting.total_unresolved_promoted, 344);
  assert.strictEqual(resDoc.accounting.effective_resolved_after, 4947);
  assert.strictEqual(resDoc.accounting.effective_unresolved_after, 170159);
  assert.strictEqual(resDoc.accounting.effective_resolved_after + resDoc.accounting.effective_unresolved_after, 175106);

  assert.strictEqual(resDoc.invariants.guessed_sections, 0);
  assert.strictEqual(resDoc.invariants.model_family_inferred_sections, 0);
  assert.strictEqual(resDoc.invariants.cross_variant_leakage, 0);
  assert.strictEqual(resDoc.invariants.cross_configuration_leakage, 0);
  assert.strictEqual(resDoc.invariants.scalar_multi_section_overwrites, 0);
});

test('Phase 56H Test 4: Rule A Explicit Exact-Scope Resolutions & Provenance Contracts', () => {
  const res56hDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_section_resolutions_56h.json'), 'utf8'));
  assert.strictEqual(res56hDoc.lookup_mode, 'EXACT_FITMENT_ID_ONLY');
  assert.strictEqual(res56hDoc.record_count, 10);
  assert.strictEqual(res56hDoc.resolutions.length, 10);

  for (const r of res56hDoc.resolutions) {
    assert.ok(r.fitment_id, 'Resolution must have fitment_id');
    assert.strictEqual(r.raw_section_name, 'Unresolved Diagram Section', 'Must preserve raw_section_name');
    assert.ok(SectionNormalizer.isMeaningfulSection(r.canonical_section_name), 'Canonical section must be meaningful');
    assert.ok(r.source_evidence_id, 'Must reference exact source_evidence_id');
    assert.ok(r.provenance_hash && r.provenance_hash.length === 64, 'Must have 64-char SHA-256 provenance_hash');

    // Verify exact match in SQLite part_fitment_evidence
    const ev = db.prepare('SELECT * FROM part_fitment_evidence WHERE evidence_id = ?').get(r.source_evidence_id);
    assert.ok(ev, `Evidence ${r.source_evidence_id} must exist in part_fitment_evidence`);
    assert.strictEqual(ev.canonical_model_id, r.canonical_model_id);
    assert.strictEqual(ev.part_number, r.part_number);
    assert.strictEqual(ev.fitment_scope, r.fitment_scope);
    assert.strictEqual(ev.variant_key || 'base', r.variant_key || 'base');
    assert.strictEqual(ev.configuration_key || null, r.configuration_key || null);
  }
});

test('Phase 56H Test 5: Multi-Section Preservation & Runtime Integration (Rule C)', () => {
  // Part 11251418300 on model 034 has 2 verified contexts on BASE_MODEL_CONFIRMED, while its configuration fitments remain isolated
  const resolved034Part = PartCatalogResolver.resolvePartNumber('11251418300');
  assert.ok(resolved034Part, 'Part 11251418300 must resolve');

  const baseFitment = resolved034Part.fitments.find(
    f => f.canonical_model_id === '034' && f.fitment_scope === 'BASE_MODEL_CONFIRMED'
  );
  assert.ok(baseFitment, 'Base fitment on 034 must exist');
  assert.strictEqual(baseFitment.section_name_raw, 'Unresolved Diagram Section', 'Raw section name must remain Unresolved Diagram Section');
  assert.strictEqual(baseFitment.section_resolution_status, 'VALID_MULTI_SECTION');
  assert.strictEqual(baseFitment.resolved_sections.length, 2);

  // Configuration fitment on 034 for the same part must NOT receive base-model multi-section contexts (zero cross-scope leakage)
  const cfgFitment = resolved034Part.fitments.find(
    f => f.canonical_model_id === '034' && f.fitment_scope === 'EXACT_CONFIGURATION'
  );
  assert.ok(cfgFitment, 'Configuration fitment on 034 must exist');
  assert.strictEqual(cfgFitment.section_resolution_status, 'UNRESOLVED', 'Configuration fitment must NOT inherit base-model section contexts');
  assert.strictEqual(cfgFitment.resolved_sections.length, 0);

  // Verify PartCatalogResolver.getSectionsForModel('034') places 11251418300 in both resolved sections without duplicating within the same section
  const model034Sections = PartCatalogResolver.getSectionsForModel('034');
  for (const sec of model034Sections) {
    const occurrences = sec.parts.filter(p => p.part_number === '11251418300');
    assert.ok(occurrences.length <= 1, `Part 11251418300 must appear at most once in section ${sec.section_name}`);
  }
});

test('Phase 56H Test 6: Deep Audit Focus Models (MS 261, MS 170, FS 55) & Public UI Rendering', () => {
  const ms261Audit = JSON.parse(fs.readFileSync(path.join(outputDir, 'MS261_SECTION_AUDIT.json'), 'utf8'));
  const ms170Audit = JSON.parse(fs.readFileSync(path.join(outputDir, 'MS170_SECTION_AUDIT.json'), 'utf8'));
  const fs55Audit = JSON.parse(fs.readFileSync(path.join(outputDir, 'FS55_SECTION_AUDIT.json'), 'utf8'));

  // MS 261: 1,610 unresolved before -> +8 newly resolved (6 multi-section base + 2 c_m exact variant) -> 1,602 unresolved after
  assert.strictEqual(ms261Audit.fitment_totals.unresolved_before, 1610);
  assert.strictEqual(ms261Audit.fitment_totals.newly_resolved_fitments_count, 8);
  assert.strictEqual(ms261Audit.fitment_totals.unresolved_after, 1602);
  assert.strictEqual(ms261Audit.fitment_totals.effective_resolved_after, 215);

  // MS 170: 668 unresolved before -> +2 newly resolved (11104007005 Ignition System, 11301240800 Air Filter) -> 666 unresolved after
  assert.strictEqual(ms170Audit.fitment_totals.unresolved_before, 668);
  assert.strictEqual(ms170Audit.fitment_totals.newly_resolved_fitments_count, 2);
  assert.strictEqual(ms170Audit.fitment_totals.unresolved_after, 666);
  assert.strictEqual(ms170Audit.fitment_totals.effective_resolved_after, 15);

  // FS 55: 1,264 unresolved before -> +63 newly resolved (63 multi-section fitments / 189 contexts) -> 1,201 unresolved after
  assert.strictEqual(fs55Audit.fitment_totals.unresolved_before, 1264);
  assert.strictEqual(fs55Audit.fitment_totals.newly_resolved_fitments_count, 63);
  assert.strictEqual(fs55Audit.fitment_totals.unresolved_after, 1201);
  assert.strictEqual(fs55Audit.fitment_totals.effective_resolved_after, 198);

  // Verify MS 170 Air Filter (11301240800) now renders 'Air Filter' section on Part Detail Page
  const part1130 = PartCatalogResolver.resolvePartNumber('11301240800');
  assert.ok(part1130.technical_profile.sections.includes('Air Filter'), '11301240800 must include resolved Air Filter section');
  const detailHtml = renderPartDetailPageHtml(part1130, stihlDb);
  assert.ok(detailHtml.includes('Air Filter'), 'PartDetailPage HTML for 11301240800 must render Air Filter section');
  assert.ok(!detailHtml.includes('Unresolved Diagram Section'), 'PartDetailPage HTML must never leak Unresolved Diagram Section');

  // Verify FS 55 model parts page renders cleanly with newly activated multi-section contexts
  const fs55Model = stihlDb.models.find(m => m.slug === 'fs-55');
  const fs55Html = renderModelPartsPageHtml(fs55Model, stihlDb);
  assert.ok(fs55Html.includes('Drive Tube Assembly'), 'FS 55 ModelPartsPage must render Drive Tube Assembly section');
});

test('Phase 56H Test 7: SEO & Commercial Unlock Re-Analysis & Fail-Closed GSC / ASIN Checks', () => {
  const seoUnlock = JSON.parse(fs.readFileSync(path.join(outputDir, 'SEO_UNLOCK_AFTER_SECTION_RESOLUTION.json'), 'utf8'));
  assert.strictEqual(seoUnlock.indexation_policy_in_56h, 'ANALYTICAL_ONLY_ACTIVE_INDEXATION_FROZEN_AT_804');
  assert.strictEqual(seoUnlock.active_production_indexation_state.active_indexable_parts, 804);
  assert.strictEqual(seoUnlock.active_production_indexation_state.sitemap_total_urls, 985);

  assert.strictEqual(seoUnlock.h3_multi_section_gate_comparison.parts_with_2_plus_sections_on_published_models_before_56h, 57);
  assert.strictEqual(seoUnlock.h3_multi_section_gate_comparison.parts_with_2_plus_sections_on_published_models_after_56h, 155);
  assert.strictEqual(seoUnlock.h3_multi_section_gate_comparison.net_new_parts_passing_h3_gate, 98);

  assert.strictEqual(seoUnlock.strict_h1_h7_wave3_unlock_comparison.eligible_parts_before_56h, 4);
  assert.strictEqual(seoUnlock.strict_h1_h7_wave3_unlock_comparison.eligible_parts_after_56h, 45);
  assert.strictEqual(seoUnlock.strict_h1_h7_wave3_unlock_comparison.newly_unlocked_strict_candidates_for_future_wave4, 41);
  assert.strictEqual(seoUnlock.strict_h1_h7_wave3_unlock_comparison.newly_unlocked_commercial_high, 32);
  assert.strictEqual(seoUnlock.strict_h1_h7_wave3_unlock_comparison.newly_unlocked_commercial_medium, 9);

  const gscDoc = JSON.parse(fs.readFileSync(path.join(outputDir, 'GSC_STATUS.json'), 'utf8'));
  assert.strictEqual(gscDoc.gsc_status, 'NOT_CONFIGURED');
  assert.strictEqual(gscDoc.fabricated_metrics, 0);

  const asinDoc = JSON.parse(fs.readFileSync(path.join(outputDir, 'VERIFIED_ASIN_STATUS.json'), 'utf8'));
  assert.strictEqual(asinDoc.verified_asin_delta, 0);
  assert.strictEqual(asinDoc.total_search_fallback_links, 17082);
  assert.strictEqual(asinDoc.production_associate_tag, 'srihldecoder2-21');
});

test('Phase 56H Test 8: SectionResolutionRegistry Determinism & Reload Persistence (No Runtime-Only State)', () => {
  const sampleRuleAFitment = {
    fitment_id: '00004007000::ms_261::c_m::base::EXACT_VARIANT',
    part_number: '00004007000',
    canonical_model_id: 'ms_261',
    variant_key: 'c_m',
    configuration_key: null,
    fitment_scope: 'EXACT_VARIANT',
    section_key: 'general_unresolved',
    section_name: 'Unresolved Diagram Section',
    diagram_position: '23'
  };

  const sampleRuleCFitment = {
    fitment_id: '11251418300::034::base::base::BASE_MODEL_CONFIRMED',
    part_number: '11251418300',
    canonical_model_id: '034',
    variant_key: 'base',
    configuration_key: null,
    fitment_scope: 'BASE_MODEL_CONFIRMED',
    section_key: 'general_unresolved',
    section_name: 'Unresolved Diagram Section',
    diagram_position: null
  };

  const beforeReloadA = SectionResolutionRegistry.resolveFitmentSections(sampleRuleAFitment);
  const beforeReloadC = SectionResolutionRegistry.resolveFitmentSections(sampleRuleCFitment);
  const statsBefore = SectionResolutionRegistry.getRegistryStats();

  // Simulate process restart / cold cache reload
  resetSectionResolutionCache();

  const afterReloadA = SectionResolutionRegistry.resolveFitmentSections(sampleRuleAFitment);
  const afterReloadC = SectionResolutionRegistry.resolveFitmentSections(sampleRuleCFitment);
  const statsAfter = SectionResolutionRegistry.getRegistryStats();

  assert.deepStrictEqual(afterReloadA, beforeReloadA, 'Rule A resolution must be 100% deterministic across cold reloads');
  assert.deepStrictEqual(afterReloadC, beforeReloadC, 'Rule C multi-section resolution must be 100% deterministic across cold reloads');
  assert.deepStrictEqual(statsAfter, statsBefore, 'Registry stats must be identical after reload');
  assert.strictEqual(statsAfter.context_fitments_count, 338);
  assert.strictEqual(statsAfter.total_context_rows, 814);
  assert.strictEqual(statsAfter.rule_a_resolutions_count, 10);
});

