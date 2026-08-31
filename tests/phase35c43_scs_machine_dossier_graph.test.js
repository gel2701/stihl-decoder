import assert from 'assert';
import fs from 'fs';

console.log('Starting Phase 35C.4.3 SCS machine dossier graph tests...');
const report = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_final_report.json', import.meta.url), 'utf8'));

assert.strictEqual(report.ARCHIVE_SHA256, '8f9600ceee6602c73b20a2b2656d28c01905855d0b3b5bec9b1733e150a97588');
assert.ok(report.ARCHIVE_ENTRIES >= 170);
assert.ok(report.MACHINE_BASE_RECORDS > 0);
assert.ok(report.CONTROLLER_RECORDS_EXCLUDED > 0);
assert.ok(report.VIEW_RECORDS > 0);
assert.ok(report.MACHINE_ENTITIES > 0);
assert.ok(report.MODEL_TYPE_RELATIONS > 0);
assert.ok(report.TS_DATA_RELATIONS > 0);
assert.ok(report.UNIQUE_DOCUMENT_REFERENCES > 0);
assert.strictEqual(report.FS350_SCOPE_TEST, 'PASS');
assert.strictEqual(report.MS170_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report.MS180_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report['046_STROKE_STATUS'], 'OFFICIAL_CONFLICTED');
assert.ok(report.NEW_PUBLIC_FACTS >= 10);
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.SAME_SCS_LINEAGE_DOUBLE_EVIDENCE, 0);
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.ADDENDUM_STATUS, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const fs350Audit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_fs350_regression.json', import.meta.url), 'utf8'));
assert.strictEqual(fs350Audit.FS350_MACHINE_FOUND, 'YES');
assert.strictEqual(fs350Audit.FS350_TS_SOURCE, 'doc/TS_Data/FS200_body.htm');
assert.strictEqual(fs350Audit.FS350_SCOPE, 'MULTI_MODEL_EXPLICIT');
assert.strictEqual(fs350Audit.FS350_SCOPE_FROM_FILENAME_ONLY, 'NO');
assert.strictEqual(fs350Audit.FS350_EXPLICIT_SCOPE_REMOVAL_RESULT, 'PASS');

const negativeAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_ms170_ms180_negative_scope_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(negativeAudit.MS170_009_RELATION_FOUND, 'YES');
assert.strictEqual(negativeAudit.MS180_009_RELATION_FOUND, 'YES');
assert.strictEqual(negativeAudit.PASS, 'PASS');

const coverage = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_public_coverage_before_after.json', import.meta.url), 'utf8'));
assert.ok(coverage.after.PUBLIC_FACTS_TOTAL > coverage.before.PUBLIC_FACTS_TOTAL);
assert.ok(coverage.after.PUBLIC_MODELS_WITH_ANY_FACT >= coverage.before.PUBLIC_MODELS_WITH_ANY_FACT);

const promotionAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_public_fact_promotion_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(promotionAudit.promoted.length, 111);
assert.ok(promotionAudit.blocked.length >= 10);
assert.ok(promotionAudit.promoted.some((row) => row.model_slug === 'fs-350'));
assert.ok(promotionAudit.blocked.some((row) => row.model_slug === 'ms-170' && row.blocking_reasons.includes('MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE')));

const addendum = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_promotion_integrity_addendum.json', import.meta.url), 'utf8'));
assert.strictEqual(addendum.ARCHIVE_ENTRIES, 180);
assert.strictEqual(addendum.MACHINE_BASE_RECORDS, 106);
assert.strictEqual(addendum.CONTROLLER_RECORDS_EXCLUDED, 5);
assert.strictEqual(addendum.VIEW_RECORDS, 69);
assert.strictEqual(addendum.TI_VIEW + addendum.TS_VIEW + addendum.BA_VIEW + addendum.ET_VIEW + addendum.RT_VIEW, 69);
assert.strictEqual(addendum.NEW_PUBLIC_FACTS, 111);
assert.strictEqual(addendum.NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE, 111);
assert.strictEqual(addendum.NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE, 0);
assert.strictEqual(addendum.DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT, 0);
assert.strictEqual(addendum.DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT, 0);
assert.strictEqual(addendum.NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING, 0);
assert.strictEqual(addendum.PUBLIC_FACTS_FROM_SCS_PLACEHOLDER, 0);
assert.strictEqual(addendum.PUBLIC_FACTS_FROM_MISSING_PAYLOAD, 0);
assert.strictEqual(addendum.DUPLICATE_PUBLIC_FACTS_FROM_VIEW_REPETITION, 0);
assert.strictEqual(addendum.PUBLIC_WINDOWS_PATH_COUNT, 0);
assert.strictEqual(addendum.FAILURE_INJECTION, 'PASS');
assert.strictEqual(addendum.ADDENDUM_STATUS, 'PASS');

const newFactAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_new_public_fact_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(newFactAudit.NEW_PUBLIC_FACTS, 111);
assert.strictEqual(newFactAudit.records.length, 111);
assert.ok(newFactAudit.records.every((row) => row.underlying_source_locator && row.underlying_source_locator.includes('doc/TS_Data/')));
assert.ok(newFactAudit.records.every((row) => row.source_lineage === 'BATCH6_STIHL_LEGACY_DOCUMENT_CD'));
assert.ok(newFactAudit.records.every((row) => row.independence_status === 'SAME_SOURCE_PROVEN'));

const coverageDetail = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_public_model_coverage_detail.json', import.meta.url), 'utf8'));
assert.strictEqual(coverageDetail.MODELS_WITH_PUBLIC_FACTS_AFTER, 17);
assert.strictEqual(coverageDetail.MODELS_WITH_5PLUS_FACTS_AFTER, 15);

const sampleAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_promotion_sample_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(sampleAudit.SAMPLE_SIZE, 20);

const blockedSample = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_blocked_sample_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(blockedSample.SAMPLE_SIZE, 20);

const precommit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43_precommit_failure_injection.json', import.meta.url), 'utf8'));
assert.ok(Object.entries(precommit)
  .filter(([key]) => key !== 'generated_at' && key !== 'phase_id')
  .every(([, value]) => value === 'PASS'));

console.log('Phase 35C.4.3 SCS machine dossier graph tests passed.');
