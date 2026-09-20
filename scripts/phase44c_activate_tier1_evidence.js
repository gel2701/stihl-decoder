// The original first-value parser is retired. Replay uses frozen source artifacts
// and the exact Phase44B baseline. Default is dry-run; --execute writes only
// after semantic, baseline, index and runtime gates pass.
import { main } from './phase44c_r2_reconcile_technical_evidence.js';
main();
