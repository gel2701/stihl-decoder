import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// High Quality SD Logo SVG Template matching media_1787840205087.jpg
const generateSvg = (paddingPercent = 0.12) => {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#FFFFFF"/>
  <g transform="translate(30, 95) scale(0.88)">
    <!-- Stylized Orange S -->
    <path d="M 60,110 L 225,110 C 245,110 255,122 250,140 L 235,190 C 230,208 215,220 195,220 L 115,220 C 95,220 85,232 90,250 L 100,285 C 105,303 120,315 140,315 L 255,315 L 240,365 L 105,365 C 60,365 30,335 45,285 L 55,250 C 65,215 95,170 145,170 L 180,170 L 190,140 L 60,140 Z" fill="#FF6600"/>
    
    <!-- Stylized Dark Graphite D -->
    <path d="M 265,110 L 375,110 C 445,110 475,155 455,225 L 435,295 C 415,365 365,365 295,365 L 210,365 L 282,110 Z M 295,160 L 252,315 L 315,315 C 355,315 385,305 395,260 L 410,210 C 420,165 400,160 360,160 Z" fill="#1F2937"/>
  </g>
</svg>`;
};

async function buildFavicons() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (e) {
    console.error('❌ sharp library not found. Please wait for npm install sharp to complete.');
    process.exit(1);
  }

  console.log('🎨 Generating STIHLDecoder SD Favicon Assets...');

  const svgBuffer = Buffer.from(generateSvg());

  const sizes = [
    { name: 'favicon-512x512.png', size: 512 },
    { name: 'favicon-192x192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-96x96.png', size: 96 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-16x16.png', size: 16 }
  ];

  const pngBuffers = {};

  for (const item of sizes) {
    const outputPath = path.join(rootDir, item.name);
    const buf = await sharp(svgBuffer)
      .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9, quality: 100 })
      .toBuffer();

    fs.writeFileSync(outputPath, buf);
    pngBuffers[item.size] = buf;
    console.log(`  ✅ Generated ${item.name} (${item.size}x${item.size})`);
  }

  // Create multi-resolution favicon.ico containing 16x16, 32x32, 48x48 PNG chunks
  const icoBuffer = createMultiResolutionIco([
    { size: 16, buffer: pngBuffers[16] },
    { size: 32, buffer: pngBuffers[32] },
    { size: 48, buffer: pngBuffers[48] }
  ]);

  const icoPath = path.join(rootDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ✅ Generated favicon.ico (multi-resolution 16/32/48)`);

  // Create site.webmanifest
  const manifest = {
    name: 'STIHLDecoder',
    short_name: 'STIHLDecoder',
    icons: [
      { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    theme_color: '#121824',
    background_color: '#121824',
    display: 'standalone'
  };

  fs.writeFileSync(path.join(rootDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  ✅ Generated site.webmanifest`);

  console.log('🎉 ALL FAVICON ASSETS GENERATED SUCCESSFULLY!');
}

function createMultiResolutionIco(images) {
  // ICO Header: 6 bytes
  // 0-1: Reserved (0)
  // 2-3: Type (1 = ICO)
  // 4-5: Count of images
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // Width
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Offset of image data

    entries.push(entry);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map(i => i.buffer)]);
}

buildFavicons();
