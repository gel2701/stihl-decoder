const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {spawnSync} = require('child_process');
const base = process.env.R3_AUDIT_ROOT;
if (!base || !path.isAbsolute(base)) throw Error('R3_AUDIT_ROOT must identify disposable audit worktrees');
const refs = {P:'947eb3e5ac8345abb3f1c7aac7bd9191487f5c02',B:'0c00214888a67f90eb2a6466ceb0d85b166e5314',C:'7fde0027ffdf93fbe9276d6b7f831a337bd3dc51'};
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const git = (cwd,args) => {const r=spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:128*1024*1024});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const source=fs.readFileSync(path.join(base,'C/tests/run_all_tests.js'),'utf8');
const files=[...source.match(/export const testFiles = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
if(files.length!==49)throw Error('Unexpected universe');
for(const file of [...files,'tests/run_all_tests.js','package.json','package-lock.json']) {
 const blobs=Object.values(refs).map(ref=>git(path.join(base,'C'),['rev-parse',ref+':'+file]));
 if(new Set(blobs).size!==1)throw Error('Code parity: '+file);
}
fs.writeFileSync(path.join(base,'test-universe.json'),JSON.stringify({runner:'tests/run_all_tests.js',runner_sha256:sha(source),runner_blob:git(path.join(base,'C'),['rev-parse',refs.C+':tests/run_all_tests.js']),count:49,files,test_code_parity:true},null,2));
const env={...process.env,NODE_ENV:'test',PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,TEMP:path.join(base,'temp'),TMP:path.join(base,'temp'),npm_config_cache:path.join(base,'npm-cache')};
delete env.REFERENCE_COMMIT;
const protectedFiles=['data/stihl_database.json','data/public_evidence_facts.json','data/public_evidence_baseline_manifest.json'];
for(const [state,ref] of Object.entries(refs)) {
 const cwd=path.join(base,state);
 git(cwd,['fetch','origin','--prune']);
 if(git(cwd,['rev-parse','origin/main'])!==refs.P || git(cwd,['rev-parse','HEAD'])!==ref)throw Error('Reference mismatch');
 const before=Object.fromEntries(protectedFiles.map(f=>[f,sha(fs.readFileSync(path.join(cwd,f)))]));
 const result={state,commit:ref,tree:git(cwd,['rev-parse','HEAD^{tree}']),node:process.version,npm:spawnSync(process.execPath,[(process.env.R3_NPM_CLI || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')),'--version'],{encoding:'utf8',env}).stdout.trim(),os:process.platform,architecture:process.arch,origin_main:git(cwd,['rev-parse','origin/main']),timeout_ms:120000,env:{NODE_ENV:'test',REFERENCE_COMMIT:'unset'},hashes:Object.fromEntries(['package.json','package-lock.json','tests/run_all_tests.js'].map(f=>[f,sha(fs.readFileSync(path.join(cwd,f)))])),tests:[]};
 const selected=state==='C'?[...files,'tests/phase44c_r2_semantic_reconstruction.test.js','tests/official_product_harvester.test.js']:files;
 for(const file of selected) {
  const start=Date.now();
  const r=spawnSync(process.execPath,[file],{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});
  const record={file,exit_code:r.status,signal:r.signal,duration_ms:Date.now()-start,timeout:r.error?.code==='ETIMEDOUT',error:r.error?.message||null,stdout:r.stdout||'',stderr:r.stderr||''};
  record.status=record.timeout?'TIMEOUT':r.status===0?'PASS':'FAIL';
  record.protected_drift=protectedFiles.filter(f=>sha(fs.readFileSync(path.join(cwd,f)))!==before[f]);
  record.generated_tracked_changes=git(cwd,['diff','--name-only']).split('\n').filter(Boolean);
  result.tests.push(record);
  fs.writeFileSync(path.join(base,state+'-results.json'),JSON.stringify(result,null,2));
  console.log(state,record.status,file);
  if(record.protected_drift.length)throw Error('HARD STOP protected data drift: '+record.protected_drift.join(','));
  // Restore only tracked outputs generated inside this disposable audit worktree.
  if(record.generated_tracked_changes.length)git(cwd,['restore','--worktree','--',...record.generated_tracked_changes]);
 }
}
