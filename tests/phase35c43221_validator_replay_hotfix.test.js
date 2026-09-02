import assert from 'assert';
import { main } from '../scripts/phase35c43221_validator_replay_hotfix.js';

const report = await main({ mode: 'replay', writeArtifacts: false });
assert.strictEqual(report.FINAL_STATUS, 'PASS');
assert.strictEqual(report.PHASE4322_POST_COMMIT_REPLAY, 'PASS');
assert.strictEqual(report.PUBLIC_EVIDENCE_BOUND_TO_RUNTIME_DATABASE, 'PASS');
assert.strictEqual(report.FS350_SCOPE_RUNTIME, 'PASS');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO');
console.log('Phase 35C.4.3.2.2.1 validator replay hotfix tests passed.');
