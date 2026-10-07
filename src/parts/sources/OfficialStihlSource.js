import { PartNormalizer } from '../PartNormalizer.js';

export class OfficialStihlSource {
  constructor(options = {}) {
    this.sourceId = 'official_stihl';
    this.sourceName = 'Official STIHL Service Documentation';
    this.sourceType = 'OFFICIAL_MANUFACTURER_DOCUMENTATION';
    this.authorityLevel = 'OFFICIAL_STIHL';
  }

  /**
   * Official known Service Kit & Cut Kit parts catalog for key models
   */
  getOfficialServiceKits(modelName) {
    const kits = {
      'MS 261': [
        { part_number: '11410071800', part_name: 'Service Kit 14 (Air Filter, Spark Plug, Fuel Filter)', section_name: 'Service Kits' },
        { part_number: '11411201600', part_name: 'HD2 Air filter', section_name: 'Air Filter' },
        { part_number: '00004007000', part_name: 'Spark plug NGK CMR6H', section_name: 'Ignition System' },
        { part_number: '00003503504', part_name: 'Fuel pickup body', section_name: 'Fuel System' }
      ],
      'MS 170': [
        { part_number: '11300071800', part_name: 'Service Kit 7 (Air Filter, Spark Plug, Fuel Filter)', section_name: 'Service Kits' },
        { part_number: '11301240800', part_name: 'Air filter fleece', section_name: 'Air Filter' },
        { part_number: '00004007000', part_name: 'Spark plug Bosch WSR6F', section_name: 'Ignition System' }
      ],
      'MS 180': [
        { part_number: '11300071800', part_name: 'Service Kit 7 (Air Filter, Spark Plug, Fuel Filter)', section_name: 'Service Kits' },
        { part_number: '11301240800', part_name: 'Air filter fleece', section_name: 'Air Filter' },
        { part_number: '00004007000', part_name: 'Spark plug Bosch WSR6F', section_name: 'Ignition System' }
      ],
      '026': [
        { part_number: '11211201612', part_name: 'Air filter fleece', section_name: 'Air Filter' },
        { part_number: '11210201200', part_name: 'Cylinder with piston 44mm', section_name: 'Cylinder' },
        { part_number: '00004007000', part_name: 'Spark plug Bosch WSR6F', section_name: 'Ignition System' }
      ],
      'FS 55': [
        { part_number: '41400071800', part_name: 'Service Kit 41 (Air Filter, Spark Plug, Fuel Filter)', section_name: 'Service Kits' },
        { part_number: '41401242800', part_name: 'Air filter felt', section_name: 'Air Filter' },
        { part_number: '00004007000', part_name: 'Spark plug NGK CMR6H', section_name: 'Ignition System' }
      ],
      'TS 420': [
        { part_number: '42380071800', part_name: 'Service Kit 31 (Air Filter, Spark Plug, Fuel Filter)', section_name: 'Service Kits' },
        { part_number: '42381401800', part_name: 'Main air filter', section_name: 'Air Filter' },
        { part_number: '42381404401', part_name: 'Auxiliary air filter', section_name: 'Air Filter' },
        { part_number: '00004007000', part_name: 'Spark plug Bosch WSR6F', section_name: 'Ignition System' }
      ]
    };

    const cleanModel = modelName.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    return kits[cleanModel] || [];
  }

  async getOfficialPartsForModel(modelName) {
    const rawKits = this.getOfficialServiceKits(modelName);
    const parts = [];

    for (const item of rawKits) {
      const canonicalPartNo = PartNormalizer.normalizePartNumber(item.part_number);
      if (canonicalPartNo) {
        parts.push({
          part_number: canonicalPartNo,
          part_number_display: PartNormalizer.formatPartNumber(canonicalPartNo),
          part_name_raw: item.part_name,
          part_name_normalized: PartNormalizer.normalizePartName(item.part_name),
          diagram_position: 'OFFICIAL_REF',
          quantity: 1,
          notes: 'Official STIHL Service Documentation',
          section_key: item.section_name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          section_name: item.section_name,
          source_id: this.sourceId,
          source_url: 'https://www.stihl.com/service-kits-official',
          source_evidence_status: 'OFFICIAL_STIHL'
        });
      }
    }

    return parts;
  }
}
