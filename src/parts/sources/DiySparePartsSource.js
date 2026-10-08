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
   * Slugifies a model name for DIY Spare Parts URLs (e.g. "MS 261" -> "ms261", "026" -> "026", "FS 55" -> "fs55")
   */
  getModelSlug(modelName) {
    return modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
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
      const vUrl = vPath.startsWith('http') ? vPath : `${this.baseUrl}${vPath}`;
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
    const sectionRegex = /<a\s+[^>]*href=["'](\/parts\/stihl\/diagrams\/[^\/"']+\/([^\/"']+)\/?)["'][^>]*>(?:<[^>]+>)*\s*([^<]+)\s*(?:<\/[^>]+>)*<\/a>/gi;
    let sMatch;
    const seenSections = new Set();
    while ((sMatch = sectionRegex.exec(html)) !== null) {
      const sPath = sMatch[1];
      const sKey = PartNormalizer.normalizeSectionKey(sMatch[2]);
      const sName = sMatch[3].trim();
      const fullUrl = sPath.startsWith('http') ? sPath : `${this.baseUrl}${sPath}`;

      if (!seenSections.has(fullUrl) && sKey && sName && sName.length > 2 && !sName.toLowerCase().includes('diagrams')) {
        seenSections.add(fullUrl);
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

    // Match rows in parts table: position, part number, description, quantity, notes
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      if (rowHtml.toLowerCase().includes('<th')) continue; // Skip header row

      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      }

      if (cells.length >= 2) {
        const position = cells[0] || '';
        const rawPartNo = cells[1] || '';
        const rawName = cells[2] || '';
        const quantityStr = cells[3] || '1';
        const notes = cells[4] || '';

        const canonicalPartNo = PartNormalizer.normalizePartNumber(rawPartNo);
        if (canonicalPartNo) {
          // Check for supersession note
          let supersededBy = null;
          const superMatch = (notes || rawName).match(/(?:replaced by|superseded by|use)\s*([0-9\s\-]+)/i);
          if (superMatch) {
            const superNorm = PartNormalizer.normalizePartNumber(superMatch[1]);
            if (superNorm) supersededBy = superNorm;
          }

          parts.push({
            part_number: canonicalPartNo,
            part_number_display: PartNormalizer.formatPartNumber(canonicalPartNo),
            part_name_raw: rawName,
            part_name_normalized: PartNormalizer.normalizePartName(rawName),
            diagram_position: position,
            quantity: parseInt(quantityStr, 10) || 1,
            notes: notes || null,
            superseded_by: supersededBy,
            section_key: PartNormalizer.normalizeSectionKey(sectionMeta.sectionKey),
            section_name: sectionMeta.sectionName,
            source_id: this.sourceId,
            source_url: sectionMeta.sectionUrl,
            source_evidence_status: 'SINGLE_STRUCTURED_PARTS_SOURCE',
            fitment_scope: FITMENT_SCOPES.BASE_MODEL_CONFIRMED
          });
        } else if (rawPartNo.length > 0) {
          rejected.push({
            raw_part_number: rawPartNo,
            raw_name: rawName,
            position,
            reason: 'INVALID_PART_NUMBER_FORMAT',
            section_url: sectionMeta.sectionUrl
          });
        }
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
