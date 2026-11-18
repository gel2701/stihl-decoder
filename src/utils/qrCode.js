/**
 * Pure-JS zero-dependency ISO/IEC 18004 QR Code encoder (Byte mode, Versions 1-8, EC Level M).
 * Runs identically in Node SSR and raw Browser ES modules with zero external dependencies.
 */

// GF(256) tables with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// EC Level M specs for Versions 1..8: [totalCodewords, ecCodewordsPerBlock, [g1Blocks, g1DataCw], [g2Blocks, g2DataCw], alignmentCenters]
const QR_SPECS_M = [
  null,
  [26, 10, [1, 16], null, []],
  [44, 16, [1, 28], null, [6, 18]],
  [70, 26, [1, 44], null, [6, 22]],
  [100, 18, [2, 32], null, [6, 26]],
  [134, 24, [2, 43], null, [6, 30]],
  [172, 16, [4, 27], null, [6, 34]],
  [196, 18, [4, 31], null, [6, 22, 38]],
  [242, 22, [2, 38], [2, 39], [6, 24, 42]]
];

function getVersionForBytes(byteLen) {
  for (let v = 1; v < QR_SPECS_M.length; v++) {
    const spec = QR_SPECS_M[v];
    const totalDataCw = spec[2][0] * spec[2][1] + (spec[3] ? spec[3][0] * spec[3][1] : 0);
    // Byte mode header: 4 bits mode + 8 bits length (for v <= 9) + 8*byteLen + 4 bits terminator
    if (byteLen + 2 <= totalDataCw) return v;
  }
  throw new Error('QR payload exceeds supported URL length');
}

function placeFinder(grid, fixed, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      fixed[rr][cc] = true;
      const isDark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      grid[rr][cc] = isDark ? 1 : 0;
    }
  }
}

function placeAlignment(grid, fixed, rCenter, cCenter) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      fixed[rCenter + r][cCenter + c] = true;
      const isDark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      grid[rCenter + r][cCenter + c] = isDark ? 1 : 0;
    }
  }
}

function applyMask(grid, fixed, size, maskId) {
  const out = grid.map(row => row.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (fixed[r][c]) continue;
      let inv = false;
      if (maskId === 0) inv = (r + c) % 2 === 0;
      else if (maskId === 1) inv = r % 2 === 0;
      else if (maskId === 2) inv = c % 3 === 0;
      else if (maskId === 3) inv = (r + c) % 3 === 0;
      else if (maskId === 4) inv = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      else if (maskId === 5) inv = ((r * c) % 2) + ((r * c) % 3) === 0;
      else if (maskId === 6) inv = ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0;
      else if (maskId === 7) inv = ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0;
      if (inv) out[r][c] ^= 1;
    }
  }
  return out;
}

function formatBitsM(maskId) {
  // EC Level M = 00 -> 5-bit data = (0b00 << 3) | maskId
  const data = maskId & 7;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function writeFormatInfo(grid, size, maskId) {
  const bits = formatBitsM(maskId);
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    if (i < 6) grid[i][8] = bit;
    else if (i < 8) grid[i + 1][8] = bit;
    else grid[size - 15 + i][8] = bit;

    if (i < 8) grid[8][size - 1 - i] = bit;
    else if (i < 9) grid[8][15 - i] = bit;
    else grid[8][14 - i] = bit;
  }
  grid[size - 8][8] = 1; // Dark module
}

function penaltyScore(grid) {
  const n = grid.length;
  let score = 0;
  for (let r = 0; r < n; r++) {
    let runLen = 1;
    for (let c = 1; c < n; c++) {
      if (grid[r][c] === grid[r][c - 1]) runLen++;
      else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1; }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < n; c++) {
    let runLen = 1;
    for (let r = 1; r < n; r++) {
      if (grid[r][c] === grid[r - 1][c]) runLen++;
      else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1; }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }
  return score;
}

