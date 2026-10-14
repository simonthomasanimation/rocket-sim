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
- [x] Parachutes in two automatic steps (owner request, 2026-10-14): one press puts the drogue out, the main follows by itself under 90 m/s and 3 km (reefed four seconds, then full); drawn, read out, called by CAPCOM
- [x] Quicker descent under the canopy (owner request, 2026-10-14): ×64 allowed at any height under a canopy, E warps to the main chute under the drogue and to touchdown once the main is full, the main coming out drops the warp so it can be seen
- [x] Finding the way in space (owner request, 2026-10-14): the Moon's sphere and the edge of Earth's reach drawn as rings whenever on the sheet, edge pointers with name and distance to bodies off the sheet, the body named when it is a dot, the end of a path marked (leaves Earth's reach, in accent, or prediction ends), CAPCOM warns of an escape
- [x] Earth landscape (owner request, 2026-10-14): coastal pad, plains and hill country, mountain ranges to 4.5 km with contour lines, islands, seas with water lines and labels; the camera frames against the local ground
- [x] Sheet tidy-up on small screens (2026-10-14): edge pointers keep clear of the title block and the Detail A inset, run along the horizon rather than into the ground when the body is below it, and are not drawn for the body the craft is standing on; the far-side ground label is printed once, not twice; a long CAPCOM call wraps onto two lines in the strip instead of being cut short
- [x] Camera that stays where you put it (owner request, 2026-10-14): a zoom you set holds as an absolute scale instead of multiplying the automatic one (which ran away to 10,000 km as the craft climbed), 0 hands the view back; drag with the mouse or a finger pans the sheet and the map, with a pointer back to the craft and a VIEW HELD note by the scale bar
- [x] Planning the Moon (owner request, 2026-10-14): the Moon's path round Earth (and Earth's apparent path round the Moon) as a fine dotted ring on the sheet; once the predicted path reaches a quarter of the way out, a ghost of the Moon where it will be when the path passes nearest to it, tied to that point, with the miss distance; the same ghost on the CRT map
- [x] Rings for the wide view only (owner request, 2026-10-14): the spheres of influence, Earth's edge of reach (now named EARTH SOI) and the bodies' paths appear once the view is wide enough for a ring to read as a ring (radius under one and a half sheet diagonals), never at planet level
- [x] Centre on the rocket (owner request, 2026-10-14): C (and a CENTRE stamp on touch) puts the view back on the craft keeping the zoom you set; 0 still resets both
- [x] Warp on the way to the Moon (owner report, 2026-10-14): a tank run dry with the throttle still open no longer blocks the rails (the ladder sat at ×64); a refused warp press is explained by CAPCOM (engine, canopy, air, floor, event); the physics warp holds at ×8 while the engine burns so a tank cannot vanish in seconds; CAPCOM calls the Moon landing on the path during a burn (cut now) and an encounter lost to a burn gone long
- [x] Lock the view on the rocket (owner request, 2026-10-14): L (and a LOCK stamp) pins the craft to the middle of the sheet at any zoom, automatic or held, on the sheet and on the map; L again unlocks. The ghost of the Moon where the path meets it always gets a disc and a name (MOON WILL BE HERE AT T-…), so the loop round it does not read as a knot
- [x] Reading a path with several loops (owner question, 2026-10-14): each segment of the predicted path after a change of sphere is drawn fainter on both documents, so the order of overlapping loops (before the flyby, round the Moon, after) is visible at a glance
- [x] Altitude readout in the dial's unit (owner question, 2026-10-14): between 1,000 and 6,000 km the dial is marked in km but the number said MM (1.56 MM over the Moon); it now says 1560 KM, and MM only once the dial itself is in MM
- [x] Closest-approach ghost dropped (owner request, 2026-10-14): the "MOON AT T-… / YOUR PATH PASSES … OFF" ghost with its sphere ring looked exactly like the real Moon; removed from the sheet and the map. The Moon's path ring stays, and so does the ghost where the path actually enters the Moon's sphere, now a disc and a name only, no sphere ring
- [x] Test battery (owner request, 2026-10-14): 28 core tests, the deploy check, and a headless battery flying all seven starts through the map, replay, pause, zoom, pan, lock, warp, staging, parachutes and the report pages on the dev page, the offline snapshot and a phone-sized view, with no console errors at 60 fps. Two finds fixed: the report said NaN% fuel for the capsule (no tank), and at a fine zoom far from the pad every ground tick read the same whole kilometre (now 1642.01, 1642.02 …)

## M4 Builder
- [x] Part model and ~30 parts in one data file (mass, tank masses, thrust, Isp, nodes, category, size class): src/core/parts.js holds 33 parts in seven categories and three sizes, the stacking rules, and the compiler that turns a design into the stage list the flight core flies with the red-pencil warnings; src/core/designs.js holds the KP-3 as the first preset (it compiles to within 3 % of the hand-tuned rocket)
- [x] Part SVGs in art/parts per CLAUDE.md rules; catalog icon from same file: 33 drawings written by tools/parts-svg.js from the part data (two non-scaling stroke weights, currentColor, no fills, named nodes), src/render/partart.js recolours and rasterises one file at any size for the catalog icon, the drafting table and the flight drawing, the snapshot build inlines them, the test suite lints them and the deploy check decodes every one on both pages
- [x] Vellum document: catalog column, drag-and-drop stacking, radial boosters, decouplers define stages, reorderable staging list: B (or the BUILDER button on the flight plan) turns the page to the vellum sheet; the catalog column (a strip along the foot on phones) lists the 33 parts by category with their own drawings as icons; a drag puts a part at any junction of the stack or a radial pair on a tank, a tap puts it on top (or on the selected tank); parts drag out to the catalog to remove, Delete removes the selection; decouplers rule the sheet into stages in red pencil; the panel lists the stages in firing order with what each fires, and a BOOSTERS row can be moved later (dropped with its stage) and back; NEW, KP-3 and FLIGHT PLAN buttons; the deploy check drives it headlessly
- [x] Stats panel: mass, launch TWR, dV per stage and total; red-pencil warnings: the panel prints pad mass, height, part count, TWR off Earth and off the Moon, total ΔV, then a slide-rule table of each stage's mass at ignition, TWR and ΔV; the compiler's warnings (buried engine, no decoupler, tanks without an engine, no capsule, no parachute, no shield, TWR under 1, a tank that runs dry before its boosters) are listed in red pencil; each stage's ΔV and TWR are also written beside it on the sheet
- [x] Saved designs with names; six presets; JSON export/import: a name field and SAVE keep designs by name in local storage through core/save.js (every read and write guarded; the game runs with storage blocked), a list with LOAD and DELETE, six presets (KP-1 sounding rocket, KP-2 Moon orbiter, KP-3 lunar return, KP-4 orbital capsule, KP-5 satellite carrier, KP-6 heavy lunar) that all compile clean, EXPORT JSON downloads the sheet, IMPORT JSON reads a design or a whole save back with every part checked; the sheet as it was left comes back on the next visit
- [x] Launch hands design to sim; mass, engines and staging come from the design: LAUNCH: EARTH / LAUNCH: MOON (or Enter) on the vellum takes the sheet to Pad 1; the flight plan lists the two design starts as 8 and 9; the flight is compiled from the design (stages, masses, thrust, Isp, boosters as their own first stage, shield and parachute from the parts), drawn from the part files in flight with flames under every engine that burns, fuel lines across the tanks and dropped stages as their own parts; the recording keeps a copy of the design so a replay rebuilds the same rocket; the KP-3 built from parts flies the whole reference mission in the test suite
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
