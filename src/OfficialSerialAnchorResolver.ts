export interface OfficialSerialAnchor {
  serial_number: string;
  model_name: string;
  canonical_model_id?: string | null;
  category?: string | null;
  drive_type?: string | null;
  source: string;
  verification_status: string;
  verified_at?: string | null;
}

export class OfficialSerialAnchorResolver {
  public static resolve(
    serialInput: string | number,
    database?: any,
    options?: any
  ): OfficialSerialAnchor | null {
    if (!serialInput) return null;
    const serialStr = String(serialInput).trim();
    if (!/^\d{8,10}$/.test(serialStr)) return null;

    if (database && Array.isArray(database.official_serial_anchors)) {
      const match = database.official_serial_anchors.find((a: any) => a.serial_number === serialStr);
      if (match) return match;
    }

    if (options && Array.isArray(options.officialAnchors)) {
      const match = options.officialAnchors.find((a: any) => a.serial_number === serialStr);
      if (match) return match;
    }

    return null;
  }
}
