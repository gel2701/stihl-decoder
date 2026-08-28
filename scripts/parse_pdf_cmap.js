import fs from 'fs';
import zlib from 'zlib';

export function extractTextFromPdfBuffer(buf) {
  let fullText = '';
  const strBuf = buf.toString('latin1');

  // 1. Extract all CMap mappings
  const cmapBlocks = strBuf.match(/begincmap[\s\S]*?endcmap/g) || [];
  const cidToCharMap = {};

  cmapBlocks.forEach(cmap => {
    // Parse bfchar entries: <0003> <0020>
    const bfcharMatches = cmap.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
    bfcharMatches.forEach(m => {
      const parts = m.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      if (parts) {
        const cid = parseInt(parts[1], 16);
        const charCode = parseInt(parts[2], 16);
        cidToCharMap[cid] = String.fromCharCode(charCode);
      }
    });

    // Parse bfrange entries: <000F> <0019> <002C>
    const bfrangeMatches = cmap.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
    bfrangeMatches.forEach(m => {
      const parts = m.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      if (parts) {
        const startCid = parseInt(parts[1], 16);
        const endCid = parseInt(parts[2], 16);
        let startChar = parseInt(parts[3], 16);
        for (let cid = startCid; cid <= endCid; cid++) {
          cidToCharMap[cid] = String.fromCharCode(startChar++);
        }
      }
    });
  });

  // 2. Extract and decompress all stream objects
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
      const streamStr = decompressed.toString('latin1');
      
      // Look for hex string text operands: <00260048...> Tj or TJ
      const hexTjMatches = streamStr.match(/<([0-9A-Fa-f]+)>\s*Tj/g) || [];
      hexTjMatches.forEach(m => {
        const hex = m.match(/<([0-9A-Fa-f]+)>/)[1];
        let decodedChunk = '';
        for (let i = 0; i < hex.length; i += 4) {
          const cid = parseInt(hex.substring(i, i + 4), 16);
          decodedChunk += cidToCharMap[cid] || String.fromCharCode(cid);
        }
        fullText += decodedChunk + ' ';
      });

      // Look for bracketed TJ arrays: [<0026>-5<0048>...] TJ
      const arrayTjMatches = streamStr.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      arrayTjMatches.forEach(m => {
        const hexes = m.match(/<([0-9A-Fa-f]+)>/g) || [];
        hexes.forEach(h => {
          const hex = h.replace(/[<>]/g, '');
          for (let i = 0; i < hex.length; i += 4) {
            const cid = parseInt(hex.substring(i, i + 4), 16);
            fullText += cidToCharMap[cid] || String.fromCharCode(cid);
          }
        });
        fullText += ' ';
      });

      // Plain ASCII strings: (text) Tj
      const asciiTjMatches = streamStr.match(/\((.*?)\)\s*Tj/g) || [];
      asciiTjMatches.forEach(m => {
        const txt = m.match(/\((.*?)\)/)[1];
        fullText += txt + ' ';
      });

    } catch (e) {
      // Non-compressed stream
    }

    offset = streamEnd + 9;
  }

  return fullText;
}

// Test on the user's PDF
const pdfPath = 'D:\\Downloads\\Check wat je wil kopen_Zoekresultaten _ Stop heling.pdf';
if (fs.existsSync(pdfPath)) {
  const buf = fs.readFileSync(pdfPath);
  const text = extractTextFromPdfBuffer(buf);
  console.log('=== EXTRACTED PDF TEXT ===');
  console.log(text);
  console.log('==========================');
  console.log('Contains 184592301?', text.includes('184592301'));
  console.log('Contains Stop heling?', text.toLowerCase().includes('stop heling') || text.toLowerCase().includes('stopheling'));
  console.log('Contains geen resultaten?', text.toLowerCase().includes('geen resultaten'));
}
