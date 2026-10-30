/**
 * src/parts/GhsCatalogParser.js
 *
 * Phase 58A — Complete Garden Hire Spares (GHS) STIHL Catalog Parser & Normalizer
 *
 * Deterministically parses GHS HTML pages (root, category, subcategory, model,
 * diagram, and product pages across both Magento 1 and Magento 2 templates) and
 * normalizes STIHL models, diagrams, parts, GHS SKUs, OEM vs Aftermarket status,
 * and model/diagram/part fitments under authority = GHS_STIHL_PRIMARY.
 */

import { PartNormalizer } from './PartNormalizer.js';
import { StihlModelIdentityParser } from './StihlModelIdentityParser.js';
import { SectionNormalizer } from './SectionNormalizer.js';

export const GHS_SOURCE_ID = 'ghs';
export const GHS_AUTHORITY = 'GHS_STIHL_PRIMARY';
export const GHS_SOURCE_STATUS = 'AUTHORITATIVE';
export const GHS_DISCOVERY_METHOD = 'PUBLIC_SEARCH_INDEX';
export const GHS_ROOT_URL = 'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns.html';

/**
 * Decodes HTML entities deterministically.
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips HTML tags and decodes entities.
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

/**
 * Normalizes a GHS URL for canonical deduplication.
 * Preserves ?p=N pagination parameters for pages > 1; strips ?p=1 and tracking parameters.
 */
