# Progress — the agent's task list

Rules: work top to bottom. Tick a task only when it is committed and the deployed build still runs. When every task of a milestone is ticked, keep the build (`node tools/snapshot.js --keep m<n>-<name>` → `snapshots/`), open a GitHub issue titled "Gate: M<n> ready to play" with how to play it, and stop working on later milestones until the owner closes that issue. Open issues from the owner come before new tasks. Add tasks here when you discover them; never delete one, strike it through with a reason.

## M0 Foundations
- [x] Folder layout per CLAUDE.md; package.json with `dev` (local server) and `snapshot` (inline to dist/index.html) scripts
- [x] index.html + src/main.js: full-window canvas, DPR-aware, resize handling
- [x] Blueprint paper: #1B3A6B, 8px grid white at 8%, title block lower right (KÁRMÁN PROGRAM / SHEET 1 OF 1 / date) in IBM Plex Mono
- [x] Fonts: IBM Plex Mono, Archivo, Source Sans 3 from Google Fonts with system fallbacks
- [x] GitHub Pages workflow publishing dist/ on push to main
- [x] docs/decisions.md seeded from CLAUDE.md, dated
- [x] Gate issue opened (#1)

## M1 Lander
- [x] Fixed-timestep loop (60 Hz, accumulator, render interpolation); core in src/core with no DOM
- [x] Lander model: mass, fuel, thrust, rotation, center of mass; semi-implicit Euler; flat Moon with uniform gravity
- [x] Controls: throttle up/down/full/cut, rotate left/right; keyboard and on-screen touch
- [x] Landing rules: safe if v-speed < 3 m/s, h-speed < 1 m/s, tilt < 10°; else crash; fuel runs out
- [x] Blueprint rendering: cutaway lander with hatched fuel, white flame with cyan core, hatched horizon with craters, dashed ballistic descent prediction
- [x] HUD strip: altitude and velocity dials, v/h speed readouts, fuel tape, throttle, CAPCOM line with 4 canned messages; accent only on caution/critical
- [x] Input recording as (tick, input); deterministic replay function; test that replay reproduces the landing position
- [x] Restart under one second; manual-paper results card (outcome, time, fuel left, max speed)
- [x] Placeholder engine noise via Web Audio (skip if awkward)
- [x] Replay transport (owner request on #2): exit, play/pause, reverse, fast ×4/×8/×16 both ways, single-tick stepping, scrub tape; keyboard J/K/L, arrows, Home/End, Esc and touch buttons
- [x] Gate issue opened (#2)
- [x] Milestone build kept in snapshots/m1-lander.html

## M2 Orbit
- [x] Round body, inverse-square gravity, body-relative coordinates
- [x] Integrator upgraded to Velocity Verlet or RK4; circular-orbit stability test (100 periods)
- [x] Follow camera with continuous zoom; screen-space-constant line weights; labels fade below 12px
- [x] Trajectory prediction without thrust; dashed path; Ap/Pe markers with typewriter labels; red-orange Pe when below surface
- [x] HUD orbital readouts: Ap, Pe, period
- [x] Compass-rose attitude indicator; prograde/retrograde hold
- [x] Fixed two-stage rocket with staging; surface-to-orbit achievable
- [x] Sandbox start chooser: surface or low orbit
- [x] Physics time warp ×1–×50 so an orbit can be watched, limited near the ground (added: M3 brings the full ladder and warp-to-event)
- [x] Gate issue opened (#3)
- [x] Milestone build kept in snapshots/m2-orbit.html

## M3 Earth–Moon
- [x] Scaled Earth–Moon system on shared scale rules; Moon orbits Earth
- [x] Thin Earth atmosphere with simple drag; dashed atmosphere ring
- [x] Patched conics: SOI spheres, handoff, prediction across SOI changes with encounter marker
- [x] Time warp 1x–100,000x: on-rails ladder above the ×64 physics ladder per docs/time-warp-reference.md; per-body caps by height, no rails warp in an atmosphere or with the engine on; warp-to-event (Ap, Pe, SOI, atmosphere entry, time)
- [x] CRT map document per brief; page-turn transition blueprint ↔ CRT
- [x] Re-entry heating threshold; heat shield part; parachute; splashdown counts as landing
- [x] Three-stage test rocket; Earth → Moon landing → return achievable (`node tools/mission.js` flies the KP-3 pad → orbit → Moon landing → lunar orbit → splashdown through the real core; the test suite runs it)
- [x] Gate issue opened (#4)
- [x] Milestone build kept in snapshots/m3-earth-moon.html (refreshed with the re-entry polish that landed while the gate was open)

## M4 Builder
- [ ] Part model and ~30 parts in one data file (mass, tank masses, thrust, Isp, nodes, category, size class)
- [ ] Part SVGs in art/parts per CLAUDE.md rules; catalog icon from same file
- [ ] Vellum document: catalog column, drag-and-drop stacking, radial boosters, decouplers define stages, reorderable staging list
- [ ] Stats panel: mass, launch TWR, dV per stage and total; red-pencil warnings
- [ ] Saved designs with names; six presets; JSON export/import
- [ ] Launch hands design to sim; mass, engines and staging come from the design
- [ ] Gate issue opened

## M5 Career
- [ ] Manual document: main menu, career hub, settings, page-turn transitions
- [ ] Missions 1–12: memo briefings, sim-checked success criteria, results pages, reference flight recording each
- [ ] Tech tree ~30 nodes as manual flowchart; unlocks by missions and achievements
- [ ] Achievement stamps
- [ ] Rules-based explainer with last-60-seconds figure; covers descent crash, missed orbit, out of fuel at minimum
- [ ] Maneuver-name detection (Hohmann, circularization, deorbit, TLI, LOI)
- [ ] CAPCOM chatter bank, context-triggered
- [ ] Tutorial pages in the manual document (owner request, 2026-10-14): the core mechanics with illustrations (throttle and tilt, staging, AP/PE and the dashed path, reaching orbit, time warp and rails, spheres of influence, the Moon window, re-entry corridor, shield attitude, parachute), plus a glossary of the words the sheets use (LEO, LEO return, periapsis, prograde/retrograde, SOI, delta-v, TWR, Kármán line). Reachable from the flight plan and from the report page's "why did that happen" explainer
- [ ] Sandbox mode; save/load through save.js with JSON export/import on settings
- [ ] Gate issue opened

## M6 Solar system
- [ ] Sun, Mercury, Venus (thick atmosphere), Mars (+Phobos/Deimos dots), Jupiter on shared scale rules
- [ ] Warp to 1,000,000x; warp-to-event extended to windows and encounters
- [ ] Maneuver nodes on CRT: place, drag prograde/retrograde/normal, live trajectory with SOI changes; burn countdown and dV in HUD
- [ ] Transfer-window gauge: phase angle, next window in N days, warp-to-window
- [ ] Body rendering per the brief's texture table
- [ ] Missions 13–18 and their tech nodes
- [ ] Gate issue opened

## M7 Challenges
- [ ] Challenge screens; ten scenarios, one constraint each
- [ ] Date-seeded daily challenge; personal bests per challenge and per day
- [ ] Optional local ghosts (last failure or best) built on M1 recording; off by default; toggle on retry screen
- [ ] Flight recorder figure (altitude, speed, fuel vs time, event markers), ghost overlay, JSON export
- [ ] Photo mode: freeze, hide HUD, save PNG
- [ ] Gate issue opened

## M8 Audio + PWA
- [ ] Mixer: music/SFX/master buses; mute toggles; audio starts on first gesture; resume on visibility change
- [ ] Procedural Tone.js music: one register per document, layers by throttle/altitude/warp/danger; no loop under 2 min; drop a layer every 5 min of coast
- [ ] Ambient stems from art/audio crossfaded under procedural layers
- [ ] SFX set per the brief; silence in vacuum except own ship; CAPCOM squelch
- [ ] PWA: manifest, service worker, install prompt, icon from wordmark
- [ ] Gate issue opened
