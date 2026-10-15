import sharp from 'sharp';
import fs from 'node:fs/promises';

const svg = await fs.readFile('/app/public/brand/hamsofre.svg');
const NAVY = '#25145f';

async function plain(size, out) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out);
  console.log('✓', out);
}

async function fullBleed(size, out, scale = 1) {
  const inner = Math.round(size * scale);
  const icon = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: icon, gravity: 'center' }])
    .png().toFile(out);
  console.log('✓', out);
}

await plain(192, '/app/public/brand/icon-192.png');
await plain(512, '/app/public/brand/icon-512.png');
await fullBleed(512, '/app/public/brand/maskable-512.png', 0.9);
await fullBleed(180, '/app/public/brand/apple-touch-icon.png', 0.92);
await plain(32, '/app/public/brand/favicon.png');
