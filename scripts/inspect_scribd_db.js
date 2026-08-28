import sqlite3 from 'sqlite3';

const dbPath = 'c:/Users/GelliusSnippe/.agents/stihl_scribd_documentation.db';
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
  console.log('Opened stihl_scribd_documentation.db successfully.');
});

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error('Error fetching tables:', err);
    return;
  }
  console.log('Tables:', tables);

  tables.forEach((table) => {
    db.all(`PRAGMA table_info(${table.name})`, [], (err, columns) => {
      console.log(`\nTable [${table.name}] Columns:`, columns.map(c => c.name));
      db.get(`SELECT COUNT(*) as count FROM ${table.name}`, [], (err, row) => {
        console.log(`Table [${table.name}] Total Rows:`, row ? row.count : 0);
      });
    });
  });
});
