// Parts: the catalog the builder stacks rockets from, and the rules that turn
// a stacked design into the stage list the flight core flies. Pure data and
// pure functions; no DOM. Units are SI (kg, N, s, m).
//
// A design is a vertical stack of parts, bottom first, each stack part able
// to carry pairs of radial parts (boosters, fins, legs). Decouplers cut the
// stack into stages: a decoupler belongs to the stage below it and is dropped
// with it. Radial boosters on a stage burn alongside that stage's engines on
// one throttle and are dropped as a stage of their own when their tanks run
// dry, before the stage they hang on.

import { G0 } from './craft.js';

// Three size classes. The radius is the stack radius the flight drawing and
// the drag model use; the diameter is what the catalog prints.
export const SIZES = Object.freeze({
  S: { id: 'S', radius: 1.0, label: 'Ø 2.0 M' },
  M: { id: 'M', radius: 1.3, label: 'Ø 2.6 M' },
  L: { id: 'L', radius: 1.8, label: 'Ø 3.6 M' },
});

export const CATEGORIES = Object.freeze([
  { id: 'command', name: 'COMMAND' },
  { id: 'tank', name: 'TANKS' },
  { id: 'engine', name: 'ENGINES' },
  { id: 'booster', name: 'BOOSTERS' },
  { id: 'decoupler', name: 'DECOUPLERS' },
  { id: 'structure', name: 'STRUCTURE' },
  { id: 'utility', name: 'UTILITY' },
]);

// Every part: id (also its SVG file name in art/parts), name as printed on
// the vellum, category, size class, mass (kg, dry), height (m, along the
// stack), nodes and what it does. Nodes: `top` and `bottom` are stack nodes
// and give the size class of what fits there (null = nothing stacks there);
// `radial` is 'host' for parts that carry radial pairs, 'attach' for parts
// that hang on a host. `tier` is the tech tree tier that unlocks it (M5);
// tier 1 is the starting set.
const P = [];
const part = (p) => { P.push(Object.freeze(p)); return p; };
const stack = (top, bottom) => ({ top, bottom, radial: null });
const host = (size) => ({ top: size, bottom: size, radial: 'host' });
const attach = () => ({ top: null, bottom: null, radial: 'attach' });

// COMMAND. A capsule makes its stage the one that comes home: a heat shield
// and a parachute below and above it count only on that stage.
part({ id: 'probe-core', name: 'PROBE CORE', category: 'command', size: 'S', mass: 80, height: 0.6, nodes: stack('S', 'S'), crew: 0, tier: 1,
  text: 'Unmanned guidance unit. Flies anything; brings nobody home.' });
part({ id: 'capsule-s', name: 'MK-1 CAPSULE', category: 'command', size: 'S', mass: 550, height: 1.9, nodes: stack('S', 'S'), crew: 1, tier: 1,
  text: 'One seat, one window. Shield below, parachute above.' });
part({ id: 'capsule-m', name: 'MK-2 CAPSULE', category: 'command', size: 'M', mass: 1100, height: 2.4, nodes: stack('S', 'M'), crew: 2, tier: 2,
  text: 'Two seats. Takes a small parachute on top and a medium shield below.' });

// TANKS. Fuel is one propellant pair counted together, in kg.
part({ id: 'tank-s-short', name: 'TANK S/1', category: 'tank', size: 'S', mass: 35, fuel: 350, height: 1.8, nodes: host('S'), tier: 1,
  text: '350 kg of propellant in a small drum.' });
part({ id: 'tank-s-long', name: 'TANK S/2', category: 'tank', size: 'S', mass: 70, fuel: 700, height: 3.4, nodes: host('S'), tier: 1,
  text: 'Two small drums welded end to end.' });
part({ id: 'tank-m-short', name: 'TANK M/1', category: 'tank', size: 'M', mass: 140, fuel: 1600, height: 2.6, nodes: host('M'), tier: 1,
  text: '1,600 kg of propellant.' });
part({ id: 'tank-m-long', name: 'TANK M/2', category: 'tank', size: 'M', mass: 280, fuel: 3200, height: 5.0, nodes: host('M'), tier: 2,
  text: 'The long medium tank.' });
part({ id: 'tank-l-short', name: 'TANK L/1', category: 'tank', size: 'L', mass: 900, fuel: 9000, height: 7.5, nodes: host('L'), tier: 2,
  text: '9,000 kg of propellant. First-stage stock.' });
