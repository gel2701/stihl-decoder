import { PartNormalizer, FITMENT_SCOPES } from '../PartNormalizer.js';

export class LsEngineersSource {
  constructor(httpClient) {
    this.sourceId = 'lsengineers';
    this.sourceName = 'L&S Engineers UK';
    this.sourceType = 'STRUCTURED_EXPLODED_DIAGRAM_CATALOGUE';
    this.authorityLevel = 'STRUCTURED_AFTERMARKET_DEALER';
    this.httpClient = httpClient;
    this.baseUrl = 'https://www.lsengineers.co.uk';

    this.modelUrls = {
      'MS 261': 'https://www.lsengineers.co.uk/stihl-ms261-chainsaw-spares.html'
    };
  }

  async checkRobotsPolicy() {
    const robotsUrl = `${this.baseUrl}/robots.txt`;
    const res = await this.httpClient.get(robotsUrl, { purpose: 'robots_policy_preflight' });
    const isAllowed = res.status === 200 && !res.body.includes('Disallow: /stihl-ms261');
    return {
      source_id: this.sourceId,
      robots_url: robotsUrl,
      http_status: res.status,
      allowed: isAllowed,
      decision: isAllowed ? 'PERMITTED' : 'DISALLOWED',
      status: res.status,
      url: robotsUrl,
      sha256: res.bodySha256 || res.sha256,
      notes: isAllowed ? 'Robots policy accessible' : 'Disallowed',
      reason: isAllowed ? 'Robots policy accessible' : 'Disallowed'
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
        error: `Model ${modelQuery} not found in L&S registry`
      };
    }

    const res = await this.httpClient.get(targetUrl, { purpose: `model_discovery_${cleanQuery}` });
    if (res.status === 403 || res.body.includes('Just a moment...')) {
      return {
        found: false,
        model: cleanQuery,
        url: targetUrl,
        status: 403,
        error: 'WAF_BLOCKED: Cloudflare bot challenge'
      };
    }

    return {
      found: res.status === 200,
      model: cleanQuery,
      url: targetUrl,
      status: res.status,
      sha256: res.sha256,
      rawHtml: res.body
    };
  }

  discoverSections(rawHtml, modelQuery) {
    return [];
  }

  parsePartsFromHtml(rawHtml, modelQuery, sourceUrl) {
    return [];
  }
}
