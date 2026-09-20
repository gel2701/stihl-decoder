import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base=process.env.R3_AUDIT_ROOT;
if (!base || !path.isAbsolute(base)) throw Error('Set R3_AUDIT_ROOT to the audit snapshot directory');
const reports={};
for(const state of ['P','B','C']) {
 const root=path.join(base,state), read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 const {decodeStihlCode}=await import(pathToFileURL(path.join(root,'src/decoder.js')));
 const {validatePublicEvidenceBaseline}=await import(pathToFileURL(path.join(root,'src/utils/evidenceBaselineValidator.js')));
 const db=read('data/stihl_database.json'),store=read('data/public_evidence_facts.json'), manifest=read('data/public_evidence_baseline_manifest.json');
 const database={...db,public_evidence:store};
 const maintenance=new Set(['spark_plug','electrode_gap_mm','fuel_tank_capacity_cm3','oil_tank_capacity_cm3','carb_h_setting','carb_l_setting','carb_la_setting','idle_speed_rpm','max_speed_rpm']);
 const queries=[],ready=[],limited=[];
 for(const [slug,entry] of Object.entries(store.model_index)) {
  const facts=store.facts.filter(f=>f.model_slug===slug);
  (facts.length>=5&&facts.some(f=>maintenance.has(f.field))?ready:limited).push(slug);
  for(const q of [slug,entry.model_name,`STIHL ${entry.model_name}`]) {
   const r=decodeStihlCode(q,database);
   queries.push({slug,q,success:r.success,type:r.type,category:r.category,facts:(r.publicEvidenceFacts||[]).length,specs:Object.keys(r.technicalSpecs||{}).length,ok:r.success&&r.type==='MODEL_DECODE'&&r.category&&r.category!=='UNKNOWN'&&(r.publicEvidenceFacts||[]).length>0&&Object.keys(r.technicalSpecs||{}).length>0});
  }
 }
 reports[state]={node:process.version,models:db.models.length,facts:store.facts.length,index_models:Object.keys(store.model_index).length,ready,limited,queries,validator_errors:validatePublicEvidenceBaseline({manifest,publicEvidenceStore:store,database:db,baselineFacts:store.facts}).errors};
}
for(const state of ['P','B']) {
 const baseline=reports[state];
 assert.deepEqual(reports.C.validator_errors.filter(e=>e.code==='ERR_PROMOTION_INVALID_EVIDENCE'),baseline.validator_errors.filter(e=>e.code==='ERR_PROMOTION_INVALID_EVIDENCE'));
 const oldQueries=new Map(baseline.queries.map(q=>[q.q,q]));
 const newFailures=reports.C.queries.filter(q=>!q.ok&&(!oldQueries.has(q.q)||oldQueries.get(q.q).ok));
 assert.equal(newFailures.length,0,'new model query safety failure');
 assert.deepEqual(reports.C.ready,baseline.ready);
}
fs.writeFileSync(path.join(base,'semantic-probe.json'),JSON.stringify(reports,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(reports).map(([s,r])=>[s,{models:r.models,facts:r.facts,index_models:r.index_models,ready:r.ready.length,limited:r.limited.length,queries:r.queries.length,failed_queries:r.queries.filter(q=>!q.ok).length,validator_errors:r.validator_errors.length}]))));
