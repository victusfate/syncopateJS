// Shared test harness for single-file experiments.
//
// Convention: each experiment's index.html holds its pure, DOM-free logic in
//   <script id="logic"> (() => { ... globalThis.__logic = { ... }; })(); </script>
// and the app script consumes those functions via globalThis.__logic. The
// IIFE is required: top-level function declarations would collide with the
// app script's const destructuring in the browser's shared global scope.
// This loader extracts the block and evaluates it in Node so unit tests
// never need a browser.

import { readFileSync } from 'node:fs';

export function loadLogic(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const blocks = html.match(/<script id="logic">[\s\S]*?<\/script>/g) ?? [];
  if (blocks.length !== 1) {
    throw new Error(`expected exactly one <script id="logic"> block in ${htmlPath}, found ${blocks.length}`);
  }
  const src = blocks[0].replace(/^<script id="logic">/, '').replace(/<\/script>$/, '');
  delete globalThis.__logic;
  (0, eval)(src);
  if (typeof globalThis.__logic !== 'object' || globalThis.__logic === null) {
    throw new Error(`logic block in ${htmlPath} did not set globalThis.__logic`);
  }
  return globalThis.__logic;
}
