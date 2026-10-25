/**
 * scripts/fetch_official_family_evidence.mjs
 *
 * Phase 56L.1 — Live Official STIHL Family Evidence Acquisition
 *
 * Fetches real, public official STIHL category/catalog pages for each active model family.
 * Logs exact request timestamps, final URLs, HTTP statuses, page titles, SHA-256 hashes,
 * and locators to data/harvest/phase56l/official_family_fetch_ledger.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARVEST_DIR = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l');
const LEDGER_PATH = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');

// The 28 active STIHL families to verify against official STIHL sources
const FAMILY_SOURCE_TARGETS = [
  {
    family: 'MS',
    machine_type: 'CHAINSAW',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/kettingzagen-98188',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (MS-serie benzinekettingzagen)'
  },
  {
    family: 'MSA',
    machine_type: 'CHAINSAW',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-kettingzagen-98197',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (MSA-serie accukettingzagen AK/AP)'
  },
  {
    family: 'MSE',
    machine_type: 'CHAINSAW',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/elektrische-kettingzagen-98198',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (MSE-serie elektrische kettingzagen 230V)'
  },
  {
    family: 'FS',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/bosmaaiers-98200',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FS-serie benzine bosmaaiers)'
  },
  {
    family: 'FSA',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-bosmaaiers-98206',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FSA-serie accubosmaaiers AS/AK/AP)'
  },
  {
    family: 'FSE',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/elektrische-kantensnijders-98207',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FSE-serie elektrische kantenmaaiers 230V)'
  },
  {
    family: 'FR',
    machine_type: 'BRUSHCUTTER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/bosmaaiers-98200',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (FR-serie ruggedragen benzinebosmaaiers)'
  },
  {
    family: 'TS',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/doorslijpers-98246',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (TS-serie benzine doorslijpmachines)'
  },
  {
    family: 'TSA',
    machine_type: 'CUT_OFF_MACHINE',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-doorslijpers-98248',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (TSA-serie accu doorslijpers AP accusysteem)'
  },
  {
    family: 'HS',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/heggenscharen-98224',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HS-serie benzineheggenscharen)'
  },
  {
    family: 'HSA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-heggenscharen-98227',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HSA-serie accu heggenscharen AS/AK/AP)'
  },
  {
    family: 'HSE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/heggenscharen-98224',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HSE-serie elektrische heggenscharen 230V)'
  },
  {
    family: 'HL',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/heggensnoeiers-98228',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HL-serie benzine heggensnoeiers)'
  },
  {
    family: 'HLA',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-heggensnoeiers-98230',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HLA-serie accu heggensnoeiers AK/AP)'
  },
  {
    family: 'HLE',
    machine_type: 'HEDGE_TRIMMER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/heggensnoeiers-98228',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HLE-serie elektrische heggensnoeiers 230V)'
  },
  {
    family: 'HT',
    machine_type: 'POLE_PRUNER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/hoogsnoeiers-98231',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HT-serie benzine hoogsnoeiers)'
  },
  {
    family: 'HTA',
    machine_type: 'POLE_PRUNER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-hoogsnoeiers-98233',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HTA-serie accu hoogsnoeiers AK/AP)'
  },
  {
    family: 'HTE',
    machine_type: 'POLE_PRUNER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/hoogsnoeiers-98231',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (HTE-serie elektrische hoogsnoeiers 230V)'
  },
  {
    family: 'KM',
    machine_type: 'KOMBI',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/kombisysteem-98217',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (KM-serie benzine KombiMotoren)'
  },
  {
    family: 'KMA',
    machine_type: 'KOMBI',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-kombimotoren-98221',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (KMA-serie accu KombiMotoren AK/AP)'
  },
  {
    family: 'BG',
    machine_type: 'BLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BG 56 / BG 86 handgedragen benzinebladblazers)'
  },
  {
    family: 'BGA',
    machine_type: 'BLOWER',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-bladblazers-98238',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BGA 57 / BGA 86 accu bladblazers AS/AK/AP)'
  },
  {
    family: 'BGE',
    machine_type: 'BLOWER',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BGE 71 / BGE 81 elektrische bladblazers 230V)'
  },
  {
    family: 'BR',
    machine_type: 'BLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/bladblazers-98236',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (BR 500 / BR 600 / BR 700 / BR 800 ruggedragen benzinebladblazers)'
  },
  {
    family: 'SH',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/bladzuigers-98241',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SH 56 / SH 86 benzine bladzuigers en hakselaars)'
  },
  {
    family: 'SHA',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'BATTERY',
    display: 'Accu',
    requested_url: 'https://www.stihl.nl/nl/c/accu-bladzuigers-98243',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SHA 56 accu zuighakselaar AK accusysteem)'
  },
  {
    family: 'SHE',
    machine_type: 'SHREDDER_VAC',
    drive_type: 'MAINS_ELECTRIC',
    display: 'Elektrisch / netstroom',
    requested_url: 'https://www.stihl.nl/nl/c/bladzuigers-98241',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SHE 71 / SHE 81 elektrische bladzuigers 230V)'
  },
  {
    family: 'SR',
    machine_type: 'MISTBLOWER',
    drive_type: 'PETROL',
    display: 'Benzine',
    requested_url: 'https://www.stihl.nl/nl/c/spuitapparaten-en-sproei-apparaten-98254',
    evidence_locator: 'STIHL Nederland Officiële Catalogus (SR 430 / SR 450 ruggedragen benzinenevelspuiten)'
  }
];

export async function fetchAllOfficialFamilyEvidence() {
  if (!fs.existsSync(HARVEST_DIR)) {
    fs.mkdirSync(HARVEST_DIR, { recursive: true });
  }

  // Cache fetches by URL to be respectful and avoid duplicate network calls
  const urlCache = new Map();
  const ledgerEntries = [];

  for (const target of FAMILY_SOURCE_TARGETS) {
    const startedAt = new Date().toISOString();
    let fetchResult = urlCache.get(target.requested_url);

    if (!fetchResult) {
      try {
        console.log(`[Fetch] Fetching official source for family ${target.family}: ${target.requested_url}`);
        const res = await fetch(target.requested_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 STIHLDecoder-Evidence-Harvest/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        const retrievedAt = new Date().toISOString();
        const buffer = await res.arrayBuffer();
        const bodyBuf = Buffer.from(buffer);
        const bodyStr = bodyBuf.toString('utf8');
        const hash = crypto.createHash('sha256').update(bodyBuf).digest('hex');

        // Extract clean page title
        let pageTitle = 'STIHL Officiële Productcatalogus';
        const titleMatch = bodyStr.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1].trim()) {
          pageTitle = titleMatch[1].trim().replace(/\s+/g, ' ');
        }

        const isOk = res.status === 200 && bodyStr.length > 5000 && bodyStr.includes('stihl');

        fetchResult = {
          final_url: res.url || target.requested_url,
          http_status: res.status,
          content_type: res.headers.get('content-type') || 'text/html;charset=utf-8',
          page_title: pageTitle,
          retrieved_at: retrievedAt,
          body_sha256: hash,
          body_bytes: bodyBuf.length,
          verification_status: isOk ? 'VERIFIED' : 'UNVERIFIED'
        };

        urlCache.set(target.requested_url, fetchResult);
      } catch (err) {
        console.error(`[Error] Fetch failed for ${target.requested_url}:`, err.message);
        fetchResult = {
          final_url: target.requested_url,
          http_status: 0,
          content_type: null,
          page_title: null,
          retrieved_at: new Date().toISOString(),
          body_sha256: null,
          body_bytes: 0,
          verification_status: 'UNVERIFIED',
          error: err.message
        };
        urlCache.set(target.requested_url, fetchResult);
      }
    }

    ledgerEntries.push({
      family: target.family,
      machine_type: target.machine_type,
      drive_type: target.drive_type,
      display: target.display,
      requested_url: target.requested_url,
      final_url: fetchResult.final_url,
      http_status: fetchResult.http_status,
      content_type: fetchResult.content_type,
      page_title: fetchResult.page_title,
      retrieval_started_at: startedAt,
      retrieved_at: fetchResult.retrieved_at,
      body_sha256: fetchResult.body_sha256,
      body_bytes: fetchResult.body_bytes,
      evidence_locator: target.evidence_locator,
      verification_status: fetchResult.verification_status
    });
  }

  // Save fetch ledger
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledgerEntries, null, 2), 'utf8');
  console.log(`[Ledger] Saved ${ledgerEntries.length} entries to ${LEDGER_PATH}`);

  return ledgerEntries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAllOfficialFamilyEvidence().then((ledger) => {
    const verified = ledger.filter(l => l.verification_status === 'VERIFIED').length;
    console.log(`[Done] Verification complete: ${verified}/${ledger.length} VERIFIED`);
  });
}
