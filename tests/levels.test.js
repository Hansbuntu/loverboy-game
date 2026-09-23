import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CONFIG, validateConfig } from "../js/config.js";
import { buildCourse, generateUnits, mulberry32, unitRight, updateMovers } from "../js/course.js";
import { solve } from "./planner.js";

describe("config", () => {
  test("passes the startup check", () => assert.doesNotThrow(() => validateConfig()));

  test("has seven levels whose goals never shrink and speeds never slow", () => {
    assert.equal(CONFIG.levels.length, 7);
    for (let i = 1; i < 7; i++) {
      assert.ok(CONFIG.levels[i].goal >= CONFIG.levels[i - 1].goal, `goal at level ${i + 1}`);
      assert.ok(CONFIG.levels[i].difficulty.speed >= CONFIG.levels[i - 1].difficulty.speed, `speed at level ${i + 1}`);
      assert.ok(CONFIG.levels[i].difficulty.gap <= CONFIG.levels[i - 1].difficulty.gap, `gap at level ${i + 1}`);
    }
  });

  test("rejects a broken level", () => {
    const bad = { levels: [{ track: "x", goal: 0, colors: {}, difficulty: {} }] };
    assert.throws(() => validateConfig(bad));
  });
});

describe("level builder", () => {
  CONFIG.levels.forEach((level, i) => {
    test(`level ${i + 1}: exactly ${level.goal} units, in order, deterministic`, () => {
      const a = buildCourse(level);
      const b = buildCourse(level);
      assert.equal(a.units.length, level.goal);
      const lefts = a.units.map((u) => u.baseLeft);
      assert.deepEqual([...lefts].sort((x, y) => x - y), lefts, "units must be laid out left to right");
      assert.deepEqual(a.units.map((u) => u.baseLeft), b.units.map((u) => u.baseLeft));
      assert.ok(a.units[0].baseLeft >= level.difficulty.speed * 1.9, "about 2 s of open floor to start");
    });
  });

  test("new obstacle kinds unlock level by level", () => {
    const kinds = (i) => {
      const c = buildCourse(CONFIG.levels[i]);
      const s = new Set(c.obstacles.map((o) => (o.kind === "block" && o.elev ? "platform" : o.kind)));
      if (c.pits.length) s.add("pit");
      return s;
    };
    assert.ok(!kinds(0).has("pit") && !kinds(1).has("pit"), "no pits in levels 1-2");
    assert.ok(kinds(2).has("pit"), "pits appear in level 3");
    assert.ok(![...kinds(2)].includes("platform"), "no platforms in level 3");
    let platformSeen = false;
    for (let i = 3; i < 7; i++) if (kinds(i).has("platform")) platformSeen = true;
    assert.ok(platformSeen, "floating platforms appear from level 4");
  });

  test("sliding obstacles only exist from the halfway point, and only in levels that ask for it", () => {
    for (const [i, level] of CONFIG.levels.entries()) {
      const c = buildCourse(level);
      const mobile = c.units.map((u, idx) => (u.mobile ? idx : -1)).filter((x) => x >= 0);
      if (!level.difficulty.move) assert.equal(mobile.length, 0, `level ${i + 1} should not slide`);
      else {
        assert.ok(mobile.length > 0, `level ${i + 1} should have some sliding obstacles`);
        for (const idx of mobile) assert.ok(idx >= Math.floor(level.goal / 2), `unit ${idx} slides before halfway`);
      }
    }
  });
});

describe("sliding obstacles", () => {
  const level = CONFIG.levels[6];   // the busiest level

  test("slide within their range and lock in before reaching the runner", () => {
    const rng = mulberry32(5);
    const c = buildCourse(level);
    const mobile = c.units.filter((u) => u.mobile);
    // run the runner along at the level's speed; every mobile unit must end up frozen, inside range
    for (let x = 0; x < c.units[c.units.length - 1].baseLeft + 200; x += level.difficulty.speed / 60) {
      updateMovers(c, x, 1 / 60, rng);
      for (const u of mobile) assert.ok(Math.abs(u.offset) <= level.difficulty.move.amp + 1e-6, "stays within amp");
    }
    assert.ok(mobile.every((u) => u.mv && (u.mv.frozen || u.mv.left <= 0) && !u.mv.active), "all settled by the time the runner passes");
    assert.ok(mobile.some((u) => u.offset !== 0), "at least one actually moved");
  });

  test("a slid obstacle never reaches its neighbour", () => {
    for (const [i, lv] of CONFIG.levels.entries()) {
      if (!lv.difficulty.move) continue;
      for (let trial = 0; trial < 20; trial++) {
        const c = buildCourse(lv, { rng: mulberry32(trial + 1), shiftMobile: "extremes" });
        for (let k = 1; k < c.units.length; k++) {
          const gap = c.units[k].baseLeft + c.units[k].offset - unitRight(c.units[k - 1]);
          assert.ok(gap > 40, `level ${i + 1} trial ${trial}: units ${k - 1}/${k} only ${Math.round(gap)}px apart`);
        }
      }
    }
  });
});

describe("planner sanity (the bot must FAIL impossible levels, or passing means nothing)", () => {
  const unit = (kind, left, w, h, elev = 0) => {
    const u = { members: [], mobile: false, mv: null, offset: 0, baseLeft: left, baseRight: left + w };
    const m = { kind, baseLeft: left, baseRight: left + w, left, right: left + w, h, elev, unit: u };
    u.members.push(m);
    return { u, m };
  };
  const course = (parts, pits = []) => ({
    obstacles: parts.filter((p) => p.m.kind !== "pit").map((p) => p.m),
    pits, units: parts.map((p) => p.u), speed: 240, slack: 0, goal: parts.length
  });

  test("beats a simple course", () => {
    assert.equal(solve(course([unit("spike", 700, 28, 28), unit("spike", 1300, 28, 28)])).solved, true);
  });

  test("fails on a wall of spikes too wide to jump", () => {
    assert.equal(solve(course([unit("spike", 700, 400, 28)])).solved, false);
  });

  test("fails on a block taller than any jump", () => {
    assert.equal(solve(course([unit("block", 700, 80, 200)])).solved, false);
  });
});

// The important one: a bot must be able to finish every level, wherever the sliding obstacles end up.
describe("every level can be beaten", () => {
  CONFIG.levels.forEach((level, i) => {
    test(`level ${i + 1} (${level.goal} obstacles${level.difficulty.move ? ", sliding" : ""})`, () => {
      const trials = level.difficulty.move ? 12 : 1;
      for (let t = 0; t < trials; t++) {
        const course = buildCourse(level, { rng: mulberry32(100 + t), shiftMobile: t < trials / 2 ? "extremes" : "random" });
        for (const height of [400, 440]) {   // desktop and phone-portrait field heights
          const r = solve(course, height);
          assert.equal(r.solved, true, `level ${i + 1} unbeatable at obstacle ${r.failedAt} (trial ${t}, field height ${height})`);
        }
      }
    });
  });
});

test("generator never overshoots the goal", () => {
  for (const level of CONFIG.levels) {
    const d = level.difficulty;
    assert.equal(generateUnits({ seed: d.seed, speed: d.speed, gap: d.gap, patterns: d.patterns, goal: level.goal, move: d.move }).length, level.goal);
  }
});
