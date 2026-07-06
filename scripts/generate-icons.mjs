import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const logoSource = resolve(rootDir, 'assets/logo_dark-bg.png');
const extensionAssetsDir = resolve(rootDir, 'extension/assets');
const iconsDir = resolve(extensionAssetsDir, 'icons');

if (!existsSync(logoSource)) {
  console.error('Logo not found at', logoSource);
  process.exit(1);
}

mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 48, 128];

for (const size of sizes) {
  await sharp(logoSource)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 20, g: 20, b: 20, alpha: 1 },
    })
    .png()
    .toFile(resolve(iconsDir, `icon${size}.png`));
}

await sharp(logoSource)
  .resize(128, 128, {
    fit: 'contain',
    background: { r: 20, g: 20, b: 20, alpha: 1 },
  })
  .png({ compressionLevel: 9 })
  .toFile(resolve(extensionAssetsDir, 'logo_dark-bg.png'));

console.log('Icons generated from assets/logo_dark-bg.png in', iconsDir);
