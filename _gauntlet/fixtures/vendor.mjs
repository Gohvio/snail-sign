// Copies the exact library versions the site loads from cdnjs into vendor/,
// pulled from npm at pinned versions. The harness then serves these locally so
// the Gauntlet runs offline and deterministically — no CDN outage can turn a
// run red, and no test result depends on the network.
//
// The real SRI hashes on index.html are still checked, statically, in smoke.spec.mjs.
//
// Run: npm run vendor

import { mkdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const NM = join(ROOT, 'node_modules');
const OUT = join(ROOT, 'vendor');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// cdnjs path fragment  ->  file inside node_modules
export const MAP = {
  'pdf.js/3.11.174/pdf.min.js': 'pdfjs-dist/build/pdf.min.js',
  'pdf.js/3.11.174/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js',
  'pdf-lib/1.17.1/pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js',
  'mammoth/1.6.0/mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js',
  'html2canvas/1.4.1/html2canvas.min.js': 'html2canvas/dist/html2canvas.min.js',
  'jszip/3.10.1/jszip.min.js': 'jszip/dist/jszip.min.js',
};

let missing = [];
for (const [cdnPath, npmPath] of Object.entries(MAP)) {
  const src = join(NM, npmPath);
  if (!existsSync(src)) { missing.push(npmPath); continue; }
  const dest = join(OUT, cdnPath.split('/').pop());
  copyFileSync(src, dest);
  console.log(`  ${dest.replace(ROOT + '/', '')}  ${(statSync(dest).size / 1024).toFixed(0)} KB`);
}

if (missing.length) {
  console.error('\nMissing from node_modules — run `npm install` first:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log('\nvendor/ ready — the Gauntlet can now run with no network access.');
