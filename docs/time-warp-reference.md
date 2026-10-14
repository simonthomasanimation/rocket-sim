# Time warp: how other games do it, and what Kármán Program will do

Reference gathered 14 Oct 2026 for Milestone 3 (owner note: once in space we must go far beyond ×64). Figures are from the games' wikis and forums; treat the exact numbers as approximate.

## Points of reference

| Game | Ladder | Caps and rules |
|---|---|---|
| Kerbal Space Program | Physics warp ×1, ×2, ×3, ×4 (physics keeps running, engines allowed). On-rails warp ×5, ×10, ×50, ×100, ×1,000, ×10,000, ×100,000 (no physics: the craft is moved along its orbit). | On-rails warp needs a minimum altitude that rises with the level, set per body. Kerbin (older table): ×5 to ×50 above the atmosphere (~69 km), ×100 above 120 km, ×1,000 above 240 km, ×10,000 above 480 km, ×100,000 above 600 km. Rails warp is refused in an atmosphere, on the surface, or with the throttle up. The game drops warp by itself before a sphere-of-influence change or atmosphere entry. |
| Juno: New Origins (SimpleRockets 2) | Physics warp up to ×10, then a non-physical warp ladder; the ceiling is computed per body rather than hand-set. | Warp is blocked in an atmosphere, while any engine is thrusting (ion engines excepted), and when a crash, atmosphere entry or SOI change is coming soon. Players complain when the automatic atmosphere limit is wrong, which argues for hand-tuned caps. |
| Spaceflight Simulator | Ten steps from ×25 up to ×1,000,000 (plus a slow ×3 near the ground). | One minimum warp altitude per body (Earth 25–30 km, the Moon 5 km, the Sun 500 km); under it warp is disabled until the craft climbs back out. No warp above ×3 under 1,000 m. |
| Orbiter | Continuous time acceleration up to ×100,000 (×1, ×10, ×100, ×1,000, ×10,000, ×100,000 presets). | No hard caps; the community notes that autopilots and attitude control break at high rates and that atmospheric flight is only safe to about ×10. |

Common pattern: a **short physics ladder** where engines and steering still work, then an **on-rails ladder** where the craft coasts along its orbit with no physics, gated by altitude or distance per body, refused in atmospheres and while thrusting, and dropped automatically before anything interesting (SOI change, atmosphere entry, periapsis, node).

## Plan for Kármán Program (to decide in Milestone 3)

The M2 ladder (×1 to ×64, physics steps per frame, capped by the height above the ground) is the physics ladder. M3 adds the rails ladder on top:

- **Physics warp:** ×1, ×1.5, ×2, ×3, ×4, ×6, ×8, ×12, ×16, ×24, ×32, ×48, ×64 as now. Engines, steering and atmosphere all work. Caps by height above the ground as today (×4 under 500 m … ×64 above 50 km).
- **Rails warp:** ×100, ×1,000, ×10,000, ×100,000, ×1,000,000. The craft moves along its Kepler orbit (patched conics); no physics, no thrust, no drag. Available only with the engine off, outside any atmosphere, and above a per-body floor that rises with the level (a table per body like KSP's, scaled to our radii). The same right arrow climbs straight from ×64 into the rails ladder, and the title block says RAILS so the player knows the engine will not answer.
- **Automatic warp-down:** before a sphere-of-influence change, atmosphere entry, periapsis under a set height, a maneuver node, or ground contact, the warp falls back to a safe physics level, which is what warp-to-event is built on.
- **Replay:** rails stretches are stored as the orbit they followed, so the tape stays small and still scrubs.
- **Why ×1,000,000:** at our shrunk scale a Moon transfer is hours of game time and an interplanetary transfer is days, so ×100,000 covers the Moon and ×1,000,000 the planets (CLAUDE.md target).

Sources: KSP wiki ([Time Warp](https://wiki.kerbalspaceprogram.com/wiki/Time_Warp), [Physics warp](https://wiki.kerbalspaceprogram.com/wiki/Physics_warp)), KSP forum ([warp limits by altitude](https://forum.kerbalspaceprogram.com/topic/107368-is-there-a-reason-for-the-time-warp-limits-at-different-altitudes)), Juno forums ([TimeWarp](https://www.simplerockets.com/Forums/View/152326/TimeWarp), [atmosphere and time warp](https://www.simplerockets.com/Forums/View/28572/Atmosphere-and-Time-Warp-Issues)), Spaceflight Simulator wiki ([Time warp](https://spaceflight-simulator.fandom.com/wiki/Time_warp)), Orbiter forum ([warp in atmosphere](https://www.orbiter-forum.com/goto/post?id=594775)).
