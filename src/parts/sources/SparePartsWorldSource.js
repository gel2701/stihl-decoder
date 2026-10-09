import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PartNormalizer, FITMENT_SCOPES } from '../PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultIndexFile = path.resolve(__dirname, '../../../data/sparepartsworld_stihl_model_index.json');

export class SparePartsWorldSource {
  constructor(httpClient, options = {}) {
    this.sourceId = 'sparepartsworld';
    this.sourceName = 'Spare Parts World UK';
    this.sourceType = 'STRUCTURED_EXPLODED_DIAGRAM_CATALOGUE';
    this.authorityLevel = 'STRUCTURED_AFTERMARKET_DEALER';
    this.httpClient = httpClient;
    this.baseUrl = 'https://www.sparepartsworld.co.uk';
    this.catalogIndexFile = options.catalogIndexFile || defaultIndexFile;
    this._cachedCatalog = null;
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

  /**
   * Loads the dynamic STIHL model index discovered from the catalog.
   */
  async loadCatalogIndex() {
    if (this._cachedCatalog) {
      return this._cachedCatalog;
    }

    if (fs.existsSync(this.catalogIndexFile)) {
      try {
        const raw = fs.readFileSync(this.catalogIndexFile, 'utf8');
        const doc = JSON.parse(raw);
        if (doc && Array.isArray(doc.catalog)) {
          this._cachedCatalog = doc.catalog;
          return this._cachedCatalog;
        }
      } catch (err) {
        // Fallback to empty if read error
      }
    }

    this._cachedCatalog = [];
    return this._cachedCatalog;
  }

  /**
   * Classify candidate model page against queried model string.
   * Returns { match_type: 'BASE_MODEL' | 'EXACT_VARIANT' | 'RELATED_VARIANT' | 'MISMATCH', reason?, variant? }
   */
  classifyCandidateModel(queryModel, pageTitle, pageH1) {
    const cleanQuery = queryModel.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const fullText = `${pageH1 || ''} ${pageTitle || ''}`.toUpperCase();

    if (!fullText.includes('STIHL')) {
      return { match_type: 'MISMATCH', reason: 'NO_STIHL_BRAND' };
    }

    const escapedQuery = cleanQuery.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    const baseRegex = new RegExp(`\\bSTIHL\\s+${escapedQuery}\\b`, 'i');

    if (!baseRegex.test(fullText)) {
      return { match_type: 'MISMATCH', reason: 'MODEL_NOT_MATCHED' };
    }

    const categoryKeywords = new Set([
      'GASOLINE', 'PETROL', 'ELECTRIC', 'CORDLESS', 'BATTERY',
      'CHAINSAW', 'BRUSHCUTTERS', 'BRUSHCUTTER', 'CUT-OFF', 'CUT', 'OFF',
      'MACHINES', 'TS', 'FS', 'SAW', 'BLOWER', 'HEDGETRIMMER',
      'SPARE', 'PARTS', 'FROM', 'RANGE'
    ]);

    const afterRegex = new RegExp(`\\bSTIHL\\s+${escapedQuery}\\s+([^<]+)`, 'i');
    const afterMatch = (pageH1 || pageTitle || '').match(afterRegex);

    if (afterMatch) {
      const trailingTokens = afterMatch[1].trim().split(/\s+/).map(t => t.toUpperCase());
      const variantTokens = trailingTokens.filter(t => !categoryKeywords.has(t) && !categoryKeywords.has(t.replace(/[^A-Z0-9]/g, '')));

      if (variantTokens.length > 0) {
        const variantStr = variantTokens.join(' ');
        if (cleanQuery.includes(' ') && cleanQuery.split(' ').length > 2) {
          return { match_type: 'EXACT_VARIANT', variant: variantStr };
        }
        return { match_type: 'RELATED_VARIANT', variant: variantStr };
      }
    }

    return { match_type: 'BASE_MODEL' };
  }

  /**
   * Discovers candidate URLs systematically via catalog index and URL slug patterns.
   * Zero hardcoded product ID hints.
   */
  async discoverModelCandidates(modelQuery) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const catalog = await this.loadCatalogIndex();

    const discoveredCandidates = [];
    const seenUrls = new Set();

    // 1. Match from dynamic catalog index
    const normTarget = PartNormalizer.normalizeModelVariant(cleanQuery);
    const indexMatches = catalog.filter(c => {
      const cNorm = PartNormalizer.normalizeModelVariant(c.model_title_clean || c.model_name);
      return cNorm.base_model_name.toUpperCase() === normTarget.base_model_name.toUpperCase();
    });

    for (const item of indexMatches) {
      const targetUrl = item.source_url;
      if (!seenUrls.has(targetUrl)) {
        seenUrls.add(targetUrl);
        const res = await this.httpClient.get(targetUrl, { purpose: `catalog_index_discovery_${cleanQuery}` });
        if (res.status === 200 && res.body) {
          const isBase = item.variant_key === 'base' || item.variant_key === 'standard';
          discoveredCandidates.push({
            url: res.final_url || targetUrl,
            model: cleanQuery,
            title: item.model_name,
            h1: item.model_name,
            status: res.status,
            match_type: isBase ? 'BASE_MODEL' : 'EXACT_VARIANT',
            variant: isBase ? null : item.variant_name,
            variant_key: item.variant_key,
            sha256: res.bodySha256 || res.sha256,
            rawHtml: res.body
          });
        }
      }
    }

    if (discoveredCandidates.length > 0) {
      return discoveredCandidates;
    }

    // 2. Systematic slug fallback if catalog index doesn't have the entry
    const slug = cleanQuery.replace(/\s+/g, '-');
    const slugUrls = [
      `${this.baseUrl}/Stihl-${slug}-Gasoline-Chainsaw-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Chainsaw-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Brushcutters-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Brushcutter-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Cut-Off-Machines-TS-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Cut-Off-Saw-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Hedgetrimmer-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Blower-Spare-Parts/`,
      `${this.baseUrl}/Stihl-${slug}-Spare-Parts/`
    ];

    for (const url of slugUrls) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const res = await this.httpClient.get(url, { purpose: `slug_discovery_${cleanQuery}` });
      if (res.status === 200 && res.body && res.body.length > 500) {
        const titleMatch = res.body.match(/<title>([^<]*)<\/title>/i);
        const h1Match = res.body.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const h1 = h1Match ? h1Match[1].trim() : '';

        const classification = this.classifyCandidateModel(cleanQuery, title, h1);
        if (classification.match_type !== 'MISMATCH') {
          discoveredCandidates.push({
            url: res.final_url || url,
            model: cleanQuery,
            title,
            h1,
            status: res.status,
            match_type: classification.match_type,
            variant: classification.variant || null,
            sha256: res.bodySha256 || res.sha256,
            rawHtml: res.body
          });

          if (classification.match_type === 'BASE_MODEL') {
            break;
          }
        }
      }
    }