export function generateQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || 'https://www.stihldecoder.nl/'));
  const version = getVersionForBytes(bytes.length);
  const spec = QR_SPECS_M[version];
  const ecPerBlock = spec[1];
  const g1 = spec[2];
  const g2 = spec[3];
  const totalDataCw = g1[0] * g1[1] + (g2 ? g2[0] * g2[1] : 0);

  // Build bit buffer
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = totalDataCw * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  let padToggle = 0;
  while (bits.length < maxBits) {
    pushBits(padToggle === 0 ? 0xec : 0x11, 8);
    padToggle ^= 1;
  }

  const dataCw = new Uint8Array(totalDataCw);
  for (let i = 0; i < totalDataCw; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | bits[i * 8 + b];
    dataCw[i] = val;
  }

  // Split blocks & compute RS EC
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let i = 0; i < g1[0]; i++) {
    const blk = dataCw.slice(offset, offset + g1[1]);
    dataBlocks.push(blk);
    ecBlocks.push(rsRemainder(blk, ecPerBlock));
    offset += g1[1];
  }
  if (g2) {
    for (let i = 0; i < g2[0]; i++) {
      const blk = dataCw.slice(offset, offset + g2[1]);
      dataBlocks.push(blk);
      ecBlocks.push(rsRemainder(blk, ecPerBlock));
      offset += g2[1];
    }
  }

  const interleaved = [];
  const maxDataLen = g2 ? Math.max(g1[1], g2[1]) : g1[1];
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) interleaved.push(blk[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const blk of ecBlocks) interleaved.push(blk[i]);
  }

  const bitStream = [];
  for (const cw of interleaved) {
    for (let b = 7; b >= 0; b--) bitStream.push((cw >> b) & 1);
  }
  // Remainder bits for versions 2-6: 7 bits; versions 7-8: 0 bits
  const remBits = version >= 2 && version <= 6 ? 7 : 0;
  for (let i = 0; i < remBits; i++) bitStream.push(0);

  const size = 17 + version * 4;
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  const fixed = Array.from({ length: size }, () => Array(size).fill(false));

  placeFinder(grid, fixed, 0, 0);
  placeFinder(grid, fixed, 0, size - 7);
  placeFinder(grid, fixed, size - 7, 0);

  // Alignment patterns
  const centers = spec[4];
  for (const r of centers) {
    for (const c of centers) {
      if (fixed[r][c]) continue;
      placeAlignment(grid, fixed, r, c);
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0 ? 1 : 0;
    if (!fixed[6][i]) { grid[6][i] = dark; fixed[6][i] = true; }
    if (!fixed[i][6]) { grid[i][6] = dark; fixed[i][6] = true; }
  }

  // Reserve format info zones
  for (let i = 0; i < 9; i++) {
    fixed[8][i] = true;
    fixed[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    fixed[8][size - 1 - i] = true;
    fixed[size - 1 - i][8] = true;
  }

  // Reserve Version >= 7 version info zones
  if (version >= 7) {
    let rem = version << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
    const verBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (verBits >> i) & 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      grid[a][b] = bit; fixed[a][b] = true;
      grid[b][a] = bit; fixed[b][a] = true;
    }
  }

  // Place data bits in zig-zag order
  let bitIdx = 0;
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let step = 0; step < size; step++) {
      const r = up ? size - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (!fixed[r][c]) {
          grid[r][c] = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
        }
      }
    }
    up = !up;
  }

  // Choose lowest penalty mask
  let bestGrid = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(grid, fixed, size, mask);
    writeFormatInfo(masked, size, mask);
    const sc = penaltyScore(masked);
    if (sc < bestScore) {
      bestScore = sc;
      bestGrid = masked;
    }
  }
  return bestGrid;
}

export function renderQrSvg(text, pixelSize = 140) {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  const paths = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) paths.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img" aria-label="QR-code voor deelbaar STIHL Machinepaspoort"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${paths.join('')}" fill="#0f172a"/></svg>`;
}

export function drawQrToCanvas(ctx, text, x, y, size) {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  const cell = size / total;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}
