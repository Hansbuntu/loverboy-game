import { PHYSICS as P } from "./physics.js";

// Builds a level's obstacles from its config (goal + difficulty). The layout is generated from a
// seed, so a level is identical every time you play it, and difficulty comes from what can appear
// (new obstacle kinds unlock level by level), not just how many.
//
// One "unit" is one thing to get past: a run of spikes, a block, a pit. The HUD counts units, and the
// level is cleared when `goal` units are behind you.

const SP = P.spikeSize;
const HARD = ["spikes3", "tall", "pit", "stairs", "combo", "platformPit"];
const SLIDER_KINDS = ["spike", "spikes2", "spikes3", "block"];   // small obstacles that may slide sideways
const LEAD_IN = 2.0;          // seconds of open floor before the first obstacle
const FREEZE = 170;           // a sliding obstacle stops moving when this close to the runner (px)

function spikeRun(n) {
  return () => ({ width: n * SP, mobileOk: true, units: [{ dx: 0, members: [{ kind: "spike", dx: 0, w: n * SP, h: SP }] }] });
}

const PATTERNS = {
  spike: spikeRun(1),
  spikes2: spikeRun(2),
  spikes3: spikeRun(3),
  // a low block: land on it or jump over it
  block: (r) => {
    const w = 46 + 14 * Math.floor(r() * 3);
    return { width: w, mobileOk: true, units: [{ dx: 0, members: [{ kind: "block", dx: 0, w, h: 44 }] }] };
  },
  // a tall block: hold the jump
  tall: (r) => {
    const w = 74 + 15 * Math.floor(r() * 3);
    return { width: w, mobileOk: false, units: [{ dx: 0, members: [{ kind: "block", dx: 0, w, h: 76 }] }] };
  },
  // a gap in the floor
  pit: (r) => {
    const w = 74 + 8 * Math.floor(r() * 6);
    return { width: w, mobileOk: false, units: [{ dx: 0, members: [{ kind: "pit", dx: 0, w }] }] };
  },
  // a low block, then a tall one
  stairs: () => ({
    width: 206, mobileOk: false,
    units: [
      { dx: 0, members: [{ kind: "block", dx: 0, w: 58, h: 44 }] },
      { dx: 148, members: [{ kind: "block", dx: 0, w: 58, h: 76 }] }
    ]
  }),
  // a spike, then a block
  combo: () => ({
    width: 206, mobileOk: false,
    units: [
      { dx: 0, members: [{ kind: "spike", dx: 0, w: SP, h: SP }] },
      { dx: 148, members: [{ kind: "block", dx: 0, w: 58, h: 44 }] }
    ]
  }),
  // a gap too wide to jump, with a floating platform to hop across
  platformPit: () => ({
    width: 190, mobileOk: false,
    units: [{ dx: 0, members: [{ kind: "pit", dx: 0, w: 190 }, { kind: "block", dx: 66, w: 60, h: 14, elev: 44 }] }]
  })
};

// Small deterministic random generator.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, names, index, goal) {
  const early = index < goal * 0.25;                         // ease in: no hard patterns at the start
  const pool = early ? names.filter((n) => !HARD.includes(n)) : names;
  const list = pool.length ? pool : names;
  const late = index >= goal * 0.6;
  const weights = list.map((n) => (HARD.includes(n) ? (late ? 1.6 : 0.8) : 1));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

// Lay out `goal` units from left to right. Returns [{ x, mobile, members: [{ kind, dx, w, h, elev }] }].
//   debut: obstacle kinds new to this level. Each is guaranteed to appear once, part-way through.
export function generateUnits({ seed, speed, gap, patterns, goal, move, debut = [] }) {
  const rng = mulberry32(seed);
  const amp = move ? move.amp : 0;
  const moveFrom = move ? Math.floor(goal / 2) : Infinity;   // sliding starts at the halfway point
  const forced = debut.map((name, k) => ({ name, at: Math.min(goal - 3, Math.floor(goal * (0.4 + 0.12 * k))), used: false }));
  const out = [];
  let x = Math.round(speed * LEAD_IN);
  let prevMobile = false;
  let sliderPlaced = false;

  while (out.length < goal) {
    const remaining = goal - out.length;
    const due = forced.find((f) => !f.used && out.length >= f.at);
    let pool = patterns;
    // the first obstacle at the halfway point is always one that can slide, so sliding starts right there
    if (!due && move && out.length >= moveFrom && !sliderPlaced) pool = patterns.filter((n) => SLIDER_KINDS.includes(n));
    let name = due ? due.name : pick(rng, pool, out.length, goal);
    if (due) due.used = true;
    let p = PATTERNS[name](rng);
    if (p.units.length > remaining) p = PATTERNS.spike(rng);   // don't overshoot the goal
    const mobile = p.mobileOk && out.length >= moveFrom && (!sliderPlaced || rng() < move.chance);
    if (mobile) sliderPlaced = true;
    if (mobile || prevMobile) x += amp;                          // room for a slide, so neighbours never collide
    for (const u of p.units) out.push({ x: x + u.dx, mobile, members: u.members });
    x += p.width + Math.round(gap * speed) + (mobile ? amp : 0);
    prevMobile = mobile;
  }
  return out;
}

