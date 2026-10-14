# CLAUDE.md — Kármán Program

2D browser rocket simulator: a Kerbal-lite set in the paperwork of a 1960s space program. The owner (Simon) directs and play-tests; he does not read or write code. Explain changes in plain language, keep each step playable, and never ask him to run commands you can run yourself.

## Stack and constraints
- Vanilla JavaScript (ES modules), HTML, CSS, Canvas 2D. No framework, no build step beyond what's needed to concatenate for a single-file snapshot. Tone.js for audio (pinned version from cdnjs).
- Serve locally with `npx serve .` (or equivalent); browsers block ES modules from file://.
- The game core (physics, missions, parts, audio mixing) never touches the DOM. Rendering, input and storage are separate modules behind small interfaces so the core can later run in a PWA, Electron/Tauri or Capacitor wrapper unchanged.
- Input: keyboard and touch from the first prototype. Storage: localStorage behind `save.js` with JSON export/import; every read/write in try/catch; the game must run with empty storage.
- Deterministic simulation: fixed timestep (accumulator pattern), seeded RNG, inputs recorded as (tick, input) events so flights can be replayed as local ghosts.
- Asset budget under 2 MB excluding fonts. Code-draw everything except `art/parts/*.svg` (about 30) and four paper textures in `art/textures/`.

## Physics (decided)
- 2D, side view. Shrunk but consistent solar-system scale (planet radii, orbit radii and gravitational parameters all scaled with the same rules so transfer windows exist on in-game-day timescales).
- Patched conics: one dominant body per craft at a time, with spheres of influence. Bodies: Sun, Mercury, Venus, Earth, Moon, Mars (optionally Phobos/Deimos as dots), Jupiter.
- Integrator: semi-implicit Euler at minimum, Velocity Verlet or RK4 preferred. Screen-space-constant line weights; floating-point care at large coordinates (body-relative positions).
- Time warp 1x to 1,000,000x, physics steps per frame scale with warp; warp-to-event (Ap, Pe, SOI change, node, landing) computed from the predicted trajectory.
- Thin atmosphere on Earth and Venus with simple drag; staging; landing success = vertical speed under threshold and roughly upright.

## Visual direction (see docs/art-direction-brief.md)
Four documents, one grid, three typefaces (IBM Plex Mono for readouts, Archivo all-caps for headings, Source Sans 3 for running text):
- Blueprint — flight view. Paper #1B3A6B, ink #F2F4F7 / #A9D6E5, accent #E4572E for warnings and markers only. No fill color on planets; identity by hatching/stipple.
- Vellum — builder. Paper #F3EBD8, ink #1E1C1A, red pencil #C8382B.
- CRT — map, warp, maneuver nodes. Paper #050806, ink #5CFF8A, accent #FFB347. Scanlines, slight bloom.
- Manual — menus, tech tree, briefings, achievements, recorder. Paper #EFEAE0, ink #1A1A1A, spot #E4572E, halftone.
Rules: linework first, two stroke weights (1.5px structure, 0.75px annotation), visible 8px grid at 6–10%, no gradients/shadows/rounded cards/particles/screen shake, no icons without text labels, no emoji, no NASA names or insignia, no fifth document type.

## Repo layout
```
index.html          entry; loads src/main.js
src/core/           physics, orbits, bodies, parts, staging, missions, techtree, save (no DOM)
src/render/         one drawing module per document: blueprint.js, vellum.js, crt.js, manual.js, plus camera.js
src/ui/             input.js (keyboard+touch), hud.js, screens.js
src/audio/          music.js (procedural layers), sfx.js, mixer.js
art/parts/          part SVGs (1.5px/0.75px strokes, no fills, attachment nodes as named elements)
art/textures/       four tiling PNGs, 512px
art/covers/         approved illustrations (reference and milestone cards)
art/reference/      approved concept images per document (reference only, never shipped)
docs/               art-direction-brief.md, build-plan.md, decisions.md
snapshots/          one committed single-file build per milestone (m1-lander.html, ...)
```

## Milestones (build in this order; each must be playable before the next)
1. Lander: flat-ish Moon, thrust, rotation, fuel, landing/crash, blueprint HUD, fixed-step loop, replay recording.
2. Round planet + continuous zoom camera + trajectory prediction + Ap/Pe readouts; reach orbit.
3. Earth–Moon with patched conics, SOI transitions, CRT map, time warp, warp-to-event.
4. Builder (vellum): parts catalog, vertical stack + radial boosters, staging, stats panel, saved designs.
5. Career: manual-paper menus, missions 1–12, tech tree, achievements, briefings, "why did that happen" explainer, radio chatter.
6. Solar system: remaining bodies, interplanetary missions, transfer windows, maneuver nodes.
7. Challenges: timed/mass/fuel-constrained scenarios, daily seed, personal bests, local ghosts, flight recorder.
8. Audio: procedural chip layers per document, SFX, adaptive mixing, fatigue rules; PWA manifest.

## Working rules
- Commit small, commit often, with messages a non-coder can read ("Lander: add landing legs and crash detection").
- After each milestone, produce a single-file build in `dist/` for snapshot publishing, and keep a copy in the repo: `node tools/snapshot.js --keep m<n>-<name>` writes `snapshots/m<n>-<name>.html`; commit it with the gate. The owner's clone of the repo is his local copy of every milestone.
- Keep docs/decisions.md current: one line per decision, dated.
- When unsure about a design choice, pick the option consistent with the brief and say what you assumed; don't block on questions a playtest will answer.

## Autonomous mode (routines and cloud sessions)
When running without a human in the loop:
- Start by reading docs/progress.md and the open GitHub issues. Owner issues first (they are playtest feedback), then the next unticked task of the current milestone. Do not start a later milestone while a "Gate:" issue is open.
- Keep main deployable: run the snapshot build and open dist/index.html headlessly (or at least check it parses and the dev server serves it without console errors) before every commit. If a change breaks the build and you cannot fix it in the same run, revert it.
- One task per commit; tick the task in docs/progress.md in the same commit; update docs/decisions.md when you choose something the docs left open.
- When a milestone's tasks are all ticked, open an issue "Gate: M<n> ready to play" with a plain-language how-to-play (URL, controls, what to try) and stop.
- When blocked by something only the owner can decide, open an issue titled "Question: …", pick the option most consistent with the brief, note the assumption in decisions.md, and continue.
- Reply to owner issues in plain language, no jargon; close them when the fix is deployed.
- Never commit secrets, never change the GitHub Pages workflow without saying so in an issue, never delete art/ or docs/.
