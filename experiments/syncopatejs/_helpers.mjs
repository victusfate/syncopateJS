// Shared test helpers for the syncopateJS suite.
// Not a *.test.mjs file, so the `experiments/**/*.test.mjs` runner never
// executes it directly — it only provides helpers the test files import.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export const HTML = new URL('./index.html', import.meta.url).pathname;

// The app script is the <script> block without the id="logic" attribute.
export function appScript() {
  const html = readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(m => !(m[1] ?? '').includes('id="logic"'));
  assert.equal(blocks.length, 1, 'exactly one app script block');
  return blocks[0][2];
}
