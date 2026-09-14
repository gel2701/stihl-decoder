import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPassportHubHtml } from '../src/components/IntentPageTemplate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const intent = {
  slug: 'stihl-paspoort',
  title: 'STIHL Digitaal Machine Paspoort Maken',
  description: 'Beheer uw STIHL-machinegegevens lokaal.'
};

const html = renderPassportHubHtml({
  intent,
  database,
  baseUrl: 'https://www.stihldecoder.nl',
  seoMetaHtml: '',
  breadcrumbsHtml: ''
});

assert.equal((html.match(/Privacy-first opslag:/g) || []).length, 1, 'Passport must render one privacy card');
assert.equal((html.match(/id="modal-add" class="hidden/g) || []).length, 1, 'Add modal must start hidden');
assert.equal((html.match(/id="modal-detail" class="hidden/g) || []).length, 1, 'Detail modal must start hidden');
assert.equal((html.match(/id="modal-complete-rem" class="hidden/g) || []).length, 1, 'Reminder modal must start hidden');

console.log('Passport CSS/UX hotfix assertions passed.');
