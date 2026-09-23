import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PHYSICS as P, groundYFor } from "../js/physics.js";
import { Player } from "../js/player.js";

const DT = 1 / 60;
const SPEED = 240;
const NONE = { pressed: false, held: false };
const GY = groundYFor(400);
const REST_Y = GY - P.radius;

const world = (obstacles = [], pits = []) => ({ groundY: GY, obstacles, pits, slack: 0 });
const block = (left, w, h, elev = 0) => ({ kind: "block", baseLeft: left, baseRight: left + w, left, right: left + w, h, elev });
const spike = (left) => ({ kind: "spike", baseLeft: left, baseRight: left + 28, left, right: left + 28, h: 28, elev: 0 });

// Jump from standing still: how high and how long, for a given hold length in steps.
function jump(holdSteps) {
  const p = new Player(GY);
  let apex = 0;
  let airSteps = 0;
  for (let i = 0; i < 300; i++) {
    p.step(DT, 0, { pressed: i === 0, held: i < holdSteps }, world());
    apex = Math.max(apex, REST_Y - p.y);
    if (!p.grounded) airSteps++;
    if (i > 3 && p.grounded) break;
  }
  return { apex, airSeconds: airSteps * DT };
}

describe("jumping", () => {
  test("a full leap is high and long enough to clear a spike run", () => {
    const j = jump(999);
    assert.ok(j.apex > 90, `apex ${j.apex}`);
    assert.ok(j.airSeconds > 0.55, `air ${j.airSeconds}`);
  });

  test("a tap is a hop, well below a held leap", () => {
    const tap = jump(1), full = jump(999);
    assert.ok(tap.apex < full.apex * 0.5);
    assert.ok(tap.apex > 25);
  });

  test("jump height grows with how long the button is held", () => {
    assert.ok(jump(10).apex > jump(1).apex);
    assert.ok(jump(999).apex > jump(10).apex);
  });

  test("is deterministic: the same inputs give the same run", () => {
    const run = () => {
      const p = new Player(GY);
      for (let i = 0; i < 900; i++) p.step(DT, SPEED, { pressed: i % 47 === 0, held: i % 47 < 20 }, world());
      return [p.x, p.y, p.vy];
    };
    assert.deepEqual(run(), run());
  });

  test("does not depend on the field height: the leap is the same on a taller phone field", () => {
    const tall = groundYFor(440);
    const p = new Player(tall);
    let apex = 0;
    for (let i = 0; i < 300; i++) {
      p.step(DT, 0, { pressed: i === 0, held: true }, { groundY: tall, obstacles: [], pits: [], slack: 0 });
      apex = Math.max(apex, tall - P.radius - p.y);
      if (i > 3 && p.grounded) break;
    }
    assert.ok(Math.abs(apex - jump(999).apex) < 0.5);
  });
});

describe("forgiveness", () => {
  test("coyote time: a jump just after running off a ledge still works", () => {
    const b = block(0, 200, 44);
    const attempt = (delaySteps) => {
      const p = new Player(GY);
      p.x = 150;
      p.y = GY - b.h - P.radius;
      p.step(DT, 0, NONE, world([b]));
      let off = -1, jumped = false;
      for (let i = 0; i < 100 && !jumped; i++) {
        p.step(DT, SPEED, { pressed: off >= 0 && i === off + delaySteps, held: true }, world([b]));
        if (off < 0 && !p.grounded) off = i;
        jumped = p.jumped;
        if (p.grounded && off >= 0) break;
      }
      return jumped;
    };
    assert.equal(attempt(3), true);     // 0.05 s after leaving
    assert.equal(attempt(10), false);   // 0.17 s after leaving
  });

  test("jump buffer: a press just before landing jumps on landing", () => {
    const attempt = (leadSteps) => {
      const p = new Player(GY);
      p.step(DT, 0, { pressed: true, held: false }, world());   // launch, then let it fall
      for (let i = 0; i < 200; i++) {
        const probe = Object.assign(new Player(), p);
        let steps = 0;
        while (!probe.grounded && steps < 200) { probe.step(DT, 0, NONE, world()); steps++; }
        const press = p.vy > 0 && steps === leadSteps;
        p.step(DT, 0, { pressed: press, held: false }, world());
        if (press) {
          for (let j = 0; j < leadSteps + 3; j++) {
            if (p.jumped) return true;
            p.step(DT, 0, NONE, world());
            if (p.jumped) return true;
          }
          return false;
        }
      }
      return false;
    };
    assert.equal(attempt(3), true);     // 0.05 s early
    assert.equal(attempt(15), false);   // 0.25 s early
  });
});

