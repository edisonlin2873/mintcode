const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const SIZES = [16, 48, 128];

// Simple icon: circle on dark background with "AI" text
function generateIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inner circle gradient
        const norm = dist / radius;
        const r = Math.round(79 + (79 - 79 * norm));
        const g = Math.round(195 + (247 - 195 * norm));
        const b = Math.round(247 + (55 - 247 * norm));
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      } else if (dist <= radius + size * 0.04) {
        // Anti-aliased edge
        const alpha = Math.max(0, Math.min(255, (radius + size * 0.04 - dist) / (size * 0.04) * 255));
        png.data[idx] = 79;
        png.data[idx + 1] = 195;
        png.data[idx + 2] = 247;
        png.data[idx + 3] = Math.round(alpha);
      } else {
        // Transparent background
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }

  return PNG.sync.write(png);
}

// Generate all icon sizes
for (const size of SIZES) {
  const buffer = generateIcon(size);
  const filePath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${filePath}`);
}

console.log('Icons generated successfully');
