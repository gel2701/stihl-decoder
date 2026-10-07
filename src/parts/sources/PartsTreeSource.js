import { PartNormalizer } from '../PartNormalizer.js';

export class PartsTreeSource {
  constructor(httpClient, options = {}) {
    this.http = httpClient;
    this.baseUrl = options.baseUrl || 'https://www.partstree.com';
    this.sourceId = 'partstree';
    this.sourceName = 'PartsTree';
    this.sourceType = 'PARTS_DIAGRAM_CATALOG';
    this.authorityLevel = 'STRUCTURED_PARTS_CATALOG';
  }

  getModelSlug(modelName) {
    return modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  async discoverModel(modelQuery) {
    const slug = this.getModelSlug(modelQuery);
    const modelUrl = `${this.baseUrl}/models/${slug}-stihl/`;
    const res = await this.http.get(modelUrl);

    if (res.status !== 200 || !res.body) {
      return {
        found: false,
        modelQuery,
        url: modelUrl,
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
      variants,
      sections
    };
  }

  parseModelPage(html, pageUrl, modelQuery) {
    const sections = [];
    const variants = [];

    // Parse section assemblies on PartsTree
    const sectionRegex = /<a\s+[^>]*href=["'](\/models\/[^\/]+\/([^"']+)\/?)["'][^>]*>(?:<[^>]+>)*\s*([^<]+)\s*(?:<\/[^>]+>)*<\/a>/gi;
    let sMatch;
    const seen = new Set();

    while ((sMatch = sectionRegex.exec(html)) !== null) {
      const sPath = sMatch[1];
      const sKey = sMatch[2].toLowerCase();
      const sName = sMatch[3].trim();
      const fullUrl = sPath.startsWith('http') ? sPath : `${this.baseUrl}${sPath}`;

      if (!seen.has(fullUrl) && sKey && sName && sName.length > 2) {
        seen.add(fullUrl);
        sections.push({
          sectionKey: sKey,
          sectionName: sName,
          sectionUrl: fullUrl
        });
      }
    }

    return { variants, sections };
  }

  parseSectionPage(html, sectionMeta) {
    const parts = [];
    const rejected = [];

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      if (rowHtml.toLowerCase().includes('<th')) continue;

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
          parts.push({
            part_number: canonicalPartNo,
            part_number_display: PartNormalizer.formatPartNumber(canonicalPartNo),
            part_name_raw: rawName,
            part_name_normalized: PartNormalizer.normalizePartName(rawName),
            diagram_position: position,
            quantity: parseInt(quantityStr, 10) || 1,
            notes: notes || null,
            section_key: sectionMeta.sectionKey,
            section_name: sectionMeta.sectionName,
            source_id: this.sourceId,
            source_url: sectionMeta.sectionUrl,
            source_evidence_status: 'SINGLE_STRUCTURED_PARTS_SOURCE'
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

  async fetchSection(sectionMeta) {
    const res = await this.http.get(sectionMeta.sectionUrl);
    if (res.status !== 200 || !res.body) {
      return {
        status: res.status === 404 ? 'FAILED_404' : 'FAILED_NETWORK',
        error: res.error || `HTTP ${res.status}`,
        parts: [],
        rejected: []
      };
    }
    return this.parseSectionPage(res.body, sectionMeta);
  }
}
