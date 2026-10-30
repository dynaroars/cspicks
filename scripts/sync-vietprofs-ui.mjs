// Copies VietProfs' shared UI files into src/vietprofs/ verbatim and records their hashes, so
// test/unit/vietprofs-ui.test.js can catch local edits. VietProfs is the source of truth: change the
// files there, then run `npm run sync:vietprofs-ui` (VIETPROFS_DIR overrides the default ../vietprofs).
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(process.env.VIETPROFS_DIR || resolve(root, '../vietprofs'), 'src');
const target = resolve(root, 'src/vietprofs');
const SHARED_FILES = ['roars-ui.css', 'search-kit.ts', 'back-to-top.ts'];

const hashes = {};
for (const file of SHARED_FILES) {
  await copyFile(resolve(source, file), resolve(target, file));
  hashes[file] = createHash('sha256').update(await readFile(resolve(target, file))).digest('hex');
}
await writeFile(resolve(target, 'hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
console.log(`Synced ${SHARED_FILES.length} files from ${source}`);
