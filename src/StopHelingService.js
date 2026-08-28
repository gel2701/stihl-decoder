export class StopHelingService {
  /**
   * Controleert een serienummer tegen de Stop Heling API / cache.
   */
  static async verifySerialNumber(serialNumber) {
    const cleanSerial = serialNumber ? serialNumber.toString().replace(/[^a-zA-Z0-9]/g, '') : '';
    const now = new Date();
    const baseResponse = {
      serialNumber: cleanSerial,
      checkedAt: now.toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      source: 'StopHeling handmatige controle',
      disclaimer: 'Alleen een aantoonbaar geldig antwoord telt als geslaagde controle.'
    };

    try {
      const response = await fetch(`https://stopheling.nl/api/check?serial=${encodeURIComponent(cleanSerial)}`, {
        headers: {
          'User-Agent': 'StihlDecoder-Verification-Engine/1.0',
          'Accept': 'application/json'
        },
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(3500) : undefined
      });

      if (!response.ok) {
        return {
          ...baseResponse,
          status: 'UNVERIFIED',
          isStolen: null,
          statusLabel: 'Niet gecontroleerd via StopHeling',
          details: `Controle mislukt met HTTP ${response.status}. Controleer handmatig via stopheling.nl.`
        };
      }

      const data = await response.json();
      const hasRecognizedShape = ['isStolen', 'stolen', 'found'].some((key) => Object.prototype.hasOwnProperty.call(data, key));

      if (!hasRecognizedShape) {
        return {
          ...baseResponse,
          status: 'UNVERIFIED',
          isStolen: null,
          statusLabel: 'Niet gecontroleerd via StopHeling',
          details: 'Onbekend antwoordformaat ontvangen. Controleer handmatig via stopheling.nl.'
        };
      }

      const isStolen = Boolean(data.isStolen || data.stolen || data.found);
      return {
        ...baseResponse,
        status: isStolen ? 'STOLEN' : 'CLEAR',
        isStolen,
        statusLabel: isStolen
          ? 'Geregistreerd als gestolen'
          : 'Geen gestolen registratie aangetroffen'
      };
    } catch (err) {
      return {
        ...baseResponse,
        status: 'UNVERIFIED',
        isStolen: null,
        statusLabel: 'Niet gecontroleerd via StopHeling',
        details: 'Controle technisch mislukt. Controleer handmatig via stopheling.nl.'
      };
    }
  }
}
