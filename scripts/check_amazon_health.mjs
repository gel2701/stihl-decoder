import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkAmazonHealth } from '../src/affiliate/AmazonHealthMonitor.js';

const args = process.argv.slice(2);
if (args.length > 2 || args.some(arg => arg.startsWith('--') && !arg.startsWith('--output=')) || args.filter(arg => arg.startsWith('--output=')).length > 1 || args.some(arg => arg === '--output=')) {
  console.error('Usage: node scripts/check_amazon_health.mjs [registry.json] [--output=report.json]');
  process.exitCode = 1;
} else {
  const output = args.find(arg => arg.startsWith('--output='));
  const registryPath = args.find(arg => !arg.startsWith('--')) || fileURLToPath(new URL('../data/affiliate/verified_amazon_registry.json', import.meta.url));
  try {
    console.log(JSON.stringify(await checkAmazonHealth({ registryPath: resolve(registryPath), outputPath: output?.slice(9) }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
