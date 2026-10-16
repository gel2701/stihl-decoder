#!/usr/bin/env node
/**
 * Phase 54F-A — Controlled Technical Reharvest Pilot & Section Resolution
 * 
 * Executes an evidence-first, fail-closed, rate-limited harvest pilot for diagram sections.
 * 
 * Hard constraints:
 * - MAX_MODELS = 50
 * - MAX_HTTP_REQUESTS = 250
 * - CONCURRENCY = 1
 * - Rate limit >= 3000ms between requests to same host
 * - User Agent: StihlDecoder-Research/1.0 (+https://www.stihldecoder.nl/)
 * - Staging first: data/harvest/phase54f/
 * - Frozen canonical counts: PARTS = 17082, FITMENTS = 175106, CONFIGURATIONS = 766
 * - Runtime scraping = 0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PartNormalizer, FITMENT_SCOPES } from '../src/parts/PartNormalizer.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASELINE_SHA = 'b2a8d4259d8c7661c31e68af3b043a8acec846fc';
const USER_AGENT = 'StihlDecoder-Research/1.0 (+https://www.stihldecoder.nl/)';
const RATE_LIMIT_MS = 3000;
const MAX_MODELS = 50;
const MAX_HTTP_REQUESTS = 250;

const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const QUEUE_FILE = path.join(rootDir, 'data', 'harvest', 'phase54f_pilot_queue.json');
const MANIFEST_FILE = path.join(STAGING_DIR, 'manifest.json');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const QUARANTINE_FILE = path.join(STAGING_DIR, 'quarantine.jsonl');
const CHECKPOINT_FILE = path.join(STAGING_DIR, 'checkpoint.json');
const CONFLICTS_FILE = path.join(STAGING_DIR, 'conflicts.json');
const CANDIDATE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');

// Ensure staging directory exists
if (!fs.existsSync(STAGING_DIR)) {
  fs.mkdirSync(STAGING_DIR, { recursive: true });
}

// HTTP client with rate limiting, response hashing, and request tracking
class RateLimitedHttpClient {
  constructor(userAgent, minDelayMs, maxRequests) {
    this.userAgent = userAgent;
    this.minDelayMs = minDelayMs;
    this.maxRequests = maxRequests;
    this.requestsUsed = 0;
    this.lastRequestTime = 0;
  }

  async get(url) {
    if (this.requestsUsed >= this.maxRequests) {
      throw new Error(`HARD STOP: HTTP request budget exceeded (${this.requestsUsed}/${this.maxRequests})`);
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minDelayMs) {
      const waitTime = this.minDelayMs - elapsed;
      await new Promise(r => setTimeout(r, waitTime));
    }

    this.requestsUsed++;
    this.lastRequestTime = Date.now();

    return new Promise((resolve) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const bodySha256 = crypto.createHash('sha256').update(body).digest('hex');
          resolve({
            status: res.statusCode,
            body,
            contentType: res.headers['content-type'] || '',
            bodySha256,
            url
          });
        });
      });

      req.on('error', (err) => {
        resolve({
          status: 500,
          error: err.message,
          body: '',
          contentType: '',
          bodySha256: null,
          url
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 408,
          error: 'NETWORK_TIMEOUT',
          body: '',
          contentType: '',
          bodySha256: null,
          url
        });
      });
    });
  }
}

// -----------------------------------------------------------------------------
// COMMAND: --build-queue
// -----------------------------------------------------------------------------
function buildQueue() {
  console.log('Building Phase 54F-A pilot queue...');
  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });

  // Diverse pilot models covering chainsaws, brushcutters, cut-off saws, blowers, hedge trimmers
  const pilotModelIds = [
    '034', 'ms_261', 'ms_362', '038', '066', 'ms_260',
    'fs_55', 'fs_85', 'fs_400',
    'ts_350', 'ts_410',
    'bg_86', 'br_600',
    'hs_81', 'hs_45',
    '009'
  ];

  if (pilotModelIds.length > MAX_MODELS) {
    throw new Error(`Pilot models (${pilotModelIds.length}) exceed MAX_MODELS (${MAX_MODELS})`);
  }

  const placeholders = pilotModelIds.map(() => '?').join(',');

  const modelRows = db.prepare(`
    SELECT 
      f.canonical_model_id,
      COALESCE(m.model_name, UPPER(REPLACE(f.canonical_model_id, '_', ' '))) as model_name,
      COALESCE(m.category, 'Onbekend') as category,
      COALESCE(m.category_slug, 'onbekend') as category_slug,
      COUNT(f.fitment_id) as total_fitments,
      SUM(CASE WHEN f.section_name = 'Unresolved Diagram Section' THEN 1 ELSE 0 END) as unresolved_fitments,
      SUM(CASE WHEN f.section_name != 'Unresolved Diagram Section' THEN 1 ELSE 0 END) as resolved_fitments,
      SUM(CASE WHEN f.diagram_position NOT IN ('POS_UNSPECIFIED', 'OFFICIAL_REF', '-1', '0') THEN 1 ELSE 0 END) as meaningful_positions,
      COUNT(DISTINCT f.part_number) as unique_parts
    FROM model_part_fitments f
    LEFT JOIN models m ON m.id = 'stihl_' || f.canonical_model_id
    WHERE f.canonical_model_id IN (${placeholders})
    GROUP BY f.canonical_model_id
    ORDER BY unresolved_fitments DESC
  `).all(...pilotModelIds);

  const configsRows = db.prepare(`
    SELECT DISTINCT
      canonical_model_id,
      configuration_key,
      configuration_name
    FROM parts_model_configurations
    WHERE canonical_model_id IN (${placeholders})
  `).all(...pilotModelIds);

  const configsByModel = new Map();
  for (const cfg of configsRows) {
    if (!configsByModel.has(cfg.canonical_model_id)) {
      configsByModel.set(cfg.canonical_model_id, []);
    }
    configsByModel.get(cfg.canonical_model_id).push(cfg);
  }

  const queueItems = modelRows.map((m, index) => {
    const cfgs = configsByModel.get(m.canonical_model_id) || [];
    return {
      queue_index: index + 1,
      canonical_model_id: m.canonical_model_id,
      model_name: m.model_name,
      category: m.category,
      category_slug: m.category_slug,
      total_fitments: m.total_fitments,
      unresolved_fitments: m.unresolved_fitments,
      meaningful_positions: m.meaningful_positions,
      configurations: cfgs.map(c => ({
        configuration_key: c.configuration_key,
        configuration_name: c.configuration_name
      })),
      primary_source: 'diyspareparts',
      priority_rank: index + 1
    };
  });

  const queueDoc = {
    schema_version: '1.0.0',
    description: 'Phase 54F-A Controlled Technical Reharvest Pilot Queue',
    created_at: new Date().toISOString(),
    baseline_sha: BASELINE_SHA,
    max_models: MAX_MODELS,
    max_requests: MAX_HTTP_REQUESTS,
    models_count: queueItems.length,
    configurations_count: configsRows.length,
    models: queueItems
  };

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queueDoc, null, 2), 'utf8');
  console.log(`Queue saved to: ${QUEUE_FILE}`);

  // Calculate & print Section 8 Queue Metrics
  const metrics = db.prepare(`
    SELECT 
      COUNT(DISTINCT canonical_model_id) as pilot_models,
      COUNT(DISTINCT configuration_key) as pilot_configurations,
      SUM(CASE WHEN section_name = 'Unresolved Diagram Section' THEN 1 ELSE 0 END) as pilot_unresolved_fitments,
      COUNT(DISTINCT CASE WHEN section_name = 'Unresolved Diagram Section' THEN part_number END) as pilot_parts_without_meaningful_section,
      SUM(CASE WHEN diagram_position NOT IN ('POS_UNSPECIFIED', 'OFFICIAL_REF', '-1', '0') THEN 1 ELSE 0 END) as pilot_fitments_with_meaningful_position,
      SUM(CASE WHEN diagram_position IN ('POS_UNSPECIFIED', 'OFFICIAL_REF', '-1', '0') THEN 1 ELSE 0 END) as pilot_fitments_without_meaningful_position
    FROM model_part_fitments
    WHERE canonical_model_id IN (${placeholders})
  `).get(...pilotModelIds);

  console.log('\n==================================================');
  console.log('SECTION 8 — QUEUE METRICS');
  console.log('==================================================');
  console.log(`PILOT_MODELS = ${metrics.pilot_models}`);
  console.log(`PILOT_CONFIGURATIONS = ${metrics.pilot_configurations}`);
  console.log(`PILOT_UNRESOLVED_FITMENTS = ${metrics.pilot_unresolved_fitments}`);
  console.log(`PILOT_PARTS_WITHOUT_MEANINGFUL_SECTION = ${metrics.pilot_parts_without_meaningful_section}`);
  console.log(`PILOT_FITMENTS_WITH_MEANINGFUL_POSITION = ${metrics.pilot_fitments_with_meaningful_position}`);
  console.log(`PILOT_FITMENTS_WITHOUT_MEANINGFUL_POSITION = ${metrics.pilot_fitments_without_meaningful_position}`);
  console.log('==================================================\n');

  return queueDoc;
}

// -----------------------------------------------------------------------------
// COMMAND: --dry-run
// -----------------------------------------------------------------------------
function dryRun() {
  console.log('Executing Phase 54F-A Harvester Dry Run...');

  if (!fs.existsSync(QUEUE_FILE)) {
    buildQueue();
  }

  const queueDoc = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const models = queueDoc.models || [];

  console.log(`Loaded ${models.length} pilot models from queue.`);

  // Estimate requests:
  // Each model page: 1 request
  // Estimated sections per resolved model: ~12-15 requests
  // Models known to be 404 or 0 sections take 1 request only
  const knownNoData = new Set(['ms_362', '038', '066']);
  let estimatedRequests = 0;

  for (const m of models) {
    estimatedRequests += 1; // Model diagram page request
    if (!knownNoData.has(m.canonical_model_id)) {
      estimatedRequests += 14; // Average diagram sections
    }
  }

  console.log('\n--- DRY RUN SUMMARY ---');
  console.log(`Models in Queue:      ${models.length} (Max: ${MAX_MODELS})`);
  console.log(`Estimated Requests:   ${estimatedRequests} (Budget: ${MAX_HTTP_REQUESTS})`);
  console.log(`Concurrency:          1`);
  console.log(`Rate Limit:           >= ${RATE_LIMIT_MS} ms`);
  console.log(`User Agent:           ${USER_AGENT}`);
  console.log(`Primary Source:       diyspareparts.com`);
  console.log(`Staging Directory:    ${STAGING_DIR}`);
  console.log(`Candidate Output:     ${CANDIDATE_ENRICHMENT_FILE}`);

  if (estimatedRequests > MAX_HTTP_REQUESTS) {
    console.error(`\nHARD STOP: Estimated requests (${estimatedRequests}) exceed budget (${MAX_HTTP_REQUESTS})!`);
    process.exit(1);
  }

  console.log('\nDRY RUN RESULT: PASS — within all constraints.\n');
}

// -----------------------------------------------------------------------------
// COMMAND: --run / --resume
// -----------------------------------------------------------------------------
async function runHarvest(isResume = false) {
  console.log(`Starting Phase 54F-A Controlled Technical Reharvest Pilot (Resume: ${isResume})...`);

  if (!fs.existsSync(QUEUE_FILE)) {
    buildQueue();
  }

  const queueDoc = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const models = queueDoc.models || [];

  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });

  // Load canonical valid parts set (17082 parts)
  const canonicalPartsSet = new Set(db.prepare('SELECT part_number FROM parts').all().map(r => r.part_number));
  console.log(`Loaded ${canonicalPartsSet.size} canonical parts.`);

  // Load unresolved fitments map for pilot models: key `${canonical_model_id}::${part_number}` -> fitment record
  const fitmentRows = db.prepare(`
    SELECT fitment_id, canonical_model_id, variant_key, configuration_key, configuration_name, fitment_scope, part_number, section_name, diagram_position
    FROM model_part_fitments
  `).all();

  const fitmentLookup = new Map();
  for (const f of fitmentRows) {
    const key = `${f.canonical_model_id}::${f.part_number}`;
    if (!fitmentLookup.has(key)) {
      fitmentLookup.set(key, []);
    }
    fitmentLookup.get(key).push(f);
  }
  console.log(`Loaded ${fitmentRows.length} canonical fitments.`);

  // Checkpoint management
  let checkpoint = {
    queue_index: 0,
    completed_model_ids: [],
    requests_used: 0,
    success_count: 0,
    failure_count: 0,
    last_completed_target: null,
    updated_at: new Date().toISOString()
  };

  if (isResume && fs.existsSync(CHECKPOINT_FILE)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`Resuming from checkpoint: ${checkpoint.completed_model_ids.length} models completed.`);
    } catch (e) {
      console.warn('Could not read checkpoint; starting fresh.');
    }
  }

  const completedSet = new Set(checkpoint.completed_model_ids || []);

  const httpClient = new RateLimitedHttpClient(USER_AGENT, RATE_LIMIT_MS, MAX_HTTP_REQUESTS);
  httpClient.requestsUsed = checkpoint.requests_used || 0;

  const diySource = new DiySparePartsSource(httpClient);

  // Setup streams
  const obsStream = fs.createWriteStream(OBSERVATIONS_FILE, { flags: isResume ? 'a' : 'w' });
  const quarStream = fs.createWriteStream(QUARANTINE_FILE, { flags: isResume ? 'a' : 'w' });

  const existingObsIds = new Set();
  if (isResume && fs.existsSync(OBSERVATIONS_FILE)) {
    const lines = fs.readFileSync(OBSERVATIONS_FILE, 'utf8').split('\n');
    for (const l of lines) {
      if (l.trim()) {
        try {
          const parsed = JSON.parse(l.trim());
          if (parsed.evidence_id) existingObsIds.add(parsed.evidence_id);
        } catch (e) {}
      }
    }
  }

  let totalRawObs = 0;
  let totalValidObs = 0;
  let totalDuplicateObs = 0;
  let totalQuarantinedObs = 0;
  let totalConflictingObs = 0;

  let modelsAttempted = checkpoint.completed_model_ids.length;
  let modelsResolved = checkpoint.success_count || 0;
  let modelsNoData = checkpoint.failure_count || 0;
  let modelsBlocked = 0;

  const targetResults = [];
  const candidateEnrichments = [];
  const conflicts = [];
  const newPartCandidates = [];
  const newFitmentCandidates = [];

  const startTime = new Date().toISOString();

  try {
    for (const model of models) {
      if (completedSet.has(model.canonical_model_id)) {
        console.log(`Skipping already completed model: ${model.canonical_model_id}`);
        continue;
      }

      if (httpClient.requestsUsed >= MAX_HTTP_REQUESTS - 5) {
        console.warn(`Approaching request budget limit (${httpClient.requestsUsed}/${MAX_HTTP_REQUESTS}). Stopping safely.`);
        break;
      }

      console.log(`\n[${model.queue_index}/${models.length}] Harvesting model: ${model.model_name} (${model.canonical_model_id})...`);
      modelsAttempted++;

      const modelSlug = diySource.getModelSlug(model.model_name);
      const modelUrl = `https://www.diyspareparts.com/parts/stihl/diagrams/${modelSlug}/`;

      const modelDiscovery = await diySource.discoverModel(model.model_name);

      if (!modelDiscovery.found) {
        if (modelDiscovery.http_status === 403) {
          console.warn(`  SOURCE_ACCESS_BLOCKED on ${model.canonical_model_id}`);
          modelsBlocked++;
          targetResults.push({ model_id: model.canonical_model_id, status: 'SOURCE_ACCESS_BLOCKED', http_status: 403 });
        } else if (modelDiscovery.http_status === 404) {
          console.log(`  SOURCE_NOT_FOUND (HTTP 404) on ${model.canonical_model_id}`);
          modelsNoData++;
          targetResults.push({ model_id: model.canonical_model_id, status: 'SOURCE_NOT_FOUND', http_status: 404 });
        } else {
          console.log(`  NO_TECHNICAL_DATA on ${model.canonical_model_id} (${modelDiscovery.error})`);
          modelsNoData++;
          targetResults.push({ model_id: model.canonical_model_id, status: 'NO_TECHNICAL_DATA', error: modelDiscovery.error });
        }
      } else if (modelDiscovery.sections.length === 0) {
        console.log(`  NO_TECHNICAL_DATA: 0 diagram sections found for ${model.canonical_model_id}`);
        modelsNoData++;
        targetResults.push({ model_id: model.canonical_model_id, status: 'NO_TECHNICAL_DATA', sections: 0 });
      } else {
        console.log(`  Found ${modelDiscovery.sections.length} diagram sections.`);
        modelsResolved++;
        let modelObsCount = 0;

        for (const sec of modelDiscovery.sections) {
          if (httpClient.requestsUsed >= MAX_HTTP_REQUESTS) {
            console.warn(`Hit MAX_HTTP_REQUESTS limit (${MAX_HTTP_REQUESTS}). Ceasing section requests.`);
            break;
          }

          console.log(`    Fetching section: ${sec.sectionName}...`);
          const secResult = await diySource.fetchSection(sec);

          if (secResult.status === 'PARSED' && secResult.parts.length > 0) {
            const retrievedAt = new Date().toISOString();

            for (const part of secResult.parts) {
              totalRawObs++;

              // 1. Part number validation (must be strictly 11 digits)
              const canonicalPart = PartNormalizer.normalizePartNumber(part.part_number);
              if (!canonicalPart) {
                totalQuarantinedObs++;
                quarStream.write(JSON.stringify({
                  reason: 'INVALID_PART_NUMBER',
                  raw_part: part.part_number,
                  model_id: model.canonical_model_id,
                  section: sec.sectionName,
                  source_url: sec.sectionUrl,
                  retrieved_at: retrievedAt
                }) + '\n');
                continue;
              }

              // 2. Deterministic Section Normalization
              const canonicalSection = SectionNormalizer.normalizeSectionName(sec.sectionName);
              if (!canonicalSection) {
                totalQuarantinedObs++;
                quarStream.write(JSON.stringify({
                  reason: 'UNRESOLVED_OR_INVALID_SECTION',
                  part_number: canonicalPart,
                  raw_section: sec.sectionName,
                  model_id: model.canonical_model_id,
                  source_url: sec.sectionUrl,
                  retrieved_at: retrievedAt
                }) + '\n');
                continue;
              }

              const sectionKey = SectionNormalizer.normalizeSectionKey(canonicalSection);

              // 3. Evidence identity & deduplication
              const evidenceId = `ev_p54f_${model.canonical_model_id}_${canonicalPart}_${sectionKey}`;
              if (existingObsIds.has(evidenceId)) {
                totalDuplicateObs++;
                continue;
              }
              existingObsIds.add(evidenceId);

              // Format observation record with complete raw provenance (fail-closed model-level scope)
              const observation = {
                evidence_id: evidenceId,
                part_number: canonicalPart,
                canonical_model_id: model.canonical_model_id,
                variant_key: null,
                configuration_key: null,
                configuration_name: null,
                source_scope: 'MODEL_LEVEL_ONLY',
                fitment_scope: FITMENT_SCOPES.BASE_MODEL_CONFIRMED,
                section_key: sectionKey,
                section_name: canonicalSection,
                section_name_raw: sec.sectionName,
                section_attribution_status: 'STRUCTURED_DIAGRAM_MATCH',
                diagram_position: null,
                diagram_position_raw: null,
                source_id: 'diyspareparts',
                source_url: sec.sectionUrl,
                requested_url: sec.sectionUrl,
                final_url: sec.sectionUrl,
                http_status: secResult.http_status || 200,
                source_response_sha256: secResult.response_sha256,
                part_name_raw: part.part_name_raw,
                quantity: 1,
                retrieved_at: retrievedAt
              };

              obsStream.write(JSON.stringify(observation) + '\n');
              totalValidObs++;
              modelObsCount++;

              // 4. Candidate canonical validation
              if (!canonicalPartsSet.has(canonicalPart)) {
                newPartCandidates.push({
                  part_number: canonicalPart,
                  part_name_raw: part.part_name_raw,
                  model_id: model.canonical_model_id
                });
                continue;
              }

              const fitmentKey = `${model.canonical_model_id}::${canonicalPart}`;
              const matchingFitments = fitmentLookup.get(fitmentKey);

              if (!matchingFitments || matchingFitments.length === 0) {
                newFitmentCandidates.push({
                  canonical_model_id: model.canonical_model_id,
                  part_number: canonicalPart,
                  section_name: canonicalSection
                });
                continue;
              }
            }
          }
        }

        console.log(`  Model completed: ${modelObsCount} valid observations recorded.`);
        targetResults.push({
          model_id: model.canonical_model_id,
          status: 'RESOLVED',
          sections: modelDiscovery.sections.length,
          observations: modelObsCount
        });
      }

      // Checkpoint after each completed model
      completedSet.add(model.canonical_model_id);
      checkpoint = {
        queue_index: model.queue_index,
        completed_model_ids: [...completedSet],
        requests_used: httpClient.requestsUsed,
        success_count: modelsResolved,
        failure_count: modelsNoData,
        last_completed_target: model.canonical_model_id,
        updated_at: new Date().toISOString()
      };
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
    }
  } finally {
    obsStream.end();
    quarStream.end();
  }

  const endTime = new Date().toISOString();

  // Read all valid observations from file for post-processing
  const allObs = fs.readFileSync(OBSERVATIONS_FILE, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  // Group by model_id + part_number to detect multi-section ambiguity
  const obsByPair = new Map();
  for (const obs of allObs) {
    const pairKey = `${obs.canonical_model_id}::${obs.part_number}`;
    if (!obsByPair.has(pairKey)) {
      obsByPair.set(pairKey, []);
    }
    obsByPair.get(pairKey).push(obs);
  }

  const ambiguousPairs = [];
  const safePairs = [];
  let ambiguousObsCount = 0;

  for (const [pairKey, list] of obsByPair.entries()) {
    const distinctSections = new Set(list.map(o => o.section_name));
    if (distinctSections.size > 1) {
      ambiguousPairs.push({
        pair_key: pairKey,
        canonical_model_id: list[0].canonical_model_id,
        part_number: list[0].part_number,
        distinct_sections: [...distinctSections],
        observations_count: list.length
      });
      ambiguousObsCount += list.length;
    } else {
      safePairs.push({
        pair_key: pairKey,
        canonical_model_id: list[0].canonical_model_id,
        part_number: list[0].part_number,
        section_name: list[0].section_name,
        section_key: list[0].section_key,
        observation: list[0]
      });
    }
  }

  // Generate candidate enrichments only for safe unambiguous base-model fitments (configuration_key === null)
  const safeEnrichments = [];
  const rejectedConfigSpecific = [];
  const rejectedAmbiguous = [];
  const acceptedEvidenceList = [];

  for (const pair of ambiguousPairs) {
    const fitments = fitmentLookup.get(pair.pair_key) || [];
    for (const f of fitments) {
      rejectedAmbiguous.push({
        fitment_id: f.fitment_id,
        canonical_model_id: f.canonical_model_id,
        part_number: f.part_number,
        reason: 'MULTI_SECTION_MODEL_PART_AMBIGUITY',
        sections: pair.distinct_sections
      });
    }
  }

  // Generate candidate enrichments only for safe unambiguous base-model fitments (fitment_scope === BASE_MODEL_CONFIRMED && configuration_key === null)
  const safeEnrichments = [];
  const rejectedConfigSpecific = [];
  const rejectedExactVariant = [];
  const rejectedAmbiguous = [];
  const acceptedEvidenceList = [];

  for (const pair of ambiguousPairs) {
    const fitments = fitmentLookup.get(pair.pair_key) || [];
    for (const f of fitments) {
      rejectedAmbiguous.push({
        fitment_id: f.fitment_id,
        canonical_model_id: f.canonical_model_id,
        part_number: f.part_number,
        reason: 'MULTI_SECTION_MODEL_PART_AMBIGUITY',
        sections: pair.distinct_sections
      });
    }
  }

  for (const pair of safePairs) {
    const fitments = fitmentLookup.get(pair.pair_key) || [];
    let promotedForPair = false;
    for (const fit of fitments) {
      // Configuration-specific fitments cannot be enriched by model-level evidence
      if (fit.configuration_key !== null) {
        rejectedConfigSpecific.push({
          fitment_id: fit.fitment_id,
          canonical_model_id: fit.canonical_model_id,
          configuration_key: fit.configuration_key,
          part_number: fit.part_number,
          reason: 'MODEL_LEVEL_SCOPE_CANNOT_PROPAGATE_TO_CONFIGURATION_SPECIFIC_FITMENT'
        });
        continue;
      }

      // Phase 54F-A-R2: Scope Hardening — model-level evidence cannot enrich EXACT_VARIANT fitments
      // evidence specificity >= claim specificity
      if (fit.fitment_scope === 'EXACT_VARIANT') {
        rejectedExactVariant.push({
          fitment_id: fit.fitment_id,
          canonical_model_id: fit.canonical_model_id,
          variant_key: fit.variant_key,
          part_number: fit.part_number,
          reason: 'MODEL_LEVEL_SCOPE_CANNOT_PROPAGATE_TO_EXACT_VARIANT_FITMENT'
        });
        continue;
      }

      // Only BASE_MODEL_CONFIRMED fitments can be enriched from MODEL_LEVEL_ONLY evidence
      if (fit.fitment_scope === 'BASE_MODEL_CONFIRMED' && fit.section_name === 'Unresolved Diagram Section') {
        safeEnrichments.push({
          fitment_id: fit.fitment_id,
          canonical_model_id: fit.canonical_model_id,
          configuration_key: fit.configuration_key,
          variant_key: fit.variant_key,
          fitment_scope: fit.fitment_scope,
          part_number: fit.part_number,
          section_key: pair.section_key,
          section_name: pair.section_name,
          source_id: 'diyspareparts',
          source_url: pair.observation.source_url,
          source_response_sha256: pair.observation.source_response_sha256
        });
        promotedForPair = true;
      }
    }
    if (promotedForPair) {
      acceptedEvidenceList.push(pair.observation);
    }
  }

  // Write accepted canonical evidence
  fs.writeFileSync(ACCEPTED_EVIDENCE_FILE, acceptedEvidenceList.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');
  console.log(`Accepted evidence saved to: ${ACCEPTED_EVIDENCE_FILE} (${acceptedEvidenceList.length} records)`);

  // Save conflicts artifact
  fs.writeFileSync(CONFLICTS_FILE, JSON.stringify({
    schema_version: '1.0.0',
    description: 'Ambiguity registry and rejected enrichments (Phase 54F-A-R2 Scope Hardened)',
    generated_at: endTime,
    ambiguity_stats: {
      total_model_part_pairs: obsByPair.size,
      multi_section_model_part_pairs: ambiguousPairs.length,
      ambiguous_source_observations: ambiguousObsCount,
      ambiguous_enrichments_rejected: rejectedAmbiguous.length,
      ambiguous_enrichments_promoted: 0,
      config_specific_enrichments_rejected: rejectedConfigSpecific.length,
      exact_variant_enrichments_rejected: rejectedExactVariant.length,
      model_level_to_exact_variant_leakage: 0,
      null_variant_key_exact_variant_enrichments: 0
    },
    multi_section_model_part_pairs: ambiguousPairs
  }, null, 2), 'utf8');

  // Save candidate canonical enrichment artifact
  const enrichmentDoc = {
    schema_version: '1.0.0',
    description: 'Validated technical section enrichments from Phase 54F-A controlled reharvest pilot (R2 scope hardened)',
    baseline_sha: BASELINE_SHA,
    generated_at: endTime,
    lookup_mode: 'EXACT_FITMENT_ID_ONLY',
    total_enrichments: safeEnrichments.length,
    enrichments: safeEnrichments
  };
  fs.writeFileSync(CANDIDATE_ENRICHMENT_FILE, JSON.stringify(enrichmentDoc, null, 2), 'utf8');
  console.log(`\nCandidate enrichment saved to: ${CANDIDATE_ENRICHMENT_FILE} (${safeEnrichments.length} enrichments)`);

  // Save manifest
  const uniqueNewParts = new Set(newPartCandidates.map(p => p.part_number));
  const uniqueNewFitments = new Set(newFitmentCandidates.map(f => `${f.canonical_model_id}::${f.part_number}`));

  const manifestDoc = {
    schema_version: '1.0.0',
    baseline_sha: BASELINE_SHA,
    started_at: startTime,
    completed_at: endTime,
    max_models: MAX_MODELS,
    models_attempted: modelsAttempted,
    models_completed: completedSet.size,
    models_resolved: modelsResolved,
    models_no_data: modelsNoData,
    models_blocked: modelsBlocked,
    request_budget: MAX_HTTP_REQUESTS,
    requests_used: httpClient.requestsUsed,
    sources_attempted: ['diyspareparts'],
    sources_blocked: modelsBlocked > 0 ? ['diyspareparts'] : [],
    observations_raw: totalRawObs,
    observations_valid: totalValidObs,
    observations_duplicate: totalDuplicateObs,
    observations_quarantined: totalQuarantinedObs,
    observations_conflicting: ambiguousObsCount,
    model_level_only_observations: totalValidObs,
    exact_variant_observations: 0,
    total_enrichments: safeEnrichments.length,
    model_level_enrichments: safeEnrichments.length,
    exact_variant_enrichments: 0,
    model_level_to_exact_variant_leakage: 0,
    null_variant_key_exact_variant_enrichments: 0,
    r1_total_enrichments: 3513,
    r1_safe_base_model_enrichments: 1805,
    r1_invalid_model_level_to_exact_variant: 1708,
    r1_exact_variant_enrichments: 3513, // DEPRECATED legacy field: historically misnamed; 3513 represents R1 total enrichments before variant isolation
    new_part_candidate_observations: newPartCandidates.length,
    unique_new_part_candidates: uniqueNewParts.size,
    new_fitment_candidate_observations: newFitmentCandidates.length,
    unique_new_fitment_candidates: uniqueNewFitments.size,
    canonical_evidence_promoted: acceptedEvidenceList.length,
    staging_only_evidence: totalValidObs - acceptedEvidenceList.length,
    valid_section_enrichments: safeEnrichments.length,
    target_results: targetResults
  };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifestDoc, null, 2), 'utf8');
  console.log(`Manifest saved to: ${MANIFEST_FILE}`);

  console.log('\n==================================================');
  console.log('HARVEST PILOT EXECUTION COMPLETE');
  console.log('==================================================');
  console.log(`MODELS_ATTEMPTED = ${modelsAttempted}`);
  console.log(`MODELS_RESOLVED = ${modelsResolved}`);
  console.log(`MODELS_NO_DATA = ${modelsNoData}`);
  console.log(`HTTP_REQUESTS_USED = ${httpClient.requestsUsed} / ${MAX_HTTP_REQUESTS}`);
  console.log(`VALID_OBSERVATIONS = ${totalValidObs}`);
  console.log(`VALID_SECTION_ENRICHMENTS = ${safeEnrichments.length}`);
  console.log(`QUARANTINED_OBSERVATIONS = ${totalQuarantinedObs}`);
  console.log('==================================================\n');

  return manifestDoc;
}

// -----------------------------------------------------------------------------
// CLI Runner
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--dry-run';

  if (command === '--build-queue') {
    buildQueue();
  } else if (command === '--dry-run') {
    dryRun();
  } else if (command === '--run') {
    await runHarvest(false);
  } else if (command === '--resume') {
    await runHarvest(true);
  } else {
    console.log(`Usage: node scripts/phase54f_reharvest.mjs [--build-queue|--dry-run|--run|--resume]`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal error during execution:', err);
    process.exit(1);
  });
}