describe("collisions", () => {
  test("dies on a spike", () => {
    const p = new Player(GY);
    for (let i = 0; i < 400 && !p.dead; i++) p.step(DT, SPEED, NONE, world([spike(500)]));
    assert.equal(p.dead, true);
    assert.ok(p.x > 450);
  });

  test("dies running into the side of a block", () => {
    const p = new Player(GY);
    for (let i = 0; i < 400 && !p.dead; i++) p.step(DT, SPEED, NONE, world([block(500, 80, 44)]));
    assert.equal(p.dead, true);
  });

  test("lands on top of a block and keeps running along it", () => {
    const b = block(500, 200, 44);
    const p = new Player(GY);
    let onTop = 0;
    for (let i = 0; i < 400 && !p.dead; i++) {
      p.step(DT, SPEED, { pressed: p.x >= 420 && p.x < 428, held: true }, world([b]));
      if (p.grounded && p.y < REST_Y - 1) onTop++;
    }
    assert.equal(p.dead, false);
    assert.ok(onTop > 10);
  });

  test("dies hitting the underside of a floating platform", () => {
    const platform = block(500, 160, 14, 44);
    const p = new Player(GY);
    let died = false;
    for (let i = 0; i < 200 && !died; i++) {
      p.step(DT, SPEED, { pressed: p.x >= 480 && p.x < 485, held: true }, world([platform]));
      died = p.dead;
    }
    assert.equal(died, true);
  });

  test("a sliding obstacle is found even when it has moved away from its base spot", () => {
    const s = spike(600);
    s.left = 660; s.right = 688;   // slid 60px right of baseLeft
    const p = new Player(GY);
    let died = false;
    for (let i = 0; i < 600 && !died; i++) {
      p.step(DT, SPEED, NONE, { groundY: GY, obstacles: [s], pits: [], slack: 60 });
      died = p.dead;
    }
    assert.equal(died, true);
    assert.ok(p.x > 630, `died at ${p.x}`);
  });
});

describe("pits", () => {
  const pit = { left: 500, right: 600 };

  test("falling into a pit is deadly", () => {
    const p = new Player(GY);
    for (let i = 0; i < 400 && !p.dead; i++) p.step(DT, SPEED, NONE, world([], [pit]));
    assert.equal(p.dead, true);
    assert.ok(p.x > pit.left && p.x < pit.right);
  });

  test("a jump clears a pit that is not too wide", () => {
    const p = new Player(GY);
    for (let i = 0; i < 500 && !p.dead; i++) p.step(DT, SPEED, { pressed: p.x >= 440 && p.x < 444, held: true }, world([], [pit]));
    assert.equal(p.dead, false);
    assert.ok(p.x > 700);
  });

  test("a pit wider than a leap cannot be crossed without a platform", () => {
    const wide = { left: 500, right: 800 };
    let crossed = false;
    for (let start = 300; start < 540 && !crossed; start += 4) {
      const p = new Player(GY);
      for (let i = 0; i < 500 && !p.dead; i++) p.step(DT, SPEED, { pressed: p.x >= start && p.x < start + 4, held: true }, world([], [wide]));
      crossed = !p.dead;
    }
    assert.equal(crossed, false);
  });
});