part({ id: 'tank-l-long', name: 'TANK L/2', category: 'tank', size: 'L', mass: 1800, fuel: 18000, height: 14.5, nodes: host('L'), tier: 3,
  text: 'The big one. Needs a main engine under it.' });

// ENGINES. One Isp each; the sim has no sea-level / vacuum split yet.
part({ id: 'engine-trim', name: 'KV-2 TRIM', category: 'engine', size: 'S', mass: 18, thrust: 2000, isp: 320, height: 0.7, nodes: stack('S', 'S'), tier: 2,
  text: 'A probe\'s engine. 2 kN, very frugal.' });
part({ id: 'engine-s-vac', name: 'KV-8 VACUUM', category: 'engine', size: 'S', mass: 50, thrust: 8000, isp: 310, height: 1.2, nodes: stack('S', 'S'), tier: 1,
  text: '8 kN for upper stages and lunar ascent.' });
part({ id: 'engine-s-lift', name: 'KV-20 SUSTAINER', category: 'engine', size: 'S', mass: 110, thrust: 20000, isp: 285, height: 1.4, nodes: stack('S', 'S'), tier: 1,
  text: '20 kN. Lifts a small rocket off the Moon or a sounding rocket off Earth.' });
part({ id: 'engine-m-vac', name: 'KV-30 VACUUM', category: 'engine', size: 'M', mass: 360, thrust: 30000, isp: 310, height: 1.6, nodes: stack('M', 'M'), tier: 2,
  text: '30 kN with a wide bell. The Moon stage\'s engine.' });
part({ id: 'engine-m-lift', name: 'KV-120 LIFTER', category: 'engine', size: 'M', mass: 520, thrust: 120000, isp: 275, height: 2.0, nodes: stack('M', 'M'), tier: 2,
  text: '120 kN. A medium first stage off Earth.' });
part({ id: 'engine-l-main', name: 'KV-400 MAIN', category: 'engine', size: 'L', mass: 650, thrust: 400000, isp: 280, height: 2.6, nodes: stack('L', 'L'), tier: 3,
  text: '400 kN. The KP-3\'s first-stage engine.' });
part({ id: 'engine-l-cluster', name: 'KV-600 CLUSTER', category: 'engine', size: 'L', mass: 1150, thrust: 600000, isp: 265, height: 3.0, nodes: stack('L', 'L'), tier: 4,
  text: 'Four chambers, 600 kN, thirsty. For the heaviest stacks.' });

// BOOSTERS. Solid strap-ons in pairs; each carries its own release bolts.
// Fuel and mass are per booster; a pair doubles them.
part({ id: 'booster-s', name: 'SRB-50', category: 'booster', size: 'S', mass: 120, fuel: 600, thrust: 50000, isp: 230, height: 4.0, radius: 0.5, nodes: attach(), tier: 1,
  text: 'Small solid booster, 50 kN for about 28 seconds.' });
part({ id: 'booster-m', name: 'SRB-120', category: 'booster', size: 'M', mass: 280, fuel: 1500, thrust: 120000, isp: 235, height: 6.5, radius: 0.7, nodes: attach(), tier: 2,
  text: 'Medium solid booster, 120 kN for about 29 seconds.' });
part({ id: 'booster-l', name: 'SRB-300', category: 'booster', size: 'L', mass: 700, fuel: 4000, thrust: 300000, isp: 240, height: 10.0, radius: 0.9, nodes: attach(), tier: 3,
  text: 'Large solid booster, 300 kN for about 31 seconds.' });

// DECOUPLERS. Cut the stack; dropped with the stage below.
part({ id: 'decoupler-s', name: 'DECOUPLER S', category: 'decoupler', size: 'S', mass: 30, height: 0.2, nodes: stack('S', 'S'), tier: 1,
  text: 'Separation ring. Everything above it is the next stage.' });
part({ id: 'decoupler-m', name: 'DECOUPLER M', category: 'decoupler', size: 'M', mass: 100, height: 0.3, nodes: stack('M', 'M'), tier: 1,
  text: 'Medium separation ring.' });
part({ id: 'decoupler-l', name: 'DECOUPLER L', category: 'decoupler', size: 'L', mass: 150, height: 0.4, nodes: stack('L', 'L'), tier: 2,
  text: 'Large separation ring.' });

