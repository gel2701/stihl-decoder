/**
 * SalesPassportPageTemplate.js
 * 
 * Re-exports the unified passport template functions from UniversalPassportPageTemplate.js.
 * Ensures backward-compatibility while guaranteeing that 100% of passports
 * share the exact same template and architecture.
 */

export {
  checkSalesPhotosReachability,
  generateSalesAdvertText,
  renderUniversalPassportPageHtml as renderSalesPassportPageHtml,
  renderUniversalPassportPageHtml
} from './UniversalPassportPageTemplate.js';
