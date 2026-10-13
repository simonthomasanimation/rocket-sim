# Decisions log (one line each, newest first)

- 2026-10-13 — Branching: the routine develops on its own claude/* branch and pushes the same commits to main; main is the deploy branch and is kept deployable at every commit.
- 2026-10-13 — Snapshot build: tools/snapshot.js is a dependency-free module folder (topological order, one wrapper per module, no circular imports) so dist/index.html stays one file; fonts stay external links.
- 2026-10-13 — Deploy check: tools/check.js builds the snapshot, syntax-checks the bundle and opens dev page and snapshot in headless Chromium when Playwright is present; any console error fails the check.
- 2026-10-13 — Title blocks and stamps are HTML/CSS over the canvas (per the brief); everything else on a document is drawn on canvas.
- 2026-10-13 — Grid: 8px lines at 8% white with one 10% line every 64px; grid drawn in device pixels so lines stay crisp at any pixel density. Fold creases at the sheet's half lines, no shadows.
- 2026-10-13 — GitHub Pages deploys dist/ through Actions; the owner enables Pages once (Source: GitHub Actions) because the workflow token cannot on every push to main; URL https://simonthomasanimation.github.io/rocket-sim/.
- 2026-10-13 — Autonomous build: a daily Claude Code routine works docs/progress.md top to bottom; milestone gates are closed by the owner via GitHub issues.
- 2026-10-13 — Name: Kármán Program (accented in-game and wordmark; "Karman Program" in URLs and repo).
- 2026-10-13 — Art: four-document system (Blueprint, Vellum, CRT, Manual); flight view strictly two-tone with red-orange accent for urgency only; identity by texture; wash fallback allowed only after M3 playtest.
- 2026-10-13 — Covers: nine approved illustrations in art/covers; NASA insignia in "The Engineer" to be removed before use.
- 2026-10-13 — Audio: hybrid procedural chip-inspired (Tone.js) + AI ambient stems; realistic physics SFX, chip UI SFX; fatigue rules.
- 2026-10-13 — Physics: 2D, shrunk solar system, patched conics, fixed timestep, Verlet/RK4, warp to 1,000,000x, warp-to-event.
- 2026-10-13 — Build-your-own rockets from v1: vertical stack + radial boosters, ~30 parts, staging, presets as saved designs.
- 2026-10-13 — Career: 12 Earth/Moon + 6 interplanetary missions; ~30 tech nodes unlocked by deeds; career/sandbox/challenges modes.
- 2026-10-13 — Ghosts local-only and optional; daily challenges local with personal bests; no sharing features in v1.
- 2026-10-13 — Tech: vanilla JS + Canvas 2D, ES modules, no framework; website first, PWA later; local saves with JSON export/import; game core DOM-free; keyboard + touch from day one.