// STRUCTURE. Adapters change the stack size; fins and legs hang on a host.
part({ id: 'adapter-s-m', name: 'ADAPTER S-M', category: 'structure', size: 'M', mass: 60, height: 0.8, nodes: stack('S', 'M'), tier: 1,
  text: 'Medium below, small above.' });
part({ id: 'adapter-m-l', name: 'ADAPTER M-L', category: 'structure', size: 'L', mass: 160, height: 1.2, nodes: stack('M', 'L'), tier: 2,
  text: 'Large below, medium above.' });
part({ id: 'fins', name: 'FIN PAIR', category: 'structure', size: 'S', mass: 25, height: 1.6, span: 1.2, nodes: attach(), tier: 1,
  text: 'Keeps a rocket pointed the way it flies; a wider stance to land on.' });
part({ id: 'legs-s', name: 'LEG PAIR S', category: 'structure', size: 'S', mass: 30, height: 1.6, span: 0.6, nodes: attach(), legs: true, tier: 1,
  text: 'Landing legs for a small stage. Fold out 0.6 m past the hull.' });
part({ id: 'legs-m', name: 'LEG PAIR M', category: 'structure', size: 'M', mass: 40, height: 2.4, span: 1.3, nodes: attach(), legs: true, tier: 2,
  text: 'Landing legs for a medium stage. The KP-3 lands the Moon on these.' });

// UTILITY. What a flight needs beyond thrust.
part({ id: 'parachute', name: 'PARACHUTE', category: 'utility', size: 'S', mass: 80, height: 0.3, nodes: stack(null, 'S'), chute: true, tier: 1,
  text: 'Drogue and main in one canister. Goes on top of a capsule.' });
part({ id: 'shield-s', name: 'HEAT SHIELD S', category: 'utility', size: 'S', mass: 120, height: 0.3, nodes: stack('S', 'S'), shield: true, tier: 1,
  text: 'Ablative dish under a small capsule. Fly it first into the air.' });
part({ id: 'shield-m', name: 'HEAT SHIELD M', category: 'utility', size: 'M', mass: 220, height: 0.4, nodes: stack('M', 'M'), shield: true, tier: 2,
  text: 'Ablative dish under a medium capsule.' });
part({ id: 'nose-s', name: 'NOSE CONE S', category: 'utility', size: 'S', mass: 20, height: 1.2, nodes: stack(null, 'S'), tier: 1,
  text: 'Closes a small stack. Nothing stacks above it.' });
part({ id: 'nose-m', name: 'NOSE CONE M', category: 'utility', size: 'M', mass: 45, height: 1.6, nodes: stack(null, 'M'), tier: 1,
  text: 'Closes a medium stack.' });
part({ id: 'beeper', name: 'BEEPER MODULE', category: 'utility', size: 'S', mass: 60, height: 0.5, nodes: stack('S', 'S'), beeper: true, tier: 2,
  text: 'A satellite that beeps once in its orbit. Mission 7 wants one.' });

export const PARTS = Object.freeze(P);
export const PART_BY_ID = Object.freeze(Object.fromEntries(P.map((p) => [p.id, p])));

export function partById(id) {
  const p = PART_BY_ID[id];
  if (!p) throw new Error(`unknown part ${id}`);
  return p;
}

export function partsInCategory(category) {
  return PARTS.filter((p) => p.category === category);
}

export function partRadius(p) {
  return p.radius || SIZES[p.size].radius;
}

// A design: a name and a stack of parts, bottom first. Each entry is
// { id, radials: [{ id, count, drop }] }; radials are pairs, count 2 or 4,
// and only sit on a host part. `drop` is for boosters: 'early' (the
// default) drops them as a stage of their own the moment they run dry,
// 'with' keeps them on until the stage they hang on is dropped. A design
// is plain JSON so it can be saved and exported as it is.
export function createDesign(name = 'UNTITLED', stack = []) {
  return { name, stack: stack.map((e) => (typeof e === 'string' ? { id: e, radials: [] } : { id: e.id, radials: (e.radials || []).map((r) => ({ id: r.id, count: r.count || 2, drop: r.drop === 'with' ? 'with' : 'early' })) })) };
}

