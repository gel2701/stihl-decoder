import { execFileSync } from 'child_process';

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/i;

export function resolveImmutableReferenceCommit({
  cwd,
  env = process.env,
  variableName = 'REFERENCE_COMMIT'
} = {}) {
  const candidate = String(env[variableName] || '').trim();
  if (!FULL_COMMIT_SHA.test(candidate)) {
    throw new Error(`${variableName} must be an explicit 40-character commit SHA`);
  }

  try {
    execFileSync('git', ['cat-file', '-e', `${candidate}^{commit}`], {
      cwd,
      stdio: 'ignore'
    });
  } catch {
    throw new Error(`${variableName} does not identify a locally available commit object`);
  }

  const resolved = execFileSync('git', ['rev-parse', `${candidate}^{commit}`], {
    cwd,
    encoding: 'utf8'
  }).trim();

  if (resolved.toLowerCase() !== candidate.toLowerCase()) {
    throw new Error(`${variableName} did not resolve to the supplied immutable commit SHA`);
  }

  return resolved;
}
