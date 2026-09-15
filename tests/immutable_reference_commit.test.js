import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import { resolveImmutableReferenceCommit } from '../scripts/immutable_reference_commit.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referenceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: rootDir,
  encoding: 'utf8'
}).trim();

assert.strictEqual(
  resolveImmutableReferenceCommit({ cwd: rootDir, env: { REFERENCE_COMMIT: referenceCommit } }),
  referenceCommit
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-reference-commit-'));
try {
  execFileSync('git', ['clone', '--quiet', '--local', rootDir, tempDir]);
  assert.ok(execFileSync('git', ['remote'], { cwd: tempDir, encoding: 'utf8' }).includes('origin'));
  assert.strictEqual(
    resolveImmutableReferenceCommit({ cwd: tempDir, env: { REFERENCE_COMMIT: referenceCommit } }),
    referenceCommit
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

assert.throws(
  () => resolveImmutableReferenceCommit({ cwd: rootDir, env: {} }),
  /must be an explicit 40-character commit SHA/
);
assert.throws(
  () => resolveImmutableReferenceCommit({ cwd: rootDir, env: { REFERENCE_COMMIT: 'main' } }),
  /must be an explicit 40-character commit SHA/
);
assert.throws(
  () => resolveImmutableReferenceCommit({ cwd: rootDir, env: { REFERENCE_COMMIT: '0'.repeat(40) } }),
  /does not identify a locally available commit object/
);

console.log('Immutable reference commit tests passed.');
