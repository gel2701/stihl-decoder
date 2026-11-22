#!/usr/bin/env bash
# scripts/phase98_run_retry.sh
#
# Phase 98 alternative-search pass: same runner, --hints, over the retry_XX
# batches built by scripts/phase98_build_retry.mjs. One writer at a time.
#
# Usage: nohup bash scripts/phase98_run_retry.sh retry_00 retry_01 ... &
set -u
cd "$(dirname "$0")/.." || exit 1

IDS="${*:-retry_00}"
LOG="output/phase98/run.log"

processed_count() {
  node -e "try{const p=require('./output/phase98/batches/$1_progress.json');console.log((p.processed_parts||[]).length)}catch(e){console.log(0)}"
}
is_complete() {
  node -e "try{const p=require('./output/phase98/batches/$1_progress.json');console.log(p.complete===true?'yes':'no')}catch(e){console.log('no')}"
}

for id in $IDS; do
  if [ ! -f "output/phase98/batches/$id.json" ]; then
    echo "MISSING batch file $id" >> "$LOG"
    continue
  fi
  echo "=== START $id (alternatives) $(date -u +%H:%M:%S) ===" >> "$LOG"
  same=0
  last=$(processed_count "$id")
  for attempt in $(seq 1 20); do
    if [ "$(is_complete "$id")" = "yes" ]; then break; fi
    EBAY_ENABLED=true node scripts/phase98_ebay_activation.mjs \
      --input "output/phase98/batches/$id.json" --batch-id "$id" --hints --live \
      --max-parts 40 --time-budget-ms 275000 >> "$LOG" 2>&1
    code=$?
    if [ "$code" -eq 3 ]; then
      echo "RATE_LIMITED $id attempt=$attempt, sleeping 120s" >> "$LOG"
      sleep 120
    fi
    now=$(processed_count "$id")
    if [ "$now" -le "$last" ]; then same=$((same + 1)); else same=0; fi
    last=$now
    echo "PROGRESS $id attempt=$attempt processed=$now complete=$(is_complete "$id")" >> "$LOG"
    if [ "$same" -ge 3 ]; then
      echo "STALLED $id, moving on" >> "$LOG"
      break
    fi
    sleep 2
  done
  echo "=== END $id $(date -u +%H:%M:%S) complete=$(is_complete "$id") ===" >> "$LOG"
done
echo "ALL_RETRY_BATCHES_DONE $(date -u +%H:%M:%S)" >> "$LOG"
