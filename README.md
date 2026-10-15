# Kármán Program

2D browser rocket simulator — a Kerbal-lite set in the paperwork of a 1960s space program.

Play the latest build: https://simonthomasanimation.github.io/rocket-sim/

## Run it locally
Browsers refuse ES modules from `file://`, so serve the folder:

```
npm run dev
```
then open http://localhost:5173.

## Scripts
- `npm run dev` — local server.
- `npm run snapshot` — folds everything into one file, `dist/index.html`.
- `npm run check` — builds the snapshot, syntax-checks the bundle and, when Playwright and Chromium are installed, opens the dev page and the snapshot headlessly and fails on console errors.
- `npm run stress` — the core stress battery: random rockets flown with random hands on Earth and the Moon, replays, predictions, and the builder's operations in random order; fails on any exception or NaN.
- `npm run battery` — the browser battery: drives the real page through every start, the builder, every preset, the map, replay and the report pages on desktop and phone viewports with random keys; fails on console errors and reports slow frames (`--snapshot` runs it on the single-file build).

## Where things are
See `CLAUDE.md` for the layout, `docs/build-plan.md` for the milestones, `docs/progress.md` for the task list and `docs/art-direction-brief.md` for the look.

## Milestone builds

Each finished milestone is kept as one self-contained file in `snapshots/` (for example `snapshots/m1-lander.html`). Double-click it to play that milestone offline; only the fonts come from the web.
