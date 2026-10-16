import { PartNormalizer, FITMENT_SCOPES } from '../PartNormalizer.js';

export class DiySparePartsSource {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.baseUrl = options.baseUrl || 'https://www.diyspareparts.com';
    this.sourceId = 'diyspareparts';
    this.sourceName = 'DIY Spare Parts';
    this.sourceType = 'PARTS_DIAGRAM_CATALOG';
    this.authorityLevel = 'STRUCTURED_PARTS_CATALOG';
  }

  /**
   * Checks robots.txt and documents policy decisions
   */
  async checkRobotsPolicy() {
    const robotsUrl = `${this.baseUrl}/robots.txt`;
    const res = await this.http.get(robotsUrl);
    return {
      source_id: this.sourceId,
      robots_url: robotsUrl,
      http_status: res.status,
      content_type: res.contentType,
      target_path: '/parts/stihl/diagrams/*',
      decision: res.status === 200 ? 'ALLOWED_CONDITIONAL' : (res.status === 404 ? 'NO_ROBOTS_TXT' : 'AUTOMATION_PROHIBITED'),
      notes: res.status === 404 ? 'robots.txt returned 404; standard web crawling conventions apply.' : (res.status === 403 ? 'Cloudflare WAF bot challenge active on automated requests.' : `HTTP ${res.status}`)
    };
  }

  /**
   * Slugifies a model name for DIY Spare Parts URLs (e.g. "MS 261" -> "ms261", "026" -> "026", "FS 55" -> "fs-55")
   */
  getModelSlug(modelName) {
    if (!modelName || typeof modelName !== 'string') return '';
    const clean = modelName.trim().toUpperCase().replace(/^STIHL\s+/i, '');

    // Known exact overrides
    const knownSlugs = {
      'FS 55': 'fs-55',
      'FS 85': 'fs-85',
      'FS 80': 'fs-80',
      'FS 38': 'fs-38',
      'FS 120': 'fs-120',
      'FS 200': 'fs-200',
      'FS 250': 'fs-250',
      'FS 350': 'fs-350',
      'FS 400': 'fs-400',
      'FS 450': 'fs-450',
      'BG 86': 'bg-86',
      'BG 56': 'bg-56',
      'SH 56': 'sh-56',
      'SH 86': 'sh-86',
      'BR 600': 'br-600',
      'BR 550': 'br-550',
      'HS 81': 'hs-81',
      'HS 45': 'hs-45',
      'HS 86': 'hs-86',
      'HS 82': 'hs-82',
      'TS 410': 'ts410',
      'TS 400': 'ts400',
      'TS 350': 'ts350',
      'TS 420': 'ts420'
    };

    if (knownSlugs[clean]) return knownSlugs[clean];

    // Check if prefix like FS, BG, BR, HS, HL, HT followed by number
    const prefixMatch = clean.match(/^([A-Z]+)\s*(\d+.*)$/i);
    if (prefixMatch) {
      const prefix = prefixMatch[1].toLowerCase();
      const rest = prefixMatch[2].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (prefix === 'ms' || prefix === 'ts') {
        return `${prefix}${rest}`;
      }
      return `${prefix}-${rest}`;
    }

    return clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Discovers model page and available variants
   */
  async discoverModel(modelQuery) {
    const slug = this.getModelSlug(modelQuery);
    const modelUrl = `${this.baseUrl}/parts/stihl/diagrams/${slug}/`;
    const res = await this.http.get(modelUrl);

    if (res.status !== 200 || !res.body) {
      return {
        found: false,
        modelQuery,
        url: modelUrl,
        http_status: res.status,
        content_type: res.contentType,
        response_sha256: res.bodySha256,
        variants: [],
        sections: [],
        error: res.error || `HTTP ${res.status}`
      };
    }

    const { variants, sections } = this.parseModelPage(res.body, modelUrl, modelQuery);

    return {
      found: true,
      sourceId: this.sourceId,
      modelQuery,
      sourceModelName: modelQuery,
      sourceModelSlug: slug,
      url: modelUrl,
      http_status: res.status,
      content_type: res.contentType,
      response_sha256: res.bodySha256,
      variants,
      sections
    };
  }

  /**
   * Parses the model page HTML to extract diagram sections and variant links
   */
  parseModelPage(html, pageUrl, modelQuery) {
    const sections = [];
    const variants = [];

    // Extract variants if present (links with 1 path segment after /parts/stihl/diagrams/)
    const variantRegex = /<a\s+[^>]*href=["'](\/parts\/stihl\/diagrams\/([^\/"']+)\/?)["'][^>]*>([^<]+)<\/a>/gi;
    let vMatch;
    const seenVariants = new Set();
    while ((vMatch = variantRegex.exec(html)) !== null) {
      const vPath = vMatch[1];
      const vUrl = vPath.startsWith('http') ? vPath : `${this.baseUrl}${vPath.endsWith('/') ? vPath : vPath + '/'}`;
      const vName = vMatch[3].trim();
      if (!seenVariants.has(vUrl) && vName && !vName.toLowerCase().includes('back') && !vName.toLowerCase().includes('home') && !vName.toLowerCase().includes('diagrams')) {
        seenVariants.add(vUrl);
        variants.push({
          variantName: vName,
          variantUrl: vUrl,
          variantKey: vName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        });
      }
    }

    // Extract diagram sections (links with 2 path segments after /parts/stihl/diagrams/)
    const sectionRegex = /<a\s+[^>]*href=["'](\/parts\/stihl\/diagrams\/[^\/"']+\/([^\/"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let sMatch;
    const seenSections = new Set();
    while ((sMatch = sectionRegex.exec(html)) !== null) {
      const sPath = sMatch[1];
      const sName = sMatch[3]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&#xA3;/g, '£')
        .replace(/&nbsp;/g, ' ')
        .trim();
      const fullUrl = sPath.startsWith('http') ? sPath : `${this.baseUrl}${sPath.endsWith('/') ? sPath : sPath + '/'}`;

      if (!seenSections.has(fullUrl) && sName && sName.length > 2 && !sName.toLowerCase().includes('diagrams') && !sName.toLowerCase().includes('back')) {
        seenSections.add(fullUrl);
        const sKey = PartNormalizer.normalizeSectionKey(sName);
        sections.push({
          sectionKey: sKey,
          sectionName: sName,
          sectionUrl: fullUrl
        });
      }
    }

    return { variants, sections };
  }

  /**
   * Extracts parts from a section diagram HTML page
   */
  parseSectionPage(html, sectionMeta) {
    const parts = [];
    const rejected = [];
    const seenParts = new Set();

    // Match rows in parts table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      if (rowHtml.toLowerCase().includes('<th')) continue; // Skip header row

      // Try extracting from button attributes first
      const btnMatch = rowHtml.match(/data-partnumber=["']([^"']+)["']/i);
      const nameMatch = rowHtml.match(/data-partname=["']([^"']+)["']/i);

      let rawPartNo = btnMatch ? btnMatch[1].trim() : '';
      let rawName = nameMatch ? nameMatch[1].trim() : '';

      // If not in button, extract from cells
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#xA3;/g, '£').replace(/&nbsp;/g, ' ').trim());
      }

      if (!rawPartNo && cells.length >= 1) {
        // Cell 0 is usually the unspaced part number: "11410071000"
        const cleanCell0 = cells[0].replace(/[\s\-_.]/g, '');
        if (/^\d{11}$/.test(cleanCell0)) {
          rawPartNo = cells[0];
        } else if (cells.length >= 2) {
          rawPartNo = cells[1];
        }
      }

      if (!rawName && cells.length >= 2) {
        // Link text inside cell 1 or cell 1 text without part number
        const linkMatch = rowHtml.match(/<a\s+class=["'][^"']*text-link[^"']*["'][^>]*>([^<]+)<\/a>/i);
        if (linkMatch) {
          rawName = linkMatch[1].trim();
        } else if (/^\d{11}$/.test(cells[0].replace(/[\s\-_.]/g, ''))) {
          rawName = cells[1].replace(/\b\d{4}\s*\d{3}\s*\d{4}\b/, '').replace(/^Stihl\s+/i, '').trim();
        } else if (cells.length >= 3) {
          rawName = cells[2].replace(/\b\d{4}\s*\d{3}\s*\d{4}\b/, '').replace(/^Stihl\s+/i, '').trim();
        } else {
          rawName = cells[1].trim();
        }
      }

      // Clean rawName (strip leading "Stihl ")
      const cleanName = rawName.replace(/^Stihl\s+/i, '').trim();

      const canonicalPartNo = PartNormalizer.normalizePartNumber(rawPartNo);
      if (canonicalPartNo) {
        if (!seenParts.has(canonicalPartNo)) {
          seenParts.add(canonicalPartNo);
          parts.push({
            part_number: canonicalPartNo,
            part_number_display: PartNormalizer.formatPartNumber(canonicalPartNo),
            part_name_raw: cleanName || rawName,
            part_name_normalized: PartNormalizer.normalizePartName(cleanName || rawName),
            diagram_position: null,
            diagram_position_raw: null,
            section_key: PartNormalizer.normalizeSectionKey(sectionMeta.sectionName),
            section_name: sectionMeta.sectionName,
            section_name_raw: sectionMeta.sectionName,
            source_id: this.sourceId,
            source_url: sectionMeta.sectionUrl,
            source_evidence_status: 'SINGLE_STRUCTURED_PARTS_SOURCE',
            fitment_scope: FITMENT_SCOPES.BASE_MODEL_CONFIRMED
          });
        }
      } else if (rawPartNo && rawPartNo.length > 0) {
        rejected.push({
          raw_part_number: rawPartNo,
          raw_name: rawName,
          reason: 'INVALID_PART_NUMBER_FORMAT',
          section_url: sectionMeta.sectionUrl
        });
      }
    }

    return {
      status: parts.length > 0 ? 'PARSED' : (rejected.length === 0 ? 'EMPTY_VALID' : 'FAILED'),
      parts,
      rejected
    };
  }

  /**
   * Fetches and parses a single section
   */
  async fetchSection(sectionMeta) {
    const res = await this.http.get(sectionMeta.sectionUrl);
    if (res.status !== 200 || !res.body) {
      return {
        status: res.status === 404 ? 'FAILED_404' : 'FAILED_NETWORK',
        error: res.error || `HTTP ${res.status}`,
        http_status: res.status,
        content_type: res.contentType,
        response_sha256: res.bodySha256,
        parts: [],
        rejected: []
      };
    }

    const parsed = this.parseSectionPage(res.body, sectionMeta);
    return {
      ...parsed,
      http_status: res.status,
      content_type: res.contentType,
      response_sha256: res.bodySha256
    };
  }
}