function place(unit, obstacle) {
  obstacle.unit = unit;
  unit.members.push(obstacle);
  unit.baseLeft = Math.min(unit.baseLeft, obstacle.baseLeft);
  unit.baseRight = Math.max(unit.baseRight, obstacle.baseRight);
}

// opts.rng: random source for slide timing (default Math.random).
// opts.shiftMobile: "extremes" | "random" puts every sliding obstacle at a slid-to position straight away
// (used by the tests, to prove a level is beatable wherever things end up).
export function buildCourse(level, opts = {}) {
  const d = level.difficulty;
  const rng = opts.rng || Math.random;
  const placed = generateUnits({ seed: d.seed, speed: d.speed, gap: d.gap, patterns: d.patterns, goal: level.goal, move: d.move, debut: d.debut });

  const obstacles = [];
  const pits = [];
  const units = [];
  for (const u of placed) {
    const unit = { members: [], mobile: u.mobile, mv: null, offset: 0, baseLeft: Infinity, baseRight: -Infinity };
    for (const m of u.members) {
      const left = u.x + m.dx;
      if (m.kind === "pit") {
        const pit = { kind: "pit", left, right: left + m.w, baseLeft: left, baseRight: left + m.w };
        pits.push(pit);
        place(unit, pit);
      } else if (m.kind === "spike") {
        for (let i = 0; i < Math.round(m.w / SP); i++) {
          const l = left + i * SP;
          const o = { kind: "spike", baseLeft: l, baseRight: l + SP, left: l, right: l + SP, h: m.h, elev: m.elev || 0 };
          obstacles.push(o);
          place(unit, o);
        }
      } else {
        const o = { kind: "block", baseLeft: left, baseRight: left + m.w, left, right: left + m.w, h: m.h, elev: m.elev || 0 };
        obstacles.push(o);
        place(unit, o);
      }
    }
    units.push(unit);
  }
  obstacles.sort((a, b) => a.baseLeft - b.baseLeft);
  pits.sort((a, b) => a.left - b.left);

  const course = { obstacles, pits, units, goal: level.goal, speed: d.speed, move: d.move || null, slack: d.move ? d.move.amp : 0 };
  if (opts.shiftMobile) {
    for (const u of units) {
      if (!u.mobile) continue;
      const amp = d.move.amp;
      u.offset = opts.shiftMobile === "extremes" ? (rng() < 0.5 ? -amp : amp) : (rng() * 2 - 1) * amp;
      applyOffset(u);
    }
  }
  return course;
}

function applyOffset(unit) {
  for (const m of unit.members) {
    m.left = m.baseLeft + unit.offset;
    m.right = m.baseRight + unit.offset;
  }
}

// Where a unit's right edge is now (it moves if the unit slides).
export function unitRight(unit) {
  return unit.baseRight + unit.offset;
}

// Sliding obstacles: from the halfway point some obstacles slide sideways once or twice, at random
// moments as they approach, then lock in place just before they reach the runner so the final
// position can always be read. Call once per step.
export function updateMovers(course, playerX, dt, rng = Math.random) {
  const mv = course.move;
  if (!mv) return;
  for (const u of course.units) {
    if (!u.mobile) continue;
    if (!u.mv) u.mv = { left: rng() < 0.4 ? 2 : 1, trigger: 200 + rng() * 220, active: false, target: 0, frozen: false };
    const st = u.mv;
    if (st.frozen || st.left <= 0) continue;

    const ahead = u.baseLeft + u.offset - playerX;   // distance from the runner to this obstacle
    if (ahead <= FREEZE) {
      st.frozen = true;
      st.active = false;
      continue;
    }
    if (!st.active) {
      if (ahead < st.trigger) startSlide(u, st, mv, rng);
      continue;
    }
    const step = mv.speed * dt;
    const remaining = st.target - u.offset;
    if (Math.abs(remaining) <= step) {
      u.offset = st.target;
      st.active = false;
      st.left--;
      st.trigger = ahead - (50 + rng() * 100);       // maybe slide again a bit later
    } else {
      u.offset += Math.sign(remaining) * step;
    }
    applyOffset(u);
  }
}

function startSlide(unit, st, mv, rng) {
  const dist = (0.45 + 0.55 * rng()) * mv.amp;
  let dir = rng() < 0.5 ? -1 : 1;
  let target = unit.offset + dir * dist;
  if (Math.abs(target) > mv.amp) {                 // would go out of range: go the other way
    dir = -dir;
    target = unit.offset + dir * dist;
  }
  st.target = Math.max(-mv.amp, Math.min(mv.amp, target));
  st.active = Math.abs(st.target - unit.offset) > 8;
  if (!st.active) st.left--;
}