export function normalizeGhsUrl(rawUrl, baseUrl = 'https://www.gardenhirespares.co.uk') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = decodeHtmlEntities(rawUrl).trim();
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    return null;
  }
  try {
    const cleaned = trimmed
      .replace(/^https?:\/\/web\.archive\.org\/web\/\d+(?:id_)?\//i, '')
      .replace(/^http:\/\//i, 'https://')
      .replace(/:80(\/|$)/, '$1');
    const u = new URL(cleaned, baseUrl);
    if (!u.hostname.toLowerCase().endsWith('gardenhirespares.co.uk')) {
      return null;
    }
    u.protocol = 'https:';
    u.hostname = 'www.gardenhirespares.co.uk';
    u.port = '';
    u.hash = '';

    // Keep only ?p=N when N > 1
    const pageParam = u.searchParams.get('p');
    const keys = [...u.searchParams.keys()];
    for (const k of keys) {
      u.searchParams.delete(k);
    }
    if (pageParam && /^\d+$/.test(pageParam) && parseInt(pageParam, 10) > 1) {
      u.searchParams.set('p', String(parseInt(pageParam, 10)));
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Separates a GHS internal SKU (e.g. "ST0000 350 3502", "7488", "1474") from an
 * 11-digit STIHL OEM part number.
 * Never normalizes a short numeric GHS SKU into a STIHL part number.
 */
export function separateGhsSkuAndStihlPartNumber(rawSku, rawOemNo = null, rawText = null) {
  const ghsSku = rawSku ? String(rawSku).trim() : null;
  let stihlRaw = null;
  let stihlNormalized = null;

  // 1. Check explicit OEM No. if provided
  if (rawOemNo) {
    const oemTrim = String(rawOemNo).trim();
    const norm = PartNormalizer.normalizePartNumber(oemTrim);
    if (norm) {
      stihlRaw = oemTrim;
      stihlNormalized = norm;
    }
  }

  // 2. If GHS SKU starts with "ST" followed by an 11-digit STIHL part number (e.g. "ST4241 122 6600")
  if (!stihlNormalized && ghsSku) {
    const stMatch = ghsSku.match(/^ST\s*(\d{4}[\s\-_.]*\d{3}[\s\-_.]*\d{4})\b/i);
    if (stMatch) {
      const candidateRaw = stMatch[1].trim();
      const norm = PartNormalizer.normalizePartNumber(candidateRaw);
      if (norm) {
        stihlRaw = candidateRaw;
        stihlNormalized = norm;
      }
    }
  }

  // 3. Check raw text / title / cross-reference for formatted 4-3-4 or 11-digit STIHL part number
  if (!stihlNormalized && rawText) {
    const textStr = String(rawText);
    const match434 = textStr.match(/\b(\d{4}[\s\-]\d{3}[\s\-]\d{4})\b/);
    if (match434) {
      const norm = PartNormalizer.normalizePartNumber(match434[1]);
      if (norm) {
        stihlRaw = match434[1];
        stihlNormalized = norm;
      }
    } else {
      const match11 = textStr.match(/\b(\d{11})\b/);
      if (match11) {
        const norm = PartNormalizer.normalizePartNumber(match11[1]);
        if (norm) {
          stihlRaw = PartNormalizer.formatPartNumber(norm);
          stihlNormalized = norm;
        }
      }
    }
  }

  return {
    ghs_part_number: ghsSku,
    part_number_raw: stihlRaw,
    part_number_normalized: stihlNormalized,
    part_number_display: stihlNormalized ? PartNormalizer.formatPartNumber(stihlNormalized) : null
  };
}

/**
 * Classifies whether a GHS part/product record is genuine STIHL (OEM) or AFTERMARKET.
 * Respects GHS labeling ("Genuine Stihl", "Manufacturer: Stihl", "Part Type: Genuine Part"
 * vs "Non-Genuine Part", "Replacement", non-Stihl manufacturer).
 */
export function classifyGhsProductType({
  title = '',
  description = '',
  manufacturer = '',
  partType = '',
  ghsSku = '',
  url = ''
} = {}) {
  const combined = `${title} ${description} ${partType} ${url}`.toLowerCase();
  const mfgLower = (manufacturer || '').trim().toLowerCase();
  const ptLower = (partType || '').trim().toLowerCase();

  // Explicit aftermarket indicators take priority if non-genuine is stated
  if (
    ptLower.includes('non-genuine') ||
    ptLower.includes('non genuine') ||
    ptLower.includes('aftermarket') ||
    combined.includes('non-genuine') ||
    combined.includes('non genuine') ||
    combined.includes('replacement part') ||
    combined.includes('replacement parts') ||
    (mfgLower && mfgLower !== 'stihl' && mfgLower !== 'viking' && !mfgLower.includes('stihl'))
  ) {
    return {
      product_type: 'AFTERMARKET',
      manufacturer: manufacturer ? manufacturer.trim() : 'Aftermarket',
      is_oem: false
    };
  }

  // Explicit OEM indicators
  if (
    ptLower === 'genuine part' ||
    mfgLower === 'stihl' ||
    combined.includes('genuine stihl') ||
    (ghsSku && /^ST\s*\d{4}/i.test(ghsSku.trim()))
  ) {
    return {
      product_type: 'OEM',
      manufacturer: 'STIHL',
      is_oem: true
    };
  }

  // Default fail-closed to AFTERMARKET if not explicitly Genuine Stihl
  return {
    product_type: 'AFTERMARKET',
    manufacturer: manufacturer ? manufacturer.trim() : 'Aftermarket',
    is_oem: false
  };
}

/**
 * Maps a raw GHS category hierarchy to STIHLDecoder canonical category & category_slug.
 */
export function mapGhsCategoryToCanonical(rawCategory = '', hierarchy = []) {
  const full = [rawCategory, ...(hierarchy || [])].join(' ').toLowerCase();

  if (full.includes('chainsaw')) return { category: 'Kettingzaag', category_slug: 'kettingzagen', ghs_category: rawCategory || 'Stihl Chainsaw Parts' };
  if (full.includes('pole pruner')) return { category: 'Hoogsnoeier', category_slug: 'hoogsnoeiers', ghs_category: rawCategory || 'Stihl Pole Pruner Parts' };
  if (full.includes('disc cutter') || full.includes('cut-off') || full.includes('cut off') || full.includes('concrete cutter')) {
    return { category: 'Doorslijper', category_slug: 'doorslijpers', ghs_category: rawCategory || 'Stihl Disc Cutter Parts' };
  }
  if (full.includes('strimmer') || full.includes('brushcutter') || full.includes('back pack') || full.includes('backpack brushcutter') || full.includes('clearing saw')) {
    return { category: 'Bosmaaier', category_slug: 'bosmaaiers', ghs_category: rawCategory || 'Stihl Strimmer & Brushcutter Parts' };
  }
  if (full.includes('long reach') || full.includes('long-handled') || full.includes('long handled')) {
    return { category: 'heggenschaar op steel', category_slug: 'heggenscharen', ghs_category: rawCategory || 'Stihl Long Reach Hedgetrimmer Parts' };
  }
  if (full.includes('hedgetrimmer') || full.includes('hedegtrimmer') || full.includes('hedge trimmer')) {
    return { category: 'Heggenschaar', category_slug: 'heggenscharen', ghs_category: rawCategory || 'Stihl Hedgetrimmer Parts' };
  }
  if (full.includes('kombi')) return { category: 'KombiSysteem', category_slug: 'kombisysteem', ghs_category: rawCategory || 'Stihl Kombi Tool Parts' };
  if (full.includes('multi') || full.includes('cultivator') || full.includes('scarifier')) {
    return { category: 'MultiSysteem / Grondbewerking', category_slug: 'multisysteem', ghs_category: rawCategory || 'Stihl Cultivator Parts' };
  }
  if (full.includes('vacuum shredder')) return { category: 'Bladzuiger / Hakselaar', category_slug: 'bladblazers', ghs_category: rawCategory || 'Stihl Vacuum Shredder Parts' };
  if (full.includes('blower')) return { category: 'Bladblazer', category_slug: 'bladblazers', ghs_category: rawCategory || 'Stihl Blowers' };
  if (full.includes('garden shredder') || full.includes('shredder')) return { category: 'Hakselaar', category_slug: 'hakselaars', ghs_category: rawCategory || 'Stihl Garden Shredders' };
  if (full.includes('auger')) return { category: 'Grondboor', category_slug: 'grondboren', ghs_category: rawCategory || 'Stihl Auger Parts' };
  if (full.includes('mistblower') || full.includes('sprayer')) return { category: 'Sproeiapparaat / Nevelspuit', category_slug: 'sproeiapparaten', ghs_category: rawCategory || 'Stihl Sprayer Parts' };
  if (full.includes('pressure washer')) return { category: 'Hogedrukreiniger', category_slug: 'hogedrukreinigers', ghs_category: rawCategory || 'Stihl Pressure Washer Parts' };
  if (full.includes('water pump')) return { category: 'Waterpomp', category_slug: 'waterpompen', ghs_category: rawCategory || 'Stihl Water Pumps' };
  if (full.includes('robotic mower')) return { category: 'Robotmaaier', category_slug: 'robotmaaiers', ghs_category: rawCategory || 'Stihl Robotic Mower Parts' };
  if (full.includes('ride on mower') || full.includes('ride-on')) return { category: 'Zitmaaier', category_slug: 'zitmaaiers', ghs_category: rawCategory || 'Stihl Ride On Mower Parts' };
  if (full.includes('rotary mower') || full.includes('lawn mower')) return { category: 'Grasmaaier', category_slug: 'grasmaaiers', ghs_category: rawCategory || 'Stihl Rotary Mower Parts' };
  if (full.includes('vacuum cleaner')) return { category: 'Alleszuiger', category_slug: 'alleszuigers', ghs_category: rawCategory || 'Stihl Vacuum Cleaner Parts' };

  return { category: 'STIHL Machine', category_slug: 'machines', ghs_category: rawCategory || 'Stihl Parts Diagrams' };
}

/**
 * Normalizes a GHS model label into canonical model fields while preserving exact model variants
 * (e.g. RM248.0, RM248.1, RM248.2, KM85 R, MS271 C-BE, HT-KM, HL-KM 145) and aliases.
 */
export function normalizeGhsModel(rawLabel) {
  if (!rawLabel || typeof rawLabel !== 'string') return null;

  let cleaned = stripHtml(rawLabel)
    .replace(/^Genuine\s+Stihl\s+/i, '')
    .replace(/^Stihl\s+/i, '')
    .replace(/\s+Parts\s+List\s+Breakdown(?:\s+GHS)?$/i, '')
    .replace(/\s+(?:Petrol\s+|Electric\s+|Battery\s+|Cordless\s+|Cold\s+Water\s+|Hot\s+Water\s+)?(?:Chainsaw|Pole\s+Pruner|Disc\s+Cutter|Cut-Off\s+Machine|Cut\s+Off\s+Machine|Strimmer|Brushcutter|Hedgetrimmer|Hedge\s+Trimmer|KombiEngine|KombiTools?|Kombi\s+Tools?|MultiTool|MultiSystem|Blower|Vacuum\s+Cleaners?|Vacuum\s+Shredder|Shredder|Cultivator|Scarifier|Auger|Mistblower|Sprayer|Pressure\s+Washer|Pressure\s+Cleaners?|Water\s+Pump|Rotary\s+Mower|Robotic\s+Mower|Ride\s+On\s+Mower)s?\s+Parts$/i, '')
    .replace(/\s+Parts(?:\s+Diagrams|\s+Breakdowns|\s+Lists?)?$/i, '')
    .replace(/\s+Handle$/i, '')
    .trim();

  if (!cleaned) return null;

  // Reject category headers, part numbers, or non-model phrases
  if (
    /^(?:strimmer|brushcutter|chainsaw|hedgetrimmer|blower|cultivator|scarifier|auger|mistblower|sprayer|pressure\s+washer|water\s+pump|saw\s+mill|concrete\s+cutter|rotary\s+mower|robotic\s+mower|ride\s+on\s+mower|other\s+garden|vacuum\s+cleaner|lawn\s+mower|engine|gearbox|kombi\s*tool|pole\s+pruner|disc\s+cutter|fw\s+petrol)/i.test(cleaned) ||
    /\b0000\b/.test(cleaned) ||
    /["']|\b(?:links|chain|oil|litre|pack\s+of|o-ring|nbr70)\b/i.test(cleaned) ||
    !/^(?:(?:MS|MSA|MSE|FS|FSA|FSE|FCB|FCS|FBD|FH|FSB|HS|HSA|HSE|KM|KMA|KMB|KA|KB|KR|KW|BF|BC|BG|BGA|BGE|BR|BRA|TS|TSA|HT|HTA|HTE|HL|HLA|HLE|SH|SHE|SE|SEA|RE|REA|RM|RMA|RME|RMI|RT|RL|RLE|MB|MA|ME|MI|MT|MR|MM|MH|BT|FR|FC|SP|SPA|SG|SGA|SR|FW|GS|GSA|LSG|MF|RG|WP|PW|RB|RZ|P|E)\s*(?:[1-9]\d*[A-Z0-9.\-\s]*|-(?:KM|MM|[1-9]\d*)\b[A-Z0-9.\-\s]*)|^(?:BF|FS|KB|KW)$|^(?:008|08\s*S?|009|010|011|012|015|017|018|019|020|021|023|024|025|026|028|029|030|031|032|034|036|038|039|040|041|042|044|045|046|048|050|051|056|064|066|070|075|076|084|088|090)(?:\s*(?:AV|AVE|AVSEQ|AVEQ|FB|M|MR|N|Q|QS|R|S|SE|super|T|W))?$)/i.test(cleaned)
  ) {
    return null;
  }

  // Use StihlModelIdentityParser as foundation
  const parsed = StihlModelIdentityParser.parseModelIdentity(cleaned);

  // Check if cleaned has a specific angle/series/variant token that StihlModelIdentityParser stripped
  // (e.g. "HL-KM 145", "HL-KM 135", "HL-KM 30", "HL-KM 0", "FH-KM 135", "FCB-KM-4137", "FCS-KM-4180", "TS350 AVE", "RE127 PLUS", "MS440 N")
  let displayName = parsed.variant_name || parsed.canonical_model || cleaned;
  const kmSubMatch = cleaned.match(/^([A-Z]+-(?:KM|MM))[-\s]+(\d+)$/i);
  if (kmSubMatch) {
    displayName = `${kmSubMatch[1].toUpperCase()} ${kmSubMatch[2]}`;
  } else if (/\b(?:AVE|PLUS)\b/i.test(cleaned) && !new RegExp(`\\b(?:AVE|PLUS)\\b`, 'i').test(displayName)) {
    const suffix = cleaned.match(/\b(AVE|PLUS)\b/i)[1].toUpperCase();
    displayName = `${displayName} ${suffix}`;
  } else if (/\bMS\s*440\s+N\b/i.test(cleaned) && !/\bN\b/.test(displayName)) {
    displayName = 'MS 440 N';
  } else if (/^MM\s*55[\s\-]+Z$/i.test(cleaned)) {
    displayName = 'MM 55 Z';
  }

  const normalizedAlias = cleaned.toUpperCase().replace(/[\s\-_]+/g, '');
  const canonicalNormalized = displayName.toUpperCase().replace(/\s+/g, ' ').trim();
  const canonicalModelId = canonicalNormalized.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  return {
    model_raw: rawLabel.trim(),
    source_model_label: cleaned,
    model_normalized: canonicalNormalized,
    model_display_name: displayName,
    normalized_alias: normalizedAlias,
    canonical_model: parsed.canonical_model || displayName,
    canonical_model_id: canonicalModelId,
    base_model_name: parsed.base_model_name || displayName,
    variant_key: parsed.variant_key || 'base',
    variant_name: displayName,
    configuration_key: parsed.configuration_key || null,
    configuration_name: parsed.configuration_name || null,
    entity_type: parsed.entity_type || 'BASE_MODEL'
  };
}

/**
 * Parses a diagram full label such as:
 *   "Genuine Stihl MS271 C-BE / A - Motor housing"
 *   "Genuine Stihl BC-KM / A - BC-KM Drive tube assembly"
 *   "TS500i / B - Cylinder, Muffler"
 *   "Genuine Stihl SE121 E - Extras"
 */
export function parseGhsDiagramLabel(rawDiagramLabel, fallbackModel = null) {
  if (!rawDiagramLabel || typeof rawDiagramLabel !== 'string') return null;
  const fullLabel = stripHtml(rawDiagramLabel).trim();
  if (!fullLabel) return null;

  // Reject obvious single-part titles containing 11-digit part numbers or pack/chain specs
  if (/\b\d{4}[\s\-]\d{3}[\s\-]\d{4}\b/.test(fullLabel) || /\bpack\s+of\s+\d+\b/i.test(fullLabel)) {
    return null;
  }

  let body = fullLabel.replace(/^Genuine\s+Stihl\s+/i, '').trim();

  // Pattern 1: "<Model> / <Code> - <Title>"
  const slashMatch = body.match(/^(.+?)\s*\/\s*([A-Z0-9]{1,3})\s*-\s*(.+)$/i);
  if (slashMatch) {
    const modelStr = slashMatch[1].trim();
    const code = slashMatch[2].toUpperCase().trim();
    const title = slashMatch[3].trim();
    const normModel = normalizeGhsModel(modelStr) || (fallbackModel ? normalizeGhsModel(fallbackModel) : null);
    if (!normModel) return null;
    return {
      model_raw: modelStr,
      model: normModel.model_display_name,
      canonical_model_id: normModel.canonical_model_id,
      variant_key: normModel.variant_key,
      diagram_code: code,
      diagram_title: title,
      diagram_full_label: fullLabel
    };
  }

  // Pattern 2: "<Model> <Code> - <Title>" (e.g. "SE121 E - Extras")
  const dashMatch = body.match(/^(.+?)\s+([A-Z0-9]{1,2})\s*-\s*(.+)$/i);
  if (dashMatch) {
    const modelStr = dashMatch[1].trim();
    const code = dashMatch[2].toUpperCase().trim();
    const title = dashMatch[3].trim();
    const normModel = normalizeGhsModel(modelStr) || (fallbackModel ? normalizeGhsModel(fallbackModel) : null);
    if (!normModel) return null;
    return {
      model_raw: modelStr,
      model: normModel.model_display_name,
      canonical_model_id: normModel.canonical_model_id,
      variant_key: normModel.variant_key,
      diagram_code: code,
      diagram_title: title,
      diagram_full_label: fullLabel
    };
  }

  // Pattern 3: Fallback when no explicit single-letter code is separated (e.g. "SE121 E - Extras")
  const firstPart = body.split(/\s+-\s+/)[0];
  const restPart = body.split(/\s+-\s+/).slice(1).join(' - ').trim();
  const normModel = normalizeGhsModel(firstPart) || (fallbackModel ? normalizeGhsModel(fallbackModel) : null);
  if (!normModel || !restPart) return null;
  return {
    model_raw: normModel.source_model_label,
    model: normModel.model_display_name,
    canonical_model_id: normModel.canonical_model_id,
    variant_key: normModel.variant_key,
    diagram_code: 'A',
    diagram_title: restPart,
    diagram_full_label: fullLabel
  };
}

/**
 * Extracts breadcrumb items from a GHS page.
 */
export function extractBreadcrumbs(html) {
  const bcMatch = html.match(/<div[^>]*class="[^"]*breadcrumbs[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!bcMatch) return [];
  const items = [];
  const liRegex = /<li[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRegex.exec(bcMatch[1])) !== null) {
    const inner = m[1];
    const aMatch = inner.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (aMatch) {
      items.push({
        label: stripHtml(aMatch[2]),
        url: normalizeGhsUrl(aMatch[1])
      });
    } else {
      items.push({
        label: stripHtml(inner),
        url: null
      });
    }
  }
  return items;
}

/**
 * Parses a GHS HTML page of any type (root, category, subcategory, model, diagram, or product)
 * and returns structured records and discovered graph links.
 */
export function parseGhsPage(html, pageUrl, retrievedAt = new Date().toISOString()) {
  const normPageUrl = normalizeGhsUrl(pageUrl) || pageUrl;
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = h1Match ? stripHtml(h1Match[1]) : '';
  const pageTitle = titleMatch ? stripHtml(titleMatch[1]) : '';
  const breadcrumbs = extractBreadcrumbs(html);

  const hierarchyLabels = breadcrumbs
    .map(b => b.label)
    .filter(l => l && !['Home', 'Parts Diagrams', 'Stihl Parts Diagrams'].includes(l));

  const discoveredUrls = new Set();
  const categories = [];
  const models = [];
  const diagrams = [];
  const parts = [];
  const fitments = [];

  // Determine page type
  const isDiagramPage =
    html.includes('id="super-product-table"') ||
    html.includes('"groupQtyInput"') ||
    (/^https:\/\/www\.gardenhirespares\.co\.uk\/genuine-stihl-[a-z0-9-]+-[a-z0-9]+-[a-z0-9-]+\.html/i.test(normPageUrl) &&
      !/\d{4}-\d{3}-\d{4}/.test(normPageUrl) &&
      Boolean(parseGhsDiagramLabel(h1 || pageTitle)));

  const isProductPage =
    !isDiagramPage &&
    (html.includes('id="product-attribute-specs-table"') ||
      html.includes('id="product_addtocart_form"'));

  const hasShopByDiagram = html.includes('category-shopby__diagram') || html.includes('Shop by diagram');
  const hasProductsGrid = html.includes('products__item-info') || html.includes('products-grid');

  const isRootPage = normPageUrl.replace(/\?.*$/, '') === GHS_ROOT_URL;
  const isUnderBreakdowns = normPageUrl.includes('/menu-parts-diagrams/stihl-parts-breakdowns');

  let pageType = 'OTHER';
  if (isRootPage) pageType = 'ROOT';
  else if (isDiagramPage) pageType = 'DIAGRAM';
  else if (isProductPage) pageType = 'PRODUCT';
  else if (hasShopByDiagram || hasProductsGrid || (isUnderBreakdowns && /parts\.html|ghs\.html/i.test(normPageUrl) && breadcrumbs.length >= 5)) {
    pageType = 'MODEL_OR_CATEGORY';
  } else if (isUnderBreakdowns) {
    pageType = 'CATEGORY';
  }

  // 1. Extract all breakdown & sidebar category/model links
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let lm;
  while ((lm = linkRegex.exec(html)) !== null) {
    const rawHref = lm[1];
    const linkText = stripHtml(lm[2]);
    const normHref = normalizeGhsUrl(rawHref, normPageUrl);
    if (!normHref) continue;

    if (normHref.includes('/menu-parts-diagrams/stihl-parts-breakdowns')) {
      discoveredUrls.add(normHref);
    } else if (/^https:\/\/www\.gardenhirespares\.co\.uk\/genuine-stihl-[a-z0-9-]+\.html$/i.test(normHref)) {
      discoveredUrls.add(normHref);
    } else if (/^https:\/\/www\.gardenhirespares\.co\.uk\/\d{4}-\d{3}-\d{4}-[a-z0-9-]+\.html$/i.test(normHref)) {
      discoveredUrls.add(normHref);
    }

    // Check if this is a category grid card or sidebar sibling model link
    const fullAnchorTag = lm[0];
    if (
      normHref.includes('/menu-parts-diagrams/stihl-parts-breakdowns/') &&
      (fullAnchorTag.includes('category-list__link') || fullAnchorTag.includes('category-grid') || fullAnchorTag.includes('category-item') || fullAnchorTag.includes('categories__item'))
    ) {
      const pathSegments = new URL(normHref).pathname.split('/').filter(Boolean);
      // Depth >= 4 under /menu-parts-diagrams/stihl-parts-breakdowns/... usually represents a model or leaf subcategory
      const isCategoryOnlyLabel =
        /parts\s*\((?:0\/|ms|fs|hs|km|bg|br|ts|ht|hl|se|re|rm|e\/|msa)/i.test(linkText) ||
        /new\s+models|old\s+models|petrol\s+chainsaws|electric\s+chainsaws|battery\s+chainsaws|kombi\s*tools?\s+parts|kombi\s*engine\s+parts/i.test(linkText);

      const normMod = !isCategoryOnlyLabel ? normalizeGhsModel(linkText) : null;
      if (normMod) {
        const cleanSubHierarchy = hierarchyLabels.filter(l => {
          const nm = normalizeGhsModel(l);
          return !nm || nm.model_display_name !== normMod.model_display_name;
        });
        const catMap = mapGhsCategoryToCanonical(hierarchyLabels[0] || linkText, cleanSubHierarchy);
        models.push({
          source: 'GHS',
          source_authority: GHS_AUTHORITY,
          discovery_method: GHS_DISCOVERY_METHOD,
          ...normMod,
          category: catMap.category,
          category_slug: catMap.category_slug,
          ghs_category: catMap.ghs_category,
          subcategory_hierarchy: cleanSubHierarchy,
          model_page_url: normHref,
          discovered_on_url: normPageUrl,
          retrieved_at: retrievedAt
        });
      } else if (linkText) {
        categories.push({
          category_name: linkText,
          category_url: normHref,
          parent_url: normPageUrl,
          hierarchy: hierarchyLabels,
          source_authority: GHS_AUTHORITY,
          retrieved_at: retrievedAt
        });
      }
    }
  }

  // 2. If this page itself is a Model page (has Shop by diagram or products grid under breakdowns)
  let currentModel = null;
  if ((hasShopByDiagram || hasProductsGrid) && isUnderBreakdowns && h1) {
    const normMod = normalizeGhsModel(h1);
    if (normMod) {
      const catMap = mapGhsCategoryToCanonical(hierarchyLabels[0] || h1, hierarchyLabels.slice(0, -1));
      currentModel = {
        source: 'GHS',
        source_authority: GHS_AUTHORITY,
        discovery_method: GHS_DISCOVERY_METHOD,
        ...normMod,
        category: catMap.category,
        category_slug: catMap.category_slug,
        ghs_category: catMap.ghs_category,
        subcategory_hierarchy: hierarchyLabels.slice(0, -1),
        model_page_url: normPageUrl.replace(/\?.*$/, ''),
        discovered_on_url: normPageUrl,
        retrieved_at: retrievedAt
      };
      models.push(currentModel);
      pageType = 'MODEL';
    }
  } else if (isUnderBreakdowns && h1 && !isRootPage) {
    categories.push({
      category_name: h1,
      category_url: normPageUrl,
      parent_url: breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2].url : GHS_ROOT_URL,
      hierarchy: hierarchyLabels,
      source_authority: GHS_AUTHORITY,
      retrieved_at: retrievedAt
    });
  }

  // 3. Extract "Shop by diagram" sections on Model pages
  const shopByRegex = /<a[^>]*class="[^"]*category-shopby__diagram[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let sbm;
  while ((sbm = shopByRegex.exec(html)) !== null) {
    const diagUrl = normalizeGhsUrl(sbm[1], normPageUrl);
    const inner = sbm[2];
    const imgMatch = inner.match(/<img[^>]+src="([^"]+)"/i);
    const h4Match = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const altMatch = inner.match(/alt="([^"]+)"/i);
    const label = h4Match ? stripHtml(h4Match[1]) : (altMatch ? decodeHtmlEntities(altMatch[1]) : '');
    const imgUrl = imgMatch ? decodeHtmlEntities(imgMatch[1]).trim() : null;

    if (diagUrl) discoveredUrls.add(diagUrl);

    const parsedDiag = parseGhsDiagramLabel(label, currentModel ? currentModel.model_display_name : h1);
    if (parsedDiag && diagUrl) {
      const diagIdentifier = `${parsedDiag.canonical_model_id}__${parsedDiag.diagram_code.toLowerCase()}__${SectionNormalizer.normalizeSectionKey(parsedDiag.diagram_title)}`;
      diagrams.push({
        model: parsedDiag.model,
        model_raw: parsedDiag.model_raw,
        canonical_model_id: parsedDiag.canonical_model_id,
        variant_key: parsedDiag.variant_key,
        diagram_code: parsedDiag.diagram_code,
        diagram_title: parsedDiag.diagram_title,
        diagram_full_label: parsedDiag.diagram_full_label,
        diagram_identifier: diagIdentifier,
        diagram_page_url: diagUrl,
        diagram_source_url: normPageUrl,
        diagram_image_url: imgUrl,
        source_authority: GHS_AUTHORITY,
        retrieved_at: retrievedAt
      });
    }
  }

  // 4. Extract Pagination Links (?p=2, ?p=3, ... and total items count)
  const paginationUrls = new Set();
  const pageLinkRegex = /<a[^>]+href="([^"]+\?p=\d+[^"]*)"[^>]*>/gi;
  let pm;
  while ((pm = pageLinkRegex.exec(html)) !== null) {
    const pUrl = normalizeGhsUrl(pm[1], normPageUrl);
    if (pUrl) {
      paginationUrls.add(pUrl);
      discoveredUrls.add(pUrl);
    }
  }
  // Also check "1-24 of 170 Items" toolbar to ensure no pagination page is silently skipped!
  const amountMatch = html.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+Items/i);
  if (amountMatch) {
    const perPage = parseInt(amountMatch[2], 10) - parseInt(amountMatch[1], 10) + 1;
    const totalItems = parseInt(amountMatch[3], 10);
    if (perPage > 0 && totalItems > perPage) {
      const totalPages = Math.ceil(totalItems / perPage);
      const basePageUrl = normPageUrl.replace(/\?.*$/, '');
      for (let p = 2; p <= Math.min(totalPages, 50); p++) {
        const synthPageUrl = `${basePageUrl}?p=${p}`;
        paginationUrls.add(synthPageUrl);
        discoveredUrls.add(synthPageUrl);
      }
    }
  }

  // 5. Extract Product Cards on Model / Category pages
  const prodItemRegex = /<li[^>]*class="[^"]*products__item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let pim;
  while ((pim = prodItemRegex.exec(html)) !== null) {
    const cardHtml = pim[1];
    const linkMatch = cardHtml.match(/<a[^>]*class="[^"]*products__item-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const prodUrl = normalizeGhsUrl(linkMatch[1], normPageUrl);
    const prodTitle = stripHtml(linkMatch[2]);
    if (prodUrl) discoveredUrls.add(prodUrl);

    const skuMatch = cardHtml.match(/<span[^>]*class="[^"]*products__item-sku[^"]*"[^>]*>[\s\S]*?<\/span>\s*([\s\S]*?)<\/span>/i) ||
                     cardHtml.match(/data-product-sku="([^"]+)"/i);
    const rawGhsSku = skuMatch ? stripHtml(skuMatch[1]).replace(/^GHS\s+Part\s+no\.?\s*/i, '').trim() : null;

    const separated = separateGhsSkuAndStihlPartNumber(rawGhsSku, null, prodTitle);
    const typeInfo = classifyGhsProductType({
      title: prodTitle,
      ghsSku: separated.ghs_part_number,
      url: prodUrl || ''
    });

    if (separated.part_number_normalized) {
      // Clean description: strip leading part number and "Genuine Stihl" prefix if desired, or keep clean technical description
      let cleanDesc = prodTitle
        .replace(/^\d{4}[\s\-]?\d{3}[\s\-]?\d{4}\s*/i, '')
        .replace(/^Genuine\s+Stihl\s+/i, '')
        .trim() || prodTitle;

      const modelName = currentModel ? currentModel.model_display_name : null;
      const canonicalModelId = currentModel ? currentModel.canonical_model_id : null;

      parts.push({
        part_number: separated.part_number_normalized,
        part_number_raw: separated.part_number_raw,
        part_number_display: separated.part_number_display,
        description: cleanDesc,
        raw_title: prodTitle,
        manufacturer: typeInfo.manufacturer,
        product_type: typeInfo.product_type,
        ghs_part_number: separated.ghs_part_number,
        product_url: prodUrl,
        source_model: currentModel ? currentModel.model_raw : null,
        canonical_model: modelName,
        canonical_model_id: canonicalModelId,
        diagram_code: null,
        diagram_title: null,
        diagram_url: null,
        position_number: null,
        source_url: normPageUrl,
        retrieved_at: retrievedAt,
        source_authority: GHS_AUTHORITY,
        source_status: GHS_SOURCE_STATUS
      });

      if (canonicalModelId) {
        fitments.push({
          canonical_model: modelName,
          canonical_model_id: canonicalModelId,
          variant_key: currentModel.variant_key || 'base',
          source_model: currentModel.model_raw,
          part_number: separated.part_number_normalized,
          part_number_display: separated.part_number_display,
          description: cleanDesc,
          product_type: typeInfo.product_type,
          manufacturer: typeInfo.manufacturer,
          ghs_part_number: separated.ghs_part_number,
          diagram_code: null,
          diagram_title: null,
          position_number: null,
          model_page_url: currentModel.model_page_url,
          diagram_page_url: null,
          product_url: prodUrl,
          source_url: normPageUrl,
          source: 'GHS',
          authority: GHS_AUTHORITY,
          retrieved_at: retrievedAt
        });
      }
    }
  }

  // 6. If this is a Diagram Page: extract diagram metadata, image URL, and grouped items table (`groupQtyInput`)
  if (isDiagramPage) {
    // Find parent model from breadcrumbs if present
    let breadcrumbModel = null;
    if (breadcrumbs.length >= 2) {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      if (parentCrumb && parentCrumb.label && !['Stihl Parts Diagrams', 'Parts Diagrams', 'Home'].includes(parentCrumb.label)) {
        const normParent = normalizeGhsModel(parentCrumb.label);
        if (normParent) {
          const catMap = mapGhsCategoryToCanonical(hierarchyLabels[0] || parentCrumb.label, hierarchyLabels.slice(0, -2));
          breadcrumbModel = {
            source: 'GHS',
            source_authority: GHS_AUTHORITY,
            discovery_method: GHS_DISCOVERY_METHOD,
            ...normParent,
            category: catMap.category,
            category_slug: catMap.category_slug,
            ghs_category: catMap.ghs_category,
            subcategory_hierarchy: hierarchyLabels.slice(0, -2),
            model_page_url: parentCrumb.url || normPageUrl,
            discovered_on_url: normPageUrl,
            retrieved_at: retrievedAt
          };
          models.push(breadcrumbModel);
        }
      }
    }

    const parsedDiag = parseGhsDiagramLabel(h1 || pageTitle, breadcrumbModel ? breadcrumbModel.model_display_name : null);
    if (parsedDiag) {
      // If breadcrumb didn't give us a model record, create one from the diagram header!
      if (!breadcrumbModel && parsedDiag.model) {
        const normFromDiag = normalizeGhsModel(parsedDiag.model_raw);
        if (normFromDiag) {
          const catMap = mapGhsCategoryToCanonical(hierarchyLabels[0] || parsedDiag.model, hierarchyLabels);
          breadcrumbModel = {
            source: 'GHS',
            source_authority: GHS_AUTHORITY,
            discovery_method: GHS_DISCOVERY_METHOD,
            ...normFromDiag,
            category: catMap.category,
            category_slug: catMap.category_slug,
            ghs_category: catMap.ghs_category,
            subcategory_hierarchy: hierarchyLabels,
            model_page_url: normPageUrl,
            discovered_on_url: normPageUrl,
            retrieved_at: retrievedAt
          };
          models.push(breadcrumbModel);
        }
      }

      // Extract diagram image URL
      const imgMatch =
        html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/i) ||
        html.match(/<img[^>]*src="([^"]*\/media\/catalog\/product\/[^"]+)"[^>]*alt="Genuine Stihl/i) ||
        html.match(/<img[^>]*src="([^"]*\/media\/catalog\/product\/[^"]+)"/i);
      const diagImgUrl = imgMatch ? decodeHtmlEntities(imgMatch[1]).trim() : null;
      const diagIdentifier = `${parsedDiag.canonical_model_id}__${parsedDiag.diagram_code.toLowerCase()}__${SectionNormalizer.normalizeSectionKey(parsedDiag.diagram_title)}`;

      diagrams.push({
        model: parsedDiag.model,
        model_raw: parsedDiag.model_raw,
        canonical_model_id: parsedDiag.canonical_model_id,
        variant_key: parsedDiag.variant_key,
        diagram_code: parsedDiag.diagram_code,
        diagram_title: parsedDiag.diagram_title,
        diagram_full_label: parsedDiag.diagram_full_label,
        diagram_identifier: diagIdentifier,
        diagram_page_url: normPageUrl,
        diagram_source_url: breadcrumbModel ? breadcrumbModel.model_page_url : normPageUrl,
        diagram_image_url: diagImgUrl,
        source_authority: GHS_AUTHORITY,
        retrieved_at: retrievedAt
      });

      // Extract grouped items from x-magento-init JSON (`groupQtyInput`)
      const magentoInits = [...html.matchAll(/<script[^>]*type="text\/x-magento-init"[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const m of magentoInits) {
        if (m[1].includes('groupQtyInput')) {
          try {
            const parsedJson = JSON.parse(m[1]);
            const items = parsedJson?.['*']?.['Magento_Ui/js/core/app']?.components?.groupQtyInput?.items || [];
            for (const item of items) {
              const itemUrl = normalizeGhsUrl(item.url, normPageUrl);
              if (itemUrl) discoveredUrls.add(itemUrl);

              const rawSku = item.sku ? String(item.sku).trim() : null;
              const rawName = item.name ? stripHtml(String(item.name)) : '';
              const posRaw = item.ref !== undefined && item.ref !== null ? String(item.ref).trim() : null;
              const posNorm = PartNormalizer.normalizeDiagramPosition(posRaw);

              const separated = separateGhsSkuAndStihlPartNumber(rawSku, null, `${rawName} ${itemUrl || ''}`);
              const typeInfo = classifyGhsProductType({
                title: rawName,
                ghsSku: separated.ghs_part_number,
                url: itemUrl || ''
              });

              if (separated.part_number_normalized) {
                parts.push({
                  part_number: separated.part_number_normalized,
                  part_number_raw: separated.part_number_raw,
                  part_number_display: separated.part_number_display,
                  description: rawName || `STIHL ${separated.part_number_display}`,
                  raw_title: rawName,
                  manufacturer: typeInfo.manufacturer,
                  product_type: typeInfo.product_type,
                  ghs_part_number: separated.ghs_part_number,
                  product_url: itemUrl,
                  source_model: parsedDiag.model_raw,
                  canonical_model: parsedDiag.model,
                  canonical_model_id: parsedDiag.canonical_model_id,
                  diagram_code: parsedDiag.diagram_code,
                  diagram_title: parsedDiag.diagram_title,
                  diagram_url: normPageUrl,
                  position_number: posNorm,
                  source_url: normPageUrl,
                  retrieved_at: retrievedAt,
                  source_authority: GHS_AUTHORITY,
                  source_status: GHS_SOURCE_STATUS
                });

                fitments.push({
                  canonical_model: parsedDiag.model,
                  canonical_model_id: parsedDiag.canonical_model_id,
                  variant_key: parsedDiag.variant_key || 'base',
                  source_model: parsedDiag.model_raw,
                  part_number: separated.part_number_normalized,
                  part_number_display: separated.part_number_display,
                  description: rawName || `STIHL ${separated.part_number_display}`,
                  product_type: typeInfo.product_type,
                  manufacturer: typeInfo.manufacturer,
                  ghs_part_number: separated.ghs_part_number,
                  diagram_code: parsedDiag.diagram_code,
                  diagram_title: parsedDiag.diagram_title,
                  position_number: posNorm,
                  model_page_url: breadcrumbModel ? breadcrumbModel.model_page_url : normPageUrl,
                  diagram_page_url: normPageUrl,
                  product_url: itemUrl,
                  source_url: normPageUrl,
                  source: 'GHS',
                  authority: GHS_AUTHORITY,
                  retrieved_at: retrievedAt
                });
              }
            }
          } catch {
            // Ignore malformed JSON block
          }
        }
      }
    }
  }

  // 7. If this is a Product Page: extract specs table (Magento 1 & Magento 2)
  if (isProductPage) {
    const specs = {};
    // Match both <tr><td class="label">K</td><td class="data">V</td></tr> and <tr><th scope="row">K</th><td data-th="...">V</td></tr>
    const trRegex = /<tr[^>]*>\s*<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let trm;
    while ((trm = trRegex.exec(html)) !== null) {
      const k = stripHtml(trm[1]).toLowerCase().replace(/:$/, '').trim();
      const v = stripHtml(trm[2]).trim();
      if (k && v) specs[k] = v;
    }

    const skuItemprop = (html.match(/<[^>]*itemprop="sku"[^>]*>([\s\S]*?)<\/[^>]+>/i) || [])[1];
    const ghsSkuRaw = specs['ghs part no.'] || specs['ghs part no'] || (skuItemprop ? stripHtml(skuItemprop) : null);
    const oemNoRaw = specs['oem no.'] || specs['oem no'] || null;
    const crossRefsRaw = specs['cross references'] || '';
    const mfgRaw = specs['manufacturer'] || '';
    const partTypeRaw = specs['part type'] || '';
    const fitsBrandsRaw = specs['fits brands'] || '';

    // Check description block
    const descMatch =
      html.match(/<div[^>]*class="[^"]*attribute\s+description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*product-specs[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const descText = descMatch ? stripHtml(descMatch[1]) : '';

    // Only process if it is a Stihl or Viking part
    const isStihlRelated =
      mfgRaw.toLowerCase().includes('stihl') ||
      fitsBrandsRaw.toLowerCase().includes('stihl') ||
      h1.toLowerCase().includes('stihl') ||
      normPageUrl.toLowerCase().includes('stihl');

    if (isStihlRelated) {
      const separated = separateGhsSkuAndStihlPartNumber(ghsSkuRaw, oemNoRaw, `${h1} ${crossRefsRaw} ${normPageUrl}`);
      const typeInfo = classifyGhsProductType({
        title: h1,
        description: descText,
        manufacturer: mfgRaw,
        partType: partTypeRaw,
        ghsSku: separated.ghs_part_number,
        url: normPageUrl
      });

      if (separated.part_number_normalized) {
        let cleanTitle = h1
          .replace(/^\d{4}[\s\-]?\d{3}[\s\-]?\d{4}\s*/i, '')
          .replace(/\s*-\s*\d{4}[\s\-]?\d{3}[\s\-]?\d{4}$/i, '')
          .replace(/^Genuine\s+Stihl\s+/i, '')
          .trim() || h1;

        // Extract suitable models from title or description if explicitly stated
        // e.g. "Stihl TS400 Gasket Set - 4223 007 1050", "Suitable for Stihl TS400, TS410, TS420"
        const extractedModels = extractSuitableStihlModelsFromText(`${h1} ${descText}`);

        parts.push({
          part_number: separated.part_number_normalized,
          part_number_raw: separated.part_number_raw,
          part_number_display: separated.part_number_display,
          description: cleanTitle,
          raw_title: h1,
          manufacturer: typeInfo.manufacturer,
          product_type: typeInfo.product_type,
          ghs_part_number: separated.ghs_part_number,
          cross_references: crossRefsRaw ? crossRefsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
          product_url: normPageUrl,
          source_model: extractedModels[0]?.model_raw || null,
          canonical_model: extractedModels[0]?.model_display_name || null,
          canonical_model_id: extractedModels[0]?.canonical_model_id || null,
          diagram_code: null,
          diagram_title: null,
          diagram_url: null,
          position_number: null,
          source_url: normPageUrl,
          retrieved_at: retrievedAt,
          source_authority: GHS_AUTHORITY,
          source_status: GHS_SOURCE_STATUS
        });

        for (const em of extractedModels) {
          fitments.push({
            canonical_model: em.model_display_name,
            canonical_model_id: em.canonical_model_id,
            variant_key: em.variant_key || 'base',
            source_model: em.model_raw,
            part_number: separated.part_number_normalized,
            part_number_display: separated.part_number_display,
            description: cleanTitle,
            product_type: typeInfo.product_type,
            manufacturer: typeInfo.manufacturer,
            ghs_part_number: separated.ghs_part_number,
            diagram_code: null,
            diagram_title: null,
            position_number: null,
            model_page_url: null,
            diagram_page_url: null,
            product_url: normPageUrl,
            source_url: normPageUrl,
            source: 'GHS',
            authority: GHS_AUTHORITY,
            retrieved_at: retrievedAt
          });
        }
      }
    }
  }

  return {
    page_url: normPageUrl,
    page_type: pageType,
    h1,
    page_title: pageTitle,
    breadcrumbs,
    categories,
    models,
    diagrams,
    parts,
    fitments,
    pagination_urls: [...paginationUrls],
    discovered_urls: [...discoveredUrls]
  };
}

/**
 * Extracts explicit STIHL machine model designations from product titles/descriptions
 * (e.g. "TS400", "TS410", "FS450", "MS880", "084", "088", "HS45").
 */
export function extractSuitableStihlModelsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const results = [];
  const seen = new Set();

  // Strip 11-digit STIHL part numbers and chain gauge/dimension tokens first so middle digits are never mistaken for models
  const sanitized = text
    .replace(/\b(?:ST\s*)?\d{4}[\s\-_.]*\d{3}[\s\-_.]*\d{4}\b/gi, ' ')
    .replace(/\b0?\.\d{3}\s*"?/g, ' ')
    .replace(/\b0(?:43|50|58|63)\s*"/g, ' ');

  // Match explicit STIHL machine prefixes + numbers (excluding part numbers and 0000)
  const regex = /\b((?:MS|MSA|MSE|FS|FSA|FSE|HS|HSA|HSE|KM|KMA|BG|BGA|BGE|BR|BRA|TS|TSA|HT|HTA|HTE|HL|HLA|HLE|SH|SHE|SE|RE|REA|RM|RMA|RME|RMI|RT|MB|BT|FR|FC|SP|SPA|SG|SR|FW|GS)\s*[1-9]\d{1,3}(?:\.\d)?(?:\s*(?:C-BE|C-M|C-E|C-B|C-BQ|TC-E|RC-E|AVE|2-MIX))?|0(?:08|09|10|11|12|15|17|18|19|20|21|23|24|25|26|28|29|30|31|32|34|36|38|39|40|41|42|44|45|46|48|51|56|64|66|70|75|76|84|88|90)(?:S|AV|AVE)?|08\s*S)\b/gi;
  let m;
  while ((m = regex.exec(sanitized)) !== null) {
    const raw = m[1].toUpperCase().trim();
    const norm = normalizeGhsModel(raw);
    if (norm && !seen.has(norm.canonical_model_id)) {
      seen.add(norm.canonical_model_id);
      results.push(norm);
    }
  }
  return results;
}
