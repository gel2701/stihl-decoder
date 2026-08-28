import fs from 'fs';
import zlib from 'zlib';

const pdfPath = 'D:\\Downloads\\Check wat je wil kopen_Zoekresultaten _ Stop heling.pdf';
const buf = fs.readFileSync(pdfPath);

console.log('PDF File Size:', buf.length, 'bytes');

let fullExtractedText = '';

// Find all obj ... stream ... endstream blocks
let offset = 0;
while (offset < buf.length) {
  const streamStart = buf.indexOf(Buffer.from('stream'), offset);
  if (streamStart === -1) break;

  const streamDataStart = streamStart + 6 + (buf[streamStart + 6] === 0x0d && buf[streamStart + 7] === 0x0a ? 2 : (buf[streamStart + 6] === 0x0a ? 1 : 0));
  const streamEnd = buf.indexOf(Buffer.from('endstream'), streamDataStart);
  if (streamEnd === -1) break;

  const streamBytes = buf.subarray(streamDataStart, streamEnd);
  
  try {
    const decompressed = zlib.inflateSync(streamBytes);
    const text = decompressed.toString('latin1');
    fullExtractedText += '\n--- STREAM ---\n' + text;
  } catch (e) {
    // Not zlib compressed or image stream
  }

  offset = streamEnd + 9;
}

console.log('Decompressed Text Content:');
console.log(fullExtractedText.replace(/[^\x20-\x7E\n]/g, ' '));

// Extract all numbers and Tj / TJ text operands
const tjMatches = fullExtractedText.match(/\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g) || [];
console.log('\nExtracted PDF Text Operators (Tj/TJ):');
tjMatches.forEach(m => console.log('  ', m));
