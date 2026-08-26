import { backupDatabase } from '../src/databaseConfig.js';

console.log('📦 Executing STIHL Database Backup Utility...');
const result = backupDatabase();

if (result.success) {
  console.log(`✅ Backup created successfully: ${result.backupFilePath}`);
  console.log(`✅ Total backups retained (max 7): ${result.totalBackupsKept}`);
  process.exit(0);
} else {
  console.error(`❌ Backup failed: ${result.error}`);
  process.exit(1);
}