// A design read from a save or an import: checked part by part and
// rebuilt, so a stray file cannot put nonsense on the sheet. Throws with a
// plain reason when it is not a design.
export function validateDesign(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('NOT A DESIGN');
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 32).toUpperCase() : 'UNTITLED';
  if (!Array.isArray(raw.stack)) throw new Error('NO STACK IN THE FILE');
  const stack = [];
  raw.stack.forEach((e, i) => {
    const id = typeof e === 'string' ? e : e && e.id;
    const p = PART_BY_ID[id];
    if (!p) throw new Error(`UNKNOWN PART ${String(id).toUpperCase().slice(0, 24)} AT ${i + 1}`);
    if (p.nodes.radial === 'attach') throw new Error(`${p.name} CANNOT BE IN THE STACK`);
    const radials = [];
    for (const r of (e && Array.isArray(e.radials) ? e.radials : [])) {
      const rp = PART_BY_ID[r && r.id];
      if (!rp) throw new Error(`UNKNOWN RADIAL PART AT ${i + 1}`);
      if (rp.nodes.radial !== 'attach') throw new Error(`${rp.name} IS NOT A RADIAL PART`);
      if (p.nodes.radial !== 'host') throw new Error(`${p.name} TAKES NO RADIAL PARTS`);
      if (radials.some((q) => q.id === rp.id)) continue;
      radials.push({ id: rp.id, count: r.count === 4 ? 4 : 2, drop: r.drop === 'with' ? 'with' : 'early' });
    }
    stack.push({ id: p.id, radials });
  });
  return { name, stack };
}

// A copy that shares nothing with the original.
export function cloneDesign(design) {
  return createDesign(design.name, design.stack);
}

// Can `partId` go on top of the stack as it stands? Returns null when it
// can, or a short reason when it cannot.
export function stackRefusal(design, partId) {
  const p = partById(partId);
  if (p.nodes.radial === 'attach') return 'RADIAL PART: HANGS ON A TANK';
  if (!p.nodes.bottom && design.stack.length) return 'NO NODE BELOW';
  if (!design.stack.length) return null;
  const below = partById(design.stack[design.stack.length - 1].id);
  if (!below.nodes.top) return `NOTHING STACKS ON A ${below.name}`;
  return null;
}

// Can a radial pair of `partId` hang on the stack entry at `index`?
export function radialRefusal(design, index, partId) {
  const p = partById(partId);
  if (p.nodes.radial !== 'attach') return 'STACK PART: GOES ON TOP';
  const on = design.stack[index];
  if (!on) return 'NOTHING THERE';
  const hostPart = partById(on.id);
  if (hostPart.nodes.radial !== 'host') return `${hostPart.name} TAKES NO RADIAL PARTS`;
  if (on.radials.some((r) => r.id === partId)) return 'ALREADY FITTED';
  return null;
}

export function addPart(design, partId) {
  const why = stackRefusal(design, partId);
  if (why) return why;
  design.stack.push({ id: partId, radials: [] });
  return null;
}

export function addRadial(design, index, partId, count = 2) {
  const why = radialRefusal(design, index, partId);
  if (why) return why;
  design.stack[index].radials.push({ id: partId, count: count === 4 ? 4 : 2, drop: 'early' });
  return null;
}

// Can `partId` go into the stack at `index` (0 = the bottom), between the
// parts there now? Null when it can, else the reason.
export function insertRefusal(design, index, partId) {
  const p = partById(partId);
  if (p.nodes.radial === 'attach') return 'RADIAL PART: HANGS ON A TANK';
  const below = index > 0 ? partById(design.stack[index - 1].id) : null;
  const above = index < design.stack.length ? partById(design.stack[index].id) : null;
  if (below && !p.nodes.bottom) return 'NO NODE BELOW';
  if (below && !below.nodes.top) return `NOTHING STACKS ON A ${below.name}`;
  if (above && !p.nodes.top) return `NOTHING STACKS ON A ${p.name}`;
  if (above && !above.nodes.bottom) return `A ${above.name} HAS NO NODE BELOW`;
  return null;
}

export function insertPart(design, index, partId) {
  const i = Math.max(0, Math.min(design.stack.length, index));
  const why = insertRefusal(design, i, partId);
  if (why) return why;
  design.stack.splice(i, 0, { id: partId, radials: [] });
  return null;
}

