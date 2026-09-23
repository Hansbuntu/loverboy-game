// Early-access signup. POSTs {"email": "..."} as JSON to the configured Formspree endpoint.
// No key lives in the page: a Formspree form id is public by design.

export function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// The address this browser already signed up with, or null.
export function savedEmail(storage, key) {
  try { return storage?.getItem(key) || null; } catch { return null; }
}

// Resolves only if the request worked (2xx). Rejects on a network error or any other status.
// With no endpoint set, the address is just remembered in this browser.
export async function submitEmail(value, { endpoint, field = "email" }, storage, key, fetchImpl = globalThis.fetch) {
  const remember = () => { try { storage?.setItem(key, value); } catch { /* ignore */ } };
  if (!endpoint) {
    remember();
    return;
  }
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ [field]: value })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  remember();
}
