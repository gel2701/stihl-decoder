import { readFileSync } from 'node:fs';

const index = JSON.parse(readFileSync(new URL('../data/model_identity_index.json', import.meta.url), 'utf8'));

const identities = new Map();
for (const entry of index) {
  if (entry.evidence_status !== 'EXACT_MODEL' ||
      typeof entry.source_document_ref !== 'string' || !entry.source_document_ref.trim() ||
      typeof entry.model_name !== 'string' || !entry.model_name.trim()) continue;

  for (const name of [entry.model_name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]) {
    if (typeof name === 'string' && name.trim()) identities.set(name.trim().toUpperCase(), entry);
  }
}

export function findModelIdentity(query) {
  if (typeof query !== 'string') return null;
  const match = identities.get(query.trim().toUpperCase());
  return match ? { ...match, aliases: [...match.aliases] } : null;
}
