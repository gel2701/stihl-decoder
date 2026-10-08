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
   * Dynamically discovers candidate model URLs on Spare Parts World.
   * Probes candidate category slugs and known STIHL product range mappings.
   */
  async discoverModelCandidates(modelQuery) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const slug = cleanQuery.replace(/\s+/g, '-');

    const candidateUrls = [
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

    // Known STIHL product range registry on Spare Parts World
    const productHints = {
      '026': [`${this.baseUrl}/p/P782712`, `${this.baseUrl}/Stihl-026-Chainsaw-Spare-Parts/P782600`],
      'MS 170': [`${this.baseUrl}/p/P782553`, `${this.baseUrl}/Stihl-MS-170-Chainsaw-Spare-Parts/P782607`],
      'MS 180': [`${this.baseUrl}/p/P782559`, `${this.baseUrl}/Stihl-MS-180-Chainsaw-Spare-Parts/P782608`],
      'MS 250': [`${this.baseUrl}/p/P782604`],
      'MS 261': [`${this.baseUrl}/p/P782612`, `${this.baseUrl}/Stihl-MS-261-Gasoline-Chainsaw-Spare-Parts/P782612`],
      'MS 362': [`${this.baseUrl}/p/P782645`],
      'FS 55': [`${this.baseUrl}/p/P782974`, `${this.baseUrl}/Stihl-FS-55-Brushcutter-Spare-Parts/P782700`],
      'TS 420': [`${this.baseUrl}/p/P783930`, `${this.baseUrl}/Stihl-TS-420-Cut-Off-Saw-Spare-Parts/P782800`]
    };

    if (productHints[cleanQuery]) {
      for (const hintUrl of productHints[cleanQuery]) {
        if (!candidateUrls.includes(hintUrl)) {
          candidateUrls.unshift(hintUrl);
        }
      }
    }

    const discoveredCandidates = [];
    const seenUrls = new Set();

    for (const url of candidateUrls) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const res = await this.httpClient.get(url, { purpose: `candidate_discovery_${cleanQuery}` });
      if (res.status === 200 && res.body && res.body.length > 500) {
        const titleMatch = res.body.match(/<title>([^<]*)<\/title>/i);
        const h1Match = res.body.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const h1 = h1Match ? h1Match[1].trim() : '';

        const classification = this.classifyCandidateModel(cleanQuery, title, h1);
        if (classification.match_type !== 'MISMATCH') {
          discoveredCandidates.push({
            url,
            model: cleanQuery,
            title,
            h1,
            status: res.status,
            match_type: classification.match_type,
            variant: classification.variant || null,
            sha256: res.bodySha256 || res.sha256,
            rawHtml: res.body
          });

          // If we found an exact base model match, we can proceed
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
   * Discovers variants of the given model from HTML content or related catalogue entries.
   */
  discoverVariants(modelQuery, rawHtml) {
    const cleanQuery = modelQuery.toUpperCase().replace(/^STIHL\s+/i, '').trim();
    const variants = [{
      variant_code: cleanQuery.toLowerCase().replace(/[\s-]+/g, '_'),
      variant_name: `STIHL ${cleanQuery}`,
      base_model: cleanQuery
    }];

    if (rawHtml) {
      const variantKeywords = ['C-M', 'C-BE', 'C-B', 'C-E', '2-MIX', 'RC-E', 'C-MQ', 'C-BM', 'VW', 'PRO', 'WVH', 'W', 'R'];
      for (const kw of variantKeywords) {
        if (rawHtml.includes(kw)) {
          const varCode = `${cleanQuery.toLowerCase().replace(/[\s-]+/g, '_')}_${kw.toLowerCase().replace(/[\s-]+/g, '_')}`;
          const varName = `STIHL ${cleanQuery} ${kw}`;
          if (!variants.some(v => v.variant_code === varCode)) {
            variants.push({
              variant_code: varCode,
              variant_name: varName,
              base_model: cleanQuery
            });
          }
        }
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
  parsePartsFromHtml(rawHtml, modelQuery, sourceUrl) {
    const parts = [];
    if (!rawHtml) return parts;

    const itemRegex = /<div\s+class=['"]spareref['"]>([^<]*)<\/div>[\s\S]*?<div\s+class=['"]sparetitle['"]>[\s\S]*?<a[^>]*class=['"]sparetitle['"][^>]*>([^<]*)<\/a>[\s\S]*?<span\s+class=['"]sparesncode['"]>([^<]*)<\/span>/gi;
    const sections = this.discoverSections(rawHtml, modelQuery);

    for (const match of rawHtml.matchAll(itemRegex)) {
      const rawPos = match[1].trim();
      const rawTitle = match[2].trim();
      const rawCode = match[3].trim();

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

        parts.push({
          part_number: normalizedPartNo,
          part_number_display: PartNormalizer.formatPartNumber(normalizedPartNo),
          part_name_raw: rawTitle,
          part_name_normalized: PartNormalizer.normalizePartName(rawTitle.replace(/^Stihl\s+/i, '').replace(/\b\d{11}\b/g, '').trim()),
          diagram_position: rawPos || 'POS_UNSPECIFIED',
          quantity: 1,
          section_key: sectionKey,
          section_name: sectionName,
          section_attribution_status: attributionStatus,
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
    const modelRegex = /Stihl\s+([A-Z0-9\.\-\/]+(?:\s+[A-Z0-9\.\-\/]+)?)\s+(?:Gasoline|Chainsaw|Brushcutter|Cut-Off|Saw|Blower|Hedgetrimmer|Spare)/gi;

    let m;
    while ((m = modelRegex.exec(res.body)) !== null) {
      const candidateModel = m[1].trim();
      if (candidateModel.length >= 2 && !candidateModel.startsWith('HP') && !/^\d{11}$/.test(candidateModel)) {
        modelSet.add(candidateModel);
      }
    }

    return {
      part_url: partUrl,
      status: res.status,
      sha256: res.bodySha256 || res.sha256,
      compatible_models: Array.from(modelSet).sort()
    };
  }
}
