// Which levels are cleared. A cleared level means its track is unlocked.
// Saved as { "cleared": [0, 1, 2] } (0-based level numbers) under the config's storage key.
// Works without storage (private windows, blocked cookies): progress just won't survive a reload.

// localStorage if it works, otherwise null.
export function browserStorage() {
  try {
    const s = window.localStorage;
    s.setItem("__probe", "1");
    s.removeItem("__probe");
    return s;
  } catch {
    return null;
  }
}

export function createProgress(storage, key, total) {
  let cleared = load();

  function load() {
    try {
      const raw = JSON.parse(storage?.getItem(key) ?? "null");
      const list = Array.isArray(raw?.cleared) ? raw.cleared : [];
      return [...new Set(list.filter((n) => Number.isInteger(n) && n >= 0 && n < total))].sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  function save() {
    try {
      storage?.setItem(key, JSON.stringify({ cleared }));
    } catch {
      // ignore: the game keeps working, it just won't remember
    }
  }

  return {
    isCleared: (i) => cleared.includes(i),
    get count() { return cleared.length; },
    get complete() { return cleared.length >= total; },
    // the first level not yet cleared (0-based), or null once all are done
    next() {
      for (let i = 0; i < total; i++) if (!cleared.includes(i)) return i;
      return null;
    },
    clear(i) {
      if (i < 0 || i >= total || cleared.includes(i)) return;
      cleared = [...cleared, i].sort((a, b) => a - b);
      save();
    },
    reset() {
      cleared = [];
      try { storage?.removeItem(key); } catch { /* ignore */ }
    }
  };
}
