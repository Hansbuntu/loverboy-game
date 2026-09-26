// Player settings: sound and vibration on/off. Saved in the browser like the progress.

export function createSettings(storage, key) {
  let s = { sound: true, haptics: true };
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? "null");
    if (raw && typeof raw === "object") s = { sound: raw.sound !== false, haptics: raw.haptics !== false };
  } catch { /* defaults */ }

  const save = () => { try { storage?.setItem(key, JSON.stringify(s)); } catch { /* ignore */ } };

  return {
    get sound() { return s.sound; },
    get haptics() { return s.haptics; },
    set(name, value) {
      s = { ...s, [name]: !!value };
      save();
    }
  };
}
