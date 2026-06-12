# experiments 🎪

Home of **syncopateJS** — a self-contained browser app. It follows the
experiment contract:

- **One directory, one world.** `experiments/syncopatejs/index.html` is the
  whole app — zero dependencies, zero build, works from `file://`.
- **Pure logic is testable.** `index.html` keeps its DOM-free math in a
  `<script id="logic">` block that exports `globalThis.__logic`. The shared
  harness (`_harness/logic.mjs`) extracts and evals that block in Node.
- **Tests sit next to the app**: `experiments/syncopatejs/syncopatejs.test.mjs`,
  run with `npm run test:experiments` (plain `node --test`).
- **Docs live in `/docs/<slug>/`**: design.md → prd.md → plan.md → tdd-log.md.
  (The app's chains: `docs/beat-prism`, `docs/beat-prism-fx-pack`,
  `docs/beat-prism-webgl`.)

## Run it

Open `experiments/syncopatejs/index.html` directly, or serve the repo:

```
npx http-server .          # then visit /experiments/syncopatejs/
```

`scripts/fetch-test-video.sh` downloads sample videos to `./videos/`
(gitignored) for local testing.

GitHub Pages deploys `experiments/syncopatejs/` as the site root on every
push to `main` (`.github/workflows/pages.yml`).
