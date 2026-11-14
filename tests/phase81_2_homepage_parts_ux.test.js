import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

console.log('🧪 Running Phase 81.2 Homepage Direct Parts UX Contract Tests...');

// 1. Immediate loading state exists inside #results-container
assert(
  html.includes('id="decode-loading-state"') && html.includes('role="status"') && html.includes('aria-live="polite"'),
  'Expected #decode-loading-state with role="status" and aria-live="polite"'
);

// 2. Direct parts section in #model-card appears BEFORE technical specs (#model-specs-details)
const modelCardStart = html.indexOf('id="model-card"');
const directPartsIdx = html.indexOf('id="model-direct-parts-section"', modelCardStart);
const specsDetailsIdx = html.indexOf('id="model-specs-details"', modelCardStart);
assert(modelCardStart !== -1, 'Expected #model-card in index.html');
assert(directPartsIdx !== -1, 'Expected #model-direct-parts-section inside #model-card');
assert(specsDetailsIdx !== -1, 'Expected collapsible #model-specs-details inside #model-card');
assert(
  directPartsIdx < specsDetailsIdx,
  'Expected #model-direct-parts-section to appear BEFORE #model-specs-details in #model-card'
);

// 3. Heading & CTA requirements
assert(
  html.includes('id="model-direct-parts-heading"') &&
  html.includes('Onderdelen voor STIHL <span id="model-direct-parts-title-model"'),
  'Expected heading "Onderdelen voor STIHL [MODEL]" with id="model-direct-parts-heading"'
);
assert(
  html.includes('id="model-direct-parts-all-btn"') &&
  html.includes('Bekijk alle onderdelen voor <span id="model-direct-parts-btn-model">'),
  'Expected prominent "Bekijk alle onderdelen voor [MODEL]" button'
);

// 4. Collapsible technical specifications <details id="model-specs-details">
assert(
  html.includes('<details id="model-specs-details"') &&
  html.includes('Specificaties &amp; Afstelwaarden') &&
  html.includes('id="model-specs-count-badge"'),
  'Expected collapsible <details id="model-specs-details"> with count badge'
);

// 5. No duplicate direct parts sections for model-card
const directPartsOccurrences = (html.match(/id="model-direct-parts-section"/g) || []).length;
assert.strictEqual(directPartsOccurrences, 1, 'Expected exactly one #model-direct-parts-section (no duplicate parts rendering)');

// 6. Focus & smooth scroll management with sticky header offset and stale-request guard
assert(
  html.includes('function focusAndScrollToResult(scrollEl, focusEl)') &&
  html.includes('activeDecodeRequestId') &&
  html.includes("focus({ preventScroll: true })"),
  'Expected focusAndScrollToResult helper, activeDecodeRequestId guard, and accessible focus management'
);

// 7. Purchase links clearly distinguish direct offers vs Amazon search queries
assert(
  html.includes('Directe aankoop via') &&
  html.includes('Alleen zoekopdracht op Amazon') &&
  html.includes('(zoekopdracht)'),
  'Expected clear distinction between direct verified offers and Amazon search queries'
);

console.log('✅ All Phase 81.2 Homepage Direct Parts UX Contract Tests Passed!');
