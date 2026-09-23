import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createProgress } from "../js/progress.js";
import { isValidEmail, savedEmail, submitEmail } from "../js/email.js";

// a stand-in for localStorage
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

describe("progress", () => {
  const KEY = "test_progress";

  test("starts with nothing unlocked", () => {
    const p = createProgress(memoryStorage(), KEY, 7);
    assert.equal(p.count, 0);
    assert.equal(p.next(), 0);
    assert.equal(p.complete, false);
    for (let i = 0; i < 7; i++) assert.equal(p.isCleared(i), false);
  });

  test("clearing a level unlocks it and points at the next one", () => {
    const p = createProgress(memoryStorage(), KEY, 7);
    p.clear(0);
    p.clear(1);
    assert.equal(p.isCleared(0), true);
    assert.equal(p.isCleared(1), true);
    assert.equal(p.isCleared(2), false);
    assert.equal(p.next(), 2);
  });

  test("survives a reload: a new instance reads what was saved", () => {
    const store = memoryStorage();
    const a = createProgress(store, KEY, 7);
    a.clear(0); a.clear(1); a.clear(2);
    const b = createProgress(store, KEY, 7);
    assert.equal(b.count, 3);
    assert.equal(b.next(), 3);
    assert.equal(b.isCleared(2), true);
  });

  test("clearing the same level twice changes nothing", () => {
    const p = createProgress(memoryStorage(), KEY, 7);
    p.clear(3); p.clear(3);
    assert.equal(p.count, 1);
  });

  test("all seven cleared means complete, and next() is null", () => {
    const p = createProgress(memoryStorage(), KEY, 7);
    for (let i = 0; i < 7; i++) p.clear(i);
    assert.equal(p.complete, true);
    assert.equal(p.next(), null);
  });

  test("reset erases everything, including what was saved", () => {
    const store = memoryStorage();
    const p = createProgress(store, KEY, 7);
    p.clear(0); p.clear(1);
    p.reset();
    assert.equal(p.count, 0);
    assert.equal(createProgress(store, KEY, 7).count, 0);
  });

  test("ignores garbage, wrong types and out-of-range levels in a saved file", () => {
    for (const bad of ["{not json", "null", '"x"', '{"cleared":"x"}', '{"cleared":[-1,7,99,1.5,"a",null]}']) {
      const p = createProgress(memoryStorage({ [KEY]: bad }), KEY, 7);
      assert.equal(p.count, 0, `saved value ${bad}`);
    }
    const p = createProgress(memoryStorage({ [KEY]: '{"cleared":[2,2,0,9,-3]}' }), KEY, 7);
    assert.deepEqual([p.isCleared(0), p.isCleared(2), p.count], [true, true, 2]);
  });

  test("still works when storage is unavailable (private windows)", () => {
    const p = createProgress(null, KEY, 7);
    p.clear(0);
    assert.equal(p.isCleared(0), true);
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
    const q = createProgress(broken, KEY, 7);
    q.clear(1);
    assert.equal(q.isCleared(1), true);
    assert.doesNotThrow(() => q.reset());
  });
});

describe("email validation", () => {
  test("accepts ordinary addresses", () => {
    for (const ok of ["a@b.co", "fan@example.com", "first.last+tag@sub.domain.org"]) assert.equal(isValidEmail(ok), true, ok);
  });

  test("rejects empty, malformed and non-string input", () => {
    for (const bad of ["", " ", "plain", "a@b", "@b.co", "a@.co", "a b@c.co", "a@b .co", null, undefined, 5]) assert.equal(isValidEmail(bad), false, String(bad));
  });
});

describe("email signup", () => {
  const CFG = { endpoint: "https://formspree.io/f/test", field: "email" };
  const KEY = "test_email";

  test("POSTs {email} as JSON to the endpoint, and remembers it on success", async () => {
    const store = memoryStorage();
    let seen;
    const fetchImpl = async (url, opts) => { seen = { url, ...opts }; return { ok: true, status: 200 }; };
    await submitEmail("fan@example.com", CFG, store, KEY, fetchImpl);
    assert.equal(seen.url, CFG.endpoint);
    assert.equal(seen.method, "POST");
    assert.equal(seen.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(seen.body), { email: "fan@example.com" });
    assert.equal(savedEmail(store, KEY), "fan@example.com");
  });

  test("a server error rejects and does NOT save (success is only shown if the request works)", async () => {
    const store = memoryStorage();
    await assert.rejects(submitEmail("a@b.co", CFG, store, KEY, async () => ({ ok: false, status: 500 })), /500/);
    assert.equal(savedEmail(store, KEY), null);
  });

  test("a network failure rejects and does NOT save", async () => {
    const store = memoryStorage();
    await assert.rejects(submitEmail("a@b.co", CFG, store, KEY, async () => { throw new TypeError("offline"); }));
    assert.equal(savedEmail(store, KEY), null);
  });

  test("uses the configured field name", async () => {
    let body;
    await submitEmail("a@b.co", { endpoint: "x", field: "address" }, memoryStorage(), KEY, async (_u, o) => { body = JSON.parse(o.body); return { ok: true }; });
    assert.deepEqual(body, { address: "a@b.co" });
  });

  test("with no endpoint it only remembers the address in this browser", async () => {
    const store = memoryStorage();
    let called = false;
    await submitEmail("a@b.co", { endpoint: "" }, store, KEY, async () => { called = true; return { ok: true }; });
    assert.equal(called, false);
    assert.equal(savedEmail(store, KEY), "a@b.co");
  });

  test("savedEmail is null when nothing was saved or storage is broken", () => {
    assert.equal(savedEmail(memoryStorage(), KEY), null);
    assert.equal(savedEmail(null, KEY), null);
    assert.equal(savedEmail({ getItem() { throw new Error("x"); } }, KEY), null);
  });
});
