import { PHYSICS as P, groundYFor } from "../js/physics.js";
import { Player } from "../js/player.js";
import { unitRight } from "../js/course.js";

// A bot that plays a level to prove it can be finished. It plans one jump at a time: for the next
// unit it tries jump timings and hold lengths on CLONES of the runner, keeps one that survives to a
// safe spot, and if a later unit turns out impossible it backtracks. Test tooling only.

const DT = 1 / 60;
const MAX_K = 70;                 // latest jump start to try, in steps
const HOLDS = [999, 30, 18, 8];   // how long the jump is held, in steps (999 = the whole leap)
const NONE = { pressed: false, held: false };

function clone(p) {
  return Object.assign(new Player(), p);
}

// Has the runner got safely past this unit? (cleared it, or is standing on top of a block-only unit)
function passed(p, unit, world) {
  if (!p.grounded) return false;
  const blocksOnly = unit.members.every((m) => m.kind === "block");
  if (blocksOnly) {
    for (const m of unit.members) {
      const top = world.groundY - m.elev - m.h;
      if (Math.abs(p.y - (top - P.radius)) < 0.01 && p.x > m.left) return true;
    }
  }
  return p.x > unitRight(unit) + 30;
}

// course: from buildCourse. Returns { solved, failedAt, jumps }.
export function solve(course, fieldHeight = 400) {
  const groundY = groundYFor(fieldHeight);
  const world = { groundY, obstacles: course.obstacles, pits: course.pits, slack: course.slack };
  const speed = course.speed;
  const units = course.units;
  let jumps = 0;
  let deepest = -1;

  function attempt(p, ui) {
    while (ui < units.length && passed(p, units[ui], world)) ui++;
    if (ui >= units.length) return true;
    if (ui > deepest) deepest = ui;
    const u = units[ui];
    const left = u.baseLeft + u.offset;

    // coast (no input) until the obstacle is within jumping range
    const reach = MAX_K * speed * DT;
    const base = clone(p);
    while (left - base.x > reach) {
      base.step(DT, speed, NONE, world);
      if (base.dead) return false;
    }

    const maxK = Math.min(MAX_K, Math.max(0, Math.floor((left - base.x) / (speed * DT)) + 6));
    for (let k = maxK; k >= 0; k--) {
      for (const hold of HOLDS) {
        const q = clone(base);
        let ok = false;
        for (let i = 0; i < 420; i++) {
          q.step(DT, speed, { pressed: i === k, held: i >= k && i < k + hold }, world);
          if (q.dead) break;
          if (i > k && passed(q, u, world)) { ok = true; break; }
        }
        if (ok && attempt(q, ui + 1)) {
          jumps++;
          return true;
        }
      }
    }
    return false;
  }

  const solved = attempt(new Player(groundY), 0);
  return { solved, failedAt: solved || deepest < 0 ? null : deepest + 1, jumps };
}
