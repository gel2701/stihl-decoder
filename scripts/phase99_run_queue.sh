#!/usr/bin/env bash
# scripts/phase99_run_queue.sh
#
# Phase 99 driver: runs the activation runner over every Phase 99 batch until
# each checkpoint reports complete. One batch at a time (never two writers on
# the offer store), resumable, and quota aware: when eBay's Browse API answers
# 429 (daily request limit) no part is marked researched, so the driver stops
# instead of walking through the remaining batches with no usable API.
#
# Usage: setsid nohup bash scripts/phase99_run_queue.sh >> output/phase99/driver.log 2>&1 < /dev/null &
set -u
cd "$(dirname "$0")/.." || exit 1

BATCHES="${PHASE99_BATCHES:-30 31 32 33 34 35 36 37 38 39}"
LOG="output/phase99/run.log"

processed_count() {
  node -e "try{const p=require('./output/phase99/batches/$1_progress.json');console.log((p.processed_parts||[]).length)}catch(e){console.log(0)}"
}
is_complete() {
  node -e "try{const p=require('./output/phase99/batches/$1_progress.json');console.log(p.complete===true?'yes':'no')}catch(e){console.log('no')}"
}

no_progress=0
for n in $BATCHES; do
  id="queue_$n"
  if [ ! -f "output/phase99/batches/$id.json" ]; then
    echo "MISSING batch file $id" >> "$LOG"
    continue
  fi
  echo "=== START $id $(date -u +%H:%M:%S) ===" >> "$LOG"
  same=0
  last=$(processed_count "$id")
  for attempt in $(seq 1 20); do
    if [ "$(is_complete "$id")" = "yes" ]; then break; fi
    EBAY_ENABLED=true node scripts/phase99_ebay_activation.mjs \
      --input "output/phase99/batches/$id.json" --batch-id "$id" --live \
      --time-budget-ms 275000 >> "$LOG" 2>&1
    code=$?
    if [ "$code" -eq 3 ]; then
      echo "API_STOP $id attempt=$attempt: no successful API call (429 / quota), sleeping 300s" >> "$LOG"
      sleep 300
    fi
    now=$(processed_count "$id")
    if [ "$now" -le "$last" ]; then
      same=$((same + 1))
      no_progress=$((no_progress + 1))
    else
      same=0
      no_progress=0
    fi
    last=$now
    echo "PROGRESS $id attempt=$attempt processed=$now complete=$(is_complete "$id")" >> "$LOG"
    if [ "$same" -ge 3 ]; then
      echo "STALLED $id (no progress after 3 attempts), moving on" >> "$LOG"
      same=0
      break
    fi
    if [ "$no_progress" -ge 3 ]; then
      echo "QUOTA_BLOCKED: stopping the driver without marking parts researched at $(date -u +%H:%M:%S)" >> "$LOG"
      exit 4
    fi
    sleep 2
  done
  echo "=== END $id $(date -u +%H:%M:%S) complete=$(is_complete "$id") ===" >> "$LOG"
done
echo "ALL_BATCHES_DONE $(date -u +%H:%M:%S)" >> "$LOG"
