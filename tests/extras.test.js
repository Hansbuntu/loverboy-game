import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../js/config.js";
import { buildCourse, HEART_REACH, heartPos, unitRight } from "../js/course.js";
import { PHYSICS as P, groundYFor } from "../js/physics.js";
import { Player } from "../js/player.js";
import { createHearts } from "../js/progress.js";
import { createSettings } from "../js/settings.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

// Can a runner, starting on open floor just before the heart's obstacle, collect it AND get safely past?
function collectable(course, heart, groundY) {
  const world = { groundY, obstacles: course.obstacles, pits: course.pits, slack: course.slack };
  const u = course.units[heart.unit];
  const [hx, hy] = heartPos(course, heart, groundY);
  for (let back = 140; back <= 320; back += 15) {
    const start = new Player(groundY);
    start.x = u.baseLeft - back;
    if (!start.floorAt(start.x, course.pits)) continue;
    if (course.obstacles.some((o) => o.right > start.x - P.radius && o.left < start.x + P.radius)) continue;
    for (let k = 0; k < 60; k++) {
      for (const hold of [999, 30, 18, 8]) {
        const q = Object.assign(new Player(), start);
        let got = false;
        for (let i = 0; i < 300; i++) {
          q.step(1 / 60, course.speed, { pressed: i === k, held: i >= k && i < k + hold }, world);
          if (q.dead) break;
          if ((q.x - hx) ** 2 + (q.y - hy) ** 2 < (HEART_REACH + 4) ** 2) got = true;
          if (got && q.grounded && (q.x > unitRight(u) + 30 || q.y < groundY - P.radius - 1)) return true;
        }
      }
    }
  }
  return false;
}

describe("bonus hearts", () => {
  CONFIG.levels.forEach((level, i) => {
    test(`level ${i + 1}: three hearts, each one reachable with a jump you survive`, () => {
      const course = buildCourse(level);
      assert.equal(course.hearts.length, 3);
      assert.equal(new Set(course.hearts.map((h) => h.unit)).size, 3, "on three different obstacles");
      for (const fieldH of [400, 440]) {
        const groundY = groundYFor(fieldH);
        for (const h of course.hearts) {
          assert.ok(h.rise <= P.radius + 104, `heart over unit ${h.unit} is higher than a full leap`);
          assert.ok(collectable(course, h, groundY), `heart over unit ${h.unit} (rise ${h.rise}) can't be collected at height ${fieldH}`);
        }
      }
    });
  });
});

describe("hearts record", () => {
  const KEY = "test_hearts";
  test("keeps the best per level and survives a reload", () => {
    const store = memoryStorage();
    const a = createHearts(store, KEY, 7);
    assert.equal(a.total, 0);
    assert.equal(a.max, 21);
    assert.equal(a.record(0, 2), true);
    assert.equal(a.record(0, 1), false, "a worse run does not replace the best");
    assert.equal(a.record(0, 3), true);
    a.record(4, 9);                                    // clamped to 3
    const b = createHearts(store, KEY, 7);
    assert.equal(b.get(0), 3);
    assert.equal(b.get(4), 3);
    assert.equal(b.total, 6);
  });
  test("reset forgets everything; broken data is ignored", () => {
    const store = memoryStorage({ test_hearts: "{nope" });
    const h = createHearts(store, KEY, 7);
    assert.equal(h.total, 0);
    h.record(1, 2);
    h.reset();
    assert.equal(createHearts(store, KEY, 7).total, 0);
  });
});

describe("settings", () => {
  test("sound and vibration default to on, and are remembered", () => {
    const store = memoryStorage();
    const s = createSettings(store, "test_settings");
    assert.equal(s.sound, true);
    assert.equal(s.haptics, true);
    s.set("sound", false);
    const t = createSettings(store, "test_settings");
    assert.equal(t.sound, false);
    assert.equal(t.haptics, true);
  });
  test("works without storage", () => {
    const s = createSettings(null, "x");
    s.set("haptics", false);
    assert.equal(s.haptics, false);
  });
});