// Move the stack entry at `from` so that it sits at `to` (an index into
// the stack as it is now), radials and all. Null, or the reason it cannot.
export function movePart(design, from, to) {
  if (from === to || from < 0 || from >= design.stack.length) return null;
  const [entry] = design.stack.splice(from, 1);
  const i = Math.max(0, Math.min(design.stack.length, to > from ? to - 1 : to));
  const why = insertRefusal(design, i, entry.id);
  if (why) { design.stack.splice(from, 0, entry); return why; }
  design.stack.splice(i, 0, entry);
  return null;
}

export function removePart(design, index) {
  design.stack.splice(index, 1);
}

// Boosters on the entry at `index`: drop them 'early' (as they run dry) or
// 'with' the stage they hang on.
export function setBoosterDrop(design, index, drop) {
  const on = design.stack[index];
  if (!on) return;
  for (const r of on.radials) if (partById(r.id).category === 'booster') r.drop = drop === 'with' ? 'with' : 'early';
}

export function removeRadial(design, index, partId) {
  const on = design.stack[index];
  if (on) on.radials = on.radials.filter((r) => r.id !== partId);
}

// Mass of every part in the design, tanks full.
export function designMass(design) {
  let m = 0;
  for (const e of design.stack) {
    const p = partById(e.id);
    m += p.mass + (p.fuel || 0);
    for (const r of e.radials) { const rp = partById(r.id); m += r.count * (rp.mass + (rp.fuel || 0)); }
  }
  return m;
}

