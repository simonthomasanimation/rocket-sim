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

## Where things are
See `CLAUDE.md` for the layout, `docs/build-plan.md` for the milestones, `docs/progress.md` for the task list and `docs/art-direction-brief.md` for the look.
