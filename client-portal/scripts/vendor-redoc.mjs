import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'redoc', 'bundles', 'redoc.standalone.js');
const destDir = path.join(root, 'public', 'vendor');
const dest = path.join(destDir, 'redoc.standalone.js');

if (!fs.existsSync(src)) {
  console.warn('[vendor:redoc] skip — redoc not installed (missing node_modules/redoc)');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[vendor:redoc] copied to public/vendor/redoc.standalone.js');
