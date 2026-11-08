import { PartNormalizer } from '../parts/PartNormalizer.js';
import { isValidAsin, ALLOWED_AMAZON_MARKETPLACES, isProductionVerifiedAmazonOffer } from './AmazonProductionOfferContract.js';
import { TwoGateVerifier } from './TwoGateVerifier.js';
import { checkHistoricalMismatch } from './HistoricalMismatches.js';
import { validateGtin } from './GtinValidator.js';

export const CANDIDATE_STATUSES = Object.freeze({
  VERIFIED: 'VERIFIED',
  STAGED: 'STAGED',
  REJECTED: 'REJECTED',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

const value = input => typeof input === 'string' ? input.trim().toUpperCase() : '';
const part = input => typeof input === 'string' ? PartNormalizer.normalizePartNumber(input) : null;
const gtin = input => input?.ean_gtin ?? input?.gtin ?? input?.ean;
const mpn = input => input?.manufacturer_part_number ?? input?.mpn ?? input?.manufacturer_part;
const title = input => input?.product_title ?? input?.matched_title ?? input?.product ?? input?.title ?? '';
const classification = input => input?.oem_brand_classification ?? input?.product_type;
const kind = input => {
  const label = value(classification(input));
  if (label === 'OEM' || label === 'GENUINE_STIHL' || label === 'OEM_SUPPLIER_EQUIVALENT') return 'OEM';
  if (label === 'AFTERMARKET' || label === 'MANUFACTURER_AFTERMARKET' || label === 'UNVERIFIED_AFTERMARKET') return 'AFTERMARKET';
  return '';
};

export class AmazonCandidateMatcher {
  static matchCandidate(registered, observation, context = {}) {
    const conflicts = [];
    const missing = [];
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      return { status: CANDIDATE_STATUSES.INSUFFICIENT_EVIDENCE, reasons: ['Missing catalog observation'] };
    }
    if (observation.error || observation.temporary_error) {
      return { status: CANDIDATE_STATUSES.INSUFFICIENT_EVIDENCE, reasons: ['Catalog observation unavailable'] };
    }
    const observedPart = part(observation.part_number);
    if (!observedPart || observedPart.length !== 11) conflicts.push('Invalid observed part number');
    if (!isValidAsin(observation.asin)) missing.push('Valid observed ASIN required');
    const observedMarket = typeof observation.marketplace === 'string' ? observation.marketplace.trim().toLowerCase() : '';
    if (!ALLOWED_AMAZON_MARKETPLACES.has(observedMarket)) missing.push('Supported observed marketplace required');
    const observedGtin = gtin(observation);
    const checkedGtin = observedGtin == null || observedGtin === '' ? null : validateGtin(observedGtin);
    if (checkedGtin && !checkedGtin.valid) conflicts.push('Invalid observed GTIN');
    const historical = checkHistoricalMismatch(observedPart, observation.asin, `${title(observation)} ${value(mpn(observation))}`, checkedGtin?.normalized || '');
    if (historical.isMismatch) conflicts.push(`Historical mismatch: ${historical.record.id}`);
    if (registered && typeof registered === 'object' && !Array.isArray(registered)) {
      if (observedPart && part(registered.part_number) !== observedPart) conflicts.push('Part number mismatch');
      if (isValidAsin(observation.asin) && value(registered.asin) !== value(observation.asin)) conflicts.push('ASIN mismatch');
      if (observedMarket && value(registered.marketplace) !== value(observedMarket)) conflicts.push('Marketplace mismatch');
      for (const [label, left, right] of [
        ['Manufacturer', registered.manufacturer, observation.manufacturer],
        ['Brand', registered.brand, observation.brand],
        ['MPN', mpn(registered), mpn(observation)],
        ['Product model', registered.trade_number, observation.trade_number],
        ['Variant', registered.variant, observation.variant],
        ['OEM/aftermarket', kind(registered), kind(observation)]
      ]) {
        if (value(left) && value(right) && value(left) !== value(right)) conflicts.push(`${label} mismatch`);
        else if (value(left) && !value(right)) missing.push(`Observed ${label.toLowerCase()} required`);
      }
      if (registered.package_quantity != null) {
        const expected = Number(registered.package_quantity);
        const actual = Number(observation.package_quantity);
        if (!Number.isInteger(expected) || expected < 1 || (observation.package_quantity != null && (!Number.isInteger(actual) || actual < 1 || actual !== expected))) conflicts.push('Package quantity mismatch');
        else if (observation.package_quantity == null) missing.push('Observed package quantity required');
      }
      if (gtin(registered) != null && gtin(registered) !== '') {
        const known = validateGtin(gtin(registered));
        if (!known.valid) conflicts.push('Invalid registered GTIN');
        else if (checkedGtin?.valid && known.normalized !== checkedGtin.normalized) conflicts.push('GTIN mismatch');
        else if (!checkedGtin) missing.push('Observed GTIN required');
      }
      if (registered.specifications && typeof registered.specifications === 'object') {
        for (const [key, expected] of Object.entries(registered.specifications)) {
          const actual = observation.specifications?.[key];
          if (actual == null) missing.push(`Observed specification ${key} required`);
          else if (value(String(expected)) !== value(String(actual))) conflicts.push(`Specification ${key} mismatch`);
        }
      }
    } else missing.push('Registered product identity corroboration required');
    if (conflicts.length) return { status: CANDIDATE_STATUSES.REJECTED, reasons: conflicts };
    if (missing.length) return { status: CANDIDATE_STATUSES.INSUFFICIENT_EVIDENCE, reasons: missing };
    const verified = registered.status === 'VERIFIED' || registered.status === 'ACTIVE' || registered.verification_status === 'VERIFIED_EXACT_MATCH';
    if (verified && TwoGateVerifier.verifyOffer(registered, context).passed && (registered.status === 'VERIFIED' || registered.status === 'ACTIVE' || isProductionVerifiedAmazonOffer(registered))) {
      return { status: CANDIDATE_STATUSES.VERIFIED, reasons: [] };
    }
    return { status: CANDIDATE_STATUSES.STAGED, reasons: ['Independent ASIN corroboration and two-gate verification required'] };
  }

  static matchCandidates(registeredCandidates, observations, context = {}) {
    if (!Array.isArray(registeredCandidates) || !Array.isArray(observations)) throw new TypeError('Candidates and observations must be arrays');
    return observations.map(observation => {
      const matches = registeredCandidates.filter(candidate => part(candidate?.part_number) === part(observation?.part_number));
      const registered = matches.find(candidate => value(candidate.asin) === value(observation?.asin) && value(candidate.marketplace) === value(observation?.marketplace)) ?? matches[0];
      return { observation, registered: registered ?? null, ...this.matchCandidate(registered, observation, context) };
    });
  }
}
