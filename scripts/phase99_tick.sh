#!/usr/bin/env bash
# scripts/phase99_tick.sh — one bounded slice of Phase 99 work.
#
# Runs the activation runner over the first incomplete batch, then the next one
# if time remains, always inside the caller's ~5 minute window. Same checkpoints
# and same store write route as the driver; this exists because a background
# driver does not survive a runner restart.
set -u
cd "$(dirname "$0")/.." || exit 1

END=$((SECONDS + ${PHASE99_TICK_SECONDS:-245}))
first_incomplete() {
  node -e "
const fs=require('fs');
for (const n of [30,31,32,33,34,35,36,37,38,39]) {
  const f='./output/phase99/batches/queue_'+n+'_progress.json';
  let done=false;
  try { done = JSON.parse(fs.readFileSync(f,'utf8')).complete === true; } catch {}
  if (!done) { console.log('queue_'+n); break; }
}
"
}

while [ "$SECONDS" -lt "$END" ]; do
  BATCH=$(first_incomplete)
  if [ -z "$BATCH" ]; then echo "ALL_BATCHES_COMPLETE"; break; fi
  LEFT=$((END - SECONDS))
  BUDGET_MS=$(( (LEFT > 70 ? LEFT - 20 : LEFT) * 1000 ))
  echo "TICK $BATCH budget=${BUDGET_MS}ms $(date -u +%H:%M:%S)"
  EBAY_ENABLED=true node scripts/phase99_ebay_activation.mjs \
    --input "output/phase99/batches/$BATCH.json" --batch-id "$BATCH" --live \
    --time-budget-ms "$BUDGET_MS" >> output/phase99/run.log 2>&1
  code=$?
  if [ "$code" -eq 3 ]; then
    echo "API_STOP $BATCH (quota/429) $(date -u +%H:%M:%S)"
    sleep 30
  fi
done

node -e "
const fs=require('fs');let t=0,a=0,c=0;const per=[];
for(const n of [30,31,32,33,34,35,36,37,38,39]){try{const p=JSON.parse(fs.readFileSync('./output/phase99/batches/queue_'+n+'_progress.json'));t+=p.processed_parts.length;a+=(p.accepted_offers||[]).length;if(p.complete)c++;per.push(n+':'+p.processed_parts.length+(p.complete?'C':''))}catch(e){per.push(n+':0')}}
console.log('STATE processed='+t+' accepted_offers='+a+' complete_batches='+c+' | '+per.join(' '));
"
