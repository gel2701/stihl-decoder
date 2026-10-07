import crypto from 'node:crypto';
import { PartNormalizer, FITMENT_SCOPES } from '../PartNormalizer.js';

export class SparePartsWorldSource {
  constructor(httpClient) {
    this.sourceId = 'sparepartsworld';
    this.sourceName = 'Spare Parts World UK';
    this.sourceType = 'STRUCTURED_EXPLODED_DIAGRAM_CATALOGUE';
    this.authorityLevel = 'STRUCTURED_AFTERMARKET_DEALER';
    this.httpClient = httpClient;
    this.baseUrl = 'https://www.sparepartsworld.co.uk';

    // Model URL registry for known validated STIHL catalog pages
    this.modelUrls = {
      'MS 261': 'https://www.sparepartsworld.co.uk/Stihl-MS-261-Gasoline-Chainsaw-Spare-Parts/P782612',
      'MS 170': 'https://www.sparepartsworld.co.uk/Stihl-MS-170-Chainsaw-Spare-Parts/P782607',
      'MS 180': 'https://www.sparepartsworld.co.uk/Stihl-MS-180-Chainsaw-Spare-Parts/P782608',
      '026': 'https://www.sparepartsworld.co.uk/Stihl-026-Chainsaw-Spare-Parts/P782600',
      'FS 55': 'https://www.sparepartsworld.co.uk/Stihl-FS-55-Brushcutter-Spare-Parts/P782700',
      'TS 420': 'https://www.sparepartsworld.co.uk/Stihl-TS-420-Cut-Off-Saw-Spare-Parts/P782800'
    };
  }

  async checkRobotsPolicy() {
    const robotsUrl = `${this.baseUrl}/robots.txt`;
    const res = await this.httpClient.get(robotsUrl, { purpose: 'robots_policy_preflight' });
    const isAllowed = res.status === 200 && !res.body.includes('Disallow: /Stihl-');
    return {
      source_id: this.sourceId,
      robots_url: robotsUrl,
      http_status: res.status,
      allowed: isAllowed,
      decision: isAllowed ? 'PERMITTED' : 'DISALLOWED',
      status: res.status,
      url: robotsUrl,
      sha256: res.bodySha256 || res.sha256,
      notes: isAllowed ? 'Robots policy permits product and spare parts crawling' : 'Disallowed',
      reason: isAllowed ? 'Robots policy permits product and spare parts crawling' : 'Disallowed'
    };
  }

  async discoverModel(modelQuery) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const targetUrl = this.modelUrls[cleanQuery];

    if (!targetUrl) {
      return {
        found: false,
        model: modelQuery,
        url: null,
        status: 404,
        error: `Model ${modelQuery} not found in validated Spare Parts World registry`
      };
    }

    const res = await this.httpClient.get(targetUrl, { purpose: `model_discovery_${cleanQuery}` });
    if (res.status !== 200 || !res.body || res.body.length < 500) {
      return {
        found: false,
        model: cleanQuery,
        url: targetUrl,
        status: res.status,
        error: `HTTP ${res.status} returned for model ${cleanQuery}`
      };
    }

    return {
      found: true,
      model: cleanQuery,
      url: targetUrl,
      status: res.status,
      sha256: res.bodySha256 || res.sha256,
      rawHtml: res.body
    };
  }

  discoverVariants(modelQuery, rawHtml) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    // Parse variants from model page title / description if present
    const variants = [{
      variant_code: cleanQuery.toLowerCase().replace(/[\s-]+/g, '_'),
      variant_name: `STIHL ${cleanQuery}`,
      base_model: cleanQuery
    }];

    if (rawHtml) {
      if (rawHtml.includes('C-M') || rawHtml.includes('C-BE')) {
        if (cleanQuery === 'MS 261') {
          variants.push({
            variant_code: 'ms_261_c_m',
            variant_name: 'STIHL MS 261 C-M',
            base_model: 'MS 261'
          });
        }
      }
    }

    return variants;
  }

  discoverSections(rawHtml, modelQuery) {
    const sections = [];
    if (!rawHtml) return sections;

    // Extract diagram pills: <div class='diagpill' onclick="...roll('...-DiagramName.jpg')">Diagram N</div>
    const pillRegex = /<div\s+class=['"]diagpill['"][^>]*onclick=["'][^"']*roll\([^,]+,\s*'images_spares\/[^'-]+-([^'.]+)[^']*'\)[^>]*>\s*(Diagram\s+\d+)\s*<\/div>/gi;
    const seenSections = new Set();

    for (const m of rawHtml.matchAll(pillRegex)) {
      const diagNum = m[2].trim();
      const rawName = m[1].replace(/_/g, ' ').trim();
      const sectionKey = PartNormalizer.normalizeSectionKey(rawName || diagNum);

      if (!seenSections.has(sectionKey)) {
        seenSections.add(sectionKey);
        sections.push({
          section_key: sectionKey,
          section_name: rawName || diagNum,
          diagram_index: diagNum,
          model: modelQuery
        });
      }
    }

    // If no pills found, fallback to generic assembly section
    if (sections.length === 0) {
      sections.push({
        section_key: 'general_assembly',
        section_name: 'General Assembly',
        diagram_index: 'Diagram 1',
        model: modelQuery
      });
    }

    return sections;
  }

  parsePartsFromHtml(rawHtml, modelQuery, sourceUrl) {
    const parts = [];
    if (!rawHtml) return parts;

    // Pattern: <div class='spareref'>REF</div> ... <a ... class='sparetitle'>TITLE</a> ... <span class='sparesncode'>CODE</span>
    const itemRegex = /<div\s+class=['"]spareref['"]>([^<]*)<\/div>[\s\S]*?<div\s+class=['"]sparetitle['"]>[\s\S]*?<a[^>]*class=['"]sparetitle['"][^>]*>([^<]*)<\/a>[\s\S]*?<span\s+class=['"]sparesncode['"]>([^<]*)<\/span>/gi;

    const sections = this.discoverSections(rawHtml, modelQuery);
    const defaultSection = sections[0] || { section_key: 'general_assembly', section_name: 'General Assembly' };

    for (const match of rawHtml.matchAll(itemRegex)) {
      const rawPos = match[1].trim();
      const rawTitle = match[2].trim();
      const rawCode = match[3].trim();

      const normalizedPartNo = PartNormalizer.normalizePartNumber(rawCode);
      if (normalizedPartNo) {
        // Determine section context if title mentions specific section
        let section = defaultSection;
        for (const s of sections) {
          if (s.section_name && s.section_name !== 'General Assembly' && rawTitle.toLowerCase().includes(s.section_name.toLowerCase())) {
            section = s;
            break;
          }
        }

        parts.push({
          part_number: normalizedPartNo,
          part_number_display: PartNormalizer.formatPartNumber(normalizedPartNo),
          part_name_raw: rawTitle,
          part_name_normalized: PartNormalizer.normalizePartName(rawTitle.replace(/^Stihl\s+/i, '').replace(/\b\d{11}\b/g, '').trim()),
          diagram_position: rawPos || 'POS_UNSPECIFIED',
          quantity: 1,
          section_key: section.section_key,
          section_name: section.section_name,
          source_id: this.sourceId,
          source_url: sourceUrl,
          source_evidence_status: 'SINGLE_STRUCTURED_SOURCE',
          fitment_scope: FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
          model: modelQuery
        });
      }
    }

    return parts;
  }
}
