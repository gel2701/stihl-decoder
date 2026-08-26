/**
 * Stihl Machine Passport Tiering Manager for STIHLDecoder.nl
 * Phase 28 Premium Readiness Architecture
 */

export const PASSPORT_TIERS = {
  FREE: {
    id: 'free',
    name: 'Gratis Serienummer Rapport',
    price: 0,
    features: [
      'Serienummer Fabrieksmatch',
      'Geschatte Productieperiode',
      'StopHeling Basischeck',
      'Downloadbare Paspoort Afbeelding (PNG)'
    ]
  },
  PREMIUM: {
    id: 'premium',
    name: 'Gecertificeerd Machinepaspoort Pro',
    price: 4.99,
    currency: 'EUR',
    features: [
      'Alles uit Gratis',
      'QR-Code met Live Verificatie URL op stihldecoder.nl',
      'Eigenaar Overdracht & Verkoop Historie',
      'Onderhoudshistorie & Reparatie Logboek',
      'High-Res PDF Export met Officiële Stempel',
      'Marktplaats Direct Deelbare Link'
    ]
  }
};

export function getPassportTierDetails(tierId = 'free') {
  return PASSPORT_TIERS[tierId.toUpperCase()] || PASSPORT_TIERS.FREE;
}
