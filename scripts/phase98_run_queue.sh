#!/usr/bin/env bash
# scripts/phase98_run_queue.sh
#
# Phase 98 driver: runs the activation runner over every Phase 98 batch until
# each checkpoint reports complete. One batch at a time (never two writers on
# the offer store), resumable, and it pauses for two minutes on an eBay 429.
#
# Usage: nohup bash scripts/phase98_run_queue.sh > output/phase98/driver.log 2>&1 &
set -u
cd "$(dirname "$0")/.." || exit 1

BATCHES="${PHASE98_BATCHES:-20 21 22 23 24 25 26 27 28 29}"
LOG="output/phase98/run.log"

processed_count() {
  node -e "try{const p=require('./output/phase98/batches/$1_progress.json');console.log((p.processed_parts||[]).length)}catch(e){console.log(0)}"
}
is_complete() {
  node -e "try{const p=require('./output/phase98/batches/$1_progress.json');console.log(p.complete===true?'yes':'no')}catch(e){console.log('no')}"
}

for n in $BATCHES; do
  id="queue_$n"
  if [ ! -f "output/phase98/batches/$id.json" ]; then
    echo "MISSING batch file $id" >> "$LOG"
    continue
  fi
  echo "=== START $id $(date -u +%H:%M:%S) ===" >> "$LOG"
  same=0
  last=$(processed_count "$id")
  for attempt in $(seq 1 14); do
    if [ "$(is_complete "$id")" = "yes" ]; then break; fi
    EBAY_ENABLED=true node scripts/phase98_ebay_activation.mjs \
      --input "output/phase98/batches/$id.json" --batch-id "$id" --live \
      --time-budget-ms 275000 >> "$LOG" 2>&1
    code=$?
    if [ "$code" -eq 3 ]; then
      echo "RATE_LIMITED $id attempt=$attempt, sleeping 120s" >> "$LOG"
      sleep 120
    fi
    now=$(processed_count "$id")
    if [ "$now" -le "$last" ]; then
      same=$((same + 1))
    else
      same=0
    fi
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
echo "ALL_BATCHES_DONE $(date -u +%H:%M:%S)" >> "$LOG"
