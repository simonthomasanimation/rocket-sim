# Kármán Program — Art Direction Brief

## Concept
The whole game is the paperwork of a 1960s space program. Every screen is a document that program would have produced. Same ink, same typefaces, same grid, four kinds of paper. The player is the flight director reading the program's own documents; the rocket happens to move on them. Reference model for concept images: GPT Image 2.5 (Sunburst) via Krea; reference only, never shipped.

## The four documents
| Document | Screens | Paper | Ink | Accent | Feel |
|---|---|---|---|---|---|
| Blueprint (cyanotype) | Flight: launch, orbit, landing, re-entry | Prussian blue #1B3A6B, white grid at 8%, faint fold creases | White #F2F4F7, pale cyan #A9D6E5 | Red-orange #E4572E, warnings and markers only | Precise, calm, slightly austere |
| Vellum & ink | Rocket builder, part details, saved designs | Cream #F3EBD8, grey grid at 10%, paper grain | Black #1E1C1A | Red pencil #C8382B for locked parts, corrections, warnings | Warm, tactile, drafting desk |
| Phosphor CRT | System map, maneuver planning, time warp | Black #050806, 2px scanlines at 6%, curved-glass vignette | Phosphor green #5CFF8A, soft bloom | Amber #FFB347 for planned trajectory and selected node | Mission control at 3 a.m. |
| Printed manual | Menus, career hub, briefings, tech tree, achievements, flight recorder, settings | Off-white #EFEAE0, halftone shading | Black #1A1A1A | Red-orange #E4572E single spot color, slight misregistration | Institutional, systematic |

**Blueprint (flight).** Rocket as a cutaway technical drawing: outline, stage divisions, engine bells, tanks hatched with fuel level. Flame white with pale-cyan core. Planets as large circles with hatched/stippled terrain; atmosphere as a dashed concentric ring. Predicted trajectory a dashed white ellipse; Ap/Pe as small circled markers with typewriter labels (Ap 112 km). HUD strip along the bottom: round dials for altitude and velocity, vertical fuel tape, dV counter, CAPCOM message line, engineering title block lower right (mission name, MET, sheet number).

**Vellum (builder).** Parts stack vertically on a central axis with dashed attachment nodes. Left column: parts catalog of small inked drawings with names; locked parts crossed out in red pencil with LOCKED stamped. Right: stats like a slide-rule panel (mass, thrust, TWR, dV per stage). Red-pencil warnings: TWR below 1, no decoupler between stages, no parachute.

**CRT (map).** Bodies as circles with lat/long ticks, SOI as dotted rings, orbits as thin green ellipses, craft as a bright triangle. Planned trajectory amber, current green. Maneuver nodes are draggable crosshairs with the resulting orbit drawn live. WARP x1000 as a blocky readout; warp-to-event targets as labelled ticks (TLI, LOI, Pe). Radio chatter scrolls here in terminal font.

**Manual (menus).** Every menu is a page: section header (SECTION 4 — RESEARCH & DEVELOPMENT), figure numbers, captions, page numbers. Tech tree as a branching flowchart of boxed nodes with engraved part drawings; unlocked nodes have a red-orange border and UNLOCKED stamp; locked ones halftone-greyed. Briefings as memos with FROM / TO / SUBJECT. Achievements are stamps. Flight recorder is a figure with axes and a caption.

## Shared DNA
- **Line.** Linework first. Two weights: 1.5px structure, 0.75px annotation. No gradients, soft shadows, or glow except CRT bloom. Fills are hatching, stipple or halftone only.
- **Grid.** Visible 8px grid at 6–10% on every document; UI snaps to it.
- **Typography.** IBM Plex Mono (or Courier Prime) for annotation, HUD and all numerals; Archivo all-caps tracked for headings and stamps; Source Sans 3 for running text. No serifs, no playful fonts.
- **Palette.** Each paper has exactly three colors: paper, ink, accent. Red-orange #E4572E is the program's house color and the only color on all four documents.
- **Texture.** Paper grain 4–6%, fold creases on blueprint, scanlines on CRT. Never animated, never over text.
- **Camera.** Continuous zoom from launchpad to full system; line weights screen-space constant; labels fade below 12px.
- **Chrome.** Buttons are stamped rectangles, toggles tick boxes, sliders vertical tapes. Corners ≤2px. No icons without text labels. No emoji.

## Signalling and state (flight view is two-tone)
**Urgency = accent only.** Marker (encounter found, node placed): small accent dot, static. Caution (fuel <15%, TWR <1 at launch, Pe inside atmosphere): accent outline on the instrument, 1 Hz blink. Critical (Pe below surface, impact <10 s, no fuel): accent fill, 2 Hz blink, CAPCOM line turns accent. Nothing else is ever red-orange.

**Identity = texture.** Earth: contour-line continents, dashed atmosphere ring, hatched cloud bands. Moon: stipple, circled craters with hatched rims. Mars: diagonal hatching, cross-hatched polar caps, two labelled dots for moons. Venus: dense horizontal hatching, thick dashed atmosphere. Mercury: sparse stipple, heavy crater circles. Jupiter: horizontal bands of alternating hatch density, one circled storm. Sun: open circle with ray ticks.

**Change = motion.** Staging: brief dashed-line separation plus CAPCOM note. New SOI: trajectory redraws with a one-frame flash and label (ENTERING MOON SOI). Milestone: stamp lands on the title block.

**Fallback.** If playtesting shows the blueprint too austere, the approved escape hatch is one muted wash per body at 20% under the hatching. Not before the Moon milestone has been played without it.

## Motion
120–200 ms, linear or gentle ease-out, never spring. Document switch = page turn (200 ms, grid fixed). Dials sweep and settle in 0.5 s; numerals tick in monospace. Stamps land with an 80 ms scale 110→100% and a thud. Crashes cut hard to a damage report on manual paper (the explainer). Time warp: CRT draws faster, scanlines thin, music filters down. Idle is still: no twinkling stars.

## Audio pairing
Chip-inspired, not strict 8-bit. Per document: Blueprint 90–110 BPM, square/triangle leads over a soft pad, full chiptune only during burns and the last 60 s before landing, layers driven by throttle and altitude. Vellum 70–80 BPM lo-fi chip with tape hiss. CRT sparse pulses and filtered drones, near-silence at high warp. Manual: one short signature chip motif, silence between interactions. SFX realistic where physics is real (engine from filtered noise, decoupler clunk, leg thud, impact, re-entry hiss, satellite beep), chip-styled for UI (stamp thud, dial tick, tape scroll, page turn). No sound in vacuum except own ship. CAPCOM text with squelch click. Fatigue rules: no loop under 2 min; drop a layer every 5 min of coast; music mutable separately from SFX.

## Production
Everything code-drawn in Canvas 2D except ~30 part SVGs (1.5/0.75px strokes, no fills, attachment nodes as named elements, recolored per document) and four 512px tiling textures. Stamps/title blocks as HTML/CSS over canvas. Fonts from Google Fonts, pinned, with system monospace fallback. Asset budget under 2 MB excluding fonts. Cover and milestone illustrations (art/covers) are richer than the working drawings on purpose: they are "plates in the manual".

## Do / Don't
Do: draw first, fill never; label like an engineer; keep the grid aligned; let stillness work; accent only for things to act on; ask of every element which document it belongs to.
Don't: gradients, drop shadows, rounded cards, glassmorphism, glow outside the CRT; fill color on planets before the fallback is triggered; icons without labels; emoji; particles, confetti, screen shake, explosions; photographic or 3D elements; NASA names or insignia; a fifth paper.