    return discoveredCandidates;
  }

  /**
   * Discovers and retrieves the canonical model page.
   */
  async discoverModel(modelQuery) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const candidates = await this.discoverModelCandidates(cleanQuery);

    const baseCandidate = candidates.find(c => c.match_type === 'BASE_MODEL');
    if (baseCandidate) {
      return {
        found: true,
        model: cleanQuery,
        url: baseCandidate.url,
        status: baseCandidate.status,
        sha256: baseCandidate.sha256,
        rawHtml: baseCandidate.rawHtml,
        match_type: baseCandidate.match_type
      };
    }

    const variantCandidate = candidates.find(c => c.match_type === 'EXACT_VARIANT' || c.match_type === 'RELATED_VARIANT');
    if (variantCandidate) {
      return {
        found: true,
        model: cleanQuery,
        url: variantCandidate.url,
        status: variantCandidate.status,
        sha256: variantCandidate.sha256,
        rawHtml: variantCandidate.rawHtml,
        match_type: variantCandidate.match_type
      };
    }

    return {
      found: false,
      model: cleanQuery,
      url: null,
      status: 404,
      error: `Model ${modelQuery} not discovered on Spare Parts World`
    };
  }

  /**
   * Discovers variants of the given model from catalog index and page links.
   */
  async discoverVariants(modelQuery, rawHtml) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const normTarget = PartNormalizer.normalizeModelVariant(cleanQuery);
    const catalog = await this.loadCatalogIndex();

    const variants = [{
      variant_code: normTarget.base_model_name.toLowerCase().replace(/[\s-]+/g, '_'),
      variant_name: `STIHL ${normTarget.base_model_name}`,
      variant_key: 'base',
      base_model: normTarget.base_model_name
    }];

    // Find real catalog variants
    const catalogVariants = catalog.filter(c => {
      const cNorm = PartNormalizer.normalizeModelVariant(c.model_title_clean || c.model_name);
      return cNorm.base_model_name.toUpperCase() === normTarget.base_model_name.toUpperCase() && cNorm.variant_key !== 'base';
    });

    for (const cv of catalogVariants) {
      const vCode = `${normTarget.base_model_name.toLowerCase().replace(/[\s-]+/g, '_')}_${cv.variant_key}`;
      if (!variants.some(v => v.variant_code === vCode)) {
        variants.push({
          variant_code: vCode,
          variant_name: cv.variant_name || cv.model_name,
          variant_key: cv.variant_key,
          base_model: normTarget.base_model_name,
          source_url: cv.source_url
        });
      }
    }

    return variants;
  }

  /**
   * Discovers exploded diagram sections from diagram pills in HTML.
   */
  discoverSections(rawHtml, modelQuery) {
    const sections = [];
    if (!rawHtml) return sections;

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

  /**
   * Parses exploded parts from HTML with strict section attribution.
   * Parts that do not have proven diagram section attribution receive UNRESOLVED status.
   */
  parsePartsFromHtml(rawHtml, modelQuery, sourceUrl, variantKey = 'base') {
    const parts = [];
    const invalidRows = [];
    const noncanonicalRows = [];
    parts.invalidRows = invalidRows;
    parts.noncanonicalRows = noncanonicalRows;
    parts.rawCount = 0;

    if (!rawHtml) return parts;

    const itemRegex = /<div\s+class=['"]spareref['"]>([^<]*)<\/div>[\s\S]*?<div\s+class=['"]sparetitle['"]>[\s\S]*?<a[^>]*class=['"]sparetitle['"][^>]*>([^<]*)<\/a>[\s\S]*?<span\s+class=['"]sparesncode['"]>([^<]*)<\/span>/gi;
    const sections = this.discoverSections(rawHtml, modelQuery);

    const isExactVariant = variantKey && variantKey !== 'base' && variantKey !== 'standard';
    const fitmentScope = isExactVariant ? FITMENT_SCOPES.EXACT_VARIANT : FITMENT_SCOPES.BASE_MODEL_CONFIRMED;

    let rawCount = 0;
    for (const match of rawHtml.matchAll(itemRegex)) {
      rawCount++;
      const rawPos = (' ' + match[1]).slice(1).trim();
      const rawTitle = (' ' + match[2]).slice(1).trim();
      const rawCode = (' ' + match[3]).slice(1).trim();

      const normalizedPartNo = PartNormalizer.normalizePartNumber(rawCode);
      if (normalizedPartNo) {
        // Explicit section matching based on part description / diagram context
        let matchedSection = null;
        for (const s of sections) {
          if (s.section_name && s.section_name !== 'General Assembly' && rawTitle.toLowerCase().includes(s.section_name.toLowerCase())) {
            matchedSection = s;
            break;
          }
        }

        const hasExplicitSection = Boolean(matchedSection);
        const sectionKey = hasExplicitSection ? matchedSection.section_key : 'general_unresolved';
        const sectionName = hasExplicitSection ? matchedSection.section_name : 'Unresolved Diagram Section';
        const attributionStatus = hasExplicitSection ? 'MAPPED' : 'UNRESOLVED';

        const cleanPartName = PartNormalizer.normalizePartName(rawTitle.replace(/^Stihl\s+/i, '').replace(/\b\d{11}\b/g, '').trim());

        parts.push({
          part_number: (' ' + normalizedPartNo).slice(1),
          part_number_display: (' ' + PartNormalizer.formatPartNumber(normalizedPartNo)).slice(1),
          part_name_raw: (' ' + rawTitle).slice(1),
          part_name_normalized: (' ' + cleanPartName).slice(1),
          diagram_position: (' ' + (rawPos || 'POS_UNSPECIFIED')).slice(1),
          quantity: 1,
          section_key: (' ' + sectionKey).slice(1),
          section_name: (' ' + sectionName).slice(1),
          section_attribution_status: attributionStatus,
          source_id: this.sourceId,
          source_url: (' ' + sourceUrl).slice(1),
          source_evidence_status: 'SINGLE_STRUCTURED_SOURCE',
          fitment_scope: fitmentScope,
          model: (' ' + modelQuery).slice(1),
          variant_key: (' ' + (variantKey || 'base')).slice(1),
          raw_code: rawCode
        });
      } else {
        const digitsOnly = rawCode.replace(/\D/g, '');
        if (digitsOnly.length > 0 && digitsOnly.length !== 11) {
          noncanonicalRows.push({
            raw_pos: rawPos,
            raw_title: rawTitle,
            raw_code: rawCode,
            reason: `NON_CANONICAL_LENGTH_${digitsOnly.length}`
          });
        } else {
          invalidRows.push({
            raw_pos: rawPos,
            raw_title: rawTitle,
            raw_code: rawCode,
            reason: 'INVALID_PART_NUMBER'
          });
        }
      }
    }

    parts.rawCount = rawCount;
    parts.invalidRows = invalidRows;
    parts.noncanonicalRows = noncanonicalRows;
    return parts;
  }

  /**
   * Reverse compatibility pilot helper: Given a part URL, discovers compatible STIHL models listed on the page.
   */
  async discoverCompatibleModelsForPart(partUrl) {
    const res = await this.httpClient.get(partUrl, { purpose: 'reverse_compatibility_lookup' });
    if (res.status !== 200 || !res.body) {
      return {
        part_url: partUrl,
        status: res.status,
        compatible_models: []
      };
    }

    const modelSet = new Set();

    // 1. Explicit compatmodel_link anchors
    const linkRegex = /class=['"]compatmodel_link['"][^>]*>([^<]+)<\/a>/gi;
    for (const match of res.body.matchAll(linkRegex)) {
      const rawText = match[1].replace(/^Stihl\s+/i, '').replace(/\s+Spare\s+Parts.*$/i, '').trim();
      const norm = PartNormalizer.normalizeModelVariant(rawText);
      if (norm.base_model_name && !norm.base_model_name.startsWith('HP') && !/^\d{11}$/.test(norm.base_model_name)) {
        modelSet.add(norm.base_model_name);
      }
    }

    // 2. Text pattern fallback
    const modelRegex = /Stihl\s+([A-Z0-9\.\-\/]+(?:\s+[A-Z0-9\.\-\/]+)?)\s+(?:Gasoline|Chainsaw|Brushcutter|Cut-Off|Saw|Blower|Hedgetrimmer|Spare|range)/gi;
    let m;
    while ((m = modelRegex.exec(res.body)) !== null) {
      const candidateModel = m[1].trim();
      if (candidateModel.length >= 2 && !candidateModel.startsWith('HP') && !/^\d{11}$/.test(candidateModel) && !['SPARE', 'PARTS', 'CHAINSAW', 'TOOLS'].includes(candidateModel.toUpperCase())) {
        const norm = PartNormalizer.normalizeModelVariant(candidateModel);
        if (norm.base_model_name) {
          modelSet.add(norm.base_model_name);
        }
      }
    }

    return {
      part_url: res.final_url || partUrl,
      status: res.status,
      sha256: res.bodySha256 || res.sha256,
      compatible_models: Array.from(modelSet).sort()
    };
  }
}