// Turn a design into the craft configuration the flight core flies: the
// stage list of craft.js (dryMass, fuelMass, maxThrust, isp, height,
// radius, footHalfWidth, capsule) in firing order, with the parts each
// stage is made of for the drawing. Also returns the warnings the red
// pencil writes on the vellum.
export function compileDesign(design, { gravity = 9.80665 } = {}) {
  const groups = [];
  let cur = null;
  const open = () => { cur = { parts: [], radials: [] }; groups.push(cur); };
  open();
  design.stack.forEach((e, i) => {
    const p = partById(e.id);
    cur.parts.push({ ...p, index: i });
    for (const r of e.radials) cur.radials.push({ ...partById(r.id), count: r.count, drop: r.drop, on: i });
    if (p.category === 'decoupler' && i < design.stack.length - 1) open();
  });

  const stages = [];
  const warnings = [];
  groups.forEach((g, gi) => {
    const label = groups.length === 1 ? 'STAGE' : `STAGE ${gi + 1}`;
    const st = {
      name: label, kind: 'stack',
      dryMass: 0, fuelMass: 0, maxThrust: 0, isp: 0, height: 0, radius: 0, footHalfWidth: 0,
      capsule: false, shield: false, chute: false, crew: 0, legs: false,
      parts: g.parts.map((p) => p.index), radials: g.radials.map((r) => ({ id: r.id, count: r.count, on: r.on })),
    };
    let ispSum = 0;
    let engines = 0;
    g.parts.forEach((p, k) => {
      st.dryMass += p.mass;
      st.fuelMass += p.fuel || 0;
      st.height += p.height;
      st.radius = Math.max(st.radius, partRadius(p));
      if (p.category === 'engine') {
        engines += 1;
        st.maxThrust += p.thrust; ispSum += p.thrust * p.isp;
        if (k > 0 && g.parts[k - 1].category !== 'decoupler') warnings.push({ code: 'buried-engine', stage: gi, text: `${label}: ${p.name} FIRES INTO THE ${g.parts[k - 1].name} UNDER IT` });
      }
      if (p.category === 'command') { st.capsule = st.capsule || p.crew > 0; st.crew += p.crew; }
      if (p.shield) st.shield = true;
      if (p.chute) st.chute = true;
    });
    if (st.maxThrust > 0) st.isp = ispSum / st.maxThrust;
    if (st.capsule && !engines) st.name = 'CAPSULE';
    st.footHalfWidth = st.radius * 1.1;
    const boosters = [];
    for (const r of g.radials) {
      if (r.category === 'booster' && r.drop !== 'with') { boosters.push(r); continue; }
      if (r.category === 'booster') {
        // Kept on until the stage drops: one pool with the stage's engines,
        // the empty casings carried as dead mass.
        const total = st.maxThrust + r.count * r.thrust;
        st.isp = total / ((st.maxThrust > 0 ? st.maxThrust / st.isp : 0) + r.count * r.thrust / r.isp);
        st.maxThrust = total;
        st.fuelMass += r.count * r.fuel;
        st.dryMass += r.count * r.mass;
        st.footHalfWidth = Math.max(st.footHalfWidth, partRadius(partById(design.stack[r.on].id)) + 2 * r.radius);
        continue;
      }
      st.dryMass += r.count * r.mass;
      if (r.span) st.footHalfWidth = Math.max(st.footHalfWidth, partRadius(partById(design.stack[r.on].id)) + r.span);
      if (r.legs) st.legs = true;
    }
    if (boosters.length) {
      // The boosters and the stage's engines burn together on one
      // throttle until the boosters run dry, so the booster stage holds the
      // booster fuel plus the share of the stage's own fuel its engines
      // burn in that time; the ratio of flows holds at any throttle.
      const b = { name: `${label} BOOSTERS`, kind: 'boosters', dryMass: 0, fuelMass: 0, maxThrust: 0, isp: 0, height: 0, radius: st.radius, footHalfWidth: st.footHalfWidth, capsule: false, shield: false, chute: false, crew: 0, legs: false, parts: [], radials: [] };
      let bIsp = 0;
      for (const r of boosters) {
        b.dryMass += r.count * r.mass; b.fuelMass += r.count * r.fuel;
        b.maxThrust += r.count * r.thrust; bIsp += r.count * r.thrust * r.isp;
        b.footHalfWidth = Math.max(b.footHalfWidth, partRadius(partById(design.stack[r.on].id)) + 2 * r.radius);
        b.radials.push({ id: r.id, count: r.count, on: r.on });
      }
      const boosterFlow = b.maxThrust / (bIsp / b.maxThrust * G0);
      const burnTime = b.fuelMass / boosterFlow;
      const stageFlow = st.maxThrust > 0 ? st.maxThrust / (st.isp * G0) : 0;
      let share = Math.min(st.fuelMass, stageFlow * burnTime);
      if (st.maxThrust > 0 && share >= st.fuelMass) warnings.push({ code: 'tank-before-boosters', stage: gi, text: `${label}: ITS TANK RUNS DRY BEFORE THE BOOSTERS DO` });
      const total = b.maxThrust + st.maxThrust;
      b.isp = total / (b.maxThrust / (bIsp / b.maxThrust) + (st.maxThrust > 0 ? st.maxThrust / st.isp : 0));
      b.maxThrust = total;
      b.fuelMass += share;
      st.fuelMass -= share;
      stages.push(b);
    }
    if (!engines && g.parts.some((p) => p.category === 'tank')) warnings.push({ code: 'no-engine', stage: gi, text: `${label}: TANKS BUT NO ENGINE` });
    if (!engines && !st.capsule && g.parts.every((p) => p.category === 'decoupler')) warnings.push({ code: 'empty-stage', stage: gi, text: `${label}: A DECOUPLER AND NOTHING ELSE` });
    stages.push(st);
  });

  // Checks on the whole rocket.
  const top = stages[stages.length - 1];
  if (!stages.some((s) => s.maxThrust > 0)) warnings.push({ code: 'no-engine', text: 'NO ENGINE ANYWHERE' });
  if (!design.stack.some((e) => partById(e.id).category === 'command')) warnings.push({ code: 'no-command', text: 'NO CAPSULE OR PROBE CORE: NOTHING TO STEER WITH' });
  if (top && top.capsule && !top.chute) warnings.push({ code: 'no-parachute', text: 'CAPSULE WITHOUT A PARACHUTE' });
  if (top && top.capsule && !top.shield) warnings.push({ code: 'no-shield', text: 'CAPSULE WITHOUT A HEAT SHIELD' });
  if (stages.length && stages[0].maxThrust > 0) {
    const twr0 = stages[0].maxThrust / (designMass(design) * gravity);
    if (twr0 < 1) warnings.push({ code: 'low-twr', stage: 0, text: `LAUNCH TWR ${twr0.toFixed(2)}: WILL NOT LEAVE THE PAD` });
  }
  const decouplers = design.stack.filter((e) => partById(e.id).category === 'decoupler').length;
  const engines = design.stack.filter((e) => partById(e.id).category === 'engine').length;
  if (engines > 1 && decouplers < engines - 1) warnings.push({ code: 'no-decoupler', text: 'ENGINES STACKED WITHOUT A DECOUPLER BETWEEN THEM' });

  return {
    id: 'design',
    name: design.name,
    drawing: 'parts',
    design: cloneDesign(design),
    stages,
    throttleRate: 1.0,
    maxRotRate: Math.PI / 6,
    rotAccel: Math.PI / 2,
    warnings,
  };
}

