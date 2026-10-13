# Kármán Program — Build Plan (agent edition)

Nine milestones, in order. A milestone is done when its gate is met and the owner has played it and said go. Work in small, always-playable steps. Full scope detail per milestone is in docs/progress.md (the task checklist). This file holds the intent and the gate.

| # | Milestone | Intent | Gate (owner plays and confirms) |
|---|---|---|---|
| M0 | Foundations | Repo runs, deploys to GitHub Pages, builds a single-file snapshot | Blank blueprint paper with grid and title block is live at the Pages URL |
| M1 | Lander | Lunar lander on a flat Moon: fixed-step physics core, controls, land/crash, blueprint HUD, input recording and deterministic replay, results card | A first-time player lands within five tries; a replay lands in the same spot; touch works on a phone |
| M2 | Orbit | Round Moon, inverse-square gravity, zooming follow camera, trajectory prediction with Ap/Pe, attitude indicator with prograde/retrograde hold, a fixed two-stage rocket, sandbox start chooser | Stable orbit from the surface is learnable in a session; predicted path matches reality |
| M3 | Earth–Moon | Scaled Earth–Moon system, patched conics with SOI handoff, thin Earth atmosphere, warp to 100,000x and warp-to-event, CRT map document, re-entry heating + heat shield + parachute, three-stage test rocket | Earth → Moon landing → Earth return is possible; warp-to-encounter makes the coast painless |
| M4 | Builder | Part model (~30 parts, 3 sizes), part SVGs, vellum builder with stacking + radial boosters + staging list + stats panel + red-pencil warnings, saved designs with six presets, JSON export/import, design feeds the sim | Build the lunar-return preset from scratch in under five minutes and fly it to the Moon and back |
| M5 | Career | Manual document screens, missions 1–12 with briefings and sim-checked criteria, ~30-node tech tree unlocked by missions/achievements, achievement stamps, rules-based "why did that happen" explainer, maneuver-name detection, CAPCOM chatter bank, sandbox mode, save/load | A new player goes from mission 1 to Moon return following the briefings; the explainer diagnoses the three common failures |
| M6 | Solar system | Mercury, Venus, Mars (+moons as dots), Jupiter flyby on shared scale rules; warp to 1,000,000x; draggable maneuver nodes with live encounter prediction; transfer-window gauge; missions 13–18 and their tech nodes | Mars landing and return without a calculator; map readable from Mercury to Jupiter |
| M7 | Challenges | Ten constrained scenarios, date-seeded daily challenge, personal bests, optional local ghosts (last failure or best), flight recorder figure with ghost overlay and JSON export, photo mode | Attempt a daily, fail, retry against the ghost, beat it |
| M8 | Audio + PWA | Mixer, procedural Tone.js music per document driven by flight state, ambient stems, SFX set, CAPCOM squelch, PWA manifest + service worker, install prompt | An hour-long session does not fatigue; installs on a phone and runs offline |

## Mission list (M5 and M6)
1 Sounding rocket past the Kármán line · 2 Suborbital hop · 3 Reach orbit · 4 Circular orbit within tolerance · 5 Orbit change to target altitude · 6 Deorbit and recover · 7 Satellite to a given orbit (module beeps) · 8 Moon flyby · 9 Moon orbit · 10 Moon landing · 11 Moon landing and return · 12 Precision landing near a marker · 13 Venus flyby · 14 Mars orbit · 15 Mars landing · 16 Mars landing and return · 17 Mercury orbit · 18 Jupiter gravity assist.

## Standing risks and their answers
- Orbit drift → Velocity Verlet or RK4; a test that a circular orbit stays circular for 100 periods.
- Float jitter far from bodies → body-relative coordinates.
- Slow prediction at high warp → coarser prediction step, capped length, recompute only on thrust or SOI change.
- Blueprint too austere → the brief's 20% wash fallback, only after M3 has been played without it.
- Builder creep → vertical stack plus radial boosters only.
- Career balance → every mission ships with a reference flight recording; hints after two failures.
- Audio fatigue and iOS quirks → brief's fatigue rules; start audio on first gesture; resume on visibility change.
