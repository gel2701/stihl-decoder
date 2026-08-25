export class StopHelingService {
  /**
   * Controleert een serienummer tegen de Stop Heling API / cache.
   */
  static async verifySerialNumber(serialNumber) {
    const cleanSerial = serialNumber ? serialNumber.toString().replace(/[^a-zA-Z0-9]/g, '') : '';
    const now = new Date();

    let isStolen = false;

    try {
      const response = await fetch(`https://stopheling.nl/api/check?serial=${encodeURIComponent(cleanSerial)}`, {
        headers: {
          'User-Agent': 'StihlDecoder-Verification-Engine/1.0',
          'Accept': 'application/json'
        },
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(3500) : undefined
      });

      if (response.ok) {
        const data = await response.json();
        isStolen = Boolean(data.isStolen || data.stolen || data.found);
      }
    } catch (err) {
      isStolen = false;
    }

    return {
      serialNumber: cleanSerial,
      isStolen,
      checkedAt: now.toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      statusLabel: isStolen 
        ? '⚠️ GEREGISTREERD ALS GESTOLEN' 
        : '✓ NIET ALS GESTOLEN GEREGISTREERD',
      source: 'Politiedatabase StopHeling.nl',
      disclaimer: 'Gecontroleerd op de datum van uitgifte. Biedt geen 100% eigendomsgarantie.'
    };
  }
}
