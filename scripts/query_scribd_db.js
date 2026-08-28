import sqlite3 from 'sqlite3';

const dbPath = 'c:/Users/GelliusSnippe/.agents/stihl_scribd_documentation.db';
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

console.log('🔍 Querying stihl_scribd_documentation.db for STIHL technical data & manuals...\n');

// 1. Check document types & titles
db.all(`
  SELECT document_type, COUNT(*) as count 
  FROM documents 
  GROUP BY document_type 
  ORDER BY count DESC
`, [], (err, rows) => {
  console.log('Document Types Summary:', rows);
});

// 2. Search for technical manuals or parts lists with page content
db.all(`
  SELECT d.doc_id, d.title, d.document_type, d.page_count, COUNT(p.id) as extracted_pages
  FROM documents d
  LEFT JOIN document_pages p ON d.doc_id = p.doc_id
  WHERE d.title LIKE '%Service Manual%' 
     OR d.title LIKE '%Parts List%' 
     OR d.title LIKE '%IPL%'
     OR d.title LIKE '%Manual%'
     OR d.title LIKE '%Specification%'
     OR d.title LIKE '%Workshop%'
  GROUP BY d.doc_id
  ORDER BY extracted_pages DESC
  LIMIT 25
`, [], (err, rows) => {
  console.log('\nTop Technical STIHL Manuals with Extracted Pages (Sample 25):');
  rows.forEach(r => console.log(`- [${r.doc_id}] ${r.title} (${r.document_type}, ${r.page_count} pgs, ${r.extracted_pages} text pages extracted)`));
});
