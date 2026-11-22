#!/usr/bin/env bash
# scripts/phase99_retry_tick.sh — one bounded slice of the Phase 99
# alternative-search pass (model + part type). Same runner, --hints only.
set -u
cd "$(dirname "$0")/.." || exit 1

END=$((SECONDS + ${PHASE99_TICK_SECONDS:-245}))
first_incomplete() {
  node -e "
const fs=require('fs');
for (const id of ['retry_00','retry_01','retry_02','retry_03']) {
  const f='./output/phase99/batches/'+id+'_progress.json';
  let done=false;
  try { done = JSON.parse(fs.readFileSync(f,'utf8')).complete === true; } catch {}
  if (!done) { console.log(id); break; }
}
"
}

while [ "$SECONDS" -lt "$END" ]; do
  BATCH=$(first_incomplete)
  if [ -z "$BATCH" ]; then echo "ALL_RETRY_BATCHES_COMPLETE"; break; fi
  LEFT=$((END - SECONDS))
  BUDGET_MS=$(( (LEFT > 70 ? LEFT - 20 : LEFT) * 1000 ))
  echo "RETRY_TICK $BATCH budget=${BUDGET_MS}ms $(date -u +%H:%M:%S)"
  EBAY_ENABLED=true node scripts/phase99_ebay_activation.mjs \
    --input "output/phase99/batches/$BATCH.json" --batch-id "$BATCH" --hints --live \
    --time-budget-ms "$BUDGET_MS" >> output/phase99/run.log 2>&1
  code=$?
  if [ "$code" -eq 3 ]; then
    echo "API_STOP $BATCH (quota/429) $(date -u +%H:%M:%S)"
    sleep 30
  fi
done

node -e "
const fs=require('fs');let t=0,a=0,c=0;const per=[];
for(const id of ['retry_00','retry_01','retry_02','retry_03']){try{const p=JSON.parse(fs.readFileSync('./output/phase99/batches/'+id+'_progress.json'));t+=p.processed_parts.length;a+=(p.accepted_offers||[]).length;if(p.complete)c++;per.push(id+':'+p.processed_parts.length+(p.complete?'C':''))}catch(e){per.push(id+':0')}}
console.log('RETRY_STATE processed='+t+' accepted_offers='+a+' complete='+c+' | '+per.join(' '));
"