// Where every part and radial pair of a design sits, in metres from the
// stack's base plane on the axis: the geometry both the drafting table and
// the flight drawing use. Radial pairs hang on their host with their feet
// level with the engine under it (boosters, legs) or with the host (fins).
export function designGeometry(design) {
  const parts = [];
  let y = 0;
  design.stack.forEach((e, i) => {
    const p = partById(e.id);
    parts.push({ index: i, id: e.id, bottom: y, top: y + p.height, halfW: partRadius(p) });
    y += p.height;
  });
  const radials = [];
  design.stack.forEach((e, i) => {
    const host = parts[i];
    const below = i > 0 && partById(design.stack[i - 1].id).category === 'engine' ? parts[i - 1] : null;
    let lane = 0;
    for (const r of e.radials) {
      const p = partById(r.id);
      const bottom = p.category === 'structure' && !p.legs ? host.bottom : below ? below.bottom : host.bottom;
      const halfW = partRadius(p);
      const offset = host.halfW + lane * (2 * halfW + 0.4) + halfW; // the pair's axis distance from the stack axis
      radials.push({ index: i, id: r.id, count: r.count, drop: r.drop, bottom, top: bottom + p.height, halfW, offset, hostR: host.halfW });
      lane += 1;
    }
  });
  return { parts, radials, height: y };
}

// The staging list as the builder prints it: one row per step in firing
// order, with what each step fires or drops and whether a BOOSTERS row can
// be moved later (to drop with its stage) or a merged one earlier.
export function stagingList(design) {
  const cfg = compileDesign(design);
  const rows = [];
  cfg.stages.forEach((st, i) => {
    const names = [];
    for (const idx of st.parts) names.push(partById(design.stack[idx].id).name);
    for (const r of st.radials) names.push(`${r.count}× ${partById(r.id).name}`);
    const on = st.radials.length ? st.radials[0].on : null;
    const hasMerged = st.kind === 'stack' && st.radials.some((r) => partById(r.id).category === 'booster' && design.stack[r.on].radials.some((q) => q.id === r.id && q.drop === 'with'));
    rows.push({
      index: i, kind: st.kind, name: st.name, parts: names,
      fires: st.maxThrust > 0 ? `${Math.round(st.maxThrust / 1000)} KN` : st.capsule ? 'CAPSULE' : '—',
      stackIndex: st.kind === 'boosters' ? on : st.parts[0],
      canLater: st.kind === 'boosters', canEarlier: hasMerged,
    });
  });
  if (cfg.stages.some((st) => st.chute)) rows.push({ index: rows.length, kind: 'chute', name: 'PARACHUTE', parts: ['DROGUE, THEN MAIN'], fires: 'ENTER', stackIndex: null, canLater: false, canEarlier: false });
  return rows;
}

// The slide-rule figures: mass on the pad, launch TWR, and the ideal
// delta-v of each stage in firing order with the running total.
export function designStats(design, { gravity = 9.80665 } = {}) {
  const cfg = compileDesign(design, { gravity });
  let mass = cfg.stages.reduce((m, s) => m + s.dryMass + s.fuelMass, 0);
  const padMass = mass;
  const perStage = [];
  let total = 0;
  for (const st of cfg.stages) {
    const after = mass - st.fuelMass;
    const dv = st.fuelMass > 0 && st.maxThrust > 0 ? st.isp * G0 * Math.log(mass / after) : 0;
    const twr = st.maxThrust / (mass * gravity);
    perStage.push({ name: st.name, kind: st.kind, mass, dryMass: st.dryMass, fuelMass: st.fuelMass, thrust: st.maxThrust, isp: st.isp, twr, deltaV: dv });
    total += dv;
    mass = after - st.dryMass;
  }
  return { mass: padMass, launchTwr: perStage.length ? perStage[0].twr : 0, stages: perStage, deltaV: total, warnings: cfg.warnings };
}
