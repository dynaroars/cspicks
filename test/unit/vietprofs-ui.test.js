import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('src/vietprofs/ files are unedited copies of VietProfs (change them there and run npm run sync:vietprofs-ui)', async () => {
  const dir = new URL('../../src/vietprofs/', import.meta.url);
  const hashes = JSON.parse(await readFile(new URL('hashes.json', dir), 'utf8'));
  assert.deepEqual(Object.keys(hashes).sort(), ['add-fab.ts', 'roars-ui.css', 'search-kit.ts', 'stats-components.css', 'traffic-view.ts']);
  for (const [file, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, dir))).digest('hex'), hash, file);
  }
  const style = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8');
  assert.match(style, /^@import '\.\/vietprofs\/roars-ui\.css';/);
});
